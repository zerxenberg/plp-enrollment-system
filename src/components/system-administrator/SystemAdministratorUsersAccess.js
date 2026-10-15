
"use client";

import { useMemo, useState } from "react";
import {
  Button,
  DataTable,
  FilterControl,
  Modal,
  PageHeader,
  SearchControl,
  StatusBadge,
} from "@/components/ui/PortalUI";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";
import { Details, Feedback, Info, Panel, Tabs } from "@/components/registrar/RegistrarShared";
import { departmentName } from "@/features/academic/academic-reference";

const TABS = [
  { value: "Users", label: "Users" },
  { value: "Roles", label: "Roles" },
  { value: "Permissions", label: "Permissions" },
  { value: "Access Activity", label: "Access Activity" },
];

const ALL = "ALL";

const ROLE_DESCRIPTIONS = {
  Student: "Student self service and access to the student's own permitted records.",
  Registrar: "Official enrollment processing, student record administration, and enrollment confirmation.",
  "Academic Coordinator": "Academic setup, planning, schedules, capacity, and defined academic exception decisions.",
  "System Administrator": "Technical access, integration, security, maintenance, permissions, and monitoring.",
};

const PERMISSION_ROWS = [
  { module: "Student Self Service", student: "Own records", registrar: "Limited operational access", coordinator: "No", administrator: "No" },
  { module: "Enrollment Administration", student: "No", registrar: "Yes", coordinator: "Limited academic review", administrator: "No" },
  { module: "Academic Setup", student: "No", registrar: "Reference or authorized", coordinator: "Yes", administrator: "No" },
  { module: "System Integration", student: "No", registrar: "Limited view if approved", coordinator: "No", administrator: "Full technical access" },
  { module: "Users & Access", student: "No", registrar: "No", coordinator: "No", administrator: "Yes" },
  { module: "System Administration", student: "No", registrar: "No", coordinator: "No", administrator: "Yes" },
  { module: "Technical Audit Logs", student: "No", registrar: "No", coordinator: "No", administrator: "Yes" },
];

const ACCESS_ACTIVITY = [
  { id: "ACC-001", user: "Adrian Reyes", role: "System Administrator", lastLogin: "Oct 7, 2026 · 5:52 PM", accountStatus: "Active", recentLoginResult: "Successful", recentAccountChange: "None", source: "Staff Login" },
  { id: "ACC-002", user: "Maria Santos", role: "Registrar", lastLogin: "Oct 7, 2026 · 5:31 PM", accountStatus: "Active", recentLoginResult: "Successful", recentAccountChange: "Password reset · Oct 2", source: "Staff Login" },
  { id: "ACC-003", user: "Elena Cruz", role: "Academic Coordinator", lastLogin: "Oct 7, 2026 · 4:55 PM", accountStatus: "Active", recentLoginResult: "Successful", recentAccountChange: "None", source: "Staff Login" },
  { id: "ACC-004", user: "Unknown account", role: "Unknown", lastLogin: "Oct 7, 2026 · 5:21 PM", accountStatus: "Unknown", recentLoginResult: "Failed", recentAccountChange: "No account change", source: "Staff Login" },
];

function normalizeStatus(value) {
  return String(value || "").toUpperCase() === "ACTIVE" || value === "Active" ? "Active" : "Inactive";
}

function distinctOptions(values, allLabel) {
  return [
    { value: ALL, label: allLabel },
    ...[...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)))
      .map((value) => ({ value, label: value })),
  ];
}

