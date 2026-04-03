'use client';

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { KanbanData, KanbanEntry } from '@/app/dashboard/page';

interface Props {
  kanban:   KanbanData;
  onChange: (data: KanbanData) => void;
}

// ─── Column config ────────────────────────────────────────────────────────────

const COLS: { key: keyof KanbanData; shortLabel: string; accent: string }[] = [
  { key: 'outreachSent', shortLabel: 'Outreach', accent: '#8b5cf6' },
  { key: 'applied',      shortLabel: 'Applied',  accent: '#6366f1' },
  { key: 'interviewing', shortLabel: 'Intrvw',   accent: '#f59e0b' },
  { key: 'offer',        shortLabel: 'Offer',    accent: '#22c55e' },
  { key: 'rejected',     shortLabel: 'Rjctd',    accent: '#ef4444' },
];

// Strength: higher = stronger action (rejected is terminal / special = 0)
const STRENGTH: Record<keyof KanbanData, number> = {
  outreachSent: 1,
  applied:      2,
  interviewing: 3,
  offer:        4,
  rejected:     0,
};

function canMoveTo(from: keyof KanbanData, to: keyof KanbanData): boolean {
  if (to === 'rejected')   return true; // always can mark rejected
  if (from === 'rejected') return true; // can recover from rejected
  return STRENGTH[to] > STRENGTH[from]; // must move forward
}

function fmtDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ─── Draggable card ───────────────────────────────────────────────────────────

function DraggableCard({
  entry, colKey, accent, onRemove,
}: { entry: KanbanEntry; colKey: keyof KanbanData; accent: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.jobId,
    data: { fromCol: colKey },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.35 : 1 }}
      className="flex items-start gap-2 bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] rounded-lg px-2.5 py-2 transition-colors group"
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="mt-1 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
      >
        <div className="w-1.5 h-3.5 flex flex-col justify-between">
          <span className="block w-1.5 h-0.5 rounded-full" style={{ background: accent + '80' }} />
          <span className="block w-1.5 h-0.5 rounded-full" style={{ background: accent + '80' }} />
          <span className="block w-1.5 h-0.5 rounded-full" style={{ background: accent + '80' }} />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-[#ccc] truncate">{entry.company}</p>
        <p className="text-[10px] text-[#444] truncate mb-1.5">{entry.title}</p>

        {/* History context tags */}
        <div className="flex flex-wrap gap-1">
          {entry.outreachSentAt && (
            <span className="text-[9px] bg-violet-500/10 text-violet-400/70 rounded px-1.5 py-0.5 leading-tight">
              outreach {fmtDate(entry.outreachSentAt)}
            </span>
          )}
          {entry.appliedAt && (
            <span className="text-[9px] bg-indigo-500/10 text-indigo-400/70 rounded px-1.5 py-0.5 leading-tight">
              applied {fmtDate(entry.appliedAt)}
            </span>
          )}
          {entry.followUpDueAt && colKey === 'outreachSent' && (
            <span className="text-[9px] bg-amber-500/10 text-amber-400/70 rounded px-1.5 py-0.5 leading-tight">
              follow-up {fmtDate(entry.followUpDueAt)}
            </span>
          )}
          {entry.applyMethod === 'direct' && (
            <span className="text-[9px] bg-white/[0.05] text-[#555] rounded px-1.5 py-0.5 leading-tight">direct</span>
          )}
          {entry.applyMethod === 'outreach+direct' && (
            <span className="text-[9px] bg-green-500/10 text-green-400/70 rounded px-1.5 py-0.5 leading-tight">outreach+direct</span>
          )}
        </div>
      </div>

      <button
        onClick={onRemove}
        className="text-[#333] hover:text-red-400/80 opacity-0 group-hover:opacity-100 transition-all cursor-pointer text-sm leading-none flex-shrink-0 mt-0.5 ml-1"
      >
        ×
      </button>
    </div>
  );
}

// ─── Droppable column tab ─────────────────────────────────────────────────────

function DroppableTab({
  col, count, isActive, isDragging, onClick,
}: { col: typeof COLS[number]; count: number; isActive: boolean; isDragging: boolean; onClick: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });

  const style: React.CSSProperties = isOver && isDragging
    ? { background: col.accent + '28', color: col.accent, outline: `1px solid ${col.accent}55` }
    : isActive
    ? { background: col.accent + '18', color: col.accent }
    : { color: '#3d3d3d' };

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      style={style}
      className="flex-1 text-[9px] py-1.5 rounded-lg transition-all cursor-pointer font-medium truncate px-0.5"
    >
      {col.shortLabel}{count > 0 ? ` ${count}` : ''}
    </button>
  );
}

