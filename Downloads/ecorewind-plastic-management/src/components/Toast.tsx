import React, { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  title?: string;
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-[#1F5C45] shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-[#B9402B] shrink-0" />,
    info: <Info className="w-4 h-4 text-[#1C2321] shrink-0" />,
  };

  const bgStyles = {
    success: "bg-white border-[#1F5C45]/30 text-[#12372A]",
    error: "bg-[#FBEAE7] border-[#B9402B]/30 text-[#B9402B]",
    info: "bg-white border-[#E5E6E1] text-[#1C2321]",
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-md transition-all duration-200 animate-in slide-in-from-bottom-2 ${bgStyles[toast.type]}`}
    >
      {icons[toast.type]}
      <div className="flex-1 min-w-0">
        {toast.title && <p className="text-xs font-semibold leading-tight">{toast.title}</p>}
        <p className="text-xs leading-normal mt-0.5">{toast.message}</p>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss toast"
        className="opacity-60 hover:opacity-100 transition-opacity p-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
