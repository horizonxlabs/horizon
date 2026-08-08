# Web App Access Without Installation Design

**Date:** 2026-08-08  
**Status:** Approved design  
**Scope:** App Store MVP user flow

## Objective

Make published web applications immediately usable after access is approved. The Store must not ask a user to install or uninstall a web application.

## User Flow

The primary action is derived from access state:

| Access state | User action |
|---|---|
| `available` | Request Access |
| `pending` | View Status |
| `active` | Open App |

Opening an app uses its published runtime route and records the app in the device-local Recent list before navigation.

## Store Behavior

- My Apps means apps whose current user access is `active`; installation state does not affect membership.
- Available Apps contains apps whose access is not active.
- App cards and app detail must not show Install, Remove, Uninstall, installation status, or an installation journey.
- Search keeps collection and access filters but removes installation-status filtering and installation copy.
- Loading and empty-state copy describes access and available applications, not installed applications.
- Access-request submission and status display keep their existing API-backed behavior.
- An active app is openable even when a legacy response says `installStatus: not_installed`.

## Safety and Availability

Open App remains fail-closed when the current published app record is unavailable, unhealthy, inaccessible, or does not provide a usable runtime route. The UI must not synthesize a successful route or bypass current access checks.

## Compatibility Boundary

The existing installation API methods, response fields, persistence models, and server routes remain temporarily available for older clients and operational compatibility. The Store MVP no longer invokes or presents them. They are compatibility-only and may be removed in a separate migration after usage is audited.

## Testing

Integration coverage must prove:

- Active access exposes Open App regardless of legacy installation status.
- Install and Uninstall controls and the installation journey are absent.
- My Apps is derived from active access.
- Available access exposes Request Access.
- Pending access exposes View Status.
- Search does not expose an installation-status filter.
- Opening a usable app still records Recent and navigates to the published route.

Existing backend installation tests remain unchanged because this MVP does not remove compatibility APIs.

## Out of Scope

- Deleting installation endpoints, database tables, or API-client fields.
- Automatically creating installation records when access is approved.
- Changing Creator approval semantics.
- Changing publish or deployment infrastructure.
