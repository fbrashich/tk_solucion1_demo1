import re
from pydantic import BaseModel, Field, field_validator
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
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)
    role: str = "operator"

    @field_validator('username', mode='before')
    @classmethod
    def sanitize_username(cls, v):
        if isinstance(v, str):
            if re.search(r'[<>\'"\\]', v):
                raise ValueError("El nombre de usuario contiene caracteres no permitidos")
            return v.strip()
        return v

class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None

class DeviceBase(BaseModel):
    device_id: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    type: str = "Mesa Vibratoria"
    description: Optional[str] = None
    is_active: bool = True
    traccar_unique_id: Optional[str] = None
    traccar_model: Optional[str] = None
    sim_phone: Optional[str] = None
    category: Optional[str] = "machinery"

    @field_validator('device_id', 'name', 'type', 'description', 'traccar_model', 'sim_phone', mode='before')
    @classmethod
    def sanitize_strings(cls, v):
        if isinstance(v, str):
            if re.search(r'[<>]', v):
                raise ValueError("No se permiten caracteres HTML o scripts (<, >)")
            return v.strip()
        return v

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

    @field_validator('name', 'type', 'description', 'traccar_model', 'sim_phone', mode='before')
    @classmethod
    def sanitize_strings(cls, v):
        if isinstance(v, str):
            if re.search(r'[<>]', v):
                raise ValueError("No se permiten caracteres HTML o scripts (<, >)")
            return v.strip()
        return v

class DeviceResponse(DeviceBase):
    id: int
    user_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class IngestPayload(BaseModel):
    device_id: str = Field(..., min_length=1, max_length=50)
    lat: float = Field(..., ge=-90.0, le=90.0, description="Latitud WGS84 válida entre -90 y 90")
    lon: float = Field(..., ge=-180.0, le=180.0, description="Longitud WGS84 válida entre -180 y 180")
    ignition: bool
    timestamp: Optional[datetime] = None
    speed: Optional[float] = None
    altitude: Optional[float] = None
    course: Optional[float] = None
    raw_data: Optional[dict] = None

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
    last_speed: Optional[float] = None
    raw_data: Optional[dict] = None
    external_power: Optional[float] = None
    internal_battery: Optional[float] = None
    sleep_mode: Optional[int] = None
    gnss_status: Optional[int] = None
    network_operator: Optional[str] = None

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
    speed: Optional[float] = None
    altitude: Optional[float] = None
    course: Optional[float] = None
    raw_data: Optional[dict] = None
    external_power: Optional[float] = None
    internal_battery: Optional[float] = None
    sleep_mode: Optional[int] = None
    gnss_status: Optional[int] = None
    network_operator: Optional[str] = None

    class Config:
        from_attributes = True
