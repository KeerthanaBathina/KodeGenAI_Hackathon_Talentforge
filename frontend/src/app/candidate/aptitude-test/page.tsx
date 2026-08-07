'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { buildApiUrl } from '@/lib/api/url';

interface AptitudeQuestion {
  id: string;
  category: string;
  topic: string;
  question: string;
  options: string[];
}

interface AptitudeSessionPayload {
  sessionId: string;
  status: 'in_progress' | 'completed' | 'expired';
  score: number | null;
  durationMinutes: number;
  totalQuestions: number;
  launchedAt: string;
  expiresAt: string;
  remainingSeconds: number;
  candidateName: string;
  requisitionTitle: string;
  submittedAt: string | null;
  questions: AptitudeQuestion[];
  attemptedCount: number;
}

function formatRemaining(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as T | { message?: string; error?: string } | null;

  if (!response.ok) {
    const failureMessage =
      typeof data === 'object' && data !== null
        ? ((data as { message?: string; error?: string }).message ??
          (data as { message?: string; error?: string }).error)
        : null;
    throw new Error(failureMessage ?? 'Request failed');
  }

  return data as T;
}

export default function CandidateAptitudeTestPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AptitudeSessionPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [submittedResult, setSubmittedResult] = useState<{
    score: number;
    totalQuestions: number;
    attemptedCount: number;
    correctAnswers: number;
  } | null>(null);

  const isCompleted = payload?.status === 'completed' || Boolean(submittedResult);
  const isExpired = payload?.status === 'expired';

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Missing aptitude test token in URL.');
      return;
    }

    let disposed = false;

    async function loadSession() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(buildApiUrl(`/api/aptitude-test/${token}`), {
          method: 'GET',
        });
        const data = await readJsonResponse<AptitudeSessionPayload>(response);
        if (disposed) {
          return;
        }

        setPayload(data);
        setRemainingSeconds(data.remainingSeconds);
      } catch (loadError: unknown) {
        if (disposed) {
          return;
        }

        const message =
          loadError instanceof Error ? loadError.message : 'Unable to load aptitude test session.';
        setError(message);
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      disposed = true;
    };
  }, [token]);

  useEffect(() => {
    if (!payload || isCompleted || isExpired) {
      return;
    }

    setRemainingSeconds(payload.remainingSeconds);

    const intervalId = window.setInterval(() => {
      setRemainingSeconds((previous) => {
        if (previous <= 1) {
          window.clearInterval(intervalId);
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [payload, isCompleted, isExpired]);

  const attemptedCount = useMemo(() => Object.keys(answers).length, [answers]);

  async function handleSubmit() {
    if (!token || !payload || submitting || isCompleted || isExpired) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(buildApiUrl(`/api/aptitude-test/${token}/submit`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ answers }),
      });
      const data = await readJsonResponse<{
        success: boolean;
        score: number;
        totalQuestions: number;
        attemptedCount: number;
        correctAnswers: number;
      }>(response);

      setSubmittedResult({
        score: data.score,
        totalQuestions: data.totalQuestions,
        attemptedCount: data.attemptedCount,
        correctAnswers: data.correctAnswers,
      });

      setPayload((previous) =>
        previous
          ? {
              ...previous,
              status: 'completed',
              score: data.score,
            }
          : previous
      );
    } catch (submitError: unknown) {
      const message = submitError instanceof Error ? submitError.message : 'Failed to submit test.';
      setError(message);

      if (message.toLowerCase().includes('expired')) {
        setPayload((previous) =>
          previous
            ? {
                ...previous,
                status: 'expired',
              }
            : previous
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-4 py-10">
        <p className="text-sm text-slate-600">Loading aptitude test session...</p>
      </main>
    );
  }

  if (error && !payload) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-4 py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-4 py-10">
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
          Unable to display aptitude test.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8">
      <header className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Aptitude Test</h1>
        <p className="mt-1 text-sm text-slate-600">
          Candidate: <span className="font-medium text-slate-800">{payload.candidateName}</span>
        </p>
        <p className="text-sm text-slate-600">
          Role: <span className="font-medium text-slate-800">{payload.requisitionTitle}</span>
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Questions</p>
            <p className="text-lg font-semibold text-slate-900">{payload.totalQuestions}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Attempted</p>
            <p className="text-lg font-semibold text-slate-900">{attemptedCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Time Left</p>
            <p className={`text-lg font-semibold ${remainingSeconds <= 300 ? 'text-red-600' : 'text-slate-900'}`}>
              {formatRemaining(remainingSeconds)}
            </p>
          </div>
        </div>
      </header>

      {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      {isExpired ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
          <h2 className="text-lg font-semibold">Test expired</h2>
          <p className="mt-1 text-sm">
            Your 45-minute window has ended. Please contact the recruitment team if this was unexpected.
          </p>
        </section>
      ) : null}

      {isCompleted ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
          <h2 className="text-lg font-semibold">Test submitted</h2>
          <p className="mt-1 text-sm">
            Your responses were successfully recorded.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-emerald-200 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Score</p>
              <p className="text-lg font-semibold text-emerald-900">
                {submittedResult?.score ?? payload.score ?? 0}%
              </p>
            </div>
            <div className="rounded-md border border-emerald-200 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Attempted</p>
              <p className="text-lg font-semibold text-emerald-900">
                {submittedResult?.attemptedCount ?? payload.attemptedCount}
              </p>
            </div>
            <div className="rounded-md border border-emerald-200 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Correct</p>
              <p className="text-lg font-semibold text-emerald-900">
                {submittedResult?.correctAnswers ?? '-'}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {!isCompleted && !isExpired ? (
        <section className="space-y-4">
          {payload.questions.map((question, index) => (
            <article key={question.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                {question.category} • {question.topic}
              </p>
              <h2 className="mt-2 text-base font-semibold text-slate-900">
                {index + 1}. {question.question}
              </h2>
              <div className="mt-4 space-y-2">
                {question.options.map((option, optionIndex) => {
                  const checked = answers[question.id] === optionIndex;
                  return (
                    <label
                      key={`${question.id}-${optionIndex}`}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition ${
                        checked
                          ? 'border-blue-500 bg-blue-50 text-blue-900'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name={question.id}
                        checked={checked}
                        onChange={() =>
                          setAnswers((previous) => ({
                            ...previous,
                            [question.id]: optionIndex,
                          }))
                        }
                        className="mt-0.5"
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
              </div>
            </article>
          ))}

          <div className="sticky bottom-0 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                Attempted {attemptedCount} / {payload.totalQuestions}
              </p>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || remainingSeconds <= 0}
                className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {submitting ? 'Submitting...' : 'Submit Test'}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
