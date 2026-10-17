# Lexical system Pinyin cancellation — frozen active-node-v4 evidence

Final source: package **0.52.0**, baseline **cb21da40de69c1eedc2b9ec60001fef0d3b1770a**, reviewed uncommitted revision label **active-node-v4**. This is not a new release or commit. Apply `fix.patch` to the exact baseline. The ten-file patch stayed unchanged during final validation; SHA-256 is b1e53e83bb89a9e11ec99e042cd0eab99c66071b4deb7c61cf88fc2d6c12dd44.

## Final real system-IME capture

**14/14 passed: 6 PlainText, 8 RichText.** One final-only native window ran for 26.162 seconds, 2026-10-17 10:11:59–10:12:25 UTC. No baseline was rerun. Environment: macOS 27.0.1 (26A434), arm64, system WKWebView / WebKit 22625.1.29.11.28. Input source **com.apple.inputmethod.SCIM.ITABC** was checked before every native keydown.

All **276** DOM input/composition/key events and **64** keydowns are `isTrusted=true`. All 64 HID keydowns had zero modifier flags. No Option, Control, Command or Shift shortcut was used. Previous input source, application and focused element were restored; AX window/element restoration returned 0. No synthetic DOM composition or keyboard events were dispatched by the native fixture.

| Scenario | Editor | Actual text after cancellation/confirmation |
| --- | --- | --- |
| ni, Backspace twice | PlainText | abc |
| ni, Escape | RichText | abc |
| ni, Space confirmation | PlainText | abc你 |
| ni, Enter confirmation | RichText | abcni (native raw-Pinyin confirmation) |
| Empty root, ni, Backspace twice | PlainText | empty |
| Real NBSP body, ni, Escape | RichText | a\u00a0b\u00a0 |
| Cross-paragraph selection, ni, Escape | RichText | abZ; unselected Z retained |
| Ephemeral set/splice/JSON, editor-free edits and export slices | PlainText | ab\u00a0c; live marker unchanged by copies |
| Insertion command edits copies only | RichText | abc; no false ownership |
| Active JSON prefix X | PlainText | Xab\u00a0c; owned marker moved 1→2 |
| Active JSON replacement | RichText | X\u00a0Z; real NBSP preserved |
| Live self slice 2..5 | RichText | b\u00a0c |
| Self slice retains only owned NBSP | PlainText | empty; owned marker moved 1→0 then cleared |
| Self slice retains only real NBSP | RichText | \u00a0 |

The seven API scenarios run programmatic operations **after Lexical handles a trusted compositionstart**, then continue actual OS n/i and cancellation. Live-edit scenarios explicitly reposition the caret. This is real model-API/IME interaction, not remote-Yjs coverage or a claim about every plugin timing. `start-hook-result` records exact before/after model, DOM, marker and selection.

All 14 subsequent ordinary Enter presses (`keyCode=13`) dispatched once. Six scenarios additionally verified ordinary Backspace (`keyCode=8`) changes the intended text. In all scenarios the IME-consumed trailing key is 229 and dispatches no extra Enter/deletion. Twelve cancellations had deleteCompositionText, empty compositionend and no insertFromComposition. The two confirmation paths had insertFromComposition. Space committed “你”; Enter committed raw “ni”. The Enter expectation was defined before running as exact trusted compositionend.data, rather than assuming IME selection behavior.

Actual verifier output, exit 0:

```text
Native final active-node-v4: 14/14 scenarios passed (6 PlainText, 8 RichText).
All 276 DOM input/composition/key events and 64 keydowns are trusted; no modifier shortcut was used.
Exact system Pinyin verified; previous input source and application/focus restored.
Historical exact-upstream baseline reused: 6 missing-Enter failures; no baseline rerun.
```

## Source/build identity

`source-manifest.json` pins all ten reviewed files, the unchanged patch, and final evidence. `capture-build-manifest.json` is the immutable manifest referenced directly by capture-start. It records all **134** build inputs and the probe fixtures. `post-capture-identity.json` proves the source stayed frozen and the post-capture rebuild was byte-identical.

| Artifact | SHA-256 |
| --- | --- |
| Final native bundle | 29add179f7a5cea18ec9a48701c32d5dade3b0d71585a194da74f33295da1ddd |
| Final events.jsonl | a46cee963057e06b6da454013afc35f9d7ce0d5af2eb4cc3c346a72b31d15527 |
| Captured build manifest | b4a3f834e2e47929c663b15492d8d5d1c7dc2c2ae649f4619ffb36d1c1b9dde6 |
| Executed native binary | dd6f741dda1a31417802d9483270459c1f88a9f808e32e889b4b4588e5898ee4 |

The binary and compiled JS are omitted from this source archive. Build uses a fixed stdin sourcefile label; the bundle was independently rebuilt from another fixture directory with identical bytes. The runtime string is 0.52.0+cb21da40.active-node-v4, tied to the source manifest. The WKWebView UA's Intel/10_15_7 compatibility string is not the actual architecture/OS.

## Verify supplied evidence without foreground use

From the patched baseline checkout with dependencies installed:

```sh
pnpm install --frozen-lockfile
node /path/to/ime-repro/build.mjs .
python3 /path/to/ime-repro/verify.py --checkout .
```

