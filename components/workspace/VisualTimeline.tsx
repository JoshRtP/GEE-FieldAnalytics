'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, ChevronLeft, ChevronRight, Eye, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VisualTimelineProps {
  fieldId: string | null;
  weeks: string[];
  loading: boolean;
}

type IndexType = 'NDVI' | 'EVI' | 'NDTI' | 'NDMI' | 'S2';

const INDEX_COLORS: Record<IndexType, { gradient: string; label: string }> = {
  NDVI: { gradient: 'from-yellow-900 via-lime-500 to-green-800', label: 'Vegetation Index' },
  EVI: { gradient: 'from-slate-900 via-blue-600 to-lime-400', label: 'Enhanced Veg. Index' },
  NDTI: { gradient: 'from-red-700 via-amber-300 to-blue-700', label: 'Tillage Index' },
  NDMI: { gradient: 'from-amber-900 via-stone-300 to-teal-600', label: 'Moisture Index' },
  S2: { gradient: 'from-slate-800 via-orange-700 to-red-500', label: 'False Color CIR' },
};

function ThumbnailCell({
  week,
  index,
  value,
  isValid,
}: {
  week: string;
  index: IndexType;
  value: number;
  isValid: boolean;
}) {
  const { gradient } = INDEX_COLORS[index];

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          'relative rounded overflow-hidden border border-border/60 transition-all hover:scale-105 hover:shadow-md cursor-pointer',
          !isValid && 'opacity-40 grayscale'
        )}
        style={{ width: 72, height: 72 }}
      >
        <div className={cn('absolute inset-0 bg-gradient-to-br', gradient)} style={{ opacity: 0.6 + value * 0.4 }} />
        {/* Simulated pixel variation */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `radial-gradient(circle at ${20 + value * 40}% ${30 + value * 30}%, rgba(255,255,255,0.4), transparent 60%)`,
          }}
        />
        {!isValid && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <span className="text-[9px] text-white/80 font-medium">No data</span>
          </div>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground font-mono">{week.slice(5)}</span>
    </div>
  );
}

export function VisualTimeline({ fieldId, weeks, loading }: VisualTimelineProps) {
  const [selectedIndex, setSelectedIndex] = useState<IndexType>('NDVI');
  const [page, setPage] = useState(0);
  const itemsPerPage = 10;

  const totalPages = Math.ceil(weeks.length / itemsPerPage);
  const visibleWeeks = weeks.slice(page * itemsPerPage, (page + 1) * itemsPerPage);

  // Generate pseudo NDVI values for visualization
  const pseudoValues = weeks.map((w, i) => {
    const t = i / Math.max(weeks.length - 1, 1);
    return 0.2 + Math.sin(t * Math.PI * 1.5) * 0.45 + Math.random() * 0.1;
  });
  const isValid = weeks.map((_, i) => pseudoValues[i] > 0.05 && Math.random() > 0.15);

  if (!fieldId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[12px] text-muted-foreground">Select a field to view timeline</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-[12px] font-semibold">Visual Timeline</span>
        <span className="text-[11px] text-muted-foreground">Field {fieldId}</span>
        {weeks.length > 0 && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-auto">{weeks.length} weeks</Badge>
        )}
        <Select value={selectedIndex} onValueChange={(v) => setSelectedIndex(v as IndexType)}>
          <SelectTrigger className="h-7 w-28 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(INDEX_COLORS) as IndexType[]).map((idx) => (
              <SelectItem key={idx} value={idx} className="text-[12px]">{idx}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Thumbnails */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-3 py-2">
        {loading ? (
          <div className="flex gap-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 w-[72px] shrink-0 rounded" />)}
          </div>
        ) : weeks.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[12px] text-muted-foreground">No S2 data available for selected date range</p>
          </div>
        ) : (
          <div className="flex gap-2 h-full items-start pt-1">
            {visibleWeeks.map((week, i) => {
              const globalI = page * itemsPerPage + i;
              return (
                <ThumbnailCell
                  key={week}
                  week={week}
                  index={selectedIndex}
                  value={Math.max(0, Math.min(1, pseudoValues[globalI]))}
                  isValid={isValid[globalI]}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-3 py-1.5">
          <Button
            variant="ghost" size="sm" className="h-7 gap-1 text-[11px]"
            disabled={page === 0} onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="ghost" size="sm" className="h-7 gap-1 text-[11px]"
            disabled={page === totalPages - 1} onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
