'use client';

import React, { useState, useEffect, useCallback } from 'react';
import TestingArena from '@/components/assignments/TestingArena';
import { Lock, AlertTriangle, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@components/Contexts/AuthContext';
import { engineFetch, engineErrorMessage } from '@services/engine/engine';

export default function AssignmentsHub() {
  const [campaignsList, setCampaignsList] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [selectedCampaignDetails, setSelectedCampaignDetails] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeAssessment, setActiveAssessment] = useState<any | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const { accessToken, status } = useAuth();
  const isAuthenticated = status === 'authenticated';

  // 1. Fetch all campaigns for the tabs
  useEffect(() => {
    if (!isAuthenticated) {
      if (status === 'unauthenticated') setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await engineFetch('campaigns', accessToken);
        if (!res.ok) throw new Error(await engineErrorMessage(res, 'Could not load your campaigns.'));
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setCampaignsList(list);
        setSelectedCampaignId(prev => prev ?? (list.length > 0 ? list[0].id : null));
        setLoadError(null);
      } catch (e: any) {
        if (!cancelled) setLoadError(e.message || 'Could not load your campaigns.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, status, accessToken]);

  // 2. Fetch specific campaign details when tab changes (and after every attempt)
  const loadCampaignDetails = useCallback(async (campaignId: number) => {
    try {
      const res = await engineFetch(`campaigns/active?campaign_id=${campaignId}`, accessToken);
      if (!res.ok) throw new Error(await engineErrorMessage(res, 'Could not load this campaign.'));
      const data = await res.json();
      if (data.campaign) {
        setSelectedCampaignDetails(data);
        // keep the tier badge in the tab row in sync
        setCampaignsList(prev => prev.map(c => c.id === data.campaign.id ? { ...c, difficulty_tier: data.campaign.difficulty_tier } : c));
      }
    } catch (e: any) {
      toast.error(e.message || 'Could not load this campaign.');
    }
  }, [accessToken]);

  useEffect(() => {
    if (selectedCampaignId && isAuthenticated) {
      loadCampaignDetails(selectedCampaignId);
    }
  }, [selectedCampaignId, isAuthenticated, loadCampaignDetails]);

  const handleStartModuleAssessment = async (moduleId: number) => {
    setIsGenerating(true);
    try {
      const res = await engineFetch(`assessments/${moduleId}/start`, accessToken, { method: 'POST' });
      if (!res.ok) throw new Error(await engineErrorMessage(res, 'Could not prepare the assessment. Please try again.'));
      const data = await res.json();
      if (!data?.exam_data?.questions?.length) throw new Error('The assessment came back empty. Please try again.');
      setActiveAssessment(data);
    } catch (e: any) {
      toast.error(e.message || 'Could not prepare the assessment. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const closeArena = async () => {
    setActiveAssessment(null);
    if (selectedCampaignId) await loadCampaignDetails(selectedCampaignId);
  };

  const handleCancelAssessment = async (assessmentId: number) => {
    try {
      const res = await engineFetch(`assessments/${assessmentId}/cancel`, accessToken, { method: 'POST' });
      if (!res.ok) throw new Error(await engineErrorMessage(res, 'Could not cancel the attempt.'));
      toast.error('Attempt cancelled after repeated focus warnings. A remediation module is ready for you.', { duration: 8000 });
    } catch (e: any) {
      toast.error(e.message || 'Could not cancel the attempt.');
    }
    await closeArena();
  };

  const handleSubmitAssessment = async (assessmentId: number, timeTaken: number, answers: Record<string, string>) => {
    const res = await engineFetch(`assessments/${assessmentId}/submit`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ time_taken_seconds: timeTaken, answers }),
    });
    if (!res.ok) {
      const message = await engineErrorMessage(res, 'Your answers could not be submitted. Please try again.');
      toast.error(message, { duration: 8000 });
      // 409 means this attempt is over on the server (already graded, cancelled or timed out).
      if (res.status === 409) {
        await closeArena();
        return;
      }
      throw new Error(message); // keeps the arena open so the answers are not lost
    }
    const result = await res.json();
    if (result.passed) {
      toast.success(`Passed: ${result.score} / ${result.total_marks}. The next module is unlocked.`, { duration: 8000 });
    } else {
      toast.error(`Score: ${result.score} / ${result.total_marks} (80% needed). A remediation module is ready for you.`, { duration: 8000 });
    }
    await closeArena();
  };

  const handleDeleteCampaign = async (campaignId: number) => {
    const confirmed = window.confirm("Are you sure you want to permanently delete this campaign? This will destroy all associated modules and exam data.");
    if (!confirmed) return;

    try {
      const res = await engineFetch(`campaigns/${campaignId}`, accessToken, { method: 'DELETE' });
      if (!res.ok) throw new Error(await engineErrorMessage(res, 'Could not delete the campaign.'));
      const updatedList = campaignsList.filter(c => c.id !== campaignId);
      setCampaignsList(updatedList);

      if (updatedList.length > 0) {
        setSelectedCampaignId(updatedList[0].id);
      } else {
        setSelectedCampaignId(null);
        setSelectedCampaignDetails(null);
      }
      toast.success('Campaign deleted.');
    } catch (e: any) {
      toast.error(e.message || 'Could not delete the campaign.');
    }
  };

  if (activeAssessment) {
    return (
      <TestingArena
        assessment={activeAssessment}
        onCancel={() => handleCancelAssessment(activeAssessment.id)}
        onSubmit={(timeTaken, answers) => handleSubmitAssessment(activeAssessment.id, timeTaken, answers)}
      />
    );
  }

  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white text-gray-900 p-6" role="status">
        <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-6"></div>
        <h1 className="text-3xl font-bold tracking-tight mb-2 text-purple-900">Preparing your assessment...</h1>
        <p className="text-gray-500">The AI is writing your questions. This can take up to two minutes.</p>
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
          Take the assessment for each module of your campaigns.
        </p>
      </div>

      {isLoading && <p className="text-gray-500" role="status">Loading your campaigns...</p>}

      {loadError && (
        <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium">
          {loadError}
        </div>
      )}

      {!isLoading && !loadError && campaignsList.length === 0 && (
        <div className="p-8 rounded-xl border border-dashed border-gray-300 text-center text-gray-500">
          You have no campaigns yet. Create one in Campaign Mode and its module assessments will appear here.
        </div>
      )}

      {/* Campaign Selector Row */}
      {campaignsList.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-10 border-b border-gray-200 pb-6">
          {campaignsList.map(campaign => {
            const isActive = selectedCampaignId === campaign.id;
            return (
              <button
                key={campaign.id}
                onClick={() => setSelectedCampaignId(campaign.id)}
                aria-pressed={isActive}
                className={`flex items-center space-x-2 px-5 py-2.5 rounded-full font-medium text-sm transition-all duration-200 border ${
                  isActive
                    ? 'bg-purple-100 text-purple-700 border-purple-200 shadow-sm'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200'
                }`}
              >
                <span>{campaign.title}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  isActive ? 'bg-purple-200 text-purple-800' : 'bg-gray-100 text-gray-500'
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
              aria-label="Delete campaign"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Delete Campaign</span>
            </button>
          )}
        </div>
      )}

      {/* Modules List */}
      {selectedCampaignDetails && (() => {
        // A "slot" is one position in the roadmap: the original module plus any
        // remediation attempts for it share the same order_index.
        const displayModules: any[] = selectedCampaignDetails.modules;
        const slotOrder: number[] = [];
        const slotPassed: Record<number, boolean> = {};
        const newestInSlot: Record<number, number> = {};

        const hasPassed = (mod: any) => {
          const total = mod.assessment?.total_marks ?? 50;
          const score = mod.assessment?.score;
          return mod.assessment?.status === 'completed' && score !== undefined && score !== null && score >= total * 0.8;
        };

        displayModules.forEach((mod: any) => {
          const slot = mod.order_index;
          if (!slotOrder.includes(slot)) slotOrder.push(slot);
          slotPassed[slot] = slotPassed[slot] || hasPassed(mod);
          newestInSlot[slot] = Math.max(newestInSlot[slot] ?? 0, mod.id);
        });

        return (
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Module Assessments</h2>

          {displayModules.map((m: any) => {
            const assessmentStatus = m.assessment?.status;
            const wasCancelled = assessmentStatus === 'cancelled';
            const isGraded = assessmentStatus === 'completed' || wasCancelled;
            const lastScore = m.assessment?.score;
            const totalMarks = m.assessment?.total_marks ?? 50;
            const isUnattempted = !isGraded || lastScore === undefined || lastScore === null;
            const isPassing = hasPassed(m);

            const cancelledCount = m.assessment?.cancelled_count ?? 0;
            const hasViolations = cancelledCount > 0;

            const slotIndex = slotOrder.indexOf(m.order_index);
            const isNewestAttempt = newestInSlot[m.order_index] === m.id;

            let isLocked = false;
            let isFailedLock = false;

            if (slotIndex > 0 && !slotPassed[slotOrder[slotIndex - 1]]) {
              isLocked = true;
            }

            if (m.status === 'locked' || (!isNewestAttempt && !isPassing)) {
              isLocked = true;
              isFailedLock = true;
            }

            const isDone = isPassing && !m.requires_remediation;
            const inProgress = assessmentStatus === 'in_progress';

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
                        ? 'bg-gray-50 text-gray-600 border-gray-200'
                        : isPassing
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      {isUnattempted ? <AlertTriangle className="w-3.5 h-3.5 mr-1.5" /> : (isPassing ? <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> : <XCircle className="w-3.5 h-3.5 mr-1.5" />)}
                      {wasCancelled
                        ? 'Attempt cancelled'
                        : `Score: ${isUnattempted ? '-' : lastScore} / ${totalMarks}`}
                    </div>

                    {/* Violations Badge */}
                    <div className={`flex items-center px-2.5 py-1 rounded-md text-xs font-bold border ${
                      hasViolations
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-gray-50 text-gray-600 border-gray-200'
                    }`}>
                      Cancelled attempts: {cancelledCount}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleStartModuleAssessment(m.id)}
                  disabled={isLocked || isDone}
                  className={`px-6 py-2.5 text-white rounded-lg font-semibold shadow-sm transition-colors whitespace-nowrap w-full sm:w-auto text-center flex items-center justify-center gap-2 ${
                    isLocked
                      ? 'bg-gray-500 cursor-not-allowed opacity-75'
                      : isDone
                        ? 'bg-emerald-600 cursor-not-allowed opacity-90'
                        : m.requires_remediation
                          ? 'bg-amber-600 hover:bg-amber-700'
                          : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {isLocked && <Lock className="w-4 h-4" />}
                  {(isDone && !isLocked) && <CheckCircle2 className="w-4 h-4" />}
                  <span>{isLocked ? (isFailedLock ? 'Failed' : 'Locked') : isDone ? 'Passed' : m.requires_remediation ? 'Retake (Decayed)' : inProgress ? 'Resume Test' : 'Take Module Test'}</span>
                </button>
              </div>
            );
          })}
        </div>
        );
      })()}
    </div>
  );
}
