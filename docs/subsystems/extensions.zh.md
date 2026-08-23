# 扩展

[English](extensions.md) | 中文

extensions 子系统允许 agent（智能体）定义带版本的 Cordis 包、运行其 host 与浏览器两半，并在编写代码前查询获准公开的运行时元数据。包生命周期与沙箱行为由 [`packages/extensions`](../../packages/extensions/README.zh.md) 包组说明。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcohubaccount--cohubaccountservice"></a>

### `ctx.cohubAccount` — `CohubAccountService`

The only owner of Cohub account secrets and token refresh within one Host.

```ts cordis-catalog
/**
 * Return the current browser-safe account state.
 * @returns Token-free state for browser consumers.
 * @throws When the service is disposed.
 */
@Remote('getAccount') getAccount(): CohubAccountSnapshot

/**
 * Start device login without exposing the private device code.
 * @returns The public authenticating state after Cohub accepts the device request.
 */
@Remote('beginLogin') async beginRemoteLogin(): Promise<CohubAccountSnapshot>

/**
 * Advance device login once; the browser controls no tokens or credentials.
 * @returns The public state after this poll settles.
 */
@Remote('pollLogin') async pollRemoteLogin(): Promise<CohubAccountSnapshot>

/**
 * Cancel the active device login and return the resulting public state.
 * @returns The restored anonymous or authenticated state.
 */
@Remote('cancelLogin') cancelRemoteLogin(): CohubAccountSnapshot

/**
 * Clear the Host-owned session and report any remote revocation warning.
 * @returns The anonymous public state and an optional remote revocation warning.
 */
@Remote('logout') async logoutRemote(): Promise<CohubRemoteLogoutResult>

/**
 * Start one Cohub device authorization flow.
 * @param signal - Optional caller cancellation.
 * @returns Public verification details; the private device code remains Host-owned.
 */
beginLogin(signal?: AbortSignal): Promise<CohubDeviceAuthorization>

/**
 * Poll the active device authorization once.
 * @param signal - Optional caller cancellation.
 * @returns The pending, slow-down, authenticated, or terminal authorization result.
 */
pollLogin(signal?: AbortSignal): Promise<CohubLoginPollResult>

/** Cancel the active device authorization and restore the preceding account state. */
cancelLogin(): void

/**
 * Resolve a usable Cohub access token, refreshing the private session when required.
 * @returns A current access token owned by the calling Host adapter.
 * @throws When authentication is absent, refresh is rejected, or the service is disposed.
 */
getAccessToken(): Promise<string>

/**
 * Clear the local private session before attempting remote token revocation.
 * @returns An optional warning when remote revocation fails after local logout succeeds.
 */
logout(): Promise<CohubLogoutResult>
```

Source: [`packages/identity/cohub-account/src/index.ts`](../../packages/identity/cohub-account/src/index.ts)

<a id="ctxcohubboard--cohubboardgateway"></a>

### `ctx.cohubBoard` — `CohubBoardGateway`

The only capability is exact, authenticated Board inspection.

```ts cordis-catalog
/**
 * Read one authenticated Cohub Board with its nodes and connections.
 * @param spaceId - Owning Cohub Space id.
 * @param boardId - Board id within that Space.
 * @returns The validated Board snapshot.
 * @throws When ids are invalid, authentication fails, Cohub rejects the request, or the service is disposed.
 */
@Remote('getBoard') getBoard(spaceId: string, boardId: string): Promise<CohubBoardSnapshot>
```

Source: [`packages/host/cohub-board/src/index.ts`](../../packages/host/cohub-board/src/index.ts)

<a id="ctxcohubspaces--cohubspacesgateway"></a>

### `ctx.cohubSpaces` — `CohubSpacesGateway`

Typed Remote service backed only by Cohub account tokens and platform HTTP.

