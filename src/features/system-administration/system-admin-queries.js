
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const CURRENT_PROJECT_COHORT_ID = "PLP_PROJECT_600_2026_1";
const CURRENT_TERM_ID = "TERM-2026-1";

function currentAccountScope(query) {
  return query.or(`is_synthetic_demo.eq.false,project_cohort_id.eq.${CURRENT_PROJECT_COHORT_ID}`);
}

function assertQuery(error, label) {
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

async function fetchAllRows(queryFactory, label, pageSize = 500) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const result = await queryFactory().range(offset, offset + pageSize - 1);
    assertQuery(result.error, label);
    rows.push(...(result.data || []));
    if (!result.data || result.data.length < pageSize) break;
  }
  return { data: rows, error: null, count: rows.length };
}

function formatDateTime(value) {
  if (!value) return "Not recorded";

  try {
    return new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Manila",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function formatDate(value) {
  if (!value) return "Not recorded";

  try {
    return new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium",
      timeZone: "Asia/Manila",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function formatBytes(value) {
  if (value === null || value === undefined) return "Not available";

  const size = Number(value);
  if (!Number.isFinite(size)) return "Not available";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = size;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  return `${current.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

async function getOpenOrLatestTerm(supabase) {
  const currentResult = await supabase
    .from("academic_terms")
    .select("id,label,short_label,academic_year,semester,enrollment_start,enrollment_end,status")
    .eq("id", CURRENT_TERM_ID)
    .maybeSingle();

  assertQuery(currentResult.error, "Load current academic term");
  if (currentResult.data) return currentResult.data;

  const latestResult = await supabase
    .from("academic_terms")
    .select("id,label,short_label,academic_year,semester,enrollment_start,enrollment_end,status")
    .order("enrollment_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  assertQuery(latestResult.error, "Load latest academic term");
  return latestResult.data;
}

async function getUserNotifications(supabase, userId, limit = 100) {
  const result = await supabase
    .from("user_notifications")
    .select(`
      notification_id,
      is_read,
      read_at,
      created_at,
      notifications!inner(
        id,
        title,
        message,
        category,
        related_path,
        published_at
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  assertQuery(result.error, "Load user notifications");

  return (result.data || []).map((row) => {
    const notification = row.notifications;

    return {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      category: notification.category,
      relatedHref: notification.related_path || "/system-administrator/notifications",
      publishedAt: notification.published_at,
      date: formatDateTime(notification.published_at),
      read: row.is_read,
      readAt: row.read_at,
    };
  });
}

export async function getSystemAdministratorShellData(userId) {
  const supabase = await createClient();
  const [term, notifications] = await Promise.all([
    getOpenOrLatestTerm(supabase),
    getUserNotifications(supabase, userId, 20),
  ]);

  return {
    term: term
      ? {
          id: term.id,
          label: term.label,
          shortLabel: term.short_label,
          academicYear: term.academic_year,
          semester: term.semester,
          enrollmentStart: formatDate(term.enrollment_start),
          enrollmentEnd: formatDate(term.enrollment_end),
          status: term.status,
        }
      : null,
    notifications,
  };
}

export async function getSystemAdministratorDashboardData(userId) {
  const supabase = await createClient();

  const [
    activeUsersResult,
    inactiveUsersResult,
    activeAdministratorsResult,
    projectStudentAccountsResult,
    failedRequestsResult,
    successfulSyncResult,
    latestBackupResult,
    openErrorsResult,
    latestHealthResult,
    recentAuditResult,
    unreadNotificationResult,
  ] = await Promise.all([
    supabase
      .from("app_users")
      .select("id", { count: "exact", head: true })
      .eq("account_status", "Active")
      .or(`is_synthetic_demo.eq.false,project_cohort_id.eq.${CURRENT_PROJECT_COHORT_ID}`),
    supabase
      .from("app_users")
      .select("id", { count: "exact", head: true })
      .eq("account_status", "Inactive")
      .or(`is_synthetic_demo.eq.false,project_cohort_id.eq.${CURRENT_PROJECT_COHORT_ID}`),
    supabase
      .from("app_users")
      .select("id", { count: "exact", head: true })
      .eq("role_code", "system-administrator")
      .eq("account_status", "Active"),
    supabase
      .from("app_users")
      .select("id", { count: "exact", head: true })
      .eq("role_code", "student")
      .eq("project_cohort_id", CURRENT_PROJECT_COHORT_ID)
      .eq("account_status", "Active"),
    supabase
      .from("integration_requests")
      .select("id", { count: "exact", head: true })
      .ilike("status", "%fail%"),
    supabase
      .from("synchronization_events")
      .select("id", { count: "exact", head: true })
      .ilike("status", "%success%"),
    supabase
      .from("backup_records")
      .select("id,backup_reference,backup_type,size_bytes,status,integrity_status,started_at,completed_at")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("system_errors")
      .select("id", { count: "exact", head: true })
      .eq("status", "Open"),
    supabase
      .from("system_health_snapshots")
      .select("*")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("audit_events")
      .select("id,occurred_at,actor_label,module,action,entity_key,result")
      .order("occurred_at", { ascending: false })
      .limit(6),
    supabase
      .from("user_notifications")
      .select("notification_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false),
  ]);

  [
    ["Count active users", activeUsersResult.error],
    ["Count inactive users", inactiveUsersResult.error],
    ["Count active administrators", activeAdministratorsResult.error],
    ["Count current project student accounts", projectStudentAccountsResult.error],
    ["Count failed integration requests", failedRequestsResult.error],
    ["Count successful synchronization events", successfulSyncResult.error],
    ["Load latest backup", latestBackupResult.error],
    ["Count open system errors", openErrorsResult.error],
    ["Load latest health snapshot", latestHealthResult.error],
    ["Load recent audit events", recentAuditResult.error],
    ["Count unread notifications", unreadNotificationResult.error],
  ].forEach(([label, error]) => assertQuery(error, label));

  const latestBackup = latestBackupResult.data
    ? {
        ...latestBackupResult.data,
        startedAtLabel: formatDateTime(latestBackupResult.data.started_at),
        completedAtLabel: formatDateTime(latestBackupResult.data.completed_at),
        sizeLabel: formatBytes(latestBackupResult.data.size_bytes),
      }
    : null;

  const health = latestHealthResult.data
    ? {
        ...latestHealthResult.data,
        capturedAtLabel: formatDateTime(latestHealthResult.data.captured_at),
      }
    : null;

  const recentActivity = (recentAuditResult.data || []).map((item) => ({
    ...item,
    occurredAtLabel: formatDateTime(item.occurred_at),
  }));

  return {
    activeUsers: activeUsersResult.count || 0,
    inactiveUsers: inactiveUsersResult.count || 0,
    activeAdministrators: activeAdministratorsResult.count || 0,
    currentProjectStudentAccounts: projectStudentAccountsResult.count || 0,
    failedRequests: failedRequestsResult.count || 0,
    successfulSynchronizations: successfulSyncResult.count || 0,
    openErrors: openErrorsResult.count || 0,
    unreadTechnicalAlerts: unreadNotificationResult.count || 0,
    latestBackup,
    health,
    recentActivity,
  };
}

export async function getUsersAccessData() {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const [
    usersResult,
    rolesResult,
    permissionsResult,
    rolePermissionsResult,
    unitsResult,
    programsResult,
    activityResult,
  ] = await Promise.all([
    fetchAllRows(
      () => currentAccountScope(
        adminClient
          .from("app_users")
          .select("id,auth_user_id,source_account_key,role_code,full_name,email,account_status,login_enabled,last_login_at,source_created_on,created_at,updated_at,is_synthetic_demo,account_kind,project_cohort_id,institutional_verified_at,project_activation_approved_at")
      ).order("full_name"),
      "Load all current operational application users",
    ),
    supabase
      .from("roles")
      .select("code,name,default_redirect_path,description,is_active")
      .order("name"),
    supabase
      .from("permissions")
      .select("code,name,description")
      .order("name"),
    supabase
      .from("role_permissions")
      .select("role_code,permission_code"),
    supabase
      .from("organizational_units")
      .select("code,name,unit_type,is_active")
      .order("name"),
    supabase
      .from("programs")
      .select("code,name,organizational_unit_code,status")
      .order("code"),
    supabase
      .from("audit_events")
      .select("id,occurred_at,actor_user_id,actor_label,module,action,entity_type,entity_key,previous_value,new_value,result,reason,ip_address")
      .in("module", ["Authentication", "Users & Access"])
      .order("occurred_at", { ascending: false })
      .limit(150),
  ]);

  const [
    identifiersResult,
    studentProfilesResult,
    projectPlacementsResult,
    staffProfilesResult,
  ] = await Promise.all([
    fetchAllRows(
      () => adminClient
        .from("user_login_identifiers")
        .select("id,user_id,identifier_type,identifier_value,is_primary")
        .order("identifier_type"),
      "Load all login identifiers",
    ),
    fetchAllRows(
      () => adminClient
        .from("student_profiles")
        .select("id,user_id,student_number,program_code,year_level,year_level_number,student_type,student_status,academic_classification,progression_status,current_term_id,current_curriculum_code,record_kind,project_cohort_id,is_synthetic_demo")
        .or(`is_synthetic_demo.eq.false,project_cohort_id.eq.${CURRENT_PROJECT_COHORT_ID}`),
      "Load all current operational student profiles",
    ),
    adminClient
      .from("project_student_academic_placements")
      .select("student_id,project_cohort_id,term_id,program_code,curriculum_code,year_level,academic_classification,progression_status,home_block_id")
      .eq("project_cohort_id", CURRENT_PROJECT_COHORT_ID)
      .eq("term_id", CURRENT_TERM_ID),
    fetchAllRows(
      () => adminClient
        .from("staff_profiles")
        .select("user_id,employee_id,organizational_unit_code,position_title,office_name"),
      "Load all staff profiles",
    ),
  ]);

  [
    ["Load current operational application users", usersResult.error],
    ["Load login identifiers", identifiersResult.error],
    ["Load current operational student profiles", studentProfilesResult.error],
    ["Load current project academic placements", projectPlacementsResult.error],
    ["Load staff profiles", staffProfilesResult.error],
    ["Load roles", rolesResult.error],
    ["Load permissions", permissionsResult.error],
    ["Load role permissions", rolePermissionsResult.error],
    ["Load organizational units", unitsResult.error],
    ["Load programs", programsResult.error],
    ["Load access activity", activityResult.error],
  ].forEach(([label, error]) => assertQuery(error, label));

  const identifiersByUser = new Map();
  (identifiersResult.data || []).forEach((row) => {
    const list = identifiersByUser.get(row.user_id) || [];
    list.push(row);
    identifiersByUser.set(row.user_id, list);
  });

  const placementByStudent = new Map(
    (projectPlacementsResult.data || []).map((row) => [row.student_id, row]),
  );

  const studentByUser = new Map(
    (studentProfilesResult.data || []).map((row) => {
      const placement = placementByStudent.get(row.id);
      return [
        row.user_id,
        placement
          ? {
              ...row,
              program_code: placement.program_code || row.program_code,
              current_term_id: placement.term_id || row.current_term_id,
              current_curriculum_code: placement.curriculum_code || row.current_curriculum_code,
              year_level: placement.year_level || row.year_level || row.year_level_number,
              academic_classification: placement.academic_classification || row.academic_classification,
              progression_status: placement.progression_status || row.progression_status,
              home_block_id: placement.home_block_id,
            }
          : row,
      ];
    }),
  );

  const staffByUser = new Map(
    (staffProfilesResult.data || []).map((row) => [row.user_id, row]),
  );

  const unitByCode = new Map(
    (unitsResult.data || []).map((row) => [row.code, row]),
  );

  const programByCode = new Map(
    (programsResult.data || []).map((row) => [row.code, row]),
  );

  const roleByCode = new Map(
    (rolesResult.data || []).map((row) => [row.code, row]),
  );

  const users = (usersResult.data || []).map((row) => {
    const identifiers = identifiersByUser.get(row.id) || [];
    const student = studentByUser.get(row.id);
    const staff = staffByUser.get(row.id);
    const program = student ? programByCode.get(student.program_code) : null;
    const college = program ? unitByCode.get(program.organizational_unit_code) : null;
    const staffUnit = staff ? unitByCode.get(staff.organizational_unit_code) : null;
    const username =
      identifiers.find((item) => item.identifier_type === "USERNAME")?.identifier_value ||
      identifiers.find((item) => item.is_primary && item.identifier_type !== "EMAIL")?.identifier_value ||
      row.source_account_key ||
      row.email;
    const isCurrentProjectStudent =
      row.role_code === "student" &&
      row.project_cohort_id === CURRENT_PROJECT_COHORT_ID;

    return {
      id: row.id,
      authUserId: row.auth_user_id,
      sourceAccountKey: row.source_account_key,
      fullName: row.full_name,
      email: row.email,
      username,
      roleCode: row.role_code,
      roleName: roleByCode.get(row.role_code)?.name || row.role_code,
      accountStatus: row.account_status,
      loginEnabled: row.login_enabled,
      lastLoginAt: row.last_login_at,
      lastLoginLabel: formatDateTime(row.last_login_at),
      createdAt: row.created_at,
      createdAtLabel: formatDateTime(row.created_at),
      sourceCreatedOn: row.source_created_on,
      authLinked: Boolean(row.auth_user_id),
      isSyntheticDemo: Boolean(row.is_synthetic_demo),
      accountKind: row.account_kind,
      projectCohortId: row.project_cohort_id,
      recordScope: isCurrentProjectStudent ? "Curriculum Project 2026" : "Institutional",
      student: student
        ? {
            ...student,
            programName: program?.name || student.program_code,
            collegeCode: program?.organizational_unit_code || "",
            collegeName: college?.name || "Not assigned",
          }
        : null,
      staff: staff
        ? {
            ...staff,
            organizationName: staffUnit?.name || staff.office_name || "Not assigned",
          }
        : null,
    };
  });

  const roles = (rolesResult.data || []).map((role) => ({
    ...role,
    userCount: users.filter((user) => user.roleCode === role.code).length,
  }));

  const permissions = (permissionsResult.data || []).map((permission) => ({
    ...permission,
    assignedRoles: (rolePermissionsResult.data || [])
      .filter((item) => item.permission_code === permission.code)
      .map((item) => item.role_code),
  }));

  const accessActivity = (activityResult.data || []).map((item) => ({
    ...item,
    occurredAtLabel: formatDateTime(item.occurred_at),
  }));

  return {
    users,
    roles,
    permissions,
    rolePermissions: rolePermissionsResult.data || [],
    organizationalUnits: unitsResult.data || [],
    programs: programsResult.data || [],
    accessActivity,
    recordScope: {
      currentProjectCohortId: CURRENT_PROJECT_COHORT_ID,
      currentTermId: CURRENT_TERM_ID,
      retiredSyntheticAccountsExcluded: true,
    },
  };
}

export async function getSystemIntegrationData() {
  const supabase = await createClient();

  const [
    configurationsResult,
    requestsResult,
    syncResult,
    handoffsResult,
  ] = await Promise.all([
    supabase
      .from("integration_configurations")
      .select("id,code,name,endpoint_url,authentication_method,timeout_seconds,is_enabled,updated_by,updated_at,created_at")
      .order("name"),
    supabase
      .from("integration_requests")
      .select("id,configuration_id,request_reference,request_type,source_system,endpoint_path,external_reference,requested_at,response_code,status,processing_time_ms,request_summary,response_summary,created_at")
      .order("requested_at", { ascending: false })
      .limit(250),
    supabase
      .from("synchronization_events")
      .select("id,sync_reference,integration_request_id,applicant_reference,direction,status,result,attempt_number,attempted_at,created_at")
      .order("attempted_at", { ascending: false })
      .limit(250),
    supabase
      .from("admission_handoffs")
      .select("id,applicant_reference,student_id,approved_program_code,admission_status,admission_date,admission_type,integration_request_id,synchronization_status,received_at,source_name,created_at,updated_at")
      .order("received_at", { ascending: false })
      .limit(250),
  ]);

  [
    ["Load integration configurations", configurationsResult.error],
    ["Load integration requests", requestsResult.error],
    ["Load synchronization events", syncResult.error],
    ["Load admission handoffs", handoffsResult.error],
  ].forEach(([label, error]) => assertQuery(error, label));

  return {
    bridge: {
      sourceSystem: "PLP Admissions",
      destinationSystem: "PLP Enrollment",
      admissionsDatabaseProject: "eljnvmncuhhfzqqjzlnn",
      enrollmentDatabaseProject: "iwuphtvlcszziyvqcbsl",
      sharedSecretConfigured: Boolean(process.env.ENROLLMENT_INTAKE_SECRET),
      healthEndpointConfigured: Boolean(process.env.PLP_ADMISSIONS_HEALTH_URL),
      // Without a trusted Admissions-side probe, database connectivity cannot be asserted.
      connectivity: "Not verified",
    },
    configurations: (configurationsResult.data || []).map((item) => ({
      ...item,
      updatedAtLabel: formatDateTime(item.updated_at),
    })),
    requests: (requestsResult.data || []).map((item) => ({
      ...item,
      requestedAtLabel: formatDateTime(item.requested_at),
      processingTimeLabel:
        item.processing_time_ms === null ? "Not recorded" : `${item.processing_time_ms} ms`,
    })),
    synchronizations: (syncResult.data || []).map((item) => ({
      ...item,
      attemptedAtLabel: formatDateTime(item.attempted_at),
    })),
    handoffs: (handoffsResult.data || []).map((item) => ({
      ...item,
      receivedAtLabel: formatDateTime(item.received_at),
      admissionDateLabel: formatDate(item.admission_date),
    })),
  };
}

export async function getSystemAdministrationData() {
  const supabase = await createClient();

  const [
    systemSettingsResult,
    securitySettingsResult,
    maintenanceResult,
    backupsResult,
    metricsResult,
  ] = await Promise.all([
    supabase
      .from("system_settings")
      .select("*")
      .eq("singleton_id", true)
      .maybeSingle(),
    supabase
      .from("security_settings")
      .select("*")
      .eq("singleton_id", true)
      .maybeSingle(),
    supabase
      .from("database_maintenance_events")
      .select("id,operation,status,details,performed_by,started_at,completed_at,created_at")
      .order("started_at", { ascending: false })
      .limit(100),
    supabase
      .from("backup_records")
      .select("id,backup_reference,backup_type,storage_path,size_bytes,status,integrity_status,created_by,started_at,completed_at,created_at")
      .order("started_at", { ascending: false })
      .limit(100),
    supabase.rpc("get_system_admin_database_metrics"),
  ]);

  [
    ["Load system settings", systemSettingsResult.error],
    ["Load security settings", securitySettingsResult.error],
    ["Load database maintenance history", maintenanceResult.error],
    ["Load backup registry", backupsResult.error],
    ["Load database metrics", metricsResult.error],
  ].forEach(([label, error]) => assertQuery(error, label));

  return {
    systemSettings: systemSettingsResult.data,
    securitySettings: securitySettingsResult.data,
    maintenanceEvents: (maintenanceResult.data || []).map((item) => ({
      ...item,
      startedAtLabel: formatDateTime(item.started_at),
      completedAtLabel: formatDateTime(item.completed_at),
    })),
    backups: (backupsResult.data || []).map((item) => ({
      ...item,
      startedAtLabel: formatDateTime(item.started_at),
      completedAtLabel: formatDateTime(item.completed_at),
      sizeLabel: formatBytes(item.size_bytes),
    })),
    databaseMetrics: {
      ...(metricsResult.data || {}),
      databaseSizeLabel: formatBytes(metricsResult.data?.database_size_bytes),
      lastMaintenanceLabel: formatDateTime(metricsResult.data?.last_maintenance_at),
    },
  };
}

export async function getAuditMonitoringData() {
  const supabase = await createClient();

  const [
    auditResult,
    errorsResult,
    healthResult,
    usersResult,
  ] = await Promise.all([
    supabase
      .from("audit_events")
      .select("id,occurred_at,actor_user_id,actor_label,module,action,entity_type,entity_key,previous_value,new_value,result,reason,ip_address")
      .order("occurred_at", { ascending: false })
      .limit(400),
    supabase
      .from("system_errors")
      .select("id,error_reference,error_type,module,severity,message,related_record,status,occurred_at,reviewed_by,reviewed_at,created_at")
      .order("occurred_at", { ascending: false })
      .limit(250),
    supabase
      .from("system_health_snapshots")
      .select("id,application_status,database_status,api_status,authentication_status,backup_status,recent_error_count,captured_at")
      .order("captured_at", { ascending: false })
      .limit(100),
    supabase
      .from("app_users")
      .select("id,full_name,role_code"),
  ]);

  [
    ["Load audit events", auditResult.error],
    ["Load system errors", errorsResult.error],
    ["Load system health snapshots", healthResult.error],
    ["Load audit user references", usersResult.error],
  ].forEach(([label, error]) => assertQuery(error, label));

  const userById = new Map(
    (usersResult.data || []).map((row) => [row.id, row]),
  );

  const auditEvents = (auditResult.data || []).map((item) => ({
    ...item,
    occurredAtLabel: formatDateTime(item.occurred_at),
    actorRole: item.actor_user_id
      ? userById.get(item.actor_user_id)?.role_code || "Unknown"
      : "System",
  }));

  return {
    auditEvents,
    securityActivity: auditEvents.filter(
      (item) =>
        item.module === "Authentication" ||
        item.module === "Users & Access" ||
        /login|logout|password|role|permission|account/i.test(item.action),
    ),
    administratorActivity: auditEvents.filter((item) => {
      const actor = item.actor_user_id ? userById.get(item.actor_user_id) : null;
      return actor?.role_code === "system-administrator";
    }),
    systemErrors: (errorsResult.data || []).map((item) => ({
      ...item,
      occurredAtLabel: formatDateTime(item.occurred_at),
      reviewedAtLabel: formatDateTime(item.reviewed_at),
    })),
    healthSnapshots: (healthResult.data || []).map((item) => ({
      ...item,
      capturedAtLabel: formatDateTime(item.captured_at),
    })),
  };
}

export async function getSystemAdministratorNotificationsData(userId) {
  const supabase = await createClient();
  return getUserNotifications(supabase, userId, 250);
}

export async function getSystemAdministratorProfileData(userId) {
  const supabase = await createClient();

  const [
    userResult,
    staffResult,
    preferencesResult,
  ] = await Promise.all([
    supabase
      .from("app_users")
      .select("id,auth_user_id,source_account_key,role_code,full_name,email,account_status,login_enabled,last_login_at,created_at,updated_at")
      .eq("id", userId)
      .single(),
    supabase
      .from("staff_profiles")
      .select("user_id,employee_id,organizational_unit_code,position_title,office_name")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_preferences")
      .select("preference_key,preference_value,updated_at")
      .eq("user_id", userId),
  ]);

  [
    ["Load System Administrator profile", userResult.error],
    ["Load System Administrator staff profile", staffResult.error],
    ["Load System Administrator preferences", preferencesResult.error],
  ].forEach(([label, error]) => assertQuery(error, label));

  let organization = null;

  if (staffResult.data?.organizational_unit_code) {
    const organizationResult = await supabase
      .from("organizational_units")
      .select("code,name,unit_type")
      .eq("code", staffResult.data.organizational_unit_code)
      .maybeSingle();

    assertQuery(organizationResult.error, "Load System Administrator organization");
    organization = organizationResult.data;
  }

  const preferences = Object.fromEntries(
    (preferencesResult.data || []).map((item) => [
      item.preference_key,
      item.preference_value,
    ]),
  );

  return {
    user: {
      ...userResult.data,
      lastLoginLabel: formatDateTime(userResult.data.last_login_at),
      createdAtLabel: formatDateTime(userResult.data.created_at),
    },
    staff: staffResult.data,
    organization,
    preferences,
  };
}
