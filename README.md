# Spotify Profile Demo

This Vite application authenticates users with Spotify's Authorization Code
flow with PKCE. Authentication and Spotify Web API requests run in the browser;
there is no backend server.

## Configuration

Copy `.env.example` to `.env` and enter the Spotify application client ID:

```dotenv
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id
```

The client ID is safe to expose to the browser. Do not add a Spotify client
secret to a `VITE_` variable or otherwise include it in frontend code.

Register the following redirect URI in the Spotify Developer Dashboard:

```text
http://127.0.0.1:5173/callback
```

Use `127.0.0.1` when opening the application so that the PKCE verifier remains
available to the callback through the same local-storage origin.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://127.0.0.1:5173`.

## Verification

```bash
npm run build
```
