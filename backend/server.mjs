import { createApp } from "./app.mjs";

const app = createApp();
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "127.0.0.1";

app.listen(port, host, (error) => {
    if (error) {
        console.error(`Unable to start the Spotify proxy API: ${error.message}`);
        process.exitCode = 1;
        return;
    }

    console.log(`Spotify proxy API listening on http://${host}:${port}`);
});
