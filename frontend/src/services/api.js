import axios from 'axios';

// Asumimos que si estamos en desarrollo conectamos local, y en prod el proxy o ingress se encarga
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_URL,
});

// Interceptor para agregar JWT a las requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const loginCall = async (username, password) => {
  const params = new URLSearchParams();
  params.append('username', username);
  params.append('password', password);
  const response = await api.post('/auth/login', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  return response.data;
};

export const getDeviceStatus = async (deviceId) => {
  const response = await api.get(`/devices/${deviceId}/status`);
  return response.data;
};

export const getDeviceLogs = async (deviceId) => {
  const response = await api.get(`/devices/${deviceId}/logs`);
  return response.data;
};

export default api;
