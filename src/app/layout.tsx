import type { Metadata } from "next";
import { DM_Serif_Display, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

// DM Serif Display — headings only (400, plus italic as accent voice)
const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-dm-serif",
  display: "swap",
});

// Space Grotesk — body & UI
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

// IBM Plex Mono — eyebrows, labels and meta only
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CSE Club Council",
    template: "%s · CSE Club Council",
  },
  description:
    "The department's eleven clubs publish everything here — talks, contests, workshops and the occasional 24-hour build.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Theme is resolved server-side from a cookie so there is no flash of the
  // wrong theme and no inline script (which the strict CSP would forbid).
  const theme =
    (await cookies()).get("theme")?.value === "night" ? "night" : "day";

  // The admin area brings its own chrome (middleware sets x-pathname); the public
  // header/footer would be wrong there.
  const isAdmin = ((await headers()).get("x-pathname") ?? "").startsWith("/admin");

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${dmSerif.variable} ${spaceGrotesk.variable} ${ibmPlexMono.variable}`}
    >
      <body>
        {isAdmin ? (
          children
        ) : (
          <>
            <SiteHeader initialTheme={theme} />
            <main>{children}</main>
            <SiteFooter />
          </>
        )}
      </body>
    </html>
  );
}
