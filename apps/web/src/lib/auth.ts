export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  identificationCode?: string | null;
}

export function getToken(): string | null {
  return localStorage.getItem("sati_token");
}

export function setToken(token: string): void {
  localStorage.setItem("sati_token", token);
}

export function clearAuth(): void {
  localStorage.removeItem("sati_token");
  localStorage.removeItem("sati_user");
}

export function getUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem("sati_user");
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function setUser(user: AuthUser): void {
  localStorage.setItem("sati_user", JSON.stringify(user));
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
