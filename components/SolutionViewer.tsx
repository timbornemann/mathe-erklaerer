import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FormulaEntry, MathSolution } from '../types';
import MathRenderer from './MathRenderer';
import SidePanel from './SidePanel';
import FormulaSidebar from './FormulaSidebar';
import { ChevronLeft, ChevronRight, List, CheckCircle2, RotateCcw, Loader2, X, Download, FileText, Play, Square, Volume2, VolumeX } from 'lucide-react';
import { speakText } from '../services/tts';

interface SolutionViewerProps {
  solution: MathSolution;
  initialPrompt: string;
  onReset: () => void;
  initialView?: 'start' | 'summary';
  onDownloadMarkdown?: () => void;
  onDownloadPdf?: () => void;
  formulas?: FormulaEntry[];
  onAddFormulaFromSolution?: (formula: string, sourceLabel: string, contextText?: string) => Promise<void> | void;
  onExtractFormulasFromChatMessage?: (message: string, sourceLabel: string) => Promise<{ added: number; extracted: number }> | void;
  onAddFormulaManual?: (formula: string, contextText?: string) => Promise<void> | void;
  onAskFormulaPrompt?: (prompt: string) => Promise<void> | void;
  onIncrementFormulaUsage?: (formulaId: string) => void;
  onRetryFormulaGeneration?: (formulaId: string) => void;
}

const looksTechnicalTutorFinalAnswer = (text: string): boolean =>
  /lernpfad aktualisiert|fortgesetzt|technischer hinweis|wird erstellt/i.test(text);

const buildTutorSummaryFinalAnswer = (topic: string, steps: MathSolution['steps']): string => {
  const lessonTitles = steps
    .map((step) => (typeof step.title === 'string' ? step.title.trim() : ''))
    .filter((title) => title.length > 0)
    .slice(0, 8);

  const lessonList = lessonTitles.length
    ? lessonTitles.map((title, index) => `${index + 1}. ${title}`).join('\n')
    : '1. Grundlagen\n2. Methoden\n3. Vertiefung';

  return `
**Lernpfad abgeschlossen: ${topic}**

Du hast die wichtigsten Inhalte schrittweise durchgearbeitet - von den Grundlagen bis zur Vertiefung.

**Behandelte Lektionen:**
${lessonList}
`.trim();
};

const isEscapedAt = (text: string, index: number): boolean => {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
};

const repairLatexBraces = (input: string): string => {
  const text = input.trim();
  if (!text) return text;

  let openBraces = 0;
  let repaired = '';

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const escaped = isEscapedAt(text, i);

    if (ch === '{' && !escaped) {
      openBraces += 1;
      repaired += ch;
      continue;
    }

    if (ch === '}' && !escaped) {
      if (openBraces > 0) {
        openBraces -= 1;
        repaired += ch;
      }
      continue;
    }

    repaired += ch;
  }

  if (openBraces > 0) {
    repaired += '}'.repeat(openBraces);
  }

  return repaired;
};

const toDisplayMathContent = (formula: string): string => `$$ ${repairLatexBraces(formula)} $$`;

const buildStepNarrationText = (
  stepLabel: string,
  stepTitle: string,
  stepExplanation: string,
  formulas: string[]
): string => {
  const cleanTitle = stepTitle.trim() || stepLabel;
  const cleanExplanation = stepExplanation.trim() || 'Zu diesem Schritt gibt es noch keine Erklaerung.';
  const formulasText = formulas.length
    ? formulas.map((formula, idx) => `Formel ${idx + 1}: ${repairLatexBraces(formula)}.`).join(' ')
    : 'Es gibt in diesem Schritt keine neue Formel.';

  return `${stepLabel}. ${cleanTitle}. Erklaerung: ${cleanExplanation}. ${formulasText}`;
};

type UnitPosition = {
  lessonIndex: number;
  substepIndex: number;
};

type LessonStep = MathSolution['steps'][number];

type UnitContext = {
  key: string;
  label: string;
  lesson: LessonStep;
  step: LessonStep;
  hasSubsteps: boolean;
  lessonLoading: boolean;
  position: UnitPosition;
};

