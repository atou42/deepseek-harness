# Agent Note: Remote roots and Cohub plugin boundaries

Status: proposed

English | [中文](2026-08-16-remote-roots-and-cohub-plugin-boundaries.zh.md)

## Problem

Cloud workspaces should be discoverable in the DSH navigation without pretending that a remote provider is a local Workspace directory. Reusing Workspace paths would incorrectly move Session cwd and imply that Shell and filesystem services share the remote execution world. Coupling Cohub login, files, models, generated assets, and Board into one plugin would also make identity-free UI impossible to reuse.

## Decision

Introduce a generic client-side remote-root registry. Each source publishes explicitly marked roots and operates on provider-owned opaque identifiers. The contract has no local path and does not create or mutate DSH Workspaces. Browse, read, and compare-and-set write are callbacks behind the source boundary. Registration is unique by source id, malformed snapshots fail loudly, and Cordis disposal withdraws the source and its subscriptions.

Cohub remains outside this generic package. One host-side Cohub Account capability will own credentials and session lifecycle. Separate Cohub adapters will expose Space files, model access, generation, and Board through generic seams. Identity-free tree, file, Board, and result presentation packages will depend only on those seams. An optional bundle may compose leaves but may not become a second owner of state.

## Consequences

Remote roots can look folder-like while remaining semantically distinct from Workspace, cwd, and Shell. Other cloud providers can reuse the same UI. More packages and explicit dependency edges are required, but each capability can load and unload independently. Board and generated assets need their own contracts instead of being smuggled through the file tree.

## Rejected alternatives

Adding a `cohub://` path to Workspace was rejected because it would violate existing cwd and execution-world semantics. Mounting an iframe was rejected because Cohub would own the surrounding authentication and UI lifecycle. A single all-in-one Cohub plugin was rejected because generic presentation would become login-dependent and leaf capabilities could not unload independently.

## Required verification

The implemented note must cite tests proving duplicate rejection, malformed-publication failure, opaque-ID routing, explicit write conflicts, source withdrawal, late provider updates after unload doing nothing, local Workspace regression coverage, anonymous generic UI behavior, authentication failure behavior, and a real composed Cohub flow in an isolated Harness home.

