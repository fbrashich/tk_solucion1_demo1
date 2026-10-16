#!/bin/bash
set -e
REPO_DIR="/mnt/ssd/tokioba-iot"
cd "$REPO_DIR"

# Traer información de GitHub silenciosamente
git fetch origin main >/dev/null 2>&1

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "🚀 [$(date '+%Y-%m-%d %H:%M:%S')] Nuevos cambios detectados en GitHub ($LOCAL -> $REMOTE). Iniciando deploy..."
    
    # 1. Traer los cambios limpios
    git reset --hard origin/main
    
    # 2. Reconstruir secuencialmente (api primero, luego web) para proteger la RAM
    docker compose -f docker-compose.pi.yml build api
    docker compose -f docker-compose.pi.yml build web
    docker compose -f docker-compose.pi.yml up -d
    
    # 3. Limpiar imágenes viejas de Docker para no acumular espacio
    docker image prune -f >/dev/null 2>&1
    
    echo "✅ [$(date '+%Y-%m-%d %H:%M:%S')] Tokioba actualizado exitosamente."
else
    # Sin cambios nuevos
    exit 0
fi
