# CLAUDE.md

## Rules

- **APIキーやシークレットを絶対にハードコードしない。** 環境変数 or GitHub Secrets を使うこと。
- ローカル実行時は `LASTFM_API_KEY=xxx node scripts/fetch-rankings.mjs` のように環境変数で渡す。
- CI/CDでは GitHub Secrets (`secrets.LASTFM_API_KEY`) 経由で渡す。
