# Bruno API test

Open this directory as a collection in Bruno and select the `Local`
environment. Start the backend, log in through the frontend, and use the
frontend's **Copy access token** button.

In Bruno's environment editor, enter the copied token as the secret
`accessToken` value. Bruno stores the value locally rather than writing it to
`environments/Local.bru`.

Run **Get Top Artists** to request:

```text
GET http://127.0.0.1:3000/api/top/artists
```

The request tests for a `200` response and verifies that every result contains
only a non-empty artist `name`. The Local environment also exposes
`timeRange`, `limit`, and `offset` for changing the Spotify query.

With the Bruno CLI installed, the same test can be run from this directory:

```bash
bru run get-top-artists.bru \
  --env Local \
  --env-var accessToken=YOUR_COPIED_ACCESS_TOKEN
```
