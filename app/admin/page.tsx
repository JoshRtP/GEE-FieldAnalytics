'use client';

import { TopBar } from '@/components/layout/TopBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Shield, Users, Globe, Key, Activity, Database, Clock, CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, Settings, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

const MOCK_USERS = [
  { name: 'Alice Martin', email: 'alice@emea-analytics.io', role: 'Admin', lastActive: '2025-05-13', status: 'active' },
  { name: 'Ben Schneider', email: 'ben@emea-analytics.io', role: 'Analyst', lastActive: '2025-05-12', status: 'active' },
  { name: 'Claire Dupont', email: 'claire@emea-analytics.io', role: 'Viewer', lastActive: '2025-04-30', status: 'active' },
  { name: 'David Osei', email: 'david@emea-analytics.io', role: 'Analyst', lastActive: '2025-05-10', status: 'inactive' },
];

const SYSTEM_STATUS = [
  { label: 'Database', value: 'Healthy', ok: true },
  { label: 'Earth Engine Backend', value: 'Pending connection', ok: false },
  { label: 'Export Storage (GCS)', value: 'Configured', ok: true },
  { label: 'Auth Service', value: 'Healthy', ok: true },
];

const ROLE_COLORS: Record<string, string> = {
  Admin: 'bg-blue-100 text-blue-800',
  Analyst: 'bg-emerald-100 text-emerald-800',
  Viewer: 'bg-slate-100 text-slate-600',
};

export default function AdminPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        title="Admin"
        subtitle="Organization settings, user management, and system health"
        actions={
          <Badge variant="outline" className="gap-1 text-[11px]">
            <Lock className="h-3 w-3" /> Admin only
          </Badge>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        <div className="max-w-3xl space-y-8">

          {/* System status */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-[14px] font-semibold">System Status</h2>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              {SYSTEM_STATUS.map((s, i) => (
                <div
                  key={s.label}
                  className={cn('flex items-center justify-between px-4 py-3 text-[13px]', i > 0 && 'border-t border-border')}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn('h-2 w-2 rounded-full', s.ok ? 'bg-emerald-500' : 'bg-amber-400')} />
                    <span className="font-medium">{s.label}</span>
                  </div>
                  <span className={cn('text-[12px]', s.ok ? 'text-muted-foreground' : 'text-amber-600 font-medium')}>
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          {/* Organization */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-[14px] font-semibold">Organization</h2>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">Organization name</span>
                <span className="font-medium">EMEA Analytics</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">Slug</span>
                <code className="font-mono text-[12px] bg-muted px-2 py-0.5 rounded">emea-analytics</code>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">Analytics version</span>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5">emea-v1.0.0</Badge>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">GEE service account</span>
                <span className="font-mono text-[11px] text-muted-foreground">gen-lang-client-0499108456@...</span>
              </div>
            </div>
          </section>

          <Separator />

          {/* User management */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-[14px] font-semibold">Users</h2>
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 ml-auto">{MOCK_USERS.length} members</Badge>
              <Button size="sm" variant="outline" className="h-7 text-[12px] gap-1">
                <Users className="h-3 w-3" /> Invite
              </Button>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="grid grid-cols-4 gap-2 bg-muted/60 px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span className="col-span-1">Name</span>
                <span className="col-span-1">Role</span>
                <span className="col-span-1">Last active</span>
                <span className="col-span-1 text-right">Actions</span>
              </div>
              <div className="divide-y divide-border">
                {MOCK_USERS.map((user) => (
                  <div key={user.email} className="grid grid-cols-4 gap-2 items-center px-4 py-2.5 hover:bg-muted/30 transition-colors text-[13px]">
                    <div className="col-span-1 min-w-0">
                      <p className="font-medium truncate">{user.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <div className="col-span-1">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', ROLE_COLORS[user.role])}>
                        {user.role}
                      </span>
                    </div>
                    <span className="col-span-1 text-[12px] text-muted-foreground">{user.lastActive}</span>
                    <div className="col-span-1 flex justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-[11px]">Edit</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <Separator />

          {/* API keys */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-[14px] font-semibold">API Keys</h2>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium">Backend API Key</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Used by the Earth Engine worker to authenticate with this platform.</p>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-[12px] font-mono bg-muted px-3 py-1.5 rounded border border-border text-muted-foreground">
                    emea_••••••••••••4a2f
                  </code>
                  <Button variant="outline" size="sm" className="h-8 text-[12px]">Rotate</Button>
                </div>
              </div>
            </div>
          </section>

          <Separator />

          {/* Audit log placeholder */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-[14px] font-semibold">Audit Log</h2>
            </div>
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-[13px] font-medium text-foreground">Audit log coming soon</p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Full audit trail of user actions, run events, and data exports will be available here.
              </p>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