const getLessonSubsteps = (lesson?: LessonStep): LessonStep[] => {
  if (!lesson || !Array.isArray(lesson.substeps) || lesson.substeps.length === 0) {
    return [];
  }
  return lesson.substeps;
};

const getUnitContext = (steps: LessonStep[], position: UnitPosition): UnitContext | null => {
  if (position.lessonIndex < 0 || position.lessonIndex >= steps.length) return null;

  const lesson = steps[position.lessonIndex];
  const substeps = getLessonSubsteps(lesson);

  if (substeps.length > 0) {
    const boundedSubstepIndex = Math.max(0, Math.min(position.substepIndex, substeps.length - 1));
    const step = substeps[boundedSubstepIndex];
    return {
      key: `lesson-${position.lessonIndex}-substep-${boundedSubstepIndex}`,
      label: `Lektion ${position.lessonIndex + 1}, Schritt ${boundedSubstepIndex + 1}`,
      lesson,
      step,
      hasSubsteps: true,
      lessonLoading: lesson.loading === true,
      position: { lessonIndex: position.lessonIndex, substepIndex: boundedSubstepIndex }
    };
  }

  return {
    key: `lesson-${position.lessonIndex}`,
    label: `Schritt ${position.lessonIndex + 1}`,
    lesson,
    step: lesson,
    hasSubsteps: false,
    lessonLoading: lesson.loading === true,
    position: { lessonIndex: position.lessonIndex, substepIndex: 0 }
  };
};

const getNextUnitPosition = (steps: LessonStep[], position: UnitPosition): UnitPosition | null => {
  const current = getUnitContext(steps, position);
  if (!current) return null;

  if (current.hasSubsteps) {
    const substeps = getLessonSubsteps(current.lesson);
    if (current.position.substepIndex < substeps.length - 1) {
      return { lessonIndex: current.position.lessonIndex, substepIndex: current.position.substepIndex + 1 };
    }
  }

  if (current.position.lessonIndex < steps.length - 1) {
    return { lessonIndex: current.position.lessonIndex + 1, substepIndex: 0 };
  }

  return null;
};

const releaseNarrationAudio = (audio: HTMLAudioElement | null) => {
  if (!audio) return;
  try {
    audio.pause();
  } catch (_err) {
    // no-op
  }
  try {
    audio.currentTime = 0;
  } catch (_err) {
    // no-op
  }
  const src = audio.src;
  if (src && src.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(src);
    } catch (_err) {
      // no-op
    }
  }
  audio.onended = null;
  audio.onerror = null;
  audio.src = '';
};

