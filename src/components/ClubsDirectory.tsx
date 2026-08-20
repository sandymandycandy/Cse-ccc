"use client";

import { useState } from "react";
import { Chip } from "./ui/Chip";
import { ClubCard } from "./ClubCard";
import { CLUB_CATEGORIES } from "@/lib/clubs";
import type { Club } from "@/lib/types";

type Entry = { club: Club; eventCount: number };

/** Clubs directory with a client-side category filter over pre-fetched clubs. */
export function ClubsDirectory({ clubs }: { clubs: Entry[] }) {
  const [active, setActive] = useState<string>("All");
  const filtered =
    active === "All" ? clubs : clubs.filter((c) => c.club.category === active);

  return (
    <>
      <div className="stack" style={{ marginBottom: 24 }} role="group" aria-label="Filter by category">
        <Chip pressed={active === "All"} onClick={() => setActive("All")}>
          All
        </Chip>
        {CLUB_CATEGORIES.map((cat) => (
          <Chip key={cat} pressed={active === cat} onClick={() => setActive(cat)}>
            {cat}
          </Chip>
        ))}
      </div>

      {filtered.length > 0 ? (
        <div className="clubs">
          {filtered.map(({ club, eventCount }) => (
            <ClubCard key={club.slug} club={club} eventCount={eventCount} />
          ))}
        </div>
      ) : (
        <p className="body-text">No clubs in this category yet.</p>
      )}
    </>
  );
}
