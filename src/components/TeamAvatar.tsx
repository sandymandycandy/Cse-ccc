import Image from "next/image";
import { initialsOf } from "@/lib/council/roster";

/**
 * A member's photo, falling back to an initials monogram.
 *
 * Both branches occupy exactly the same box, so a grid of cards does not reflow as
 * photos are added one at a time. `sizes` is fixed because the rendered box is a
 * fixed pixel size at every breakpoint — without it Next serves a needlessly large
 * source for a 64px circle.
 */
export function TeamAvatar({
  name,
  photoUrl,
  size,
}: {
  name: string;
  photoUrl: string | null;
  size: number;
}) {
  const box = {
    width: size,
    height: size,
    flex: "0 0 auto",
    borderRadius: "50%",
    overflow: "hidden",
  } as const;

  if (photoUrl) {
    return (
      <div style={{ ...box, background: "var(--sand)", position: "relative" }}>
        <Image
          src={photoUrl}
          /* Empty alt, not the name: the name is rendered as text right beside this
             in every caller, so announcing it twice is noise. The photo carries no
             information the text does not. */
          alt=""
          width={size}
          height={size}
          sizes={`${size}px`}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{
        ...box,
        background: "var(--forest-tint)",
        color: "var(--forest-deep)",
        display: "grid",
        placeItems: "center",
        font: `400 ${Math.round(size * 0.33)}px var(--serif)`,
        letterSpacing: "0.03em",
      }}
    >
      {initialsOf(name)}
    </div>
  );
}