```ts cordis-catalog
/**
 * List all Spaces accessible to the current account.
 * @returns The authenticated account's Spaces.
 */
@Remote('listSpaces') listSpaces(): Promise<readonly CohubSpaceView[]>

/**
 * List every conversation in one Space, following the platform cursor.
 * @param spaceId Cohub Space identity.
 * @returns The complete Session listing.
 */
@Remote('listSessions') listSessions(spaceId: string): Promise<CohubSpaceSessionList>

/**
 * Read all currently retained Turns for one Cohub Session.
 * @param spaceId Cohub Space identity.
 * @param sessionId Cohub Session identity.
 * @returns The complete retained conversation view.
 */
@Remote('getConversation') getConversation(spaceId: string, sessionId: string): Promise<CohubConversationView>

/**
 * Submit one prompt directly to Cohub Agent, creating a Session when sessionId is null.
 * @param spaceId Cohub Space identity.
 * @param sessionId Existing Cohub Session identity, or null for a new Session.
 * @param content User-authored text.
 * @param clientMessageId Caller-generated idempotency identity.
 * @returns The Cohub-owned Session and accepted Turn.
 */
@Remote('sendPrompt') sendPrompt(spaceId: string, sessionId: string | null, content: string, clientMessageId: string): Promise<CohubPromptSubmission>

/**
 * Abort one running native Cohub Agent Turn after verifying its Space ownership.
 * @param spaceId Cohub Space identity.
 * @param sessionId Cohub Session identity.
 * @param turnId Cohub Turn identity.
 * @returns Confirmation that Cohub accepted the abort.
 */
@Remote('abortTurn') abortTurn(spaceId: string, sessionId: string, turnId: string): Promise<CohubAbortTurnResult>

/**
 * Resolve the local DSH working directory used for a Cohub-bound Session.
 * @param spaceId Cohub Space identity.
 * @returns The verified Space identity and local cwd anchor.
 */
@Remote('getDshSessionStart') getDshSessionStart(spaceId: string): Promise<CohubDshSessionStart>

/**
 * Attach one Cohub Space to an existing blank DSH Session.
 * @param spaceId Cohub Space identity.
 * @param dshSessionId Blank DSH Session identity.
 * @returns The installed binding.
 */
@Remote('bindDshSession') bindDshSession(spaceId: string, dshSessionId: string): Promise<CohubDshSessionBinding>

/**
 * List one exact Space-relative directory.
 * @param spaceId Cohub Space identity.
 * @param path Space-relative directory path.
 * @returns The exact directory listing.
 */
@Remote('listDirectory') listDirectory(spaceId: string, path: string): Promise<CohubSpaceDirectory>

/**
 * Read one inline UTF-8 text file.
 * @param spaceId Cohub Space identity.
 * @param path Space-relative file path.
 * @returns The file content and revision.
 */
@Remote('readText') readText(spaceId: string, path: string): Promise<CohubSpaceTextFile>

/**
 * Compare-and-set one UTF-8 text file.
 * @param spaceId Cohub Space identity.
 * @param path Space-relative file path.
 * @param content Replacement UTF-8 content.
 * @param ifRevision Required current revision.
 * @returns The new file or a version conflict.
 */
@Remote('writeText') writeText(spaceId: string, path: string, content: string, ifRevision: string): Promise<CohubSpaceWriteResult>
```

Source: [`packages/host/cohub-spaces/src/index.ts`](../../packages/host/cohub-spaces/src/index.ts)

<a id="ctxcordisinspect--cordisinspectregistryservice"></a>

### `ctx.cordisInspect` — `CordisInspectRegistryService`

Registry and cross-page router behind the two model-facing inspect tools.

```ts cordis-catalog
/**
 * Register one Host provider.
 * @param registration - manifest and local query handler.
 * @returns idempotent disposer.
 */
register(registration: HostCordisInspectProviderRegistration): () => void

/**
 * Replace the mirrored Client provider directory.
 * @param providers - complete Client manifest snapshot.
 */
syncClientManifest(providers: readonly CordisInspectProviderManifest[]): void

/**
 * Return the complete known Host and Client provider directory.
 * @returns Host providers followed by the Client providers.
 */
list(): CordisInspectProviderView[]

/**
 * Execute one provider query on its owning platform.
 * @param platform - Host or Client runtime.
 * @param providerId - provider selected from {@link list}.
 * @param methodName - declared method name.
 * @param input - optional lossless JSON input.
 * @param agent - requesting Agent and scope.
 * @param signal - tool-call cancellation.
 * @returns provider JSON data.
 */
async query( platform: CordisInspectPlatform, providerId: string, methodName: string, input: JsonValue | undefined, agent: Agent, signal: AbortSignal, ): Promise<JsonValue>

/**
 * Accept the first valid Client response for a pending query.
 * @param agent - Agent whose Session owns the query.
 * @param requestId - Pending Client query identity.
 * @param resolution - Client provider result or failure.
 * @returns whether this response settled the still-pending query.
 */
resolveClientQuery( agent: Agent, requestId: CordisInspectRequestId, resolution: CordisInspectQueryResolution, ): CordisInspectResolveAck
```

