# Desktop WebKit Pinyin cancellation: DOM composition targets

This is the source-only evidence bundle for **dom-target-v2**. It corresponds to source commit [`77c26a908ea9f482295d2539433f56a66292f7ec`](https://github.com/justinchen13/lexical/commit/77c26a908ea9f482295d2539433f56a66292f7ec) in [PR #9362](https://github.com/facebook/lexical/pull/9362). The maintainer agreed with moving IME handling to input; the revised implementation still requires review.

- Upstream base: `cb21da40de69c1eedc2b9ec60001fef0d3b1770a`, Lexical `0.52.0`.
- Published PR head when testing began: `b77e004c1087afc812f145cdcc937d5a4491665a` (the previous active-node-v4 implementation).
- Current source commit: `77c26a908ea9f482295d2539433f56a66292f7ec`.
- Source tree: `78982fe4e60e3084d9992757c94fc69493955b4f`.
- `fix.patch` SHA-256: `bc362a0f0ce00bb35d9c050e75cf86057bb3401b5025d586af6764ef4481a70b`.
- Captured bundle SHA-256: `3bcb2135b297fc0beab6cd10b19b1954cf4a9ba6c9f3c6629a828fe2bc4b5086`.

## Result and design

With macOS built-in Pinyin, deleting all unconfirmed `ni` or cancelling it with Escape ends composition with empty data and no `insertFromComposition`. The old deferred Safari path leaves the composition key active, so the next ordinary Enter does not dispatch `KEY_ENTER_COMMAND`.

The revised input handlers finish an empty desktop WebKit `compositionend` immediately. IME-consumed trailing `keyCode=229` events are ignored; ordinary Backspace/Enter (`8`/`13`) remain available. Nonempty confirmation retains the deferred Safari handling from #7061.

Composition preparation no longer inserts a temporary NBSP into document text. It prepares an insertion target, uses TextNode's existing rendered composition suffix, preserves an empty target through normalization and DOM selection resolution, and selects that DOM-only suffix for WebKit to replace. The document selection remains a collapsed model caret. Normalization resumes when the composition key is released. The synchronous preparation flag is restored in `finally`.

**TextNode, both generated JSON updaters, and the cross-package selection-slicing implementation are byte-identical to upstream.** There is no new text-mutation ownership bookkeeping, text snapshot rollback, schema change, or copied-node side effect. See `unchanged-upstream.json`.

## Source scope

The final delta is **7 files, +978/-25**, with five production files:

- `packages/lexical/src/LexicalEditor.ts`
- `packages/lexical/src/LexicalEvents.ts`
- `packages/lexical/src/LexicalNormalization.ts`
- `packages/lexical/src/LexicalSelection.ts`
- `packages/lexical/src/LexicalUtils.ts`
- `packages/lexical/src/__tests__/browser/LexicalSafariComposition.test.ts`
- `packages/lexical/src/__tests__/browser/utils/compose.ts`

The generic composition helper now replaces the initial selected DOM range rather than inserting after it. Regression coverage of the original cancellation bug still dispatches the real DOM `compositionend` entry; it does not use that helper's direct end command.

The preceding published PR head had ten changed files. This follow-up commit modifies 12 files relative to that head, including reversions; the resulting upstream delta is the seven files listed above. The normal project pre-commit hook completed successfully and preserved the exact frozen tree. See `delivery-manifest.json` and `logs/source-commit-hook.log`.

## Final physical capture

The 20 scenarios in `native/scenarios.json` all passed, from **2026-10-18 04:17:00 to 04:17:37 UTC**:

- PlainText Backspace cancellation, RichText Escape cancellation, then ordinary Enter and Backspace.
- Space and Enter confirmation; all five Space confirmations produced `你`, while Enter confirmed the raw `ni`. These are the observed IME results, not interchangeable expectations.
- Empty-root cancellation and confirmation; a new bold target in existing text; token redirection and confirmation.
- Existing NBSPs during cancellation and confirmation; forward and backward cross-paragraph selection; selected-text replacement.
- Ephemeral setter/splice/JSON changes, editor-free copy changes, clone/export slicing, and an insertion handler that consumes the command but only changes copies.
- Live JSON replacement and live slicing, including retaining a single real NBSP.
- Normal TextNode subclass key/type/NodeState preservation and the existing segmented-subclass cleanup behavior.

Model API cases use explicitly programmed hooks after trusted compositionstart, followed by real IME input. They are not a remote Yjs integration test.

The native program selected **`com.apple.inputmethod.SCIM.ITABC`** and posted native HID keys with no modifiers. All **397 DOM events and 91 keydowns were `isTrusted=true`**. All command records came from ordinary `8`/`13`, with no command from consumed `229`. The capture had no repeated compositionstart, observation mismatch, focus loss, or test failure. Input source, application, and focused UI element were restored; command exit status was **0**.

Environment: macOS **27.0.1 (26A434)**, arm64; system WKWebView WebKit **22625.1.29.11.28**; Node **22.22.3**, esbuild **0.28.2**. The repository's `.nvmrc` recommends 24.21.0; this run used the reported Node version, which satisfies the package engines. No dependency or lockfile change was needed.

All **134 actual build inputs** matched the frozen capture manifest. Rebuilding after capture reproduced the bundle byte for byte. The immutable capture manifests and `post-capture-identity.json` associate the source patch, fixture, plan, executable digest, bundle, and raw native records. They correctly retain `sourceIsUncommitted: true` and the previous working HEAD as recorded at capture time; `delivery-manifest.json` proves the subsequent published commit contains those exact bytes. The root `source-manifest.json` identifies the published source; pre-publication package metadata is retained under `history/`. Binary/compiled JS files are intentionally excluded from this archive; the JS bundle can be rebuilt below.

Native event tracing reads the latest committed model without forcing a commit from capture-listener microtasks. Such a microtask can precede Lexical's bubble listener during native dispatch. Stage validators run after the HID step settles. Do not interpret a capture-listener snapshot as an after-all-handlers snapshot.

## Failed first attempt and regression evidence

`history/v1` preserves the original **dom-target-v1** source, build identity, and raw native capture. That attempt completed five scenarios and stopped during the sixth, the middle-of-body bold target. After the first `n`, the empty formatted target disappeared and the composition moved into ordinary body text. A second compositionstart tripped the probe's one-start assertion. Cancellation for this case and the remaining 14 scenarios were not run. It is not reported as a complete cancelled-format test failure. All 124 recorded DOM events were trusted. Focus/input-source restoration succeeded; exit was 1.

The difference identified a DOM-target boundary: a collapsed caret at the start of an empty formatted node may edit the previous node. A browser-editing probe confirmed this in Chromium; selecting the rendered suffix retained the prepared node. A library regression for that boundary failed 4/4 cases before the DOM-range change and passed after it. The final native capture independently checks that bold and token input stays in the prepared node.

The v1 probe used force-commit observations from event microtasks and treated a repeated start as a second model hook. V2 uses non-flushing trace reads and runs the model hook only once, while recording any repeated starts. The final capture had none. This instrumentation change is disclosed rather than relabeling the v1 failure.

Other exact before/after outputs:

- Published v4 source with the preparation regression: **24 failed, 4 passed, 164 filtered out**, exit 1 (`logs/before-v4-preparation.*`).
- DOM-target v1 with the new range regression: **4 failed, 240 filtered out**, exit 1 (`logs/before-dom-range.*`).
- Corrected DOM range, Chromium/WebKit: **4 passed**, exit 0 (`logs/after-dom-range.*`).
- Final Safari-event regression file, all three engines: **366 passed**, exit 0 (`logs/composition-final.*`).

`history/before-preparation-test.ts` and `history/published-v4.patch` reproduce the first comparison on an isolated base checkout. `history/before-dom-range.patch` preserves the second comparison's source. Each run's result metadata retains its checked patch digest.

To rerun the failed preparation check, use another clean base checkout, apply `history/published-v4.patch` with `git apply --index`, copy `history/before-preparation-test.ts` over the browser test, install the locked dependencies, and run the preparation filter shown below. For the failed range check, use a separate clean base checkout with `history/before-dom-range.patch` and run the range filter.

```sh
VITEST_BROWSER=chromium,webkit pnpm run test-browser packages/lexical/src/__tests__/browser/LexicalSafariComposition.test.ts -t 'composition prepares a DOM target'
VITEST_BROWSER=chromium,webkit pnpm run test-browser packages/lexical/src/__tests__/browser/LexicalSafariComposition.test.ts -t 'browser editing replaces the DOM suffix'
```

The original exact-base native failure is historical evidence, not a new baseline run: [raw before/after records](https://github.com/justinchen13/lexical/blob/9fba1832da6bc36afb5fd599d2fd2887a9f2d7d0/packages/lexical/ime-cancellation-evidence/historical-events-v2.jsonl) and [its manifest](https://github.com/justinchen13/lexical/blob/9fba1832da6bc36afb5fd599d2fd2887a9f2d7d0/packages/lexical/ime-cancellation-evidence/historical-manifest-v2.json). In the `before` Backspace case, the subsequent Enter result has `commands: []`. Older active-node-v4 physical captures remain evidence for that implementation, not for the new design.

## Validation scope

- The broad v2 core/RichText browser run produced **2073 passed, 2 failed, 8 skipped** over 84 engine-files. Both failures were the new Firefox assertion: `Selection.toString()` converts the selected NBSP to an ordinary space. The assertion now reads raw `Range.toString()`; the current file passed **366/366** across Chromium, Firefox, WebKit. All production/helper diff sections were checked unchanged. Thus the combined valid scope is **2075 passed / 8 skipped**, with **81 unchanged engine-files reused + 3 current file runs**; this is not described as a new passing all-84-file invocation. See `assertion-normalization.json` and raw logs.
- V2 affected model/selection/editor/history unit run: **327 passed**, exit 0. V1's **716 passed** included unchanged TextNode, schema/generated JSON, generator drift and slicing coverage; that older result is separately labeled. The prior published implementation's 3524-unit run is not claimed as a new full-suite result.
- Source and test TypeScript: exit 0. Strict seven-file ESLint: **0 errors / 0 warnings**, exit 0. Prettier: exit 0. The final test-only Range assertion preserves the already-checked types; current lint/format were rerun.
- Original independent review probes: **20/20 per engine** in Playwright WebKit and Safari-UA Chromium, all synthetic. One live-slice fixture is adapted from fixed offsets `[2,5]` to the same logical `b`-to-end range because the model no longer contains an inserted NBSP. Original fixtures are preserved in `regression-probes/`; the runner records the adaptation and hashes.
- Native fixture dry run: **20/20 per engine**, synthetic. It is not physical IME evidence.
- Flow was not rerun. The prior `Found 0 errors`, exit-0 result is reused; 148 enumerated definitions/config/runtime inputs were verified unchanged from the same base (`flow-reuse.json`). This is a newly enumerated scope, not a claim to reproduce the older 152-input enumeration.
- No new full monorepo unit run, full ci-check, E2E suite, release build, Windows/Linux/Android/iOS physical IME, or standalone Safari/Chrome physical validation. Immediate start-with-no-input cancellation, and reset/repeated-session boundaries have library synthetic coverage; the native plan always types `ni`.

Firefox headless tests used the documented local `MOZ_DISABLE_CONTENT_SANDBOX=1` process setting. No repository configuration was changed.

## Reproduce without foreground access

Use a separate checkout and unpack this archive outside it. Let `EVIDENCE` be the absolute unpacked evidence directory and `CHECKOUT` the absolute repository directory. Keep those variables task-specific.

```sh
git clone https://github.com/facebook/lexical.git lexical-ime-repro
cd lexical-ime-repro
CHECKOUT="$PWD"
git checkout --detach cb21da40de69c1eedc2b9ec60001fef0d3b1770a
git apply --index "$EVIDENCE/fix.patch"
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox webkit
node "$EVIDENCE/verify.mjs" "$CHECKOUT"
MOZ_DISABLE_CONTENT_SANDBOX=1 VITEST_BROWSER=chromium,firefox,webkit pnpm run test-browser packages/lexical/src/__tests__/browser packages/lexical-rich-text/src/__tests__/browser
pnpm run test-unit packages/lexical/src/__tests__/unit/LexicalSelection packages/lexical/src/__tests__/unit/LexicalEditor packages/lexical/src/__tests__/unit/LexicalNormalization packages/lexical-history/src/__tests__/unit/LexicalHistory
pnpm run tsc
pnpm run tsc-test
node "$EVIDENCE/run-review-probes.mjs"
node "$EVIDENCE/dry-run-native.mjs"
```

`git apply --index` stages the new test file so source-diff manifests include it. It does not create a commit. For the exact captured bundle, use the reported Node/esbuild versions. `verify.mjs` checks the immutable records and source/input hashes, then rebuilds the bundle with a fixed stdin sourcefile; changing checkout provenance metadata does not change the tested code bytes.

Records-only checking requires no checkout and never opens a window:

```sh
node "$EVIDENCE/verify.mjs" --records-only
```

## Optional new physical capture

This is an explicit foreground operation, not part of the verifier. Use a fresh unpacked working copy of the evidence. Original records are named `capture-events.jsonl`; the program writes a new `events.jsonl` and refuses to overwrite it.

```sh
node "$EVIDENCE/native/build.mjs" "$CHECKOUT"
xcrun swiftc "$EVIDENCE/native/Probe.swift" -o "$EVIDENCE/native/Probe"
"$EVIDENCE/native/Probe" --preflight
"$EVIDENCE/native/Probe" "$EVIDENCE/native"
```

The native program requires macOS built-in Pinyin `com.apple.inputmethod.SCIM.ITABC` plus existing Accessibility/event-posting permission. It uses one dedicated WKWebView window, posts no modifier shortcuts, aborts on focus loss, has a 120-second watchdog, and restores the previous input source and application/focus. The operator should refrain from keyboard/mouse input during that window. New recordings do not replace the immutable original capture.

## Evidence hygiene

Only fixed public test text is used. Public log copies redact file locations; assertions, counts, timestamps and exit status are retained. `log-redactions.json` records raw/public digests. No credentials, private messages, internal session references or application implementation are included. This archive contains sources and records, not Lexical distribution builds or native binaries.
