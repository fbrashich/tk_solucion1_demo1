import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import ThemeToggle from '../components/ThemeToggle';
import { loginCall } from '../services/api';
import { Lock, User, Radio, ArrowRight, ShieldCheck, AlertCircle, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { isLight } = useTheme();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanUser = username.trim();
    if (!cleanUser || !password) return;
    setError('');
    setIsLoading(true);
    try {
      const data = await loginCall(cleanUser, password);
      login(data.access_token);
      navigate('/dashboard');
    } catch (err) {
      console.error('Error de autenticación:', err);
      const errMsg = err.response?.data?.detail || 'Credenciales incorrectas. Verifique el usuario y contraseña.';
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col justify-center items-center p-4 relative overflow-hidden transition-colors duration-200 ${
      isLight ? 'bg-[#F8FAFC]' : 'bg-slate-950'
    }`}>
      {/* Botón conmutador de tema en la esquina superior derecha */}
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle showLabel={true} />
      </div>

      {/* Luces y texturas de fondo sobrias */}
      {isLight ? (
        <div className="ambient-halo-light" />
      ) : (
        <>
          <div className="absolute top-1/4 -left-32 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />
        </>
      )}

      <div className="max-w-md w-full relative z-10">
        {/* Cabecera del Producto */}
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl border shadow-xl mb-4 group transition-all ${
            isLight
              ? 'bg-white border-slate-200 shadow-slate-200/80 text-blue-600'
              : 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700/80 shadow-cyan-950/20'
          }`}>
            <Radio className={`w-7 h-7 group-hover:scale-110 transition-transform ${
              isLight ? 'text-blue-600' : 'text-cyan-400'
            }`} />
          </div>
          <h1 className={`text-2xl font-extrabold tracking-tight ${
            isLight ? 'text-slate-900' : 'text-white'
          }`}>
            Plataforma <span className={isLight ? 'text-blue-600' : 'text-cyan-400'}>IoT</span>
          </h1>
          <p className={`text-xs uppercase tracking-widest mt-1 font-semibold ${
            isLight ? 'text-slate-500' : 'text-slate-400'
          }`}>
            Plataforma de Telemetría Industrial
          </p>
        </div>

        {/* Tarjeta de Login */}
        <div className={`backdrop-blur-xl border rounded-2xl p-8 transition-all ${
          isLight
            ? 'bg-white/95 border-slate-200 shadow-[0_10px_30px_-5px_rgba(15,23,42,0.06),0_4px_12px_-2px_rgba(15,23,42,0.04)]'
            : 'bg-slate-900/80 border-slate-800/90 shadow-2xl shadow-black/60'
        }`}>
          <div className={`flex items-center justify-between mb-6 pb-4 border-b ${
            isLight ? 'border-slate-100' : 'border-slate-800/80'
          }`}>
            <div>
              <h2 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                Iniciar Sesión
              </h2>
            </div>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              API Activa
            </span>
          </div>

          {error && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs mb-6 animate-fade-in">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                isLight ? 'text-slate-700' : 'text-slate-300'
              }`}>
                Usuario
              </label>
              <div className="relative">
                <div className={`absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none ${
                  isLight ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={`block w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border transition-colors outline-none ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15'
                      : 'bg-slate-950/70 border-slate-800 text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
                  }`}
                  placeholder="Usuario"
                  required
                />
              </div>
            </div>

            <div>
              <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${
                isLight ? 'text-slate-700' : 'text-slate-300'
              }`}>
                Contraseña
              </label>
              <div className="relative">
                <div className={`absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none ${
                  isLight ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`block w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border transition-colors outline-none ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15'
                      : 'bg-slate-950/70 border-slate-800 text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
                  }`}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute inset-y-0 right-0 pr-3.5 flex items-center transition-colors cursor-pointer ${
                    isLight ? 'text-slate-400 hover:text-slate-600' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition-all cursor-pointer active:scale-[0.99] disabled:opacity-50 ${
                isLight
                  ? 'bg-[#0F172A] hover:bg-[#1E293B] text-white shadow-md'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-950/40 focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900'
              }`}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Acceder al Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Separador visual y opciones SSO según especificación de diseño */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className={`w-full border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`} />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                isLight
                  ? 'bg-[#F1F5F9] text-[#64748B] border-[#E2E8F0]'
                  : 'bg-slate-900 text-slate-500 border-slate-800'
              }`}>
                O continuar con
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setError('Autenticación con Microsoft Entra ID disponible para cuentas corporativas')}
              className={`w-full flex items-center justify-center gap-2.5 py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-slate-50 text-[#1E293B] border-[#E2E8F0] shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700/80 text-slate-200 border-slate-700'
              }`}
            >
              <span className="text-blue-500">🌐</span>
              <span>Sign in with Microsoft Entra ID</span>
            </button>
            <button
              type="button"
              onClick={() => setError('Autenticación Tokioba SSO federada disponible')}
              className={`w-full flex items-center justify-center gap-2.5 py-2 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-slate-50 text-[#1E293B] border-[#E2E8F0] shadow-sm'
                  : 'bg-slate-800 hover:bg-slate-700/80 text-slate-200 border-slate-700'
              }`}
            >
              <span className="font-extrabold text-xs">⚡</span>
              <span>Sign in with Tokioba SSO</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 flex items-center justify-center gap-2 text-xs text-slate-500 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-500/70" />
          <span>Acceso Restringido • Tokioba Industrial IoT</span>
        </div>
      </div>
    </div>
  );
}


