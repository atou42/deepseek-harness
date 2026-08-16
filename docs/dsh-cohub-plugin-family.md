# DSH × Cohub Plugin Family

English | [中文](dsh-cohub-plugin-family.zh.md)

This document defines how Cohub capabilities compose inside DSH. It is a family of independently loadable packages, not a bundled application or a Cohub runtime embedded in DSH.

## Composition rule

Identity and product capabilities are separate layers. A package that calls an authenticated Cohub API depends on the Host-side Cohub Account service. A provider-neutral or browser-local capability does not.

The browser account surface is optional. Removing it removes the sign-in interface, not the Host account service. No other package owns, persists, refreshes, exports, or revokes Cohub credentials. Cordis resolves activation through declared services, not file order.

## Package map

| Concern | Host package | Browser package | Cohub identity |
| --- | --- | --- | --- |
| Generic remote folders | — | `@deepseek-ai/dsh-client-remote-roots` and `@deepseek-ai/dsh-client-ui-remote-roots` | Not required |
| Cohub account | `@deepseek-ai/dsh-cohub-account` | `@deepseek-ai/dsh-client-cohub-account` | Host owns identity; browser receives token-free state |
| Space files | `@deepseek-ai/dsh-cohub-spaces` | `@deepseek-ai/dsh-client-cohub-spaces` | Required |
| Generative models | `@deepseek-ai/dsh-llm-cohub` | Existing DSH model surfaces | Required |
| Multimedia generation | `@deepseek-ai/dsh-cohub-generation` | Existing DSH tool surfaces | Required |
| Board | `@deepseek-ai/dsh-cohub-board` | `@deepseek-ai/dsh-client-cohub-board` | Required |

The generic remote-folder seam is Cohub-independent. Another provider can register marked roots without importing Cohub or requiring a Cohub login.

## Independent compositions

### Provider-neutral cloud tree

Load the generic remote-root registry and UI. Provider packages may contribute cloud, network, or external folders. No Cohub account is involved.

### Cohub sign-in only

Load Cohub Account on the Host and optionally its browser UI. This enables device login and logout, but no Space, model, generation, or Board capability by itself.

### Cohub Spaces as cloud folders

Load Cohub Account, Cohub Spaces, the generic remote-root registry and UI, and the Cohub Spaces browser provider. Each accessible Space appears as a folder-like root marked `Cohub`.

A Space root never enters DSH local Workspaces. Expanding it does not change a Session working directory, create a local path, change Shell behavior, or start a Cohub Session. Opaque Space-relative identities cross the remote-root seam.

### Model, generation, and Board

The model composition is Cohub Account plus `@deepseek-ai/dsh-llm-cohub` and an explicit Space. The multimedia composition is Cohub Account plus `@deepseek-ai/dsh-cohub-generation` and an explicit Space. Neither requires Space files, Board, or Cohub browser UI.

The Board composition loads Cohub Account, Cohub Spaces, Cohub Board, and its browser surface. It discovers `.board` manifests through the Space API and renders a read-only Board separately from the file tree.

## Failure and unload behavior

Missing identity is an explicit anonymous or authorization state. Corrupt identity, malformed provider data, denied access, transport failure, and unavailable capabilities remain visible failures; none become empty folders, anonymous success, or default model results.

Each package unregisters only what it owns. Lifecycle fences prevent late asynchronous completion from restoring unloaded state. Removing a capability does not log out the user. Logging out invalidates Cohub-backed capabilities without removing provider-neutral browser features.

## Deliberate non-goals

This family does not embed the Cohub CLI or SDK, take over DSH execution, expose remote Shell, silently synchronize Space files, publish Works, convert Spaces into local Workspaces, or introduce an all-in-one convenience bundle.

Composition stays explicit in a profile patch or deployment layer. This preserves user choice and prevents an all-or-nothing stack.
