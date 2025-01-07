const fs = require('fs/promises');
const { request } = require('undici');

// Fetch final video URL for channel-based live URLs
const fetchFinalVideoURL = async (channelUrl) => {
  try {
    const response = await request(channelUrl, {
      method: 'GET',
      maxRedirections: 10, // Follow up to 10 redirects
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });

    if (response.statusCode === 200) {
      const body = await response.body.text();
      const re = /"canonicalBaseUrl":"(.*?)"/;
      const match = body.match(re);
      if (match) {
        const liveUrl = `https://www.youtube.com${match[1]}`;
        return liveUrl;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
};

// Generate .m3u playlist
const generateM3U = async (youtubeEntries) => {
  const m3uLines = ['#EXTM3U'];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  };

  for (const entry of youtubeEntries) {
    const { url, group } = entry;
    let finalUrl = url;

    if (url.includes('/@')) {
      finalUrl = await fetchFinalVideoURL(url);
      if (!finalUrl) continue;
    }

    try {
      const req = await request(finalUrl, { headers });
      const body = await req.body.text();
      const re = /"hlsManifestUrl":"(https:.*?m3u8)"/;
      const match = body.match(re);
      if (!match) continue;

      const hlsManifestUrl = match[1];

      m3uLines.push(`#EXTINF:-1 group-title="${group}",Live Stream - ${url}`);
      m3uLines.push(hlsManifestUrl);
    } catch (error) {
      continue;
    }
  }

  return m3uLines.join('\n');
};

export default async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Only GET requests are allowed' });
  }

  try {
    const data = await fs.readFile('./urls.json', 'utf-8');
    const { youtubeUrls } = JSON.parse(data);

    if (!youtubeUrls || !Array.isArray(youtubeUrls)) {
      return res.status(400).json({ error: 'Invalid data in urls.json' });
    }

    const m3uContent = await generateM3U(youtubeUrls);
    res.setHeader('Content-Type', 'text/plain');
    res.send(m3uContent);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
