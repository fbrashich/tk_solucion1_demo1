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
    work_schedule_enabled: Optional[bool] = False
    work_schedule_start: Optional[str] = "07:00"
    work_schedule_end: Optional[str] = "19:00"
    allowed_weekdays: Optional[str] = "0,1,2,3,4"

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
    work_schedule_enabled: Optional[bool] = None
    work_schedule_start: Optional[str] = None
    work_schedule_end: Optional[str] = None
    allowed_weekdays: Optional[str] = None

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

# ==============================================================================
# SCHEMAS DE VIAJES Y RECORRIDOS (ETAPA 3)
# ==============================================================================
class VehicleTripResponse(BaseModel):
    id: int
    device_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_seconds: int = 0
    distance_km: float = 0.0
    max_speed_kmh: float = 0.0
    avg_speed_kmh: float = 0.0
    idling_seconds: int = 0
    start_latitude: Optional[float] = None
    start_longitude: Optional[float] = None
    end_latitude: Optional[float] = None
    end_longitude: Optional[float] = None
    is_closed: bool = False
    idling_fuel_cost_est: Optional[float] = 0.0 # Estimación de combustible desperdiciado en ralentí

    class Config:
        from_attributes = True

class TripPoint(BaseModel):
    latitude: float
    longitude: float
    speed: Optional[float] = 0.0
    course: Optional[float] = 0.0
    altitude: Optional[float] = None
    timestamp: datetime
    ignition_state: bool = True

    class Config:
        from_attributes = True

class VehicleTripRouteResponse(BaseModel):
    trip: VehicleTripResponse
    points: List[TripPoint] = []
    point_count: int = 0

# ==============================================================================
# GEOCERCAS INTELIGENTES Y CONTROL DE PERMANENCIA (Sprint 1 - v0.5.0)
# ==============================================================================

class GeofenceBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    type: str = Field(default="POLYGON", pattern="^(POLYGON|CIRCLE)$")
    center_lat: Optional[float] = None
    center_lon: Optional[float] = None
    radius_meters: Optional[float] = None
    polygon_vertices: Optional[List[List[float]]] = None
    color: Optional[str] = "#06b6d4"
    speed_limit_kmh: Optional[float] = None
    is_active: bool = True

    @field_validator('name', 'description', mode='before')
    @classmethod
    def sanitize_strings(cls, v):
        if isinstance(v, str):
            if re.search(r'[<>]', v):
                raise ValueError("No se permiten caracteres HTML o scripts (<, >)")
            return v.strip()
        return v

class GeofenceCreate(GeofenceBase):
    pass

class GeofenceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    center_lat: Optional[float] = None
    center_lon: Optional[float] = None
    radius_meters: Optional[float] = None
    polygon_vertices: Optional[List[List[float]]] = None
    color: Optional[str] = None
    speed_limit_kmh: Optional[float] = None
    is_active: Optional[bool] = None

class GeofenceResponse(GeofenceBase):
    id: int
    user_id: int
    created_at: datetime
    active_devices_inside: Optional[int] = 0

    class Config:
        from_attributes = True

class GeofenceEventResponse(BaseModel):
    id: int
    geofence_id: int
    device_id: str
    event_type: str
    timestamp: datetime
    latitude: float
    longitude: float
    speed_kmh: float
    duration_inside_seconds: Optional[int] = None
    geofence_name: Optional[str] = None

    class Config:
        from_attributes = True


