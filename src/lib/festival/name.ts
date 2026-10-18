/** English festival name from an item's `data` (JSON string or object), or undefined. */
export function festivalName(data: unknown): string | undefined {
  try {
    const d = (typeof data === "string" ? JSON.parse(data) : data) as { name?: { en?: string } } | null;
    return d?.name?.en || undefined;
  } catch {
    return undefined;
  }
}
