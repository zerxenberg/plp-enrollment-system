
"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_ADMIN_ROLE = "system-administrator";
const STAFF_ROLES = new Set([
  "registrar",
  "academic-coordinator",
  "system-administrator",
]);
const APPROVED_ROLES = new Set([
  "student",
  "registrar",
  "academic-coordinator",
  "system-administrator",
]);

const AUTHORIZED_ROLE_PERMISSIONS = {
  student: new Set([
    "notifications.read_self",
    "student.self_service",
    "student.profile_edit",
    "academic.master_data_read",
  ]),
  registrar: new Set([
    "notifications.read_self",
    "registrar.students_read",
    "registrar.students_manage",
    "registrar.enrollment_process",
    "academic.master_data_read",
  ]),
  "academic-coordinator": new Set([
    "notifications.read_self",
    "registrar.students_read",
    "academic.master_data_read",
    "academic.master_data_manage",
    "academic.review_decide",
  ]),
  "system-administrator": new Set([
    "notifications.read_self",
    "system.users_manage",
    "system.permissions_manage",
    "system.integration_manage",
    "system.settings_manage",
    "system.audit_read",
  ]),
};

function success(message, data = null) {
  return { ok: true, message, data };
}

function failure(message) {
  return { ok: false, message };
}

function messageFromError(error, fallback) {
  if (!error) return fallback;
  return error.message || fallback;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 12) {
    return "Temporary password must contain at least 12 characters.";
  }
  return null;
}

function auditId(prefix = "AUD") {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "").toUpperCase()}`;
}

async function getAdminContext(requiredPermission = null) {
  const actor = await requireRole(SYSTEM_ADMIN_ROLE);
  const supabase = await createClient();

  if (requiredPermission) {
    const { data: permission, error } = await supabase
      .from("role_permissions")
      .select("permission_code")
      .eq("role_code", SYSTEM_ADMIN_ROLE)
      .eq("permission_code", requiredPermission)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Permission check failed for ${requiredPermission}: ${error.message}`,
      );
    }

    if (!permission) {
      throw new Error(
        `The System Administrator role does not currently have ${requiredPermission}.`,
      );
    }
  }

  return { actor, supabase };
}

async function writeAudit(
  supabase,
  actor,
  {
    module,
    action,
    entityType = null,
    entityKey = null,
    previousValue = null,
    newValue = null,
    result = "Successful",
    reason = null,
  },
) {
  const { error } = await supabase.from("audit_events").insert({
    id: auditId(),
    occurred_at: new Date().toISOString(),
    actor_user_id: actor.id,
    actor_label: actor.full_name,
    module,
    action,
    entity_type: entityType,
    entity_key: entityKey,
    previous_value:
      previousValue === null
        ? null
        : typeof previousValue === "string"
          ? previousValue
          : JSON.stringify(previousValue),
    new_value:
      newValue === null
        ? null
        : typeof newValue === "string"
          ? newValue
          : JSON.stringify(newValue),
    result,
    reason,
  });

  if (error) {
    throw new Error(`Audit event could not be recorded: ${error.message}`);
  }
}

function revalidateSystemAdministrator(...paths) {
  const uniquePaths = new Set([
    "/system-administrator/dashboard",
    ...paths,
  ]);

  uniquePaths.forEach((path) => revalidatePath(path));
}

async function cleanupNewApplicationUser(adminClient, appUserId, authUserId = null) {
  if (authUserId) {
    await adminClient.auth.admin.deleteUser(authUserId).catch(() => null);
  }

  if (appUserId) {
    await adminClient.from("app_users").delete().eq("id", appUserId);
  }
}

export async function provisionExistingApplicationUser(payload) {
  try {
    const passwordError = validatePassword(payload?.temporaryPassword);
    if (passwordError) return failure(passwordError);

    const { actor, supabase } = await getAdminContext("system.users_manage");
    const appUserId = normalizeText(payload?.userId);

    if (!appUserId) return failure("Select an existing application user.");

    const { data: user, error: userError } = await supabase
      .from("app_users")
      .select("id,auth_user_id,full_name,email,role_code,account_status,login_enabled")
      .eq("id", appUserId)
      .single();

    if (userError || !user) {
      return failure(messageFromError(userError, "Application user was not found."));
    }

    if (!APPROVED_ROLES.has(user.role_code)) {
      return failure("The selected account does not use an approved PLP role.");
    }

    if (user.auth_user_id) {
      return failure("This application user is already linked to a Supabase Auth account.");
    }

    const adminClient = createAdminClient();

    const { data: authData, error: authError } =
      await adminClient.auth.admin.createUser({
        email: user.email,
        password: payload.temporaryPassword,
        email_confirm: true,
        user_metadata: {
          full_name: user.full_name,
        },
      });

    if (authError || !authData.user) {
      return failure(messageFromError(authError, "Supabase Auth account could not be created."));
    }

    const targetStatus =
      payload?.accountStatus === "Inactive" ? "Inactive" : "Active";

    const { error: updateError } = await supabase
      .from("app_users")
      .update({
        auth_user_id: authData.user.id,
        account_status: targetStatus,
        login_enabled: targetStatus === "Active",
      })
      .eq("id", user.id)
      .is("auth_user_id", null);

    if (updateError) {
      await adminClient.auth.admin.deleteUser(authData.user.id);
      return failure(
        `Auth user was rolled back because the application account could not be linked: ${updateError.message}`,
      );
    }

    const { data: linkedUser, error: linkCheckError } = await supabase
      .from("app_users")
      .select("id")
      .eq("id", user.id)
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();

    if (linkCheckError || !linkedUser) {
      await adminClient.from("app_users").update({
        auth_user_id: null,
        account_status: user.account_status,
        login_enabled: user.login_enabled,
      }).eq("id", user.id).eq("auth_user_id", authData.user.id);
      await adminClient.auth.admin.deleteUser(authData.user.id);
      return failure("Auth account was rolled back because the application identity link could not be verified.");
    }

    if (targetStatus === "Inactive") {
      const { error: banError } = await adminClient.auth.admin.updateUserById(
        authData.user.id,
        { ban_duration: "876000h" },
      );

      if (banError) {
        return failure(
          `Application account was created, but Supabase Auth could not be disabled: ${banError.message}`,
        );
      }
    }

    await writeAudit(supabase, actor, {
      module: "Users & Access",
      action: "Auth account provisioned",
      entityType: "app_user",
      entityKey: user.id,
      previousValue: {
        auth_user_id: null,
        account_status: user.account_status,
        login_enabled: user.login_enabled,
      },
      newValue: {
        auth_user_id: authData.user.id,
        account_status: targetStatus,
        login_enabled: targetStatus === "Active",
      },
    });

    revalidateSystemAdministrator("/system-administrator/users-access");
    return success(`Supabase Auth account created for ${user.full_name}.`);
  } catch (error) {
    return failure(messageFromError(error, "Account provisioning failed."));
  }
}

