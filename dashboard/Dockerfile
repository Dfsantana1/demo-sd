FROM nginx:alpine

# Copiamos nuestros archivos del dashboard (index.html, logs.html, vote.html)
# al directorio por defecto que usa NGINX para servir páginas web
COPY . /usr/share/nginx/html

# Exponer el puerto estándar de NGINX
EXPOSE 80

# Reemplazamos nuestro placeholder '___API_BASE___' por la variable de entorno
# $API_BASE en todos los archivos HTML y luego levantamos nginx.
CMD sed -i "s|___API_BASE___|${API_BASE}|g" /usr/share/nginx/html/*.html && nginx -g "daemon off;"
  