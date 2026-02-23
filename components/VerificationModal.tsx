import * as React from "react";

export function VerificationModal({ open, onVerify, onResend, loading, otp, setOtp, error }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="rounded-2xl bg-gradient-to-br from-[#1e293b] to-[#0f172a] shadow-2xl p-8 min-w-[340px] max-w-[90vw] border border-blue-400/30">
        <h2 className="text-xl font-semibold text-white mb-4">Verify your email</h2>
        <p className="text-white/80 mb-6">We’ve sent a verification code to your email. Please verify to continue using Verbit.</p>
        <input
          className="w-full mb-4 px-4 py-2 rounded-lg border border-blue-400/30 bg-black/40 text-white text-lg tracking-widest text-center outline-none focus:border-blue-500"
          placeholder="Enter code"
          value={otp}
          onChange={e => setOtp(e.target.value)}
          maxLength={6}
          disabled={loading}
        />
        {error && <div className="text-rose-400 mb-2 text-sm text-center">{error}</div>}
        <div className="flex gap-4 justify-end">
          <button
            className="rounded-lg px-4 py-2 bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
            onClick={onVerify}
            disabled={loading || !otp}
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
          <button
            className="rounded-lg px-4 py-2 bg-white/10 text-blue-300 font-semibold hover:bg-blue-400/20 transition"
            onClick={onResend}
            disabled={loading}
          >
            Resend code
          </button>
        </div>
      </div>
    </div>
  );
}
