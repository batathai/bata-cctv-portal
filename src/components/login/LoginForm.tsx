"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { Camera, Eye, EyeOff, Loader2, LogIn, Lock, Mail } from "lucide-react";

/** Sign-in form. Authentication logic is unchanged from the previous login page (Supabase password sign-in). */
export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <section className="ls-card" aria-labelledby="login-title">
      <div className="ls-card-head">
        <div className="ls-card-icon" aria-hidden="true">
          <Camera strokeWidth={2.2} />
        </div>
        <div>
          <h1 id="login-title">BATA CCTV</h1>
          <p>COMMAND CENTER</p>
        </div>
      </div>

      {!isSupabaseConfigured && (
        <p className="ls-note" role="status">
          Supabase isn&apos;t configured yet (see <code>.env.example</code>).
        </p>
      )}

      <form onSubmit={handleLogin} className="ls-form">
        <div className="ls-field">
          <label htmlFor="login-email">
            <Mail aria-hidden="true" /> Work email
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@bata.co.th"
          />
        </div>
        <div className="ls-field">
          <label htmlFor="login-password">
            <Lock aria-hidden="true" /> Password
          </label>
          <div className="ls-pass">
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          </div>
        </div>
        {error && (
          <p className="ls-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="ls-submit" disabled={loading || !isSupabaseConfigured}>
          {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogIn aria-hidden="true" />} Sign in
        </button>
      </form>
    </section>
  );
}
