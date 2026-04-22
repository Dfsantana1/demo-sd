FROM nginx:alpine

# Copiamos nuestros archivos del dashboard (index.html, logs.html, vote.html)
# al directorio por defecto que usa NGINX para servir páginas web
COPY . /usr/share/nginx/html

# Exponer el puerto estándar de NGINX
EXPOSE 80
