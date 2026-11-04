"use client";

import { Suspense, useState, useEffect, FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { verifyResetToken, resetPassword } from "@/services/auth.service";
import { CompanyLogo } from "@/components/common/company-logo";
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  const [isLoading, setIsLoading] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [tokenError, setTokenError] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      setTokenError("No password reset token was provided in the URL.");
      return;
    }

    let isMounted = true;
    verifyResetToken(token)
      .then((res) => {
        if (!isMounted) return;
        if (res.valid) {
          setIsValidToken(true);
          setUserEmail(res.email || "");
          setUserName(res.name || "");
        } else {
          setTokenError(res.message || "This password reset link is invalid or has expired.");
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setTokenError(
          err instanceof Error
            ? err.message
            : "The password reset link is invalid or has expired."
        );
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  async function handleResetSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError("");

    if (newPassword.length < 6) {
      setSubmitError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setSubmitError("Passwords do not match. Please verify.");
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      setIsSuccess(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to reset password. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-7 md:p-8 relative">
      {/* Header Icon */}
      <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800/60 flex items-center justify-center text-orange-600 dark:text-orange-400 mb-5 shadow-sm">
        <KeyRound className="w-6 h-6" />
      </div>

      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-600 dark:text-orange-400">
          Account Security
        </p>
        <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
          Create New Password
        </h2>
        {userEmail && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Setting new password for <span className="font-semibold text-slate-800 dark:text-slate-200">{userEmail}</span>
          </p>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
          <Loader2 className="w-7 h-7 animate-spin text-orange-600" />
          <p className="text-sm font-medium">Verifying reset link security...</p>
        </div>
      )}

      {/* Invalid / Expired Token */}
      {!isLoading && !isValidToken && (
        <div className="space-y-5">
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="text-sm text-rose-700 dark:text-rose-300">
              <p className="font-semibold">Reset Link Expired or Invalid</p>
              <p className="mt-1 leading-relaxed">{tokenError}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-colors shadow-sm"
          >
            Return to Sign In
          </button>
        </div>
      )}

      {/* Success State */}
      {!isLoading && isValidToken && isSuccess && (
        <div className="space-y-5">
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                Password Successfully Reset!
              </p>
              <p className="mt-1 text-emerald-700 dark:text-emerald-300/90 leading-relaxed">
                Your new password is now active. You can sign in to HRMS right away.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-md shadow-orange-500/20 transition-all"
          >
            <span>Proceed to Sign In</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Reset Form */}
      {!isLoading && isValidToken && !isSuccess && (
        <form onSubmit={handleResetSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              New Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 z-10">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                autoComplete="new-password"
                style={{ paddingLeft: "42px" }}
                className="w-full !pl-11 pr-10 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              Confirm New Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 z-10">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                required
                minLength={6}
                autoComplete="new-password"
                style={{ paddingLeft: "42px" }}
                className="w-full !pl-11 pr-10 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-sm"
              />
            </div>
          </div>

          {submitError && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-rose-700 dark:text-rose-300 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:scale-[0.98] shadow-md shadow-orange-500/20 disabled:opacity-60 transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <span>Update Password</span>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="mb-6">
        <a href="/" className="inline-block transition-transform hover:scale-105">
          <CompanyLogo />
        </a>
      </div>

      <Suspense
        fallback={
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-8 flex items-center justify-center shadow-lg">
            <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
          </div>
        }
      >
        <ResetPasswordContent />
      </Suspense>

      <p className="mt-8 text-xs text-slate-400 dark:text-slate-600">
        &copy; {new Date().getFullYear()} Infograins &bull; Built for focused teams
      </p>
    </main>
  );
}

