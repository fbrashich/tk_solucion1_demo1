import asyncio
import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select
import os
import sys

# Agregar el directorio backend al PYTHONPATH para importar módulos de app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db import Base
from app.models.models import User
from app.core.config import settings
from app.core.security import get_password_hash

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def init_db():
    engine = create_async_engine(settings.DATABASE_URL, echo=True)

    # Esperar y reintentar si Postgres aún está inicializando
    max_retries = 10
    for attempt in range(1, max_retries + 1):
        try:
            async with engine.begin() as conn:
                logger.info("Creating all tables if they do not exist...")
                await conn.run_sync(Base.metadata.create_all)
            break
        except Exception as e:
            logger.warning(f"Database not ready yet (attempt {attempt}/{max_retries}): {e}")
            if attempt == max_retries:
                raise
            await asyncio.sleep(2)

    # Insertar usuario por defecto admin/admin123
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        result = await session.execute(select(User).where(User.username == "admin"))
        user = result.scalars().first()
        if not user:
            logger.info("Creating default admin user...")
            new_user = User(
                username="admin",
                hashed_password=get_password_hash("admin123"),
                is_active=True
            )
            session.add(new_user)
            await session.commit()
            logger.info("Admin user created successfully.")
        else:
            logger.info("Admin user already exists.")

    await engine.dispose()

if __name__ == "__main__":
    logger.info("Initializing database...")
    asyncio.run(init_db())
    logger.info("Database initialized.")
