import axios from 'axios';

const YOUTUBE_URL_REGEX =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]+/i;

export function isYouTubeUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }

    return YOUTUBE_URL_REGEX.test(url.trim());
}

export function normalizeYouTubeUrl(url) {
    if (!url || typeof url !== 'string') {
        return null;
    }

    const trimmed = url.trim();

    if (!isYouTubeUrl(trimmed)) {
        return null;
    }

    return trimmed;
}

export async function getYouTubeVideoInfo(url) {
    const normalizedUrl = normalizeYouTubeUrl(url);

    if (!normalizedUrl) {
        throw new Error('Invalid YouTube URL.');
    }

    /*
     * YouTube's oEmbed endpoint lets us retrieve basic public
     * information without requiring a YouTube API key.
     */
    const response = await axios.get(
        'https://www.youtube.com/oembed',
        {
            params: {
                url: normalizedUrl,
                format: 'json',
            },
            timeout: 10000,
        }
    );

    const data = response.data;

    return {
        title: data.title || 'YouTube Video',
        author: data.author_name || 'Unknown',
        authorUrl: data.author_url || null,
        thumbnail: data.thumbnail_url || null,
        thumbnailWidth: data.thumbnail_width || null,
        thumbnailHeight: data.thumbnail_height || null,
        url: normalizedUrl,
    };
}