import React, { useEffect, useState } from 'react';
import { 
  getDeviceStatus, 
  getDeviceLogs, 
  getAllDevicesStatus, 
  getDevices,
  exportDeviceLogs 
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { 
  Power, Clock, LogOut, Radio, RefreshCw, 
  MapPin, Gauge, ShieldCheck, CheckCircle2, 
  AlertTriangle, WifiOff, Compass, Navigation, 
  Layers, User, ChevronRight, Activity, Download,
  Shield, ChevronDown, Cpu, FileSpreadsheet, Eye
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import AdminPanelModal from '../components/AdminPanelModal';

// Formateador humano ("Hace 15 seg", "Hace 3 min")
function formatTimeAgo(isoString) {
  if (!isoString) return 'Sin reportes';
  const eventDate = new Date(isoString);
  const diffSec = Math.floor((new Date() - eventDate) / 1000);
  if (diffSec < 0) return 'Ahora mismo';
  if (diffSec < 60) return `Hace ${diffSec} seg`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  return `Hace ${diffHours} h`;
}

// Re-centrado reactivo del mapa al pulsar un evento o botón
function RecenterMap({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] != null && center[1] != null) {
      map.setView(center, zoom || map.getZoom(), { animate: true });
    }
  }, [center, zoom, map]);
  return null;
}

