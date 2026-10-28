import React, { useState, useEffect } from 'react';
import {
  executeEngineCut,
  getEngineStatus,
  getDeviceCommandLogs,
  cancelPendingCommand,
  setDeviceSecurityPin
} from '../services/api';

export default function EngineCutModal({ device, isOpen, onClose, onStatusChange }) {
  const [activeTab, setActiveTab] = useState('command'); // 'command' | 'history' | 'pin_setup'
  const [engineStatus, setEngineStatus] = useState(null);
  const [commandLogs, setCommandLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Formulario de Comando
  const [pinOrPassword, setPinOrPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notes, setNotes] = useState('');
  const [confirmCut, setConfirmCut] = useState(false);

  // Formulario de Configuración de PIN
  const [currentAccountPassword, setCurrentAccountPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');

  useEffect(() => {
    if (isOpen && device) {
      loadStatusAndLogs();
      setErrorMsg('');
      setSuccessMsg('');
      setPinOrPassword('');
      setNotes('');
      setConfirmCut(false);
    }
  }, [isOpen, device]);

  const loadStatusAndLogs = async () => {
    if (!device) return;
    setLoading(true);
    try {
      const [statusData, logsData] = await Promise.all([
        getEngineStatus(device.device_id),
        getDeviceCommandLogs(device.device_id, 20)
      ]);
      setEngineStatus(statusData);
      setCommandLogs(logsData);
    } catch (err) {
      console.error("Error cargando estado de inmovilizador:", err);
      setErrorMsg(err.response?.data?.detail || "No se pudo obtener el estado del motor.");
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async (action) => {
    if (!pinOrPassword.trim()) {
      setErrorMsg("Debe ingresar su contraseña o PIN de seguridad para autorizar la acción.");
      return;
    }

    setExecuting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await executeEngineCut(device.device_id, action, pinOrPassword, notes);
      setSuccessMsg(res.message);
      setPinOrPassword('');
      setNotes('');
      setConfirmCut(false);
      await loadStatusAndLogs();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      console.error("Error ejecutando comando:", err);
      setErrorMsg(err.response?.data?.detail || "Error ejecutando el comando telemático.");
    } finally {
      setExecuting(false);
    }
  };

  const handleCancelPending = async (cmdId) => {
    if (!cmdId) return;
    if (!window.confirm("¿Confirma la cancelación del corte encolado? El vehículo continuará su marcha con normalidad.")) return;

    setExecuting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await cancelPendingCommand(cmdId);
      setSuccessMsg(res.message);
      await loadStatusAndLogs();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Error cancelando el comando pendiente.");
    } finally {
      setExecuting(false);
    }
  };

  const handleSavePin = async (e) => {
    e.preventDefault();
    if (newPin !== confirmNewPin) {
      setErrorMsg("Los PINs ingresados no coinciden.");
      return;
    }
    if (newPin.length < 4 || newPin.length > 8) {
      setErrorMsg("El PIN debe tener entre 4 y 8 dígitos numéricos.");
      return;
    }

    setExecuting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await setDeviceSecurityPin(device.device_id, currentAccountPassword, newPin);
      setSuccessMsg(res.message);
      setCurrentAccountPassword('');
      setNewPin('');
      setConfirmNewPin('');
      await loadStatusAndLogs();
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Error configurando el PIN de seguridad.");
    } finally {
      setExecuting(false);
    }
  };

  if (!isOpen || !device) return null;

  const currentSpeed = engineStatus?.current_speed_kmh ?? device.last_speed ?? 0.0;
  const isMoving = currentSpeed > 5.0;
  const isImmobilized = engineStatus?.immobilizer_status === 'IMMOBILIZED' || device.immobilizer_status === 'IMMOBILIZED';
  const isPendingCut = engineStatus?.immobilizer_status === 'PENDING_CUT' || device.immobilizer_status === 'PENDING_CUT';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Encabezado */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-xl ${
              isImmobilized ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
              isPendingCut ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse' :
              'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Control de Inmovilizador Remoto
                </h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  v0.6.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Unidad: <span className="font-semibold text-slate-200">{device.name}</span> ({device.device_id})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Pestañas de Navegación */}
        <div className="flex border-b border-slate-800 bg-slate-900/50 px-6 pt-2">
          <button
            onClick={() => setActiveTab('command')}
            className={`pb-3 px-4 text-xs font-bold transition border-b-2 ${
              activeTab === 'command'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚡ Control de Motor
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 px-4 text-xs font-bold transition border-b-2 ${
              activeTab === 'history'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            📋 Auditoría de Comandos ({commandLogs.length})
          </button>
          <button
            onClick={() => setActiveTab('pin_setup')}
            className={`pb-3 px-4 text-xs font-bold transition border-b-2 ${
              activeTab === 'pin_setup'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🔐 PIN de Seguridad
          </button>
        </div>

        {/* Mensajes de feedback */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
            <svg className="w-4 h-4 shrink-0 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2">
            <svg className="w-4 h-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Contenido Principal */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* TAB 1: COMANDO Y SAFETY INTERLOCK */}
          {activeTab === 'command' && (
            <div className="space-y-6">
              
              {/* Badge de Estado Actual y Velocidad */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center space-x-3">
                  <div className={`w-3.5 h-3.5 rounded-full ${
                    isImmobilized ? 'bg-rose-500 ring-4 ring-rose-500/20' :
                    isPendingCut ? 'bg-amber-500 ring-4 ring-amber-500/20 animate-pulse' :
                    'bg-emerald-500 ring-4 ring-emerald-500/20'
                  }`} />
                  <div>
                    <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">
                      Estado del Inmovilizador
                    </span>
                    <span className={`text-sm font-bold ${
                      isImmobilized ? 'text-rose-400' :
                      isPendingCut ? 'text-amber-400' :
                      'text-emerald-400'
                    }`}>
                      {isImmobilized ? '🛑 INMOVILIZADO (Motor Cortado)' :
                       isPendingCut ? '⏳ CORTE ENCOLADO (Esperando Detención)' :
                       '🟢 HABILITADO PARA ARRANQUE'}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">
                      Velocidad en Tiempo Real
                    </span>
                    <span className="text-xl font-extrabold text-white">
                      {currentSpeed.toFixed(1)} <span className="text-xs text-slate-400 font-normal">km/h</span>
                    </span>
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg border ${
                    isMoving 
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {isMoving ? '🚗 En Movimiento' : '🅿️ Detenido'}
                  </span>
                </div>
              </div>

              {/* Banner Informativo de Safety Interlock */}
              {isMoving ? (
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-200 text-xs space-y-1">
                  <div className="flex items-center space-x-2 font-bold text-amber-300">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>MECANISMO DE SEGURIDAD VIAL OBLIGATORIO (SAFETY INTERLOCK)</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    La unidad se desplaza a <strong className="text-white">{currentSpeed.toFixed(1)} km/h</strong> (&gt; 5 km/h). 
                    Por protección ante accidentes fatales en ruta, <strong>el sistema NUNCA apagará el motor en movimiento</strong>. 
                    El comando quedará encolado y el corte por relé se aplicará automáticamente una vez que el vehículo detenga su marcha por completo.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 text-slate-300 text-xs flex items-center space-x-2">
                  <span className="text-emerald-400 text-base">🛡️</span>
                  <span>
                    Unidad detenida (&le; 5.0 km/h). Las órdenes de inmovilización o restablecimiento se ejecutarán de inmediato en el hardware telemático.
                  </span>
                </div>
              )}

              {/* Botón de Cancelación si está encolado */}
              {isPendingCut && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-amber-300">Corte de motor pendiente de ejecución</h4>
                    <p className="text-xs text-slate-300">Esperando que la velocidad descienda a 0 km/h para inmovilizar.</p>
                  </div>
                  <button
                    onClick={() => handleCancelPending(engineStatus?.pending_command_id)}
                    disabled={executing}
                    className="px-3.5 py-2 text-xs font-bold rounded-lg bg-slate-800 text-amber-300 hover:bg-slate-700 border border-amber-500/30 transition flex items-center space-x-1.5"
                  >
                    <span>Cancelar Corte</span>
                  </button>
                </div>
              )}

              {/* Formulario de Autorización */}
              <div className="p-5 rounded-2xl bg-slate-800/30 border border-slate-700/50 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
                  <span>Autorización Requerida del Operador</span>
                </h3>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    PIN del Vehículo o Contraseña de la Cuenta <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={pinOrPassword}
                      onChange={(e) => setPinOrPassword(e.target.value)}
                      placeholder="Ingrese PIN o clave maestra"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      )}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {engineStatus?.has_security_pin 
                      ? "✓ Esta unidad cuenta con PIN asignado. Puede usar el PIN o la clave de su usuario."
                      : "ℹ️ Unidad sin PIN específico. Utilice la contraseña de su usuario para autorizar."}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Motivo / Notas de Auditoría (Opcional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ej. Sospecha de robo / Mora / Salida de zona no autorizada"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>

                {/* Confirmación adicional para corte */}
                {!isImmobilized && (
                  <div className="pt-2">
                    <label className="flex items-center space-x-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmCut}
                        onChange={(e) => setConfirmCut(e.target.checked)}
                        className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-rose-600 focus:ring-rose-500"
                      />
                      <span className="text-xs text-slate-300 font-medium">
                        Comprendo la responsabilidad operativa de cortar el encendido de esta unidad.
                      </span>
                    </label>
                  </div>
                )}

                {/* Botonera de Acción */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  {!isImmobilized ? (
                    <button
                      onClick={() => handleExecute('CUT')}
                      disabled={executing || !confirmCut || !pinOrPassword.trim()}
                      className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center space-x-2 shadow-lg ${
                        confirmCut && pinOrPassword.trim() && !executing
                          ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      }`}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      <span>{isMoving ? 'Encolar Corte de Motor Seguro' : 'Inmovilizar Ahora (Corte Dout1)'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleExecute('RESTORE')}
                      disabled={executing || !pinOrPassword.trim()}
                      className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition flex items-center justify-center space-x-2 shadow-lg ${
                        pinOrPassword.trim() && !executing
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      }`}
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Restablecer Motor (Habilitar Arranque)</span>
                    </button>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: AUDITORÍA DE COMANDOS */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Registro Inmutable de Comandos Emitidos
                </h3>
                <button
                  onClick={loadStatusAndLogs}
                  className="text-xs text-sky-400 hover:text-sky-300 transition"
                >
                  ↻ Actualizar
                </button>
              </div>

              {commandLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs bg-slate-800/30 rounded-xl border border-slate-700/50">
                  No se registran comandos de corte o restablecimiento previos para este vehículo.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-700/60">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-800 text-slate-400 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3">Fecha/Hora</th>
                        <th className="py-2.5 px-3">Acción</th>
                        <th className="py-2.5 px-3">Estado</th>
                        <th className="py-2.5 px-3">Velocidad</th>
                        <th className="py-2.5 px-3">IP / Notas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-900/60 font-mono">
                      {commandLogs.map((cmd) => (
                        <tr key={cmd.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">
                            {new Date(cmd.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="py-2.5 px-3 font-sans font-bold">
                            {cmd.action === 'CUT' ? (
                              <span className="text-rose-400">CORTE (Dout1)</span>
                            ) : (
                              <span className="text-emerald-400">RESTABLECER</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              cmd.status === 'EXECUTED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              cmd.status === 'PENDING_SAFE_STOP' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                              cmd.status === 'CANCELLED' ? 'bg-slate-700/40 text-slate-400' :
                              'bg-rose-500/10 text-rose-400'
                            }`}>
                              {cmd.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">
                            Req: {cmd.speed_at_request_kmh != null ? `${cmd.speed_at_request_kmh.toFixed(0)} km/h` : '-'}
                            {cmd.speed_at_execution_kmh != null && (
                              <span className="text-emerald-400 font-bold block text-[10px]">
                                Exec: {cmd.speed_at_execution_kmh.toFixed(0)} km/h
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-sans text-slate-400 max-w-xs truncate">
                            {cmd.notes || (cmd.ip_address ? `IP: ${cmd.ip_address}` : '-')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CONFIGURACIÓN DE PIN DE VEHÍCULO */}
          {activeTab === 'pin_setup' && (
            <form onSubmit={handleSavePin} className="space-y-4 max-w-lg">
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-1 text-xs text-slate-300">
                <h4 className="font-bold text-white flex items-center space-x-1.5">
                  <span className="text-sky-400">🔐</span>
                  <span>PIN Específico del Vehículo</span>
                </h4>
                <p>
                  Puede configurar un PIN numérico de 4 a 8 dígitos para esta unidad en particular.
                  Esto permite autorizar cortes rápidos sin compartir la contraseña maestra del usuario.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Contraseña Actual de su Usuario (para validar) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  value={currentAccountPassword}
                  onChange={(e) => setCurrentAccountPassword(e.target.value)}
                  placeholder="Contraseña de inicio de sesión"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nuevo PIN (4-8 dígitos) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="password"
                    maxLength={8}
                    required
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    placeholder="Ej. 1234"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono tracking-widest text-center text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Confirmar PIN <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="password"
                    maxLength={8}
                    required
                    value={confirmNewPin}
                    onChange={(e) => setConfirmNewPin(e.target.value)}
                    placeholder="Repita PIN"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono tracking-widest text-center text-sm"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={executing || !currentAccountPassword || !newPin || newPin !== confirmNewPin}
                  className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs uppercase tracking-wider transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {executing ? 'Guardando...' : 'Guardar PIN de Seguridad'}
                </button>
              </div>
            </form>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between text-xs text-slate-500">
          <span>Tokioba Telematics Anti-Theft System</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
