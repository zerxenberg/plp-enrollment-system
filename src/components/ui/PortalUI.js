"use client";

import { useContext, useEffect, useId, useRef } from "react";
import AppIcon from "@/components/ui/AppIcon";
import { getStatusLabel } from "@/constants/statuses";
import Topbar from "@/components/layout/Topbar";
import { PortalHeaderContext } from "@/components/layout/PortalHeaderContext";

export function Card({ children, className = "", as: Tag = "section" }) {
  return <Tag className={`portal-card ${className}`}>{children}</Tag>;
}

export function PageHeader({ title, description, actions }) {
  const portalHeader = useContext(PortalHeaderContext);
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions || portalHeader ? (
        <div className="page-header-utilities">
          {actions ? <div className="page-header-actions">{actions}</div> : null}
          {portalHeader ? <Topbar {...portalHeader} /> : null}
        </div>
      ) : null}
    </header>
  );
}

export function StatusBadge({ value, label }) {
  const normalized = String(value || "unknown").toLowerCase();
  const isDanger = normalized.includes("not_eligible") || normalized.includes("correct") || normalized.includes("fail") || normalized.includes("restrict") || normalized === "full";
  const isPositive = normalized.includes("confirm") || normalized === "validated" || normalized.includes("pass") || normalized === "eligible" || normalized === "active" || normalized === "open" || normalized === "available" || normalized === "completed" || normalized === "credited";
  const isWarning = normalized === "for_validation" || normalized.includes("review") || normalized.includes("submitted") || normalized.includes("progress") || normalized.includes("near") || normalized === "incomplete";
  const tone = isDanger ? "danger" : isPositive ? "positive" : isWarning ? "warning" : "neutral";
  return <span className={`status-badge status-${tone}`}>{label || getStatusLabel(value)}</span>;
}

export function Button({ children, variant = "primary", className = "", type = "button", ...props }) {
  return <button type={type} className={`portal-button portal-button-${variant} ${className}`} {...props}>{children}</button>;
}

// Shared content tabs for authenticated portals. Workflow steps and filter groups
// retain their own semantics because they are not tab panels.
export function InternalTabs({ items, selected, onSelect, label, children, className = "", panelCard = false }) {
  const id = useId();
  const tabRefs = useRef([]);
  const previousSelected = useRef(selected);
  const selectedIndex = items.findIndex((item) => item.value === selected);
  const panelId = `${id}-panel`;

  useEffect(() => {
    // When an action inside a panel opens another tab, its focused button may
    // unmount. Return focus to the newly selected tab in that case.
    if (previousSelected.current !== selected && document.activeElement === document.body) {
      tabRefs.current[selectedIndex]?.focus();
    }
    previousSelected.current = selected;
  }, [selected, selectedIndex]);

  function handleTabKeyDown(event, index) {
    if (!items.length) return;
    let nextIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % items.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else return;

    event.preventDefault();
    onSelect(items[nextIndex].value);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <>
      <div className={`tabs ${className}`.trim()} role="tablist" aria-label={label}>
        {items.map((item, index) => {
          const isSelected = selected === item.value;
          return (
            <button
              key={item.value}
              ref={(node) => { tabRefs.current[index] = node; }}
              id={`${id}-tab-${index}`}
              className={`tab-button ${isSelected ? "is-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={panelId}
              tabIndex={isSelected || (selectedIndex < 0 && index === 0) ? 0 : -1}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              onClick={() => onSelect(item.value)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className={`tab-panel${panelCard ? " portal-card section-card" : ""}`} id={panelId} role="tabpanel" aria-labelledby={`${id}-tab-${Math.max(0, selectedIndex)}`} tabIndex={0}>
        {children}
      </div>
    </>
  );
}

export function SearchControl({ label = "Search", value, onChange, placeholder }) {
  return (
    <label className="control-field search-field">
      <span className="sr-only">{label}</span>
      <AppIcon name="search" className="control-icon" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder || label} />
    </label>
  );
}

export function FilterControl({ label, value, onChange, options }) {
  return (
    <label className="control-field select-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function DataTable({ columns, rows, rowKey, emptyMessage = "No records found." }) {
  if (!rows.length) return <EmptyState title={emptyMessage} />;
  return (
    <div className="table-scroll" tabIndex="0" aria-label="Scrollable table region">
      <table className="data-table">
        <thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={typeof rowKey === "function" ? rowKey(row) : row[rowKey] || index}>
              {columns.map((column) => <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ title, description }) {
  return <div className="empty-state"><strong>{title}</strong>{description ? <p>{description}</p> : null}</div>;
}

export function LoadingState({ label = "Loading portal..." }) {
  return <div className="portal-loading" role="status"><span className="loading-spinner" aria-hidden="true" />{label}</div>;
}

export function Modal({ open, title, children, onClose, footer, className = "" }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previousFocus?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className={`portal-modal ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby="portal-modal-title">
        <header><h2 id="portal-modal-title">{title}</h2><button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><AppIcon name="close" /></button></header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
