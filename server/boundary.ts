import type { FastifyRequest } from 'fastify';
export type Boundary = { mode: 'loopback' | 'tailnet'; allowedLogins?: string[] };
const isLoopback = (ip: string) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
export function validateBoundary(origin: URL, boundary: Boundary) {
  if (boundary.mode === 'loopback') {
    if (origin.protocol !== 'http:' || origin.hostname !== 'localhost')
      throw new Error('Loopback mode is restricted to http://localhost development.');
  } else if (
    origin.protocol !== 'https:' ||
    !origin.hostname.endsWith('.ts.net') ||
    !boundary.allowedLogins?.length ||
    boundary.allowedLogins.some(
      (login) => !/^[a-zA-Z0-9.!#$%&'*+\-/=?^_`{|}~]+@[a-zA-Z0-9.-]+$/.test(login),
    )
  )
    throw new Error(
      'Private mode requires an HTTPS Tailscale origin and an explicit login allowlist.',
    );
}
export function permitsRequest(request: FastifyRequest, boundary: Boundary, origin: URL) {
  if (!isLoopback(request.ip)) return false;
  if (boundary.mode === 'loopback') return true;
  const login = request.headers['tailscale-user-login'];
  return (
    request.headers.host === origin.host &&
    typeof login === 'string' &&
    !!boundary.allowedLogins?.some((allowed) => allowed.toLowerCase() === login.toLowerCase())
  );
}
