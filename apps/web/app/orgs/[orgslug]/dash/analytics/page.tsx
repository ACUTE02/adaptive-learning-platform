'use client'
import React, { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { ChartBar, ChartLine, SquaresFour } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { getAnalyticsOverview, getChartData } from '@services/analytics/analytics'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { RetentionChart } from '@components/Objects/RetentionChart/RetentionChart'


const DATE_RANGES = [
  { label: '7d', value: '7' },
  { label: '30d', value: '30' },
  { label: '90d', value: '90' },
]

export default function AnalyticsDashboard() {
  const { t } = useTranslation()
  const [days, setDays] = useState('30')
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null)
  
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token

  // Fetch campaign list from chart data endpoint
  const { data: chartDataResponse, isLoading: isLoadingChartData } = useQuery({
    queryKey: ['analytics-chart-data'],
    queryFn: () => getChartData(access_token),
    enabled: !!access_token,
  })

  // Set default selected campaign when data loads
  useEffect(() => {
    if (chartDataResponse?.campaigns?.length > 0 && selectedCampaignId === null) {
      setSelectedCampaignId(chartDataResponse.campaigns[0].campaign_id)
    }
  }, [chartDataResponse, selectedCampaignId])

  // Fetch overview specifically for selected campaign
  const { data: overview, isLoading: isLoadingOverview } = useQuery({
    queryKey: ['analytics-overview', selectedCampaignId],
    queryFn: () => getAnalyticsOverview(access_token, selectedCampaignId || undefined),
    enabled: !!access_token && selectedCampaignId !== null,
  })

  const isLoading = isLoadingOverview || isLoadingChartData

  return (
    <div className="h-full w-full bg-[#f8f8f8] flex flex-col">
      {/* Sticky header box */}
      <div className="pl-4 pr-4 sm:pl-10 sm:pr-10 tracking-tight bg-[#fcfbfc] z-10 nice-shadow flex-shrink-0 relative">
        <div className="pt-6 pb-4">
          <Breadcrumbs items={[
            { label: t('analytics.title'), href: '/dash/analytics', icon: <ChartBar size={14} /> }
          ]} />
        </div>
        <div className="my-2 py-2">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div className="flex flex-col space-y-1">
              <div className="pt-3 flex font-bold text-4xl tracking-tighter">
                Predictive Analytics Dashboard
              </div>
              <div className="flex font-medium text-gray-400 text-md">
                Monitor knowledge decay and user retention insights.
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              
              {/* Course Selection Dropdown */}
              {chartDataResponse?.campaigns && chartDataResponse.campaigns.length > 0 && (
                <select 
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[200px]"
                  value={selectedCampaignId || ''}
                  onChange={(e) => setSelectedCampaignId(Number(e.target.value))}
                >
                  {chartDataResponse.campaigns.map((c: any) => (
                    <option key={c.campaign_id} value={c.campaign_id}>
                      {c.campaign_name}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                {DATE_RANGES.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setDays(r.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      days === r.value
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="h-6 flex-shrink-0"></div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1, type: 'spring', stiffness: 80 }}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-10 pb-10"
      >
        <div className="space-y-6 max-w-[1600px] mx-auto w-full">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card 1: Retention Overview */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 nice-shadow">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Retention Overview</h3>
              <p className="text-sm text-gray-500 mb-4">Average knowledge retention across your learners.</p>
              
              <div className="h-32 flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
                {isLoading ? (
                  <span className="text-gray-400 font-medium">Loading...</span>
                ) : (
                  <span className="text-gray-800 font-bold text-4xl">{overview?.average_retention !== undefined ? `${overview.average_retention}%` : "N/A"}</span>
                )}
              </div>
            </div>

            {/* Card 2: Requires Remediation */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 nice-shadow">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Requires Remediation</h3>
              <p className="text-sm text-gray-500 mb-4">Modules flagged by the Ebbinghaus decay engine.</p>
              
              <div className="h-32 flex flex-col p-4 bg-gray-50 rounded-lg border border-dashed border-gray-200 overflow-y-auto">
                {isLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <span className="text-gray-400 font-medium">Loading...</span>
                  </div>
                ) : overview?.remediation_modules && overview.remediation_modules.length > 0 ? (
                  <ul className="list-disc pl-4 space-y-1">
                    {overview.remediation_modules.map((m: any) => (
                      <li key={m.id} className="text-gray-700 font-medium">{m.title}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-center">
                    <span className="text-green-600 font-medium">All learners are retaining their knowledge well!</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <RetentionChart campaignId={selectedCampaignId} campaigns={chartDataResponse?.campaigns || []} />
        </div>
      </motion.div>
    </div>
  )
}
