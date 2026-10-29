import { useState, useEffect, useCallback, useRef } from "react";
import { Wallet } from "../types";
import { api } from "../services/api";
import { useWalletSync } from "./useWalletSync";

export function useWallet(userId: string) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [displayBalancePaise, setDisplayBalancePaise] = useState<number>(0);

  const prevBalanceRef = useRef<number>(0);

  const fetchWallet = useCallback(async () => {
    if (!userId) {
      setWallet(null);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const data = await api.getWallet(userId);
      setWallet(data);
      const now = new Date();
      setLastSyncTime(
        now.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load wallet data";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  // Hook up multi-tab live sync
  useWalletSync({
    userId,
    onSync: fetchWallet,
  });

  // Animated count-up effect on balance change
  useEffect(() => {
    if (!wallet) return;

    const targetBalance = wallet.balance_paise;
    const startBalance = prevBalanceRef.current;

    if (startBalance === targetBalance) {
      setDisplayBalancePaise(targetBalance);
      return;
    }

    const duration = 600; // ms
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutQuad
      const eased = 1 - (1 - progress) * (1 - progress);
      const current = Math.round(startBalance + (targetBalance - startBalance) * eased);
      setDisplayBalancePaise(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        prevBalanceRef.current = targetBalance;
        setDisplayBalancePaise(targetBalance);
      }
    };

    const animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [wallet?.balance_paise]);

  return {
    wallet,
    loading,
    error,
    lastSyncTime,
    displayBalancePaise,
    refresh: fetchWallet,
  };
}
