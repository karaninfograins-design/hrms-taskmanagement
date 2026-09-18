"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/services/auth.service";
import { useAuth } from "@/hooks/use-auth";

export function LoginForm() {
  const router = useRouter();
  const { saveSession } = useAuth();
  const [email, setEmail] = useState("superadmin@company.com");
  const [password, setPassword] = useState("password");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

  return <form className="login-card" onSubmit={handleSubmit}>
    <div className="card-heading">
      <p className="eyebrow">WELCOME BACK</p>
      <h2>Sign in to HRMS</h2>
      <p>Use your work email to continue.</p>
    </div>
    <label>
      Email address
      <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
    </label>
    <label>
      Password
      <div className="password-input">
        <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {showPassword ? (
              <path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.7 10.7 0 0 1 12 4c5.5 0 9.3 5.1 10 8-.3 1.2-1.2 3.1-2.8 4.7M6.2 6.2C3.9 7.8 2.5 10.2 2 12c.7 2.9 4.5 8 10 8 1.5 0 2.8-.4 4-1" />
            ) : (
              <><path d="M2 12s3.6-8 10-8 10 8 10 8-3.6 8-10 8S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>
            )}
          </svg>
        </button>
      </div>
    </label>
    {error && <p className="error-message" role="alert">{error}</p>}
    <button className="primary-button" disabled={isSubmitting}>{isSubmitting ? "Signing in..." : "Sign in"}</button>
  </form>;
}
