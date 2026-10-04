'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface TestingArenaProps {
  assessment: any;
  onCancel: () => Promise<void> | void;
  // Only the answers are sent. The server holds the answer key and does the grading.
  onSubmit: (timeTaken: number, answers: Record<string, string>) => Promise<void> | void;
}

const MAX_FOCUS_WARNINGS = 3;

export default function TestingArena({ assessment, onCancel, onSubmit }: TestingArenaProps) {
  // Use a fallback of 30 mins if time_allowed_mins is missing or invalid
  const fallbackMins = (assessment && assessment.time_allowed_mins && !isNaN(assessment.time_allowed_mins)) ? assessment.time_allowed_mins : 30;
  const initialTime = fallbackMins * 60;
  // The server tracks when the attempt started; resume from its clock when it tells us.
  const initialTimeLeft = (assessment && assessment.time_remaining_seconds > 0) ? assessment.time_remaining_seconds : initialTime;

  const [timeLeft, setTimeLeft] = useState(initialTimeLeft);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [hasStarted, setHasStarted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const violationsRef = useRef(0);
  const finishedRef = useRef(false);

  const leaveFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const submit = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit(initialTimeLeft - timeLeft, answers);
      leaveFullscreen();
    } catch {
      // The parent reports the error; let the student try again.
      finishedRef.current = false;
    } finally {
      setIsSubmitting(false);
    }
  }, [onSubmit, initialTimeLeft, timeLeft, answers]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (hasStarted && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev: number) => prev - 1);
      }, 1000);
    } else if (hasStarted && timeLeft <= 0) {
      // Auto submit when time runs out
      submit();
    }
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStarted, timeLeft]);

  const registerViolation = useCallback((what: string) => {
    if (finishedRef.current) return;
    violationsRef.current += 1;
    const count = violationsRef.current;
    if (count >= MAX_FOCUS_WARNINGS) {
      finishedRef.current = true;
      leaveFullscreen();
      setWarning(`You ${what} ${MAX_FOCUS_WARNINGS} times. This attempt has been cancelled and counts as a failed attempt.`);
      onCancel();
    } else {
      setWarning(`Warning ${count} of ${MAX_FOCUS_WARNINGS}: you ${what}. At ${MAX_FOCUS_WARNINGS} warnings this attempt is cancelled.`);
    }
  }, [onCancel]);

  useEffect(() => {
    if (!hasStarted) return;
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) registerViolation('left fullscreen');
    };
    const handleVisibilityChange = () => {
      if (document.hidden) registerViolation('switched away from the exam');
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasStarted, registerViolation]);

  const startExam = async () => {
    try {
      const docElm = document.documentElement as any;
      if (docElm.requestFullscreen) {
        await docElm.requestFullscreen();
      } else if (docElm.webkitRequestFullscreen) { // Safari
        await docElm.webkitRequestFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen request failed:", err);
      setWarning("Your browser did not allow fullscreen. You can still take the exam.");
    }
    setHasStarted(true);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const questions: any[] = assessment?.exam_data?.questions || [];

  if (!assessment || questions.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h1 className="text-2xl font-bold mb-2">Loading Assessment...</h1>
        <p className="text-gray-400">Please wait while we prepare your exam environment.</p>
      </div>
    );
  }

  if (!hasStarted) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
        <h1 className="text-4xl font-bold mb-4">Ready to start?</h1>
        <p className="text-gray-400 max-w-lg text-center mb-3">
          {questions.length} questions, {formatTime(timeLeft)} remaining. You need 80% to pass.
        </p>
        <p className="text-gray-400 max-w-lg text-center mb-8">
          The exam runs in fullscreen. If you leave fullscreen or switch tabs {MAX_FOCUS_WARNINGS} times, the attempt is cancelled and counts as a failed attempt.
        </p>
        <button
          onClick={startExam}
          className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-xl font-bold rounded-lg shadow-lg shadow-blue-500/20 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300"
        >
          Enter Fullscreen & Start
        </button>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;

  return (
    <div className="fixed inset-0 z-[9999] w-screen h-screen bg-slate-950 overflow-y-auto text-white flex flex-col">
      {/* Top Bar */}
      <div className="h-16 shrink-0 border-b border-gray-800 bg-gray-900 flex items-center justify-between px-4 sm:px-8 gap-4">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse shrink-0" aria-hidden="true"></div>
          <span className="font-medium text-gray-300 truncate">Focus monitoring on · {answeredCount}/{questions.length} answered</span>
        </div>
        <div className="text-2xl font-mono font-bold text-blue-400" role="timer" aria-label="Time remaining">
          {formatTime(timeLeft)}
        </div>
        <button
          onClick={submit}
          disabled={isSubmitting}
          className={`px-6 py-2 rounded-md font-medium whitespace-nowrap ${isSubmitting ? 'bg-gray-600 cursor-not-allowed text-gray-300' : 'bg-green-600 hover:bg-green-700'}`}
        >
          {isSubmitting ? 'Grading...' : 'Submit Exam'}
        </button>
      </div>

      {warning && (
        <div role="alert" className="shrink-0 bg-amber-500 text-black px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
          <span className="font-medium">{warning}</span>
          <button onClick={() => setWarning(null)} className="underline font-semibold whitespace-nowrap">Dismiss</button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-4xl mx-auto w-full space-y-12">
        <div>
          {questions.map((q: any, i: number) => (
            <fieldset key={i} className="mb-8 bg-gray-900 p-6 rounded-lg border border-gray-800">
              <legend className="text-lg font-medium mb-4 float-left w-full">{i + 1}. {q.question}</legend>
              <div className="space-y-2 clear-both">
                {q.options?.map((opt: string, j: number) => (
                  <label key={j} className="flex items-center space-x-3 p-3 rounded bg-gray-800/50 hover:bg-gray-800 cursor-pointer">
                    <input
                      type="radio"
                      name={`q_${i}`}
                      value={opt}
                      checked={answers[`q_${i}`] === opt}
                      onChange={(e) => setAnswers(prev => ({ ...prev, [`q_${i}`]: e.target.value }))}
                      className="text-blue-500 bg-gray-900 border-gray-700 focus:ring-blue-500"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
    </div>
  );
}
