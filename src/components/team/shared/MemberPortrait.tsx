import Image from "next/image";

import { objectPosition, portraitAlt, portraitOf, type Member } from "@/data/ccc";

type Props = {
  member: Member;
  sizes: string;
  /** Rendered instead of the image when the member has no local portrait yet. */
  fallback: React.ReactNode;
  className?: string;
  position?: string;
  preload?: boolean;
  quality?: number;
  style?: React.CSSProperties;
};

/** A member's portrait (next/image, fill) or the concept's placeholder. */
export function MemberPortrait({ member, sizes, fallback, className = "", position, preload, quality, style }: Props) {
  const portrait = portraitOf(member);
  if (!portrait) return <>{fallback}</>;
  return (
    <Image
      src={portrait.src}
      alt={portraitAlt(member)}
      fill
      placeholder="blur"
      sizes={sizes}
      preload={preload}
      quality={quality}
      className={`object-cover ${className}`}
      style={{ objectPosition: position ?? objectPosition(member), ...style }}
    />
  );
}
