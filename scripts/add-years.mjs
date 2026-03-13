// 既存のrankings.jsonのトラックにyearを追加する一回限りのスクリプト
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_KEY = process.env.LASTFM_API_KEY || '15d791e681ae2f28c8d1264e8b4165c7';
const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';
const rankingsFile = path.join(__dirname, '..', 'src', 'data', 'rankings.json');

const yearCache = new Map();

async function getTrackYear(artistName, trackName) {
  const key = `${artistName}::${trackName}`;
  if (yearCache.has(key)) return yearCache.get(key);

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
      if (match) {
        const year = parseInt(match[1], 10);
        yearCache.set(key, year);
        return year;
      }
    }
    yearCache.set(key, null);
    return null;
  } catch {
    yearCache.set(key, null);
    return null;
  }
}

async function main() {
  const rankings = JSON.parse(fs.readFileSync(rankingsFile, 'utf-8'));

  let total = 0;
  let found = 0;

  for (const cat of rankings.categories) {
    for (const artist of cat.artists) {
      if (!artist.topTracks) continue;
      for (const track of artist.topTracks) {
        if (track.year != null) continue; // skip if already has year
        total++;
        const year = await getTrackYear(artist.name, track.name);
        track.year = year;
        if (year) {
          found++;
          console.log(`  ✓ ${artist.name} - ${track.name}: ${year}`);
        } else {
          console.log(`  ✗ ${artist.name} - ${track.name}: not found`);
        }
        await new Promise(r => setTimeout(r, 50));
      }
    }
  }

  fs.writeFileSync(rankingsFile, JSON.stringify(rankings, null, 2), 'utf-8');
  console.log(`\n✅ Done! Found year for ${found}/${total} tracks`);
}

main();
