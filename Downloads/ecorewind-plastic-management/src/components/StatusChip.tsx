import React from "react";

interface StatusChipProps {
  status: "accepted" | "rejected" | "pending" | "paid" | "cancelled" | "ready" | "busy" | "offline";
  label?: string;
  className?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, label, className = "" }) => {
  const configs: Record<string, { bg: string; text: string; dot: string; defaultLabel: string }> = {
    accepted: {
      bg: "bg-[#E5F0EA]",
      text: "text-[#12372A]",
      dot: "bg-[#1F5C45]",
      defaultLabel: "Accepted",
    },
    paid: {
      bg: "bg-[#E5F0EA]",
      text: "text-[#12372A]",
      dot: "bg-[#1F5C45]",
      defaultLabel: "Paid",
    },
    rejected: {
      bg: "bg-[#FBEAE7]",
      text: "text-[#B9402B]",
      dot: "bg-[#B9402B]",
      defaultLabel: "Rejected",
    },
    pending: {
      bg: "bg-amber-50",
      text: "text-[#E09B2D]",
      dot: "bg-[#E09B2D]",
      defaultLabel: "Pending",
    },
    cancelled: {
      bg: "bg-[#F6F6F3]",
      text: "text-[#5B655F]",
      dot: "bg-[#5B655F]",
      defaultLabel: "Cancelled, refunded",
    },
    ready: {
      bg: "bg-[#E5F0EA]",
      text: "text-[#12372A]",
      dot: "bg-[#1F5C45]",
      defaultLabel: "Ready",
    },
    busy: {
      bg: "bg-blue-50",
      text: "text-blue-800",
      dot: "bg-blue-600",
      defaultLabel: "Busy",
    },
    offline: {
      bg: "bg-[#FBEAE7]",
      text: "text-[#B9402B]",
      dot: "bg-[#B9402B]",
      defaultLabel: "Out of service",
    },
  };

  const config = configs[status] || configs.pending;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border border-black/5 ${config.bg} ${config.text} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span>{label || config.defaultLabel}</span>
    </span>
  );
};
