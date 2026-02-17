import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { getServerSession } from "next-auth";
import "./globals.css";
import Providers from "@/app/providers";
import FooterVisibility from "@/components/FooterVisibility";
import { authOptions } from "@/lib/auth";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Verbit | Verbal Aptitude Trainer",
  description: "Adaptive CAT/IPMAT verbal aptitude practice powered by LLMs.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);



  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${spaceGrotesk.variable} ${plexMono.variable} antialiased`}
      >
        <Providers session={session}>{children}</Providers>
        <FooterVisibility />
      </body>
    </html>
  );
}
