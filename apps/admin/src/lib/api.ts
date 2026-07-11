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
  activateInvite: (data: { token: string; firstName: string; lastName: string; password: string }) =>
    api.post('/auth/activate-invite', data).then((r) => r.data.data),
  logout: () => api.post('/auth/logout').catch(() => {}),
  // W2-E5: workspace contexts
  getContexts: () => api.get('/auth/contexts').then((r) => r.data.data),
  switchContext: (organizationId: number) =>
    api.post('/auth/switch-context', { organizationId }).then((r) => r.data.data),
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
  // W8 — funding sources by fund, expenses, remaining budget (public endpoint)
  fundingReport: (id: number) => api.get(`/projects/${id}/funding`).then((r) => r.data.data),
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

// ─── Audit trail (administrator only) ─────────────────────────────────────────
export const auditApi = {
  list: (params: {
    page?: number;
    limit?: number;
    action?: string;
    subjectType?: string;
    subjectId?: string;
    actorUserId?: number;
    from?: string;
    to?: string;
  }) => api.get('/audit', { params }).then((r) => r.data.data),
  get: (id: number) => api.get(`/audit/${id}`).then((r) => r.data.data),
};

// ─── Funds & treasury (W5-E7, W8 fund types/donations) ────────────────────────
export type FundType = 'organization' | 'council' | 'donor';

export interface FundInput {
  name: string;
  purpose?: string;
  type?: FundType;
  managingOrganizationId?: number;
  donorId?: number;
  policy?: Record<string, unknown>;
}

export const fundsApi = {
  list: () => api.get('/funds').then((r) => r.data.data),
  // W9 — master funds (mirroring the category taxonomy) → organization funds → projects
  hierarchy: () => api.get('/funds/hierarchy').then((r) => r.data.data),
  detail: (id: number) => api.get(`/funds/${id}`).then((r) => r.data.data),
  dashboard: (id: number) => api.get(`/funds/${id}/dashboard`).then((r) => r.data.data),
  create: (data: FundInput) => api.post('/funds', data).then((r) => r.data.data),
  update: (id: number, data: Partial<FundInput> & { status?: string }) =>
    api.put(`/funds/${id}`, data).then((r) => r.data.data),
  addOfficer: (id: number, userId: number, role: string) =>
    api.post(`/funds/${id}/officers`, { userId, role }).then((r) => r.data.data),
  removeOfficer: (id: number, userId: number, role: string) =>
    api.delete(`/funds/${id}/officers/${userId}/${role}`),
  propose: (id: number, data: { projectId: number; amount: number; note?: string }) =>
    api.post(`/funds/${id}/allocations`, data).then((r) => r.data.data),
  approve: (allocationId: number) => api.post(`/funds/allocations/${allocationId}/approve`).then((r) => r.data.data),
  disburse: (allocationId: number, amount: number) =>
    api.post(`/funds/allocations/${allocationId}/disburse`, { amount }).then((r) => r.data.data),
  reconcile: (allocationId: number) => api.post(`/funds/allocations/${allocationId}/reconcile`).then((r) => r.data.data),
  close: (allocationId: number) => api.post(`/funds/allocations/${allocationId}/close`).then((r) => r.data.data),

  // Donor → FundDonation → Fund → FundAllocation → Project
  recordDonation: (
    id: number,
    data: {
      donorId?: number;
      participantId?: number;
      amount: number;
      currency?: string;
      paymentMethod: 'cash' | 'bank_transfer' | 'check' | 'card' | 'online';
      referenceNumber?: string;
      donatedAt: string;
      notes?: string;
    },
  ) => api.post(`/funds/${id}/donations`, data).then((r) => r.data.data),
  listDonations: (id: number) => api.get(`/funds/${id}/donations`).then((r) => r.data.data),
  confirmDonation: (donationId: number) =>
    api.post(`/funds/donations/${donationId}/approve`).then((r) => r.data.data),
  rejectDonation: (donationId: number) =>
    api.post(`/funds/donations/${donationId}/reject`).then((r) => r.data.data),
};

// ─── Donors (W8) ───────────────────────────────────────────────────────────────
export interface DonorInput {
  name: string;
  type?: 'person' | 'company' | 'organization';
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  taxId?: string;
  notes?: string;
}

export const donorsApi = {
  list: () => api.get('/donors').then((r) => r.data.data),
  detail: (id: number) => api.get(`/donors/${id}`).then((r) => r.data.data),
  create: (data: DonorInput) => api.post('/donors', data).then((r) => r.data.data),
  update: (id: number, data: Partial<DonorInput>) => api.put(`/donors/${id}`, data).then((r) => r.data.data),
  report: (id: number) => api.get(`/donors/${id}/report`).then((r) => r.data.data),
};

// ─── Recipients (W8 — expense payees) ─────────────────────────────────────────
export interface RecipientInput {
  name: string;
  type?: 'person' | 'company' | 'organization';
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
  organizationId?: number;
  taxId?: string;
  notes?: string;
}

