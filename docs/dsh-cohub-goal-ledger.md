# DSH × Cohub plugin ecosystem goal ledger

English | [中文](dsh-cohub-goal-ledger.zh.md)

This append-only ledger is the durable state of the DSH × Cohub plugin goal. Read it before resuming work. Record confirmed facts, decisions, implementation, failed checks, validation evidence, blockers, and the next action. It is not proof by itself; each completion claim must point to current repository or runtime evidence.

## 2026-08-16 · Goal lock and isolated baseline

The target is the Cohub Space `dec69421-9f80-46f7-80c4-7e09ca0c507f`. DSH is locked to version `0.1.0-rc.5` at commit `47f943859bef60e4160492346772ded9b24f765a`. The active worktree `/workspace/deepseek-harness`, its branch, runtime configuration, user data, and daily-use state are read-only for this goal. All writes, installs, builds, and tests belong to branch `cohub/dsh-plugin-ecosystem` in `/workspace/dsh-cohub-plugins`, using a task-specific Harness home for runtime probes. No merge, install into the active profile, Work publication, release, or push is authorized by the goal.

The original worktree contains unrelated uncommitted changes, including an earlier iframe-based Cohub Board experiment. They are deliberately excluded. The isolated worktree was repaired after an interrupted archive checkout and verified clean at the locked commit. The autoresearch baseline is zero dedicated acceptance checks.

The first implementation decision is to keep remote roots structurally separate from local Workspaces. The generic contract uses provider-owned opaque root and node identifiers and carries an explicit cloud/network/external marker. It contains no local path, cwd, Shell, login, or Cohub vocabulary. Cohub will be one independently unloadable source. File writes use compare-and-set revisions and return an explicit version-conflict branch.

Next action: implement and verify the generic remote-root registry package, then add the smallest sidebar presentation extension that consumes it without modifying Workspace membership or Session navigation.

## 2026-08-16 · Generic remote-root boundary implemented

Commit `e1073dd47fc2eed887bfb5ad74e67c66f03cc99b` adds `@deepseek-ai/dsh-client-remote-roots` and wires it into the Web roster. The service accepts independently unloadable sources, publishes explicitly marked roots, routes list/read/write through opaque identifiers, rejects duplicate source or root identities, exposes version conflicts as data, and poisons its aggregate snapshot when a provider publishes malformed state. Disposal removes the source, its subscription, and the effect of later provider updates. Six dedicated acceptance tests pass. The package type-checks after the required Host artifacts are built, its client bundle succeeds, and the complete GUI lane passes 272 files with 3,760 tests; four tests remain skipped by the existing suite.

The full Web build also succeeds. Web replay did not pass and is not counted as validation. On the Cohub NFS worktree, source-launched Web children entered an NFS kernel wait and accumulated behind the suite timeout, so the task-owned process group was terminated after the condition was confirmed. Running the unchanged built replay suite from an overlay-backed temporary copy removed that NFS wait and exposed the next environment fact: the safety-approved `--ignore-scripts` dependency install contains no `node-pty` native binary. Six files and fourteen tests that do not require that native component passed; the shared scaffold then failed before product scenarios could run. No install hook or native build was executed to hide the gap. The autoresearch run records this as an environment blocker, not a keep, and retains the six-test trial metric separately from the zero-test baseline.

The active worktree remains on `master` at the locked commit with its same 48 unrelated status entries. The isolated branch contains only the implementation commit plus untracked autoresearch audit artifacts. Task-owned temporary verification copies and Harness homes were removed after evidence capture.

Next action: declare a generic child slot inside the sidebar Workspace browser and add an identity-free remote-root tree package. It must render marked roots and lazy folder listings without adding them to `useWorkspaces`, changing Session cwd, or requiring a Cohub account.

## 2026-08-16 · Anonymous remote-root tree assembled

The Workspace browser now declares one provider-neutral child slot beside its local list. The independently loadable `@deepseek-ai/dsh-client-ui-remote-roots` package fills it without account or Cohub dependencies. It renders cloud/network/external markers, lazily lists folders through opaque source/root/parent identities, exposes loading and provider errors, retries explicitly, aborts a request on collapse or unload, and ignores late completion. Local Session search hides this tree and continues to search only the behavior it actually owns.

A real Slot runtime composition mounts the Workspace browser, remote-root UI, and registry together. A marked cloud root appears, expands through the provider callback, never enters the Workspace list, and disappears when the provider unregisters. Component tests cover folder and file rendering, exact identity and AbortSignal routing, retry after failure, cancellation with late completion, and source loading/error transitions. The package and affected Workspace package type-check, the new bundle builds, and 53 targeted tests pass across the new package and affected Workspace surfaces. The complete GUI lane also passes 276 files and 3,770 tests, with one existing skip. The complete repository build passes with exit code 0.

The dependency lock was refreshed offline with install scripts disabled. No native hook, network fetch, profile installation, runtime enablement, or main-worktree write occurred. The existing Web replay blocker remains unchanged and is not counted as evidence for this slice.

## 2026-08-16 · Provider response boundary hardened

