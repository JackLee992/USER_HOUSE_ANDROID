# Game plugin host API v1

Each of the 37 stable game IDs has an ES-module entry at `<id>/index.js` that exports:

- `GAME_ID`: the existing catalog and save ID, never a translated display name.
- `GAME_VERSION`: independently maintained semantic version, initially `1.0.0`.
- `HOST_API_VERSION`: `1` for this host contract.
- `createGame(env, savedState)`: starts the real game implementation. The word-guessing factory is asynchronous because it reads the packaged word bank.

`registry.js` belongs to the host/core package. It resolves all entries through relative imports inside one immutable content snapshot. The 32 extracted games contain their actual rules, drawing, input, and game-specific helpers. Five adapters preserve the existing tested implementations at `src/games/{freecell,match3,space-cadet,zuma,water-sort}.js`; their content packages must also include those engines and their own dependencies. An adapter by itself is not a complete game package.

## Environments

The five existing factories use `root`, `document`, `window`, `save(state, force)`, `clear()`, `setScore(value)`, `finish(...)`, `speak(event)`, `toast(...)`, `isPaused()`, and `isActive()`.

The extracted factories additionally export `REQUIRED_ENV`. The runtime gives these factories `modularGameEnvironment(id).legacy`, whose explicitly named getters preserve the old host interface. For example, `saveProgress(gameId, state)` and `setScore(gameId, value)` retain their historical signatures. This separate object avoids confusing them with the modern per-game callbacks. The complete per-game dependency and mutable-binding lists are recorded in `tools/game-modules/extraction-report.json`.

Read live bindings through `env.gamePaused`, `env.currentGame`, and related getters inside callbacks. Do not destructure them into stale local values. Timer handles, pause state, active timing, and `activeGameController` have explicit setters where the original code wrote these host bindings. The game-specific helpers for board rules and AI live in their corresponding game modules rather than being supplied by the runtime.

## Lifecycle and state compatibility

This migration retains the existing lifecycle. The modern games and bubble shooter provide controllers with save/destroy operations. Other legacy games continue to save on their existing state transitions and use the host-owned timer handles and `stopGame()` cleanup. Their factory can return `null`; the host still pauses them through the live pause getter, flushes their pending progress writes, clears their timers, and removes document keyboard handlers. A `null` controller does not mean an unloaded or placeholder game.

No save IDs, schemas, rule constants, rewards, or game behavior are intentionally changed by the extraction. Do not replace an active game module or environment in place: its callbacks hold the snapshot from which it was created. The content updater must activate a new snapshot only after the old game has saved and stopped.

## Migration and verification

`tools/extract-game-modules.cjs` is a one-time migration utility for a pre-module runtime. It uses Acorn and eslint-scope bindings, not textual name substitution. Install those optional development tools in ignored `.local/game-extractor` as documented in the script. Do not run the migration again to overwrite later plugin edits.

Run `node --test tests/*.test.mjs` for logic and lifecycle regression, including direct plugin pause/AI/save checks. `tests/game-plugin-browser.mjs` opens all 37 games plus endless Gomoku in an isolated local development browser. `tests/helpers/paopao-harness.mjs` and the Android A/B fixture both instrument the production bubble-shooter module only within the test harness.
