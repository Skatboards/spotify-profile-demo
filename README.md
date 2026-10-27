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
VITE_REDIRECT_URI=http://127.0.0.1:5173/callback
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

## Bruno API test

The [`bruno/`](bruno/) directory contains a Bruno collection for the top-artists
endpoint. Open that directory in Bruno, select the `Local` environment, and set
its secret `accessToken` variable to a token copied from the frontend. The
request verifies the `200` response and artist-only response shape. See the
[Bruno test instructions](bruno/README.md) for GUI and CLI usage.

## Verification

```bash
npm run build
```

## Deploy to a DigitalOcean Ubuntu droplet

The production stack uses Docker Compose for the frontend and backend. Both
published ports bind only to the droplet's loopback interface. Host-managed
Nginx is the public entry point and handles HTTPS with Certbot.

### 1. Prepare DNS and the host

Create an `A` record for the application domain pointing to the droplet's IPv4
address. If the domain has an `AAAA` record, it must point to the same droplet.

Install Docker Engine and the Docker Compose plugin by following Docker's
[Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/).
Then install the host proxy and certificate tools:

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx gettext-base ufw
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Docker-published ports can bypass some firewall rules. The production Compose
file avoids that exposure by binding ports 3000 and 8080 explicitly to
`127.0.0.1`; do not change those mappings to a public interface.

### 2. Clone and configure the application

Clone the repository on the droplet:

```bash
sudo mkdir -p /opt/spotify-profile-demo
sudo chown "$USER":"$USER" /opt/spotify-profile-demo
git clone YOUR_REPOSITORY_URL /opt/spotify-profile-demo
cd /opt/spotify-profile-demo
```

Create the uncommitted production environment file:

```bash
cp deploy/production.env.example deploy/production.env
chmod 600 deploy/production.env
```

Set these values in `deploy/production.env`:

```dotenv
APP_DOMAIN=spotify.example.com
LETSENCRYPT_EMAIL=admin@example.com
VITE_CLIENT_ID=your_spotify_client_id
```

`APP_DOMAIN` must contain only the hostname, without `https://` or a path. The
frontend build derives `https://${APP_DOMAIN}/callback`, and the backend allows
`https://${APP_DOMAIN}` as its frontend origin. Changing either `APP_DOMAIN` or
`VITE_CLIENT_ID` requires rebuilding the frontend image.

### 3. Build and start the containers

Validate the resolved Compose configuration, then build and start both services:

```bash
sudo docker compose \
  --env-file deploy/production.env \
  -f compose.yaml \
  config

sudo docker compose \
  --env-file deploy/production.env \
  -f compose.yaml \
  up -d --build
```

Check that both containers become healthy:

```bash
sudo docker compose \
  --env-file deploy/production.env \
  -f compose.yaml \
  ps

curl http://127.0.0.1:8080/healthz
curl http://127.0.0.1:3000/healthz
```

### 4. Configure Nginx and HTTPS

Load the deployment values into the current shell and render the tracked Nginx
template. Restricting `envsubst` to `APP_DOMAIN` preserves Nginx variables such
as `$host` and `$remote_addr`.

```bash
set -a
. ./deploy/production.env
set +a

envsubst '${APP_DOMAIN}' < deploy/nginx-site.conf.template \
  | sudo tee /etc/nginx/sites-available/spotify-profile-demo > /dev/null

sudo ln -s /etc/nginx/sites-available/spotify-profile-demo \
  /etc/nginx/sites-enabled/spotify-profile-demo
sudo nginx -t
sudo systemctl reload nginx
```

After DNS resolves to the droplet, obtain the certificate and enable HTTPS
redirection:

```bash
sudo certbot --nginx \
  --domain "$APP_DOMAIN" \
  --email "$LETSENCRYPT_EMAIL" \
  --agree-tos \
  --no-eff-email \
  --redirect

sudo certbot renew --dry-run
```

Do not render the HTTP template over the active site after Certbot has added
the TLS configuration. Re-render it only when intentionally rebuilding the
host Nginx configuration, then rerun Certbot.

### 5. Configure Spotify and verify

Add the expanded redirect URI in the Spotify Developer Dashboard. For example,
when `APP_DOMAIN=spotify.example.com`, register:

```text
https://spotify.example.com/callback
```

Spotify requires HTTPS for non-loopback redirect URIs. Log in again through the
deployed frontend so the access token is created with the production callback
and the `user-top-read` scope.

Verify the public application and API:

```bash
curl --fail --show-error "https://${APP_DOMAIN}/"

curl "https://${APP_DOMAIN}/api/top/artists?time_range=medium_term&limit=5&offset=0" \
  --header "Authorization: Bearer YOUR_COPIED_ACCESS_TOKEN"
```

Ports 3000 and 8080 should not be reachable through the droplet's public IP.

### Deploy updates

Pull the new revision and rebuild the Compose services:

```bash
cd /opt/spotify-profile-demo
git pull --ff-only

sudo docker compose \
  --env-file deploy/production.env \
  -f compose.yaml \
  up -d --build --remove-orphans
```

Inspect service state and logs with:

```bash
sudo docker compose \
  --env-file deploy/production.env \
  -f compose.yaml \
  ps

sudo docker compose \
  --env-file deploy/production.env \
  -f compose.yaml \
  logs --tail=100
```
