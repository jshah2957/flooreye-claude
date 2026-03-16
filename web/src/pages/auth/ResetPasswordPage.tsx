import { useState, useMemo, type FormEvent } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";

import api from "@/lib/api";

function getStrength(pw: string): { label: string; color: string; width: string } {
  if (pw.length < 6) return { label: "Weak", color: "bg-[#DC2626]", width: "w-1/4" };
  if (pw.length < 8) return { label: "Medium", color: "bg-[#D97706]", width: "w-2/4" };
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  const score = [hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
  if (pw.length >= 10 && score >= 2) return { label: "Very strong", color: "bg-[#16A34A]", width: "w-full" };
  if (score >= 1) return { label: "Strong", color: "bg-[#0D9488]", width: "w-3/4" };
  return { label: "Medium", color: "bg-[#D97706]", width: "w-2/4" };
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const strength = useMemo(() => getStrength(password), [password]);
  const mismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return;
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      setSuccess(true);
      setTimeout(() => navigate("/login", { replace: true }), 2000);
    } catch {
      setError("Reset link is invalid or expired. Please request a new one.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F7F4] px-4">
        <div className="w-full max-w-[480px] rounded-lg border border-[#E7E5E0] bg-white p-8 shadow-sm text-center">
          <h2 className="mb-2 text-xl font-semibold text-[#DC2626]">Invalid reset link</h2>
          <p className="mb-4 text-sm text-[#78716C]">This password reset link is missing or invalid.</p>
          <Link to="/forgot-password" className="text-sm text-[#0D9488] hover:underline">
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F7F4] px-4">
      <div className="w-full max-w-[480px]">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-[#0D9488]">FloorEye</h1>
          <p className="mt-1 text-sm text-[#78716C]">See Every Drop. Stop Every Slip.</p>
        </div>

        <div className="rounded-lg border border-[#E7E5E0] bg-white p-8 shadow-sm">
          <Link
            to="/login"
            className="mb-4 inline-flex items-center gap-1 text-sm text-[#0D9488] hover:underline"
          >
            <ArrowLeft size={14} /> Back to login
          </Link>

          {success ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#DCFCE7]">
                <CheckCircle2 size={24} className="text-[#16A34A]" />
              </div>
              <h2 className="mb-2 text-xl font-semibold text-[#1C1917]">Password reset!</h2>
              <p className="text-sm text-[#78716C]">Redirecting to login...</p>
            </div>
          ) : (
            <>
              <h2 className="mb-2 text-xl font-semibold text-[#1C1917]">Reset your password</h2>
              <p className="mb-6 text-sm text-[#78716C]">Enter a new password for your account.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="password" className="mb-1 block text-sm font-medium text-[#1C1917]">
                    New password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                  />
                  {password && (
                    <div className="mt-2">
                      <div className="h-1.5 w-full rounded-full bg-[#E7E5E0]">
                        <div className={`h-1.5 rounded-full ${strength.color} ${strength.width} transition-all`} />
                      </div>
                      <p className="mt-1 text-xs text-[#78716C]">{strength.label}</p>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-[#1C1917]">
                    Confirm password
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                  />
                  {mismatch && (
                    <p className="mt-1 text-xs text-[#DC2626]">Passwords do not match</p>
                  )}
                </div>

                {error && (
                  <div className="rounded-md bg-[#FEE2E2] px-3 py-2 text-sm text-[#DC2626]">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={loading || mismatch || !password}
                  className="flex w-full items-center justify-center rounded-md bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : "Reset Password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
