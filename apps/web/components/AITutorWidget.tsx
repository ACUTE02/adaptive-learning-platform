"use client";

import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useAuth } from '@components/Contexts/AuthContext';

export function AITutorWidget() {
  const [studentInput, setStudentInput] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);

  const { session, status } = useAuth();
  const userId = session?.user?.email || session?.user?.id || session?.id || "unknown_user";
  const isAuthLoading = status === "loading";
  const isAuthenticated = status === "authenticated";

  const fetchHistory = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/v1/engine/history?student_id=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchHistory();
    }
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: number) => {
    e.stopPropagation();
    
    try {
      const res = await fetch(`/api/v1/engine/history/${sessionId}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        setHistory(prev => prev.filter(session => session.id !== sessionId));
      } else {
        console.error("Failed to delete session");
      }
    } catch (error) {
      console.error("Error deleting session:", error);
    }
  };

  const getAITutorHelp = async () => {
    setIsLoading(true);
    setAiResponse(""); // Clear previous response when submitting
    
    console.log("Session object:", session);
    
    try {
      const response = await fetch("/api/v1/engine/remediate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          student_id: userId, 
          struggle_area: studentInput
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      let data;
      try {
        data = await response.json();
      } catch (err) {
        throw new Error("Failed to parse JSON response");
      }

      setAiResponse(data.scaffolding_text);
      
      // Refresh history after a successful new session
      await fetchHistory();
      
    } catch (error) {
      console.error("Failed to reach AI Engine:", error);
      setAiResponse("The AI Tutor is currently unavailable. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full mx-auto p-6 md:p-8 bg-white dark:bg-zinc-900 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.15)] border border-gray-100 dark:border-zinc-800 transition-all duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* Left Side: Input area */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-500/20 dark:to-violet-500/20 text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-50 dark:border-indigo-500/10">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20"></path>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                Ask the AI Tutor
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Describe your struggle, and I'll help you step-by-step.
              </p>
            </div>
          </div>
          
          <div className="relative group flex-grow flex flex-col">
            <textarea
              className="w-full flex-grow min-h-[200px] p-5 rounded-2xl border border-gray-200 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-800/50 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 focus:bg-white dark:focus:bg-zinc-800 resize-y transition-all duration-200 shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={isAuthLoading ? "Loading your profile..." : !isAuthenticated ? "Please sign in to ask the AI Tutor." : "What are you struggling with? e.g. I don't understand how photosynthesis works."}
              value={studentInput}
              onChange={(e) => setStudentInput(e.target.value)}
              disabled={!isAuthenticated || isAuthLoading}
            />
          </div>
          
          <button
            onClick={getAITutorHelp}
            disabled={isLoading || !studentInput.trim() || !isAuthenticated}
            className="relative w-full py-4 px-6 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-500/30 disabled:opacity-60 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] overflow-hidden group"
          >
            <div className="flex items-center justify-center gap-2">
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Thinking deeply...</span>
                </>
              ) : (
                <>
                  <span>Get Help</span>
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </div>
          </button>
        </div>

        {/* Right Side: Output area */}
        <div className={`flex flex-col h-full min-h-[300px] rounded-2xl transition-all duration-500 ${aiResponse || isLoading ? 'opacity-100' : 'opacity-40 grayscale-[50%] pointer-events-none'}`}>
          <div className="flex-grow p-6 md:p-8 rounded-2xl bg-gradient-to-br from-indigo-50/80 to-violet-50/80 dark:from-indigo-900/10 dark:to-violet-900/10 border border-indigo-100/50 dark:border-indigo-800/30 shadow-sm relative overflow-hidden h-full flex flex-col">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-indigo-500 to-violet-500"></div>
            
            <h3 className="text-sm font-bold text-indigo-800 dark:text-indigo-300 mb-6 uppercase tracking-widest flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Tutor Response
            </h3>
            
            <div className="flex-grow overflow-y-auto">
              {isLoading ? (
                <div className="flex flex-col gap-4 animate-pulse">
                  <div className="h-4 bg-indigo-200/50 dark:bg-indigo-800/50 rounded w-3/4"></div>
                  <div className="h-4 bg-indigo-200/50 dark:bg-indigo-800/50 rounded w-full"></div>
                  <div className="h-4 bg-indigo-200/50 dark:bg-indigo-800/50 rounded w-5/6"></div>
                  <div className="h-4 bg-indigo-200/50 dark:bg-indigo-800/50 rounded w-2/3 mt-4"></div>
                  <div className="h-4 bg-indigo-200/50 dark:bg-indigo-800/50 rounded w-4/5"></div>
                </div>
              ) : aiResponse ? (
                <div className="prose prose-indigo dark:prose-invert max-w-none text-gray-700 dark:text-gray-200 animate-in fade-in slide-in-from-bottom-2 duration-500 text-[15px] md:text-base leading-relaxed">
                  <ReactMarkdown>{aiResponse}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-center text-gray-400 dark:text-gray-500 italic text-sm md:text-base">
                  Describe what you're struggling with and click "Get Help" to receive guidance.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* History Section */}
      {history.length > 0 && (
        <div className="mt-12 border-t border-gray-100 dark:border-zinc-800 pt-8">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight mb-6 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Past Sessions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {history.map((session, index) => (
              <div 
                key={index} 
                onClick={() => setSelectedSession(session)}
                className="relative p-5 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors cursor-pointer group"
              >
                <button
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Delete session"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2 pr-6 line-clamp-1">{session.struggle_area}</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3">
                  {session.scaffolding_text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Overlay */}
      {selectedSession && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedSession(null)}
        >
          <div 
            className="max-w-2xl w-full max-h-[80vh] overflow-y-auto bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setSelectedSession(null)}
              className="absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 pr-8">
              {selectedSession.struggle_area}
            </h3>
            <div className="prose prose-indigo dark:prose-invert max-w-none text-gray-700 dark:text-gray-200 text-[15px] md:text-base leading-relaxed">
              <ReactMarkdown>{selectedSession.scaffolding_text}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AITutorWidget;
