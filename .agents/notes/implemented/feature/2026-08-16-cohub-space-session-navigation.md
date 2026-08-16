# Agent Note: Cohub Space Session navigation

Status: implemented

English | [中文](2026-08-16-cohub-space-session-navigation.zh.md)

## Problem

The first Cohub preview rendered a Space as a cloud folder and exposed its files when expanded. That model is wrong for the workspace navigation surface: a Cohub Space is the conversation container users choose, and its immediate children there are Cohub Sessions.

## Decision

Keep local DSH Workspaces and Cohub Spaces semantically separate but present them in the same Workspace navigation and selection surfaces. The Cohub provider publishes each accessible Space as a marked remote root. Expanding a Space calls the authenticated Host adapter's paginated Session listing and renders each result as a Session leaf with an opaque identity and conversation icon. It does not call the file-tree API.

The main Workspace picker lists remote roots alongside local Workspaces. Choosing a Cohub Space starts the ordinary DSH workbench through the [Cohub Space DSH Session binding](../bug-fix/2026-08-17-cohub-space-dsh-session-binding.md). Choosing an existing Cohub Session opens its Turn history in a read-only inspector; this navigation path never sends a prompt to Cohub Agent.

The Host validates every Session page, follows cursors until complete, and rejects repeated cursors, duplicate Session ids, cross-Space rows, invalid timestamps, and malformed page metadata. A failure remains visible instead of producing a partial or empty-looking list.

This change does not import Cohub Sessions into DSH persistence, change cwd, or claim that a Cohub Session is a local DSH Session. Cohub remains the source of truth for provider Session and Turn history.

## Alternatives considered

**Show Space files in the Workspace tree.** This hides the Session model users expect from Cohub and duplicates file access that belongs in the bound DSH Agent tools.

**Open Cohub Agent when a Space is selected.** This bypasses the DSH harness and is superseded by the linked DSH Session binding.

## Verification

- Host and client focused tests cover complete Session and Turn pagination, opaque identity routing, cancellation, authentication, unload, empty titles, and the absence of file entries.
- Picker and conversation UI tests prove that provider Session rows open read-only history without rendering a provider prompt composer.
- A real client composition test mounts the Workspace browser, generic remote-root registry and UI, and Cohub provider together, then expands a Space and observes a Session row while local Workspace state stays empty.
- A live authenticated browser run against the isolated preview expanded `deepseek harness`, rendered all six Sessions returned by the Cohub CLI/API, and showed no Space files.

## Consequences

The navigation tree now distinguishes starting new DSH work from reading existing Cohub history. Cohub Session history remains read-only in this surface, while file operations move to the bound DSH Agent tools.
