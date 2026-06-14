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

// ─── Studies ─────────────────────────────────────────────────────────────────
export const studiesApi = {
  list: (params?: any) => api.get('/study', { params }).then((r) => r.data.data),
  get: (id: number) => api.get(`/study/${id}`).then((r) => r.data.data),
  create: (projectId: number) => api.post('/study', { projectId }).then((r) => r.data.data),
  changeStatus: (id: number, status: string, rejectionReason?: string, extraData?: Record<string, any>) =>
    api.patch(`/study/${id}/status`, { status, rejectionReason, ...extraData }).then((r) => r.data.data),
  updateSection: (sectionId: number, data: { content?: string; status?: string; assignedTo?: number }) =>
    api.patch(`/study/sections/${sectionId}`, data).then((r) => r.data.data),
  uploadSectionFiles: (sectionId: number, formData: FormData) =>
    api
      .post(`/study/sections/${sectionId}/files`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data),
  deleteSectionFile: (fileId: number) => api.delete(`/study/sections/files/${fileId}`),
};

// ─── Voting ───────────────────────────────────────────────────────────────────
export const votingApi = {
  getResults: (studyId: number) =>
    api.get(`/voting/${studyId}/results`).then((r) => r.data.data),
  listVotes: (studyId: number, filters?: { choice?: string; page?: number }) =>
    api.get(`/voting/${studyId}/votes`, { params: filters }).then((r) => r.data.data),
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

// ─── Files ────────────────────────────────────────────────────────────────────
export const filesApi = {
  upload: (formData: FormData) =>
    api.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.data),
  getFiles: (referenceId: number, referenceType: string) =>
    api.get('/files', { params: { referenceId, referenceType } }).then((r) => r.data.data),
  delete: (id: number) => api.delete(`/files/${id}`),
  setCover: (id: number) => api.patch(`/files/${id}/cover`).then((r) => r.data.data),
};

// ─── Execution (Steps / Phases / Tasks) ───────────────────────────────────────
export const executionApi = {
  // Steps
  listSteps: (projectId: number) => api.get(`/projects/${projectId}/execution/steps`).then((r) => r.data.data),
  createStep: (projectId: number, data: any) => api.post(`/projects/${projectId}/execution/steps`, data).then((r) => r.data.data),
  updateStep: (projectId: number, id: number, data: any) => api.patch(`/projects/${projectId}/execution/steps/${id}`, data).then((r) => r.data.data),
  updateStepProgress: (projectId: number, id: number, progress: number) => api.patch(`/projects/${projectId}/execution/steps/${id}/progress`, { progress }).then((r) => r.data.data),
  deleteStep: (projectId: number, id: number) => api.delete(`/projects/${projectId}/execution/steps/${id}`),

  // Phases
  listPhases: (projectId: number) => api.get(`/projects/${projectId}/execution/phases`).then((r) => r.data.data),
  createPhase: (projectId: number, data: any) => api.post(`/projects/${projectId}/execution/phases`, data).then((r) => r.data.data),
  updatePhase: (projectId: number, id: number, data: any) => api.patch(`/projects/${projectId}/execution/phases/${id}`, data).then((r) => r.data.data),
  deletePhase: (projectId: number, id: number) => api.delete(`/projects/${projectId}/execution/phases/${id}`),

  // Tasks
  listTasks: (projectId: number, phaseId?: number) => api.get(`/projects/${projectId}/execution/tasks`, { params: { phaseId } }).then((r) => r.data.data),
  createTask: (projectId: number, data: any) => api.post(`/projects/${projectId}/execution/tasks`, data).then((r) => r.data.data),
  updateTask: (projectId: number, id: number, data: any) => api.patch(`/projects/${projectId}/execution/tasks/${id}`, data).then((r) => r.data.data),
  deleteTask: (projectId: number, id: number) => api.delete(`/projects/${projectId}/execution/tasks/${id}`),
};

