import { useEffect } from "react";

interface UseWalletSyncProps {
  userId: string;
  onSync: () => void;
}

export function useWalletSync({ userId, onSync }: UseWalletSyncProps) {
  useEffect(() => {
    if (!userId) return;

    // 1. BroadcastChannel cross-tab listener
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel("ecorewind");
        bc.onmessage = (event) => {
          if (event.data && (event.data.userId === userId || !event.data.userId)) {
            onSync();
          }
        };
      }
    } catch {
      // BroadcastChannel unsupported
    }

    // 2. Storage event for rvm_user
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "rvm_user" || e.key?.startsWith("ecorewind_mock_")) {
        onSync();
      }
    };
    window.addEventListener("storage", handleStorage);

    // 3. Tab visibility change
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        onSync();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // 4. Polling every 5s while visible
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        onSync();
      }
    }, 5000);

    return () => {
      if (bc) bc.close();
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(timer);
    };
  }, [userId, onSync]);
}
