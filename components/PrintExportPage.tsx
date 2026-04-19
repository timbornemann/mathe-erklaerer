import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Printer } from 'lucide-react';
import MathRenderer from './MathRenderer';

interface PrintExportPayload {
  title: string;
  markdown: string;
  createdAt: number;
}

interface PrintExportPageProps {
  exportKey: string;
}

const PrintExportPage: React.FC<PrintExportPageProps> = ({ exportKey }) => {
  const [payload, setPayload] = useState<PrintExportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [didAutoPrint, setDidAutoPrint] = useState(false);
  const loadedPayloadRef = useRef(false);

  useEffect(() => {
    const raw = localStorage.getItem(exportKey);
    if (!raw) {
      // In React StrictMode kann der Effect doppelt laufen.
      // Beim zweiten Lauf ist der Key evtl. bereits entfernt.
      if (loadedPayloadRef.current) return;
      setError('Exportdaten nicht gefunden. Bitte Export erneut starten.');
      return;
    }

    try {
      const parsed = JSON.parse(raw) as PrintExportPayload;
      if (!parsed || typeof parsed.title !== 'string' || typeof parsed.markdown !== 'string') {
        throw new Error('Ungueltige Exportdaten');
      }
      loadedPayloadRef.current = true;
      setError(null);
      setPayload(parsed);
      // Export-Daten nur einmal benoetigt.
      localStorage.removeItem(exportKey);
    } catch (parseError) {
      console.error(parseError);
      setError('Exportdaten konnten nicht gelesen werden.');
      localStorage.removeItem(exportKey);
    }
  }, [exportKey]);

  useEffect(() => {
    if (!payload || didAutoPrint) return;

    let attempts = 0;
    const maxAttempts = 45; // ca. 9 Sekunden
    const intervalId = window.setInterval(() => {
      attempts += 1;
      const bodyText = document.body.innerText || '';
      const stillRendering = bodyText.includes('Diagramm wird geladen');

      if (!stillRendering || attempts >= maxAttempts) {
        window.clearInterval(intervalId);
        setDidAutoPrint(true);
        window.setTimeout(() => {
          window.focus();
          window.print();
        }, 120);
      }
    }, 200);

    return () => window.clearInterval(intervalId);
  }, [didAutoPrint, payload]);

  useEffect(() => {
    const closeAfterPrint = () => window.setTimeout(() => window.close(), 120);
    window.addEventListener('afterprint', closeAfterPrint);
    return () => window.removeEventListener('afterprint', closeAfterPrint);
  }, []);

  const createdText = useMemo(() => {
    if (!payload?.createdAt) return '';
    return new Date(payload.createdAt).toLocaleString('de-DE');
  }, [payload?.createdAt]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{`
        @page {
          size: A4;
          margin: 16mm;
        }
        @media print {
          .print-controls {
            display: none !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>

      <div className="print-controls sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <p className="text-sm text-slate-600">Druckansicht</p>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Printer className="h-4 w-4" />
            Drucken
          </button>
        </div>
      </div>

      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {!error && !payload && (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Export wird vorbereitet...
          </div>
        )}

        {payload && (
          <article>
            <header className="mb-8 border-b border-slate-200 pb-4">
              <h1 className="text-2xl font-bold text-slate-900">{payload.title}</h1>
              <p className="mt-1 text-sm text-slate-500">Erstellt: {createdText}</p>
            </header>
            <div className="text-[16px] leading-relaxed">
              <MathRenderer content={payload.markdown} />
            </div>
          </article>
        )}
      </main>
    </div>
  );
};

export default PrintExportPage;
