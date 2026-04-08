import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Karla, Syne, Source_Code_Pro } from "next/font/google";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { AuthErrorScreen } from "@/components/auth/AuthErrorScreen";
import { ToastProvider } from "@/components/ui/ToastProvider";
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

export const metadata: Metadata = {
  title: "issuectl",
  description: "Cross-repo GitHub issue command center",
};

type Props = {
  children: ReactNode;
};

export default async function RootLayout({ children }: Props) {
  const auth = await getAuthStatus();

  return (
    <html lang="en" className={`${karla.variable} ${syne.variable} ${sourceCodePro.variable}`}>
      <body className={karla.className}>
        {auth.authenticated ? (
          <ToastProvider>
            <div className={styles.app}>
              <Sidebar username={auth.username} />
              <main className={styles.content}>{children}</main>
            </div>
          </ToastProvider>
        ) : (
          <AuthErrorScreen />
        )}
      </body>
    </html>
  );
}
