# Agent Note: Cohub Cloud Selection and Local @Space References

Status: implemented

English | [中文](2026-08-23-cohub-space-at-references.zh.md)

## Problem

Showing every Cohub Space twice as **Cohub Agent · Cloud** and **DSH Agent · Local** made the primary workspace picker ask users to choose an execution architecture before starting work. The local row also looked like a second kind of Cohub workspace even though it created a local DSH Session whose history stayed local.

## Decision

The workspace picker and remote tree expose each Cohub Space once. Selecting it always opens the Cohub-owned cloud conversation. Cohub owns the Agent, prompt execution, Turns, Session history, cancellation, and persistence.

Local DSH work starts from an ordinary local Workspace. When that Session needs Cohub assets, the composer’s `@` menu searches authenticated Spaces and inserts an atomic `@Cohub Space` reference. Submission serializes the reference into an exact title and opaque `space_id`. The Host installs four provider tools on local DSH Agents; each call requires that exact id. Space paths remain remote and relative and are never represented as local paths.

Legacy Sessions that were already bound to one Space remain readable and may omit `space_id`; no new UI creates that binding. Missing or malformed references, missing ids, inaccessible Spaces, transport failures, and malformed provider responses fail visibly. No local/cloud fallback is allowed.

## Alternatives considered

**Keep the two rows but improve their labels.** Rejected because the primary picker would still expose an implementation choice and duplicate every Space.

**Keep binding a Space when a local row is selected.** Rejected because it makes one remote root look like a local Workspace and scopes an entire Session when the user may need one asset for one task.

**Let local Agents access any Space without an explicit reference.** Rejected because the active cloud target would be invisible in the prompt and easy to confuse across similarly named Spaces.

## Verification

- Picker and remote-tree tests prove one cloud entry/action and the absence of a local DSH mode.
- Cohub client tests prove authenticated Space search, query filtering, atomic insertion, stable clipboard form, strict reference validation, and model serialization.
- Host tests prove unbound local Agents receive the four tools, reject a missing `space_id`, route an explicit id to the requested Space, and keep legacy bound Sessions working.
- The assembled browser snapshot pins the one-row Cohub picker.

## Consequences

The main chooser now answers one question: local Workspace or Cohub cloud Session. Cross-environment asset access becomes an explicit per-prompt reference inside local DSH instead of a second workspace mode. Local Session logs remain local; native Cohub Session logs remain in Cohub.

This note supersedes only the two-mode presentation and new binding route in [Native Cohub Agent Sessions in DSH](2026-08-23-cohub-native-agent-sessions.md). That note still owns native cloud execution, polling, cancellation, and Cohub persistence.
