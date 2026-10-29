import {
  HealthResponse,
  RatesResponse,
  ClassifyResponse,
  ScanResponse,
  Wallet,
  Transaction,
  Withdrawal,
  WithdrawalResponse,
  WithdrawalsListResponse,
  TransactionsListResponse,
  AuthUser,
  LoginResponse,
  RegisterPayload,
  AdminMachineItem,
  AdminUserItem,
  AdminStats,
  UserRole,
} from "../types";
import { calculatePayout } from "../utils/money";
import { ApiError } from "./errors";

const MOCK_STORAGE_PREFIX = "ecorewind_mock_";

function getStorage<T>(key: string, defaultVal: T): T {
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_PREFIX + key);
    if (!raw) return defaultVal;
    return JSON.parse(raw);
  } catch {
    return defaultVal;
  }
}

function setStorage<T>(key: string, val: T): void {
  try {
    localStorage.setItem(MOCK_STORAGE_PREFIX + key, JSON.stringify(val));
  } catch {
    // Ignore storage quota errors
  }
}

// In-memory / stored users
const DEFAULT_USERS: Record<string, AuthUser & { password_hash: string }> = {
  "admin@ecorewind.com": {
    id: "user-admin-01",
    name: "EcoRewind Administrator",
    email: "admin@ecorewind.com",
    phone: "9811122233",
    role: "admin",
    password_hash: "admin123",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString(),
  },
  "user@ecorewind.com": {
    id: "user-atharv-01",
    name: "Atharv Ubale",
    email: "user@ecorewind.com",
    phone: "9876543210",
    upi_id: "atharv@okhdfcbank",
    role: "user",
    password_hash: "user123",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
  },
};

function getUsers(): Record<string, AuthUser & { password_hash: string }> {
  const users = getStorage("auth_users", DEFAULT_USERS);
  return users;
}

function saveUsers(users: Record<string, AuthUser & { password_hash: string }>): void {
  setStorage("auth_users", users);
}

// In-memory / stored wallets
function getWallet(userId: string): Wallet {
  const wallets = getStorage<Record<string, Wallet>>("wallets", {});
  if (!wallets[userId]) {
    const now = new Date().toISOString();
    wallets[userId] = {
      user_id: userId,
      balance_paise: (userId === "demo-user" || userId === "user-atharv-01" || userId === "9876543210") ? 1880 : 0,
      total_paid_paise: (userId === "demo-user" || userId === "user-atharv-01" || userId === "9876543210") ? 3880 : 0,
      total_grams: (userId === "demo-user" || userId === "user-atharv-01" || userId === "9876543210") ? 950 : 0,
      accepted_count: (userId === "demo-user" || userId === "user-atharv-01" || userId === "9876543210") ? 3 : 0,
      rejected_count: (userId === "demo-user" || userId === "user-atharv-01" || userId === "9876543210") ? 1 : 0,
      created_at: now,
      updated_at: now,
    };
    setStorage("wallets", wallets);
  }
  return wallets[userId];
}

function saveWallet(wallet: Wallet): void {
  const wallets = getStorage<Record<string, Wallet>>("wallets", {});
  wallets[wallet.user_id] = {
    ...wallet,
    updated_at: new Date().toISOString(),
  };
  setStorage("wallets", wallets);
}

