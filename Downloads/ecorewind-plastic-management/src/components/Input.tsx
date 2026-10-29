import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
  helperText?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  leftAddon,
  rightAddon,
  className = "",
  id,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-[#5B655F]">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftAddon && (
          <div className="absolute left-3 flex items-center pointer-events-none text-[#5B655F]">
            {leftAddon}
          </div>
        )}
        <input
          id={inputId}
          className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-[#1C2321] placeholder-[#5B655F]/60 transition-colors focus:outline-none focus:ring-2 focus:ring-[#1F5C45] focus:border-transparent ${
            leftAddon ? "pl-9" : ""
          } ${rightAddon ? "pr-9" : ""} ${
            error
              ? "border-[#B9402B] focus:ring-[#B9402B]"
              : "border-[#E5E6E1] hover:border-[#1F5C45]/40"
          } ${className}`}
          {...props}
        />
        {rightAddon && (
          <div className="absolute right-3 flex items-center text-[#5B655F]">
            {rightAddon}
          </div>
        )}
      </div>
      {error ? (
        <p className="text-xs text-[#B9402B] font-medium">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-[#5B655F]">{helperText}</p>
      ) : null}
    </div>
  );
};
