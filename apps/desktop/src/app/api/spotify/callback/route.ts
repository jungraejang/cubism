import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Spotify OAuth callback. The user is redirected here from accounts.spotify.com
 * after authorizing the app. We return a tiny HTML page that forwards the
 * `code` + `state` (or any `error`) to the original control-panel window via
 * postMessage, then closes the popup. The actual token exchange happens in
 * /api/spotify/exchange so the client secret never crosses an iframe boundary.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const payload = JSON.stringify({
    type: "cubism:spotify-auth",
    code,
    state,
    error,
  });

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Cubism · Spotify connected</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #09090b;
        color: #e4e4e7;
        font-family: system-ui, -apple-system, sans-serif;
      }
      main { text-align: center; padding: 1.5rem; }
      h1 { color: #67e8f9; margin: 0 0 0.5rem; font-size: 1.25rem; }
      p { margin: 0; color: #a1a1aa; font-size: 0.9rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>Spotify connected</h1>
      <p>You can close this window.</p>
    </main>
    <script>
      (function () {
        try {
          if (window.opener) {
            window.opener.postMessage(${payload}, "*");
          }
        } catch (e) {
          // ignore - the opener may have been closed before we got here
        }
        setTimeout(function () { window.close(); }, 250);
      })();
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