// In-memory / stored transactions
function getTransactions(userId?: string): Transaction[] {
  let all = getStorage<Transaction[]>("transactions", []);
  if (all.length === 0) {
    const now = Date.now();
    all = [
      {
        id: "tx-demo-01",
        kind: "deposit",
        status: "accepted",
        label: "plastic_bottle",
        display_label: "Plastic Bottle (PET)",
        confidence: 0.96,
        weight_grams: 250,
        rate_paise_per_gram: 2,
        payout_paise: 500,
        bonus_paise: 0,
        reason: "Item accepted",
        machine_id: "RVM-01",
        user_id: "demo-user",
        user_name: "Atharv Ubale",
        created_at: new Date(now - 1000 * 60 * 45).toISOString(),
      },
      {
        id: "tx-demo-02",
        kind: "deposit",
        status: "rejected",
        label: "other_invalid",
        display_label: "Stone / Debris",
        confidence: 0.42,
        weight_grams: 80,
        rate_paise_per_gram: 0,
        payout_paise: 0,
        bonus_paise: 0,
        reason: "80 g is under the 100 g minimum. Payout blocked.",
        machine_id: "RVM-01",
        user_id: "demo-user",
        user_name: "Atharv Ubale",
        created_at: new Date(now - 1000 * 60 * 30).toISOString(),
      },
      {
        id: "tx-demo-03",
        kind: "deposit",
        status: "accepted",
        label: "aluminium_can",
        display_label: "Aluminium Beverage Can",
        confidence: 0.98,
        weight_grams: 450,
        rate_paise_per_gram: 4,
        payout_paise: 1980,
        bonus_paise: 180,
        reason: "Item accepted (+10% bulk bonus applied)",
        machine_id: "RVM-02",
        user_id: "demo-user",
        user_name: "Atharv Ubale",
        created_at: new Date(now - 1000 * 60 * 15).toISOString(),
      },
      {
        id: "tx-demo-04",
        kind: "deposit",
        status: "accepted",
        label: "plastic_bottle",
        display_label: "Plastic Bottle (PET)",
        confidence: 0.94,
        weight_grams: 280,
        rate_paise_per_gram: 2,
        payout_paise: 560,
        bonus_paise: 0,
        reason: "Item accepted",
        machine_id: "RVM-01",
        user_id: "user-sneha-02",
        user_name: "Sneha Sharma",
        created_at: new Date(now - 1000 * 60 * 65).toISOString(),
      },
      {
        id: "tx-demo-05",
        kind: "deposit",
        status: "accepted",
        label: "plastic_bottle",
        display_label: "Plastic Bottle (PET)",
        confidence: 0.95,
        weight_grams: 240,
        rate_paise_per_gram: 2,
        payout_paise: 480,
        bonus_paise: 0,
        reason: "Item accepted",
        machine_id: "RVM-03",
        user_id: "user-rahul-03",
        user_name: "Rahul Verma",
        created_at: new Date(now - 1000 * 60 * 95).toISOString(),
      },
    ];
    setStorage("transactions", all);
  }

  if (userId && userId !== "all") {
    return all.filter((t) => t.user_id === userId || !t.user_id || t.user_id === "demo-user");
  }
  return all;
}

function saveTransaction(txn: Transaction): void {
  const all = getTransactions();
  all.unshift(txn);
  setStorage("transactions", all);
}

// In-memory / stored withdrawals
function getWithdrawals(userId?: string): Withdrawal[] {
  let all = getStorage<Withdrawal[]>("withdrawals", []);
  if (all.length === 0) {
    const now = Date.now();
    all = [
      {
        id: "wd-demo-01",
        user_id: "demo-user",
        amount_paise: 2000,
        destination: "user@okhdfcbank",
        status: "paid",
        created_at: new Date(now - 1000 * 60 * 120).toISOString(),
        updated_at: new Date(now - 1000 * 60 * 90).toISOString(),
      },
    ];
    setStorage("withdrawals", all);
  }
  if (userId) {
    return all.filter((w) => w.user_id === userId || w.user_id === "demo-user");
  }
  return all;
}

function saveWithdrawal(wd: Withdrawal): void {
  const all = getWithdrawals();
  const idx = all.findIndex((x) => x.id === wd.id);
  if (idx >= 0) {
    all[idx] = wd;
  } else {
    all.unshift(wd);
  }
  setStorage("withdrawals", all);
}

