# 🎵 Music Ranking

10代・20代に人気の音楽ランキングサイト

👉 **[https://jim-auto.github.io/music-ranking/](https://jim-auto.github.io/music-ranking/)**

## カテゴリ

- 🎀 10代女子 — K-POP, ボカロ, Ado, YOASOBI...
- 💄 20代女子 — BTS, BLACKPINK, TWICE, J-POPアイドル...
- 🎮 10代男子 — ボカロP, 米津玄師, Creepy Nuts...
- 🎸 20代男子 — King Gnu, ONE OK ROCK, バンド系...

## 機能

- ジャンル別フィルター (K-POP / J-POPアイドル / ボカロ / シンガー / バンド / ヒップホップ / アニソン)
- 全体ランキング
- アーティスト検索
- 順位変動表示
- Spotify埋め込みプレイヤー

## 技術スタック

- [Astro](https://astro.build/) (SSG)
- [Last.fm API](https://www.last.fm/api) (ランキングデータ)
- GitHub Pages (ホスティング)

## 開発

```sh
npm install
node scripts/fetch-rankings.mjs  # データ取得
npm run dev                       # 開発サーバー起動
```
