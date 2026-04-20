# 🌐 Demo: Sistema Distribuido con Docker Compose

## ¿Qué demuestra este proyecto?

| Concepto SD               | Cómo se ve en el demo                                 |
|---------------------------|-------------------------------------------------------|
| **Múltiples nodos**       | 3 contenedores API independientes                    |
| **Load Balancing**        | nginx round-robin → cada voto va a un nodo diferente  |
| **Estado distribuido**    | Redis compartido → todos los nodos ven el mismo conteo|
| **Event-Driven (Pub/Sub)**| Redis publica eventos → todos los nodos los reciben   |
| **Persistencia**          | PostgreSQL guarda cada voto con qué nodo lo procesó   |
| **Tolerancia a fallos**   | Matas un nodo → el sistema sigue funcionando          |
| **Tiempo real**           | SSE (Server-Sent Events) actualiza el dashboard       |

---

## 🚀 Levantar el sistema

```bash
# 1. Entrar al directorio
cd demo-sd

# 2. Construir imágenes y levantar todo
docker compose up --build -d

# 3. Esperar ~20 segundos y abrir el dashboard
# http://localhost:8080
```

---

## 🎯 Script del Demo para la Exposición

### Paso 1 — Mostrar el sistema corriendo
```bash
docker compose ps
```
➡️ Mostrar que hay 5 contenedores (nginx, api-1, api-2, api-3, redis, postgres)

### Paso 2 — Votar varias veces
Abre **http://localhost:8080** y haz clic varias veces en los botones.
➡️ En el log de eventos se ve que diferentes nodos procesan cada voto (round-robin)

### Paso 3 — Demostrar Tolerancia a Fallos ⭐
```bash
# Matar el nodo 2
docker compose stop api-2
```
➡️ En el dashboard, el Nodo 2 se pone en ROJO
➡️ ¡Pero sigue siendo posible votar! Solo usan nodo-1 y nodo-3

### Paso 4 — Revivir el nodo
```bash
docker compose start api-2
```
➡️ En ~3 segundos el Nodo 2 vuelve a VERDE y entra al pool

### Paso 5 — Ver logs del sistema
```bash
# Ver qué procesa cada nodo
docker compose logs api-1 --tail=20
docker compose logs api-2 --tail=20
docker compose logs api-3 --tail=20
```

---

## 🔧 Comandos útiles

```bash
# Ver todos los contenedores
docker compose ps

# Ver logs en tiempo real de todo
docker compose logs -f

# Detener todo
docker compose down

# Detener y borrar volúmenes (resetea la BD)
docker compose down -v

# Escalar a 5 nodos API (avanzado)
docker compose up --scale api-1=1 --scale api-2=1 --scale api-3=1
```

---

## 🏗️ Arquitectura

```
Tu navegador
     │
     ▼
┌─────────────────────────────────┐
│  nginx (Load Balancer)  :8080   │
│  Round-Robin automático         │
└───────────┬─────────────────────┘
            │
  ┌─────────┼──────────┐
  ▼         ▼          ▼
api-1     api-2      api-3      ← 3 nodos (mismo código, distinto ID)
  │         │          │
  └────┬────┘          │
       ▼               │
  ┌────────┐           │
  │ Redis  │◄──────────┘        ← Estado compartido + Pub/Sub
  └────┬───┘
       │
  ┌────▼──────┐
  │ PostgreSQL │                 ← Persistencia de todos los votos
  └────────────┘
```

---

## 📡 Endpoints de la API

| Método | URL                    | Descripción                          |
|--------|------------------------|--------------------------------------|
| GET    | `/api/status`          | Estado del nodo actual               |
| GET    | `/api/node/1/status`   | Estado del nodo 1 específicamente    |
| GET    | `/api/node/2/status`   | Estado del nodo 2 específicamente    |
| GET    | `/api/node/3/status`   | Estado del nodo 3 específicamente    |
| POST   | `/api/vote`            | Votar `{ "option": "A" }` o `"B"`   |
| GET    | `/api/votes`           | Conteos actuales + historial         |
| DELETE | `/api/votes/reset`     | Resetear contadores                  |
| GET    | `/api/events`          | Stream SSE (tiempo real)             |
