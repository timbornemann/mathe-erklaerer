import React, { useMemo, useState } from 'react';
import { Loader2, Plus, Send, X } from 'lucide-react';
import { PracticeRoom } from '../types';

const DIFFICULTY_OPTIONS = [
  { value: 'Einfach', label: 'Einfach' },
  { value: 'Mittel', label: 'Mittel' },
  { value: 'Schwer', label: 'Schwer' },
  { value: 'Sehr Schwer', label: 'Sehr Schwer' },
  { value: 'Uni-Level', label: 'Uni-Level' },
  { value: 'Professor-Level', label: 'Professor-Level' },
  { value: 'custom', label: 'Eigene Beschreibung ...' }
];

const DURATION_OPTIONS = [10, 15, 20, 30, 45, 60, 75, 90, 105, 120];

export interface ExamConfig {
  topic: string;
  difficulty: string;
  taskCount: number;
  durationMinutes: number;
  exampleTasks: string[];
}

interface ExamSetupProps {
  isLoading: boolean;
  onStart: (config: ExamConfig) => void;
  practiceRooms?: PracticeRoom[];
}

const ExamSetup: React.FC<ExamSetupProps> = ({ isLoading, onStart, practiceRooms = [] }) => {
  const [topic, setTopic] = useState('');
  const [difficultyPreset, setDifficultyPreset] = useState('Mittel');
  const [customDifficulty, setCustomDifficulty] = useState('');
  const [taskCount, setTaskCount] = useState(5);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [exampleTasks, setExampleTasks] = useState<string[]>(['']);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedPracticeRoomIds, setSelectedPracticeRoomIds] = useState<string[]>([]);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);

  const difficulty = difficultyPreset === 'custom' ? customDifficulty : difficultyPreset;
  const selectablePracticeRooms = useMemo(
    () =>
      [...practiceRooms].sort((a, b) => {
        if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
        return a.topic.localeCompare(b.topic, 'de');
      }),
    [practiceRooms]
  );

  const canSubmit = topic.trim() && difficulty.trim() && taskCount >= 5 && taskCount <= 20 && !isLoading;

  const updateExampleTask = (index: number, value: string) => {
    setExampleTasks((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const addExampleTask = () => {
    setExampleTasks((prev) => [...prev, '']);
  };

  const removeExampleTask = (index: number) => {
    setExampleTasks((prev) => prev.filter((_, i) => i !== index));
  };

  const togglePracticeRoomSelection = (roomId: string) => {
    setSelectedPracticeRoomIds((prev) =>
      prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]
    );
  };

  const dedupeNormalized = (values: string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];

    values.forEach((value) => {
      const normalized = value.trim();
      if (!normalized) return;
      const key = normalized.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(normalized);
    });

    return result;
  };

  const handleImportFromPracticeRooms = () => {
    const selectedRooms = selectablePracticeRooms.filter((room) => selectedPracticeRoomIds.includes(room.id));
    if (selectedRooms.length === 0) return;

    const importedTopics = dedupeNormalized(selectedRooms.map((room) => room.topic));
    const importedExampleTasks = dedupeNormalized(selectedRooms.flatMap((room) => room.exampleTasks ?? []));

    setTopic((prev) => {
      const existingParts = dedupeNormalized(prev.split('|'));
      const mergedParts = dedupeNormalized([...existingParts, ...importedTopics]);
      return mergedParts.join(' | ');
    });

    setExampleTasks((prev) => {
      const existing = dedupeNormalized(prev);
      const merged = dedupeNormalized([...existing, ...importedExampleTasks]);
      return merged.length > 0 ? merged : [''];
    });

    setImportFeedback(
      `${selectedRooms.length} Lernraeume importiert: ${importedTopics.length} Themen und ${importedExampleTasks.length} Beispielaufgaben uebernommen.`
    );
    setSelectedPracticeRoomIds([]);
    setIsImportModalOpen(false);
  };

  const handleStart = () => {
    if (!canSubmit) return;
    onStart({
      topic: topic.trim(),
      difficulty: difficulty.trim(),
      taskCount,
      durationMinutes,
      exampleTasks: exampleTasks.filter((item) => item.trim())
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Thema</label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="z. B. Lineare Algebra, Analysis, Stochastik ..."
          className="h-24 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-base text-slate-700 placeholder:text-slate-400 transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Schwierigkeit</label>
          <select
            value={difficultyPreset}
            onChange={(e) => setDifficultyPreset(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-base text-slate-700 transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200"
          >
            {DIFFICULTY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {difficultyPreset === 'custom' && (
            <input
              type="text"
              value={customDifficulty}
              onChange={(e) => setCustomDifficulty(e.target.value)}
              placeholder="z. B. 2. Semester Maschinenbau ..."
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-base text-slate-700 placeholder:text-slate-400 transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200"
            />
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Aufgaben</label>
          <select
            value={taskCount}
            onChange={(e) => setTaskCount(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-base text-slate-700 transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200"
          >
            {Array.from({ length: 16 }, (_, index) => index + 5).map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Zeitlimit</label>
        <select
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-base text-slate-700 transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200"
        >
          {DURATION_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} Minuten
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-700">Aus Lernraeumen importieren</p>
            <p className="text-xs text-slate-500">Optional: Themen und Beispielaufgaben aus Aufgaben-ueben uebernehmen.</p>
          </div>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
          >
            Auswahl oeffnen
          </button>
        </div>
        {importFeedback && <p className="mt-2 text-xs text-emerald-700">{importFeedback}</p>}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">
          Beispielaufgaben <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <div className="space-y-2">
          {exampleTasks.map((task, index) => (
            <div key={index} className="flex items-start gap-2">
              <textarea
                value={task}
                onChange={(e) => updateExampleTask(index, e.target.value)}
                placeholder="z. B. Berechne die Eigenwerte der Matrix ..."
                rows={2}
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 placeholder:text-slate-400 transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200"
              />
              {exampleTasks.length > 1 && (
                <button
                  onClick={() => removeExampleTask(index)}
                  className="mt-1.5 rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
                  title="Beispiel entfernen"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={addExampleTask}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Beispielaufgabe hinzufuegen
        </button>
      </div>

      <div className="flex justify-end pt-1">
        <button
          onClick={handleStart}
          disabled={!canSubmit}
          className="flex w-full items-center justify-center space-x-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-8 sm:text-lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Pruefung wird vorbereitet ...</span>
            </>
          ) : (
            <>
              <Send className="h-5 w-5" />
              <span>Pruefung starten</span>
            </>
          )}
        </button>
      </div>

      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <button
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm"
            onClick={() => setIsImportModalOpen(false)}
            aria-label="Modal schliessen"
          />
          <div className="relative z-10 max-h-[92vh] w-full overflow-hidden rounded-t-3xl border border-slate-100 bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
              <div>
                <h3 className="text-base font-bold text-slate-800">Lernraeume importieren</h3>
                <p className="text-xs text-slate-500">Mehrere Lernraeume auswaehlen und Inhalte anhaengen.</p>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4 sm:p-5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">{selectedPracticeRoomIds.length} ausgewaehlt</span>
                <span className="text-slate-500">{selectablePracticeRooms.length} verfuegbar</span>
              </div>

              {selectablePracticeRooms.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Noch keine Lernraeume vorhanden.
                </p>
              ) : (
                <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                  {selectablePracticeRooms.map((room) => {
                    const isSelected = selectedPracticeRoomIds.includes(room.id);
                    return (
                      <label
                        key={room.id}
                        className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 transition-colors ${
                          isSelected
                            ? 'border-indigo-200 bg-indigo-50'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => togglePracticeRoomSelection(room.id)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-700">{room.topic}</span>
                          <span className="block text-xs text-slate-500">
                            {room.difficulty} · {room.exampleTasks.length} Beispielaufgaben
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:flex-row sm:justify-end">
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleImportFromPracticeRooms}
                disabled={selectedPracticeRoomIds.length === 0}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Auswahl uebernehmen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamSetup;
