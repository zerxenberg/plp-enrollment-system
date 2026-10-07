"use client";

import { useEffect, useRef } from "react";
import PortalIcon from "@/components/layout/PortalIcon";
import { getStatusLabel } from "@/constants/statuses";

export function Card({ children, className = "", as: Tag = "section" }) {
  return <Tag className={`portal-card ${className}`}>{children}</Tag>;
}

export function PageHeader({ title, description, actions }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
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

export function SearchControl({ label = "Search", value, onChange, placeholder }) {
  return (
    <label className="control-field search-field">
      <span className="sr-only">{label}</span>
      <PortalIcon name="search" className="control-icon" />
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

export function Modal({ open, title, children, onClose, footer }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") {
        onClose();
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
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="portal-modal" role="dialog" aria-modal="true" aria-labelledby="portal-modal-title">
        <header><h2 id="portal-modal-title">{title}</h2><button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label="Close dialog"><PortalIcon name="close" /></button></header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
