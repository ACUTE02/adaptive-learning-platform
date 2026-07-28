'use client';

import React, { useState, useEffect, useRef } from 'react';

interface TestingArenaProps {
  assessment: any;
  onCancel: () => void;
  onSubmit: (score: number, timeTaken: number, answers: Record<string, string>) => Promise<void> | void;
}

export default function TestingArena({ assessment, onCancel, onSubmit }: TestingArenaProps) {
  // Use a fallback of 30 mins if time_allowed_mins is missing or invalid
  const fallbackMins = (assessment && assessment.time_allowed_mins && !isNaN(assessment.time_allowed_mins)) ? assessment.time_allowed_mins : 30;
  const initialTime = fallbackMins * 60;
  const initialTimeLeft = (assessment && assessment.time_remaining_seconds > 0) ? assessment.time_remaining_seconds : initialTime;
  
  const [timeLeft, setTimeLeft] = useState(initialTimeLeft);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [exitCount, setExitCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const arenaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (assessment.saved_answers && Object.keys(assessment.saved_answers).length > 0) {
      setAnswers(assessment.saved_answers);
    }
  }, [assessment]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (hasStarted && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (hasStarted && timeLeft <= 0) {
      // Auto submit when time runs out
      handleAutoSubmit();
    }
    return () => clearInterval(timer);
  }, [hasStarted, timeLeft]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isCurrentlyFullscreen);
      
      if (hasStarted && !isCurrentlyFullscreen) {
        setExitCount(prev => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            alert("Security Violation: You have exited fullscreen too many times. Your exam is cancelled.");
            onCancel();
          } else {
            alert(`Warning: You exited fullscreen. (${newCount}/3 warnings)`);
          }
          return newCount;
        });
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [hasStarted, onCancel]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && hasStarted) {
        setExitCount(prev => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            alert("Security Violation: You have switched tabs or minimized the browser too many times. Your exam is cancelled.");
            onCancel();
          } else {
            alert(`Warning: You switched tabs. (${newCount}/3 warnings)`);
          }
          return newCount;
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [hasStarted, onCancel]);

  const startExam = async () => {
    try {
      const docElm = document.documentElement as any;
      if (docElm.requestFullscreen) {
        await docElm.requestFullscreen();
      } else if (docElm.webkitRequestFullscreen) { // Safari
        await docElm.webkitRequestFullscreen();
      } else if (docElm.msRequestFullscreen) { // IE11
        await docElm.msRequestFullscreen();
      }
      setHasStarted(true);
      setIsFullscreen(true);
    } catch (err) {
      console.error("Fullscreen request failed:", err);
      alert("Browser prevented automatic fullscreen, but you can still proceed with the exam.");
      setHasStarted(true);
    }
  };

  const calculateScore = () => {
    let correctCount = 0;
    let totalQuestions = 0;

    if (assessment.type === 'module_quiz' && assessment.exam_data?.questions) {
      assessment.exam_data.questions.forEach((q: any, i: number) => {
        totalQuestions++;
        if (answers[`q_${i}`] === q.correct_answer) {
          correctCount++;
        }
      });
    }

    if (assessment.type === 'capstone' && assessment.exam_data?.part_b) {
      assessment.exam_data.part_b.forEach((q: any, i: number) => {
        totalQuestions++;
        if (answers[`bq_${i}`] === q.correct_answer) {
          correctCount++;
        }
      });
    }

    if (totalQuestions === 0) return 0;
    const percentage = correctCount / totalQuestions;
    return Math.round(percentage * (assessment.total_marks || 50));
  };

  const handleAutoSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(calculateScore(), initialTime - timeLeft, answers);
    } finally {
      setIsSubmitting(false);
    }
  };

  const manualSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(calculateScore(), initialTime - timeLeft, answers);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const manualFail = () => {
    // Keep for dev bypass
    onSubmit(assessment.total_marks * 0.35, initialTime - timeLeft); 
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!assessment || !assessment.exam_data) {
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
        <p className="text-gray-400 max-w-lg text-center mb-8">
          This exam requires fullscreen mode. Exiting fullscreen more than 3 times will result in an automatic cancellation and a severe penalty.
        </p>
        <button 
          onClick={startExam}
          className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-xl font-bold rounded-lg shadow-lg shadow-blue-500/20"
        >
          Enter Fullscreen & Start
        </button>
      </div>
    );
  }

  return (
    <div ref={arenaRef} className="fixed inset-0 z-[9999] w-screen h-screen bg-slate-950 overflow-y-auto text-white flex flex-col">
      {/* Top Bar */}
      <div className="h-16 border-b border-gray-800 bg-gray-900 flex items-center justify-between px-8">
        <div className="flex items-center space-x-4">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
          <span className="font-medium text-gray-300">Secure Proctoring Active</span>
        </div>
        <div className="text-2xl font-mono font-bold text-blue-400">
          {formatTime(timeLeft)}
        </div>
        <button 
          onClick={manualSubmit}
          disabled={isSubmitting}
          className={`px-6 py-2 rounded-md font-medium ${isSubmitting ? 'bg-gray-600 cursor-not-allowed text-gray-300' : 'bg-green-600 hover:bg-green-700'}`}
        >
          {isSubmitting ? 'Grading...' : 'Submit Exam'}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full space-y-12">
        {assessment.type === 'module_quiz' && assessment.exam_data?.questions && (
          <div>
            {assessment.exam_data.questions.map((q: any, i: number) => (
              <div key={i} className="mb-8 bg-gray-900 p-6 rounded-lg border border-gray-800">
                <p className="text-lg font-medium mb-4">{i + 1}. {q.question}</p>
                <div className="space-y-2">
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
              </div>
            ))}
          </div>
        )}

        {assessment.type === 'capstone' && assessment.exam_data && (
          <div>
            <h2 className="text-2xl font-bold text-purple-400 mb-6">Part A: Theory Integration</h2>
            {assessment.exam_data.part_a?.map((q: any, i: number) => (
              <div key={`a_${i}`} className="mb-8 bg-gray-900 p-6 rounded-lg border border-gray-800">
                <p className="text-lg font-medium mb-4">A{i + 1}. {q.question}</p>
                <textarea 
                  className="w-full h-32 bg-gray-800 border border-gray-700 rounded-md p-4 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Type your comprehensive answer here... (Paste is disabled for security)"
                  value={answers[`a_${i}`] || ''}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [`a_${i}`]: e.target.value }))}
                  onPaste={(e) => {
                    e.preventDefault();
                    alert("Security Warning: Pasting text is strictly prohibited during capstone exams.");
                  }}
                ></textarea>
              </div>
            ))}
            
            <h2 className="text-2xl font-bold text-blue-400 mb-6 mt-12">Part B: Objective MCQs</h2>
            {assessment.exam_data.part_b?.map((q: any, i: number) => (
              <div key={`b_${i}`} className="mb-8 bg-gray-900 p-6 rounded-lg border border-gray-800">
                <p className="text-lg font-medium mb-4">B{i + 1}. {q.question}</p>
                <div className="space-y-2">
                  {q.options?.map((opt: string, j: number) => (
                    <label key={j} className="flex items-center space-x-3 p-3 rounded bg-gray-800/50 hover:bg-gray-800 cursor-pointer">
                      <input 
                        type="radio" 
                        name={`bq_${i}`} 
                        value={opt}
                        checked={answers[`bq_${i}`] === opt}
                        onChange={(e) => setAnswers(prev => ({ ...prev, [`bq_${i}`]: e.target.value }))}
                        className="text-blue-500 bg-gray-900 border-gray-700 focus:ring-blue-500" 
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Development tools only */}
        <div className="pt-12 flex space-x-4">
           <button onClick={manualFail} className="text-xs text-red-500 border border-red-900 px-2 py-1 rounded">Dev: Force Fail (Trigger Remediation)</button>
        </div>
      </div>
    </div>
  );
}
