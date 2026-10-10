import asyncio
import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select
from sqlalchemy import text
import os
import sys

# Agregar el directorio backend al PYTHONPATH para importar módulos de app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db import Base
from app.models.models import User, Device
from app.core.config import settings
from app.core.security import get_password_hash

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def init_db():
    # Esperar y reintentar si Postgres o DNS de Docker aún están inicializando
    max_retries = 15
    engine = None
    for attempt in range(1, max_retries + 1):
        try:
            engine = create_async_engine(settings.DATABASE_URL, echo=True)
            async with engine.begin() as conn:
                logger.info("Connected to database successfully. Ensuring tables exist...")
                await conn.run_sync(Base.metadata.create_all)
                # Migración no destructiva: agregar columna role a users si no existe
                await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR DEFAULT 'operator';"))
            break
        except Exception as e:
            logger.warning(f"Database not ready yet (attempt {attempt}/{max_retries}): {e}")
            if engine:
                await engine.dispose()
                engine = None
            if attempt == max_retries:
                raise
            await asyncio.sleep(2)

    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        # 1. Asegurar usuario Super Admin (admin / admin123)
        result = await session.execute(select(User).where(User.username == "admin"))
        admin_user = result.scalars().first()
        if not admin_user:
            logger.info("Creating default Super Admin user (admin)...")
            admin_user = User(
                username="admin",
                hashed_password=get_password_hash("admin123"),
                role="admin",
                is_active=True
            )
            session.add(admin_user)
        else:
            admin_user.role = "admin"
            logger.info("Admin user verified.")

        # 2. Asegurar usuario Operador (aldo / aldo123)
        res_aldo = await session.execute(select(User).where(User.username == "aldo"))
        aldo_user = res_aldo.scalars().first()
        if not aldo_user:
            logger.info("Creating default operator user (aldo)...")
            aldo_user = User(
                username="aldo",
                hashed_password=get_password_hash("aldo123"),
                role="operator",
                is_active=True
            )
            session.add(aldo_user)

        # 3. Asegurar dispositivos iniciales de demo para el selector múltiple
        initial_devices = [
            ("MESA_01", "Mesa Vibratoria Principal", "Mesa Vibratoria", "Sector A - Lavado y Separación"),
            ("MESA_02", "Mesa Clasificadora 02", "Mesa Clasificadora", "Sector B - Concentración Gravimétrica"),
            ("PALA_01", "Pala Cargadora Frontal", "Maquinaria Pesada", "Área de Acopio y Alimentación")
        ]

        for dev_id, name, dev_type, desc in initial_devices:
            dev_res = await session.execute(select(Device).where(Device.device_id == dev_id))
            if not dev_res.scalars().first():
                logger.info(f"Seeding default device: {dev_id} ({name})")
                new_dev = Device(
                    device_id=dev_id,
                    name=name,
                    type=dev_type,
                    description=desc,
                    is_active=True
                )
                session.add(new_dev)

        await session.commit()
        logger.info("Seed data applied successfully.")

    await engine.dispose()

if __name__ == "__main__":
    logger.info("Initializing database...")
    asyncio.run(init_db())
    logger.info("Database initialized.")
