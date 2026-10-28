/** Reads every row of a query page by page (the database API returns at most 1,000 rows per request). */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error?: unknown }>, max = 50_000): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; from < max; from += size) {
    const { data } = await page(from, from + size - 1);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}
