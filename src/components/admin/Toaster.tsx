"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Long enough to read a four-word confirmation, short enough not to stack up. */
const DISMISS_MS = 3400;

export type ToastTone = "success" | "revert";

interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

const ToastContext = createContext<((text: string, tone?: ToastTone) => void) | null>(null);

/**
 * Confirmation for writes that leave the page looking much as it did — an
 * inline rename, a saved roster. Those are exactly the edits people re-do
 * because they cannot tell whether the first one took.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  // Cleared on unmount so a timer cannot fire setState on a dead tree.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const push = useCallback((text: string, tone: ToastTone = "success") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, text, tone }]);
    timers.current.push(
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), DISMISS_MS),
    );
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* aria-live rather than role="alert": these confirm something the user
          just did, so they should wait their turn rather than interrupt. */}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <output key={t.id} className="toast" data-tone={t.tone}>
            <span className="toast-dot" aria-hidden="true" />
            {t.text}
          </output>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Returns a no-op outside a provider, so a component that toasts can still be
 * rendered in a test or a page that never mounted the stack.
 */
export function useToast(): (text: string, tone?: ToastTone) => void {
  const push = useContext(ToastContext);
  return push ?? (() => {});
}
