"use client";

import { useState } from "react";
import Link from "next/link";
import type { GitHubIssue } from "@issuectl/core";
import { Badge } from "@/components/ui/Badge";
import { LifecycleIndicator } from "@/components/ui/LifecycleIndicator";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterChips } from "@/components/ui/FilterChips";
import { daysSince } from "@/lib/format";
import styles from "./IssuesTable.module.css";

type Props = {
  issues: GitHubIssue[];
  owner: string;
  repo: string;
};

const FILTERS = ["All", "bug", "enhancement", "deployed"];

function hasLabel(issue: GitHubIssue, name: string): boolean {
  return issue.labels.some(
    (l) => l.name.toLowerCase() === name.toLowerCase(),
  );
}

export function IssuesTable({ issues, owner, repo }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const filtered = issues
    .filter((issue) => {
      if (filter !== "All") {
        if (filter === "deployed") {
          return hasLabel(issue, "issuectl:deployed");
        }
        return hasLabel(issue, filter);
      }
      return true;
    })
    .filter((issue) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        issue.title.toLowerCase().includes(q) ||
        `#${issue.number}`.includes(q)
      );
    })
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  const isDeployed = (issue: GitHubIssue) =>
    hasLabel(issue, "issuectl:deployed");

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filter issues..."
        />
        <FilterChips options={FILTERS} active={filter} onChange={setFilter} />
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>No issues match your filters.</div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Issue</th>
              <th>Labels</th>
              <th>Lifecycle</th>
              <th>Age</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((issue) => (
              <tr key={issue.number}>
                <td>
                  <Link
                    href={`/${owner}/${repo}/issues/${issue.number}`}
                    className={styles.issueCell}
                  >
                    <span
                      className={`${styles.stateDot} ${issue.state === "open" ? styles.open : styles.closed}`}
                    />
                    <div className={styles.issueInfo}>
                      <span className={styles.issueTitle}>{issue.title}</span>
                      <span className={styles.issueSubtitle}>
                        <span className={styles.num}>#{issue.number}</span>
                        opened {daysSince(issue.createdAt)} ago
                      </span>
                    </div>
                  </Link>
                </td>
                <td>
                  <div className={styles.labelsCell}>
                    {issue.labels
                      .filter((l) => !l.name.startsWith("issuectl:"))
                      .map((l) => (
                        <Badge
                          key={l.name}
                          label={l.name}
                          color={l.color}
                        />
                      ))}
                  </div>
                </td>
                <td>
                  <LifecycleIndicator labels={issue.labels} />
                </td>
                <td className={styles.ageCell}>
                  {daysSince(issue.updatedAt)}
                </td>
                <td>
                  <div className={styles.actionCell}>
                    <button className={styles.launchBtn}>
                      {isDeployed(issue) ? "Re-launch" : "Launch"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
