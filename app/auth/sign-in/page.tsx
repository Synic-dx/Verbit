"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";

export default function SignInPage() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleCredentials = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "");

    if (mode === "sign-up") {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      if (!res.ok) {
        const data = await res.json();
        setMessage(data.error ?? "Unable to register.");
        setLoading(false);
        return;
      }
    }

    await signIn("credentials", {
      email,
      password,
      callbackUrl: "/dashboard",
    });

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-grid px-6 py-12">
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
                <Input id="password" name="password" type="password" required />
              </div>
              {message ? (
                <p className="text-sm text-rose-300">{message}</p>
              ) : null}
              <Button type="submit" disabled={loading} className="w-full">
                {loading
                  ? "Processing..."
                  : mode === "sign-in"
                  ? "Sign in"
                  : "Create account"}
              </Button>
              <button
                type="button"
                className="text-sm text-white/60"
                onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
              >
                {mode === "sign-in"
                  ? "Need an account? Create one"
                  : "Already have an account? Sign in"}
              </button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
