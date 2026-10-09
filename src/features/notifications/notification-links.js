// Only local paths within the active role are valid notification destinations.
// Academic Coordinator feature pages have not been implemented yet, so their
// demo notices link to their matching entries on the notifications page.
export function getNotificationDestination(role, item, notificationHref) {
  const fallback = `/${role}/notifications`;
  const linkedPath = item?.relatedHref;

  if (role === "academic-coordinator") {
    return item?.id
      ? `${fallback}#notification-${encodeURIComponent(String(item.id))}`
      : fallback;
  }

  if (
    typeof linkedPath === "string" &&
    linkedPath.startsWith(`/${role}/`) &&
    /^\/[a-z0-9/-]+$/.test(linkedPath) &&
    !linkedPath.includes("//") &&
    !linkedPath.split("/").includes("..")
  ) {
    return linkedPath;
  }

  return typeof notificationHref === "string" && notificationHref === fallback
    ? notificationHref
    : fallback;
}
