import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Card } from "../components/Card";
import { isValidIndianMobile, isValidUpiId } from "../utils/ids";
import { Recycle, User, Mail, Phone, Lock, Wallet, Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle } from "lucide-react";

interface RegisterPageProps {
  onNavigate: (page: string) => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onNavigate }) => {
  const { register } = useAuth();

  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [upiId, setUpiId] = useState<string>("");

  // Check if a QR claim token is passed via query params or localStorage
  const [claimToken] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("token") || params.get("claim") || localStorage.getItem("pending_claim_token");
    } catch {
      return null;
    }
  });

  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Field validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Full name is required.";
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim()) {
      newErrors.email = "Email address is required.";
    } else if (!emailPattern.test(email.trim())) {
      newErrors.email = "Please enter a valid email address.";
    }

    if (!phone.trim()) {
      newErrors.phone = "10-digit mobile number is required.";
    } else if (!isValidIndianMobile(phone.trim())) {
      newErrors.phone = "Enter a valid 10-digit Indian mobile number (starts with 6-9).";
    }

    if (!password) {
      newErrors.password = "Password is required.";
    } else if (password.length < 8) {
      newErrors.password = "Password must be at least 8 characters.";
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match.";
    }

    if (upiId && !isValidUpiId(upiId)) {
      newErrors.upiId = "Enter a valid UPI ID (e.g. name@okhdfcbank) or leave blank.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;

    try {
      setLoading(true);
      await register({
        name,
        email,
        phone,
        password,
        upi_id: upiId || undefined,
      });
      if (claimToken) {
        try {
          localStorage.removeItem("pending_claim_token");
        } catch {
          // ignore
        }
        window.location.href = `/app/claim/${claimToken}`;
        return;
      }
      onNavigate("dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed.";
      setApiError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-lg space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-[#12372A] flex items-center justify-center text-emerald-400 mx-auto">
            <Recycle className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold font-heading text-[#12372A]">
            Create Recycler Account
          </h1>
          <p className="text-xs text-[#5B655F]">
            Earn direct rupee payouts for every bottle and aluminium can deposited into EcoRewind machines.
          </p>
        </div>

        {/* Registration Card */}
        <Card className="p-6 border border-[#E5E6E1] shadow-xs">
          <form onSubmit={handleSubmit} className="space-y-4">
            {claimToken && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0 animate-pulse" />
                <div>
                  <span className="font-semibold block text-emerald-900">Pending Deposit Claim Active</span>
                  <span>Create your account to credit your reverse vending reward to your new wallet.</span>
                </div>
              </div>
            )}

            {apiError && (
              <div className="p-3 bg-[#FBEAE7] border border-[#B9402B]/30 rounded-xl text-xs text-[#B9402B] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{apiError}</span>
              </div>
            )}

            <Input
              label="Full Name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
              placeholder="e.g. Rahul Sharma"
              leftAddon={<User className="w-4 h-4" />}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
                placeholder="rahul@example.com"
                leftAddon={<Mail className="w-4 h-4" />}
              />

              <Input
                label="10-Digit Mobile"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                error={errors.phone}
                placeholder="9876543210"
                helperText="Links your reverse vending deposits"
                leftAddon={<Phone className="w-4 h-4" />}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
                placeholder="Min 6 characters"
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

              <Input
                label="Confirm Password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={errors.confirmPassword}
                placeholder="Re-type password"
                leftAddon={<Lock className="w-4 h-4" />}
              />
            </div>

            <Input
              label="Payout UPI ID (Optional)"
              type="text"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              error={errors.upiId}
              placeholder="e.g. rahul@okhdfcbank"
              helperText="For instant one-click cash withdrawals"
              leftAddon={<Wallet className="w-4 h-4" />}
            />

            <div className="p-3 bg-[#E5F0EA]/40 rounded-xl border border-[#1F5C45]/20 text-[11px] text-[#12372A] flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-[#1F5C45] shrink-0 mt-0.5" />
              <span>
                By registering, your wallet balance will automatically link to any EcoRewind machine using your mobile number.
              </span>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full bg-[#1F5C45] hover:bg-[#12372A] text-white mt-2"
            >
              <span>Create Account &amp; Start Recycling</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </form>
        </Card>

        <p className="text-center text-xs text-[#5B655F]">
          Already registered?{" "}
          <button
            onClick={() => onNavigate("login")}
            className="font-semibold text-[#1F5C45] hover:underline"
          >
            Sign in to existing account
          </button>
        </p>
      </div>
    </div>
  );
};
