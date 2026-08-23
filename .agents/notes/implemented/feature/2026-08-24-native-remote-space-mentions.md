# Agent Note: Remote conversations insert provider-native Space references

Status: implemented

English | [中文](2026-08-24-native-remote-space-mentions.zh.md)

## Problem

The remote conversation surface offered a Provider-owned Agent, Session history, models, and thinking controls, but its composer treated `@` as plain text. In Cohub this removed a native way to bring another Space into the current cloud conversation. Reusing the ordinary local DSH reference would also be wrong: local Sessions serialize a Space into `cohub_space_*` tool guidance, while a Cohub Agent expects Cohub's own `cohub://spaces/…` reference.

## Decision

`RemoteRootView` may publish an optional, non-blank `conversationReference`. The generic registry validates and preserves the string without interpreting it. The Cohub source publishes the canonical `@[label](cohub://spaces/id)` representation used by Cohub itself.

The remote conversation composer detects `@` only at a whitespace boundary, searches other roots from the active Provider source, excludes the current root, supports pointer and keyboard selection, and replaces the trigger with the selected root's Provider-owned reference. The generic UI never constructs a Cohub URI. Ordinary local DSH composers keep their existing `cohub-space:` reference and tool-context path.

## Alternatives considered

- **Reuse the local DSH Space reference.** Rejected because it addresses a local Agent through DSH tools rather than adding Cohub-native cross-Space context to the cloud Agent.
- **Construct `cohub://` links inside the generic UI.** Rejected because URI ownership belongs to the Provider; hard-coding Cohub syntax would break the remote-root package's provider-neutral boundary.
- **Show the current Space in the menu.** Rejected because the active Cohub Agent already has that Space as its workspace context, so selecting it adds noise without new context.

## Consequences

Cohub cloud conversations now get their native cross-Space reference flow without changing local DSH Session behavior. Providers that do not publish `conversationReference` remain absent from the menu. The current implementation searches the roots already published by the active source; Cohub publishes the user's accessible Space list before conversation activation, so the menu does not add a second search transport or credential path.

Focused contract and UI tests pin reference publication and validation, current-root exclusion, filtering, keyboard insertion, and the exact text submitted to the Provider.
