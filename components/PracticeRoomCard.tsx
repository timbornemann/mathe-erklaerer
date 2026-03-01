import React from 'react';
import { Trash2, ChevronRight, CheckCircle2, XCircle, BookOpen } from 'lucide-react';
import { PracticeRoom } from '../types';

interface PracticeRoomCardProps {
  room: PracticeRoom;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

const PracticeRoomCard: React.FC<PracticeRoomCardProps> = ({ room, onClick, onDelete }) => {
  const totalTasks = room.generatedTasks.length;
  const correctTasks = room.generatedTasks.filter(t => t.isCorrect === true).length;
  const attemptedTasks = room.generatedTasks.filter(t => t.isCorrect !== undefined).length;

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
          <span className="text-xs text-slate-400">
            {new Date(room.updatedAt).toLocaleDateString()} • {new Date(room.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className="font-semibold text-slate-800 mb-1 line-clamp-1 flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-500 flex-shrink-0" />
          {room.topic}
        </div>

        {room.description && (
          <p className="text-sm text-slate-500 line-clamp-1 mb-1.5">{room.description}</p>
        )}

        {totalTasks > 0 && (
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
        )}
      </div>

      <div className="flex flex-col items-end gap-2">
        <button
          onClick={onDelete}
          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          title="Lernraum löschen"
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
