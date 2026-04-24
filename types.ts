export enum InputMode {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  TUTOR = 'TUTOR',
  PRACTICE = 'PRACTICE',
  EXAM = 'EXAM'
}

export interface SolutionStep {
  title: string;
  explanation: string;
  formulas: string[];
  substeps?: SolutionStep[];
  /** When true, step is a placeholder (skeleton) while the lesson is still being generated. */
  loading?: boolean;
  /** Optional generation error for this lesson/step to allow targeted manual retry. */
  generationError?: string;
}

export interface MathSolution {
  steps: SolutionStep[];
  finalAnswer: string;
}

export type HistoryStatus = 'processing' | 'completed' | 'failed';

export interface HistoryItem {
  id: string;
  timestamp: number;
  prompt: string;
  preview: string; // Kurze Beschreibung oder erste Formel
  solution: MathSolution;
  mode: InputMode;
  projectId?: string;
  /** Optional status for long-running generations (e.g. Tutor mode). */
  status?: HistoryStatus;
  /** Progress percentage for in-flight generations. */
  progress?: number;
  /** Optional error message when generation failed. */
  error?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

export interface PracticeTask {
  id: string;
  taskText: string;
  userSolution?: string;
  userSolutionImage?: string;
  isCorrect?: boolean;
  aiFeedback?: string;
  fullSolution?: MathSolution;
  additionalPrompt?: string;
  timestamp: number;
}

export interface PracticeRoom {
  id: string;
  topic: string;
  description: string;
  difficulty: string;
  projectId?: string;
  exampleTasks: string[];
  generatedTasks: PracticeTask[];
  createdAt: number;
  updatedAt: number;
}

export interface ExamTask {
  id: string;
  order: number;
  taskText: string;
  userSolution?: string;
  userSolutionImage?: string;
  isCorrect?: boolean;
  aiFeedback?: string;
  fullSolution?: MathSolution;
  evaluationError?: string;
  timestamp: number;
}

export type ExamSessionStatus = 'configuring' | 'running' | 'submitted' | 'evaluating' | 'completed';

export interface ExamSession {
  id: string;
  topic: string;
  difficulty: string;
  projectId?: string;
  taskCount: number;
  durationMinutes: number;
  createdAt: number;
  startedAt: number;
  endsAt: number;
  submittedAt?: number;
  completedAt?: number;
  remainingSeconds?: number;
  submitReason?: 'manual' | 'timeout';
  status: ExamSessionStatus;
  tasks: ExamTask[];
  scorePercent?: number;
  correctCount?: number;
  wrongCount?: number;
  feedbackSummary?: string;
}

export interface MathState {
  isLoading: boolean;
  inputMode: InputMode;
  textInput: string;
  imageFile: File | null;
  imagePreview: string | null;
  solution: MathSolution | null;
  error: string | null;
  history: HistoryItem[];
  projects: Project[];
  activeProjectId: string | null;
  practiceRooms: PracticeRoom[];
  activePracticeRoom: PracticeRoom | null;
  examSessions: ExamSession[];
  activeExamSession: ExamSession | null;
}

export interface ExportStatistics {
  historyCount: number;
  projectsCount: number;
  practiceRoomsCount: number;
  totalTasksCompleted: number;
  examSessionsCount: number;
  examTasksCompleted: number;
}

export interface ExportData {
  version: number;
  exportedAt: number;
  history: HistoryItem[];
  projects: Project[];
  activeProjectId: string | null;
  practiceRooms: PracticeRoom[];
  examSessions: ExamSession[];
  statistics: ExportStatistics;
}
