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
    odometer_offset_km: Optional[float] = 0.0
    engine_hours_offset: Optional[float] = 0.0

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
    odometer_offset_km: Optional[float] = None
    engine_hours_offset: Optional[float] = None

    @field_validator('name', 'type', 'description', 'traccar_model', 'sim_phone', mode='before')
    @classmethod
    def sanitize_strings(cls, v):
        if isinstance(v, str):
            if re.search(r'[<>]', v):
                raise ValueError("No se permiten caracteres HTML o scripts (<, >)")
            return v.strip()
        return v

class DeviceCalibrationUpdate(BaseModel):
    odometer_offset_km: Optional[float] = None
    engine_hours_offset: Optional[float] = None
    current_dashboard_odometer_km: Optional[float] = None
    current_dashboard_engine_hours: Optional[float] = None

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
    status: str # "OPERANDO" | "DETENIDA" | "SIN COMUNICACIÓN" o semántico
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

    # Métricas operativas de negocio y calibración (Etapa 2)
    operating_status: Optional[str] = "DISCONNECTED" # "MOVING" | "IDLING" | "PARKED_SLEEP" | "TOWING" | "DISCONNECTED"
    operating_status_label: Optional[str] = "SIN COMUNICACIÓN"
    operating_status_color: Optional[str] = "#f43f5e"
    calibrated_odometer_km: Optional[float] = 0.0
    total_idling_hours: Optional[float] = 0.0
    odometer_offset_km: Optional[float] = 0.0
    engine_hours_offset: Optional[float] = 0.0
    calibrated_engine_hours: Optional[float] = 0.0
    battery_health: Optional[str] = None
    battery_health_color: Optional[str] = None
    sleep_mode_desc: Optional[str] = None
    gnss_status_desc: Optional[str] = None

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

# ==========================================
# ETAPA 4: ALERTAS Y MANTENIMIENTO PREVENTIVO
# ==========================================

class VehicleAlertResponse(BaseModel):
    id: int
    device_id: str
    alert_type: str
    severity: str # INFO | WARNING | CRITICAL
    timestamp: datetime
    message: str
    value: Optional[float] = None
    resolved: bool
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None

    class Config:
        from_attributes = True

class AlertResolveRequest(BaseModel):
    notes: Optional[str] = None

class MaintenancePlanBase(BaseModel):
    title: str = Field(..., min_length=2, max_length=150)
    service_type: str = "KM" # "KM" | "HOURS" | "DATE"
    interval_value: float = Field(..., gt=0)
    last_service_value: float = 0.0
    next_service_value: Optional[float] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None
    is_active: bool = True

    @field_validator('title', 'service_type', 'notes', mode='before')
    @classmethod
    def sanitize_strings(cls, v):
        if isinstance(v, str):
            if re.search(r'[<>]', v):
                raise ValueError("No se permiten caracteres HTML o scripts (<, >)")
            return v.strip()
        return v

class MaintenancePlanCreate(MaintenancePlanBase):
    pass

class MaintenancePlanUpdate(BaseModel):
    title: Optional[str] = None
    service_type: Optional[str] = None
    interval_value: Optional[float] = None
    last_service_value: Optional[float] = None
    next_service_value: Optional[float] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator('title', 'service_type', 'notes', mode='before')
    @classmethod
    def sanitize_strings(cls, v):
        if isinstance(v, str):
            if re.search(r'[<>]', v):
                raise ValueError("No se permiten caracteres HTML o scripts (<, >)")
            return v.strip()
        return v

class MaintenancePlanResponse(MaintenancePlanBase):
    id: int
    device_id: str
    created_at: datetime
    current_vehicle_value: Optional[float] = 0.0
    remaining_value: Optional[float] = 0.0
    progress_percentage: Optional[float] = 0.0
    status: Optional[str] = "OK" # "OK" | "WARNING" | "OVERDUE"
    status_label: Optional[str] = None
    status_color: Optional[str] = "emerald"

    class Config:
        from_attributes = True

class MaintenanceRecordServiceRequest(BaseModel):
    executed_value: Optional[float] = None # Si es null se toma el odómetro/horas actual del vehículo
    workshop: Optional[str] = None
    cost: Optional[float] = 0.0
    notes: Optional[str] = None

    @field_validator('workshop', 'notes', mode='before')
    @classmethod
    def sanitize_strings(cls, v):
        if isinstance(v, str):
            if re.search(r'[<>]', v):
                raise ValueError("No se permiten caracteres HTML o scripts (<, >)")
            return v.strip()
        return v

class MaintenanceLogResponse(BaseModel):
    id: int
    plan_id: Optional[int] = None
    device_id: str
    executed_at: datetime
    executed_value: float
    workshop: Optional[str] = None
    cost: Optional[float] = 0.0
    notes: Optional[str] = None

    class Config:
        from_attributes = True

