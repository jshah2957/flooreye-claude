import { useState, useMemo, type FormEvent } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, CheckCircle2, Lock, Eye, EyeOff, AlertCircle, Droplets, XCircle } from "lucide-react";

import api from "@/lib/api";

function getStrength(pw: string): { label: string; color: string; width: string } {
  if (pw.length < 6) return { label: "Weak", color: "bg-red-500", width: "w-1/4" };
  if (pw.length < 8) return { label: "Medium", color: "bg-orange-500", width: "w-2/4" };
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /\d/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);
  const score = [hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
  if (pw.length >= 10 && score >= 2) return { label: "Very strong", color: "bg-green-500", width: "w-full" };
  if (score >= 1) return { label: "Strong", color: "bg-yellow-500", width: "w-3/4" };
  return { label: "Medium", color: "bg-orange-500", width: "w-2/4" };
}

interface ValidationRule {
  label: string;
  met: boolean;
}

function getValidationRules(pw: string): ValidationRule[] {
  return [
    { label: "At least 8 characters", met: pw.length >= 8 },
    { label: "One uppercase letter", met: /[A-Z]/.test(pw) },
    { label: "One lowercase letter", met: /[a-z]/.test(pw) },
    { label: "One number", met: /\d/.test(pw) },
  ];
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(3);

  const strength = useMemo(() => getStrength(password), [password]);
  const rules = useMemo(() => getValidationRules(password), [password]);
  const mismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return;
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      setSuccess(true);
      let remaining = 3;
      setCountdown(remaining);
      const interval = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(interval);
          navigate("/login", { replace: true });
        }
      }, 1000);
    } catch {
      setError("Reset link is invalid or expired. Please request a new one.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#F8F7F4] via-white to-[#F0FDFA] px-4 py-8">
        <div className="w-full max-w-md mx-auto">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0D9488]/10">
              <Droplets size={32} className="text-[#0D9488]" />
            </div>
            <h1 className="text-2xl font-bold text-[#1C1917]">FloorEye</h1>
          </div>
          <div className="rounded-xl border border-[#E7E5E0] bg-white p-6 sm:p-8 shadow-lg text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <XCircle size={32} className="text-red-500" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-[#1C1917]">Invalid reset link</h2>
            <p className="mb-5 text-sm text-gray-500">This password reset link is missing or invalid.</p>
            <Link
              to="/forgot-password"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#0D9488] px-6 text-sm font-medium text-white transition-all hover:bg-[#0F766E]"
            >
              Request a new reset link
            </Link>
          </div>
          <p className="mt-6 text-center text-xs text-gray-400">
            FloorEye &middot; Enterprise AI Spill Detection
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#F8F7F4] via-white to-[#F0FDFA] px-4 py-8">
      <div className="w-full max-w-md mx-auto">
        {/* Branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0D9488]/10">
            <Droplets size={32} className="text-[#0D9488]" />
          </div>
          <h1 className="text-2xl font-bold text-[#1C1917]">FloorEye</h1>
          <p className="mt-1 text-sm text-gray-500">
            See Every Drop. Stop Every Slip.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-[#E7E5E0] bg-white p-6 sm:p-8 shadow-lg">
          <Link
            to="/login"
            className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-[#0D9488] hover:underline transition-colors"
          >
            <ArrowLeft size={16} />
            Back to sign in
          </Link>

          {success ? (
            <div className="py-4 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
                <CheckCircle2 size={32} className="text-green-500" />
              </div>
              <h2 className="mb-2 text-xl font-semibold text-[#1C1917]">
                Password reset successfully
              </h2>
              <p className="text-sm text-gray-500">
                Redirecting to sign in in {countdown}s...
              </p>
            </div>
          ) : (
            <>
              <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-[#0D9488]/10">
                <Lock size={24} className="text-[#0D9488]" />
              </div>
              <h2 className="mt-3 mb-2 text-xl font-semibold text-[#1C1917]">
                Reset your password
              </h2>
              <p className="mb-6 text-sm text-gray-500 leading-relaxed">
                Choose a strong new password for your account.
              </p>

              {/* Error */}
              {error && (
                <div
                  role="alert"
                  className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5" aria-label="Reset password form">
                {/* New Password */}
                <div>
                  <label
                    htmlFor="reset-password"
                    className="mb-1.5 block text-sm font-medium text-[#1C1917]"
                  >
                    New password
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Lock size={16} className="text-gray-400" />
                    </div>
                    <input
                      id="reset-password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-lg border border-[#E7E5E0] py-2.5 pl-10 pr-10 text-sm outline-none transition-shadow placeholder:text-gray-400 focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1C1917] transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  {/* Strength meter */}
                  {password && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-gray-500">Password strength</span>
                        <span className="text-xs font-medium text-gray-500">{strength.label}</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-100">
                        <div
                          className={`h-2 rounded-full ${strength.color} ${strength.width} transition-all duration-300`}
                        />
                      </div>
                    </div>
                  )}

                  {/* Validation checklist */}
                  {password && (
                    <ul className="mt-3 space-y-1.5" aria-label="Password requirements">
                      {rules.map((rule) => (
                        <li
                          key={rule.label}
                          className={`flex items-center gap-2 text-xs ${
                            rule.met ? "text-green-600" : "text-gray-400"
                          }`}
                        >
                          {rule.met ? (
                            <CheckCircle2 size={14} className="shrink-0" />
                          ) : (
                            <XCircle size={14} className="shrink-0" />
                          )}
                          {rule.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label
                    htmlFor="reset-confirm"
                    className="mb-1.5 block text-sm font-medium text-[#1C1917]"
                  >
                    Confirm password
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Lock size={16} className="text-gray-400" />
                    </div>
                    <input
                      id="reset-confirm"
                      type={showConfirm ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className={`w-full rounded-lg border py-2.5 pl-10 pr-10 text-sm outline-none transition-shadow placeholder:text-gray-400 focus:ring-2 focus:ring-[#0D9488]/20 ${
                        mismatch
                          ? "border-red-300 focus:border-red-400"
                          : "border-[#E7E5E0] focus:border-[#0D9488]"
                      }`}
                      placeholder="Confirm new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#1C1917] transition-colors"
                      aria-label={showConfirm ? "Hide password" : "Show password"}
                    >
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {mismatch && (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
                      <XCircle size={12} className="shrink-0" />
                      Passwords do not match
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || mismatch || !password}
                  className="flex w-full h-11 items-center justify-center gap-2 rounded-lg bg-[#0D9488] text-sm font-medium text-white transition-all hover:bg-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0D9488]/50 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Resetting...</span>
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          FloorEye &middot; Enterprise AI Spill Detection
        </p>
      </div>
    </div>
  );
}
