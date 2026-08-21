import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { EnrollDevice } from "@/components/EnrollDevice";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/tokens";

export const metadata: Metadata = { title: "Confirm your seat" };

type Search = { searchParams: Promise<{ token?: string }> };

type Outcome = "confirmed" | "already" | "invalid" | "error";

const COPY: Record<Outcome, { title: string; body: string }> = {
  confirmed: {
    title: "Seat confirmed ✓",
    body: "You're all set. We'll email your certificate after you attend. See you there!",
  },
  already: {
    title: "Already confirmed",
    body: "This seat was confirmed earlier — nothing more to do.",
  },
  invalid: {
    title: "Link not valid",
    body: "This confirmation link is invalid or has expired. Try registering again.",
  },
  error: {
    title: "Something went wrong",
    body: "We couldn't confirm your seat just now. Please try the link again shortly.",
  },
};

async function confirm(token?: string): Promise<Outcome> {
  if (!token) return "invalid";
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("confirm_registration", {
      p_token_hash: hashToken(token),
    });
    if (error) return "error";
    if (data === "confirmed") return "confirmed";
    if (data === "already") return "already";
    return "invalid";
  } catch {
    return "error";
  }
}

export default async function ConfirmPage({ searchParams }: Search) {
  const { token } = await searchParams;
  const outcome = await confirm(token);
  const copy = COPY[outcome];

  return (
    <section className="section" style={{ paddingTop: 72, maxWidth: 560 }}>
      <div className="eyebrow">Registration</div>
      <h1 style={{ margin: "12px 0 0" }}>{copy.title}</h1>
      <p className="lead" style={{ marginTop: 16 }}>
        {copy.body}
      </p>
      <div className="stack" style={{ marginTop: 24 }}>
        <ButtonLink href="/events">Browse events</ButtonLink>
        <ButtonLink href="/my-events" variant="ghost">
          My events
        </ButtonLink>
      </div>

      {(outcome === "confirmed" || outcome === "already") && token ? (
        <EnrollDevice token={token} />
      ) : null}
    </section>
  );
}
