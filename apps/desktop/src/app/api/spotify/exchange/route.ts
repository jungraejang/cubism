import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ExchangeBody = {
  code?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
};

type SpotifyTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
};

type SpotifyUserResponse = {
  display_name?: string | null;
  id: string;
};

/**
 * Server-side exchange of a Spotify authorization code for a refresh token.
 * Doing this server-side keeps the client secret off the wire from the
 * desktop's browser to accounts.spotify.com, even though both ends live in
 * the same process.
 *
 * We also fetch the user's display name so the desktop UI can show
 * "Connected as <Name>" after a successful link.
 */
export async function POST(request: Request) {
  let body: ExchangeBody;
  try {
    body = (await request.json()) as ExchangeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code, clientId, clientSecret, redirectUri } = body;
  if (!code || !clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: "Missing one of: code, clientId, clientSecret, redirectUri" },
      { status: 400 },
    );
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );

  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    let message = `Spotify token exchange failed (${tokenRes.status})`;
    try {
      const err = (await tokenRes.json()) as { error_description?: string };
      if (err.error_description) message = err.error_description;
    } catch {
      // ignore
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const token = (await tokenRes.json()) as SpotifyTokenResponse;
  if (!token.refresh_token) {
    return NextResponse.json(
      { error: "Spotify did not return a refresh token" },
      { status: 502 },
    );
  }

  let displayName: string | undefined;
  try {
    const meRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (meRes.ok) {
      const me = (await meRes.json()) as SpotifyUserResponse;
      displayName = me.display_name ?? me.id;
    }
  } catch {
    // best-effort only; refresh token is still good
  }

  return NextResponse.json({
    refreshToken: token.refresh_token,
    displayName,
  });
}
