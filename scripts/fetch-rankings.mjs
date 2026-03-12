// Last.fm APIからアーティストの再生回数・リスナー数・トップトラックを取得してJSONに保存
// 前回のランキングと比較して順位変動を記録
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_KEY = process.env.LASTFM_API_KEY || '15d791e681ae2f28c8d1264e8b4165c7';
const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

// 重複リクエスト回避用キャッシュ
const infoCache = new Map();
const tracksCache = new Map();

async function getArtistInfo(artistName) {
  if (infoCache.has(artistName)) return infoCache.get(artistName);

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
      const result = {
        name: artistName,
        listeners: parseInt(data.artist.stats?.listeners || '0', 10),
        playcount: parseInt(data.artist.stats?.playcount || '0', 10),
        tags: data.artist.tags?.tag?.map(t => t.name) || [],
        image: data.artist.image?.find(img => img.size === 'extralarge')?.['#text'] || '',
      };
      infoCache.set(artistName, result);
      return result;
    }
    console.warn(`  ⚠ Not found: ${artistName}`);
    const fallback = { name: artistName, listeners: 0, playcount: 0, tags: [], image: '' };
    infoCache.set(artistName, fallback);
    return fallback;
  } catch (err) {
    console.error(`  ✗ Error fetching ${artistName}:`, err.message);
    return { name: artistName, listeners: 0, playcount: 0, tags: [], image: '' };
  }
}

async function getTopTracks(artistName, limit = 5) {
  if (tracksCache.has(artistName)) return tracksCache.get(artistName);

  const params = new URLSearchParams({
    method: 'artist.gettoptracks',
    artist: artistName,
    api_key: API_KEY,
    format: 'json',
    limit: String(limit),
  });

  try {
    const res = await fetch(`${BASE_URL}?${params}`);
    const data = await res.json();

    const tracks = (data.toptracks?.track || []).map(t => ({
      name: t.name,
      playcount: parseInt(t.playcount || '0', 10),
      listeners: parseInt(t.listeners || '0', 10),
    }));
    tracksCache.set(artistName, tracks);
    return tracks;
  } catch (err) {
    console.error(`  ✗ Error fetching tracks for ${artistName}:`, err.message);
    return [];
  }
}

function loadPreviousRankings(outputFile) {
  try {
    const data = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    const map = {};
    for (const cat of data.categories) {
      map[cat.id] = {};
      for (const a of cat.artists) {
        map[cat.id][a.name] = a.rank;
      }
    }
    return map;
  } catch {
    return {};
  }
}

async function main() {
  const artistsFile = path.join(__dirname, '..', 'src', 'data', 'artists.json');
  const outputFile = path.join(__dirname, '..', 'src', 'data', 'rankings.json');

  const { categories } = JSON.parse(fs.readFileSync(artistsFile, 'utf-8'));
  const prevRankings = loadPreviousRankings(outputFile);
  const rankings = { fetchedAt: new Date().toISOString(), categories: [] };

  for (const category of categories) {
    console.log(`\n📂 ${category.name}`);
    const artistResults = [];

    for (const artist of category.artists) {
      console.log(`  🔍 ${artist.name}...`);
      const info = await getArtistInfo(artist.name);
      const tracks = await getTopTracks(artist.name);
      artistResults.push({
        ...info,
        spotify_id: artist.spotify_id,
        genre: artist.genre,
        topTracks: tracks,
      });
      await new Promise(r => setTimeout(r, 80));
    }

    // Sort by listeners (descending)
    artistResults.sort((a, b) => b.listeners - a.listeners);

    // Add rank & change
    artistResults.forEach((a, i) => {
      a.rank = i + 1;
      const prevRank = prevRankings[category.id]?.[a.name];
      if (prevRank != null) {
        a.change = prevRank - a.rank;
      } else {
        a.change = null;
      }
    });

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
