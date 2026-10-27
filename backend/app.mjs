import cors from "cors";
import express from "express";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const TIME_RANGES = new Set(["short_term", "medium_term", "long_term"]);
const SEARCH_TYPES = new Set(["artist", "track", "album", "playlist"]);
const ADDITIONAL_TYPES = new Set(["track", "episode"]);

const endpointLinks = {
    self: { href: "/api" },
    profile: { href: "/api/profile" },
    topArtists: { href: "/api/top/artists" },
    topTracks: { href: "/api/top/tracks" },
    savedTracks: { href: "/api/library/tracks" },
    savedAlbums: { href: "/api/library/albums" },
    playlists: { href: "/api/playlists" },
    currentlyPlaying: { href: "/api/player/currently-playing" },
    recentlyPlayed: { href: "/api/player/recently-played" },
    search: { href: "/api/search" }
};

const queryValidators = {
    time_range: (value) => TIME_RANGES.has(value),
    limit: (value) => isIntegerInRange(value, 1, 50),
    offset: (value) => isIntegerInRange(value, 0),
    market: (value) => /^[A-Za-z]{2}$/.test(value),
    additional_types: (value) => isAllowedList(value, ADDITIONAL_TYPES),
    after: (value) => isIntegerInRange(value, 0),
    before: (value) => isIntegerInRange(value, 0),
    q: (value) => value.trim().length > 0,
    type: (value) => isAllowedList(value, SEARCH_TYPES)
};

export function createApp({ fetchImpl = globalThis.fetch } = {}) {
    const app = express();
    const frontendOrigin = process.env.FRONTEND_ORIGIN
        ?? "http://127.0.0.1:5173";

    app.use(cors({
        origin: frontendOrigin,
        methods: ["GET"],
        allowedHeaders: ["Authorization"]
    }));

    app.get("/healthz", (_request, response) => {
        response.json({ status: "ok" });
    });

    app.use("/api", (_request, response, next) => {
        response.set("Cache-Control", "no-store");
        next();
    });

    registerGet(app, "/api", (request, response) => {
        response.json({
            name: "Spotify Profile Demo API",
            _links: endpointLinks
        });
    });

    registerSpotifyGet(app, fetchImpl, {
        route: "/api/profile",
        spotifyPath: "/me",
        queryParameters: [],
        transform: (body) => transformProfile(body)
    });

    registerSpotifyGet(app, fetchImpl, {
        route: "/api/top/artists",
        spotifyPath: "/me/top/artists",
        queryParameters: ["time_range", "limit", "offset"],
        transform: (body, request) => transformOffsetCollection(
            body,
            request,
            "/api/top/artists",
            ["time_range", "limit", "offset"],
            transformArtist
        )
    });

    registerSpotifyGet(app, fetchImpl, {
        route: "/api/top/tracks",
        spotifyPath: "/me/top/tracks",
        queryParameters: ["time_range", "limit", "offset"],
        transform: (body, request) => transformOffsetCollection(
            body,
            request,
            "/api/top/tracks",
            ["time_range", "limit", "offset"],
            transformTrack
        )
    });

    registerSpotifyGet(app, fetchImpl, {
        route: "/api/library/tracks",
        spotifyPath: "/me/tracks",
        queryParameters: ["market", "limit", "offset"],
        transform: (body, request) => transformOffsetCollection(
            body,
            request,
            "/api/library/tracks",
            ["market", "limit", "offset"],
            (item) => {
                const savedTrack = requireObject(item, "saved track");

                return {
                    savedAt: optionalString(savedTrack.added_at),
                    track: transformTrack(savedTrack.track)
                };
            }
        )
    });

    registerSpotifyGet(app, fetchImpl, {
        route: "/api/library/albums",
        spotifyPath: "/me/albums",
        queryParameters: ["market", "limit", "offset"],
        transform: (body, request) => transformOffsetCollection(
            body,
            request,
            "/api/library/albums",
            ["market", "limit", "offset"],
            (item) => {
                const savedAlbum = requireObject(item, "saved album");

                return {
                    savedAt: optionalString(savedAlbum.added_at),
                    album: transformAlbum(savedAlbum.album)
                };
            }
        )
    });

    registerSpotifyGet(app, fetchImpl, {
        route: "/api/playlists",
        spotifyPath: "/me/playlists",
        queryParameters: ["limit", "offset"],
        transform: (body, request) => transformOffsetCollection(
            body,
            request,
            "/api/playlists",
            ["limit", "offset"],
            transformPlaylist
        )
    });

    registerSpotifyGet(app, fetchImpl, {
        route: "/api/player/currently-playing",
        spotifyPath: "/me/player/currently-playing",
        queryParameters: ["market", "additional_types"],
        transform: (body) => transformCurrentlyPlaying(body),
        transformNoContent: () => transformCurrentlyPlaying(null)
    });

    registerSpotifyGet(app, fetchImpl, {
        route: "/api/player/recently-played",
        spotifyPath: "/me/player/recently-played",
        queryParameters: ["limit", "after", "before"],
        validateQuery: (query) => {
            if (query.has("after") && query.has("before")) {
                return "Query parameters 'after' and 'before' cannot be used together.";
            }

            return null;
        },
        transform: (body, request) => transformRecentlyPlayed(body, request)
    });

    registerSpotifyGet(app, fetchImpl, {
        route: "/api/search",
        spotifyPath: "/search",
        queryParameters: ["q", "type", "market", "limit", "offset"],
        requiredQueryParameters: ["q", "type"],
        transform: (body, request, query) => transformSearch(body, request, query)
    });

    app.use((request, response) => {
        sendError(response, request, 404, "not_found", "Not found.");
    });

    return app;
}

