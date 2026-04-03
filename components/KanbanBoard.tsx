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

const COLS: { key: keyof KanbanData; shortLabel: string; label: string; accent: string }[] = [
  { key: 'outreachSent', shortLabel: 'Outreach', label: 'Outreach Sent', accent: '#8b5cf6' },
  { key: 'applied',      shortLabel: 'Applied',  label: 'Applied',       accent: '#6366f1' },
  { key: 'interviewing', shortLabel: 'Intrvw',   label: 'Interviewing',  accent: '#f59e0b' },
  { key: 'offer',        shortLabel: 'Offer',    label: 'Offer',         accent: '#22c55e' },
  { key: 'rejected',     shortLabel: 'Rjctd',    label: 'Rejected',      accent: '#ef4444' },
];

const STRENGTH: Record<keyof KanbanData, number> = {
  outreachSent: 1,
  applied:      2,
  interviewing: 3,
  offer:        4,
  rejected:     0,
};

function canMoveTo(from: keyof KanbanData, to: keyof KanbanData): boolean {
  if (to === 'rejected')   return true;
  if (from === 'rejected') return true;
  return STRENGTH[to] > STRENGTH[from];
}

function fmtDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

function KanbanDetailDrawer({
  entry,
  colKey,
  onClose,
  onDelete,
}: {
  entry:    KanbanEntry;
  colKey:   keyof KanbanData;
  onClose:  () => void;
  onDelete: () => void;
}) {
  const col     = COLS.find(c => c.key === colKey)!;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const historyRows: { label: string; value: string }[] = [];
  if (entry.addedAt)         historyRows.push({ label: 'Added to tracker', value: fmtDate(entry.addedAt) });
  if (entry.outreachSentAt)  historyRows.push({ label: 'Outreach sent',    value: fmtDate(entry.outreachSentAt) });
  if (entry.appliedAt)       historyRows.push({ label: 'Applied',          value: fmtDate(entry.appliedAt) });
  if (entry.followUpDueAt)   historyRows.push({ label: 'Follow-up due',    value: fmtDate(entry.followUpDueAt) });

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 w-[260px] z-50 bg-[#141414] border-r border-white/[0.08] flex flex-col shadow-2xl shadow-black/60">

        {/* Header */}
        <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-white/[0.07] flex-shrink-0">
          <div className="flex-1 min-w-0 pr-2">
            <p className="text-[13px] font-semibold text-[#e0e0e0] leading-snug truncate">{entry.title}</p>
            <p className="text-[11px] text-[#555] mt-0.5 truncate">{entry.company}</p>
          </div>
          <button
            onClick={onClose}
            className="text-[#444] hover:text-[#888] text-lg leading-none cursor-pointer transition-colors flex-shrink-0 mt-0.5"
          >✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* Current stage */}
          <div>
            <p className="text-[10px] font-semibold text-[#333] uppercase tracking-widest mb-2">Current Stage</p>
            <span
              className="text-[11px] px-2.5 py-1 rounded-full font-medium"
              style={{ background: col.accent + '20', color: col.accent }}
            >
              {col.label}
            </span>
          </div>

          {/* Apply method */}
          {entry.applyMethod && (
            <div>
              <p className="text-[10px] font-semibold text-[#333] uppercase tracking-widest mb-2">Method</p>
              <span className="text-[11px] text-[#555] capitalize">{entry.applyMethod.replace('+', ' + ')}</span>
            </div>
          )}

          {/* Job link */}
          {entry.jobUrl && (
            <div>
              <p className="text-[10px] font-semibold text-[#333] uppercase tracking-widest mb-2">Job Link</p>
              <a
                href={entry.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-indigo-400 hover:underline truncate block"
              >
                View job posting ↗
              </a>
            </div>
          )}

          {/* Timeline */}
          {historyRows.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[#333] uppercase tracking-widest mb-2">Timeline</p>
              <div className="space-y-2">
                {historyRows.map((row, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-[11px] text-[#444]">{row.label}</span>
                    <span className="text-[11px] text-[#666] tabular-nums">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Outreach history summary */}
          {(entry.outreachSentAt || entry.appliedAt) && (
            <div>
              <p className="text-[10px] font-semibold text-[#333] uppercase tracking-widest mb-2">Outreach History</p>
              <div className="space-y-1.5">
                {entry.outreachSentAt && (
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500/60 flex-shrink-0" />
                    <span className="text-[11px] text-[#555]">Outreach sent · {fmtDate(entry.outreachSentAt)}</span>
                  </div>
                )}
                {entry.appliedAt && (
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/60 flex-shrink-0" />
                    <span className="text-[11px] text-[#555]">Applied · {fmtDate(entry.appliedAt)}</span>
                  </div>
                )}
                {entry.followUpDueAt && (
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 flex-shrink-0" />
                    <span className="text-[11px] text-[#555]">Follow-up due · {fmtDate(entry.followUpDueAt)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer — delete */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-white/[0.07]">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#555] flex-1">Remove from tracker?</span>
              <button
                onClick={onDelete}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer"
              >
                Remove
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.04] text-[#555] hover:text-[#888] transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-2 rounded-lg border border-red-500/20 text-[11px] text-red-400/70 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-all cursor-pointer"
            >
              Delete from tracker
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Draggable card ───────────────────────────────────────────────────────────

function DraggableCard({
  entry, colKey, accent, onRemove, onOpen,
}: {
  entry:   KanbanEntry;
  colKey:  keyof KanbanData;
  accent:  string;
  onRemove: () => void;
  onOpen:   () => void;
}) {
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

      {/* Clickable body — opens detail drawer */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
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
  const [drawerEntry,  setDrawerEntry]  = useState<{ entry: KanbanEntry; colKey: keyof KanbanData } | null>(null);

  const safe = (col: keyof KanbanData): KanbanEntry[] => kanban[col] ?? [];

  function moveEntry(jobId: string, from: keyof KanbanData, to: keyof KanbanData) {
    if (from === to || !canMoveTo(from, to)) return;
    const entry = safe(from).find(e => e.jobId === jobId);
    if (!entry) return;

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
    if (drawerEntry?.entry.jobId === jobId) setDrawerEntry(null);
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
    const rawId   = over.id as string;
    const toCol   = rawId.endsWith('--body')
      ? rawId.replace('--body', '') as keyof KanbanData
      : rawId as keyof KanbanData;

    if (!fromCol || !toCol || fromCol === toCol) return;
    moveEntry(active.id as string, fromCol, toCol);
    setActiveTab(toCol);
  }

  const activeEntries = safe(activeTab);
  const activeCfg     = COLS.find(c => c.key === activeTab)!;

  return (
    <>
      <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 flex flex-col overflow-hidden px-4 py-3">

          <span className="text-[10px] font-semibold text-[#3a3a3a] uppercase tracking-widest mb-3 flex-shrink-0">
            Job Tracker
          </span>

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
                    onOpen={() => setDrawerEntry({ entry, colKey: activeTab })}
                  />
                ))}
              </div>
            )}
          </DroppableBody>
        </div>

        <DragOverlay>
          {draggedEntry ? (
            <div className="bg-[#202020] border border-white/[0.15] rounded-lg px-2.5 py-2 shadow-xl shadow-black/60 min-w-[160px]">
              <p className="text-[11px] font-medium text-[#ccc]">{draggedEntry.company}</p>
              <p className="text-[10px] text-[#555]">{draggedEntry.title}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Detail drawer — rendered outside DndContext to avoid z-index issues */}
      {drawerEntry && (
        <KanbanDetailDrawer
          entry={drawerEntry.entry}
          colKey={drawerEntry.colKey}
          onClose={() => setDrawerEntry(null)}
          onDelete={() => removeEntry(drawerEntry.entry.jobId, drawerEntry.colKey)}
        />
      )}
    </>
  );
}
