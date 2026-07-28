'use client';

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

export default function AnalyticsDashboard() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');

  useEffect(() => {
    // Fetch campaigns
    fetch('/api/v1/engine/campaigns?user_id=uuayush2@gmail.com')
      .then(res => res.json())
      .then(data => {
        setCampaigns(data);
        if (data.length > 0) {
          setSelectedCampaignId(data[0].id.toString());
        }
      });
  }, []);

  const selectedCampaign = campaigns.find(c => c.id.toString() === selectedCampaignId);

  // Mock Data for charts based on campaign selection
  const testScoresData = [
    { name: 'Mod 1', score: 35 },
    { name: 'Mod 2', score: 45 },
    { name: 'Mod 3', score: 20 }, // failure
    { name: 'Mod 3 (Rem)', score: 42 },
    { name: 'Mod 4', score: 48 },
  ];

  const retentionData = [
    { day: 'Day 1', retention: 100 },
    { day: 'Day 3', retention: 85 },
    { day: 'Day 7', retention: 80 },
    { day: 'Day 14', retention: 82 },
    { day: 'Day 30', retention: 81 },
  ];

  const campaignStatsData = [
    { name: 'Completion Speed', value: 85 },
    { name: 'Avg Score', value: 78 },
    { name: 'Engagement', value: 92 },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto text-white">
      <div className="flex justify-between items-center mb-12">
        <h1 className="text-4xl font-bold">Synchronized Analytics</h1>
        <select 
          className="bg-gray-800 border border-gray-700 text-white text-lg rounded-lg block p-2.5 outline-none focus:border-blue-500"
          value={selectedCampaignId}
          onChange={(e) => setSelectedCampaignId(e.target.value)}
        >
          {campaigns.map(c => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>

      {selectedCampaign && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Chart 1: Test Scores Progress */}
            <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
              <h2 className="text-xl font-bold mb-6">Test Scores Progress</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={testScoresData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', color: '#fff' }} />
                    <Legend />
                    <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={3} dot={{ r: 6 }} activeDot={{ r: 8 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Ebbinghaus Retention Curve */}
            <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
              <h2 className="text-xl font-bold mb-6">Ebbinghaus Retention Curve</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={retentionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="day" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" domain={[0, 100]} />
                    <RechartsTooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', color: '#fff' }} />
                    <Legend />
                    <Line type="monotone" dataKey="retention" stroke="#8b5cf6" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            
          </div>

          {/* Chart 3: Campaign Mode Statistics */}
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-xl">
            <h2 className="text-xl font-bold mb-6">Campaign Mode Statistics</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={campaignStatsData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" domain={[0, 100]} stroke="#9ca3af" />
                  <YAxis dataKey="name" type="category" stroke="#9ca3af" width={120} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', color: '#fff' }} />
                  <Legend />
                  <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
