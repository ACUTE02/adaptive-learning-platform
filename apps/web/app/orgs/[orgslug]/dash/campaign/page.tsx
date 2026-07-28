"use client";

import React, { useState } from "react";
import { useAuth } from '@components/Contexts/AuthContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';
import { useSearchParams, useRouter } from 'next/navigation';

export default function CampaignModePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const targetId = searchParams.get('id');
  const [activeCampaign, setActiveCampaign] = useState<any>(null);
  const [modules, setModules] = useState<any[]>([]);
  const [syllabus, setSyllabus] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<any>(null);
  const [sessionState, setSessionState] = useState<'idle' | 'studying' | 'testing'>('idle');
  const [messages, setMessages] = useState<{role: string, text: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  const { session } = useAuth();
  const userId = session?.user?.email || session?.user?.id || session?.id || "unknown_user";

  // Fetch active campaign on mount
  React.useEffect(() => {
    async function fetchActiveCampaign() {
      try {
        let url = `/api/v1/engine/campaigns/active?user_id=${userId}`;
        if (targetId) url += `&campaign_id=${targetId}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.campaign && data.modules.length > 0) {
            setActiveCampaign(data.campaign);
            setModules(data.modules);
            setSyllabus(data.campaign.syllabus_text || "");
          }
        }
      } catch (err) {
        console.error("Failed to load active campaign", err);
      }
    }
    if (userId && userId !== "unknown_user") {
      fetchActiveCampaign();
    }
  }, [userId, targetId]);

  // Restore or initialize chat from local storage
  React.useEffect(() => {
    if (sessionState === 'studying' && activeModule && activeCampaign) {
      const storageKey = `campaign_chat_${activeCampaign.id}_${activeModule.id}`;
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        try {
          setMessages(JSON.parse(cached));
        } catch (e) {
          setMessages([
            { 
              role: 'ai', 
              text: `Welcome to ${activeModule.title}. I'll be your tutor for this module. We'll take this step-by-step. To get started, how familiar are you with this topic?` 
            }
          ]);
        }
      } else {
        setMessages([
          { 
            role: 'ai', 
            text: `Welcome to ${activeModule.title}. I'll be your tutor for this module. We'll take this step-by-step. To get started, how familiar are you with this topic?` 
          }
        ]);
      }
    }
  }, [sessionState, activeModule, activeCampaign]);

  // Save chat to local storage whenever messages update
  React.useEffect(() => {
    if (sessionState === 'studying' && activeModule && activeCampaign && messages.length > 0) {
      const storageKey = `campaign_chat_${activeCampaign.id}_${activeModule.id}`;
      localStorage.setItem(storageKey, JSON.stringify(messages));
    }
  }, [messages, sessionState, activeModule, activeCampaign]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    // Add user message
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setChatInput("");
    setIsChatLoading(true);

    try {
      // Get the last 6 messages, mapping 'text' to 'content' for the backend
      const recentMessages = messages.slice(-6).map(msg => ({
        role: msg.role,
        content: msg.text
      }));
      recentMessages.push({ role: 'user', content: userText });

      const res = await fetch(`/api/v1/engine/roadmap/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: recentMessages,
          teaching_prompt: activeModule?.teaching_prompt || "You are a helpful tutor.",
          subtopics: (() => {
            try {
              if (typeof activeModule?.subtopics === 'string') return JSON.parse(activeModule.subtopics);
              if (Array.isArray(activeModule?.subtopics)) return activeModule.subtopics;
              return [];
            } catch (e) {
              return [];
            }
          })()
        })
      });

      if (!res.ok) {
        throw new Error("Failed to get chat response");
      }
      
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.reply }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'ai', text: "Sorry, I am having trouble connecting to the network right now." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const resetStudyRoom = () => {
    setActiveModule(null);
    setSessionState('idle');
    setMessages([]);
    setChatInput("");
  };

  const handleGenerate = async () => {
    if (!syllabus.trim()) return;
    setIsGenerating(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/v1/engine/roadmap/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          syllabus_text: syllabus,
          student_id: userId
        }),
      });

      if (!res.ok) {
        let errorMsg = "Failed to generate campaign";
        try {
          const errorData = await res.json();
          if (errorData.detail) errorMsg = errorData.detail;
        } catch (e) {
          // ignore parsing error
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      const activeRes = await fetch(`/api/v1/engine/campaigns/active?user_id=${userId}`);
      if (activeRes.ok) {
        const activeData = await activeRes.json();
        setActiveCampaign(activeData.campaign);
        setModules(activeData.modules);
        setSyllabus(activeData.campaign.syllabus_text || "");
      } else {
        setModules(data.modules || []);
      }
      toast.success("Campaign generated successfully!");
    } catch (error: any) {
      console.error("Error generating campaign:", error);
      setError(error.message || "An unexpected error occurred.");
      toast.error(error.message || "Failed to generate campaign");
    } finally {
      setIsGenerating(false);
    }
  };

  if (activeModule) {
    return (
      <div className="min-h-full w-full p-6 md:p-10 bg-gray-50/50 dark:bg-zinc-950 flex flex-col">
        <div className="w-full max-w-7xl mx-auto flex flex-col h-full flex-grow">
          <div className="flex items-center gap-4 mb-8">
            <button 
              onClick={resetStudyRoom}
              className="p-2 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-xl transition-colors text-gray-500 dark:text-gray-400"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
              {activeModule.title}
            </h1>
          </div>
          
          <div className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-3xl flex flex-col border border-gray-100 dark:border-zinc-800 shadow-2xl min-h-[600px] relative overflow-hidden">
              {sessionState === 'idle' ? (
                <div className="flex-grow flex flex-col items-center justify-center text-center p-8 bg-gray-900">
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 mix-blend-overlay pointer-events-none"></div>
                  <div className="w-20 h-20 mb-6 rounded-full bg-indigo-500/20 flex items-center justify-center relative z-10">
                    <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-300 mb-2 relative z-10">AI Interactive Tutor</h2>
                  <p className="text-gray-500 relative z-10">Start a session to begin interacting with your AI tutor.</p>
                </div>
              ) : (
                <div className="flex-grow flex flex-col h-full bg-gray-50 dark:bg-zinc-900/50">
                  {/* Chat Messages Area */}
                  <div className="flex-grow overflow-y-auto p-6 flex flex-col gap-6">
                    {messages.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div 
                          className={`max-w-[80%] p-4 rounded-2xl ${
                            msg.role === 'user' 
                              ? 'bg-indigo-600 text-white rounded-br-none shadow-md shadow-indigo-500/20' 
                              : 'bg-white dark:bg-zinc-800 text-gray-800 dark:text-gray-200 rounded-bl-none shadow-sm border border-gray-100 dark:border-zinc-700/50'
                          }`}
                        >
                          {msg.role === 'ai' ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {msg.text}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {isChatLoading && (
                      <div className="flex justify-start">
                        <div className="max-w-[80%] p-4 rounded-2xl bg-white dark:bg-zinc-800 text-gray-800 dark:text-gray-200 rounded-bl-none shadow-sm border border-gray-100 dark:border-zinc-700/50 flex items-center gap-2">
                          <span className="flex gap-1">
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                          </span>
                          <span className="text-sm text-gray-500 ml-2">AI is typing...</span>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Chat Input Area */}
                  <div className="p-4 bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800">
                    <form onSubmit={handleSendMessage} className="relative flex items-center">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Type your message..."
                        className="w-full py-4 pl-6 pr-14 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-full text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                      />
                      <button
                        type="submit"
                        disabled={!chatInput.trim() || isChatLoading}
                        className="absolute right-2 p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:dark:bg-zinc-700 text-white rounded-full transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
            
            <div className="lg:col-span-1 bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-gray-100 dark:border-zinc-800 shadow-sm flex flex-col relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 to-violet-500"></div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Module Overview</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-8 flex-grow leading-relaxed">
                {activeModule.description}
              </p>
              
              <div className="flex flex-col gap-4 mt-auto">
                <button 
                  onClick={() => setSessionState('studying')}
                  disabled={sessionState === 'studying'}
                  className="w-full py-4 px-6 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-500/30 disabled:opacity-50 disabled:shadow-none disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2 group"
                >
                  <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{sessionState === 'studying' ? 'Session in Progress' : 'Start Study Session'}</span>
                </button>

              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full w-full p-6 md:p-10 flex flex-col items-center">
      <div className="w-full max-w-4xl">
        <div className="mb-12 text-center md:text-left flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
              Campaign Mode
            </h1>
            <p className="text-lg text-gray-500 dark:text-gray-400">
              Master advanced concepts through an interactive learning journey.
            </p>
          </div>
          {modules.length > 0 && (
            <button
              onClick={() => { setModules([]); setSyllabus(""); }}
              className="px-5 py-2.5 bg-transparent hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-semibold rounded-xl border-2 border-indigo-200 dark:border-indigo-800/60 transition-all active:scale-95 flex items-center justify-center gap-2 self-start md:self-auto"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>New Campaign</span>
            </button>
          )}
        </div>

        {modules.length === 0 ? (
          <div className="w-full max-w-2xl mx-auto bg-white dark:bg-zinc-900 rounded-3xl p-8 md:p-10 shadow-xl border border-gray-100 dark:border-zinc-800">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Create Your Campaign
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Paste your syllabus or type your study goals below. Our AI will architect a custom learning roadmap for you.
            </p>
            
            <textarea
              className="w-full min-h-[200px] p-5 rounded-2xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-y mb-6 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Paste your syllabus or topic here... e.g. I want to learn about Neural Networks and Computer Vision."
              value={syllabus}
              onChange={(e) => setSyllabus(e.target.value)}
              disabled={isGenerating}
            />

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium text-red-800 dark:text-red-300">
                  {error}
                </span>
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !syllabus.trim()}
              className="w-full py-4 px-6 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-500/30 disabled:opacity-60 disabled:shadow-none disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-3"
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>AI is architecting your plan...</span>
                </>
              ) : (
                <>
                  <span>Generate Campaign</span>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical connecting line */}
            <div className="absolute left-[24px] top-8 bottom-8 w-1 bg-gray-200 dark:bg-zinc-800 rounded-full transform -translate-x-1/2"></div>

            <div className="flex flex-col gap-8 md:gap-10">
            {modules.filter(m => !m.title.includes('Remediation') && !m.title.toLowerCase().includes('capstone')).map((module, index) => {
              // User explicitly requested: NO change when completed, everything always purple/active
              const isCompleted = false;
              const isActive = true;
              const isLocked = false;

              return (
                <div key={module.id} className="relative flex flex-col md:flex-row items-start gap-6 group">
                  {/* Status Node Indicator */}
                  <div className="flex-shrink-0 relative z-10 hidden md:block">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center border-4 border-white dark:border-zinc-950 shadow-sm transition-all duration-300
                      ${
                        isCompleted
                          ? "bg-emerald-500 text-white"
                          : isActive
                          ? "bg-indigo-600 text-white ring-4 ring-indigo-600/20 shadow-[0_0_20px_rgba(79,70,229,0.5)] scale-110"
                          : "bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500"
                      }`}
                    >
                      {/* Removed checkmark icon per request */
                      }
                      {isActive && (
                        <svg className="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M4 4l12 6-12 6z" />
                        </svg>
                      )}
                      {isLocked && (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Card Content */}
                  <div
                    className={`flex-grow p-6 md:p-8 rounded-3xl transition-all duration-300 w-full ml-0 md:ml-2
                      ${
                        isCompleted
                          ? "bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 shadow-sm opacity-90 hover:opacity-100 hover:shadow-md cursor-pointer"
                          : isActive
                          ? "bg-white dark:bg-zinc-900 border-2 border-indigo-500/30 dark:border-indigo-500/50 shadow-xl shadow-indigo-500/5 dark:shadow-indigo-900/20 md:-mt-2"
                          : "bg-gray-50/80 dark:bg-zinc-900/40 border border-gray-100 dark:border-zinc-800/80 opacity-60 cursor-not-allowed"
                      }
                    `}
                  >
                    {/* Mobile Only Indicator */}
                    <div className="md:hidden flex items-center gap-3 mb-4">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm
                        ${
                          isCompleted
                            ? "bg-emerald-500 text-white"
                            : isActive
                            ? "bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)]"
                            : "bg-gray-200 dark:bg-zinc-800 text-gray-500"
                        }`}
                      >
                         {/* Removed checkmark icon per request */
                        }
                        {isActive && (
                          <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M4 4l12 6-12 6z" />
                          </svg>
                        )}
                        {isLocked && (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        )}
                      </div>
                      <div className="text-xs font-extrabold uppercase tracking-widest text-gray-400 dark:text-zinc-500">
                        Module {index + 1}
                      </div>
                    </div>

                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      <div>
                        <div className="hidden md:block text-xs font-extrabold uppercase tracking-widest mb-2 text-gray-400 dark:text-zinc-500">
                          Module {index + 1}
                        </div>
                        <h3
                          className={`text-xl md:text-2xl font-bold leading-tight
                            ${
                              isCompleted
                                ? "text-gray-800 dark:text-gray-200"
                                : isActive
                                ? "text-gray-900 dark:text-white"
                                : "text-gray-500 dark:text-zinc-500"
                            }
                          `}
                        >
                          {module.title}
                        </h3>
                        {(() => {
                          // Safely evaluate whether subtopics need to be decoded from stringified JSON rows
                          let parsedSubtopics: string[] = [];
                          try {
                            if (typeof module.subtopics === 'string') {
                              parsedSubtopics = JSON.parse(module.subtopics);
                            } else if (Array.isArray(module.subtopics)) {
                              parsedSubtopics = module.subtopics;
                            }
                          } catch (e) {
                            console.error("Failed to parse subtopics array:", e);
                          }

                          if (!parsedSubtopics || parsedSubtopics.length === 0) return null;

                          return (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {parsedSubtopics.map((sub: string, idx: number) => (
                                <span key={idx} className="bg-purple-100 text-purple-800 text-xs font-medium px-2.5 py-0.5 rounded-full dark:bg-purple-900 dark:text-purple-300">
                                  {sub}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>

                      {isActive && (
                        <button 
                          onClick={() => setActiveModule(module)}
                          className="flex-shrink-0 w-full lg:w-auto px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-500/30 transition-all active:scale-95 flex items-center justify-center gap-2 group/btn"
                        >
                          <span>Start Module</span>
                          <svg className="w-5 h-5 group-hover/btn:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </button>
                      )}

                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
