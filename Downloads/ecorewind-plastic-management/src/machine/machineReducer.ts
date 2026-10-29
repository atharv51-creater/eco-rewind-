import {
  MachineState,
  MachineContext,
  ClassifyResponse,
  ScanResponse,
  DecisionType,
} from "../types";

export type MachineAction =
  | { type: "SET_OFFLINE" }
  | { type: "SET_ONLINE" }
  | { type: "START_SESSION" }
  | { type: "LINK_WALLET"; userId: string }
  | { type: "ITEM_DETECTED"; classification: ClassifyResponse }
  | { type: "SET_WEIGHT"; weightGrams: number }
  | { type: "START_INSERTION" }
  | { type: "START_PROCESSING" }
  | { type: "SCAN_SUCCESS"; result: ScanResponse }
  | { type: "SCAN_REJECTED"; result: ScanResponse }
  | { type: "SCAN_ERROR"; message: string }
  | { type: "RESUME_DETECTING" }
  | { type: "FINISH_SESSION" }
  | { type: "RESET_TO_IDLE" };

export const initialMachineContext: MachineContext = {
  state: "IDLE",
  userId: "demo-user",
  currentWeightGrams: 250,
  detectedItem: {
    decision: "accepted",
    reason: "Valid recyclable PET bottle detected.",
    label: "plastic_bottle",
    display_label: "Plastic Bottle (PET)",
    confidence: 0.94,
    scores: { plastic_bottle: 0.94 },
    rate_paise_per_gram: 2,
    model: "MobileNetV2-Quantized",
  },
  lastScanResult: null,
  errorMessage: null,
  sessionItems: [],
  currentSessionTotalPaise: 0,
  currentSessionWeightGrams: 0,
  machineId: "RVM-01",
  logEvents: [
    {
      id: "log-1",
      time: new Date().toLocaleTimeString("en-IN"),
      message: "Machine RVM-01 booted. Self-diagnostics OK.",
      type: "info",
    },
    {
      id: "log-2",
      time: new Date().toLocaleTimeString("en-IN"),
      message: "MobileNetV2-Quantized vision model ready.",
      type: "info",
    },
  ],
  binFills: {
    pet: 28,
    cans: 15,
    bags: 10,
  },
};

export function machineReducer(
  state: MachineContext,
  action: MachineAction
): MachineContext {
  const now = new Date().toLocaleTimeString("en-IN");

  const addLog = (
    msg: string,
    type: "info" | "warn" | "error" | "success" = "info"
  ) => [
    { id: "log-" + Date.now() + Math.random(), time: now, message: msg, type },
    ...state.logEvents.slice(0, 19),
  ];

  switch (action.type) {
    case "SET_OFFLINE":
      return {
        ...state,
        state: "OFFLINE",
        errorMessage: "Machine is temporarily out of service.",
        logEvents: addLog("Connection lost. Machine entered OFFLINE state.", "error"),
      };

    case "SET_ONLINE":
      return {
        ...state,
        state: state.state === "OFFLINE" ? "IDLE" : state.state,
        errorMessage: null,
        logEvents: addLog("Connection restored. Service online.", "success"),
      };

    case "START_SESSION":
      return {
        ...state,
        state: "SESSION_START",
        logEvents: addLog("Customer initiated session. Awaiting wallet linking.", "info"),
      };

    case "LINK_WALLET":
      return {
        ...state,
        userId: action.userId,
        state: "DETECTING",
        logEvents: addLog(`Wallet ${action.userId} linked. Ready for insertion.`, "success"),
      };

    case "ITEM_DETECTED":
      return {
        ...state,
        detectedItem: action.classification,
        logEvents: addLog(
          `Scanner detected: ${action.classification.display_label} (${Math.round(
            action.classification.confidence * 100
          )}% confidence)`,
          action.classification.decision === "accepted" ? "info" : "warn"
        ),
      };

    case "SET_WEIGHT":
      return {
        ...state,
        currentWeightGrams: action.weightGrams,
      };

    case "START_INSERTION":
      return {
        ...state,
        state: "INSERTING",
        logEvents: addLog("Insertion chamber gate closed. Mechanical conveyor active.", "info"),
      };

    case "START_PROCESSING":
      return {
        ...state,
        state: "PROCESSING",
        logEvents: addLog("Verifying load cell & executing neural inference...", "info"),
      };

    case "SCAN_SUCCESS": {
      const result = action.result;
      const binType =
        result.label === "aluminium_can"
          ? "cans"
          : result.label === "plastic_bag"
          ? "bags"
          : "pet";

      const newItem = {
        id: result.transaction.id,
        label: result.label,
        display_label: result.display_label,
        weight_g: result.transaction.weight_grams,
        payout_paise: result.transaction.payout_paise,
        bonus_paise: result.transaction.bonus_paise,
        status: "accepted" as DecisionType,
        timestamp: now,
      };

      return {
        ...state,
        state: "ACCEPTED",
        lastScanResult: result,
        errorMessage: null,
        sessionItems: [newItem, ...state.sessionItems],
        currentSessionTotalPaise: state.currentSessionTotalPaise + result.transaction.payout_paise,
        currentSessionWeightGrams: state.currentSessionWeightGrams + result.transaction.weight_grams,
        binFills: {
          ...state.binFills,
          [binType]: Math.min(state.binFills[binType] + 4, 100),
        },
        logEvents: addLog(
          `Deposit ACCEPTED: +₹${(result.transaction.payout_paise / 100).toFixed(2)} (${result.display_label}, ${result.transaction.weight_grams}g)`,
          "success"
        ),
      };
    }

    case "SCAN_REJECTED": {
      const result = action.result;
      const newItem = {
        id: result.transaction.id,
        label: result.label,
        display_label: result.display_label,
        weight_g: result.transaction.weight_grams,
        payout_paise: 0,
        bonus_paise: 0,
        status: "rejected" as DecisionType,
        reason: result.reason,
        timestamp: now,
      };

      return {
        ...state,
        state: "REJECTED",
        lastScanResult: result,
        errorMessage: result.reason,
        sessionItems: [newItem, ...state.sessionItems],
        logEvents: addLog(
          `Deposit REJECTED: ${result.reason}`,
          "warn"
        ),
      };
    }

    case "SCAN_ERROR":
      return {
        ...state,
        state: "ERROR",
        errorMessage: action.message,
        logEvents: addLog(`Error during scan: ${action.message}`, "error"),
      };

    case "RESUME_DETECTING":
      return {
        ...state,
        state: "DETECTING",
        errorMessage: null,
      };

    case "FINISH_SESSION":
      return {
        ...state,
        state: "RECEIPT",
        logEvents: addLog(
          `Session concluded. Total payout: ₹${(state.currentSessionTotalPaise / 100).toFixed(2)} for ${state.sessionItems.length} items.`,
          "success"
        ),
      };

    case "RESET_TO_IDLE":
      return {
        ...state,
        state: "IDLE",
        errorMessage: null,
        sessionItems: [],
        currentSessionTotalPaise: 0,
        currentSessionWeightGrams: 0,
        logEvents: addLog("Attract screen standby.", "info"),
      };

    default:
      return state;
  }
}
