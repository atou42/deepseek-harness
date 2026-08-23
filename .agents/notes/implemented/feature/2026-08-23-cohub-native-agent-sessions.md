# Agent Note: Native Cohub Agent Sessions in DSH

Status: implemented

English | [中文](2026-08-23-cohub-native-agent-sessions.zh.md)

## Problem

DSH already lets a local Agent bind a Cohub Space as remote context. That is useful, but it is not the same product as running Cohub Agent inside the Space: the Agent, prompt, Turn lifecycle, and Session persistence remain local. Presenting one unlabeled Space choice for both meanings made execution ownership impossible to understand and prevented users from continuing the same cloud Session from Cohub.

## Decision

Expose two explicit modes for every capable Cohub Space:

- **Cohub Agent · Cloud** opens or creates a provider-owned Cohub Session. DSH is the client shell only. Prompt execution, Turn state, history, cancellation, and persistence remain in Cohub.
- **DSH Agent · Local** starts an ordinary local DSH Session and binds the selected Space as remote context. The DSH Agent and local Session log remain authoritative.

The Workspace picker searches both local Workspaces and Cohub Spaces, and names both Cohub modes on separate rows. The remote tree exposes the same two actions. Selecting an existing Session or the cloud action opens a Cohub-specific conversation panel with a cloud ownership label and its own composer; it never dispatches through the local DSH composer or Agent loop.

The Host adapter submits text prompts to Cohub's Space prompt API, uses the caller's `clientMessageId` as the idempotency identity, projects the accepted Session and Turn, polls retained Turn history while work is non-terminal, and aborts through Cohub after verifying that the requested Turn belongs to the selected Space and Session. Space, Session, and Turn identities stay opaque across the generic remote-root boundary. Browser code receives no bearer token.

An interrupted prompt response is an unknown outcome, not a failed prompt. The composer keeps the draft, explains that the Session must be refreshed, and reuses the same `clientMessageId` when unchanged content is retried. Changing the draft creates a new identity. Provider validation, authentication, transport, malformed response, and abort failures remain visible instead of degrading to an empty Session or local fallback.

## Alternatives considered

**Keep only the local DSH binding.** This preserves one harness path but cannot produce a native Cohub Session, use Cohub Agent's prompt, or make the conversation available inside Cohub.

**Silently choose a mode from where the Space was clicked.** The same Space would then change execution and persistence ownership without an explicit user decision.

**Mirror local DSH events into Cohub after execution.** A copied transcript is not a Cohub Agent run: tool execution, Turn status, cancellation, and provider-side continuation would still disagree. Native mode therefore sends the prompt to Cohub at the start.

**Import Cohub Sessions into local DSH persistence.** Dual-write introduces conflict and retry ambiguity. Cohub stays authoritative in cloud mode, and DSH renders the provider projection.

## Verification

- Host tests cover native prompt creation and continuation, immediate-response validation, opaque Session/Turn ownership, and abort verification.
- Provider and generic remote-root tests cover the interactive capability, separate local/cloud activation, message and abort routing, identity validation, disposal, and active-target updates.
- UI tests cover the searchable two-mode picker, explicit tree actions, new and existing cloud Sessions, the Cohub composer, polling, cancellation, and idempotent unknown-outcome retry.
- The assembled browser snapshot boots the real shipped Web composition plus the Cohub preview overlay. Its only fake boundary is a local HTTP server standing in for Cohub. It pins the visible cloud/local choice, authenticated Host-only bearer use, native prompt submission, retained Cohub result, and the provider-owned conversation panel.
- A live authenticated smoke was not run: the installed Cohub CLI currently reports `Not authenticated`. The test suite therefore does not claim that a real Cohub Session was created. Live verification remains the deployment gate before publishing this build.

## Consequences

DSH can now be either a local harness using Cohub context or a client for a native Cohub Agent Session, with ownership visible before the first prompt. Native cloud conversations remain available from Cohub and other machines because Cohub owns them. Local DSH Sessions are unchanged and are not uploaded merely because a Space is bound.

This note partially supersedes the read-only interaction choice in [Cohub Space Session navigation](2026-08-16-cohub-space-session-navigation.md). That note continues to own the Space-as-Session-container navigation and opaque identity model; this note owns interactive Cohub execution and the explicit two-mode choice.
