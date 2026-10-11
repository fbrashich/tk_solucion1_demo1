import asyncio
from app.db import AsyncSessionLocal
from app.models.models import User, Device
from sqlalchemy.future import select

async def main():
    async with AsyncSessionLocal() as session:
        # 1. Buscar usuario fabianb_op
        res_user = await session.execute(select(User).where(User.username == "fabianb_op"))
        user = res_user.scalars().first()
        if not user:
            print("ERROR: Usuario 'fabianb_op' no encontrado en la base de datos.")
            all_users = await session.execute(select(User.id, User.username, User.role))
            print("Usuarios existentes:", all_users.all())
            return
        
        print(f"Usuario 'fabianb_op' encontrado: ID={user.id}, Rol={user.role}")

        # 2. Buscar dispositivo ATC700_01
        res_dev = await session.execute(select(Device).where(Device.device_id == "ATC700_01"))
        dev = res_dev.scalars().first()
        if not dev:
            print("ERROR: Dispositivo 'ATC700_01' no encontrado en la base de datos.")
            return

        old_user_id = dev.user_id
        dev.user_id = user.id
        await session.commit()
        await session.refresh(dev)

        print(f"Dispositivo '{dev.device_id}' ({dev.name}) reasignado exitosamente:")
        print(f"  Usuario anterior (user_id): {old_user_id}")
        print(f"  Nuevo usuario (user_id): {dev.user_id} ({user.username})")

if __name__ == "__main__":
    asyncio.run(main())
