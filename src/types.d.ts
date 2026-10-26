// Used for TypeScript type safety 

interface UserProfile {
    country: string;
    display_name: string;
    email: string;
    explicit_content: {
        filter_enabled: boolean,
        filter_locked: boolean
    },
    external_urls: { spotify: string; };
    followers: { href: string; total: number; };
    href: string;
    id: string;
    images: Image[];
    product: string;
    type: string;
    uri: string;
}

interface Image {
    url: string;
    height: number;
    width: number;
}

interface CurrentlyPlayingResponse {
    is_playing: boolean;
    progress_ms: number | null;
    currently_playing_type: "track" | "episode" | "ad" | "unknown";
    item: CurrentlyPlayingTrack | CurrentlyPlayingEpisode | null;
}

interface CurrentlyPlayingTrack {
    type: "track";
    name: string;
    artists: Array<{ name: string }>;
}

interface CurrentlyPlayingEpisode {
    type: "episode";
    name: string;
}
