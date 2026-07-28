'use client'

import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'

interface RetentionChartProps {
  campaignId: number | null
  campaigns: any[]
}

export function RetentionChart({ campaignId, campaigns = [] }: RetentionChartProps) {
  if (!campaigns || campaigns.length === 0) {
    return <div className="h-64 flex items-center justify-center text-gray-500 bg-white rounded-2xl border border-gray-100 p-6 nice-shadow mt-6">No chart data available.</div>
  }

  const selectedCampaign = campaigns.find((c: any) => c.campaign_id === campaignId)
  
  if (!selectedCampaign) {
    return <div className="h-64 flex items-center justify-center text-gray-500 bg-white rounded-2xl border border-gray-100 p-6 nice-shadow mt-6">Please select a course to view chart data.</div>
  }

  const chartData = selectedCampaign.modules.map((m: any) => ({
    ...m,
    shortName: `Mod ${m.module_id}`
  }))

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 nice-shadow mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Module Retention</h3>
          <p className="text-sm text-gray-500">View individual module retention scores for this course.</p>
        </div>
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: -20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="shortName" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
            <Tooltip 
              cursor={{ fill: '#f8f8f8' }}
              contentStyle={{ borderRadius: '8px', border: '1px solid #eee', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              labelFormatter={(label, payload) => {
                if (payload && payload.length > 0) {
                  return payload[0].payload.name;
                }
                return label;
              }}
            />
            <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'top', value: 'Threshold (80%)', fill: '#ef4444', fontSize: 12 }} />
            <Bar dataKey="retention_score" radius={[4, 4, 0, 0]}>
              {chartData.map((entry: any, index: number) => (
                <Cell key={`cell-${index}`} fill={entry.retention_score < 80 ? '#ef4444' : '#3b82f6'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
