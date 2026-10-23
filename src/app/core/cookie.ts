/**
 * Reads one cookie, on the server from the request headers and in the browser from document.cookie.
 * During build-time route extraction there is neither a request nor a real document cookie (the
 * server DOM throws), so that case reads as "no cookie".
 */
export function readCookie(doc: Document, request: Request | null, name: string, valuePattern: string): string | undefined {
  let header = '';
  try {
    header = request ? (request.headers.get('cookie') ?? '') : doc.cookie;
  } catch {
    /* no cookie available */
  }
  return header.match(new RegExp(`(?:^|;\\s*)${name}=(${valuePattern})`))?.[1];
}
