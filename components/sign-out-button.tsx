"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

type SignOutButtonProps = {
  label?: string;
};

export default function SignOutButton({ label = "Sign out" }: SignOutButtonProps) {
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => signOut({ callbackUrl: "/" })}
    >
      {label}
    </Button>
  );
}
