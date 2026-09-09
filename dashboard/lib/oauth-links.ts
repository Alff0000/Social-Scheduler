/*
  Builds a Facebook Login OAuth dialog URL for a Meta app — the "implicit grant" shape
  (response_type=token, redirect_uri pointed at Meta's own generic success page) rather
  than an authorization-code exchange, because this install has no OAuth callback route
  for Instagram/Facebook (see lib/facebook-connect.ts): the existing connect flow already
  expects a person to paste a USER ACCESS TOKEN they obtained some other way. This link is
  that "some other way" — open it, log in, and https://www.facebook.com/connect/
  login_success.html echoes the token back in the URL fragment to copy from the address
  bar. No server-side redirect handling needed on either end.

  DEFAULT_SCOPES is a reasonable starting point for Instagram Business publishing via the
  Facebook Login path (config.graphBase = graph.facebook.com — see lib/config.ts), not a
  guarantee: Meta renames and re-scopes these fairly often (this codebase's own
  reference.md flags several examples), and the exact set your app needs depends on which
  products you added to it in Meta for Developers. Both fields are editable for exactly
  that reason.
*/

export const DEFAULT_REDIRECT_URI = "https://www.facebook.com/connect/login_success.html";

export const DEFAULT_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
];

export function buildFacebookOAuthUrl(
  appId: string,
  graphVersion: string,
  redirectUri: string,
  scopes: string[],
): string {
  const version = graphVersion.startsWith("v") ? graphVersion : `v${graphVersion}`;
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: scopes.join(","),
    response_type: "token",
  });
  return `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`;
}
