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
  { value: "ALL", label: "All review statuses" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "VALIDATED", label: "Validated" },
  { value: "RETURNED", label: "Returned" },
  { value: "CONFIRMED_SIMULATION", label: "Confirmed (demo only)" },
  { value: "DRAFT", label: "Draft" },
];

const LABELS = {
  SUBMITTED: "Submitted",
  VALIDATED: "Validated",
  RETURNED: "Returned",
  CONFIRMED_SIMULATION: "Confirmed (demo only)",
  DRAFT: "Draft",
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
      setFeedback(`${row.studentNumber}: ${LABELS[result.status] || result.status}. This is a classroom demonstration only, not official enrollment.`);
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
      <Panel title="Enrollment Review Queue"
        subtitle="Registrar review of fictional classroom submissions. These records are separate from official enrollments and the existing demonstration queue.">
        <div className="notice" role="note" style={{ marginBottom: 14 }}>
          Classroom demonstration only. A recorded review confirmation is not an official enrollment, confirmation reference, or certificate of registration.
        </div>
        {queue?.kind !== "ready" ? (
          <EmptyState title="Enrollment review queue unavailable"
            description="Classroom enrollment records could not be loaded. Confirm the authenticated Registrar session and demonstration data setup." />
        ) : !rows.length ? (
          <EmptyState title="No enrollment submissions to review"
            description="There are currently no classroom enrollment submissions to review. Submitted records will appear here when students complete the demonstration submission process." />
        ) : (
          <>
            <div className="toolbar">
              <SearchControl label="Search student" value={search}
                onChange={(value) => { setSearch(value); setPage(1); }}
                placeholder="Search fictional student name or number" />
              <FilterControl label="Review status" value={filter}
                onChange={(value) => { setFilter(value); setPage(1); }} options={STATUSES} />
            </div>
            <DataTable rowKey="id" rows={visibleRows}
              emptyMessage="No enrollment reviews match the current filters."
              columns={[
                { key: "studentNumber", label: "Student No." },
                { key: "studentName", label: "Fictional Student" },
                { key: "term", label: "Academic Term" },
                { key: "status", label: "Review Status",
                  render: (row) => <StatusBadge value={row.status} label={LABELS[row.status] || row.status} /> },
                { key: "submittedAt", label: "Submitted", render: (row) => readableDate(row.submittedAt) },
                { key: "actions", label: "Registrar Actions", render: (row) => (
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
                          onClick={() => openReasonDialog(row, "CONFIRM")}>Confirm demo review</Button>
                      </>
                    ) : null}
                    {row.status === "RETURNED" ? "Awaiting resubmission" : null}
                    {row.status === "DRAFT" ? "Awaiting student submission" : null}
                    {row.status === "CONFIRMED_SIMULATION" ? "Demo review completed" : null}
                  </TableActions>
                ) },
              ]} />
            {filtered.length > PAGE_SIZE ? (
              <TablePagination page={safePage} pageSize={PAGE_SIZE} total={filtered.length}
                onPageChange={setPage} label="Enrollment review pagination" />
            ) : null}
          </>
        )}
        {feedback ? (
          <p className="notice" role="status" aria-live="polite" style={{ marginTop: 12 }}>{feedback}</p>
        ) : null}
      </Panel>
      <Modal open={Boolean(dialog)}
        title={dialog?.action === "CONFIRM" ? "Confirm Demonstration Review" : "Return Enrollment Review"}
        onClose={() => { if (!working) setDialog(null); }}
        footer={
          <>
            <Button variant="ghost" disabled={working}
              onClick={() => setDialog(null)}>Cancel</Button>
            <Button type="submit" form="project-simulation-reason-form"
              disabled={working || !reason.trim()}>{working ? "Processing..." :
                dialog?.action === "CONFIRM" ? "Confirm demo review" : "Return enrollment"}</Button>
          </>
        }>
        {dialog ? (
          <>
            <p className="notice" style={{ marginBottom: 12 }}>
              {dialog.row.studentNumber} · {dialog.row.studentName} · {LABELS[dialog.row.status] || dialog.row.status}
            </p>
            <form id="project-simulation-reason-form" className="form-grid" onSubmit={submitReason}>
              <label className="field full">
                {dialog.action === "CONFIRM" ? "Demonstration review reason or source" : "Reason for returning to student"}
                <textarea required maxLength={1000} value={reason} disabled={working}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Document the reason for this review action" />
              </label>
            </form>
            <p className="notice" style={{ marginTop: 12 }}>
              This action updates fictional classroom records and their audit events only.
              It does not approve or confirm official university enrollment.
            </p>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
