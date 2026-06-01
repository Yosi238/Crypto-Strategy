# seed/

Committed, read-only data the **hosted** dashboard serves when the runtime
filesystem isn't writable (e.g. Vercel).

Generate it locally and commit it:

```bash
npm run research   # produces .data/research.json + history
npm run seed       # copies them here
git add seed && git commit -m "seed research"
```

The store reads runtime data first, then falls back to these files. Candles are
fetched live by the scanner, so they are intentionally not seeded here.
