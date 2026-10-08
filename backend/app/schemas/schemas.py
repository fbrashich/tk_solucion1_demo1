from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: str | None = None

class User(BaseModel):
    username: str

class IngestPayload(BaseModel):
    device_id: str
    lat: float
    lon: float
    ignition: bool

class DeviceStatusResponse(BaseModel):
    device_id: str
    status: str # "conectado" o "desconectado"
    last_lat: Optional[float] = None
    last_lon: Optional[float] = None
    engine_hours: float
    last_updated: Optional[datetime] = None

class TelemetryEventResponse(BaseModel):
    id: int
    device_id: str
    timestamp: datetime
    latitude: float
    longitude: float
    ignition_state: bool

    class Config:
        from_attributes = True
