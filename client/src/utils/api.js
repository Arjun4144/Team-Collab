import axios from 'axios';

const api = axios.create({
  baseURL: 'https://team-collab-anuj-debug.onrender.com/api',
  headers: { 'Content-Type': 'application/json' }
});

console.log("API BASE:", api.defaults.baseURL);
console.log('[DEBUG] axios baseURL is set to:', api.defaults.baseURL);

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nexus_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('nexus_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
