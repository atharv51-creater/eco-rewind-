import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import {
  AdminStats,
  AdminUserItem,
  AdminMachineItem,
  Transaction,
  RatesResponse,
} from "../types";
import { formatPaise } from "../utils/money";
import { exportTransactionsToCsv } from "../utils/csv";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Card } from "../components/Card";
import { Modal } from "../components/Modal";
import { StatusChip } from "../components/StatusChip";
import { TableSkeleton } from "../components/Loader";
import {
  Shield,
  Users,
  Recycle,
  Coins,
  Cpu,
  Search,
  Sliders,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LogOut,
  SlidersHorizontal,
} from "lucide-react";

interface AdminDashboardPageProps {
  onNavigateHome: () => void;
}

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ onNavigateHome }) => {
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<"overview" | "transactions" | "users" | "machines" | "rates">("overview");

  // Stats state
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState<boolean>(true);

  // Transactions state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txnSearch, setTxnSearch] = useState<string>("");
  const [txnStatusFilter, setTxnStatusFilter] = useState<"all" | "accepted" | "rejected">("all");
  const [txnLoading, setTxnLoading] = useState<boolean>(true);

  // Users state
  const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>([]);
  const [userSearch, setUserSearch] = useState<string>("");
  const [usersLoading, setUsersLoading] = useState<boolean>(true);

  // Machines state
  const [machines, setMachines] = useState<AdminMachineItem[]>([]);
  const [machinesLoading, setMachinesLoading] = useState<boolean>(true);

  // Rates state & Edit modal
  const [rates, setRates] = useState<RatesResponse | null>(null);
  const [isEditingRates, setIsEditingRates] = useState<boolean>(false);
  const [editBottleRate, setEditBottleRate] = useState<number>(2);
  const [editCanRate, setEditCanRate] = useState<number>(4);
  const [editBagRate, setEditBagRate] = useState<number>(1);
  const [editBonusThreshold, setEditBonusThreshold] = useState<number>(400);
  const [editBonusPct, setEditBonusPct] = useState<number>(10);
  const [ratesSaveSuccess, setRatesSaveSuccess] = useState<boolean>(false);

  // Fetch all admin data
  const loadAdminData = useCallback(async () => {
    try {
      setStatsLoading(true);
      const s = await api.getAdminStats();
      setStats(s);
    } catch {
      // Ignore
    } finally {
      setStatsLoading(false);
    }

    try {
      setTxnLoading(true);
      const res = await api.getTransactions("all", 50, 0, "all");
      setTransactions(res.items);
    } catch {
      // Ignore
    } finally {
      setTxnLoading(false);
    }

    try {
      setUsersLoading(true);
      const u = await api.getAdminUsers();
      setAdminUsers(u);
    } catch {
      // Ignore
    } finally {
      setUsersLoading(false);
    }

    try {
      setMachinesLoading(true);
      const m = await api.getAdminMachines();
      setMachines(m);
    } catch {
      // Ignore
    } finally {
      setMachinesLoading(false);
    }

    try {
      const r = await api.getRates();
      setRates(r);
      setEditBottleRate(r.rates_paise_per_gram.plastic_bottle || 2);
      setEditCanRate(r.rates_paise_per_gram.aluminium_can || 4);
      setEditBagRate(r.rates_paise_per_gram.plastic_bag || 1);
      setEditBonusThreshold(r.bonus_threshold_g || 400);
      setEditBonusPct(r.bonus_pct || 10);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  // Handle rates form update
  const handleSaveRates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rates) return;
    const newRates: RatesResponse = {
      ...rates,
      rates_paise_per_gram: {
        plastic_bottle: editBottleRate,
        aluminium_can: editCanRate,
        plastic_bag: editBagRate,
      },
      bonus_threshold_g: editBonusThreshold,
      bonus_pct: editBonusPct,
    };

    await api.updateAdminRates(newRates);
    setRates(newRates);
    setIsEditingRates(false);
    setRatesSaveSuccess(true);
    setTimeout(() => setRatesSaveSuccess(false), 3000);
  };

  // Filtered transactions
  const filteredTxns = transactions.filter((t) => {
    const matchesFilter =
      txnStatusFilter === "all" ? true : t.status === txnStatusFilter;
    const query = txnSearch.toLowerCase();
    const matchesSearch =
      !query ||
      t.id.toLowerCase().includes(query) ||
      (t.display_label || "").toLowerCase().includes(query) ||
      (t.user_id || "").toLowerCase().includes(query) ||
      (t.user_name || "").toLowerCase().includes(query) ||
      (t.machine_id || "").toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  // Filtered users
  const filteredUsers = adminUsers.filter((u) => {
    const query = userSearch.toLowerCase();
    return (
      !query ||
      u.name.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query) ||
      u.phone.includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Admin Portal Header */}
      <div className="bg-[#12372A] text-white py-4 px-4 sm:px-6 border-b border-[#0D261D]">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-emerald-400 border border-white/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold font-heading">
                  EcoRewind Admin Management Portal
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                  Role: Super Admin
                </span>
              </div>
              <p className="text-xs text-white/60">
                Operating Console: {user?.email || "admin@ecorewind.com"}
              </p>
            </div>
          </div>

          {/* Action Tabs & Logout */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadAdminData}
              className="text-xs gap-1.5 bg-white/10 hover:bg-white/20 text-white border-white/20 h-9"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </Button>

            <button
              onClick={() => {
                logout();
                onNavigateHome();
              }}
              title="Sign Out of Admin"
              className="p-2 text-white/70 hover:text-white rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto mt-4 flex items-center gap-2 overflow-x-auto border-t border-white/10 pt-3 text-xs">
          {[
            { id: "overview", label: "Overview & Telematics" },
            { id: "transactions", label: "Ledger Transactions" },
            { id: "users", label: "Registered Recyclers" },
            { id: "machines", label: "Machine Fleet Status" },
            { id: "rates", label: "Tariff Rates Config" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-3.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? "bg-white text-[#12372A] font-semibold shadow-xs"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 space-y-8">
        {ratesSaveSuccess && (
          <div className="p-3 bg-[#E5F0EA] border border-[#1F5C45]/30 rounded-xl text-xs text-[#12372A] flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-[#1F5C45]" />
            <span>Tariff configuration saved and propagated to all reverse vending kiosks!</span>
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* 4 Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <Card className="p-5 border border-[#E5E6E1]">
                <div className="flex items-center justify-between text-[#5B655F] mb-2">
                  <span className="text-xs font-semibold">Total Recyclers</span>
                  <Users className="w-4 h-4 text-[#1F5C45]" />
                </div>
                <div className="text-3xl font-bold font-heading text-[#12372A]">
                  {statsLoading ? "..." : stats?.total_users || 0}
                </div>
                <p className="text-[11px] text-[#5B655F] mt-1 font-mono">Active verified mobile wallets</p>
              </Card>

              <Card className="p-5 border border-[#E5E6E1]">
                <div className="flex items-center justify-between text-[#5B655F] mb-2">
                  <span className="text-xs font-semibold">Bottles &amp; Cans Collected</span>
                  <Recycle className="w-4 h-4 text-[#1F5C45]" />
                </div>
                <div className="text-3xl font-bold font-heading text-[#12372A]">
                  {statsLoading ? "..." : (stats?.total_bottles_collected || 0).toLocaleString()}
                </div>
                <p className="text-[11px] text-[#5B655F] mt-1 font-mono">
                  {statsLoading ? "..." : stats?.total_weight_kg || 0} kg diverted from landfill
                </p>
              </Card>

              <Card className="p-5 border border-[#E5E6E1]">
                <div className="flex items-center justify-between text-[#5B655F] mb-2">
                  <span className="text-xs font-semibold">Total Payouts Credited</span>
                  <Coins className="w-4 h-4 text-[#E09B2D]" />
                </div>
                <div className="text-3xl font-bold font-heading text-[#12372A]">
                  {statsLoading ? "..." : formatPaise(stats?.total_money_paid_paise || 0)}
                </div>
                <p className="text-[11px] text-[#5B655F] mt-1 font-mono">Audited on immutable ledger</p>
              </Card>

              <Card className="p-5 border border-[#E5E6E1]">
                <div className="flex items-center justify-between text-[#5B655F] mb-2">
                  <span className="text-xs font-semibold">Active RVM Kiosks</span>
                  <Cpu className="w-4 h-4 text-[#1F5C45]" />
                </div>
                <div className="text-3xl font-bold font-heading text-[#12372A]">
                  {statsLoading ? "..." : `${stats?.active_machines || 3} / 4`}
                </div>
                <p className="text-[11px] text-[#5B655F] mt-1 font-mono">Fleet health: 98.4% uptime</p>
              </Card>
            </div>

            {/* Quick Fleet Health Matrix */}
            <div className="bg-[#F6F6F3] rounded-2xl p-6 border border-[#E5E6E1] space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#E5E6E1]">
                <div>
                  <h3 className="text-sm font-bold font-heading text-[#12372A]">
                    Fleet Bin Fill Telematics
                  </h3>
                  <p className="text-xs text-[#5B655F]">Real-time bin sensors across reverse vending kiosks.</p>
                </div>
                <button
                  onClick={() => setActiveTab("machines")}
                  className="text-xs text-[#1F5C45] font-semibold hover:underline"
                >
                  Manage fleet →
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {machines.map((m) => (
                  <div key={m.id} className="bg-white p-4 rounded-xl border border-[#E5E6E1] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs font-heading text-[#12372A]">{m.id}</span>
                      <StatusChip status={m.status === "online" ? "ready" : m.status === "maintenance" ? "busy" : "offline"} />
                    </div>
                    <p className="text-xs text-[#5B655F] line-clamp-1">{m.name}</p>

                    <div className="space-y-1.5 text-[11px] font-mono">
                      <div>
                        <div className="flex justify-between text-[#5B655F]">
                          <span>PET Bin:</span>
                          <span className={m.bin_pet_pct >= 85 ? "text-red-600 font-bold" : ""}>{m.bin_pet_pct}%</span>
                        </div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${m.bin_pet_pct >= 85 ? "bg-red-500" : "bg-blue-500"}`}
                            style={{ width: `${m.bin_pet_pct}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[#5B655F]">
                          <span>Cans Bin:</span>
                          <span>{m.bin_cans_pct}%</span>
                        </div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                          <div className="h-full bg-red-400" style={{ width: `${m.bin_cans_pct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TRANSACTIONS */}
        {activeTab === "transactions" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold font-heading text-[#12372A]">
                  Central Ledger Deposit Audit
                </h2>
                <p className="text-xs text-[#5B655F]">
                  Real-time deposit stream with optical classifications and weights.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    value={txnSearch}
                    onChange={(e) => setTxnSearch(e.target.value)}
                    placeholder="Search ID, item, user..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[#E5E6E1] focus:outline-none focus:ring-2 focus:ring-[#1F5C45]"
                  />
                </div>

                {/* Status Filter */}
                <div className="flex bg-[#F6F6F3] p-1 rounded-xl border border-[#E5E6E1]">
                  {(["all", "accepted", "rejected"] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setTxnStatusFilter(st)}
                      className={`px-3 py-1 text-xs rounded-lg capitalize transition-colors ${
                        txnStatusFilter === st
                          ? "bg-white text-[#12372A] font-bold shadow-xs"
                          : "text-[#5B655F]"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportTransactionsToCsv(filteredTxns, "admin_ecorewind_ledger.csv")}
                  className="gap-1.5 text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E5E6E1] overflow-hidden">
              {txnLoading ? (
                <div className="p-6">
                  <TableSkeleton rows={6} />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[#F6F6F3] border-b border-[#E5E6E1] text-[#5B655F] font-mono">
                        <th className="py-3 px-4 font-semibold">Txn ID</th>
                        <th className="py-3 px-4 font-semibold">Timestamp</th>
                        <th className="py-3 px-4 font-semibold">Machine</th>
                        <th className="py-3 px-4 font-semibold">Recycler</th>
                        <th className="py-3 px-4 font-semibold">Class / Polymer</th>
                        <th className="py-3 px-4 font-semibold">Weight</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold">Payout</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E6E1]/60 font-medium">
                      {filteredTxns.map((t) => (
                        <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 font-mono text-[#5B655F]">{t.id}</td>
                          <td className="py-3 px-4 font-mono text-[#5B655F] whitespace-nowrap">
                            {new Date(t.created_at).toLocaleString("en-IN", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-[#12372A]">{t.machine_id}</td>
                          <td className="py-3 px-4 text-[#12372A]">
                            <span>{t.user_name || t.user_id || "demo-user"}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold">{t.display_label || t.label}</span>
                            <span className="block text-[10px] text-gray-500 font-mono">
                              Conf: {Math.round(t.confidence * 100)}%
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono">{t.weight_grams} g</td>
                          <td className="py-3 px-4">
                            <StatusChip status={t.status} />
                          </td>
                          <td className="py-3 px-4 font-mono font-bold">
                            {t.status === "accepted" ? (
                              <span className="text-[#1F5C45]">+{formatPaise(t.payout_paise)}</span>
                            ) : (
                              <span className="text-gray-400">₹0.00</span>
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
        )}

        {/* TAB 3: USERS */}
        {activeTab === "users" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold font-heading text-[#12372A]">
                  Registered Recyclers
                </h2>
                <p className="text-xs text-[#5B655F]">
                  Audited list of user accounts and accrued balances.
                </p>
              </div>

              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-gray-400" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search user by name, phone..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[#E5E6E1] focus:outline-none focus:ring-2 focus:ring-[#1F5C45]"
                />
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E5E6E1] overflow-hidden">
              {usersLoading ? (
                <div className="p-6">
                  <TableSkeleton rows={4} />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[#F6F6F3] border-b border-[#E5E6E1] text-[#5B655F] font-mono">
                        <th className="py-3 px-4 font-semibold">Recycler Name</th>
                        <th className="py-3 px-4 font-semibold">Email</th>
                        <th className="py-3 px-4 font-semibold">Mobile Number</th>
                        <th className="py-3 px-4 font-semibold">Role</th>
                        <th className="py-3 px-4 font-semibold">Bottles Recycled</th>
                        <th className="py-3 px-4 font-semibold">Wallet Balance</th>
                        <th className="py-3 px-4 font-semibold">UPI VPA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E6E1]/60 font-medium">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-gray-50">
                          <td className="py-3 px-4 text-[#12372A] font-semibold">{u.name}</td>
                          <td className="py-3 px-4 text-[#5B655F]">{u.email}</td>
                          <td className="py-3 px-4 font-mono text-[#12372A]">{u.phone}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                              u.role === "admin" ? "bg-amber-100 text-amber-900 font-bold" : "bg-gray-100 text-gray-700"
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono">{u.bottles_recycled} units</td>
                          <td className="py-3 px-4 font-mono font-bold text-[#1F5C45]">
                            {formatPaise(u.balance_paise)}
                          </td>
                          <td className="py-3 px-4 font-mono text-[#5B655F]">{u.upi_id || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: MACHINES FLEET */}
        {activeTab === "machines" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold font-heading text-[#12372A]">
                Reverse Vending Machine Fleet
              </h2>
              <p className="text-xs text-[#5B655F]">
                Hardware telemetry, camera sensor diagnostics, and maintenance schedules.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {machines.map((m) => (
                <Card key={m.id} className="p-6 border border-[#E5E6E1] space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold text-[#1F5C45] uppercase">{m.id}</span>
                      <h3 className="text-base font-bold font-heading text-[#12372A] mt-0.5">{m.name}</h3>
                      <p className="text-xs text-[#5B655F]">{m.location}</p>
                    </div>
                    <StatusChip status={m.status === "online" ? "ready" : m.status === "maintenance" ? "busy" : "offline"} />
                  </div>

                  {/* Bin Capacities */}
                  <div className="grid grid-cols-3 gap-3 p-3 bg-[#F6F6F3] rounded-xl text-center text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-gray-500 block">PET BOTTLES</span>
                      <strong className={`text-sm ${m.bin_pet_pct >= 90 ? "text-red-600" : "text-gray-900"}`}>
                        {m.bin_pet_pct}%
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">CANS</span>
                      <strong className="text-sm text-gray-900">{m.bin_cans_pct}%</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 block">BAGS</span>
                      <strong className="text-sm text-gray-900">{m.bin_bags_pct}%</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-[#5B655F] pt-2 border-t border-[#E5E6E1]">
                    <span>Total Collected: <strong className="text-[#12372A] font-mono">{m.total_bottles_collected} items</strong></span>
                    <span>Last Service: <span className="font-mono">{m.last_maintenance}</span></span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: TARIFF RATES CONFIG */}
        {activeTab === "rates" && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <h2 className="text-lg font-bold font-heading text-[#12372A]">
                Tariff &amp; Payout Policy Configuration
              </h2>
              <p className="text-xs text-[#5B655F]">
                Configure payout rates per gram and bulk incentives applied to customer deposits.
              </p>
            </div>

            <Card className="p-6 border border-[#E5E6E1] space-y-6">
              <form onSubmit={handleSaveRates} className="space-y-4">
                <div className="p-4 bg-[#F6F6F3] rounded-xl border border-[#E5E6E1] space-y-3">
                  <h4 className="text-xs font-bold text-[#12372A] uppercase font-mono">Category Deposit Rates</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <Input
                      label="PET Bottle (paise/g)"
                      type="number"
                      min="1"
                      max="20"
                      value={editBottleRate}
                      onChange={(e) => setEditBottleRate(parseInt(e.target.value, 10))}
                    />
                    <Input
                      label="Can (paise/g)"
                      type="number"
                      min="1"
                      max="20"
                      value={editCanRate}
                      onChange={(e) => setEditCanRate(parseInt(e.target.value, 10))}
                    />
                    <Input
                      label="Bag (paise/g)"
                      type="number"
                      min="1"
                      max="20"
                      value={editBagRate}
                      onChange={(e) => setEditBagRate(parseInt(e.target.value, 10))}
                    />
                  </div>
                </div>

                <div className="p-4 bg-[#F6F6F3] rounded-xl border border-[#E5E6E1] space-y-3">
                  <h4 className="text-xs font-bold text-[#12372A] uppercase font-mono">Bulk Incentive Multiplier</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Bonus Threshold (grams)"
                      type="number"
                      step="50"
                      value={editBonusThreshold}
                      onChange={(e) => setEditBonusThreshold(parseInt(e.target.value, 10))}
                      helperText="Weight trigger for bulk incentive bonus"
                    />
                    <Input
                      label="Bonus Percentage (%)"
                      type="number"
                      min="1"
                      max="50"
                      value={editBonusPct}
                      onChange={(e) => setEditBonusPct(parseInt(e.target.value, 10))}
                      helperText="Added to base payout for qualifying deposits"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <Button type="submit" variant="primary" size="md" className="bg-[#1F5C45] text-white">
                    Apply &amp; Broadcast New Rates
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
