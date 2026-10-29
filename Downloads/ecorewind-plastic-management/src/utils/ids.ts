/**
 * Generate a UUID v4 string for Idempotency-Key
 */
export function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Validates a wallet ID:
 * Any string matching ^[A-Za-z0-9_.@-]{1,64}$ is valid.
 */
export function isValidWalletId(id: string): boolean {
  if (!id) return false;
  return /^[A-Za-z0-9_.@-]{1,64}$/.test(id.trim());
}

/**
 * Validates an Indian 10-digit mobile number
 */
export function isValidIndianMobile(mobile: string): boolean {
  if (!mobile) return false;
  return /^[6-9]\d{9}$/.test(mobile.trim());
}

/**
 * Masks a wallet ID or 10-digit mobile for privacy
 * e.g. "9876543210" -> "98•••••210"
 * e.g. "demo-user" -> "de••••er"
 */
export function maskWalletId(id: string): string {
  const trimmed = (id || "").trim();
  if (trimmed.length <= 4) return trimmed;
  if (/^\d{10}$/.test(trimmed)) {
    return `${trimmed.slice(0, 2)}•••••${trimmed.slice(7)}`;
  }
  const prefix = trimmed.slice(0, 2);
  const suffix = trimmed.slice(-2);
  return `${prefix}••••${suffix}`;
}

/**
 * Validates UPI ID string
 * e.g. user@okhdfcbank
 * Regex from prompt: ^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9.-]{1,}$
 */
export function isValidUpiId(upi: string): boolean {
  if (!upi) return false;
  return /^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9.-]{1,}$/.test(upi.trim());
}
