import asyncio
import json
import logging
from typing import Optional
from fastapi import APIRouter, Query, Depends, Request, HTTPException, status
from fastapi.responses import StreamingResponse
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.services.live_stream import live_manager
from app.core.config import settings
from app.db import get_db
from app.models.models import User

logger = logging.getLogger("api_live")
router = APIRouter()

async def get_live_user(
    request: Request,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
) -> User:
    auth_header = request.headers.get("Authorization")
    raw_token = None
    if auth_header and auth_header.startswith("Bearer "):
        raw_token = auth_header[7:].strip()
    elif token:
        raw_token = token.strip()

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autorización requerido"
        )

    try:
        payload = jwt.decode(raw_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token sin identidad")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido o expirado")

    result = await db.execute(select(User).where(User.username == username))
    user = result.scalars().first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no autorizado")
    return user

@router.get("/logs")
async def get_recent_live_logs(
    limit: int = Query(60, ge=1, le=200),
    filter: Optional[str] = Query(None, description="Filtro de búsqueda por IMEI o texto"),
    current_user: User = Depends(get_live_user)
):
    """
    Retorna el búfer de eventos telemáticos y líneas de red recientes para inicializar el visor web.
    """
    events = live_manager.get_recent(limit=limit, filter_text=filter)
    return {
        "status": "ok",
        "total": len(events),
        "events": events
    }

@router.get("/stream")
async def stream_live_events(
    request: Request,
    filter: Optional[str] = Query(None, description="Filtro opcional por IMEI o palabra clave"),
    current_user: User = Depends(get_live_user)
):
    """
    Canal Server-Sent Events (SSE) en tiempo real para el visor web.
    Emite tramas entrantes, handshakes Teltonika, coordenadas GPS y desconexiones segundo a segundo.
    """
    queue = live_manager.subscribe()

    async def event_generator():
        welcome = {
            "id": "welcome",
            "kind": "SYSTEM",
            "message": f"Conexión Live Stream establecida con éxito para {current_user.username}",
            "timestamp": "En línea",
            "details": {"user": current_user.username}
        }
        yield f"data: {json.dumps(welcome)}\n\n"

        filter_lower = filter.strip().lower() if filter else None

        try:
            while True:
                if await request.is_disconnected():
                    break

                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)

                    if filter_lower:
                        ev_str = json.dumps(event).lower()
                        if filter_lower not in ev_str:
                            continue

                    payload = json.dumps(event)
                    yield f"data: {payload}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            live_manager.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
