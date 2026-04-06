import { Octokit } from "@octokit/rest";
import { getGhToken } from "./auth.js";

let instance: Octokit | null = null;

export async function getOctokit(): Promise<Octokit> {
  if (instance) return instance;
  const token = await getGhToken();
  instance = new Octokit({ auth: token });
  return instance;
}
