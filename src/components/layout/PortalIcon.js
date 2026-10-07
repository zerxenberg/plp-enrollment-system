const paths = {
  home: "M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3v-9.5Z",
  book: "M4 5.5A3.5 3.5 0 0 1 7.5 2H12v17H7.5A3.5 3.5 0 0 0 4 22V5.5Zm16 0A3.5 3.5 0 0 0 16.5 2H12v17h4.5A3.5 3.5 0 0 1 20 22V5.5Z",
  records: "M5 3h14v18H5V3Zm3 4h8v2H8V7Zm0 4h8v2H8v-2Zm0 4h5v2H8v-2Z",
  calendar: "M5 4h2V2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm0 6v8h14v-8H5Z",
  bell: "M12 22a2.5 2.5 0 0 0 2.3-1.5H9.7A2.5 2.5 0 0 0 12 22Zm7-5v-5a7 7 0 0 0-5-6.7V4a2 2 0 1 0-4 0v1.3A7 7 0 0 0 5 12v5l-2 2h18l-2-2Z",
  user: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0H4Z",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 21a7 7 0 0 1 14 0H2Zm13.5-7a6 6 0 0 1 6.5 6h-4a8.8 8.8 0 0 0-2.5-6Z",
  clipboard: "M9 3h6l1 2h3v17H5V5h3l1-2Zm0 6v2h6V9H9Zm0 4v2h6v-2H9Z",
  academic: "m2 9 10-6 10 6-10 6L2 9Zm4 4v5h12v-5l-6 3.5L6 13Z",
  chart: "M4 20V10h3v10H4Zm6 0V4h3v16h-3Zm6 0v-7h3v7h-3Z",
  logout: "M10 4H4v16h6v-2H6V6h4V4Zm5.5 3-1.4 1.4 2.6 2.6H9v2h7.7l-2.6 2.6 1.4 1.4 5-5-5-5Z",
  menu: "M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h16v2H4v-2Z",
  search: "M10.5 3a7.5 7.5 0 1 0 4.7 13.35L20.85 22 22 20.85l-5.65-5.65A7.5 7.5 0 0 0 10.5 3Zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z",
  close: "m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z",
};

export default function PortalIcon({ name, className = "", title }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <path d={paths[name] || paths.records} fill="currentColor" />
    </svg>
  );
}
