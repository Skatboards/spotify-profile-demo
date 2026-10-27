# Bruno API test

Open this directory as a collection in Bruno and select the `Local`
environment. Start the backend, log in through the frontend, and use the
frontend's **Copy access token** button.

In Bruno's environment editor, enter the copied token as the secret
`accessToken` value. Bruno stores the value locally rather than writing it to
`environments/Local.bru`.

The collection contains requests for API discovery, profile data, top artists
and tracks, saved tracks and albums, playlists, current playback, recent
history, and search. It also contains a missing-token request that expects a
normalized `401` response.

Run **Get Top Artists** to request:

```text
GET http://127.0.0.1:3000/api/top/artists
```

The request tests for a `200` response and verifies the normalized collection
and HATEOAS structure. The environments expose `timeRange`, `limit`, `offset`,
`searchQuery`, and `searchType` for changing requests.

With the Bruno CLI installed, run the full collection from this directory:

```bash
bru run \
  --env Local \
  --env-var accessToken=YOUR_COPIED_ACCESS_TOKEN
```

To run only the top-artists request, provide `get-top-artists.bru` after
`bru run`.
