import React from "react";
import { MachineContext } from "../types";
import { Camera, Cpu, Scale, ShieldCheck, Database, Wallet } from "lucide-react";
import { formatPaise } from "../utils/money";

interface InsideMachinePanelProps {
  context: MachineContext;
  className?: string;
}

export const InsideMachinePanel: React.FC<InsideMachinePanelProps> = ({ context, className = "" }) => {
  const { state, detectedItem, currentWeightGrams, lastScanResult, logEvents } = context;

  // Pipeline step active checks
  const isCameraActive = state === "DETECTING" || state === "INSERTING" || state === "PROCESSING";
  const isModelActive = state === "PROCESSING" || state === "ACCEPTED" || state === "REJECTED";
  const isScaleActive = state === "INSERTING" || state === "PROCESSING" || state === "ACCEPTED" || state === "REJECTED";
  const isRulesActive = state === "PROCESSING" || state === "ACCEPTED" || state === "REJECTED";
  const isLedgerActive = state === "ACCEPTED" || (state === "REJECTED" && !!lastScanResult);
  const isWalletActive = state === "ACCEPTED" && !!lastScanResult?.wallet;

  const pipelineSteps = [
    {
      id: "camera",
      name: "1. Camera Feed",
      icon: <Camera className="w-4 h-4" />,
      active: isCameraActive,
      value: state === "IDLE" ? "Standby" : "224×224 RGB Active",
      detail: state === "DETECTING" ? "Scanning @ 600ms" : "Frame captured",
    },
    {
      id: "ai_model",
      name: "2. AI Model",
      icon: <Cpu className="w-4 h-4" />,
      active: isModelActive,
      value: detectedItem
        ? `${Math.round(detectedItem.confidence * 100)}% ${detectedItem.display_label}`
        : "Standby",
      detail: detectedItem?.decision === "accepted" ? "Passes threshold (≥75%)" : detectedItem?.reason || "Awaiting scan",
    },
    {
      id: "scale",
      name: "3. Load Cell / Scale",
      icon: <Scale className="w-4 h-4" />,
      active: isScaleActive,
      value: `${currentWeightGrams} g`,
      detail: currentWeightGrams < 100 ? "Under 100g minimum" : "Valid weight (100–500g)",
    },
    {
      id: "rules",
      name: "4. Tariff & Rules",
      icon: <ShieldCheck className="w-4 h-4" />,
      active: isRulesActive,
      value: lastScanResult
        ? lastScanResult.decision === "accepted"
          ? `+${formatPaise(lastScanResult.transaction.payout_paise)}`
          : "Blocked (₹0.00)"
        : detectedItem?.decision === "accepted"
        ? `Rate: ${detectedItem.rate_paise_per_gram}p/g`
        : "Blocked",
      detail: lastScanResult?.transaction.bonus_paise
        ? `+₹${(lastScanResult.transaction.bonus_paise / 100).toFixed(2)} bulk bonus`
        : "Standard tariff",
    },
    {
      id: "ledger",
      name: "5. Ledger (SQLite)",
      icon: <Database className="w-4 h-4" />,
      active: isLedgerActive,
      value: lastScanResult?.transaction.id || "Idempotent Txn",
      detail: lastScanResult ? `Recorded in ledger (${lastScanResult.transaction.status})` : "Awaiting commit",
    },
    {
      id: "wallet",
      name: "6. User Wallet",
      icon: <Wallet className="w-4 h-4" />,
      active: isWalletActive,
      value: lastScanResult?.wallet
        ? formatPaise(lastScanResult.wallet.balance_paise)
        : context.userId || "demo-user",
      detail: lastScanResult ? "Credit confirmed & broadcast" : "Synced via BroadcastChannel",
    },
  ];

  return (
    <div className={`flex flex-col gap-4 bg-white rounded-2xl border border-[#E5E6E1] p-5 ${className}`}>
      <div>
        <div className="flex items-center justify-between pb-2 border-b border-[#E5E6E1]">
          <h3 className="text-sm font-bold text-[#12372A] font-heading flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#1F5C45] animate-pulse" />
            Inside the Machine Pipeline
          </h3>
          <span className="text-[11px] font-mono text-[#5B655F]">State: {state}</span>
        </div>
        <p className="text-xs text-[#5B655F] mt-1.5">
          Real-time hardware &amp; ledger pipeline visualization.
        </p>
      </div>

      {/* Step Pipeline Cards */}
      <div className="space-y-2">
        {pipelineSteps.map((step) => (
          <div
            key={step.id}
            className={`p-3 rounded-xl border transition-all duration-200 ${
              step.active
                ? "bg-[#E5F0EA]/50 border-[#1F5C45]/40 text-[#12372A]"
                : "bg-[#F6F6F3]/50 border-[#E5E6E1] text-[#5B655F] opacity-75"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className={step.active ? "text-[#1F5C45]" : "text-[#5B655F]"}>
                  {step.icon}
                </span>
                <span className="text-xs font-semibold">{step.name}</span>
              </div>
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${
                  step.active
                    ? "bg-[#1F5C45] text-white"
                    : "bg-[#E5E6E1] text-[#5B655F]"
                }`}
              >
                {step.value}
              </span>
            </div>
            <p className="text-[11px] text-[#5B655F] pl-6 font-mono">{step.detail}</p>
          </div>
        ))}
      </div>

      {/* Monospace Machine Event Log (last 20 events) */}
      <div className="mt-2 pt-3 border-t border-[#E5E6E1]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-[#12372A] font-mono uppercase tracking-wider">
            Machine Event Log
          </span>
          <span className="text-[10px] font-mono text-[#5B655F]">
            {logEvents.length} events recorded
          </span>
        </div>
        <div className="h-44 overflow-y-auto bg-[#0E1F19] text-[#E5F0EA] p-3 rounded-xl font-mono text-[11px] space-y-1.5 select-text border border-[#12372A]">
          {logEvents.map((evt) => (
            <div key={evt.id} className="flex items-start gap-2 leading-relaxed">
              <span className="text-[#5B655F] shrink-0">[{evt.time}]</span>
              <span
                className={
                  evt.type === "error"
                    ? "text-[#F87171]"
                    : evt.type === "warn"
                    ? "text-[#FBBF24]"
                    : evt.type === "success"
                    ? "text-[#34D399]"
                    : "text-[#D1D5DB]"
                }
              >
                {evt.message}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
