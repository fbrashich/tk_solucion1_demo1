import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, AlertTriangle, AlertCircle, ShieldAlert, 
  Check, X, RefreshCw, Zap, ShieldCheck, ChevronRight
} from 'lucide-react';
import { getDeviceAlerts, resolveAlert } from '../services/api';

export default function AlertNotificationBell({ selectedDeviceId = 'all', onAlertsChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const dropdownRef = useRef(null);

  const fetchAlerts = async () => {
    try {
      const data = await getDeviceAlerts(selectedDeviceId, false);
      if (Array.isArray(data)) {
        setAlerts(data);
        if (onAlertsChange) onAlertsChange(data);
      }
    } catch (err) {
      console.warn('Error al consultar alertas:', err);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 15000); // Poll cada 15s
    return () => clearInterval(interval);
  }, [selectedDeviceId]);

  // Cerrar al clickear afuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleResolve = async (alertId, e) => {
    e.stopPropagation();
    setResolvingId(alertId);
    try {
      await resolveAlert(alertId, 'Atendida desde panel web');
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (err) {
      console.error('Error al resolver alerta:', err);
    } finally {
      setResolvingId(null);
    }
  };

  const unreadCount = alerts.length;
  const hasCritical = alerts.some((a) => a.severity === 'CRITICAL');

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Botón de la Campana */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative flex items-center justify-center h-9 w-9 rounded-xl border transition-all cursor-pointer shadow-sm ${
          unreadCount > 0
            ? hasCritical
              ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 hover:bg-rose-500/30'
              : 'bg-amber-500/20 border-amber-500/50 text-amber-400 hover:bg-amber-500/30'
            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
        }`}
        title={unreadCount > 0 ? `${unreadCount} alerta(s) de seguridad activas` : 'Sin alertas activas'}
      >
        <Bell className={`w-4 h-4 ${unreadCount > 0 ? 'animate-wiggle' : ''}`} />

        {unreadCount > 0 && (
          <span className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center text-white border border-slate-900 shadow-md ${
            hasCritical ? 'bg-rose-600 animate-pulse' : 'bg-amber-500'
          }`}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Desplegable de Notificaciones */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden z-50 animate-fade-in flex flex-col">
          {/* Cabecera */}
          <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Alertas Telemáticas
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold border border-slate-700">
                {unreadCount}
              </span>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Lista de Alertas */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/80">
            {unreadCount === 0 ? (
              <div className="p-6 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mx-auto flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-300">Flota 100% Operativa</p>
                <p className="text-[11px] text-slate-400">
                  No se registran anomalías eléctricas, excesos de velocidad ni movimientos no autorizados.
                </p>
              </div>
            ) : (
              alerts.map((alert) => (
                <div 
                  key={alert.id}
                  className="p-3.5 hover:bg-slate-850/60 transition-colors flex items-start gap-3"
                >
                  <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                    alert.severity === 'CRITICAL'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    {alert.alert_type === 'LOW_BATTERY' || alert.alert_type === 'CRITICAL_BATTERY' || alert.alert_type === 'POWER_CUT' ? (
                      <Zap className="w-4 h-4" />
                    ) : (
                      <AlertTriangle className="w-4 h-4" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-[11px] font-mono font-bold text-cyan-400 truncate">
                        {alert.device_id}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="text-xs text-slate-200 font-medium leading-relaxed">
                      {alert.message}
                    </p>

                    <div className="mt-2 flex items-center justify-between pt-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        alert.severity === 'CRITICAL' 
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' 
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {alert.severity}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => handleResolve(alert.id, e)}
                        disabled={resolvingId === alert.id}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white text-[11px] font-bold transition-all border border-slate-700 hover:border-emerald-500 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                      >
                        {resolvingId === alert.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3 text-emerald-400" />
                        )}
                        <span>Resolver</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
