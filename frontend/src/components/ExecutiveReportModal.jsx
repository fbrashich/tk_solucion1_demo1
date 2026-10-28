import React, { useState } from 'react';
import {
  FileText, X, Calendar, Download, CheckCircle2,
  AlertTriangle, Truck, Clock, Fuel, ShieldAlert,
  Wrench, Activity, ChevronRight, Loader2, Sparkles
} from 'lucide-react';
import { downloadExecutiveReportPdf } from '../services/api';

export default function ExecutiveReportModal({
  isOpen,
  onClose,
  selectedDeviceId = 'all',
  deviceList = []
}) {
  const [targetScope, setTargetScope] = useState(
    selectedDeviceId && selectedDeviceId !== 'all' ? selectedDeviceId : 'all'
  );
  const [dateRangePreset, setDateRangePreset] = useState('30d'); // '7d' | '30d' | 'month' | 'custom'
  const [customFromDate, setCustomFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [customToDate, setCustomToDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });

  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  // Calcular fechas según preset
  const calculateDates = () => {
    const now = new Date();
    let fromDate = null;
    let toDate = now.toISOString();

    if (dateRangePreset === '7d') {
      const from = new Date();
      from.setDate(now.getDate() - 7);
      from.setHours(0, 0, 0, 0);
      fromDate = from.toISOString();
    } else if (dateRangePreset === '30d') {
      const from = new Date();
      from.setDate(now.getDate() - 30);
      from.setHours(0, 0, 0, 0);
      fromDate = from.toISOString();
    } else if (dateRangePreset === 'month') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      fromDate = from.toISOString();
    } else if (dateRangePreset === 'custom') {
      if (customFromDate) {
        fromDate = new Date(customFromDate + 'T00:00:00').toISOString();
      }
      if (customToDate) {
        toDate = new Date(customToDate + 'T23:59:59').toISOString();
      }
    }

    return { fromDate, toDate };
  };

  const handleDownload = async () => {
    setDownloading(true);
    setErrorMessage('');
    setDownloadSuccess(false);

    try {
      const { fromDate, toDate } = calculateDates();
      await downloadExecutiveReportPdf(targetScope, fromDate, toDate);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (err) {
      console.error("Error al generar reporte PDF:", err);
      const detail = err.response?.data?.detail || "Error al generar o descargar el reporte en PDF.";
      setErrorMessage(detail);
    } finally {
      setDownloading(false);
    }
  };

  const selectedVehicleObj = deviceList.find(d => String(d.device_id) === String(targetScope));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div 
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header con gradiente */}
        <div className="relative px-6 py-5 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold text-white tracking-wide">Reporte Ejecutivo Corporativo</h3>
                <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> PDF v0.6.0
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Auditoría consolidada, KPIs operacionales, costo en $ de ralentí y semáforo preventivo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Mensajes de feedback */}
          {errorMessage && (
            <div className="p-3.5 bg-red-950/50 border border-red-500/40 rounded-xl flex items-center space-x-3 text-red-200 text-sm">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {downloadSuccess && (
            <div className="p-3.5 bg-emerald-950/50 border border-emerald-500/40 rounded-xl flex items-center space-x-3 text-emerald-200 text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>El PDF se ha generado y descargado exitosamente.</span>
            </div>
          )}

          {/* 1. Selector de Alcance (Flota o Vehículo) */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              1. Alcance del Reporte
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTargetScope('all')}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-center space-x-3 ${
                  targetScope === 'all'
                    ? 'bg-indigo-600/15 border-indigo-500 text-white shadow-lg shadow-indigo-500/10'
                    : 'bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                }`}
              >
                <div className={`p-2 rounded-lg ${targetScope === 'all' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-700 text-slate-400'}`}>
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-sm">Toda la Flota</div>
                  <div className="text-xs text-slate-400">Consolidado general ({deviceList.length} vehículos)</div>
                </div>
              </button>

              <div className="relative">
                <select
                  value={targetScope === 'all' ? '' : targetScope}
                  onChange={(e) => setTargetScope(e.target.value || 'all')}
                  className={`w-full h-full p-3.5 rounded-xl border appearance-none text-left transition-all text-sm font-medium focus:outline-none ${
                    targetScope !== 'all'
                      ? 'bg-indigo-600/15 border-indigo-500 text-white'
                      : 'bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                  }`}
                >
                  <option value="" className="bg-slate-900 text-slate-400">
                    -- O elegir un vehículo individual --
                  </option>
                  {deviceList.map((d) => (
                    <option key={d.device_id} value={d.device_id} className="bg-slate-900 text-white">
                      {d.name || d.device_id} {d.plate ? `(${d.plate})` : ''}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <ChevronRight className="w-4 h-4 rotate-90" />
                </div>
              </div>
            </div>

            {targetScope !== 'all' && selectedVehicleObj && (
              <div className="mt-2.5 p-2.5 bg-slate-800/40 border border-slate-700/50 rounded-lg text-xs text-slate-300 flex items-center justify-between">
                <span>Vehículo seleccionado: <strong>{selectedVehicleObj.name || selectedVehicleObj.device_id}</strong></span>
                <span className="text-slate-400">IMEI: {selectedVehicleObj.imei || selectedVehicleObj.traccar_unique_id || 'N/A'}</span>
              </div>
            )}
          </div>

          {/* 2. Rango Temporal */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              2. Período de Análisis
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {[
                { id: '7d', label: 'Últimos 7 días' },
                { id: '30d', label: 'Últimos 30 días' },
                { id: 'month', label: 'Este mes' },
                { id: 'custom', label: 'Personalizado' }
              ].map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setDateRangePreset(preset.id)}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border transition-all ${
                    dateRangePreset === preset.id
                      ? 'bg-indigo-600 border-indigo-400 text-white shadow-sm'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {dateRangePreset === 'custom' && (
              <div className="p-3.5 bg-slate-800/40 border border-slate-700/50 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fadeIn">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Desde fecha:</label>
                  <input
                    type="date"
                    value={customFromDate}
                    onChange={(e) => setCustomFromDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Hasta fecha:</label>
                  <input
                    type="date"
                    value={customToDate}
                    onChange={(e) => setCustomToDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 3. Previsualización de Secciones Incluidas en el PDF */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              3. Módulos Auditados en el Documento
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="p-3 bg-slate-800/30 border border-slate-700/50 rounded-xl flex items-start space-x-3">
                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg shrink-0 mt-0.5">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-200">Resumen Operacional y KPIs</div>
                  <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
                    Kilometraje total, horas de motor, velocidad promedio y máxima.
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-800/30 border border-slate-700/50 rounded-xl flex items-start space-x-3">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg shrink-0 mt-0.5">
                  <Fuel className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-200">Costos de Ralentí Ineficiente</div>
                  <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
                    Cálculo de litros desperdiciados y costo financiero en pesos ($).
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-800/30 border border-slate-700/50 rounded-xl flex items-start space-x-3">
                <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg shrink-0 mt-0.5">
                  <Wrench className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-200">Semáforo de Mantenimiento</div>
                  <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
                    Estado preventivo, desgaste y días restantes para próximo service.
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-800/30 border border-slate-700/50 rounded-xl flex items-start space-x-3">
                <div className="p-2 bg-red-500/10 text-red-400 rounded-lg shrink-0 mt-0.5">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-200">Incidentes y Seguridad</div>
                  <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
                    Historial de eventos críticos, excesos de velocidad y geocercas.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer con botón de acción */}
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-400 hidden sm:block">
            Formato: <strong>PDF A4 Vectorial Corporativo</strong>
          </div>
          <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={downloading}
              className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center space-x-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generando PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Descargar Reporte PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
