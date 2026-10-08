# Etapa de build
FROM node:18-alpine AS build

WORKDIR /app

# Copiar archivos de configuración de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código y realizar el build
COPY . .
RUN npm run build

# Etapa de producción
FROM nginx:alpine

# Copiar los assets estáticos desde la etapa de build
COPY --from=build /app/dist /usr/share/nginx/html

# Crear o copiar la configuración de nginx si fuera necesario para react router
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponer puerto 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
