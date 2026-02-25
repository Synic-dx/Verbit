"use client";

import * as React from "react";
import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { VerificationModal } from "@/components/VerificationModal";

export default function SignInPage() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [loading, setLoading] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationPassword, setVerificationPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [verificationLoading, setVerificationLoading] = useState(false);

  const [resendTimer, setResendTimer] = useState(0);
  const [resendDisabled, setResendDisabled] = useState(false);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    } else {
      setResendDisabled(false);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const switchMode = (target: "sign-in" | "sign-up") => {
    setMode(target);
  };

  const closeVerification = () => {
    setShowVerification(false);
    setOtp("");
    setVerificationError("");
  };

  const handleVerify = async () => {
    setVerificationLoading(true);
    setVerificationError("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verificationEmail, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerificationError(data.error ?? "Verification failed.");
        setVerificationLoading(false);
        return;
      }
      toast.success("Email verified! Signing you in...");
      const result = await signIn("credentials", {
        email: verificationEmail,
        password: verificationPassword,
        redirect: false,
      });
      if (result?.error) {
        toast.error("Sign-in failed after verification.");
        setVerificationLoading(false);
        return;
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setVerificationError("Network error. Please try again.");
    }
    setVerificationLoading(false);
  };

  const handleResend = async () => {
    setVerificationLoading(true);
    setVerificationError("");
    try {
      const res = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verificationEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerificationError(data.error ?? "Failed to resend code.");
        if (res.status === 429) {
          // If the server says wait, we can try to parse the seconds or just set a generic timeout.
          // The error string is "Please wait X seconds...". We'll just rely on the error string displaying.
        }
      } else {
        toast.success(data.message || "Verification code resent.");
        setResendTimer(120);
        setResendDisabled(true);
      }
    } catch (err) {
      setVerificationError("Network error. Please try again.");
    }
    setVerificationLoading(false);
  };

  const handleCredentials = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    // client-side email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Please enter a valid email address.");
      setLoading(false);
      return;
    }

    /* ── sign-up ──────────────────────────────────────────────── */
    if (mode === "sign-up") {
      // client-side: passwords must match
      if (password !== confirmPassword) {
        toast.error("Passwords do not match.");
        setLoading(false);
        return;
      }

      if (password.length < 6) {
        toast.error("Password must be at least 6 characters.");
        setLoading(false);
        return;
      }

      // check if account already exists
      try {
        const check = await fetch("/api/auth/check-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const { exists } = await check.json();
        if (exists) {
          toast.error("An account with this email already exists. Please sign in instead.", {
            action: {
              label: "Sign in",
              onClick: () => switchMode("sign-in"),
            },
          });
          setLoading(false);
          return;
        }
      } catch {
        // network error — fall through and let register endpoint handle it
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Unable to register.");
        setLoading(false);
        return;
      }

      setVerificationEmail(email);
      setVerificationPassword(password);
      setShowVerification(true);
      setResendTimer(120); // Initial block for 2 mins upon signup 
      setResendDisabled(true);
      setLoading(false);
      return; // Wait for verification
    }

    /* ── sign-in ──────────────────────────────────────────────── */
    if (mode === "sign-in") {
      // check if account exists before attempting login
      try {
        const check = await fetch("/api/auth/check-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const { exists } = await check.json();
        if (!exists) {
          toast.error("No account found with this email. Please sign up first.", {
            action: {
              label: "Sign up",
              onClick: () => switchMode("sign-up"),
            },
          });
          setLoading(false);
          return;
        }
      } catch {
        // network error — let signIn handle it
      }
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      toast.error("Invalid email or password.");
      setLoading(false);
      return;
    }

    // Successful sign-in — redirect
    window.location.href = "/dashboard";
  };

  return (
    <div className="min-h-screen bg-grid px-6 py-12">
      <VerificationModal
        open={showVerification}
        otp={otp}
        setOtp={setOtp}
        loading={verificationLoading}
        error={verificationError}
        onVerify={handleVerify}
        onResend={handleResend}
        onClose={closeVerification}
        resendDisabled={resendDisabled}
        resendTimer={resendTimer}
      />
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <Logo />
          <Link href="/" className="text-sm text-white/60">
            Back to home
          </Link>
        </header>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <h1 className="text-3xl font-semibold text-white">
              {mode === "sign-in" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-white/60">
              Verbit adapts to your performance and keeps your verbal skills sharp
              across CAT and IPMAT question styles.
            </p>
            <Button
              variant="secondary"
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            >
              Continue with Google
            </Button>
          </div>

          <Card className="p-8">
            <form className="space-y-4" onSubmit={handleCredentials}>
              {mode === "sign-up" ? (
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="Your name" required />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                />
              </div>
              {mode === "sign-up" ? (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={6}
                  />
                </div>
              ) : null}
              <Button type="submit" disabled={loading} className="w-full">
                {loading
                  ? "Processing..."
                  : mode === "sign-in"
                  ? "Sign in"
                  : "Create account"}
              </Button>
              <p className="text-sm text-white/50">
                {mode === "sign-in"
                  ? "Need an account? "
                  : "Already have an account? "}
                <button
                  type="button"
                  className="underline decoration-white/30 underline-offset-2 text-white/70 transition hover:text-white hover:decoration-white/60 active:text-white/50"
                  onClick={() => switchMode(mode === "sign-in" ? "sign-up" : "sign-in")}
                >
                  {mode === "sign-in" ? "Create one" : "Sign in"}
                </button>
              </p>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
