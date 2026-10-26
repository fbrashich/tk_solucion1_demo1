import asyncio
from app.db import AsyncSessionLocal
from app.models.models import User
from app.core.security import get_password_hash
from sqlalchemy.future import select

async def fix():
    async with AsyncSessionLocal() as s:
        res = await s.execute(select(User).where(User.username == "fabianb@tokioba.com"))
        u = res.scalars().first()
        if u:
            u.hashed_password = get_password_hash("fabian123")
            await s.commit()
            print("FABIAN PASSWORD RESET TO fabian123 SUCCESS")
        else:
            print("USER NOT FOUND")

if __name__ == "__main__":
    asyncio.run(fix())
