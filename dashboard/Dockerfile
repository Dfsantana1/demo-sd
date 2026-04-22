FROM nginx:alpine

# Copiamos nuestros archivos del dashboard
COPY . /usr/share/nginx/html

# Plantilla de configuración de NGINX que acepta puertos dinámicos ($PORT de Railway)
RUN echo 'server { \
    listen       ${PORT}; \
    listen  [::]:${PORT}; \
    server_name  localhost; \
    location / { \
        root   /usr/share/nginx/html; \
        index  index.html; \
        try_files $uri $uri.html $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf.template

# Al iniciar:
# 1. Inyectamos la URL de la API en el HTML.
# 2. Inyectamos el $PORT en la configuración de NGINX con envsubst.
# 3. Arrancamos NGINX.
CMD sed -i "s|___API_BASE___|${API_BASE}|g" /usr/share/nginx/html/*.html && \
    envsubst '${PORT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && \
    nginx -g "daemon off;"
  