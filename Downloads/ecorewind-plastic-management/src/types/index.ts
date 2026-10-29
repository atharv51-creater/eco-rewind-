export type UserRole = "admin" | "user";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  upi_id?: string;
  role: UserRole;
  created_at?: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
  role: UserRole;
}

export interface RegisterPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
  upi_id?: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  model_ready: boolean;
  model_detail: string;
  threshold: number;
  accepted_classes: string[];
  version: string;
}

export interface RatesResponse {
  rates_paise_per_gram: Record<string, number>;
  accepted_classes: string[];
  min_weight_g: number;
  min_weight_by_item?: Record<string, number>;
  max_weight_g: number;
  bonus_threshold_g: number;
  bonus_pct: number;
}

export type DecisionType = "accepted" | "rejected";

export interface ClassifyResponse {
  decision: DecisionType;
  reason: string;
  label: string;
  display_label: string;
  confidence: number;
  scores: Record<string, number>;
  rate_paise_per_gram: number;
  model: string;
}

export interface Transaction {
  id: string;
  kind: "deposit";
  status: DecisionType;
  label: string;
  display_label: string;
  confidence: number;
  weight_grams: number;
  rate_paise_per_gram: number;
  payout_paise: number;
  bonus_paise: number;
  reason: string;
  machine_id: string;
  scores?: Record<string, number>;
  user_id?: string;
  user_name?: string;
  created_at: string;
}

export interface Wallet {
  user_id: string;
  balance_paise: number;
  total_paid_paise: number;
  total_grams: number;
  accepted_count: number;
  rejected_count: number;
  created_at: string;
  updated_at: string;
}

export interface ScanResponse {
  scan_id: string;
  duplicate: boolean;
  decision: DecisionType;
  status?: DecisionType;
  reason: string;
  label: string;
  display_label: string;
  confidence: number;
  scores: Record<string, number>;
  transaction: Transaction;
  wallet: Wallet;
  model: string;
  itemType?: string;
  weightGrams?: number;
  amountPaise?: number;
  basePaise?: number;
  bonusPaise?: number;
  ratePaisePerGram?: number;
  token?: string | null;
  claimUrl?: string | null;
  expiresAt?: string | null;
  sessionId?: string;
  credited?: boolean;
  userId?: string | null;
}

export type WithdrawalStatus = "pending" | "paid" | "cancelled";

export interface Withdrawal {
  id: string;
  user_id: string;
  amount_paise: number;
  destination: string;
  status: WithdrawalStatus;
  created_at: string;
  updated_at: string;
}

export interface WithdrawalResponse {
  duplicate: boolean;
  withdrawal: Withdrawal;
  wallet: Wallet;
}

export interface WithdrawalsListResponse {
  items: Withdrawal[];
  total: number;
  limit: number;
  offset: number;
}

export interface TransactionsListResponse {
  items: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiErrorPayload {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export type MachineState =
  | "OFFLINE"
  | "IDLE"
  | "SESSION_START"
  | "DETECTING"
  | "INSERTING"
  | "PROCESSING"
  | "ACCEPTED"
  | "REJECTED"
  | "ERROR"
  | "RECEIPT";

export interface MachineSessionItem {
  id: string;
  label: string;
  display_label: string;
  weight_g: number;
  payout_paise: number;
  bonus_paise: number;
  status: DecisionType;
  reason?: string;
  timestamp: string;
}

export interface MachineContext {
  state: MachineState;
  userId: string | null;
  currentWeightGrams: number;
  detectedItem: ClassifyResponse | null;
  lastScanResult: ScanResponse | null;
  errorMessage: string | null;
  sessionItems: MachineSessionItem[];
  currentSessionTotalPaise: number;
  currentSessionWeightGrams: number;
  machineId: string;
  logEvents: Array<{ id: string; time: string; message: string; type: "info" | "warn" | "error" | "success" }>;
  binFills: {
    pet: number;
    cans: number;
    bags: number;
  };
}

// Admin Specific Types
export interface AdminMachineItem {
  id: string;
  name: string;
  location: string;
  status: "online" | "maintenance" | "offline";
  bin_pet_pct: number;
  bin_cans_pct: number;
  bin_bags_pct: number;
  total_bottles_collected: number;
  last_maintenance: string;
}

export interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  balance_paise: number;
  bottles_recycled: number;
  upi_id?: string;
  joined_date: string;
}

export interface AdminStats {
  total_users: number;
  total_bottles_collected: number;
  total_money_paid_paise: number;
  active_machines: number;
  total_weight_kg: number;
}
