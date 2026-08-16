const urlInput = document.getElementById('youtubeUrl');
const loadButton = document.getElementById('loadButton');
const player = document.getElementById('player');
const youtubePlayer = document.getElementById('youtubePlayer');
const videoTitle = document.getElementById('videoTitle');
const videoUrl = document.getElementById('videoUrl');
const errorBox = document.getElementById('error');

function getYouTubeVideoId(url) {
    try {
        const parsed = new URL(url);

        const hostname = parsed.hostname.toLowerCase();

        // youtu.be/<id>
        if (
            hostname === 'youtu.be' ||
            hostname === 'www.youtu.be'
        ) {
            return parsed.pathname
                .replace(/^\/+/, '')
                .split('/')[0] || null;
        }

        // youtube.com/watch?v=<id>
        if (
            hostname === 'youtube.com' ||
            hostname === 'www.youtube.com' ||
            hostname === 'm.youtube.com'
        ) {
            if (parsed.pathname === '/watch') {
                return parsed.searchParams.get('v');
            }

            // youtube.com/shorts/<id>
            if (parsed.pathname.startsWith('/shorts/')) {
                return parsed.pathname
                    .split('/')[2]
                    ?.split('?')[0] || null;
            }

            // youtube.com/live/<id>
            if (parsed.pathname.startsWith('/live/')) {
                return parsed.pathname
                    .split('/')[2]
                    ?.split('?')[0] || null;
            }
        }

        return null;
    } catch {
        return null;
    }
}

function showError(message) {
    errorBox.textContent = message;
    errorBox.style.display = 'block';
    player.style.display = 'none';

    youtubePlayer.src = '';
}

function clearError() {
    errorBox.textContent = '';
    errorBox.style.display = 'none';
}

function loadVideo() {
    const url = urlInput.value.trim();

    clearError();

    if (!url) {
        showError('Please enter a YouTube URL.');
        return;
    }

    const videoId = getYouTubeVideoId(url);

    if (!videoId) {
        showError(
            'That does not appear to be a valid YouTube video URL.'
        );
        return;
    }

    /*
     * Use YouTube's official embedded player.
     */
    youtubePlayer.src =
        `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?rel=0`;

    videoTitle.textContent = 'YouTube Video';
    videoUrl.textContent = url;

    player.style.display = 'block';
}

loadButton?.addEventListener('click', loadVideo);

urlInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        loadVideo();
    }
});