function registerSpotifyGet(app, fetchImpl, options) {
    registerGet(app, options.route, async (request, response) => {
        const authorization = request.get("authorization");

        if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
            sendError(
                response,
                request,
                401,
                "missing_access_token",
                "A Spotify bearer access token is required."
            );
            return;
        }

        const query = parseQuery(
            request,
            response,
            options.queryParameters,
            options.requiredQueryParameters ?? [],
            options.validateQuery
        );

        if (!query) {
            return;
        }

        const spotifyUrl = new URL(`${SPOTIFY_API_BASE}${options.spotifyPath}`);

        for (const [name, value] of query) {
            spotifyUrl.searchParams.set(name, value);
        }

        let spotifyResponse;

        try {
            spotifyResponse = await fetchImpl(spotifyUrl, {
                headers: { Authorization: authorization }
            });
        } catch {
            sendError(
                response,
                request,
                502,
                "spotify_unavailable",
                "Unable to reach Spotify."
            );
            return;
        }

        if (!spotifyResponse.ok) {
            await sendSpotifyError(response, request, spotifyResponse);
            return;
        }

        if (spotifyResponse.status === 204) {
            if (options.transformNoContent) {
                response.status(200).json(options.transformNoContent(request, query));
                return;
            }

            sendError(
                response,
                request,
                502,
                "invalid_spotify_response",
                "Spotify returned an unexpected empty response."
            );
            return;
        }

        try {
            const spotifyBody = await spotifyResponse.json();
            const body = options.transform(spotifyBody, request, query);
            response.status(spotifyResponse.status).json(body);
        } catch {
            sendError(
                response,
                request,
                502,
                "invalid_spotify_response",
                "Spotify returned an unusable response."
            );
        }
    });
}

function registerGet(app, route, handler) {
    app.get(route, handler);
    app.all(route, (request, response) => {
        response.set("Allow", "GET, OPTIONS");
        sendError(
            response,
            request,
            405,
            "method_not_allowed",
            "Method not allowed."
        );
    });
}

