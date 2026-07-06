import { authApi } from './api';

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  referenceType: string;
  referenceId: number;
  admin?: { id: number; firstName: string; lastName: string; role: string };
  participant?: { id: number; firstName: string; lastName: string; representation: string };
  avatar?: string;
  isActive: boolean;
  joiningDate?: string;
}

export function getStoredTokens() {
  if (typeof window === 'undefined') return { accessToken: null, refreshToken: null };
  return {
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken'),
  };
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

export function isAuthenticated(): boolean {
  const { accessToken } = getStoredTokens();
  return !!accessToken;
}

export async function login(email: string, password: string): Promise<{ user: AuthUser; accessToken: string; refreshToken: string }> {
  const data = await authApi.login({ email, password });
  setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function register(formData: any) {
  const data = await authApi.register(formData);
  setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function logout() {
  try {
    await authApi.logout();
  } finally {
    clearTokens();
  }
}