const SolutionViewer: React.FC<SolutionViewerProps> = ({
  solution,
  initialPrompt,
  onReset,
  initialView = 'start',
  onDownloadMarkdown = () => {},
  onDownloadPdf = () => {},
  formulas = [],
  onAddFormulaFromSolution,
  onExtractFormulasFromChatMessage,
  onAddFormulaManual,
  onAskFormulaPrompt,
  onIncrementFormulaUsage,
  onRetryFormulaGeneration
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [currentSubstepIndex, setCurrentSubstepIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(initialView === 'summary');
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [isFormulaSidebarOpen, setIsFormulaSidebarOpen] = useState(false);
  const [isTocOpenMobile, setIsTocOpenMobile] = useState(false);
  const [isStepNarratorEnabled, setIsStepNarratorEnabled] = useState(false);
  const [isStepNarratorLoading, setIsStepNarratorLoading] = useState(false);
  const [isStepNarratorPlaying, setIsStepNarratorPlaying] = useState(false);
  const [stepNarratorError, setStepNarratorError] = useState<string | null>(null);
  const stepNarratorAudioRef = useRef<HTMLAudioElement | null>(null);
  const stepNarratorRequestIdRef = useRef(0);
  const preloadedStepNarrationRef = useRef<{ key: string; audio: HTMLAudioElement } | null>(null);
  const preloadingStepNarrationKeyRef = useRef<string | null>(null);

  const totalSteps = solution.steps.length;
  const currentLesson = solution.steps[currentStep] ?? solution.steps[0];
  const isCurrentStepLoading = currentLesson?.loading === true;
  const hasSubsteps = Array.isArray(currentLesson?.substeps) && currentLesson.substeps.length > 0;
  const totalSubstepsInLesson = hasSubsteps ? currentLesson.substeps!.length : 0;
  const activeStep = hasSubsteps && currentSubstepIndex < totalSubstepsInLesson
    ? currentLesson.substeps![currentSubstepIndex]
    : currentLesson;
  const currentUnitPosition: UnitPosition = { lessonIndex: currentStep, substepIndex: currentSubstepIndex };
  const currentUnitContext = getUnitContext(solution.steps, currentUnitPosition);
  const chatContextSteps = hasSubsteps ? (currentLesson.substeps ?? []) : solution.steps;
  const chatContextStepIndex = hasSubsteps ? currentSubstepIndex : currentStep;
  const chatStepLabel = currentUnitContext?.label ?? (hasSubsteps
    ? `Lektion ${currentStep + 1}, Schritt ${currentSubstepIndex + 1}`
    : `Schritt ${currentStep + 1}`);
  const chatStepScopeKey = currentUnitContext?.key ?? (hasSubsteps
    ? `lesson-${currentStep}-substep-${currentSubstepIndex}`
    : `lesson-${currentStep}`);
  const hasLoadingSteps = solution.steps.some((s) => s.loading === true);
  const summaryFinalAnswer = useMemo(() => {
    const rawFinal = (solution.finalAnswer || '').trim();
    if (!rawFinal) return 'Loesung gefunden.';
    if (!looksTechnicalTutorFinalAnswer(rawFinal)) return rawFinal;
    return buildTutorSummaryFinalAnswer(initialPrompt, solution.steps);
  }, [initialPrompt, solution.finalAnswer, solution.steps]);

  const isFirstLesson = currentStep === 0;
  const isFirstUnit = isFirstLesson && (!hasSubsteps || currentSubstepIndex === 0);
  const isLastLesson = currentStep === totalSteps - 1;
  const isLastUnit = isLastLesson && (!hasSubsteps || currentSubstepIndex === totalSubstepsInLesson - 1);

  const totalUnits = solution.steps.reduce((sum, step) => {
    const count = Array.isArray(step.substeps) && step.substeps.length > 0 ? step.substeps.length : 1;
    return sum + count;
  }, 0);

  const getVisibleFormulas = (formulas?: string[]) =>
    (Array.isArray(formulas) ? formulas : []).filter(
      (formula) => typeof formula === 'string' && formula.trim().length > 0
    );

  const unitsBeforeCurrentLesson = solution.steps.slice(0, currentStep).reduce((sum, step) => {
    const count = Array.isArray(step.substeps) && step.substeps.length > 0 ? step.substeps.length : 1;
    return sum + count;
  }, 0);

  const currentUnitIndex = unitsBeforeCurrentLesson + (hasSubsteps ? currentSubstepIndex : 0);
  const activeStepFormulas = getVisibleFormulas(activeStep?.formulas);

  const addFormulaToCollection = async (formula: string, sourceLabel: string, contextText?: string) => {
    if (!onAddFormulaFromSolution) return;
    await onAddFormulaFromSolution(formula, sourceLabel, contextText);
  };

  const clearPreloadedStepNarration = () => {
    preloadingStepNarrationKeyRef.current = null;
    if (preloadedStepNarrationRef.current) {
      releaseNarrationAudio(preloadedStepNarrationRef.current.audio);
      preloadedStepNarrationRef.current = null;
    }
  };

  const stopStepNarration = () => {
    stepNarratorRequestIdRef.current += 1;
    releaseNarrationAudio(stepNarratorAudioRef.current);
    stepNarratorAudioRef.current = null;
    setIsStepNarratorLoading(false);
    setIsStepNarratorPlaying(false);
  };

  const preloadStepNarrationForPosition = async (fromPosition: UnitPosition) => {
    if (!isStepNarratorEnabled || showSummary) return;

    const nextPosition = getNextUnitPosition(solution.steps, fromPosition);
    if (!nextPosition) {
      clearPreloadedStepNarration();
      return;
    }

    const nextContext = getUnitContext(solution.steps, nextPosition);
    if (!nextContext || nextContext.lessonLoading) return;

    if (preloadedStepNarrationRef.current?.key === nextContext.key) return;
    if (preloadingStepNarrationKeyRef.current === nextContext.key) return;

    if (preloadedStepNarrationRef.current && preloadedStepNarrationRef.current.key !== nextContext.key) {
      releaseNarrationAudio(preloadedStepNarrationRef.current.audio);
      preloadedStepNarrationRef.current = null;
    }

    preloadingStepNarrationKeyRef.current = nextContext.key;

    const nextFormulas = getVisibleFormulas(nextContext.step.formulas);
    const nextText = buildStepNarrationText(
      nextContext.label,
      nextContext.step.title ?? '',
      nextContext.step.explanation ?? '',
      nextFormulas
    );

    try {
      const preloadedAudio = await speakText(nextText);
      if (!isStepNarratorEnabled || preloadingStepNarrationKeyRef.current !== nextContext.key) {
        releaseNarrationAudio(preloadedAudio);
        return;
      }
      if (preloadedStepNarrationRef.current) {
        releaseNarrationAudio(preloadedStepNarrationRef.current.audio);
      }
      preloadedStepNarrationRef.current = { key: nextContext.key, audio: preloadedAudio };
    } catch (error) {
      console.warn('Step narration preload failed:', error);
    } finally {
      if (preloadingStepNarrationKeyRef.current === nextContext.key) {
        preloadingStepNarrationKeyRef.current = null;
      }
    }
  };

  const playStepNarration = async () => {
    if (showSummary || isCurrentStepLoading) return;
    const currentContext = getUnitContext(solution.steps, currentUnitPosition);
    if (!currentContext) return;

    stopStepNarration();
    const requestId = stepNarratorRequestIdRef.current;
    const shouldAutoAdvance = isStepNarratorEnabled;
    const nextPositionAfterPlayback = shouldAutoAdvance
      ? getNextUnitPosition(solution.steps, currentContext.position)
      : null;
    setStepNarratorError(null);
    setIsStepNarratorLoading(true);

    try {
      let audio: HTMLAudioElement;
      if (preloadedStepNarrationRef.current?.key === currentContext.key) {
        audio = preloadedStepNarrationRef.current.audio;
        preloadedStepNarrationRef.current = null;
      } else {
        const currentText = buildStepNarrationText(
          currentContext.label,
          currentContext.step.title ?? '',
          currentContext.step.explanation ?? '',
          getVisibleFormulas(currentContext.step.formulas)
        );
        audio = await speakText(currentText);
      }

      if (requestId !== stepNarratorRequestIdRef.current) {
        releaseNarrationAudio(audio);
        return;
      }

      stepNarratorAudioRef.current = audio;
      audio.onended = () => {
        releaseNarrationAudio(audio);
        if (stepNarratorAudioRef.current === audio) {
          stepNarratorAudioRef.current = null;
        }
        if (requestId !== stepNarratorRequestIdRef.current) {
          return;
        }
        setIsStepNarratorPlaying(false);
        setIsStepNarratorLoading(false);

        if (shouldAutoAdvance) {
          if (nextPositionAfterPlayback) {
            setShowSummary(false);
            setCurrentStep(nextPositionAfterPlayback.lessonIndex);
            setCurrentSubstepIndex(nextPositionAfterPlayback.substepIndex);
          } else {
            setShowSummary(true);
          }
        }
      };

      await audio.play();

      if (requestId !== stepNarratorRequestIdRef.current) {
        releaseNarrationAudio(audio);
        return;
      }

      setIsStepNarratorPlaying(true);
      setIsStepNarratorLoading(false);
      if (shouldAutoAdvance) {
        void preloadStepNarrationForPosition(currentContext.position);
      }
    } catch (error: any) {
      if (requestId !== stepNarratorRequestIdRef.current) {
        return;
      }
      setIsStepNarratorLoading(false);
      setIsStepNarratorPlaying(false);
      setStepNarratorError(error?.message || 'Sprachausgabe fehlgeschlagen.');
      setIsStepNarratorEnabled(false);
    }
  };

  const handleToggleStepNarrator = () => {
    setStepNarratorError(null);
    setIsStepNarratorEnabled((prev) => !prev);
  };

  const handleStepNarrationAction = () => {
    if (isStepNarratorLoading || isStepNarratorPlaying) {
      stopStepNarration();
      return;
    }
    void playStepNarration();
  };

  useEffect(() => {
    return () => {
      stopStepNarration();
      clearPreloadedStepNarration();
    };
  }, []);

  useEffect(() => {
    stopStepNarration();
  }, [currentStep, currentSubstepIndex, showSummary]);

  useEffect(() => {
    if (isStepNarratorEnabled) return;
    stopStepNarration();
    clearPreloadedStepNarration();
  }, [isStepNarratorEnabled]);

  useEffect(() => {
    if (!isStepNarratorEnabled || showSummary || isCurrentStepLoading) {
      return;
    }
    void playStepNarration();
  }, [isStepNarratorEnabled, currentStep, currentSubstepIndex, showSummary, isCurrentStepLoading]);

  useEffect(() => {
    if (!isStepNarratorEnabled || showSummary || isCurrentStepLoading) return;
    void preloadStepNarrationForPosition(currentUnitPosition);
  }, [isStepNarratorEnabled, showSummary, isCurrentStepLoading, currentStep, currentSubstepIndex, solution.steps]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep, currentSubstepIndex, showSummary]);

  useEffect(() => {
    if (totalSteps === 0) return;
    if (currentStep >= totalSteps) {
      setCurrentStep(totalSteps - 1);
    }
  }, [currentStep, totalSteps]);

  useEffect(() => {
    if (!currentLesson) return;
    const substeps = currentLesson.substeps ?? [];
    if (substeps.length === 0 && currentSubstepIndex !== 0) {
      setCurrentSubstepIndex(0);
      return;
    }
    if (substeps.length > 0 && currentSubstepIndex >= substeps.length) {
      setCurrentSubstepIndex(substeps.length - 1);
    }
  }, [currentLesson, currentSubstepIndex]);

  const handleNext = () => {
    const step = solution.steps[currentStep];
    if (!step) return;

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
    if (!step) return;

    const substeps = step.substeps ?? [];

    if (substeps.length > 0 && currentSubstepIndex > 0) {
      setCurrentSubstepIndex(idx => idx - 1);
    } else if (currentStep > 0) {
      const prevStepIndex = currentStep - 1;
      const prevStep = solution.steps[prevStepIndex];
      const prevSubsteps = prevStep?.substeps ?? [];

      setCurrentStep(prevStepIndex);
      setCurrentSubstepIndex(prevSubsteps.length > 0 ? prevSubsteps.length - 1 : 0);
    }
  };

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
        if (!isLastUnit) {
          handleNext();
        } else {
          setShowSummary(true);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showSummary, isFirstUnit, isLastUnit, currentStep, currentSubstepIndex, totalSteps]);

  const navigateToLesson = (lessonIndex: number, substepIndex = 0) => {
    if (lessonIndex < 0 || lessonIndex >= totalSteps) return;

    const lesson = solution.steps[lessonIndex];
    const substeps = lesson.substeps ?? [];
    const targetSubstep = substeps.length > 0
      ? Math.max(0, Math.min(substepIndex, substeps.length - 1))
      : 0;

    setShowSummary(false);
    setCurrentStep(lessonIndex);
    setCurrentSubstepIndex(targetSubstep);
  };

  const renderTocEntries = (closeAfterNavigate = false) => (
    <>
      {solution.steps.map((lesson, lessonIndex) => {
        const substeps = lesson.substeps ?? [];
        const lessonHasSubsteps = substeps.length > 0;
        const isLessonActive = !showSummary && currentStep === lessonIndex;
        const isCompletedLesson = lesson.loading !== true && lessonIndex < currentStep;

        return (
          <div key={`${lessonIndex}-${lesson.title}`} className="mb-2">
            <button
              onClick={() => {
                navigateToLesson(lessonIndex, 0);
                if (closeAfterNavigate) setIsTocOpenMobile(false);
              }}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                isLessonActive
                  ? 'border-indigo-200 bg-indigo-50'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  isLessonActive ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {lessonIndex + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {lesson.title || `Lektion ${lessonIndex + 1}`}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {lesson.loading
                      ? 'wird erstellt'
                      : lessonHasSubsteps
                      ? `${substeps.length} Schritte`
                      : '1 Schritt'}
                  </p>
                </div>
                {lesson.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                ) : isCompletedLesson ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : null}
              </div>
            </button>

            {lessonHasSubsteps && (
              <div className="ml-9 mt-1.5 space-y-1">
                {substeps.map((substep, substepIndex) => {
                  const isSubstepActive = !showSummary && currentStep === lessonIndex && currentSubstepIndex === substepIndex;
                  return (
                    <button
                      key={`${lessonIndex}-${substepIndex}`}
                      onClick={() => {
                        navigateToLesson(lessonIndex, substepIndex);
                        if (closeAfterNavigate) setIsTocOpenMobile(false);
                      }}
                      className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                        isSubstepActive
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {substepIndex + 1}. {substep.title || `Schritt ${substepIndex + 1}`}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <button
        onClick={() => {
          setShowSummary(true);
          if (closeAfterNavigate) setIsTocOpenMobile(false);
        }}
        className={`mt-3 w-full rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
          showSummary
            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        Zusammenfassung & Endergebnis
      </button>
    </>
  );

  const renderDesktopToc = () => (
    <aside className="hidden lg:block fixed left-0 top-0 z-30 h-full w-[320px] border-r border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="h-full flex flex-col pt-20">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold text-slate-800">Inhaltsverzeichnis</p>
          <p className="text-xs text-slate-500">{totalSteps} Lektionen</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 pb-6">
          {renderTocEntries()}
        </div>
      </div>
    </aside>
  );

  const renderMobileToc = () => (
    isTocOpenMobile ? (
      <div className="fixed inset-0 z-50 lg:hidden">
        <button
          className="absolute inset-0 bg-slate-900/35"
          onClick={() => setIsTocOpenMobile(false)}
          aria-label="Inhaltsverzeichnis schliessen"
        />
        <div className="absolute left-0 top-0 h-full w-[88vw] max-w-sm bg-white shadow-2xl border-r border-slate-200 flex flex-col">
          <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-800">Inhaltsverzeichnis</p>
              <p className="text-xs text-slate-500">{totalSteps} Lektionen</p>
            </div>
            <button
              onClick={() => setIsTocOpenMobile(false)}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
              aria-label="Schliessen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {renderTocEntries(true)}
          </div>
        </div>
      </div>
    ) : null
  );

  const renderMobileTocButton = () => (
    <div className="mb-4 lg:hidden">
      <button
        onClick={() => setIsTocOpenMobile(true)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
      >
        <List className="w-4 h-4 text-indigo-600" />
        Inhaltsverzeichnis
      </button>
    </div>
  );

  if (totalSteps === 0 || !currentLesson || !activeStep) {
    return (
      <div className="w-full max-w-4xl mx-auto bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center">
        <p className="text-slate-500">Keine Lektionen verfuegbar.</p>
      </div>
    );
  }

  if (showSummary) {
    const leftOffsetClass = isFormulaSidebarOpen ? 'md:pl-[430px]' : 'lg:pl-[320px]';
    const desktopLayoutClass = `${leftOffsetClass} ${isSidePanelOpen ? 'md:pr-[400px]' : ''}`.trim();
    return (
      <div className={`w-full relative px-0 sm:px-2 md:px-0 ${desktopLayoutClass}`}>
        {renderMobileTocButton()}

        {renderDesktopToc()}

        <div className="w-full min-w-0 max-w-[1320px] mx-auto">
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 w-full relative z-10">
            <div className="bg-slate-50 p-4 sm:p-6 border-b border-slate-100 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <List className="w-6 h-6 text-indigo-600" />
                  Zusammenfassung
                </h2>
                <button
                  onClick={() => setShowSummary(false)}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                >
                  Zurueck zu den Karten
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={onDownloadMarkdown}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  Als Markdown
                </button>
                <button
                  onClick={onDownloadPdf}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Als PDF
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8">
              {solution.steps.map((step, idx) => (
                <div key={idx} className="relative pl-8 border-l-2 border-indigo-100 last:border-0">
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-indigo-500 ring-4 ring-indigo-50" />
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{step.title}</h3>
                  {step.loading ? (
                    <p className="text-sm text-slate-500 italic flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                      Wird geladen...
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
                          {getVisibleFormulas(substep.formulas).length > 0 && (
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                              {getVisibleFormulas(substep.formulas).map((formula, fIdx) => (
                                <div key={fIdx} className="space-y-2">
                                  <MathRenderer content={toDisplayMathContent(formula)} />
                                  {onAddFormulaFromSolution && (
                                    <button
                                      onClick={() =>
                                        void addFormulaToCollection(
                                          formula,
                                          `Zusammenfassung: Lektion ${idx + 1}, Schritt ${sIdx + 1}`,
                                          substep.explanation
                                        )
                                      }
                                      className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                                    >
                                      Zur Formelsammlung
                                    </button>
                                  )}
                                </div>
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
                      {getVisibleFormulas(step.formulas).length > 0 && (
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                          {getVisibleFormulas(step.formulas).map((formula, fIdx) => (
                            <div key={fIdx} className="space-y-2">
                              <MathRenderer content={toDisplayMathContent(formula)} />
                              {onAddFormulaFromSolution && (
                                <button
                                  onClick={() =>
                                    void addFormulaToCollection(
                                      formula,
                                      `Zusammenfassung: Schritt ${idx + 1}`,
                                      step.explanation
                                    )
                                  }
                                  className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                                >
                                  Zur Formelsammlung
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
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
                  <MathRenderer content={summaryFinalAnswer} />
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 sm:p-6 border-t border-slate-100 flex justify-center">
              <button
                onClick={onReset}
                className="flex items-center space-x-2 px-6 py-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 font-semibold transition-all"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Zurueck zur Uebersicht</span>
              </button>
            </div>
          </div>
        </div>

        {renderMobileToc()}
      </div>
    );
  }

  const progress = ((currentUnitIndex + 1) / Math.max(1, totalUnits)) * 100;
  const progressContainerClass = 'mb-4 sm:mb-6 w-full bg-slate-200 rounded-full h-2.5 overflow-hidden';

  const containerClass = 'bg-white rounded-2xl md:rounded-3xl shadow-xl overflow-hidden border border-slate-100 min-h-[400px] flex flex-col transition-all duration-300';
  const leftOffsetClass = isFormulaSidebarOpen ? 'md:pl-[430px]' : 'lg:pl-[320px]';
  const desktopLayoutClass = `${leftOffsetClass} ${isSidePanelOpen ? 'md:pr-[400px]' : ''}`.trim();

  return (
    <div className={`w-full relative px-0 sm:px-2 md:px-0 ${desktopLayoutClass}`}>
      {renderMobileTocButton()}

      {renderDesktopToc()}

      <div className="w-full min-w-0 max-w-[1320px] mx-auto">
        <div className={progressContainerClass}>
          <div
            className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className={containerClass}>
          <div className="bg-slate-50/80 p-3 sm:p-4 md:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center backdrop-blur-sm gap-3 sm:gap-4">
            <div className="flex items-center justify-between sm:justify-start gap-2 md:gap-3 flex-shrink-0 w-full sm:w-auto">
              <button
                onClick={onReset}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-all text-xs font-bold shadow-sm"
                title="Zurueck zur Uebersicht"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Zurueck</span>
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

          <div className="p-4 sm:p-6 md:p-8 flex-1 flex flex-col">
            <div className="mb-4 sm:mb-6 flex flex-wrap items-center gap-2">
              <button
                onClick={handleToggleStepNarrator}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs sm:text-sm font-semibold transition-colors ${
                  isStepNarratorEnabled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
                title={isStepNarratorEnabled ? 'Auto-Vorlesen und Weiterblaettern deaktivieren' : 'Auto-Vorlesen und Weiterblaettern aktivieren'}
              >
                {isStepNarratorEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span>{isStepNarratorEnabled ? 'Auto-Erklaerer an (Weiter)' : 'Auto-Erklaerer aus'}</span>
              </button>

              <button
                onClick={handleStepNarrationAction}
                disabled={showSummary || isCurrentStepLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs sm:text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                title={isStepNarratorPlaying || isStepNarratorLoading ? 'Vorlesen stoppen' : 'Aktuellen Schritt vorlesen'}
              >
                {isStepNarratorLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isStepNarratorPlaying ? (
                  <Square className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <span>{isStepNarratorPlaying || isStepNarratorLoading ? 'Stop' : 'Schritt vorlesen'}</span>
              </button>

              {stepNarratorError && (
                <span className="text-xs font-semibold text-red-500">
                  {stepNarratorError}
                </span>
              )}
            </div>

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
                    <span className="text-sm font-medium">Lektion wird geladen...</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="text-base sm:text-lg text-slate-600 leading-relaxed mb-6 sm:mb-8">
                  <MathRenderer content={activeStep.explanation} />
                </div>

                {activeStepFormulas.length > 0 && (
                  <div className="bg-indigo-50/50 rounded-2xl p-4 sm:p-6 border border-indigo-100 flex-1 flex flex-col justify-center items-center space-y-3 sm:space-y-4 shadow-inner overflow-x-auto">
                    {activeStepFormulas.map((formula, idx) => (
                      <div key={idx} className="w-full transition-all duration-500 animate-in fade-in slide-in-from-bottom-4 space-y-2">
                        <MathRenderer content={toDisplayMathContent(formula)} />
                        {onAddFormulaFromSolution && (
                          <button
                            onClick={() =>
                              void addFormulaToCollection(
                                formula,
                                `${chatStepLabel}: ${activeStep.title || currentLesson.title}`,
                                activeStep.explanation
                              )
                            }
                            className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                          >
                            Zur Formelsammlung
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

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
              <span>Zurueck</span>
            </button>

            <span className="text-xs text-slate-400 hidden md:inline" title="Pfeiltasten zur Navigation">&larr; &rarr;</span>

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
                  <span>Naechster Schritt</span>
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 sm:mt-6 flex justify-center">
          <button
            onClick={onReset}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-full transition-all text-sm font-medium"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Zurueck zur Uebersicht</span>
          </button>
        </div>
      </div>

      {renderMobileToc()}

      <SidePanel
        isOpen={isSidePanelOpen}
        onToggle={() => setIsSidePanelOpen(!isSidePanelOpen)}
        currentStep={activeStep}
        allSteps={chatContextSteps}
        stepIndex={chatContextStepIndex}
        stepLabel={chatStepLabel}
        stepScopeKey={chatStepScopeKey}
        initialPrompt={initialPrompt}
        onExtractFormulasFromMessage={onExtractFormulasFromChatMessage}
      />

      <FormulaSidebar
        formulas={formulas}
        isOpen={isFormulaSidebarOpen}
        onToggle={() => setIsFormulaSidebarOpen((prev) => !prev)}
        onMarkUsed={(formulaId) => onIncrementFormulaUsage?.(formulaId)}
        onRetryFormula={(formulaId) => onRetryFormulaGeneration?.(formulaId)}
        onAddFormulaLatex={onAddFormulaManual}
        onAskFormulaPrompt={onAskFormulaPrompt}
      />
    </div>
  );
};

export default SolutionViewer;
