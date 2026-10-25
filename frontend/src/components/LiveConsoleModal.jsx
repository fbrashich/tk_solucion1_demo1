import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, X, Search, Pause, Play, Trash2, 
  Copy, Download, Check, ArrowDown, Filter, 
  Terminal, ShieldCheck, Activity, Smartphone,
  Layers, ChevronDown, ChevronRight, RefreshCw,
  ExternalLink, Eye
} from 'lucide-react';
import { getLiveLogs, getLiveStreamUrl } from '../services/api';

export default function LiveConsoleModal({ isOpen, onClose }) {
  const [events, setEvents] = useState([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [selectedKind, setSelectedKind] = useState('ALL'); // 'ALL' | 'GPS_FIX' | 'HANDSHAKE' | 'RAW_IN' | 'SOCKET'
  const [expandedId, setExpandedId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [packetCount, setPacketCount] = useState(0);

  const eventSourceRef = useRef(null);
  const terminalBottomRef = useRef(null);
  const containerRef = useRef(null);

  // 1. Cargar historial reciente inicial al abrir el modal
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    getLiveLogs(80)
      .then((data) => {
        if (isMounted && data && Array.isArray(data.events)) {
          setEvents(data.events);
          setPacketCount(data.events.length);
        }
      })
      .catch((err) => {
        console.warn('No se pudo cargar logs iniciales:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // 2. Conectar al canal Server-Sent Events (SSE)
  useEffect(() => {
    if (!isOpen || !isStreaming) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    const streamUrl = getLiveStreamUrl();
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
    };

    es.onmessage = (msg) => {
      if (!msg.data) return;
      try {
        const newEvent = JSON.parse(msg.data);
        setEvents((prev) => {
          // Evitar duplicados por id
          if (prev.some((e) => e.id === newEvent.id)) return prev;
          const updated = [...prev, newEvent];
          // Mantener buffer máximo de 350 eventos en pantalla
          return updated.length > 350 ? updated.slice(updated.length - 350) : updated;
        });
        setPacketCount((c) => c + 1);
      } catch (err) {
        // Ping o comentario keep-alive ignorado
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      // EventSource reconecta automáticamente
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [isOpen, isStreaming]);

  // 3. Auto-scroll al final cuando llegan eventos
  useEffect(() => {
    if (autoScroll && terminalBottomRef.current) {
      terminalBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, autoScroll]);

  // Manejador de teclado Escape para cerrar
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filtrado de eventos
  const filteredEvents = events.filter((ev) => {
    // Filtro por tipo
    if (selectedKind === 'GPS_FIX' && ev.kind !== 'GPS_FIX') return false;
    if (selectedKind === 'HANDSHAKE' && ev.kind !== 'HANDSHAKE') return false;
    if (selectedKind === 'RAW_IN' && ev.kind !== 'RAW_IN') return false;
    if (selectedKind === 'SOCKET' && !['CONNECTED', 'DISCONNECTED', 'TIMEOUT'].includes(ev.kind)) return false;

    // Filtro por texto / IMEI
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      const str = `${ev.message || ''} ${ev.imei || ''} ${ev.channel || ''} ${JSON.stringify(ev.details || {})}`.toLowerCase();
      if (!str.includes(q)) return false;
    }

    return true;
  });

  const handleCopyLogs = () => {
    const text = filteredEvents
      .map((e) => `[${e.timestamp}] [${e.channel || 'SYS'}] [${e.kind}] ${e.message}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLogs = () => {
    const text = filteredEvents
      .map((e) => `[${e.timestamp}] [${e.channel || 'SYS'}] [${e.kind}] ${e.message}\nRaw: ${e.raw || ''}`)
      .join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telemetry-live-stream-${new Date().toISOString().slice(0, 19)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearLogs = () => {
    setEvents([]);
    setPacketCount(0);
  };

  const getKindBadge = (kind) => {
    switch (kind) {
      case 'GPS_FIX':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">GPS FIX</span>;
      case 'HANDSHAKE':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">TELTONIKA IMEI</span>;
      case 'RAW_IN':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">TRAMA HEX</span>;
      case 'ACK_OUT':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">ACK</span>;
      case 'CONNECTED':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">CONEXIÓN</span>;
      case 'DISCONNECTED':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-300 border border-slate-600">DESCONEXIÓN</span>;
      case 'TIMEOUT':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">TIMEOUT</span>;
      case 'EVENT':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">EVENTO</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">INFO</span>;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-5xl h-[92vh] bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200">
        
        {/* ======================================================== */}
        {/* HEADER DE LA CONSOLA                                     */}
        {/* ======================================================== */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-slate-900 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                  <span>Visor Telemático en Tiempo Real</span>
                  <span className="text-xs font-mono font-normal text-slate-400">
                    (TRACCAR + CUSTOM)
                  </span>
                </h2>
                
                {/* Badge de Estado del Stream */}
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  isConnected 
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40' 
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`}></span>
                  {isConnected ? 'EN VIVO (STREAM ACTIVO)' : isStreaming ? 'CONECTANDO...' : 'PAUSADO'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Monitoreo en vivo de sockets TCP/UDP (Puerto 5027), paquetes Teltonika y telemetría decodificada
              </p>
            </div>
          </div>

          {/* Botones de Acción Superiores */}
          <div className="flex items-center gap-2">
            {/* Pausar / Reanudar Stream */}
            <button
              onClick={() => setIsStreaming(!isStreaming)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                isStreaming
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
              }`}
              title={isStreaming ? 'Pausar recepción de eventos' : 'Reanudar stream en vivo'}
            >
              {isStreaming ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isStreaming ? 'Pausar' : 'Reanudar'}</span>
            </button>

            {/* Toggle Auto-scroll */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                autoScroll
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Mantener la vista al final automáticamente"
            >
              <ArrowDown className={`w-3.5 h-3.5 ${autoScroll ? 'animate-bounce' : ''}`} />
              <span className="hidden sm:inline">Auto-scroll</span>
            </button>

            {/* Copiar Logs */}
            <button
              onClick={handleCopyLogs}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
              title="Copiar texto de logs visibles al portapapeles"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            {/* Descargar Log */}
            <button
              onClick={handleDownloadLogs}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
              title="Descargar eventos visibles como archivo .txt"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Limpiar Consola */}
            <button
              onClick={clearLogs}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400 border border-slate-700 transition-colors cursor-pointer"
              title="Limpiar pantalla"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Cerrar Modal */}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-500/30 transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* BARRA DE FILTROS Y CHIPS DE BÚSQUEDA                      */}
        {/* ======================================================== */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-slate-900/60 border-b border-slate-800/80 shrink-0 text-xs">
          
          {/* Input de Filtro por Texto / IMEI */}
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar por IMEI, IP, comando o coordenada..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
            {filterText && (
              <button
                onClick={() => setFilterText('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Chips de Filtro Rápido */}
          <div className="flex items-center flex-wrap gap-1.5">
            <span className="text-[11px] text-slate-400 mr-1 font-semibold">Tipo:</span>
            
            {[
              { id: 'ALL', label: 'Todos' },
              { id: 'GPS_FIX', label: 'GPS Fix' },
              { id: 'HANDSHAKE', label: 'Handshakes' },
              { id: 'RAW_IN', label: 'Tramas Hex' },
              { id: 'SOCKET', label: 'Sockets' }
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => setSelectedKind(chip.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                  selectedKind === chip.id
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {chip.label}
              </button>
            ))}

            {/* Accesos rápidos a los 2 trackers activos */}
            <span className="text-slate-600 mx-1">|</span>
            <button
              onClick={() => setFilterText('863238073460331')}
              className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-all cursor-pointer ${
                filterText === '863238073460331'
                  ? 'bg-purple-500/25 text-purple-300 border-purple-500/50'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-purple-300'
              }`}
              title="Filtrar por Van Operarios (FMC150)"
            >
              Van (863238073460331)
            </button>
            <button
              onClick={() => setFilterText('860693080022560')}
              className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-all cursor-pointer ${
                filterText === '860693080022560'
                  ? 'bg-cyan-500/25 text-cyan-300 border-cyan-500/50'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-cyan-300'
              }`}
              title="Filtrar por Teltonika ATC700"
            >
              ATC700 (860693080022560)
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* ÁREA DE VISUALIZACIÓN TIPO TERMINAL                      */}
        {/* ======================================================== */}
        <div 
          ref={containerRef}
          className="flex-1 overflow-y-auto p-4 font-mono text-[11px] sm:text-xs space-y-1.5 bg-slate-950 scrollbar-thin scrollbar-thumb-slate-800 select-text"
        >
          {filteredEvents.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3 py-16">
              <Terminal className="w-12 h-12 text-slate-700 stroke-1" />
              <div className="text-center">
                <p className="text-sm font-bold text-slate-400">Sin eventos que coincidan con el filtro</p>
                <p className="text-xs text-slate-600 mt-1">
                  {filterText ? `Filtro actual: "${filterText}"` : 'Esperando transmisiones telemáticas en puerto 5027...'}
                </p>
              </div>
            </div>
          ) : (
            filteredEvents.map((ev, index) => {
              const isExpanded = expandedId === ev.id;
              const isGPS = ev.kind === 'GPS_FIX';
              const isHandshake = ev.kind === 'HANDSHAKE';
              const isRaw = ev.kind === 'RAW_IN';
              const isTimeout = ev.kind === 'TIMEOUT';

              return (
                <div 
                  key={ev.id || index}
                  className={`rounded-lg border px-3 py-2 transition-all ${
                    isGPS
                      ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-200'
                      : isHandshake
                        ? 'bg-cyan-950/25 border-cyan-500/30 text-cyan-200'
                        : isRaw
                          ? 'bg-slate-900/40 border-slate-800/80 text-amber-200/90'
                          : isTimeout
                            ? 'bg-rose-950/20 border-rose-500/20 text-rose-300'
                            : 'bg-slate-900/25 border-slate-800/50 text-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    
                    {/* Timestamp y Badges */}
                    <div className="flex items-center flex-wrap gap-2 shrink-0">
                      <span className="text-slate-500 font-semibold select-none">
                        {ev.timestamp || '--:--:--'}
                      </span>
                      
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        ev.channel === 'TCP' ? 'bg-blue-500/20 text-blue-300' : ev.channel === 'UDP' ? 'bg-purple-500/20 text-purple-300' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {ev.channel || 'NET'}
                      </span>

                      {getKindBadge(ev.kind)}

                      {ev.imei && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                          IMEI: {ev.imei}
                        </span>
                      )}
                    </div>

                    {/* Botón de Expansión si hay detalles */}
                    {(ev.details || ev.raw) && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                        className="text-slate-400 hover:text-white text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-800/50 hover:bg-slate-800 cursor-pointer shrink-0"
                      >
                        <span>{isExpanded ? 'Ocultar' : 'Detalles'}</span>
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </button>
                    )}
                  </div>

                  {/* Mensaje Principal del Evento */}
                  <div className="mt-1 text-xs break-all font-sans text-slate-200">
                    {ev.message}
                  </div>

                  {/* Vista Expandida de Detalles / Hex */}
                  {isExpanded && (
                    <div className="mt-2.5 pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px] font-mono">
                      {ev.details && Object.keys(ev.details).length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 rounded bg-slate-950 border border-slate-800">
                          {Object.entries(ev.details).map(([k, v]) => {
                            if (k === 'hex') return null;
                            return (
                              <div key={k}>
                                <span className="text-slate-500 block text-[10px] uppercase font-bold">{k}:</span>
                                <span className="text-cyan-300 font-semibold">{String(v)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Hexadecimal crudo si existe */}
                      {ev.details?.hex && (
                        <div className="mt-1.5">
                          <span className="text-[10px] text-amber-400 font-bold block mb-0.5">Payload Hexadecimal ({ev.details.hex.length / 2} bytes):</span>
                          <div className="p-2 rounded bg-black/70 border border-amber-500/20 text-amber-300 font-mono text-[10px] break-all max-h-36 overflow-y-auto">
                            {ev.details.hex}
                          </div>
                        </div>
                      )}

                      {/* Línea Cruda Original */}
                      {ev.raw && (
                        <div className="mt-1">
                          <span className="text-[10px] text-slate-500 block mb-0.5">Trama / JSON Crudo:</span>
                          <pre className="p-2 rounded bg-black/60 border border-slate-800 text-slate-400 text-[10px] overflow-x-auto whitespace-pre-wrap max-h-40">
                            {typeof ev.raw === 'object' ? JSON.stringify(ev.raw, null, 2) : ev.raw}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={terminalBottomRef} />
        </div>

        {/* ======================================================== */}
        {/* FOOTER INFORMATIVO Y RESUMEN                             */}
        {/* ======================================================== */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-slate-900 border-t border-slate-800 text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Eventos en sesión: <strong className="text-white">{packetCount}</strong></span>
            </span>
            <span className="hidden sm:inline text-slate-600">|</span>
            <span className="hidden sm:inline">
              Filtro activo: <strong className="text-slate-300">{filteredEvents.length}</strong> mostrados
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-500">
              Escuchando en <code className="text-cyan-400">TCP/UDP 5027</code> &amp; <code className="text-purple-400">/api/ingest/traccar</code>
            </span>
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Cerrar Consola
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
