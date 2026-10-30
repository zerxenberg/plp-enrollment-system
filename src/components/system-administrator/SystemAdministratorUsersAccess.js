
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  DataTable,
  FilterControl,
  Modal,
  PageHeader,
  SearchControl,
  StatusBadge,
} from "@/components/ui/PortalUI";
import { Details, Feedback, Info, Panel, Tabs } from "@/components/registrar/RegistrarShared";
import {
  changeUserRole,
  createStaffUserAccount,
  provisionExistingApplicationUser,
  resetUserPassword,
  setRolePermission,
  setUserAccessState,
  updateRoleDescription,
  updateUserAccount,
} from "@/features/system-administration/system-admin-actions";

const ALL = "ALL";

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


const TABS = [
  { value: "users", label: "Users" },
  { value: "roles", label: "Roles" },
  { value: "permissions", label: "Permissions" },
  { value: "activity", label: "Access Activity" },
];

function distinctOptions(values, label) {
  return [
    { value: ALL, label },
    ...[...new Set(values.filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b)))
      .map((value) => ({ value, label: value })),
  ];
}

function actionResultMessage(result) {
  return result?.message || (result?.ok ? "Action completed." : "Action failed.");
}

export default function SystemAdministratorUsersAccess({ usersAccessData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    users,
    roles,
    permissions,
    rolePermissions,
    organizationalUnits,
    accessActivity,
    recordScope,
  } = usersAccessData;

  const [tab, setTab] = useState("users");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL);
  const [accountStatus, setAccountStatus] = useState(ALL);
  const [college, setCollege] = useState(ALL);
  const [program, setProgram] = useState(ALL);
  const [yearLevel, setYearLevel] = useState(ALL);
  const [studentStatus, setStudentStatus] = useState(ALL);
  const [organization, setOrganization] = useState(ALL);
  const [position, setPosition] = useState(ALL);

  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedPermission, setSelectedPermission] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [roleChangeOpen, setRoleChangeOpen] = useState(false);
  const [roleDescriptionOpen, setRoleDescriptionOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messageWarning, setMessageWarning] = useState(false);

  const [createMode, setCreateMode] = useState("existing");
  const [createForm, setCreateForm] = useState({
    existingUserId: "",
    fullName: "",
    email: "",
    username: "",
    employeeId: "",
    roleCode: "registrar",
    organizationalUnitCode: "",
    positionTitle: "",
    officeName: "",
    accountStatus: "Active",
    temporaryPassword: "",
  });

  const [editForm, setEditForm] = useState({
    userId: "",
    fullName: "",
    email: "",
    username: "",
    employeeId: "",
    organizationalUnitCode: "",
    positionTitle: "",
    officeName: "",
  });

  const [passwordForm, setPasswordForm] = useState({
    temporaryPassword: "",
  });

  const [roleChangeCode, setRoleChangeCode] = useState("registrar");
  const [roleDescription, setRoleDescription] = useState("");

  const approvedRoleOptions = [
    { value: ALL, label: "All Roles" },
    ...roles.map((role) => ({ value: role.code, label: role.name })),
  ];

  const staffRoleOptions = roles
    .filter((role) => ["registrar", "academic-coordinator", "system-administrator"].includes(role.code))
    .map((role) => ({ value: role.code, label: role.name }));

  // Historical synthetic accounts must not be promoted into institutional logins.
  const unlinkedUsers = users.filter((user) => !user.authLinked && (
    !user.isSyntheticDemo || user.projectCohortId === recordScope.currentProjectCohortId
  ));

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const searchable = [
        user.fullName,
        user.email,
        user.username,
        user.roleName,
        user.student?.student_number,
        user.staff?.employee_id,
        user.student?.program_code,
        user.student?.collegeName,
        user.staff?.organizationName,
      ].filter(Boolean).join(" ").toLowerCase();

      if (!searchable.includes(search.toLowerCase())) return false;
      if (roleFilter !== ALL && user.roleCode !== roleFilter) return false;
      if (accountStatus !== ALL && user.accountStatus !== accountStatus) return false;

      if (roleFilter === "student") {
        if (college !== ALL && user.student?.collegeName !== college) return false;
        if (program !== ALL && user.student?.program_code !== program) return false;
        if (yearLevel !== ALL && user.student?.year_level !== yearLevel) return false;
        if (studentStatus !== ALL && user.student?.student_status !== studentStatus) return false;
      }

      if (["registrar", "academic-coordinator", "system-administrator"].includes(roleFilter)) {
        if (organization !== ALL && user.staff?.organizationName !== organization) return false;
        if (position !== ALL && user.staff?.position_title !== position) return false;
      }

      return true;
    });
  }, [
    users,
    search,
    roleFilter,
    accountStatus,
    college,
    program,
    yearLevel,
    studentStatus,
    organization,
    position,
  ]);

  const filteredActivity = accessActivity.filter((item) => {
    const text = [
      item.actor_label,
      item.action,
      item.module,
      item.entity_key,
      item.result,
      item.reason,
    ].filter(Boolean).join(" ").toLowerCase();

    if (!text.includes(search.toLowerCase())) return false;

    if (roleFilter !== ALL) {
      const actor = users.find((user) => user.id === item.actor_user_id);
      if (actor?.roleCode !== roleFilter) return false;
    }

    return true;
  });

  function setResult(result) {
    setMessage(actionResultMessage(result));
    setMessageWarning(!result?.ok);
    if (result?.ok) router.refresh();
  }

  function run(action) {
    startTransition(async () => {
      const result = await action();
      setResult(result);
    });
  }

  function resetRoleFilters(nextRole) {
    setRoleFilter(nextRole);
    setCollege(ALL);
    setProgram(ALL);
    setYearLevel(ALL);
    setStudentStatus(ALL);
    setOrganization(ALL);
    setPosition(ALL);
  }

  function openEdit(user) {
    setSelectedUser(user);
    setEditForm({
      userId: user.id,
      fullName: user.fullName,
      email: user.email,
      username: user.username || "",
      employeeId: user.staff?.employee_id || "",
      organizationalUnitCode: user.staff?.organizational_unit_code || "",
      positionTitle: user.staff?.position_title || "",
      officeName: user.staff?.office_name || "",
    });
    setEditOpen(true);
  }

  function openPassword(user) {
    setSelectedUser(user);
    setPasswordForm({ temporaryPassword: "" });
    setPasswordOpen(true);
  }

  function openRoleChange(user) {
    setSelectedUser(user);
    setRoleChangeCode(
      ["registrar", "academic-coordinator", "system-administrator"].includes(user.roleCode)
        ? user.roleCode
        : "registrar",
    );
    setRoleChangeOpen(true);
  }

  const studentUsers = users.filter((user) => user.roleCode === "student");

  return (
    <>
      <PageHeader
        title="Users & Access"
        description="Live account administration, predefined roles, permissions, and recorded access activity for the current operational dataset."
        actions={<Button onClick={() => setCreateOpen(true)}>Create User Account</Button>}
      />

      <Tabs
        items={TABS}
        selected={tab}
        onSelect={(next) => {
          setTab(next);
          setSearch("");
          setRoleFilter(ALL);
          setMessage("");
          setSelectedUser(null);
        }}
        label="Users and access sections"
        title="Access Administration"
        subtitle="Select a table row to inspect the full record. Account actions are available only inside the selected user modal."
      >
        <div className="notice" style={{ marginBottom: 12 }}>
          Current account scope: nonsynthetic institutional accounts plus project cohort <code>{recordScope?.currentProjectCohortId || "Not available"}</code>. Retired synthetic planning accounts are excluded.
        </div>
        <Feedback message={message} warning={messageWarning} />

        {tab === "users" ? (
          <>
            <div className="toolbar">
              <SearchControl
                value={search}
                onChange={setSearch}
                label="Search users"
                placeholder="Search name, email, ID, role, program, or organization"
              />
              <FilterControl
                label="Role"
                value={roleFilter}
                onChange={resetRoleFilters}
                options={approvedRoleOptions}
              />
              <FilterControl
                label="Account Status"
                value={accountStatus}
                onChange={setAccountStatus}
                options={[
                  { value: ALL, label: "All Statuses" },
                  { value: "Active", label: "Active" },
                  { value: "Inactive", label: "Inactive" },
                ]}
              />
            </div>

            <div className="system-admin-dynamic-filters" key={roleFilter}>
              {roleFilter === ALL ? (
                <div className="summary-strip" role="status">
                  <span><strong>{filteredUsers.length}</strong> of {users.length} accounts shown</span>
                  <span>Select a role to display the most relevant role-specific filters.</span>
                </div>
              ) : null}

              {roleFilter === "student" ? (
                <div className="toolbar">
                  <FilterControl
                    label="College"
                    value={college}
                    onChange={setCollege}
                    options={distinctOptions(studentUsers.map((user) => user.student?.collegeName), "All Colleges")}
                  />
                  <FilterControl
                    label="Program"
                    value={program}
                    onChange={setProgram}
                    options={distinctOptions(studentUsers.map((user) => user.student?.program_code), "All Programs")}
                  />
                  <FilterControl
                    label="Year Level"
                    value={yearLevel}
                    onChange={setYearLevel}
                    options={distinctOptions(studentUsers.map((user) => user.student?.year_level), "All Year Levels")}
                  />
                  <FilterControl
                    label="Student Status"
                    value={studentStatus}
                    onChange={setStudentStatus}
                    options={distinctOptions(studentUsers.map((user) => user.student?.student_status), "All Student Statuses")}
                  />
                </div>
              ) : null}

              {["registrar", "academic-coordinator", "system-administrator"].includes(roleFilter) ? (
                <div className="toolbar">
                  <FilterControl
                    label="Organization"
                    value={organization}
                    onChange={setOrganization}
                    options={distinctOptions(
                      users.filter((user) => user.roleCode === roleFilter).map((user) => user.staff?.organizationName),
                      "All Organizations",
                    )}
                  />
                  <FilterControl
                    label="Position"
                    value={position}
                    onChange={setPosition}
                    options={distinctOptions(
                      users.filter((user) => user.roleCode === roleFilter).map((user) => user.staff?.position_title),
                      "All Positions",
                    )}
                  />
                </div>
              ) : null}
            </div>

            <DataTable
              rows={filteredUsers}
              rowKey="id"
              onRowClick={setSelectedUser}
              getRowAriaLabel={(row) => `View ${row.fullName} account details`}
              emptyMessage="No accounts match the selected filters."
              columns={[
                { key: "account", label: "Account", render: (row) => (
                  <div>
                    <strong>{row.fullName}</strong>
                    <div className="table-subtext">{row.username}</div>
                  </div>
                ) },
                { key: "roleName", label: "Role" },
                { key: "recordScope", label: "Record Type" },
                { key: "organization", label: "College / Office / Department", render: (row) => row.student?.collegeName || row.staff?.organizationName || "Not assigned" },
                { key: "accountStatus", label: "Account Status", render: (row) => <StatusBadge value={row.accountStatus} label={row.accountStatus} /> },
                { key: "authLinked", label: "Auth", render: (row) => <StatusBadge value={row.authLinked ? "ACTIVE" : "INACTIVE"} label={row.authLinked ? "Linked" : "Not linked"} /> },
                { key: "lastLoginLabel", label: "Last Login" },
              ]}
            />
          </>
        ) : null}

        {tab === "roles" ? (
          <DataTable
            rows={roles}
            rowKey="code"
            onRowClick={(row) => {
              setSelectedRole(row);
              setRoleDescription(row.description || "");
            }}
            getRowAriaLabel={(row) => `View ${row.name} role`}
            columns={[
              { key: "name", label: "Role" },
              { key: "userCount", label: "Users" },
              { key: "is_active", label: "Status", render: (row) => <StatusBadge value={row.is_active ? "ACTIVE" : "INACTIVE"} label={row.is_active ? "Active" : "Inactive"} /> },
              { key: "description", label: "Description" },
            ]}
          />
        ) : null}

        {tab === "permissions" ? (
          <>
            <div className="notice" style={{ marginBottom: 12 }}>
              Permission assignments are persisted in <code>role_permissions</code>. Role definitions remain limited to the four approved PLP roles.
            </div>
            <DataTable
              rows={permissions}
              rowKey="code"
              onRowClick={setSelectedPermission}
              getRowAriaLabel={(row) => `View permission ${row.name}`}
              columns={[
                { key: "name", label: "Permission" },
                { key: "code", label: "Permission Code" },
                { key: "assignedRoles", label: "Assigned Roles", render: (row) => row.assignedRoles.length
                  ? row.assignedRoles.map((code) => roles.find((role) => role.code === code)?.name || code).join(", ")
                  : "None" },
              ]}
            />
          </>
        ) : null}

        {tab === "activity" ? (
          <>
            <div className="toolbar">
              <SearchControl
                value={search}
                onChange={setSearch}
                label="Search access activity"
                placeholder="Search actor, action, entity, result, or reason"
              />
              <FilterControl
                label="Actor Role"
                value={roleFilter}
                onChange={setRoleFilter}
                options={approvedRoleOptions}
              />
            </div>
            <DataTable
              rows={filteredActivity}
              rowKey="id"
              onRowClick={setSelectedActivity}
              getRowAriaLabel={(row) => `View access event ${row.id}`}
              emptyMessage="No access events match the selected filters."
              columns={[
                { key: "occurredAtLabel", label: "Date & Time" },
                { key: "actor_label", label: "Actor" },
                { key: "action", label: "Action" },
                { key: "module", label: "Module" },
                { key: "result", label: "Result", render: (row) => <StatusBadge value={row.result} label={row.result || "Not recorded"} /> },
              ]}
            />
          </>
        ) : null}
      </Tabs>

      <Modal
        open={Boolean(selectedUser)}
        title={selectedUser ? `${selectedUser.fullName} · ${selectedUser.roleName}` : "Account Details"}
        onClose={() => setSelectedUser(null)}
        className="system-admin-detail-modal"
        footer={selectedUser ? (
          <>
            <Button variant="ghost" onClick={() => setSelectedUser(null)}>Close</Button>
            <Button variant="secondary" onClick={() => openEdit(selectedUser)}>Edit Account</Button>
            {selectedUser.authLinked ? (
              <Button variant="secondary" onClick={() => openPassword(selectedUser)}>Reset Password</Button>
            ) : null}
            {["registrar", "academic-coordinator", "system-administrator"].includes(selectedUser.roleCode) ? (
              <Button variant="secondary" onClick={() => openRoleChange(selectedUser)}>Change Role</Button>
            ) : null}
            <Button
              variant={selectedUser.accountStatus === "Active" ? "danger" : "primary"}
              disabled={isPending}
              onClick={() => run(async () => {
                const result = await setUserAccessState({
                  userId: selectedUser.id,
                  active: selectedUser.accountStatus !== "Active",
                });
                if (result?.ok) setSelectedUser(null);
                return result;
              })}
            >
              {selectedUser.accountStatus === "Active" ? "Deactivate" : "Activate"}
            </Button>
          </>
        ) : null}
      >
        {selectedUser ? (
          <>
            <div className="info-grid">
              <Info label="Account ID" value={selectedUser.id} />
              <Info label="Full Name" value={selectedUser.fullName} />
              <Info label="Registered Email" value={selectedUser.email} />
              <Info label="Username / Identifier" value={selectedUser.username} />
              <Info label="Role" value={selectedUser.roleName} />
              <Info label="Record Type" value={selectedUser.recordScope} />
              <Info label="Last Login" value={selectedUser.lastLoginLabel} />
              <div className="info-item"><span>Account Status</span><strong><StatusBadge value={selectedUser.accountStatus} label={selectedUser.accountStatus} /></strong></div>
              <div className="info-item"><span>Supabase Auth</span><strong><StatusBadge value={selectedUser.authLinked ? "ACTIVE" : "INACTIVE"} label={selectedUser.authLinked ? "Linked" : "Not linked"} /></strong></div>
            </div>

            {selectedUser.student ? (
              <div style={{ marginTop: 14 }}>
                <Details items={[
                  ["Student Number", selectedUser.student.student_number],
                  ["Sex", selectedUser.sex ?? "Not available"],
                  ["College", selectedUser.student.collegeName],
                  ["Program", `${selectedUser.student.program_code} · ${selectedUser.student.programName}`],
                  ["Curriculum", selectedUser.student.current_curriculum_code || "Not assigned"],
                  ["Academic Term", selectedUser.student.current_term_id || "Not assigned"],
                  ["Year Level", selectedUser.student.year_level],
                  ["Student Type", selectedUser.student.student_type],
                  ["Student Status", selectedUser.student.student_status],
                  ["Academic Classification", selectedUser.student.academic_classification],
                  ["Progression Status", selectedUser.student.progression_status],
                  ["Project Cohort", selectedUser.projectCohortId || "Not applicable"],
                ]} />
              </div>
            ) : null}

            {selectedUser.staff ? (
              <div style={{ marginTop: 14 }}>
                <Details items={[
                  ["Employee ID", selectedUser.staff.employee_id],
                  ["Organization", selectedUser.staff.organizationName],
                  ["Position", selectedUser.staff.position_title],
                  ["Office", selectedUser.staff.office_name],
                ]} />
              </div>
            ) : null}

            {!selectedUser.authLinked ? (
              <div className="notice warning" style={{ marginTop: 14 }}>
                This application record is not yet linked to Supabase Auth. Use Create User Account and choose Existing Application User to provision login access.
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>

      <Modal
        open={createOpen}
        title="Create User Account"
        onClose={() => setCreateOpen(false)}
        className="system-admin-detail-modal"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={isPending}
              onClick={() => run(async () => {
                const result = createMode === "existing"
                  ? await provisionExistingApplicationUser({
                      userId: createForm.existingUserId,
                      temporaryPassword: createForm.temporaryPassword,
                    })
                  : await createStaffUserAccount(createForm);
                if (result?.ok) setCreateOpen(false);
                return result;
              })}
            >
              {createMode === "existing" ? "Provision Auth Account" : "Create Staff Account"}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field full">
            Account Creation Mode
            <select value={createMode} onChange={(event) => setCreateMode(event.target.value)}>
              <option value="existing">Existing Application User</option>
              <option value="new-staff">New Staff Account</option>
            </select>
          </label>

          {createMode === "existing" ? (
            <label className="field full">
              Existing User Without Supabase Auth ({unlinkedUsers.length} eligible)
              <span className="muted" style={{ display: "block", fontSize: 12 }}>
                This selector includes only current institutional records and approved current project accounts without Auth.
                Other accounts are already linked or belong to retired fictional datasets.
              </span>
              <select
                value={createForm.existingUserId}
                onChange={(event) => setCreateForm({ ...createForm, existingUserId: event.target.value })}
              >
                <option value="">Select application user</option>
                {unlinkedUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} · {user.roleName} · {user.email}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="field">Full Name<input value={createForm.fullName} onChange={(event) => setCreateForm({ ...createForm, fullName: event.target.value })} /></label>
              <label className="field">Registered Email<input type="email" value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} /></label>
              <label className="field">Username<input value={createForm.username} onChange={(event) => setCreateForm({ ...createForm, username: event.target.value })} /></label>
              <label className="field">Employee ID<input value={createForm.employeeId} onChange={(event) => setCreateForm({ ...createForm, employeeId: event.target.value })} /></label>
              <label className="field">Role<select value={createForm.roleCode} onChange={(event) => setCreateForm({ ...createForm, roleCode: event.target.value })}>{staffRoleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
              <label className="field">Organization<select value={createForm.organizationalUnitCode} onChange={(event) => setCreateForm({ ...createForm, organizationalUnitCode: event.target.value })}><option value="">No organizational unit</option>{organizationalUnits.map((unit) => <option key={unit.code} value={unit.code}>{unit.name}</option>)}</select></label>
              <label className="field">Position<input value={createForm.positionTitle} onChange={(event) => setCreateForm({ ...createForm, positionTitle: event.target.value })} /></label>
              <label className="field">Office<input value={createForm.officeName} onChange={(event) => setCreateForm({ ...createForm, officeName: event.target.value })} /></label>
            </>
          )}

          {createMode === "existing" ? (
            <div className="notice">Provisioning an existing application account also activates its login immediately. You can deactivate it later in Users &amp; Access.</div>
          ) : (
            <label className="field">
              Initial Account Status
              <select value={createForm.accountStatus} onChange={(event) => setCreateForm({ ...createForm, accountStatus: event.target.value })}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </label>
          )}
          <label className="field">
            Temporary Password
            <input
              type="password"
              minLength={12}
              autoComplete="new-password"
              value={createForm.temporaryPassword}
              onChange={(event) => setCreateForm({ ...createForm, temporaryPassword: event.target.value })}
            />
          </label>
        </div>
        <div className="notice" style={{ marginTop: 12 }}>
          Passwords are sent directly to Supabase Auth and are never written to application tables. New Student academic records are not created from this technical module.
        </div>
      </Modal>

      <Modal
        open={editOpen}
        title="Edit Account"
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button disabled={isPending} onClick={() => run(async () => {
              const result = await updateUserAccount(editForm);
              if (result?.ok) {
                setEditOpen(false);
                setSelectedUser(null);
              }
              return result;
            })}>Save Account</Button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field">Full Name<input value={editForm.fullName} onChange={(event) => setEditForm({ ...editForm, fullName: event.target.value })} /></label>
          <label className="field">Email<input type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} /></label>
          <label className="field">Username<input value={editForm.username} onChange={(event) => setEditForm({ ...editForm, username: event.target.value })} /></label>
          {selectedUser?.staff ? (
            <>
              <label className="field">Employee ID<input value={editForm.employeeId} onChange={(event) => setEditForm({ ...editForm, employeeId: event.target.value })} /></label>
              <label className="field">Organization<select value={editForm.organizationalUnitCode} onChange={(event) => setEditForm({ ...editForm, organizationalUnitCode: event.target.value })}><option value="">No organizational unit</option>{organizationalUnits.map((unit) => <option key={unit.code} value={unit.code}>{unit.name}</option>)}</select></label>
              <label className="field">Position<input value={editForm.positionTitle} onChange={(event) => setEditForm({ ...editForm, positionTitle: event.target.value })} /></label>
              <label className="field full">Office<input value={editForm.officeName} onChange={(event) => setEditForm({ ...editForm, officeName: event.target.value })} /></label>
            </>
          ) : null}
        </div>
        {selectedUser?.student ? (
          <div className="notice" style={{ marginTop: 12 }}>
            Student academic fields are intentionally read only here. Registrar and Academic Coordinator business data is outside System Administrator account editing.
          </div>
        ) : null}
      </Modal>

      <Modal
        open={passwordOpen}
        title="Reset Password"
        onClose={() => setPasswordOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPasswordOpen(false)}>Cancel</Button>
            <Button disabled={isPending} onClick={() => run(async () => {
              const result = await resetUserPassword({
                userId: selectedUser?.id,
                temporaryPassword: passwordForm.temporaryPassword,
              });
              if (result?.ok) {
                setPasswordOpen(false);
                setSelectedUser(null);
              }
              return result;
            })}>Set Temporary Password</Button>
          </>
        }
      >
        <label className="field full">
          New Temporary Password
          <input type="password" minLength={12} autoComplete="new-password" value={passwordForm.temporaryPassword} onChange={(event) => setPasswordForm({ temporaryPassword: event.target.value })} />
        </label>
        <div className="notice" style={{ marginTop: 12 }}>
          The new password is written only to Supabase Auth. Communicate it to the user through an approved secure channel.
        </div>
      </Modal>

      <Modal
        open={roleChangeOpen}
        title="Change Staff Role"
        onClose={() => setRoleChangeOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRoleChangeOpen(false)}>Cancel</Button>
            <Button disabled={isPending} onClick={() => run(async () => {
              const result = await changeUserRole({
                userId: selectedUser?.id,
                roleCode: roleChangeCode,
              });
              if (result?.ok) {
                setRoleChangeOpen(false);
                setSelectedUser(null);
              }
              return result;
            })}>Save Role</Button>
          </>
        }
      >
        <label className="field full">
          Assigned Staff Role
          <select value={roleChangeCode} onChange={(event) => setRoleChangeCode(event.target.value)}>
            {staffRoleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
          </select>
        </label>
        <div className="notice" style={{ marginTop: 12 }}>
          Student accounts are not converted to staff roles here because that would cross the technical and academic record boundary.
        </div>
      </Modal>

      <Modal
        open={Boolean(selectedRole)}
        title={selectedRole ? `${selectedRole.name} Role` : "Role Details"}
        onClose={() => setSelectedRole(null)}
        footer={selectedRole ? (
          <>
            <Button variant="ghost" onClick={() => setSelectedRole(null)}>Close</Button>
            <Button variant="secondary" onClick={() => setRoleDescriptionOpen(true)}>Edit Description</Button>
          </>
        ) : null}
      >
        {selectedRole ? (
          <Details items={[
            ["Role Code", selectedRole.code],
            ["Role Name", selectedRole.name],
            ["Default Redirect", selectedRole.default_redirect_path],
            ["Users", selectedRole.userCount],
            ["Status", selectedRole.is_active ? "Active" : "Inactive"],
            ["Description", selectedRole.description],
          ]} />
        ) : null}
      </Modal>

      <Modal
        open={roleDescriptionOpen}
        title="Edit Role Description"
        onClose={() => setRoleDescriptionOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRoleDescriptionOpen(false)}>Cancel</Button>
            <Button disabled={isPending} onClick={() => run(async () => {
              const result = await updateRoleDescription({
                roleCode: selectedRole?.code,
                description: roleDescription,
              });
              if (result?.ok) {
                setRoleDescriptionOpen(false);
                setSelectedRole(null);
              }
              return result;
            })}>Save Description</Button>
          </>
        }
      >
        <label className="field full">
          Description
          <textarea value={roleDescription} onChange={(event) => setRoleDescription(event.target.value)} />
        </label>
      </Modal>

      <Modal
        open={Boolean(selectedPermission)}
        title={selectedPermission ? selectedPermission.name : "Permission Details"}
        onClose={() => setSelectedPermission(null)}
        className="system-admin-detail-modal"
        footer={<Button onClick={() => setSelectedPermission(null)}>Close</Button>}
      >
        {selectedPermission ? (
          <>
            <Details items={[
              ["Permission Code", selectedPermission.code],
              ["Description", selectedPermission.description],
            ]} />
            <div className="list-stack" style={{ marginTop: 14 }}>
              {roles.map((role) => {
                const assigned = rolePermissions.some(
                  (item) =>
                    item.role_code === role.code &&
                    item.permission_code === selectedPermission.code,
                );
                const authorized =
                  AUTHORIZED_ROLE_PERMISSIONS[role.code]?.has(
                    selectedPermission.code,
                  ) ?? false;
                const recoveryProtected =
                  role.code === "system-administrator" &&
                  selectedPermission.code === "system.permissions_manage" &&
                  assigned;

                return (
                  <div className="list-item" key={role.code}>
                    <div className="list-item-header">
                      <div>
                        <strong>{role.name}</strong>
                        <p>
                          {!authorized
                            ? "Not authorized for this role"
                            : assigned
                              ? "Permission enabled"
                              : "Permission disabled"}
                        </p>
                      </div>
                      <Button
                        variant={assigned ? "danger" : "secondary"}
                        disabled={
                          isPending ||
                          !authorized ||
                          recoveryProtected
                        }
                        title={
                          recoveryProtected
                            ? "This capability is protected to preserve permission recovery."
                            : !authorized
                              ? "This permission is outside the approved role boundary."
                              : undefined
                        }
                        onClick={() => run(async () => {
                          const result = await setRolePermission({
                            roleCode: role.code,
                            permissionCode: selectedPermission.code,
                            enabled: !assigned,
                          });
                          if (result?.ok) setSelectedPermission(null);
                          return result;
                        })}
                      >
                        {assigned ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(selectedActivity)}
        title="Access Activity Details"
        onClose={() => setSelectedActivity(null)}
        className="system-admin-detail-modal"
        footer={<Button onClick={() => setSelectedActivity(null)}>Close</Button>}
      >
        {selectedActivity ? (
          <Details items={[
            ["Audit ID", selectedActivity.id],
            ["Date and Time", selectedActivity.occurredAtLabel],
            ["Actor", selectedActivity.actor_label || "System"],
            ["Module", selectedActivity.module],
            ["Action", selectedActivity.action],
            ["Entity Type", selectedActivity.entity_type],
            ["Entity Key", selectedActivity.entity_key],
            ["Previous Value", selectedActivity.previous_value],
            ["New Value", selectedActivity.new_value],
            ["Result", selectedActivity.result],
            ["Reason", selectedActivity.reason],
            ["IP Address", selectedActivity.ip_address],
          ]} />
        ) : null}
      </Modal>
    </>
  );
}
