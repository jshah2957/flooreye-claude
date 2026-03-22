import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Mail, AlertCircle, CheckCircle2, Droplets } from "lucide-react";

import api from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch {
      setError("Unable to send reset link. Please try again.");
    } finally {
      setLoading(false);
    }
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

          {sent ? (
            <div className="py-4 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
                <CheckCircle2 size={32} className="text-green-500" />
              </div>
              <h2 className="mb-2 text-xl font-semibold text-[#1C1917]">
                Check your email
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                We sent a password reset link to{" "}
                <strong className="text-[#1C1917]">{email}</strong>.
                <br />
                Click the link in the email to reset your password.
              </p>
              <div className="mt-6">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0D9488] hover:underline"
                >
                  <ArrowLeft size={14} />
                  Return to sign in
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-[#0D9488]/10">
                <Mail size={24} className="text-[#0D9488]" />
              </div>
              <h2 className="mt-3 mb-2 text-xl font-semibold text-[#1C1917]">
                Forgot your password?
              </h2>
              <p className="mb-6 text-sm text-gray-500 leading-relaxed">
                No worries. Enter your email address and we'll send you a link to reset your password.
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

              <form onSubmit={handleSubmit} className="space-y-5" aria-label="Forgot password form">
                <div>
                  <label
                    htmlFor="forgot-email"
                    className="mb-1.5 block text-sm font-medium text-[#1C1917]"
                  >
                    Email address
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Mail size={16} className="text-gray-400" />
                    </div>
                    <input
                      id="forgot-email"
                      type="email"
                      autoFocus
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg border border-[#E7E5E0] py-2.5 pl-10 pr-3 text-sm outline-none transition-shadow placeholder:text-gray-400 focus:border-[#0D9488] focus:ring-2 focus:ring-[#0D9488]/20"
                      placeholder="you@company.com"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full h-11 items-center justify-center gap-2 rounded-lg bg-[#0D9488] text-sm font-medium text-white transition-all hover:bg-[#0F766E] focus:outline-none focus:ring-2 focus:ring-[#0D9488]/50 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          FloorEye v2.0 &middot; Enterprise Spill Detection
        </p>
      </div>
    </div>
  );
}
