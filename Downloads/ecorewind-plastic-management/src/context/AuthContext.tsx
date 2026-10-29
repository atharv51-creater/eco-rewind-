import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { AuthUser, UserRole, LoginResponse, RegisterPayload } from "../types";
import { api } from "../services/api";

interface AuthContextType {
  user: AuthUser | null;
  role: UserRole | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, pass: string, expectedRole?: UserRole) => Promise<LoginResponse>;
  register: (payload: RegisterPayload) => Promise<LoginResponse>;
  logout: () => void;
  updateUser: (updated: Partial<AuthUser>) => void;
}

const TOKEN_KEY = "ecorewind_auth_token";
const USER_KEY = "ecorewind_auth_user";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      // Ignore
    }
    // Default demo user for easy exploration if not logged in
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Sync token to API central headers
  useEffect(() => {
    api.setAuthToken(token);
    setIsLoading(false);
  }, [token]);

  // Global 401 handler listener
  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, []);

  const login = async (email: string, pass: string, expectedRole?: UserRole): Promise<LoginResponse> => {
    const res = await api.login(email, pass, expectedRole);
    setToken(res.token);
    setUser(res.user);
    try {
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    } catch {
      // Ignore
    }
    return res;
  };

  const register = async (payload: RegisterPayload): Promise<LoginResponse> => {
    const res = await api.register(payload);
    setToken(res.token);
    setUser(res.user);
    try {
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    } catch {
      // Ignore
    }
    return res;
  };

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    api.setAuthToken(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch {
      // Ignore
    }
  }, []);

  const updateUser = useCallback((updated: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...updated };
      try {
        localStorage.setItem(USER_KEY, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        token,
        isAuthenticated: !!token && !!user,
        isAdmin: user?.role === "admin",
        isLoading,
        login,
        register,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
