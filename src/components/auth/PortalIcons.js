export function UserIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0H5Z" fill="currentColor" />
    </svg>
  );
}

export function LockIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10h.75A2.75 2.75 0 0 1 20 12.75v6.5A2.75 2.75 0 0 1 17.25 22H6.75A2.75 2.75 0 0 1 4 19.25v-6.5A2.75 2.75 0 0 1 6.75 10h.75Zm2 0h5V7.5a2.5 2.5 0 0 0-5 0V10Zm2.5 4a1.75 1.75 0 0 0-1 3.19V19h2v-1.81A1.75 1.75 0 0 0 12 14Z" fill="currentColor" />
    </svg>
  );
}

export function EyeIcon({ className, hidden = false }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.4 12s3.5-6 9.6-6 9.6 6 9.6 6-3.5 6-9.6 6-9.6-6-9.6-6Zm9.6 3.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {hidden ? <path d="M4 4 20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : null}
    </svg>
  );
}

export function StaffIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 64 48" aria-hidden="true">
      <circle cx="32" cy="12" r="8" fill="currentColor" />
      <circle cx="13" cy="17" r="7" fill="currentColor" opacity=".88" />
      <circle cx="51" cy="17" r="7" fill="currentColor" opacity=".88" />
      <path d="M17 43c0-11 6-19 15-19s15 8 15 19H17Z" fill="currentColor" />
      <path d="M0 43c0-9 5-16 13-16 3 0 6 1 8 3-4 4-6 8-6 13H0Zm49 0c0-5-2-9-6-13 2-2 5-3 8-3 8 0 13 7 13 16H49Z" fill="currentColor" opacity=".88" />
    </svg>
  );
}

export function GraduationCapIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path d="m24 7 21 10-21 10L3 17 24 7Z" fill="currentColor" />
      <path d="M11 23v10c4 5 8 8 13 8s9-3 13-8V23l-13 6-13-6Z" fill="currentColor" opacity=".82" />
      <path d="M42 20v13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ShieldIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 20 5v6c0 5-3.2 9.4-8 11-4.8-1.6-8-6-8-11V5l8-3Zm0 4v11c2.5-1.4 4-3.7 4-6.7V7l-4-1Z" fill="currentColor" />
    </svg>
  );
}

export function ArrowRightIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowLeftIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AdmissionIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 2h9l4 4v16H6V2Zm8 1.8V7h3.2L14 3.8Z" fill="currentColor" opacity=".9" />
      <path d="M9 14h6M9 17h4" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      <path d="m7 10 2 2 4-4" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
