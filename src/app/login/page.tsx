"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { ShieldCheck, Camera, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4">
      <div className="w-full max-w-sm bg-white rounded-card shadow-card border border-black/5 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-lg bg-brand flex items-center justify-center text-white">
            <Camera size={20} />
          </div>
          <div>
            <div className="font-display font-bold text-lg text-ink leading-tight">BATA CCTV</div>
            <div className="text-xs text-ink-faint tracking-wide">COMMAND CENTER</div>
          </div>
        </div>

        {!isSupabaseConfigured && (
          <div className="mb-5 text-xs bg-brand-50 text-brand border border-brand/20 rounded-md p-3">
            Supabase isn&apos;t configured yet (see <code>.env.example</code>). You can still explore the
            portal below in demo mode.
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Work email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand"
              placeholder="you@bata.co.th"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-xs text-brand">{error}</p>}
          <button
            type="submit"
            disabled={loading || !isSupabaseConfigured}
            className="w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-dark disabled:opacity-40 text-white text-sm font-medium rounded-md py-2.5 transition-colors"
          >
            {loading && <Loader2 size={14} className="animate-spin" />} Sign in
          </button>
        </form>

        <button
          onClick={() => router.push("/dashboard")}
          className="mt-3 w-full flex items-center justify-center gap-2 border border-black/10 text-ink-soft text-sm font-medium rounded-md py-2.5 hover:bg-surface-muted transition-colors"
        >
          <ShieldCheck size={14} /> Continue in demo mode
        </button>
      </div>
    </div>
  );
}
