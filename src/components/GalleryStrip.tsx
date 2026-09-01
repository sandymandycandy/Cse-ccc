import Link from "next/link";
import type { GalleryPhoto } from "@/lib/queries";

/**
 * Full-width auto-scrolling band of gallery photos, sat between the hero and the
 * rest of the home page. Same seamless-marquee technique as the Ticker (items
 * duplicated, the track translates -50%; per-item trailing padding — not a flex
 * gap — keeps the loop seamless). Pauses on hover; motion is disabled globally
 * under prefers-reduced-motion. Renders nothing when the gallery is empty.
 */
export function GalleryStrip({ photos }: { photos: GalleryPhoto[] }) {
  if (photos.length === 0) return null;
  const doubled = [...photos, ...photos];
  return (
    <div className="gallery-strip" aria-label="From the gallery">
      <div className="track">
        {doubled.map((p, i) => {
          const clone = i >= photos.length;
          return (
            <Link
              key={`${p.id}-${i}`}
              href="/gallery"
              aria-hidden={clone}
              tabIndex={clone ? -1 : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imageUrl} alt={p.caption ?? ""} loading="lazy" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
