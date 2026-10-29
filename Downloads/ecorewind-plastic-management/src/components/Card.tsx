import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = "", onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-[#E5E6E1] bg-white p-5 ${
        onClick ? "cursor-pointer hover:border-[#1F5C45]/40 transition-colors" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
};
