import React from "react";
import { Delete, ArrowRight } from "lucide-react";
import { Button } from "./Button";

interface KeypadProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  onUseDemo: () => void;
  maxLength?: number;
  disabled?: boolean;
}

export const Keypad: React.FC<KeypadProps> = ({
  value,
  onChange,
  onSubmit,
  onUseDemo,
  maxLength = 10,
  disabled = false,
}) => {
  const handleDigit = (digit: string) => {
    if (value.length < maxLength) {
      onChange(value + digit);
    }
  };

  const handleDelete = () => {
    if (value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const handleClear = () => {
    onChange("");
  };

  const isValid = value.length === maxLength;

  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
          <button
            key={num}
            type="button"
            disabled={disabled}
            onClick={() => handleDigit(num)}
            className="h-12 sm:h-14 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white font-mono text-xl sm:text-2xl font-medium border border-white/15 transition-all flex items-center justify-center select-none disabled:opacity-40"
          >
            {num}
          </button>
        ))}

        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={handleClear}
          className="h-12 sm:h-14 rounded-xl bg-white/5 hover:bg-white/15 text-white/80 font-mono text-xs uppercase tracking-wider border border-white/10 transition-all flex items-center justify-center select-none disabled:opacity-30"
        >
          Clear
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => handleDigit("0")}
          className="h-12 sm:h-14 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white font-mono text-xl sm:text-2xl font-medium border border-white/15 transition-all flex items-center justify-center select-none disabled:opacity-40"
        >
          0
        </button>

        <button
          type="button"
          disabled={disabled || value.length === 0}
          onClick={handleDelete}
          aria-label="Delete last digit"
          className="h-12 sm:h-14 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white border border-white/15 transition-all flex items-center justify-center select-none disabled:opacity-30"
        >
          <Delete className="w-5 h-5" />
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Button
          type="button"
          variant="primary"
          size="lg"
          disabled={!isValid || disabled}
          onClick={onSubmit}
          className="w-full py-3.5 bg-[#1F5C45] hover:bg-[#12372A] text-white rounded-xl font-medium flex items-center justify-center gap-2"
        >
          <span>Continue</span>
          <ArrowRight className="w-4 h-4" />
        </Button>

        <button
          type="button"
          onClick={onUseDemo}
          className="text-xs text-white/70 hover:text-white underline underline-offset-4 py-1.5 transition-colors text-center"
        >
          Use demo wallet (demo-user)
        </button>
      </div>
    </div>
  );
};
