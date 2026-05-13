'use client';

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import type { LayerVisibility } from '@/lib/types';
import { Layers } from 'lucide-react';

interface LayerControlsProps {
  layers: LayerVisibility;
  onChange: (layers: LayerVisibility) => void;
  opacity: number;
  onOpacityChange: (v: number) => void;
}

const LAYER_LABELS: { key: keyof LayerVisibility; label: string; color: string }[] = [
  { key: 'cropMap', label: 'Crop map (EUCROPMAP)', color: 'bg-yellow-400' },
  { key: 'ndvi', label: 'NDVI', color: 'bg-green-500' },
  { key: 'evi', label: 'EVI', color: 'bg-emerald-500' },
  { key: 'ndti', label: 'NDTI (Tillage)', color: 'bg-blue-600' },
  { key: 'ndmi', label: 'NDMI (Moisture)', color: 'bg-teal-500' },
  { key: 's2', label: 'S2 False Color', color: 'bg-red-400' },
  { key: 'coverProxy', label: 'Cover Proxy', color: 'bg-emerald-700' },
  { key: 'tillageProxy', label: 'Tillage Proxy', color: 'bg-blue-800' },
  { key: 'tillageEventMask', label: 'Tillage Event Mask', color: 'bg-fuchsia-600' },
];

export function LayerControls({ layers, onChange, opacity, onOpacityChange }: LayerControlsProps) {
  const toggle = (key: keyof LayerVisibility) =>
    onChange({ ...layers, [key]: !layers[key] });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Layers className="h-3.5 w-3.5" /> Layer Controls
      </div>

      {LAYER_LABELS.map(({ key, label, color }) => (
        <div key={key} className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-sm shrink-0 ${color}`} />
          <Label className="flex-1 text-[12px] cursor-pointer">{label}</Label>
          <Switch
            checked={layers[key]}
            onCheckedChange={() => toggle(key)}
            className="scale-75"
          />
        </div>
      ))}

      <div className="pt-2 border-t border-border space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] text-muted-foreground">Overlay opacity</Label>
          <span className="text-[11px] font-medium tabular-nums">{Math.round(opacity * 100)}%</span>
        </div>
        <Slider
          min={0} max={1} step={0.05} value={[opacity]}
          onValueChange={([v]) => onOpacityChange(v)}
          className="h-4"
        />
      </div>
    </div>
  );
}
