"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button, DataTable, EmptyState, FilterControl, Modal, SearchControl,
  StatusBadge, TableActions, TablePagination,
} from "@/components/ui/PortalUI";
import { Panel } from "./RegistrarShared";
import { performRegistrarProjectSimulationAction } from "@/features/academic/registrar-project-simulations";

const PAGE_SIZE = 20;
const STATUSES = [
  { value: "ALL", label: "All project statuses" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "VALIDATED", label: "Validated" },
  { value: "RETURNED", label: "Returned" },
  { value: "CONFIRMED_SIMULATION", label: "Confirmed simulation" },
  { value: "DRAFT", label: "Draft" },
];

const LABELS = {
  SUBMITTED: "Submitted (simulation)",
  VALIDATED: "Validated (simulation)",
  RETURNED: "Returned (simulation)",
  CONFIRMED_SIMULATION: "Confirmed simulation",
  DRAFT: "Draft (simulation)",
};

function readableDate(value) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : parsed.toLocaleString();
}

export default function RegistrarProjectSimulationQueue({ queue }) {
  const router = useRouter();
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState("");

  const rows = Array.isArray(queue?.records) ? queue.records : [];
  const filtered = rows.filter((row) =>
    (filter === "ALL" || row.status === filter) &&
    `${row.studentNumber} ${row.studentName} ${row.term}`
      .toLowerCase().includes(search.trim().toLowerCase()),
  );
  const safePage = Math.max(1, Math.min(page, Math.ceil(filtered.length / PAGE_SIZE) || 1));
  const visibleRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function performAction(row, action, explanation = "") {
    if (working) return;
    setWorking(true);
    setFeedback("");
    try {
      const result = await performRegistrarProjectSimulationAction(row.id, action, explanation);
      if (!result?.ok) {
        setFeedback(result?.message || "The project action could not be completed.");
        return;
      }
      setDialog(null);
      setReason("");
      setFeedback(`${row.studentNumber}: ${LABELS[result.status] || result.status}. This is a classroom simulation only.`);
      router.refresh();
    } catch {
      setFeedback("The project action could not be completed. Refresh the page and try again.");
    } finally {
      setWorking(false);
    }
  }

  function openReasonDialog(row, action) {
    setReason("");
    setFeedback("");
    setDialog({ row, action });
  }

  function submitReason(event) {
    event.preventDefault();
    if (!dialog || working || !reason.trim()) return;
    void performAction(dialog.row, dialog.action, reason.trim());
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <Panel title="Project Enrollment Simulation Queue"
        subtitle="Registrar review of authenticated fictional cohort submissions. These records are separate from official enrollments and the existing demonstration queue.">
        <div className="notice" role="note" style={{ marginBottom: 14 }}>
          PROJECT_ONLY · GENERATED_PROJECT. A simulated confirmation means CONFIRMED_SIMULATION, not an official enrollment, confirmation reference or certificate of registration.
        </div>
        {queue?.kind !== "ready" ? (
          <EmptyState title="Project simulation queue unavailable"
            description="Verified project enrollment records could not be loaded. Confirm the authenticated Registrar session and Phase 8 database setup." />
        ) : !rows.length ? (
          <EmptyState title="No project simulation submissions"
            description="There are currently no stored project enrollment simulations to review. Submitted records will appear here when students complete the authorized project submission process." />
        ) : (
          <>
            <div className="toolbar">
              <SearchControl label="Search project student" value={search}
                onChange={(value) => { setSearch(value); setPage(1); }}
                placeholder="Search fictional student name or number" />
              <FilterControl label="Simulation status" value={filter}
                onChange={(value) => { setFilter(value); setPage(1); }} options={STATUSES} />
            </div>
            <DataTable rowKey="id" rows={visibleRows}
              emptyMessage="No project simulations match the current filters."
              columns={[
                { key: "studentNumber", label: "Project Student No." },
                { key: "studentName", label: "Fictional Student" },
                { key: "term", label: "Project Term" },
                { key: "status", label: "Simulated Status",
                  render: (row) => <StatusBadge value={row.status} label={LABELS[row.status] || row.status} /> },
                { key: "submittedAt", label: "Submitted", render: (row) => readableDate(row.submittedAt) },
                { key: "actions", label: "Registrar Project Actions", render: (row) => (
                  <TableActions>
                    {row.status === "SUBMITTED" ? (
                      <>
                        <Button variant="secondary" disabled={working}
                          onClick={() => void performAction(row, "VALIDATE")}>Validate</Button>
                        <Button variant="secondary" disabled={working}
                          onClick={() => openReasonDialog(row, "RETURN")}>Return</Button>
                      </>
                    ) : null}
                    {row.status === "VALIDATED" ? (
                      <>
                        <Button variant="secondary" disabled={working}
                          onClick={() => openReasonDialog(row, "RETURN")}>Return</Button>
                        <Button disabled={working}
                          onClick={() => openReasonDialog(row, "CONFIRM")}>Confirm simulation</Button>
                      </>
                    ) : null}
                    {row.status === "RETURNED" ? "Awaiting resubmission" : null}
                    {row.status === "DRAFT" ? "Awaiting student submission" : null}
                    {row.status === "CONFIRMED_SIMULATION" ? "Simulation completed" : null}
                  </TableActions>
                ) },
              ]} />
            {filtered.length > PAGE_SIZE ? (
              <TablePagination page={safePage} pageSize={PAGE_SIZE} total={filtered.length}
                onPageChange={setPage} label="Project enrollment simulation pagination" />
            ) : null}
          </>
        )}
        {feedback ? (
          <p className="notice" role="status" aria-live="polite" style={{ marginTop: 12 }}>{feedback}</p>
        ) : null}
      </Panel>
      <Modal open={Boolean(dialog)}
        title={dialog?.action === "CONFIRM" ? "Confirm Project Simulation" : "Return Project Simulation"}
        onClose={() => { if (!working) setDialog(null); }}
        footer={
          <>
            <Button variant="ghost" disabled={working}
              onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="submit" form="project-simulation-reason-form"
              disabled={working || !reason.trim()}>{working ? "Processing..." :
                dialog?.action === "CONFIRM" ? "Confirm simulation" : "Return simulation"}</Button>
          </>
        }>
        {dialog ? (
          <>
            <p className="notice" style={{ marginBottom: 12 }}>
              {dialog.row.studentNumber} · {dialog.row.studentName} · {LABELS[dialog.row.status] || dialog.row.status}
            </p>
            <form id="project-simulation-reason-form" className="form-grid" onSubmit={submitReason}>
              <label className="field full">
                {dialog.action === "CONFIRM" ? "Registrar confirmation source or reason" : "Reason for returning to student"}
                <textarea required maxLength={1000} value={reason} disabled={working}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Document the reason for this project action" />
              </label>
            </form>
            <p className="notice" style={{ marginTop: 12 }}>
              This action updates fictional project records and their audit events only.
              It does not approve or confirm official university enrollment.
            </p>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
