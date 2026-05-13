'use client';

import Image from 'next/image';
import { ChevronDown, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header() {
  return (
    <header
      className="sticky top-0 z-30 shrink-0 border-b"
      style={{ backgroundColor: '#131f48', borderColor: '#1e2f6a' }}
    >
      <div className="flex h-14 items-center justify-between px-4">
        {/* Left: logo + title */}
        <div className="flex items-center gap-4">
          <Image
            src="/TerraNexus-DarkLogo-Crop.png"
            alt="TerraNexus"
            width={160}
            height={40}
            className="h-9 w-auto object-contain"
            priority
          />
          <div className="border-l pl-4" style={{ borderColor: '#2a3f7a' }}>
            <p className="text-[15px] font-semibold leading-none text-white">FieldAnalytics Enterprise</p>
            <p className="mt-0.5 text-[11px]" style={{ color: 'rgba(147,197,253,0.6)' }}>
              EMEA Field Analytics Platform
            </p>
          </div>
        </div>

        {/* Right: user menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-white/5"
              style={{ borderColor: '#30363d', backgroundColor: '#21262d' }}
            >
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full"
                style={{ backgroundColor: '#9AD1DC' }}
              >
                <User className="h-3.5 w-3.5" style={{ color: '#131f48' }} />
              </div>
              <span>demo</span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Account settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
