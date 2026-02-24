import React, { useState, useEffect } from 'react';
import { MathSolution } from '../types';
import MathRenderer from './MathRenderer';
import SidePanel from './SidePanel';
import { ChevronLeft, ChevronRight, List, CheckCircle2, RotateCcw } from 'lucide-react';

interface SolutionViewerProps {
  solution: MathSolution;
  initialPrompt: string;
  onReset: () => void;
}

const SolutionViewer: React.FC<SolutionViewerProps> = ({ solution, initialPrompt, onReset }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);

  const totalSteps = solution.steps.length;
  const isLastStep = currentStep === totalSteps - 1;

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep, showSummary]);

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(curr => curr + 1);
    } else {
      setShowSummary(true);
    }
  };

  const handlePrev = () => {
    if (showSummary) {
      setShowSummary(false);
    } else if (currentStep > 0) {
      setCurrentStep(curr => curr - 1);
    }
  };

  const step = solution.steps[currentStep];

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
                <div className="text-slate-600 mb-4">
                   <MathRenderer content={step.explanation} />
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  {step.formulas.map((formula, fIdx) => (
                     <MathRenderer key={fIdx} content={`$$ ${formula} $$`} />
                  ))}
                </div>
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

  const progress = ((currentStep + 1) / totalSteps) * 100;

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
              {currentStep + 1} / {totalSteps}
             </span>
          </div>
          <h2 className="text-base sm:text-lg md:text-xl font-bold text-slate-800 line-clamp-2 sm:truncate text-left sm:text-right w-full">
            {step.title}
          </h2>
        </div>

        {/* Card Content */}
        <div className="p-4 sm:p-6 md:p-8 flex-1 flex flex-col">
          {/* Explanation */}
          <div className="text-base sm:text-lg text-slate-600 leading-relaxed mb-6 sm:mb-8">
            <MathRenderer content={step.explanation} />
          </div>

          {/* Formulas */}
          <div className="bg-indigo-50/50 rounded-2xl p-4 sm:p-6 border border-indigo-100 flex-1 flex flex-col justify-center items-center space-y-3 sm:space-y-4 shadow-inner overflow-x-auto">
            {step.formulas.map((formula, idx) => (
              <div key={idx} className="w-full transition-all duration-500 animate-in fade-in slide-in-from-bottom-4">
                <MathRenderer content={`$$ ${formula} $$`} />
              </div>
            ))}
          </div>
        </div>

        {/* Navigation Footer */}
        <div className="p-3 sm:p-4 md:p-6 border-t border-slate-100 bg-white flex justify-between items-center gap-2 sm:gap-4">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className={`flex items-center space-x-1 sm:space-x-2 px-3 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold transition-all text-sm sm:text-base ${
              currentStep === 0 
                ? 'text-slate-300 cursor-not-allowed' 
                : 'text-slate-600 hover:bg-slate-50 hover:text-indigo-600'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Zurück</span>
          </button>

          <div className="flex space-x-2">
            {isLastStep ? (
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
        currentStep={step}
        allSteps={solution.steps}
        stepIndex={currentStep}
        initialPrompt={initialPrompt}
      />
    </div>
  );
};

export default SolutionViewer;
