
"use client";

import { useMemo, useState } from "react";
import { Button, Card, DataTable, InternalTabs, Modal, PageHeader, SearchControl, StatusBadge, TableActionButton } from "@/components/ui/PortalUI";
import { useDemoData } from "@/features/demo-data/DemoDataProvider";

const TABS = ["Users", "Roles", "Permissions", "Access Activity"];

const BASE_USERS = [
  { userId: "USR-STU-001", fullName: "Juan Dela Cruz", username: "2024-00123", assignedRole: "Student", accountStatus: "Active", lastLogin: "Oct 7, 2026 · 5:46 PM", dateCreated: "Jun 10, 2024" },
  { userId: "USR-REG-001", fullName: "Maria Santos", username: "registrar.demo", assignedRole: "Registrar", accountStatus: "Active", lastLogin: "Oct 7, 2026 · 5:31 PM", dateCreated: "Jun 3, 2025" },
  { userId: "USR-AC-001", fullName: "Elena Cruz", username: "academic.coordinator.demo", assignedRole: "Academic Coordinator", accountStatus: "Active", lastLogin: "Oct 7, 2026 · 4:55 PM", dateCreated: "Jul 8, 2025" },
];

const ROLE_ROWS = [
  { id: "ROLE-STUDENT", roleName: "Student", description: "Student self service and own record access.", users: 1, status: "Active" },
  { id: "ROLE-REGISTRAR", roleName: "Registrar", description: "Official enrollment processing and student record administration.", users: 1, status: "Active" },
  { id: "ROLE-COORDINATOR", roleName: "Academic Coordinator", description: "Academic setup, planning, and defined academic exception decisions.", users: 1, status: "Active" },
  { id: "ROLE-SYSADMIN", roleName: "System Administrator", description: "Technical access, integration, security, maintenance, and monitoring.", users: 5, status: "Active" },
];

const ACCESS_ACTIVITY = [
  { id: "ACC-001", user: "Adrian Reyes", role: "System Administrator", lastLogin: "Oct 7, 2026 · 5:52 PM", accountStatus: "Active", recentLoginResult: "Successful", recentAccountChange: "None" },
  { id: "ACC-002", user: "Maria Santos", role: "Registrar", lastLogin: "Oct 7, 2026 · 5:31 PM", accountStatus: "Active", recentLoginResult: "Successful", recentAccountChange: "Password reset · Oct 2" },
  { id: "ACC-003", user: "Elena Cruz", role: "Academic Coordinator", lastLogin: "Oct 7, 2026 · 4:55 PM", accountStatus: "Active", recentLoginResult: "Successful", recentAccountChange: "None" },
];

