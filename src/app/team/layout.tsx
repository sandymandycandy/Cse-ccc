import { MotionProvider } from "@/components/team/shared/MotionProvider";

/**
 * The team page animates with Motion, so it needs MotionConfig above it to
 * honour prefers-reduced-motion.
 *
 * The standalone preview this page came from also rendered SiteHeader and
 * SiteFooter here. They are deliberately NOT repeated — the root layout
 * (src/app/layout.tsx) already wraps every non-admin page in the real header,
 * <main> and footer, so bringing the preview's copies would double the chrome
 * and nest <main> inside <main>.
 *
 * `.team-root` is what globals.css hangs the page's two scoped rules off (the
 * link-colour reset and scroll-padding). It is a plain <div> on purpose: any
 * overflow, transform or contain here would silently break every
 * `position: sticky` on the page — the LayerNav and the orbit plate.
 */
export default function TeamLayout({ children }: LayoutProps<"/team">) {
  return (
    <MotionProvider>
      <div className="team-root">{children}</div>
    </MotionProvider>
  );
}
