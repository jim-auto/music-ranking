# Music Ranking

トレンド音楽ランキングサイト

https://jim-auto.github.io/music-ranking/

## 機能

- デイリー / ウィークリーランキング（前日比・週間再生増加数でソート）
- ジャンル別フィルター (K-POP / J-POPアイドル / ボカロ / シンガー / バンド / ヒップホップ / アニソン)
- 全体アーティストランキング
- 曲ランキング
- アーティスト検索
- 順位変動表示
- GitHub Actionsで毎日自動更新

## 技術スタック

- [Astro](https://astro.build/) (SSG)
- [Last.fm API](https://www.last.fm/api) (ランキングデータ)
- GitHub Pages (ホスティング)

## 開発

```sh
npm install
LASTFM_API_KEY=xxx node scripts/fetch-rankings.mjs  # データ取得
npm run dev                                           # 開発サーバー起動
```
