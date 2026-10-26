import React, { useState, useEffect } from 'react';
import { 
  Compass, Gauge, Check, X, Sliders, AlertCircle, 
  Sparkles, RefreshCw, Save, ArrowRight, ShieldCheck,
  HelpCircle, Car
} from 'lucide-react';
import { updateDeviceCalibration } from '../services/api';

export default function DeviceCalibrationModal({ 
  isOpen, 
  onClose, 
  device, 
  status, 
  onSuccess 
}) {
  const [tab, setTab] = useState('dashboard'); // 'dashboard' | 'manual'
  const [dashboardOdometer, setDashboardOdometer] = useState('');
  const [dashboardEngineHours, setDashboardEngineHours] = useState('');
  const [manualOdoOffset, setManualOdoOffset] = useState('');
  const [manualHoursOffset, setManualHoursOffset] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Distancia GPS virtual pura en km (sin offsets)
  const gpsTotalMeters = 
    status?.raw_data?.normalized?.totalDistance ?? 
    status?.raw_data?.attributes?.totalDistance ?? 
    0;
  const gpsVirtualKm = Math.round((Number(gpsTotalMeters) / 1000.0) * 10) / 10;
  
  // Horas acumuladas por el software
  const baseEngineHours = Math.round((Number(status?.engine_hours || 0)) * 100) / 100;

  // Offsets actuales del equipo
  const currentOdoOffset = Number(device?.odometer_offset_km || status?.odometer_offset_km || 0);
  const currentHoursOffset = Number(device?.engine_hours_offset || status?.engine_hours_offset || 0);

  // Inicializar campos al abrir modal
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setSuccessMsg(null);
      
      const currentCalibratedOdo = Math.round((gpsVirtualKm + currentOdoOffset) * 10) / 10;
      const currentCalibratedHours = Math.round((baseEngineHours + currentHoursOffset) * 100) / 100;

      setDashboardOdometer(currentCalibratedOdo > 0 ? String(currentCalibratedOdo) : '');
      setDashboardEngineHours(currentCalibratedHours > 0 ? String(currentCalibratedHours) : '');
      setManualOdoOffset(String(currentOdoOffset));
      setManualHoursOffset(String(currentHoursOffset));
    }
  }, [isOpen, gpsVirtualKm, baseEngineHours, currentOdoOffset, currentHoursOffset]);

  if (!isOpen || !device) return null;

  // Cálculos en vivo para pestaña "Tablero"
  const inputOdoVal = parseFloat(dashboardOdometer);
  const calculatedOdoOffset = !isNaN(inputOdoVal) 
    ? Math.max(0, Math.round((inputOdoVal - gpsVirtualKm) * 100) / 100)
    : currentOdoOffset;
  const previewFinalOdo = !isNaN(inputOdoVal) 
    ? inputOdoVal 
    : (gpsVirtualKm + calculatedOdoOffset);

  const inputHoursVal = parseFloat(dashboardEngineHours);
  const calculatedHoursOffset = !isNaN(inputHoursVal)
    ? Math.max(0, Math.round((inputHoursVal - baseEngineHours) * 100) / 100)
    : currentHoursOffset;
  const previewFinalHours = !isNaN(inputHoursVal)
    ? inputHoursVal
    : (baseEngineHours + calculatedHoursOffset);

  // Cálculos en vivo para pestaña "Manual"
  const manualOdoNum = parseFloat(manualOdoOffset) || 0;
  const manualHoursNum = parseFloat(manualHoursOffset) || 0;
  const manualPreviewOdo = Math.round((gpsVirtualKm + manualOdoNum) * 10) / 10;
  const manualPreviewHours = Math.round((baseEngineHours + manualHoursNum) * 100) / 100;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      let payload = {};
      if (tab === 'dashboard') {
        payload = {
          current_dashboard_odometer_km: !isNaN(inputOdoVal) ? inputOdoVal : undefined,
          current_dashboard_engine_hours: !isNaN(inputHoursVal) ? inputHoursVal : undefined
        };
      } else {
        payload = {
          odometer_offset_km: !isNaN(manualOdoNum) ? manualOdoNum : 0,
          engine_hours_offset: !isNaN(manualHoursNum) ? manualHoursNum : 0
        };
      }

      await updateDeviceCalibration(device.device_id, payload);
      setSuccessMsg('¡Calibración guardada exitosamente! Las métricas fueron actualizadas.');
      
      if (onSuccess) {
        setTimeout(async () => {
          await onSuccess();
          onClose();
        }, 900);
      }
    } catch (err) {
      console.error('Error al guardar calibración:', err);
      const msg = err.response?.data?.detail || 'Error al guardar la calibración del equipo';
      setErrorMsg(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div className="relative px-6 py-5 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Calibración de Odómetro y Horómetro</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                  Etapa 2
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                {device.name} <span className="font-mono text-slate-500">({device.device_id})</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pestañas de Modo */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 p-2 gap-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => setTab('dashboard')}
            className={`flex-1 py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              tab === 'dashboard'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Car className="w-4 h-4" />
            <span>Por Tablero Físico (Recomendado)</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('manual')}
            className={`flex-1 py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              tab === 'manual'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Ajuste Directo de Offsets</span>
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2.5">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Banner de Contexto Técnico */}
          <div className="p-4 rounded-2xl bg-slate-800/40 border border-slate-700/60 text-xs text-slate-300 space-y-2">
            <div className="flex items-center gap-2 text-cyan-400 font-bold">
              <Sparkles className="w-4 h-4" />
              <span>Sincronización Inteligente sin reseteo de Hardware</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              El GPS Teltonika acumula distancia virtual desde su primer encendido ({gpsVirtualKm.toLocaleString()} km). Para que la plataforma refleje exactamente el kilometraje y horas que ven los choferes y mecánicos en el vehículo físico, se aplica un factor de traslación seguro.
            </p>
          </div>

          {tab === 'dashboard' ? (
            /* Modo 1: Por Tablero Físico */
            <div className="space-y-4">
              {/* Odómetro del Tablero */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-cyan-400" />
                    <span>Kilometraje Actual en Tablero del Vehículo (km)</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    GPS Base: {gpsVirtualKm.toLocaleString()} km
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Ej. 125430"
                    value={dashboardOdometer}
                    onChange={(e) => setDashboardOdometer(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  />
                  <span className="absolute right-3.5 top-3 text-xs text-slate-400 font-bold">km</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                  <span>Offset calculado automáticamente:</span>
                  <span className="font-mono font-bold text-cyan-400">+{calculatedOdoOffset.toLocaleString()} km</span>
                </div>
              </div>

              {/* Horómetro del Tablero */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-purple-400" />
                    <span>Horas de Motor Actuales en Tablero (hs)</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    Ignición Base: {baseEngineHours.toLocaleString()} hs
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Ej. 1450.5"
                    value={dashboardEngineHours}
                    onChange={(e) => setDashboardEngineHours(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  />
                  <span className="absolute right-3.5 top-3 text-xs text-slate-400 font-bold">hs</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                  <span>Offset de horas calculado:</span>
                  <span className="font-mono font-bold text-purple-400">+{calculatedHoursOffset.toLocaleString()} hs</span>
                </div>
              </div>

              {/* Tarjeta de Previsualización en Vivo */}
              <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 space-y-2">
                <span className="text-[11px] uppercase font-bold text-cyan-400 tracking-wider block">
                  Vista Previa en el Dashboard
                </span>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Odómetro Final</span>
                    <span className="text-base font-black font-mono text-white">
                      {previewFinalOdo.toLocaleString()} <span className="text-xs text-cyan-400 font-normal">km</span>
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Horómetro Final</span>
                    <span className="text-base font-black font-mono text-white">
                      {previewFinalHours.toLocaleString()} <span className="text-xs text-purple-400 font-normal">hs</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Modo 2: Ajuste Directo de Offsets */
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-200">
                  Offset Adicional de Odómetro (odometer_offset_km)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0.0"
                    value={manualOdoOffset}
                    onChange={(e) => setManualOdoOffset(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-cyan-500"
                  />
                  <span className="absolute right-3.5 top-3 text-xs text-slate-400 font-bold">km</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Total resultante: <strong className="text-white font-mono">{manualPreviewOdo.toLocaleString()} km</strong> ({gpsVirtualKm.toLocaleString()} GPS + {manualOdoNum.toLocaleString()} offset)
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-200">
                  Offset Adicional de Horas (engine_hours_offset)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0.0"
                    value={manualHoursOffset}
                    onChange={(e) => setManualHoursOffset(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-purple-500"
                  />
                  <span className="absolute right-3.5 top-3 text-xs text-slate-400 font-bold">hs</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Total resultante: <strong className="text-white font-mono">{manualPreviewHours.toLocaleString()} hs</strong> ({baseEngineHours.toLocaleString()} Base + {manualHoursNum.toLocaleString()} offset)
                </p>
              </div>
            </div>
          )}

          {/* Botones de Acción */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Guardar Calibración</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