Types: [Agent](core.zh.md)

Source: [`packages/extensions/cordis-host-runner/src/inspect-registry.ts`](../../packages/extensions/cordis-host-runner/src/inspect-registry.ts)

<a id="ctxdynamiccordisrunner--dynamiccordisrunnerservice"></a>

### `ctx.dynamicCordisRunner` — `DynamicCordisRunnerService`

Dynamic Plugin registry and Host-half lifecycle.

```ts cordis-catalog
/**
 * Define a new Plugin's first Package or append a Package to an existing Plugin.
 * @param request - Session ownership, Plugin selection, metadata, and source code.
 * @returns Host-minted Plugin and Package identities with declared-half metadata.
 */
define(request: DynamicCordisDefineRequest): DynamicCordisDefineReceipt

/**
 * Remove a Plugin, its active run, and all immutable Packages.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to remove.
 * @returns Whether removal succeeded and whether it stopped an active run.
 */
async undefine(agent: Agent, pluginId: CordisDynamicPluginId): Promise<DynamicCordisUndefineReceipt>

/**
 * Remove a Plugin from the user panel and queue the resulting state change for the model's next step.
 * @param agent - Agent whose Session owns the Plugin and receives the context.
 * @param pluginId - Stable Plugin identity to remove.
 * @returns Whether removal succeeded and whether it stopped an active run.
 */
@Remote('undefineFromPanel') async undefineFromPanel(agent: Agent, pluginId: CordisDynamicPluginId): Promise<DynamicCordisUndefineReceipt>

/**
 * Start or update one Package for a model tool call. An unauthorized Client
 * Package waits for approval; Plugin-wide authorization covers later versions.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to activate.
 * @param packageId - Immutable Package version to activate.
 * @param mode - Whether to run the current version or switch versions.
 * @param signal - Tool-call cancellation signal while the activation request is being created.
 * @returns The successful activation identity or an actionable refusal.
 */
async run( agent: Agent, pluginId: CordisDynamicPluginId, packageId: CordisDynamicPackageId, mode: CordisDynamicRunMode, signal?: AbortSignal, ): Promise<DynamicCordisRunResponse>

/**
 * Start Host code for an approved request or a direct panel gesture.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to activate.
 * @param packageId - Immutable Package version to activate.
 * @param mode - Whether to run the current version or switch versions.
 * @param requestId - Model-driven request identity, or null for a direct user gesture.
 * @param approveFutureVersions - Whether this approval covers later Packages of the same Plugin.
 * @returns The exact Host activation or a failure message.
 */
@Remote('runHostHalf') async runHostHalf( agent: Agent, pluginId: CordisDynamicPluginId, packageId: CordisDynamicPackageId, mode: CordisDynamicRunMode, requestId: ApprovalRequestId | null, approveFutureVersions: boolean, ): Promise<DynamicCordisHostHalfResult>

/**
 * Fetch Client code for the exact active run.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to read.
 * @param pluginRunId - Exact active run authorized to receive source.
 * @returns Client source and its Plugin, Package, and run identities.
 */
@Remote('getClientCode') getClientCode( agent: Agent, pluginId: CordisDynamicPluginId, pluginRunId: CordisDynamicPluginRunId, ): DynamicCordisClientSource

/**
 * Resolve one model-driven Client activation request.
 * @param requestId - Request identity to settle once.
 * @param resolution - Browser refusal or exact Client activation result.
 * @returns Whether the still-pending request accepted this resolution.
 */
@Remote('resolveRequestRun') async resolveRequestRun( requestId: ApprovalRequestId, resolution: DynamicCordisRunResolution, ): Promise<DynamicCordisResolveAck>

/**
 * Settle a direct panel run after this page loaded or failed its Client half.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity being settled.
 * @param resolution - Exact Client activation result from the acting page.
 * @returns The committed activation or its failure.
 */
@Remote('settleUserRun') async settleUserRun( agent: Agent, pluginId: CordisDynamicPluginId, resolution: DynamicCordisRunResolution, ): Promise<DynamicCordisRunResponse>

/**
 * Stop the active run while retaining every Package version.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to stop.
 * @returns Success or the reason no run was stopped.
 */
async stop(agent: Agent, pluginId: CordisDynamicPluginId): Promise<DynamicCordisStopResponse>

/**
 * Stop a Plugin from the user panel and queue the resulting state change for the model's next step.
 * @param agent - Agent whose Session owns the Plugin and receives the context.
 * @param pluginId - Stable Plugin identity to stop.
 * @returns Success or the reason no run was stopped.
 */
@Remote('stopFromPanel') async stopFromPanel(agent: Agent, pluginId: CordisDynamicPluginId): Promise<DynamicCordisStopResponse>

/**
 * Replace the Host mirror of the Client inspect provider directory.
 * @param providers - complete Client provider manifest.
 * @returns null after accepting the manifest.
 */
@Remote('syncInspectManifest') syncInspectManifest(providers: readonly CordisInspectProviderManifest[]): null

/**
 * Claim one pending Client inspect query with its live result.
 * @param agent - Session that owns the query.
 * @param requestId - exact pending query identity.
 * @param resolution - provider result or structured refusal.
 * @returns whether this answer won the query.
 */
@Remote('resolveInspectQuery') resolveInspectQuery( agent: Agent, requestId: CordisInspectRequestId, resolution: CordisInspectQueryResolution, ): CordisInspectResolveAck

/**
 * Frame-wide inventory, grouped as one row per stable Plugin.
 * @returns Source-free metadata for every process-local Plugin.
 */
@Remote('inventory') inventory(): DynamicCordisInventoryRow[]

/**
 * Read one Session's Host-rich state for inspection and result rendering.
 * @param agent - Agent whose Session selects visible Plugins.
 * @returns Plugin versions, active runs, Host fibers, and render failures.
 */
snapshot(agent: Agent): DynamicCordisSnapshotRow[]

/**
 * Read source-free context for an explicit `@pluginId` user gesture.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity referenced by the user.
 * @returns The preferred modification base, or undefined when unavailable.
 */
reference(agent: Agent, pluginId: CordisDynamicPluginId): DynamicCordisReference | undefined

/**
 * List source-free Plugin summaries owned by one Session.
 * @param agent - Agent whose Session selects visible Plugins.
 * @returns one summary per Plugin in creation order.
 */
listPlugins(agent: Agent): DynamicCordisPluginInspection[]

/**
 * Inspect one Plugin without returning Package source.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - stable Plugin identity.
 * @returns version pointers, latest run, and all Package summaries.
 */
inspectPlugin(agent: Agent, pluginId: CordisDynamicPluginId): DynamicCordisPluginInspection

/**
 * Read one exact immutable Package and its Host and Client source.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity that owns the Package.
 * @param packageId - Exact immutable Package identity to inspect.
 * @returns Package metadata, source, and the Plugin's lifecycle pointers.
 */
inspectPackage( agent: Agent, pluginId: CordisDynamicPluginId, packageId: CordisDynamicPackageId, ): DynamicCordisPackageInspection

/**
 * Record a post-load render failure for the exact active run.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity that rendered.
 * @param pluginRunId - Exact active run that produced the failure.
 * @param failure - Slot, message, and entry-retirement result.
 * @returns Null after recording or ignoring a stale report.
 */
@Remote('reportRenderFailure') async reportRenderFailure( agent: Agent, pluginId: CordisDynamicPluginId, pluginRunId: CordisDynamicPluginRunId, failure: DynamicCordisRenderFailure, ): Promise<null>

/**
 * Report a Client guard rejection that happened after the Package completed activation.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity whose Client code was rejected.
 * @param pluginRunId - Exact active run that produced the rejection.
 * @param failure - Original guard message and stack.
 * @returns Null after reporting or ignoring a stale/startup failure.
 */
@Remote('reportClientGuardFailure') async reportClientGuardFailure( agent: Agent, pluginId: CordisDynamicPluginId, pluginRunId: CordisDynamicPluginRunId, failure: CordisErrorDetails, ): Promise<null>

/**
 * Invoke an active Host method while rejecting stale Client runs.
 * @param pluginId - Stable Plugin identity that owns the method.
 * @param pluginRunId - Exact active run authorizing the call.
 * @param method - Registered Host handler name.
 * @param args - JSON argument delivered to the handler.
 * @returns The JSON result or a typed invocation failure.
 */
@Remote('invoke') async invoke( pluginId: CordisDynamicPluginId, pluginRunId: CordisDynamicPluginRunId, method: string, args: JsonValue, ): Promise<DynamicCordisInvokeResult>
```

