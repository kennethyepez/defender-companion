/** Pairing shares an origin only. Never encode cookies, recovery codes or bootstrap tokens. */
export function connectionOrigin(input: string): string | undefined {
  if (input.length > 256) return;
  if (!/^https:\/\/[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*\.ts\.net(?::[0-9]+)?\/?$/i.test(input))
    return;
  try {
    const value = new URL(input);
    if (
      value.protocol !== 'https:' ||
      !/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*\.ts\.net$/.test(value.hostname) ||
      value.username ||
      value.password ||
      value.search ||
      value.hash ||
      value.pathname !== '/' ||
      (value.port && (Number(value.port) < 1024 || Number(value.port) > 65535)) ||
      !/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(input.trim())
    )
      return;
    return value.origin;
  } catch {
    return;
  }
}
