import React, { useState, useEffect, useRef } from "react";
import { MachineState, ClassifyResponse } from "../types";
import { Play, Pause, RotateCcw, Eye, EyeOff } from "lucide-react";
import { formatPaise } from "../utils/money";

interface MachineIllustrationProps {
  variant?: "live" | "demo";
  state?: MachineState;
  detectedItem?: ClassifyResponse | null;
  weightGrams?: number;
  lastPayoutPaise?: number;
  screenContent?: React.ReactNode;
  binFills?: { pet: number; cans: number; bags: number };
  className?: string;
}

export const MachineIllustration: React.FC<MachineIllustrationProps> = ({
  variant = "live",
  state = "IDLE",
  detectedItem,
  weightGrams = 250,
  lastPayoutPaise = 0,
  screenContent,
  binFills = { pet: 30, cans: 20, bags: 15 },
  className = "",
}) => {
  const [showInside, setShowInside] = useState<boolean>(false);

  // Demo loop state if variant is 'demo'
  const [demoStep, setDemoStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isIntersecting, setIsIntersecting] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const demoScenarios = [
    {
      state: "INSERTING" as MachineState,
      item: "plastic_bottle",
      label: "Plastic Bottle (PET)",
      weight: 250,
      payout: 500,
      decision: "accepted",
      caption: "1. Inserting 250g PET Bottle...",
    },
    {
      state: "PROCESSING" as MachineState,
      item: "plastic_bottle",
      label: "Plastic Bottle (PET)",
      weight: 250,
      payout: 500,
      decision: "accepted",
      caption: "2. Scanning & weighing item...",
    },
    {
      state: "ACCEPTED" as MachineState,
      item: "plastic_bottle",
      label: "Plastic Bottle (PET)",
      weight: 250,
      payout: 500,
      decision: "accepted",
      caption: "3. Accepted! Diverting to PET bin. +₹5.00 paid.",
    },
    {
      state: "INSERTING" as MachineState,
      item: "other_invalid",
      label: "Stone / Debris",
      weight: 80,
      payout: 0,
      decision: "rejected",
      caption: "4. Inserting 80g non-recyclable object...",
    },
    {
      state: "REJECTED" as MachineState,
      item: "other_invalid",
      label: "Stone / Debris",
      weight: 80,
      payout: 0,
      decision: "rejected",
      caption: "5. Rejected! Low weight / invalid item ejected.",
    },
    {
      state: "INSERTING" as MachineState,
      item: "aluminium_can",
      label: "Aluminium Can",
      weight: 450,
      payout: 1980,
      decision: "accepted",
      caption: "6. Inserting 450g Aluminium Can (+10% bulk bonus)...",
    },
    {
      state: "ACCEPTED" as MachineState,
      item: "aluminium_can",
      label: "Aluminium Can",
      weight: 450,
      payout: 1980,
      decision: "accepted",
      caption: "7. Accepted! +₹19.80 deposited into wallet.",
    },
  ];

  // Intersection observer for demo auto-pause
  useEffect(() => {
    if (variant !== "demo") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
      },
      { threshold: 0.25 }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [variant]);

  // Demo auto-advancement loop
  useEffect(() => {
    if (variant !== "demo" || !isPlaying || !isIntersecting) return;
    const timer = setTimeout(() => {
      setDemoStep((prev) => (prev + 1) % demoScenarios.length);
    }, 2800);
    return () => clearTimeout(timer);
  }, [variant, isPlaying, isIntersecting, demoStep]);

  // Resolve current visual state
  const currentScenario = variant === "demo" ? demoScenarios[demoStep] : null;
  const activeState: MachineState = variant === "demo" ? currentScenario!.state : state;
  const activeLabel =
    variant === "demo"
      ? currentScenario!.item
      : detectedItem?.label || "plastic_bottle";
  const activeWeight = variant === "demo" ? currentScenario!.weight : weightGrams;
  const activePayout = variant === "demo" ? currentScenario!.payout : lastPayoutPaise;

  // Status Light color
  const statusLight =
    activeState === "OFFLINE"
      ? "#E09B2D" // amber
      : activeState === "INSERTING" || activeState === "PROCESSING"
      ? "#3B82F6" // blue busy
      : activeState === "REJECTED"
      ? "#B9402B" // red/amber pulse
      : "#10B981"; // green ready

  // Determine item animation classes
  const getItemTransform = () => {
    if (activeState === "IDLE" || activeState === "SESSION_START" || activeState === "DETECTING") {
      return "translate(-120px, 0) opacity-0";
    }
    if (activeState === "INSERTING") {
      return "translate(0, 0) scale(1) opacity-100 transition-all duration-700 ease-out";
    }
    if (activeState === "PROCESSING") {
      return "translate(30px, 0) scale(0.95) opacity-100 transition-all duration-300";
    }
    if (activeState === "ACCEPTED") {
      // Diverter drop
      return "translate(50px, 110px) scale(0.7) opacity-0 transition-all duration-700 ease-in";
    }
    if (activeState === "REJECTED") {
      // Rollers reverse out of slot
      return "translate(-120px, 0) scale(1) opacity-80 transition-all duration-800 ease-out";
    }
    return "opacity-0";
  };

  // Coins drop count
  const coinCount = activePayout >= 1500 ? 5 : activePayout >= 800 ? 3 : 2;

  return (
    <div ref={containerRef} className={`relative flex flex-col items-center ${className}`}>
      {/* Top Controls Bar */}
      <div className="w-full max-w-[540px] flex items-center justify-between mb-3 px-2">
        <button
          onClick={() => setShowInside(!showInside)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#12372A] bg-white rounded-lg border border-[#E5E6E1] hover:bg-[#F6F6F3] transition-colors"
        >
          {showInside ? <EyeOff className="w-3.5 h-3.5 text-[#1F5C45]" /> : <Eye className="w-3.5 h-3.5 text-[#1F5C45]" />}
          <span>{showInside ? "Hide internal chamber" : "Show inside chamber"}</span>
        </button>

        {variant === "demo" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              aria-label={isPlaying ? "Pause simulation" : "Play simulation"}
              className="p-1.5 bg-white text-[#12372A] rounded-lg border border-[#E5E6E1] hover:bg-[#F6F6F3]"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => setDemoStep(0)}
              aria-label="Replay simulation"
              className="p-1.5 bg-white text-[#12372A] rounded-lg border border-[#E5E6E1] hover:bg-[#F6F6F3]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono text-[#5B655F]">
              Step {demoStep + 1}/{demoScenarios.length}
            </span>
          </div>
        )}
      </div>

      {/* Main SVG Machine */}
      <div className="relative w-full max-w-[540px] machine-shadow rounded-[32px] overflow-hidden border border-[#12372A]/20 bg-[#12372A]">
        <svg
          viewBox="0 0 540 680"
          className="w-full h-auto block select-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Gradients */}
            <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#164333" />
              <stop offset="100%" stopColor="#0D261D" />
            </linearGradient>
            <linearGradient id="panelGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#F6F6F3" />
            </linearGradient>
            <linearGradient id="scannerBeamGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(52, 211, 153, 0)" />
              <stop offset="50%" stopColor="rgba(52, 211, 153, 0.7)" />
              <stop offset="100%" stopColor="rgba(52, 211, 153, 0)" />
            </linearGradient>
            <pattern id="conveyorPattern" width="12" height="12" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="12" y2="0" stroke="#374151" strokeWidth="2" />
            </pattern>
          </defs>

          {/* Machine Outer Enclosure */}
          <rect x="0" y="0" width="540" height="680" rx="32" fill="url(#bodyGrad)" />
          
          {/* Top Brand Plate */}
          <rect x="150" y="18" width="240" height="34" rx="8" fill="#0A1C15" stroke="#1F5C45" strokeWidth="1" />
          <text
            x="270"
            y="41"
            fill="#FFFFFF"
            fontSize="15"
            fontWeight="bold"
            letterSpacing="2"
            textAnchor="middle"
            fontFamily="Bricolage Grotesque, sans-serif"
          >
            ECOREWIND RVM-01
          </text>

          {/* Status Indicator Light */}
          <circle cx="490" cy="35" r="8" fill={statusLight} />
          <circle cx="490" cy="35" r="14" fill={statusLight} opacity="0.3" className="animate-pulse" />

          {/* Front Panel (or Cutaway Inside View) */}
          {!showInside ? (
            /* Outer Front Panel */
            <rect x="24" y="68" width="492" height="588" rx="20" fill="url(#panelGrad)" stroke="#E5E6E1" strokeWidth="2" />
          ) : (
            /* Inside Cutaway Chamber */
            <g id="inside-chamber">
              <rect x="24" y="68" width="492" height="588" rx="20" fill="#1F2937" stroke="#374151" strokeWidth="2" />
              {/* Internal Chamber Header */}
              <text x="44" y="98" fill="#9CA3AF" fontSize="12" fontFamily="JetBrains Mono" fontWeight="600">
                INTERNAL CONVEYOR &amp; DIVERTER MECHANISM
              </text>
              {/* Camera Mount */}
              <rect x="180" y="112" width="60" height="28" rx="4" fill="#111827" stroke="#4B5563" />
              <circle cx="210" cy="126" r="8" fill="#3B82F6" />
              <text x="210" y="152" fill="#9CA3AF" fontSize="9" textAnchor="middle" fontFamily="JetBrains Mono">
                AI OPTIC CAM
              </text>

              {/* Conveyor Rollers */}
              <rect x="60" y="240" width="260" height="20" fill="url(#conveyorPattern)" stroke="#4B5563" />
              {[75, 115, 155, 195, 235, 275, 305].map((cx, idx) => (
                <circle key={idx} cx={cx} cy="250" r="8" fill="#4B5563" stroke="#9CA3AF" strokeWidth="1" />
              ))}

              {/* Scale Platform */}
              <rect x="120" y="228" width="140" height="8" rx="2" fill="#D1D5DB" />
              {/* Scale Digital Readout */}
              <rect x="145" y="268" width="90" height="26" rx="4" fill="#0A1C15" stroke="#10B981" />
              <text
                x="190"
                y="285"
                fill="#34D399"
                fontSize="12"
                fontFamily="JetBrains Mono"
                fontWeight="bold"
                textAnchor="middle"
              >
                {activeWeight}g
              </text>

              {/* Diverter Flap */}
              <g
                transform={`rotate(${
                  activeState === "ACCEPTED"
                    ? activeLabel === "aluminium_can"
                      ? 35
                      : activeLabel === "plastic_bag"
                      ? -35
                      : 0
                    : 0
                }, 330, 250)`}
                className="transition-transform duration-500 ease-in-out"
              >
                <line x1="330" y1="230" x2="330" y2="280" stroke="#F59E0B" strokeWidth="6" strokeLinecap="round" />
              </g>

              {/* Chute guide lines */}
              <path d="M 330 290 L 140 430" stroke="#4B5563" strokeWidth="2" strokeDasharray="4 4" />
              <path d="M 330 290 L 270 430" stroke="#4B5563" strokeWidth="2" strokeDasharray="4 4" />
              <path d="M 330 290 L 400 430" stroke="#4B5563" strokeWidth="2" strokeDasharray="4 4" />
            </g>
          )}

          {/* LEFT: Round Insertion Slot with Rubber Flaps */}
          <g id="insertion-slot" transform="translate(48, 140)">
            {/* Slot Bezel */}
            <circle cx="64" cy="64" r="62" fill="#1F2937" stroke="#12372A" strokeWidth="4" />
            <circle cx="64" cy="64" r="54" fill="#0B1310" />

            {/* Flexible Rubber Flaps (slit) */}
            <line x1="64" y1="12" x2="64" y2="116" stroke="#2B3632" strokeWidth="3" />
            <line x1="12" y1="64" x2="116" y2="64" stroke="#2B3632" strokeWidth="3" />
            <line x1="28" y1="28" x2="100" y2="100" stroke="#2B3632" strokeWidth="2" />
            <line x1="28" y1="100" x2="100" y2="28" stroke="#2B3632" strokeWidth="2" />

            {/* Label below slot */}
            <text x="64" y="138" fill="#5B655F" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="Plus Jakarta Sans">
              DEPOSIT ENTRY
            </text>

            {/* Animated Item entering or inside slot */}
            <g
              transform={`translate(${
                activeState === "INSERTING"
                  ? 30
                  : activeState === "PROCESSING"
                  ? 60
                  : activeState === "ACCEPTED"
                  ? 90
                  : 0
              }, 25)`}
              className={`transition-transform duration-700 ${getItemTransform()}`}
            >
              {activeLabel === "plastic_bottle" ? (
                /* SVG Plastic Bottle */
                <g>
                  <rect x="15" y="8" width="12" height="8" rx="2" fill="#3B82F6" />
                  <path
                    d="M 12 16 L 30 16 L 36 28 L 36 62 L 6 62 L 6 28 Z"
                    fill="#93C5FD"
                    stroke="#2563EB"
                    strokeWidth="1.5"
                    fillOpacity="0.8"
                  />
                  <line x1="10" y1="36" x2="32" y2="36" stroke="#2563EB" strokeWidth="1" strokeDasharray="2 2" />
                  <line x1="10" y1="46" x2="32" y2="46" stroke="#2563EB" strokeWidth="1" strokeDasharray="2 2" />
                </g>
              ) : activeLabel === "aluminium_can" ? (
                /* SVG Aluminium Can */
                <g>
                  <rect x="10" y="12" width="24" height="48" rx="5" fill="#E5E7EB" stroke="#9CA3AF" strokeWidth="2" />
                  <rect x="10" y="24" width="24" height="24" fill="#EF4444" />
                  <ellipse cx="22" cy="12" rx="10" ry="3" fill="#D1D5DB" />
                  <ellipse cx="22" cy="60" rx="10" ry="3" fill="#9CA3AF" />
                </g>
              ) : activeLabel === "plastic_bag" ? (
                /* SVG Plastic Bag */
                <g>
                  <path
                    d="M 10 16 C 10 6, 32 6, 32 16 L 36 56 C 36 62, 6 62, 6 56 Z"
                    fill="#FDE68A"
                    stroke="#D97706"
                    strokeWidth="1.5"
                    fillOpacity="0.85"
                  />
                  <circle cx="21" cy="22" r="5" fill="#0B1310" />
                </g>
              ) : (
                /* Non-recyclable / Stone */
                <g>
                  <polygon points="12,18 32,14 38,36 30,52 14,48 8,30" fill="#6B7280" stroke="#374151" strokeWidth="2" />
                </g>
              )}
            </g>
          </g>

          {/* Scanner Light Beam & Optical Window in slot */}
          {(activeState === "INSERTING" || activeState === "PROCESSING") && (
            <rect
              x="58"
              y="150"
              width="108"
              height="108"
              rx="54"
              fill="url(#scannerBeamGrad)"
              className="animate-pulse"
            />
          )}

          {/* RIGHT: Coin Tray & Receipt Dispenser */}
          <g id="receipt-and-coin" transform="translate(380, 140)">
            {/* Receipt Slot */}
            <rect x="0" y="8" width="100" height="8" rx="2" fill="#111827" stroke="#374151" />
            <text x="50" y="2" fill="#5B655F" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="Plus Jakarta Sans">
              RECEIPT
            </text>

            {/* Emerging Paper Receipt on Accepted */}
            {(activeState === "ACCEPTED" || activeState === "RECEIPT") && (
              <g className="animate-in slide-in-from-top-4 duration-500">
                <rect x="15" y="14" width="70" height="42" fill="#FFFFFF" stroke="#D1D5DB" strokeWidth="1" />
                <line x1="22" y1="22" x2="78" y2="22" stroke="#1F5C45" strokeWidth="1.5" />
                <line x1="22" y1="28" x2="68" y2="28" stroke="#9CA3AF" strokeWidth="1" />
                <line x1="22" y1="34" x2="72" y2="34" stroke="#9CA3AF" strokeWidth="1" />
                <line x1="22" y1="42" x2="55" y2="42" stroke="#12372A" strokeWidth="1.5" />
                <text x="50" y="52" fill="#1F5C45" fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="JetBrains Mono">
                  +PAID
                </text>
              </g>
            )}

            {/* Coin Tray */}
            <rect x="0" y="75" width="100" height="48" rx="10" fill="#1F2937" stroke="#374151" strokeWidth="2" />
            <ellipse cx="50" cy="115" rx="36" ry="6" fill="#111827" />
            <text x="50" y="70" fill="#5B655F" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="Plus Jakarta Sans">
              COIN TRAY
            </text>

            {/* Dropped Coins (Amber SVG tokens) */}
            {activeState === "ACCEPTED" && (
              <g className="animate-in zoom-in-75 duration-300">
                {Array.from({ length: coinCount }).map((_, idx) => (
                  <circle
                    key={idx}
                    cx={34 + idx * 10}
                    cy={98 - (idx % 2) * 5}
                    r="9"
                    fill="#E09B2D"
                    stroke="#B45309"
                    strokeWidth="1.5"
                  />
                ))}
              </g>
            )}
          </g>

          {/* Touchscreen Frame (Center-upper) */}
          <rect
            x="48"
            y="285"
            width="444"
            height="210"
            rx="14"
            fill="#0E1F19"
            stroke="#1F5C45"
            strokeWidth="2"
          />

          {/* Bottom Bin Compartments: PET, CANS, BAGS */}
          <g id="bottom-bins" transform="translate(48, 510)">
            {/* Bin 1: PET */}
            <g transform="translate(0, 0)">
              <rect x="0" y="0" width="138" height="126" rx="12" fill="#0E1F19" stroke="#1F5C45" strokeWidth="1.5" />
              <rect x="14" y="24" width="110" height="60" rx="6" fill="#162D24" />
              {/* Fill level bar */}
              <rect
                x="14"
                y={84 - (binFills.pet * 0.6)}
                width="110"
                height={binFills.pet * 0.6}
                rx="4"
                fill="#3B82F6"
                opacity="0.8"
                className="transition-all duration-700"
              />
              <text x="69" y="16" fill="#FFFFFF" fontSize="12" fontWeight="bold" textAnchor="middle" fontFamily="Bricolage Grotesque">
                PET (PLASTIC)
              </text>
              <text x="69" y="104" fill="#A7F3D0" fontSize="10" fontFamily="JetBrains Mono" textAnchor="middle">
                {binFills.pet}% FULL
              </text>
            </g>

            {/* Bin 2: CANS */}
            <g transform="translate(153, 0)">
              <rect x="0" y="0" width="138" height="126" rx="12" fill="#0E1F19" stroke="#1F5C45" strokeWidth="1.5" />
              <rect x="14" y="24" width="110" height="60" rx="6" fill="#162D24" />
              {/* Fill level bar */}
              <rect
                x="14"
                y={84 - (binFills.cans * 0.6)}
                width="110"
                height={binFills.cans * 0.6}
                rx="4"
                fill="#EF4444"
                opacity="0.8"
                className="transition-all duration-700"
              />
              <text x="69" y="16" fill="#FFFFFF" fontSize="12" fontWeight="bold" textAnchor="middle" fontFamily="Bricolage Grotesque">
                ALUMINIUM CANS
              </text>
              <text x="69" y="104" fill="#A7F3D0" fontSize="10" fontFamily="JetBrains Mono" textAnchor="middle">
                {binFills.cans}% FULL
              </text>
            </g>

            {/* Bin 3: BAGS */}
            <g transform="translate(306, 0)">
              <rect x="0" y="0" width="138" height="126" rx="12" fill="#0E1F19" stroke="#1F5C45" strokeWidth="1.5" />
              <rect x="14" y="24" width="110" height="60" rx="6" fill="#162D24" />
              {/* Fill level bar */}
              <rect
                x="14"
                y={84 - (binFills.bags * 0.6)}
                width="110"
                height={binFills.bags * 0.6}
                rx="4"
                fill="#F59E0B"
                opacity="0.8"
                className="transition-all duration-700"
              />
              <text x="69" y="16" fill="#FFFFFF" fontSize="12" fontWeight="bold" textAnchor="middle" fontFamily="Bricolage Grotesque">
                PLASTIC BAGS
              </text>
              <text x="69" y="104" fill="#A7F3D0" fontSize="10" fontFamily="JetBrains Mono" textAnchor="middle">
                {binFills.bags}% FULL
              </text>
            </g>
          </g>
        </svg>

        {/* Touchscreen Content Overlay inside the Screen Frame */}
        <div
          className="absolute left-[8.9%] top-[42%] w-[82.2%] h-[30.8%] rounded-[10px] overflow-hidden p-3.5 flex flex-col justify-between text-white select-text"
          style={{ backgroundColor: "transparent" }}
        >
          {variant === "live" && screenContent ? (
            screenContent
          ) : (
            /* Demo variant internal screen */
            <div className="h-full flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                <span className="text-[11px] font-mono text-emerald-400">DEMO RUNNER</span>
                <span className="text-[10px] font-mono text-white/60">
                  {currentScenario?.decision === "accepted" ? "VERIFIED" : "EJECT"}
                </span>
              </div>
              <div className="my-auto text-center py-1">
                <p className="text-xs text-white/70 font-medium">{currentScenario?.caption}</p>
                <p className="text-xl font-bold font-heading text-emerald-300 mt-1">
                  {currentScenario?.decision === "accepted"
                    ? `+${formatPaise(currentScenario.payout)}`
                    : "No Payout"}
                </p>
                <p className="text-[10px] font-mono text-white/50 mt-0.5">
                  Item: {currentScenario?.label} • {currentScenario?.weight}g
                </p>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-white/40 pt-1 border-t border-white/10">
                <span>Load Cell: {activeWeight}g</span>
                <span>LED: {activeState}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
