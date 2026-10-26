import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MapPin, X, Plus, Trash2, Shield, CircleDot, 
  Layers, Clock, AlertTriangle, RefreshCw, Eye, 
  EyeOff, CheckCircle2, ChevronRight, Gauge, Undo, Save,
  Globe, Navigation, LocateFixed, Car
} from 'lucide-react';
import { MapContainer, TileLayer, Polygon, Circle, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
  getGeofences, 
  createGeofence, 
  updateGeofence, 
  deleteGeofence, 
  getGeofenceEvents,
  getClientIpLocation
} from '../services/api';

// Paleta de colores temáticos para zonas operativas
const COLOR_PALETTE = [
  { name: 'Cian', hex: '#06b6d4' },
  { name: 'Esmeralda', hex: '#10b981' },
  { name: 'Ámbar', hex: '#f59e0b' },
  { name: 'Rosa / Peligro', hex: '#f43f5e' },
  { name: 'Púrpura', hex: '#8b5cf6' },
  { name: 'Azul', hex: '#3b82f6' }
];

// Componente para capturar clics en el mapa durante el modo de dibujo
function MapDrawingHandler({ drawingType, onMapClick }) {
  useMapEvents({
    click(e) {
      if (drawingType) {
        onMapClick([e.latlng.lat, e.latlng.lng]);
      }
    }
  });
  return null;
}

// Re-centrado inteligente del mapa modal:
// 1. Centra ÚNICAMENTE al momento de cargar / abrir la creación de la geocerca.
// 2. Si es vista de flota y la IP se resuelve de forma asíncrona poco después de abrir, centra una sola vez en la IP (siempre que el usuario no haya comenzado a dibujar).
// 3. Una vez centrado inicialmente, NO vuelve a forzar setView ante re-renders, movimientos de mapa, colocación de vértices, sliders o telemetría.
// 4. Permite centrado manual a demanda si el usuario hace clic en [Centrar] o en fijar centro.
function RecenterModalMap({
  targetCenter,
  targetZoom,
  manualTrigger,
  activeTab,
  isFleetView,
  hasDevicePos,
  isDrawingStarted
}) {
  const map = useMap();
  const hasInitialCenteredRef = useRef(false);
  const lastActiveTabRef = useRef(activeTab);
  const hasIpCenteredRef = useRef(!isFleetView || hasDevicePos);

  // Invalidate size on initial mount and when tab changes so Leaflet recalculates container dimensions
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [map, activeTab]);

  // Centrado inicial: ÚNICAMENTE al cargar o al ingresar a la pestaña de creación
  useEffect(() => {
    if (!targetCenter || targetCenter[0] == null || targetCenter[1] == null || isNaN(targetCenter[0])) {
      return;
    }

    const isEnteringCreateTab = activeTab === 'create' && lastActiveTabRef.current !== 'create';
    lastActiveTabRef.current = activeTab;

    if (!hasInitialCenteredRef.current || isEnteringCreateTab) {
      map.setView(targetCenter, targetZoom || 14, { animate: false });
      hasInitialCenteredRef.current = true;
    }
  }, [targetCenter?.[0], targetCenter?.[1], activeTab, map]);

  // Si la geolocalización por IP se completa tras el montaje inicial en vista de flota, centrar UNA SOLA VEZ
  useEffect(() => {
    if (
      isFleetView &&
      !hasDevicePos &&
      !hasIpCenteredRef.current &&
      !isDrawingStarted &&
      targetCenter &&
      targetCenter[0] != null &&
      !isNaN(targetCenter[0])
    ) {
      map.setView(targetCenter, targetZoom || 13, { animate: true });
      hasIpCenteredRef.current = true;
      hasInitialCenteredRef.current = true;
    }
  }, [targetCenter?.[0], targetCenter?.[1], targetZoom, isFleetView, hasDevicePos, isDrawingStarted, map]);

  // Re-centrado manual explícito: SOLO cuando el usuario pulsa [Centrar] o un botón de anclaje rápido
  useEffect(() => {
    if (manualTrigger > 0 && targetCenter && targetCenter[0] != null && !isNaN(targetCenter[0])) {
      map.setView(targetCenter, targetZoom || 14, { animate: true });
    }
  }, [manualTrigger]);

  return null;
}

