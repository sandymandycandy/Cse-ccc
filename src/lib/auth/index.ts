import "server-only";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createAdminClient } from "@/lib/supabase/admin";
import { LoginSchema } from "@/lib/validation/admin";
import { verifyPassword } from "@/lib/auth/password";
import { decryptSecret, matchRecoveryCode, verifyTotp } from "@/lib/auth/totp";
import { checkLoginLimits } from "@/lib/rate-limit";

/**
 * Auth.js v5 — admin authentication (SECURITY_SPEC §3).
 *
 * Credentials provider only: students never log in. `authorize` performs the
 * full credential check against `admin_users` via the service-role client
 * (that table has no anon RLS policy), then the second factor when the account
 * has TOTP confirmed. The session is a JWT in an httpOnly cookie carrying the
 * role/club/epoch the require* guards need.
 *
 * Login rate-limiting + lockout (§3, §6) is layered by the /api/admin/login
 * route in front of this; `authorize` is the verification core.
 */

const useSecureCookies = process.env.NODE_ENV === "production";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8h absolute (SPEC §3)
  },
  pages: {
    signIn: "/admin/login",
  },
  // __Host- prefix in production (requires Secure + path=/ + no Domain).
  cookies: {
    sessionToken: {
      name: useSecureCookies ? "__Host-ccc.session" : "ccc.session",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        totp: {},
        recoveryCode: {},
      },
      authorize: async (raw, request) => {
        const parsed = LoginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password, totp, recoveryCode } = parsed.data;

        // Rate limit here (SECURITY_SPEC §6) rather than only in the form action,
        // so direct POSTs to /api/auth/callback/credentials are limited too. Over
        // the limit returns null — the same generic failure as a bad password (§3).
        const ip =
          request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        if (!checkLoginLimits({ ip, email }).ok) return null;

        const admin = createAdminClient();
        const { data: user } = await admin
          .from("admin_users")
          .select(
            "id, email, full_name, role, club_id, password_hash, is_active, session_epoch",
          )
          .eq("email", email)
          .maybeSingle();

        // No usable account, deactivated, or invite not yet consumed → fail.
        if (!user || !user.is_active || !user.password_hash) return null;
        if (!(await verifyPassword(password, user.password_hash))) return null;

        // Second factor, when the account has confirmed TOTP.
        const { data: totpRow } = await admin
          .from("admin_totp")
          .select("secret_encrypted, confirmed_at, recovery_codes_hashed")
          .eq("admin_id", user.id)
          .maybeSingle();

        if (totpRow?.confirmed_at) {
          let ok = false;
          if (totp && verifyTotp(decryptSecret(totpRow.secret_encrypted), totp)) {
            ok = true;
          } else if (recoveryCode) {
            const idx = matchRecoveryCode(recoveryCode, totpRow.recovery_codes_hashed);
            if (idx >= 0) {
              // single-use: drop the consumed code
              const remaining = totpRow.recovery_codes_hashed.filter((_, i) => i !== idx);
              await admin
                .from("admin_totp")
                .update({ recovery_codes_hashed: remaining })
                .eq("admin_id", user.id);
              ok = true;
            }
          }
          if (!ok) return null;
        }

        await admin
          .from("admin_users")
          .update({ last_login_at: new Date().toISOString() })
          .eq("id", user.id);

        return {
          id: user.id,
          email: user.email,
          name: user.full_name,
          role: user.role,
          clubId: user.club_id,
          sessionEpoch: user.session_epoch,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        token.role = user.role;
        token.clubId = user.clubId;
        token.sessionEpoch = user.sessionEpoch;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid;
      session.user.role = token.role;
      session.user.clubId = token.clubId;
      session.user.sessionEpoch = token.sessionEpoch;
      return session;
    },
  },
});
