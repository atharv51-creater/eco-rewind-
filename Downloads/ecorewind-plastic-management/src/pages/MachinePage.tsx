import React, { useState, useEffect, useRef, useCallback } from "react";
import { useWalletId } from "../context/WalletIdContext";
import { useWallet } from "../hooks/useWallet";
import { useRates } from "../hooks/useRates";
import { useCamera } from "../hooks/useCamera";
import { generateUuid } from "../utils/ids";
import { formatPaise, calculatePayout } from "../utils/money";
import { api } from "../services/api";
import { MachineIllustration } from "../machine/MachineIllustration";
import {
  Camera,
  FolderOpen,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Sliders,
  CheckCircle2,
  XCircle,
  Tv,
  Zap,
  QrCode,
  X,
  Clock,
  Smartphone,
} from "lucide-react";
import { ClassifyResponse, ScanResponse } from "../types";

interface MachinePageProps {
  onNavigateWallet?: () => void;
}

interface LogEntry {
  id: string;
  time: string;
  text: string;
  type: "success" | "invalid" | "info";
}

export const MachinePage: React.FC<MachinePageProps> = ({ onNavigateWallet }) => {
  const { userId } = useWalletId();
  const { wallet, displayBalancePaise, refresh: refreshWallet } = useWallet(userId);
  const { rates } = useRates();

  // Mode view toggle: 'scanner' (100% exact screenshot view) or 'cabinet' (physical SVG machine)
  const [viewMode, setViewMode] = useState<"scanner" | "cabinet">("scanner");

  // Load cell weight sensor (slider 0 to 500g, default 250g)
  const [weightGrams, setWeightGrams] = useState<number>(250);

  // Active input mode: "live_camera" | "upload" | "bottle" | "can" | "bag" | "trash"
  const [selectedSource, setSelectedSource] = useState<
    "live_camera" | "upload" | "bottle" | "can" | "bag" | "trash"
  >("live_camera");

  // Camera hook
  const { videoRef, stream, error: cameraError, isStarting: isCameraStarting, startCamera, stopCamera, captureFrame } = useCamera();

  // Uploaded photo state
  // Uploaded photo state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadedBlob, setUploadedBlob] = useState<Blob | null>(null);
  const lastLoggedLabelRef = useRef<string>("");

  // AI Classification state
  const [currentClassification, setCurrentClassification] = useState<ClassifyResponse>({
    decision: "rejected",
    reason: "Align container in chamber reticle",
    label: "other_invalid",
    display_label: "Chamber Standby",
    confidence: 0.0,
    scores: {},
    rate_paise_per_gram: 0,
    model: "4-Class MobileNetV2",
  });

  // Machine logs
  const [machineLogs, setMachineLogs] = useState<LogEntry[]>([
    { id: "1", time: "Ready", text: "AI Scanner Initialized (MobileNetV2 Transfer Model)", type: "info" },
    { id: "2", time: "Ready", text: "Chamber vision active. Present bottle, can or bag to reticle.", type: "info" },
  ]);

  const logContainerRef = useRef<HTMLDivElement>(null);

  const [isInserting, setIsInserting] = useState<boolean>(false);
  const [depositResult, setDepositResult] = useState<ScanResponse | null>(null);
  const [toastNotification, setToastNotification] = useState<string | null>(null);

  // Kiosk QR Code Modal Session (for multi-device / phone testing)
  const [qrModalSession, setQrModalSession] = useState<{
    token: string;
    claimUrl: string;
    sessionId: string;
    amountInr: string;
    itemType: string;
    displayLabel: string;
    weightGrams: number;
    expiresAt: string;
    status: "pending" | "claimed" | "expired";
    claimerInfo?: string | null;
  } | null>(null);

  // Zero-Touch Automation State (No human in loop)
  const [isAutoCreditEnabled, setIsAutoCreditEnabled] = useState<boolean>(true);
  const [autoCreditCountdown, setAutoCreditCountdown] = useState<number | null>(null);
  const [lastAutoCreditInfo, setLastAutoCreditInfo] = useState<{
    label: string;
    amount: string;
    timestamp: number;
  } | null>(null);

  const isDepositingRef = useRef<boolean>(false);
  const cooldownUntilRef = useRef<number>(0);
  const lastAutoDepositedFingerprintRef = useRef<string>("");

  // Auto-start live camera on mount
  useEffect(() => {
    if (selectedSource === "live_camera") {
      startCamera();
    } else {
      stopCamera();
    }
  }, [selectedSource, startCamera, stopCamera]);

  // Append entry to machine log
  const addLog = useCallback((text: string, type: "success" | "invalid" | "info" = "info") => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).toLowerCase();

    setMachineLogs((prev) => [
      ...prev,
      {
        id: "log-" + Date.now() + Math.random(),
        time: timeStr,
        text,
        type,
      },
    ]);
  }, []);

  // Scroll log to bottom on change
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [machineLogs]);

  // Continuous live vision classification runner (~750ms interval)
  const isRunningAiRef = useRef<boolean>(false);

  // Robust data URL to Blob converter without network calls
  const preventClipboardPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    setToastNotification(
      'The model only accepts images from the camera or from the "Upload photo" button. Please use those instead of pasting from the clipboard.'
    );
  };
  const dataUrlToBlob = (dataUrl: string): Blob => {
    const parts = dataUrl.split(",");
    const mime = parts[0].match(/:(.*?);/)?.[1] || "image/jpeg";
    const binaryStr = atob(parts[1]);
    const len = binaryStr.length;
    const u8arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      u8arr[i] = binaryStr.charCodeAt(i);
    }
    return new Blob([u8arr], { type: mime });
  };

  // Handle Sample selection with real dataset images and live model inference
  const handleSelectSample = async (
    category: "plastic_bottle" | "aluminium_can" | "plastic_bag" | "other_invalid",
    weight: number,
    key: "bottle" | "can" | "bag" | "trash"
  ) => {
    setSelectedSource(key);
    setWeightGrams(weight);
    stopCamera();
    lastAutoDepositedFingerprintRef.current = "";
    cooldownUntilRef.current = 0;
    try {
      const res = await fetch(`/api/sample?class=${category}`);
      const data = await res.json();
      if (data.ok && data.dataUrl) {
        setUploadedImageUrl(data.dataUrl);
        const blob = dataUrlToBlob(data.dataUrl);
        setUploadedBlob(blob);
        const classification = await api.classify(blob);
        setCurrentClassification(classification);
        lastLoggedLabelRef.current = classification.label;
        const logText = `AI Detected: ${classification.display_label} (${Math.round(classification.confidence * 100)}%)`;
        addLog(logText, classification.decision === "accepted" ? "success" : "invalid");
      }
    } catch {
      const classification = await api.classify(category);
      setCurrentClassification(classification);
      lastLoggedLabelRef.current = classification.label;
      addLog(`AI Detected: ${classification.display_label} (${Math.round(classification.confidence * 100)}%)`, classification.decision === "accepted" ? "success" : "invalid");
    }
  };

  const runAiClassification = useCallback(async () => {
    if (isRunningAiRef.current || isInserting) return;
    isRunningAiRef.current = true;

    try {
      let result: ClassifyResponse | null = null;

      if (selectedSource === "live_camera") {
        if (stream && videoRef.current) {
          const blob = await captureFrame();
          if (blob) {
            result = await api.classify(blob);
            setCurrentClassification(result);
            if (result.label !== lastLoggedLabelRef.current && result.confidence >= 0.50) {
              lastLoggedLabelRef.current = result.label;
              const logText = `AI Detected: ${result.display_label} (${Math.round(result.confidence * 100)}%)`;
              addLog(logText, result.decision === "accepted" ? "success" : "invalid");
            }
          }
        }
      } else if (selectedSource === "upload" && uploadedBlob) {
        result = await api.classify(uploadedBlob);
        setCurrentClassification(result);
        if (result.label !== lastLoggedLabelRef.current) {
          lastLoggedLabelRef.current = result.label;
          const logText = `AI Detected: ${result.display_label} (${Math.round(result.confidence * 100)}%)`;
          addLog(logText, result.decision === "accepted" ? "success" : "invalid");
        }
      }
    } catch {
      // Ignore
    } finally {
      isRunningAiRef.current = false;
    }
  }, [
    selectedSource,
    isInserting,
    stream,
    videoRef,
    captureFrame,
    uploadedBlob,
    addLog,
  ]);

  // Interval for continuous AI detection (~800ms)
  useEffect(() => {
    runAiClassification();
    const interval = setInterval(runAiClassification, 800);
    return () => clearInterval(interval);
  }, [runAiClassification]);

  // Handle Photo Upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      stopCamera();
      lastAutoDepositedFingerprintRef.current = "";
      cooldownUntilRef.current = 0;
      setUploadedBlob(file);
      const url = URL.createObjectURL(file);
      setUploadedImageUrl(url);
      setSelectedSource("upload");
      try {
        const result = await api.classify(file);
        setCurrentClassification(result);
        lastLoggedLabelRef.current = result.label;
        addLog(`AI Detected: ${result.display_label} (${Math.round(result.confidence * 100)}%)`, result.decision === "accepted" ? "success" : "invalid");
      } catch {
        // Fallback
      }
    }
  };

  // Tariff & Payout Calculation
  const isAcceptedClass =
    currentClassification.decision === "accepted" &&
    rates.accepted_classes.includes(currentClassification.label);
  const isConfidencePass = currentClassification.confidence >= 0.75;
  const itemMinWeight =
    rates.min_weight_by_item?.[currentClassification.label] ?? rates.min_weight_g;
  const isWeightValid = weightGrams >= itemMinWeight && weightGrams <= rates.max_weight_g;
  const isPayable = isAcceptedClass && isConfidencePass && isWeightValid;

  const currentRate = rates.rates_paise_per_gram[currentClassification.label] || 0;
  const payoutCalc = calculatePayout(
    weightGrams,
    isPayable ? currentRate : 0,
    rates.bonus_threshold_g,
    rates.bonus_pct
  );

  const payoutRupees = (payoutCalc.totalPaise / 100).toFixed(2);

  // Handle Deposit / Insert (Manual, Auto or Kiosk QR Code)
  const executeDeposit = useCallback(
    async (mode: "auto" | "manual" | "qr" = "manual") => {
      if (isDepositingRef.current) return;
      isDepositingRef.current = true;
      setIsInserting(true);
      setAutoCreditCountdown(null);
      setToastNotification(null);

      const idempotencyKey = generateUuid();
      const currentUserId = mode === "qr" ? "anonymous" : userId || "demo-98218587";
      const currentFingerprint = `${currentClassification.label}_${weightGrams}_${selectedSource}`;

      try {
        if (mode === "qr") {
          const kioskDeposit = await api.createKioskDeposit({
            itemType: currentClassification.label,
            weightGrams: Math.round(weightGrams),
            confidence: currentClassification.confidence,
            idempotencyKey,
          });

          const creditedRupees = kioskDeposit.amountInr;
          addLog(
            `[Kiosk QR] ACCEPTED: ₹${creditedRupees} reserved — scan the QR code to claim`,
            "success"
          );
          setToastNotification(
            `Accepted! ₹${creditedRupees} reserved. Scan the QR code to claim.`
          );

          setQrModalSession({
            token: kioskDeposit.token,
            claimUrl: kioskDeposit.claimUrl || `/app/claim/${kioskDeposit.token}`,
            sessionId: kioskDeposit.sessionId,
            amountInr: creditedRupees,
            itemType: kioskDeposit.itemType || currentClassification.label,
            displayLabel: currentClassification.display_label,
            weightGrams: kioskDeposit.weightGrams ?? weightGrams,
            expiresAt: kioskDeposit.expiresAt || new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            status: "pending",
          });

          setLastAutoCreditInfo({
            label: currentClassification.display_label,
            amount: creditedRupees,
            timestamp: Date.now(),
          });
          lastAutoDepositedFingerprintRef.current = currentFingerprint;
          cooldownUntilRef.current = Date.now() + 3500;
          return;
        }

        let frameData: Blob | ClassifyResponse = currentClassification;
        if (selectedSource === "live_camera" && stream) {
          const captured = await captureFrame();
          if (captured) frameData = captured;
        } else if (uploadedBlob) {
          frameData = uploadedBlob;
        }

        const res = await api.scan(
          idempotencyKey,
          currentUserId,
          weightGrams,
          frameData,
          "RVM-01"
        );

        setDepositResult(res);
        refreshWallet();

        if (res.decision === "accepted") {
          const creditedRupees = res.transaction?.payout_paise
            ? (res.transaction.payout_paise / 100).toFixed(2)
            : payoutRupees;
          addLog(
            `[Manual Deposit] ACCEPTED: +₹${creditedRupees} credited to wallet (${res.display_label})`,
            "success"
          );
          setToastNotification(`Accepted! +₹${creditedRupees} credited to wallet.`);
          setLastAutoCreditInfo({
            label: res.display_label,
            amount: creditedRupees,
            timestamp: Date.now(),
          });
          lastAutoDepositedFingerprintRef.current = currentFingerprint;
          cooldownUntilRef.current = Date.now() + 3500;
        } else {
          addLog(`Deposit REJECTED: ${res.reason}`, "invalid");
          setToastNotification(`Item ejected: ${res.reason}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Deposit failed";
        addLog(`Deposit Error: ${msg}`, "invalid");
        setToastNotification(`Error: ${msg}`);
      } finally {
        setIsInserting(false);
        isDepositingRef.current = false;
      }
    },
    [
      currentClassification,
      weightGrams,
      selectedSource,
      userId,
      stream,
      captureFrame,
      uploadedBlob,
      refreshWallet,
      addLog,
    ]
  );

  // Live polling for Kiosk QR session claim state
  useEffect(() => {
    if (!qrModalSession || qrModalSession.status !== "pending") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/deposit/${encodeURIComponent(qrModalSession.sessionId)}/status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "claimed") {
          setQrModalSession((prev) => (prev ? { ...prev, status: "claimed", claimerInfo: data.claimerInfo } : null));
          refreshWallet();
          addLog(`Kiosk QR session claimed! Credited to ${data.claimerInfo || "wallet"}.`, "success");
        } else if (data.status === "expired") {
          setQrModalSession((prev) => (prev ? { ...prev, status: "expired" } : null));
        }
      } catch {
        // ignore
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [qrModalSession, refreshWallet, addLog]);

  // QR Code 5-minute countdown timer
  const [qrCountdown, setQrCountdown] = useState<string>("05:00");

  useEffect(() => {
    if (!qrModalSession || qrModalSession.status !== "pending") return;
    const updateCountdown = () => {
      const expires = new Date(qrModalSession.expiresAt).getTime();
      const remaining = Math.max(0, Math.floor((expires - Date.now()) / 1000));
      if (remaining <= 0) {
        setQrModalSession((prev) => (prev ? { ...prev, status: "expired" } : null));
        setQrCountdown("00:00");
      } else {
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        setQrCountdown(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
      }
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [qrModalSession?.expiresAt, qrModalSession?.status]);

  // --- AUTOMATIC KIOSK QR CODE ENGINE ---
  // When plastic bottle, aluminium can, or plastic bag is detected with valid weight and confidence:
  // Automatically open the Kiosk QR code modal after 2.0 seconds of detection!
  useEffect(() => {
    if (!isAutoCreditEnabled || isInserting || isDepositingRef.current || qrModalSession) {
      setAutoCreditCountdown(null);
      return;
    }

    // If classification is other_invalid or not payable, reset lock once cooldown passes
    if (!isPayable || currentClassification.label === "other_invalid" || currentClassification.confidence < 0.75) {
      if (Date.now() > cooldownUntilRef.current) {
        lastAutoDepositedFingerprintRef.current = "";
      }
      setAutoCreditCountdown(null);
      return;
    }

    const currentFingerprint = `${currentClassification.label}_${weightGrams}_${selectedSource}`;

    // If this item was already processed or cooldown is active, hold off
    if (
      lastAutoDepositedFingerprintRef.current === currentFingerprint ||
      Date.now() < cooldownUntilRef.current
    ) {
      setAutoCreditCountdown(null);
      return;
    }

    // Start 2-second countdown for optical stabilization, then open Kiosk QR code
    setAutoCreditCountdown(2);

    const countdownInterval = setInterval(() => {
      setAutoCreditCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const timer = setTimeout(() => {
      setAutoCreditCountdown(null);
      executeDeposit("qr");
    }, 2000);

    return () => {
      clearInterval(countdownInterval);
      clearTimeout(timer);
    };
  }, [
    isPayable,
    isAutoCreditEnabled,
    isInserting,
    qrModalSession,
    currentClassification.label,
    currentClassification.confidence,
    weightGrams,
    selectedSource,
    executeDeposit,
  ]);

  return (
    <div className="min-h-screen bg-[#F6F6F3] py-6 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Top Control Bar: View Mode Switcher & Automation Switch */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#E5E6E1]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-[#1F5C45] uppercase tracking-wider">
              RVM Scanner Vision System
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Kiosk Auto-QR Scanner Toggle */}
            <button
              type="button"
              onClick={() => {
                const next = !isAutoCreditEnabled;
                setIsAutoCreditEnabled(next);
                addLog(`⚡ Auto-QR Scanner switched ${next ? "ON" : "OFF"}.`, "info");
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isAutoCreditEnabled
                  ? "bg-[#E5F0EA] border-[#1F5C45] text-[#12372A] shadow-xs"
                  : "bg-white border-[#E5E6E1] text-[#5B655F] hover:text-[#1C2321]"
              }`}
              title="When enabled, detecting an accepted item automatically opens the Kiosk QR Code after 2 seconds"
            >
              <QrCode
                className={`w-3.5 h-3.5 ${
                  isAutoCreditEnabled ? "text-[#1F5C45]" : "text-[#5B655F]"
                }`}
              />
              <span>
                Auto-QR (2s): <strong>{isAutoCreditEnabled ? "ON" : "OFF"}</strong>
              </span>
            </button>

            <div className="flex bg-white rounded-xl p-1 border border-[#E5E6E1]">
              <button
                type="button"
                onClick={() => setViewMode("scanner")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === "scanner"
                    ? "bg-[#1F5C45] text-white shadow-xs"
                    : "text-[#5B655F] hover:text-[#1C2321]"
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>AI Vision Scanner</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode("cabinet")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === "cabinet"
                    ? "bg-[#1F5C45] text-white shadow-xs"
                    : "text-[#5B655F] hover:text-[#1C2321]"
                }`}
              >
                <Tv className="w-3.5 h-3.5" />
                <span>RVM Cabinet View</span>
              </button>
            </div>
          </div>
        </div>

        {toastNotification && (
          <div className="p-3 bg-white border border-[#1F5C45]/30 rounded-xl text-xs font-medium text-[#12372A] shadow-sm flex items-center justify-between animate-in fade-in">
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-[#1F5C45]" />
              {toastNotification}
            </span>
            <button
              onClick={() => setToastNotification(null)}
              className="text-[#5B655F] hover:text-black font-bold text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* VIEW MODE 1: 100% IDENTICAL SCANNER INTERFACE (MATCHING USER SCREENSHOT) */}
        {viewMode === "scanner" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT CARD (7 COLS): Scanner (Continuous Vision Feed) */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-[#E5E6E1] p-5 shadow-xs space-y-4">
              <h2 className="text-base sm:text-lg font-bold font-heading text-[#1C2321]">
                Scanner (Continuous Vision Feed)
              </h2>

              {/* Video / Camera Feed Container */}
              <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-[#181E1C] border border-gray-300 flex items-center justify-center select-none" onPaste={preventClipboardPaste}>
                {/* 1. Camera Video Feed or Sample Image */}
                {selectedSource === "live_camera" ? (
                  stream ? (
                    <video
                      ref={(el) => {
                        videoRef.current = el;
                        if (el && stream && el.srcObject !== stream) {
                          el.srcObject = stream;
                          el.play().catch(() => {});
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      onLoadedMetadata={(e) => {
                        (e.target as HTMLVideoElement).play().catch(() => {});
                      }}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-[#111827] text-white p-6 text-center space-y-3">
                      <span className="text-5xl animate-pulse">📹</span>
                      <p className="text-sm font-semibold text-gray-200">
                        {cameraError
                          ? cameraError
                          : isCameraStarting
                          ? "Starting camera..."
                          : "Camera ready to connect. Click below to start, or pick a sample item."}
                      </p>
                      <button
                        type="button"
                        onClick={() => startCamera()}
                        className="px-4 py-2 bg-[#1F5C45] hover:bg-[#12372A] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      >
                        Start / Reconnect Camera
                      </button>
                    </div>
                  )
                ) : uploadedImageUrl ? (
                  <img
                    src={uploadedImageUrl}
                    alt="Chamber item preview"
                    className="w-full h-full object-contain bg-black/80"
                  />
                ) : (
                  /* Synthetic sample container simulation view */
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#1F2937] to-[#111827] text-white">
                    {selectedSource === "bottle" && (
                      <div className="text-center space-y-2">
                        <span className="text-7xl block animate-bounce">🧴</span>
                        <p className="font-mono text-sm text-emerald-400 font-bold">
                          Sample Plastic Bottle (PET)
                        </p>
                      </div>
                    )}
                    {selectedSource === "can" && (
                      <div className="text-center space-y-2">
                        <span className="text-7xl block animate-bounce">🥫</span>
                        <p className="font-mono text-sm text-emerald-400 font-bold">
                          Sample Aluminium Beverage Can
                        </p>
                      </div>
                    )}
                    {selectedSource === "bag" && (
                      <div className="text-center space-y-2">
                        <span className="text-7xl block animate-bounce">🛍️</span>
                        <p className="font-mono text-sm text-amber-300 font-bold">
                          Sample Clean Plastic Bag (Film)
                        </p>
                      </div>
                    )}
                    {selectedSource === "trash" && (
                      <div className="text-center space-y-2">
                        <span className="text-7xl block animate-bounce">❌</span>
                        <p className="font-mono text-sm text-red-400 font-bold">
                          Non-Recyclable Trash / Debris
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Top-Left Floating Pill Badges */}
                <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2 z-10 pointer-events-none">
                  <span className="px-3 py-1 rounded-full bg-[#D9383A] text-white font-medium text-xs shadow-xs">
                    Live camera
                  </span>
                  <span className="px-3 py-1 rounded-full bg-[#164333] text-white font-medium text-xs shadow-xs">
                    AI: 4-Class MobileNetV2
                  </span>
                  {isAutoCreditEnabled && (
                    <span className="px-3 py-1 rounded-full bg-[#10B981] text-white font-medium text-xs shadow-xs flex items-center gap-1">
                      <Zap className="w-3 h-3 fill-white" />
                      <span>Zero-Touch Auto-Credit</span>
                    </span>
                  )}
                </div>

                {/* 2b. Zero-Touch Auto-Credit Chamber Live Countdown Banner */}
                {autoCreditCountdown !== null && (
                  <div className="absolute top-14 inset-x-4 sm:inset-x-8 z-30 flex flex-col items-center justify-center p-3 rounded-xl bg-black/90 backdrop-blur-md border border-[#34D399] shadow-xl text-center animate-in fade-in zoom-in-95">
                    <div className="flex items-center gap-2 text-[#34D399] text-xs font-bold tracking-wider uppercase">
                      <Zap className="w-4 h-4 fill-[#34D399] animate-pulse" />
                      <span>Zero-Touch Auto-Crediting in 2s</span>
                    </div>
                    <p className="text-white text-xs mt-1">
                      Detected <strong className="text-emerald-300">{currentClassification.display_label}</strong> &bull; Crediting ₹{payoutRupees} directly without human in loop
                    </p>
                    <div className="w-full bg-gray-700 h-1.5 rounded-full mt-2.5 overflow-hidden">
                      <div className="bg-[#34D399] h-full transition-all duration-2000 ease-linear" style={{ width: "100%" }} />
                    </div>
                  </div>
                )}

                {/* 2c. Zero-Touch Auto-Credit Success Toast Banner */}
                {lastAutoCreditInfo && Date.now() - lastAutoCreditInfo.timestamp < 3500 && autoCreditCountdown === null && (
                  <div className="absolute top-14 inset-x-4 sm:inset-x-8 z-30 flex items-center justify-center gap-2 p-2.5 rounded-xl bg-[#064E3B]/95 backdrop-blur-md border border-[#34D399] text-white text-xs font-semibold shadow-xl animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-[#34D399]" />
                    <span>⚡ Auto-Credited ₹{lastAutoCreditInfo.amount} directly to wallet without human in loop!</span>
                  </div>
                )}

                {/* 3. Center Target Focus Box & Laser Scanning Beam */}
                <div className="absolute inset-x-[15%] inset-y-[15%] pointer-events-none flex flex-col justify-between">
                  {/* Top Reticle Corners */}
                  <div className="flex justify-between items-start">
                    {/* Top-Left Bracket ┌ with Tag */}
                    <div className="relative">
                      <div
                        className={`w-10 h-10 border-t-4 border-l-4 rounded-tl-sm ${
                          isPayable ? "border-[#34D399]" : "border-[#F87171]"
                        }`}
                      />
                      <span
                        className={`absolute -top-3.5 left-0 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white whitespace-nowrap shadow-xs ${
                          isPayable ? "bg-[#10B981]" : "bg-[#F87171]"
                        }`}
                      >
                        {currentClassification.display_label} (
                        {Math.round(currentClassification.confidence * 100)}%)
                      </span>
                    </div>

                    {/* Top-Right Bracket ┐ */}
                    <div
                      className={`w-10 h-10 border-t-4 border-r-4 rounded-tr-sm ${
                        isPayable ? "border-[#34D399]" : "border-[#F87171]"
                      }`}
                    />
                  </div>

                  {/* Horizontal Laser Scanning Beam with Subtle Glow */}
                  <div className="relative w-full h-0.5 bg-[#F59E0B] shadow-[0_0_12px_#FBBF24] animate-[scan_2s_ease-in-out_infinite]" />

                  {/* Bottom Reticle Corners */}
                  <div className="flex justify-between items-end">
                    {/* Bottom-Left Bracket └ */}
                    <div
                      className={`w-10 h-10 border-b-4 border-l-4 rounded-bl-sm ${
                        isPayable ? "border-[#34D399]" : "border-[#F87171]"
                      }`}
                    />

                    {/* Bottom-Right Bracket ┘ with Status Tag */}
                    <div className="relative">
                      <div
                        className={`w-10 h-10 border-b-4 border-r-4 rounded-br-sm ${
                          isPayable ? "border-[#34D399]" : "border-[#F87171]"
                        }`}
                      />
                      <span
                        className={`absolute -bottom-3.5 right-0 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-white whitespace-nowrap shadow-xs ${
                          isPayable ? "bg-[#10B981]" : "bg-[#F87171]"
                        }`}
                      >
                        {isPayable ? `Accepted (+₹${payoutRupees})` : "No payout (Blocked)"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Six Control Buttons (2 Rows exactly matching screenshot) */}
              <div className="space-y-2">
                {/* Row 1 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSource("live_camera");
                      setUploadedImageUrl(null);
                      setUploadedBlob(null);
                      startCamera();
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                      selectedSource === "live_camera"
                        ? "bg-[#E5F0EA] border-[#1F5C45] text-[#12372A] shadow-xs"
                        : "bg-white border-[#E5E6E1] text-[#1C2321] hover:bg-gray-50"
                    }`}
                  >
                    <span>📹</span>
                    <span>Live camera</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                      selectedSource === "upload"
                        ? "bg-[#E5F0EA] border-[#1F5C45] text-[#12372A] shadow-xs"
                        : "bg-white border-[#E5E6E1] text-[#1C2321] hover:bg-gray-50"
                    }`}
                  >
                    <span>📁</span>
                    <span>Upload photo</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => handleSelectSample("plastic_bottle", 250, "bottle")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                      selectedSource === "bottle"
                        ? "bg-[#E5F0EA] border-[#1F5C45] text-[#12372A] shadow-xs"
                        : "bg-white border-[#E5E6E1] text-[#1C2321] hover:bg-gray-50"
                    }`}
                  >
                    <span>🧴</span>
                    <span>Bottle</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectSample("aluminium_can", 450, "can")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                      selectedSource === "can"
                        ? "bg-[#E5F0EA] border-[#1F5C45] text-[#12372A] shadow-xs"
                        : "bg-white border-[#E5E6E1] text-[#1C2321] hover:bg-gray-50"
                    }`}
                  >
                    <span>🥫</span>
                    <span>Can</span>
                  </button>
                </div>

                {/* Row 2 */}
                <div className="grid grid-cols-2 gap-2 max-w-xs">
                  <button
                    type="button"
                    onClick={() => handleSelectSample("plastic_bag", 140, "bag")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                      selectedSource === "bag"
                        ? "bg-[#E5F0EA] border-[#1F5C45] text-[#12372A] shadow-xs"
                        : "bg-white border-[#E5E6E1] text-[#1C2321] hover:bg-gray-50"
                    }`}
                  >
                    <span>🛍️</span>
                    <span>Bag</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectSample("other_invalid", 80, "trash")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                      selectedSource === "trash"
                        ? "bg-[#FBEAE7] border-[#B9402B] text-[#B9402B] shadow-xs"
                        : "bg-white border-[#E5E6E1] text-[#1C2321] hover:bg-gray-50"
                    }`}
                  >
                    <span>❌</span>
                    <span>Trash</span>
                  </button>
                </div>
              </div>

              {/* Linked Wallet Readout */}
              <div className="text-xs text-[#5B655F]">
                Linked wallet <strong className="text-[#12372A] font-mono">{userId || "demo-98218587"}</strong>:{" "}
                <strong className="text-[#12372A] font-mono">{formatPaise(displayBalancePaise)}</strong>
              </div>

              {/* Machine Log Section */}
              <div className="space-y-2 pt-2 border-t border-[#E5E6E1]">
                <h3 className="text-xs font-bold text-[#12372A] font-heading">
                  Machine log
                </h3>
                <div
                  ref={logContainerRef}
                  className="h-44 overflow-y-auto bg-[#0B211A] text-[#34D399] p-3 rounded-xl font-mono text-xs space-y-1 border border-[#0D261D]"
                >
                  {machineLogs.map((log) => (
                    <div key={log.id} className="leading-relaxed">
                      <span className="text-[#9CA3AF] select-none">[{log.time}] </span>
                      <span
                        className={
                          log.type === "invalid"
                            ? "text-[#F87171]"
                            : log.type === "success"
                            ? "text-[#34D399]"
                            : "text-[#E5E7EB]"
                        }
                      >
                        {log.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT CARD (5 COLS): Deposit & Live AI Valuation */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E5E6E1] p-6 shadow-xs space-y-6">
              <h2 className="text-base sm:text-lg font-bold font-heading text-[#1C2321]">
                Deposit &amp; Live AI Valuation
              </h2>

              {/* Load Cell Weight Sensor */}
              <div className="space-y-2">
                <span className="text-xs text-[#5B655F] block font-medium">
                  Load cell weight sensor
                </span>

                <div className="flex items-baseline gap-1 text-[#12372A]">
                  <span className="text-5xl font-bold font-heading tracking-tight">
                    {weightGrams}
                  </span>
                  <span className="text-2xl font-bold">g</span>
                </div>

                {/* Range Slider */}
                <div className="pt-2">
                  <input
                    type="range"
                    min="0"
                    max="500"
                    step="5"
                    value={weightGrams}
                    onChange={(e) => setWeightGrams(parseInt(e.target.value, 10))}
                    className="w-full h-2.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#1F5C45]"
                  />
                  <div className="flex items-center justify-between text-xs font-mono text-[#5B655F] mt-1.5">
                    <span>0 g</span>
                    <span className="text-[#E53E3E] font-medium">100 g minimum</span>
                    <span>500 g</span>
                  </div>
                </div>
              </div>

              {/* AI Recognition Status Card */}
              <div
                className={`p-4 rounded-xl border transition-all ${
                  isPayable
                    ? "bg-[#ECFDF5] border-[#10B981]"
                    : "bg-[#FEF2F2] border-[#F87171]"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#12372A]">
                    <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                    <span>Continuous AI Active</span>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      isPayable
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-[#FBEAE7] text-[#B9402B]"
                    }`}
                  >
                    {Math.round(currentClassification.confidence * 100)}% match
                  </span>
                </div>

                <h3
                  className={`text-2xl font-bold font-heading ${
                    isPayable ? "text-[#065F46]" : "text-[#991B1B]"
                  }`}
                >
                  {currentClassification.display_label}
                </h3>
                <p className="text-xs text-[#5B655F] mt-1">
                  {isPayable
                    ? "Valid recyclable container accepted"
                    : currentClassification.reason || "other invalid is not accepted"}
                </p>
              </div>

              {/* Real-Time Payout (Rupees) Card */}
              <div
                className={`p-5 rounded-2xl text-white transition-all ${
                  isPayable ? "bg-[#0E261D]" : "bg-[#2E1B1B]"
                }`}
              >
                <span className="text-xs font-mono tracking-wider uppercase text-white/60 block">
                  REAL-TIME PAYOUT (RUPEES)
                </span>

                <div
                  className={`text-4xl sm:text-5xl font-bold font-heading mt-2 tabular-nums ${
                    isPayable ? "text-[#34D399]" : "text-[#F87171]"
                  }`}
                >
                  ₹ {payoutRupees}
                </div>

                <p className="text-xs text-white/70 mt-2 font-mono">
                  {isPayable
                    ? `${weightGrams} g x ${currentRate} paise = ₹${payoutRupees}${
                        payoutCalc.bonusPaise > 0 ? " (+10% bulk bonus applied)" : ""
                      }`
                    : currentClassification.reason || "other invalid is not accepted"}
                </p>
              </div>

              {/* Action Button: Auto-QR Countdown Status or Manual QR Open */}
              <button
                type="button"
                disabled={isInserting}
                onClick={() => executeDeposit(isPayable ? "qr" : "manual")}
                className={`w-full py-3.5 px-4 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer relative overflow-hidden ${
                  isPayable
                    ? "bg-[#1F5C45] hover:bg-[#12372A] text-white shadow-sm"
                    : "bg-white hover:bg-[#FFF5F5] text-[#E53E3E] border-2 border-[#E53E3E]"
                }`}
              >
                {/* 2-second countdown indicator */}
                {isPayable && isAutoCreditEnabled && autoCreditCountdown !== null && (
                  <div
                    className="absolute bottom-0 left-0 h-1.5 bg-[#34D399] transition-all duration-1000 ease-linear"
                    style={{
                      width: `${Math.max(15, ((3 - autoCreditCountdown) / 2) * 100)}%`,
                    }}
                  />
                )}

                {isInserting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Opening Kiosk QR Claim Code...</span>
                  </span>
                ) : isPayable ? (
                  <span className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-[#34D399]" />
                    <span>
                      {autoCreditCountdown !== null
                        ? `⚡ Opening Kiosk QR in ${autoCreditCountdown}s (or click now)`
                        : `Generate Kiosk QR Code (Scan with Phone)`}
                    </span>
                  </span>
                ) : (
                  <span>Item Rejected (No Payout)</span>
                )}
              </button>

              {/* Secondary Action: Immediate Manual QR Code Trigger */}
              {isPayable && (
                <button
                  type="button"
                  disabled={isInserting}
                  onClick={() => executeDeposit("qr")}
                  className="w-full py-3 px-4 rounded-xl text-sm font-semibold transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer bg-[#0E261D] hover:bg-[#12372A] text-[#34D399] border border-[#10B981]/40 shadow-sm"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Generate Kiosk QR Code (Scan with Phone)</span>
                </button>
              )}

              {isAutoCreditEnabled && (
                <p className="text-[11px] text-center text-[#1F5C45] font-medium flex items-center justify-center gap-1.5 bg-[#E5F0EA] p-2.5 rounded-xl border border-[#1F5C45]/20">
                  <QrCode className="w-3.5 h-3.5 text-[#1F5C45] shrink-0" />
                  <span>Auto-QR Scanner active: Kiosk QR code opens automatically after 2s of object detection.</span>
                </p>
              )}
            </div>
          </div>
        ) : (
          /* VIEW MODE 2: Physical Machine SVG Enclosure Cabinet */
          <div className="bg-white rounded-3xl p-6 border border-[#E5E6E1]">
            <MachineIllustration
              variant="live"
              state={isPayable ? "DETECTING" : "REJECTED"}
              detectedItem={currentClassification}
              weightGrams={weightGrams}
              lastPayoutPaise={payoutCalc.totalPaise}
            />
          </div>
        )}
      </div>

      {/* QR Code Modal for Mobile Phone Claiming */}
      {qrModalSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0E261D] border border-[#10B981]/40 rounded-3xl max-w-md w-full p-6 text-white shadow-2xl relative overflow-hidden">
            {/* Close button */}
            <button
              onClick={() => setQrModalSession(null)}
              className="absolute top-4 right-4 text-white/60 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="text-center mb-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#10B981]/20 border border-[#10B981]/40 text-[#34D399] text-xs font-semibold mb-2">
                <QrCode className="w-3.5 h-3.5" />
                <span>Kiosk Deposit QR Code</span>
              </div>
              <h3 className="text-xl font-bold font-heading">Scan with Phone Camera</h3>
              <p className="text-xs text-white/70 mt-1">
                Open your phone's camera, scan the QR code to open the wallet and claim your reward instantly.
              </p>
            </div>

            {/* QR Code Card or Success/Expired Overlay */}
            {qrModalSession.status === "claimed" ? (
              <div className="bg-[#12372A] border border-[#10B981] rounded-2xl p-6 text-center my-3 animate-in zoom-in-95">
                <div className="w-16 h-16 rounded-full bg-[#10B981]/20 border-2 border-[#10B981] flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-10 h-10 text-[#34D399]" />
                </div>
                <h4 className="text-2xl font-bold text-[#34D399] mb-1">
                  +₹{qrModalSession.amountInr} Credited!
                </h4>
                <p className="text-sm text-white/90 font-medium">
                  Deposit successfully claimed
                </p>
                {qrModalSession.claimerInfo && (
                  <p className="text-xs text-white/60 font-mono mt-1">
                    Credited to: {qrModalSession.claimerInfo}
                  </p>
                )}
                <button
                  onClick={() => setQrModalSession(null)}
                  className="mt-5 w-full py-2.5 px-4 rounded-xl bg-[#10B981] hover:bg-[#059669] text-slate-900 font-semibold text-sm transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            ) : qrModalSession.status === "expired" ? (
              <div className="bg-[#2E1B1B] border border-[#F87171]/50 rounded-2xl p-6 text-center my-3">
                <div className="w-14 h-14 rounded-full bg-[#F87171]/20 border border-[#F87171] flex items-center justify-center mx-auto mb-3">
                  <XCircle className="w-8 h-8 text-[#F87171]" />
                </div>
                <h4 className="text-lg font-bold text-[#F87171] mb-1">QR Code Expired</h4>
                <p className="text-xs text-white/70">
                  This deposit QR code expired after 5 minutes. Please make a new deposit.
                </p>
                <button
                  onClick={() => setQrModalSession(null)}
                  className="mt-4 w-full py-2 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                {/* Active QR Code Display */}
                <div className="bg-white p-4 rounded-2xl flex flex-col items-center justify-center shadow-inner my-2">
                  <img
                    src={`/api/qr?text=${encodeURIComponent(qrModalSession.claimUrl)}`}
                    alt="Scan to Claim Reward"
                    className="w-48 h-48 object-contain"
                  />
                  <div className="text-[11px] font-mono text-gray-500 mt-2 text-center break-all max-w-xs">
                    {qrModalSession.claimUrl}
                  </div>
                </div>

                {/* Details Bar */}
                <div className="bg-[#12372A]/80 border border-[#10B981]/20 rounded-xl p-3 my-3 text-xs space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-white/60">Recyclable Item:</span>
                    <span className="font-semibold text-white">{qrModalSession.displayLabel}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/60">Validated Weight:</span>
                    <span className="font-semibold text-white">{qrModalSession.weightGrams} g</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/60">Calculated Reward:</span>
                    <span className="font-bold text-[#34D399] text-sm">₹{qrModalSession.amountInr}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/60">Session Ref:</span>
                    <span className="font-mono text-white/80">{qrModalSession.sessionId.slice(0, 12)}...</span>
                  </div>
                </div>

                {/* Countdown & Status */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <div className="flex items-center gap-1.5 text-amber-300 font-mono">
                    <Clock className="w-3.5 h-3.5 animate-pulse" />
                    <span>Expires in: {qrCountdown}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#34D399]">
                    <span className="w-2 h-2 rounded-full bg-[#10B981] animate-ping" />
                    <span>Waiting for scan...</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
