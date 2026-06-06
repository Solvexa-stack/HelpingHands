import axios, { AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL: `${API_URL}/v1`,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('admin_access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as any;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('admin_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${API_URL}/v1/auth/refresh`, { refreshToken });
        localStorage.setItem('admin_access_token', data.data.accessToken);
        localStorage.setItem('admin_refresh_token', data.data.refreshToken);
        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('admin_access_token');
        localStorage.removeItem('admin_refresh_token');
        if (typeof window !== 'undefined') window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data).then((r) => r.data.data),
  getMe: () => api.get('/auth/me').then((r) => r.data.data),
  logout: () => api.post('/auth/logout').catch(() => {}),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardApi = {
  stats: () => api.get('/dashboard/stats').then((r) => r.data.data),
  recentDonations: () => api.get('/dashboard/recent-donations').then((r) => r.data.data),
  recentProjects: () => api.get('/dashboard/recent-projects').then((r) => r.data.data),
  donationsByMonth: (year?: number) =>
    api.get('/dashboard/donations-by-month', { params: { year } }).then((r) => r.data.data),
};

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projectsApi = {
  list: (params?: any) => api.get('/projects', { params }).then((r) => r.data.data),
  get: (id: number) => api.get(`/projects/${id}`).then((r) => r.data.data),
  create: (data: any) => api.post('/projects', data).then((r) => r.data.data),
  update: (id: number, data: any) => api.put(`/projects/${id}`, data).then((r) => r.data.data),
  delete: (id: number) => api.delete(`/projects/${id}`),
  assignOfficer: (id: number, officerId: number) =>
    api.patch(`/projects/${id}/assign-officer`, { officerId }).then((r) => r.data.data),
};

// ─── Donations ────────────────────────────────────────────────────────────────
export const donationsApi = {
  list: (params?: any) => api.get('/donations', { params }).then((r) => r.data.data),
  get: (id: number) => api.get(`/donations/${id}`).then((r) => r.data.data),
  getByToken: (token: string) => api.get(`/donations/token/${token}`).then((r) => r.data.data),
  updateStatus: (id: number, data: { status: string; notes?: string }) =>
    api.patch(`/donations/${id}/status`, data).then((r) => r.data.data),
};

// ─── Admins ───────────────────────────────────────────────────────────────────
export const adminsApi = {
  list: (params?: any) => api.get('/admins', { params }).then((r) => r.data.data),
  get: (id: number) => api.get(`/admins/${id}`).then((r) => r.data.data),
  create: (data: any) => api.post('/admins', data).then((r) => r.data.data),
  update: (id: number, data: any) => api.put(`/admins/${id}`, data).then((r) => r.data.data),
  toggleActive: (id: number) => api.patch(`/admins/${id}/toggle-active`).then((r) => r.data.data),
  financialOfficers: () => api.get('/admins/financial-officers').then((r) => r.data.data),
};

// ─── Participants ─────────────────────────────────────────────────────────────
export const participantsApi = {
  list: (params?: any) => api.get('/participants', { params }).then((r) => r.data.data),
  get: (id: number) => api.get(`/participants/${id}`).then((r) => r.data.data),
  toggleActive: (id: number) => api.patch(`/participants/${id}/toggle-active`).then((r) => r.data.data),
};

// ─── Blocks ───────────────────────────────────────────────────────────────────
export const blocksApi = {
  list: (params?: any) => api.get('/blocks', { params }).then((r) => r.data.data),
  get: (id: number) => api.get(`/blocks/${id}`).then((r) => r.data.data),
  create: (data: any) => api.post('/blocks', data).then((r) => r.data.data),
  update: (id: number, data: any) => api.put(`/blocks/${id}`, data).then((r) => r.data.data),
  delete: (id: number) => api.delete(`/blocks/${id}`),
  toggleActive: (id: number) => api.patch(`/blocks/${id}/toggle`).then((r) => r.data.data),
};

// ─── Languages ────────────────────────────────────────────────────────────────
export const languagesApi = {
  list: () => api.get('/languages?all=true').then((r) => r.data.data),
  create: (data: any) => api.post('/languages', data).then((r) => r.data.data),
  update: (code: string, data: any) => api.put(`/languages/${code}`, data).then((r) => r.data.data),
  delete: (code: string) => api.delete(`/languages/${code}`),
  toggle: (code: string) => api.patch(`/languages/${code}/toggle`).then((r) => r.data.data),
};

// ─── Files ────────────────────────────────────────────────────────────────────
export const filesApi = {
  upload: (formData: FormData) =>
    api.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.data),
  getFiles: (referenceId: number, referenceType: string) =>
    api.get('/files', { params: { referenceId, referenceType } }).then((r) => r.data.data),
  delete: (id: number) => api.delete(`/files/${id}`),
  setCover: (id: number) => api.patch(`/files/${id}/cover`).then((r) => r.data.data),
};
