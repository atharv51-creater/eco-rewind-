import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { isValidWalletId } from "../utils/ids";

interface WalletContextType {
  userId: string;
  setUserId: (id: string) => void;
  clearUserId: () => void;
  useDemoWallet: () => void;
  isDemoUser: boolean;
}

const STORAGE_KEY = "rvm_user";
const DEFAULT_USER = "demo-user";

const WalletIdContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userId, setUserIdState] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && isValidWalletId(stored)) {
        return stored;
      }
    } catch {
      // Ignore
    }
    return DEFAULT_USER;
  });

  const setUserId = useCallback((newId: string) => {
    const trimmed = newId.trim();
    if (isValidWalletId(trimmed)) {
      setUserIdState(trimmed);
      try {
        localStorage.setItem(STORAGE_KEY, trimmed);
      } catch {
        // Ignore
      }
      try {
        if (typeof BroadcastChannel !== "undefined") {
          const bc = new BroadcastChannel("ecorewind");
          bc.postMessage({ type: "user_switched", userId: trimmed });
          bc.close();
        }
      } catch {
        // Ignore
      }
    }
  }, []);

  const clearUserId = useCallback(() => {
    setUserIdState("");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }, []);

  const useDemoWallet = useCallback(() => {
    setUserId(DEFAULT_USER);
  }, [setUserId]);

  // Sync across tabs via storage event
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        if (isValidWalletId(e.newValue)) {
          setUserIdState(e.newValue);
        }
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return (
    <WalletIdContext.Provider
      value={{
        userId,
        setUserId,
        clearUserId,
        useDemoWallet,
        isDemoUser: userId === DEFAULT_USER,
      }}
    >
      {children}
    </WalletIdContext.Provider>
  );
};

export function useWalletId(): WalletContextType {
  const ctx = useContext(WalletIdContext);
  if (!ctx) {
    throw new Error("useWalletId must be used within a WalletProvider");
  }
  return ctx;
}
