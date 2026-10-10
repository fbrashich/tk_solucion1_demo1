from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, ForeignKey
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
    device_id = Column(String, unique=True, index=True, nullable=False) # Alias/Código (ej. MESA_01)
    name = Column(String, nullable=False) # Nombre de la máquina
    type = Column(String, default="Mesa Vibratoria", nullable=False)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

    # Asociación con cuenta de operador
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    owner = relationship("User", back_populates="devices")

    # Campos de integración con Traccar
    traccar_unique_id = Column(String, nullable=True, index=True) # IMEI / Unique ID en Traccar
    traccar_model = Column(String, nullable=True) # Modelo GPS (ej. Teltonika FMB920, ESP32)
    sim_phone = Column(String, nullable=True) # Número SIM
    category = Column(String, default="machinery", nullable=True) # Categoría Traccar

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class TelemetryEvent(Base):
    __tablename__ = "telemetry_events"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    ignition_state = Column(Boolean, nullable=False)

class DeviceState(Base):
    __tablename__ = "device_states"
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, unique=True, index=True, nullable=False)
    engine_hours = Column(Float, default=0.0, nullable=False)
    last_ignition_state = Column(Boolean, nullable=True)
    last_ignition_on_time = Column(DateTime(timezone=True), nullable=True)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