// Icono para el vehículo activo visualizado
const vehicleMarkerIcon = L.divIcon({
  className: 'custom-vehicle-modal-marker',
  html: `
    <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 38px; height: 38px;">
      <span style="position: absolute; width: 38px; height: 38px; border-radius: 9999px; background: rgba(6, 182, 212, 0.4); animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
      <div style="position: relative; width: 30px; height: 30px; border-radius: 9999px; background: #0891b2; border: 2.5px solid #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.6);">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
          <circle cx="7" cy="17" r="2"/>
          <path d="M9 17h6"/>
          <circle cx="17" cy="17" r="2"/>
        </svg>
      </div>
    </div>
  `,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -20]
});

// Icono para la ubicación aproximada del usuario por IP (vista de flota)
const userIpMarkerIcon = L.divIcon({
  className: 'custom-user-ip-modal-marker',
  html: `
    <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;">
      <span style="position: absolute; width: 36px; height: 36px; border-radius: 9999px; background: rgba(59, 130, 246, 0.35); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
      <div style="position: relative; width: 26px; height: 26px; border-radius: 9999px; background: #2563eb; border: 2.5px solid #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
        </svg>
      </div>
    </div>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20]
});

export default function GeofenceManagerModal({
  isOpen,
  onClose,
  deviceList = [],
  initialTab = null,
  isFleetView = true,
  selectedDevice = null,
  devicePosition = null,
  deviceName = ''
}) {
  const [geofences, setGeofences] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab || 'list'); // 'list' | 'create' | 'events'
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedGeofenceForEvents, setSelectedGeofenceForEvents] = useState(null);

  // Formulario de creación
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState('POLYGON'); // 'POLYGON' | 'CIRCLE'
  const [formColor, setFormColor] = useState('#06b6d4');
  const [formSpeedLimit, setFormSpeedLimit] = useState('');
  const [circleCenter, setCircleCenter] = useState(null); // [lat, lon]
  const [circleRadius, setCircleRadius] = useState(250); // metros
  const [polygonVertices, setPolygonVertices] = useState([]); // [[lat, lon], ...]
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Ubicación por IP del usuario conectado y control de re-centrado
  const [ipLocation, setIpLocation] = useState(null);
  const [ipLoading, setIpLoading] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);

  // Centro de mapa calculado según los requerimientos (declarado incondicionalmente a nivel superior)
  const hasDevicePos = !isFleetView && devicePosition && devicePosition[0] != null && devicePosition[1] != null && !isNaN(devicePosition[0]);
  const hasIpLocation = isFleetView && ipLocation && ipLocation.lat != null && ipLocation.lon != null;

  const defaultCenter = useMemo(() => {
    if (hasDevicePos) {
      return [Number(devicePosition[0]), Number(devicePosition[1])];
    }
    if (hasIpLocation) {
      return [Number(ipLocation.lat), Number(ipLocation.lon)];
    }
    if (geofences.length > 0 && geofences[0].center_lat && geofences[0].center_lon) {
      return [Number(geofences[0].center_lat), Number(geofences[0].center_lon)];
    }
    return [-34.6037, -58.3816];
  }, [
    hasDevicePos,
    devicePosition?.[0],
    devicePosition?.[1],
    hasIpLocation,
    ipLocation?.lat,
    ipLocation?.lon,
    geofences
  ]);

  const defaultZoom = hasDevicePos ? 15 : (hasIpLocation ? 13 : 12);
  const isDrawingStarted = (formType === 'POLYGON' && polygonVertices.length > 0) || (formType === 'CIRCLE' && circleCenter !== null);

  // Cargar geocercas y resolver geolocalización al abrir
  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      fetchGeofences();
      setErrorMessage(null);
      setSuccessMessage(null);

      // Resolver ubicación aproximada por IP del usuario conectado si aún no se cuenta con ella
      if (!ipLocation) {
        setIpLoading(true);
        getClientIpLocation()
          .then(loc => {
            if (loc && loc.latitude && loc.longitude) {
              setIpLocation({
                lat: Number(loc.latitude),
                lon: Number(loc.longitude),
                city: loc.city || 'Ubicación Detectada',
                ip: loc.ip || 'Pública'
              });
            }
          })
          .catch(err => console.warn('Error resolviendo GeoIP:', err))
          .finally(() => setIpLoading(false));
      }
    }
  }, [isOpen, initialTab, isFleetView]);

  const fetchGeofences = async () => {
    setLoading(true);
    try {
      const data = await getGeofences();
      setGeofences(data);
      if (!initialTab && Array.isArray(data) && data.length === 0) {
        setActiveTab('create');
      }
    } catch (err) {
      console.error('Error al cargar geocercas:', err);
      setErrorMessage('No se pudieron obtener las geocercas configuradas.');
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async (geofenceId) => {
    setEventsLoading(true);
    try {
      const data = await getGeofenceEvents(geofenceId, 100);
      setEvents(data);
      setSelectedGeofenceForEvents(geofenceId);
      setActiveTab('events');
    } catch (err) {
      console.error('Error al cargar eventos de geocerca:', err);
      setErrorMessage('No se pudieron obtener los eventos de la geocerca.');
    } finally {
      setEventsLoading(false);
    }
  };

  const handleMapClick = (coord) => {
    if (formType === 'CIRCLE') {
      setCircleCenter(coord);
    } else if (formType === 'POLYGON') {
      setPolygonVertices(prev => [...prev, coord]);
    }
  };

  const handleUndoVertex = () => {
    setPolygonVertices(prev => prev.slice(0, -1));
  };

  const handleResetDrawing = () => {
    setCircleCenter(null);
    setPolygonVertices([]);
    setCircleRadius(250);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      setErrorMessage('El nombre de la geocerca es obligatorio.');
      return;
    }

    if (formType === 'POLYGON' && polygonVertices.length < 3) {
      setErrorMessage('Un polígono requiere al menos 3 vértices marcados en el mapa.');
      return;
    }

    if (formType === 'CIRCLE' && (!circleCenter || circleRadius <= 0)) {
      setErrorMessage('Haz clic en el mapa para posicionar el centro del círculo.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload = {
      name: formName.trim(),
      description: formDescription.trim() || null,
      type: formType,
      color: formColor,
      speed_limit_kmh: formSpeedLimit ? parseFloat(formSpeedLimit) : null,
      is_active: true
    };

    if (formType === 'CIRCLE') {
      payload.center_lat = circleCenter[0];
      payload.center_lon = circleCenter[1];
      payload.radius_meters = circleRadius;
    } else {
      payload.polygon_vertices = polygonVertices;
    }

    try {
      await createGeofence(payload);
      setSuccessMessage(`Geocerca "${formName}" creada exitosamente.`);
      setFormName('');
      setFormDescription('');
      setFormSpeedLimit('');
      handleResetDrawing();
      await fetchGeofences();
      setActiveTab('list');
    } catch (err) {
      console.error('Error al crear geocerca:', err);
      setErrorMessage(err.response?.data?.detail || 'Error al guardar la geocerca.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar la geocerca "${name}"? Se borrarán sus eventos históricos.`)) {
      return;
    }
    try {
      await deleteGeofence(id);
      setGeofences(prev => prev.filter(g => g.id !== id));
      setSuccessMessage(`Geocerca "${name}" eliminada.`);
    } catch (err) {
      console.error('Error al eliminar geocerca:', err);
      setErrorMessage('No se pudo eliminar la geocerca.');
    }
  };

  const handleToggleActive = async (gf) => {
    try {
      const updated = await updateGeofence(gf.id, { is_active: !gf.is_active });
      setGeofences(prev => prev.map(g => g.id === gf.id ? updated : g));
    } catch (err) {
      console.error('Error al actualizar estado:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-6xl h-[92vh] max-h-[850px] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* Encabezado */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Gestor de Geocercas Inteligentes</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono border border-cyan-500/30">
                  Sprint 1 • v0.5.0
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Delimita perímetros seguros, controla permanencias y recibe alertas de entrada/salida.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Pestañas */}
            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs font-bold">
              <button
                onClick={() => setActiveTab('list')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'list' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                Zonas ({geofences.length})
              </button>
              <button
                onClick={() => { setActiveTab('create'); handleResetDrawing(); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'create' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva Zona</span>
              </button>
              {events.length > 0 && (
                <button
                  onClick={() => setActiveTab('events')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    activeTab === 'events' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Eventos ({events.length})
                </button>
              )}
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mensajes de Alerta */}
        {errorMessage && (
          <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl bg-rose-950/80 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              {errorMessage}
            </span>
            <button onClick={() => setErrorMessage(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
        )}
        {successMessage && (
          <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              {successMessage}
            </span>
            <button onClick={() => setSuccessMessage(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
        )}

        {/* Contenido Principal (Split Lateral + Mapa) */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Panel Izquierdo Lateral */}
          <div className="w-full md:w-96 border-b md:border-b-0 md:border-r border-slate-800/80 flex flex-col bg-slate-900/60 overflow-y-auto">
            
            {activeTab === 'list' && (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400 font-semibold px-1">
                  <span>Zonas Registradas</span>
                  <button
                    onClick={fetchGeofences}
                    disabled={loading}
                    className="hover:text-cyan-400 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    <span>Actualizar</span>
                  </button>
                </div>

                {geofences.length === 0 ? (
                  <div className="text-center py-12 px-4 space-y-3">
                    <Layers className="w-10 h-10 mx-auto text-slate-600" />
                    <p className="text-xs text-slate-400">No hay geocercas configuradas todavía.</p>
                    <button
                      onClick={() => setActiveTab('create')}
                      className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white transition-all cursor-pointer shadow-md"
                    >
                      Dibujar Primera Geocerca
                    </button>
                  </div>
                ) : (
                  geofences.map(gf => (
                    <div
                      key={gf.id}
                      className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 space-y-2.5 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                            style={{ backgroundColor: gf.color || '#06b6d4' }}
                          />
                          <h4 className="text-xs font-bold text-white leading-tight">{gf.name}</h4>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleToggleActive(gf)}
                            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                            title={gf.is_active ? 'Desactivar Geocerca' : 'Activar Geocerca'}
                          >
                            {gf.is_active ? <Eye className="w-3.5 h-3.5 text-cyan-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
                          </button>
                          <button
                            onClick={() => handleDelete(gf.id, gf.name)}
                            className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Eliminar Geocerca"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {gf.description && (
                        <p className="text-[11px] text-slate-400 line-clamp-2">{gf.description}</p>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/50">
                        <span className="font-mono uppercase bg-slate-800 px-1.5 py-0.5 rounded">
                          {gf.type === 'CIRCLE' ? `Círculo (${gf.radius_meters || 0}m)` : `Polígono (${gf.polygon_vertices?.length || 0} v)`}
                        </span>

                        <div className="flex items-center gap-2">
                          {gf.active_devices_inside > 0 ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                              {gf.active_devices_inside} adentro
                            </span>
                          ) : (
                            <span className="text-slate-500">0 adentro</span>
                          )}

                          <button
                            onClick={() => fetchEvents(gf.id)}
                            className="text-cyan-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                          >
                            <span>Eventos</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'create' && (
              <form onSubmit={handleCreateSubmit} className="p-4 space-y-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Nombre de la Zona *</label>
                  <input
                    type="text"
                    required
                    placeholder="ej. Cantera Rawson / Obrador Central"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Descripción</label>
                  <input
                    type="text"
                    placeholder="ej. Zona de carga exclusiva de áridos"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setFormType('POLYGON'); handleResetDrawing(); }}
                    className={`py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      formType === 'POLYGON'
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Polígono
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFormType('CIRCLE'); handleResetDrawing(); }}
                    className={`py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      formType === 'CIRCLE'
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    Círculo
                  </button>
                </div>

                {/* Controles para Polígono */}
                {formType === 'POLYGON' && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Vértices colocados:</span>
                      <span className="font-mono font-bold text-cyan-400">{polygonVertices.length}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Haz clic sobre el mapa para definir los vértices del perímetro.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleUndoVertex}
                        disabled={polygonVertices.length === 0}
                        className="flex-1 py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-[10px] font-bold text-slate-300 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Undo className="w-3 h-3" /> Deshacer
                      </button>
                      <button
                        type="button"
                        onClick={handleResetDrawing}
                        disabled={polygonVertices.length === 0}
                        className="py-1 px-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold cursor-pointer"
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>
                )}

                {/* Controles para Círculo */}
                {formType === 'CIRCLE' && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2.5">
                    <p className="text-[10px] text-slate-400">
                      {circleCenter ? '✓ Centro fijado en el mapa.' : '👉 Haz clic en el mapa para situar el centro.'}
                    </p>

                    {/* Botones de anclaje rápido según contexto */}
                    {hasDevicePos && (
                      <button
                        type="button"
                        onClick={() => {
                          setCircleCenter([Number(devicePosition[0]), Number(devicePosition[1])]);
                          setRecenterTrigger(prev => prev + 1);
                        }}
                        className="w-full py-1.5 px-2.5 rounded-lg bg-cyan-950/70 border border-cyan-500/40 hover:bg-cyan-900/60 text-cyan-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Car className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Fijar centro en vehículo ({deviceName || 'Unidad'})</span>
                      </button>
                    )}
                    {hasIpLocation && (
                      <button
                        type="button"
                        onClick={() => {
                          setCircleCenter([Number(ipLocation.lat), Number(ipLocation.lon)]);
                          setRecenterTrigger(prev => prev + 1);
                        }}
                        className="w-full py-1.5 px-2.5 rounded-lg bg-blue-950/70 border border-blue-500/40 hover:bg-blue-900/60 text-blue-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Globe className="w-3.5 h-3.5 text-blue-400" />
                        <span>Fijar centro en tu ubicación IP ({ipLocation.city})</span>
                      </button>
                    )}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-400 font-mono">
                        <span>Radio:</span>
                        <span className="text-cyan-400 font-bold">{circleRadius} metros</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="5000"
                        step="25"
                        value={circleRadius}
                        onChange={(e) => setCircleRadius(parseInt(e.target.value))}
                        className="w-full accent-cyan-500 cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                {/* Color de la Geocerca */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Color en el Mapa</label>
                  <div className="flex items-center gap-2">
                    {COLOR_PALETTE.map(c => (
                      <button
                        type="button"
                        key={c.hex}
                        onClick={() => setFormColor(c.hex)}
                        className={`w-7 h-7 rounded-xl transition-all cursor-pointer ${
                          formColor === c.hex ? 'ring-2 ring-white scale-110 shadow-lg' : 'opacity-70 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>

                {/* Límite de Velocidad Opcional */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Velocidad Máxima Interna</span>
                    <span className="text-slate-500 font-normal">Opcional</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="ej. 30"
                      min="5"
                      max="160"
                      value={formSpeedLimit}
                      onChange={(e) => setFormSpeedLimit(e.target.value)}
                      className="w-full px-3 py-2 pr-12 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-bold">km/h</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-xs font-bold text-white transition-all shadow-lg shadow-cyan-950/40 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSubmitting ? 'Guardando...' : 'Guardar y Activar Geocerca'}</span>
                </button>
              </form>
            )}

            {activeTab === 'events' && (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400 font-semibold px-1">
                  <span>Historial de Ingresos / Egresos</span>
                  <button
                    onClick={() => selectedGeofenceForEvents && fetchEvents(selectedGeofenceForEvents)}
                    disabled={eventsLoading}
                    className="hover:text-cyan-400 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${eventsLoading ? 'animate-spin' : ''}`} />
                    <span>Refrescar</span>
                  </button>
                </div>

                {events.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">No se han registrado eventos para esta geocerca aún.</p>
                ) : (
                  events.map(ev => (
                    <div
                      key={ev.id}
                      className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          ev.event_type === 'ENTER'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : ev.event_type === 'EXIT'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}>
                          {ev.event_type === 'ENTER' ? 'INGRESO' : ev.event_type === 'EXIT' ? 'EGRESO' : 'EXCESO VELOCIDAD'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(ev.timestamp).toLocaleString('es-AR')}
                        </span>
                      </div>

                      <div className="text-white font-medium text-[11px] pt-1">
                        Vehículo: <span className="font-mono text-cyan-300">{ev.device_id}</span>
                      </div>

                      {ev.duration_inside_seconds && (
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-cyan-400" />
                          <span>Permanencia: {Math.floor(ev.duration_inside_seconds / 60)} min ({ev.duration_inside_seconds} s)</span>
                        </div>
                      )}

                      {ev.speed_kmh > 0 && (
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Gauge className="w-3 h-3 text-amber-400" />
                          <span>Velocidad: {ev.speed_kmh.toFixed(1)} km/h</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

          </div>

          {/* Panel Derecho: Mapa Interactivo Leaflet */}
          <div className="flex-1 relative bg-slate-950">
            <MapContainer
              center={defaultCenter}
              zoom={defaultZoom}
              style={{ width: '100%', height: '100%' }}
              className="z-0"
            >
              <RecenterModalMap
                targetCenter={defaultCenter}
                targetZoom={defaultZoom}
                manualTrigger={recenterTrigger}
                activeTab={activeTab}
                isFleetView={isFleetView}
                hasDevicePos={hasDevicePos}
                isDrawingStarted={isDrawingStarted}
              />

              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                className="leaflet-dark-tiles"
              />

              <MapDrawingHandler
                drawingType={activeTab === 'create' ? formType : null}
                onMapClick={handleMapClick}
              />

              {/* Marcador del Vehículo Seleccionado (Posición por defecto al visualizar dispositivo) */}
              {hasDevicePos && (
                <Marker position={[Number(devicePosition[0]), Number(devicePosition[1])]} icon={vehicleMarkerIcon}>
                  <Popup>
                    <div className="text-xs space-y-1">
                      <strong className="block text-slate-900 font-bold">🚗 {deviceName || 'Vehículo Activo'}</strong>
                      <p className="text-slate-600">Posición actual reportada por el equipo</p>
                      <div className="font-mono text-[10px] text-cyan-800 bg-cyan-50 px-1.5 py-0.5 rounded border border-cyan-200">
                        Lat: {Number(devicePosition[0]).toFixed(5)}, Lon: {Number(devicePosition[1]).toFixed(5)}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Marcador de Ubicación por IP (Posición por defecto al visualizar flota completa) */}
              {hasIpLocation && (
                <Marker position={[Number(ipLocation.lat), Number(ipLocation.lon)]} icon={userIpMarkerIcon}>
                  <Popup>
                    <div className="text-xs space-y-1">
                      <strong className="block text-slate-900 font-bold">🌐 Tu Ubicación Aproximada</strong>
                      <p className="text-slate-600">{ipLocation.city} (IP pública: {ipLocation.ip})</p>
                      <div className="font-mono text-[10px] text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                        Lat: {Number(ipLocation.lat).toFixed(5)}, Lon: {Number(ipLocation.lon).toFixed(5)}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Renderizar Geocercas Existentes */}
              {geofences.map(gf => {
                if (!gf.is_active) return null;
                const color = gf.color || '#06b6d4';

                if (gf.type === 'CIRCLE' && gf.center_lat && gf.center_lon) {
                  return (
                    <Circle
                      key={`gf-circle-${gf.id}`}
                      center={[gf.center_lat, gf.center_lon]}
                      radius={gf.radius_meters || 200}
                      pathOptions={{
                        color: color,
                        fillColor: color,
                        fillOpacity: 0.2,
                        weight: 2
                      }}
                    >
                      <Popup>
                        <div className="text-xs space-y-1">
                          <strong className="block text-slate-900 font-bold">{gf.name}</strong>
                          <p className="text-slate-600">{gf.description || 'Zona operativa'}</p>
                          <span className="inline-block px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-800 text-[10px] font-mono">
                            Radio: {gf.radius_meters}m
                          </span>
                        </div>
                      </Popup>
                    </Circle>
                  );
                } else if (gf.type === 'POLYGON' && gf.polygon_vertices && gf.polygon_vertices.length >= 3) {
                  return (
                    <Polygon
                      key={`gf-poly-${gf.id}`}
                      positions={gf.polygon_vertices}
                      pathOptions={{
                        color: color,
                        fillColor: color,
                        fillOpacity: 0.2,
                        weight: 2
                      }}
                    >
                      <Popup>
                        <div className="text-xs space-y-1">
                          <strong className="block text-slate-900 font-bold">{gf.name}</strong>
                          <p className="text-slate-600">{gf.description || 'Zona operativa'}</p>
                          <span className="inline-block px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-800 text-[10px] font-mono">
                            Polígono: {gf.polygon_vertices.length} vértices
                          </span>
                        </div>
                      </Popup>
                    </Polygon>
                  );
                }
                return null;
              })}

              {/* Vista previa en vivo del dibujo actual */}
              {activeTab === 'create' && formType === 'CIRCLE' && circleCenter && (
                <Circle
                  center={circleCenter}
                  radius={circleRadius}
                  pathOptions={{
                    color: formColor,
                    fillColor: formColor,
                    fillOpacity: 0.35,
                    weight: 3,
                    dashArray: '6, 6'
                  }}
                />
              )}

              {activeTab === 'create' && formType === 'POLYGON' && polygonVertices.length > 0 && (
                <>
                  {polygonVertices.length >= 3 ? (
                    <Polygon
                      positions={polygonVertices}
                      pathOptions={{
                        color: formColor,
                        fillColor: formColor,
                        fillOpacity: 0.35,
                        weight: 3,
                        dashArray: '6, 6'
                      }}
                    />
                  ) : null}
                  {polygonVertices.map((v, idx) => (
                    <Circle
                      key={`vertex-${idx}`}
                      center={v}
                      radius={15}
                      pathOptions={{ color: '#ffffff', fillColor: formColor, fillOpacity: 1, weight: 2 }}
                    />
                  ))}
                </>
              )}
            </MapContainer>

            {/* HUD de Contexto y Guía Flotante sobre el Mapa */}
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 max-w-sm pointer-events-auto">
              {hasDevicePos ? (
                <div className="px-3.5 py-2 rounded-xl bg-slate-950/90 border border-cyan-500/40 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shrink-0"></span>
                    <div>
                      <p className="font-bold text-white flex items-center gap-1.5 leading-tight">
                        <Car className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate max-w-[170px]">{deviceName || 'Vehículo Activo'}</span>
                      </p>
                      <p className="text-[10px] font-mono text-cyan-300">
                        {Number(devicePosition[0]).toFixed(5)}, {Number(devicePosition[1]).toFixed(5)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRecenterTrigger(prev => prev + 1)}
                    className="px-2 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 text-[11px] font-semibold border border-cyan-500/30 transition-all flex items-center gap-1 cursor-pointer shrink-0"
                    title="Centrar en vehículo"
                  >
                    <LocateFixed className="w-3 h-3" />
                    <span>Centrar</span>
                  </button>
                </div>
              ) : isFleetView ? (
                <div className="px-3.5 py-2 rounded-xl bg-slate-950/90 border border-blue-500/40 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse shrink-0"></span>
                    <div>
                      <p className="font-bold text-white flex items-center gap-1.5 leading-tight">
                        <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>Flota Completa • Ubicación IP</span>
                      </p>
                      <p className="text-[10px] text-blue-300 truncate max-w-[180px]">
                        {ipLoading 
                          ? 'Detectando ubicación...' 
                          : ipLocation 
                            ? `${ipLocation.city} (IP: ${ipLocation.ip})` 
                            : 'Aproximada por región'}
                      </p>
                    </div>
                  </div>
                  {ipLocation && (
                    <button
                      type="button"
                      onClick={() => setRecenterTrigger(prev => prev + 1)}
                      className="px-2 py-1 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 text-[11px] font-semibold border border-blue-500/30 transition-all flex items-center gap-1 cursor-pointer shrink-0"
                      title="Centrar en tu ubicación IP"
                    >
                      <LocateFixed className="w-3 h-3" />
                      <span>Centrar</span>
                    </button>
                  )}
                </div>
              ) : !hasDevicePos ? (
                <div className="px-3.5 py-2 rounded-xl bg-slate-950/90 border border-amber-500/40 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0"></span>
                    <div>
                      <p className="font-bold text-white flex items-center gap-1.5 leading-tight">
                        <Car className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>{deviceName || 'Vehículo'}: Sin señal GPS</span>
                      </p>
                      <p className="text-[10px] text-amber-300 truncate max-w-[180px]">
                        {ipLocation ? `Posicionando por IP: ${ipLocation.city}` : 'Mostrando mapa regional'}
                      </p>
                    </div>
                  </div>
                  {ipLocation && (
                    <button
                      type="button"
                      onClick={() => setRecenterTrigger(prev => prev + 1)}
                      className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-[11px] font-semibold border border-amber-500/30 transition-all flex items-center gap-1 cursor-pointer shrink-0"
                      title="Centrar en IP"
                    >
                      <LocateFixed className="w-3 h-3" />
                      <span>Centrar</span>
                    </button>
                  )}
                </div>
              ) : null}

              {/* Guía de Dibujo según modo activo */}
              {activeTab === 'create' && (
                <div className="px-3 py-1.5 rounded-xl bg-slate-950/90 border border-slate-800 text-[11px] text-slate-300 shadow-xl backdrop-blur-md">
                  {formType === 'POLYGON' ? (
                    <p>📍 Haz clic sobre el mapa para añadir vértices del perímetro (mínimo 3).</p>
                  ) : (
                    <p>📍 Haz clic sobre el mapa para fijar el centro de la zona circular.</p>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