// ─── Droppable column body ────────────────────────────────────────────────────

function DroppableBody({ colKey, isDragging, children }: {
  colKey: keyof KanbanData; isDragging: boolean; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${colKey}--body` });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 rounded-xl p-2 overflow-y-auto transition-all min-h-0 ${
        isOver && isDragging
          ? 'bg-white/[0.04] border border-dashed border-white/[0.18]'
          : 'border border-dashed border-white/[0.05]'
      }`}
    >
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function KanbanBoard({ kanban, onChange }: Props) {
  const [activeTab,    setActiveTab]    = useState<keyof KanbanData>('outreachSent');
  const [isDragging,   setIsDragging]   = useState(false);
  const [draggedEntry, setDraggedEntry] = useState<KanbanEntry | null>(null);

  const safe = (col: keyof KanbanData): KanbanEntry[] => kanban[col] ?? [];

  function moveEntry(jobId: string, from: keyof KanbanData, to: keyof KanbanData) {
    if (from === to || !canMoveTo(from, to)) return;
    const entry = safe(from).find(e => e.jobId === jobId);
    if (!entry) return;

    // Carry history forward when upgrading to Applied
    const updated: KanbanEntry = { ...entry };
    if (to === 'applied' && !updated.appliedAt) {
      updated.appliedAt = new Date().toISOString();
      if (!updated.applyMethod) updated.applyMethod = 'direct';
    }

    onChange({
      ...kanban,
      [from]: safe(from).filter(e => e.jobId !== jobId),
      [to]:   [...safe(to), updated],
    });
  }

  function removeEntry(jobId: string, col: keyof KanbanData) {
    onChange({ ...kanban, [col]: safe(col).filter(e => e.jobId !== jobId) });
  }

  function handleDragStart(event: DragStartEvent) {
    setIsDragging(true);
    const fromCol = event.active.data.current?.fromCol as keyof KanbanData;
    setDraggedEntry(safe(fromCol).find(e => e.jobId === event.active.id) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setIsDragging(false);
    setDraggedEntry(null);
    const { active, over } = event;
    if (!over) return;

    const fromCol = active.data.current?.fromCol as keyof KanbanData;
    // Support both tab drops (id = colKey) and body drops (id = colKey--body)
    const rawId = over.id as string;
    const toCol  = rawId.endsWith('--body')
      ? rawId.replace('--body', '') as keyof KanbanData
      : rawId as keyof KanbanData;

    if (!fromCol || !toCol || fromCol === toCol) return;
    moveEntry(active.id as string, fromCol, toCol);
    setActiveTab(toCol); // switch view to destination column
  }

  const activeEntries = safe(activeTab);
  const activeCfg     = COLS.find(c => c.key === activeTab)!;

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex-1 flex flex-col overflow-hidden px-4 py-3">

        {/* Section label */}
        <span className="text-[10px] font-semibold text-[#3a3a3a] uppercase tracking-widest mb-3 flex-shrink-0">
          Job Tracker
        </span>

        {/* Column tabs — each is a droppable target */}
        <div className="flex gap-0.5 mb-3 flex-shrink-0">
          {COLS.map(col => (
            <DroppableTab
              key={col.key}
              col={col}
              count={safe(col.key).length}
              isActive={col.key === activeTab}
              isDragging={isDragging}
              onClick={() => setActiveTab(col.key)}
            />
          ))}
        </div>

        {/* Column body — also droppable */}
        <DroppableBody colKey={activeTab} isDragging={isDragging}>
          {activeEntries.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-4">
              <p className="text-[11px] text-[#333]">Drop jobs here</p>
              <p className="text-[10px] text-[#2a2a2a] mt-1">or use Apply on a job card</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {activeEntries.map(entry => (
                <DraggableCard
                  key={entry.jobId}
                  entry={entry}
                  colKey={activeTab}
                  accent={activeCfg.accent}
                  onRemove={() => removeEntry(entry.jobId, activeTab)}
                />
              ))}
            </div>
          )}
        </DroppableBody>
      </div>

      {/* Floating drag preview */}
      <DragOverlay>
        {draggedEntry ? (
          <div className="bg-[#202020] border border-white/[0.15] rounded-lg px-2.5 py-2 shadow-xl shadow-black/60 min-w-[160px]">
            <p className="text-[11px] font-medium text-[#ccc]">{draggedEntry.company}</p>
            <p className="text-[10px] text-[#555]">{draggedEntry.title}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
