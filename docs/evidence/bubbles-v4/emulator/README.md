# Android emulator · content9 / bubbles v4

The installed system APK stayed **1.2.2 / code 6**. Native update UI downloaded only **art.paopao 1.0.3 + game.paopao 1.0.3** and activated **content9 / resource 1.3.3**. The first native observation showed ready content and an enabled update button without changing focus.

All five backup items and 37 game saves matched before and after the content update. The six pure-color bubbles, full edges and larger next bubble were inspected in native screenshots. Real native swap and exactly one shot succeeded (shots 8 → 9, bubbles 74 → 75, score stayed 220).

Pause was explicitly confirmed as **Continue / PAUSE** before attempting board and swap inputs. The paused game region and subsequent resumed game region remained byte-identical to their expected images. The saved game survived a cold app restart; its full app screenshot matched the single-shot state, and all gameplay fields were preserved. Only save timestamp and elapsed duration changed after resuming.

Normal SAF import restored the pre-QA backup. A new export proves all original five data items are identical, including the original 74-bubble board and eight shots. Content9 remains installed; emulator returned to home with proxy `null`, automatic rotation `1`, user rotation `0`.

These are real Android native UI tests, using ADB accessibility, physical screen coordinates and normal SAF. Raw personal backups and UI dumps remain private under `.local/qa-bubbles-v4/emulator/`; only sanitized results and app screenshots are included here.
