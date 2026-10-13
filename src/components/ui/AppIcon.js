import {
  ArrowRight,
  Archive,
  Bell,
  BookOpen,
  CalendarDays,
  ChartNoAxesColumn,
  Check,
  CircleCheck,
  ClipboardCheck,
  Clock3,
  Copy,
  CloudUpload,
  ChevronRight,
  ClipboardList,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  FileUp,
  GraduationCap,
  House,
  Pencil,
  Plus,
  LockKeyhole,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Undo2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

// The sole source of application icons. Names represent functions, not artwork.
export const ICON_REGISTRY = Object.freeze({
  home: House,
  book: BookOpen,
  records: FileText,
  calendar: CalendarDays,
  bell: Bell,
  user: UserRound,
  users: UsersRound,
  clipboard: ClipboardList,
  academic: GraduationCap,
  chart: ChartNoAxesColumn,
  cloudUpload: CloudUpload,
  fileUp: FileUp,
  logout: LogOut,
  menu: Menu,
  search: Search,
  close: X,
  sync: RefreshCw,
  settings: Settings,
  shield: ShieldCheck,
  lock: LockKeyhole,
  eye: Eye,
  eyeOff: EyeOff,
  chevronRight: ChevronRight,
  arrowRight: ArrowRight,
  admission: FileCheck2,
  edit: Pencil,
  add: Plus,
  approve: CircleCheck,
  check: Check,
  review: ClipboardCheck,
  history: Clock3,
  duplicate: Copy,
  archive: Archive,
  restore: Undo2,
  delete: Trash2,
});

export default function AppIcon({ name, className = "", title, size = 20, strokeWidth = 2, ...props }) {
  const IconComponent = ICON_REGISTRY[name];

  if (!IconComponent) {
    throw new Error(`Unknown application icon: ${String(name)}. Add a verified Lucide icon to ICON_REGISTRY.`);
  }

  return (
    <IconComponent
      className={className}
      size={size}
      strokeWidth={strokeWidth}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...props}
    />
  );
}
