import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Mail } from "lucide-react";

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
    <div className="flex min-h-screen items-center justify-center bg-[#F8F7F4] px-4">
      <div className="w-full max-w-[480px]">
        {/* Branding */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-[#0D9488]">FloorEye</h1>
          <p className="mt-1 text-sm text-[#78716C]">
            See Every Drop. Stop Every Slip.
          </p>
        </div>

        <div className="rounded-lg border border-[#E7E5E0] bg-white p-8 shadow-sm">
          <Link
            to="/login"
            className="mb-4 inline-flex items-center gap-1 text-sm text-[#0D9488] hover:underline"
          >
            <ArrowLeft size={14} /> Back to login
          </Link>

          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#DCFCE7]">
                <Mail size={24} className="text-[#16A34A]" />
              </div>
              <h2 className="mb-2 text-xl font-semibold text-[#1C1917]">
                Check your email
              </h2>
              <p className="text-sm text-[#78716C]">
                We sent a password reset link to <strong>{email}</strong>.
                Click the link in the email to reset your password.
              </p>
            </div>
          ) : (
            <>
              <h2 className="mb-2 text-xl font-semibold text-[#1C1917]">
                Forgot your password?
              </h2>
              <p className="mb-6 text-sm text-[#78716C]">
                Enter your email and we'll send you a reset link.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1 block text-sm font-medium text-[#1C1917]"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoFocus
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-[#E7E5E0] px-3 py-2 text-sm outline-none focus:border-[#0D9488] focus:ring-1 focus:ring-[#0D9488]"
                    placeholder="you@company.com"
                  />
                </div>

                {error && (
                  <div className="rounded-md bg-[#FEE2E2] px-3 py-2 text-sm text-[#DC2626]">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center rounded-md bg-[#0D9488] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0F766E] disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
