FROM python:3.11-slim

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive

# Instalar dependencias del sistema requeridas para construir paquetes si fuera necesario
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias de Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código fuente
COPY . .

# Exponer el puerto
EXPOSE 8000

# Comando para inicializar la BDD e iniciar Uvicorn
CMD python init_db.py && uvicorn app.main:app --host 0.0.0.0 --port 8000