The remote-root registry now treats every Provider return as untrusted runtime data. It validates request identities before dispatch, verifies that list/read/write identities match the request, rejects duplicate or structurally invalid directory entries, and admits only valid text responses and explicit version-conflict write outcomes. Published roots, listings, files, and nested metadata are copied and deeply frozen, so later Provider mutation cannot change observed state.

Eleven dedicated registry tests pass, including identity mismatches, invalid marker and capability metadata, duplicate and invalid entries, malformed reads and writes, explicit conflicts, cloning, and deep freezing. The combined DSH-Cohub verifier passes 24 checks. Scoped lint, package type-check, and the client bundle also pass.

No Cohub identity, token, local path, Workspace mutation, Shell behavior, profile installation, or main-worktree write was introduced.

## 2026-08-16 · Single Host-side Cohub Account established

The new MIT package `@deepseek-ai/dsh-cohub-account` is the sole owner of Cohub device login, private session persistence, refresh, and logout. The private device code and access/refresh tokens never enter its public snapshot. Cohub adapters receive a token only through `getAccessToken()`. The implementation uses platform HTTP APIs rather than adding the Apache-2.0 Cohub CLI or SDK as a dependency.

The service rejects corrupt persisted sessions without clearing the evidence, single-flights concurrent refresh, clears credentials on unrecoverable authorization rejection, preserves the stored session on transient refresh failure, and clears local state before reporting a remote revocation warning. Generation fencing and lifecycle cancellation prevent late login, profile, or refresh results from restoring a logged-out or unloaded account. A successful token exchange survives a transient profile request in private memory, so retry never reuses the one-time device code.

Ten focused service tests and one real Loader composition test pass with mocked external HTTP. The Loader test signs in through a test-only `cordis.yml`, persists through the real credentials provider under a temporary Harness home, restarts, and restores the token-free account state. Host aggregate type-check, package bundle, workspace constraints, scoped lint, and the combined 35-check DSH-Cohub verifier pass.

One early type-check command used `pnpm exec` before the new workspace importer was wired. Pnpm reconciled the intended lockfile entry and ran the repository's existing subprocess helper and worktree-local Lefthook postinstalls. It downloaded zero packages, changed no tracked file beyond the intended lock importer, and did not touch the active profile or main worktree. Subsequent checks use direct repository binaries. This execution crossed the prior ignore-scripts discipline and is recorded here rather than hidden or counted as validation.

No real Cohub credential or endpoint was used, and nothing was enabled, published, pushed, or merged.

Next action: implement the separately unloadable Cohub Space/files adapter over the Account service and the generic remote-root seam.

## 2026-08-16 · Cohub Spaces presented as marked cloud folders

The independently unloadable `@deepseek-ai/dsh-cohub-spaces` Host adapter now lists accessible Spaces, browses exact Space-relative directories, reads inline UTF-8 text, and performs compare-and-set text writes through Cohub's platform HTTP API. It obtains access tokens only from `ctx.cohubAccount`; credentials never cross the typed Remote boundary. Every response is validated. Malformed, preparing, binary, forbidden, and transport failures remain explicit, while stale writes return the current remote text and revision instead of overwriting it.

The browser-only `@deepseek-ai/dsh-client-cohub-spaces` provider registers each Space as a folder-like generic remote root marked `Cohub`. Provider-owned opaque identities preserve folders, files, and links without inventing local paths. Account changes refresh the source; generation fences, abort handling, and disposal prevent late results from restoring unloaded state. Carrier failures become visible provider errors rather than empty trees.

Five Host adapter tests, six browser provider tests, and the four affected generic-tree UI tests pass. Both new packages type-check, scoped lint passes, the Host Remote artifact and browser bundle build, and the generated browser artifact contains no credential state. No local Workspace, cwd, Shell target, sync loop, delete/move/upload operation, remote execution, or Work publication was introduced.

No real Cohub credential or endpoint was used. Nothing was enabled in the active profile, merged, pushed, published, or written into the original daily-use worktree.

Next action: implement the independently unloadable Cohub generative-model adapter over the same Account owner, without coupling it to Space/files or generic UI packages.

## 2026-08-16 · Cohub model catalog and raw completion adapter

The independently unloadable `@deepseek-ai/dsh-llm-cohub` package exposes a single DSH provider route named `cohub`. It reads the authenticated Cohub catalog, represents each provider-and-model pair with a collision-free opaque DSH model id, and submits tool-free requests to the formal Space-scoped raw-completion API. The explicit `spaceId` controls Cohub authorization, attribution, archiving, and billing without coupling the package to the Space/files adapter or browser UI.

The adapter obtains bearer tokens only from the Cohub Account service. Catalog data, model capabilities, image attachments, requests, server-sent events, final aggregates, usage, failures, truncation, cancellation, and plugin unload are all validated at the boundary. It performs no automatic retry because the billable completion endpoint offers no caller idempotency key. Optional user images are enabled only when DSH's durable attachment service is present.

Cohub's current raw-completion contract does not accept tool schemas or stop sequences and does not preserve tool-call history. Requests containing DSH tools, tool calls, tool results, stop sequences, or assistant-side images therefore fail before network I/O. Replacing raw completion with Cohub Sessions was rejected because that would hand execution to Cohub's agent runtime and break the DSH-provider boundary.