export default function SystemAdministratorUsersAccess() {
  const { systemAdministrators } = useDemoData();
  const [activeTab, setActiveTab] = useState("Users");
  const [search, setSearch] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const users = useMemo(
    () => [
      ...BASE_USERS,
      ...systemAdministrators.map((item) => ({
        userId: item.userId,
        fullName: item.fullName,
        username: item.username,
        assignedRole: item.assignedRole,
        accountStatus: item.accountStatus,
        lastLogin: item.lastLogin,
        dateCreated: item.dateCreated,
      })),
    ],
    [systemAdministrators],
  );

  const filteredUsers = users.filter((item) =>
    `${item.userId} ${item.fullName} ${item.username} ${item.assignedRole}`.toLowerCase().includes(search.toLowerCase())
  );

  const userColumns = [
    { key: "userId", label: "User ID" },
    { key: "fullName", label: "Full Name" },
    { key: "username", label: "Username" },
    { key: "assignedRole", label: "Assigned Role" },
    { key: "accountStatus", label: "Account Status", render: (row) => <StatusBadge value={row.accountStatus === "Active" ? "ACTIVE" : "INACTIVE"} label={row.accountStatus} /> },
    { key: "lastLogin", label: "Last Login" },
    { key: "dateCreated", label: "Date Created" },
    { key: "actions", label: "Actions", render: (row) => <TableActionButton tone="view" onClick={() => setActionMessage(`Viewing ${row.fullName}.`)}>View User</TableActionButton> },
  ];

  return (
    <>
      <PageHeader
        title="Users & Access"
        description="Manage login accounts, predefined roles, permissions, account status, and access activity without editing academic records."
        actions={<Button onClick={() => setCreateOpen(true)}>Create User</Button>}
      />

      <InternalTabs items={TABS.map((value) => ({ value, label: value }))} selected={activeTab} onSelect={setActiveTab} label="Users and access sections">

      {actionMessage ? <div className="notice" style={{ marginBottom: 14 }}>{actionMessage}</div> : null}

      {activeTab === "Users" ? (
        <Card className="section-card">
          <div className="section-header"><h2>User Account Management</h2></div>
          <div className="toolbar">
            <SearchControl value={search} onChange={setSearch} placeholder="Search user, username, role, or ID" />
          </div>
          <DataTable columns={userColumns} rows={filteredUsers} rowKey="userId" />
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setActionMessage("Edit Account selected in mock mode.")}>Edit Account</Button>
            <Button variant="secondary" onClick={() => setActionMessage("Reset Password selected in mock mode.")}>Reset Password</Button>
            <Button variant="secondary" onClick={() => setActionMessage("Activate selected in mock mode.")}>Activate</Button>
            <Button variant="secondary" onClick={() => setActionMessage("Deactivate selected in mock mode.")}>Deactivate</Button>
            <Button variant="secondary" onClick={() => setActionMessage("Change Role selected in mock mode.")}>Change Role</Button>
            <Button variant="secondary" onClick={() => setActionMessage("Account History opened in mock mode.")}>View Account History</Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "Roles" ? (
        <Card className="section-card">
          <div className="section-header"><div><h2>Role Management</h2><p>The four approved project roles remain predefined.</p></div></div>
          <DataTable
            columns={[
              { key: "roleName", label: "Role Name" },
              { key: "description", label: "Description" },
              { key: "users", label: "Number of Users" },
              { key: "status", label: "Status", render: (row) => <StatusBadge value="ACTIVE" label={row.status} /> },
            ]}
            rows={ROLE_ROWS}
            rowKey="id"
          />
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setActionMessage("View Role selected in mock mode.")}>View Role</Button>
            <Button variant="secondary" onClick={() => setActionMessage("Edit Role Description selected in mock mode.")}>Edit Role Description</Button>
            <Button variant="secondary" onClick={() => setActiveTab("Permissions")}>View Permissions</Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "Permissions" ? (
        <Card className="section-card">
          <div className="section-header"><div><h2>Permission Matrix</h2><p>Frontend visibility does not replace trusted backend permission checks.</p></div></div>
          <DataTable
            rowKey="module"
            rows={[
              { module: "Student Self Service", student: "Own records", registrar: "Limited operational access", coordinator: "No", administrator: "No" },
              { module: "Enrollment Administration", student: "No", registrar: "Yes", coordinator: "Limited academic review", administrator: "No" },
              { module: "Academic Setup", student: "No", registrar: "Reference or authorized", coordinator: "Yes", administrator: "No" },
              { module: "System Integration", student: "No", registrar: "Limited view if approved", coordinator: "No", administrator: "Full technical access" },
              { module: "Users & Access", student: "No", registrar: "No", coordinator: "No", administrator: "Yes" },
              { module: "System Administration", student: "No", registrar: "No", coordinator: "No", administrator: "Yes" },
              { module: "Technical Audit Logs", student: "No", registrar: "No", coordinator: "No", administrator: "Yes" },
            ]}
            columns={[
              { key: "module", label: "Module" },
              { key: "student", label: "Student" },
              { key: "registrar", label: "Registrar" },
              { key: "coordinator", label: "Academic Coordinator" },
              { key: "administrator", label: "System Administrator" },
            ]}
          />
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setActionMessage("Permission details opened.")}>View Permission</Button>
            <Button variant="secondary" onClick={() => setActionMessage("Authorized permission enabled in mock mode.")}>Enable Authorized Permission</Button>
            <Button variant="secondary" onClick={() => setActionMessage("Permission disabled in mock mode.")}>Disable Permission</Button>
            <Button onClick={() => setActionMessage("Permission changes saved in mock mode.")}>Save Changes</Button>
            <Button variant="secondary" onClick={() => setActionMessage("Permission history opened.")}>View Permission History</Button>
          </div>
        </Card>
      ) : null}

      {activeTab === "Access Activity" ? (
        <Card className="section-card">
          <div className="section-header"><h2>User Access Activity</h2></div>
          <DataTable
            columns={[
              { key: "user", label: "User" },
              { key: "role", label: "Role" },
              { key: "lastLogin", label: "Last Login" },
              { key: "accountStatus", label: "Account Status", render: (row) => <StatusBadge value={row.accountStatus} label={row.accountStatus} /> },
              { key: "recentLoginResult", label: "Recent Login Result", render: (row) => <StatusBadge value={row.recentLoginResult === "Successful" ? "COMPLETED" : "FAILED"} label={row.recentLoginResult} /> },
              { key: "recentAccountChange", label: "Recent Account Change" },
            ]}
            rows={ACCESS_ACTIVITY}
            rowKey="id"
          />
          <div className="action-row" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={() => setActionMessage("Account opened in mock mode.")}>View Account</Button>
            <Button variant="secondary" onClick={() => setActionMessage("Related security event opened.")}>View Related Security Event</Button>
          </div>
        </Card>
      ) : null}
      </InternalTabs>

      <Modal
        open={createOpen}
        title="Create User Account"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => { setCreateOpen(false); setActionMessage("Mock user account created. No persistent data was changed."); }}>Create Account</Button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field"><span>Full Name</span><input placeholder="Enter full name" /></label>
          <label className="field"><span>Username or Account ID</span><input placeholder="Enter username or ID" /></label>
          <label className="field">
            <span>Assigned Role</span>
            <select defaultValue="Student">
              <option>Student</option>
              <option>Registrar</option>
              <option>Academic Coordinator</option>
              <option>System Administrator</option>
            </select>
          </label>
          <label className="field"><span>Initial Account Status</span><select defaultValue="Active"><option>Active</option><option>Inactive</option></select></label>
          <label className="field full"><span>Password Setup Method</span><input defaultValue="Temporary password to be changed by user" /></label>
        </div>
      </Modal>
    </>
  );
}
