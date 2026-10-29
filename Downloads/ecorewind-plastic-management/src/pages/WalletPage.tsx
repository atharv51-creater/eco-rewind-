import React, { useState, useEffect, useCallback } from "react";
import { useWalletId } from "../context/WalletIdContext";
import { useWallet } from "../hooks/useWallet";
import { api } from "../services/api";
import { Transaction, Withdrawal } from "../types";
import { formatPaise, parseRupeesToPaise } from "../utils/money";
import { maskWalletId, isValidIndianMobile, isValidUpiId, generateUuid } from "../utils/ids";
import { exportTransactionsToCsv } from "../utils/csv";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Card } from "../components/Card";
import { Modal } from "../components/Modal";
import { StatusChip } from "../components/StatusChip";
import { ToastContainer, ToastMessage } from "../components/Toast";
import { TableSkeleton, CardSkeleton } from "../components/Loader";
import { EmptyState } from "../components/EmptyState";
import {
  Wallet as WalletIcon,
  Download,
  Send,
  Leaf,
  Scale,
  RefreshCw,
  Award,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Check,
  Ban
} from "lucide-react";

export const WalletPage: React.FC = () => {
  const { userId, setUserId, useDemoWallet, clearUserId } = useWalletId();
  const { wallet, loading: walletLoading, error: walletError, lastSyncTime, displayBalancePaise, refresh: refreshWallet } = useWallet(userId);

  // Switch wallet modal
  const [isSwitchingWallet, setIsSwitchingWallet] = useState<boolean>(false);
  const [switchWalletInput, setSwitchWalletInput] = useState<string>("");
  const [switchError, setSwitchError] = useState<string | null>(null);

  // Transactions list state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txnLoading, setTxnLoading] = useState<boolean>(true);
  const [txnFilter, setTxnFilter] = useState<"all" | "accepted" | "rejected">("all");
  const [txnOffset, setTxnOffset] = useState<number>(0);
  const [txnTotal, setTxnTotal] = useState<number>(0);
  const TXN_LIMIT = 25;

  // Withdrawals list state
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [wdLoading, setWdLoading] = useState<boolean>(true);

  // Withdraw Modal & Form state
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState<boolean>(false);
  const [withdrawRupeesInput, setWithdrawRupeesInput] = useState<string>("");
  const [upiIdInput, setUpiIdInput] = useState<string>("");
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [isConfirmingWithdraw, setIsConfirmingWithdraw] = useState<boolean>(false);
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState<boolean>(false);
  const [withdrawSuccessMsg, setWithdrawSuccessMsg] = useState<string | null>(null);

  // Live toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (type: "success" | "error" | "info", message: string, title?: string) => {
    setToasts((prev) => [...prev, { id: "toast-" + Date.now() + Math.random(), type, title, message }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    if (!userId) return;
    try {
      setTxnLoading(true);
      const res = await api.getTransactions(userId, TXN_LIMIT, txnOffset, txnFilter);
      setTransactions(res.items);
      setTxnTotal(res.total);
    } catch {
      // Ignore
    } finally {
      setTxnLoading(false);
    }
  }, [userId, txnOffset, txnFilter]);

  // Fetch withdrawals
  const fetchWithdrawals = useCallback(async () => {
    if (!userId) return;
    try {
      setWdLoading(true);
      const res = await api.getWithdrawals(userId);
      setWithdrawals(res.items);
    } catch {
      // Ignore
    } finally {
      setWdLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  // Cross-tab sync: notify on new deposits
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel("ecorewind");
    bc.onmessage = (e) => {
      if (e.data && e.data.type === "wallet" && (e.data.userId === userId || !e.data.userId)) {
        refreshWallet();
        fetchTransactions();
        fetchWithdrawals();
        addToast("success", "Deposit verified! Your wallet balance has been updated.", "Live Ledger Sync");
      }
    };
    return () => bc.close();
  }, [userId, refreshWallet, fetchTransactions, fetchWithdrawals]);

  // Handle Switch Wallet Submit
  const handleSwitchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!switchWalletInput.trim()) return;
    if (!isValidIndianMobile(switchWalletInput) && switchWalletInput !== "demo-user") {
      setSwitchError("Please enter a valid 10-digit mobile number or 'demo-user'.");
      return;
    }
    setUserId(switchWalletInput.trim());
    setIsSwitchingWallet(false);
    setSwitchWalletInput("");
    setSwitchError(null);
  };

  // Handle Withdrawal Request
  const handleInitiateWithdrawal = () => {
    setWithdrawError(null);
    const parsedPaise = parseRupeesToPaise(withdrawRupeesInput);
    if (!parsedPaise) {
      setWithdrawError("Enter a valid rupee amount (e.g. 10.00).");
      return;
    }
    if (parsedPaise <= 0) {
      setWithdrawError("Withdrawal amount must be greater than ₹0.");
      return;
    }
    if (wallet && parsedPaise > wallet.balance_paise) {
      setWithdrawError(`Amount exceeds available balance (${formatPaise(wallet.balance_paise)}).`);
      return;
    }
    if (!isValidUpiId(upiIdInput)) {
      setWithdrawError("Please enter a valid UPI ID (e.g. name@okhdfcbank).");
      return;
    }
    setIsConfirmingWithdraw(true);
  };

  const handleConfirmWithdrawal = async () => {
    const parsedPaise = parseRupeesToPaise(withdrawRupeesInput);
    if (!parsedPaise) return;

    try {
      setIsSubmittingWithdraw(true);
      const idempotencyKey = generateUuid();
      await api.createWithdrawal(idempotencyKey, userId, parsedPaise, upiIdInput.trim());

      setWithdrawSuccessMsg(`Withdrawal of ${formatPaise(parsedPaise)} to ${upiIdInput} requested!`);
      addToast("success", `Requested withdrawal of ${formatPaise(parsedPaise)}. Status: Pending operator payout.`);
      setIsConfirmingWithdraw(false);
      setWithdrawRupeesInput("");
      setUpiIdInput("");
      refreshWallet();
      fetchWithdrawals();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Withdrawal request failed";
      setWithdrawError(msg);
      setIsConfirmingWithdraw(false);
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  // Operator Actions helper for demo simulation
  const handleAdminAction = async (withdrawalId: string, status: "paid" | "cancelled") => {
    await api.adminUpdateWithdrawal(withdrawalId, status);
    fetchWithdrawals();
    refreshWallet();
    addToast("info", `Withdrawal marked as ${status}.`);
  };

  // Lifetime earnings reward progress (₹100 reward goal = 10,000 paise)
  const lifetimeGoalPaise = 10000;
  const lifetimePaise = wallet?.total_paid_paise || 0;
  const rewardProgressPct = Math.min(Math.round((lifetimePaise / lifetimeGoalPaise) * 100), 100);

  // Environmental impact stats
  const totalKgRecycled = ((wallet?.total_grams || 0) / 1000).toFixed(2);
  const co2AvoidedKg = ((wallet?.total_grams || 0) / 1000 * 1.5).toFixed(2);
  const bottleEquivalents = Math.round((wallet?.total_grams || 0) / 25);

  return (
    <div className="min-h-screen bg-white py-8 px-4 sm:px-6">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header: Masked wallet ID, Switch wallet & Sync indicator */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E5E6E1]">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-[#5B655F]">LINKED WALLET:</span>
              <span className="font-mono text-sm font-bold text-[#12372A] bg-[#F6F6F3] px-2.5 py-0.5 rounded-md border border-[#E5E6E1]">
                {maskWalletId(userId)}
              </span>
              <button
                onClick={() => setIsSwitchingWallet(true)}
                className="text-xs text-[#1F5C45] hover:underline font-medium ml-1"
              >
                Switch wallet
              </button>
            </div>
            <p className="text-xs text-[#5B655F] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1F5C45]" />
              {lastSyncTime ? `Updated ${lastSyncTime}` : "Can't reach the server, showing the last data"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refreshWallet();
                fetchTransactions();
                fetchWithdrawals();
              }}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync now</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsWithdrawModalOpen(true)}
              disabled={(wallet?.balance_paise || 0) <= 0}
              className="gap-1.5 text-xs bg-[#1F5C45] hover:bg-[#12372A] text-white"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Withdraw to UPI</span>
            </Button>
          </div>
        </div>

        {/* Balance Card & Progress to ₹100 Reward */}
        {walletLoading ? (
          <CardSkeleton />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Balance Highlights (7 Cols) */}
            <div className="md:col-span-7 bg-[#12372A] text-white rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-xs font-mono text-emerald-300">AVAILABLE BALANCE</span>
                <span className="text-xs font-mono text-white/60">ID: {maskWalletId(userId)}</span>
              </div>

              <div className="py-6">
                <div className="text-4xl sm:text-5xl font-bold font-heading text-white tracking-tight tabular-nums">
                  {formatPaise(displayBalancePaise)}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs font-mono text-emerald-200">
                  <span>Lifetime Earned: <strong className="text-white">{formatPaise(wallet?.total_paid_paise || 0)}</strong></span>
                  <span>•</span>
                  <span>Total Deposits: <strong className="text-white">{wallet?.accepted_count || 0} items</strong></span>
                </div>
              </div>

              {/* Progress to ₹100 Lifetime Goal */}
              <div className="pt-3 border-t border-white/10">
                <div className="flex items-center justify-between text-xs font-mono text-white/80 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-[#E09B2D]" />
                    <span>Reward milestone (₹100.00 lifetime earnings)</span>
                  </span>
                  <span className="font-bold text-emerald-300">{rewardProgressPct}%</span>
                </div>
                <div className="w-full bg-white/15 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#E09B2D] transition-all duration-500 rounded-full"
                    style={{ width: `${rewardProgressPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Eco Impact Stats Row (5 Cols) */}
            <div className="md:col-span-5 bg-[#F6F6F3] rounded-2xl p-6 border border-[#E5E6E1] flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#E5E6E1]">
                <h3 className="text-sm font-bold font-heading text-[#12372A] flex items-center gap-1.5">
                  <Leaf className="w-4 h-4 text-[#1F5C45]" />
                  Verified Environmental Impact
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-3 rounded-xl border border-[#E5E6E1]">
                  <p className="text-xs text-[#5B655F]">Material Diverted</p>
                  <p className="text-xl font-bold font-heading text-[#12372A] mt-0.5">{totalKgRecycled} kg</p>
                  <p className="text-[11px] text-[#5B655F] mt-0.5 font-mono">({wallet?.total_grams || 0} grams total)</p>
                </div>

                <div className="bg-white p-3 rounded-xl border border-[#E5E6E1]">
                  <p className="text-xs text-[#5B655F]">CO₂ Avoided</p>
                  <p className="text-xl font-bold font-heading text-[#12372A] mt-0.5">{co2AvoidedKg} kg</p>
                  <p className="text-[11px] text-[#5B655F] mt-0.5 font-mono">(estimate: 1.5kg/kg)</p>
                </div>

                <div className="bg-white p-3 rounded-xl border border-[#E5E6E1]">
                  <p className="text-xs text-[#5B655F]">Bottle Equivalents</p>
                  <p className="text-xl font-bold font-heading text-[#12372A] mt-0.5">{bottleEquivalents}</p>
                  <p className="text-[11px] text-[#5B655F] mt-0.5 font-mono">(based on 25g/unit)</p>
                </div>

                <div className="bg-white p-3 rounded-xl border border-[#E5E6E1]">
                  <p className="text-xs text-[#5B655F]">Accepted / Rejected</p>
                  <p className="text-xl font-bold font-heading text-[#12372A] mt-0.5">
                    {wallet?.accepted_count || 0} / {wallet?.rejected_count || 0}
                  </p>
                  <p className="text-[11px] text-[#5B655F] mt-0.5 font-mono">Quality audit passed</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Transactions History Section */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold font-heading text-[#12372A]">
                Deposit Transaction History
              </h2>
              <p className="text-xs text-[#5B655F]">
                Audited ledger records for reverse vending deposits.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Filter Tabs */}
              <div className="flex rounded-xl bg-[#F6F6F3] p-1 border border-[#E5E6E1]">
                {(["all", "accepted", "rejected"] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => {
                      setTxnFilter(filter);
                      setTxnOffset(0);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-lg capitalize transition-colors ${
                      txnFilter === filter
                        ? "bg-white text-[#12372A] shadow-xs font-semibold"
                        : "text-[#5B655F] hover:text-[#1C2321]"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* CSV Export Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportTransactionsToCsv(transactions)}
                disabled={transactions.length === 0}
                className="gap-1.5 text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </Button>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="bg-white rounded-2xl border border-[#E5E6E1] overflow-hidden">
            {txnLoading ? (
              <div className="p-6">
                <TableSkeleton rows={5} />
              </div>
            ) : transactions.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title="No deposit transactions found"
                  description="Use the reverse vending machine to deposit plastic bottles, cans, or bags to see records here."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#F6F6F3] border-b border-[#E5E6E1] text-[#5B655F] font-mono">
                      <th className="py-3 px-4 font-semibold">Date &amp; Time</th>
                      <th className="py-3 px-4 font-semibold">Container</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold">Weight</th>
                      <th className="py-3 px-4 font-semibold">Payout</th>
                      <th className="py-3 px-4 font-semibold">Reason / Audit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E6E1]/60 font-medium">
                    {transactions.map((t) => (
                      <tr key={t.id} className="hover:bg-[#F6F6F3]/50 transition-colors">
                        <td className="py-3 px-4 font-mono text-[#5B655F] whitespace-nowrap">
                          {new Date(t.created_at).toLocaleString("en-IN", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-3 px-4 text-[#12372A]">
                          <span className="font-semibold">{t.display_label || t.label}</span>
                          <span className="block text-[10px] text-[#5B655F] font-mono">
                            Confidence: {Math.round(t.confidence * 100)}%
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <StatusChip status={t.status} />
                        </td>
                        <td className="py-3 px-4 font-mono">{t.weight_grams} g</td>
                        <td className="py-3 px-4 font-mono">
                          {t.status === "accepted" ? (
                            <span className="text-[#1F5C45] font-bold">
                              +{formatPaise(t.payout_paise)}
                            </span>
                          ) : (
                            <span className="text-[#5B655F]">₹0.00</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[#5B655F] max-w-xs truncate">
                          {t.reason || (t.status === "accepted" ? "Item verified" : "Rejected")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Withdrawals Section */}
        <div className="space-y-4 pt-4 border-t border-[#E5E6E1]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold font-heading text-[#12372A]">
                UPI Withdrawal Requests
              </h2>
              <p className="text-xs text-[#5B655F]">
                Funds transfer history to UPI IDs. Pending requests are settled by the operator.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#E5E6E1] overflow-hidden">
            {wdLoading ? (
              <div className="p-6">
                <TableSkeleton rows={3} />
              </div>
            ) : withdrawals.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  title="No withdrawal requests yet"
                  description="When you have an available balance, you can transfer money directly to your UPI ID."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#F6F6F3] border-b border-[#E5E6E1] text-[#5B655F] font-mono">
                      <th className="py-3 px-4 font-semibold">Request ID</th>
                      <th className="py-3 px-4 font-semibold">Date</th>
                      <th className="py-3 px-4 font-semibold">Destination UPI</th>
                      <th className="py-3 px-4 font-semibold">Amount</th>
                      <th className="py-3 px-4 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold">Operator Action (Demo)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E6E1]/60 font-medium">
                    {withdrawals.map((w) => (
                      <tr key={w.id} className="hover:bg-[#F6F6F3]/50 transition-colors">
                        <td className="py-3 px-4 font-mono text-[#5B655F]">{w.id}</td>
                        <td className="py-3 px-4 font-mono text-[#5B655F] whitespace-nowrap">
                          {new Date(w.created_at).toLocaleDateString("en-IN")}
                        </td>
                        <td className="py-3 px-4 font-mono text-[#12372A]">{w.destination}</td>
                        <td className="py-3 px-4 font-mono font-bold text-[#12372A]">
                          {formatPaise(w.amount_paise)}
                        </td>
                        <td className="py-3 px-4">
                          <StatusChip status={w.status} />
                        </td>
                        <td className="py-3 px-4">
                          {w.status === "pending" && (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleAdminAction(w.id, "paid")}
                                className="px-2 py-1 text-[11px] font-mono rounded bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" /> Approve
                              </button>
                              <button
                                onClick={() => handleAdminAction(w.id, "cancelled")}
                                className="px-2 py-1 text-[11px] font-mono rounded bg-gray-50 text-gray-700 border border-gray-300 hover:bg-gray-100 flex items-center gap-1"
                              >
                                <Ban className="w-3 h-3" /> Refund
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Switch Wallet Modal */}
      <Modal
        isOpen={isSwitchingWallet}
        onClose={() => setIsSwitchingWallet(false)}
        title="Switch Linked Wallet"
        description="Enter your 10-digit mobile number or use the default demo wallet."
      >
        <form onSubmit={handleSwitchSubmit} className="space-y-4">
          <Input
            label="Mobile Number / Wallet ID"
            placeholder="e.g. 9876543210 or demo-user"
            value={switchWalletInput}
            onChange={(e) => setSwitchWalletInput(e.target.value)}
            error={switchError}
          />
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => {
                useDemoWallet();
                setIsSwitchingWallet(false);
              }}
              className="text-xs text-[#1F5C45] hover:underline"
            >
              Use demo wallet (demo-user)
            </button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsSwitchingWallet(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Switch
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Withdraw to UPI Modal */}
      <Modal
        isOpen={isWithdrawModalOpen}
        onClose={() => {
          setIsWithdrawModalOpen(false);
          setIsConfirmingWithdraw(false);
          setWithdrawError(null);
          setWithdrawSuccessMsg(null);
        }}
        title="Withdraw Balance to UPI"
        description="Instant transfer directly to any UPI Virtual Payment Address (VPA)."
      >
        {withdrawSuccessMsg ? (
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#E5F0EA] flex items-center justify-center mx-auto text-[#1F5C45]">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-[#12372A] font-heading">Request Submitted!</h4>
            <p className="text-xs text-[#5B655F]">{withdrawSuccessMsg}</p>
            <p className="text-[11px] text-[#5B655F]">
              Requests stay pending until the operator processes them; cancelled ones are immediately refunded.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setIsWithdrawModalOpen(false);
                setWithdrawSuccessMsg(null);
              }}
              className="mt-2"
            >
              Done
            </Button>
          </div>
        ) : isConfirmingWithdraw ? (
          <div className="space-y-4">
            <div className="p-4 bg-[#F6F6F3] rounded-xl border border-[#E5E6E1] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#5B655F]">Withdrawal Amount:</span>
                <strong className="text-[#12372A] font-mono text-sm">
                  {formatPaise(parseRupeesToPaise(withdrawRupeesInput) || 0)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5B655F]">Destination UPI ID:</span>
                <strong className="text-[#12372A] font-mono">{upiIdInput}</strong>
              </div>
              <div className="flex justify-between border-t border-[#E5E6E1] pt-2">
                <span className="text-[#5B655F]">Remaining Balance:</span>
                <span className="font-mono text-[#1F5C45]">
                  {formatPaise(
                    (wallet?.balance_paise || 0) - (parseRupeesToPaise(withdrawRupeesInput) || 0)
                  )}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[#5B655F] leading-tight">
              One line note: Requests stay pending until an operator pays them, and cancelled ones are automatically refunded back to your wallet.
            </p>

            {withdrawError && (
              <p className="text-xs text-[#B9402B] font-medium">{withdrawError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsConfirmingWithdraw(false)}
                disabled={isSubmittingWithdraw}
              >
                Back
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmWithdrawal}
                loading={isSubmittingWithdraw}
              >
                Confirm &amp; Transfer
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-[#E5F0EA]/40 rounded-xl border border-[#1F5C45]/20 flex items-center justify-between text-xs">
              <span className="text-[#12372A]">Available Balance:</span>
              <strong className="text-[#1F5C45] font-mono text-sm">
                {formatPaise(wallet?.balance_paise || 0)}
              </strong>
            </div>

            <Input
              label="Amount in Rupees (₹)"
              placeholder="e.g. 15.00"
              value={withdrawRupeesInput}
              onChange={(e) => setWithdrawRupeesInput(e.target.value)}
              helperText="Parsed into exact paise. Up to 2 decimal places."
            />

            <Input
              label="UPI ID / VPA"
              placeholder="e.g. yourname@okhdfcbank"
              value={upiIdInput}
              onChange={(e) => setUpiIdInput(e.target.value)}
              helperText="Must match standard UPI VPA format."
            />

            {withdrawError && (
              <p className="text-xs text-[#B9402B] font-medium">{withdrawError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsWithdrawModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleInitiateWithdrawal}
              >
                Continue
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
