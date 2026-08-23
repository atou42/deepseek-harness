# Cohub Board

English | [中文](README.zh.md)

Read-only Host adapter for inspecting Cohub Boards. Authentication is owned by Cohub Account. This package exposes no create, edit, transaction, playback, publish, session, shell, or Workspace capability.

## Model Experience

None, as this Host-side Board adapter registers no prompt, tool, message, or provider request.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- Board manifests are discovered through the separate Cohub Space provider. Board editing and private binary asset proxying are intentionally unavailable.
