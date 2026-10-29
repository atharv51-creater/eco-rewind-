import React from "react";
import { useRates } from "../hooks/useRates";
import { MachineIllustration } from "../machine/MachineIllustration";
import { ArrowRight, Wallet, CheckCircle, Scale, ShieldCheck } from "lucide-react";
import { Button } from "../components/Button";
import { formatPaise } from "../utils/money";

interface LandingPageProps {
  onNavigate: (page: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const { rates } = useRates();

  const bottleRate = rates.rates_paise_per_gram["plastic_bottle"] || 2;
  const canRate = rates.rates_paise_per_gram["aluminium_can"] || 4;
  const bagRate = rates.rates_paise_per_gram["plastic_bag"] || 1;

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 border-b border-[#E5E6E1]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left 7 Columns: Pitch & Rates */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E5F0EA] text-[#12372A] text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#1F5C45]" />
                Reverse Vending Machine Network • RVM-01
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold font-heading text-[#12372A] tracking-tight leading-[1.08]">
                Drop a bottle. <br />
                <span className="text-[#1F5C45]">Get paid instantly.</span>
              </h1>

              <p className="text-lg text-[#5B655F] leading-relaxed max-w-xl">
                EcoRewind pays <strong className="text-[#1C2321]">{bottleRate} paise a gram</strong> for plastic bottles,{" "}
                <strong className="text-[#1C2321]">{canRate} paise a gram</strong> for aluminium cans, and{" "}
                <strong className="text-[#1C2321]">{bagRate} paise a gram</strong> for clean plastic film bags. Instant UPI withdrawals to any bank.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  size="lg"
                  variant="primary"
                  onClick={() => onNavigate("machine")}
                  className="gap-2 shadow-sm"
                >
                  <span>Use the machine</span>
                  <ArrowRight className="w-5 h-5" />
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => onNavigate("register")}
                  className="gap-2"
                >
                  <Wallet className="w-5 h-5 text-[#1F5C45]" />
                  <span>Register Account</span>
                </Button>

                <button
                  onClick={() => onNavigate("login")}
                  className="px-4 py-3 text-sm font-semibold text-[#1F5C45] hover:underline"
                >
                  Sign In →
                </button>
              </div>

              {/* Quick Trust Highlights */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#E5E6E1]/80 max-w-lg">
                <div>
                  <p className="text-2xl font-bold font-heading text-[#12372A]">{formatPaise(500)}</p>
                  <p className="text-xs text-[#5B655F]">Avg. 250g PET bottle</p>
                </div>
                <div>
                  <p className="text-2xl font-bold font-heading text-[#12372A]">{formatPaise(1980)}</p>
                  <p className="text-xs text-[#5B655F]">450g can (+10% bulk)</p>
                </div>
                <div>
                  <p className="text-2xl font-bold font-heading text-[#12372A]">0%</p>
                  <p className="text-xs text-[#5B655F]">Withdrawal fee</p>
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Interactive Animated SVG Machine Simulation */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="w-full max-w-[460px]">
                <MachineIllustration variant="demo" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works (3 Steps with custom SVG illustrations) */}
      <section className="py-16 bg-[#F6F6F3] border-b border-[#E5E6E1]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold font-heading text-[#12372A]">
              How the reverse vending machine works
            </h2>
            <p className="text-sm text-[#5B655F] mt-2">
              Three transparent steps from insertion to money in your pocket.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="bg-white rounded-2xl p-6 border border-[#E5E6E1] flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#E5F0EA] flex items-center justify-center mb-5 text-[#1F5C45]">
                <svg viewBox="0 0 48 48" className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="18" y="6" width="12" height="6" rx="2" />
                  <path d="M 14 12 L 34 12 L 38 20 L 38 42 L 10 42 L 10 20 Z" />
                  <circle cx="24" cy="28" r="4" strokeDasharray="2 2" />
                </svg>
              </div>
              <span className="text-xs font-mono font-bold text-[#1F5C45] uppercase tracking-wider mb-1">
                Step 01
              </span>
              <h3 className="text-lg font-bold font-heading text-[#12372A] mb-2">
                1. Insert Container
              </h3>
              <p className="text-xs text-[#5B655F] leading-relaxed">
                Link your phone number on the kiosk screen and insert your empty plastic bottle, aluminium can, or plastic film bag into the entry slot.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-2xl p-6 border border-[#E5E6E1] flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#E5F0EA] flex items-center justify-center mb-5 text-[#1F5C45]">
                <svg viewBox="0 0 48 48" className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="24" cy="24" r="18" />
                  <line x1="12" y1="24" x2="36" y2="24" stroke="currentColor" strokeDasharray="3 3" />
                  <path d="M 18 16 L 30 16 M 18 32 L 30 32" />
                </svg>
              </div>
              <span className="text-xs font-mono font-bold text-[#1F5C45] uppercase tracking-wider mb-1">
                Step 02
              </span>
              <h3 className="text-lg font-bold font-heading text-[#12372A] mb-2">
                2. AI Vision &amp; Load Cell
              </h3>
              <p className="text-xs text-[#5B655F] leading-relaxed">
                The optical camera runs on-device inference to verify container polymer type, while the precision strain gauge verifies weight density.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-2xl p-6 border border-[#E5E6E1] flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#E5F0EA] flex items-center justify-center mb-5 text-[#1F5C45]">
                <svg viewBox="0 0 48 48" className="w-9 h-9" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="24" cy="24" r="16" />
                  <path d="M 20 18 L 28 18 M 20 23 L 26 23 M 20 28 L 28 34 M 20 28 L 24 28" />
                </svg>
              </div>
              <span className="text-xs font-mono font-bold text-[#1F5C45] uppercase tracking-wider mb-1">
                Step 03
              </span>
              <h3 className="text-lg font-bold font-heading text-[#12372A] mb-2">
                3. Instant Payout
              </h3>
              <p className="text-xs text-[#5B655F] leading-relaxed">
                The item is sorted into internal bins. Payout is instantly credited to your wallet in paise and can be withdrawn directly to your UPI ID.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Official Tariff Rates & Quality Checks */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            {/* Rates Table (7 Cols) */}
            <div className="md:col-span-7 bg-white rounded-2xl border border-[#E5E6E1] overflow-hidden">
              <div className="p-5 border-b border-[#E5E6E1] bg-[#F6F6F3]">
                <h3 className="text-base font-bold font-heading text-[#12372A]">
                  Active Tariff Schedule (from /rates)
                </h3>
                <p className="text-xs text-[#5B655F]">
                  Current deposit rates per gram and bulk incentive criteria.
                </p>
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E5E6E1] text-[#5B655F] font-mono">
                    <th className="py-3 px-4 font-semibold">Accepted Category</th>
                    <th className="py-3 px-4 font-semibold">Rate / Gram</th>
                    <th className="py-3 px-4 font-semibold">Typical 250g Item</th>
                    <th className="py-3 px-4 font-semibold">450g (+10% Bonus)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E6E1]/60 font-medium">
                  <tr>
                    <td className="py-3.5 px-4 text-[#12372A]">
                      <span className="font-semibold">Plastic Bottle (PET)</span>
                      <span className="block text-[11px] text-[#5B655F]">Water &amp; soda containers</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#1F5C45]">{bottleRate} paise/g</td>
                    <td className="py-3.5 px-4 font-mono">{formatPaise(250 * bottleRate)}</td>
                    <td className="py-3.5 px-4 font-mono text-[#E09B2D] font-bold">
                      {formatPaise(Math.round(450 * bottleRate * 1.1))}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3.5 px-4 text-[#12372A]">
                      <span className="font-semibold">Aluminium Can</span>
                      <span className="block text-[11px] text-[#5B655F]">Beverage &amp; soda cans</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#1F5C45]">{canRate} paise/g</td>
                    <td className="py-3.5 px-4 font-mono">{formatPaise(250 * canRate)}</td>
                    <td className="py-3.5 px-4 font-mono text-[#E09B2D] font-bold">
                      {formatPaise(Math.round(450 * canRate * 1.1))}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3.5 px-4 text-[#12372A]">
                      <span className="font-semibold">Plastic Bag</span>
                      <span className="block text-[11px] text-[#5B655F]">Clean grocery &amp; film bags</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#1F5C45]">{bagRate} paise/g</td>
                    <td className="py-3.5 px-4 font-mono">{formatPaise(250 * bagRate)}</td>
                    <td className="py-3.5 px-4 font-mono text-[#E09B2D] font-bold">
                      {formatPaise(Math.round(450 * bagRate * 1.1))}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="p-3 bg-[#E5F0EA]/40 border-t border-[#E5E6E1] text-[11px] text-[#12372A] font-mono flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-[#1F5C45]" />
                <span>Bulk reward: Deposits ≥ 400 g automatically receive an extra +10% cash bonus.</span>
              </div>
            </div>

            {/* Why Dual Verification Card (5 Cols) */}
            <div className="md:col-span-5 bg-[#F6F6F3] rounded-2xl p-6 border border-[#E5E6E1] space-y-4">
              <div className="flex items-center gap-2.5 text-[#12372A]">
                <Scale className="w-5 h-5 text-[#1F5C45]" />
                <h4 className="text-base font-bold font-heading">
                  Why verify both visual class and weight?
                </h4>
              </div>
              <p className="text-xs text-[#5B655F] leading-relaxed">
                Reverse vending machines face fraud attempts, such as inserting water-filled bottles to game weight, or inserting paper cutouts or rocks.
              </p>
              <div className="space-y-2 text-xs text-[#1C2321]">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#1F5C45] shrink-0 mt-0.5" />
                  <span>
                    <strong>Optical classifier:</strong> Confirms polymer profile (PET, Aluminium, Film) with at least 75% confidence.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#1F5C45] shrink-0 mt-0.5" />
                  <span>
                    <strong>Load cell threshold:</strong> Items under 100g or over 500g are blocked to avoid light debris or overfilled anomalies.
                  </span>
                </div>
              </div>
              <div className="pt-2">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => onNavigate("machine")}
                  className="w-full bg-[#1F5C45] text-white"
                >
                  Try live machine kiosk
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-14 bg-[#12372A] text-white text-center">
        <div className="max-w-3xl mx-auto px-4 space-y-4">
          <h2 className="text-2xl sm:text-3xl font-bold font-heading">
            Ready to turn plastic waste into instant UPI cash?
          </h2>
          <p className="text-xs sm:text-sm text-emerald-200/80 max-w-xl mx-auto">
            No registration fees, no minimum deposit periods. Sign up in 30 seconds and receive instant credits every time you recycle.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button
              size="lg"
              variant="amber"
              onClick={() => onNavigate("register")}
              className="text-[#12372A] bg-[#E09B2D] hover:bg-[#c9861e] font-semibold"
            >
              <span>Create Free Account</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => onNavigate("machine")}
              className="bg-transparent hover:bg-white/10 text-white border-white/20"
            >
              <span>Launch RVM Kiosk</span>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};
