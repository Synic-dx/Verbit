"use client";
import Footer from "@/components/Footer";
import { useEffect, useState } from "react";

export default function FooterVisibility() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(window.location.pathname !== "/");
  }, []);
  if (!show) return null;
  return <Footer />;
}
