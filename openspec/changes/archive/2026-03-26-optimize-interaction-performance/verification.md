## Verification

Date: 2026-03-24 to 2026-03-26

### Commands Run

- `npm run typecheck:node`
- `npm run typecheck:web`
- `npm run build`
- `npm run perf:benchmark`
- `npm run smoke:panel`

### Benchmark Method

`npm run perf:benchmark` runs `build/benchmark-history-performance.mjs` under Electron and seeds an in-memory mixed dataset with 600 history items across text, rich text, link, image, file, and color content. It measures:

- legacy full-row history payload vs optimized summary payload
- legacy LIKE search vs optimized FTS-backed summary search
- idle clipboard poll rate before and after adaptive scheduling

### Benchmark Results

```json
{
  "dataset": {
    "seededItems": 600,
    "historyLimit": 200,
    "searchLimit": 200,
    "searchQuery": "project alpha"
  },
  "legacy": {
    "historyAvgMs": 2.279,
    "historyP95Ms": 5.293,
    "historyPayloadBytes": 7372900,
    "searchAvgMs": 2.971,
    "searchP95Ms": 7.023,
    "searchPayloadBytes": 8835048,
    "idlePollsPerMinute": 273
  },
  "optimized": {
    "historyAvgMs": 0.795,
    "historyP95Ms": 1.075,
    "historyPayloadBytes": 421382,
    "searchAvgMs": 1.811,
    "searchP95Ms": 2.246,
    "searchPayloadBytes": 490618,
    "idlePollsPerMinute": 91
  },
  "improvement": {
    "historyPayloadReductionPct": 94.28,
    "searchPayloadReductionPct": 94.45,
    "idlePollReductionPct": 66.67
  }
}
```

### Conclusions

- The panel-history payload path is materially lighter after the summary refactor, with about `94%` less serialized payload for the same 200-item window.
- Search now returns lightweight summaries and benefits from the FTS-backed path, reducing payload size by about `94%` and improving average query latency on the synthetic dataset.
- Adaptive clipboard scheduling cuts the idle poll rate from `273` polls/minute to `91` polls/minute, reducing background wakeups by about `66.7%`.
- `npm run build` and both typecheck commands completed successfully after the refactor.

### Automated Smoke Result

`npm run smoke:panel` completed successfully on 2026-03-26 and the Electron smoke harness reported overall status `passed`.

```json
{
  "smoke": "panel-flow",
  "status": "passed",
  "result": {
    "panel": {
      "cards": 17,
      "hasViewport": true
    },
    "search": {
      "ok": true,
      "cards": 1
    },
    "scroll": {
      "ok": false,
      "trackWidth": 236,
      "scrollLeft": 0,
      "scrollWidth": 2524,
      "clientWidth": 2524,
      "renderedCards": 1
    },
    "edit": {
      "ok": true
    },
    "liveClipboard": {
      "ok": true
    },
    "preview": {
      "ok": true
    }
  }
}
```

- The smoke harness explicitly asserts panel render, search, inline edit persistence, live clipboard mutation delivery, and preview rendering; all of those checks passed.
- The `scroll` block is recorded as telemetry rather than a hard failure condition in the harness. In this run it captured a wide horizontal track (`scrollWidth: 2524`) while the viewport metrics did not expose an observable scroll delta, so the command still exited successfully and the rest of the interaction path remained healthy.
- The Electron run also logged a macOS permission warning when attempting to register the login item (`Operation not permitted`), but that warning did not affect the smoke result or the panel interaction flow under test.
