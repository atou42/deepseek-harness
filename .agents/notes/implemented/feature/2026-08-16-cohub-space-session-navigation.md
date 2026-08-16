# Agent Note: Cohub Space Session navigation

Status: implemented

English | [中文](2026-08-16-cohub-space-session-navigation.zh.md)

## Problem

The first Cohub preview rendered a Space as a cloud folder and exposed its files when expanded. That model is wrong for the workspace navigation surface: a Cohub Space is the conversation container users choose, and its immediate children there are Cohub Sessions.

## Decision

Keep local DSH Workspaces and Cohub Spaces semantically separate but present them in the same Workspace navigation region. The Cohub provider publishes each accessible Space as a marked remote root. Expanding a Space calls the authenticated Host adapter's paginated Session listing and renders each result as a Session leaf with an opaque identity and conversation icon. It does not call the file-tree API.

The Host validates every Session page, follows cursors until complete, and rejects repeated cursors, duplicate Session ids, cross-Space rows, invalid timestamps, and malformed page metadata. A failure remains visible instead of producing a partial or empty-looking list.

This change does not import Cohub Sessions into DSH persistence, change cwd, or claim that a Cohub Session is a local DSH Session. Opening turn history and sending follow-ups remain a later conversation-adapter layer.

## Verification

- Host and client focused tests cover complete pagination, Session identity routing, cancellation, authentication, unload, and the absence of file entries.
- A real client composition test mounts the Workspace browser, generic remote-root registry and UI, and Cohub provider together, then expands a Space and observes a Session row while local Workspace state stays empty.
- A live authenticated browser run against the isolated preview expanded `deepseek harness`, rendered all six Sessions returned by the Cohub CLI/API, and showed no Space files.
