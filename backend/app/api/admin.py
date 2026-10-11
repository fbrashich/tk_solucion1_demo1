from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from app.db import get_db
from app.models.models import User, Device
from app.schemas.schemas import User as UserSchema, UserCreate, UserUpdate
from app.api.deps import get_current_admin
from app.core.security import get_password_hash
from sqlalchemy import func

router = APIRouter()

@router.get("/users", response_model=List[UserSchema])
async def list_users(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    result = await db.execute(select(User).order_by(User.id))
    users = result.scalars().all()
    
    users_with_device_counts = []
    for u in users:
        dev_res = await db.execute(
            select(func.count(Device.id))
            .where(Device.user_id == u.id, Device.is_active == True)
        )
        count = dev_res.scalar() or 0
        users_with_device_counts.append(UserSchema(
            id=u.id,
            username=u.username,
            role=u.role,
            is_active=u.is_active,
            devices_count=count
        ))
    return users_with_device_counts

@router.post("/users", response_model=UserSchema, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    clean_username = payload.username.strip()
    # Verificar si el usuario ya existe (insensible a mayúsculas/minúsculas)
    existing_res = await db.execute(
        select(User).where(func.lower(User.username) == clean_username.lower())
    )
    if existing_res.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El nombre de usuario '{clean_username}' ya se encuentra registrado."
        )

    new_user = User(
        username=clean_username,
        hashed_password=get_password_hash(payload.password),
        role=payload.role if payload.role in ["admin", "operator"] else "operator",
        is_active=True
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return UserSchema(
        id=new_user.id,
        username=new_user.username,
        role=new_user.role,
        is_active=new_user.is_active,
        devices_count=0
    )

@router.put("/users/{user_id}", response_model=UserSchema)
async def update_user(
    user_id: int,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if payload.role is not None:
        if payload.role in ["admin", "operator"]:
            user.role = payload.role
    if payload.is_active is not None:
        # Prevenir que el admin se desactive a sí mismo
        if user.id == admin.id and not payload.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No puedes desactivar tu propia cuenta de administrador"
            )
        user.is_active = payload.is_active
    if payload.password:
        user.hashed_password = get_password_hash(payload.password)

    await db.commit()
    await db.refresh(user)

    dev_res = await db.execute(
        select(func.count(Device.id))
        .where(Device.user_id == user.id, Device.is_active == True)
    )
    count = dev_res.scalar() or 0

    return UserSchema(
        id=user.id,
        username=user.username,
        role=user.role,
        is_active=user.is_active,
        devices_count=count
    )

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes eliminar tu propia cuenta de administrador"
        )

    await db.delete(user)
    await db.commit()
    return {"status": "ok", "message": f"Usuario {user.username} eliminado correctamente."}
