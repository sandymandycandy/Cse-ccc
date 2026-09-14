"use client";

import { useEffect, useRef, useState } from "react";
import type { FieldTransform } from "@/lib/certificates/design";
import type { FieldGroup } from "@/lib/certificates/fields";

const TRANSFORMS: { id: FieldTransform; label: string }[] = [
  { id: "none", label: "As typed" },
  { id: "title", label: "Title Case" },
  { id: "upper", label: "UPPERCASE" },
];

/** "+ Field" dropdown: every field this event offers, grouped, with a letter-case choice. */
export function FieldMenu({
  catalogue,
  onPick,
  label = "+ Field",
}: {
  catalogue: FieldGroup[];
  onPick: (field: string, transform: FieldTransform, label: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [transform, setTransform] = useState<FieldTransform>("none");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="cd-menu" ref={root}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-expanded={open}
        // Keep focus (and the text selection) in the editor while choosing.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open ? (
        <div className="cd-menu-panel" role="menu">
          <div className="cd-menu-transforms">
            {TRANSFORMS.map((t) => (
              <button
                key={t.id}
                type="button"
                className="chip"
                aria-pressed={transform === t.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setTransform(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {catalogue.map((group) => (
            <div key={group.id} className="cd-menu-group">
              <div className="label">{group.label}</div>
              {group.fields.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="menuitem"
                  className="cd-menu-item"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPick(f.key, transform, f.label);
                    setOpen(false);
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
