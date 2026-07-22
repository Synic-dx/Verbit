"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

declare global {
  interface Window { Razorpay: any; }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const PLANS = [
  {
    id: "pro" as const,
    name: "Pro",
    price: 249,
    original: 349,
    features: [
      { label: "Parajumbles", detail: "20 questions/day" },
      { label: "Reading Comprehension Sets", detail: "5 sets/day" },
      { label: "Conversation Sets", detail: "5 sets/day" },
      { label: "Free topics", detail: "30 questions/day each" },
      { label: "Full analytics history", detail: "All-time performance charts" },
    ],
  },
  {
    id: "cracker" as const,
    name: "Cracker",
    price: 449,
    original: 649,
    badge: "Best for serious prep",
    features: [
      { label: "Parajumbles", detail: "30 questions/day" },
      { label: "Reading Comprehension Sets", detail: "8 sets/day" },
      { label: "Conversation Sets", detail: "8 sets/day" },
      { label: "Free topics", detail: "Unlimited" },
      { label: "Full analytics history", detail: "All-time performance charts" },
      { label: "Mock test mode", detail: "Timed 40-min VA section" },
      { label: "Weak-topic drill recommendations", detail: "AI-powered study plan" },
    ],
  },
];

export default function SubscribePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState<"pro" | "cracker" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async (tier: "pro" | "cracker") => {
    setLoading(tier);
    setError(null);

    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        setError("Failed to load payment gateway. Please check your connection.");
        setLoading(null);
        return;
      }

      const res = await fetch("/api/subscription/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not initiate subscription.");
        setLoading(null);
        return;
      }

      const options = {
        key: data.keyId,
        subscription_id: data.subscriptionId,
        name: "Verbit",
        description: `Verbit ${tier === "cracker" ? "Cracker" : "Pro"} — Monthly`,
        currency: "INR",
        prefill: {
          name: session?.user?.name ?? "",
          email: session?.user?.email ?? "",
        },
        theme: { color: "#ffffff" },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_subscription_id: string;
          razorpay_signature: string;
        }) => {
          const verifyRes = await fetch("/api/subscription/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...response, tier }),
          });

          if (verifyRes.ok) {
            router.push("/dashboard?subscribed=1");
          } else {
            setError("Payment verification failed. Contact support.");
            setLoading(null);
          }
        },
        modal: { ondismiss: () => setLoading(null) },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(null);
    }
  };

  if (status === "unauthenticated") {
    router.replace("/auth/sign-in");
    return null;
  }

  return (
    <div className="min-h-screen bg-grid flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-3xl space-y-8">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Verbit</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Choose your plan</h1>
          <p className="mt-2 text-sm text-white/50">Cancel anytime. Auto-renews monthly.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={`relative flex flex-col p-6 gap-5 overflow-hidden ${
                plan.id === "cracker"
                  ? "border-white/20 bg-white/5"
                  : "border-white/10 bg-white/[0.03]"
              }`}
            >
              {plan.badge && (
                <span className="absolute top-4 right-4 text-[10px] uppercase tracking-widest text-emerald-400 border border-emerald-400/30 rounded-full px-2 py-0.5">
                  {plan.badge}
                </span>
              )}

              <div>
                <p className="text-xs uppercase tracking-widest text-white/40">{plan.name}</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold text-white">₹{plan.price}</span>
                  <span className="text-sm text-white/30">/month</span>
                </div>
                <p className="mt-0.5 text-xs text-white/30 line-through">₹{plan.original}/month</p>
                <p className="text-xs text-emerald-400 mt-0.5">
                  Save ₹{plan.original - plan.price} ({Math.round((1 - plan.price / plan.original) * 100)}% off)
                </p>
              </div>

              <div className="flex-1 divide-y divide-white/10">
                {plan.features.map(({ label, detail }) => (
                  <div key={label} className="flex items-start gap-3 py-3">
                    <span className="mt-0.5 text-emerald-400 text-sm">✓</span>
                    <div>
                      <p className="text-sm font-medium text-white">{label}</p>
                      <p className="text-xs text-white/40">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                className="w-full"
                variant={plan.id === "cracker" ? "default" : "outline"}
                onClick={() => handleSubscribe(plan.id)}
                disabled={loading !== null || status === "loading"}
              >
                {loading === plan.id
                  ? "Opening payment…"
                  : `Subscribe — ₹${plan.price}/mo`}
              </Button>
            </Card>
          ))}
        </div>

        {error && (
          <p className="text-center text-sm text-rose-400">{error}</p>
        )}

        <p className="text-center text-xs text-white/30">
          Secure payment via Razorpay.
        </p>

        <div className="text-center">
          <Link href="/dashboard" className="text-xs text-white/30 hover:text-white/60 transition">
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
