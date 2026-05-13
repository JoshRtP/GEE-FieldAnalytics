'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getFields, searchFields } from '@/lib/api';
import { MOCK_FIELD_RESULTS } from '@/lib/mock-data';
import type { Field } from '@/lib/types';
import Link from 'next/link';
import { Search, MapPin, ArrowRight, Sprout, Tractor, Import as SortAsc, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const COVER_COLORS: Record<string, string> = {
  likely: 'bg-emerald-100 text-emerald-800',
  possible: 'bg-amber-100 text-amber-800',
  'No Cover Crop': 'bg-slate-100 text-slate-600',
};
const TILLAGE_COLORS: Record<string, string> = {
  'NO-TILL': 'bg-blue-100 text-blue-800',
  'REDUCED TILL': 'bg-cyan-100 text-cyan-800',
  'INTENSIVE TILL': 'bg-orange-100 text-orange-800',
};

const PAGE_SIZE = 20;

export default function FieldsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [fields, setFields] = useState<Field[]>([]);
  const [filtered, setFiltered] = useState<Field[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    getFields(projectId).then((f) => {
      setFields(f);
      setFiltered(f);
    }).finally(() => setLoading(false));
  }, [projectId]);

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (!q.trim()) { setFiltered(fields); return; }
    const results = await searchFields(projectId, q);
    setFiltered(results);
    setPage(0);
  };

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TopBar
        title="Fields"
        subtitle={`${fields.length} fields in this project`}
        actions={
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={`/projects/${projectId}/workspace`}>
              <MapPin className="h-3.5 w-3.5" /> View on map
            </Link>
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
        {/* Search and filters */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by poly_id, mrv_field_id, field or farm name..."
              className="pl-8 h-9 text-[13px]"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <Select defaultValue="all">
            <SelectTrigger className="h-9 w-40 text-[13px]">
              <Filter className="h-3.5 w-3.5 mr-1" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All fields</SelectItem>
              <SelectItem value="cover-likely">Cover crop likely</SelectItem>
              <SelectItem value="no-till">No-till</SelectItem>
              <SelectItem value="needs-review">Needs review</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="poly_id">
            <SelectTrigger className="h-9 w-36 text-[13px]">
              <SortAsc className="h-3.5 w-3.5 mr-1" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="poly_id">Sort by ID</SelectItem>
              <SelectItem value="area">Sort by area</SelectItem>
              <SelectItem value="farm">Sort by farm</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results summary */}
        <p className="text-[12px] text-muted-foreground mb-3">
          Showing {visible.length} of {filtered.length} fields
          {query && ` matching "${query}"`}
        </p>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Search className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-[13px] text-muted-foreground">No fields found matching "{query}"</p>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-7 gap-2 bg-muted/60 px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span className="col-span-1">Poly ID</span>
                <span className="col-span-2">Field / Farm</span>
                <span className="col-span-1 text-right">Area</span>
                <span className="col-span-1">Cover Crop</span>
                <span className="col-span-1">Tillage</span>
                <span className="col-span-1 text-right">Actions</span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-border bg-card">
                {visible.map((field) => {
                  const result = MOCK_FIELD_RESULTS[field.poly_id];
                  return (
                    <div key={field.id} className="grid grid-cols-7 gap-2 items-center px-4 py-2.5 hover:bg-muted/30 transition-colors text-[13px]">
                      <span className="font-mono font-semibold text-primary col-span-1">{field.poly_id}</span>
                      <div className="col-span-2 min-w-0">
                        <p className="font-medium truncate">{field.field_name ?? '—'}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{field.farm_name ?? '—'}</p>
                      </div>
                      <span className="col-span-1 text-right text-muted-foreground tabular-nums">
                        {field.area_ha?.toFixed(1) ?? '—'} ha
                      </span>
                      <span className="col-span-1">
                        {result?.cover_class ? (
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', COVER_COLORS[result.cover_class] ?? 'bg-slate-100 text-slate-600')}>
                            {result.cover_class}
                          </span>
                        ) : '—'}
                      </span>
                      <span className="col-span-1">
                        {result?.tillage_class ? (
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', TILLAGE_COLORS[result.tillage_class] ?? 'bg-slate-100 text-slate-600')}>
                            {result.tillage_class}
                          </span>
                        ) : '—'}
                      </span>
                      <div className="col-span-1 flex justify-end gap-1">
                        <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="View on map">
                          <Link href={`/projects/${projectId}/workspace?field=${field.poly_id}`}>
                            <MapPin className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="View details">
                          <Link href={`/projects/${projectId}/workspace?field=${field.poly_id}`}>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-[12px] text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </p>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-8 gap-1" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1" disabled={page === totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
