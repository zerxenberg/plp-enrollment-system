import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Portable application data export, not a PostgreSQL dump or an Auth backup.
// Explicit allowlist prevents secrets and credential tables from being exported.
const TABLES = {
  programs: "code,name,organizational_unit_code,status",
  program_tracks: "code,program_code,name,status",
  curricula: "code,program_code,name,status,version_label",
  academic_terms: "id,label,academic_year,semester,status",
  app_users: "id,source_account_key,role_code,full_name,email,account_status,login_enabled,is_synthetic_demo,project_cohort_id,created_at",
  student_profiles: "id,user_id,student_number,program_code,current_curriculum_code,current_term_id,student_type,student_status,year_level,academic_classification,is_synthetic_demo,record_kind",
  admission_handoffs: "id,applicant_reference,student_id,approved_program_code,admission_status,admission_date,admission_type,synchronization_status,received_at,source_name",
  integration_requests: "id,request_reference,request_type,source_system,endpoint_path,external_reference,requested_at,response_code,status,processing_time_ms,request_summary,response_summary",
  synchronization_events: "id,sync_reference,integration_request_id,applicant_reference,direction,status,result,attempt_number,attempted_at",
  enrollments: "*",
  enrollment_subjects: "*",
};

export async function GET() {
  const actor = await requireRole("system-administrator");
  const admin = createAdminClient();
  const { data: permission, error: permissionError } = await admin.from("role_permissions")
    .select("permission_code")
    .eq("role_code", "system-administrator")
    .eq("permission_code", "system.settings_manage")
    .maybeSingle();
  if (permissionError || !permission) {
    return Response.json({ error: "Backup export is not authorized." }, { status: 403 });
  }

  const encoder = new TextEncoder();
  const generatedAt = new Date().toISOString();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(JSON.stringify({
          format: "plp-application-export-v1",
          generated_at: generatedAt,
          generated_by: actor.id,
          warning: "Selected application records only. Not a physical PostgreSQL, Supabase Auth, Storage, or point-in-time recovery backup.",
          tables: Object.keys(TABLES),
        }) + "\n"));
        for (const [table, columns] of Object.entries(TABLES)) {
          for (let offset = 0; ; offset += 500) {
            const { data, error } = await admin.from(table).select(columns).range(offset, offset + 499);
            if (error) throw new Error("Application export failed for " + table);
            for (const record of data || []) {
              controller.enqueue(encoder.encode(JSON.stringify({ table, record }) + "\n"));
            }
            if (!data || data.length < 500) break;
          }
        }
        controller.close();
      } catch {
        controller.error(new Error("Application export failed. File is incomplete."));
      }
    },
  });
  const filename = "plp-enrollment-application-export-" + generatedAt.slice(0, 10) + ".ndjson";
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
