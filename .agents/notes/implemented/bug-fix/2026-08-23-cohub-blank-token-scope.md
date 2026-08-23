# Agent Note: Cohub blank OAuth token scope

Status: implemented

English | [中文](2026-08-23-cohub-blank-token-scope.zh.md)

## Problem

Cohub's successful OAuth device-token response may contain `scope: ""` when the granted scope is unchanged. The account parser treated every present string as a required non-blank value, so a valid login failed after authorization with `cohub-account: token scope must be a non-blank string` and never reached the authenticated state.

## Decision

Treat an absent, null, or blank token-response scope as omission and retain the exact scope requested by the account configuration. A non-blank response scope remains authoritative. A present non-string value remains malformed and fails explicitly; this compatibility rule does not weaken validation of any token, expiry, or stored-session field.

## Testing

The account service test completes the real begin-login and poll-login flow with a blank token-response scope, then asserts authentication succeeds and the persisted private session retains the requested `openid offline_access` scope. Existing malformed-response and refresh tests continue to pin strict validation and session lifecycle behavior.

## Alternatives considered

**Reject every blank response field uniformly.** Rejected because OAuth `scope` is optional response metadata and Cohub uses a blank string to represent the unchanged requested grant; rejecting it converts a successful exchange into a local protocol error.

**Persist a blank scope.** Rejected because refresh requests require the effective grant, and an empty value loses the configured request semantics.

## Consequences

Cohub login completes when the token endpoint returns a blank scope, while malformed scope types still surface as protocol failures. The persisted session always records a non-blank effective scope for later refreshes.
