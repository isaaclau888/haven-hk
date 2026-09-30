import type { RequestHandler } from "./$types";

const TILE_ARCHIVE = "https://haven.hackclub-assets.com/planet_z7.pmtiles";

function responseHeaders(source: Response) {
  const headers = new Headers();
  for (const name of [
    "accept-ranges",
    "cache-control",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "last-modified",
  ]) {
    const value = source.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("access-control-allow-origin", "*");
  return headers;
}

async function proxy(request: Request) {
  const response = await fetch(TILE_ARCHIVE, {
    method: request.method,
    headers: request.headers.get("range")
      ? { range: request.headers.get("range")! }
      : undefined,
  });

  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    headers: responseHeaders(response),
  });
}

export const GET: RequestHandler = ({ request }) => proxy(request);
export const HEAD: RequestHandler = ({ request }) => proxy(request);
