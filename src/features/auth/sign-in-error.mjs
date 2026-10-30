export const INVALID_CREDENTIALS_MESSAGE =
  "The registered email or password is incorrect.";

export const AUTH_SERVICE_UNAVAILABLE_MESSAGE =
  "Cannot reach the authentication service. Check your internet or DNS connection and try again.";

export const AUTH_CONFIGURATION_ERROR_MESSAGE =
  "Authentication is temporarily unavailable. Contact the System Administrator.";

/** Do not misreport an unavailable Supabase API as a bad password. */
export function isAuthServiceUnavailable(error) {
  const status = Number(error?.status);
  const message = String(error?.message || "");
  return error?.name === "AuthRetryableFetchError" ||
    status === 0 || status >= 500 ||
    /fetch failed|failed to fetch|network request failed|networkerror|ENOTFOUND|EAI_AGAIN/i.test(message);
}

export function isAuthConfigurationError(error) {
  return error?.code === "invalid_api_key" ||
    /invalid api key|no api key found/i.test(String(error?.message || ""));
}

export function signInFailureMessage(error) {
  if (isAuthServiceUnavailable(error)) return AUTH_SERVICE_UNAVAILABLE_MESSAGE;
  if (isAuthConfigurationError(error)) return AUTH_CONFIGURATION_ERROR_MESSAGE;
  return INVALID_CREDENTIALS_MESSAGE;
}
