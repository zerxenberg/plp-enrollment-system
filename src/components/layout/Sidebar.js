"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AppIcon from "@/components/ui/AppIcon";
import NavigationItem from "./NavigationItem";
import { clearDemoSession } from "@/lib/auth/demo-auth";
import { createClient } from "@/lib/supabase/client";

export default function Sidebar({ role, meta, user, open, onClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const sidebarRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const sidebar = sidebarRef.current;
    const focusable = sidebar?.querySelectorAll('a[href], button:not([disabled])');
    focusable?.[0]?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") {
        onClose();
        requestAnimationFrame(() => document.getElementById("portal-menu-button")?.focus());
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) return;
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
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  async function logout() {
    const supabase = createClient();

    // Record the real logout event before ending the authenticated session.
    await supabase.rpc("record_own_auth_event", { p_event: "LOGOUT" });
    await supabase.auth.signOut({ scope: "local" });

    // Still required temporarily by the other three role portals while their
    // domain data remains on the compatibility layer.
    clearDemoSession();

    router.replace("/");
    router.refresh();
  }

  return (
    <>
      <button className={`sidebar-scrim ${open ? "is-visible" : ""}`} type="button" onClick={onClose} aria-label="Close navigation" />
      <aside ref={sidebarRef} id="portal-sidebar" className={`portal-sidebar ${open ? "is-open" : ""}`} aria-label={`${meta.portalName} navigation`}>
        <div className="sidebar-brand">
          <Image src="/assets/images/plp_logo.png" alt="PLP seal" width={52} height={52} />
          <div><strong>{meta.portalName}</strong><span>PLP Enrollment System</span></div>
        </div>
        <nav className="sidebar-nav">
          {meta.navigation.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return <NavigationItem key={item.href} item={item} active={active} onNavigate={onClose} />;
          })}
        </nav>
        <div className="sidebar-bottom">
          <Link className={`sidebar-profile ${pathname === meta.profileHref ? "is-active" : ""}`} href={meta.profileHref} onClick={onClose}>
            <span className="profile-avatar" aria-hidden="true">{user.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>
            <span><strong>{user.name}</strong><small>{user.subtitle}</small></span>
          </Link>
          <button className="sidebar-link logout-link" type="button" onClick={logout}><AppIcon name="logout" /><span>Logout</span></button>
        </div>
      </aside>
    </>
  );
}
