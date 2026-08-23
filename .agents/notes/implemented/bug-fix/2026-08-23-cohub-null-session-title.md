# Agent Note: Cohub null Session titles

Status: implemented

English | [中文](2026-08-23-cohub-null-session-title.zh.md)

## Problem

Cohub can return `title: null` for an untitled Session. The Space adapter required every Session title to be a string, so one valid untitled row caused `listSessions` to reject the entire Space and prevented every Session from being opened.

## Decision

Project a missing or null Session title to the existing empty-string untitled representation. Continue rejecting every other non-string title type, duplicate identity, malformed timestamp, and cross-Space row.

## Testing

The regression test uses the reported Session identity with `title: null`, proves the old parser rejects it, then verifies the fixed list retains the Session with an empty title. The full Cohub Space and remote-root package test set also passes.

## Alternatives considered

**Drop the malformed row.** Rejected because silently returning an incomplete Session list hides platform data and makes a valid conversation disappear.

**Stringify arbitrary title values.** Rejected because objects and numbers remain malformed protocol data and must fail explicitly.

## Consequences

Untitled Cohub Sessions no longer block the Space listing. The browser keeps ownership of the user-facing fallback label, while genuinely malformed title values remain visible errors.
