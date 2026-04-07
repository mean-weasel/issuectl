import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Karla, Syne, Source_Code_Pro } from "next/font/google";
import { Sidebar } from "@/components/sidebar/Sidebar";
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

export default function RootLayout({ children }: Props) {
  return (
    <html lang="en" className={`${karla.variable} ${syne.variable} ${sourceCodePro.variable}`}>
      <body className={karla.className}>
        <div className={styles.app}>
          <Sidebar />
          <main className={styles.content}>{children}</main>
        </div>
      </body>
    </html>
  );
}
