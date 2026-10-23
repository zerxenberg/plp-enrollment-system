import "server-only";

import { getStudentContext } from "./student-context-server";

function safeStudentLink(value) {
  return typeof value === "string" && /^\/student\/(dashboard|enrollment|academic-records|class-schedule|notifications|student-profile)(?:[/?#]|$)/.test(value)
    ? value : null;
}

export async function loadStudentNotifications({ limit = 100 } = {}) {
  const context = await getStudentContext();
  if (context.kind !== "project") return { kind: "unavailable", items: [] };
  const { data, error } = await context.client.from("user_notifications")
    .select("notification_id,is_read,created_at,notifications!inner(id,title,message,category,related_path,published_at)")
    .eq("user_id", context.appUserId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(200, limit)));
  if (error) return { kind: "unavailable", items: [] };
  return {
    kind: "ready",
    items: (data || []).filter((row) => row.notifications).map((row) => ({
      id: row.notification_id,
      title: row.notifications.title,
      message: row.notifications.message,
      category: row.notifications.category,
      date: row.notifications.published_at || row.created_at,
      read: Boolean(row.is_read),
      relatedHref: safeStudentLink(row.notifications.related_path),
    })),
  };
}
