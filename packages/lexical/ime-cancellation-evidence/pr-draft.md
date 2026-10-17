[lexical][lexical-code-core][lexical-selection] Bug Fix: Finish cancelled desktop WebKit compositions

## Description

With macOS system Pinyin in a desktop WKWebView, deleting unconfirmed `ni` with two Backspaces or cancelling with Escape can leave Lexical composing after an empty DOM compositionend. The next ordinary Enter does not dispatch KEY_ENTER_COMMAND.

Finish empty desktop WebKit compositions immediately and consume trailing keyCode 229 already handled by the IME. Ordinary Backspace/Enter and #7061's no-extra-deletion behavior remain. Cancellation synchronizes current text and clears only a proven editor-owned placeholder, without old-node rollback or blanket NBSP removal. Actual insertion establishes ownership; text edits, splits and merges maintain it. JSON updates use setTextContent through the schema, including generated TextNode and CodeHighlight updaters.

Ownership now belongs to the actual active node object. Ephemeral setter/splice/JSON edits cannot alter same-key live metadata and do not require an active editor. Selection self slicing uses its exact range to maintain ownership, including a single owned versus real NBSP; clone/export copies retain independent direct field writes. This preserves existing editor-free export-copy behavior.

Regressions use DOM compositionend and cover PlainText/RichText, cancelled/confirmed compositions, trailing keys, real NBSP, empty roots, selections, formatting, tokens/subclasses, model/JSON edits, ephemeral isolation and live/clone slicing. Public APIs and node JSON format are unchanged.

## Test plan

### Before

Exact upstream baseline is cb21da40de69c1eedc2b9ec60001fef0d3b1770a (0.52.0). The previously recorded original 58-case file failed as follows (before the JSON/ephemeral cases were added):

```sh
VITEST_BROWSER=chromium pnpm run test-browser packages/lexical/src/__tests__/browser/LexicalSafariComposition.test.ts
```

Actual output, exit 1:

```
 Test Files  1 failed (1)
      Tests  58 failed (58)
```

The historical native dataset's before variant used this exact unmodified upstream snapshot and reproduced six missing-Enter cases. After cancellation its editor remained composing; the following ordinary Enter produced no KEY_ENTER_COMMAND. These valid baseline records are reused rather than rerun.

The added model/export regressions also protect existing baseline behavior: ephemeral copies can be edited without an active editor, and selection export copies stay independent from live text.

### After

```sh
MOZ_DISABLE_CONTENT_SANDBOX=1 VITEST_BROWSER=chromium,firefox,webkit pnpm run test-browser packages/lexical/src/__tests__/browser/LexicalSafariComposition.test.ts packages/lexical/src/__tests__/browser/LexicalComposition.test.ts
```

Actual output, exit 0:

```
 Test Files  6 passed (6)
      Tests  358 passed | 2 skipped (360)
   Start at  17:12:40
   Duration  6.75s (tests 57%, worker 26%, import 15%, setup 2%)
```

```sh
pnpm run test-unit packages/lexical/src packages/lexical-code-core/src packages/lexical-selection/src packages/lexical-clipboard/src packages/lexical-html/src packages/lexical-markdown/src packages/lexical-yjs/src
```

Actual output, exit 0:

```
 Test Files  142 passed (142)
      Tests  3524 passed (3524)
   Start at  17:12:39
   Duration  4.77s (transform 26%, tests 24%, environment 21%, import 16%, worker 7%, setup 6%)
```

The schema and two generated JSON outputs are unchanged from the preceding revision. Current unit checks include generator drift, generated/schema parity and clone/serialization coverage. No manual generated-code edits or additional regeneration were needed.

Source/test TypeScript, ESLint and Prettier on all ten changed files exited 0. Actual type/format output:

```
$ tsc
$ tsc -p ./tsconfig.test.json
Checking formatting...
All matched files use Prettier code style!
```

ESLint emitted no diagnostics. The independent probe verifier now reports `16 passed; 0 failed (synthetic/model evidence).`, exit 0; CodeHighlight and custom setter JSON controls remain correct.

