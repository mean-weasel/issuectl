import { writeFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface LaunchContext {
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  comments: Array<{ author: string; body: string; createdAt: string }>;
  referencedFiles: string[];
  preamble?: string;
}

export function assembleContext(data: LaunchContext): string {
  const sections: string[] = [];

  sections.push(`## Issue #${data.issueNumber}: ${data.issueTitle}\n`);
  if (data.issueBody) {
    sections.push(data.issueBody);
  }

  if (data.comments.length > 0) {
    sections.push("---\n\n## Comments\n");
    for (const c of data.comments) {
      const parsed = new Date(c.createdAt);
      const date = isNaN(parsed.getTime())
        ? c.createdAt
        : parsed.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
      sections.push(`**${c.author}** (${date}):\n${c.body}\n`);
    }
  }

  if (data.referencedFiles.length > 0) {
    sections.push("---\n\n## Referenced Files\n");
    for (const f of data.referencedFiles) {
      sections.push(`- ${f}`);
    }
    sections.push("");
  }

  if (data.preamble) {
    sections.push(`---\n\n${data.preamble}\n`);
  }

  sections.push(
    `---\n\n**Important:** Include \`Closes #${data.issueNumber}\` in any PR you create for this issue.`,
  );

  return sections.join("\n");
}

export async function writeContextFile(
  context: string,
  issueNumber: number,
): Promise<string> {
  const filePath = join(tmpdir(), `issuectl-launch-${issueNumber}-${Date.now()}.md`);
  await writeFile(filePath, context, "utf-8");
  return filePath;
}

/**
 * Remove stale context files older than 24 hours from the temp directory.
 * Best-effort — failures are silently ignored.
 */
export async function cleanupStaleContextFiles(): Promise<number> {
  const dir = tmpdir();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let cleaned = 0;
  try {
    const files = await readdir(dir);
    for (const file of files) {
      const match = file.match(/^issuectl-launch-\d+-(\d+)\.md$/);
      if (match && Number(match[1]) < cutoff) {
        try {
          await unlink(join(dir, file));
          cleaned++;
        } catch (err) {
          console.warn(`[issuectl] cleanupStaleContextFiles: failed to delete ${file}:`, err);
        }
      }
    }
  } catch (err) {
    console.warn("[issuectl] cleanupStaleContextFiles: readdir failed:", err);
  }
  return cleaned;
}
