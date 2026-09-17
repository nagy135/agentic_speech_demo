/** Validate the browser's origin against the public request authority. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;

  // Next.js standalone constructs request.url from its listening address
  // (e.g. 0.0.0.0:3000), not necessarily the host the browser visited.
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const protocol =
    request.headers.get("x-forwarded-proto") ?? url.protocol.slice(0, -1);
  if (protocol !== "http" && protocol !== "https") return false;

  try {
    const expected = new URL(`${protocol}://${host}`);
    return expected.origin === origin;
  } catch {
    return false;
  }
}
