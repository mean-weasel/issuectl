"use client";

import { useState } from "react";
import Link from "next/link";
import type { GitHubPull } from "@issuectl/core";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterChips } from "@/components/ui/FilterChips";
import { daysSince } from "@/lib/format";
import styles from "./PullsTable.module.css";

type Props = {
  pulls: GitHubPull[];
  owner: string;
  repo: string;
};

function getStatus(pr: GitHubPull): "open" | "merged" | "closed" {
  if (pr.merged) return "merged";
  return pr.state;
}

const FILTERS = ["All", "Open", "Merged"];

export function PullsTable({ pulls, owner, repo }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const filtered = pulls
    .filter((pr) => {
      if (filter === "Open") return pr.state === "open";
      if (filter === "Merged") return pr.merged;
      return true;
    })
    .filter((pr) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        pr.title.toLowerCase().includes(q) || `#${pr.number}`.includes(q)
      );
    })
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter pull requests..."
        />
        <FilterChips options={FILTERS} active={filter} onChange={setFilter} />
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>No pull requests match your filters.</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Pull Request</th>
              <th>Status</th>
              <th>Linked Issue</th>
              <th>Changes</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((pr) => {
              const status = getStatus(pr);
              const linkedMatch = pr.body?.match(
                /(?:closes|fixes|resolves)\s+#(\d+)/i,
              );
              return (
                <tr key={pr.number}>
                  <td>
                    <Link
                      href={`/${owner}/${repo}/pulls/${pr.number}`}
                      className={styles.prCell}
                    >
                      <span
                        className={`${styles.stateDot} ${styles[status]}`}
                      />
                      <div className={styles.prInfo}>
                        <span className={styles.prTitle}>{pr.title}</span>
                        <span className={styles.prSubtitle}>
                          <span className={styles.num}>#{pr.number}</span>
                          by {pr.user?.login ?? "unknown"}
                        </span>
                      </div>
                    </Link>
                  </td>
                  <td>
                    <span
                      className={
                        status === "merged"
                          ? styles.statusMerged
                          : status === "open"
                            ? styles.statusOpen
                            : styles.statusClosed
                      }
                    >
                      {status === "merged"
                        ? "Merged"
                        : status === "open"
                          ? "Open"
                          : "Closed"}
                    </span>
                  </td>
                  <td>
                    {linkedMatch && (
                      <span className={styles.linkedIssue}>
                        Closes #{linkedMatch[1]}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className={styles.changes}>
                      <span className={styles.plus}>+{pr.additions}</span>
                      <span className={styles.minus}>-{pr.deletions}</span>
                    </div>
                  </td>
                  <td className={styles.ageCell}>
                    {daysSince(pr.updatedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
