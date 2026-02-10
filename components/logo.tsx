"use client";

import type { HTMLAttributes } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

export function Logo({ className }: HTMLAttributes<HTMLDivElement>) {
  const { status } = useSession();
  const href = status === "authenticated" ? "/dashboard" : "/";

  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-3 transition hover:-translate-y-0.5",
        className
      )}
    >
      <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-linear-to-br from-cyan-400 to-emerald-400 text-black shadow-sm transition group-hover:shadow-md">
        <span className="text-lg font-black">V</span>
      </div>
      <div className="text-lg font-semibold tracking-wide text-white transition group-hover:text-white">
        Verbit
      </div>
    </Link>
  );
}
