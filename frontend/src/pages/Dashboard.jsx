import React, { useEffect, useState, useRef } from 'react';
import { getDeviceStatus, getDeviceLogs } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { 
  Power, Activity, Clock, LogOut, Radio, RefreshCw, 
  MapPin, Gauge, ShieldCheck, CheckCircle2, XCircle, 
  Search, Filter, ExternalLink, Calendar, Compass, 
  Cpu, Wifi, Navigation, Layers
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const DEVICE_ID = 'MESA_01'; // ID de dispositivo para demo

// Componente para re-centrar el mapa reactivamente
function RecenterMap({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] != null && center[1] != null) {
      map.setView(center, zoom || map.getZoom(), { animate: true });
    }
  }, [center, zoom, map]);
  return null;
}

// Icono personalizado tipo baliza de radar para el dispositivo
const createRadarIcon = (isIgnitionOn) => {
  const color = isIgnitionOn ? '#10b981' : '#f43f5e';
  const glow = isIgnitionOn ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)';
  
  return L.divIcon({
    className: 'custom-beacon-marker',
    html: `
      <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
        <span style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: ${glow}; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
        <span style="position: relative; width: 18px; height: 18px; border-radius: 50%; background: ${color}; border: 3px solid #0f172a; box-shadow: 0 0 12px ${color}; display: flex; align-items: center; justify-content: center;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff;"></span>
        </span>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
};

export default function Dashboard() {
  const { logout } = useAuth();
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [mapStyle, setMapStyle] = useState('dark'); // 'dark' | 'standard'
  const [filterIgnition, setFilterIgnition] = useState('all'); // 'all' | 'on' | 'off'
  const [selectedMapCenter, setSelectedMapCenter] = useState(null);

  const fetchData = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    try {
      const [statusData, logsData] = await Promise.all([
        getDeviceStatus(DEVICE_ID),
        getDeviceLogs(DEVICE_ID)
      ]);
      setStatus(statusData);
      setLogs(logsData);
      if (statusData?.last_lat && statusData?.last_lon && !selectedMapCenter) {
        setSelectedMapCenter([statusData.last_lat, statusData.last_lon]);
      }
    } catch (err) {
      console.error("Error al obtener telemetría:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
      setCountdown(15);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, 15000);

    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : 15));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, []);

  const handleManualRefresh = () => {
    fetchData(true);
  };

  // Determinar estado de ignición del último log disponible
  const isPoweredOn = logs.length > 0 ? Boolean(logs[0].ignition_state) : false;
  const isConnected = status?.status === 'conectado';

  // Cálculos de horas y minutos
  const totalHours = status?.engine_hours || 0;
  const hoursInt = Math.floor(totalHours);
  const minutesInt = Math.round((totalHours - hoursInt) * 60);

  // Coordenadas para la trayectoria (polilínea)
  const trajectoryPoints = logs
    .filter(log => log.latitude && log.longitude)
    .map(log => [log.latitude, log.longitude]);

  // Filtrado de logs para la tabla
  const filteredLogs = logs.filter(log => {
    if (filterIgnition === 'on') return log.ignition_state === true;
    if (filterIgnition === 'off') return log.ignition_state === false;
    return true;
  });

  const centerOnEvent = (lat, lon) => {
    setSelectedMapCenter([lat, lon]);
  };

  if (loading && !status) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <div className="w-12 h-12 border-3 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wider uppercase text-slate-400">
          Cargando telemetría de {DEVICE_ID}...
        </p>
      </div>
    );
  }

  const currentMapPos = selectedMapCenter || (status?.last_lat && status?.last_lon ? [status.last_lat, status.last_lon] : [-31.53, -68.52]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Barra de Navegación Superior */}
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center shadow-lg shadow-cyan-950/30">
            <Radio className="w-5 h-5 text-cyan-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight">Mesa Vibratoria</h1>
              <span className="text-xs px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                {DEVICE_ID}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">Telemetría IoT en Tiempo Real</p>
          </div>
        </div>

        {/* Acciones y Estado en Cabecera */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Contador de Polling */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <span>Sync en <strong className="text-slate-200 font-mono">{countdown}s</strong></span>
          </div>

          {/* Botón Refresco Manual */}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 text-xs font-medium text-slate-300 hover:text-white transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            title="Actualizar datos ahora"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>

          {/* Perfil & Salir */}
          <div className="h-6 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 hidden sm:block font-medium">admin</span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-medium transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        
        {/* 1. Tarjetas de Métricas Clave */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Estado del Motor (Ignición) */}
          <div className="relative overflow-hidden rounded-2xl bg-slate-900/70 border border-slate-800/90 p-5 shadow-lg shadow-black/40 backdrop-blur-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Estado del Motor
                </p>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-extrabold tracking-tight text-white">
                    {isConnected && isPoweredOn ? (
                      <span className="text-emerald-400">OPERATIVO</span>
                    ) : (
                      <span className="text-rose-400">APAGADO</span>
                    )}
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 font-medium">
                  {isConnected ? (
                    <span className="text-emerald-400/90 font-mono">● Conexión activa</span>
                  ) : (
                    <span className="text-slate-500 font-mono">○ Sin conexión reciente</span>
                  )}
                </p>
              </div>

              <div className={`p-3 rounded-xl border ${
                isConnected && isPoweredOn 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 radar-glow' 
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}>
                <Power className="w-6 h-6" />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400">
              <span>Ignición:</span>
              <span className={`font-semibold px-2 py-0.5 rounded ${
                isPoweredOn ? 'bg-emerald-500/10 text-emerald-400 font-mono' : 'bg-slate-800 text-slate-400 font-mono'
              }`}>
                {isPoweredOn ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>

          {/* Card 2: Horas de Motor */}
          <div className="relative overflow-hidden rounded-2xl bg-slate-900/70 border border-slate-800/90 p-5 shadow-lg shadow-black/40 backdrop-blur-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Horas de Motor
                </p>
                <div className="flex items-baseline gap-1.5">
                  <h2 className="text-2xl font-black text-white font-mono tracking-tight">
                    {totalHours.toFixed(2)}
                  </h2>
                  <span className="text-xs font-semibold text-slate-400">hs</span>
                </div>
                <p className="text-xs text-slate-400 mt-1 font-medium">
                  Equivale a <strong className="text-slate-200">{hoursInt}h {minutesInt}m</strong>
                </p>
              </div>

              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <Gauge className="w-6 h-6" />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400">
              <span>Cálculo acumulativo:</span>
              <span className="text-cyan-400 font-mono">Activo</span>
            </div>
          </div>

          {/* Card 3: Dispositivo & Nodo */}
          <div className="relative overflow-hidden rounded-2xl bg-slate-900/70 border border-slate-800/90 p-5 shadow-lg shadow-black/40 backdrop-blur-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Nodo IoT ESP32
                </p>
                <h2 className="text-xl font-extrabold text-white font-mono tracking-tight">
                  {DEVICE_ID}
                </h2>
                <p className="text-xs text-slate-400 mt-1 truncate">
                  Último reporte: {status?.last_updated ? new Date(status.last_updated).toLocaleTimeString() : '-'}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
                <Cpu className="w-6 h-6" />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400">
              <span>Protocolo:</span>
              <span className="font-mono text-slate-300">HTTP REST Ingest</span>
            </div>
          </div>

          {/* Card 4: Ubicación GPS Actual */}
          <div className="relative overflow-hidden rounded-2xl bg-slate-900/70 border border-slate-800/90 p-5 shadow-lg shadow-black/40 backdrop-blur-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Ubicación Actual
                </p>
                <div className="font-mono text-sm font-semibold text-slate-200">
                  {status?.last_lat ? `${status.last_lat.toFixed(4)}, ${status.last_lon.toFixed(4)}` : 'Sin señal'}
                </div>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1 font-medium">
                  <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span>San Juan, Argentina</span>
                </p>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Navigation className="w-6 h-6" />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/70 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Coordenadas:</span>
              <button
                onClick={() => status?.last_lat && centerOnEvent(status.last_lat, status.last_lon)}
                className="text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
              >
                Centrar mapa
              </button>
            </div>
          </div>

        </div>

        {/* 2. Sección Principal: Mapa + Historial de Eventos */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Mapa Interactivo (7 Columnas en Desktop) */}
          <div className="lg:col-span-7 bg-slate-900/70 border border-slate-800/90 rounded-2xl shadow-xl overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white tracking-wide">Ubicación y Trayectoria GPS</h3>
              </div>

              {/* Controles de Mapa */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-950/80 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                  <button
                    onClick={() => setMapStyle('dark')}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      mapStyle === 'dark' ? 'bg-cyan-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Nocturno
                  </button>
                  <button
                    onClick={() => setMapStyle('satellite')}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      mapStyle === 'satellite' ? 'bg-cyan-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Satélite
                  </button>
                  <button
                    onClick={() => setMapStyle('standard')}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      mapStyle === 'standard' ? 'bg-cyan-600 text-white font-medium' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Estándar
                  </button>
                </div>
                <button
                  onClick={() => status?.last_lat && centerOnEvent(status.last_lat, status.last_lon)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition-colors cursor-pointer"
                >
                  Re-centrar
                </button>
              </div>
            </div>

            {/* Contenedor del Mapa */}
            <div className="relative h-[420px] w-full bg-slate-950">
              {status?.last_lat && status?.last_lon ? (
                <MapContainer
                  center={currentMapPos}
                  zoom={14}
                  scrollWheelZoom={false}
                  className="w-full h-full"
                >
                  <RecenterMap center={selectedMapCenter} />
                  
                  {/* Capas según el estilo seleccionado (100% libres de API Key) */}
                  {mapStyle === 'dark' && (
                    <TileLayer
                      key="dark-layer"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      className="leaflet-dark-tiles"
                    />
                  )}
                  {mapStyle === 'satellite' && (
                    <TileLayer
                      key="sat-layer"
                      attribution='&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP'
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    />
                  )}
                  {mapStyle === 'standard' && (
                    <TileLayer
                      key="std-layer"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                  )}

                  {/* Trayectoria reciente */}
                  {trajectoryPoints.length > 1 && (
                    <Polyline
                      positions={trajectoryPoints}
                      color="#06b6d4"
                      weight={3}
                      opacity={0.8}
                      dashArray="4, 6"
                    />
                  )}

                  {/* Marcador con efecto baliza en la última ubicación */}
                  <Marker
                    position={[status.last_lat, status.last_lon]}
                    icon={createRadarIcon(isPoweredOn)}
                  >
                    <Popup>
                      <div className="text-slate-100 text-xs space-y-1">
                        <p className="font-bold text-cyan-400">{DEVICE_ID}</p>
                        <p>Estado: <strong className={isPoweredOn ? 'text-emerald-400' : 'text-rose-400'}>{isPoweredOn ? 'OPERATIVO (ON)' : 'APAGADO (OFF)'}</strong></p>
                        <p className="font-mono text-[11px] text-slate-300">{status.last_lat.toFixed(5)}, {status.last_lon.toFixed(5)}</p>
                        <p className="text-[10px] text-slate-400">Horas Motor: {totalHours.toFixed(2)} hs</p>
                      </div>
                    </Popup>
                  </Marker>
                </MapContainer>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                  <MapPin className="w-8 h-8 text-slate-700" />
                  <p className="text-xs">Sin coordenadas GPS recibidas aún</p>
                </div>
              )}

              {/* Overlay informativo sobre el mapa */}
              <div className="absolute bottom-3 left-3 z-[400] pointer-events-none bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-lg px-3 py-1.5 shadow-lg text-[11px] text-slate-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>Trayectoria: <strong className="font-mono text-white">{trajectoryPoints.length}</strong> puntos</span>
              </div>
            </div>
          </div>

          {/* Tabla de Logs Históricos (5 Columnas en Desktop) */}
          <div className="lg:col-span-5 bg-slate-900/70 border border-slate-800/90 rounded-2xl shadow-xl overflow-hidden flex flex-col h-[480px]">
            {/* Cabecera y Filtros */}
            <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white tracking-wide">Registro de Eventos</h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                  {filteredLogs.length}
                </span>
              </div>

              {/* Filtro de estado */}
              <div className="flex items-center gap-1 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800">
                <button
                  onClick={() => setFilterIgnition('all')}
                  className={`text-[10px] font-medium px-2 py-1 rounded cursor-pointer transition-colors ${
                    filterIgnition === 'all' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFilterIgnition('on')}
                  className={`text-[10px] font-medium px-2 py-1 rounded cursor-pointer transition-colors ${
                    filterIgnition === 'on' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ON
                </button>
                <button
                  onClick={() => setFilterIgnition('off')}
                  className={`text-[10px] font-medium px-2 py-1 rounded cursor-pointer transition-colors ${
                    filterIgnition === 'off' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  OFF
                </button>
              </div>
            </div>

            {/* Lista / Tabla de Eventos */}
            <div className="flex-1 overflow-y-auto">
              <table className="min-w-full divide-y divide-slate-800 text-left">
                <thead className="bg-slate-950/60 sticky top-0 z-10 text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5">Hora</th>
                    <th className="px-4 py-2.5">Ignición</th>
                    <th className="px-4 py-2.5">Coordenadas</th>
                    <th className="px-4 py-2.5 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {filteredLogs.map((log, index) => {
                    const isRowOn = log.ignition_state;
                    const dateObj = new Date(log.timestamp);
                    const timeFormatted = dateObj.toLocaleTimeString();

                    return (
                      <tr 
                        key={log.id || index}
                        className="hover:bg-slate-800/40 transition-colors group"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-mono text-slate-200 text-xs">{timeFormatted}</div>
                          <div className="text-[10px] text-slate-500">{dateObj.toLocaleDateString()}</div>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide ${
                            isRowOn 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isRowOn ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                            {isRowOn ? 'ON' : 'OFF'}
                          </span>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-slate-300">
                          {log.latitude?.toFixed(4)}, {log.longitude?.toFixed(4)}
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <button
                            onClick={() => centerOnEvent(log.latitude, log.longitude)}
                            className="p-1.5 rounded-md hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-400 transition-colors cursor-pointer"
                            title="Ver en mapa"
                          >
                            <Compass className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-4 py-12 text-center text-xs text-slate-500">
                        No hay eventos registrados en este momento.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pie de Tabla */}
            <div className="px-4 py-2.5 bg-slate-950/80 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
              <span>Máximo 50 eventos en buffer</span>
              <span className="font-mono text-slate-500">Nodo: {DEVICE_ID}</span>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
}

