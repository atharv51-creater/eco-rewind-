import React, { useState } from "react";
import { ChevronDown, ChevronUp, Terminal, Cpu, Database, ShieldCheck, CheckCircle } from "lucide-react";

export const VivaPage: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const vivaQuestions = [
    {
      q: "1. Why does the server recalculate the tariff instead of trusting the kiosk client?",
      a: "Client-side state can be manipulated through browser devtools, network interceptors, or modified kiosk clients. If the client specified payout amount, an attacker could claim ₹100 for a scrap plastic wrapper. In EcoRewind, the client only sends raw sensor inputs (captured image frame and strain gauge weight in grams). The backend or server ledger evaluates polymer classification, verifies the 100g-500g boundaries, computes base = round_half_up(weight * rate) and the +10% bulk bonus, and writes directly to the immutable SQLite ledger in a single atomic transaction.",
    },
    {
      q: "2. How does the system enforce idempotency on deposits and withdrawals?",
      a: "Every deposit attempt and withdrawal request generates a unique RFC4122 v4 UUID in the 'Idempotency-Key' HTTP header before firing. The server/ledger tracks processed idempotency keys. If a network blip occurs and the client retries with the identical key and payload, the server returns the cached transaction response with duplicate: true without executing a second balance credit or debit. If a conflicting payload attempts to reuse an existing key, the server rejects it with HTTP 409 IDEMPOTENCY_CONFLICT.",
    },
    {
      q: "3. What happens if a user inserts a non-recyclable item or an anomaly (e.g. rocks or water)?",
      a: "EcoRewind uses a dual-verification mechanism. The MobileNetV2 optical classifier requires at least 75% confidence in an accepted recyclable class (plastic_bottle, aluminium_can, plastic_bag). If a rock, aerosol can, or foreign object is inserted, confidence drops or it's tagged other_invalid. Concurrently, the strain gauge load cell checks density: items under 100g are rejected as low-density debris, and items over 500g are flagged as overfilled anomalies. When rejected, payout is ₹0.00, the diverter remains closed, conveyor rollers spin backwards to return the item through the slot, and the ledger audits the rejection reason.",
    },
    {
      q: "4. Why is integer paise used instead of floating-point rupees throughout the system?",
      a: "Binary floating-point arithmetic (IEEE 754) suffers from rounding inaccuracies (e.g. 0.1 + 0.2 = 0.30000000000000004). In a financial ledger distributing micro-rewards per gram (e.g. 2 paise/gram), floating-point errors would quickly accumulate discrepancies, violating balance consistency. All computations, storage, and API contracts represent money strictly as integer paise (100 paise = ₹1.00). Rupee representations are strictly formatted at the presentation layer using en-IN grouping.",
    },
    {
      q: "5. How does cross-tab and cross-device live synchronization work without WebSockets?",
      a: "EcoRewind uses a resilient hybrid approach: BroadcastChannel('ecorewind') enables instantaneous sub-millisecond cross-tab communication on the same domain (notifying open wallet tabs when the terminal kiosk accepts a deposit). In addition, wallet views hook into localStorage storage events, tab visibility change events, and a 5-second polling interval while visible. This ensures instant updates in demo mode while guaranteeing consistency if tabs are backgrounded or reloaded.",
    },
    {
      q: "6. How is CSV formula injection (CSV Injection / CWE-1236) prevented?",
      a: "When exporting transaction history to spreadsheet files, cells beginning with '=', '+', '-', '@', horizontal tab, or carriage return could be interpreted by spreadsheet applications (Excel, LibreOffice) as executable formulas or DDE commands. EcoRewind sanitizes every exported cell by prefixing sensitive leading characters with a single apostrophe (') and wrapping all values in double quotes, ensuring the spreadsheet displays the content strictly as text.",
    },
    {
      q: "7. Describe the two-website architecture (kiosk + user wallet).",
      a: "EcoRewind consists of two separate websites sharing one backend API and one SQLite database. The RVM kiosk (/kiosk) is used on the machine screen; the user is anonymous and no localStorage is used for money. The user wallet app (/app) requires registration/login; all money flows through the server ledger. The kiosk POSTs /api/kiosk/deposit with raw sensor data; the server calculates payout server-side and returns a single-use token valid 5 minutes. The user claims via POST /api/claim/:token, which atomically verifies the token, inserts into the ledger, and marks the session claimed — double-claim is impossible. Balance is always SUM(ledger), never a mutable column. The two sites share tariff config, kiosk API key auth, and eco stats but have completely separate money flows.",
    },
    {
      q: "8. How does the kiosk authenticate with the server?",
      a: "The kiosk authenticates via the 'x-api-key' HTTP header. The key value is bcrypt-hashed and stored in the kiosks database table. When the kiosk sends the header, the server compares the provided key against the stored hash using bcrypt.compare. The system is seeded with one kiosk 'RVM-01' with key 'rvm-key-2024'. This avoids sending secrets in URL query strings or browser localStorage.",
    },
    {
      q: "9. How does the claim flow work end-to-end?",
      a: "The kiosk user confirms an accepted item, and the server creates a deposit session with a random 32-byte token valid 5 minutes, then shows a QR code linking to /app/claim.html?token=.... The phone user opens the claim page, which checks if they're already logged in via httpOnly JWT cookie. If logged in, it calls POST /api/claim/:token. The claim endpoint runs a single database transaction: (a) verify token is pending and not expired, (b) insert a row into the ledger linking user_id + deposit_session_id + amount_paise, (c) mark the deposit session as 'claimed' with claimed_by. If two simultaneous requests claim the same token, the transaction serializes — only the first succeeds, the second gets 'already_claimed'. The kiosk then polls GET /api/kiosk/deposit/:id every 2 seconds; when status becomes 'claimed', it shows 'Credited to 98••••210' with a success animation and resets for the next item.",
    },
    {
      q: "10. Why can't a user claim without registering first?",
      a: "Registration is required because all money is tracked through the ledger, which requires a user_id. The ledger table has a foreign key to users.id, and the balance is computed as SUM(ledger.amount_paise) per user. Without an account, there's no user_id to associate the deposit with, and the system cannot legally or functionally credit money to an anonymous entity.",
    },
  ];

  return (
    <div className="min-h-screen bg-white py-8 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="pb-4 border-b border-[#E5E6E1]">
          <span className="text-xs font-mono font-bold text-[#1F5C45] uppercase tracking-wider">
            Phase 5 Deliverable
          </span>
          <h1 className="text-3xl font-bold font-heading text-[#12372A] mt-1">
            Project Viva & Demonstration Guide (/viva)
          </h1>
          <p className="text-sm text-[#5B655F] mt-1">
            Evaluation script, data architecture diagram, likely examiner questions, and emergency fallback contingency.
          </p>
        </div>

        {/* 3-Minute Examiner Demo Script */}
        <div className="bg-[#F6F6F3] rounded-2xl p-6 border border-[#E5E6E1] space-y-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-[#1F5C45]" />
            <h2 className="text-base font-bold font-heading text-[#12372A]">
              Recommended 3-Minute Live Evaluation Script
            </h2>
          </div>
          <ol className="space-y-3 text-xs text-[#1C2321] list-decimal list-inside leading-relaxed">
            <li>
              <strong>Open Kiosk Mode (/kiosk):</strong> Show the kiosk UI with webcam, scanner box, and item chips. Note that the user is anonymous — no login, no wallet.
            </li>
            <li>
              <strong>Standard Bottle Deposit:</strong> On the kiosk, select a 250g PET Bottle. Point out the camera classification, weight readout (250g), and the "Money to be credited" panel showing ₹5.00. Click confirm. The kiosk POSTs /api/kiosk/deposit server-side, calculates ₹5.00 (250g × 2p/g), generates a single-use token valid 5 minutes, and displays a large QR code for https://&lt;PUBLIC_BASE_URL&gt;/app/claim.html?token=....
            </li>
            <li>
              <strong>Phone Claims the QR:</strong> On a second device (phone), open the QR code. The claim page sees the token in the URL. If the phone user is not logged in, it shows the login/register form. Register with a 10-digit Indian mobile number and password. After login, the claim proceeds: POST /api/claim/:token atomically inserts into the ledger and marks the session claimed. The page shows "+₹5.00 credited" and a "Go to Dashboard" button.
            </li>
            <li>
              <strong>Kiosk Shows Credited:</strong> The kiosk polls GET /api/kiosk/deposit/:id every 2 seconds. When status becomes "claimed", it shows "Credited to 98••••210" (masked phone number) with a success animation (checkmark spin), then automatically resets for the next item.
            </li>
            <li>
              <strong>Dashboard Shows New Balance:</strong> The phone user navigates to /app/dashboard.html. Login-protected page shows balance ₹5.00, lifetime earned ₹5.00, kg recycled 0.250g, bottle count 1, can count 0, bag count 0, progress bar at 5% of ₹100 milestone, and the new transaction in history.
            </li>
          </ol>
        </div>

        {/* System Data Architecture */}
        <div className="bg-white rounded-2xl p-6 border border-[#E5E6E1] space-y-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#1F5C45]" />
            <h2 className="text-base font-bold font-heading text-[#12372A]">
              End-to-End System Data Flow
            </h2>
          </div>
          <div className="p-4 bg-[#0E1F19] text-[#E5F0EA] rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto border border-[#12372A]">
            <pre>{`[Kiosk UI (React)] --(224x224 frame)--> POST /api/scan --> [MobileNetV2 Classifier on Server]
       |                                                                            |
       | (Item Selected/Confirmed)                                             (Label & Confidence)
       v                                                                            |
POST /api/kiosk/deposit ----------------------------+                       |
(x-item-type, weight-grams, confidence)               |                       |
        |                                                             |                       |
        v                                                             v                       |
[Node.js/Express Server]                              |                       |
  |-- 1. Validate item type via evaluate()          |                       |
  |-- 2. Validate weight against config minimums    |                       |
  |-- 3. Calculate payout SERVER-SIDE: base=round_half_up(w*r), bonus=w>=400?+10%:0 |       |
  |-- 4. CREATE deposit_session: token=random32bytes, expires_at=now+5min, status=pending |     |
  |-- 5. RETURN {token, amountPaise, expiresAt} to kiosk                              |     |
        |              |                                                      |                    |
        |              |                                                      |                    |
        v              v                                                      v                    v
[Kiosk UI]                                   [User Wallet App]          [SQLite DB]
  |-- displays QR code with claim URL          |-- claim.html?token=...       |
  |-- polls /api/kiosk/deposit/:id every 2s    |-- if logged in: POST /api/claim/:token   |
  |-- status "claimed" --> "Credited to 98...]"  |-- atomic: verify+insert+mark   |
        |              |              |                                       |
        +--------------+--------------+                                       |
                              |                                              |
                              v                                              v
                      [Kiosk shows "Credited"]        [Dashboard shows ₹5.00 balance]
                        (resets for next item)           (progress bar, transaction history)`}</pre>
          </div>
        </div>

        {/* Likely Viva Questions & Answers */}
        <div className="space-y-3">
          <h2 className="text-base font-bold font-heading text-[#12372A] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#1F5C45]" />
            Likely Viva & Defense Examination Questions
          </h2>
          <div className="space-y-2">
            {vivaQuestions.slice(0, 6).map((item, idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl border border-[#E5E6E1] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full p-4 text-left flex items-center justify-between gap-4 font-semibold text-xs sm:text-sm text-[#12372A] hover:bg-gray-50 transition-colors"
                >
                  <span>{item.q}</span>
                  {openFaq === idx ? (
                    <ChevronUp className="w-4 h-4 text-[#1F5C45] shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#5B655F] shrink-0" />
                  )}
                </button>
                {openFaq === idx && (
                  <div className="px-4 pb-4 pt-1 text-xs text-[#5B655F] leading-relaxed border-t border-[#E5E6E1]/60 bg-[#F6F6F3]/40">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Fallback & Offline Contingency Plan */}
        <div className="bg-[#E5F0EA]/50 rounded-2xl p-6 border border-[#1F5C45]/20 space-y-2 text-xs">
          <h3 className="font-bold text-[#12372A] font-heading flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4 text-[#1F5C45]" />
            Examiner Emergency Fallback Contingency
          </h3>
          <p className="text-[#1C2321] leading-relaxed">
            If the external network or server process goes down during the live evaluation, the application contains an autonomous, self-healing client-side simulated ledger and mock classifier that implements 100% of the mathematical rules, idempotency stores, and cross-tab broadcasts. The app never crashes or presents a blank screen. The kiosk can operate in standalone demo mode with simulated AI output.
          </p>
        </div>
      </div>
    </div>
  );
};