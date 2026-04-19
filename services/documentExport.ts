import { ExamSession, MathSolution, SolutionStep } from '../types';

const createTimestamp = (): string => {
  const now = new Date();
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
};

const normalizeFileNamePart = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'export';

const buildFileName = (prefix: string, topic: string, extension: 'md' | 'pdf'): string =>
  `${normalizeFileNamePart(prefix)}-${normalizeFileNamePart(topic)}-${createTimestamp()}.${extension}`;

const triggerTextDownload = (content: string, fileName: string, mimeType: string): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const appendStepMarkdown = (
  lines: string[],
  step: SolutionStep,
  headingLevel: number,
  numbering: string
) => {
  const level = Math.min(6, Math.max(2, headingLevel));
  lines.push(`${'#'.repeat(level)} ${numbering} ${step.title || 'Schritt'}`);
  lines.push('');
  lines.push(step.explanation?.trim() || '_Keine Erklaerung verfuegbar._');
  lines.push('');

  if (step.formulas.length > 0) {
    lines.push('Formeln:');
    for (const formula of step.formulas) {
      lines.push(`- $$${formula}$$`);
    }
    lines.push('');
  }

  if (Array.isArray(step.substeps) && step.substeps.length > 0) {
    step.substeps.forEach((substep, index) => {
      appendStepMarkdown(lines, substep, level + 1, `${numbering}.${index + 1}`);
    });
  }
};

interface PdfExportPayload {
  title: string;
  markdown: string;
  createdAt: number;
}

const openPrintDialog = (title: string, markdown: string): void => {
  const key = `mathe-print-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payload: PdfExportPayload = {
    title,
    markdown,
    createdAt: Date.now()
  };

  localStorage.setItem(key, JSON.stringify(payload));

  const url = new URL(window.location.href);
  url.searchParams.set('printExport', key);
  const printWindow = window.open(url.toString(), '_blank');

  if (!printWindow) {
    localStorage.removeItem(key);
    throw new Error('Der Export wurde vom Browser blockiert. Bitte Popups erlauben.');
  }
};

export const buildSolutionMarkdown = (solution: MathSolution, prompt: string): string => {
  const lines: string[] = [
    '# Mathe Erklaerer - Loesungsexport',
    '',
    `- Erstellt: ${new Date().toLocaleString('de-DE')}`,
    `- Aufgabe/Thema: ${prompt || 'Unbekannt'}`,
    '',
    '## Schritt-fuer-Schritt',
    ''
  ];

  solution.steps.forEach((step, index) => {
    appendStepMarkdown(lines, step, 3, `${index + 1}`);
  });

  lines.push('## Endergebnis');
  lines.push('');
  lines.push(solution.finalAnswer?.trim() || '_Kein Endergebnis verfuegbar._');
  lines.push('');

  return lines.join('\n');
};

export const buildExamMarkdown = (session: ExamSession): string => {
  const lines: string[] = [
    '# Mathe Erklaerer - Pruefungsexport',
    '',
    `- Erstellt: ${new Date().toLocaleString('de-DE')}`,
    `- Thema: ${session.topic}`,
    `- Schwierigkeit: ${session.difficulty}`,
    `- Aufgaben: ${session.taskCount}`,
    `- Dauer: ${session.durationMinutes} Minuten`,
    `- Status: ${session.status}`,
    ''
  ];

  if (session.status === 'completed') {
    lines.push(`- Ergebnis: ${session.scorePercent ?? 0}% (${session.correctCount ?? 0} richtig, ${session.wrongCount ?? 0} falsch)`);
    lines.push('');
  }

  session.tasks.forEach((task) => {
    lines.push(`## Aufgabe ${task.order}`);
    lines.push('');
    lines.push(task.taskText?.trim() || '_Keine Aufgabentext verfuegbar._');
    lines.push('');

    if (task.userSolution?.trim()) {
      lines.push('### Deine Loesung');
      lines.push('');
      lines.push(task.userSolution.trim());
      lines.push('');
    } else if (task.userSolutionImage) {
      lines.push('### Deine Loesung');
      lines.push('');
      lines.push('_Loesung wurde als Bild abgegeben._');
      lines.push('');
    }

    if (task.aiFeedback?.trim()) {
      lines.push('### Feedback');
      lines.push('');
      lines.push(task.aiFeedback.trim());
      lines.push('');
    }

    if (task.fullSolution) {
      lines.push('### Musterloesung');
      lines.push('');
      task.fullSolution.steps.forEach((step, index) => {
        appendStepMarkdown(lines, step, 4, `${task.order}.${index + 1}`);
      });
      lines.push('#### Ergebnis');
      lines.push('');
      lines.push(task.fullSolution.finalAnswer?.trim() || '_Kein Ergebnis verfuegbar._');
      lines.push('');
    }
  });

  return lines.join('\n');
};

export const downloadSolutionAsMarkdown = (solution: MathSolution, prompt: string): void => {
  const markdown = buildSolutionMarkdown(solution, prompt);
  const fileName = buildFileName('mathe-loesung', prompt || 'aufgabe', 'md');
  triggerTextDownload(markdown, fileName, 'text/markdown;charset=utf-8');
};

export const downloadSolutionAsPdf = (solution: MathSolution, prompt: string): void => {
  const markdown = buildSolutionMarkdown(solution, prompt);
  const title = `Loesung: ${prompt || 'Mathe-Aufgabe'}`;
  openPrintDialog(title, markdown);
};

export const downloadExamAsMarkdown = (session: ExamSession): void => {
  const markdown = buildExamMarkdown(session);
  const fileName = buildFileName('mathe-pruefung', session.topic || 'pruefung', 'md');
  triggerTextDownload(markdown, fileName, 'text/markdown;charset=utf-8');
};

export const downloadExamAsPdf = (session: ExamSession): void => {
  const markdown = buildExamMarkdown(session);
  const title = `Pruefung: ${session.topic || 'Mathe'}`;
  openPrintDialog(title, markdown);
};
