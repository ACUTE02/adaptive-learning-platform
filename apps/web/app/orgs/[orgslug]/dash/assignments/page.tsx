'use client';

import React, { useState, useEffect } from 'react';
import TestingArena from '@/components/assignments/TestingArena';
import { Lock, AlertTriangle, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export default function AssignmentsHub() {
  const searchParams = useSearchParams();
  const isGodMode = searchParams.get('godmode') === 'true';
  const [campaignsList, setCampaignsList] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [selectedCampaignDetails, setSelectedCampaignDetails] = useState<any | null>(null);
  
  const [activeAssessment, setActiveAssessment] = useState<any | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // 1. Fetch all campaigns for the tabs
  useEffect(() => {
    fetch('/api/v1/engine/campaigns?user_id=uuayush2@gmail.com')
      .then(res => res.json())
      .then(data => {
        setCampaignsList(data);
        if (data.length > 0) {
          setSelectedCampaignId(data[0].id);
        }
      });
  }, []);

  // 2. Fetch specific campaign details when tab changes
  useEffect(() => {
    if (selectedCampaignId) {
      fetch(`/api/v1/engine/campaigns/active?user_id=uuayush2@gmail.com&campaign_id=${selectedCampaignId}`)
        .then(res => res.json())
        .then(data => {
          if (data.campaign) {
            setSelectedCampaignDetails(data);
          }
        });
    }
  }, [selectedCampaignId]);


  const handleStartModuleAssessment = async (moduleId: number) => {
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/v1/engine/assessments/${moduleId}/start`, { method: 'POST' });
      const data = await res.json();
      setActiveAssessment(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };



  const handleCancelAssessment = async (assessmentId: number) => {
    await fetch(`/api/v1/engine/assessments/${assessmentId}/cancel`, { method: 'POST' });
    setActiveAssessment(null);
    window.location.reload();
  };

  const handleSubmitAssessment = async (assessmentId: number, score: number, timeTaken: number, answers: Record<string, string>) => {
    await fetch(`/api/v1/engine/assessments/${assessmentId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, time_taken_seconds: timeTaken, answers })
    });
    setActiveAssessment(null);
    window.location.reload();
  };

  const handleDeleteCampaign = async (campaignId: number) => {
    const confirmed = window.confirm("Are you sure you want to permanently delete this campaign? This will destroy all associated modules and exam data.");
    if (!confirmed) return;
    
    try {
      const res = await fetch(`/api/v1/engine/campaigns/${campaignId}`, { method: 'DELETE' });
      if (res.ok) {
        const updatedList = campaignsList.filter(c => c.id !== campaignId);
        setCampaignsList(updatedList);
        
        if (updatedList.length > 0) {
          setSelectedCampaignId(updatedList[0].id);
        } else {
          setSelectedCampaignId(null);
          setSelectedCampaignDetails(null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (activeAssessment) {
    return (
      <TestingArena 
        assessment={activeAssessment} 
        onCancel={() => handleCancelAssessment(activeAssessment.id)}
        onSubmit={(score, timeTaken, answers) => handleSubmitAssessment(activeAssessment.id, score, timeTaken, answers)}
      />
    );
  }

  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white text-gray-900 p-6">
        <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-6"></div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-purple-900">Architecting your custom assessment...</h1>
        <p className="text-gray-500">Please wait while the AI generates your specialized test.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full p-6 sm:p-8 bg-white min-h-screen">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
          Assignments Hub
        </h1>
        <p className="text-lg text-gray-500 mt-2">
          Manage your active campaigns, track analytics, and take your generated assessments.
        </p>
      </div>

      {/* Campaign Selector Row */}
      {campaignsList.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-10 border-b border-gray-200 pb-6">
          {campaignsList.map(campaign => {
            const isActive = selectedCampaignId === campaign.id;
            return (
              <button
                key={campaign.id}
                onClick={() => setSelectedCampaignId(campaign.id)}
                className={`flex items-center space-x-2 px-5 py-2.5 rounded-full font-medium text-sm transition-all duration-200 border ${
                  isActive 
                    ? 'bg-purple-100 text-purple-700 border-purple-200 shadow-sm' 
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200'
                }`}
              >
                <span>{campaign.title}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  isActive ? 'bg-purple-200 text-purple-800' : 'bg-gray-100 text-gray-400'
                }`}>
                  Tier {campaign.difficulty_tier ?? 1}
                </span>
              </button>
            );
          })}
          
          {selectedCampaignId && (
            <button
              onClick={() => handleDeleteCampaign(selectedCampaignId)}
              className="ml-auto flex items-center space-x-2 px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-full font-medium text-sm transition-colors"
              title="Delete Campaign"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Delete Campaign</span>
            </button>
          )}
        </div>
      )}

      {/* Modules List */}
      {selectedCampaignDetails && (() => {
        const uniqueBaseTopics: string[] = [];
        const topicPassedMap: Record<string, boolean> = {};
        const newestAttemptMap: Record<string, number> = {};
        
        const displayModules = selectedCampaignDetails.modules.filter((m: any) => !m.title.toLowerCase().includes('capstone'));
        
        displayModules.forEach((mod: any) => {
          const baseTopic = mod.title.replace(/ \(Remediation(?: - Attempt \d+)?\)$/, '');
          if (!uniqueBaseTopics.includes(baseTopic)) {
            uniqueBaseTopics.push(baseTopic);
          }
          
          const tMarks = mod.assessment?.total_marks ?? 50;
          const s = mod.assessment?.score;
          const passed = s !== undefined && s !== null && s >= tMarks * 0.8;
          
          if (passed) {
            topicPassedMap[baseTopic] = true;
          } else if (topicPassedMap[baseTopic] === undefined) {
            topicPassedMap[baseTopic] = false;
          }
          
          newestAttemptMap[baseTopic] = mod.id;
        });

        return (
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Module Assessments</h2>
          
          {displayModules.map((m: any, i: number) => {
            const lastScore = m.assessment?.score;
            const totalMarks = m.assessment?.total_marks ?? 50;
            const isUnattempted = lastScore === undefined || lastScore === null;
            const passThreshold = totalMarks * 0.8;
            const isPassing = !isUnattempted && lastScore >= passThreshold;
            
            const cancelledCount = m.assessment?.cancelled_count ?? 0;
            const hasViolations = cancelledCount > 0;
            
            const baseTopic = m.title.replace(/ \(Remediation(?: - Attempt \d+)?\)$/, '');
            const topicIndex = uniqueBaseTopics.indexOf(baseTopic);
            const isNewestAttempt = newestAttemptMap[baseTopic] === m.id;
            
            let isLocked = false;
            let isFailedLock = false;

            if (topicIndex > 0) {
              const prevTopic = uniqueBaseTopics[topicIndex - 1];
              if (!topicPassedMap[prevTopic]) {
                isLocked = true;
              }
            }
            
            if (!isNewestAttempt && !isPassing) {
              isLocked = true;
              isFailedLock = true;
            }

            const finalIsLocked = isGodMode ? false : isLocked;

            return (
              <div 
                key={m.id} 
                className="group p-5 bg-white border border-neutral-200 rounded-xl hover:shadow-md transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
              >
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-purple-700 transition-colors">
                    {m.title}
                  </h3>
                  
                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    {/* Score Badge */}
                    <div className={`flex items-center px-2.5 py-1 rounded-md text-xs font-bold border ${
                      isUnattempted 
                        ? 'bg-gray-50 text-gray-500 border-gray-200' 
                        : isPassing 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      {isUnattempted ? <AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> : (isPassing ? <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> : <XCircle className="w-3.5 h-3.5 mr-1.5" />)}
                      Score: {isUnattempted ? '-' : lastScore} / {totalMarks}
                    </div>

                    {/* Violations Badge */}
                    <div className={`flex items-center px-2.5 py-1 rounded-md text-xs font-bold border ${
                      hasViolations
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}>
                      Violations: {cancelledCount}
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={() => handleStartModuleAssessment(m.id)}
                  disabled={finalIsLocked || (isPassing && !m.requires_remediation)}
                  className={`px-6 py-2.5 text-white rounded-lg font-semibold shadow-sm transition-colors whitespace-nowrap w-full sm:w-auto text-center flex items-center justify-center gap-2 ${
                    finalIsLocked 
                      ? 'bg-gray-400 cursor-not-allowed opacity-75' 
                      : (isPassing && !m.requires_remediation)
                        ? 'bg-emerald-500 cursor-not-allowed opacity-90'
                        : m.requires_remediation
                          ? 'bg-amber-500 hover:bg-amber-600'
                          : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {finalIsLocked && <Lock className="w-4 h-4" />}
                  {(isPassing && !m.requires_remediation && !finalIsLocked) && <CheckCircle2 className="w-4 h-4" />}
                  <span>{finalIsLocked ? (isFailedLock ? 'Failed' : 'Locked') : (isPassing && !m.requires_remediation) ? 'Passed' : m.requires_remediation ? 'Retake (Decayed)' : 'Take Module Test'}</span>
                </button>
              </div>
            );
          })}
        </div>
        );
      })()}
      
      {isGodMode && (
        <div className="fixed bottom-4 left-4 z-[99999] bg-red-600 text-white text-xs px-2 py-1 rounded font-mono">GOD MODE ACTIVE</div>
      )}
    </div>
  );
}
