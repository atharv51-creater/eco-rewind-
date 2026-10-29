import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useWallet } from "../hooks/useWallet";
import { WalletPage } from "./WalletPage";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Card } from "../components/Card";
import { Modal } from "../components/Modal";
import { isValidUpiId } from "../utils/ids";
import { formatPaise } from "../utils/money";
import { User, Wallet as WalletIcon, Settings, LogOut, CheckCircle, Smartphone, Sliders } from "lucide-react";

interface UserDashboardPageProps {
  onNavigateMachine: () => void;
  onNavigateHome: () => void;
}

export const UserDashboardPage: React.FC<UserDashboardPageProps> = ({ onNavigateMachine, onNavigateHome }) => {
  const { user, logout, updateUser } = useAuth();
  const userId = user?.phone || user?.id || "demo-user";
  const { wallet, refresh: refreshWallet } = useWallet(userId);

  const [activeTab, setActiveTab] = useState<"wallet" | "profile">("wallet");

  // Profile edit states
  const [name, setName] = useState<string>(user?.name || "");
  const [upiId, setUpiId] = useState<string>(user?.upi_id || "");
  const [profileSaved, setProfileSaved] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    if (upiId && !isValidUpiId(upiId)) {
      setProfileError("Please enter a valid UPI VPA address.");
      return;
    }
    updateUser({ name, upi_id: upiId });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* User Dashboard Sub-Header */}
      <div className="bg-[#F6F6F3] border-b border-[#E5E6E1] py-4 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#12372A] flex items-center justify-center text-emerald-400 font-bold">
              {user?.name ? user.name.charAt(0).toUpperCase() : "U"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold font-heading text-[#12372A]">
                  Welcome, {user?.name || "Recycler"}
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#E5F0EA] text-[#12372A] border border-[#1F5C45]/20">
                  Verified Recycler
                </span>
              </div>
              <p className="text-xs text-[#5B655F]">
                Linked Mobile: <span className="font-mono text-[#12372A]">{user?.phone || "9876543210"}</span>
              </p>
            </div>
          </div>

          {/* Quick Actions & Navigation Tabs */}
          <div className="flex items-center gap-2">
            <div className="flex bg-white rounded-xl p-1 border border-[#E5E6E1]">
              <button
                onClick={() => setActiveTab("wallet")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "wallet"
                    ? "bg-[#1F5C45] text-white shadow-xs"
                    : "text-[#5B655F] hover:text-[#1C2321]"
                }`}
              >
                <WalletIcon className="w-3.5 h-3.5" />
                <span>Wallet &amp; Deposits</span>
              </button>

              <button
                onClick={() => setActiveTab("profile")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "profile"
                    ? "bg-[#1F5C45] text-white shadow-xs"
                    : "text-[#5B655F] hover:text-[#1C2321]"
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Profile &amp; UPI</span>
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={onNavigateMachine}
              className="text-xs gap-1.5 bg-white border-[#E5E6E1]"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#1F5C45]" />
              <span className="hidden sm:inline">Deposit at Kiosk</span>
            </Button>

            <button
              onClick={() => {
                logout();
                onNavigateHome();
              }}
              title="Sign Out"
              className="p-2 text-[#5B655F] hover:text-[#B9402B] rounded-xl border border-[#E5E6E1] bg-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === "wallet" ? (
        <WalletPage />
      ) : (
        <div className="max-w-2xl mx-auto py-10 px-4 sm:px-6">
          <Card className="p-6 border border-[#E5E6E1] space-y-6">
            <div>
              <h2 className="text-lg font-bold font-heading text-[#12372A]">
                Recycler Profile Settings
              </h2>
              <p className="text-xs text-[#5B655F]">
                Manage your personal details and default UPI address for automatic deposit transfers.
              </p>
            </div>

            {profileSaved && (
              <div className="p-3 bg-[#E5F0EA] border border-[#1F5C45]/30 rounded-xl text-xs text-[#12372A] flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-[#1F5C45]" />
                <span>Profile updated successfully!</span>
              </div>
            )}

            {profileError && (
              <div className="p-3 bg-[#FBEAE7] border border-[#B9402B]/30 rounded-xl text-xs text-[#B9402B]">
                {profileError}
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <Input
                label="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <Input
                label="Email Address (read-only)"
                value={user?.email || ""}
                disabled
                className="bg-gray-100 text-gray-500 cursor-not-allowed"
              />

              <Input
                label="Registered Mobile Number"
                value={user?.phone || ""}
                disabled
                className="bg-gray-100 text-gray-500 cursor-not-allowed"
                helperText="Your mobile number links your reverse vending sessions automatically."
              />

              <Input
                label="Default UPI VPA ID"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="e.g. rahul@okhdfcbank"
                helperText="Withdrawals will be transferred to this UPI address."
              />

              <div className="pt-2 flex justify-end gap-3">
                <Button type="submit" variant="primary" size="md" className="bg-[#1F5C45] text-white">
                  Save Changes
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};
