import axios from 'axios';

const YOUTUBE_URL_REGEX =
    /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]+(?:[?&][^\s]*)?$/i;

export function isYouTubeUrl(url) {
    if (
        !url ||
        typeof url !== 'string'
    ) {
        return false;
    }

    return YOUTUBE_URL_REGEX.test(
        url.trim(),
    );
}

export function normalizeYouTubeUrl(url) {
    if (
        !url ||
        typeof url !== 'string'
    ) {
        return null;
    }

    let normalized =
        url.trim();

    if (!normalized) {
        return null;
    }

    if (
        !/^https?:\/\//i.test(
            normalized,
        )
    ) {
        normalized =
            `https://${normalized}`;
    }

    if (
        !isYouTubeUrl(normalized)
    ) {
        return null;
    }

    return normalized;
}

export async function getYouTubeVideoInfo(
    url,
) {
    const normalizedUrl =
        normalizeYouTubeUrl(url);

    if (!normalizedUrl) {
        throw new Error(
            'Invalid YouTube URL.',
        );
    }

    try {
        const response =
            await axios.get(
                'https://www.youtube.com/oembed',
                {
                    params: {
                        url:
                            normalizedUrl,
                        format:
                            'json',
                    },

                    timeout:
                        10000,

                    headers: {
                        'User-Agent':
                            'Mozilla/5.0',
                    },
                },
            );

        const data =
            response?.data;

        if (
            !data ||
            typeof data !==
                'object'
        ) {
            throw new Error(
                'YouTube returned an invalid response.',
            );
        }

        return {
            title:
                data.title ||
                'YouTube Video',

            author:
                data.author_name ||
                'Unknown',

            authorUrl:
                data.author_url ||
                null,

            thumbnail:
                data.thumbnail_url ||
                null,

            thumbnailWidth:
                data.thumbnail_width ||
                null,

            thumbnailHeight:
                data.thumbnail_height ||
                null,

            url:
                normalizedUrl,
        };
    } catch (error) {
        const status =
            error?.response?.status;

        if (status) {
            throw new Error(
                `YouTube oEmbed request failed with status ${status}.`,
            );
        }

        throw new Error(
            `Unable to retrieve YouTube video information: ${
                error?.message ||
                'Unknown error'
            }`,
        );
    }
}