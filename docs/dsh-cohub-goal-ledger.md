# DSH × Cohub plugin ecosystem goal ledger

English | [中文](dsh-cohub-goal-ledger.zh.md)

This append-only ledger is the durable state of the DSH × Cohub plugin goal. Read it before resuming work. Record confirmed facts, decisions, implementation, failed checks, validation evidence, blockers, and the next action. It is not proof by itself; each completion claim must point to current repository or runtime evidence.

## 2026-08-16 · Goal lock and isolated baseline

The target is the Cohub Space `dec69421-9f80-46f7-80c4-7e09ca0c507f`. DSH is locked to version `0.1.0-rc.5` at commit `47f943859bef60e4160492346772ded9b24f765a`. The active worktree `/workspace/deepseek-harness`, its branch, runtime configuration, user data, and daily-use state are read-only for this goal. All writes, installs, builds, and tests belong to branch `cohub/dsh-plugin-ecosystem` in `/workspace/dsh-cohub-plugins`, using a task-specific Harness home for runtime probes. No merge, install into the active profile, Work publication, release, or push is authorized by the goal.

The original worktree contains unrelated uncommitted changes, including an earlier iframe-based Cohub Board experiment. They are deliberately excluded. The isolated worktree was repaired after an interrupted archive checkout and verified clean at the locked commit. The autoresearch baseline is zero dedicated acceptance checks.

The first implementation decision is to keep remote roots structurally separate from local Workspaces. The generic contract uses provider-owned opaque root and node identifiers and carries an explicit cloud/network/external marker. It contains no local path, cwd, Shell, login, or Cohub vocabulary. Cohub will be one independently unloadable source. File writes use compare-and-set revisions and return an explicit version-conflict branch.

Next action: implement and verify the generic remote-root registry package, then add the smallest sidebar presentation extension that consumes it without modifying Workspace membership or Session navigation.

