import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { UserRole } from "../types";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Card } from "../components/Card";
import { Recycle, Lock, Mail, Eye, EyeOff, Shield, User, ArrowRight, AlertCircle } from "lucide-react";

interface LoginPageProps {
  initialRole?: UserRole;
  onNavigate: (page: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ initialRole = "user", onNavigate }) => {
  const { login } = useAuth();
  const [role, setRole] = useState<UserRole>(initialRole);
  const [email, setEmail] = useState<string>(initialRole === "admin" ? "admin@ecorewind.com" : "user@ecorewind.com");
  const [password, setPassword] = useState<string>("password123");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Check if a QR claim token is passed via query params or localStorage
  const [claimToken] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("token") || params.get("claim") || localStorage.getItem("pending_claim_token");
    } catch {
      return null;
    }
  });

  // Field validation states
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleRoleToggle = (newRole: UserRole) => {
    setRole(newRole);
    setError(null);
    if (newRole === "admin") {
      setEmail("admin@ecorewind.com");
      setPassword("password123");
    } else {
      setEmail("user@ecorewind.com");
      setPassword("password123");
    }
  };

  const validate = () => {
    let isValid = true;
    setEmailError(null);
    setPasswordError(null);

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      setEmailError("Email address is required.");
      isValid = false;
    } else if (!emailPattern.test(email.trim())) {
      setEmailError("Please enter a valid email address.");
      isValid = false;
    }

    if (!password) {
      setPasswordError("Password is required.");
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      isValid = false;
    }

    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    try {
      setLoading(true);
      const res = await login(email, password, role);
      if (claimToken && res.role !== "admin") {
        try {
          localStorage.removeItem("pending_claim_token");
        } catch {
          // ignore
        }
        window.location.href = `/app/claim/${claimToken}`;
        return;
      }
      if (res.role === "admin") {
        onNavigate("admin");
      } else {
        onNavigate("dashboard");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-[#12372A] flex items-center justify-center text-emerald-400 mx-auto">
            <Recycle className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold font-heading text-[#12372A]">
            {role === "admin" ? "Admin Management Portal" : "Recycler Account Login"}
          </h1>
          <p className="text-xs text-[#5B655F]">
            {role === "admin"
              ? "Access reverse vending machine network telematics & payouts."
              : "Track your bottle deposits, balance, and withdraw instant UPI rewards."}
          </p>
        </div>

        {/* Portal Role Toggle */}
        <div className="flex p-1 bg-[#F6F6F3] rounded-xl border border-[#E5E6E1]">
          <button
            type="button"
            onClick={() => handleRoleToggle("user")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
              role === "user"
                ? "bg-white text-[#12372A] shadow-xs"
                : "text-[#5B655F] hover:text-[#1C2321]"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>User Portal</span>
          </button>

          <button
            type="button"
            onClick={() => handleRoleToggle("admin")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
              role === "admin"
                ? "bg-white text-[#12372A] shadow-xs"
                : "text-[#5B655F] hover:text-[#1C2321]"
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-[#1F5C45]" />
            <span>Admin Portal</span>
          </button>
        </div>

        {/* Login Form Card */}
        <Card className="p-6 border border-[#E5E6E1] shadow-xs">
          <form onSubmit={handleSubmit} className="space-y-4">
            {claimToken && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0 animate-pulse" />
                <div>
                  <span className="font-semibold block text-emerald-900">Pending Deposit Claim Active</span>
                  <span>Sign in to credit your reverse vending reward to your eco-wallet.</span>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-[#FBEAE7] border border-[#B9402B]/30 rounded-xl text-xs text-[#B9402B] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={emailError}
              placeholder="you@example.com"
              leftAddon={<Mail className="w-4 h-4" />}
            />

            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={passwordError}
              placeholder="••••••••"
              leftAddon={<Lock className="w-4 h-4" />}
              rightAddon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="hover:text-[#1C2321] p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 text-[#5B655F] cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-[#E5E6E1] text-[#1F5C45] focus:ring-[#1F5C45]"
                />
                <span>Remember me</span>
              </label>

              <span className="text-[#5B655F] text-[11px] font-mono">
                password123
              </span>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full bg-[#1F5C45] hover:bg-[#12372A] text-white mt-2"
            >
              <span>Sign In to {role === "admin" ? "Admin Console" : "EcoRewind"}</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </form>

          {/* Quick Demo Credentials Assistant */}
          <div className="mt-5 pt-4 border-t border-[#E5E6E1] text-center">
            <span className="text-[11px] text-[#5B655F] block mb-2 font-mono">Quick Demo Sign-In (DB Seeded):</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setRole("user");
                  setEmail("user@ecorewind.com");
                  setPassword("password123");
                }}
                className="flex-1 py-1.5 px-2 text-[11px] font-mono rounded-lg border border-[#E5E6E1] bg-[#F6F6F3] hover:bg-gray-100 text-[#12372A]"
              >
                Fill User Demo
              </button>
              <button
                type="button"
                onClick={() => {
                  setRole("admin");
                  setEmail("admin@ecorewind.com");
                  setPassword("password123");
                }}
                className="flex-1 py-1.5 px-2 text-[11px] font-mono rounded-lg border border-[#E5E6E1] bg-[#F6F6F3] hover:bg-gray-100 text-[#12372A]"
              >
                Fill Admin Demo
              </button>
            </div>
          </div>
        </Card>

        {/* Register CTA for User role */}
        {role === "user" && (
          <p className="text-center text-xs text-[#5B655F]">
            Don't have an account yet?{" "}
            <button
              onClick={() => onNavigate("register")}
              className="font-semibold text-[#1F5C45] hover:underline"
            >
              Register as Recycler
            </button>
          </p>
        )}
      </div>
    </div>
  );
};
