# Spotify Profile Demo

This project contains two independent applications:

- `frontend/`: a Vite application that authenticates users with Spotify's
  Authorization Code flow with PKCE.
- `backend/`: a minimal Express API that forwards the authenticated user's
  request to Spotify's top-artists endpoint.

The frontend owns authentication. The backend does not store or refresh Spotify
tokens and does not require a Spotify client secret.

## Requirements

- Node.js 20.19 or newer (required by the current Vite version)
- A Spotify application configured in the Spotify Developer Dashboard

## Frontend configuration

Copy `frontend/.env.example` to `frontend/.env` and enter the Spotify
application client ID:

```dotenv
VITE_CLIENT_ID=your_spotify_client_id
```

The client ID is safe to expose to the browser. Do not add a Spotify client
secret to a `VITE_` variable or otherwise include it in frontend code.

Register this redirect URI in the Spotify Developer Dashboard:

```text
http://127.0.0.1:5173/callback
```

Use `127.0.0.1` when opening the application so that the PKCE verifier remains
available to the callback through the same local-storage origin.

## Install

Each directory is an independent npm package with its own lockfile:

```bash
npm install
npm --prefix frontend install
npm --prefix backend install
```

## Run locally

Start the frontend and backend together:

```bash
npm run dev
```

The frontend is available at `http://127.0.0.1:5173` and the backend listens on
`http://127.0.0.1:3000`. Set `PORT` or `FRONTEND_ORIGIN` when starting the
backend to override its defaults.

After logging in, use **Copy access token** to copy the current in-memory token
for manual testing. Treat the token as a password: only paste it into tools you
trust, and do not commit or share it. Log in again after this application's
scope configuration changes so the copied token includes `user-top-read`.

Request the authenticated user's top artists with:

```bash
curl "http://127.0.0.1:3000/api/top/artists?time_range=medium_term&limit=5&offset=0" \
  --header "Authorization: Bearer YOUR_COPIED_ACCESS_TOKEN"
```

Supported query parameters are `time_range`, `limit`, and `offset`. Valid time
ranges are `short_term` (approximately four weeks), `medium_term`
(approximately six months and the default), and `long_term` (approximately one
year). Successful responses contain only artist names:

```json
[
  { "name": "First Artist" },
  { "name": "Second Artist" }
]
```

Spotify error responses and status codes are returned unchanged.

## Verification

```bash
npm run build
```
