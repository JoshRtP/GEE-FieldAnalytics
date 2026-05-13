'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TopBarProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function TopBar({ title, subtitle, actions }: TopBarProps) {
  return (
    <header
      className="flex h-12 shrink-0 items-center justify-between border-b px-6"
      style={{ backgroundColor: '#161b22', borderColor: '#30363d' }}
    >
      <div className="flex flex-col justify-center">
        {title && (
          <h1 className="text-[14px] font-semibold leading-tight text-white">{title}</h1>
        )}
        {subtitle && (
          <p className="text-[11px]" style={{ color: '#8b949e' }}>{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {actions}

        <Button variant="ghost" size="icon" className="relative h-8 w-8 text-gray-400 hover:text-white">
          <Bell className="h-4 w-4" />
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: '#9AD1DC' }}
          />
        </Button>
      </div>
    </header>
  );
}
