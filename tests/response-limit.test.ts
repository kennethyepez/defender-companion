import { expect, it } from 'vitest';
import { boundedText } from '../server/microsoft';
it('rejects oversized upstream bodies while streaming rather than buffering the full response', async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(100));
        controller.enqueue(new Uint8Array(100));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  await expect(boundedText(response, 150)).rejects.toThrow('too large');
  expect(cancelled).toBe(true);
});
it('preserves UTF-8 text across chunk boundaries', async () => {
  const bytes = new TextEncoder().encode('A verified observation ✓');
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, -1));
        controller.enqueue(bytes.slice(-1));
        controller.close();
      },
    }),
  );
  expect(await boundedText(response, 100)).toBe('A verified observation ✓');
});
