# Contributing

1. Fork and clone the repo, then `npm install`.
2. Copy `.env.example` to `.env` and fill in your own Firebase web config.
3. Run `npm run dev`, and `npm test` before opening a pull request.

Privacy rule for every change: raw document text and raw identifier values must never reach a cloud model. Any new cloud call goes through `src/lib/ai.ts` and must pass the `findLeaks` gate.
