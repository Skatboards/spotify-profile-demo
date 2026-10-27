import {
    copyAccessToken,
    getAccessToken,
    redirectToAuthCodeFlow
} from "./auth.ts";
import {
    populateCurrentlyPlaying,
    populateUI,
    setCurrentlyPlayingStatus
} from "./ui.ts";

const clientId = import.meta.env.VITE_CLIENT_ID;
const redirectUri = import.meta.env.VITE_REDIRECT_URI
    ?? "http://127.0.0.1:5173/callback";

if (!clientId) {
    throw new Error("VITE_CLIENT_ID is not configured.");
}
const params = new URLSearchParams(window.location.search);
const code = params.get("code");
const loginButton = document.getElementById("loginButton") as HTMLButtonElement;
const loginStatus = document.getElementById("loginStatus")!;
const loginSection = document.getElementById("login")!;
const profileSection = document.getElementById("profile")!;

loginButton.addEventListener("click", async () => {
    loginButton.disabled = true;
    loginStatus.textContent = "Redirecting to Spotify...";

    try {
        await redirectToAuthCodeFlow(clientId, redirectUri);
    } catch (error) {
        console.error(error);
        loginStatus.textContent = "Unable to start Spotify login.";
        loginButton.disabled = false;
    }
});

if (code) {
    loginSection.hidden = true;
    profileSection.hidden = false;

    const accessToken = await getAccessToken(clientId, code, redirectUri);
    const profile = await fetchProfile(accessToken);
    console.log(profile); // Profile data logs to console
    populateUI(profile);

    const copyAccessTokenButton = document.getElementById(
        "copyAccessTokenButton"
    ) as HTMLButtonElement;
    const copyAccessTokenStatus = document.getElementById(
        "copyAccessTokenStatus"
    )!;

    copyAccessTokenButton.disabled = false;
    copyAccessTokenButton.addEventListener("click", async () => {
        copyAccessTokenButton.disabled = true;
        copyAccessTokenStatus.textContent = "Copying access token...";

        try {
            await copyAccessToken(accessToken);
            copyAccessTokenStatus.textContent = "Access token copied.";
        } catch (error) {
            console.error("Unable to copy the access token.", error);
            copyAccessTokenStatus.textContent =
                "Unable to copy the access token.";
        } finally {
            copyAccessTokenButton.disabled = false;
        }
    });

    const currentlyPlayingButton = document.getElementById(
        "currentlyPlayingButton"
    ) as HTMLButtonElement;

    currentlyPlayingButton.addEventListener("click", async () => {
        currentlyPlayingButton.disabled = true;
        setCurrentlyPlayingStatus("Loading currently playing song...");

        try {
            const playback = await fetchCurrentlyPlaying(accessToken);
            populateCurrentlyPlaying(playback);
        } catch (error) {
            console.error(error);
            setCurrentlyPlayingStatus("Unable to retrieve the currently playing song.");
        } finally {
            currentlyPlayingButton.disabled = false;
        }
    });
}

async function fetchProfile(token: string): Promise<UserProfile> {
    const result = await fetch("https://api.spotify.com/v1/me", {
        method: "GET", headers: { Authorization: `Bearer ${token}` }
    });

    return await result.json();
}

async function fetchCurrentlyPlaying(
    token: string
): Promise<CurrentlyPlayingResponse | null> {
    const response = await fetch(
        "https://api.spotify.com/v1/me/player/currently-playing",
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );

    if (response.status === 204) {
        return null;
    }

    if (!response.ok) {
        const details = await response.text();
        throw new Error(
            `Currently playing request failed: ${response.status} ${details}`
        );
    }

    return await response.json();
}
