// Last.fm APIからアーティストの再生回数・リスナー数・トップトラックを取得してJSONに保存
// 前回のランキングと比較して順位変動・週間増加数を記録
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_KEY = process.env.LASTFM_API_KEY;
if (!API_KEY) {
  console.error('Error: LASTFM_API_KEY environment variable is required');
  process.exit(1);
}
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
    // 新フラット形式
    const artistList = data.artists || [];
    // 旧カテゴリ形式もサポート
    if (data.categories) {
      for (const cat of data.categories) {
        for (const a of cat.artists) artistList.push(a);
      }
    }
    for (const a of artistList) {
      ranks[a.name] = a.rank;
      playcounts[a.name] = a.playcount;
      if (a.topTracks) {
        for (const t of a.topTracks) {
          trackPlaycounts[`${a.name}::${t.name}`] = t.playcount;
        }
      }
    }
    return { ranks, playcounts, trackPlaycounts };
  } catch {
    return { ranks: {}, playcounts: {}, trackPlaycounts: {} };
  }
}

// 履歴データの読み込み・保存（過去7日分のplaycount推移）
function loadHistory(historyFile) {
  try {
    return JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
  } catch {
    return { artists: {}, tracks: {} };
  }
}

function saveHistory(historyFile, history) {
  // 8日以上前のエントリを削除
  const cutoff = Date.now() - 8 * 24 * 60 * 60 * 1000;
  for (const entries of Object.values(history.artists)) {
    while (entries.length > 0 && new Date(entries[0].date).getTime() < cutoff) {
      entries.shift();
    }
  }
  for (const entries of Object.values(history.tracks)) {
    while (entries.length > 0 && new Date(entries[0].date).getTime() < cutoff) {
      entries.shift();
    }
  }
  fs.writeFileSync(historyFile, JSON.stringify(history), 'utf-8');
}

function calcWeeklyFromHistory(entries, currentPlaycount) {
  if (!entries || entries.length === 0) return 0;
  // 最も古いエントリとの差分
  const oldest = entries[0].playcount;
  return Math.max(0, currentPlaycount - oldest);
}

async function main() {
  const artistsFile = path.join(__dirname, '..', 'src', 'data', 'artists.json');
  const outputFile = path.join(__dirname, '..', 'src', 'data', 'rankings.json');
  const historyFile = path.join(__dirname, '..', 'src', 'data', 'history.json');

  const { artists: artistList } = JSON.parse(fs.readFileSync(artistsFile, 'utf-8'));
  const prev = loadPreviousData(outputFile);
  const history = loadHistory(historyFile);
  const today = new Date().toISOString().slice(0, 10);
  const artistResults = [];

  for (const artist of artistList) {
    console.log(`  🔍 ${artist.name}...`);
    const info = await getArtistInfo(artist.name);
    const tracks = await getTopTracks(artist.name);

    // 履歴に今日のデータを追加
    if (!history.artists[artist.name]) history.artists[artist.name] = [];
    const lastEntry = history.artists[artist.name].at(-1);
    if (!lastEntry || lastEntry.date !== today) {
      history.artists[artist.name].push({ date: today, playcount: info.playcount });
    }

    // トラックごとのデイリー・ウィークリー増加数を計算
    const tracksWithDelta = tracks.map(t => {
      const tKey = `${artist.name}::${t.name}`;
      const prevPC = prev.trackPlaycounts[tKey];
      const dailyPlays = prevPC != null ? Math.max(0, t.playcount - prevPC) : 0;

      if (!history.tracks[tKey]) history.tracks[tKey] = [];
      const lastTE = history.tracks[tKey].at(-1);
      if (!lastTE || lastTE.date !== today) {
        history.tracks[tKey].push({ date: today, playcount: t.playcount });
      }

      const weeklyPlays = calcWeeklyFromHistory(history.tracks[tKey], t.playcount);
      return { ...t, dailyPlays, weeklyPlays };
    });

    // アーティストのデイリー・ウィークリー増加数
    const prevPC = prev.playcounts[artist.name];
    const dailyPlays = prevPC != null ? Math.max(0, info.playcount - prevPC) : 0;
    const weeklyPlays = calcWeeklyFromHistory(history.artists[artist.name], info.playcount);

    artistResults.push({
      ...info,
      dailyPlays,
      weeklyPlays,
      spotify_id: artist.spotify_id,
      genre: artist.genre,
      topTracks: tracksWithDelta,
    });
    await new Promise(r => setTimeout(r, 80));
  }

  // Sort by dailyPlays (descending), fallback to weeklyPlays, then listeners
  artistResults.sort((a, b) => {
    if (b.dailyPlays !== a.dailyPlays) return b.dailyPlays - a.dailyPlays;
    if (b.weeklyPlays !== a.weeklyPlays) return b.weeklyPlays - a.weeklyPlays;
    return b.listeners - a.listeners;
  });

  // Add rank & change
  artistResults.forEach((a, i) => {
    a.rank = i + 1;
    const prevRank = prev.ranks[a.name];
    if (prevRank != null) {
      a.change = prevRank - a.rank;
    } else {
      a.change = null;
    }
  });

  const rankings = {
    fetchedAt: new Date().toISOString(),
    artists: artistResults,
  };

  saveHistory(historyFile, history);
  fs.writeFileSync(outputFile, JSON.stringify(rankings, null, 2), 'utf-8');
  console.log(`\n✅ Saved to ${outputFile}`);
}

main();
