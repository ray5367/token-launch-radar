# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ray5367/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ray5367/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar ranks every protocol in the frozen DefiLlama snapshot that records no token — all 40 watchlist protocols plus every other eligible pre-token protocol the watchlist leaves out — by an implied value figured from the snapshot's own figures. Each category is priced at a credibility-weighted multiple: the category's median market-cap/TVL among token protocols, blended with the global median by the category's sample size, adjusted by clamped seven-day growth, a log-scaled age factor, and a fitted size factor (market caps grow slower than TVL). The shrinkage prior, growth weight and size slope are fitted by the program on the snapshot's token protocols and tested on a held-out split and walk-forward in listing time against a flat-multiple baseline, with a sensitivity table moving each fitted constant one grid step; every row carries a bootstrap uncertainty band and a farm plan netted to a farm/thin/skip verdict with its net dollars at a stated plausible allocation. The dashboard is a single dark, sortable, filterable page with a detail view that recomputes each row's value in the browser, and the filter state lives in the URL hash so any view is a shareable link.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

---
<sub>Entered on [make.fun](https://make.fun/?ref=88g3yzab&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
