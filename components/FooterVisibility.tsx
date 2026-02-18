"use client";
import Footer from "@/components/Footer";
import { usePathname } from "next/navigation";

export default function FooterVisibility() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <Footer />;
}
