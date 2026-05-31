import { NextResponse } from "next/server";

/**
 * Reachability probe used by the AI Assistant module's "Test" buttons.
 *
 * Both LM Studio and faster-whisper-server expose `/models` on their
 * OpenAI-compatible API, so a successful GET is a reliable "is anyone
 * home?" check. We proxy the request through the desktop's Node
 * runtime so the browser doesn't have to deal with CORS — Whisper /
 * LM Studio don't enable CORS by default and a direct `fetch()` from
 * `localhost:3000` to `127.0.0.1:8000` is rejected with a generic
 * "Failed to fetch".
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let url: string;
  let kind: "lmStudio" | "whisper" | "tts" | undefined;
  try {
    const body = (await request.json()) as {
      url?: unknown;
      kind?: unknown;
    };
    if (typeof body.url !== "string" || !body.url) {
      return NextResponse.json(
        { ok: false, error: "Missing 'url' field." },
        { status: 400 },
      );
    }
    url = body.url;
    if (
      body.kind === "lmStudio" ||
      body.kind === "whisper" ||
      body.kind === "tts"
    ) {
      kind = body.kind;
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const probe = url.replace(/\/$/, "") + "/models";

  // Attach LM Studio's bearer token when probing it — once the local
  // server has auth enabled (needed for MCP / Brave Search), an
  // unauthenticated GET /models returns 401 and the Test button
  // would always read as failing even when the server is up.
  // Read the env directly so the secret never reaches the browser.
  const headers: Record<string, string> = {};
  if (kind === "lmStudio") {
    const key = process.env.LM_STUDIO_API_KEY;
    if (key) headers.authorization = `Bearer ${key}`;
  }

  // Cap the upstream wait so a black-holed host doesn't lock the
  // browser tab. 5s is generous for a local-network probe.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(probe, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        status: res.status,
        error: `HTTP ${res.status}`,
      });
    }
    return NextResponse.json({ ok: true, status: res.status });
  } catch (err) {
    clearTimeout(timeout);
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Timed out after 5s"
          : err.message
        : "Connection refused";
    return NextResponse.json({ ok: false, error: message });
  }
}
