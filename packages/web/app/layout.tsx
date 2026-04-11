import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  Karla,
  Syne,
  Source_Code_Pro,
  Fraunces,
  Inter,
  IBM_Plex_Mono,
} from "next/font/google";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { AuthErrorScreen } from "@/components/auth/AuthErrorScreen";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ThemeProvider, type Theme } from "@/components/ui/ThemeProvider";
import { getAuthStatus } from "@/lib/auth";
import "./globals.css";
import styles from "./layout.module.css";

const karla = Karla({
  subsets: ["latin"],
  variable: "--font-karla",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-display",
});

const sourceCodePro = Source_Code_Pro({
  subsets: ["latin"],
  variable: "--font-mono",
});

// Paper fonts — used by components under packages/web/components/paper/.
// Loaded alongside the legacy Karla/Syne/Source Code Pro fonts so both
// sets are available simultaneously.
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
  description: "Cross-repo GitHub issue command center",
};

type Props = {
  children: ReactNode;
};

const THEME_SCRIPT = `(function(){try{var t=document.cookie.match(/(?:^|;)\\s*theme=(light|dark|system)/);var v=t?t[1]:"system";var r=v==="system"?window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light":v;document.documentElement.setAttribute("data-theme",r)}catch(e){}})()`;

export default async function RootLayout({ children }: Props) {
  const auth = await getAuthStatus();
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("theme")?.value;
  const theme: Theme = themeCookie === "dark" || themeCookie === "light" ? themeCookie : "system";

  return (
    <html
      lang="en"
      data-theme={theme === "system" ? undefined : theme}
      className={`${karla.variable} ${syne.variable} ${sourceCodePro.variable} ${fraunces.variable} ${inter.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={karla.className}>
        {auth.authenticated ? (
          <ThemeProvider initial={theme}>
            <ToastProvider>
              <div className={styles.app}>
                <Sidebar username={auth.username} />
                <main className={styles.content}>{children}</main>
              </div>
            </ToastProvider>
          </ThemeProvider>
        ) : (
          <AuthErrorScreen />
        )}
      </body>
    </html>
  );
}