// Admin Machines
const DEFAULT_MACHINES: AdminMachineItem[] = [
  {
    id: "RVM-01",
    name: "Central Metro Station - Platform 1",
    location: "Connaught Place, New Delhi",
    status: "online",
    bin_pet_pct: 45,
    bin_cans_pct: 30,
    bin_bags_pct: 20,
    total_bottles_collected: 1840,
    last_maintenance: "2 days ago",
  },
  {
    id: "RVM-02",
    name: "Tech Hub Park - Tower B Entrance",
    location: "Whitefield, Bengaluru",
    status: "online",
    bin_pet_pct: 78,
    bin_cans_pct: 55,
    bin_bags_pct: 35,
    total_bottles_collected: 4120,
    last_maintenance: "5 days ago",
  },
  {
    id: "RVM-03",
    name: "City University Food Court",
    location: "Powai, Mumbai",
    status: "maintenance",
    bin_pet_pct: 94,
    bin_cans_pct: 85,
    bin_bags_pct: 50,
    total_bottles_collected: 2780,
    last_maintenance: "Today (in-progress)",
  },
  {
    id: "RVM-04",
    name: "Grand Mall Atrium",
    location: "Banjara Hills, Hyderabad",
    status: "online",
    bin_pet_pct: 22,
    bin_cans_pct: 18,
    bin_bags_pct: 12,
    total_bottles_collected: 980,
    last_maintenance: "1 week ago",
  },
];

function getMachines(): AdminMachineItem[] {
  return getStorage<AdminMachineItem[]>("admin_machines", DEFAULT_MACHINES);
}

function saveMachines(machines: AdminMachineItem[]): void {
  setStorage("admin_machines", machines);
}

// Stored Idempotency keys mapping key -> response payload
const idempotencyStore = new Map<string, unknown>();