function parseQuery(request, response, allowed, required, customValidation) {
    const query = new URL(request.originalUrl, "http://localhost").searchParams;
    const allowedNames = new Set(allowed);

    for (const name of query.keys()) {
        if (!allowedNames.has(name)) {
            sendError(
                response,
                request,
                400,
                "unsupported_query_parameter",
                `Query parameter '${name}' is not supported.`
            );
            return null;
        }

        if (query.getAll(name).length > 1) {
            sendError(
                response,
                request,
                400,
                "invalid_query_parameter",
                `Query parameter '${name}' must be supplied only once.`
            );
            return null;
        }
    }

    for (const name of required) {
        if (!query.has(name) || query.get(name)?.trim() === "") {
            sendError(
                response,
                request,
                400,
                "missing_query_parameter",
                `Query parameter '${name}' is required.`
            );
            return null;
        }
    }

    for (const [name, value] of query) {
        const validator = queryValidators[name];

        if (validator && !validator(value)) {
            sendError(
                response,
                request,
                400,
                "invalid_query_parameter",
                `Query parameter '${name}' has an invalid value.`
            );
            return null;
        }
    }

    const customMessage = customValidation?.(query);

    if (customMessage) {
        sendError(
            response,
            request,
            400,
            "invalid_query_parameter",
            customMessage
        );
        return null;
    }

    return query;
}

async function sendSpotifyError(response, request, spotifyResponse) {
    if (spotifyResponse.status === 429) {
        const retryAfter = spotifyResponse.headers.get("retry-after");

        if (retryAfter) {
            response.set("Retry-After", retryAfter);
        }
    }

    let spotifyBody = null;

    try {
        spotifyBody = await spotifyResponse.json();
    } catch {
        // The normalized fallback below handles non-JSON Spotify errors.
    }

    const spotifyError = spotifyBody?.error;
    const message = typeof spotifyError?.message === "string"
        ? spotifyError.message
        : typeof spotifyBody?.error_description === "string"
            ? spotifyBody.error_description
            : "Spotify rejected the request.";

    sendError(
        response,
        request,
        spotifyResponse.status,
        "spotify_error",
        message
    );
}

function sendError(response, request, status, code, message) {
    response.status(status).json({
        error: { status, code, message },
        _links: {
            self: { href: request.originalUrl }
        }
    });
}

function transformProfile(body) {
    const profile = requireObject(body, "profile");
    const spotifyUrl = externalSpotifyUrl(profile);

    return {
        accountId: optionalString(profile.account_id),
        displayName: optionalString(profile.display_name),
        imageUrl: firstImageUrl(profile.images),
        product: optionalString(profile.product),
        spotifyUrl,
        _links: {
            self: { href: "/api/profile" },
            topArtists: endpointLinks.topArtists,
            topTracks: endpointLinks.topTracks,
            savedTracks: endpointLinks.savedTracks,
            savedAlbums: endpointLinks.savedAlbums,
            playlists: endpointLinks.playlists,
            currentlyPlaying: endpointLinks.currentlyPlaying,
            recentlyPlayed: endpointLinks.recentlyPlayed,
            spotify: linkOrNull(spotifyUrl)
        }
    };
}

function transformArtist(value) {
    const artist = requireObject(value, "artist");
    const spotifyUrl = externalSpotifyUrl(artist);

    return {
        type: "artist",
        id: optionalString(artist.id),
        name: requiredString(artist.name, "artist name"),
        imageUrl: firstImageUrl(artist.images),
        spotifyUrl,
        _links: { spotify: linkOrNull(spotifyUrl) }
    };
}

function transformTrack(value) {
    const track = requireObject(value, "track");
    const spotifyUrl = externalSpotifyUrl(track);

    return {
        type: "track",
        id: optionalString(track.id),
        name: requiredString(track.name, "track name"),
        artists: transformArtistSummaries(track.artists),
        album: transformAlbumSummary(track.album),
        durationMs: optionalNumber(track.duration_ms),
        explicit: optionalBoolean(track.explicit),
        spotifyUrl,
        _links: { spotify: linkOrNull(spotifyUrl) }
    };
}

function transformAlbum(value) {
    const album = requireObject(value, "album");
    const spotifyUrl = externalSpotifyUrl(album);

    return {
        type: "album",
        id: optionalString(album.id),
        name: requiredString(album.name, "album name"),
        artists: transformArtistSummaries(album.artists),
        releaseDate: optionalString(album.release_date),
        totalTracks: optionalNumber(album.total_tracks),
        imageUrl: firstImageUrl(album.images),
        spotifyUrl,
        _links: { spotify: linkOrNull(spotifyUrl) }
    };
}

