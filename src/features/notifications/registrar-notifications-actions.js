"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const COHORT = "PLP_PROJECT_600_2026_1";
const TERM = "TERM-2026-1";
const AUDIENCES = new Set([
  "All Students", "Selected Program", "Selected Academic Term", "Students Requiring Correction",
]);
const LINK = "/student/enrollment";

export async function loadRegistrarNotifications() {
  const user = await requireRole("registrar");
  try {
    const client = await createClient();
    const [inbox, published, programs] = await Promise.all([
      client.from("user_notifications")
        .select("notification_id,is_read,created_at,notifications!inner(id,title,message,category,related_path,published_at)")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
      createAdminClient().from("audit_events")
        .select("id,entity_key,occurred_at,reason,new_value")
        .eq("module", "Enrollment Announcements").eq("action", "Published")
        .eq("actor_user_id", user.id).order("occurred_at", { ascending: false }).limit(100),
      createAdminClient().from("programs").select("code,name").order("code").limit(100),
    ]);
    if (inbox.error || published.error || programs.error) return { kind: "unavailable", notifications: [], announcements: [] };
    const audit = published.data || [];
    const ids = audit.map((row) => row.entity_key).filter(Boolean);
    const info = ids.length ? await createAdminClient().from("notifications")
      .select("id,title,message,published_at").in("id", ids).limit(100)
      : { data: [], error: null };
    if (info.error) return { kind: "unavailable", notifications: [], announcements: [] };
    const byId = new Map((info.data || []).map((row) => [row.id, row]));
    return {
      kind: "ready",
      programs: programs.data || [],
      notifications: (inbox.data || []).filter((row) => row.notifications).map((row) => ({
        id: row.notification_id, title: row.notifications.title, message: row.notifications.message,
        category: row.notifications.category, read: Boolean(row.is_read),
        date: row.notifications.published_at || row.created_at,
        relatedHref: /^\/registrar\/[a-z0-9/-]+$/.test(row.notifications.related_path || "")
          ? row.notifications.related_path : null,
      })),
      announcements: audit.flatMap((row) => {
        const item = byId.get(row.entity_key);
        return item ? [{
          id: item.id, title: item.title, message: item.message,
          date: item.published_at || row.occurred_at, details: row.reason || "",
          delivered: row.new_value || "",
        }] : [];
      }),
    };
  } catch {
    return { kind: "unavailable", notifications: [], announcements: [] };
  }
}

