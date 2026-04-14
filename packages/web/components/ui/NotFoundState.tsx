import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./NotFoundState.module.css";

type LinkItem = {
  href: string;
  label: string;
};

type Props = {
  title: string;
  message: ReactNode;
  links: LinkItem[];
};

export function NotFoundState({ title, message, links }: Props) {
  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.icon} aria-hidden="true">?</div>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={styles.link}>
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
