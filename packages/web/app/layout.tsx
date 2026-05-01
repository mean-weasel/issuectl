import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";
import { AuthErrorScreen } from "@/components/auth/AuthErrorScreen";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { SplashOverlay } from "@/components/ui/SplashOverlay";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { getAuthStatus } from "@/lib/auth";
import "./globals.css";

// Inter and Fraunces are variable fonts — omitting `weight` lets
// next/font ship a single file per style instead of one per weight,
// cutting the per-route font CSS substantially while keeping every
// weight (400-700) the design system uses.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// IBM Plex Mono is not a variable font on Google Fonts, so we still
// specify discrete weights — but only the ones used in the design
// system (400 for body mono, 600 for emphasis chips/badges). 500 had
// no usage in CSS and 700 is browser-synthesized from 600 in the rare
// case it's requested.
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-mono-paper",
  display: "swap",
});

export const metadata: Metadata = {
  title: "issuectl",
  description: "Cross-repo GitHub issue command center with agent launch",
  manifest: "/manifest.json",
  icons: {
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "issuectl",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f3ecd9",
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
          <ToastProvider>
            <SplashOverlay />
            <OfflineIndicator />
            {children}
          </ToastProvider>
        ) : (
          <AuthErrorScreen />
        )}
      </body>
    </html>
  );
}
