from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: str | None = None

class User(BaseModel):
    id: Optional[int] = None
    username: str
    role: str = "operator"
    is_active: bool = True
    devices_count: int = 0

    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "operator"

class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class DeviceBase(BaseModel):
    device_id: str
    name: str
    type: str = "Mesa Vibratoria"
    description: Optional[str] = None
    is_active: bool = True
    traccar_unique_id: Optional[str] = None
    traccar_model: Optional[str] = None
    sim_phone: Optional[str] = None
    category: Optional[str] = "machinery"

class DeviceCreate(DeviceBase):
    pass

class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    traccar_unique_id: Optional[str] = None
    traccar_model: Optional[str] = None
    sim_phone: Optional[str] = None
    category: Optional[str] = None

class DeviceResponse(DeviceBase):
    id: int
    user_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class IngestPayload(BaseModel):
    device_id: str
    lat: float
    lon: float
    ignition: bool
    timestamp: Optional[datetime] = None

class DeviceStatusResponse(BaseModel):
    device_id: str
    name: Optional[str] = None
    type: Optional[str] = None
    status: str # "OPERANDO" | "DETENIDA" | "SIN COMUNICACIÓN"
    ignition: Optional[bool] = None
    last_lat: Optional[float] = None
    last_lon: Optional[float] = None
    engine_hours: float
    last_updated: Optional[datetime] = None

class FleetSummaryResponse(BaseModel):
    total_devices: int
    operating_count: int
    detained_count: int
    no_comm_count: int
    total_engine_hours: float
    devices: list[DeviceStatusResponse]

class TelemetryEventResponse(BaseModel):
    id: int
    device_id: str
    timestamp: datetime
    latitude: float
    longitude: float
    ignition_state: bool

    class Config:
        from_attributes = True
