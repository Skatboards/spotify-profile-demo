export function populateUI(profile: UserProfile) {
    
    document.getElementById("displayName")!.innerText = profile.display_name;
    if (profile.images[0]) {
        const profileImage = new Image(200, 200);
        profileImage.src = profile.images[0].url;
        document.getElementById("avatar")!.appendChild(profileImage);
    }
    document.getElementById("id")!.innerText = profile.id;
    document.getElementById("email")!.innerText = profile.email;
    document.getElementById("uri")!.innerText = profile.uri;
    document.getElementById("uri")!.setAttribute("href", profile.external_urls.spotify);
    document.getElementById("url")!.innerText = profile.href;
    document.getElementById("url")!.setAttribute("href", profile.href);
    document.getElementById("imgUrl")!.innerText = profile.images[0]?.url ?? '(no profile image)';
}

export function populateCurrentlyPlaying(playback: CurrentlyPlayingResponse | null) {
    if (!playback?.item) {
        setCurrentlyPlayingStatus("Nothing is currently playing.");
        return;
    }

    if (playback.item.type !== "track") {
        setCurrentlyPlayingStatus(`Currently playing: ${playback.item.name} (not a song)`);
        return;
    }

    const artists = playback.item.artists
        .map((artist) => artist.name)
        .join(", ");
    const playbackState = playback.is_playing ? "" : " (paused)";

    setCurrentlyPlayingStatus(
        `${playback.item.name} — ${artists}${playbackState}`
    );
}

export function setCurrentlyPlayingStatus(message: string) {
    document.getElementById("currentlyPlaying")!.textContent = message;
}
