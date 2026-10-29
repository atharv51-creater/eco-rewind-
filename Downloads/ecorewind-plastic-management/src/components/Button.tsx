import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost" | "amber";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  children,
  ...props
}) => {
  const baseClasses =
    "inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#1F5C45] focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]";

  const variantClasses = {
    primary:
      "bg-[#1F5C45] hover:bg-[#12372A] text-white shadow-sm hover:shadow",
    secondary:
      "bg-[#E5F0EA] hover:bg-[#d2e4d9] text-[#12372A] border border-[#1F5C45]/20",
    outline:
      "bg-white hover:bg-[#F6F6F3] text-[#1C2321] border border-[#E5E6E1]",
    danger:
      "bg-[#B9402B] hover:bg-[#973220] text-white",
    ghost:
      "bg-transparent hover:bg-[#F6F6F3] text-[#1C2321]",
    amber:
      "bg-[#E09B2D] hover:bg-[#c9861e] text-white shadow-sm",
  };

  const sizeClasses = {
    sm: "text-xs px-3 py-1.5 gap-1.5 h-8",
    md: "text-sm px-4 py-2.5 gap-2 h-10",
    lg: "text-base px-6 py-3.5 gap-2.5 h-12 font-semibold",
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>{children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
};
