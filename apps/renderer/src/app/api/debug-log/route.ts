import { appendFile } from "node:fs/promises";
import { NextResponse } from "next/server";

const DEBUG_ENDPOINT =
  "http://127.0.0.1:7781/ingest/15315dab-8f28-4100-9731-d02658e0d3cd";
const DEBUG_LOG_PATH =
  "c:\\Users\\jungd\\Documents\\Projects\\cubism\\debug-70f298.log";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // #region agent log
  try {
    await appendFile(DEBUG_LOG_PATH, `${JSON.stringify(payload)}\n`, "utf8");
  } catch {
    // The route must never break the renderer while collecting diagnostics.
  }

  try {
    await fetch(DEBUG_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "70f298",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // The route must never break the renderer while collecting diagnostics.
  }
  // #endregion

  return NextResponse.json({ ok: true });
}
