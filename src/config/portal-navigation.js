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

export const PORTAL_META = {
  student: {
    portalName: "Student Portal",
    homeHref: "/student/dashboard",
    profileHref: "/student/student-profile",
    navigation: STUDENT_NAVIGATION,
  },
  registrar: {
    portalName: "Registrar Portal",
    homeHref: "/registrar/dashboard",
    profileHref: "/registrar/profile",
    navigation: REGISTRAR_NAVIGATION,
  },
};
