"use client";

import { SessionProvider, useSession } from "next-auth/react";
import type { Session } from "next-auth";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

function AuthRedirect() {
  const { status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;

    const isPublic = pathname === "/" || pathname.startsWith("/auth");
    const isProtected =
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/analytics") ||
      pathname.startsWith("/practice");

    if (status === "authenticated" && isPublic) {
      router.replace("/dashboard");
      return;
    }

    if (status === "unauthenticated" && isProtected) {
      router.replace("/auth/sign-in");
    }
  }, [status, pathname, router]);

  return null;
}

export default function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session?: Session | null;
}) {
  return (
    <SessionProvider session={session}>
      <AuthRedirect />
      {children}
    </SessionProvider>
  );
}
