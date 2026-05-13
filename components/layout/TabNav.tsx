'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CircleUser, FolderOpen, Calculator, List, ChartBar as BarChart2, BookOpen, Key, MessageSquare, Settings, ShieldCheck, LayoutDashboard } from 'lucide-react';

const PROJECT_ID = '00000000-0000-0000-0000-000000000010';

interface TabItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const TABS: TabItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: 'Projects', href: '/projects', icon: <FolderOpen className="h-4 w-4" /> },
  { label: 'Workspace', href: `/projects/${PROJECT_ID}/workspace`, icon: <Calculator className="h-4 w-4" /> },
  { label: 'Fields', href: `/projects/${PROJECT_ID}/fields`, icon: <List className="h-4 w-4" /> },
  { label: 'Runs', href: `/projects/${PROJECT_ID}/runs`, icon: <BarChart2 className="h-4 w-4" /> },
  { label: 'Exports', href: `/projects/${PROJECT_ID}/exports`, icon: <BookOpen className="h-4 w-4" /> },
  { label: 'Reports', href: `/projects/${PROJECT_ID}/reports`, icon: <BarChart2 className="h-4 w-4" /> },
  { label: 'Settings', href: `/projects/${PROJECT_ID}/settings`, icon: <Settings className="h-4 w-4" /> },
  { label: 'Admin', href: '/admin', icon: <ShieldCheck className="h-4 w-4" /> },
];

export function TabNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && href !== '/projects' && pathname.startsWith(href));

  return (
    <nav
      className="shrink-0 border-b px-4 py-2"
      style={{ backgroundColor: '#161b22', borderColor: '#30363d' }}
    >
      <div
        className="flex gap-1 rounded-lg border p-1"
        style={{ backgroundColor: '#161b22', borderColor: '#30363d' }}
      >
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-all duration-150 whitespace-nowrap',
                active
                  ? 'shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              )}
              style={
                active
                  ? { backgroundColor: '#9AD1DC', color: '#131f48' }
                  : undefined
              }
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '#21262d';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '';
                }
              }}
            >
              <span className={cn('shrink-0', active ? '' : 'text-gray-500')}>
                {tab.icon}
              </span>
              <span className="hidden sm:inline">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
