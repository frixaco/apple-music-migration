import { generateDeveloperToken, loadDeveloperTokenConfig } from "./lib/apple-music-developer-token";

const token = Bun.env.APPLE_MUSIC_DEVELOPER_TOKEN?.trim() || generateDeveloperToken(loadDeveloperTokenConfig()).token;
const response = await fetch("https://api.music.apple.com/v1/test", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
const body = await response.text();

if (!response.ok) {
  throw new Error(`Apple Music developer token test failed: ${response.status} ${body}`);
}

console.log(`Apple Music developer token test passed: ${response.status}`);