A production JS/TS AST audit across all packages (641 files) classified direct text writes: new-node initialization, clone copying, guarded setter/splice, independent DevTools snapshots, and the corrected live/copy selection slice. Generic schema setters and clone loops were also checked. No further direct update bypass was found within this ownership invariant.

The frozen final source passed one native HID/system-Pinyin run in system WKWebView: **14/14 scenarios (6 PlainText, 8 RichText)**, with no baseline rerun. The original exact-upstream native baseline is reused separately: six missing-Enter failures from the older dataset's before variant.

| Final native scope | Result |
| --- | --- |
| Double Backspace / Escape cancellation | Existing abc retained; next ordinary Enter dispatches once; ordinary Backspace deletes one character |
| Space / Enter confirmation | System commits 你 / raw ni respectively; IME-consumed Enter 229 does not dispatch; following 13/8 operate normally |
| Empty root, real NBSP, cross-paragraph replacement | Empty stays empty, true NBSP retained, unselected suffix Z retained in abZ |
| Ephemeral setter/splice/JSON, editor-free copies and export slices | Live marker/text unchanged by copies; cancellation retains ab NBSP c |
| Insertion command modifying only copies | No live placeholder ownership; abc retained |
| Active JSON prefix / replacement | Marker moves 1→2 or is invalidated; real NBSP preserved |
| Live self slices, including single owned/real NBSP | Known range maintained; owned-only slice clears, real-only NBSP survives |

The model-API scenarios run programmatic operations after a trusted native compositionstart, then continue actual OS n/i and cancellation. They explicitly reposition the caret after a live edit. No synthetic DOM composition or keyboard events are dispatched. This verifies the defined API/IME interactions; it is not remote-collaboration coverage.

Actual native verifier output, exit 0:

```
Native final active-node-v4: 14/14 scenarios passed (6 PlainText, 8 RichText).
All 276 DOM input/composition/key events and 64 keydowns are trusted; no modifier shortcut was used.
Exact system Pinyin verified; previous input source and application/focus restored.
Historical exact-upstream baseline reused: 6 missing-Enter failures; no baseline rerun.
```

Environment: macOS 27.0.1 (26A434), arm64, system WebKit 22625.1.29.11.28, input source com.apple.inputmethod.SCIM.ITABC verified before every native keydown. One dedicated window ran for 26.162 seconds; previous input source, application and focused element were restored. Cancelled compositions emit deleteCompositionText, empty compositionend, then consumed keyCode 229, without insertFromComposition. Both confirmation paths include insertFromComposition. Ordinary Enter is 13; ordinary Backspace is 8. This remains distinct from #8181's third-party IME case.

All ten reviewed source fingerprints and the full patch stayed unchanged. All 134 build inputs matched; rebuilding after capture produced a byte-identical bundle. Recorded bundle SHA-256: 29add179f7a5cea18ec9a48701c32d5dade3b0d71585a194da74f33295da1ddd. Native compile/run, verification and post-capture rebuild exited 0. The native fixtures and raw evidence are separate from the upstream source/test diff.

The browser/unit/type/lint/format results above are reused for this identical frozen source. Existing Flow full-check reported Found 0 errors (exit 0); all 152 relevant definition/config/lock inputs are unchanged, so it was reused. Full monorepo/browser suites, the complete ci-check/CI matrix, playground E2E and release builds were not repeated.

Not physically exercised: standalone Safari/Chrome/Firefox, other OSes/IMEs, CodeHighlight/custom-node matrices, cancellation before any text arrives, or live remote Yjs. These remain synthetic/model coverage where applicable. Tools: Node 25.2.1, pnpm 11.24.0, esbuild 0.28.2, Vitest 5.0.1, Playwright 1.63.0; synthetic matrix Chromium 153.0.8010.12, Firefox 155.0, WebKit 26.6. Firefox's sandbox variable is process-only for this host; repository configuration is unchanged.