export const recipientsApi = {
  list: () => api.get('/recipients').then((r) => r.data.data),
  detail: (id: number) => api.get(`/recipients/${id}`).then((r) => r.data.data),
  create: (data: RecipientInput) => api.post('/recipients', data).then((r) => r.data.data),
  update: (id: number, data: Partial<RecipientInput>) => api.put(`/recipients/${id}`, data).then((r) => r.data.data),
};

// ─── Invoices (W8 — expense supporting documents) ─────────────────────────────
export const invoicesApi = {
  upload: (formData: FormData) =>
    api.post('/invoices', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data.data),
  detail: (id: number) => api.get(`/invoices/${id}`).then((r) => r.data.data),
};

// ─── Expenses (W8 — successor to the legacy project expense flow) ────────────
export type ExpenseCategory =
  | 'materials'
  | 'labor'
  | 'services'
  | 'equipment'
  | 'transport'
  | 'administrative'
  | 'other';

export interface ExpenseInput {
  fundId: number;
  projectId: number;
  amount: number;
  category: ExpenseCategory;
  description: string;
  recipientId: number;
  invoiceId?: number;
  notes?: string;
}

export const expensesApi = {
  list: (params?: { projectId?: number; fundId?: number; status?: string }) =>
    api.get('/expenses', { params }).then((r) => r.data.data),
  detail: (id: number) => api.get(`/expenses/${id}`).then((r) => r.data.data),
  create: (data: ExpenseInput) => api.post('/expenses', data).then((r) => r.data.data),
  attachInvoice: (id: number, invoiceId: number) =>
    api.post(`/expenses/${id}/invoice`, { invoiceId }).then((r) => r.data.data),
  approve: (id: number) => api.post(`/expenses/${id}/approve`).then((r) => r.data.data),
  reject: (id: number) => api.post(`/expenses/${id}/reject`).then((r) => r.data.data),
};

// ─── Workflow engine (W4-E5) ──────────────────────────────────────────────────
export const workflowApi = {
  definitions: () => api.get('/workflow/definitions').then((r) => r.data.data),
  definition: (id: number) => api.get(`/workflow/definitions/${id}`).then((r) => r.data.data),
  projectInstance: (projectId: number) =>
    api.get(`/workflow/projects/${projectId}`).then((r) => r.data.data),
};

// ─── Governance (W3-E5) ───────────────────────────────────────────────────────
export const governanceApi = {
  queue: () => api.get('/governance/queue').then((r) => r.data.data),
  decisions: (params?: { subjectType?: string; subjectId?: number }) =>
    api.get('/governance/decisions', { params }).then((r) => r.data.data),
  recordDecision: (data: {
    subjectType: string;
    subjectId: number;
    decision: 'approved' | 'rejected' | 'changes_requested';
    rationale: string;
    sessionRef?: string;
  }) => api.post('/governance/decisions', data).then((r) => r.data.data),
  getRound: (id: number) => api.get(`/governance/rounds/${id}`).then((r) => r.data.data),
  listRounds: (subjectType?: string, subjectId?: number) =>
    api.get('/governance/rounds', { params: { subjectType, subjectId } }).then((r) => r.data.data),
};

// ─── Organizations (W2-E5) ────────────────────────────────────────────────────
export const organizationsApi = {
  list: (params?: { page?: number; limit?: number }) =>
    api.get('/organizations', { params }).then((r) => r.data.data),
  get: (id: number) => api.get(`/organizations/${id}`).then((r) => r.data.data),
  members: (id: number) => api.get(`/organizations/${id}/members`).then((r) => r.data.data),
  addMember: (id: number, userId: number) =>
    api.post(`/organizations/${id}/members`, { userId }).then((r) => r.data.data),
  removeMember: (id: number, userId: number) => api.delete(`/organizations/${id}/members/${userId}`),
  grantRole: (id: number, userId: number, role: string) =>
    api.post(`/organizations/${id}/members/${userId}/roles`, { role }).then((r) => r.data.data),
  revokeRole: (id: number, userId: number, role: string) =>
    api.delete(`/organizations/${id}/members/${userId}/roles/${role}`),
  create: (data: { type: string; name: string; registrationNumber?: string }) =>
    api.post('/organizations', data).then((r) => r.data.data),
  update: (id: number, data: { name?: string; registrationNumber?: string; status?: string }) =>
    api.put(`/organizations/${id}`, data).then((r) => r.data.data),
  inviteFirstAdmin: (
    id: number,
    data: { email: string; firstName: string; lastName: string; password?: string; role?: string },
  ) => api.post(`/organizations/${id}/invite-admin`, data).then((r) => r.data.data),
};

// ─── W6 — categories, participations, agreements, reporting, verification ────
export const categoriesApi = {
  tree: () => api.get('/categories').then((r) => r.data.data),
};

