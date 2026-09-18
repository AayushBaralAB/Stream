import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/me', data),
};

export const streamAPI = {
  start: (data) => api.post('/streams/start', data),
  stop: () => api.post('/streams/stop'),
  getStatus: () => api.get('/streams/status'),
  getHistory: () => api.get('/streams/history'),
};

export const videoAPI = {
  upload: (formData, onProgress) =>
    api.post('/videos', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
    }),
  getAll: () => api.get('/videos'),
  delete: (id) => api.delete(`/videos/${id}`),
};

export const destinationAPI = {
  create: (data) => api.post('/destinations', data),
  getAll: () => api.get('/destinations'),
  update: (id, data) => api.put(`/destinations/${id}`, data),
  delete: (id) => api.delete(`/destinations/${id}`),
  toggle: (id) => api.patch(`/destinations/${id}/toggle`),
};

export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
  uploadLogo: (formData) =>
    api.post('/settings/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

export const newsAPI = {
  create: (data) => api.post('/news', data),
  getAll: () => api.get('/news'),
  getActive: () => api.get('/news/active'),
  update: (id, data) => api.put(`/news/${id}`, data),
  delete: (id) => api.delete(`/news/${id}`),
  toggle: (id) => api.patch(`/news/${id}/toggle`),
};

export const logAPI = {
  getAll: (params) => api.get('/logs', { params }),
  clear: () => api.delete('/logs'),
};

export default api;
