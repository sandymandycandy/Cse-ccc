import { initials, type Member } from "@/data/ccc";
import { MemberPortrait } from "./shared/MemberPortrait";

/** Quiet paper-toned stand-in for the few members without a photo yet. */
function Placeholder({ member, label, tone }: { member: Member; label: boolean; tone: "paper" | "film" }) {
  const film = tone === "film";
  return (
    <span aria-hidden className={`absolute inset-0 grid place-items-center [container-type:inline-size] ${film ? "bg-[#23241d]" : "bg-sand"}`}>
      <span className={`font-serif text-[34cqw] leading-none ${film ? "text-[#e0a458]/55" : "text-ink-4"}`}>{initials(member.name)}</span>
      {label && (
        <span className="absolute inset-x-0 bottom-[7%] text-center font-mono text-[clamp(8px,3.2cqw,11px)] uppercase tracking-[0.16em] text-ink-3">
          Photo coming soon
        </span>
      )}
    </span>
  );
}

export function Portrait({
  member,
  sizes,
  className = "",
  position,
  quality,
  preload,
  label = false,
  tone = "paper",
}: {
  member: Member;
  sizes: string;
  className?: string;
  position?: string;
  quality?: number;
  preload?: boolean;
  label?: boolean;
  /** "film" renders the missing-photo placeholder as an unexposed frame. */
  tone?: "paper" | "film";
}) {
  return (
    <MemberPortrait
      member={member}
      sizes={sizes}
      className={className}
      position={position}
      quality={quality}
      preload={preload}
      fallback={<Placeholder member={member} label={label} tone={tone} />}
    />
  );
}
