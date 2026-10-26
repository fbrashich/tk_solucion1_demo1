import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin, X, Plus, Trash2, Shield, CircleDot, 
  Layers, Clock, AlertTriangle, RefreshCw, Eye, 
  EyeOff, CheckCircle2, ChevronRight, Gauge, Undo, Save
} from 'lucide-react';
import { MapContainer, TileLayer, Polygon, Circle, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { 
  getGeofences, 
  createGeofence, 
  updateGeofence, 
  deleteGeofence, 
  getGeofenceEvents 
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

export default function GeofenceManagerModal({
  isOpen,
  onClose,
  deviceList = [],
  initialTab = null
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

  // Cargar geocercas al abrir
  useEffect(() => {
    if (isOpen) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      fetchGeofences();
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, initialTab]);

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

  // Centro de mapa inicial (primera geocerca, o primer equipo, o San Juan por defecto)
  const defaultCenter = geofences.length > 0 && geofences[0].center_lat
    ? [geofences[0].center_lat, geofences[0].center_lon]
    : [-31.5375, -68.5364];

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
              zoom={13}
              style={{ width: '100%', height: '100%' }}
              className="z-0"
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              />

              <MapDrawingHandler
                drawingType={activeTab === 'create' ? formType : null}
                onMapClick={handleMapClick}
              />

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

            {/* Guía Flotante sobre el Mapa */}
            {activeTab === 'create' && (
              <div className="absolute top-4 left-4 z-10 px-3 py-2 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-slate-300 shadow-xl backdrop-blur-md">
                {formType === 'POLYGON' ? (
                  <p>📍 Haz clic sobre el mapa para añadir vértices del polígono (mínimo 3).</p>
                ) : (
                  <p>📍 Haz clic sobre el mapa para posicionar el centro del círculo.</p>
                )}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
