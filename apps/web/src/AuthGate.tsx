import { useEffect, type ReactNode } from "react";
import { ClerkProvider, SignedIn, SignedOut, SignIn, useAuth } from "@clerk/clerk-react";
import { setAuthTokenGetter } from "./lib/api";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

/**
 * Wraps the app with Clerk auth when VITE_CLERK_PUBLISHABLE_KEY is set.
 * Without it, renders children directly (single-tenant demo mode) — the
 * backend resolves the demo org, so the product is fully usable offline.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  if (!CLERK_KEY) {
    // Demo mode — no auth, no token getter.
    useEffect(() => setAuthTokenGetter(null), []);
    return <>{children}</>;
  }
  return (
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
      <TokenBridge />
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <div className="auth-screen">
          <div className="auth-card">
            <div className="auth-brand">
              <strong>PULSE</strong>
              <span>Ads Intelligence Agent</span>
            </div>
            <SignIn routing="hash" />
          </div>
        </div>
      </SignedOut>
    </ClerkProvider>
  );
}

// Pipes Clerk's session token into the API client so every request is authenticated.
function TokenBridge() {
  const { getToken, isSignedIn } = useAuth();
  useEffect(() => {
    if (isSignedIn) {
      setAuthTokenGetter(() => getToken());
    } else {
      setAuthTokenGetter(null);
    }
    return () => setAuthTokenGetter(null);
  }, [getToken, isSignedIn]);
  return null;
}
