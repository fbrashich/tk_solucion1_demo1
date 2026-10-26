import React, { useState, useEffect } from 'react';
import { 
  Navigation, X, Calendar, Clock, Gauge, Play, 
  RefreshCw, Flame, ArrowRight, CheckCircle2, 
  MapPin, AlertCircle, ChevronRight, Activity, Filter
} from 'lucide-react';
import { getDeviceTrips } from '../services/api';

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0 min';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins} min`;
}

function formatTime(isoString) {
  if (!isoString) return '--:--';
  const d = new Date(isoString);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(isoString) {
  if (!isoString) return '--/--/----';
  const d = new Date(isoString);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function TripHistoryModal({
  isOpen,
  onClose,
  selectedDeviceId = 'all',
  deviceList = [],
  onSelectTripForPlayback
}) {
  const [targetDevice, setTargetDevice] = useState(
    selectedDeviceId !== 'all' ? selectedDeviceId : (deviceList[0]?.device_id || 'all')
  );
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState('today'); // 'today' | 'yesterday' | 'week' | 'all'
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    if (selectedDeviceId && selectedDeviceId !== 'all') {
      setTargetDevice(selectedDeviceId);
    } else if (deviceList.length > 0 && (!targetDevice || targetDevice === 'all')) {
      setTargetDevice(deviceList[0].device_id);
    }
  }, [selectedDeviceId, deviceList]);

  useEffect(() => {
    if (isOpen) {
      loadTrips();
    }
  }, [isOpen, targetDevice, filterPeriod]);

  const loadTrips = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const now = new Date();
      let fromDate = null;
      let toDate = null;

      if (filterPeriod === 'today') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        fromDate = start.toISOString();
      } else if (filterPeriod === 'yesterday') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
        fromDate = start.toISOString();
        toDate = end.toISOString();
      } else if (filterPeriod === 'week') {
        const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        fromDate = start.toISOString();
      }

      const data = await getDeviceTrips(targetDevice, fromDate, toDate, 100);
      setTrips(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error al cargar historial de viajes:', err);
      setErrorMessage(err.response?.data?.detail || 'Error al consultar viajes telemáticos');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Cálculos consolidados para el resumen superior
  const totalKm = trips.reduce((acc, t) => acc + (t.distance_km || 0), 0);
  const totalDurationSec = trips.reduce((acc, t) => acc + (t.duration_seconds || 0), 0);
  const totalIdlingSec = trips.reduce((acc, t) => acc + (t.idling_seconds || 0), 0);
  const totalFuelCostEst = trips.reduce((acc, t) => acc + (t.idling_fuel_cost_est || 0), 0);
  const maxSpeedOverall = trips.reduce((acc, t) => Math.max(acc, t.max_speed_kmh || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/70 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shadow-inner">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Historial de Viajes y Paradas
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold uppercase">
                  Detección Inteligente
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Segmentación automática por ciclo de contacto y análisis de ralentí
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subheader: Filtros y Selector */}
        <div className="px-6 py-3 bg-slate-950/40 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">
              Vehículo:
            </label>
            <select
              value={targetDevice}
              onChange={(e) => setTargetDevice(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer min-w-[200px]"
            >
              <option value="all">🌐 Toda la Flota</option>
              {deviceList.map((d) => (
                <option key={d.device_id} value={d.device_id}>
                  {d.device_id} • {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filtros de Período */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setFilterPeriod('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterPeriod === 'today' 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Hoy
            </button>
            <button
              onClick={() => setFilterPeriod('yesterday')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterPeriod === 'yesterday' 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ayer
            </button>
            <button
              onClick={() => setFilterPeriod('week')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterPeriod === 'week' 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Últimos 7 días
            </button>
            <button
              onClick={() => setFilterPeriod('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filterPeriod === 'all' 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos
            </button>
          </div>
        </div>

        {/* Tarjetas de Resumen KPI */}
        <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1.5 mb-1">
              <Navigation className="w-3.5 h-3.5 text-cyan-400" />
              <span>Total Viajes</span>
            </div>
            <div className="text-lg font-black text-white">{trips.length}</div>
            <div className="text-[11px] text-slate-400">{totalKm.toFixed(1)} km acumulados</div>
          </div>

          <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tiempo de Marcha</span>
            </div>
            <div className="text-lg font-black text-emerald-300">{formatDuration(totalDurationSec)}</div>
            <div className="text-[11px] text-slate-400">En ruta efectiva</div>
          </div>

          <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1.5 mb-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Tiempo Ralentí</span>
            </div>
            <div className="text-lg font-black text-amber-300">{formatDuration(totalIdlingSec)}</div>
            <div className="text-[11px] text-slate-400">Motor encendido quieto</div>
          </div>

          <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1.5 mb-1">
              <Gauge className="w-3.5 h-3.5 text-purple-400" />
              <span>Desperdicio Ralentí</span>
            </div>
            <div className="text-lg font-black text-purple-300">${totalFuelCostEst.toLocaleString('es-AR')}</div>
            <div className="text-[11px] text-slate-400">Vel. Máx: {maxSpeedOverall} km/h</div>
          </div>
        </div>

        {/* Mensaje de error si falla */}
        {errorMessage && (
          <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Cuerpo del Modal: Lista de Viajes */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
              <p className="text-xs">Consultando viajes telemáticos del vehículo...</p>
            </div>
          ) : trips.length === 0 ? (
            <div className="py-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-8">
              <Navigation className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-300">No se registraron viajes en este período</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Los viajes se segmentan y abren automáticamente cuando el vehículo enciende el motor (contacto ON) y se cierran al apagar el motor.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {trips.map((trip) => {
                const isCurrent = !trip.is_closed;

                return (
                  <div
                    key={trip.id}
                    className={`rounded-2xl p-4 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      isCurrent
                        ? 'bg-emerald-950/20 border-emerald-500/40 shadow-sm'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Información de Inicio y Fin */}
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isCurrent 
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse' 
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}>
                          {isCurrent ? 'EN CURSO' : 'FINALIZADO'}
                        </span>
                        <span className="text-xs font-bold text-white">
                          {formatDate(trip.start_time)}
                        </span>
                        <span className="text-xs text-cyan-400 font-mono font-bold">
                          {formatTime(trip.start_time)}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-xs text-slate-300 font-mono font-bold">
                          {isCurrent ? 'Ahora' : formatTime(trip.end_time)}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          ({formatDuration(trip.duration_seconds)})
                        </span>
                      </div>

                      {/* Métricas del Viaje */}
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                        <div>
                          Distancia: <strong className="text-white font-mono">{trip.distance_km.toFixed(1)} km</strong>
                        </div>
                        <div>
                          Vel. Promedio: <strong className="text-slate-200 font-mono">{trip.avg_speed_kmh} km/h</strong>
                        </div>
                        <div>
                          Vel. Máxima: <strong className="text-cyan-300 font-mono">{trip.max_speed_kmh} km/h</strong>
                        </div>
                        {trip.idling_seconds > 0 && (
                          <div className="text-amber-400 flex items-center gap-1">
                            <Flame className="w-3.5 h-3.5 text-amber-400" />
                            <span>Ralentí: <strong>{formatDuration(trip.idling_seconds)}</strong></span>
                            {trip.idling_fuel_cost_est > 0 && (
                              <span className="text-[10px] text-amber-500">
                                (~${trip.idling_fuel_cost_est.toLocaleString('es-AR')})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Botón de Reproducción */}
                    <div className="shrink-0">
                      <button
                        onClick={() => {
                          if (onSelectTripForPlayback) {
                            onSelectTripForPlayback(trip);
                            onClose();
                          }
                        }}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                        title="Ver trayectoria y reproducir recorrido en mapa"
                      >
                        <Play className="w-3.5 h-3.5 fill-cyan-400 text-cyan-400" />
                        <span>Reproducir Viaje</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-950/60 border-t border-slate-800 flex justify-between items-center">
          <span className="text-[11px] text-slate-500">
            {trips.length} viaje(s) encontrado(s) para {targetDevice}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
