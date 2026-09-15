/**
 * Bulk-send constants and helpers. Pure — deliberately no `server-only`, so a
 * client component can read the constants if it needs to explain them.
 */

/**
 * Bulk mail queues below transactional mail (which uses 3–5). `deliverPending`
 * orders by priority ascending, so a password reset never waits behind 900
 * newsletters.
 */
export const BULK_PRIORITY = 8;

/** Rows per insert statement. 908 individual inserts is its own timeout. */
export const INSERT_CHUNK = 500;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
