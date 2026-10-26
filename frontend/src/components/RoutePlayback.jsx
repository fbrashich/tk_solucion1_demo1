import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, RotateCcw, X, FastForward, 
  Gauge, Clock, Navigation, MapPin, Compass, 
  Layers, CheckCircle2, AlertTriangle, RefreshCw
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getTripRoute } from '../services/api';

// Helper de Leaflet para centrar y ajustar zoom automáticamente a la trayectoria
function FitTripBounds({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords && coords.length > 0) {
      const bounds = L.latLngBounds(coords);
      map.fitBounds(bounds, { padding: [50, 50], animate: true });
    }
  }, [coords, map]);
  return null;
}

// Icono animado del vehículo en movimiento con orientación (Course / Heading)
const createVehiclePlaybackIcon = (course = 0, isIgnition = true) => {
  const rotation = Math.round(course || 0);
  const color = isIgnition ? '#10b981' : '#f59e0b';

  return L.divIcon({
    className: 'playback-vehicle-marker',
    html: `
      <div style="position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; transform: rotate(${rotation}deg); transition: transform 0.2s linear;">
        <div style="width: 28px; height: 28px; border-radius: 50%; background: #0f172a; border: 3px solid ${color}; box-shadow: 0 0 16px ${color}; display: flex; align-items: center; justify-content: center;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg">
            <polygon points="12,2 22,22 12,17 2,22" />
          </svg>
        </div>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });
};

const createStartEndMarker = (isStart = true) => {
  const bg = isStart ? '#10b981' : '#f43f5e';
  const label = isStart ? 'A' : 'B';
  return L.divIcon({
    className: 'trip-flag-marker',
    html: `
      <div style="width: 24px; height: 24px; border-radius: 50%; background: ${bg}; color: white; font-weight: bold; font-size: 11px; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.5);">
        ${label}
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
};

export default function RoutePlayback({
  isOpen,
  onClose,
  trip
}) {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1x, 2x, 5x, 10x
  const [errorMessage, setErrorMessage] = useState(null);

  const timerRef = useRef(null);

  useEffect(() => {
    if (isOpen && trip?.id) {
      loadRoutePoints();
    } else {
      setIsPlaying(false);
      setCurrentIndex(0);
      setPoints([]);
    }
  }, [isOpen, trip]);

  const loadRoutePoints = async () => {
    setLoading(true);
    setErrorMessage(null);
    setCurrentIndex(0);
    setIsPlaying(false);
    try {
      const data = await getTripRoute(trip.id);
      if (data && Array.isArray(data.points) && data.points.length > 0) {
        setPoints(data.points);
      } else {
        // Fallback: si no hay puntos en telemetry_events, usar puntos inicial y final del viaje
        if (trip.start_latitude && trip.start_longitude) {
          setPoints([
            {
              latitude: trip.start_latitude,
              longitude: trip.start_longitude,
              speed: 0.0,
              course: 0.0,
              timestamp: trip.start_time,
              ignition_state: true
            },
            {
              latitude: trip.end_latitude || trip.start_latitude,
              longitude: trip.end_longitude || trip.start_longitude,
              speed: trip.max_speed_kmh || 0.0,
              course: 0.0,
              timestamp: trip.end_time || trip.start_time,
              ignition_state: false
            }
          ]);
        } else {
          setErrorMessage('No hay suficientes coordenadas telemáticas registradas para reproducir este viaje');
        }
      }
    } catch (err) {
      console.error('Error al cargar coordenadas del viaje:', err);
      setErrorMessage(err.response?.data?.detail || 'Error al descargar la trayectoria del viaje');
    } finally {
      setLoading(false);
    }
  };

  // Motor de Reproducción de Fotogramas
  useEffect(() => {
    if (isPlaying && points.length > 0) {
      const intervalMs = Math.max(80, Math.floor(1000 / (10 * playbackSpeed)));

      timerRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= points.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, points, playbackSpeed]);

  if (!isOpen || !trip) return null;

  const currentPoint = points[currentIndex] || points[0] || null;
  const polylineCoords = points.map((p) => [p.latitude, p.longitude]);
  const progressPercent = points.length > 1 ? Math.round((currentIndex / (points.length - 1)) * 100) : 0;

  const handleSeek = (e) => {
    const newIdx = parseInt(e.target.value, 10);
    setCurrentIndex(newIdx);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
  };

  const togglePlay = () => {
    if (currentIndex >= points.length - 1) {
      setCurrentIndex(0);
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-6xl h-[92vh] shadow-2xl overflow-hidden flex flex-col">
        
        {/* Cabecera del Reproductor */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-950/80 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shadow-inner">
              <Compass className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                Reproductor de Recorrido Playback
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold uppercase">
                  {trip.device_id}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Viaje del {new Date(trip.start_time).toLocaleDateString('es-AR')} • {trip.distance_km?.toFixed(1)} km • {Math.round(trip.duration_seconds / 60)} min
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mensaje de error si no hay puntos */}
        {errorMessage && (
          <div className="m-4 px-4 py-2.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Mapa Central con Leaflet */}
        <div className="relative flex-1 bg-slate-950 overflow-hidden">
          {loading ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/90 text-slate-400">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
              <p className="text-xs">Descargando traza GPS punto a punto...</p>
            </div>
          ) : points.length > 0 ? (
            <MapContainer
              center={[points[0].latitude, points[0].longitude]}
              zoom={14}
              className="w-full h-full"
              zoomControl={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              />

              {/* Centrador automático a la trayectoria */}
              <FitTripBounds coords={polylineCoords} />

              {/* Trayectoria Completa del Viaje */}
              <Polyline
                positions={polylineCoords}
                pathOptions={{
                  color: '#06b6d4',
                  weight: 5,
                  opacity: 0.85,
                  lineJoin: 'round'
                }}
              />

              {/* Marcador Punto Inicial A */}
              {points.length > 0 && (
                <Marker
                  position={[points[0].latitude, points[0].longitude]}
                  icon={createStartEndMarker(true)}
                >
                  <Popup>
                    <div className="text-xs font-bold">Punto de Salida</div>
                    <div className="text-[10px] text-slate-600">
                      {new Date(points[0].timestamp).toLocaleTimeString('es-AR')}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Marcador Punto Final B */}
              {points.length > 1 && (
                <Marker
                  position={[points[points.length - 1].latitude, points[points.length - 1].longitude]}
                  icon={createStartEndMarker(false)}
                >
                  <Popup>
                    <div className="text-xs font-bold">Punto de Destino / Apagado</div>
                    <div className="text-[10px] text-slate-600">
                      {new Date(points[points.length - 1].timestamp).toLocaleTimeString('es-AR')}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Vehículo en Movimiento con Orientación */}
              {currentPoint && (
                <Marker
                  position={[currentPoint.latitude, currentPoint.longitude]}
                  icon={createVehiclePlaybackIcon(currentPoint.course, currentPoint.ignition_state)}
                >
                  <Popup>
                    <div className="text-xs font-bold text-slate-900">{trip.device_id}</div>
                    <div className="text-xs">Velocidad: {currentPoint.speed} km/h</div>
                    <div className="text-[10px] text-slate-600">
                      {new Date(currentPoint.timestamp).toLocaleTimeString('es-AR')}
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs">
              No hay coordenadas disponibles para reproducir.
            </div>
          )}

          {/* HUD Flotante Telemático en Vivo */}
          {currentPoint && (
            <div className="absolute top-4 left-4 z-20 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 shadow-2xl flex items-center gap-6 text-white pointer-events-none">
              {/* Velocímetro Digital */}
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <Gauge className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Velocidad
                  </span>
                  <div className="font-mono font-black text-xl text-white">
                    {Math.round(currentPoint.speed || 0)} <span className="text-xs text-slate-400 font-normal">km/h</span>
                  </div>
                </div>
              </div>

              {/* Hora del Evento */}
              <div className="flex items-center gap-3 border-l border-slate-800 pl-4">
                <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Hora Telemetría
                  </span>
                  <div className="font-mono font-bold text-sm text-purple-300">
                    {new Date(currentPoint.timestamp).toLocaleTimeString('es-AR', { hour12: false })}
                  </div>
                </div>
              </div>

              {/* Rumbo y Estado de Ignición */}
              <div className="hidden sm:flex items-center gap-3 border-l border-slate-800 pl-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Motor
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    currentPoint.ignition_state 
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}>
                    {currentPoint.ignition_state ? 'ENCENDIDO' : 'APAGADO'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Panel Inferior: Controles de Reproducción y Barra de Tiempo */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-col gap-3">
          
          {/* Barra de Tiempo (Scrubber) */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-cyan-400 font-bold shrink-0">
              {currentIndex + 1}/{points.length}
            </span>
            <input
              type="range"
              min="0"
              max={Math.max(0, points.length - 1)}
              value={currentIndex}
              onChange={handleSeek}
              disabled={points.length === 0}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
            />
            <span className="text-xs font-mono text-slate-400 shrink-0">
              {progressPercent}%
            </span>
          </div>

          {/* Botones de Control */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlay}
                disabled={points.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black transition-all active:scale-95 cursor-pointer shadow-lg shadow-cyan-500/20 disabled:opacity-50"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-slate-950" /> : <Play className="w-4 h-4 fill-slate-950" />}
                <span>{isPlaying ? 'Pausar' : 'Reproducir'}</span>
              </button>

              <button
                onClick={handleReset}
                disabled={points.length === 0}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700 active:scale-95 cursor-pointer disabled:opacity-50"
                title="Reiniciar desde el inicio"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Selector de Velocidad de Reproducción */}
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 font-bold uppercase px-2">Velocidad:</span>
              {[1, 2, 5, 10].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    playbackSpeed === spd
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-400 font-mono hidden md:block">
              Punto Actual: {currentPoint ? `${currentPoint.latitude.toFixed(5)}, ${currentPoint.longitude.toFixed(5)}` : '--'}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