export async function createStaffUserAccount(payload) {
  let newAppUserId = null;
  let newAuthUserId = null;

  try {
    const passwordError = validatePassword(payload?.temporaryPassword);
    if (passwordError) return failure(passwordError);

    const { actor, supabase } = await getAdminContext("system.users_manage");
    const adminClient = createAdminClient();

    const fullName = normalizeText(payload?.fullName);
    const email = normalizeEmail(payload?.email);
    const username = normalizeText(payload?.username);
    const employeeId = normalizeText(payload?.employeeId);
    const roleCode = normalizeText(payload?.roleCode);
    const organizationalUnitCode =
      normalizeText(payload?.organizationalUnitCode) || null;
    const positionTitle = normalizeText(payload?.positionTitle) || null;
    const officeName = normalizeText(payload?.officeName) || null;
    const accountStatus =
      payload?.accountStatus === "Inactive" ? "Inactive" : "Active";

    if (!fullName || !email || !email.includes("@")) {
      return failure("Full name and a valid registered email are required.");
    }

    if (!STAFF_ROLES.has(roleCode)) {
      return failure(
        "New System Administrator accounts can only create approved staff roles here. Student academic records must originate from the owning student workflow.",
      );
    }

    if (!employeeId) {
      return failure("Employee ID is required for a new staff account.");
    }

    const sourceAccountKey = username || employeeId || email;

    const { data: appUser, error: appUserError } = await supabase
      .from("app_users")
      .insert({
        source_account_key: sourceAccountKey,
        role_code: roleCode,
        full_name: fullName,
        email,
        account_status: accountStatus,
        login_enabled: false,
        source_created_on: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single();

    if (appUserError || !appUser) {
      return failure(messageFromError(appUserError, "Application account could not be created."));
    }

    newAppUserId = appUser.id;

    const identifierRows = [
      {
        user_id: appUser.id,
        identifier_type: "EMAIL",
        identifier_value: email,
        is_primary: !username,
      },
      {
        user_id: appUser.id,
        identifier_type: "EMPLOYEE_ID",
        identifier_value: employeeId,
        is_primary: false,
      },
    ];

    if (username) {
      identifierRows.push({
        user_id: appUser.id,
        identifier_type: "USERNAME",
        identifier_value: username,
        is_primary: true,
      });
    }

    const [{ error: identifierError }, { error: staffError }] =
      await Promise.all([
        supabase.from("user_login_identifiers").insert(identifierRows),
        supabase.from("staff_profiles").insert({
          user_id: appUser.id,
          employee_id: employeeId,
          organizational_unit_code: organizationalUnitCode,
          position_title: positionTitle,
          office_name: officeName,
        }),
      ]);

    if (identifierError || staffError) {
      await cleanupNewApplicationUser(adminClient, appUser.id);
      return failure(
        messageFromError(
          identifierError || staffError,
          "Staff profile or login identifier could not be created.",
        ),
      );
    }

    const { data: authData, error: authError } =
      await adminClient.auth.admin.createUser({
        email,
        password: payload.temporaryPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      });

    if (authError || !authData.user) {
      await cleanupNewApplicationUser(adminClient, appUser.id);
      return failure(messageFromError(authError, "Supabase Auth user could not be created."));
    }

    newAuthUserId = authData.user.id;

    if (accountStatus === "Inactive") {
      const { error: banError } = await adminClient.auth.admin.updateUserById(
        authData.user.id,
        { ban_duration: "876000h" },
      );

      if (banError) {
        await cleanupNewApplicationUser(
          adminClient,
          appUser.id,
          authData.user.id,
        );
        return failure(`Supabase Auth account could not be disabled: ${banError.message}`);
      }
    }

    const { error: enableError } = await supabase
      .from("app_users")
      .update({
        account_status: accountStatus,
        login_enabled: accountStatus === "Active",
      })
      .eq("id", appUser.id);

    if (enableError) {
      await cleanupNewApplicationUser(
        adminClient,
        appUser.id,
        authData.user.id,
      );
      return failure(
        `Account creation was rolled back because login access could not be finalized: ${enableError.message}`,
      );
    }

    await writeAudit(supabase, actor, {
      module: "Users & Access",
      action: "Staff account created",
      entityType: "app_user",
      entityKey: appUser.id,
      newValue: {
        full_name: fullName,
        email,
        role_code: roleCode,
        employee_id: employeeId,
        account_status: accountStatus,
      },
    });

    revalidateSystemAdministrator("/system-administrator/users-access");
    return success(`${fullName} was created and linked to Supabase Auth.`);
  } catch (error) {
    if (newAppUserId) {
      try {
        const adminClient = createAdminClient();
        await cleanupNewApplicationUser(
          adminClient,
          newAppUserId,
          newAuthUserId,
        );
      } catch {
        // The original error is more useful to return.
      }
    }

    return failure(messageFromError(error, "Staff account creation failed."));
  }
}


export async function updateUserAccount(payload) {
  try {
    const { actor, supabase } = await getAdminContext("system.users_manage");
    const adminClient = createAdminClient();

    const userId = normalizeText(payload?.userId);
    const fullName = normalizeText(payload?.fullName);
    const email = normalizeEmail(payload?.email);
    const username = normalizeText(payload?.username);
    const employeeId = normalizeText(payload?.employeeId);
    const organizationalUnitCode =
      normalizeText(payload?.organizationalUnitCode) || null;
    const positionTitle = normalizeText(payload?.positionTitle) || null;
    const officeName = normalizeText(payload?.officeName) || null;

    if (!userId || !fullName || !email || !email.includes("@")) {
      return failure("User ID, full name, and a valid email are required.");
    }

    const { data: existing, error: existingError } = await supabase
      .from("app_users")
      .select("id,auth_user_id,role_code,full_name,email")
      .eq("id", userId)
      .single();

    if (existingError || !existing) {
      return failure(
        messageFromError(existingError, "User account was not found."),
      );
    }

    if (existing.auth_user_id) {
      const { error: authUpdateError } =
        await adminClient.auth.admin.updateUserById(existing.auth_user_id, {
          email,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
          },
        });

      if (authUpdateError) {
        return failure(
          `Supabase Auth account could not be updated: ${authUpdateError.message}`,
        );
      }
    }

    const { error: directoryError } = await supabase.rpc(
      "system_admin_update_account",
      {
        p_user_id: userId,
        p_full_name: fullName,
        p_email: email,
        p_username: username || null,
        p_employee_id: employeeId || null,
        p_organizational_unit_code: organizationalUnitCode,
        p_position_title: positionTitle,
        p_office_name: officeName,
      },
    );

    if (directoryError) {
      if (existing.auth_user_id) {
        await adminClient.auth.admin.updateUserById(existing.auth_user_id, {
          email: existing.email,
          email_confirm: true,
          user_metadata: {
            full_name: existing.full_name,
          },
        });
      }

      return failure(
        `Account directory update was rolled back: ${directoryError.message}`,
      );
    }

    await writeAudit(supabase, actor, {
      module: "Users & Access",
      action: "Account details updated",
      entityType: "app_user",
      entityKey: userId,
      previousValue: {
        full_name: existing.full_name,
        email: existing.email,
      },
      newValue: {
        full_name: fullName,
        email,
        username: username || null,
        employee_id: employeeId || null,
        organizational_unit_code: organizationalUnitCode,
        position_title: positionTitle,
        office_name: officeName,
      },
    });

    revalidateSystemAdministrator(
      "/system-administrator/users-access",
      "/system-administrator/profile",
    );

    return success("Account details were updated.");
  } catch (error) {
    return failure(messageFromError(error, "Account update failed."));
  }
}

export async function setUserAccessState(payload) {
  try {
    const { actor, supabase } = await getAdminContext("system.users_manage");
    const adminClient = createAdminClient();

    const userId = normalizeText(payload?.userId);
    const active = Boolean(payload?.active);

    const { data: target, error: targetError } = await supabase
      .from("app_users")
      .select("id,auth_user_id,full_name,role_code,account_status,login_enabled")
      .eq("id", userId)
      .single();

    if (targetError || !target) {
      return failure(messageFromError(targetError, "User account was not found."));
    }

    if (!active && target.id === actor.id) {
      return failure("You cannot deactivate the System Administrator account currently in use.");
    }

    if (!active && target.role_code === SYSTEM_ADMIN_ROLE) {
      const { count, error: countError } = await supabase
        .from("app_users")
        .select("id", { count: "exact", head: true })
        .eq("role_code", SYSTEM_ADMIN_ROLE)
        .eq("account_status", "Active");

      if (countError) {
        return failure(`Active administrator count could not be checked: ${countError.message}`);
      }

      if ((count || 0) <= 1) {
        return failure("The last active System Administrator account cannot be deactivated.");
      }
    }

    if (target.auth_user_id) {
      const { error: authError } =
        await adminClient.auth.admin.updateUserById(target.auth_user_id, {
          ban_duration: active ? "none" : "876000h",
        });

      if (authError) {
        return failure(
          `Supabase Auth access state could not be changed: ${authError.message}`,
        );
      }
    }

    const nextState = {
      account_status: active ? "Active" : "Inactive",
      login_enabled: active && Boolean(target.auth_user_id),
    };

    const { error: updateError } = await supabase
      .from("app_users")
      .update(nextState)
      .eq("id", target.id);

    if (updateError) {
      if (target.auth_user_id) {
        await adminClient.auth.admin.updateUserById(target.auth_user_id, {
          ban_duration: target.account_status === "Active" ? "none" : "876000h",
        });
      }
      return failure(`Application access state could not be changed: ${updateError.message}`);
    }

    await writeAudit(supabase, actor, {
      module: "Users & Access",
      action: active ? "Account activated" : "Account deactivated",
      entityType: "app_user",
      entityKey: target.id,
      previousValue: {
        account_status: target.account_status,
        login_enabled: target.login_enabled,
      },
      newValue: nextState,
    });

    revalidateSystemAdministrator("/system-administrator/users-access");
    return success(`${target.full_name} is now ${active ? "active" : "inactive"}.`);
  } catch (error) {
    return failure(messageFromError(error, "Account access change failed."));
  }
}

export async function changeUserRole(payload) {
  try {
    const { actor, supabase } = await getAdminContext("system.users_manage");
    const userId = normalizeText(payload?.userId);
    const newRoleCode = normalizeText(payload?.roleCode);

    if (!STAFF_ROLES.has(newRoleCode)) {
      return failure(
        "Role changes from this portal are limited to approved staff roles. Student role changes require business-record review outside technical account administration.",
      );
    }

    const { data: target, error: targetError } = await supabase
      .from("app_users")
      .select("id,full_name,role_code")
      .eq("id", userId)
      .single();

    if (targetError || !target) {
      return failure(messageFromError(targetError, "User account was not found."));
    }

    if (target.id === actor.id) {
      return failure("You cannot change the role of the System Administrator account currently in use.");
    }

    if (!STAFF_ROLES.has(target.role_code)) {
      return failure("Student accounts cannot be converted to staff roles from technical account administration.");
    }

    if (target.role_code === SYSTEM_ADMIN_ROLE && newRoleCode !== SYSTEM_ADMIN_ROLE) {
      const { count, error: countError } = await supabase
        .from("app_users")
        .select("id", { count: "exact", head: true })
        .eq("role_code", SYSTEM_ADMIN_ROLE)
        .eq("account_status", "Active");

      if (countError) {
        return failure(`Active administrator count could not be checked: ${countError.message}`);
      }

      if ((count || 0) <= 1) {
        return failure("The last active System Administrator cannot be assigned to another role.");
      }
    }

    const { error: updateError } = await supabase
      .from("app_users")
      .update({ role_code: newRoleCode })
      .eq("id", userId);

    if (updateError) {
      return failure(`Role could not be changed: ${updateError.message}`);
    }

    await writeAudit(supabase, actor, {
      module: "Users & Access",
      action: "User role changed",
      entityType: "app_user",
      entityKey: target.id,
      previousValue: target.role_code,
      newValue: newRoleCode,
    });

    revalidateSystemAdministrator("/system-administrator/users-access");
    return success(`${target.full_name} was assigned to the selected staff role.`);
  } catch (error) {
    return failure(messageFromError(error, "Role change failed."));
  }
}

export async function resetUserPassword(payload) {
  try {
    const passwordError = validatePassword(payload?.temporaryPassword);
    if (passwordError) return failure(passwordError);

    const { actor, supabase } = await getAdminContext("system.users_manage");
    const adminClient = createAdminClient();

    const userId = normalizeText(payload?.userId);

    const { data: target, error: targetError } = await supabase
      .from("app_users")
      .select("id,auth_user_id,full_name,email")
      .eq("id", userId)
      .single();

    if (targetError || !target) {
      return failure(messageFromError(targetError, "User account was not found."));
    }

    if (!target.auth_user_id) {
      return failure("This application user is not linked to a Supabase Auth account.");
    }

    const { error: authError } =
      await adminClient.auth.admin.updateUserById(target.auth_user_id, {
        password: payload.temporaryPassword,
      });

    if (authError) {
      return failure(`Password could not be reset: ${authError.message}`);
    }

    await writeAudit(supabase, actor, {
      module: "Users & Access",
      action: "Password reset",
      entityType: "app_user",
      entityKey: target.id,
      result: "Successful",
      reason: "System Administrator set a new temporary password.",
    });

    revalidateSystemAdministrator("/system-administrator/users-access");
    return success(`A new temporary password was set for ${target.full_name}.`);
  } catch (error) {
    return failure(messageFromError(error, "Password reset failed."));
  }
}

export async function updateRoleDescription(payload) {
  try {
    const { actor, supabase } = await getAdminContext("system.permissions_manage");
    const roleCode = normalizeText(payload?.roleCode);
    const description = normalizeText(payload?.description);

    if (!APPROVED_ROLES.has(roleCode)) {
      return failure("Only predefined PLP roles can be maintained.");
    }

    if (!description) {
      return failure("Role description cannot be empty.");
    }

    const { data: current, error: currentError } = await supabase
      .from("roles")
      .select("code,description")
      .eq("code", roleCode)
      .single();

    if (currentError || !current) {
      return failure(messageFromError(currentError, "Role was not found."));
    }

    const { error: updateError } = await supabase
      .from("roles")
      .update({ description })
      .eq("code", roleCode);

    if (updateError) {
      return failure(`Role description could not be updated: ${updateError.message}`);
    }

    await writeAudit(supabase, actor, {
      module: "Users & Access",
      action: "Role description updated",
      entityType: "role",
      entityKey: roleCode,
      previousValue: current.description,
      newValue: description,
    });

    revalidateSystemAdministrator("/system-administrator/users-access");
    return success("Role description was updated.");
  } catch (error) {
    return failure(messageFromError(error, "Role update failed."));
  }
}

export async function setRolePermission(payload) {
  try {
    const { actor, supabase } = await getAdminContext("system.permissions_manage");
    const roleCode = normalizeText(payload?.roleCode);
    const permissionCode = normalizeText(payload?.permissionCode);
    const enabled = Boolean(payload?.enabled);

    if (!APPROVED_ROLES.has(roleCode)) {
      return failure("Only predefined PLP roles can receive permissions.");
    }

    const authorizedPermissions = AUTHORIZED_ROLE_PERMISSIONS[roleCode];

    if (!authorizedPermissions?.has(permissionCode)) {
      return failure(
        "That permission is outside the approved authority boundary for the selected role.",
      );
    }

    if (
      !enabled &&
      roleCode === SYSTEM_ADMIN_ROLE &&
      permissionCode === "system.permissions_manage"
    ) {
      return failure(
        "The System Administrator permission-management capability cannot be disabled because doing so would prevent recovery through this portal.",
      );
    }

    const { data: permission, error: permissionError } = await supabase
      .from("permissions")
      .select("code,name")
      .eq("code", permissionCode)
      .single();

    if (permissionError || !permission) {
      return failure(messageFromError(permissionError, "Permission was not found."));
    }

    const mutation = enabled
      ? supabase.from("role_permissions").upsert(
          {
            role_code: roleCode,
            permission_code: permissionCode,
          },
          {
            onConflict: "role_code,permission_code",
            ignoreDuplicates: true,
          },
        )
      : supabase
          .from("role_permissions")
          .delete()
          .eq("role_code", roleCode)
          .eq("permission_code", permissionCode);

    const { error: mutationError } = await mutation;

    if (mutationError) {
      return failure(`Permission assignment could not be changed: ${mutationError.message}`);
    }

    await writeAudit(supabase, actor, {
      module: "Users & Access",
      action: enabled ? "Permission enabled" : "Permission disabled",
      entityType: "role_permission",
      entityKey: `${roleCode}:${permissionCode}`,
      previousValue: enabled ? "Disabled" : "Enabled",
      newValue: enabled ? "Enabled" : "Disabled",
    });

    revalidateSystemAdministrator("/system-administrator/users-access");
    return success(
      `${permission.name} was ${enabled ? "enabled" : "disabled"} for ${roleCode}.`,
    );
  } catch (error) {
    return failure(messageFromError(error, "Permission update failed."));
  }
}

export async function updateIntegrationConfiguration(payload) {
  try {
    const { actor, supabase } = await getAdminContext("system.integration_manage");
    const id = normalizeText(payload?.id);
    const endpointUrl = normalizeText(payload?.endpointUrl);
    const authenticationMethod = normalizeText(payload?.authenticationMethod);
    const timeoutSeconds = Number(payload?.timeoutSeconds);

    if (!id || !endpointUrl) {
      return failure("Integration configuration and endpoint URL are required.");
    }

    if (!Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0) {
      return failure("Connection timeout must be a positive whole number of seconds.");
    }

    const { data: current, error: currentError } = await supabase
      .from("integration_configurations")
      .select("*")
      .eq("id", id)
      .single();

    if (currentError || !current) {
      return failure(messageFromError(currentError, "Integration configuration was not found."));
    }

    const nextValues = {
      endpoint_url: endpointUrl,
      authentication_method: authenticationMethod || null,
      timeout_seconds: timeoutSeconds,
      is_enabled: Boolean(payload?.isEnabled),
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("integration_configurations")
      .update(nextValues)
      .eq("id", id);

    if (updateError) {
      return failure(`Integration configuration could not be updated: ${updateError.message}`);
    }

    await writeAudit(supabase, actor, {
      module: "System Integration",
      action: "Integration configuration updated",
      entityType: "integration_configuration",
      entityKey: id,
      previousValue: {
        endpoint_url: current.endpoint_url,
        authentication_method: current.authentication_method,
        timeout_seconds: current.timeout_seconds,
        is_enabled: current.is_enabled,
      },
      newValue: nextValues,
    });

    revalidateSystemAdministrator("/system-administrator/system-integration");
    return success("Integration configuration was updated.");
  } catch (error) {
    return failure(messageFromError(error, "Integration configuration update failed."));
  }
}

export async function testIntegrationConnection(payload) {
  try {
    const { actor, supabase } = await getAdminContext("system.integration_manage");
    const id = normalizeText(payload?.configurationId);

    const { data: configuration, error: configurationError } = await supabase
      .from("integration_configurations")
      .select("id,code,name,endpoint_url,timeout_seconds,is_enabled")
      .eq("id", id)
      .single();

    if (configurationError || !configuration) {
      return failure(
        messageFromError(configurationError, "Integration configuration was not found."),
      );
    }

    if (!configuration.endpoint_url) {
      return failure("No endpoint URL is configured.");
    }

    const requestedAt = new Date();
    const startedAt = performance.now();
    let responseCode = null;
    let status = "Failed";
    let responseSummary = "";

    try {
      const timeoutMs = Math.max(
        1000,
        Number(configuration.timeout_seconds || 10) * 1000,
      );

      const response = await fetch(configuration.endpoint_url, {
        method: "HEAD",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });

      responseCode = response.status;

      if (response.ok) {
        status = "Successful";
        responseSummary = "Endpoint responded successfully to the connection test.";
      } else if ([401, 403, 405].includes(response.status)) {
        status = "Reachable";
        responseSummary =
          response.status === 405
            ? "Endpoint is reachable but does not accept HEAD requests."
            : "Endpoint is reachable and requires authenticated access.";
      } else {
        responseSummary = `Endpoint returned HTTP ${response.status}.`;
      }
    } catch (error) {
      responseSummary = messageFromError(error, "Endpoint did not respond.");
    }

    const processingTimeMs = Math.max(
      0,
      Math.round(performance.now() - startedAt),
    );

    const reference = `API-TEST-${Date.now()}-${crypto.randomUUID()
      .slice(0, 6)
      .toUpperCase()}`;

    const { error: requestError } = await supabase
      .from("integration_requests")
      .insert({
        configuration_id: configuration.id,
        request_reference: reference,
        request_type: "Connection Test",
        source_system: "Enrollment System",
        endpoint_path: configuration.endpoint_url,
        requested_at: requestedAt.toISOString(),
        response_code: responseCode,
        status,
        processing_time_ms: processingTimeMs,
        request_summary: "System Administrator initiated an endpoint connectivity test.",
        response_summary: responseSummary,
      });

    if (requestError) {
      return failure(`Connection test result could not be recorded: ${requestError.message}`);
    }

    await writeAudit(supabase, actor, {
      module: "System Integration",
      action: "API connection tested",
      entityType: "integration_configuration",
      entityKey: configuration.id,
      newValue: {
        status,
        response_code: responseCode,
        processing_time_ms: processingTimeMs,
      },
      result: status === "Failed" ? "Failed" : "Successful",
      reason: responseSummary,
    });

    revalidateSystemAdministrator(
      "/system-administrator/system-integration",
      "/system-administrator/audit-monitoring",
    );

    return status === "Failed"
      ? failure(`Connection test failed. ${responseSummary}`)
      : success(`Connection test result: ${status}. ${responseSummary}`);
  } catch (error) {
    return failure(messageFromError(error, "Connection test failed."));
  }
}

export async function queueSynchronizationRetry(payload) {
  try {
    const { actor, supabase } = await getAdminContext("system.integration_manage");
    const syncId = normalizeText(payload?.syncId);

    if (!syncId) return failure("Synchronization event is required.");

    const { data: sync, error: syncError } = await supabase
      .from("synchronization_events")
      .select("id,sync_reference,status,applicant_reference,attempt_number")
      .eq("id", syncId)
      .single();

    if (syncError || !sync) {
      return failure(messageFromError(syncError, "Synchronization event was not found."));
    }

    const { data: requestId, error: retryError } = await supabase.rpc(
      "queue_integration_retry",
      { p_sync_id: syncId },
    );

    if (retryError) {
      return failure(`Retry could not be queued: ${retryError.message}`);
    }

    await writeAudit(supabase, actor, {
      module: "System Integration",
      action: "Synchronization retry queued",
      entityType: "synchronization_event",
      entityKey: syncId,
      previousValue: {
        sync_reference: sync.sync_reference,
        status: sync.status,
        attempt_number: sync.attempt_number,
      },
      newValue: {
        queued_request_id: requestId,
        status: "Pending",
      },
    });

    revalidateSystemAdministrator("/system-administrator/system-integration");
    return success("A new pending synchronization attempt was queued.");
  } catch (error) {
    return failure(messageFromError(error, "Synchronization retry failed."));
  }
}

export async function updateSystemSettings(payload) {
  try {
    const { actor, supabase } = await getAdminContext("system.settings_manage");

    const values = {
      application_name: normalizeText(payload?.applicationName),
      timezone_name: normalizeText(payload?.timezoneName),
      technical_notifications_enabled: Boolean(
        payload?.technicalNotificationsEnabled,
      ),
      maintenance_mode: Boolean(payload?.maintenanceMode),
      logging_level: normalizeText(payload?.loggingLevel),
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    };

    if (!values.application_name || !values.timezone_name || !values.logging_level) {
      return failure("Application name, timezone, and logging level are required.");
    }

    const { data: current, error: currentError } = await supabase
      .from("system_settings")
      .select("*")
      .eq("singleton_id", true)
      .single();

    if (currentError || !current) {
      return failure(messageFromError(currentError, "System settings were not found."));
    }

    const { error: updateError } = await supabase
      .from("system_settings")
      .update(values)
      .eq("singleton_id", true);

    if (updateError) {
      return failure(`System settings could not be updated: ${updateError.message}`);
    }

    await writeAudit(supabase, actor, {
      module: "System Administration",
      action: "System settings updated",
      entityType: "system_settings",
      entityKey: "singleton",
      previousValue: current,
      newValue: values,
    });

    revalidateSystemAdministrator("/system-administrator/system-administration");
    return success("System settings were updated.");
  } catch (error) {
    return failure(messageFromError(error, "System settings update failed."));
  }
}

export async function updateSecuritySettings(payload) {
  try {
    const { actor, supabase } = await getAdminContext("system.settings_manage");

    const sessionTimeoutMinutes = Number(payload?.sessionTimeoutMinutes);
    const loginAttemptLimit = Number(payload?.loginAttemptLimit);

    if (!Number.isInteger(sessionTimeoutMinutes) || sessionTimeoutMinutes <= 0) {
      return failure("Session timeout must be a positive whole number of minutes.");
    }

    if (!Number.isInteger(loginAttemptLimit) || loginAttemptLimit <= 0) {
      return failure("Login attempt limit must be a positive whole number.");
    }

    const values = {
      session_timeout_minutes: sessionTimeoutMinutes,
      login_attempt_limit: loginAttemptLimit,
      password_policy: normalizeText(payload?.passwordPolicy),
      account_lockout_enabled: Boolean(payload?.accountLockoutEnabled),
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    };

    const { data: current, error: currentError } = await supabase
      .from("security_settings")
      .select("*")
      .eq("singleton_id", true)
      .single();

    if (currentError || !current) {
      return failure(messageFromError(currentError, "Security settings were not found."));
    }

    const { error: updateError } = await supabase
      .from("security_settings")
      .update(values)
      .eq("singleton_id", true);

    if (updateError) {
      return failure(`Security settings could not be updated: ${updateError.message}`);
    }

    await writeAudit(supabase, actor, {
      module: "System Administration",
      action: "Security settings updated",
      entityType: "security_settings",
      entityKey: "singleton",
      previousValue: current,
      newValue: values,
    });

    revalidateSystemAdministrator(
      "/system-administrator/system-administration",
      "/system-administrator/audit-monitoring",
    );
    return success("Security settings were updated.");
  } catch (error) {
    return failure(messageFromError(error, "Security settings update failed."));
  }
}

export async function runApprovedDatabaseMaintenance() {
  try {
    const { actor, supabase } = await getAdminContext("system.settings_manage");

    const { data, error } = await supabase.rpc(
      "run_approved_database_maintenance",
    );

    if (error) {
      return failure(`Database maintenance could not run: ${error.message}`);
    }

    const result = Array.isArray(data) ? data[0] : data;

    await writeAudit(supabase, actor, {
      module: "System Administration",
      action: "Database maintenance executed",
      entityType: "database_maintenance_event",
      entityKey: result?.event_id || null,
      result:
        result?.operation_status === "Completed" ? "Successful" : "Failed",
      reason: result?.operation_details || null,
    });

    revalidateSystemAdministrator(
      "/system-administrator/system-administration",
      "/system-administrator/audit-monitoring",
    );

    return result?.operation_status === "Completed"
      ? success(result.operation_details || "Approved database maintenance completed.")
      : failure(result?.operation_details || "Approved database maintenance failed.");
  } catch (error) {
    return failure(messageFromError(error, "Database maintenance failed."));
  }
}

export async function runSystemHealthCheck() {
  try {
    const { actor, supabase } = await getAdminContext("system.audit_read");

    const [
      databaseProbe,
      configurationResult,
      backupResult,
      openErrorResult,
    ] = await Promise.all([
      supabase.from("app_users").select("id").limit(1),
      supabase
        .from("integration_configurations")
        .select("id,endpoint_url,timeout_seconds,is_enabled")
        .eq("is_enabled", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("backup_records")
        .select("status,completed_at,started_at")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("system_errors")
        .select("id", { count: "exact", head: true })
        .eq("status", "Open"),
    ]);

    const databaseStatus = databaseProbe.error ? "Error" : "Healthy";
    const authenticationStatus = actor?.id ? "Healthy" : "Error";
    const applicationStatus = "Healthy";
    const backupStatus = backupResult.error
      ? "Unknown"
      : backupResult.data?.status || "No Record";
    const recentErrorCount = openErrorResult.error
      ? null
      : openErrorResult.count || 0;

    let apiStatus = "Disabled";

    if (configurationResult.error) {
      apiStatus = "Unknown";
    } else if (configurationResult.data?.is_enabled) {
      const configuration = configurationResult.data;

      if (!configuration.endpoint_url) {
        apiStatus = "Unconfigured";
      } else {
        try {
          const response = await fetch(configuration.endpoint_url, {
            method: "HEAD",
            cache: "no-store",
            signal: AbortSignal.timeout(
              Math.max(
                1000,
                Number(configuration.timeout_seconds || 10) * 1000,
              ),
            ),
          });

          if (response.ok) {
            apiStatus = "Healthy";
          } else if ([401, 403, 405].includes(response.status)) {
            apiStatus = "Reachable";
          } else {
            apiStatus = `HTTP ${response.status}`;
          }
        } catch {
          apiStatus = "Unreachable";
        }
      }
    }

    const { data: snapshot, error: snapshotError } = await supabase
      .from("system_health_snapshots")
      .insert({
        application_status: applicationStatus,
        database_status: databaseStatus,
        api_status: apiStatus,
        authentication_status: authenticationStatus,
        backup_status: backupStatus,
        recent_error_count: recentErrorCount,
        captured_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (snapshotError) {
      return failure(`System health snapshot could not be saved: ${snapshotError.message}`);
    }

    await writeAudit(supabase, actor, {
      module: "Audit & Monitoring",
      action: "System health checks executed",
      entityType: "system_health_snapshot",
      entityKey: snapshot.id,
      newValue: {
        application_status: applicationStatus,
        database_status: databaseStatus,
        api_status: apiStatus,
        authentication_status: authenticationStatus,
        backup_status: backupStatus,
        recent_error_count: recentErrorCount,
      },
    });

    revalidateSystemAdministrator(
      "/system-administrator/dashboard",
      "/system-administrator/audit-monitoring",
    );
    return success("System health checks completed and the snapshot was saved.");
  } catch (error) {
    return failure(messageFromError(error, "System health check failed."));
  }
}

export async function setSystemErrorReviewState(payload) {
  try {
    const { actor, supabase } = await getAdminContext("system.audit_read");
    const errorId = normalizeText(payload?.errorId);
    const reviewed = Boolean(payload?.reviewed);

    const { data: current, error: currentError } = await supabase
      .from("system_errors")
      .select("id,error_reference,status,reviewed_by,reviewed_at")
      .eq("id", errorId)
      .single();

    if (currentError || !current) {
      return failure(messageFromError(currentError, "System error was not found."));
    }

    const values = reviewed
      ? {
          status: "Reviewed",
          reviewed_by: actor.id,
          reviewed_at: new Date().toISOString(),
        }
      : {
          status: "Open",
          reviewed_by: null,
          reviewed_at: null,
        };

    const { error: updateError } = await supabase
      .from("system_errors")
      .update(values)
      .eq("id", errorId);

    if (updateError) {
      return failure(`System error status could not be updated: ${updateError.message}`);
    }

    await writeAudit(supabase, actor, {
      module: "Audit & Monitoring",
      action: reviewed ? "System error marked reviewed" : "System error reopened",
      entityType: "system_error",
      entityKey: current.error_reference,
      previousValue: current.status,
      newValue: values.status,
    });

    revalidateSystemAdministrator(
      "/system-administrator/dashboard",
      "/system-administrator/audit-monitoring",
    );
    return success(
      reviewed
        ? `${current.error_reference} was marked reviewed.`
        : `${current.error_reference} was reopened.`,
    );
  } catch (error) {
    return failure(messageFromError(error, "System error update failed."));
  }
}

export async function markSystemAdministratorNotification(
  notificationId,
  read = true,
) {
  try {
    const { actor, supabase } = await getAdminContext();

    const values = {
      is_read: Boolean(read),
      read_at: read ? new Date().toISOString() : null,
    };

    const { error } = await supabase
      .from("user_notifications")
      .update(values)
      .eq("user_id", actor.id)
      .eq("notification_id", notificationId);

    if (error) {
      return failure(`Notification state could not be updated: ${error.message}`);
    }

    revalidatePath("/system-administrator/notifications");
    return success(read ? "Notification marked as read." : "Notification marked as unread.");
  } catch (error) {
    return failure(messageFromError(error, "Notification update failed."));
  }
}

export async function markAllSystemAdministratorNotifications() {
  try {
    const { actor, supabase } = await getAdminContext();

    const { error } = await supabase
      .from("user_notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("user_id", actor.id)
      .eq("is_read", false);

    if (error) {
      return failure(`Notifications could not be updated: ${error.message}`);
    }

    revalidatePath("/system-administrator/notifications");
    return success("All technical alerts were marked as read.");
  } catch (error) {
    return failure(messageFromError(error, "Notification update failed."));
  }
}


export async function updateSystemAdministratorProfile(payload) {
  try {
    const { actor, supabase } = await getAdminContext();
    const adminClient = createAdminClient();

    const fullName = normalizeText(payload?.fullName);
    const email = normalizeEmail(payload?.email);
    const employeeId = normalizeText(payload?.employeeId) || null;
    const positionTitle = normalizeText(payload?.positionTitle) || null;
    const officeName = normalizeText(payload?.officeName) || null;

    if (!fullName || !email || !email.includes("@")) {
      return failure("Full name and a valid email are required.");
    }

    const { data: current, error: currentError } = await supabase
      .from("app_users")
      .select("id,auth_user_id,full_name,email")
      .eq("id", actor.id)
      .single();

    if (currentError || !current) {
      return failure(messageFromError(currentError, "Profile was not found."));
    }

    if (current.auth_user_id) {
      const { error: authError } =
        await adminClient.auth.admin.updateUserById(current.auth_user_id, {
          email,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
          },
        });

      if (authError) {
        return failure(
          `Supabase Auth profile could not be updated: ${authError.message}`,
        );
      }
    }

    const { error: profileError } = await supabase.rpc(
      "system_admin_update_own_profile",
      {
        p_full_name: fullName,
        p_email: email,
        p_employee_id: employeeId,
        p_position_title: positionTitle,
        p_office_name: officeName,
      },
    );

    if (profileError) {
      if (current.auth_user_id) {
        await adminClient.auth.admin.updateUserById(current.auth_user_id, {
          email: current.email,
          email_confirm: true,
          user_metadata: {
            full_name: current.full_name,
          },
        });
      }

      return failure(
        `Profile database update was rolled back: ${profileError.message}`,
      );
    }

    await writeAudit(supabase, actor, {
      module: "System Administration",
      action: "Administrator profile updated",
      entityType: "app_user",
      entityKey: actor.id,
      previousValue: {
        full_name: current.full_name,
        email: current.email,
      },
      newValue: {
        full_name: fullName,
        email,
        employee_id: employeeId,
        position_title: positionTitle,
        office_name: officeName,
      },
    });

    revalidateSystemAdministrator(
      "/system-administrator/profile",
      "/system-administrator/dashboard",
    );

    return success("System Administrator profile was updated.");
  } catch (error) {
    return failure(messageFromError(error, "Profile update failed."));
  }
}

export async function changeSystemAdministratorPassword(payload) {
  try {
    const passwordError = validatePassword(payload?.newPassword);
    if (passwordError) return failure(passwordError);

    if (payload?.newPassword !== payload?.confirmPassword) {
      return failure("The password confirmation does not match.");
    }

    const { actor, supabase } = await getAdminContext();

    const { error } = await supabase.auth.updateUser({
      password: payload.newPassword,
    });

    if (error) {
      return failure(`Password could not be changed: ${error.message}`);
    }

    await writeAudit(supabase, actor, {
      module: "Users & Access",
      action: "Own password changed",
      entityType: "app_user",
      entityKey: actor.id,
      result: "Successful",
    });

    revalidatePath("/system-administrator/profile");
    return success("Your password was changed.");
  } catch (error) {
    return failure(messageFromError(error, "Password change failed."));
  }
}

export async function updateSystemAdministratorPreferences(payload) {
  try {
    const { actor, supabase } = await getAdminContext();

    const preferenceRows = [
      ["technical_alerts", Boolean(payload?.technicalAlerts)],
      ["security_alerts", Boolean(payload?.securityAlerts)],
      ["backup_alerts", Boolean(payload?.backupAlerts)],
      ["integration_alerts", Boolean(payload?.integrationAlerts)],
    ].map(([preferenceKey, value]) => ({
      user_id: actor.id,
      preference_key: preferenceKey,
      preference_value: value,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("user_preferences")
      .upsert(preferenceRows, {
        onConflict: "user_id,preference_key",
      });

    if (error) {
      return failure(`Notification preferences could not be saved: ${error.message}`);
    }

    revalidatePath("/system-administrator/profile");
    return success("Technical notification preferences were saved.");
  } catch (error) {
    return failure(messageFromError(error, "Preference update failed."));
  }
}
