/**
 * Who the feedback form names as the council's Social Media Head.
 *
 * Unlike a club head this role is council-wide (`admin_users.club_id` is null),
 * so there is nothing to scope by — the whole council has one social media team
 * and one head of it.
 *
 * The rule is deliberately the same refusal-to-guess as `resolveLeaders`: name
 * the sole active `social_media_head`, and if there are none or several, name
 * nobody. A wrong name attached to a rating is worse than a missing one, and the
 * form simply drops the person sub-block, keeping the team rating.
 *
 * Pure: no I/O, so the rules are unit-testable.
 */

export interface SocialCandidate {
  id: string;
  name: string;
  isActive: boolean;
}

export interface ResolvedSocialLead {
  id: string;
  name: string;
}

export function resolveSocialLead(
  candidates: readonly SocialCandidate[],
): ResolvedSocialLead | null {
  const active = candidates.filter((c) => c.isActive);
  if (active.length !== 1) return null;
  return { id: active[0].id, name: active[0].name };
}
