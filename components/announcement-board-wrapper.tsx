"use client";
import dynamic from "next/dynamic";
const AnnouncementBoard = dynamic(() => import("@/components/announcement-board"), { ssr: false });

export default function AnnouncementBoardWrapper() {
  return <AnnouncementBoard />;
}