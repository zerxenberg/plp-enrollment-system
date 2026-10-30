"use client";

import { useMemo, useState } from "react";
import CorDocumentPreview from "@/components/cor/CorDocumentPreview";
import { displaySubjectCode } from "@/features/academic/project-academic-display-aliases.mjs";
import { useAcademicDataRefresh } from "./useAcademicDataRefresh";
import {
  buildClassScheduleMeetings, resolveClassScheduleView, scheduledDays, scheduledTimeSlots,
} from "./student-class-schedule-view.mjs";
import {
  Button, Card, DataTable, EmptyState, FilterControl, InternalTabs, Modal,
  PageHeader, StatusBadge,
} from "@/components/ui/PortalUI";

const TABS = ["Weekly Schedule", "List View"];

function displayValue(value) {
  return value && value !== "NOT_RECORDED_IN_SOURCE" ? value : "Not recorded";
}

export default function StudentClassSchedule({
  mode = "unavailable", officialSchedule, projectSchedule, proposedSchedule, blockSchedule,
  demonstrationCorUrl = null,
}) {
  useAcademicDataRefresh(mode === "project");
  const [view, setView] = useState(TABS[0]);
  const [dayFilter, setDayFilter] = useState("ALL");
  const [subjectFilter, setSubjectFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [corOpen, setCorOpen] = useState(false);
  const [showFullBlock, setShowFullBlock] = useState(false);
  const preferred = resolveClassScheduleView({
    mode, officialSchedule, projectSchedule, proposedSchedule, blockSchedule,
  });
  const reference = resolveClassScheduleView({ mode, blockSchedule });
  const canToggleBlock = preferred.kind === "proposed" && reference.kind === "block";
  const resolved = canToggleBlock && showFullBlock ? reference : preferred;
  const isConfirmed = resolved.kind === "registered";
  const isProposed = resolved.kind === "proposed";
  const isBlockTimetable = resolved.kind === "block";
  const isProjectDemonstration = resolved.provenance === "demonstration";
  const corUrl = isConfirmed
    ? isProjectDemonstration
      ? demonstrationCorUrl || "/api/student/project-cor"
      : resolved.schedule?.enrollmentId
        ? `/api/student/official-cor/${encodeURIComponent(resolved.schedule.enrollmentId)}`
        : null
    : null;
  const classes = useMemo(() =>
    buildClassScheduleMeetings(resolved.schedule, resolved.kind),
  [resolved.schedule, resolved.kind]);

  const days = scheduledDays(classes);
  const visibleDays = dayFilter === "ALL" ? days : days.filter((day) => day === dayFilter);
  const subjects = [...new Map(classes.map((item) =>
    [item.code, { value: item.code, label: `${displaySubjectCode(item.code)} · ${displaySubjectCode(item.name)}` }])).values()];
  const filtered = classes.filter((item) =>
    (dayFilter === "ALL" || item.day === dayFilter) &&
    (subjectFilter === "ALL" || item.code === subjectFilter));
  const timeSlots = scheduledTimeSlots(filtered);
  const canShowSchedule = (isConfirmed || isProposed || isBlockTimetable) && classes.length > 0;

  return (
    <>
      <PageHeader title="Class Schedule"
        description={isProposed
          ? "Review your planned weekly timetable while your enrollment awaits Registrar confirmation."
          : isBlockTimetable
            ? "View your published block timetable while academic eligibility is being evaluated. These are not registered classes."
          : isProjectDemonstration
            ? "View the timetable preserved from your Registrar confirmed classroom demonstration."
            : "View the personal timetable from your Registrar confirmed enrollment."}
        actions={canShowSchedule ? <div className="action-row">
          {canToggleBlock ? <Button variant="secondary" onClick={() => {
            setShowFullBlock((current) => !current);
            setDayFilter("ALL");
            setSubjectFilter("ALL");
          }}>{isBlockTimetable ? "View Eligible Proposal" : "View Full Block Timetable"}</Button> : null}
          {corUrl ? <Button onClick={() => setCorOpen(true)}>View COR</Button> : null}
          <Button variant="secondary" onClick={() => window.print()}>Print Schedule</Button>
        </div> : null} />
      {mode === "unavailable" ? (
        <Card><EmptyState title="Class schedule unavailable"
          description="Your authenticated student record could not be verified. Sign in again or contact the System Administrator." /></Card>
      ) : !canShowSchedule ? (
        <Card>
          <EmptyState title="Class timetable not yet available"
            description="Your verified class timetable will appear once your block schedule has been prepared. Registered classes appear only after Registrar confirmation." />
        </Card>
      ) : (
        <>
          {isProjectDemonstration && <div className="notice" style={{ marginBottom: 12 }}>
            {isBlockTimetable
              ? "Published demonstration block timetable for reference only. Individual subject eligibility and enrollment proposals are evaluated separately. Viewing this schedule does not register any classes."
              : isProposed
              ? "Classroom demonstration only. This timetable is proposed and your classes are not registered. Registrar confirmation is required."
              : "Academic classroom demonstration only. This registered timetable is not an official PLP enrollment record."}
          </div>}
          <div className="summary-strip" style={{ marginBottom: 16 }}>
            <span>Term: <strong>{displayValue(resolved.schedule.term)}</strong></span>
            {resolved.schedule.homeBlock && <span>Block: <strong>{resolved.schedule.homeBlock}</strong></span>}
            {isConfirmed && <span>{isProjectDemonstration ? "Demonstration Reference" : "Confirmation Reference"}: <strong>{resolved.schedule.reference}</strong></span>}
            <span>Status: <StatusBadge
              value={isBlockTimetable ? "PUBLISHED" : isProposed ? "PROPOSED" : isProjectDemonstration ? "CONFIRMED_SIMULATION" : "CONFIRMED"}
              label={isBlockTimetable ? "Block timetable (reference only)" : isProposed ? "Proposed (not registered)" : isProjectDemonstration ? "Registered (demo only)" : "Registered"} /></span>
          </div>
          <InternalTabs items={TABS.map((item) => ({ value: item, label: item }))}
            selected={view} onSelect={setView} label="Class schedule views" panelCard>
            <div className="toolbar">
              <FilterControl label="Day" value={dayFilter} onChange={setDayFilter}
                options={[{ value: "ALL", label: "All days" },
                  ...days.map((day) => ({ value: day, label: day }))]} />
              <FilterControl label="Subject" value={subjectFilter} onChange={setSubjectFilter}
                options={[{ value: "ALL", label: "All subjects" }, ...subjects]} />
            </div>
            {!filtered.length ? (
              <EmptyState title="No classes match the selected filters." />
            ) : view === TABS[0] ? (
              <div className="table-scroll" role="region" tabIndex={0}
                aria-label={`Weekly ${isBlockTimetable ? "block reference" : isProposed ? "proposed" : "registered"} class timetable`}>
                <div className="schedule-grid"
                  style={{ gridTemplateColumns: `minmax(95px, 110px) repeat(${visibleDays.length}, minmax(180px, 1fr))` }}>
                  <div className="schedule-cell header">Time</div>
                  {visibleDays.map((day) => <div className="schedule-cell header" key={day}>{day}</div>)}
                  {timeSlots.map((slot) => (
                    <div key={slot.label} style={{ display: "contents" }}>
                      <div className="schedule-cell header">{slot.label}</div>
                      {visibleDays.map((day) => {
                        const meetings = filtered.filter((item) =>
                          item.day === day && item.start === slot.label);
                        return <div className="schedule-cell" key={`${slot.label}:${day}`}>
                          {meetings.length ? meetings.map((item) => (
                            <button key={item.key} type="button" className="schedule-event"
                              onClick={() => setSelected(item)}
                              style={{ display: "block", width: "100%", padding: 9, marginBottom: 7, textAlign: "left", border: "1px solid #a8d8ba", cursor: "pointer" }}
                              aria-label={`View ${displaySubjectCode(item.code)} ${day} ${item.start} details`}>
                              <strong>{displaySubjectCode(item.code)}</strong>
                              <span style={{ display: "block", fontWeight: 500 }}>{item.start} to {item.end}</span>
                              <span style={{ display: "block", fontWeight: 500 }}>{item.room}</span>
                              <span style={{ display: "block", fontWeight: 500 }}>{item.instructor}</span>
                              <span style={{ display: "block", fontWeight: 500 }}>{item.recordLabel}</span>
                            </button>
                          )) : <span>No class</span>}
                        </div>;
                      })}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <DataTable rows={filtered} rowKey="key"
                emptyMessage="No classes match the selected filters."
                onRowClick={setSelected} rowTitle="View class meeting details"
                getRowAriaLabel={(row) => `View ${displaySubjectCode(row.code)} meeting details`}
                columns={[
                  { key: "code", label: "Subject Code", render: (row) => displaySubjectCode(row.code) },
                  { key: "name", label: "Subject", render: (row) => displaySubjectCode(row.name) },
                  { key: "day", label: "Day" },
                  { key: "time", label: "Time", render: (row) => `${row.start} to ${row.end}` },
                  { key: "section", label: "Section" },
                  ...(classes.some((row) => row.sectionStatus) ? [
                    { key: "sectionStatus", label: "Section Status", render: (row) => row.sectionStatus
                      ? <StatusBadge value={row.sectionStatus} /> : "Not recorded" },
                  ] : []),
                  { key: "room", label: "Room" },
                  { key: "instructor", label: "Instructor" },
                  { key: "component", label: "Class Type" },
                  { key: "recordStatus", label: "Record", render: (row) =>
                    <StatusBadge value={row.recordStatus} label={row.recordLabel} /> },
                ]} />
            )}
          </InternalTabs>
          <Modal open={Boolean(selected)} onClose={() => setSelected(null)}
            title={selected ? `${displaySubjectCode(selected.code)} · ${displaySubjectCode(selected.name)}` : "Class details"}
            footer={<Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>}>
            {selected && (
              <div className="info-grid">
                <div className="info-item"><span>Subject</span><strong>{displaySubjectCode(selected.name)}</strong></div>
                <div className="info-item"><span>Day</span><strong>{selected.day}</strong></div>
                <div className="info-item"><span>Time</span><strong>{selected.start} to {selected.end}</strong></div>
                <div className="info-item"><span>Room</span><strong>{selected.room}</strong></div>
                <div className="info-item"><span>Instructor</span><strong>{selected.instructor}</strong></div>
                <div className="info-item"><span>Class Type</span><strong>{selected.component}</strong></div>
                <div className="info-item"><span>Section</span><strong>{selected.section}</strong></div>
                {selected.sectionStatus && <div className="info-item"><span>Section Status</span><strong>
                  <StatusBadge value={selected.sectionStatus} />
                </strong></div>}
                <div className="info-item"><span>Section ID</span><strong>{displayValue(selected.sectionId)}</strong></div>
                <div className="info-item"><span>Record</span><strong><StatusBadge value={selected.recordStatus} label={selected.recordLabel} /></strong></div>
              </div>
            )}
          </Modal>
        </>
      )}
      <CorDocumentPreview open={Boolean(corOpen && corUrl)}
        onClose={() => setCorOpen(false)} documentUrl={corUrl}
        project={isProjectDemonstration} />
    </>
  );
}
