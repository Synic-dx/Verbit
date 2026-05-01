"use client";

import type { HTMLAttributes } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function Logo({ className }: HTMLAttributes<HTMLDivElement>) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const href = status === "authenticated" ? "/dashboard" : "/";
  // Don't show name on public pages — avoids a flash before AuthRedirect kicks in
  const showName = status === "authenticated" && !!session?.user?.name && pathname !== "/" && !pathname.startsWith("/auth");

  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-3 transition hover:-translate-y-0.5",
        className
      )}
    >
      <div className="flex items-center gap-3 relative mr-4">
        <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-linear-to-br from-cyan-400 to-emerald-400 text-black shadow-sm transition group-hover:shadow-md">
          <span className="text-lg font-black">V</span>
        </div>
        <div className="text-lg font-semibold tracking-wide text-white transition group-hover:text-white">
          Verbit
        </div>
      </div>
      
      {showName && (
        <>
          <div className="h-6 w-px bg-white/20" />
          <div className="text-base font-medium text-white">
            {session!.user!.name!.split(" ")[0]}
          </div>
        </>
      )}
    </Link>
  );
}
