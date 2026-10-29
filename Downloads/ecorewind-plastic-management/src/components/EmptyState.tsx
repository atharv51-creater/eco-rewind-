import React from "react";
import { Recycle } from "lucide-react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-white rounded-xl border border-dashed border-[#E5E6E1]">
      <div className="w-12 h-12 rounded-full bg-[#E5F0EA] flex items-center justify-center text-[#1F5C45] mb-3">
        {icon || <Recycle className="w-6 h-6" />}
      </div>
      <h3 className="text-sm font-semibold text-[#12372A] mb-1 font-heading">{title}</h3>
      <p className="text-xs text-[#5B655F] max-w-sm mb-4">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