export const mockClient = {
  // --- AUTH ENDPOINTS ---
  async login(email: string, pass: string, expectedRole?: UserRole): Promise<LoginResponse> {
    await new Promise((r) => setTimeout(r, 200));
    const users = getUsers();
    const user = users[email.trim().toLowerCase()];

    if (!user || user.password_hash !== pass) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email address or password.");
    }

    if (expectedRole && user.role !== expectedRole) {
      throw new ApiError(
        403,
        "UNAUTHORIZED_ROLE",
        `Access denied. You do not have permissions for the ${expectedRole} portal.`
      );
    }

    const token = "mock-jwt-token-" + Math.random().toString(36).substring(2, 10);
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        upi_id: user.upi_id,
        role: user.role,
        created_at: user.created_at,
      },
      role: user.role,
    };
  },

  async register(payload: RegisterPayload): Promise<LoginResponse> {
    await new Promise((r) => setTimeout(r, 250));
    const users = getUsers();
    const emailKey = payload.email.trim().toLowerCase();

    if (users[emailKey]) {
      throw new ApiError(409, "USER_EXISTS", "An account with this email address already exists.");
    }

    const newUser: AuthUser & { password_hash: string } = {
      id: "user-" + Math.random().toString(36).substring(2, 9),
      name: payload.name.trim(),
      email: emailKey,
      phone: payload.phone.trim(),
      upi_id: payload.upi_id?.trim(),
      role: "user",
      password_hash: payload.password,
      created_at: new Date().toISOString(),
    };

    users[emailKey] = newUser;
    saveUsers(users);

    const token = "mock-jwt-token-" + Math.random().toString(36).substring(2, 10);
    return {
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        upi_id: newUser.upi_id,
        role: newUser.role,
        created_at: newUser.created_at,
      },
      role: "user",
    };
  },

  async getMe(userId: string): Promise<{ user: AuthUser; wallet: Wallet }> {
    await new Promise((r) => setTimeout(r, 100));
    const users = getUsers();
    const userFound = Object.values(users).find((u) => u.id === userId || u.phone === userId);
    const user: AuthUser = userFound
      ? {
          id: userFound.id,
          name: userFound.name,
          email: userFound.email,
          phone: userFound.phone,
          upi_id: userFound.upi_id,
          role: userFound.role,
          created_at: userFound.created_at,
        }
      : {
          id: userId,
          name: "Atharv Ubale",
          email: "user@ecorewind.com",
          phone: "9876543210",
          upi_id: "atharv@okhdfcbank",
          role: "user",
        };

    const wallet = getWallet(user.id);
    return { user, wallet };
  },

  // --- KIOSK / PUBLIC ---
  async getHealth(): Promise<HealthResponse> {
    await new Promise((r) => setTimeout(r, 80));
    return {
      status: "ok",
      model_ready: true,
      model_detail: "MobileNetV2-Quantized (224x224)",
      threshold: 0.75,
      accepted_classes: ["aluminium_can", "plastic_bag", "plastic_bottle"],
      version: "2.4.0",
    };
  },

  async getRates(): Promise<RatesResponse> {
    await new Promise((r) => setTimeout(r, 60));
    const customRates = getStorage<RatesResponse | null>("custom_rates", null);
    if (customRates) return customRates;
    return {
      rates_paise_per_gram: {
        plastic_bottle: 2,
        aluminium_can: 4,
        plastic_bag: 1,
      },
      accepted_classes: ["aluminium_can", "plastic_bag", "plastic_bottle"],
      min_weight_g: 100,
      max_weight_g: 500,
      bonus_threshold_g: 400,
      bonus_pct: 10,
    };
  },

  async classify(itemType: string = "plastic_bottle"): Promise<ClassifyResponse> {
    await new Promise((r) => setTimeout(r, 120));

    if (itemType === "plastic_bottle") {
      return {
        decision: "accepted",
        reason: "Valid recyclable PET bottle detected.",
        label: "plastic_bottle",
        display_label: "Plastic Bottle (PET)",
        confidence: 0.94,
        scores: { plastic_bottle: 0.94, aluminium_can: 0.03, plastic_bag: 0.02, other_invalid: 0.01 },
        rate_paise_per_gram: 2,
        model: "MobileNetV2-Quantized",
      };
    } else if (itemType === "aluminium_can") {
      return {
        decision: "accepted",
        reason: "Valid beverage aluminium can detected.",
        label: "aluminium_can",
        display_label: "Aluminium Can",
        confidence: 0.97,
        scores: { aluminium_can: 0.97, plastic_bottle: 0.02, plastic_bag: 0.01, other_invalid: 0.0 },
        rate_paise_per_gram: 4,
        model: "MobileNetV2-Quantized",
      };
    } else if (itemType === "plastic_bag") {
      return {
        decision: "accepted",
        reason: "Clean plastic bag / film detected.",
        label: "plastic_bag",
        display_label: "Plastic Bag (Film)",
        confidence: 0.88,
        scores: { plastic_bag: 0.88, plastic_bottle: 0.06, aluminium_can: 0.03, other_invalid: 0.03 },
        rate_paise_per_gram: 1,
        model: "MobileNetV2-Quantized",
      };
    } else if (itemType === "aerosol_can") {
      return {
        decision: "rejected",
        reason: "Pressurized aerosol can is hazardous and not accepted by this machine.",
        label: "other_invalid",
        display_label: "Aerosol Can (Hazardous)",
        confidence: 0.91,
        scores: { other_invalid: 0.91, aluminium_can: 0.08, plastic_bottle: 0.01 },
        rate_paise_per_gram: 0,
        model: "MobileNetV2-Quantized",
      };
    } else {
      return {
        decision: "rejected",
        reason: "Item is not recognized as an accepted recyclable container.",
        label: "other_invalid",
        display_label: "Non-Recyclable Item",
        confidence: 0.38,
        scores: { other_invalid: 0.85, plastic_bottle: 0.1, aluminium_can: 0.05 },
        rate_paise_per_gram: 0,
        model: "MobileNetV2-Quantized",
      };
    }
  },

  async scan(
    idempotencyKey: string,
    userId: string,
    weightGrams: number,
    classification: ClassifyResponse,
    machineId: string = "RVM-01"
  ): Promise<ScanResponse> {
    await new Promise((r) => setTimeout(r, 250));

    if (!idempotencyKey) {
      throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required.");
    }

    if (idempotencyStore.has(idempotencyKey)) {
      const cached = idempotencyStore.get(idempotencyKey) as ScanResponse;
      return { ...cached, duplicate: true };
    }

    const rates = await this.getRates();
    const wallet = getWallet(userId);

    let decision: "accepted" | "rejected" = "accepted";
    let reason = "Item accepted successfully.";
    let rate = rates.rates_paise_per_gram[classification.label] || 0;
    let basePaise = 0;
    let bonusPaise = 0;
    let totalPayoutPaise = 0;

    if (
      !rates.accepted_classes.includes(classification.label) ||
      rate <= 0 ||
      classification.confidence < 0.75
    ) {
      decision = "rejected";
      reason =
        classification.confidence < 0.75
          ? `Low confidence (${Math.round(classification.confidence * 100)}%). Rescan the item.`
          : `${classification.display_label || "Item"} is not accepted by this machine.`;
    } else if (!isFinite(weightGrams) || weightGrams < 0 || weightGrams > rates.max_weight_g) {
      decision = "rejected";
      reason = "Invalid weight reading. The load cell must be between 0 and 500 g.";
    } else if (weightGrams < rates.min_weight_g) {
      decision = "rejected";
      reason = `${weightGrams} g is under the ${rates.min_weight_g} g minimum. Payout blocked.`;
    }

    if (decision === "accepted") {
      const calc = calculatePayout(
        weightGrams,
        rate,
        rates.bonus_threshold_g,
        rates.bonus_pct
      );
      basePaise = calc.basePaise;
      bonusPaise = calc.bonusPaise;
      totalPayoutPaise = calc.totalPaise;
      if (bonusPaise > 0) {
        reason = `Item accepted (+${rates.bonus_pct}% bulk bonus applied)`;
      }
    }

    const scanId = "scan-" + Math.random().toString(36).substring(2, 9);
    const txnId = "tx-" + Math.random().toString(36).substring(2, 9);
    const now = new Date().toISOString();

    const transaction: Transaction = {
      id: txnId,
      kind: "deposit",
      status: decision,
      label: classification.label,
      display_label: classification.display_label,
      confidence: classification.confidence,
      weight_grams: weightGrams,
      rate_paise_per_gram: decision === "accepted" ? rate : 0,
      payout_paise: totalPayoutPaise,
      bonus_paise: bonusPaise,
      reason,
      machine_id: machineId,
      user_id: userId,
      scores: classification.scores,
      created_at: now,
    };

    if (decision === "accepted") {
      wallet.balance_paise += totalPayoutPaise;
      wallet.total_paid_paise += totalPayoutPaise;
      wallet.total_grams += weightGrams;
      wallet.accepted_count += 1;
    } else {
      wallet.rejected_count += 1;
    }
    saveWallet(wallet);
    saveTransaction(transaction);

    const response: ScanResponse = {
      scan_id: scanId,
      duplicate: false,
      decision,
      reason,
      label: classification.label,
      display_label: classification.display_label,
      confidence: classification.confidence,
      scores: classification.scores,
      transaction,
      wallet,
      model: classification.model || "MobileNetV2-Quantized",
    };

    idempotencyStore.set(idempotencyKey, response);

    try {
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("ecorewind");
        bc.postMessage({ type: "wallet", userId });
        bc.close();
      }
    } catch {
      // Ignore
    }

    return response;
  },

  async getWallet(userId: string): Promise<Wallet> {
    await new Promise((r) => setTimeout(r, 60));
    return getWallet(userId);
  },

  async getTransactions(
    userId?: string,
    limit: number = 25,
    offset: number = 0,
    filter: "all" | "accepted" | "rejected" = "all"
  ): Promise<TransactionsListResponse> {
    await new Promise((r) => setTimeout(r, 80));
    let txns = getTransactions(userId);
    if (filter === "accepted") {
      txns = txns.filter((t) => t.status === "accepted");
    } else if (filter === "rejected") {
      txns = txns.filter((t) => t.status === "rejected");
    }
    const total = txns.length;
    const items = txns.slice(offset, offset + limit);
    return { items, total, limit, offset };
  },

  async createWithdrawal(
    idempotencyKey: string,
    userId: string,
    amountPaise: number,
    destination: string
  ): Promise<WithdrawalResponse> {
    await new Promise((r) => setTimeout(r, 200));

    if (!idempotencyKey) {
      throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required.");
    }

    if (idempotencyStore.has(idempotencyKey)) {
      return idempotencyStore.get(idempotencyKey) as WithdrawalResponse;
    }

    const wallet = getWallet(userId);
    if (wallet.balance_paise < amountPaise) {
      throw new ApiError(409, "INSUFFICIENT_FUNDS", "Requested withdrawal exceeds available wallet balance.");
    }

    wallet.balance_paise -= amountPaise;
    saveWallet(wallet);

    const withdrawalId = "wd-" + Math.random().toString(36).substring(2, 9);
    const now = new Date().toISOString();
    const withdrawal: Withdrawal = {
      id: withdrawalId,
      user_id: userId,
      amount_paise: amountPaise,
      destination,
      status: "pending",
      created_at: now,
      updated_at: now,
    };

    saveWithdrawal(withdrawal);

    const res: WithdrawalResponse = {
      duplicate: false,
      withdrawal,
      wallet,
    };

    idempotencyStore.set(idempotencyKey, res);

    try {
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("ecorewind");
        bc.postMessage({ type: "wallet", userId });
        bc.close();
      }
    } catch {
      // Ignore
    }

    return res;
  },

  async getWithdrawals(
    userId?: string,
    limit: number = 25,
    offset: number = 0
  ): Promise<WithdrawalsListResponse> {
    await new Promise((r) => setTimeout(r, 60));
    const all = getWithdrawals(userId);
    const items = all.slice(offset, offset + limit);
    return { items, total: all.length, limit, offset };
  },

  async adminUpdateWithdrawal(
    withdrawalId: string,
    newStatus: "paid" | "cancelled"
  ): Promise<void> {
    const all = getWithdrawals();
    const item = all.find((w) => w.id === withdrawalId);
    if (!item) return;

    if (item.status === "pending" && newStatus === "cancelled") {
      const wallet = getWallet(item.user_id);
      wallet.balance_paise += item.amount_paise;
      saveWallet(wallet);
    }
    item.status = newStatus;
    item.updated_at = new Date().toISOString();
    saveWithdrawal(item);

    try {
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("ecorewind");
        bc.postMessage({ type: "wallet", userId: item.user_id });
        bc.close();
      }
    } catch {
      // Ignore
    }
  },

  // --- ADMIN ENDPOINTS ---
  async getAdminStats(): Promise<AdminStats> {
    await new Promise((r) => setTimeout(r, 100));
    const txns = getTransactions();
    const machines = getMachines();
    const users = getUsers();

    const acceptedTxns = txns.filter((t) => t.status === "accepted");
    const totalBottles = acceptedTxns.length;
    const totalMoneyPaid = acceptedTxns.reduce((sum, t) => sum + t.payout_paise, 0);
    const totalWeightKg = acceptedTxns.reduce((sum, t) => sum + t.weight_grams, 0) / 1000;

    return {
      total_users: Object.keys(users).length,
      total_bottles_collected: totalBottles + 9720, // baseline + current
      total_money_paid_paise: totalMoneyPaid + 245000,
      active_machines: machines.filter((m) => m.status === "online").length,
      total_weight_kg: parseFloat((totalWeightKg + 243.5).toFixed(1)),
    };
  },

  async getAdminUsers(): Promise<AdminUserItem[]> {
    await new Promise((r) => setTimeout(r, 120));
    const users = getUsers();
    return Object.values(users).map((u) => {
      const w = getWallet(u.id);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        balance_paise: w.balance_paise,
        bottles_recycled: w.accepted_count,
        upi_id: u.upi_id,
        joined_date: u.created_at || "2026-08-15",
      };
    });
  },

  async getAdminMachines(): Promise<AdminMachineItem[]> {
    await new Promise((r) => setTimeout(r, 100));
    return getMachines();
  },

  async updateAdminRates(newRates: RatesResponse): Promise<RatesResponse> {
    await new Promise((r) => setTimeout(r, 150));
    setStorage("custom_rates", newRates);
    return newRates;
  },
};
