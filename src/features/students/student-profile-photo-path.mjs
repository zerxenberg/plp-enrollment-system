// Validate DB-sourced Storage paths before any privileged Storage operation.
// A photo object must be exactly auth-UUID/canonical-file-UUID.extension.
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PHOTO_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$/;

export function isOwnStudentPhotoPath(path, authUserId) {
  if (typeof path !== "string" || typeof authUserId !== "string" ||
      !CANONICAL_UUID.test(authUserId)) return false;
  const parts = path.split("/");
  return parts.length === 2 && parts[0] === authUserId && PHOTO_FILENAME.test(parts[1]);
}
