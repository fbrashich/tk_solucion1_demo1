import React, { useEffect, useState } from 'react';
import { 
  getDeviceStatus, 
  getDeviceLogs, 
  getAllDevicesStatus, 
  getDevices,
  exportDeviceLogs,
  createDevice,
  updateDevice,
  deleteDevice
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { 
  Power, Clock, LogOut, Radio, RefreshCw, 
  MapPin, Gauge, ShieldCheck, CheckCircle2, 
  AlertTriangle, WifiOff, Compass, Navigation, 
  Layers, User, ChevronRight, Activity, Download,
  ChevronDown, Cpu, FileSpreadsheet, Eye, Plus,
  Trash2, X, Smartphone, Satellite, Info, HardDrive,
  Battery, Signal, Code, Pencil, Settings
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

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
  const { user, logout } = useAuth();
  
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
  const [selectedRawData, setSelectedRawData] = useState(null);

  // Estado para gestión de dispositivos por el Operador (CRUD Completo)
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [showManageDevicesModal, setShowManageDevicesModal] = useState(false);
  const [showEditDeviceModal, setShowEditDeviceModal] = useState(false);
  const [isAddingDevice, setIsAddingDevice] = useState(false);
  const [isUpdatingDevice, setIsUpdatingDevice] = useState(false);

  const [newDeviceForm, setNewDeviceForm] = useState({
    device_id: '',
    name: '',
    type: 'Mesa Vibratoria',
    description: '',
    traccar_unique_id: '',
    traccar_model: 'Teltonika ATC700',
    sim_phone: '',
    category: 'machinery'
  });

  const [editDeviceForm, setEditDeviceForm] = useState({
    device_id: '',
    name: '',
    type: 'Mesa Vibratoria',
    description: '',
    traccar_unique_id: '',
    traccar_model: 'Teltonika ATC700',
    sim_phone: '',
    category: 'machinery',
    is_active: true
  });
  const [toastNotification, setToastNotification] = useState(null);

  const showToast = (message, type = 'success') => {
    setToastNotification({ message, type });
    setTimeout(() => setToastNotification(null), 4000);
  };

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
      showToast("No se pudo exportar la telemetría.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  // Alta de nuevo dispositivo con integración Traccar
  const handleAddDevice = async (e) => {
    e.preventDefault();
    if (!newDeviceForm.device_id.trim() || !newDeviceForm.name.trim()) {
      showToast('Por favor completa el ID y el nombre del equipo', 'error');
      return;
    }

    setIsAddingDevice(true);
    try {
      const created = await createDevice({
        device_id: newDeviceForm.device_id.trim().toUpperCase(),
        name: newDeviceForm.name.trim(),
        type: newDeviceForm.type.trim() || 'Mesa Vibratoria',
        description: newDeviceForm.description.trim() || null,
        is_active: true,
        traccar_unique_id: newDeviceForm.traccar_unique_id.trim() || null,
        traccar_model: newDeviceForm.traccar_model.trim() || null,
        sim_phone: newDeviceForm.sim_phone.trim() || null,
        category: newDeviceForm.category.trim() || 'machinery'
      });
      showToast(`Equipo '${created.device_id}' dado de alta exitosamente.`);
      setShowAddDeviceModal(false);
      setNewDeviceForm({
        device_id: '',
        name: '',
        type: 'Mesa Vibratoria',
        description: '',
        traccar_unique_id: '',
        traccar_model: 'Teltonika FMB920',
        sim_phone: '',
        category: 'machinery'
      });
      setSelectedDeviceId(created.device_id);
      setSelectedMapCenter(null);
      await fetchAllData(true);
    } catch (err) {
      const errMsg = err.response?.data?.detail || 'Error al dar de alta el dispositivo';
      showToast(errMsg, 'error');
    } finally {
      setIsAddingDevice(false);
    }
  };

  // Apertura del modal de edición con los datos actuales
  const handleOpenEditModal = (dev) => {
    if (!dev) return;
    setEditDeviceForm({
      device_id: dev.device_id,
      name: dev.name || '',
      type: dev.type || 'Mesa Vibratoria',
      description: dev.description || '',
      traccar_unique_id: dev.traccar_unique_id || '',
      traccar_model: dev.traccar_model || 'Teltonika ATC700',
      sim_phone: dev.sim_phone || '',
      category: dev.category || 'machinery',
      is_active: dev.is_active ?? true
    });
    setShowEditDeviceModal(true);
  };

  // Modificación de dispositivo (CRUD Update)
  const handleUpdateDevice = async (e) => {
    e.preventDefault();
    if (!editDeviceForm.name.trim()) {
      showToast('Por favor completa el nombre del equipo', 'error');
      return;
    }

    setIsUpdatingDevice(true);
    try {
      const updated = await updateDevice(editDeviceForm.device_id, {
        name: editDeviceForm.name.trim(),
        type: editDeviceForm.type.trim() || 'Mesa Vibratoria',
        description: editDeviceForm.description.trim() || null,
        is_active: editDeviceForm.is_active,
        traccar_unique_id: editDeviceForm.traccar_unique_id.trim() || null,
        traccar_model: editDeviceForm.traccar_model.trim() || null,
        sim_phone: editDeviceForm.sim_phone.trim() || null,
        category: editDeviceForm.category.trim() || 'machinery'
      });
      showToast(`Equipo '${updated.device_id}' actualizado exitosamente.`);
      setShowEditDeviceModal(false);
      await fetchAllData(true);
    } catch (err) {
      const errMsg = err.response?.data?.detail || 'Error al actualizar el dispositivo';
      showToast(errMsg, 'error');
    } finally {
      setIsUpdatingDevice(false);
    }
  };

  // Baja / Eliminación de un dispositivo (CRUD Delete)
  const handleDeleteDevice = async (devId) => {
    if (!devId || devId === 'all') return;
    const targetObj = deviceList.find(d => d.device_id === devId);
    const targetName = targetObj ? targetObj.name : devId;

    if (!window.confirm(`¿Estás seguro de que deseas dar de baja y eliminar el equipo '${devId}' (${targetName})? Se eliminarán también sus registros de telemetría.`)) {
      return;
    }

    try {
      await deleteDevice(devId);
      showToast(`Equipo '${devId}' eliminado correctamente.`);
      if (selectedDeviceId === devId) {
        setSelectedDeviceId('all');
        setSelectedMapCenter(null);
      }
      await fetchAllData(true);
    } catch (err) {
      const errMsg = err.response?.data?.detail || 'Error al eliminar el dispositivo';
      showToast(errMsg, 'error');
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
        <p className="text-xs text-slate-400 mt-1">Cargando dispositivos para {user?.username || 'Operador'}</p>
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
      
      {/* Notificaciones Flotantes */}
      {toastNotification && (
        <div className="fixed top-16 right-6 z-50 max-w-md animate-fade-in">
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl text-xs font-medium ${
            toastNotification.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/40 text-rose-200 shadow-rose-950/40'
              : 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200 shadow-emerald-950/40'
          }`}>
            {toastNotification.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{toastNotification.message}</span>
          </div>
        </div>
      )}

      {/* 1. Header Industrial Móvil con Selector y Acciones de Operador */}
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

              <div className="flex items-center gap-2 mt-0.5">
                <div className="relative">
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => {
                      setSelectedDeviceId(e.target.value);
                      setSelectedMapCenter(null);
                    }}
                    className="appearance-none bg-slate-950 border border-slate-700/80 hover:border-cyan-500/60 rounded-xl px-3 py-1.5 pr-8 text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer shadow-inner min-w-[210px]"
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

                {/* Botón "Gestionar Equipos" (Panel CRUD Flota) */}
                <button
                  onClick={() => setShowManageDevicesModal(true)}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer shadow-sm"
                  title="Administrar y editar los equipos de la flota"
                >
                  <Settings className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Gestionar</span>
                </button>
              </div>
            </div>
          </div>

          {/* Lado Derecho: Export CSV, Refresco y Logout */}
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

            {/* Acceso Rápido a Traccar / Selector */}
            <a
              href="/selector"
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 active:scale-95 border border-purple-500/30 text-xs font-bold text-purple-300 transition-all cursor-pointer"
              title="Cambiar a Consola Traccar o Selector de Plataformas"
            >
              <Satellite className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Traccar</span>
            </a>

            {/* Usuario / Salir */}
            <div className="flex items-center gap-1.5 pl-1 border-l border-slate-800">
              <span className="text-xs text-slate-400 font-medium hidden lg:inline px-1">
                {user?.username || 'Operador'}
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

        {deviceList.length === 0 ? (
          /* Estado Vacío Elegante para Operadores sin equipos asignados */
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 sm:p-14 text-center max-w-2xl mx-auto shadow-2xl space-y-6 my-8">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-950/30">
              <HardDrive className="w-10 h-10" />
            </div>
            <div className="space-y-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                <span>Espacio Privado y Aislado</span>
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">
                Bienvenido, <span className="text-cyan-400">{user?.username || 'Operador'}</span>
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed max-w-md mx-auto">
                Tu cuenta de cliente está activa pero aún no tiene maquinarias asignadas. 
                En este nodo central, cada operador cuenta con <strong className="text-slate-200">privacidad total</strong>: los equipos y telemetría de otros clientes nunca son visibles en tu sesión.
              </p>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => setShowAddDeviceModal(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white text-sm font-bold shadow-lg shadow-cyan-950/40 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar Mi Primer Equipo</span>
              </button>
              <button
                onClick={() => fetchAllData(true)}
                disabled={isRefreshing}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 text-sm font-semibold border border-slate-700 transition-all cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 text-cyan-400 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Verificar Actualizaciones</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Indicador de Modo de Visualización (Flota vs Equipo) */}
            {isFleetView ? (
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

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowManageDevicesModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 border border-slate-700 text-xs font-bold transition-all cursor-pointer shadow-md shrink-0"
              >
                <Settings className="w-3.5 h-3.5 text-cyan-400" />
                <span>Gestionar Equipos</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-white">
                    {currentDeviceObj?.name || singleStatus?.name || selectedDeviceId}
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                    {selectedDeviceId}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {currentDeviceObj?.type || 'Maquinaria'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1 font-mono">
                  {currentDeviceObj?.traccar_unique_id && (
                    <span className="flex items-center gap-1 text-slate-300">
                      <Satellite className="w-3 h-3 text-cyan-400" />
                      IMEI Traccar: <strong>{currentDeviceObj.traccar_unique_id}</strong>
                    </span>
                  )}
                  {currentDeviceObj?.traccar_model && (
                    <span>• GPS: {currentDeviceObj.traccar_model}</span>
                  )}
                  {currentDeviceObj?.sim_phone && (
                    <span>• SIM: {currentDeviceObj.sim_phone}</span>
                  )}
                  {currentDeviceObj?.description && (
                    <span className="font-sans text-slate-400">• {currentDeviceObj.description}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setSelectedDeviceId('all')}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-colors cursor-pointer"
              >
                Ver Flota
              </button>
            </div>
          </div>
        )}

        {/* Barra de Sensores y Telemetría en Tiempo Real (Teltonika / Traccar) */}
        {!isFleetView && singleStatus && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-lg backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-6 text-xs">
              {/* Velocidad */}
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Gauge className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Velocidad</span>
                  <span className="font-mono font-bold text-white text-sm">
                    {(singleStatus.last_speed ?? singleStatus.raw_data?.speed ?? 0).toFixed(1)} <span className="text-xs text-slate-400 font-normal">km/h</span>
                  </span>
                </div>
              </div>

              {/* Batería Interna */}
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Battery className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Batería GPS</span>
                  <span className="font-mono font-bold text-emerald-300 text-sm">
                    {singleStatus.raw_data?.attributes?.battery 
                      ? `${Number(singleStatus.raw_data.attributes.battery).toFixed(2)} V` 
                      : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Señal Celular (RSSI) */}
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                  <Signal className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Señal GSM</span>
                  <span className="font-mono font-bold text-purple-300 text-sm">
                    {singleStatus.raw_data?.attributes?.rssi != null 
                      ? `${singleStatus.raw_data.attributes.rssi} / 5` 
                      : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Satélites GPS */}
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Satellite className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Satélites</span>
                  <span className="font-mono font-bold text-amber-300 text-sm">
                    {singleStatus.raw_data?.attributes?.sat ?? '0 fijados'}
                  </span>
                </div>
              </div>

              {/* Odómetro / Distancia Total */}
              {singleStatus.raw_data?.attributes?.totalDistance != null && (
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <Compass className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Odómetro</span>
                    <span className="font-mono font-bold text-blue-300 text-sm">
                      {(Number(singleStatus.raw_data.attributes.totalDistance) / 1000).toFixed(1)} <span className="text-xs text-slate-400 font-normal">km</span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Botón para ver Telemetría Cruda (JSON) */}
            {singleStatus.raw_data && (
              <button
                onClick={() => setSelectedRawData(singleStatus.raw_data)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 text-xs font-bold border border-slate-700 transition-all cursor-pointer shadow-md active:scale-95 shrink-0"
                title="Inspeccionar todos los parámetros telemáticos y entradas/salidas (IOs) recibidas de Traccar"
              >
                <Code className="w-4 h-4" />
                <span>Ver Telemetría Cruda (JSON Traccar)</span>
              </button>
            )}
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
                  <span className="truncate max-w-[200px]" title={singleStatus?.raw_data?.address || ''}>
                    {!isFleetView && singleStatus?.raw_data?.address 
                      ? singleStatus.raw_data.address 
                      : (!isFleetView && singleStatus?.last_lat && singleStatus.last_lat < -33 ? 'Buenos Aires, Argentina' : 'San Juan, Argentina')}
                  </span>
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
                        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mt-0.5 truncate">
                          <span>Lat {log.latitude?.toFixed(4)}, Lon {log.longitude?.toFixed(4)}</span>
                          {log.speed != null && (
                            <span className="text-cyan-300">• {log.speed.toFixed(1)} km/h</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {log.raw_data && (
                        <button
                          onClick={() => setSelectedRawData(log.raw_data)}
                          className="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 text-[11px] font-mono font-bold border border-slate-700 transition-all cursor-pointer"
                          title="Ver telemetría cruda JSON"
                        >
                          JSON
                        </button>
                      )}
                      <button
                        onClick={() => centerOnEvent(log.latitude, log.longitude)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 text-xs font-bold border border-slate-700 shrink-0 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                        title="Centrar en el mapa"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Ubicar</span>
                      </button>
                    </div>
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
        </>
        )}

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

      {/* Modal de Alta de Dispositivo con Integración Traccar */}
      {showAddDeviceModal && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddDeviceModal(false);
          }}
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
        >
          <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            
            {/* Header del Modal */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                  <Satellite className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Alta de Dispositivo</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      Compatible Traccar
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">Registra una nueva máquina y asocia su rastreador GPS</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddDeviceModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddDevice} className="space-y-4">
              
              {/* Sección 1: Datos Operativos */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>1. Identificación de la Máquina</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Código / Alias Interno <span className="text-cyan-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="ej. MESA_03, PALA_02"
                      value={newDeviceForm.device_id}
                      onChange={(e) => setNewDeviceForm({ ...newDeviceForm, device_id: e.target.value.toUpperCase() })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white uppercase focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Nombre de la Máquina <span className="text-cyan-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="ej. Mesa Concentradora 03"
                      value={newDeviceForm.name}
                      onChange={(e) => setNewDeviceForm({ ...newDeviceForm, name: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Tipo de Maquinaria
                    </label>
                    <select
                      value={newDeviceForm.type}
                      onChange={(e) => setNewDeviceForm({ ...newDeviceForm, type: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="Mesa Vibratoria">Mesa Vibratoria</option>
                      <option value="Mesa Clasificadora">Mesa Clasificadora</option>
                      <option value="Pala Cargadora Frontal">Pala Cargadora Frontal</option>
                      <option value="Planta de Lavado">Planta de Lavado</option>
                      <option value="Generador Diésel">Generador Diésel</option>
                      <option value="Camión Tolva">Camión Tolva</option>
                      <option value="Maquinaria Pesada">Maquinaria Pesada</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Ubicación / Sector
                    </label>
                    <input
                      type="text"
                      placeholder="ej. Sector C - Molienda"
                      value={newDeviceForm.description}
                      onChange={(e) => setNewDeviceForm({ ...newDeviceForm, description: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>

              {/* Sección 2: Integración con TRACCAR */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                    <Satellite className="w-3.5 h-3.5" />
                    <span>2. Datos de Integración con TRACCAR</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Conexión GPS
                  </span>
                </div>

                <div className="bg-purple-950/20 border border-purple-500/20 rounded-lg p-2.5 text-[11px] text-purple-200/90 leading-relaxed flex items-start gap-2">
                  <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                  <span>
                    El <strong>IMEI / Unique ID</strong> es el identificador con el que el hardware GPS reporta al servidor Traccar. Esto vincula automáticamente la señal satelital e ignición.
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      IMEI / Unique ID de Traccar
                    </label>
                    <input
                      type="text"
                      placeholder="ej. 868204030100004 (15 dígitos)"
                      value={newDeviceForm.traccar_unique_id}
                      onChange={(e) => setNewDeviceForm({ ...newDeviceForm, traccar_unique_id: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Modelo del Equipo GPS
                    </label>
                    <select
                      value={newDeviceForm.traccar_model}
                      onChange={(e) => setNewDeviceForm({ ...newDeviceForm, traccar_model: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="Teltonika ATC700">Teltonika ATC700</option>
                      <option value="Teltonika FMB920">Teltonika FMB920</option>
                      <option value="Queclink GV300">Queclink GV300</option>
                      <option value="Suntech ST310">Suntech ST310</option>
                      <option value="Concox / Jimi">Concox / Jimi VL03</option>
                      <option value="Coban GPS103">Coban GPS103</option>
                      <option value="ESP32 Custom">ESP32 Custom / Telemetría</option>
                      <option value="OsmAnd Protocol">OsmAnd (App Móvil / GPS)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      N° Chip SIM (Teléfono)
                    </label>
                    <input
                      type="text"
                      placeholder="ej. +5491155550004"
                      value={newDeviceForm.sim_phone}
                      onChange={(e) => setNewDeviceForm({ ...newDeviceForm, sim_phone: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Categoría / Icono Traccar
                    </label>
                    <select
                      value={newDeviceForm.category}
                      onChange={(e) => setNewDeviceForm({ ...newDeviceForm, category: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="machinery">Maquinaria de Planta (machinery)</option>
                      <option value="tractor">Pala / Tractor (tractor)</option>
                      <option value="truck">Camión Pesado (truck)</option>
                      <option value="van">Utilitario / Camioneta (van)</option>
                      <option value="default">General (default)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddDeviceModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isAddingDevice}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-xs font-bold text-white shadow-lg shadow-cyan-950/40 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAddingDevice ? 'Registrando...' : 'Dar de Alta Equipo'}</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Modal de Edición de Dispositivo (CRUD Update) */}
      {showEditDeviceModal && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowEditDeviceModal(false);
          }}
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
        >
          <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Header del Modal */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Modificar Dispositivo</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      {editDeviceForm.device_id}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">Actualiza los parámetros operativos y de rastreo GPS</p>
                </div>
              </div>
              <button
                onClick={() => setShowEditDeviceModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateDevice} className="space-y-4">
              {/* Sección 1: Datos Operativos */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>1. Identificación de la Máquina</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Código / Alias (Fijo)
                    </label>
                    <input
                      type="text"
                      disabled
                      value={editDeviceForm.device_id}
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-400 uppercase font-mono cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Nombre de la Máquina <span className="text-cyan-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editDeviceForm.name}
                      onChange={(e) => setEditDeviceForm({ ...editDeviceForm, name: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Tipo de Maquinaria
                    </label>
                    <select
                      value={editDeviceForm.type}
                      onChange={(e) => setEditDeviceForm({ ...editDeviceForm, type: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="Mesa Vibratoria">Mesa Vibratoria</option>
                      <option value="Mesa Clasificadora">Mesa Clasificadora</option>
                      <option value="GPS Industrial">GPS Industrial</option>
                      <option value="Pala Cargadora Frontal">Pala Cargadora Frontal</option>
                      <option value="Planta de Lavado">Planta de Lavado</option>
                      <option value="Generador Diésel">Generador Diésel</option>
                      <option value="Camión Tolva">Camión Tolva</option>
                      <option value="Maquinaria Pesada">Maquinaria Pesada</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Ubicación / Sector
                    </label>
                    <input
                      type="text"
                      placeholder="ej. Sector C - Molienda"
                      value={editDeviceForm.description}
                      onChange={(e) => setEditDeviceForm({ ...editDeviceForm, description: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>

              {/* Sección 2: Integración TRACCAR */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                  <Satellite className="w-3.5 h-3.5" />
                  <span>2. Configuración GPS / TRACCAR</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      IMEI / Unique ID de Traccar
                    </label>
                    <input
                      type="text"
                      placeholder="ej. 860693080022560"
                      value={editDeviceForm.traccar_unique_id}
                      onChange={(e) => setEditDeviceForm({ ...editDeviceForm, traccar_unique_id: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Modelo del Equipo GPS
                    </label>
                    <select
                      value={editDeviceForm.traccar_model}
                      onChange={(e) => setEditDeviceForm({ ...editDeviceForm, traccar_model: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="Teltonika ATC700">Teltonika ATC700</option>
                      <option value="Teltonika FMB920">Teltonika FMB920</option>
                      <option value="Queclink GV300">Queclink GV300</option>
                      <option value="Suntech ST310">Suntech ST310</option>
                      <option value="Concox / Jimi">Concox / Jimi VL03</option>
                      <option value="Coban GPS103">Coban GPS103</option>
                      <option value="ESP32 Custom">ESP32 Custom / Telemetría</option>
                      <option value="OsmAnd Protocol">OsmAnd (App Móvil / GPS)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      N° Chip SIM (Teléfono)
                    </label>
                    <input
                      type="text"
                      placeholder="ej. +5491155550004"
                      value={editDeviceForm.sim_phone}
                      onChange={(e) => setEditDeviceForm({ ...editDeviceForm, sim_phone: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Categoría / Icono
                    </label>
                    <select
                      value={editDeviceForm.category}
                      onChange={(e) => setEditDeviceForm({ ...editDeviceForm, category: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="machinery">Maquinaria de Planta (machinery)</option>
                      <option value="car">Vehículo Liviano (car)</option>
                      <option value="tractor">Pala / Tractor (tractor)</option>
                      <option value="truck">Camión Pesado (truck)</option>
                      <option value="van">Utilitario / Camioneta (van)</option>
                      <option value="default">General (default)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowEditDeviceModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingDevice}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-xs font-bold text-white shadow-lg shadow-cyan-950/40 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>{isUpdatingDevice ? 'Guardando...' : 'Guardar Cambios'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Gestión Integral de Dispositivos (CRUD Flota) */}
      {showManageDevicesModal && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowManageDevicesModal(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
        >
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-5 max-h-[90vh] flex flex-col">
            {/* Header del Modal */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Administración de Dispositivos
                  </h3>
                  <div className="mt-1">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      {deviceList.length} Equipos
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowManageDevicesModal(false);
                    setShowAddDeviceModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nuevo Dispositivo</span>
                </button>
                <button
                  onClick={() => setShowManageDevicesModal(false)}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Tabla de Equipos */}
            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60">
              {deviceList.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No tienes dispositivos registrados en tu cuenta.
                </div>
              ) : (
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400 sticky top-0">
                    <tr>
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Nombre & Tipo</th>
                      <th className="px-4 py-3">Rastreador GPS / IMEI</th>
                      <th className="px-4 py-3">Ubicación / SIM</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-medium">
                    {deviceList.map((dev) => (
                      <tr key={dev.device_id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-white">
                          <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                            {dev.device_id}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-white">{dev.name}</div>
                          <div className="text-[11px] text-slate-400">{dev.type || 'Maquinaria'}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px]">
                          <div className="text-cyan-300">{dev.traccar_model || 'GPS'}</div>
                          <div className="text-slate-400">IMEI: {dev.traccar_unique_id || 'Sin vincular'}</div>
                        </td>
                        <td className="px-4 py-3 text-[11px]">
                          <div className="text-slate-300">{dev.description || 'Sin sector'}</div>
                          <div className="text-slate-500 font-mono">{dev.sim_phone || 'Sin SIM'}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedDeviceId(dev.device_id);
                                setSelectedMapCenter(null);
                                setShowManageDevicesModal(false);
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer"
                              title="Ver en el mapa"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                handleOpenEditModal(dev);
                              }}
                              className="p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 transition-colors cursor-pointer"
                              title="Modificar datos"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteDevice(dev.device_id)}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 transition-colors cursor-pointer"
                              title="Eliminar dispositivo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer del Modal */}
            <div className="flex items-center justify-end pt-2 border-t border-slate-800 text-xs text-slate-400">
              <button
                onClick={() => setShowManageDevicesModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Inspector de Telemetría JSON Cruda (Traccar) */}
      {selectedRawData && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedRawData(null);
          }}
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
        >
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                  <Code className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Inspector de Telemetría Completa</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      100% Datos Almacenados
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">Todos los parámetros telemáticos y entradas/salidas (IOs) recibidos desde Traccar</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRawData(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto rounded-xl bg-slate-950 p-4 border border-slate-800 font-mono text-xs text-cyan-300">
              <pre className="whitespace-pre-wrap">{JSON.stringify(selectedRawData, null, 2)}</pre>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-xs text-slate-400 font-mono">
                {selectedRawData.protocol ? `Protocolo: ${selectedRawData.protocol}` : 'Traccar Payload'}
              </span>
              <button
                onClick={() => setSelectedRawData(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
