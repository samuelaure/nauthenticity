const TOKEN_KEY = 'nau_token'

const ACCOUNTS_URL = import.meta.env.VITE_ACCOUNTS_URL ?? 'https://accounts.9nau.com'
const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL ?? 'https://nauthenticity.9nau.com'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

export function redirectToLogin(): void {
  const callbackUrl = `${DASHBOARD_URL}/auth/callback`
  window.location.href = `${ACCOUNTS_URL}/login?continue=${encodeURIComponent(callbackUrl)}`
}
