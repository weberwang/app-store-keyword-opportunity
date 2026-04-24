export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const cappedConcurrency = Math.max(1, Math.min(concurrency || 1, items.length || 1));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const currentIndex = cursor;
      cursor += 1;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: cappedConcurrency }, () => runWorker()));
  return results;
}