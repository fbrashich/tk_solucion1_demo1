import re
from typing import Any, Dict, Optional, Tuple

# Mapeo de Códigos de Red Celular (MCC + MNC)
# MCC 722 = Argentina
OPERATOR_MAP = {
    "722310": "Claro AR",
    "722320": "Movistar AR",
    "722330": "Movistar AR",
    "722341": "Personal AR",
    "722010": "Movistar AR",
    "722070": "Movistar AR",
    "722340": "Personal AR",
    "722350": "PORT-HABLE AR",
}

# Modos de reposo / ahorro energético de Teltonika (io200)
SLEEP_MODE_MAP = {
    0: "Normal",
    1: "GPS Sleep",
    2: "Deep Sleep",
    3: "Online Deep Sleep",
    4: "Ultra Deep Sleep",
}

# Estado del módulo GNSS de Teltonika (io69)
GNSS_STATUS_MAP = {
    0: "GNSS Apagado",
    1: "GNSS Activo (Sin Fix)",
    2: "GNSS Fix 2D/3D",
    3: "GNSS Sleep (Modo Ahorro)",
}

def safe_coalesce(*values: Any) -> Any:
    """
    Retorna el primer valor que NO sea None.
    A diferencia de 'a or b', preserva valores falsy válidos como 0, 0.0, False y "".
    """
    for v in values:
        if v is not None:
            return v
    return None

def sanitize_string_spaces(text: Optional[str]) -> Optional[str]:
    """
    Limpia espacios múltiples continuos y recorta extremos (ej. 'Van  Operarios' -> 'Van Operarios').
    """
    if not text:
        return text
    return re.sub(r'\s+', ' ', str(text)).strip()

def decode_operator(operator_code: Any) -> Tuple[Optional[str], Optional[str]]:
    """
    Decodifica el código de operador numérico hacia su nombre comercial y formato estándar.
    Ej: 722310 -> ("Claro AR", "722310")
    """
    if operator_code is None:
        return None, None
    op_str = str(operator_code).strip()
    if not op_str:
        return None, None
    
    op_name = OPERATOR_MAP.get(op_str)
    if not op_name:
        if op_str.startswith("722"):
            op_name = f"Operador AR ({op_str})"
        else:
            op_name = f"Operador ({op_str})"
    return op_name, op_str

def decode_sleep_mode(sleep_val: Any) -> Tuple[Optional[int], Optional[str]]:
    """
    Decodifica el código io200 de Teltonika.
    Ej: 3 -> (3, "Online Deep Sleep")
    """
    if sleep_val is None:
        return None, None
    try:
        val_int = int(sleep_val)
        desc = SLEEP_MODE_MAP.get(val_int, f"Modo Sleep {val_int}")
        return val_int, desc
    except (ValueError, TypeError):
        return None, None

def decode_gnss_status(gnss_val: Any) -> Tuple[Optional[int], Optional[str]]:
    """
    Decodifica el código io69 de Teltonika (Estado del receptor GNSS).
    Ej: 3 -> (3, "GNSS Sleep (Modo Ahorro)")
    """
    if gnss_val is None:
        return None, None
    try:
        val_int = int(gnss_val)
        desc = GNSS_STATUS_MAP.get(val_int, f"GNSS Estado {val_int}")
        return val_int, desc
    except (ValueError, TypeError):
        return None, None

def decode_fmc150_telemetry(attrs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Interpreta y normaliza de forma exhaustiva los parámetros AVL del Teltonika FMC150
    evitando bugs de coalescencia falsy y decodificando valores avanzados.
    """
    if not isinstance(attrs, dict):
        attrs = {}

    # 1. Batería principal del vehículo (Power / io66 / ext_voltage)
    power_raw = safe_coalesce(attrs.get("power"), attrs.get("ext_voltage"), attrs.get("io66"))
    power_val: Optional[float] = None
    if power_raw is not None:
        try:
            p_float = float(power_raw)
            # io66 en Teltonika suele venir en mV si supera 50
            power_val = round(p_float / 1000.0, 2) if p_float > 50 else round(p_float, 2)
        except (ValueError, TypeError):
            power_val = None

    # 2. Batería interna de respaldo del tracker (Battery / io67 / batteryLevel)
    bat_raw = safe_coalesce(attrs.get("batteryLevel"), attrs.get("battery"), attrs.get("io67"))
    battery_val: Optional[float] = None
    if bat_raw is not None:
        try:
            b_float = float(bat_raw)
            # io67 en Teltonika suele venir en mV si supera 50
            battery_val = round(b_float / 1000.0, 2) if b_float > 50 else round(b_float, 2)
        except (ValueError, TypeError):
            battery_val = None

    # 3. Corriente de batería interna (io68 en mA)
    io68_raw = attrs.get("io68")
    battery_current_ma: Optional[int] = None
    if io68_raw is not None:
        try:
            battery_current_ma = int(io68_raw)
        except (ValueError, TypeError):
            battery_current_ma = None

    # 4. Modos de suspensión y GNSS
    sleep_mode, sleep_mode_desc = decode_sleep_mode(safe_coalesce(attrs.get("io200"), attrs.get("sleep")))
    gnss_status, gnss_status_desc = decode_gnss_status(safe_coalesce(attrs.get("io69"), attrs.get("gnssStatus")))

    # 5. Operador Celular
    operator_code_raw = safe_coalesce(attrs.get("operator"), attrs.get("network_operator"), attrs.get("mcc_mnc"))
    operator_name, operator_code = decode_operator(operator_code_raw)

    # 6. Señal y Satélites (con estricto respeto a 0 como valor válido)
    sat_val = safe_coalesce(attrs.get("sat"), attrs.get("io21"))
    sat_int: Optional[int] = None
    if sat_val is not None:
        try:
            sat_int = int(sat_val)
        except (ValueError, TypeError):
            sat_int = None

    rssi_val = safe_coalesce(attrs.get("rssi"), attrs.get("io22"))
    rssi_int: Optional[int] = None
    if rssi_val is not None:
        try:
            rssi_int = int(rssi_val)
        except (ValueError, TypeError):
            rssi_int = None

    # 7. Odómetro y Horómetro
    total_distance_m = safe_coalesce(attrs.get("totalDistance"), attrs.get("distance"), attrs.get("io16"))
    if total_distance_m is not None:
        try:
            total_distance_m = float(total_distance_m)
        except (ValueError, TypeError):
            total_distance_m = None

    reported_odometer_m = attrs.get("odometer")
    if reported_odometer_m is not None:
        try:
            reported_odometer_m = float(reported_odometer_m)
        except (ValueError, TypeError):
            reported_odometer_m = None

    reported_hours = safe_coalesce(attrs.get("hours"), attrs.get("io243"))
    if reported_hours is not None:
        try:
            reported_hours = float(reported_hours)
        except (ValueError, TypeError):
            reported_hours = None

    return {
        "external_power": power_val,
        "internal_battery": battery_val,
        "battery_current_ma": battery_current_ma,
        "sleep_mode": sleep_mode,
        "sleep_mode_desc": sleep_mode_desc,
        "gnss_status": gnss_status,
        "gnss_status_desc": gnss_status_desc,
        "network_operator_code": operator_code,
        "network_operator_name": operator_name,
        "satellites": sat_int,
        "rssi": rssi_int,
        "total_distance_m": total_distance_m,
        "reported_odometer_m": reported_odometer_m,
        "reported_hours": reported_hours,
    }
