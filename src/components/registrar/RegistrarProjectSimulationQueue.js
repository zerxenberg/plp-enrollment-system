"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button, DataTable, EmptyState, FilterControl, Modal, SearchControl,
  StatusBadge, TableActions, TablePagination,
} from "@/components/ui/PortalUI";
import { Panel } from "./RegistrarShared";
import { performRegistrarProjectSimulationAction, performRegistrarProjectSimulationBatchAction, saveRegistrarDemonstrationWindow } from "@/features/academic/registrar-project-simulations";

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

export default function RegistrarProjectSimulationQueue({ queue, mode = "all" }) {
  const router = useRouter();
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [startDate, setStartDate] = useState(queue?.demoWindow?.start_date || "");
  const [endDate, setEndDate] = useState(queue?.demoWindow?.end_date || "");
  const [windowWorking, setWindowWorking] = useState(false);
  const [windowFeedback, setWindowFeedback] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchDialog, setBatchDialog] = useState(null);
  const [batchReason, setBatchReason] = useState("");
  const [batchWorking, setBatchWorking] = useState(false);
  const [batchFeedback, setBatchFeedback] = useState("");
  const [batchResults, setBatchResults] = useState([]);

  const rows = Array.isArray(queue?.records) ? queue.records : [];
  const filtered = rows.filter((row) =>
    (filter === "ALL" || row.status === filter) &&
    `${row.studentNumber} ${row.studentName} ${row.term}`
      .toLowerCase().includes(search.trim().toLowerCase()),
  );
  const safePage = Math.max(1, Math.min(page, Math.ceil(filtered.length / PAGE_SIZE) || 1));
  const visibleRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selectedRows = rows.filter((row) => selectedIds.includes(row.id));
  const selectedBlockId = selectedRows[0]?.homeBlockId;
  const canBatchConfirm = selectedRows.length > 0 && Boolean(selectedBlockId) &&
    selectedRows.every((row) => row.status === "VALIDATED" && row.homeBlockId === selectedBlockId);

  function toggleBatchSelection(rowId, checked) {
    setBatchFeedback("");
    setBatchResults([]);
    setSelectedIds((current) => checked
      ? current.includes(rowId) || current.length >= 40 ? current : [...current, rowId]
      : current.filter((id) => id !== rowId));
  }

  function selectVisibleBlock() {
    const blockId = selectedBlockId || visibleRows.find((row) =>
      row.status === "VALIDATED" && row.homeBlockId)?.homeBlockId;
    if (!blockId) return;
    setBatchResults([]);
    setBatchFeedback("");
    setSelectedIds((current) => [...new Set([...current, ...visibleRows
      .filter((row) => row.status === "VALIDATED" && row.homeBlockId === blockId)
      .map((row) => row.id)])].slice(0, 40));
  }

  async function performBatch(explanation = "") {
    if (batchWorking || working || !canBatchConfirm || selectedRows.length > 40 || !explanation.trim()) return;
    setBatchWorking(true);
    setBatchFeedback("");
    try {
      const result = await performRegistrarProjectSimulationBatchAction(
        selectedRows.map((row) => row.id), "CONFIRM", explanation.trim());
      setBatchResults(Array.isArray(result?.results) ? result.results : []);
      setBatchFeedback(result?.ok
        ? `${result.confirmed} confirmed for demonstration, ${result.failed} failed out of ${result.total} selected. Review individual results below.`
        : result?.message || "The batch confirmation could not be completed.");
      router.refresh();
      if (result?.ok) {
        const confirmedIds = new Set(result.results.filter((row) => row.ok).map((row) => row.id));
        setSelectedIds((current) => current.filter((id) => !confirmedIds.has(id)));
        setBatchDialog(null);
        setBatchReason("");
      }
    } catch {
      setBatchFeedback("The batch action could not be completed. Refresh the page and try again.");
    } finally {
      setBatchWorking(false);
    }
  }

  async function performAction(row, action, explanation = "") {
    if (working || batchWorking) return;
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

  async function saveWindow(event, status) {
    event.preventDefault();
    if (windowWorking) return;
    setWindowWorking(true);
    setWindowFeedback("");
    try {
      const result = await saveRegistrarDemonstrationWindow(startDate, endDate, status);
      setWindowFeedback(result?.message || "The demonstration period could not be updated.");
      if (result?.ok) router.refresh();
    } catch {
      setWindowFeedback("The demonstration period could not be updated.");
    } finally {
      setWindowWorking(false);
    }
  }

  return (
    <div style={{ marginBottom: 18 }}>
      {mode !== "processing" ? (
      <Panel title="Demonstration Enrollment Window"
        subtitle="Registrar controlled classroom testing dates. Official academic term dates remain unchanged.">
        <form className="form-grid" onSubmit={(event) => void saveWindow(event, "OPEN")}>
          <label className="field">Testing Starts
            <input type="date" required value={startDate} disabled={windowWorking}
              onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="field">Testing Ends
            <input type="date" required value={endDate} disabled={windowWorking}
              onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <div className="action-row">
            <Button type="submit" disabled={windowWorking || !startDate || !endDate}>Open Testing Window</Button>
            <Button variant="secondary" type="button"
              disabled={windowWorking || !startDate || !endDate}
              onClick={(event) => void saveWindow(event, "CLOSED")}>Close Testing Window</Button>
          </div>
        </form>
        <p className="notice" role="status" style={{ marginTop: 10 }}>
          Current status: {queue?.demoWindow?.status === "OPEN" ? "Open (classroom demonstration only)" : "Closed"}.
          {windowFeedback ? ` ${windowFeedback}` : ""}
        </p>
      </Panel>
      ) : null}
      {mode !== "period" ? (
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
            <div className="action-row" style={{ marginBottom: 14 }}>
              <strong>{selectedRows.length} of 40 selected</strong>
              <Button type="button" variant="secondary" disabled={batchWorking || working || selectedIds.length >= 40 || !visibleRows.some((row) => row.status === "VALIDATED" && row.homeBlockId && (!selectedBlockId || row.homeBlockId === selectedBlockId) && !selectedIds.includes(row.id))} onClick={selectVisibleBlock}>Select Validated on Page</Button>
              <Button type="button" disabled={!canBatchConfirm || batchWorking || working} onClick={() => { setBatchReason(""); setBatchDialog("CONFIRM"); }}>Confirm Selected (demo)</Button>
              <Button type="button" variant="ghost" disabled={!selectedRows.length || batchWorking} onClick={() => setSelectedIds([])}>Clear Selection</Button>
            </div>
            <p className="notice" style={{ marginBottom: 14 }}>Batch confirmation accepts up to 40 individually validated records from the same block section. Validate or return individual submissions first. Confirmation is fictional and records results separately for each student.</p>
            <DataTable rowKey="id" rows={visibleRows}
              emptyMessage="No enrollment reviews match the current filters."
              columns={[
                { key: "selection", label: "Select", render: (row) => <input type="checkbox" aria-label={`Select ${row.studentNumber} for batch confirmation`} checked={selectedIds.includes(row.id)} disabled={working || batchWorking || row.status !== "VALIDATED" || !row.homeBlockId || (selectedBlockId && selectedBlockId !== row.homeBlockId) || (selectedIds.length >= 40 && !selectedIds.includes(row.id))} onChange={(event) => toggleBatchSelection(row.id, event.target.checked)} /> },
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
            {batchFeedback ? <p className="notice" role="status" style={{ marginTop: 12 }}>{batchFeedback}</p> : null}
            {batchResults.length ? <div style={{ marginTop: 16 }}>
              <h3>Batch Confirmation Results</h3>
              <DataTable rowKey="id" rows={batchResults} columns={[{key:"studentNumber",label:"Student No."},{key:"status",label:"Result",render:(row)=><StatusBadge value={row.ok ? "CONFIRMED_SIMULATION" : "REQUIRES_CORRECTION"} label={row.ok ? "Confirmed (demo only)" : "Not confirmed"} />},{key:"message",label:"Details"}]} />
            </div> : null}
          </>
        )}
        {feedback ? (
          <p className="notice" role="status" aria-live="polite" style={{ marginTop: 12 }}>{feedback}</p>
        ) : null}
      </Panel>
      ) : null}
      {mode !== "period" ? (
      <>
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
      <Modal open={Boolean(batchDialog)}
        title="Confirm Selected Demonstration Reviews"
        onClose={() => { if (!batchWorking) setBatchDialog(null); }}
        footer={<><Button type="button" variant="ghost" disabled={batchWorking} onClick={() => setBatchDialog(null)}>Cancel</Button><Button type="submit" form="registrar-project-batch-reason" disabled={batchWorking || !canBatchConfirm || !batchReason.trim()}>{batchWorking ? "Processing..." : "Confirm selected (demo)"}</Button></>}>
        {batchDialog ? <form id="registrar-project-batch-reason" onSubmit={(event) => { event.preventDefault(); void performBatch(batchReason); }}>
          <p className="notice">{selectedRows.length} fictional student reviews selected. This action is recorded separately for each eligible record and does not confirm official enrollment.</p>
          <label className="field full" style={{ marginTop: 12 }}>Review reason or verification reference<textarea required maxLength={1000} value={batchReason} disabled={batchWorking} onChange={(event) => setBatchReason(event.target.value)} placeholder="Document the source and reason for this action" /></label>
        </form> : null}
      </Modal>
      </>
      ) : null}
    </div>
  );
}
