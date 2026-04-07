const OWNER_REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

export function isValidOwnerRepo(value: string): boolean {
  return OWNER_REPO_PATTERN.test(value);
}

export function parseOwnerRepo(value: string): { owner: string; name: string } {
  const [owner, name] = value.split("/");
  return { owner, name };
}

export function validateOwnerRepo(value: string): true | string {
  return isValidOwnerRepo(value) || "Format: owner/name (e.g., mean-weasel/seatify)";
}
