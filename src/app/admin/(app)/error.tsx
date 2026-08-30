"use client";

/**
 * Admin-area error boundary. A server-render hiccup (a transient DB blip, a
 * cold-start timeout) would otherwise show a bare crash page; this catches it in
 * the admin subtree and offers a one-click retry, so nothing an organiser was
 * doing is lost to a momentary failure.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="admin-page" style={{ maxWidth: 560 }}>
      <div className="eyebrow">Something went wrong</div>
      <h1 style={{ margin: "6px 0 8px" }}>This page couldn&rsquo;t load</h1>
      <p className="body-text">
        It looks like a temporary hiccup. Your data is safe — try loading the page again.
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <a href="/admin" className="btn">Back to dashboard</a>
      </div>
      {error.digest ? (
        <p className="hint" style={{ marginTop: 14 }}>Reference: {error.digest}</p>
      ) : null}
    </div>
  );
}
