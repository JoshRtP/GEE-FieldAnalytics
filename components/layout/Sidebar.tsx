'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FolderOpen,
  Map,
  ListFilter,
  History,
  Download,
  FileText,
  Settings,
  ShieldCheck,
  Leaf,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { useState } from 'react';

const PROJECT_ID = '00000000-0000-0000-0000-000000000010';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
}

const topNav: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: 'Projects', href: '/projects', icon: <FolderOpen className="h-4 w-4" /> },
];

const projectNav: NavItem[] = [
  { label: 'Map Workspace', href: `/projects/${PROJECT_ID}/workspace`, icon: <Map className="h-4 w-4" /> },
  { label: 'Fields', href: `/projects/${PROJECT_ID}/fields`, icon: <ListFilter className="h-4 w-4" /> },
  { label: 'Run History', href: `/projects/${PROJECT_ID}/runs`, icon: <History className="h-4 w-4" /> },
  { label: 'Exports', href: `/projects/${PROJECT_ID}/exports`, icon: <Download className="h-4 w-4" /> },
  { label: 'Reports', href: `/projects/${PROJECT_ID}/reports`, icon: <FileText className="h-4 w-4" /> },
  { label: 'Project Settings', href: `/projects/${PROJECT_ID}/settings`, icon: <Settings className="h-4 w-4" /> },
];

const bottomNav: NavItem[] = [
  { label: 'Admin', href: '/admin', icon: <ShieldCheck className="h-4 w-4" /> },
];

export function Sidebar() {
  const pathname = usePathname();
  const [projectExpanded, setProjectExpanded] = useState(true);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <Leaf className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <p className="text-[13px] font-semibold leading-tight text-foreground">FieldAnalytics</p>
          <p className="text-[10px] text-muted-foreground">Enterprise</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2 scrollbar-thin">
        {/* Top nav */}
        {topNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        {/* Project section */}
        <div className="mt-3">
          <button
            onClick={() => setProjectExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <span>Current Project</span>
            <ChevronRight
              className={cn('h-3 w-3 transition-transform', projectExpanded && 'rotate-90')}
            />
          </button>

          {projectExpanded && (
            <div className="mt-0.5 rounded-md border border-border bg-muted/40 px-1.5 py-1 mb-1">
              <p className="truncate px-1 text-[11px] font-medium text-foreground">EMEA France 26</p>
              <p className="truncate px-1 text-[10px] text-muted-foreground">247 fields · Active</p>
            </div>
          )}

          {projectExpanded &&
            projectNav.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} indent />
            ))}
        </div>

        <div className="flex-1" />

        {/* Status dot */}
        <div className="mb-1 flex items-center gap-2 rounded-md px-2 py-1.5">
          <Activity className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-[11px] text-muted-foreground">1 run in progress</span>
        </div>

        {/* Bottom nav */}
        <div className="border-t border-border pt-2">
          {bottomNav.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </div>
      </nav>
    </aside>
  );
}

function NavLink({
  item,
  active,
  indent,
}: {
  item: NavItem;
  active: boolean;
  indent?: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={cn(
        'group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors',
        indent && 'ml-1',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <span className={cn(active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')}>
        {item.icon}
      </span>
      {item.label}
      {item.badge && (
        <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
          {item.badge}
        </span>
      )}
    </Link>
  );
}
