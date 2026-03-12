// Last.fm APIからアーティストの再生回数・リスナー数を取得してJSONに保存
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_KEY = process.env.LASTFM_API_KEY || '15d791e681ae2f28c8d1264e8b4165c7';
const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

async function getArtistInfo(artistName) {
  const params = new URLSearchParams({
    method: 'artist.getinfo',
    artist: artistName,
    api_key: API_KEY,
    format: 'json',
  });

  try {
    const res = await fetch(`${BASE_URL}?${params}`);
    const data = await res.json();

    if (data.artist) {
      return {
        name: artistName,
        listeners: parseInt(data.artist.stats?.listeners || '0', 10),
        playcount: parseInt(data.artist.stats?.playcount || '0', 10),
        tags: data.artist.tags?.tag?.map(t => t.name) || [],
        image: data.artist.image?.find(img => img.size === 'extralarge')?.['#text'] || '',
      };
    }
    console.warn(`  ⚠ Not found: ${artistName}`);
    return { name: artistName, listeners: 0, playcount: 0, tags: [], image: '' };
  } catch (err) {
    console.error(`  ✗ Error fetching ${artistName}:`, err.message);
    return { name: artistName, listeners: 0, playcount: 0, tags: [], image: '' };
  }
}

async function main() {
  const artistsFile = path.join(__dirname, '..', 'src', 'data', 'artists.json');
  const outputFile = path.join(__dirname, '..', 'src', 'data', 'rankings.json');

  const { categories } = JSON.parse(fs.readFileSync(artistsFile, 'utf-8'));
  const rankings = { fetchedAt: new Date().toISOString(), categories: [] };

  for (const category of categories) {
    console.log(`\n📂 ${category.name}`);
    const artistResults = [];

    for (const artist of category.artists) {
      console.log(`  🔍 ${artist.name}...`);
      const info = await getArtistInfo(artist.name);
      artistResults.push({
        ...info,
        spotify_id: artist.spotify_id,
      });
      // Rate limit: 100ms between requests
      await new Promise(r => setTimeout(r, 100));
    }

    // Sort by listeners (descending)
    artistResults.sort((a, b) => b.listeners - a.listeners);

    // Add rank
    artistResults.forEach((a, i) => { a.rank = i + 1; });

    rankings.categories.push({
      id: category.id,
      name: category.name,
      emoji: category.emoji,
      artists: artistResults,
    });
  }

  fs.writeFileSync(outputFile, JSON.stringify(rankings, null, 2), 'utf-8');
  console.log(`\n✅ Saved to ${outputFile}`);
}

main();
