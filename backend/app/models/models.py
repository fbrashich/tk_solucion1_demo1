from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="operator", nullable=False) # "admin" | "operator"
    is_active = Column(Boolean, default=True)
    
    devices = relationship("Device", back_populates="owner", cascade="all, delete-orphan")

class Device(Base):
    __tablename__ = "devices"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, unique=True, index=True, nullable=False) # Alias/Código (ej. MESA_01, ATC700_01)
    name = Column(String, nullable=False) # Nombre de la máquina
    type = Column(String, default="Mesa Vibratoria", nullable=False)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

    # Asociación con cuenta de operador
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    owner = relationship("User", back_populates="devices")

    # Campos de integración con Traccar
    traccar_unique_id = Column(String, nullable=True, index=True) # IMEI / Unique ID en Traccar
    traccar_model = Column(String, nullable=True) # Modelo GPS (ej. Teltonika ATC700, FMB920)
    sim_phone = Column(String, nullable=True) # Número SIM
    category = Column(String, default="machinery", nullable=True) # Categoría Traccar

    # Offsets de calibración con tablero físico (Etapa 2)
    odometer_offset_km = Column(Float, default=0.0, nullable=False)
    engine_hours_offset = Column(Float, default=0.0, nullable=False)

    # Control de Horarios Operativos (Sprint 1 - v0.5.0)
    work_schedule_enabled = Column(Boolean, default=False, nullable=False)
    work_schedule_start = Column(String(10), default="07:00", nullable=True) # ej. "07:00"
    work_schedule_end = Column(String(10), default="19:00", nullable=True)   # ej. "19:00"
    allowed_weekdays = Column(String(30), default="0,1,2,3,4", nullable=True) # 0=Lun, 4=Vie

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class TelemetryEvent(Base):
    __tablename__ = "telemetry_events"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    ignition_state = Column(Boolean, nullable=False)
    
    # Nuevos campos de telemetría completa
    speed = Column(Float, nullable=True)
    altitude = Column(Float, nullable=True)
    course = Column(Float, nullable=True)
    raw_data = Column(JSON, nullable=True) # Almacena todo el JSON devuelto por Traccar

    # Campos decodificados Teltonika FMC150 (Etapa 1)
    external_power = Column(Float, nullable=True)
    internal_battery = Column(Float, nullable=True)
    sleep_mode = Column(Integer, nullable=True)
    gnss_status = Column(Integer, nullable=True)
    network_operator = Column(String, nullable=True)

class DeviceState(Base):
    __tablename__ = "device_states"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, unique=True, index=True, nullable=False)
    engine_hours = Column(Float, default=0.0, nullable=False)
    last_ignition_state = Column(Boolean, nullable=True)
    last_ignition_on_time = Column(DateTime(timezone=True), nullable=True)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Nuevos campos consolidados
    last_latitude = Column(Float, nullable=True)
    last_longitude = Column(Float, nullable=True)
    last_speed = Column(Float, nullable=True)
    last_raw_data = Column(JSON, nullable=True)

    # Campos consolidados Teltonika FMC150 (Etapa 1)
    external_power = Column(Float, nullable=True)
    internal_battery = Column(Float, nullable=True)
    sleep_mode = Column(Integer, nullable=True)
    gnss_status = Column(Integer, nullable=True)
    network_operator = Column(String, nullable=True)

    # Métricas operativas de negocio y calibración (Etapa 2)
    operating_status = Column(String, default="DISCONNECTED", nullable=False)
    calibrated_odometer_km = Column(Float, default=0.0, nullable=False)
    total_idling_hours = Column(Float, default=0.0, nullable=False)
    last_idling_start = Column(DateTime(timezone=True), nullable=True)

class VehicleAlert(Base):
    __tablename__ = "vehicle_alerts"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, ForeignKey("devices.device_id", ondelete="CASCADE"), nullable=False, index=True)
    alert_type = Column(String, nullable=False) # LOW_BATTERY, CRITICAL_BATTERY, POWER_CUT, OVERSPEED, TOWING, ALTERNATOR_FAIL
    severity = Column(String, default="WARNING", nullable=False) # INFO, WARNING, CRITICAL
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    message = Column(String, nullable=False)
    value = Column(Float, nullable=True)
    resolved = Column(Boolean, default=False, nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by = Column(String, nullable=True)

class MaintenancePlan(Base):
    __tablename__ = "maintenance_plans"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, ForeignKey("devices.device_id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    service_type = Column(String, default="KM", nullable=False) # "KM", "HOURS", "DATE"
    interval_value = Column(Float, nullable=False) # ej. 10000 km o 250 hs
    last_service_value = Column(Float, default=0.0, nullable=False)
    next_service_value = Column(Float, nullable=False)
    due_date = Column(DateTime(timezone=True), nullable=True)
    notes = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    logs = relationship("MaintenanceLog", back_populates="plan", cascade="all, delete-orphan")

class MaintenanceLog(Base):
    __tablename__ = "maintenance_logs"
    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("maintenance_plans.id", ondelete="CASCADE"), nullable=True)
    device_id = Column(String, ForeignKey("devices.device_id", ondelete="CASCADE"), nullable=False, index=True)
    executed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    executed_value = Column(Float, nullable=False) # Odómetro o horas al realizarlo
    workshop = Column(String, nullable=True) # Taller / Mecánico
    cost = Column(Float, default=0.0, nullable=True)
    notes = Column(String, nullable=True)

    plan = relationship("MaintenancePlan", back_populates="logs")

class VehicleTrip(Base):
    __tablename__ = "vehicle_trips"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, ForeignKey("devices.device_id", ondelete="CASCADE"), nullable=False, index=True)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, default=0, nullable=False)
    distance_km = Column(Float, default=0.0, nullable=False)
    max_speed_kmh = Column(Float, default=0.0, nullable=False)
    avg_speed_kmh = Column(Float, default=0.0, nullable=False)
    idling_seconds = Column(Integer, default=0, nullable=False)
    start_latitude = Column(Float, nullable=True)
    start_longitude = Column(Float, nullable=True)
    end_latitude = Column(Float, nullable=True)
    end_longitude = Column(Float, nullable=True)
    is_closed = Column(Boolean, default=False, nullable=False, index=True)

class Geofence(Base):
    __tablename__ = "geofences"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    type = Column(String(20), default="POLYGON", nullable=False) # POLYGON, CIRCLE
    center_lat = Column(Float, nullable=True)
    center_lon = Column(Float, nullable=True)
    radius_meters = Column(Float, nullable=True)
    polygon_vertices = Column(JSON, nullable=True) # [[lat, lon], [lat, lon], ...]
    color = Column(String(20), default="#06b6d4", nullable=False) # Hex para UI
    speed_limit_kmh = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    events = relationship("GeofenceEvent", back_populates="geofence", cascade="all, delete-orphan")

class GeofenceEvent(Base):
    __tablename__ = "geofence_events"
    id = Column(Integer, primary_key=True, index=True)
    geofence_id = Column(Integer, ForeignKey("geofences.id", ondelete="CASCADE"), nullable=False, index=True)
    device_id = Column(String, ForeignKey("devices.device_id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(20), nullable=False) # ENTER, EXIT, OVERSPEED
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    speed_kmh = Column(Float, default=0.0, nullable=False)
    duration_inside_seconds = Column(Integer, nullable=True) # Calculado al registrar EXIT

    geofence = relationship("Geofence", back_populates="events")

