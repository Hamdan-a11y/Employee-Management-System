import axios from 'axios';

// Access token stored in memory only (never in localStorage or sessionStorage)
let inMemoryAccessToken = null;

export const setAccessToken = (token) => {
  inMemoryAccessToken = token || null;
};

export const getAccessToken = () => inMemoryAccessToken;

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send and receive secure HttpOnly cookies across origins
});

api.interceptors.request.use((config) => {
  if (inMemoryAccessToken) {
    config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
  }
  return config;
});

// Response Interceptor: auto-refresh once on 401, then redirect to login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
    const isOnPublicAuthPage =
      typeof window !== 'undefined' &&
      publicPaths.some((p) => window.location.pathname.startsWith(p));

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isOnPublicAuthPage &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      originalRequest._retry = true;
      try {
        const refreshRes = await api.post('/auth/refresh');
        if (refreshRes.data?.accessToken) {
          setAccessToken(refreshRes.data.accessToken);
          originalRequest.headers.Authorization = `Bearer ${refreshRes.data.accessToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        setAccessToken(null);
        const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
        if (
          typeof window !== 'undefined' &&
          !publicPaths.some((p) => window.location.pathname.startsWith(p))
        ) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
