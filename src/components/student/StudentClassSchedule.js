"use client";

import { useMemo, useState } from "react";
import {
  Button, Card, DataTable, EmptyState, FilterControl, InternalTabs, Modal,
  PageHeader, StatusBadge,
} from "@/components/ui/PortalUI";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TABS = ["Weekly Schedule", "List View"];

function labelTime(value) {
  if (!value) return "Not recorded";
  const parts = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!parts) return String(value);
  const hour = Number(parts[1]);
  if (hour > 23) return String(value);
  return `${hour % 12 || 12}:${parts[2]} ${hour < 12 ? "AM" : "PM"}`;
}

function displayValue(value) {
  return value && value !== "NOT_RECORDED_IN_SOURCE" ? value : "Not recorded";
}

export default function StudentClassSchedule({ mode = "unavailable", officialSchedule }) {
  const [view, setView] = useState(TABS[0]);
  const [dayFilter, setDayFilter] = useState("ALL");
  const [subjectFilter, setSubjectFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const isConfirmed = mode === "project" && Boolean(officialSchedule?.reference &&
    officialSchedule?.items?.length);

  const classes = useMemo(() => {
    if (!isConfirmed) return [];
    const subjects = new Map(officialSchedule.subjects.map((item) =>
      [item.subject_code, item]));
    return officialSchedule.items.map((item, index) => ({
      key: `${item.subject_code}:${item.day_of_week}:${item.start_time}:${index}`,
      code: item.subject_code,
      name: subjects.get(item.subject_code)?.subject_name || item.subject_code,
      sectionId: subjects.get(item.subject_code)?.section_id || null,
      units: subjects.get(item.subject_code)?.units ?? null,
      day: String(item.day_of_week || "Unspecified"),
      start: labelTime(item.start_time),
      end: labelTime(item.end_time),
      room: displayValue(item.room),
      instructor: displayValue(item.professor),
      component: displayValue(item.lecture_lab_type),
    }));
  }, [isConfirmed, officialSchedule]);

  const days = [...new Set([
    ...DAYS.slice(0, 5), ...classes.map((item) => item.day),
  ])].sort((a, b) => {
    const aIndex = DAYS.indexOf(a);
    const bIndex = DAYS.indexOf(b);
    return (aIndex < 0 ? 7 : aIndex) - (bIndex < 0 ? 7 : bIndex);
  });
  const visibleDays = dayFilter === "ALL" ? days : days.filter((day) => day === dayFilter);
  const subjects = [...new Map(classes.map((item) =>
    [item.code, { value: item.code, label: `${item.code} · ${item.name}` }])).values()];
  const filtered = classes.filter((item) =>
    (dayFilter === "ALL" || item.day === dayFilter) &&
    (subjectFilter === "ALL" || item.code === subjectFilter));

  return (
    <>
      <PageHeader title="Class Schedule"
        description="View the personal timetable from your Registrar confirmed enrollment."
        actions={isConfirmed ?
          <Button variant="secondary" onClick={() => window.print()}>Print Schedule</Button> : null} />
      {mode === "unavailable" ? (
        <Card><EmptyState title="Class schedule unavailable"
          description="Your authenticated student record could not be verified. Sign in again or contact the System Administrator." /></Card>
      ) : !isConfirmed ? (
        <Card>
          <EmptyState title="Awaiting confirmed class schedule"
            description="A personal class schedule becomes available after an official Registrar confirmation and finalized class assignments. Proposed blocks, validated project timetables, and simulated confirmation do not establish an official schedule." />
          <div className="notice" style={{ marginTop: 14 }} role="status">
            This is a fictional PROJECT_ONLY student account. No official confirmed schedule is currently linked to this record. You can review tentative subject choices in Enrollment.
          </div>
        </Card>
      ) : (
        <>
          <div className="notice" role="status" style={{ marginBottom: 16 }}>
            This account belongs to a fictional classroom cohort. The timetable below comes exclusively from the official enrollment COR function after a confirmed enrollment is verified.
          </div>
          <div className="summary-strip" style={{ marginBottom: 16 }}>
            <span>Term: <strong>{officialSchedule.term}</strong></span>
            <span>Confirmation Reference: <strong>{officialSchedule.reference}</strong></span>
            <span>Status: <StatusBadge value="CONFIRMED" /></span>
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
            {view === TABS[0] ? (
              <div className="table-scroll" role="region" tabIndex={0}
                aria-label="Weekly confirmed class timetable">
                <div className="schedule-grid"
                  style={{ gridTemplateColumns: `80px repeat(${visibleDays.length}, minmax(155px, 1fr))` }}>
                  <div className="schedule-cell header">Day</div>
                  {visibleDays.map((day) => <div className="schedule-cell header" key={day}>{day}</div>)}
                  <div className="schedule-cell header">Classes</div>
                  {visibleDays.map((day) => {
                    const items = filtered.filter((item) => item.day === day);
                    return (
                      <div className="schedule-cell" key={day}>
                        {items.length ? items.map((item) => (
                          <button key={item.key} type="button" className="schedule-event"
                            onClick={() => setSelected(item)}
                            style={{ display: "block", width: "100%", padding: 9, marginBottom: 7, textAlign: "left", border: "1px solid #a8d8ba", cursor: "pointer" }}
                            aria-label={`View ${item.code} ${day} details`}>
                            <strong>{item.code}</strong>
                            <span style={{ display: "block", fontWeight: 500 }}>{item.start} to {item.end}</span>
                            <span style={{ display: "block", fontWeight: 500 }}>{item.room}</span>
                          </button>
                        )) : <span>No class</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <DataTable rows={filtered} rowKey="key"
                emptyMessage="No confirmed classes match the selected filters."
                onRowClick={setSelected} rowTitle="View confirmed class details"
                getRowAriaLabel={(row) => `View ${row.code} meeting details`}
                columns={[
                  { key: "code", label: "Subject Code" },
                  { key: "name", label: "Subject" },
                  { key: "day", label: "Day" },
                  { key: "time", label: "Time", render: (row) => `${row.start} to ${row.end}` },
                  { key: "room", label: "Room" },
                  { key: "instructor", label: "Instructor" },
                ]} />
            )}
          </InternalTabs>
          <Modal open={Boolean(selected)} onClose={() => setSelected(null)}
            title={selected ? `${selected.code} · ${selected.name}` : "Class details"}
            footer={<Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>}>
            {selected && (
              <div className="info-grid">
                <div className="info-item"><span>Subject</span><strong>{selected.name}</strong></div>
                <div className="info-item"><span>Day</span><strong>{selected.day}</strong></div>
                <div className="info-item"><span>Time</span><strong>{selected.start} to {selected.end}</strong></div>
                <div className="info-item"><span>Room</span><strong>{selected.room}</strong></div>
                <div className="info-item"><span>Instructor</span><strong>{selected.instructor}</strong></div>
                <div className="info-item"><span>Class Type</span><strong>{selected.component}</strong></div>
                <div className="info-item"><span>Section ID</span><strong>{displayValue(selected.sectionId)}</strong></div>
              </div>
            )}
          </Modal>
        </>
      )}
    </>
  );
}
