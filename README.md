# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ray5367/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ray5367/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar ranks every protocol in the frozen DefiLlama snapshot that records no token — all 40 watchlist protocols plus every other eligible pre-token protocol the watchlist leaves out — by an implied value figured from the snapshot's own figures. Each category is priced at the median market-cap/TVL multiple the market already pays token protocols in that category, adjusted by clamped seven-day growth and a log-scaled age factor, and every row carries a concrete farm plan generated from its category, chains, TVL and age. The dashboard is a single dark, sortable, filterable page with a detail view that recomputes each row's value in the browser.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---
<sub>Entered on [make.fun](https://make.fun/?ref=88g3yzab&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
