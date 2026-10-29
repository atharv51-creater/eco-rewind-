import {
  HealthResponse,
  RatesResponse,
  ClassifyResponse,
  ScanResponse,
  Wallet,
  TransactionsListResponse,
  WithdrawalResponse,
  WithdrawalsListResponse,
  LoginResponse,
  RegisterPayload,
  AdminStats,
  AdminUserItem,
  AdminMachineItem,
  UserRole,
  AuthUser,
} from "../types";
import { ENDPOINTS } from "./endpoints";
import { ApiError, parseErrorResponse } from "./errors";
import { mockClient } from "./mockClient";

export const isLiveMode = import.meta.env.VITE_API_MODE === "live";

/** In live mode, never mask backend failures with mock data. */
function rethrowLive(err: unknown, code: string, message: string): never {
  if (err instanceof ApiError) throw err;
  throw new ApiError(503, code, message);
}

let currentAuthToken: string | null = null;

/**
 * Custom fetch wrapper with timeout and Bearer auth injection
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 15000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (currentAuthToken && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${currentAuthToken}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      credentials: options.credentials || "include",
      headers,
      signal: controller.signal,
    });
    clearTimeout(id);

    // Global 401 handler
    if (response.status === 401) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      }
    }

    return response;
  } catch (err: unknown) {
    clearTimeout(id);
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(504, "NETWORK", `Request timed out after ${timeoutMs}ms.`);
    }
    throw new ApiError(503, "NETWORK", "Network error or scanner service unreachable.");
  }
}

export const api = {
  isLive: isLiveMode,

  setAuthToken(token: string | null) {
    currentAuthToken = token;
  },

  // --- AUTH ---
  async login(email: string, pass: string, expectedRole?: UserRole): Promise<LoginResponse> {
    if (!isLiveMode) {
      return mockClient.login(email, pass, expectedRole);
    }
    try {
      const res = await fetchWithTimeout(ENDPOINTS.AUTH_LOGIN, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: email, email, password: pass }),
      });
      if (!res.ok) throw await parseErrorResponse(res);
      const data = await res.json();
      const role: UserRole = data.role ?? data.user?.role ?? "user";
      if (expectedRole && role !== expectedRole) {
        throw new ApiError(403, "UNAUTHORIZED_ROLE", `Access restricted to ${expectedRole}s.`);
      }
      return {
        ...data,
        role,
        user: { ...data.user, email: data.user?.email ?? "" },
      };
    } catch (err) {
      rethrowLive(err, "AUTH_UNAVAILABLE", "Login service unavailable");
    }
  },

  async register(payload: RegisterPayload): Promise<LoginResponse> {
    if (!isLiveMode) {
      return mockClient.register(payload);
    }
    try {
      const res = await fetchWithTimeout(ENDPOINTS.AUTH_REGISTER, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw await parseErrorResponse(res);
      const data = await res.json();
      const role: UserRole = data.role ?? data.user?.role ?? "user";
      return {
        ...data,
        role,
        user: { ...data.user, email: data.user?.email ?? "" },
      };
    } catch (err) {
      rethrowLive(err, "AUTH_UNAVAILABLE", "Registration service unavailable");
    }
  },

  async logout(): Promise<void> {
    try {
      await fetchWithTimeout(ENDPOINTS.AUTH_LOGOUT, { method: "POST" }, 5000);
    } catch {
      // Ignore
    }
  },

  async getMe(userId?: string): Promise<{ user: AuthUser; wallet: Wallet; [key: string]: any }> {
    if (!isLiveMode) {
      return mockClient.getMe(userId || "");
    }
    try {
      const res = await fetchWithTimeout(ENDPOINTS.USERS_ME, {}, 8000);
      if (!res.ok) throw await parseErrorResponse(res);
      const data = await res.json();
      return {
        ...data,
        user: data.user || {
          id: data.userId,
          name: data.name || "Recycler",
          phone: data.phone || data.userId,
          email: data.email || "",
          role: data.role || "user",
        },
        wallet: data.wallet || {
          user_id: data.userId,
          balance_paise: data.balancePaise ?? 0,
          total_paid_paise: data.lifetimeEarnedPaise ?? 0,
          total_grams: Math.round((data.kgRecycled ?? 0) * 1000),
          accepted_count: (data.bottleCount ?? 0) + (data.canCount ?? 0) + (data.bagCount ?? 0),
          rejected_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      };
    } catch (err) {
      rethrowLive(err, "PROFILE_UNAVAILABLE", "Profile service unavailable");
    }
  },

  // --- CLAIM & DEPOSIT STATUS ---
  async getClaimDetails(token: string) {
    const res = await fetchWithTimeout(ENDPOINTS.CLAIM(token), {}, 8000);
    if (!res.ok) throw await parseErrorResponse(res);
    return await res.json();
  },

  async claimDeposit(token: string) {
    const res = await fetchWithTimeout(
      ENDPOINTS.CLAIM(token),
      {
        method: "POST",
      },
      12000
    );
    if (!res.ok) throw await parseErrorResponse(res);
    return await res.json();
  },

  async getDepositStatus(sessionId: string) {
    const res = await fetchWithTimeout(ENDPOINTS.DEPOSIT_STATUS(sessionId), {}, 8000);
    if (!res.ok) throw await parseErrorResponse(res);
    return await res.json();
  },

  async createKioskDeposit(params: {
    itemType: string;
    weightGrams: number;
    confidence?: number;
    idempotencyKey?: string;
  }): Promise<{
    sessionId: string;
    token: string;
    claimUrl: string;
    claimPath: string;
    amountPaise: number;
    amountInr: string;
    itemType: string;
    weightGrams: number;
    expiresAt: string;
    status: string;
    duplicate?: boolean;
  }> {
    const res = await fetchWithTimeout(
      ENDPOINTS.KIOSK_DEPOSIT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Kiosk-Key": "rvm-key-2024",
          ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
        },
        body: JSON.stringify(params),
      },
      10000
    );
    if (!res.ok) throw await parseErrorResponse(res);
    return await res.json();
  },

  // --- HEALTH & RATES ---
  async getHealth(): Promise<HealthResponse> {
    if (!isLiveMode) {
      return mockClient.getHealth();
    }
    try {
      const res = await fetchWithTimeout(ENDPOINTS.HEALTH, {}, 8000);
      if (!res.ok) {
        throw await parseErrorResponse(res);
      }
      return await res.json();
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(503, "SERVICE_OFFLINE", "EcoRewind server offline");
    }
  },

  async getRates(): Promise<RatesResponse> {
    if (!isLiveMode) {
      return mockClient.getRates();
    }
    try {
      const res = await fetchWithTimeout(ENDPOINTS.RATES, {}, 8000);
      if (!res.ok) {
        throw await parseErrorResponse(res);
      }
      return await res.json();
    } catch (err) {
      rethrowLive(err, "RATES_UNAVAILABLE", "Tariff service unavailable");
    }
  },

  // --- SCAN & CLASSIFY ---
  async classify(imageBlobOrLabel: Blob | string): Promise<ClassifyResponse> {
    if (!isLiveMode) {
      const label = typeof imageBlobOrLabel === "string" ? imageBlobOrLabel : "plastic_bottle";
      return mockClient.classify(label);
    }

    try {
      if (typeof imageBlobOrLabel === "string") {
        const res = await fetchWithTimeout(
          ENDPOINTS.CLASSIFY,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category: imageBlobOrLabel }),
          },
          8000
        );
        if (!res.ok) throw await parseErrorResponse(res);
        return await res.json();
      }

      const formData = new FormData();
      formData.append("image", imageBlobOrLabel, "frame.jpg");

      const res = await fetchWithTimeout(
        ENDPOINTS.CLASSIFY,
        {
          method: "POST",
          body: formData,
        },
        8000
      );

      if (!res.ok) {
        throw await parseErrorResponse(res);
      }
      return await res.json();
    } catch (err) {
      rethrowLive(err, "CLASSIFIER_UNAVAILABLE", "Classifier service unavailable");
    }
  },

  async scan(
    idempotencyKey: string,
    userId: string,
    weightGrams: number,
    imageBlobOrClassification: Blob | ClassifyResponse,
    machineId: string = "RVM-01"
  ): Promise<ScanResponse> {
    if (!isLiveMode) {
      const classification =
        imageBlobOrClassification instanceof Blob
          ? await mockClient.classify("plastic_bottle")
          : imageBlobOrClassification;
      return mockClient.scan(idempotencyKey, userId, weightGrams, classification, machineId);
    }

    const makeScanRequest = async () => {
      let imageBlob: Blob;
      if (imageBlobOrClassification instanceof Blob) {
        imageBlob = imageBlobOrClassification;
      } else {
        try {
          const sampleRes = await fetch(`/api/sample?class=${imageBlobOrClassification.label || "plastic_bottle"}`);
          const sampleData = await sampleRes.json();
          if (sampleData.ok && sampleData.dataUrl) {
            const bRes = await fetch(sampleData.dataUrl);
            imageBlob = await bRes.blob();
          } else {
            imageBlob = new Blob([new Uint8Array(100)], { type: "image/jpeg" });
          }
        } catch {
          imageBlob = new Blob([new Uint8Array(100)], { type: "image/jpeg" });
        }
      }

      const formData = new FormData();
      formData.append("image", imageBlob, "deposit.jpg");
      formData.append("user_id", userId);
      formData.append("weight_grams", weightGrams.toString());
      formData.append("machine_id", machineId);
      if (userId === "anonymous") {
        formData.append("anonymous", "true");
        formData.append("mode", "qr");
      }

      const headers: Record<string, string> = {
        "Idempotency-Key": idempotencyKey,
      };
      if (userId === "anonymous") {
        headers["X-Kiosk-Anonymous"] = "true";
      }

      const res = await fetchWithTimeout(
        ENDPOINTS.SCAN,
        {
          method: "POST",
          headers,
          body: formData,
        },
        20000
      );

      if (!res.ok) {
        throw await parseErrorResponse(res);
      }
      return await res.json();
    };

    try {
      return await makeScanRequest();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === "NETWORK") {
        return await makeScanRequest();
      }
      throw err;
    }
  },

  // --- WALLET & TRANSACTIONS ---
  async getWallet(userId: string): Promise<Wallet> {
    if (!isLiveMode) {
      return mockClient.getWallet(userId);
    }
    try {
      const res = await fetchWithTimeout(ENDPOINTS.WALLET(userId), {}, 10000);
      if (!res.ok) {
        throw await parseErrorResponse(res);
      }
      return await res.json();
    } catch (err) {
      rethrowLive(err, "WALLET_UNAVAILABLE", "Wallet service unavailable");
    }
  },

  async getTransactions(
    userId?: string,
    limit: number = 25,
    offset: number = 0,
    filter: "all" | "accepted" | "rejected" = "all"
  ): Promise<TransactionsListResponse> {
    if (!isLiveMode) {
      return mockClient.getTransactions(userId, limit, offset, filter);
    }
    try {
      const url = `${ENDPOINTS.TRANSACTIONS(userId)}?limit=${limit}&offset=${offset}&filter=${filter}`;
      const res = await fetchWithTimeout(url, {}, 10000);
      if (!res.ok) {
        throw await parseErrorResponse(res);
      }
      return await res.json();
    } catch (err) {
      rethrowLive(err, "TRANSACTIONS_UNAVAILABLE", "Transaction service unavailable");
    }
  },

  async createWithdrawal(
    idempotencyKey: string,
    userId: string,
    amountPaise: number,
    destination: string
  ): Promise<WithdrawalResponse> {
    if (!isLiveMode) {
      return mockClient.createWithdrawal(idempotencyKey, userId, amountPaise, destination);
    }

    const makeWithdrawalRequest = async () => {
      const res = await fetchWithTimeout(
        ENDPOINTS.WITHDRAWALS(userId),
        {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotencyKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount_paise: amountPaise,
            destination,
          }),
        },
        15000
      );

      if (!res.ok) {
        throw await parseErrorResponse(res);
      }
      return await res.json();
    };

    try {
      return await makeWithdrawalRequest();
    } catch (err) {
      if (err instanceof ApiError && err.code === "NETWORK") {
        return await makeWithdrawalRequest();
      }
      throw err;
    }
  },

  async getWithdrawals(
    userId?: string,
    limit: number = 25,
    offset: number = 0
  ): Promise<WithdrawalsListResponse> {
    if (!isLiveMode) {
      return mockClient.getWithdrawals(userId, limit, offset);
    }
    try {
      const url = `${ENDPOINTS.WITHDRAWALS(userId || "all")}?limit=${limit}&offset=${offset}`;
      const res = await fetchWithTimeout(url, {}, 10000);
      if (!res.ok) {
        throw await parseErrorResponse(res);
      }
      return await res.json();
    } catch (err) {
      rethrowLive(err, "WITHDRAWALS_UNAVAILABLE", "Withdrawal service unavailable");
    }
  },

  // --- ADMIN ---
  async getAdminStats(): Promise<AdminStats> {
    if (!isLiveMode) {
      return mockClient.getAdminStats();
    }
    try {
      const res = await fetchWithTimeout(ENDPOINTS.ADMIN_STATS, {}, 10000);
      if (!res.ok) throw await parseErrorResponse(res);
      return await res.json();
    } catch (err) {
      rethrowLive(err, "ADMIN_UNAVAILABLE", "Admin stats unavailable");
    }
  },

  async getAdminUsers(): Promise<AdminUserItem[]> {
    if (!isLiveMode) {
      return mockClient.getAdminUsers();
    }
    try {
      const res = await fetchWithTimeout(ENDPOINTS.ADMIN_USERS, {}, 10000);
      if (!res.ok) throw await parseErrorResponse(res);
      return await res.json();
    } catch (err) {
      rethrowLive(err, "ADMIN_UNAVAILABLE", "Admin users unavailable");
    }
  },

  async getAdminMachines(): Promise<AdminMachineItem[]> {
    if (!isLiveMode) {
      return mockClient.getAdminMachines();
    }
    try {
      const res = await fetchWithTimeout(ENDPOINTS.ADMIN_MACHINES, {}, 10000);
      if (!res.ok) throw await parseErrorResponse(res);
      return await res.json();
    } catch (err) {
      rethrowLive(err, "ADMIN_UNAVAILABLE", "Admin machines unavailable");
    }
  },

  async updateAdminRates(newRates: RatesResponse): Promise<RatesResponse> {
    if (!isLiveMode) {
      return mockClient.updateAdminRates(newRates);
    }
    try {
      const res = await fetchWithTimeout(ENDPOINTS.ADMIN_RATES, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRates),
      });
      if (!res.ok) throw await parseErrorResponse(res);
      return await res.json();
    } catch (err) {
      rethrowLive(err, "ADMIN_UNAVAILABLE", "Unable to update tariff");
    }
  },

  async adminUpdateWithdrawal(id: string, status: "paid" | "cancelled") {
    if (!isLiveMode) {
      return mockClient.adminUpdateWithdrawal(id, status);
    }
    try {
      const endpoint = status === "paid" 
        ? ENDPOINTS.ADMIN_WITHDRAWALS_COMPLETE(id) 
        : ENDPOINTS.ADMIN_WITHDRAWALS_CANCEL(id);
      const res = await fetchWithTimeout(endpoint, { method: "POST" });
      if (!res.ok) throw await parseErrorResponse(res);
      return await res.json();
    } catch (err) {
      rethrowLive(err, "ADMIN_UNAVAILABLE", "Unable to update withdrawal");
    }
  },
};
