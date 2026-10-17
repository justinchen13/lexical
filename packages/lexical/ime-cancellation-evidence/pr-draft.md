[lexical][lexical-code-core][lexical-selection] Bug Fix: Finish cancelled desktop WebKit compositions

## Description

With macOS system Pinyin in a desktop WKWebView, start after existing text (`abc`), type unconfirmed `ni`, then press Backspace twice or Escape. WebKit sends an empty DOM `compositionend` without `insertFromComposition`, but Lexical retains its composition key. The next ordinary Enter is dropped before `KEY_ENTER_COMMAND` can dispatch.

Finish empty desktop WebKit compositions immediately. Keep ignoring the trailing `keyCode=229` already consumed by the IME, preserving #7061's protection against extra body deletion; ordinary Backspace/Enter (`8`/`13`) work normally. Nonempty WebKit completion retains its deferred path. This system-Pinyin cancellation differs from the third-party Xunfei case in closed #8181.

Cancellation synchronizes current text and removes only a proven editor-owned placeholder. This requires tracking actual insertion and maintaining or invalidating its range through text edits, split/merge, JSON updates and active selection slices. The metadata belongs to the active node object: same-key ephemeral/export copies cannot change it, and editor-free copy edits remain supported. The text schema routes JSON writes through `setTextContent`; both affected generated updaters follow that schema. There is no old whole-node rollback or blanket NBSP removal; public APIs and node JSON format are unchanged.

The regressions enter through native DOM `compositionend` handlers, covering PlainText/RichText, trailing keys, real NBSP, empty roots, selection/format/type boundaries, model/JSON updates and live/copy isolation. The browser replays are synthetic. A separate system-Pinyin/HID capture validates the frozen implementation physically.

Reproduction sources, versioned failures, raw native records and exact commands are in the [commit-pinned evidence README](README.md), [current source/build identity](current-source-manifest.json), and [content-hash index](evidence-index.json). Evidence lives on a separate fork branch; this PR contains only the ten source/test files.

## Test plan

### Before

Exact upstream baseline: `cb21da40de69c1eedc2b9ec60001fef0d3b1770a` (0.52.0). Historical run of the **original 58-case** regression file, before later JSON/copy cases were added:

```sh
VITEST_BROWSER=chromium pnpm run test-browser packages/lexical/src/__tests__/browser/LexicalSafariComposition.test.ts
```

Actual output, exit 1 ([log](logs/reviewed-final-regression.log)):

```text
 Test Files  1 failed (1)
      Tests  58 failed (58)
```

The [historical native dataset](historical-events-v2.jsonl)'s **before** variant used this exact unmodified upstream commit and reproduced six missing-Enter failures. It is reused as the baseline; its older after variant is not final-fix evidence. Additional intermediate-version failures are indexed in the README.

### After

Commit identities were subsequently normalized to `Justin Chen` and the current account noreply address. Both original commit trees, messages and dates are unchanged; [the exact old/new SHA mapping](commit-identity-map.json) preserves the provenance of the historical capture and test logs. Current source: `b77e004c1087afc812f145cdcc937d5a4491665a`. No physical run or library suite was repeated for this metadata-only rewrite.

The browser/unit results below were recorded on the physically captured active-node-v4 source and are reused after a pure test callback rename. The follow-up changes only `slice` to `$slice` and its two references; production source and all 134 native build inputs are unchanged. [Current source identity and reuse proof](current-source-manifest.json).

```sh
MOZ_DISABLE_CONTENT_SANDBOX=1 VITEST_BROWSER=chromium,firefox,webkit pnpm run test-browser packages/lexical/src/__tests__/browser/LexicalSafariComposition.test.ts packages/lexical/src/__tests__/browser/LexicalComposition.test.ts
```

Actual output, exit 0 ([log](logs/v4-browser.log)):

```text
 Test Files  6 passed (6)
      Tests  358 passed | 2 skipped (360)
```

```sh
pnpm run test-unit packages/lexical/src packages/lexical-code-core/src packages/lexical-selection/src packages/lexical-clipboard/src packages/lexical-html/src packages/lexical-markdown/src packages/lexical-yjs/src
```

Actual output, exit 0 ([log](logs/v4-unit.log)):

```text
 Test Files  142 passed (142)
      Tests  3524 passed (3524)
```

Source/test TypeScript (`pnpm run tsc`, `pnpm run tsc-test`), ESLint and Prettier on all ten changed files exited 0. The test naming follow-up passes `pnpm exec eslint --max-warnings 0 --format json packages/lexical/src/__tests__/browser/LexicalSafariComposition.test.ts` with **0 errors / 0 warnings** and its Prettier check exits 0. The normal project pre-commit hook passes without changing the normalized file. [Lint result](logs/naming-lint.log), [format output](logs/naming-format.log), [hook output](logs/naming-commit-hook.log). Generator drift, schema parity and clone/serialization are covered by the unit run. The previous Flow full-check reported `Found 0 errors` (exit 0); its 152 definition/config/lock inputs are unchanged, so it was reused. [Quality scope and log references](quality-scope.json).

Final native capture: macOS 27.0.1 (26A434), arm64, system WKWebView/WebKit 22625.1.29.11.28; exact input source `com.apple.inputmethod.SCIM.ITABC`. The separate source fixture rebuild and evidence verification commands are:

```sh
node /path/to/ime-repro/build.mjs .
python3 /path/to/ime-repro/verify.py --checkout .
```

Actual verifier output, exit 0 ([log](logs/final-native-verify.log), [raw events](events.jsonl)):

```text
Native final active-node-v4: 14/14 scenarios passed (6 PlainText, 8 RichText).
All 276 DOM input/composition/key events and 64 keydowns are trusted; no modifier shortcut was used.
Exact system Pinyin verified; previous input source and application/focus restored.
Historical exact-upstream baseline reused: 6 missing-Enter failures; no baseline rerun.
```

All 14 following ordinary Enter presses dispatched once; consumed `229` keys did not cause an extra command/deletion. Space confirmation committed “你”; Enter confirmation committed raw “ni”. Cancellation, real NBSP, cross-paragraph text, active JSON/slices and independent copies passed. Seven cases invoke programmatic model APIs after a trusted native compositionstart, then continue real OS input/cancellation; these are explicit API/IME interactions, not remote collaboration. All 134 build inputs matched and the original post-capture bundle rebuild was byte-identical. The naming follow-up rechecks all 134 inputs and the eight business-source hashes against those immutable capture manifests; all still match. The test is not a native build input. The 14 physical cases are reused, with no new foreground run or full suite.

Physical coverage is limited to this system WKWebView/Pinyin setup. Standalone Safari/Chrome/Firefox, other OSes/IMEs, CodeHighlight/custom-node native matrices, no-input immediate cancellation and live remote Yjs were not physically exercised. The full monorepo/CI matrix, E2E and release/site builds were not repeated; older full-suite results are historical only. Detailed environment/tool versions and reuse boundaries are in the evidence README.
