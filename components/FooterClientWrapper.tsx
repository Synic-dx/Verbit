"use client";
import dynamic from "next/dynamic";
const FooterVisibility = dynamic(() => import("@/components/FooterVisibility"), { ssr: false });
export default function FooterClientWrapper() {
  return <FooterVisibility />;
}