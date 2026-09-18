"use client";

import Image from "next/image";

import { objectPosition, portraitAlt, portraitOf, type Member } from "@/data/ccc";
import { publicPhotoUrl } from "@/lib/team/profiles";
import { usePhoto } from "../team-context";

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

/**
 * A member's portrait (next/image, fill) or the concept's placeholder.
 *
 * An UPLOADED portrait from /admin/team wins over the bundled one. `alt` comes
 * from the merged member, so an edited name or role is reflected in it too.
 */
export function MemberPortrait({ member, sizes, fallback, className = "", position, preload, quality, style }: Props) {
  // A hook, so it runs before either early return below.
  const uploaded = usePhoto(member);

  if (uploaded) {
    return (
      <Image
        src={publicPhotoUrl(uploaded.path)}
        alt={portraitAlt(member)}
        fill
        // ⚠️ A remote src gets no automatic blur, and placeholder="blur" THROWS
        // without a blurDataURL. Pass it only when a blur was stored at upload.
        {...(uploaded.blur ? { placeholder: "blur" as const, blurDataURL: uploaded.blur } : {})}
        sizes={sizes}
        preload={preload}
        quality={quality}
        className={`object-cover ${className}`}
        style={{ objectPosition: position ?? `${uploaded.focal.x}% ${uploaded.focal.y}%`, ...style }}
      />
    );
  }

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
