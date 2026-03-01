export enum InputMode {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  TUTOR = 'TUTOR',
  PRACTICE = 'PRACTICE'
}

export interface SolutionStep {
  title: string;
  explanation: string;
  formulas: string[];
  substeps?: SolutionStep[];
  /** When true, step is a placeholder (skeleton) while the lesson is still being generated. */
  loading?: boolean;
}

export interface MathSolution {
  steps: SolutionStep[];
  finalAnswer: string;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  prompt: string;
  preview: string; // Kurze Beschreibung oder erste Formel
  solution: MathSolution;
  mode: InputMode;
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
  exampleTasks: string[];
  generatedTasks: PracticeTask[];
  createdAt: number;
  updatedAt: number;
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
  practiceRooms: PracticeRoom[];
  activePracticeRoom: PracticeRoom | null;
}