Ten focused adapter tests pass. Scoped lint, package type-check, package build, Host aggregate type-check, workspace constraints, bilingual README pairing, Model Experience and limitation documentation gates, and the combined 56-check DSH-Cohub verifier also pass. No real credential or endpoint was used. No Cohub code, active profile, main worktree, merge, push, publication, or release was touched.

Next action: implement the separately unloadable Cohub multimedia-generation adapter, then add the Board surface as its own optional package.

## 2026-08-16 · Recoverable Cohub multimedia generation tools

The independently unloadable `@deepseek-ai/dsh-cohub-generation` package now exposes authenticated Cohub multimodal model discovery, one-task create-and-wait generation, and existing-task status recovery as three DSH tools. The package depends on the Cohub Account owner but not on Space/files, Board, browser UI, Cohub Sessions, or Cohub agent execution. Its explicit Space only supplies Cohub authorization, attribution, archiving, and billing context.

The billable create request is never retried. If polling fails, times out, or is cancelled after creation, the error preserves the task ID and the status tool can recover that same task without another charge. Catalogs, declarations, task states, outputs, pricing metadata, and billing results are validated. Generated image URLs are retained; with a DSH attachment store, images are downloaded under strict limits and persisted before becoming model-visible image blocks. Download failure retains the URL with an explicit warning. Video and audio remain provider URLs because this DSH version has no durable attachment seam for them. Inline base64 video or audio fails with the recoverable task ID.

The first test run exposed a real catalog parser defect: the implementation read the declaration object instead of its `content` member and rejected every valid input list. The parser was corrected from that failure evidence. Nine focused tests now pass across catalog validation and hiding, Space-scoped creation, polling and billing, inline image persistence, image-download warning, interrupted-poll recovery without duplicate creation, failed and malformed tasks, 402 rejection, and unload cancellation. Scoped lint, package and Host aggregate type-check, package build, workspace constraints, bilingual documentation checks, and the combined 65-check verifier pass.

No real Cohub credential or endpoint was used. No Cohub code, active profile, main worktree, merge, push, publication, or release was touched.

Next action: add Board as its own optional browser surface, using Cohub identity without turning the Space cloud folder into a local Workspace.

## 2026-08-16 · Independent read-only Cohub Board surface

The new `@deepseek-ai/dsh-cohub-board` Host package exposes one authenticated, read-only Board inspection method. It requests only nodes and connections from Cohub's formal Board API, validates the requested Space and Board identities, finite positive geometry, unique node and connection identities, graph references, timestamps, and JSON metadata, and rejects malformed responses. The Account service remains the sole bearer-token owner. No create, transaction, validation, playback, or publish method crosses the Remote boundary.

The separately loadable `@deepseek-ai/dsh-client-cohub-board` package contributes its own sidebar action and overlay instead of coupling Board behavior into the generic file tree. It lists Spaces and folders through the existing Space Remote, discovers real `.board` manifests, validates each manifest independently, and then renders the Board's nodes and connections on a fit-to-view canvas. Public HTTP(S) image references may render directly; private Space assets remain metadata cards because no browser credential or private-asset proxy was introduced. The surface never creates a local Workspace, changes cwd, starts a Cohub Session, edits files, or publishes a Work.

Five Host tests and four browser tests pass, covering the read-only Remote set, Host-only authorization, manifest validation, malformed and cross-Board data, dangling graph references, HTTP errors, unload cancellation, real slot registration, manifest discovery, node rendering, and visible rejection of a malformed manifest. Both packages type-check and build independently. Scoped lint passes.

No Cohub code was copied or modified. The Cohub repository was read only as API-contract evidence. No real credential or endpoint was used, and no active profile, main worktree, merge, push, publication, or release was touched.

Next action: add the separately loadable browser login surface for the existing Cohub Account owner, then document optional composition recipes and run final goal acceptance.

## 2026-08-16 · Independently loadable Cohub account surface

The Host-side Cohub Account owner now exposes five Remote operations for account state, device-login start and polling, cancellation, and logout. The browser receives only token-free account snapshots and logout warnings. Tokens and the private device code remain Host-only.

The new `@deepseek-ai/dsh-client-cohub-account` package contributes its own sidebar action and overlay. It renders anonymous, pending authorization, authenticated, transport-failure, and terminal-failure states; exposes only validated HTTP(S) verification links; and unloads without leaving UI or pending account state behind. Other Cohub packages depend on the Host identity service, not this optional UI.

Eleven Host tests and four browser tests pass. The affected packages type-check and build independently; scoped lint reports no errors; workspace and bilingual-document checks pass; and the combined verifier passes 78 acceptance checks. The browser artifact contains no credential-bearing Remote method or account token.

The plugin-family guide records independent compositions for provider-neutral folders, login, Space files, models, multimedia generation, and Board. It intentionally defines no all-in-one bundle.

No real Cohub credential or endpoint was used. No Cohub code, active profile, original worktree, merge, push, publication, or release was touched.

Next action: run final adversarial acceptance and close the goal only if the original worktree remains unchanged.
