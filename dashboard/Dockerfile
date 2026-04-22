FROM nginx:alpine

# Copiamos nuestros archivos del dashboard (index.html, logs.html, vote.html)
# al directorio por defecto que usa NGINX para servir páginas web
COPY . /usr/share/nginx/html

# Exponer el puerto
EXPOSE 80

# Reemplazamos el puerto por defecto de nginx por el proporcionado por Railway ($PORT)
# Y luego reemplazamos nuestro placeholder '___API_BASE___' por $API_BASE en todos los HTML
CMD sed -i -e 's/listen  .*80;/listen '"${PORT:-80}"';/g' /etc/nginx/conf.d/default.conf && \
    sed -i "s|___API_BASE___|${API_BASE}|g" /usr/share/nginx/html/*.html && \
    nginx -g "daemon off;"
  