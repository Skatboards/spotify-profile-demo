# curl Commands

## Authentication header

After logging in through the frontend, use **Copy access token** and create a
`spotify-header.txt` file containing the complete authorization header:

```text
Authorization: Bearer YOUR_COPIED_ACCESS_TOKEN
```

## Health check

No authentication is required.

```bash
curl "https://spotify-profile.natreese.dev/healthz"
```

## API discovery

No authentication is required.

```bash
curl "https://spotify-profile.natreese.dev/api/"
```

## Current user's profile

```bash
curl "https://spotify-profile.natreese.dev/api/profile" \
  --header @spotify-header.txt
```

## Current user's top artists

Supported time ranges are `short_term`, `medium_term`, and `long_term`.

```bash
curl "https://spotify-profile.natreese.dev/api/top/artists?time_range=medium_term&limit=20&offset=0" \
  --header @spotify-header.txt
```

## Current user's top tracks

```bash
curl "https://spotify-profile.natreese.dev/api/top/tracks?time_range=medium_term&limit=20&offset=0" \
  --header @spotify-header.txt
```

## Saved tracks

`market` accepts a two-letter country code.

```bash
curl "https://spotify-profile.natreese.dev/api/library/tracks?market=US&limit=20&offset=0" \
  --header @spotify-header.txt
```

## Saved albums

```bash
curl "https://spotify-profile.natreese.dev/api/library/albums?market=US&limit=20&offset=0" \
  --header @spotify-header.txt
```

## Current user's playlists

```bash
curl "https://spotify-profile.natreese.dev/api/playlists?limit=20&offset=0" \
  --header @spotify-header.txt
```

## Currently playing

`additional_types` accepts `track`, `episode`, or both.

```bash
curl "https://spotify-profile.natreese.dev/api/player/currently-playing?market=US&additional_types=track,episode" \
  --header @spotify-header.txt
```

## Recently played

The basic request returns the most recent items:

```bash
curl "https://spotify-profile.natreese.dev/api/player/recently-played?limit=20" \
  --header @spotify-header.txt
```

To paginate by Unix timestamp in milliseconds, use either `after`:

```bash
curl "https://spotify-profile.natreese.dev/api/player/recently-played?limit=20&after=1735689600000" \
  --header @spotify-header.txt
```

or `before`:

```bash
curl "https://spotify-profile.natreese.dev/api/player/recently-played?limit=20&before=1735689600000" \
  --header @spotify-header.txt
```

Do not send `after` and `before` together.

## Search

Search requires both `q` and `type`. Supported types are `artist`, `track`,
`album`, and `playlist`, including comma-separated combinations.

```bash
curl --get "https://spotify-profile.natreese.dev/api/search" \
  --header @spotify-header.txt \
  --data-urlencode "q=Miles Davis" \
  --data-urlencode "type=artist,album" \
  --data-urlencode "market=US" \
  --data-urlencode "limit=20" \
  --data-urlencode "offset=0"
```
