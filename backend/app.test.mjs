import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "./app.mjs";

const artist = {
    id: "artist-1",
    name: "First Artist",
    images: [{ url: "https://images.example/artist.jpg" }],
    external_urls: { spotify: "https://open.spotify.com/artist/artist-1" }
};

const album = {
    id: "album-1",
    name: "First Album",
    artists: [artist],
    release_date: "2026-01-02",
    total_tracks: 10,
    images: [{ url: "https://images.example/album.jpg" }],
    external_urls: { spotify: "https://open.spotify.com/album/album-1" }
};

const track = {
    id: "track-1",
    type: "track",
    name: "First Track",
    artists: [artist],
    album,
    duration_ms: 180000,
    explicit: false,
    external_urls: { spotify: "https://open.spotify.com/track/track-1" }
};

const playlist = {
    id: "playlist-1",
    name: "First Playlist",
    description: "A playlist",
    owner: { id: "owner-1", display_name: "Owner" },
    public: true,
    collaborative: false,
    items: { total: 12 },
    images: [{ url: "https://images.example/playlist.jpg" }],
    external_urls: { spotify: "https://open.spotify.com/playlist/playlist-1" }
};

test("GET /api exposes the proxy resources without authentication", async () => {
    await withServer(undefined, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api`);
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(body._links.self.href, "/api");
        assert.equal(body._links.profile.href, "/api/profile");
        assert.equal(body._links.topArtists.href, "/api/top/artists");
        assert.equal(body._links.search.href, "/api/search");
    });
});

test("authenticated routes map to Spotify and normalize responses", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url: new URL(url), options });

        switch (url.pathname) {
            case "/v1/me":
                return jsonResponse({
                    account_id: "account-1",
                    display_name: "Listener",
                    product: "premium",
                    images: [{ url: "https://images.example/profile.jpg" }],
                    external_urls: { spotify: "https://open.spotify.com/user/user-1" }
                });
            case "/v1/me/top/artists":
                return jsonResponse(offsetPage([artist], url, 2));
            case "/v1/me/top/tracks":
                return jsonResponse(offsetPage([track], url, 2));
            case "/v1/me/tracks":
                return jsonResponse(offsetPage([{ added_at: "2026-01-01", track }], url));
            case "/v1/me/albums":
                return jsonResponse(offsetPage([{ added_at: "2026-01-01", album }], url));
            case "/v1/me/playlists":
                return jsonResponse(offsetPage([playlist], url));
            case "/v1/me/player/currently-playing":
                return jsonResponse({
                    is_playing: true,
                    progress_ms: 1000,
                    currently_playing_type: "track",
                    item: track
                });
            case "/v1/me/player/recently-played":
                return jsonResponse({
                    items: [{
                        played_at: "2026-01-01T00:00:00Z",
                        context: {
                            type: "album",
                            external_urls: { spotify: "https://open.spotify.com/album/album-1" }
                        },
                        track
                    }],
                    limit: 1,
                    next: "https://api.spotify.com/v1/me/player/recently-played?limit=1&after=200",
                    previous: null,
                    cursors: { after: "200", before: "100" }
                });
            case "/v1/search":
                return jsonResponse({ artists: offsetPage([artist], url) });
            default:
                throw new Error(`Unexpected Spotify URL: ${url}`);
        }
    };

    await withServer(fetchImpl, async (baseUrl) => {
        const requests = [
            ["/api/profile", (body) => assert.equal(body.accountId, "account-1")],
            ["/api/top/artists?time_range=short_term&limit=1&offset=0", (body) => {
                assert.equal(body.items[0].name, "First Artist");
                assert.equal(body.page.total, 2);
                assert.equal(
                    body._links.next.href,
                    "/api/top/artists?time_range=short_term&limit=1&offset=1"
                );
            }],
            ["/api/top/tracks?limit=1&offset=0", (body) => {
                assert.equal(body.items[0].name, "First Track");
                assert.equal(body.items[0].album.name, "First Album");
            }],
            ["/api/library/tracks?market=US&limit=1&offset=0", (body) => {
                assert.equal(body.items[0].savedAt, "2026-01-01");
                assert.equal(body.items[0].track.id, "track-1");
            }],
            ["/api/library/albums?limit=1&offset=0", (body) => {
                assert.equal(body.items[0].album.id, "album-1");
            }],
            ["/api/playlists?limit=1&offset=0", (body) => {
                assert.equal(body.items[0].itemCount, 12);
            }],
            ["/api/player/currently-playing?additional_types=track%2Cepisode", (body) => {
                assert.equal(body.isPlaying, true);
                assert.equal(body.item.id, "track-1");
            }],
            ["/api/player/recently-played?limit=1&after=100", (body) => {
                assert.equal(body.items[0].playedAt, "2026-01-01T00:00:00Z");
                assert.equal(
                    body._links.next.href,
                    "/api/player/recently-played?limit=1&after=200"
                );
            }],
            ["/api/search?q=First&type=artist&limit=1&offset=0", (body) => {
                assert.equal(body.results.artists.items[0].id, "artist-1");
            }]
        ];

        for (const [path, assertBody] of requests) {
            const response = await authorizedFetch(`${baseUrl}${path}`);
            assert.equal(response.status, 200, path);
            assertBody(await response.json());
        }
    });

    assert.equal(calls.length, 9);
    assert.ok(calls.every((call) => call.options.headers.Authorization === "Bearer test-token"));
    assert.equal(calls[1].url.searchParams.get("time_range"), "short_term");
    assert.equal(calls[3].url.searchParams.get("market"), "US");
    assert.equal(calls[8].url.searchParams.get("q"), "First");
    assert.equal(calls[8].url.searchParams.get("type"), "artist");
});

test("all protected resources reject missing and malformed bearer tokens", async () => {
    const protectedPaths = [
        "/api/profile",
        "/api/top/artists",
        "/api/top/tracks",
        "/api/library/tracks",
        "/api/library/albums",
        "/api/playlists",
        "/api/player/currently-playing",
        "/api/player/recently-played",
        "/api/search?q=test&type=artist"
    ];

    await withServer(async () => {
        throw new Error("Spotify must not be called");
    }, async (baseUrl) => {
        for (const path of protectedPaths) {
            const response = await fetch(`${baseUrl}${path}`);
            const body = await response.json();

            assert.equal(response.status, 401, path);
            assert.equal(body.error.code, "missing_access_token");
        }

        const malformed = await fetch(`${baseUrl}/api/profile`, {
            headers: { Authorization: "Basic invalid" }
        });
        assert.equal(malformed.status, 401);
    });
});

test("query validation rejects unsupported and invalid values before Spotify is called", async () => {
    const invalidPaths = [
        "/api/top/artists?unknown=value",
        "/api/top/artists?time_range=forever",
        "/api/top/tracks?limit=0",
        "/api/library/tracks?limit=51",
        "/api/library/albums?offset=-1",
        "/api/player/currently-playing?market=USA",
        "/api/player/recently-played?after=1&before=2",
        "/api/search?type=artist",
        "/api/search?q=test",
        "/api/search?q=test&type=show",
        "/api/playlists?limit=1&limit=2"
    ];

    await withServer(async () => {
        throw new Error("Spotify must not be called");
    }, async (baseUrl) => {
        for (const path of invalidPaths) {
            const response = await authorizedFetch(`${baseUrl}${path}`);
            const body = await response.json();

            assert.equal(response.status, 400, path);
            assert.equal(body.error.status, 400);
        }
    });
});

test("currently playing normalizes Spotify 204 into a linked empty resource", async () => {
    await withServer(async () => new Response(null, { status: 204 }), async (baseUrl) => {
        const response = await authorizedFetch(
            `${baseUrl}/api/player/currently-playing`
        );
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.isPlaying, false);
        assert.equal(body.item, null);
        assert.equal(body._links.self.href, "/api/player/currently-playing");
        assert.equal(body._links.recentlyPlayed.href, "/api/player/recently-played");
    });
});

test("Spotify errors keep their status and normalize their body", async () => {
    const fetchImpl = async (_url, options) => {
        const status = Number(options.headers.Authorization.replace("Bearer ", ""));
        const headers = status === 429 ? { "Retry-After": "12" } : {};
        return jsonResponse(
            { error: { status, message: `Spotify ${status}` } },
            { status, headers }
        );
    };

    await withServer(fetchImpl, async (baseUrl) => {
        for (const status of [401, 403, 429]) {
            const response = await fetch(`${baseUrl}/api/profile`, {
                headers: { Authorization: `Bearer ${status}` }
            });
            const body = await response.json();

            assert.equal(response.status, status);
            assert.deepEqual(body.error, {
                status,
                code: "spotify_error",
                message: `Spotify ${status}`
            });

            if (status === 429) {
                assert.equal(response.headers.get("retry-after"), "12");
            }
        }
    });
});

test("network failures and malformed Spotify payloads return 502", async () => {
    await withServer(async () => {
        throw new Error("network unavailable");
    }, async (baseUrl) => {
        const response = await authorizedFetch(`${baseUrl}/api/profile`);
        const body = await response.json();

        assert.equal(response.status, 502);
        assert.equal(body.error.code, "spotify_unavailable");
    });

    await withServer(async () => jsonResponse({ items: "not an array" }), async (baseUrl) => {
        const response = await authorizedFetch(`${baseUrl}/api/top/artists`);
        const body = await response.json();

        assert.equal(response.status, 502);
        assert.equal(body.error.code, "invalid_spotify_response");
    });
});

test("unsupported methods, unknown routes, and CORS preflight are handled", async () => {
    await withServer(undefined, async (baseUrl) => {
        const methodResponse = await fetch(`${baseUrl}/api/profile`, {
            method: "POST"
        });
        const methodBody = await methodResponse.json();
        assert.equal(methodResponse.status, 405);
        assert.equal(methodResponse.headers.get("allow"), "GET, OPTIONS");
        assert.equal(methodBody.error.code, "method_not_allowed");

        const missingResponse = await fetch(`${baseUrl}/api/unknown`);
        const missingBody = await missingResponse.json();
        assert.equal(missingResponse.status, 404);
        assert.equal(missingBody.error.code, "not_found");

        const preflight = await fetch(`${baseUrl}/api/profile`, {
            method: "OPTIONS",
            headers: {
                Origin: "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization"
            }
        });
        assert.equal(preflight.status, 204);
        assert.equal(
            preflight.headers.get("access-control-allow-origin"),
            "http://127.0.0.1:5173"
        );
    });
});

async function withServer(fetchImpl, callback) {
    const app = createApp(fetchImpl ? { fetchImpl } : {});
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
        await callback(baseUrl);
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
}

function authorizedFetch(url) {
    return fetch(url, {
        headers: { Authorization: "Bearer test-token" }
    });
}

function jsonResponse(body, init = {}) {
    return new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        headers: {
            "Content-Type": "application/json",
            ...init.headers
        }
    });
}

function offsetPage(items, url, total = items.length) {
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const nextUrl = new URL(url);
    nextUrl.searchParams.set("limit", String(limit));
    nextUrl.searchParams.set("offset", String(offset + limit));

    return {
        items,
        limit,
        offset,
        total,
        next: offset + limit < total ? nextUrl.toString() : null,
        previous: null
    };
}
