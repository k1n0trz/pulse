// Superadmin resolution — emails listed in SUPERADMIN_EMAILS get permanent,
// full access to every feature and bypass all billing / plan limits.
// kinotrance@gmail.com is the default superadmin.

import { loadEnv } from "./env.js";

const env = loadEnv();

export function isSuperadmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.SUPERADMIN_EMAILS.includes(email.trim().toLowerCase());
}
