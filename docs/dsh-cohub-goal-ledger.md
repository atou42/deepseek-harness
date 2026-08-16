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
