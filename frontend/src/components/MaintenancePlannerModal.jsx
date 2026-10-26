import React, { useState, useEffect } from 'react';
import { 
  Wrench, X, Plus, Calendar, Gauge, Clock, 
  CheckCircle2, AlertTriangle, AlertCircle, Trash2, 
  History, DollarSign, RefreshCw, FileText, Check, ChevronRight
} from 'lucide-react';
import { 
  getDeviceMaintenance, 
  createMaintenancePlan, 
  recordMaintenanceService, 
  deleteMaintenancePlan,
  getMaintenanceLogs
} from '../services/api';

export default function MaintenancePlannerModal({ 
  isOpen, 
  onClose, 
  selectedDeviceId = 'all',
  deviceList = [],
  currentOdoKm = 0,
  currentEngineHours = 0
}) {
  const [activeTab, setActiveTab] = useState('plans'); // 'plans' | 'create' | 'history'
  const [targetDevice, setTargetDevice] = useState(
    selectedDeviceId !== 'all' ? selectedDeviceId : (deviceList[0]?.device_id || '')
  );
  const [plans, setPlans] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Modal interno para registrar service realizado
  const [recordModalPlan, setRecordModalPlan] = useState(null);
  const [recordForm, setRecordForm] = useState({
    executed_value: '',
    workshop: '',
    cost: '',
    notes: ''
  });

  // Formulario de nuevo plan
  const [newPlanForm, setNewPlanForm] = useState({
    title: '',
    service_type: 'KM',
    interval_value: '10000',
    last_service_value: '0',
    notes: ''
  });

  useEffect(() => {
    if (selectedDeviceId && selectedDeviceId !== 'all') {
      setTargetDevice(selectedDeviceId);
    } else if (deviceList.length > 0 && (!targetDevice || targetDevice === 'all')) {
      setTargetDevice(deviceList[0].device_id);
    }
  }, [selectedDeviceId, deviceList]);

  useEffect(() => {
    if (isOpen && targetDevice && targetDevice !== 'all') {
      loadData();
    }
  }, [isOpen, targetDevice, activeTab]);

  const loadData = async () => {
    if (!targetDevice || targetDevice === 'all') return;
    setLoading(true);
    setErrorMessage(null);
    try {
      if (activeTab === 'plans' || activeTab === 'create') {
        const data = await getDeviceMaintenance(targetDevice);
        setPlans(Array.isArray(data) ? data : []);
      }
      if (activeTab === 'history') {
        const historyData = await getMaintenanceLogs(targetDevice);
        setLogs(Array.isArray(historyData) ? historyData : []);
      }
    } catch (err) {
      console.error('Error al cargar datos de mantenimiento:', err);
      setErrorMessage(err.response?.data?.detail || 'Error al conectar con el servicio de mantenimiento');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRecord = (plan) => {
    setRecordModalPlan(plan);
    const suggestedValue = plan.service_type === 'KM' 
      ? Math.round(currentOdoKm || plan.current_vehicle_value || plan.current_reference_value || 0)
      : Math.round(currentEngineHours || plan.current_vehicle_value || plan.current_reference_value || 0);

    setRecordForm({
      executed_value: suggestedValue || '',
      workshop: '',
      cost: '',
      notes: ''
    });
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSubmitRecord = async (e) => {
    e.preventDefault();
    if (!recordModalPlan) return;
    setActionLoading(true);
    setErrorMessage(null);
    try {
      await recordMaintenanceService(recordModalPlan.id, {
        executed_value: parseFloat(recordForm.executed_value) || 0,
        workshop: recordForm.workshop.trim() || null,
        cost: recordForm.cost ? parseFloat(recordForm.cost) : null,
        notes: recordForm.notes.trim() || null
      });
      setSuccessMessage(`¡Service de '${recordModalPlan.title}' registrado con éxito! El próximo ciclo fue reprogramado automáticamente.`);
      setRecordModalPlan(null);
      await loadData();
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || 'Error al asentar el service');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreatePlan = async (e) => {
    e.preventDefault();
    if (!newPlanForm.title.trim()) {
      setErrorMessage('Por favor ingresa un título para el plan');
      return;
    }
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const intervalVal = parseFloat(newPlanForm.interval_value) || 10000;
      const lastVal = parseFloat(newPlanForm.last_service_value) || 0;
      await createMaintenancePlan(targetDevice, {
        title: newPlanForm.title.trim(),
        service_type: newPlanForm.service_type,
        interval_value: intervalVal,
        last_service_value: lastVal,
        next_service_value: lastVal + intervalVal,
        notes: newPlanForm.notes.trim() || null
      });
      setSuccessMessage(`Plan '${newPlanForm.title}' creado exitosamente.`);
      setNewPlanForm({
        title: '',
        service_type: 'KM',
        interval_value: '10000',
        last_service_value: '0',
        notes: ''
      });
      setActiveTab('plans');
      await loadData();
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || 'Error al crear el plan de mantenimiento');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePlan = async (planId, title) => {
    if (!window.confirm(`¿Seguro que deseas eliminar el plan '${title}'?`)) return;
    setActionLoading(true);
    try {
      await deleteMaintenancePlan(planId);
      setSuccessMessage(`Plan '${title}' eliminado.`);
      await loadData();
    } catch (err) {
      setErrorMessage(err.response?.data?.detail || 'Error al eliminar el plan');
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/60 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-inner">
              <Wrench className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Gestión de Mantenimiento Preventivo
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold uppercase">
                  Flota Pro
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Monitoreo automático por Horómetro y Odómetro telemático calibrado
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

        {/* Subheader: Selector de Vehículo y Pestañas */}
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
              {deviceList.map((d) => (
                <option key={d.device_id} value={d.device_id}>
                  {d.device_id} • {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => { setActiveTab('plans'); setErrorMessage(null); setSuccessMessage(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'plans' 
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Planes Activos ({plans.length})</span>
            </button>
            <button
              onClick={() => { setActiveTab('create'); setErrorMessage(null); setSuccessMessage(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'create' 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Plan</span>
            </button>
            <button
              onClick={() => { setActiveTab('history'); setErrorMessage(null); setSuccessMessage(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'history' 
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Historial</span>
            </button>
          </div>
        </div>

        {/* Mensajes de Feedback */}
        {errorMessage && (
          <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
              <p className="text-xs">Consultando telemetría y planes de mantenimiento...</p>
            </div>
          ) : activeTab === 'plans' ? (
            <div>
              {plans.length === 0 ? (
                <div className="py-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-8">
                  <Wrench className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-slate-300">No hay planes activos configurados</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
                    Configura alertas de mantenimiento preventivo por kilometraje (ej. cada 10.000 km) o por horas de motor (ej. cada 250 horas).
                  </p>
                  <button
                    onClick={() => setActiveTab('create')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Crear Primer Plan</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {plans.map((plan) => {
                    const isOverdue = plan.status === 'OVERDUE';
                    const isWarning = plan.status === 'WARNING';
                    
                    const badgeBg = isOverdue 
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' 
                      : isWarning 
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';

                    const barBg = isOverdue 
                      ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]' 
                      : isWarning 
                        ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.6)]' 
                        : 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]';

                    const unit = plan.service_type === 'KM' ? 'km' : (plan.service_type === 'HOURS' ? 'hs' : 'días');

                    return (
                      <div 
                        key={plan.id}
                        className={`rounded-2xl p-5 border transition-all ${
                          isOverdue 
                            ? 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/50' 
                            : isWarning 
                              ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500/50' 
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeBg}`}>
                                {isOverdue ? 'VENCIDO / URGENTE' : isWarning ? 'PRÓXIMO A VENCER' : 'AL DÍA (OK)'}
                              </span>
                              <span className="text-[10px] text-slate-500 uppercase font-semibold">
                                {plan.service_type === 'KM' ? 'Por Kilometraje' : 'Por Horómetro'}
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-white">{plan.title}</h4>
                            {plan.notes && (
                              <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{plan.notes}</p>
                            )}
                          </div>

                          <button
                            onClick={() => handleDeletePlan(plan.id, plan.title)}
                            disabled={actionLoading}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Eliminar Plan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Barra de Progreso */}
                        <div className="space-y-1.5 mb-4">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-400">Progreso del intervalo:</span>
                            <span className="font-bold text-slate-200">
                              {plan.progress_percentage ?? plan.progress_pct ?? 0}%
                            </span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${barBg}`}
                              style={{ width: `${Math.min(plan.progress_percentage ?? plan.progress_pct ?? 0, 100)}%` }}
                            />
                          </div>
                        </div>

                        {/* Métricas clave */}
                        <div className="grid grid-cols-3 gap-2 bg-slate-900/80 rounded-xl p-3 border border-slate-800/80 mb-4 text-center">
                          <div>
                            <div className="text-[10px] text-slate-400 uppercase">Actual</div>
                            <div className="text-xs font-bold text-white">
                              {Number(plan.current_vehicle_value ?? plan.current_reference_value ?? 0).toLocaleString()} {unit}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-400 uppercase">Próximo</div>
                            <div className="text-xs font-bold text-cyan-300">
                              {Number(plan.next_service_value).toLocaleString()} {unit}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-400 uppercase">Restante</div>
                            <div className={`text-xs font-bold ${
                              plan.remaining_value <= 0 ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-emerald-400'
                            }`}>
                              {plan.remaining_value <= 0 
                                ? `-${Math.abs(Number(plan.remaining_value)).toLocaleString()} ${unit}` 
                                : `${Number(plan.remaining_value).toLocaleString()} ${unit}`}
                            </div>
                          </div>
                        </div>

                        {/* Botón Asentar Service Realizado */}
                        <button
                          onClick={() => handleOpenRecord(plan)}
                          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Registrar Service Realizado</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === 'create' ? (
            <form onSubmit={handleCreatePlan} className="max-w-xl mx-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Título del Mantenimiento *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Cambio de Aceite 15W40 y Filtros"
                  value={newPlanForm.title}
                  onChange={(e) => setNewPlanForm({ ...newPlanForm, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Criterio de Intervalo
                  </label>
                  <select
                    value={newPlanForm.service_type}
                    onChange={(e) => {
                      const type = e.target.value;
                      setNewPlanForm({
                        ...newPlanForm,
                        service_type: type,
                        interval_value: type === 'KM' ? '10000' : '250'
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
                  >
                    <option value="KM">Kilometraje (Odómetro)</option>
                    <option value="HOURS">Horas de Motor (Horómetro)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Intervalo ({newPlanForm.service_type === 'KM' ? 'km' : 'hs'}) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="Ej: 10000"
                    value={newPlanForm.interval_value}
                    onChange={(e) => setNewPlanForm({ ...newPlanForm, interval_value: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Último Service Realizado a ({newPlanForm.service_type === 'KM' ? 'km' : 'hs'})
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="Ej: 45000"
                    value={newPlanForm.last_service_value}
                    onChange={(e) => setNewPlanForm({ ...newPlanForm, last_service_value: e.target.value })}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = newPlanForm.service_type === 'KM' 
                        ? Math.round(currentOdoKm || 0) 
                        : Math.round(currentEngineHours || 0);
                      setNewPlanForm({ ...newPlanForm, last_service_value: val.toString() });
                    }}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700"
                  >
                    Usar Valor Actual
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  El primer vencimiento se programará a: { (parseFloat(newPlanForm.last_service_value) || 0) + (parseFloat(newPlanForm.interval_value) || 0) } {newPlanForm.service_type === 'KM' ? 'km' : 'hs'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Notas / Especificaciones Técnicas
                </label>
                <textarea
                  rows="2"
                  placeholder="Ej: Utilizar aceite sintético Mobil Delvac 15W40 y filtro original Mann Filter W950"
                  value={newPlanForm.notes}
                  onChange={(e) => setNewPlanForm({ ...newPlanForm, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('plans')}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                >
                  {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>Guardar y Activar Plan</span>
                </button>
              </div>
            </form>
          ) : (
            <div>
              {logs.length === 0 ? (
                <div className="py-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-8">
                  <History className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-sm font-bold text-slate-300">Sin historial de mantenimientos registrados</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                    Cada vez que asientes un service realizado, quedará archivada la fecha, odómetro/horómetro de ejecución, costo y taller mecánico.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs text-slate-400 font-bold uppercase mb-2 flex items-center justify-between">
                    <span>Libro de Mantenimientos Realizados ({logs.length})</span>
                  </div>
                  <div className="divide-y divide-slate-800/80 bg-slate-950/60 rounded-2xl border border-slate-800 overflow-hidden">
                    {logs.map((log) => (
                      <div key={log.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/40 transition-colors">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-white text-xs">{log.plan_title || 'Service Preventivo'}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                              {new Date(log.executed_at).toLocaleDateString('es-AR')}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-3">
                            <span>Valor ejecutado: <strong className="text-cyan-300">{Number(log.executed_value).toLocaleString()}</strong></span>
                            {log.workshop && <span>Taller: <strong className="text-slate-200">{log.workshop}</strong></span>}
                          </div>
                          {log.notes && (
                            <p className="text-[11px] text-slate-500 mt-1 italic">"{log.notes}"</p>
                          )}
                        </div>

                        {log.cost != null && (
                          <div className="text-right shrink-0">
                            <div className="text-[10px] text-slate-500 uppercase">Costo Total</div>
                            <div className="text-xs font-bold text-emerald-400">
                              ${Number(log.cost).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950/60 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
          >
            Cerrar
          </button>
        </div>

      </div>

      {/* Submodal para Registrar Service Realizado */}
      {recordModalPlan && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">
                  Asentar Service: {recordModalPlan.title}
                </h3>
              </div>
              <button 
                onClick={() => setRecordModalPlan(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitRecord} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Valor al Momento del Service ({recordModalPlan.service_type === 'KM' ? 'km' : 'hs'}) *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={recordForm.executed_value}
                  onChange={(e) => setRecordForm({ ...recordForm, executed_value: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  El nuevo vencimiento se programará a {(parseFloat(recordForm.executed_value) || 0) + (recordModalPlan.interval_value || 0)} {recordModalPlan.service_type === 'KM' ? 'km' : 'hs'}.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Taller Mecánico / Proveedor
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Taller Central San Juan"
                    value={recordForm.workshop}
                    onChange={(e) => setRecordForm({ ...recordForm, workshop: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Costo Total ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ej: 145000"
                    value={recordForm.cost}
                    onChange={(e) => setRecordForm({ ...recordForm, cost: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Notas / Repuestos Utilizados
                </label>
                <textarea
                  rows="2"
                  placeholder="Detalle de trabajos, factura N°, observaciones técnicas..."
                  value={recordForm.notes}
                  onChange={(e) => setRecordForm({ ...recordForm, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setRecordModalPlan(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Confirmar y Reprogramar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
