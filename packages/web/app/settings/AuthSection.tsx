import { AuthStatus } from "@/components/settings/AuthStatus";
import { getAuthStatus } from "@/lib/auth";

export async function AuthSection() {
  const authResult = await getAuthStatus();

  if (authResult.authenticated) {
    return <AuthStatus username={authResult.username} />;
  }
  return <AuthStatus username={null} error={authResult.error} />;
}
