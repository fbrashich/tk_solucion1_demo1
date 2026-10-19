FROM nginx:alpine

# Limpiar configuracion previa
RUN rm -f /etc/nginx/conf.d/default.conf

# Copiar configuracion de proxy inverso y selector visual
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY selector.html /usr/share/nginx/html/selector.html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
