"use client";

import { FormEvent, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login, forgotPassword } from "@/services/auth.service";
import { useAuth } from "@/hooks/use-auth";
import {
  KeyRound,
  Mail,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Send,
} from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const { session, isLoading, saveSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Auto-redirect if user already has an active session (e.g. reopened closed tab)
  useEffect(() => {
    if (!isLoading && session?.token) {
      router.replace("/dashboard");
    }
  }, [session, isLoading, router]);

  // Forgot password modal state
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [forgotEmailInput, setForgotEmailInput] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [isForgotSubmitting, setIsForgotSubmitting] = useState(false);

  // Handle ESC key to close modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isForgotOpen) {
        setIsForgotOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isForgotOpen]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const session = await login({ email, password });
      saveSession(session);
      router.replace("/dashboard");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to sign in");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgotSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setForgotError("");
    setForgotSuccess("");

    if (!forgotEmailInput.trim()) {
      setForgotError("Please enter your registered work email.");
      return;
    }

    setIsForgotSubmitting(true);
    try {
      const res = await forgotPassword(forgotEmailInput.trim());
      setForgotSuccess(res.message || "Password reset link sent! Please check your Thunderbird / email inbox.");
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : "Failed to send reset link. Please try again.");
    } finally {
      setIsForgotSubmitting(false);
    }
  }

  function openForgotModal() {
    setForgotEmailInput(email.trim());
    setForgotError("");
    setForgotSuccess("");
    setIsForgotOpen(true);
  }

  if (session?.token) {
    return (
      <div className="login-card flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin mb-3" />
        <p className="text-sm font-bold text-slate-800">Resuming session...</p>
      </div>
    );
  }

  return (
    <>
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="card-heading">
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Sign in to HRMS</h2>
          <p>Use your work email to continue.</p>
        </div>

        <label>
          Email address
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="e.g. employee@infograins.com"
            required
          />
        </label>

        <label>
          <div className="flex items-center justify-between">
            <span>Password</span>
            <button
              type="button"
              onClick={openForgotModal}
              className="text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors hover:underline focus:outline-none"
            >
              Forgot password?
            </button>
          </div>
          <div className="password-input">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {showPassword ? (
                  <path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.7 10.7 0 0 1 12 4c5.5 0 9.3 5.1 10 8-.3 1.2-1.2 3.1-2.8 4.7M6.2 6.2C3.9 7.8 2.5 10.2 2 12c.7 2.9 4.5 8 10 8 1.5 0 2.8-.4 4-1" />
                ) : (
                  <>
                    <path d="M2 12s3.6-8 10-8 10 8 10 8-3.6 8-10 8S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </label>

        {error && <p className="error-message" role="alert">{error}</p>}

        <button className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {/* Modern Forgot Password Modal */}
      {isForgotOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-modal-title"
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 md:p-7 relative overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setIsForgotOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header Icon */}
            <div className="w-12 h-12 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800/60 flex items-center justify-center text-orange-600 dark:text-orange-400 mb-4 shadow-sm">
              <KeyRound className="w-6 h-6" />
            </div>

            <h3 id="forgot-modal-title" className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Reset Your Password
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Enter your work email address below. A secure password reset link will be sent to your email inbox.
            </p>

            {/* Success state */}
            {forgotSuccess ? (
              <div className="mt-6 space-y-5">
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                      Reset Link Dispatched
                    </p>
                    <p className="mt-1 text-emerald-700 dark:text-emerald-300/90 leading-relaxed">
                      {forgotSuccess}
                    </p>
                    <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                      Link is valid for <strong>1 hour</strong>. If it doesn&apos;t appear shortly, please check your spam or junk folder in Thunderbird.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotOpen(false);
                      setForgotSuccess("");
                    }}
                    className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-colors shadow-sm"
                  >
                    Back to Sign In
                  </button>
                </div>
              </div>
            ) : (
              /* Forgot password input form */
              <form onSubmit={handleForgotSubmit} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="forgot-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                    Work Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 z-10">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      id="forgot-email"
                      type="email"
                      value={forgotEmailInput}
                      onChange={(e) => setForgotEmailInput(e.target.value)}
                      placeholder="e.g. employee@infograins.com"
                      autoFocus
                      required
                      style={{ paddingLeft: "42px" }}
                      className="w-full !pl-11 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-sm"
                    />
                  </div>
                </div>

                {forgotError && (
                  <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 text-rose-700 dark:text-rose-300 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                    <span>{forgotError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsForgotOpen(false)}
                    disabled={isForgotSubmitting}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isForgotSubmitting}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:scale-[0.98] shadow-md shadow-orange-500/20 disabled:opacity-60 transition-all"
                  >
                    {isForgotSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sending Link...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Send Reset Link</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
