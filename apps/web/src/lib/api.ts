import axios, { AxiosError } from 'axios';

// Server components run inside the web container, where the API is only
// reachable via the docker network hostname — not localhost.
const API_URL =
  typeof window === 'undefined'
    ? process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL: `${API_URL}/v1`,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach access token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as any;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${API_URL}/v1/auth/refresh`, { refreshToken });
        localStorage.setItem('accessToken', data.data.accessToken);
        localStorage.setItem('refreshToken', data.data.refreshToken);

        original.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(error);
  },
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data).then((r) => r.data.data),

  register: (data: any) =>
    api.post('/auth/register', data).then((r) => r.data.data),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password }),

  logout: () => {
    const refreshToken = localStorage.getItem('refreshToken');
    return api.post('/auth/logout', { refreshToken }).finally(() => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    });
  },

  getMe: () => api.get('/auth/me').then((r) => r.data.data),
};

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projectsApi = {
  list: (params?: Record<string, any>) =>
    api.get('/projects', { params }).then((r) => r.data.data),

  get: (id: number, lang?: string) =>
    api.get(`/projects/${id}`, { params: { lang } }).then((r) => r.data.data),
};

// ─── Donations ────────────────────────────────────────────────────────────────
export const donationsApi = {
  list: (params?: Record<string, any>) =>
    api.get('/donations', { params }).then((r) => r.data.data),

  get: (id: number) => api.get(`/donations/${id}`).then((r) => r.data.data),

  getByToken: (token: string) =>
    api.get(`/donations/token/${token}`).then((r) => r.data.data),

  create: (data: { projectId: number; amount: number }) =>
    api.post('/donations', data).then((r) => r.data.data),

  cancel: (id: number) => api.patch(`/donations/${id}/cancel`).then((r) => r.data.data),

  getQr: (token: string) => api.get(`/donations/${token}/qr`).then((r) => r.data.data),

  downloadQrUrl: (token: string) => `${API_URL}/v1/donations/${token}/qr/download`,
};

// ─── Blocks ───────────────────────────────────────────────────────────────────
export const blocksApi = {
  list: (params?: Record<string, any>) =>
    api.get('/blocks', { params }).then((r) => r.data.data),

  getBySlug: (slug: string) =>
    api.get(`/blocks/slug/${slug}`).then((r) => r.data.data),

  get: (id: number) => api.get(`/blocks/${id}`).then((r) => r.data.data),
};

// ─── Languages ────────────────────────────────────────────────────────────────
export const languagesApi = {
  list: () => api.get('/languages').then((r) => r.data.data),
};

// ─── Contact ──────────────────────────────────────────────────────────────────
export const contactApi = {
  submit: (data: { name: string; email: string; subject: string; message: string }) =>
    api.post('/contact', data).then((r) => r.data),
};

// ─── Participants ─────────────────────────────────────────────────────────────
export const participantsApi = {
  get: (id: number) => api.get(`/participants/${id}`).then((r) => r.data.data),
  update: (id: number, data: any) => api.put(`/participants/${id}`, data).then((r) => r.data.data),
};

// ─── Study ────────────────────────────────────────────────────────────────────
export const studyApi = {
  getByProject: (projectId: number) =>
    api.get(`/study/project/${projectId}`).then((r) => r.data.data),
};

// ─── Voting ───────────────────────────────────────────────────────────────────
export const votingApi = {
  getResults: (studyId: number) =>
    api.get(`/voting/${studyId}/results`).then((r) => r.data.data),
  getMyVotes: () =>
    api.get('/voting/my-votes').then((r) => r.data.data),
  castVote: (data: { studyId: number; choice: 'for' | 'against' | 'abstain'; comment?: string }) =>
    api.post('/voting/cast', data).then((r) => r.data.data),
  changeVote: (studyId: number, data: { choice: 'for' | 'against' | 'abstain'; comment?: string }) =>
    api.patch(`/voting/${studyId}/change`, data).then((r) => r.data.data),
};

// ─── Payments ─────────────────────────────────────────────────────────────────
export const paymentsApi = {
  createCheckout: (projectId: number, amount: number, provider: 'stripe' | 'paypal', currency = 'USD') =>
    api.post('/payments/checkout', { projectId, amount, provider, currency }).then((r) => r.data.data),
  getDonationStatus: (id: number) =>
    api.get(`/payments/donations/${id}/status`).then((r) => r.data.data),
  listDonations: (params?: Record<string, any>) =>
    api.get('/payments/donations', { params }).then((r) => r.data.data),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  getUnreadCount: () =>
    api.get('/notifications/unread-count').then((r) => r.data.data),
  getMyNotifications: (page = 1) =>
    api.get('/notifications', { params: { page } }).then((r) => r.data.data),
  markRead: (id: number) =>
    api.patch(`/notifications/${id}/read`).then((r) => r.data.data),
  markAllRead: () =>
    api.patch('/notifications/read-all').then((r) => r.data.data),
};

// ─── W7 — public transparency read layer ─────────────────────────────────────
export const transparencyApi = {
  stats: () => api.get('/transparency/stats').then((r) => r.data.data),
  funds: () => api.get('/transparency/funds').then((r) => r.data.data),
  fund: (id: number) => api.get(`/transparency/funds/${id}`).then((r) => r.data.data),
  project: (id: number) => api.get(`/transparency/projects/${id}`).then((r) => r.data.data),
  organizations: () => api.get('/transparency/organizations').then((r) => r.data.data),
  organization: (id: number) => api.get(`/transparency/organizations/${id}`).then((r) => r.data.data),
  decisions: (limit = 50) => api.get('/transparency/decisions', { params: { limit } }).then((r) => r.data.data),
};
