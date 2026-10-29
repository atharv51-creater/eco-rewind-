import React, { useState, useEffect } from "react";
import { MachinePage } from "./MachinePage";
import { useWalletId } from "../context/WalletIdContext";
import { useWallet } from "../hooks/useWallet";
import { formatPaise } from "../utils/money";
import { maskWalletId } from "../utils/ids";
import { Smartphone, RefreshCw, Leaf, ArrowUpRight } from "lucide-react";

export const LivePresentationPage: React.FC = () => {
  const { userId } = useWalletId();
  const { wallet, displayBalancePaise, lastSyncTime, refresh } = useWallet(userId);
  const [pulseSync, setPulseSync] = useState<boolean>(false);

  // Demonstrate genuine BroadcastChannel sync notification
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel("ecorewind");
    bc.onmessage = (e) => {
      if (e.data && e.data.type === "wallet") {
        setPulseSync(true);
        const timer = setTimeout(() => setPulseSync(false), 2000);
        return () => clearTimeout(timer);
      }
    };
    return () => bc.close();
  }, []);

  return (
    <div className="min-h-screen bg-[#F6F6F3] py-6 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Banner */}
        <div className="bg-white rounded-2xl p-4 border border-[#E5E6E1] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#E5F0EA] flex items-center justify-center text-[#1F5C45]">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold font-heading text-[#12372A]">
                Presentation &amp; Viva Live Mode (/live)
              </h1>
              <p className="text-xs text-[#5B655F]">
                Side-by-side RVM Kiosk &amp; Mobile Phone Wallet. Updates via real <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-[11px]">BroadcastChannel("ecorewind")</code> and polling.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium border transition-colors ${
                pulseSync
                  ? "bg-emerald-100 border-emerald-400 text-emerald-900 animate-pulse"
                  : "bg-[#F6F6F3] border-[#E5E6E1] text-[#5B655F]"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${pulseSync ? "bg-emerald-600" : "bg-[#1F5C45]"}`} />
              {pulseSync ? "Broadcast Sync Active!" : "Channel Listening"}
            </span>
          </div>
        </div>

        {/* 2-Column Split: Machine on Left (7 cols), Mobile Phone on Right (5 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Full Machine Terminal */}
          <div className="lg:col-span-8 bg-white rounded-3xl p-6 border border-[#E5E6E1]">
            <MachinePage />
          </div>

          {/* Right Column: Phone Frame with Live Wallet */}
          <div className="lg:col-span-4 sticky top-6 flex flex-col items-center">
            {/* Phone Bezel */}
            <div className="w-full max-w-[340px] bg-[#1C2321] p-3 rounded-[40px] shadow-2xl border-4 border-[#2B3632]">
              {/* Speaker & Notch */}
              <div className="w-24 h-4 bg-[#111827] rounded-full mx-auto mb-2 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-[#1F2937]" />
              </div>

              {/* Phone Screen Container */}
              <div className="bg-white rounded-[30px] overflow-hidden p-4 min-h-[580px] flex flex-col justify-between border border-gray-200">
                {/* Phone Top Bar */}
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 text-[10px] font-mono text-gray-400">
                  <span>9:41</span>
                  <span>5G • 100%</span>
                </div>

                {/* Wallet App Header */}
                <div className="pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-[#5B655F]">ECOREWIND WALLET</span>
                      <h2 className="text-sm font-bold text-[#12372A] font-heading">
                        {maskWalletId(userId)}
                      </h2>
                    </div>
                    <button
                      onClick={refresh}
                      aria-label="Refresh wallet"
                      className="p-1 rounded-full text-gray-400 hover:text-gray-700"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Sync status pill */}
                  <div className="mt-2 text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full inline-flex items-center gap-1 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Sync: {lastSyncTime || "connected"}</span>
                  </div>
                </div>

                {/* Mobile Balance Card */}
                <div className="my-3 bg-[#12372A] text-white p-4 rounded-2xl flex flex-col justify-between">
                  <span className="text-[10px] font-mono text-emerald-300">TOTAL BALANCE</span>
                  <div className="text-3xl font-bold font-heading mt-1 tabular-nums text-white">
                    {formatPaise(displayBalancePaise)}
                  </div>
                  <div className="text-[10px] font-mono text-emerald-200 mt-2 flex justify-between">
                    <span>Lifetime: {formatPaise(wallet?.total_paid_paise || 0)}</span>
                    <span>{wallet?.accepted_count || 0} deposits</span>
                  </div>
                </div>

                {/* Impact mini-metrics */}
                <div className="grid grid-cols-2 gap-2 my-1 text-xs">
                  <div className="bg-[#F6F6F3] p-2.5 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-500 block">Diverted</span>
                    <strong className="text-gray-900 font-mono text-sm">
                      {((wallet?.total_grams || 0) / 1000).toFixed(2)} kg
                    </strong>
                  </div>
                  <div className="bg-[#F6F6F3] p-2.5 rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-500 block">CO₂ Avoided</span>
                    <strong className="text-gray-900 font-mono text-sm">
                      {((wallet?.total_grams || 0) / 1000 * 1.5).toFixed(2)} kg
                    </strong>
                  </div>
                </div>

                {/* Live Activity Hint */}
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-900 flex items-start gap-2">
                  <Leaf className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    When an item is accepted in the RVM kiosk on the left, the balance will automatically tick up here in real time!
                  </span>
                </div>

                {/* Phone Bottom Home Indicator */}
                <div className="pt-2 border-t border-gray-100">
                  <div className="w-28 h-1 bg-gray-300 rounded-full mx-auto" />
                </div>
              </div>
            </div>
            <p className="text-xs text-[#5B655F] mt-3 font-mono text-center">
              Target Phone Device Sync Simulator
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
