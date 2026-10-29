import { useState, useEffect, useCallback } from "react";
import { HealthResponse } from "../types";
import { api } from "../services/api";

export function useHealth(onRecover?: () => void) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [checking, setChecking] = useState<boolean>(false);

  const checkHealth = useCallback(async () => {
    try {
      setChecking(true);
      const data = await api.getHealth();
      setHealth(data);
      const online = data.status === "ok" && data.model_ready;
      if (!isOnline && online && onRecover) {
        onRecover();
      }
      setIsOnline(online);
    } catch {
      setIsOnline(false);
    } finally {
      setChecking(false);
    }
  }, [isOnline, onRecover]);

  useEffect(() => {
    checkHealth();
    // Poll every 5 seconds if offline, or every 30 seconds if online
    const interval = setInterval(checkHealth, isOnline ? 30000 : 5000);
    return () => clearInterval(interval);
  }, [checkHealth, isOnline]);

  return { health, isOnline, checking, checkHealth };
}
