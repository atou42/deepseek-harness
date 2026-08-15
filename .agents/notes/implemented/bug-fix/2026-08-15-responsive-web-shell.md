# Agent Note: Narrow viewports keep the conversation usable

Status: implemented

English | [中文](2026-08-15-responsive-web-shell.zh.md)

## Problem

The web shell auto-collapsed its sidebar below 1024px, but reopening it widened the sidebar grid track. That compressed the conversation instead of treating the session list as temporary navigation. At phone widths, the settings dialog also kept its 188px navigation beside an 800px panel, and provider rows kept every action on one line. The resulting horizontal pressure clipped the conversation header, settings content, provider names, or actions on the screens that most needed the compact posture.

These failures came from independent components preserving their desktop geometry. No single component owned a phone layout, so a narrow viewport still received a collection of valid desktop widths that could not fit together.

## Decision

The shell keeps the 56px sidebar rail as its grid track on viewports below the existing 1024px auto-collapse breakpoint. Opening the sidebar paints the stored sidebar width over the conversation, capped to leave 48px visible, and adds a mask behind it. Closing the mask, toggling the sidebar, or selecting another session dismisses the overlay without changing the stored desktop width.

At 720px and below, the settings panel becomes a full-viewport vertical sheet. Its section navigation becomes a horizontally scrollable row, and the content takes the remaining height. Provider rows allow their identity and actions to wrap; long names ellipsize instead of widening the sheet. The conversation header uses smaller gaps and a bounded breadcrumb at the same breakpoint.

The breakpoints remain presentation facts. The layout store records only the existing desktop width preference and a transient narrow-overlay flag; it does not persist viewport-derived geometry.

## Alternatives considered

- **Keep widening the grid track.** This preserved the previous column solver but made navigation consume permanent conversation width while it was open, which is the failure on narrow screens.
- **Replace the compact rail with a full-screen sidebar.** This gave the session list more room but removed the always-available navigation controls and created a second mobile shell posture.
- **Apply only CSS overflow rules.** Overflow could hide the clipped content, but it could not keep the conversation track stable or dismiss the sidebar when the selected session changed.

## Consequences

The sidebar temporarily covers part of the conversation while open, but the conversation keeps its width and scroll position. Desktop geometry, drag widths, and the details concession chain are unchanged. The settings sheet uses the full phone viewport rather than retaining the desktop dialog margins.

Layout tests pin the fixed rail track, overlay width, dismissal behavior, and preserved desktop preference. Stylesheet tests pin the 720px settings stack and provider-row wrapping, while the assembled keyless web snapshot proves that the built plugin graph exposes and dismisses the overlay through the real sidebar control.
