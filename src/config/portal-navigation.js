
export const STUDENT_NAVIGATION = [
  { label: "Dashboard", href: "/student/dashboard", icon: "home" },
  { label: "Enrollment", href: "/student/enrollment", icon: "book" },
  { label: "Academic Records", href: "/student/academic-records", icon: "records" },
  { label: "Class Schedule", href: "/student/class-schedule", icon: "calendar" },
  { label: "Notifications", href: "/student/notifications", icon: "bell" },
  { label: "Student Profile", href: "/student/student-profile", icon: "user" },
];

export const REGISTRAR_NAVIGATION = [
  { label: "Dashboard", href: "/registrar/dashboard", icon: "home" },
  { label: "Students", href: "/registrar/students", icon: "users" },
  { label: "Enrollment", href: "/registrar/enrollment", icon: "clipboard" },
  { label: "Academic & Scheduling", href: "/registrar/academic-scheduling", icon: "academic" },
  { label: "Reports & Monitoring", href: "/registrar/reports-monitoring", icon: "chart" },
  { label: "Notifications", href: "/registrar/notifications", icon: "bell" },
];

export const ACADEMIC_COORDINATOR_NAVIGATION = [
  { label: "Dashboard", href: "/academic-coordinator/dashboard", icon: "home" },
  { label: "Academic Setup", href: "/academic-coordinator/academic-setup", icon: "academic" },
  { label: "Sections & Schedules", href: "/academic-coordinator/sections-schedules", icon: "calendar" },
  { label: "Academic Review", href: "/academic-coordinator/academic-review", icon: "clipboard" },
  { label: "Reports & Monitoring", href: "/academic-coordinator/reports-monitoring", icon: "chart" },
];

export const SYSTEM_ADMINISTRATOR_NAVIGATION = [
  { label: "Dashboard", href: "/system-administrator/dashboard", icon: "home" },
  { label: "Users & Access", href: "/system-administrator/users-access", icon: "users" },
  { label: "System Integration", href: "/system-administrator/system-integration", icon: "sync" },
  { label: "System Administration", href: "/system-administrator/system-administration", icon: "settings" },
  { label: "Audit & Monitoring", href: "/system-administrator/audit-monitoring", icon: "shield" },
];

export const PORTAL_META = {
  student: {
    portalName: "Student Portal",
    homeHref: "/student/dashboard",
    profileHref: "/student/student-profile",
    notificationHref: "/student/notifications",
    topbarUtilityLabel: "notifications",
    compactTopbar: false,
    navigation: STUDENT_NAVIGATION,
  },
  registrar: {
    portalName: "Registrar Portal",
    homeHref: "/registrar/dashboard",
    profileHref: "/registrar/profile",
    notificationHref: "/registrar/notifications",
    topbarUtilityLabel: "notifications",
    compactTopbar: false,
    navigation: REGISTRAR_NAVIGATION,
  },
  "academic-coordinator": {
    portalName: "Academic Coordinator Portal",
    homeHref: "/academic-coordinator/dashboard",
    profileHref: "/academic-coordinator/profile",
    notificationHref: "/academic-coordinator/notifications",
    topbarUtilityLabel: "academic alerts",
    compactTopbar: true,
    navigation: ACADEMIC_COORDINATOR_NAVIGATION,
  },
  "system-administrator": {
    portalName: "System Administrator Portal",
    homeHref: "/system-administrator/dashboard",
    profileHref: "/system-administrator/profile",
    notificationHref: "/system-administrator/audit-monitoring",
    topbarUtilityLabel: "technical alerts",
    compactTopbar: true,
    navigation: SYSTEM_ADMINISTRATOR_NAVIGATION,
  },
};
