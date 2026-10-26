import axios from 'axios';

// Rutas relativas para unificación en un solo puerto y proxy reverso Nginx
const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000, // Previene cuelgues de red o promesas bloqueadas
});

// Interceptor para agregar JWT a las requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor para manejar tokens expirados automáticamente
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const isLoginPath = window.location.pathname.includes('/login');
      if (!isLoginPath) {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ==========================================
// AUTENTICACIÓN
// ==========================================

export const loginCall = async (username, password) => {
  const params = new URLSearchParams();
  params.append('username', username.trim());
  params.append('password', password);
  const response = await api.post('/auth/login', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  return response.data;
};

export const getMe = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

// ==========================================
// DISPOSITIVOS Y TELEMETRÍA
// ==========================================

export const getDevices = async (includeInactive = false) => {
  const response = await api.get('/devices', {
    params: { include_inactive: includeInactive }
  });
  return response.data;
};

export const createDevice = async (deviceData) => {
  const response = await api.post('/devices', deviceData);
  return response.data;
};

export const updateDevice = async (deviceId, deviceData) => {
  const response = await api.put(`/devices/${deviceId}`, deviceData);
  return response.data;
};

export const deleteDevice = async (deviceId) => {
  const response = await api.delete(`/devices/${deviceId}`);
  return response.data;
};

export const updateDeviceCalibration = async (deviceId, calibrationData) => {
  const response = await api.put(`/devices/${deviceId}/calibration`, calibrationData);
  return response.data;
};

export const getAllDevicesStatus = async () => {
  const response = await api.get('/devices/status/all');
  return response.data;
};

export const getDeviceStatus = async (deviceId) => {
  const response = await api.get(`/devices/${deviceId}/status`);
  return response.data;
};

export const getDeviceLogs = async (deviceId, limit = 50) => {
  const response = await api.get(`/devices/${deviceId}/logs`, {
    params: { limit }
  });
  return response.data;
};

// Descarga directa de archivo CSV
export const exportDeviceLogs = async (deviceId, format = 'csv') => {
  const response = await api.get(`/devices/${deviceId}/export`, {
    params: { format },
    responseType: 'blob'
  });

  // Crear enlace temporal de descarga en el navegador
  const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const filename = `telemetria_${deviceId}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// ==========================================
// SUPER ADMIN (GESTIÓN DE USUARIOS)
// ==========================================

export const getAdminUsers = async () => {
  const response = await api.get('/admin/users');
  return response.data;
};

export const createAdminUser = async (userData) => {
  const response = await api.post('/admin/users', userData);
  return response.data;
};

export const updateAdminUser = async (userId, userData) => {
  const response = await api.put(`/admin/users/${userId}`, userData);
  return response.data;
};

export const deleteAdminUser = async (userId) => {
  const response = await api.delete(`/admin/users/${userId}`);
  return response.data;
};

// ==========================================
// VISOR TELEMÁTICO EN VIVO (LIVE STREAM)
// ==========================================

export const getLiveLogs = async (limit = 60, filter = '') => {
  const params = { limit };
  if (filter) params.filter = filter;
  const response = await api.get('/live/logs', { params });
  return response.data;
};

export const getLiveStreamUrl = (filter = '') => {
  const token = localStorage.getItem('token') || '';
  let url = `${API_URL}/live/stream?token=${encodeURIComponent(token)}`;
  if (filter) {
    url += `&filter=${encodeURIComponent(filter)}`;
  }
  return url;
};

export default api;

