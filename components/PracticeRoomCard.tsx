import React from 'react';
import { Trash2, ChevronRight, CheckCircle2, XCircle, BookOpen, Loader2 } from 'lucide-react';
import { PracticeRoom } from '../types';

interface PracticeRoomCardProps {
  room: PracticeRoom;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

const PracticeRoomCard: React.FC<PracticeRoomCardProps> = ({ room, onClick, onDelete }) => {
  const totalTasks = room.generatedTasks.length;
  const correctTasks = room.generatedTasks.filter((task) => task.isCorrect === true).length;
  const attemptedTasks = room.generatedTasks.filter((task) => task.isCorrect !== undefined).length;
  const isConfiguring = room.status === 'configuring';
  const isFailed = room.status === 'failed';

  const progressPercent = (() => {
    if (typeof room.generationProgress === 'number') {
      return Math.max(0, Math.min(100, Math.round(room.generationProgress)));
    }
    if (!room.pendingTaskCount || room.pendingTaskCount <= 0) return 0;
    const ratio = totalTasks / room.pendingTaskCount;
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  })();

  return (
    <div
      onClick={onClick}
      className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group flex items-start justify-between gap-2"
    >
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-amber-100 text-amber-700">
            Lernraum
          </span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {room.difficulty}
          </span>
          {isConfiguring && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-indigo-100 text-indigo-700">
              <Loader2 className="w-3 h-3 animate-spin" />
              {progressPercent}%
            </span>
          )}
          {isFailed && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-red-100 text-red-700">
              Fehler
            </span>
          )}
          <span className="text-xs text-slate-400">
            {new Date(room.updatedAt).toLocaleDateString()} - {new Date(room.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className="font-semibold text-slate-800 mb-1 line-clamp-1 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-500 flex-shrink-0" />
          {room.topic}
        </div>

        {room.description && <p className="text-sm text-slate-500 line-clamp-1 mb-1.5">{room.description}</p>}

        {isConfiguring ? (
          <div className="text-xs text-indigo-700">Aufgaben werden im Hintergrund erstellt.</div>
        ) : totalTasks > 0 ? (
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              {correctTasks} richtig
            </span>
            {attemptedTasks - correctTasks > 0 && (
              <span className="flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5 text-red-400" />
                {attemptedTasks - correctTasks} falsch
              </span>
            )}
            <span>{totalTasks} Aufgabe{totalTasks !== 1 ? 'n' : ''} gesamt</span>
          </div>
        ) : (
          <div className="text-xs text-slate-400">Noch keine Aufgaben vorhanden.</div>
        )}
      </div>

      <div className="flex flex-col items-end gap-2">
        <button
          onClick={onDelete}
          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          title="Lernraum loeschen"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <div className="p-2 text-indigo-300 group-hover:text-indigo-600 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};

export default PracticeRoomCard;
