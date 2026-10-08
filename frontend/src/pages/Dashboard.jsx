import React, { useEffect, useState } from 'react';
import { getDeviceStatus, getDeviceLogs } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Power, Activity, Clock, LogOut } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix para los iconos de Leaflet en React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const DEVICE_ID = 'MESA_01'; // Fijo para demo

export default function Dashboard() {
  const { logout } = useAuth();
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [statusData, logsData] = await Promise.all([
        getDeviceStatus(DEVICE_ID),
        getDeviceLogs(DEVICE_ID)
      ]);
      setStatus(statusData);
      setLogs(logsData);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // Polling 15s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-100">Cargando...</div>;
  }

  // Comprobar si está encendido en el último log, si status no es nulo
  const isPoweredOn = logs.length > 0 ? logs[0].ignition_state : false;

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-800">Dashboard de Telemetría</h1>
        <button onClick={logout} className="flex items-center text-gray-600 hover:text-red-500">
          <LogOut className="h-5 w-5 mr-2" /> Salir
        </button>
      </nav>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Card Estado */}
          <div className="bg-white rounded-lg shadow p-6 flex items-center">
            <div className={`p-4 rounded-full mr-4 ${status?.status === 'conectado' && isPoweredOn ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
              <Power className="h-8 w-8" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Estado del Motor</p>
              <h3 className="text-2xl font-bold text-gray-800">
                {status?.status === 'conectado' && isPoweredOn ? 'OPERATIVO' : 'APAGADO'}
              </h3>
              <p className="text-xs text-gray-400">Status: {status?.status}</p>
            </div>
          </div>

          {/* Card Horas Motor */}
          <div className="bg-white rounded-lg shadow p-6 flex items-center">
            <div className="p-4 rounded-full mr-4 bg-blue-100 text-blue-600">
              <Clock className="h-8 w-8" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Horas de Motor</p>
              <h3 className="text-2xl font-bold text-gray-800">{status?.engine_hours || 0} hs</h3>
            </div>
          </div>

          {/* Card Info Dispositivo */}
          <div className="bg-white rounded-lg shadow p-6 flex items-center">
             <div className="p-4 rounded-full mr-4 bg-purple-100 text-purple-600">
              <Activity className="h-8 w-8" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Dispositivo</p>
              <h3 className="text-xl font-bold text-gray-800">{DEVICE_ID}</h3>
              <p className="text-xs text-gray-400">
                Última act: {status?.last_updated ? new Date(status.last_updated).toLocaleTimeString() : '-'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Mapa */}
          <div className="bg-white rounded-lg shadow h-[400px] overflow-hidden">
            {status?.last_lat && status?.last_lon ? (
              <MapContainer center={[status.last_lat, status.last_lon]} zoom={13} scrollWheelZoom={false}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[status.last_lat, status.last_lon]}>
                  <Popup>Última ubicación de {DEVICE_ID}</Popup>
                </Marker>
              </MapContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                Sin datos de ubicación
              </div>
            )}
          </div>

          {/* Tabla de Logs */}
          <div className="bg-white rounded-lg shadow overflow-hidden flex flex-col h-[400px]">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Historial de Eventos (Últimos 50)</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha/Hora</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ignición</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ubicación</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${log.ignition_state ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {log.ignition_state ? 'ON' : 'OFF'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.latitude.toFixed(4)}, {log.longitude.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan="3" className="px-6 py-4 text-center text-sm text-gray-500">No hay eventos registrados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
