export enum InputMode {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  TUTOR = 'TUTOR'
}

export interface SolutionStep {
  title: string;
  explanation: string;
  formulas: string[];
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

export interface MathState {
  isLoading: boolean;
  inputMode: InputMode;
  textInput: string;
  imageFile: File | null;
  imagePreview: string | null;
  solution: MathSolution | null;
  error: string | null;
  history: HistoryItem[];
  tutorLibrary: HistoryItem[];
}
