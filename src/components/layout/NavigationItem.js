import Link from "next/link";
import AppIcon from "@/components/ui/AppIcon";

export default function NavigationItem({ item, active, onNavigate }) {
  return (
    <Link
      href={item.href}
      className={`sidebar-link ${active ? "is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
    >
      <AppIcon name={item.icon} />
      <span>{item.label}</span>
    </Link>
  );
}
