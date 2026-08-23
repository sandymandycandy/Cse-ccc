import type { DefaultSession } from "next-auth";
import type { AdminRole } from "@/lib/auth/capabilities";

// Extend Auth.js types with the admin identity we carry in the JWT/session.
declare module "next-auth" {
  interface User {
    role: AdminRole;
    clubId: string | null;
    sessionEpoch: number;
    /** Set when a TOTP-required role has no confirmed second factor yet. */
    mustSetupTotp?: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: AdminRole;
      clubId: string | null;
      sessionEpoch: number;
      mustSetupTotp?: boolean;
    } & DefaultSession["user"];
  }
}

// The JWT interface is declared in @auth/core/jwt and re-exported by
// next-auth/jwt; augment the source module so the session callback's `token`
// picks up these fields (augmenting only next-auth/jwt does not merge).
declare module "@auth/core/jwt" {
  interface JWT {
    uid: string;
    role: AdminRole;
    clubId: string | null;
    sessionEpoch: number;
    mustSetupTotp?: boolean;
  }
}
