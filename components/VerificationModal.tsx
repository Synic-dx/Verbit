import { X } from "lucide-react";

interface VerificationModalProps {
  open: boolean;
  onVerify: () => void;
  onResend: () => void;
  onClose?: () => void;
  loading: boolean;
  otp: string;
  setOtp: (value: string) => void;
  error?: string;
  resendDisabled?: boolean;
  resendTimer?: number;
}

export function VerificationModal({ open, onVerify, onResend, onClose, loading, otp, setOtp, error, resendDisabled, resendTimer }: VerificationModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="relative rounded-2xl bg-[#0a0a0a] shadow-2xl p-8 min-w-[340px] max-w-[90vw] border border-cyan-500/20">
        {onClose && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-white/40 hover:text-cyan-400 transition"
          >
            <X size={20} />
          </button>
        )}
        <h2 className="text-2xl font-semibold text-white mb-4">Verification</h2>
        <p className="text-white/60 text-sm mb-6 leading-relaxed">
          We’ve sent a code to your email. Please enter it below to verify your account and continue.
        </p>
        <input
          className="w-full mb-4 px-4 py-3 rounded-lg border border-cyan-500/30 bg-black text-white text-xl tracking-[0.5em] text-center outline-none focus:border-cyan-400 focus:bg-[#111] transition-all"
          placeholder="------"
          value={otp}
          onChange={e => setOtp(e.target.value)}
          maxLength={6}
          disabled={loading}
        />
        {error && <div className="text-rose-400 mb-4 text-sm font-medium text-center bg-rose-500/10 py-2 rounded">{error}</div>}
        <div className="flex gap-3 justify-end mt-6">
          <button
            className="rounded-lg px-5 py-2.5 bg-white/5 text-cyan-400 text-sm font-semibold hover:bg-cyan-900/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onResend}
            disabled={loading || resendDisabled}
          >
            {resendDisabled && resendTimer && resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend OTP"}
          </button>
          <button
            className="rounded-lg px-6 py-2.5 bg-cyan-600/90 text-white text-sm font-semibold hover:bg-cyan-500 transition shadow-[0_0_15px_rgba(8,145,178,0.3)] hover:shadow-[0_0_20px_rgba(8,145,178,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onVerify}
            disabled={loading || !otp}
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
        </div>
      </div>
    </div>
  );
}