Types: [Agent](core.zh.md)

Source: [`packages/extensions/cordis-host-runner/src/index.ts`](../../packages/extensions/cordis-host-runner/src/index.ts)

<a id="cohub-spaces-events"></a>

### `cohub-spaces/*` events

<a id="cohub-spaceschanged--emit"></a>

#### `cohub-spaces/changed` — emit

The account state changed; browser-side Space sources should refresh.

```ts cordis-catalog
/**
 * The account state changed; browser-side Space sources should refresh.
 * @mode emit
 */
'cohub-spaces/changed'(): void
```

Source: [`packages/host/cohub-spaces/src/types.ts`](../../packages/host/cohub-spaces/src/types.ts)

<a id="cordis-events"></a>

### `cordis/*` events

<a id="cordisdynamic-package--emit"></a>

#### `cordis/dynamic-package` — emit

One exact Plugin/Package activation is now live in the Host.

```ts cordis-catalog
/**
 * One exact Plugin/Package activation is now live in the Host.
 * @param pkg - stable plugin, immutable package, run identity, and label.
 * @mode emit
 */
'cordis/dynamic-package'(pkg: DynamicCordisPackage): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)

<a id="cordisdynamic-retract--emit"></a>

#### `cordis/dynamic-retract` — emit

One exact activation was withdrawn.

```ts cordis-catalog
/**
 * One exact activation was withdrawn.
 * @param retracted - plugin, package, and run identity.
 * @mode emit
 */
