> Current revision: [DOM composition targets / dom-target-v2](dom-target-v2/README.md), source commit [77c26a908ea9f482295d2539433f56a66292f7ec](https://github.com/justinchen13/lexical/commit/77c26a908ea9f482295d2539433f56a66292f7ec). [Download the source-only reproduction ZIP](dom-target-v2.zip); [archive identity](dom-target-v2-archive-manifest.json).
>
> The active-node-v4 material below is historical and describes the preceding implementation. The source commit above replaces its model ownership hooks with input preparation. Capture manifests are retained unchanged for each version.

# Lexical system Pinyin cancellation — frozen active-node-v4 evidence

Captured implementation: package **0.52.0**, baseline **cb21da40de69c1eedc2b9ec60001fef0d3b1770a**, runtime label **active-node-v4**, code commit **8caa57128218797d6acfe43ca918bab81b99e461**. The physical capture predates the test-only naming follow-up **901bc60381d55834793e2e6c8edd4997a53394d7**. Current `fix.patch` includes exactly the callback `slice` → `$slice` and two reference renames; apply it to the exact baseline. Current patch SHA-256: **c750fdb077f61d223f258d2bcffc302069726eb3cf9ff2a51df7e04d559acc67**. The original captured patch remains `capture-fix.patch` (b1e53e83bb89a9e11ec99e042cd0eab99c66071b4deb7c61cf88fc2d6c12dd44).

## Contributor identity normalization

The PR remains #9362 in facebook/lexical. Following the account rename, the two
published source commits were rewritten with author and committer
`Justin Chen <45264536+justinchen13@users.noreply.github.com>`:

| Previous commit | Current commit | Tree |
| --- | --- | --- |
| 8caa57128218797d6acfe43ca918bab81b99e461 | 7cd8a5627848e316adbe84010458f3129c758799 | 08b04d0629b7197fd20f9548ba16a4560b7084c6 |
| 901bc60381d55834793e2e6c8edd4997a53394d7 | b77e004c1087afc812f145cdcc937d5a4491665a | 44edacd2c13716f9728f78772e7eeed8cc8a3780 |

Both trees, messages and original dates are identical. Only the author/committer
identity and the second commit's parent changed. The current source commit is
**b77e004c1087afc812f145cdcc937d5a4491665a**; all ten file hashes and fix.patch
bytes are unchanged. `commit-identity-map.json` and the four raw Git commit
preimages make the old/new SHA and tree correspondence independently verifiable
without fetching unreachable historical commits. Run:

```sh
python3 /path/to/ime-repro/verify-commit-identity.py
```

The capture/source/build manifests, raw events and `naming-native-reuse.json`
remain historical originals with their original commit labels. The 14 physical
cases and library checks are reused, with no new native run or test suite.
`current-source-manifest.json` is the current index; it links the identity map
and preserves the original capture-manifest hash. See the actual outputs in
`logs/identity-verification.log` and `logs/identity-source-verification.log`.
This identity update does not submit or complete the contributor's CLA.

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

`source-manifest.json` remains the original ten-file **capture** manifest and refers to `capture-fix.patch`. `current-source-manifest.json` pins the current source commit, ten files and current `fix.patch`; `LexicalSafariComposition.test.ts` is the current test snapshot. Only that test hash changed. All eight business files, the other published test, and all **134** native build inputs still match. `naming-native-reuse.json` records the comparison. `capture-build-manifest.json`, `build-manifest.json`, `source-manifest.json`, raw events and captured identity/summary files are unchanged historical originals. `post-capture-identity.json` still records the original byte-identical post-capture rebuild; no rebuild or new physical run is claimed for this naming follow-up.

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

These commands do not open a native window or send HID keys. The build recreates after.js; with the pinned source/dependency/tool inputs its bytes match the captured bundle. The verifier checks raw trusted records, outcomes, restoration, current source/input hashes, and the reused historical baseline. When a current manifest is supplied, it also proves that reversing exactly the three callback naming replacements restores the captured test hash; other source changes are rejected. It uses the immutable capture-build-manifest.json rather than overwriting that capture identity with the new build manifest.

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

- fix.patch: current active-node-v4 plus the test-only callback naming normalization.
- capture-fix.patch: original physically captured active-node-v4 patch, before test normalization.
- pre-active-fix.patch: json-cleanup-v3, for the ephemeral/live-slice before failures.
- pre-json-fix.patch: range-cleanup-v2, for the JSON bypass before failures.
- reviewed.patch: old unsafe whole-node snapshot rollback, historical only.

The captured-v4 browser composition matrix **358 passed / 2 skipped** and affected unit result **3524 passed** are reused for the pure test callback rename. Source/test TypeScript, formatting and Flow results retain their documented scope. The current test file passes strict ESLint with **0 errors / 0 warnings** and Prettier, both exit 0; the normal pre-commit hook completed Prettier and ESLint without further changes. Commands and actual output are in `logs/naming-*`; the older `logs/v4-lint-final.log` warning is historical and has been resolved. Generator drift, schema parity and clone/serialization passed; schema and both generated updaters are unchanged from v3. Existing Flow full-check reported 0 errors; 152 relevant definition/config/lock inputs are unchanged. `quality-scope.json` records this reuse, not a claim that full ci-check/CI ran again.

Preserved before evidence: final 28 added browser cases on v3 were **18 failed / 10 passed / 68 skipped**, editor-free unit subset **3 failed**, and independent dual-engine probe before **8 passed / 8 failed**, after **16 passed / 0 failed**. Original 58-case upstream failures and older snapshots remain versioned separately. `logs/v4-*` are final source regression records; `logs/final-*` are this native-validation phase. `logs/json-*` and unprefixed logs are earlier revisions. Intermediate candidate logs are not final success evidence.

Standalone synthetic probes remain available: run-extra.mjs / verify-extra.mjs for isolation/slicing and subtype JSON controls; run-edge.mjs / verify-json.mjs for JSON ownership; run-regression-probe.mjs for the first review defects. Their events are **synthetic**, not OS IME evidence. The latter now writes regression-before.js / regression-after.js so it cannot overwrite the native bundle.

`all-text-writes.json` / audit-all-text-writes.mjs cover 641 production JS/TS files across packages, with actual-node versus snapshot classification and separately reviewed dynamic schema/clone paths. The implementation uses active object identity, preserves ephemeral editor-free edits, and applies exact live slice ranges rather than guessing equal-NBSP ownership. No public API or node JSON format changed.

## Limits

Physical coverage is this machine's system WKWebView and system Pinyin, with the explicit PlainText/RichText cases above. Standalone Safari, Chrome/Firefox, other OSes/IMEs, CodeHighlight/custom-node native matrices, no-input immediate cancellation and live remote Yjs are not physically tested. Synthetic checks cover relevant model/type boundaries without substituting for those environments.

Full monorepo/browser suites, the complete CI matrix, E2E and release/site builds were not repeated. Tools: Node 25.2.1, pnpm 11.24.0, esbuild 0.28.2; synthetic tests use Vitest 5.0.1 / Playwright 1.63.0 (Chromium 153.0.8010.12, Firefox 155.0, WebKit 26.6). Firefox's sandbox setting is process-only for this host.

Only public fixed text, source, patches and sanitized evidence are included; no credentials, real messages, private paths, application implementation or compiled distribution artifacts. Each archive entry is pinned in evidence-index.json. Contributor CLA remains a personal step.
