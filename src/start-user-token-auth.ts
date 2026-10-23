import { readRequiredEnv, upsertEnvValue } from "./lib/env";

const developerToken = readRequiredEnv("APPLE_MUSIC_DEVELOPER_TOKEN");
const port = Number(Bun.env.PORT ?? "4173");
const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return htmlResponse(renderAuthPage(developerToken));
    }

    if (request.method === "POST" && url.pathname === "/music-user-token") {
      const body = (await request.json()) as { musicUserToken?: string };
      const musicUserToken = body.musicUserToken?.trim();

      if (!musicUserToken) {
        return jsonResponse({ error: "musicUserToken is required" }, 400);
      }

      upsertEnvValue(".env", "APPLE_MUSIC_USER_TOKEN", musicUserToken);
      console.log("Saved APPLE_MUSIC_USER_TOKEN to .env.");

      return jsonResponse({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Open http://localhost:${server.port} to authorize Apple Music.`);

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function renderAuthPage(token: string): string {
  const serializedToken = JSON.stringify(token);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Apple Music Authorization</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f7f8;
        color: #171717;
      }

      main {
        width: min(520px, calc(100vw - 32px));
        padding: 28px;
        border: 1px solid #d8dcdf;
        border-radius: 8px;
        background: white;
      }

      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }

      p {
        margin: 0 0 18px;
        line-height: 1.5;
        color: #464b50;
      }

      button {
        height: 42px;
        padding: 0 18px;
        border: 0;
        border-radius: 6px;
        background: #111;
        color: white;
        font: inherit;
        cursor: pointer;
      }

      button:disabled {
        cursor: wait;
        opacity: 0.65;
      }

      #status {
        margin-top: 16px;
        min-height: 22px;
        color: #275f3f;
      }

      #status[data-error="true"] {
        color: #9f1d1d;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Authorize Apple Music</h1>
      <p>Sign in with Apple Music so the migration script can add matched songs to your account.</p>
      <button id="authorize" disabled>Authorize</button>
      <div id="status"></div>
    </main>
    <script>
      const developerToken = ${serializedToken};
      const button = document.getElementById("authorize");
      const status = document.getElementById("status");

      status.textContent = "Loading MusicKit...";

      document.addEventListener("musickitloaded", configureMusicKit);
      loadMusicKit();

      async function configureMusicKit() {
        try {
          await MusicKit.configure({
            developerToken,
            app: {
              name: "YouTube to Apple Music Migration",
              build: "1.0.0"
            }
          });

          button.disabled = false;
          status.textContent = "Ready.";
        } catch (error) {
          showError(error);
        }
      }

      function loadMusicKit() {
        const script = document.createElement("script");
        script.src = "https://js-cdn.music.apple.com/musickit/v1/musickit.js";
        script.async = true;
        script.onerror = () => showError(new Error("Failed to load MusicKit JS."));
        document.head.appendChild(script);
      }

      button.addEventListener("click", async () => {
        button.disabled = true;
        status.removeAttribute("data-error");
        status.textContent = "Waiting for Apple authorization...";

        try {
          const music = MusicKit.getInstance();
          const musicUserToken = await music.authorize();

          await fetch("/music-user-token", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ musicUserToken })
          });

          status.textContent = "Authorized. You can close this tab.";
        } catch (error) {
          button.disabled = false;
          showError(error);
        }
      });

      function showError(error) {
        status.dataset.error = "true";
        status.textContent = error && error.message ? error.message : String(error);
      }
    </script>
  </body>
</html>`;
}