function transformPlaylist(value) {
    const playlist = requireObject(value, "playlist");
    const spotifyUrl = externalSpotifyUrl(playlist);
    const owner = isObject(playlist.owner) ? playlist.owner : {};
    const itemSummary = isObject(playlist.items)
        ? playlist.items
        : isObject(playlist.tracks) ? playlist.tracks : {};

    return {
        type: "playlist",
        id: optionalString(playlist.id),
        name: requiredString(playlist.name, "playlist name"),
        description: optionalString(playlist.description),
        owner: {
            id: optionalString(owner.id),
            displayName: optionalString(owner.display_name)
        },
        public: optionalBoolean(playlist.public),
        collaborative: optionalBoolean(playlist.collaborative),
        itemCount: optionalNumber(itemSummary.total),
        imageUrl: firstImageUrl(playlist.images),
        spotifyUrl,
        _links: { spotify: linkOrNull(spotifyUrl) }
    };
}

function transformCurrentlyPlaying(body) {
    const playback = body === null ? {} : requireObject(body, "playback state");
    const item = playback.item == null ? null : transformPlayableItem(playback.item);

    return {
        isPlaying: playback.is_playing === true,
        progressMs: optionalNumber(playback.progress_ms),
        currentlyPlayingType: optionalString(playback.currently_playing_type),
        item,
        _links: {
            self: endpointLinks.currentlyPlaying,
            profile: endpointLinks.profile,
            recentlyPlayed: endpointLinks.recentlyPlayed,
            spotify: item?._links?.spotify ?? null
        }
    };
}

function transformPlayableItem(value) {
    const item = requireObject(value, "currently playing item");

    if (item.type === "track") {
        return transformTrack(item);
    }

    const spotifyUrl = externalSpotifyUrl(item);

    return {
        type: optionalString(item.type) ?? "unknown",
        id: optionalString(item.id),
        name: optionalString(item.name),
        durationMs: optionalNumber(item.duration_ms),
        explicit: optionalBoolean(item.explicit),
        spotifyUrl,
        _links: { spotify: linkOrNull(spotifyUrl) }
    };
}

function transformRecentlyPlayed(body, request) {
    const page = requireObject(body, "recently played page");
    const items = requireArray(page.items, "recently played items").map((value) => {
        const historyItem = requireObject(value, "play history item");
        const context = isObject(historyItem.context) ? historyItem.context : null;

        return {
            playedAt: requiredString(historyItem.played_at, "played-at timestamp"),
            context: context ? {
                type: optionalString(context.type),
                spotifyUrl: externalSpotifyUrl(context)
            } : null,
            track: transformTrack(historyItem.track)
        };
    });
    const cursors = isObject(page.cursors) ? page.cursors : {};

    return {
        items,
        page: {
            limit: pageNumber(page.limit, request, "limit", 20),
            after: optionalString(cursors.after),
            before: optionalString(cursors.before)
        },
        _links: {
            self: { href: request.originalUrl },
            next: paginationLink(
                "/api/player/recently-played",
                page.next,
                ["limit", "after", "before"]
            ),
            previous: paginationLink(
                "/api/player/recently-played",
                page.previous,
                ["limit", "after", "before"]
            ),
            profile: endpointLinks.profile
        }
    };
}

function transformSearch(body, request, query) {
    const search = requireObject(body, "search results");
    const types = query.get("type").split(",");
    const transformers = {
        artist: transformArtist,
        track: transformTrack,
        album: transformAlbum,
        playlist: transformPlaylist
    };
    const results = {};

    for (const type of types) {
        const key = `${type}s`;
        const page = requireObject(search[key], `${type} search results`);
        results[key] = transformOffsetCollection(
            page,
            request,
            "/api/search",
            ["q", "type", "market", "limit", "offset"],
            transformers[type],
            { type }
        );
    }

    return {
        results,
        _links: {
            self: { href: request.originalUrl },
            profile: endpointLinks.profile
        }
    };
}