These commands do not open a native window or send HID keys. The build recreates after.js; with the pinned source/dependency/tool inputs its bytes match the captured bundle. The verifier checks raw trusted records, outcomes, restoration, source/input hashes, and the reused historical baseline. It uses the immutable capture-build-manifest.json rather than overwriting that capture identity with the new build manifest.

For a **new** native run, use a fresh fixture directory: copy the source fixtures, source manifest and historical baseline files, excluding the supplied events.jsonl, capture-summary.json and capture-build-manifest.json. Build and compile there:

```sh
node /path/to/new-fixture/build.mjs .
xcrun swiftc /path/to/new-fixture/Probe.swift -o /path/to/new-fixture/probe
/path/to/new-fixture/probe --preflight
```

Only after a new foreground availability confirmation:

```sh
/path/to/new-fixture/probe /path/to/new-fixture
python3 /path/to/new-fixture/verify.py --checkout . --local-binary
```

The probe refuses to overwrite existing events, stops on focus loss or an observation mismatch, restores input source/focus, and enforces a 95-second watchdog. Release of an already posted key is allowed during abort; no further keydown is sent. Native compilation, preflight, final run, verification and post-capture rebuild all exited 0 for the supplied capture.

## Reused baseline and synthetic regressions

`historical-events-v2.jsonl` is the original range-cleanup-v2 capture. Its **before** variant used exact upstream cb21da40 and reproduced six missing-Enter cases: Backspace, Escape, selection, NBSP, cross-paragraph and intercepted insertion. Those records are reused, never counted as fresh runs. Its after variant is the older implementation and is not counted in the final 14 cases. native-scope-before-final.json, native-reuse-v3.json and native-*-v3.diff are historical scope assessments from before this final capture, not current untested-status claims. The original harness sources are in historical-native-v2/; its manifest is historical-manifest-v2.json / native-capture-manifest.json.

Patch versions are independent alternatives for clean baseline checkouts:

- fix.patch: frozen final active-node-v4.
- pre-active-fix.patch: json-cleanup-v3, for the ephemeral/live-slice before failures.
- pre-json-fix.patch: range-cleanup-v2, for the JSON bypass before failures.
- reviewed.patch: old unsafe whole-node snapshot rollback, historical only.

Current frozen-source library evidence remains valid and was not repeated: browser composition matrix **358 passed / 2 skipped**, affected core/CodeCore/Selection/Clipboard/HTML/Markdown/Yjs units **3524 passed**, source/test TypeScript and ten-file lint/format exit 0. The ESLint record contains **0 errors and 1 warning**: the test callback `slice` calls `$getRoot` without a `$` prefix (`@lexical/rules-of-lexical`). The recorded output is in `logs/v4-lint-final.log`. The callback spelling remains as captured/reviewed; the warning is not a claim of zero diagnostics. Generator drift, schema parity and clone/serialization passed; schema and both generated updaters are unchanged from v3. Existing Flow full-check reported 0 errors; 152 relevant definition/config/lock inputs are unchanged. `quality-scope.json` records this reuse, not a claim that full ci-check/CI ran again.

Preserved before evidence: final 28 added browser cases on v3 were **18 failed / 10 passed / 68 skipped**, editor-free unit subset **3 failed**, and independent dual-engine probe before **8 passed / 8 failed**, after **16 passed / 0 failed**. Original 58-case upstream failures and older snapshots remain versioned separately. `logs/v4-*` are final source regression records; `logs/final-*` are this native-validation phase. `logs/json-*` and unprefixed logs are earlier revisions. Intermediate candidate logs are not final success evidence.

Standalone synthetic probes remain available: run-extra.mjs / verify-extra.mjs for isolation/slicing and subtype JSON controls; run-edge.mjs / verify-json.mjs for JSON ownership; run-regression-probe.mjs for the first review defects. Their events are **synthetic**, not OS IME evidence. The latter now writes regression-before.js / regression-after.js so it cannot overwrite the native bundle.

`all-text-writes.json` / audit-all-text-writes.mjs cover 641 production JS/TS files across packages, with actual-node versus snapshot classification and separately reviewed dynamic schema/clone paths. The implementation uses active object identity, preserves ephemeral editor-free edits, and applies exact live slice ranges rather than guessing equal-NBSP ownership. No public API or node JSON format changed.

## Limits

Physical coverage is this machine's system WKWebView and system Pinyin, with the explicit PlainText/RichText cases above. Standalone Safari, Chrome/Firefox, other OSes/IMEs, CodeHighlight/custom-node native matrices, no-input immediate cancellation and live remote Yjs are not physically tested. Synthetic checks cover relevant model/type boundaries without substituting for those environments.

Full monorepo/browser suites, the complete CI matrix, E2E and release/site builds were not repeated. Tools: Node 25.2.1, pnpm 11.24.0, esbuild 0.28.2; synthetic tests use Vitest 5.0.1 / Playwright 1.63.0 (Chromium 153.0.8010.12, Firefox 155.0, WebKit 26.6). Firefox's sandbox setting is process-only for this host.

Only public fixed text, source, patches and sanitized evidence are included; no credentials, real messages, private paths, application implementation or compiled distribution artifacts. Each archive entry is pinned in evidence-index.json. Contributor CLA remains a personal step.
