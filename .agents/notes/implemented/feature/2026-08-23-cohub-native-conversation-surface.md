# Agent Note: Native Cohub Conversation Surface

Status: implemented

English | [中文](2026-08-23-cohub-native-conversation-surface.zh.md)

## Problem

Native Cohub Sessions initially opened in a modal drawer. Although execution and persistence already belonged to Cohub, the drawer made the feature feel like an embedded secondary tool. It also omitted two controls users expect before starting an Agent Turn: model and thinking effort.

## Decision

Opening a Cohub Space or Session now replaces the DSH center conversation column through the root-scoped `conversation.remote` seat. The sidebar and shell stay in place, while the remote surface uses the same full-width header, chat rhythm, centered transcript, and docked composer shape as a local DSH conversation. Closing it reveals the unchanged local Session beneath it. No modal mask or side drawer remains.

Local navigation owns the transition back: the global New Session action, a local Session row, and a completed local fork deactivate the remote conversation before opening local state. This remains explicit because New Session may reuse an already-empty local Session and therefore cannot rely on a Session-id change to dismiss Cohub.

Cohub message blocks retain their text, thinking, tool-use, tool-result, shell-command, system-note, and image semantics across the Host and provider-neutral browser service. The Cohub adapter reads retained Turn blocks and, while a Turn is active, overlays Cohub's stream snapshot so partial thinking and tool activity refresh with the conversation poll. The center surface renders thinking and tools with the same compact disclosure rows, running sweep, expandable detail, Markdown rhythm, and tail-follow behavior as DSH while keeping Cohub as the source of every displayed fact.

Interactive remote providers may publish a validated, provider-grouped model catalog and receive an optional per-Turn model and thinking-effort selection. The Cohub provider reads its catalog from Cohub, exposes the supported thinking vocabulary, and forwards selected values with the native prompt. A default selection sends no fabricated override, so Cohub remains authoritative for defaults and prompt execution. Invalid catalogs, incomplete provider/model pairs, and unknown thinking values fail explicitly.

## Alternatives considered

**Restyle the drawer.** This would improve polish without fixing the secondary, non-native interaction model.

**Reuse the local DSH model selector directly.** That selector is bound to local Session routing and model state. Attaching it to a Cohub Session would imply that DSH owns execution and could leak local assumptions into a provider-owned Turn.

**Hard-code the model list.** Cohub's available models can change by account and deployment. The surface therefore reads the authenticated platform catalog and displays an error when it cannot be loaded.

**Infer progress from status or assistant text.** Generic loading copy cannot expose actual reasoning and tool activity. The surface projects Cohub's typed content and stream snapshot instead, and rejects malformed or unsupported blocks rather than inventing progress.

**Dismiss Cohub only when the local Session id changes.** A reused blank Session does not emit a new identity. Local navigation therefore deactivates the remote target as part of the user action.

## Verification

- UI tests prove the Cohub surface occupies the native center `main`, is not a dialog, exposes model and thinking controls, and submits the chosen values.
- Navigation tests prove New Session and local Session selection dismiss the active remote conversation even when local identity is unchanged.
- Host and UI tests prove live Cohub thinking and tool blocks survive validation and render as expandable DSH-native progress rows.
- Provider and Host tests prove catalog validation and exact prompt forwarding.
- The assembled Web test opens a real shipped DSH composition against a controlled Cohub HTTP boundary, selects a model and thinking effort, and verifies the cloud prompt body and retained Cohub result.

## Consequences

Entering Cohub now feels like changing conversation ownership inside DSH rather than launching a nested product, and any ordinary local navigation returns directly to the local conversation. Cohub still owns the Agent, prompt, Turn lifecycle, Session persistence, thinking text, and tool activity. Local DSH Sessions remain mounted but inactive underneath and are not synchronized or modified.

This note refines the presentation decision in [Native Cohub Agent Sessions in DSH](2026-08-23-cohub-native-agent-sessions.md); that note continues to own execution and persistence boundaries.
