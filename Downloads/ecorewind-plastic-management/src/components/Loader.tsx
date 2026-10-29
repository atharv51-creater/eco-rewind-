import React from "react";

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
  return (
    <div className="w-full space-y-3 animate-pulse">
      <div className="h-9 bg-[#F6F6F3] rounded-lg w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 py-2 border-b border-[#E5E6E1]/60">
          <div className="h-4 bg-[#F6F6F3] rounded w-24" />
          <div className="h-4 bg-[#F6F6F3] rounded w-32" />
          <div className="h-4 bg-[#F6F6F3] rounded w-16" />
          <div className="h-4 bg-[#F6F6F3] rounded w-20 ml-auto" />
        </div>
      ))}
    </div>
  );
};

export const CardSkeleton: React.FC = () => {
  return (
    <div className="rounded-xl border border-[#E5E6E1] bg-white p-5 space-y-3 animate-pulse">
      <div className="h-4 bg-[#F6F6F3] rounded w-1/3" />
      <div className="h-8 bg-[#F6F6F3] rounded w-1/2" />
      <div className="h-3 bg-[#F6F6F3] rounded w-2/3" />
    </div>
  );
};

export const ScannerBeam: React.FC<{ active?: boolean; text?: string }> = ({
  active = true,
  text = "Analyzing item...",
}) => {
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
      {active && (
        <div className="absolute inset-0 pointer-events-none">
          {/* Laser scanning beam line */}
          <div className="w-full h-0.5 bg-emerald-400 shadow-[0_0_12px_#34d399] animate-[scan_1.6s_ease-in-out_infinite]" />
        </div>
      )}
      <div className="z-10 bg-black/60 backdrop-blur-xs px-3.5 py-1.5 rounded-full border border-white/20 text-white font-mono text-xs flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        <span>{text}</span>
      </div>
    </div>
  );
};
