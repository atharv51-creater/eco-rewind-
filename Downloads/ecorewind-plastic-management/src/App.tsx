import React, { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { WalletProvider, useWalletId } from "./context/WalletIdContext";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { UserDashboardPage } from "./pages/UserDashboardPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { MachinePage } from "./pages/MachinePage";
import { WalletPage } from "./pages/WalletPage";
import { LivePresentationPage } from "./pages/LivePresentationPage";
import { TestsPage } from "./pages/TestsPage";
import { VivaPage } from "./pages/VivaPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { maskWalletId } from "./utils/ids";
import { Recycle, User, Shield, LogOut } from "lucide-react";

type PageRoute =
  | "home"
  | "login"
  | "admin-login"
  | "register"
  | "dashboard"
  | "admin"
  | "machine"
  | "wallet"
  | "live"
  | "tests"
  | "viva"
  | "404";

function AppContent() {
  const { user, role, isAuthenticated, isAdmin, logout } = useAuth();
  const { userId, setUserId } = useWalletId();

  // If user logs in, keep walletId in sync with their mobile number
  useEffect(() => {
    if (user?.phone) {
      setUserId(user.phone);
    }
  }, [user?.phone, setUserId]);

  const [currentPage, setCurrentPage] = useState<PageRoute>(() => {
    const path = window.location.pathname.replace(/^\//, "");
    if (path.startsWith("claim/")) {
      window.location.href = `/app/${path}`;
      return "home";
    }
    if (!path || path === "/") return "home";
    if (path === "login") return "login";
    if (path === "admin-login" || path === "admin/login") return "admin-login";
    if (path === "register") return "register";
    if (path === "dashboard") return "dashboard";
    if (path === "admin" || path === "admin/dashboard") return "admin";
    if (path === "machine") return "machine";
    if (path === "wallet") return "wallet";
    if (path === "live") return "live";
    if (path === "tests") return "tests";
    if (path === "viva") return "viva";
    return "404";
  });

  const navigateTo = (page: string) => {
    let target = (page.replace(/^\//, "") || "home") as PageRoute;
    if (target === ("admin/login" as any)) target = "admin-login";
    if (target === ("admin/dashboard" as any)) target = "admin";

    // Route Protection Checks
    if (target === "admin" && (!isAuthenticated || !isAdmin)) {
      target = "admin-login";
    } else if (target === "dashboard" && !isAuthenticated) {
      target = "login";
    }

    setCurrentPage(target);
    const urlPath = target === "home" ? "/" : `/${target}`;
    window.history.pushState(null, "", urlPath);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Sync browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.replace(/^\//, "");
      if (!path || path === "/") setCurrentPage("home");
      else if (
        [
          "login",
          "admin-login",
          "register",
          "dashboard",
          "admin",
          "machine",
          "wallet",
          "live",
          "tests",
          "viva",
        ].includes(path)
      ) {
        setCurrentPage(path as PageRoute);
      } else {
        setCurrentPage("404");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Global redirect if unauthenticated user attempts to view protected routes
  useEffect(() => {
    if (currentPage === "admin" && (!isAuthenticated || !isAdmin)) {
      navigateTo("admin-login");
    } else if (currentPage === "dashboard" && !isAuthenticated) {
      navigateTo("login");
    }
  }, [currentPage, isAuthenticated, isAdmin]);

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#1C2321]">
      {/* Top Header / Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5E6E1]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <button
            onClick={() => navigateTo("home")}
            className="flex items-center gap-2.5 text-left group focus:outline-none"
          >
            <div className="w-9 h-9 rounded-xl bg-[#12372A] flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
              <Recycle className="w-5 h-5" />
            </div>
            <div>
              <span className="font-heading font-bold text-lg text-[#12372A] tracking-tight block leading-tight">
                EcoRewind
              </span>
              <span className="text-[10px] font-mono text-[#5B655F] block leading-none">
                Reverse Vending Platform
              </span>
            </div>
          </button>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {[
              { id: "home", label: "Home" },
              { id: "machine", label: "RVM Kiosk" },
              { id: "wallet", label: "Wallet" },
              { id: "live", label: "Live Sync" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  currentPage === item.id
                    ? "bg-[#E5F0EA] text-[#12372A] font-semibold"
                    : "text-[#5B655F] hover:text-[#1C2321] hover:bg-[#F6F6F3]"
                }`}
              >
                {item.label}
              </button>
            ))}

            {/* Role-specific tab */}
            {isAuthenticated && isAdmin && (
              <button
                onClick={() => navigateTo("admin")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
                  currentPage === "admin"
                    ? "bg-[#12372A] text-white"
                    : "text-[#1F5C45] hover:bg-[#E5F0EA]"
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Admin Console</span>
              </button>
            )}

            {isAuthenticated && !isAdmin && (
              <button
                onClick={() => navigateTo("dashboard")}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all ${
                  currentPage === "dashboard"
                    ? "bg-[#1F5C45] text-white"
                    : "text-[#1F5C45] hover:bg-[#E5F0EA]"
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </button>
            )}
          </nav>

          {/* User Auth & System Status Actions */}
          <div className="flex items-center gap-3">

            {/* Auth Actions / Profile Pill */}
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigateTo(isAdmin ? "admin" : "dashboard")}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E5E6E1] hover:border-[#1F5C45]/50 bg-white transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-medium text-[#12372A] max-w-[120px] truncate">
                    {user?.name || (isAdmin ? "Admin" : maskWalletId(userId))}
                  </span>
                </button>

                <button
                  onClick={() => {
                    logout();
                    navigateTo("home");
                  }}
                  title="Sign out"
                  className="p-1.5 rounded-xl border border-[#E5E6E1] text-[#5B655F] hover:text-[#B9402B] hover:bg-[#F6F6F3]"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigateTo("login")}
                  className="px-3 py-1.5 text-xs font-medium text-[#12372A] hover:text-[#1F5C45] transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => navigateTo("register")}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-[#1F5C45] hover:bg-[#12372A] text-white transition-all shadow-xs"
                >
                  Register
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Navigation Row */}
        <div className="lg:hidden flex items-center justify-around border-t border-[#E5E6E1] py-2 px-2 bg-[#F6F6F3] overflow-x-auto">
          {[
            { id: "home", label: "Home" },
            { id: "machine", label: "Kiosk" },
            { id: "wallet", label: "Wallet" },
            ...(isAuthenticated && isAdmin ? [{ id: "admin", label: "Admin" }] : []),
            ...(isAuthenticated && !isAdmin ? [{ id: "dashboard", label: "Dashboard" }] : []),
            ...(!isAuthenticated ? [{ id: "login", label: "Sign In" }] : []),
            { id: "live", label: "Live" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => navigateTo(item.id)}
              className={`px-2.5 py-1 text-xs rounded-lg whitespace-nowrap ${
                currentPage === item.id
                  ? "bg-[#1F5C45] text-white font-medium"
                  : "text-[#5B655F]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Routed Page Content */}
      <main className="flex-1">
        {currentPage === "home" && <LandingPage onNavigate={navigateTo} />}
        {currentPage === "login" && <LoginPage initialRole="user" onNavigate={navigateTo} />}
        {currentPage === "admin-login" && <LoginPage initialRole="admin" onNavigate={navigateTo} />}
        {currentPage === "register" && <RegisterPage onNavigate={navigateTo} />}
        {currentPage === "dashboard" && (
          <UserDashboardPage
            onNavigateMachine={() => navigateTo("machine")}
            onNavigateHome={() => navigateTo("home")}
          />
        )}
        {currentPage === "admin" && (
          <AdminDashboardPage onNavigateHome={() => navigateTo("home")} />
        )}
        {currentPage === "machine" && (
          <MachinePage onNavigateWallet={() => navigateTo(isAuthenticated ? "dashboard" : "wallet")} />
        )}
        {currentPage === "wallet" && <WalletPage />}
        {currentPage === "live" && <LivePresentationPage />}
        {currentPage === "tests" && <TestsPage />}
        {currentPage === "viva" && <VivaPage />}
        {currentPage === "404" && <NotFoundPage onGoHome={() => navigateTo("home")} />}
      </main>

      {/* Global Footer */}
      <footer className="bg-[#F6F6F3] border-t border-[#E5E6E1] py-8 px-4 text-xs text-[#5B655F]">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-heading font-bold text-[#12372A]">EcoRewind</span>
            <span>• Reverse Vending Machine (RVM) Platform &amp; Eco-Wallet</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 font-mono text-[11px]">
            <button onClick={() => navigateTo("home")} className="hover:underline">Home</button>
            <button onClick={() => navigateTo("machine")} className="hover:underline">Kiosk</button>
            <button onClick={() => navigateTo("dashboard")} className="hover:underline">Dashboard</button>
            <button onClick={() => navigateTo("admin")} className="hover:underline">Admin</button>
            <button onClick={() => navigateTo("live")} className="hover:underline">Live Sync</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WalletProvider>
        <AppContent />
      </WalletProvider>
    </AuthProvider>
  );
}
