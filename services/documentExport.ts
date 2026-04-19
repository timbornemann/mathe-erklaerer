import { ExamSession, MathSolution, SolutionStep } from '../types';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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

const toPrintableHtml = (title: string, textContent: string): string => {
  const safeTitle = escapeHtml(title);
  const safeText = escapeHtml(textContent);

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    @page {
      size: A4;
      margin: 16mm;
    }
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      color: #0f172a;
      margin: 0;
    }
    h1 {
      font-size: 20px;
      margin: 0 0 12px 0;
    }
    p {
      margin: 0 0 12px 0;
      color: #475569;
      font-size: 13px;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      font-family: "Cascadia Code", "Consolas", monospace;
      font-size: 12px;
      line-height: 1.45;
      margin: 0;
      padding: 12px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      background: #f8fafc;
    }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <p>Erstellt mit Mathe Erklaerer</p>
  <pre>${safeText}</pre>
</body>
</html>`;
};

const openPrintDialog = (title: string, textContent: string): void => {
  const html = toPrintableHtml(title, textContent);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.opacity = '0';

  let blobUrl: string | null = null;
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  };

  iframe.onload = () => {
    const frameWindow = iframe.contentWindow;
    if (!frameWindow) {
      cleanup();
      return;
    }

    const finish = () => cleanup();
    frameWindow.onafterprint = finish;
    frameWindow.focus();
    frameWindow.print();
    window.setTimeout(finish, 2000);
  };

  document.body.appendChild(iframe);

  if ('srcdoc' in iframe) {
    iframe.srcdoc = html;
  } else {
    blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    iframe.src = blobUrl;
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
