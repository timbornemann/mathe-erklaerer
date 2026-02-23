import React, { useState, useRef, useCallback, useEffect } from 'react';
import { solveMathProblem } from './services/gemini';
import SolutionViewer from './components/SolutionViewer';
import MathRenderer from './components/MathRenderer';
import { MathState, InputMode, HistoryItem } from './types';
import { 
  Calculator, 
  Camera, 
  X, 
  Loader2, 
  Send, 
  ImageIcon, 
  Type,
  Clock,
  Trash2,
  ChevronRight,
  GraduationCap
} from 'lucide-react';
import ApiKeyManager from './components/ApiKeyManager';

const App: React.FC = () => {
  const [state, setState] = useState<MathState>({
    isLoading: false,
    inputMode: InputMode.TEXT,
    textInput: '',
    imageFile: null,
    imagePreview: null,
    solution: null,
    error: null,
    history: [],
    tutorLibrary: []
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load history from Local Storage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('mathGeniusHistory');
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory);
        setState(prev => ({ ...prev, history: parsedHistory }));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }

    const savedTutorLibrary = localStorage.getItem('mathGeniusTutorLibrary');
    if (savedTutorLibrary) {
      try {
        const parsedTutorLibrary = JSON.parse(savedTutorLibrary);
        setState(prev => ({ ...prev, tutorLibrary: parsedTutorLibrary }));
      } catch (e) {
        console.error("Failed to parse tutor library", e);
      }
    }
  }, []);

  const saveToHistory = (newItem: HistoryItem) => {
    setState(prev => {
      const updatedHistory = [newItem, ...prev.history].slice(0, 50); // Keep last 50 items
      localStorage.setItem('mathGeniusHistory', JSON.stringify(updatedHistory));

      if (newItem.mode !== InputMode.TUTOR) {
        return { ...prev, history: updatedHistory };
      }

      const updatedTutorLibrary = [newItem, ...prev.tutorLibrary].slice(0, 25);
      localStorage.setItem('mathGeniusTutorLibrary', JSON.stringify(updatedTutorLibrary));

      return { ...prev, history: updatedHistory, tutorLibrary: updatedTutorLibrary };
    });
  };

  const clearHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Möchtest du den gesamten Verlauf wirklich löschen?")) {
      localStorage.removeItem('mathGeniusHistory');
      localStorage.removeItem('mathGeniusTutorLibrary');
      setState(prev => ({ ...prev, history: [], tutorLibrary: [] }));
    }
  };

  const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setState(prev => {
      const updatedHistory = prev.history.filter(item => item.id !== id);
      localStorage.setItem('mathGeniusHistory', JSON.stringify(updatedHistory));

      const updatedTutorLibrary = prev.tutorLibrary.filter(item => item.id !== id);
      localStorage.setItem('mathGeniusTutorLibrary', JSON.stringify(updatedTutorLibrary));

      return { ...prev, history: updatedHistory, tutorLibrary: updatedTutorLibrary };
    });
  };

  const handleModeChange = (mode: InputMode) => {
    setState(prev => ({ ...prev, inputMode: mode, error: null }));
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setState(prev => ({ ...prev, textInput: e.target.value }));
  };

  const handleReset = () => {
    setState(prev => ({
      ...prev,
      isLoading: false,
      inputMode: InputMode.TEXT,
      textInput: '',
      imageFile: null,
      imagePreview: null,
      solution: null,
      error: null,
    }));
  };

  const handleHistoryRestore = (item: HistoryItem) => {
    setState(prev => ({
      ...prev,
      solution: item.solution,
      isLoading: false,
      error: null,
      textInput: item.prompt,
      inputMode: item.mode
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setState(prev => ({
            ...prev,
            imageFile: file,
            imagePreview: reader.result as string,
            error: null
          }));
        };
        reader.readAsDataURL(file);
      } else {
        setState(prev => ({ ...prev, error: "Bitte wähle eine gültige Bilddatei." }));
      }
    }
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setState(prev => ({
              ...prev,
              imageFile: file,
              imagePreview: reader.result as string,
              inputMode: InputMode.IMAGE,
              error: null
            }));
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }
  }, []);

  const removeImage = () => {
    setState(prev => ({ ...prev, imageFile: null, imagePreview: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = useCallback(async () => {
    if (state.isLoading) return;

    if ((state.inputMode === InputMode.TEXT || state.inputMode === InputMode.TUTOR) && !state.textInput.trim()) {
      setState(prev => ({ 
        ...prev, 
        error: state.inputMode === InputMode.TUTOR
          ? "Bitte beschreibe ein Thema oder Sachgebiet für den Tutor-Modus."
          : "Bitte gib eine Matheaufgabe ein."
      }));
      return;
    }

    if (state.inputMode === InputMode.IMAGE && !state.imageFile) {
      setState(prev => ({ ...prev, error: "Bitte lade ein Foto der Aufgabe hoch." }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null, solution: null }));

    try {
      const solution = await solveMathProblem(
        state.textInput, 
        state.imagePreview || undefined,
        state.imageFile?.type,
        state.inputMode
      );

      // Create history item
      const historyItem: HistoryItem = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        mode: state.inputMode,
        prompt: state.textInput || (state.inputMode === InputMode.IMAGE ? "Foto-Analyse" : state.inputMode === InputMode.TUTOR ? "Tutor-Modus" : "Aufgabe"),
        preview: solution.finalAnswer || solution.steps[0]?.title || "Gelöste Aufgabe",
        solution: solution
      };

      saveToHistory(historyItem);
      
      setState(prev => ({ ...prev, solution, isLoading: false }));
    } catch (err: any) {
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: err.message || "Es ist ein Fehler aufgetreten. Bitte versuche es erneut." 
      }));
    }
  }, [state.inputMode, state.textInput, state.imagePreview, state.imageFile, state.isLoading]);

  // If we have a solution, render the viewer instead of the input form
  if (state.solution) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center p-4 md:p-8">
        <header className="w-full max-w-4xl mb-8 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer group" onClick={handleReset}>
            <div className="bg-indigo-600 p-3 rounded-xl shadow-lg shadow-indigo-200 group-hover:bg-indigo-700 transition-colors">
              <Calculator className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">MatheGenius AI</h1>
              <p className="text-sm text-slate-500">Zurück zur Übersicht</p>
            </div>
          </div>
          <ApiKeyManager />
        </header>

        <SolutionViewer 
          solution={state.solution} 
          onReset={handleReset} 
          initialPrompt={state.textInput || (state.inputMode === InputMode.IMAGE ? "Foto-Analyse" : "Dein Mathe-Problem")}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col items-center p-4 md:p-8">
      
      {/* Header */}
      <header className="w-full max-w-4xl mb-8 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-3 rounded-xl shadow-lg shadow-indigo-200">
            <Calculator className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">MatheGenius AI</h1>
            <p className="text-sm text-slate-500">Dein persönlicher Schritt-für-Schritt Tutor</p>
          </div>
        </div>
        <ApiKeyManager />
      </header>

      {/* Main Card */}
      <main className="w-full max-w-4xl bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 transition-all mb-12">
        
        {/* Input Section */}
        <div className="p-6 md:p-8 bg-white">
          
          {/* Tabs */}
          <div className="flex space-x-2 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
            <button
              onClick={() => handleModeChange(InputMode.TEXT)}
              className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                state.inputMode === InputMode.TEXT
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <Type className="w-4 h-4" />
              <span>Text</span>
            </button>
            <button
              onClick={() => handleModeChange(InputMode.IMAGE)}
              className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                state.inputMode === InputMode.IMAGE
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Foto / Scan</span>
            </button>
            <button
              onClick={() => handleModeChange(InputMode.TUTOR)}
              className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                state.inputMode === InputMode.TUTOR
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Tutor-Modus</span>
            </button>
          </div>

          {/* Text Input Mode */}
          {state.inputMode === InputMode.TEXT && (
            <div className="relative">
              <textarea
                value={state.textInput}
                onChange={handleTextChange}
                onPaste={handlePaste}
                placeholder="Gib hier deine Matheaufgabe ein (z.B. 'Löse die Gleichung x^2 - 4 = 0')... Tipp: Du kannst auch ein Bild mit Strg+V einfügen!"
                className="w-full h-32 p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all resize-none text-slate-700 text-lg placeholder:text-slate-400"
              />
            </div>
          )}

          {/* Tutor Input Mode */}
          {state.inputMode === InputMode.TUTOR && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-indigo-900">
                Beschreibe das Thema, das du wirklich von Grund auf lernen möchtest (z.&nbsp;B. <strong>Bruchrechnung</strong>, <strong>lineare Funktionen</strong> oder <strong>quadratische Gleichungen</strong>). 
                Du bekommst dann eine vollständige Lernstrecke mit verständlichen Erklärungen, vorgerechneten Beispielen und Übungsaufgaben mit Musterlösung.
              </div>
              <textarea
                value={state.textInput}
                onChange={handleTextChange}
                placeholder="Welches Thema soll ich dir beibringen? Beschreibe gerne dein Level (z.B. 'Noch nie gehört', 'Grundlagen bekannt', 'bitte ab Klasse 8 Niveau')."
                className="w-full h-40 p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:bg-white transition-all resize-none text-slate-700 text-lg placeholder:text-slate-400"
              />
            </div>
          )}

          {/* Image Input Mode */}
          {state.inputMode === InputMode.IMAGE && (
            <div className="flex flex-col items-center justify-center">
              {!state.imagePreview ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-48 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center bg-slate-50 hover:bg-indigo-50 hover:border-indigo-400 transition-all cursor-pointer group"
                >
                  <div className="bg-white p-4 rounded-full shadow-sm mb-3 group-hover:scale-110 transition-transform">
                    <ImageIcon className="w-8 h-8 text-indigo-500" />
                  </div>
                  <p className="text-slate-600 font-medium">Klicken zum Hochladen</p>
                  <p className="text-xs text-slate-400 mt-1">JPG, PNG, WEBP unterstützt (oder Strg+V)</p>
                </div>
              ) : (
                <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 group">
                  <img 
                    src={state.imagePreview} 
                    alt="Upload Preview" 
                    className="w-full h-64 object-contain opacity-90" 
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={removeImage}
                      className="bg-white/20 backdrop-blur-md hover:bg-white/30 text-white p-3 rounded-full transition-colors"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              
              <div className="w-full mt-4">
                 <textarea
                  value={state.textInput}
                  onChange={handleTextChange}
                  onPaste={handlePaste}
                  placeholder="Zusätzliche Anweisungen (Optional, z.B. 'Nur Aufgabe 2b lösen')..."
                  className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 text-sm text-slate-700"
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {state.error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center space-x-2 text-red-600 text-sm">
              <X className="w-4 h-4" />
              <span>{state.error}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={state.isLoading || ((state.inputMode === InputMode.TEXT || state.inputMode === InputMode.TUTOR) && !state.textInput) || (state.inputMode === InputMode.IMAGE && !state.imageFile)}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 flex items-center space-x-2 transition-all active:scale-95"
            >
              {state.isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{state.inputMode === InputMode.TUTOR ? 'Erstelle Tutor-Lektion...' : 'Löse Aufgabe...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>{state.inputMode === InputMode.TUTOR ? 'Tutor starten' : 'Aufgabe Lösen'}</span>
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* Loading State Visualization */}
        {state.isLoading && (
          <div className="p-12 text-center bg-slate-50/50 border-t border-slate-100">
             <div className="inline-block relative w-20 h-20">
               <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-100 rounded-full animate-pulse"></div>
               <div className="absolute top-0 left-0 w-full h-full border-t-4 border-indigo-600 rounded-full animate-spin"></div>
             </div>
             <p className="mt-6 text-indigo-900 font-medium animate-pulse">
               {state.inputMode === InputMode.TUTOR
                ? 'Die KI erstellt deine Lernsequenz mit Erklärungen und Übungen...'
                : 'Die KI analysiert deine Aufgabe und berechnet die Schritte...'}
             </p>
          </div>
        )}

      </main>

      {/* History Section */}
      {state.history.length > 0 && !state.isLoading && (
        <section className="w-full max-w-4xl animate-in slide-in-from-bottom-8 fade-in duration-500">
           <div className="flex items-center justify-between mb-4 px-2">
             <h3 className="text-xl font-bold text-slate-700 flex items-center gap-2">
               <Clock className="w-5 h-5 text-indigo-500" />
               Verlauf
             </h3>
             <button 
               onClick={clearHistory}
               className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 px-3 py-1 rounded-full hover:bg-red-50 transition-colors"
             >
               <Trash2 className="w-3 h-3" />
               Verlauf löschen
             </button>
           </div>
           
           <div className="grid gap-4 md:grid-cols-1">
             {state.history.map((item) => (
               <div 
                  key={item.id}
                  onClick={() => handleHistoryRestore(item)}
                  className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer group flex items-start justify-between"
               >
                 <div className="flex-1 min-w-0 pr-4">
                   <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        item.mode === InputMode.IMAGE
                          ? 'bg-purple-100 text-purple-700'
                          : item.mode === InputMode.TUTOR
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {item.mode === InputMode.IMAGE ? 'Foto' : item.mode === InputMode.TUTOR ? 'Tutor' : 'Text'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(item.timestamp).toLocaleDateString()} • {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                   </div>
                   
                   {/* Prompt with LaTeX Support */}
                   <div className="font-semibold text-slate-800 mb-1 line-clamp-1">
                      <MathRenderer content={item.prompt} />
                   </div>
                   
                   {/* Preview / Result with LaTeX Support */}
                   <div className="text-sm text-slate-500 line-clamp-2">
                      <span className="font-medium text-slate-400 mr-1">Ergebnis:</span>
                      <MathRenderer content={item.preview} />
                   </div>
                 </div>
                 
                 <div className="flex flex-col items-end gap-2">
                    <button 
                      onClick={(e) => deleteHistoryItem(e, item.id)}
                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                      title="Eintrag löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="p-2 text-indigo-300 group-hover:text-indigo-600 transition-colors">
                      <ChevronRight className="w-5 h-5" />
                    </div>
                 </div>
               </div>
             ))}
           </div>
        </section>
      )}
      
      {state.tutorLibrary.length > 0 && !state.isLoading && (
        <section className="w-full max-w-4xl mb-8">
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-xl font-bold text-slate-700">Tutor-Bibliothek</h3>
            <span className="text-xs text-slate-400">Gespeicherte Lernpfade</span>
          </div>
          <div className="grid gap-3">
            {state.tutorLibrary.map((item) => (
              <button
                key={`tutor-${item.id}`}
                onClick={() => handleHistoryRestore(item)}
                className="text-left bg-emerald-50 border border-emerald-100 hover:border-emerald-300 rounded-2xl p-4 transition-all"
              >
                <p className="text-xs text-emerald-700 font-bold uppercase tracking-wide mb-1">Tutor-Lernpfad</p>
                <p className="text-slate-800 font-semibold line-clamp-1">{item.prompt}</p>
                <p className="text-slate-500 text-sm line-clamp-2">{item.preview}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-12 text-slate-400 text-sm">
        Powered by Google Gemini 3
      </footer>
    </div>
  );
};

export default App;
