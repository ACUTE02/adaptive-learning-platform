'use client'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { BookCopy, Search, X, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'
import { getAPIUrl } from '@services/config/config'
import { useTranslation } from 'react-i18next'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { RequestBodyWithAuthHeader } from '@services/utils/ts/requests'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'

type CourseProps = {
  orgslug: string
}

function CoursesHome(params: CourseProps) {
  const { t } = useTranslation()
  const orgslug = params.orgslug
  const session = useLHSession() as any
  const access_token = session.data?.tokens?.access_token

  // Fetch campaigns (Repurposed as Courses)
  const userId = session?.data?.user?.email || session?.data?.user?.id || session?.user?.email || session?.user?.id || session?.id || "unknown_user";
  const { data: campaignsData, refetch: refetchCampaigns, isLoading } = useQuery({
    queryKey: ['campaigns', orgslug, userId],
    queryFn: async () => {
      const url = `${getAPIUrl()}engine/campaigns?user_id=${userId}`;
      const res = await fetch(url, RequestBodyWithAuthHeader('GET', null, null, access_token))
      if (!res.ok) throw new Error('Failed to fetch campaigns')
      return res.json()
    },
    enabled: !!access_token,
    staleTime: 60_000,
  })

  const campaigns = campaignsData ?? []

  // Search state
  const [searchQuery, setSearchQuery] = useState('')

  const filteredCampaigns = React.useMemo(() => {
    if (!searchQuery.trim()) return campaigns;
    return campaigns.filter((c: any) => 
      c.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.syllabus_text?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [campaigns, searchQuery]);

  const router = useRouter()

  if (isLoading) {
    return (
      <div className="h-full w-full bg-[#f8f8f8] pl-4 pr-4 sm:pl-10 sm:pr-10">
        <div className="mb-6 pt-6 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-32 mb-6" />
          <div className="h-8 bg-gray-200 rounded w-48 mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
                <div className="h-[131px] bg-gray-200" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-[#f8f8f8] pl-4 pr-4 sm:pl-10 sm:pr-10">
      <div className="mb-6 pt-6">
        <Breadcrumbs items={[
          { label: 'Courses', href: '/dash/courses', icon: <BookCopy size={14} /> }
        ]} />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-4">
          <div className="flex items-center space-x-4">
            <h1 className="text-3xl font-bold mb-4 sm:mb-0">Courses</h1>
          </div>
          <button 
            onClick={() => router.push(`/dash/campaign`)}
            className="rounded-lg bg-indigo-600 transition-all duration-100 ease-linear antialiased p-2 px-5 my-auto font text-sm font-bold text-white nice-shadow flex space-x-2 items-center hover:scale-105"
          >
            <span>New Course</span>
          </button>
        </div>
      </div>

      {campaigns.length > 0 && (
        <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search courses..."
                className="w-full pl-10 pr-10 py-2.5 bg-white nice-shadow rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 border-0"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {searchQuery && (
        <div className="mb-4 text-sm text-gray-500">
          Found {filteredCampaigns.length} results for "{searchQuery}"
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredCampaigns.map((campaign: any) => (
          <div 
            key={campaign.id} 
            className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 flex flex-col hover:shadow-md transition-shadow cursor-pointer relative group" 
            onClick={() => router.push(`/dash/campaign?id=${campaign.id}`)}
          >
            <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-violet-500" />
            <div className="p-5 flex-grow flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-gray-900 line-clamp-2">{campaign.title}</h3>
                <button 
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm('Are you sure you want to delete this course?')) {
                      try {
                        const res = await fetch(`${getAPIUrl()}engine/campaigns/${campaign.id}`, RequestBodyWithAuthHeader('DELETE', null, null, access_token));
                        if (res.ok) {
                          refetchCampaigns();
                          toast.success('Course deleted');
                          Object.keys(localStorage).forEach((key) => {
                            if (key.startsWith(`campaign_chat_${campaign.id}_`)) {
                              localStorage.removeItem(key);
                            }
                          });
                        } else {
                          toast.error('Failed to delete course');
                        }
                      } catch (err) {
                        toast.error('Failed to delete course');
                      }
                    }
                  }}
                  className="text-gray-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-md hover:bg-red-50"
                  title="Delete Course"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-gray-500 line-clamp-3 mb-4">{campaign.syllabus_text}</p>
              <div className="mt-auto flex items-center justify-between text-xs text-gray-500 font-medium pt-3 border-t border-gray-50">
                <span className="flex items-center gap-1.5">
                  <BookCopy className="w-3.5 h-3.5" />
                  {campaign.module_count} modules
                </span>
                <span>{new Date(campaign.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {campaigns.length === 0 && !searchQuery && (
        <div className="col-span-full flex justify-center items-center py-16">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-600 mb-2">
              No Courses Yet
            </h2>
            <p className="text-lg text-gray-400 mb-6">
              Create your first AI-generated course by launching a new Campaign.
            </p>
            <button 
              onClick={() => router.push(`/dash/campaign`)}
              className="mx-auto rounded-lg bg-indigo-600 transition-all duration-100 ease-linear antialiased p-3 px-6 font text-sm font-bold text-white nice-shadow flex space-x-2 items-center hover:scale-105"
            >
              <span>Create New Course</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default CoursesHome
