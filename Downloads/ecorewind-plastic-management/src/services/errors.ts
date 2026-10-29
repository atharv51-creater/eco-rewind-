export class ApiError extends Error {
  public status: number;
  public code: string;
  public details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Parses diverse server response bodies into a normalized ApiError
 */
export async function parseErrorResponse(response: Response): Promise<ApiError> {
  const status = response.status;
  let code = "UNKNOWN_ERROR";
  let message = `Request failed with status ${status}`;
  let details: unknown = undefined;

  try {
    const data = await response.json();
    if (data && typeof data === "object") {
      // Shape 1: { detail: { code: "...", message: "..." } }
      if (data.detail && typeof data.detail === "object" && data.detail.message) {
        code = data.detail.code || code;
        message = data.detail.message;
        details = data.detail.details;
      }
      // Shape 2: { error: { code: "...", message: "...", details?: [...] } }
      else if (data.error && typeof data.error === "object" && data.error.message) {
        code = data.error.code || code;
        message = data.error.message;
        details = data.error.details;
      }
      // Shape 3: { detail: "Not Found" } (plain string)
      else if (typeof data.detail === "string") {
        message = data.detail;
        if (status === 404) code = "NOT_FOUND";
        else if (status === 400) code = "BAD_REQUEST";
        else if (status === 409) code = "CONFLICT";
        else if (status === 503) code = "SERVICE_OFFLINE";
      } else if (data.message && typeof data.message === "string") {
        message = data.message;
      }
    }
  } catch {
    // If not json, use statusText or generic message
    if (status === 503) {
      code = "SERVICE_OFFLINE";
      message = "EcoRewind scanner service is currently offline or unreachable.";
    } else if (status === 500) {
      code = "SERVER_ERROR";
      message = "Internal server error occurred.";
    } else {
      message = response.statusText || message;
    }
  }

  // Map common HTTP statuses if code remains default
  if (code === "UNKNOWN_ERROR") {
    if (status === 400) code = "BAD_REQUEST";
    else if (status === 404) code = "NOT_FOUND";
    else if (status === 409) code = "CONFLICT";
    else if (status === 422) code = "VALIDATION_ERROR";
    else if (status === 503) code = "SERVICE_OFFLINE";
  }

  return new ApiError(status, code, message, details);
}
