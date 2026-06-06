require('dotenv').config();
const express = require('express');
const cors = require('cors');
const ytdl = require('@distube/ytdl-core');

const app = express();
app.use(cors());
app.use(express.json());

const {
  RAINDROP_CLIENT_ID,
  RAINDROP_CLIENT_SECRET,
  RAINDROP_REDIRECT_URI,
  PORT = 3000,
} = process.env;

// --- Auth Routes ---

app.get('/auth/url', (req, res) => {
  const url = `https://raindrop.io/oauth/authorize?client_id=${RAINDROP_CLIENT_ID}&redirect_uri=${encodeURIComponent(RAINDROP_REDIRECT_URI)}&response_type=code`;
  res.json({ url });
});

app.post('/auth/token', async (req, res) => {
  const { code } = req.body;

  try {
    const response = await fetch('https://raindrop.io/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: RAINDROP_CLIENT_ID,
        client_secret: RAINDROP_CLIENT_SECRET,
        redirect_uri: RAINDROP_REDIRECT_URI,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(400).json({ error: data.error || 'Token exchange failed' });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/auth/refresh', async (req, res) => {
  const { refresh_token } = req.body;

  try {
    const response = await fetch('https://raindrop.io/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token,
        client_id: RAINDROP_CLIENT_ID,
        client_secret: RAINDROP_CLIENT_SECRET,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(400).json({ error: data.error || 'Token refresh failed' });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Bookmark Routes ---

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'];

function isYouTubeUrl(link) {
  try {
    const url = new URL(link);
    return YOUTUBE_HOSTS.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

app.get('/bookmarks/youtube', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token' });

  const token = authHeader.replace('Bearer ', '');

  try {
    const allBookmarks = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        `https://api.raindrop.io/rest/v1/raindrops/0?search=%5B%7B%22key%22%3A%22link%22%2C%22val%22%3A%22youtu%22%7D%5D&page=${page}&perpage=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.status === 401) {
        return res.status(401).json({ error: 'Token expired' });
      }

      const data = await response.json();
      if (!data.items || data.items.length === 0) {
        hasMore = false;
      } else {
        const youtubeItems = data.items.filter((item) => isYouTubeUrl(item.link));
        allBookmarks.push(
          ...youtubeItems.map((item) => ({
            id: item._id,
            title: item.title,
            link: item.link,
            excerpt: item.excerpt,
            cover: item.cover,
            created: item.created,
            lastUpdate: item.lastUpdate,
            tags: item.tags,
          }))
        );
        hasMore = data.items.length === 50;
        page++;
      }
    }

    res.json(allBookmarks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- YouTube Stream Routes ---

app.post('/youtube/stream-url', async (req, res) => {
  const { url } = req.body;

  if (!url || !isYouTubeUrl(url)) {
    return res.status(400).json({ error: 'Invalid YouTube URL' });
  }

  try {
    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title;
    const author = info.videoDetails.author.name;

    // Get best muxed format (video+audio combined)
    const format = ytdl.chooseFormat(info.formats, {
      quality: 'highest',
      filter: 'audioandvideo',
    });

    if (!format) {
      return res.status(404).json({ error: 'No suitable format found' });
    }

    res.json({
      url: format.url,
      title: `[${author}] ${title}`,
      quality: format.qualityLabel,
      contentLength: format.contentLength,
      mimeType: format.mimeType,
    });
  } catch (error) {
    res.status(500).json({ error: `Failed to get stream: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Raindrop Downloader backend running on port ${PORT}`);
});
