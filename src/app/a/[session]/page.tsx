import type { Metadata } from "next";
import { ScanRunner } from "@/components/ScanRunner";

export const metadata: Metadata = { title: "Check in", robots: { index: false } };

export default async function ScanPage({
  params,
  searchParams,
}: {
  params: Promise<{ session: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { session } = await params;
  const { c } = await searchParams;
  return <ScanRunner session={session} code={typeof c === "string" ? c : ""} />;
}