// Icono baliza radar en el mapa según el estado operativo
const createStatusMarkerIcon = (statusStr, isSelected = false) => {
  let color = '#f43f5e';
  let glow = 'rgba(244, 63, 94, 0.4)';

  if (statusStr === 'OPERANDO') {
    color = '#10b981';
    glow = 'rgba(16, 185, 129, 0.4)';
  } else if (statusStr === 'DETENIDA') {
    color = '#f59e0b';
    glow = 'rgba(245, 158, 11, 0.4)';
  }

  const borderStyle = isSelected ? '4px solid #38bdf8' : '3px solid #0b0f19';
  const size = isSelected ? 44 : 36;
  const dotSize = isSelected ? 22 : 18;

  return L.divIcon({
    className: 'custom-beacon-marker',
    html: `
      <div style="position: relative; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center;">
        <span style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: ${glow}; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
        <span style="position: relative; width: ${dotSize}px; height: ${dotSize}px; border-radius: 50%; background: ${color}; border: ${borderStyle}; box-shadow: 0 0 14px ${color}; display: flex; align-items: center; justify-content: center;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff;"></span>
        </span>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
};

export default function Dashboard() {
  const { user, isAdmin, logout } = useAuth();
  
  // Selector de dispositivo: 'all' o ID específico (ej. 'MESA_01')
  const [selectedDeviceId, setSelectedDeviceId] = useState('all');
  const [deviceList, setDeviceList] = useState([]);
  const [fleetSummary, setFleetSummary] = useState(null);

  // Datos del dispositivo seleccionado
  const [singleStatus, setSingleStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [mapStyle, setMapStyle] = useState('dark'); // 'dark' | 'satellite' | 'standard'
  const [filterIgnition, setFilterIgnition] = useState('all'); // 'all' | 'on' | 'off'
  const [selectedMapCenter, setSelectedMapCenter] = useState(null);
  const [activeMobileTab, setActiveMobileTab] = useState('overview'); // 'overview' | 'logs'
  const [showAdminModal, setShowAdminModal] = useState(false);

  // Carga de inventario de dispositivos y estado global
  const fetchAllData = async (manual = false) => {
    if (manual) setIsRefreshing(true);
    try {
      // 1. Obtener lista de dispositivos registrados y estado de toda la flota
      const [devs, fleet] = await Promise.all([
        getDevices(),
        getAllDevicesStatus()
      ]);
      setDeviceList(devs);
      setFleetSummary(fleet);

      // 2. Si hay un dispositivo individual seleccionado
      if (selectedDeviceId !== 'all') {
        const [statusData, logsData] = await Promise.all([
          getDeviceStatus(selectedDeviceId),
          getDeviceLogs(selectedDeviceId, 50)
        ]);
        setSingleStatus(statusData);
        setLogs(logsData);
        if (statusData?.last_lat && statusData?.last_lon && !selectedMapCenter) {
          setSelectedMapCenter([statusData.last_lat, statusData.last_lon]);
        }
      } else {
        // En vista de flota, obtenemos los logs recientes de todos
        const fleetLogs = await getDeviceLogs('all', 50);
        setLogs(fleetLogs);
        
        // Centrar en el primer dispositivo con coordenadas si no hay centro fijado
        if (!selectedMapCenter && fleet?.devices?.length > 0) {
          const firstWithGps = fleet.devices.find(d => d.last_lat && d.last_lon);
          if (firstWithGps) {
            setSelectedMapCenter([firstWithGps.last_lat, firstWithGps.last_lon]);
          }
        }
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
    fetchAllData();
    const interval = setInterval(() => {
      fetchAllData();
    }, 15000);

    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 1 ? prev - 1 : 15));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, [selectedDeviceId]);

  const handleManualRefresh = () => {
    fetchAllData(true);
  };

  // Exportar datos a CSV
  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      await exportDeviceLogs(selectedDeviceId);
    } catch (err) {
      console.error("Error exportando CSV:", err);
      alert("No se pudo exportar la telemetría.");
    } finally {
      setIsExporting(false);
    }
  };

  // Dispositivo enfocado
  const isFleetView = selectedDeviceId === 'all';
  const currentDeviceObj = deviceList.find(d => d.device_id === selectedDeviceId);

  // Estado canónico derivado
  const currentStatus = isFleetView 
    ? (fleetSummary?.operating_count > 0 ? 'OPERANDO' : 'DETENIDA') 
    : (singleStatus?.status || 'SIN COMUNICACIÓN');

  const isOperating = currentStatus === 'OPERANDO';
  const isDetained = currentStatus === 'DETENIDA';
  const isLostComm = currentStatus === 'SIN COMUNICACIÓN';

  // Cálculos de horas de motor
  const totalHours = isFleetView 
    ? (fleetSummary?.total_engine_hours || 0)
    : (singleStatus?.engine_hours || 0);
  const hoursInt = Math.floor(totalHours);
  const minutesInt = Math.round((totalHours - hoursInt) * 60);

  // Trayectoria GPS para dispositivo individual
  const trajectoryPoints = (!isFleetView ? logs : [])
    .filter(log => log.latitude && log.longitude)
    .map(log => [log.latitude, log.longitude]);

  // Filtrado de eventos en tabla
  const filteredLogs = logs.filter(log => {
    if (filterIgnition === 'on') return log.ignition_state === true;
    if (filterIgnition === 'off') return log.ignition_state === false;
    return true;
  });

  const centerOnEvent = (lat, lon) => {
    setSelectedMapCenter([lat, lon]);
    setActiveMobileTab('overview');
  };

  const handleSelectDeviceFromMarker = (devId, lat, lon) => {
    setSelectedDeviceId(devId);
    if (lat && lon) setSelectedMapCenter([lat, lon]);
  };

  if (loading && !fleetSummary && !singleStatus) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 p-4">
        <div className="w-14 h-14 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-4" />
        <h2 className="text-base font-bold text-white tracking-wide">Conectando con la Flota de Telemetría...</h2>
        <p className="text-xs text-slate-400 mt-1">Cargando dispositivos para Aldo</p>
      </div>
    );
  }

  // Coordenadas iniciales para el mapa
  const defaultPos = [-31.53, -68.52];
  const mapCenterPos = selectedMapCenter || (
    !isFleetView && singleStatus?.last_lat && singleStatus?.last_lon 
      ? [singleStatus.last_lat, singleStatus.last_lon] 
      : defaultPos
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* 1. Header Industrial Móvil con Selector y Super Admin */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* Lado Izquierdo: Identificación y DESPLEGABLE DE DISPOSITIVOS */}
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-lg ${
              isOperating 
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' 
                : isDetained 
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' 
                  : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
            }`}>
              <Radio className={`w-5 h-5 ${isOperating ? 'animate-pulse' : ''}`} />
            </div>

            {/* Selector Desplegable de Equipos */}
            <div className="flex flex-col">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <span>Equipo Seleccionado</span>
                <span className="text-cyan-400">• {deviceList.length} en flota</span>
              </label>

              <div className="relative mt-0.5">
                <select
                  value={selectedDeviceId}
                  onChange={(e) => {
                    setSelectedDeviceId(e.target.value);
                    setSelectedMapCenter(null);
                  }}
                  className="appearance-none bg-slate-950 border border-slate-700/80 hover:border-cyan-500/60 rounded-xl px-3 py-1.5 pr-8 text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer shadow-inner min-w-[220px]"
                >
                  <option value="all">🌐 Toda la Flota (Todos los Equipos)</option>
                  {deviceList.map((d) => (
                    <option key={d.device_id} value={d.device_id}>
                      {d.device_id} • {d.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Lado Derecho: Acciones, Export CSV, Super Admin, Refresco y Logout */}
          <div className="flex items-center flex-wrap gap-2 shrink-0 justify-between sm:justify-end">
            
            {/* Botón de Exportar Datos CSV */}
            <button
              onClick={handleExportCSV}
              disabled={isExporting}
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-xs font-bold text-cyan-300 transition-all cursor-pointer disabled:opacity-50"
              title="Descargar histórico en formato CSV"
            >
              <Download className={`w-3.5 h-3.5 ${isExporting ? 'animate-bounce' : ''}`} />
              <span className="hidden sm:inline">Exportar CSV</span>
            </button>

            {/* Botón Super Admin (Solo para Administradores) */}
            {isAdmin && (
              <button
                onClick={() => setShowAdminModal(true)}
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 active:scale-95 border border-purple-500/30 text-purple-300 text-xs font-bold transition-all cursor-pointer shadow-lg shadow-purple-950/20"
                title="Administrar usuarios y dispositivos"
              >
                <Shield className="w-3.5 h-3.5 text-purple-400" />
                <span>Super Admin</span>
              </button>
            )}

            {/* Botón Refresco Manual */}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-xs font-bold text-slate-200 transition-all cursor-pointer disabled:opacity-50"
              title="Refrescar estado ahora"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">Sync ({countdown}s)</span>
            </button>

            {/* Usuario / Salir */}
            <div className="flex items-center gap-1.5 pl-1 border-l border-slate-800">
              <span className="text-xs text-slate-400 font-medium hidden lg:inline px-1">
                {user?.username || 'aldo'}
              </span>
              <button
                onClick={logout}
                className="flex items-center justify-center h-9 w-9 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 border border-rose-500/20 text-rose-300 transition-all cursor-pointer"
                title="Cerrar Sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>

        </div>

        {/* Selector de pestañas para vista móvil */}
        <div className="flex sm:hidden mt-2 pt-2 border-t border-slate-800/80 gap-2">
          <button
            onClick={() => setActiveMobileTab('overview')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              activeMobileTab === 'overview'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white'
            }`}
          >
            Estado & Mapa
          </button>
          <button
            onClick={() => setActiveMobileTab('logs')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${
              activeMobileTab === 'logs'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-slate-950 text-slate-400 hover:text-white'
            }`}
          >
            <span>Historial</span>
            <span className="text-[10px] px-1.5 rounded bg-slate-800 text-slate-300 font-mono">
              {logs.length}
            </span>
          </button>
        </div>
      </header>

      {/* 2. Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* Indicador de Modo de Visualización (Flota vs Equipo) */}
        {isFleetView && (
          <div className="bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-900 border border-cyan-500/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Visualización Multidispositivo Activa</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                    Todos en el Mapa
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Viendo los <strong>{fleetSummary?.total_devices || 0} dispositivos</strong> simultáneamente con balizas de radar individuales.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Acceso rápido:</span>
              <div className="flex items-center gap-1">
                {deviceList.slice(0, 3).map(d => (
                  <button
                    key={d.device_id}
                    onClick={() => setSelectedDeviceId(d.device_id)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 font-mono text-[11px] font-bold cursor-pointer transition-colors"
                  >
                    {d.device_id}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tarjetas de Métricas Clave */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: ESTADO PRINCIPAL */}
          <div className={`relative overflow-hidden rounded-2xl border p-5 shadow-xl transition-all ${
            isOperating 
              ? 'bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border-emerald-500/40 shadow-emerald-950/20' 
              : isDetained 
                ? 'bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900 border-amber-500/40 shadow-amber-950/20' 
                : 'bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-900 border-rose-500/40 shadow-rose-950/20'
          }`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                  {isFleetView ? 'Resumen de Flota' : 'Estado de Máquina'}
                </p>
                <div className="flex items-center gap-2">
                  <h2 className={`text-2xl font-black tracking-tight ${
                    isOperating ? 'text-emerald-400' : isDetained ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {isFleetView 
                      ? `${fleetSummary?.operating_count || 0} OPERANDO` 
                      : currentStatus}
                  </h2>
                </div>
                <p className="text-xs text-slate-300 mt-1 font-medium flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${
                    isOperating ? 'bg-emerald-400 animate-pulse' : isDetained ? 'bg-amber-400' : 'bg-rose-400'
                  }`} />
                  <span>
                    {isFleetView && `${fleetSummary?.detained_count || 0} detenidas, ${fleetSummary?.no_comm_count || 0} sin señal`}
                    {!isFleetView && isOperating && 'Motor encendido en trabajo'}
                    {!isFleetView && isDetained && 'Motor apagado en reposo'}
                    {!isFleetView && isLostComm && 'Sin señal (> 10 min)'}
                  </span>
                </p>
              </div>

              <div className={`p-3.5 rounded-2xl border shadow-inner ${
                isOperating 
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 radar-glow' 
                  : isDetained 
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 radar-glow-amber' 
                    : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
              }`}>
                {isOperating && <Power className="w-7 h-7" />}
                {isDetained && <Power className="w-7 h-7 opacity-70" />}
                {isLostComm && <WifiOff className="w-7 h-7" />}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                {isFleetView ? 'Dispositivos Activos:' : 'Contacto / Ignición:'}
              </span>
              <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                !isFleetView && singleStatus?.ignition 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}>
                {isFleetView 
                  ? `${fleetSummary?.total_devices || 0} Equipos` 
                  : (singleStatus?.ignition ? 'ON (Encendido)' : 'OFF (Apagado)')}
              </span>
            </div>
          </div>

          {/* Card 2: HORÓMETRO ACUMULADO */}
          <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                  {isFleetView ? 'Horómetro Total Flota' : 'Horómetro de Trabajo'}
                </p>
                <div className="flex items-baseline gap-1.5">
                  <h2 className="text-3xl font-black text-white font-mono tracking-tight">
                    {totalHours.toFixed(2)}
                  </h2>
                  <span className="text-sm font-bold text-cyan-400">hs</span>
                </div>
                <p className="text-xs text-slate-300 mt-1 font-medium">
                  Equivale a: <strong className="text-white">{hoursInt}h {minutesInt}m</strong>
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <Gauge className="w-7 h-7" />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>Cálculo:</span>
              <span className="text-cyan-400 font-medium">Delta Físico Robusto</span>
            </div>
          </div>

          {/* Card 3: ÚLTIMO REPORTE */}
          <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                  Última Conexión
                </p>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  {isFleetView 
                    ? 'Reporte Activo' 
                    : formatTimeAgo(singleStatus?.last_updated)}
                </h2>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  {!isFleetView && singleStatus?.last_updated 
                    ? new Date(singleStatus.last_updated).toLocaleTimeString() 
                    : 'Canal en tiempo real'}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
                <Clock className="w-7 h-7" />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>Red Nginx:</span>
              <span className="font-mono text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Puerto 3000 OK
              </span>
            </div>
          </div>

          {/* Card 4: UBICACIÓN Y GEO */}
          <div className="relative overflow-hidden rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                  {isFleetView ? 'Zona Operativa' : 'Ubicación GPS'}
                </p>
                <div className="text-sm font-bold text-slate-100 flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>San Juan, Argentina</span>
                </div>
                <p className="text-xs font-mono text-slate-400 mt-1">
                  {!isFleetView && singleStatus?.last_lat 
                    ? `${singleStatus.last_lat.toFixed(4)}, ${singleStatus.last_lon.toFixed(4)}` 
                    : `${fleetSummary?.devices?.length || 0} balizas activas`}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Navigation className="w-7 h-7" />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">Visualización:</span>
              <button
                onClick={() => {
                  if (!isFleetView && singleStatus?.last_lat) {
                    centerOnEvent(singleStatus.last_lat, singleStatus.last_lon);
                  } else if (fleetSummary?.devices?.[0]?.last_lat) {
                    centerOnEvent(fleetSummary.devices[0].last_lat, fleetSummary.devices[0].last_lon);
                  }
                }}
                className="text-cyan-400 hover:text-cyan-300 font-bold cursor-pointer"
              >
                Centrar en Mapa
              </button>
            </div>
          </div>

        </div>

        {/* Sección de Detalle: Mapa Interactivo Multidispositivo + Historial */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* MAPA INTERACTIVO (Multi-dispositivo en simultáneo) */}
          <div className={`lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col ${
            activeMobileTab === 'logs' ? 'hidden sm:flex' : 'flex'
          }`}>
            <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-900/90">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white tracking-wide">
                  {isFleetView ? 'Mapa de Toda la Flota' : `Ubicación: ${currentDeviceObj?.name || selectedDeviceId}`}
                </h3>
              </div>

              {/* Selector de Capas */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setMapStyle('dark')}
                    className={`px-3 py-1 rounded-lg transition-colors cursor-pointer font-medium ${
                      mapStyle === 'dark' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Oscuro
                  </button>
                  <button
                    onClick={() => setMapStyle('satellite')}
                    className={`px-3 py-1 rounded-lg transition-colors cursor-pointer font-medium ${
                      mapStyle === 'satellite' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Satélite
                  </button>
                  <button
                    onClick={() => setMapStyle('standard')}
                    className={`px-3 py-1 rounded-lg transition-colors cursor-pointer font-medium ${
                      mapStyle === 'standard' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Calles
                  </button>
                </div>
              </div>
            </div>

            {/* Canvas del Mapa con React Leaflet */}
            <div className="relative h-[380px] sm:h-[460px] w-full bg-slate-950">
              <MapContainer
                center={mapCenterPos}
                zoom={14}
                scrollWheelZoom={false}
                className="w-full h-full"
              >
                <RecenterMap center={selectedMapCenter} />

                {mapStyle === 'dark' && (
                  <TileLayer
                    key="dark-tiles"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    className="leaflet-dark-tiles"
                  />
                )}
                {mapStyle === 'satellite' && (
                  <TileLayer
                    key="satellite-tiles"
                    attribution='&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  />
                )}
                {mapStyle === 'standard' && (
                  <TileLayer
                    key="standard-tiles"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                )}

                {/* Trayectoria del dispositivo individual */}
                {trajectoryPoints.length > 1 && (
                  <Polyline
                    positions={trajectoryPoints}
                    color="#06b6d4"
                    weight={3}
                    opacity={0.8}
                    dashArray="4, 6"
                  />
                )}

                {/* RENDERIZADO DE TODOS LOS DISPOSITIVOS SIMULTÁNEAMENTE */}
                {isFleetView && fleetSummary?.devices?.map((dev) => {
                  if (!dev.last_lat || !dev.last_lon) return null;
                  return (
                    <Marker
                      key={dev.device_id}
                      position={[dev.last_lat, dev.last_lon]}
                      icon={createStatusMarkerIcon(dev.status, false)}
                    >
                      <Popup>
                        <div className="text-slate-100 text-xs space-y-1.5 p-1 min-w-[170px]">
                          <div className="flex items-center justify-between border-b border-slate-700 pb-1">
                            <strong className="text-cyan-400 text-sm font-mono">{dev.device_id}</strong>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              dev.status === 'OPERANDO' ? 'bg-emerald-500/20 text-emerald-400' : 
                              dev.status === 'DETENIDA' ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                            }`}>
                              {dev.status}
                            </span>
                          </div>
                          <p className="font-semibold text-white">{dev.name || 'Dispositivo'}</p>
                          <p className="text-slate-300">Horómetro: <strong>{dev.engine_hours} hs</strong></p>
                          <p className="font-mono text-[10px] text-slate-400">{dev.last_lat.toFixed(5)}, {dev.last_lon.toFixed(5)}</p>
                          <button
                            onClick={() => handleSelectDeviceFromMarker(dev.device_id, dev.last_lat, dev.last_lon)}
                            className="w-full mt-2 py-1 px-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] transition-colors cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Ver este equipo</span>
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}

                {/* Dispositivo único si no es vista de flota */}
                {!isFleetView && singleStatus?.last_lat && singleStatus?.last_lon && (
                  <Marker
                    position={[singleStatus.last_lat, singleStatus.last_lon]}
                    icon={createStatusMarkerIcon(currentStatus, true)}
                  >
                    <Popup>
                      <div className="text-slate-100 text-xs space-y-1.5 p-1 min-w-[170px]">
                        <div className="flex items-center justify-between border-b border-slate-700 pb-1">
                          <strong className="text-cyan-400 text-sm font-mono">{singleStatus.device_id}</strong>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isOperating ? 'bg-emerald-500/20 text-emerald-400' : isDetained ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {currentStatus}
                          </span>
                        </div>
                        <p className="font-semibold text-white">{singleStatus.name}</p>
                        <p className="text-slate-300">Horómetro: <strong>{totalHours.toFixed(2)} hs</strong></p>
                        <p className="font-mono text-[10px] text-slate-400">{singleStatus.last_lat.toFixed(5)}, {singleStatus.last_lon.toFixed(5)}</p>
                      </div>
                    </Popup>
                  </Marker>
                )}

              </MapContainer>

              {/* Overlay informativo sobre el mapa */}
              <div className="absolute bottom-3 left-3 z-[400] pointer-events-none bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-xl px-3 py-1.5 shadow-lg text-xs text-slate-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>
                  {isFleetView 
                    ? `Flota activa: ${fleetSummary?.devices?.length || 0} balizas` 
                    : `Trayectoria: ${trajectoryPoints.length} puntos`}
                </span>
              </div>
            </div>
          </div>

          {/* HISTORIAL DE REGISTROS CON EXPORT */}
          <div className={`lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col h-[480px] sm:h-[520px] ${
            activeMobileTab === 'overview' ? 'hidden sm:flex' : 'flex'
          }`}>
            
            {/* Header del Historial */}
            <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white tracking-wide">
                  {isFleetView ? 'Eventos de Flota' : `Eventos: ${selectedDeviceId}`}
                </h3>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                  {filteredLogs.length}
                </span>
              </div>

              {/* Filtro Táctil */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setFilterIgnition('all')}
                  className={`text-xs font-bold px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                    filterIgnition === 'all' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setFilterIgnition('on')}
                  className={`text-xs font-bold px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                    filterIgnition === 'on' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ON
                </button>
                <button
                  onClick={() => setFilterIgnition('off')}
                  className={`text-xs font-bold px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                    filterIgnition === 'off' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  OFF
                </button>
              </div>
            </div>

            {/* Lista Táctil de Eventos */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80">
              {filteredLogs.map((log, index) => {
                const isOn = log.ignition_state;
                const d = new Date(log.timestamp);
                const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                return (
                  <div 
                    key={log.id || index}
                    className="p-3.5 hover:bg-slate-800/50 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        isOn 
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}>
                        <Power className="w-4 h-4" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-200">
                            {timeStr}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-cyan-400">
                            {log.device_id}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isOn 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}>
                            {isOn ? 'ON' : 'OFF'}
                          </span>
                        </div>
                        <p className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">
                          Lat {log.latitude?.toFixed(4)}, Lon {log.longitude?.toFixed(4)}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => centerOnEvent(log.latitude, log.longitude)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 text-xs font-bold border border-slate-700 shrink-0 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                      title="Centrar en el mapa"
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Ubicar</span>
                    </button>
                  </div>
                );
              })}

              {filteredLogs.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-500">
                  No hay eventos registrados en este momento.
                </div>
              )}
            </div>

            {/* Footer de la lista con botón de exportación */}
            <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
              <span>{filteredLogs.length} eventos mostrados</span>
              <button
                onClick={handleExportCSV}
                disabled={isExporting}
                className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar</span>
              </button>
            </div>

          </div>

        </div>

      </main>

      {/* 3. Footer */}
      <footer className="mt-auto border-t border-slate-800/80 bg-slate-900/40 py-3 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Sistema Telemetría Industrial • Plataforma Multidispositivo</span>
          </div>
          <span className="font-mono text-[11px] text-slate-600">
            {deviceList.length} Equipos registrados • Tráfico Unificado Puerto 3000
          </span>
        </div>
      </footer>

      {/* Modal de Super Admin para Gestión de Usuarios y Dispositivos */}
      <AdminPanelModal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        onDeviceChange={() => fetchAllData(true)}
      />

    </div>
  );
}
