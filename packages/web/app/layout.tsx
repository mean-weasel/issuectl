import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";
import { AuthErrorScreen } from "@/components/auth/AuthErrorScreen";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { getAuthStatus } from "@/lib/auth";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono-paper",
  display: "swap",
});

export const metadata: Metadata = {
  title: "issuectl",
  description: "Cross-repo GitHub issue command center with Claude Code launch",
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
};

type Props = {
  children: ReactNode;
};

export default async function RootLayout({ children }: Props) {
  const auth = await getAuthStatus();

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${ibmPlexMono.variable}`}
    >
      <body>
        {auth.authenticated ? (
          <ToastProvider>{children}</ToastProvider>
        ) : (
          <AuthErrorScreen />
        )}
      </body>
    </html>
  );
}
