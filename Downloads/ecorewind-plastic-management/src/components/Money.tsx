import React from "react";
import { formatPaise } from "../utils/money";

interface MoneyProps {
  paise: number;
  showSymbol?: boolean;
  className?: string;
}

export const Money: React.FC<MoneyProps> = ({
  paise,
  showSymbol = true,
  className = "",
}) => {
  return (
    <span className={`tabular-nums font-semibold tracking-tight ${className}`}>
      {formatPaise(paise, showSymbol)}
    </span>
  );
};
