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
