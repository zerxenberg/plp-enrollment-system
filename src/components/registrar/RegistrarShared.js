"use client";

import Link from "next/link";
import { Card, StatusBadge, Button } from "@/components/ui/PortalUI";

export function Panel({ title, subtitle, actions, children, className = "" }) {
  return (
    <Card className={`section-card ${className}`}>
      <div className="section-header">
        <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
        {actions ? <div className="action-row">{actions}</div> : null}
      </div>
      {children}
    </Card>
  );
}

export function Metric({ label, value, hint }) {
  return <Card className="metric-card"><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong>{hint ? <span className="metric-meta">{hint}</span> : null}</Card>;
}

export function Info({ label, value }) {
  return <div className="info-item"><span>{label}</span><strong>{value ?? "Not available"}</strong></div>;
}

export function Details({ items }) {
  return <div className="detail-list">{items.map(([label, value]) => <div className="detail-row" key={label}><span>{label}</span><strong>{value ?? "Not available"}</strong></div>)}</div>;
}

export function Tabs({ items, selected, onSelect }) {
  return <div className="tabs" role="group" aria-label="Choose view">{items.map((item) => <button key={item.value} className={`tab-button ${selected === item.value ? "is-active" : ""}`} aria-pressed={selected === item.value} type="button" onClick={() => onSelect(item.value)}>{item.label}</button>)}</div>;
}

export function LinkButton({ href, children }) {
  return <Link className="portal-button portal-button-secondary" href={href}>{children}</Link>;
}

export function StatusCell({ value }) {
  return <StatusBadge value={value} />;
}

export function Action({ onClick, children, disabled, variant = "secondary" }) {
  return <Button type="button" variant={variant} onClick={onClick} disabled={disabled}>{children}</Button>;
}

export function Feedback({ message, warning = false }) {
  return message ? <p className={`notice ${warning ? "warning" : ""}`} role="status" style={{ marginTop: 12 }}>{message}</p> : null;
}
