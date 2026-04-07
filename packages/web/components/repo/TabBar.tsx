"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import styles from "./TabBar.module.css";

type Props = {
  issueCount: number;
  prCount: number;
};

export function TabBar({ issueCount, prCount }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const activeTab = params.get("tab") === "prs" ? "prs" : "issues";

  function setTab(tab: string) {
    const sp = new URLSearchParams(params.toString());
    if (tab === "issues") {
      sp.delete("tab");
    } else {
      sp.set("tab", tab);
    }
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className={styles.bar}>
      <button
        className={activeTab === "issues" ? styles.active : styles.tab}
        onClick={() => setTab("issues")}
      >
        Issues <span className={styles.badge}>{issueCount}</span>
      </button>
      <button
        className={activeTab === "prs" ? styles.active : styles.tab}
        onClick={() => setTab("prs")}
      >
        Pull Requests <span className={styles.badge}>{prCount}</span>
      </button>
    </div>
  );
}
