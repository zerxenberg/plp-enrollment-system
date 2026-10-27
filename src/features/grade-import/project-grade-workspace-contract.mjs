// Server-side workspace contract resolution, separated for regressions without
// accessing credentials or changing live project data. Call only AFTER requireRole.
const MISSING_RPC_CODES = new Set(["PGRST202", "42883"]);

export const PROJECT_GRADE_WORKSPACE_PERMISSION_CODE = "PROJECT_GRADE_WORKSPACE_READ_FORBIDDEN";
export const PROJECT_GRADE_WORKSPACE_PERMISSION_MESSAGE =
  "Protected project grade history cannot be read with the current server permissions. " +
  "An administrator must install the Registrar-scoped workspace function or enable approved service-role read access.";

export function unwrapProjectGradeWorkspaceQuery(result, description) {
  if (result?.error) {
    // Preserve the PostgREST code without ever forwarding raw SQL diagnostics.
    const error = new Error(`${description} is unavailable`);
    error.code = result.error.code;
    throw error;
  }
  return result?.data;
}

export async function resolveProjectGradeWorkspaceContract(rpcResponse, readApprovedFallback) {
  const { data, error } = rpcResponse || {};
  if (error && !MISSING_RPC_CODES.has(error.code)) throw error;

  let resolved;
  try {
    resolved = error ? await readApprovedFallback() : data;
  } catch (cause) {
    if (cause?.code === "42501") {
      const denied = new Error(PROJECT_GRADE_WORKSPACE_PERMISSION_MESSAGE);
      denied.code = PROJECT_GRADE_WORKSPACE_PERMISSION_CODE;
      throw denied;
    }
    throw cause;
  }

  if (!resolved || !Array.isArray(resolved.blocks) ||
      !Array.isArray(resolved.batches) || !Array.isArray(resolved.releases)) {
    throw new Error("Invalid protected project grade workspace response");
  }
  return resolved;
}
