import { HttpStatus } from "@nestjs/common";
import { failure } from "@evcp/api-client";
import { PlatformSessionError } from "./auth/platform-session-service";
import type { PlatformResponse } from "./platform-http-types";

// Maps a thrown error to the platform HTTP response envelope. Domain errors are matched by
// `error.name` (see the error classes in platform-services.ts) so this stays free of import
// cycles with the service layer.
export function errorResponse(error: unknown): PlatformResponse {
  if (error instanceof PlatformSessionError)
    return {
      status: HttpStatus.UNAUTHORIZED,
      body: failure("UNAUTHORIZED", "Invalid, expired, or revoked platform session")
    };

  if (error instanceof Error && error.name === "MockAuthError") {
    return { status: HttpStatus.UNAUTHORIZED, body: failure("UNAUTHORIZED", error.message) };
  }

  if (error instanceof Error && error.name === "PermissionError") {
    return { status: HttpStatus.FORBIDDEN, body: failure("FORBIDDEN", error.message) };
  }

  if (error instanceof Error && error.name === "ValidationError") {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      body: failure("VALIDATION_ERROR", error.message)
    };
  }

  if (error instanceof Error && error.name === "ConflictError") {
    return { status: HttpStatus.CONFLICT, body: failure("CONFLICT", error.message) };
  }

  if (error instanceof Error && error.name === "ProjectDeletionInProgressError") {
    return {
      status: HttpStatus.CONFLICT,
      body: failure("PROJECT_DELETION_IN_PROGRESS", error.message)
    };
  }

  if (error instanceof Error && error.name === "QuotaExceededError") {
    return { status: HttpStatus.TOO_MANY_REQUESTS, body: failure("QUOTA_EXCEEDED", error.message) };
  }

  // Unmapped errors otherwise vanish behind the generic 500 body, leaving no trace in the
  // logs — surface the real error (and stack) so operators can diagnose them.
  console.error("[platform-api] unhandled request error:", error);
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: failure("INTERNAL_ERROR", "Unexpected platform API error")
  };
}
