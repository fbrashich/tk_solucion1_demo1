import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle({ className = '', showLabel = false }) {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative inline-flex items-center justify-center gap-1.5 h-9 px-2.5 rounded-xl transition-all duration-200 cursor-pointer active:scale-95 border ${
        isDark
          ? 'bg-slate-800 hover:bg-slate-700/90 text-amber-300 border-slate-700/80 hover:border-amber-400/40 shadow-sm'
          : 'bg-white hover:bg-slate-50 text-indigo-600 border-slate-200 hover:border-indigo-300 shadow-sm'
      } ${className}`}
      title={isDark ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
      aria-label="Alternar tema"
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-amber-400 animate-in fade-in zoom-in duration-200" />
      ) : (
        <Moon className="w-4 h-4 text-indigo-600 animate-in fade-in zoom-in duration-200" />
      )}
      {showLabel && (
        <span className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
          {isDark ? 'Modo Claro' : 'Modo Oscuro'}
        </span>
      )}
    </button>
  );
}
