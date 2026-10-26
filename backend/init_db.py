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
                # Migraciones no destructivas
                await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR DEFAULT 'operator';"))
                await conn.execute(text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;"))
                await conn.execute(text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS traccar_unique_id VARCHAR;"))
                await conn.execute(text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS traccar_model VARCHAR;"))
                await conn.execute(text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS sim_phone VARCHAR;"))
                await conn.execute(text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS category VARCHAR DEFAULT 'machinery';"))
                # Telemetría enriquecida y raw_data
                await conn.execute(text("ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS speed FLOAT;"))
                await conn.execute(text("ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS altitude FLOAT;"))
                await conn.execute(text("ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS course FLOAT;"))
                await conn.execute(text("ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS raw_data JSONB;"))
                await conn.execute(text("ALTER TABLE device_states ADD COLUMN IF NOT EXISTS last_latitude FLOAT;"))
                await conn.execute(text("ALTER TABLE device_states ADD COLUMN IF NOT EXISTS last_longitude FLOAT;"))
                await conn.execute(text("ALTER TABLE device_states ADD COLUMN IF NOT EXISTS last_speed FLOAT;"))
                await conn.execute(text("ALTER TABLE device_states ADD COLUMN IF NOT EXISTS last_raw_data JSONB;"))

                # Etapa 1: Campos decodificados Teltonika FMC150
                await conn.execute(text("ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS external_power FLOAT;"))
                await conn.execute(text("ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS internal_battery FLOAT;"))
                await conn.execute(text("ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS sleep_mode INTEGER;"))
                await conn.execute(text("ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS gnss_status INTEGER;"))
                await conn.execute(text("ALTER TABLE telemetry_events ADD COLUMN IF NOT EXISTS network_operator VARCHAR;"))

                await conn.execute(text("ALTER TABLE device_states ADD COLUMN IF NOT EXISTS external_power FLOAT;"))
                await conn.execute(text("ALTER TABLE device_states ADD COLUMN IF NOT EXISTS internal_battery FLOAT;"))
                await conn.execute(text("ALTER TABLE device_states ADD COLUMN IF NOT EXISTS sleep_mode INTEGER;"))
                await conn.execute(text("ALTER TABLE device_states ADD COLUMN IF NOT EXISTS gnss_status INTEGER;"))
                await conn.execute(text("ALTER TABLE device_states ADD COLUMN IF NOT EXISTS network_operator VARCHAR;"))

                # Etapa 2: Offsets de calibración y estados operativos de negocio
                await conn.execute(text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS odometer_offset_km FLOAT DEFAULT 0.0;"))
                await conn.execute(text("ALTER TABLE devices ADD COLUMN IF NOT EXISTS engine_hours_offset FLOAT DEFAULT 0.0;"))

                await conn.execute(text("ALTER TABLE device_states ADD COLUMN IF NOT EXISTS operating_status VARCHAR DEFAULT 'DISCONNECTED';"))
                await conn.execute(text("ALTER TABLE device_states ADD COLUMN IF NOT EXISTS calibrated_odometer_km FLOAT DEFAULT 0.0;"))
                await conn.execute(text("ALTER TABLE device_states ADD COLUMN IF NOT EXISTS total_idling_hours FLOAT DEFAULT 0.0;"))
                await conn.execute(text("ALTER TABLE device_states ADD COLUMN IF NOT EXISTS last_idling_start TIMESTAMP WITH TIME ZONE;"))

                # Etapa 4: Alertas Operativas y Mantenimiento Preventivo
                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS vehicle_alerts (
                        id SERIAL PRIMARY KEY,
                        device_id VARCHAR NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
                        alert_type VARCHAR NOT NULL,
                        severity VARCHAR DEFAULT 'WARNING' NOT NULL,
                        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                        message TEXT NOT NULL,
                        value FLOAT,
                        resolved BOOLEAN DEFAULT FALSE NOT NULL,
                        resolved_at TIMESTAMP WITH TIME ZONE,
                        resolved_by VARCHAR
                    );
                """))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_alerts_device_resolved ON vehicle_alerts(device_id, resolved, timestamp DESC);"))

                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS maintenance_plans (
                        id SERIAL PRIMARY KEY,
                        device_id VARCHAR NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
                        title VARCHAR NOT NULL,
                        service_type VARCHAR DEFAULT 'KM' NOT NULL,
                        interval_value FLOAT NOT NULL,
                        last_service_value FLOAT DEFAULT 0.0 NOT NULL,
                        next_service_value FLOAT NOT NULL,
                        due_date TIMESTAMP WITH TIME ZONE,
                        notes TEXT,
                        is_active BOOLEAN DEFAULT TRUE NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
                    );
                """))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_maint_plans_device ON maintenance_plans(device_id, is_active);"))

                await conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS maintenance_logs (
                        id SERIAL PRIMARY KEY,
                        plan_id INTEGER REFERENCES maintenance_plans(id) ON DELETE CASCADE,
                        device_id VARCHAR NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
                        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
                        executed_value FLOAT NOT NULL,
                        workshop VARCHAR,
                        cost FLOAT DEFAULT 0.0,
                        notes TEXT
                    );
                """))
                await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_maint_logs_device ON maintenance_logs(device_id, executed_at DESC);"))
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
            await session.flush()
        else:
            logger.info("Operator user (aldo) verified.")

        # 3. Asegurar usuario fabianb@tokioba.com y único dispositivo activo
        res_fabian = await session.execute(select(User).where(User.username == "fabianb@tokioba.com"))
        fabian_user = res_fabian.scalars().first()
        if not fabian_user:
            logger.info("Creating default operator user (fabianb@tokioba.com)...")
            fabian_user = User(
                username="fabianb@tokioba.com",
                hashed_password=get_password_hash("fabian123"),
                role="operator",
                is_active=True
            )
            session.add(fabian_user)
            await session.flush()
        else:
            logger.info("Operator user (fabianb@tokioba.com) verified.")

        initial_devices = [
            ("FMC150_331", "Van  Operarios", "Teltonika GPS", "Unidad de Transporte de Operarios (FMC150)", "863238073460331", "Teltonika FMC150", "", "car")
        ]

        for dev_id, name, dev_type, desc, t_id, t_model, sim, cat in initial_devices:
            owner_user_id = fabian_user.id
            dev_res = await session.execute(select(Device).where(Device.traccar_unique_id == t_id))
            dev_obj = dev_res.scalars().first()
            if not dev_obj:
                logger.info(f"Seeding default device: {dev_id} ({name}) for user {owner_user_id}")
                new_dev = Device(
                    device_id=dev_id,
                    name=name,
                    type=dev_type,
                    description=desc,
                    is_active=True,
                    user_id=owner_user_id,
                    traccar_unique_id=t_id,
                    traccar_model=t_model,
                    sim_phone=sim,
                    category=cat
                )
                session.add(new_dev)
            else:
                dev_obj.user_id = owner_user_id
                dev_obj.name = name
                dev_obj.is_active = True
                if not dev_obj.traccar_unique_id:
                    dev_obj.traccar_unique_id = t_id
                if not dev_obj.traccar_model:
                    dev_obj.traccar_model = t_model
                if not dev_obj.category:
                    dev_obj.category = cat

        await session.commit()
        logger.info("Seed data applied successfully.")

    await engine.dispose()

if __name__ == "__main__":
    logger.info("Initializing database...")
    asyncio.run(init_db())
    logger.info("Database initialized.")