export default function SystemAdministratorUsersAccess() {
  const { student, registrar, catalog, systemAdministrators, academicCoordinators } = useDemoData();
  const [activeTab, setActiveTab] = useState("Users");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState(ALL);
  const [accountStatus, setAccountStatus] = useState(ALL);
  const [college, setCollege] = useState(ALL);
  const [program, setProgram] = useState(ALL);
  const [yearLevel, setYearLevel] = useState(ALL);
  const [enrollmentStatus, setEnrollmentStatus] = useState(ALL);
  const [office, setOffice] = useState(ALL);
  const [department, setDepartment] = useState(ALL);
  const [position, setPosition] = useState(ALL);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedPermission, setSelectedPermission] = useState(null);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [message, setMessage] = useState("");

  const programByCode = useMemo(
    () => new Map((catalog.programs || []).map((item) => [item.code, item])),
    [catalog.programs],
  );

  const users = useMemo(() => {
    const students = registrar.students.map((item) => {
      const programRecord = programByCode.get(item.program);
      const departmentId = item.department || programRecord?.department || "";
      const isCurrentStudent = item.studentNumber === student.profile.studentNumber;

      return {
        userId: item.studentNumber,
        fullName: item.fullName,
        username: item.studentNumber,
        email: item.email,
        assignedRole: "Student",
        accountStatus: normalizeStatus(item.accountStatus || item.studentStatus),
        lastLogin: isCurrentStudent ? "Current demo session available" : "Not recorded",
        dateCreated: "Not recorded",
        organization: departmentName(departmentId, catalog.departments),
        college: departmentName(departmentId, catalog.departments),
        departmentId,
        program: item.program,
        yearLevel: item.yearLevel || (isCurrentStudent ? student.profile.yearLevel : "Not recorded"),
        studentType: item.studentType || (isCurrentStudent ? student.profile.studentType : "Not recorded"),
        academicClassification: item.academicClassification || (isCurrentStudent ? student.profile.academicClassification : "Not recorded"),
        studentStatus: item.studentStatus,
        enrollmentStatus: item.enrollmentStatus,
        academicTerm: item.academicTerm,
      };
    });

    const registrarUser = {
      userId: registrar.registrar.accountId,
      fullName: registrar.registrar.fullName,
      username: "registrar.demo",
      email: registrar.registrar.email,
      assignedRole: "Registrar",
      accountStatus: normalizeStatus(registrar.registrar.accountStatus),
      lastLogin: "Not recorded",
      dateCreated: "Not recorded",
      organization: registrar.registrar.office,
      office: registrar.registrar.office,
    };

    const coordinators = academicCoordinators.map((item) => ({
      ...item,
      organization: item.department,
    }));

    const administrators = systemAdministrators.map((item) => ({
      ...item,
      organization: item.department,
    }));

    return [...students, registrarUser, ...coordinators, ...administrators];
  }, [academicCoordinators, catalog.departments, programByCode, registrar, student, systemAdministrators]);

  const roleOptions = [
    { value: ALL, label: "All Roles" },
    ...Object.keys(ROLE_DESCRIPTIONS).map((value) => ({ value, label: value })),
  ];

  const filteredUsers = users.filter((item) => {
    const searchable = `${item.userId} ${item.fullName} ${item.username || ""} ${item.email || ""} ${item.assignedRole} ${item.organization || ""}`.toLowerCase();
    if (!searchable.includes(search.toLowerCase())) return false;
    if (roleFilter !== ALL && item.assignedRole !== roleFilter) return false;
    if (accountStatus !== ALL && item.accountStatus !== accountStatus) return false;

    if (roleFilter === "Student") {
      if (college !== ALL && item.college !== college) return false;
      if (program !== ALL && item.program !== program) return false;
      if (yearLevel !== ALL && item.yearLevel !== yearLevel) return false;
      if (enrollmentStatus !== ALL && item.enrollmentStatus !== enrollmentStatus) return false;
    }

    if (roleFilter === "Registrar" && office !== ALL && item.office !== office) return false;

    if (roleFilter === "Academic Coordinator") {
      if (department !== ALL && item.department !== department) return false;
      if (position !== ALL && item.position !== position) return false;
    }

    if (roleFilter === "System Administrator") {
      if (department !== ALL && item.department !== department) return false;
      if (position !== ALL && item.position !== position) return false;
    }

    return true;
  });

  const roleRows = Object.keys(ROLE_DESCRIPTIONS).map((role) => ({
    id: `ROLE-${role.toUpperCase().replaceAll(" ", "-")}`,
    roleName: role,
    description: ROLE_DESCRIPTIONS[role],
    users: users.filter((item) => item.assignedRole === role).length,
    status: "Active",
  }));

  function resetRoleSpecificFilters(nextRole) {
    setRoleFilter(nextRole);
    setCollege(ALL);
    setProgram(ALL);
    setYearLevel(ALL);
    setEnrollmentStatus(ALL);
    setOffice(ALL);
    setDepartment(ALL);
    setPosition(ALL);
  }

  function changeTab(next) {
    setActiveTab(next);
    setSearch("");
    setAccountStatus(ALL);
    resetRoleSpecificFilters(ALL);
    setMessage("");
    setSelectedRecord(null);
    setSelectedRole(null);
    setSelectedPermission(null);
    setSelectedActivity(null);
  }

  const userColumns = [
    { key: "userId", label: "User / Account ID" },
    { key: "fullName", label: "Name" },
    { key: "assignedRole", label: "Role" },
    { key: "organization", label: "College / Office / Department" },
    { key: "accountStatus", label: "Status", render: (row) => <StatusBadge value={row.accountStatus === "Active" ? "ACTIVE" : "INACTIVE"} label={row.accountStatus} /> },
    { key: "lastLogin", label: "Last Login" },
  ];

  return (
    <>
      <PageHeader
        title="Users & Access"
        description="Search and manage account access without mixing System Administrator controls with academic or enrollment records."
        actions={<Button onClick={() => setCreateOpen(true)}>Create User</Button>}
      />

      <Tabs
        items={TABS}
        selected={activeTab}
        onSelect={changeTab}
        label="Users and access sections"
        title="Access Administration"
        subtitle="Tables are intentionally concise. Select a row to open the complete record in a modal."
      >
        <Feedback message={message} />

        {activeTab === "Users" ? (
          <>
            <div className="toolbar">
              <SearchControl value={search} onChange={setSearch} label="Search users" placeholder="Search ID, name, email, role, or organization" />
              <FilterControl label="Role" value={roleFilter} onChange={resetRoleSpecificFilters} options={roleOptions} />
              <FilterControl
                label="Account Status"
                value={accountStatus}
                onChange={setAccountStatus}
                options={[
                  { value: ALL, label: "All Account Statuses" },
                  { value: "Active", label: "Active" },
                  { value: "Inactive", label: "Inactive" },
                ]}
              />
              {roleFilter !== ALL || accountStatus !== ALL || search ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearch("");
                    setAccountStatus(ALL);
                    resetRoleSpecificFilters(ALL);
                  }}
                >
                  Clear Filters
                </Button>
              ) : null}
            </div>

            <div className="system-admin-dynamic-filters" key={roleFilter}>
              {roleFilter === ALL ? (
                <div className="summary-strip" role="status">
                  <span><strong>{filteredUsers.length}</strong> of {users.length} directory records</span>
                  <span>Select a role to reveal the most useful role specific filters.</span>
                </div>
              ) : null}

              {roleFilter === "Student" ? (
                <div className="toolbar">
                  <FilterControl label="College" value={college} onChange={setCollege} options={distinctOptions(users.filter((item) => item.assignedRole === "Student").map((item) => item.college), "All Colleges")} />
                  <FilterControl label="Program" value={program} onChange={setProgram} options={distinctOptions(users.filter((item) => item.assignedRole === "Student").map((item) => item.program), "All Programs")} />
                  <FilterControl label="Year Level" value={yearLevel} onChange={setYearLevel} options={distinctOptions(users.filter((item) => item.assignedRole === "Student").map((item) => item.yearLevel), "All Year Levels")} />
                  <FilterControl label="Enrollment Status" value={enrollmentStatus} onChange={setEnrollmentStatus} options={distinctOptions(users.filter((item) => item.assignedRole === "Student").map((item) => item.enrollmentStatus), "All Enrollment Statuses")} />
                </div>
              ) : null}

              {roleFilter === "Registrar" ? (
                <div className="toolbar">
                  <FilterControl label="Registrar Office" value={office} onChange={setOffice} options={distinctOptions(users.filter((item) => item.assignedRole === "Registrar").map((item) => item.office), "All Offices")} />
                </div>
              ) : null}

              {["Academic Coordinator", "System Administrator"].includes(roleFilter) ? (
                <div className="toolbar">
                  <FilterControl label="Department" value={department} onChange={setDepartment} options={distinctOptions(users.filter((item) => item.assignedRole === roleFilter).map((item) => item.department), "All Departments")} />
                  <FilterControl label="Position" value={position} onChange={setPosition} options={distinctOptions(users.filter((item) => item.assignedRole === roleFilter).map((item) => item.position), "All Positions")} />
                </div>
              ) : null}
            </div>

            <DataTable
              columns={userColumns}
              rows={filteredUsers}
              rowKey="userId"
              onRowClick={setSelectedRecord}
              getRowAriaLabel={(row) => `View ${row.fullName} account details`}
              emptyMessage="No users match the selected filters."
            />
          </>
        ) : null}

        {activeTab === "Roles" ? (
          <DataTable
            columns={[
              { key: "roleName", label: "Role" },
              { key: "users", label: "Directory Records" },
              { key: "status", label: "Status", render: (row) => <StatusBadge value="ACTIVE" label={row.status} /> },
            ]}
            rows={roleRows}
            rowKey="id"
            onRowClick={setSelectedRole}
            getRowAriaLabel={(row) => `View ${row.roleName} role details`}
          />
        ) : null}

        {activeTab === "Permissions" ? (
          <DataTable
            rowKey="module"
            rows={PERMISSION_ROWS}
            onRowClick={setSelectedPermission}
            getRowAriaLabel={(row) => `View permissions for ${row.module}`}
            columns={[
              { key: "module", label: "Module" },
              { key: "student", label: "Student" },
              { key: "registrar", label: "Registrar" },
              { key: "coordinator", label: "Academic Coordinator" },
              { key: "administrator", label: "System Administrator" },
            ]}
          />
        ) : null}

        {activeTab === "Access Activity" ? (
          <>
            <div className="toolbar">
              <SearchControl
                value={search}
                onChange={setSearch}
                label="Search access activity"
                placeholder="Search user, role, result, or account change"
              />
              <FilterControl
                label="Role"
                value={roleFilter}
                onChange={resetRoleSpecificFilters}
                options={[
                  { value: ALL, label: "All Roles" },
                  ...[...new Set(ACCESS_ACTIVITY.map((item) => item.role))]
                    .map((value) => ({ value, label: value })),
                ]}
              />
            </div>
            <DataTable
              columns={[
                { key: "user", label: "User" },
                { key: "role", label: "Role" },
                { key: "lastLogin", label: "Last Login" },
                { key: "recentLoginResult", label: "Login Result", render: (row) => <StatusBadge value={row.recentLoginResult === "Successful" ? "COMPLETED" : "FAILED"} label={row.recentLoginResult} /> },
                { key: "accountStatus", label: "Account Status", render: (row) => <StatusBadge value={row.accountStatus} label={row.accountStatus} /> },
              ]}
              rows={ACCESS_ACTIVITY.filter((item) =>
                `${item.user} ${item.role} ${item.recentLoginResult} ${item.recentAccountChange}`.toLowerCase().includes(search.toLowerCase()) &&
                (roleFilter === ALL || item.role === roleFilter)
              )}
              rowKey="id"
              onRowClick={setSelectedActivity}
              getRowAriaLabel={(row) => `View access activity for ${row.user}`}
            />
          </>
        ) : null}
      </Tabs>

      <Modal
        open={Boolean(selectedRecord)}
        title={selectedRecord ? `${selectedRecord.fullName} · ${selectedRecord.assignedRole}` : "User Details"}
        onClose={() => setSelectedRecord(null)}
        className="system-admin-detail-modal"
        footer={
          selectedRecord ? (
            <>
              <Button variant="ghost" onClick={() => setSelectedRecord(null)}>Close</Button>
              <Button variant="secondary" onClick={() => {
                setMessage(`Reset password prepared for ${selectedRecord.fullName} in mock mode.`);
                setSelectedRecord(null);
              }}>Reset Password</Button>
              <Button variant="secondary" onClick={() => {
                setMessage(`Role change prepared for ${selectedRecord.fullName} in mock mode.`);
                setSelectedRecord(null);
              }}>Change Role</Button>
              <Button onClick={() => {
                setMessage(`${selectedRecord.accountStatus === "Active" ? "Deactivate" : "Activate"} prepared for ${selectedRecord.fullName} in mock mode.`);
                setSelectedRecord(null);
              }}>
                {selectedRecord.accountStatus === "Active" ? "Deactivate" : "Activate"}
              </Button>
            </>
          ) : null
        }
      >
        {selectedRecord ? (
          <>
            <div className="info-grid">
              <Info label="User / Account ID" value={selectedRecord.userId} />
              <Info label="Full Name" value={selectedRecord.fullName} />
              <Info label="Role" value={selectedRecord.assignedRole} />
              <div className="info-item"><span>Account Status</span><strong><StatusBadge value={selectedRecord.accountStatus === "Active" ? "ACTIVE" : "INACTIVE"} label={selectedRecord.accountStatus} /></strong></div>
              <Info label="Username" value={selectedRecord.username} />
              <Info label="Email" value={selectedRecord.email} />
              <Info label="Organization" value={selectedRecord.organization} />
              <Info label="Last Login" value={selectedRecord.lastLogin} />
            </div>

            {selectedRecord.assignedRole === "Student" ? (
              <div style={{ marginTop: 14 }}>
                <Details
                  items={[
                    ["College", selectedRecord.college],
                    ["Program", selectedRecord.program],
                    ["Year Level", selectedRecord.yearLevel],
                    ["Student Type", selectedRecord.studentType],
                    ["Academic Classification", selectedRecord.academicClassification],
                    ["Student Status", selectedRecord.studentStatus],
                    ["Enrollment Status", selectedRecord.enrollmentStatus],
                    ["Academic Term", selectedRecord.academicTerm],
                  ]}
                />
              </div>
            ) : null}

            {selectedRecord.assignedRole === "Registrar" ? (
              <div style={{ marginTop: 14 }}>
                <Details items={[["Office", selectedRecord.office]]} />
              </div>
            ) : null}

            {["Academic Coordinator", "System Administrator"].includes(selectedRecord.assignedRole) ? (
              <div style={{ marginTop: 14 }}>
                <Details
                  items={[
                    ["Employee ID", selectedRecord.employeeId],
                    ["Department", selectedRecord.department],
                    ["Position", selectedRecord.position],
                    ["Date Created", selectedRecord.dateCreated],
                  ]}
                />
              </div>
            ) : null}

            <div className="notice" style={{ marginTop: 14 }}>
              Account actions never edit Student academic records, Registrar enrollment decisions, or Academic Coordinator academic configuration.
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(selectedRole)}
        title={selectedRole ? `${selectedRole.roleName} Role` : "Role Details"}
        onClose={() => setSelectedRole(null)}
        className="system-admin-detail-modal"
        footer={<Button onClick={() => setSelectedRole(null)}>Close</Button>}
      >
        {selectedRole ? (
          <>
            <Details
              items={[
                ["Role Name", selectedRole.roleName],
                ["Directory Records", selectedRole.users],
                ["Role Status", selectedRole.status],
                ["Description", selectedRole.description],
              ]}
            />
            <div className="notice" style={{ marginTop: 14 }}>
              Role boundaries remain predefined. Permission changes must later be enforced by trusted backend rules, not only frontend visibility.
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(selectedPermission)}
        title={selectedPermission ? `${selectedPermission.module} Permissions` : "Permission Details"}
        onClose={() => setSelectedPermission(null)}
        className="system-admin-detail-modal"
        footer={<Button onClick={() => setSelectedPermission(null)}>Close</Button>}
      >
        {selectedPermission ? (
          <Details
            items={[
              ["Student", selectedPermission.student],
              ["Registrar", selectedPermission.registrar],
              ["Academic Coordinator", selectedPermission.coordinator],
              ["System Administrator", selectedPermission.administrator],
            ]}
          />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(selectedActivity)}
        title={selectedActivity ? `${selectedActivity.user} · Access Activity` : "Access Activity"}
        onClose={() => setSelectedActivity(null)}
        className="system-admin-detail-modal"
        footer={<Button onClick={() => setSelectedActivity(null)}>Close</Button>}
      >
        {selectedActivity ? (
          <Details
            items={[
              ["User", selectedActivity.user],
              ["Role", selectedActivity.role],
              ["Last Login", selectedActivity.lastLogin],
              ["Account Status", selectedActivity.accountStatus],
              ["Recent Login Result", selectedActivity.recentLoginResult],
              ["Recent Account Change", selectedActivity.recentAccountChange],
              ["Source", selectedActivity.source],
            ]}
          />
        ) : null}
      </Modal>

      <Modal
        open={createOpen}
        title="Create User Account"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => { setCreateOpen(false); setMessage("Mock user account created. Persistent account creation will move to Supabase when connected."); }}>Create Account</Button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field"><span>Full Name</span><input placeholder="Enter full name" /></label>
          <label className="field"><span>Username or Account ID</span><input placeholder="Enter username or ID" /></label>
          <label className="field">
            <span>Assigned Role</span>
            <select defaultValue="Student">
              {Object.keys(ROLE_DESCRIPTIONS).map((role) => <option key={role}>{role}</option>)}
            </select>
          </label>
          <label className="field"><span>Initial Account Status</span><select defaultValue="Active"><option>Active</option><option>Inactive</option></select></label>
          <label className="field full"><span>Password Setup Method</span><input defaultValue="Temporary password to be changed by user" /></label>
        </div>
      </Modal>
    </>
  );
}