export const participationsApi = {
  list: (projectId: number) => api.get(`/projects/${projectId}/participations`).then((r) => r.data.data),
  add: (projectId: number, data: { organizationId: number; role: string; notes?: string }) =>
    api.post(`/projects/${projectId}/participations`, data).then((r) => r.data.data),
  end: (projectId: number, participationId: number) =>
    api.post(`/projects/${projectId}/participations/${participationId}/end`).then((r) => r.data.data),
  assignable: (projectId: number) =>
    api.get(`/projects/${projectId}/participations/assignable-users`).then((r) => r.data.data),
  grant: (projectId: number, data: { userId: number; role: string }) =>
    api.post(`/projects/${projectId}/participations/grants`, data).then((r) => r.data.data),
  revoke: (projectId: number, userId: number, role: string) =>
    api.delete(`/projects/${projectId}/participations/grants/${userId}/${role}`),
};

export const agreementsApi = {
  listForFund: (fundId: number) => api.get(`/funds/${fundId}/agreements`).then((r) => r.data.data),
  listForOrg: (orgId: number) => api.get(`/organizations/${orgId}/agreements`).then((r) => r.data.data),
  detail: (agreementId: number) => api.get(`/funds/agreements/${agreementId}`).then((r) => r.data.data),
  create: (
    fundId: number,
    data: {
      organizationId: number;
      title: string;
      terms?: Record<string, unknown>;
      reportingSchedule?: Record<string, unknown>;
      startsAt?: string;
      endsAt?: string;
    },
  ) => api.post(`/funds/${fundId}/agreements`, data).then((r) => r.data.data),
  sign: (agreementId: number) => api.post(`/funds/agreements/${agreementId}/sign`).then((r) => r.data.data),
  setStatus: (agreementId: number, status: string) =>
    api.patch(`/funds/agreements/${agreementId}/status`, { status }).then((r) => r.data.data),
};

export const orgReportsApi = {
  listForOrg: (orgId: number, status?: string) =>
    api.get(`/organizations/${orgId}/reports`, { params: { status } }).then((r) => r.data.data),
  submit: (
    orgId: number,
    data: {
      type: 'progress' | 'financial';
      title: string;
      projectId?: number;
      fundingAgreementId?: number;
      periodStart?: string;
      periodEnd?: string;
      payload?: Record<string, unknown>;
    },
  ) => api.post(`/organizations/${orgId}/reports`, data).then((r) => r.data.data),
  resubmit: (reportId: number, data: Record<string, unknown>) =>
    api.post(`/org-reports/${reportId}/resubmit`, data).then((r) => r.data.data),
  queue: () => api.get('/org-reports/queue').then((r) => r.data.data),
  beginReview: (reportId: number) => api.post(`/org-reports/${reportId}/begin-review`).then((r) => r.data.data),
  accept: (reportId: number, note?: string) =>
    api.post(`/org-reports/${reportId}/accept`, { note }).then((r) => r.data.data),
  returnWithComments: (reportId: number, note: string) =>
    api.post(`/org-reports/${reportId}/return`, { note }).then((r) => r.data.data),
};

export const verificationApi = {
  register: (data: {
    type: string;
    name: string;
    registrationNumber: string;
    adminEmail: string;
    adminFirstName: string;
    adminLastName: string;
    adminPassword: string;
  }) => api.post('/organizations/register', data).then((r) => r.data.data),
  status: (orgId: number) => api.get(`/organizations/${orgId}/verification`).then((r) => r.data.data),
  queue: () => api.get('/governance/verification-queue').then((r) => r.data.data),
  beginReview: (orgId: number) => api.post(`/organizations/${orgId}/verification/begin-review`).then((r) => r.data.data),
  verify: (orgId: number) => api.post(`/organizations/${orgId}/verification/verify`).then((r) => r.data.data),
  reject: (orgId: number) => api.post(`/organizations/${orgId}/verification/reject`).then((r) => r.data.data),
  activate: (orgId: number) => api.post(`/organizations/${orgId}/verification/activate`).then((r) => r.data.data),
};

// ─── W7 — transparency read layer, dashboards, publication policy ────────────
export const transparencyApi = {
  stats: () => api.get('/transparency/stats').then((r) => r.data.data),
  boardDashboard: () => api.get('/dashboards/board').then((r) => r.data.data),
  orgDashboard: () => api.get('/dashboards/org').then((r) => r.data.data),
  fundTrends: (fundId: number) => api.get(`/dashboards/funds/${fundId}/trends`).then((r) => r.data.data),
  policy: () => api.get('/transparency-policy').then((r) => r.data.data),
  setPolicy: (fieldClass: string, visibility: string) =>
    api.patch(`/transparency-policy/${fieldClass}`, { visibility }).then((r) => r.data.data),
  fundStatementUrl: (fundId: number) => `${api.defaults.baseURL}/transparency/exports/funds/${fundId}/statement.csv`,
  projectStatementUrl: (projectId: number) =>
    `${api.defaults.baseURL}/transparency/exports/projects/${projectId}/statement.csv`,
  orgSummaryUrl: (orgId: number) => `${api.defaults.baseURL}/transparency/exports/organizations/${orgId}/summary.csv`,
};