'cordis/dynamic-retract'(retracted: DynamicCordisRetracted): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)

<a id="cordisinspect-query--emit"></a>

#### `cordis/inspect-query` — emit

Request a live read-only query from the Client inspect registry.

```ts cordis-catalog
/**
 * Request a live read-only query from the Client inspect registry.
 * @param request - correlation, Session, provider, method, and JSON input.
 * @mode emit
 */
'cordis/inspect-query'(request: CordisInspectQueryRequest): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)

<a id="cordisinspect-query-resolved--emit"></a>

#### `cordis/inspect-query-resolved` — emit

Notify every Client that an inspect query has settled or been cancelled.

```ts cordis-catalog
/**
 * Notify every Client that an inspect query has settled or been cancelled.
 * @param resolved - exact query identity that is no longer answerable.
 * @mode emit
 */
'cordis/inspect-query-resolved'(resolved: CordisInspectQueryResolved): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)

<a id="cordisrequest-run--emit"></a>

#### `cordis/request-run` — emit

A Client-bearing activation needs a browser page, and may require a user decision.

```ts cordis-catalog
/**
 * A Client-bearing activation needs a browser page, and may require a user decision.
 * @param request - correlation identity, owner, target version, mode, and approval requirement.
 * @mode emit
 */
'cordis/request-run'(request: DynamicCordisRunRequest): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)

<a id="cordisrequest-run-resolved--emit"></a>

#### `cordis/request-run-resolved` — emit

A pending Client activation request left the answerable state.

```ts cordis-catalog
/**
 * A pending Client activation request left the answerable state.
 * @param resolved - request identity and outcome.
 * @mode emit
 */
'cordis/request-run-resolved'(resolved: DynamicCordisRequestResolved): void
```

Source: [`packages/extensions/cordis-host-runner/src/types.ts`](../../packages/extensions/cordis-host-runner/src/types.ts)
<!-- END GENERATED cordis-surface -->
