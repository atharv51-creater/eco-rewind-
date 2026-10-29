/**
 * Round half up mathematical helper (e.g. 0.5 -> 1)
 */
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/**
 * Format integer paise into Indian Rupee currency display.
 * e.g. 500 paise -> "₹5.00"
 * 123450 paise -> "₹1,234.50"
 */
export function formatPaise(paise: number, showSymbol: boolean = true): string {
  if (isNaN(paise) || !isFinite(paise)) return showSymbol ? "₹0.00" : "0.00";
  
  const isNegative = paise < 0;
  const absPaise = Math.abs(Math.round(paise));
  const rupees = Math.floor(absPaise / 100);
  const remainingPaise = absPaise % 100;
  
  // Format rupees part with Indian numbering system (en-IN)
  const formattedRupees = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(rupees);
  
  const paddedPaise = remainingPaise.toString().padStart(2, "0");
  const sign = isNegative ? "-" : "";
  const symbol = showSymbol ? "₹" : "";
  
  return `${sign}${symbol}${formattedRupees}.${paddedPaise}`;
}

/**
 * Parse rupee string into integer paise.
 * Rules:
 * - At most 2 decimal places.
 * - Must be greater than 0.
 * - Returns null or throws error if invalid format.
 */
export function parseRupeesToPaise(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  
  // Regex strictly matching positive numbers with up to 2 decimal places
  const rupeePattern = /^(0|[1-9]\d*)(\.\d{1,2})?$/;
  if (!rupeePattern.test(trimmed)) {
    return null;
  }
  
  const parts = trimmed.split(".");
  const rupees = parseInt(parts[0], 10);
  let paise = 0;
  if (parts.length > 1) {
    paise = parseInt(parts[1].padEnd(2, "0"), 10);
  }
  
  const total = rupees * 100 + paise;
  if (total <= 0) return null;
  return total;
}

/**
 * Calculate base, bonus and total payout according to EcoRewind rules:
 * base = round_half_up(weight * rate)
 * bonus = weight >= bonus_threshold_g ? round_half_up(base * bonus_pct / 100) : 0
 * payout = base + bonus
 */
export function calculatePayout(
  weightGrams: number,
  ratePaisePerGram: number,
  bonusThresholdGrams: number = 400,
  bonusPercent: number = 10
): { basePaise: number; bonusPaise: number; totalPaise: number } {
  if (weightGrams <= 0 || ratePaisePerGram <= 0) {
    return { basePaise: 0, bonusPaise: 0, totalPaise: 0 };
  }
  
  const basePaise = roundHalfUp(weightGrams * ratePaisePerGram);
  const bonusPaise = weightGrams >= bonusThresholdGrams
    ? roundHalfUp((basePaise * bonusPercent) / 100)
    : 0;
  const totalPaise = basePaise + bonusPaise;
  
  return { basePaise, bonusPaise, totalPaise };
}