function transformOffsetCollection(
    body,
    request,
    route,
    queryParameters,
    transformItem,
    linkOverrides = {}
) {
    const page = requireObject(body, "collection page");
    const items = requireArray(page.items, "collection items").map(transformItem);

    return {
        items,
        page: {
            limit: pageNumber(page.limit, request, "limit", 20),
            offset: pageNumber(page.offset, request, "offset", 0),
            total: typeof page.total === "number" ? page.total : items.length
        },
        _links: {
            self: {
                href: Object.keys(linkOverrides).length === 0
                    ? request.originalUrl
                    : requestLink(request, linkOverrides)
            },
            next: paginationLink(route, page.next, queryParameters, linkOverrides),
            previous: paginationLink(
                route,
                page.previous,
                queryParameters,
                linkOverrides
            ),
            profile: endpointLinks.profile
        }
    };
}

function paginationLink(route, upstreamLink, allowedParameters, overrides = {}) {
    if (typeof upstreamLink !== "string" || upstreamLink.length === 0) {
        return null;
    }

    const upstreamUrl = new URL(upstreamLink);
    const query = new URLSearchParams();

    for (const name of allowedParameters) {
        if (upstreamUrl.searchParams.has(name)) {
            query.set(name, upstreamUrl.searchParams.get(name));
        }
    }

    for (const [name, value] of Object.entries(overrides)) {
        query.set(name, value);
    }

    const queryString = query.toString();
    const suffix = queryString ? `?${queryString}` : "";
    return { href: `${route}${suffix}` };
}

function requestLink(request, overrides) {
    const url = new URL(request.originalUrl, "http://localhost");

    for (const [name, value] of Object.entries(overrides)) {
        url.searchParams.set(name, value);
    }

    return `${url.pathname}${url.search}`;
}

function transformArtistSummaries(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((artistValue) => {
        const artist = requireObject(artistValue, "artist summary");

        return {
            id: optionalString(artist.id),
            name: requiredString(artist.name, "artist name")
        };
    });
}

function transformAlbumSummary(value) {
    if (!isObject(value)) {
        return null;
    }

    return {
        id: optionalString(value.id),
        name: optionalString(value.name),
        imageUrl: firstImageUrl(value.images)
    };
}

function pageNumber(value, request, queryName, fallback) {
    if (typeof value === "number") {
        return value;
    }

    const queryValue = new URL(request.originalUrl, "http://localhost")
        .searchParams.get(queryName);
    return queryValue === null ? fallback : Number.parseInt(queryValue, 10);
}

function externalSpotifyUrl(value) {
    return isObject(value.external_urls)
        ? optionalString(value.external_urls.spotify)
        : null;
}

function firstImageUrl(value) {
    return Array.isArray(value) && isObject(value[0])
        ? optionalString(value[0].url)
        : null;
}

function linkOrNull(href) {
    return href ? { href } : null;
}

function requireObject(value, description) {
    if (!isObject(value)) {
        throw new TypeError(`Spotify returned an invalid ${description}.`);
    }

    return value;
}

function requireArray(value, description) {
    if (!Array.isArray(value)) {
        throw new TypeError(`Spotify returned invalid ${description}.`);
    }

    return value;
}

function requiredString(value, description) {
    if (typeof value !== "string") {
        throw new TypeError(`Spotify returned an invalid ${description}.`);
    }

    return value;
}

function optionalString(value) {
    return typeof value === "string" ? value : null;
}

function optionalNumber(value) {
    return typeof value === "number" ? value : null;
}

function optionalBoolean(value) {
    return typeof value === "boolean" ? value : null;
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIntegerInRange(value, minimum, maximum = Number.MAX_SAFE_INTEGER) {
    if (!/^(0|[1-9]\d*)$/.test(value)) {
        return false;
    }

    const number = Number(value);
    return Number.isSafeInteger(number) && number >= minimum && number <= maximum;
}

function isAllowedList(value, allowedValues) {
    const values = value.split(",");
    return values.length > 0
        && new Set(values).size === values.length
        && values.every((item) => allowedValues.has(item));
}
