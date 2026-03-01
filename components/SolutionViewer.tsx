import React, { useState, useEffect } from 'react';
import { MathSolution } from '../types';
import MathRenderer from './MathRenderer';
import SidePanel from './SidePanel';
import { ChevronLeft, ChevronRight, List, CheckCircle2, RotateCcw, Loader2 } from 'lucide-react';

interface SolutionViewerProps {
  solution: MathSolution;
  initialPrompt: string;
  onReset: () => void;
}

const SolutionViewer: React.FC<SolutionViewerProps> = ({ solution, initialPrompt, onReset }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [currentSubstepIndex, setCurrentSubstepIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);

  const totalSteps = solution.steps.length;
  const currentLesson = solution.steps[currentStep];
  const isCurrentStepLoading = currentLesson.loading === true;
  const hasSubsteps = Array.isArray(currentLesson.substeps) && currentLesson.substeps.length > 0;
  const totalSubstepsInLesson = hasSubsteps ? currentLesson.substeps!.length : 0;
  const activeStep = hasSubsteps && currentSubstepIndex < totalSubstepsInLesson
    ? currentLesson.substeps![currentSubstepIndex]
    : currentLesson;
  const hasLoadingSteps = solution.steps.some((s) => s.loading === true);

  const isFirstLesson = currentStep === 0;
  const isFirstUnit = isFirstLesson && (!hasSubsteps || currentSubstepIndex === 0);
  const isLastLesson = currentStep === totalSteps - 1;
  const isLastUnit = isLastLesson && (!hasSubsteps || currentSubstepIndex === totalSubstepsInLesson - 1);

  const totalUnits = solution.steps.reduce((sum, step) => {
    const count = Array.isArray(step.substeps) && step.substeps.length > 0 ? step.substeps.length : 1;
    return sum + count;
  }, 0);

  const unitsBeforeCurrentLesson = solution.steps.slice(0, currentStep).reduce((sum, step) => {
    const count = Array.isArray(step.substeps) && step.substeps.length > 0 ? step.substeps.length : 1;
    return sum + count;
  }, 0);

  const currentUnitIndex = unitsBeforeCurrentLesson + (hasSubsteps ? currentSubstepIndex : 0);

  // Scroll to top when Schritt oder Zusammenfassung wechseln
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep, currentSubstepIndex, showSummary]);

  // Substep zurücksetzen, wenn die Lektion wechselt
  useEffect(() => {
    setCurrentSubstepIndex(0);
  }, [currentStep]);

  // Pfeiltasten: vor/zurück durch Schritte (nur wenn nicht in Input/Textarea)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
      if (isInput) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (showSummary) {
          setShowSummary(false);
        } else if (!isFirstUnit) {
          handlePrev();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (showSummary) return;
        if (!isLastUnit) handleNext();
        else setShowSummary(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentStep, currentSubstepIndex, showSummary, isFirstUnit, isLastUnit, totalSteps]);

  const handleNext = () => {
    const step = solution.steps[currentStep];
    const substeps = step.substeps ?? [];

    if (substeps.length > 0 && currentSubstepIndex < substeps.length - 1) {
      setCurrentSubstepIndex(idx => idx + 1);
    } else if (currentStep < totalSteps - 1) {
      setCurrentStep(curr => curr + 1);
      setCurrentSubstepIndex(0);
    } else {
      setShowSummary(true);
    }
  };

  const handlePrev = () => {
    if (showSummary) {
      setShowSummary(false);
      return;
    }

    const step = solution.steps[currentStep];
    const substeps = step.substeps ?? [];

    if (substeps.length > 0 && currentSubstepIndex > 0) {
      setCurrentSubstepIndex(idx => idx - 1);
    } else if (currentStep > 0) {
      const prevStepIndex = currentStep - 1;
      const prevStep = solution.steps[prevStepIndex];
      const prevSubsteps = prevStep.substeps ?? [];

      setCurrentStep(prevStepIndex);
      setCurrentSubstepIndex(prevSubsteps.length > 0 ? prevSubsteps.length - 1 : 0);
    }
  };

  // Adjust container width when side panel is open
  const containerClass = isSidePanelOpen 
    ? "bg-white rounded-2xl md:rounded-3xl shadow-xl overflow-hidden border border-slate-100 min-h-[400px] flex flex-col transition-all duration-300 lg:mr-[400px]"
    : "bg-white rounded-2xl md:rounded-3xl shadow-xl overflow-hidden border border-slate-100 min-h-[400px] flex flex-col transition-all duration-300";

  if (showSummary) {
    return (
      <div className="relative w-full max-w-6xl mx-auto flex items-start gap-4 md:gap-6">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 flex-1 w-full relative z-10">
          <div className="bg-slate-50 p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <List className="w-6 h-6 text-indigo-600" />
              Zusammenfassung
            </h2>
            <button 
              onClick={() => setShowSummary(false)}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              Zurück zu den Karten
            </button>
          </div>
          
          <div className="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8">
            {solution.steps.map((step, idx) => (
              <div key={idx} className="relative pl-8 border-l-2 border-indigo-100 last:border-0">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-indigo-500 ring-4 ring-indigo-50" />
                <h3 className="text-lg font-bold text-slate-900 mb-2">{step.title}</h3>
                {step.loading ? (
                  <p className="text-sm text-slate-500 italic flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                    Wird geladen…
                  </p>
                ) : Array.isArray(step.substeps) && step.substeps.length > 0 ? (
                  <div className="space-y-4">
                    {step.substeps.map((substep, sIdx) => (
                      <div key={sIdx} className="mb-4">
                        <h4 className="text-sm font-semibold text-slate-800 mb-1">
                          {sIdx + 1}. {substep.title}
                        </h4>
                        <div className="text-slate-600 mb-2">
                          <MathRenderer content={substep.explanation} />
                        </div>
                        {substep.formulas.length > 0 && (
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                            {substep.formulas.map((formula, fIdx) => (
                              <MathRenderer key={fIdx} content={`$$ ${formula} $$`} />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="text-slate-600 mb-4">
                       <MathRenderer content={step.explanation} />
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      {step.formulas.map((formula, fIdx) => (
                         <MathRenderer key={fIdx} content={`$$ ${formula} $$`} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
            
            <div className="mt-12 bg-green-50 p-6 rounded-2xl border border-green-100">
               <h3 className="text-lg font-bold text-green-900 mb-2 flex items-center gap-2">
                 <CheckCircle2 className="w-5 h-5" />
                 Endergebnis
               </h3>
               <div className="text-green-800">
                  <MathRenderer content={solution.finalAnswer || "Lösung gefunden."} />
               </div>
            </div>
          </div>

          <div className="bg-slate-50 p-4 sm:p-6 border-t border-slate-100 flex justify-center">
              <button
                onClick={onReset}
                className="flex items-center space-x-2 px-6 py-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 font-semibold transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Neue Aufgabe lösen</span>
              </button>
          </div>
        </div>
        
        {/* Helper is hidden in summary view for now, or could show general help */}
      </div>
    );
  }

  const progress = ((currentUnitIndex + 1) / totalUnits) * 100;

  return (
    <div className="w-full max-w-6xl mx-auto relative px-0 sm:px-2 md:px-0">
      {/* Progress Bar */}
      <div className="mb-4 sm:mb-6 w-full bg-slate-200 rounded-full h-2.5 overflow-hidden lg:mr-[400px]">
        <div 
          className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500 ease-out" 
          style={{ width: `${progress}%` }}
        ></div>
      </div>

      <div className={containerClass}>
        {/* Card Header */}
        <div className="bg-slate-50/80 p-3 sm:p-4 md:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center backdrop-blur-sm gap-3 sm:gap-4">
          <div className="flex items-center justify-between sm:justify-start gap-2 md:gap-3 flex-shrink-0 w-full sm:w-auto">
             <button
               onClick={onReset}
               className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-all text-xs font-bold shadow-sm"
               title="Neue Aufgabe beginnen"
             >
               <RotateCcw className="w-3.5 h-3.5" />
               <span className="hidden md:inline">Neu</span>
             </button>
             <span className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold tracking-wide uppercase">
              Lektion {currentStep + 1} / {totalSteps}
              {hasLoadingSteps && (
                <span className="ml-1 font-normal text-indigo-600">(wird geladen)</span>
              )}
             </span>
             {hasSubsteps && (
               <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-bold tracking-wide uppercase">
                 Schritt {currentSubstepIndex + 1} / {totalSubstepsInLesson}
               </span>
             )}
          </div>
          <h2 className="text-base sm:text-lg md:text-xl font-bold text-slate-800 line-clamp-2 sm:truncate text-left sm:text-right w-full">
            {currentLesson.title}
          </h2>
        </div>

        {/* Card Content */}
        <div className="p-4 sm:p-6 md:p-8 flex-1 flex flex-col">
          {isCurrentStepLoading ? (
            <>
              <div className="space-y-3 mb-6 sm:mb-8" aria-hidden>
                <div className="h-4 rounded bg-slate-200 animate-pulse w-full" />
                <div className="h-4 rounded bg-slate-200 animate-pulse w-5/6" />
                <div className="h-4 rounded bg-slate-200 animate-pulse w-4/5" />
                <div className="h-4 rounded bg-slate-200 animate-pulse w-full" />
              </div>
              <div className="bg-indigo-50/50 rounded-2xl p-4 sm:p-6 border border-indigo-100 flex-1 flex flex-col justify-center items-center space-y-3 sm:space-y-4 shadow-inner">
                <div className="flex flex-col items-center gap-2 text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                  <span className="text-sm font-medium">Lektion wird geladen…</span>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Explanation */}
              <div className="text-base sm:text-lg text-slate-600 leading-relaxed mb-6 sm:mb-8">
                <MathRenderer content={activeStep.explanation} />
              </div>

              {/* Formulas */}
              <div className="bg-indigo-50/50 rounded-2xl p-4 sm:p-6 border border-indigo-100 flex-1 flex flex-col justify-center items-center space-y-3 sm:space-y-4 shadow-inner overflow-x-auto">
                {activeStep.formulas.map((formula, idx) => (
                  <div key={idx} className="w-full transition-all duration-500 animate-in fade-in slide-in-from-bottom-4">
                    <MathRenderer content={`$$ ${formula} $$`} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Navigation Footer */}
        <div className="p-3 sm:p-4 md:p-6 border-t border-slate-100 bg-white flex justify-between items-center gap-2 sm:gap-4">
          <button
            onClick={handlePrev}
          disabled={isFirstUnit}
            className={`flex items-center space-x-1 sm:space-x-2 px-3 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold transition-all text-sm sm:text-base ${
            isFirstUnit 
                ? 'text-slate-300 cursor-not-allowed' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Zurück</span>
          </button>

          <span className="text-xs text-slate-400 hidden md:inline" title="Pfeiltasten zur Navigation">← →</span>

          <div className="flex space-x-2">
          {isLastUnit ? (
              <button
                onClick={handleNext}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 sm:px-8 py-2.5 sm:py-3 rounded-xl font-bold text-sm sm:text-base shadow-lg shadow-indigo-200 flex items-center space-x-2 transition-all active:scale-95"
              >
                <span>Alle Schritte ansehen</span>
                <List className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 sm:px-8 py-2.5 sm:py-3 rounded-xl font-bold text-sm sm:text-base shadow-lg shadow-indigo-200 flex items-center space-x-2 transition-all active:scale-95"
              >
                <span>Nächster Schritt</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>
      
      <div className="mt-5 sm:mt-6 flex justify-center lg:mr-[400px]">
        <button 
          onClick={onReset} 
          className="flex items-center gap-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-full transition-all text-sm font-medium"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Abbrechen & Neue Aufgabe</span>
        </button>
      </div>

      {/* Side Panel */}
      <SidePanel 
        isOpen={isSidePanelOpen} 
        onToggle={() => setIsSidePanelOpen(!isSidePanelOpen)}
        currentStep={activeStep}
        allSteps={solution.steps}
        stepIndex={currentStep}
        initialPrompt={initialPrompt}
      />
    </div>
  );
};

export default SolutionViewer;
