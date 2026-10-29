// Central endpoints configuration. Base URL is configurable via VITE_API_BASE_URL.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export const ENDPOINTS = {
  // Auth
  AUTH_LOGIN: `${API_BASE_URL}/auth/login`,
  AUTH_REGISTER: `${API_BASE_URL}/auth/register`,
  AUTH_LOGOUT: `${API_BASE_URL}/auth/logout`,
  USERS_ME: `${API_BASE_URL}/me`,

  // Public / Machine Kiosk
  HEALTH: `${API_BASE_URL}/health`,
  RATES: `${API_BASE_URL}/rates`,
  CLASSIFY: `${API_BASE_URL}/classify`,
  SCAN: `${API_BASE_URL}/scan`,
  KIOSK_DEPOSIT: `${API_BASE_URL}/kiosk/deposit`,
  CLAIM: (token: string) => `${API_BASE_URL}/claim/${encodeURIComponent(token)}`,
  DEPOSIT_STATUS: (sessionId: string) => `${API_BASE_URL}/deposit/${encodeURIComponent(sessionId)}/status`,
  QR_IMAGE: (text: string) => `${API_BASE_URL}/qr?text=${encodeURIComponent(text)}`,

  // User & Wallet
  WALLET: (userId: string) => `${API_BASE_URL}/users/${encodeURIComponent(userId)}/wallet`,
  WITHDRAWALS: (userId: string) => `${API_BASE_URL}/users/${encodeURIComponent(userId)}/withdrawals`,
  TRANSACTIONS: (userId?: string) =>
    !userId || userId === "all"
      ? `${API_BASE_URL}/transactions`
      : `${API_BASE_URL}/users/${encodeURIComponent(userId)}/transactions`,

  // Admin endpoints
  ADMIN_STATS: `${API_BASE_URL}/admin/stats`,
  ADMIN_USERS: `${API_BASE_URL}/admin/users`,
  ADMIN_MACHINES: `${API_BASE_URL}/admin/machines`,
  ADMIN_TRANSACTIONS: `${API_BASE_URL}/admin/transactions`,
  ADMIN_RATES: `${API_BASE_URL}/admin/rates`,
  ADMIN_WITHDRAWALS_COMPLETE: (id: string) => `${API_BASE_URL}/admin/withdrawals/${encodeURIComponent(id)}/complete`,
  ADMIN_WITHDRAWALS_CANCEL: (id: string) => `${API_BASE_URL}/admin/withdrawals/${encodeURIComponent(id)}/cancel`,
};
