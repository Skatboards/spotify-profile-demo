import cors from "cors";
import express from "express";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "127.0.0.1";
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

app.get("/api/top/artists", async (request, response) => {
    const authorization = request.get("authorization");

    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
        response.status(401).json({
            error: "A Spotify bearer access token is required."
        });
        return;
    }

    const spotifyUrl = new URL("https://api.spotify.com/v1/me/top/artists");
    const requestUrl = new URL(request.originalUrl, "http://localhost");

    for (const parameter of ["time_range", "limit", "offset"]) {
        const value = requestUrl.searchParams.get(parameter);

        if (value !== null) {
            spotifyUrl.searchParams.set(parameter, value);
        }
    }

    try {
        const spotifyResponse = await fetch(spotifyUrl, {
            headers: { Authorization: authorization }
        });

        if (!spotifyResponse.ok) {
            const contentType = spotifyResponse.headers.get("content-type");
            const body = Buffer.from(await spotifyResponse.arrayBuffer());

            if (contentType) {
                response.set("Content-Type", contentType);
            }

            response.status(spotifyResponse.status).send(body);
            return;
        }

        const spotifyBody = await spotifyResponse.json();

        if (!Array.isArray(spotifyBody.items)) {
            throw new TypeError("Spotify returned an invalid top artists response.");
        }

        const artists = spotifyBody.items.map((artist) => {
            if (!artist || typeof artist.name !== "string") {
                throw new TypeError("Spotify returned an artist without a name.");
            }

            return { name: artist.name };
        });

        response.status(spotifyResponse.status).json(artists);
    } catch {
        response.status(502).json({
            error: "Unable to retrieve top artists from Spotify."
        });
    }
});

app.all("/api/top/artists", (_request, response) => {
    response.set("Allow", "GET, OPTIONS");
    response.status(405).json({ error: "Method not allowed." });
});

app.use((_request, response) => {
    response.status(404).json({ error: "Not found." });
});

app.listen(port, host, (error) => {
    if (error) {
        console.error(`Unable to start the Spotify top artists API: ${error.message}`);
        process.exitCode = 1;
        return;
    }

    console.log(`Spotify top artists API listening on http://${host}:${port}`);
});
