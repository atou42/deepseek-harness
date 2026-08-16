# Agent Note: Cohub Space DSH Session binding

Status: implemented

English | [中文](2026-08-17-cohub-space-dsh-session-binding.zh.md)

## Problem

Selecting a Cohub Space entered Cohub Agent's conversation path. That bypassed the DSH Agent, its transcript, its local tools, and the harness behavior the integration exists to provide. A malformed assumption that every Cohub Session has a non-blank title also made one untitled Session reject the complete Space listing.

## Decision

Selecting a Cohub Space resolves a configured local cwd, idempotently registers that path as an ordinary local Workspace, and creates a Host-backed DSH Session in it. The browser binds the chosen Space before opening that Session, so binding failure remains visible and never publishes a usable-looking selection. The Cohub Space identity and paths remain remote; the local Workspace is a separate anchor for DSH local tools.

The Host binding verifies that the Space is accessible and the target DSH Agent is live and has no user turn. It injects one durable instruction message and registers four Agent-scoped tools for Space-relative directory listing, UTF-8 reads, compare-and-set writes, and bounded one-shot commands. Existing local DSH tools remain registered, so one DSH conversation can operate on local and Cohub resources together. A resumed Agent reconstructs the binding after the instruction message has entered its durable log.

Cohub Session leaves remain provider-owned history. Opening one renders a read-only Turn inspector with no prompt composer or Cohub Agent route. Session titles are required to be strings but may be blank; the browser uses the latest message text or a stable short-id label when it needs a display name.

## Alternatives considered

**Send prompts directly to Cohub Agent.** This creates a second harness inside the workspace selection flow and removes the DSH Agent from the task, which contradicts the integration's purpose.

**Convert the Space itself into a local Workspace.** A Space has no local canonical path or cwd semantics. The implemented local cwd is a separate explicit anchor; it does not reinterpret Space paths or silently synchronize them.

**Register Cohub tools globally.** Global tools would expose one account's Spaces to unrelated DSH Sessions. Agent-scoped registration keeps capability and model context attached to the selected Session.

## Verification

- Host tests reproduce blank Session titles, prove that binding retains the existing DSH Agent, installs four scoped tools and durable context, runs a cloud command, and never calls the Cohub prompt endpoint.
- Client registry and provider tests prove that root activation awaits DSH Session creation and Host binding before opening, while Cohub Session history stays read-only.
- Workspace and overlay tests prove that Space selection keeps the ordinary DSH workbench and that a root-only selection does not render the provider conversation overlay.
- A live browser run proved that selecting the Space opens the normal DSH composer in the local Workspace, exposes the durable `cohub-space` context, and lists Cohub Sessions without the untitled row breaking the Space.

## Consequences

DSH owns new conversation history, model selection, local tools, and harness behavior. Cohub owns Space files, command tasks, and old Cohub Session history. The binding is recoverable after its injected instruction reaches the DSH log; a process exit between binding and the first DSH prompt can leave a still-blank Session without a recoverable binding marker.
