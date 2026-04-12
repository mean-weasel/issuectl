import { AuthStatus } from "@/components/settings/AuthStatus";
import { getAuthStatus } from "@/lib/auth";

export async function AuthSection() {
  const authResult = await getAuthStatus();
  const username = authResult.authenticated ? authResult.username : null;

  return <AuthStatus username={username} />;
}
