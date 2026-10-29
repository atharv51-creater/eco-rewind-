import { useState, useEffect, useCallback } from "react";
import { RatesResponse } from "../types";
import { api } from "../services/api";

const DEFAULT_RATES: RatesResponse = {
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

export function useRates() {
  const [rates, setRates] = useState<RatesResponse>(DEFAULT_RATES);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getRates();
      setRates(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load tariff rates";
      setError(msg);
      // Keep default rates as fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  return { rates, loading, error, reload: fetchRates };
}
