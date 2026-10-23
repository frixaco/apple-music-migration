// Standalone Google sign-in for the YouTube scripts. Writes secrets/google-youtube-token.json
// and makes no YouTube API calls, so it never creates or changes playlists.
import { randomBytes } from "node:crypto";
import { exchangeAuthCode, readOAuthClient, tokenPath, writeToken, youtubeAuthUrl } from "./lib/youtube-auth";

const port = 4174;
const redirectUri = `http://localhost:${port}`;
const client = readOAuthClient();
const state = randomBytes(16).toString("hex");
const authUrl = youtubeAuthUrl(client, redirectUri, state);

const server = Bun.serve({
  port,
  hostname: "localhost",
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname !== "/") {
      return new Response("Not found", { status: 404 });
    }

    const code = url.searchParams.get("code");

    if (!code) {
      return Response.redirect(authUrl.toString(), 302);
    }

    if (url.searchParams.get("state") !== state) {
      return new Response("State mismatch. Restart bun run auth:youtube.", { status: 400 });
    }

    try {
      const token = await exchangeAuthCode(client, code, redirectUri);

      if (!token.refresh_token) {
        throw new Error("Google returned no refresh_token.");
      }

      writeToken(token);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      return new Response("Token exchange failed. See terminal.", { status: 500 });
    }

    console.log(`Saved ${tokenPath}.`);
    setTimeout(() => server.stop(), 100);

    return new Response("Signed in. You can close this tab.");
  },
});

console.log(`Open ${redirectUri} to sign in to Google.`);
