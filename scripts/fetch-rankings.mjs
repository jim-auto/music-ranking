// Last.fm APIからアーティストの再生回数・リスナー数・トップトラックを取得してJSONに保存
// 前回のランキングと比較して順位変動・週間増加数を記録
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

async function getTrackYear(artistName, trackName) {
  const params = new URLSearchParams({
    method: 'track.getinfo',
    artist: artistName,
    track: trackName,
    api_key: API_KEY,
    format: 'json',
  });

  try {
    const res = await fetch(`${BASE_URL}?${params}`);
    const data = await res.json();
    const published = data.track?.wiki?.published;
    if (published) {
      const match = published.match(/(\d{4})/);
      if (match) return parseInt(match[1], 10);
    }
    return null;
  } catch {
    return null;
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

    const tracks = [];
    for (const t of (data.toptracks?.track || [])) {
      const year = await getTrackYear(artistName, t.name);
      await new Promise(r => setTimeout(r, 50));
      tracks.push({
        name: t.name,
        playcount: parseInt(t.playcount || '0', 10),
        listeners: parseInt(t.listeners || '0', 10),
        year,
      });
    }
    tracksCache.set(artistName, tracks);
    return tracks;
  } catch (err) {
    console.error(`  ✗ Error fetching tracks for ${artistName}:`, err.message);
    return [];
  }
}

// 前回データを読み込み（ランク + 再生回数）
function loadPreviousData(outputFile) {
  try {
    const data = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    const ranks = {};
    const playcounts = {};
    const trackPlaycounts = {};
    for (const cat of data.categories) {
      ranks[cat.id] = {};
      for (const a of cat.artists) {
        ranks[cat.id][a.name] = a.rank;
        playcounts[a.name] = a.playcount;
        if (a.topTracks) {
          for (const t of a.topTracks) {
            trackPlaycounts[`${a.name}::${t.name}`] = t.playcount;
          }
        }
      }
    }
    return { ranks, playcounts, trackPlaycounts };
  } catch {
    return { ranks: {}, playcounts: {}, trackPlaycounts: {} };
  }
}

async function main() {
  const artistsFile = path.join(__dirname, '..', 'src', 'data', 'artists.json');
  const outputFile = path.join(__dirname, '..', 'src', 'data', 'rankings.json');

  const { categories } = JSON.parse(fs.readFileSync(artistsFile, 'utf-8'));
  const prev = loadPreviousData(outputFile);
  const rankings = { fetchedAt: new Date().toISOString(), categories: [] };

  for (const category of categories) {
    console.log(`\n📂 ${category.name}`);
    const artistResults = [];

    for (const artist of category.artists) {
      console.log(`  🔍 ${artist.name}...`);
      const info = await getArtistInfo(artist.name);
      const tracks = await getTopTracks(artist.name);

      // トラックごとの週間増加数を計算
      const tracksWithDelta = tracks.map(t => {
        const prevPC = prev.trackPlaycounts[`${artist.name}::${t.name}`];
        const weeklyPlays = prevPC != null ? Math.max(0, t.playcount - prevPC) : 0;
        return { ...t, weeklyPlays };
      });

      // アーティストの週間増加数
      const prevPC = prev.playcounts[artist.name];
      const weeklyPlays = prevPC != null ? Math.max(0, info.playcount - prevPC) : 0;

      artistResults.push({
        ...info,
        weeklyPlays,
        spotify_id: artist.spotify_id,
        genre: artist.genre,
        topTracks: tracksWithDelta,
      });
      await new Promise(r => setTimeout(r, 80));
    }

    // Sort by weeklyPlays (descending), fallback to listeners
    artistResults.sort((a, b) => {
      if (b.weeklyPlays !== a.weeklyPlays) return b.weeklyPlays - a.weeklyPlays;
      return b.listeners - a.listeners;
    });

    // Add rank & change
    artistResults.forEach((a, i) => {
      a.rank = i + 1;
      const prevRank = prev.ranks[category.id]?.[a.name];
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