// ─── Financial (Budgets / Expenses / Transactions) ───────────────────────────
export const financialApi = {
  // Summary
  getSummary: (projectId: number) => api.get(`/projects/${projectId}/financial/summary`).then((r) => r.data.data),

  // Budgets
  listBudgets: (projectId: number) => api.get(`/projects/${projectId}/financial/budgets`).then((r) => r.data.data),
  createBudget: (projectId: number, data: any) => api.post(`/projects/${projectId}/financial/budgets`, data).then((r) => r.data.data),
  updateBudget: (projectId: number, id: number, data: any) => api.patch(`/projects/${projectId}/financial/budgets/${id}`, data).then((r) => r.data.data),
  deleteBudget: (projectId: number, id: number) => api.delete(`/projects/${projectId}/financial/budgets/${id}`),

  // Expenses
  listExpenses: (projectId: number, params?: { budgetId?: number; status?: string }) => api.get(`/projects/${projectId}/financial/expenses`, { params }).then((r) => r.data.data),
  createExpense: (projectId: number, data: any) => api.post(`/projects/${projectId}/financial/expenses`, data).then((r) => r.data.data),
  updateExpense: (projectId: number, id: number, data: any) => api.patch(`/projects/${projectId}/financial/expenses/${id}`, data).then((r) => r.data.data),
  updateExpenseStatus: (projectId: number, id: number, status: string) => api.patch(`/projects/${projectId}/financial/expenses/${id}/status`, { status }).then((r) => r.data.data),
  deleteExpense: (projectId: number, id: number) => api.delete(`/projects/${projectId}/financial/expenses/${id}`),

  // Transactions
  listTransactions: (projectId: number) => api.get(`/projects/${projectId}/financial/transactions`).then((r) => r.data.data),
  createTransaction: (projectId: number, data: any) => api.post(`/projects/${projectId}/financial/transactions`, data).then((r) => r.data.data),
};

// ─── Milestones ───────────────────────────────────────────────────────────────
export const milestonesApi = {
  list: (projectId: number) => api.get(`/projects/${projectId}/milestones`).then((r) => r.data.data),
  create: (projectId: number, data: any) => api.post(`/projects/${projectId}/milestones`, data).then((r) => r.data.data),
  update: (projectId: number, id: number, data: any) => api.patch(`/projects/${projectId}/milestones/${id}`, data).then((r) => r.data.data),
  delete: (projectId: number, id: number) => api.delete(`/projects/${projectId}/milestones/${id}`),
};

// ─── Reports ──────────────────────────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:4000/api';
export const reportsApi = {
  pdfSummary: (projectId: number) => `${API_BASE}/v1/reports/projects/${projectId}/pdf/summary`,
  pdfFinancial: (projectId: number) => `${API_BASE}/v1/reports/projects/${projectId}/pdf/financial`,
  pdfProgress: (projectId: number) => `${API_BASE}/v1/reports/projects/${projectId}/pdf/progress`,
  excelFinancial: (projectId: number) => `${API_BASE}/v1/reports/projects/${projectId}/excel/financial`,
  excelDonations: (projectId: number) => `${API_BASE}/v1/reports/projects/${projectId}/excel/donations`,
  excelExpenses: (projectId: number) => `${API_BASE}/v1/reports/projects/${projectId}/excel/expenses`,

  download: async (projectId: number, type: string, filename: string) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin_access_token') : null;
    const urlMap: Record<string, string> = {
      'pdf-summary': `${API_BASE}/v1/reports/projects/${projectId}/pdf/summary`,
      'pdf-financial': `${API_BASE}/v1/reports/projects/${projectId}/pdf/financial`,
      'pdf-progress': `${API_BASE}/v1/reports/projects/${projectId}/pdf/progress`,
      'excel-financial': `${API_BASE}/v1/reports/projects/${projectId}/excel/financial`,
      'excel-donations': `${API_BASE}/v1/reports/projects/${projectId}/excel/donations`,
      'excel-expenses': `${API_BASE}/v1/reports/projects/${projectId}/excel/expenses`,
    };
    const res = await fetch(urlMap[type], { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};
