'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Layers, ZoomIn, ZoomOut, Compass, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MOCK_FIELDS } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

interface MapPlaceholderProps {
  selectedFieldId: string | null;
  onFieldSelect: (polyId: string) => void;
  layers: Record<string, boolean>;
}

// Pseudo field polygons as simplified SVG paths (normalized 0-1 bounding box)
const FIELD_SHAPES = MOCK_FIELDS.map((f, i) => ({
  id: f.poly_id,
  label: f.field_name,
  farm: f.farm_name,
  area: f.area_ha,
  // Distribute fields in a grid-like pattern for the mock
  cx: 0.12 + (i % 5) * 0.18,
  cy: 0.2 + Math.floor(i / 5) * 0.38,
  w: 0.12 + f.area_ha * 0.003,
  h: 0.08 + f.area_ha * 0.002,
  rotation: (i * 13) % 25 - 12,
}));

// Result color by tillage/cover class
const CLASS_COLORS: Record<string, string> = {
  likely: '#10b981',
  possible: '#f59e0b',
  'No Cover Crop': '#94a3b8',
  'NO-TILL': '#3b82f6',
  'REDUCED TILL': '#06b6d4',
  'INTENSIVE TILL': '#f97316',
};

export function MapPlaceholder({ selectedFieldId, onFieldSelect, layers }: MapPlaceholderProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; field: typeof FIELD_SHAPES[0] } | null>(null);

  // Simulate field results for coloring
  const fieldColors: Record<string, string> = {
    '69005': CLASS_COLORS['NO-TILL'],
    '69006': CLASS_COLORS['REDUCED TILL'],
    '69007': CLASS_COLORS['INTENSIVE TILL'],
    '69008': CLASS_COLORS['REDUCED TILL'],
    '69009': CLASS_COLORS['likely'],
    '69010': CLASS_COLORS['possible'],
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden map-placeholder">
      {/* Map grid overlay */}
      <svg className="absolute inset-0 w-full h-full opacity-10 pointer-events-none">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Basemap satellite texture suggestion */}
      <div className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle at 30% 40%, rgba(34,197,94,0.3) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(16,185,129,0.2) 0%, transparent 40%), radial-gradient(circle at 50% 20%, rgba(59,130,246,0.15) 0%, transparent 30%)',
        }}
      />

      {/* SVG field boundaries */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1000 600"
        preserveAspectRatio="none"
        onMouseLeave={() => { setHoveredId(null); setTooltip(null); }}
      >
        {FIELD_SHAPES.map((field) => {
          const x = field.cx * 1000;
          const y = field.cy * 600;
          const w = field.w * 1000;
          const h = field.h * 600;
          const isSelected = field.id === selectedFieldId;
          const isHovered = field.id === hoveredId;
          const fillColor = fieldColors[field.id] ?? '#64748b';

          return (
            <g
              key={field.id}
              transform={`rotate(${field.rotation}, ${x + w / 2}, ${y + h / 2})`}
              style={{ cursor: 'pointer' }}
              onClick={() => onFieldSelect(field.id)}
              onMouseEnter={(e) => {
                setHoveredId(field.id);
                const rect = (e.currentTarget.closest('svg') as SVGSVGElement).getBoundingClientRect();
                const svgX = (e.clientX - rect.left) / rect.width * 1000;
                const svgY = (e.clientY - rect.top) / rect.height * 600;
                setTooltip({ x: svgX, y: svgY, field });
              }}
              onMouseLeave={() => { setHoveredId(null); setTooltip(null); }}
            >
              <rect
                x={x} y={y} width={w} height={h}
                fill={fillColor}
                fillOpacity={isSelected ? 0.75 : isHovered ? 0.55 : 0.35}
                stroke={isSelected ? '#ffffff' : isHovered ? '#e2e8f0' : '#64748b'}
                strokeWidth={isSelected ? 2.5 : isHovered ? 1.5 : 1}
                rx={2}
              />
              {w > 80 && h > 30 && (
                <text
                  x={x + w / 2} y={y + h / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="white" fontSize={Math.min(w / 6, 13)} fontWeight="600"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {field.id}
                </text>
              )}
            </g>
          );
        })}

        {/* Tooltip */}
        {tooltip && (
          <g transform={`translate(${Math.min(tooltip.x + 10, 870)}, ${Math.max(tooltip.y - 60, 10)})`}>
            <rect width={130} height={55} rx={4} fill="white" fillOpacity={0.95} stroke="#e2e8f0" strokeWidth={1} />
            <text x={8} y={16} fontSize={11} fontWeight={700} fill="#1e293b">{tooltip.field.id} — {tooltip.field.label}</text>
            <text x={8} y={30} fontSize={10} fill="#64748b">{tooltip.field.farm}</text>
            <text x={8} y={44} fontSize={10} fill="#64748b">{tooltip.field.area?.toFixed(1)} ha</text>
          </g>
        )}
      </svg>

      {/* Map controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <Button size="icon" variant="secondary" className="h-8 w-8 shadow-md">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="secondary" className="h-8 w-8 shadow-md">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="secondary" className="h-8 w-8 shadow-md mt-1">
          <Compass className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Active layers badge */}
      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1">
        <Layers className="h-3.5 w-3.5 text-white/80" />
        <span className="text-[11px] font-medium text-white/90">
          {Object.values(layers).filter(Boolean).length} layers active
        </span>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-3 py-2 backdrop-blur-sm">
        <p className="text-[10px] font-semibold text-white/70 mb-1.5 uppercase tracking-wider">Tillage Classification</p>
        <div className="flex flex-col gap-1">
          {[
            { label: 'No-Till', color: '#3b82f6' },
            { label: 'Reduced Till', color: '#06b6d4' },
            { label: 'Intensive Till', color: '#f97316' },
            { label: 'Cover Crop Likely', color: '#10b981' },
            { label: 'Cover Possible', color: '#f59e0b' },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="h-2.5 w-5 rounded-sm" style={{ backgroundColor: color, opacity: 0.85 }} />
              <span className="text-[10px] text-white/80">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* GEE asset badge */}
      <div className="absolute bottom-3 right-3 rounded-md bg-black/70 px-2.5 py-1.5 backdrop-blur-sm">
        <p className="text-[10px] text-white/50 font-mono leading-tight">GEE Asset</p>
        <p className="text-[11px] text-white/80 font-mono leading-tight">EMEA_France_26</p>
        <p className="text-[10px] text-white/40 leading-tight mt-0.5">Backend connection pending</p>
      </div>

      {/* "Click a field" hint when nothing selected */}
      {!selectedFieldId && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-xl bg-black/50 px-4 py-2.5 text-center backdrop-blur-sm">
            <MapPin className="mx-auto h-5 w-5 text-white/60 mb-1" />
            <p className="text-[12px] font-medium text-white/80">Click a field to analyze</p>
          </div>
        </div>
      )}
    </div>
  );
}
