const express = require('express');
const { createClient } = require('redis');
const { Pool } = require('pg');
const cors = require('cors');

const app  = express();
app.use(express.json());
app.use(cors());

// ── Configuración por variable de entorno (cada nodo tiene la suya) ─────────
const NODE_ID    = process.env.NODE_ID    || 'nodo-1';
const NODE_COLOR = process.env.NODE_COLOR || '#00B4D8';
const PORT       = process.env.PORT       || 3001;

// ── Clientes Redis ────────────────────────────────────────────────────────────
// Un cliente para comandos, otro para subscripción (redis no permite ambos en uno)
const redisPub = createClient({ url: 'redis://redis:6379' });
const redisSub = createClient({ url: 'redis://redis:6379' });

// ── PostgreSQL Pool ───────────────────────────────────────────────────────────
const pool = new Pool({
  host:     'postgres',
  database: 'votacion',
  user:     'admin',
  password: 'admin123',
  port:     5432,
});

// ── SSE clients conectados a ESTE nodo ────────────────────────────────────────
let sseClients = [];
let votesHandled = 0;  // Contador local de este nodo

// ── Broadcast a todos los SSE clients de este nodo ───────────────────────────
function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients = sseClients.filter(client => {
    try { client.write(payload); return true; }
    catch (_) { return false; }
  });
}

// ── Inicialización con reintentos (espera a que Redis y Postgres estén listos) ─
async function init() {
  // Conectar Redis
  for (let i = 0; i < 30; i++) {
    try {
      await redisPub.connect();
      await redisSub.connect();
      console.log(`✅ [${NODE_ID}] Redis conectado`);
      break;
    } catch (e) {
      console.log(`⏳ [${NODE_ID}] Esperando Redis... (${i + 1}/30)`);
      await sleep(2000);
    }
  }

  // Conectar PostgreSQL
  for (let i = 0; i < 30; i++) {
    try {
      await pool.query('SELECT 1');
      console.log(`✅ [${NODE_ID}] PostgreSQL conectado`);
      break;
    } catch (e) {
      console.log(`⏳ [${NODE_ID}] Esperando PostgreSQL... (${i + 1}/30)`);
      await sleep(2000);
    }
  }

  // Crear tabla si no existe
  await pool.query(`
    CREATE TABLE IF NOT EXISTS votes (
      id         SERIAL PRIMARY KEY,
      option     VARCHAR(10)  NOT NULL,
      node_id    VARCHAR(30)  NOT NULL,
      created_at TIMESTAMP    DEFAULT NOW()
    )
  `);

  // Suscribirse al canal de eventos de Redis
  // Cuando cualquier nodo publica un voto, TODOS los nodos lo reciben
  // y reenvían a sus SSE clients → tiempo real distribuido
  await redisSub.subscribe('votes_channel', (message) => {
    broadcast(JSON.parse(message));
  });

  console.log(`🚀 [${NODE_ID}] Listo en puerto ${PORT}`);
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

// Estado del nodo (para el monitor del dashboard)
app.get('/api/status', (req, res) => {
  res.json({
    nodeId:       NODE_ID,
    color:        NODE_COLOR,
    status:       'online',
    uptime:       Math.floor(process.uptime()),
    votesHandled: votesHandled,
    timestamp:    new Date().toISOString(),
  });
});

// Votar (el load balancer decide qué nodo procesa esto)
app.post('/api/vote', async (req, res) => {
  const { option } = req.body;
  if (!['A', 'B'].includes(option)) {
    return res.status(400).json({ error: 'Opción inválida. Usa "A" o "B".' });
  }

  try {
    // 1. Persistir en PostgreSQL
    await pool.query(
      'INSERT INTO votes (option, node_id) VALUES ($1, $2)',
      [option, NODE_ID]
    );

    // 2. Incrementar contador en Redis (compartido entre todos los nodos)
    await redisPub.hIncrBy('vote_counts', option, 1);
    const counts = await redisPub.hGetAll('vote_counts');

    votesHandled++;

    // 3. Publicar evento → todos los nodos lo reciben vía Redis sub
    const event = {
      type:         'new_vote',
      option,
      processedBy:  NODE_ID,
      nodeColor:    NODE_COLOR,
      counts: {
        A: parseInt(counts.A || 0),
        B: parseInt(counts.B || 0),
      },
      timestamp: new Date().toISOString(),
    };
    await redisPub.publish('votes_channel', JSON.stringify(event));

    res.json({ success: true, processedBy: NODE_ID, nodeColor: NODE_COLOR, counts: event.counts });

  } catch (err) {
    console.error(`❌ [${NODE_ID}] Error:`, err.message);
    res.status(500).json({ error: 'Error interno del nodo' });
  }
});

// Obtener conteos actuales + historial reciente
app.get('/api/votes', async (req, res) => {
  try {
    const counts  = await redisPub.hGetAll('vote_counts');
    const history = await pool.query(
      `SELECT option, node_id, created_at
       FROM votes ORDER BY created_at DESC LIMIT 30`
    );
    res.json({
      counts: {
        A: parseInt(counts.A || 0),
        B: parseInt(counts.B || 0),
      },
      history:  history.rows,
      servedBy: NODE_ID,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reiniciar contadores (para el demo)
app.delete('/api/votes/reset', async (req, res) => {
  await redisPub.del('vote_counts');
  await pool.query('TRUNCATE TABLE votes');
  const event = { type: 'reset', processedBy: NODE_ID, counts: { A: 0, B: 0 }, timestamp: new Date().toISOString() };
  await redisPub.publish('votes_channel', JSON.stringify(event));
  res.json({ success: true, message: 'Contadores reseteados' });
});

// Server-Sent Events (streaming tiempo real)
// El nginx lo proxea con buffering desactivado
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Served-By',   NODE_ID);
  res.flushHeaders();

  // Enviar estado inicial
  res.write(`data: ${JSON.stringify({ type: 'connected', nodeId: NODE_ID, nodeColor: NODE_COLOR })}\n\n`);

  sseClients.push(res);

  // Heartbeat para mantener la conexión viva
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) {}
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients = sseClients.filter(c => c !== res);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Arrancar ──────────────────────────────────────────────────────────────────
init()
  .then(() => app.listen(PORT, () => {
    console.log(`🌐 [${NODE_ID}] Escuchando en :${PORT}`);
  }))
  .catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
  });
