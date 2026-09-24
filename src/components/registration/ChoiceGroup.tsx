"use client";

import { useRef } from "react";
import { splitChoice } from "@/lib/registration-form/choice-display";

/**
 * A radio or checkbox question as a set of selectable cards. The native input
 * is still there (visually hidden), so the form data, `required`, arrow-key
 * movement within a radio group and screen readers all behave as before — the
 * card is just its label. `variant="pill"` is the compact form for a short
 * dropdown (Year: 1–5): one row of pills, no tag or title split.
 */
export function ChoiceGroup({
  name,
  type,
  variant = "card",
  options,
  required,
  allowOther,
  otherText,
  onOther,
}: {
  name: string;
  type: "radio" | "checkbox";
  variant?: "card" | "pill";
  options: string[];
  required?: boolean;
  allowOther?: boolean;
  otherText?: string;
  onOther?: (v: string) => void;
}) {
  const otherRef = useRef<HTMLInputElement>(null);
  if (variant === "pill") {
    return (
      <div className="choice-pills">
        {options.map((o) => (
          <label key={o} className="choice-pill">
            <input className="choice-input" type={type} name={name} value={o} required={required} />
            {o}
          </label>
        ))}
      </div>
    );
  }
  return (
    <div className={`choice-grid${type === "checkbox" ? " is-multi" : ""}`}>
      {options.map((o) => {
        const d = splitChoice(o);
        return (
          <label key={o} className="choice">
            <input
              className="choice-input"
              type={type}
              name={name}
              value={o}
              required={type === "radio" ? required : undefined}
            />
            <span className="choice-mark" aria-hidden="true" />
            <span className="choice-body">
              {d.tag ? <span className="choice-tag">{d.tag}</span> : null}
              {d.title ? <span className="choice-title">{d.title}</span> : null}
              <span
                className={d.title ? "choice-text" : d.text.length > 40 ? "choice-long" : "choice-title"}
              >
                {d.text}
              </span>
            </span>
          </label>
        );
      })}
      {allowOther ? (
        <label className="choice">
          <input ref={otherRef} className="choice-input" type={type} name={name} value="__other__" />
          <span className="choice-mark" aria-hidden="true" />
          <span className="choice-body">
            <span className="choice-title">Other</span>
            <input
              type="text"
              className="choice-other"
              aria-label="Other"
              placeholder="Type your own"
              value={otherText ?? ""}
              // Typing an answer means choosing it — don't make them also tick the box.
              onChange={(e) => {
                if (otherRef.current && e.target.value) otherRef.current.checked = true;
                onOther?.(e.target.value);
              }}
            />
          </span>
        </label>
      ) : null}
    </div>
  );
}