export async function markRegistrarNotification(id) {
  const user = await requireRole("registrar");
  if (typeof id !== "string" || !id || id.length > 160) {
    return { ok: false, message: "Invalid notification." };
  }
  try {
    const client = await createClient();
    const { data, error } = await client.from("user_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("notification_id", id)
      .select("notification_id").maybeSingle();
    if (error || !data) return { ok: false, message: "Unable to update this notification." };
    revalidatePath("/registrar/notifications");
    return { ok: true };
  } catch {
    return { ok: false, message: "Unable to update this notification." };
  }
}

export async function markAllRegistrarNotifications() {
  const user = await requireRole("registrar");
  try {
    const client = await createClient();
    const { error } = await client.from("user_notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("is_read", false);
    if (error) return { ok: false, message: "Unable to mark notifications as read." };
    revalidatePath("/registrar/notifications");
    return { ok: true };
  } catch {
    return { ok: false, message: "Unable to mark notifications as read." };
  }
}

async function resolveRecipients(admin, audience, program, term) {
  const { data: students, error } = await admin.from("student_profiles")
    .select("id,user_id,student_number,program_code")
    .eq("record_kind", "PROJECT_ONLY").eq("project_cohort_id", COHORT).limit(601);
  if (error || !students || students.length > 600) throw new Error("Invalid student cohort");
  const { data: placements, error: placementError } = await admin
    .from("project_student_academic_placements")
    .select("student_id,term_id,program_code")
    .eq("project_cohort_id", COHORT).eq("term_id", TERM).limit(601);
  if (placementError || !placements || placements.length > 600) throw new Error("Invalid placements");
  const placementById = new Map(placements.map((row) => [row.student_id, row]));
  const eligible = students.filter((student) => {
    const placement = placementById.get(student.id);
    return placement &&
      (audience !== "Selected Program" || placement.program_code === program) &&
      (audience !== "Selected Academic Term" || placement.term_id === term);
  });
  let filtered = eligible;
  if (audience === "Students Requiring Correction") {
    const { data: simulations, error: simulationError } = await admin
      .from("project_phase8_enrollment_simulations")
      .select("student_id")
      .eq("source_provenance", "GENERATED_PROJECT")
      .eq("verified_institutionally", false)
      .eq("term_id", TERM).eq("status", "RETURNED").limit(601);
    if (simulationError) throw new Error("Unable to resolve correction recipients");
    const correctionIds = new Set((simulations || []).map((row) => row.student_id));
    filtered = eligible.filter((student) => correctionIds.has(student.id));
  }
  if (!filtered.length) return [];
  const { data: accounts, error: accountError } = await admin.from("app_users")
    .select("id,role_code,source_account_key")
    .eq("project_cohort_id", COHORT).eq("role_code", "student").limit(601);
  if (accountError) throw new Error("Unable to verify recipient accounts");
  const safeAccounts = new Map((accounts || [])
    .filter((row) => row.role_code === "student" &&
      typeof row.source_account_key === "string" &&
      row.source_account_key.startsWith("PROJECT_ONLY:TERM-2026-1:"))
    .map((row) => [row.id, row]));
  return filtered.filter((student) =>
    safeAccounts.get(student.user_id)?.source_account_key ===
    `PROJECT_ONLY:${TERM}:${student.student_number}`)
    .map((student) => student.user_id);
}

export async function publishRegistrarAnnouncement(input) {
  const actor = await requireRole("registrar");
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const message = typeof input?.message === "string" ? input.message.trim() : "";
  const audience = input?.group;
  const program = input?.program;
  const term = input?.term;
  if (title.length < 3 || title.length > 160 ||
      message.length < 5 || message.length > 3000 ||
      !AUDIENCES.has(audience) ||
      (audience === "Selected Program" && !/^[A-Z0-9]{2,12}$/.test(program || "")) ||
      (audience === "Selected Academic Term" && term !== TERM)) {
    return { ok: false, message: "Check the announcement, recipients and academic term." };
  }
  const admin = createAdminClient();
  let notificationId = null;
  try {
    const recipients = await resolveRecipients(admin, audience, program, term);
    if (!recipients.length) return { ok: false, message: "No verified project student accounts match this audience." };
    notificationId = `REG-ANN-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const { error: insertError } = await admin.from("notifications").insert({
      id: notificationId, title, message, category: "Enrollment Announcement",
      related_path: LINK, published_at: now,
    });
    if (insertError) throw insertError;
    const { error: deliveryError } = await admin.from("user_notifications")
      .insert(recipients.map((userId) => ({
        notification_id: notificationId, user_id: userId, is_read: false,
      })));
    if (deliveryError) throw deliveryError;
    const { error: auditError } = await admin.from("audit_events").insert({
      id: `REG-ANN-AUDIT-${crypto.randomUUID()}`, occurred_at: now,
      actor_user_id: actor.id, actor_label: actor.full_name,
      module: "Enrollment Announcements", action: "Published",
      entity_type: "notification", entity_key: notificationId,
      new_value: String(recipients.length), result: "SUCCESS",
      reason: `${audience}${audience === "Selected Program" ? ` (${program})` : ""}; ${TERM}; demonstration cohort only`,
    });
    if (auditError) throw auditError;
    revalidatePath("/registrar/notifications");
    revalidatePath("/student/notifications");
    return { ok: true, message: `Announcement delivered to ${recipients.length} fictional student inboxes.` };
  } catch {
    // Compensate partial writes; avoid publishing an announcement without
    // a complete recipient fanout and audit record.
    if (notificationId) {
      await admin.from("user_notifications").delete().eq("notification_id", notificationId);
      await admin.from("notifications").delete().eq("id", notificationId);
    }
    return { ok: false, message: "Announcement could not be published. No delivery was confirmed." };
  }
}

export async function loadRegistrarProfile() {
  const user = await requireRole("registrar");
  return {
    kind: "ready", account: {
      fullName: user.full_name || "", accountId: user.source_account_key || user.id,
      email: user.email || "", role: "Registrar", status: user.account_status,
    },
  };
}
