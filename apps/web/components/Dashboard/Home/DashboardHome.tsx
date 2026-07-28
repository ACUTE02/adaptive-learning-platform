'use client'
import React from 'react'
import Link from 'next/link'
import {
  PlusCircle,
  ChartBar,
  GearSix,
  Users,
  BookOpen,
  Target,
  FlagBanner,
} from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query/keys'
import { useTranslation } from 'react-i18next'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getAPIUrl } from '@services/config/config'
import { OrgUsageResponse, orgUsageFetcher } from '@services/orgs/usage'
import AdminAuthorization from '@components/Security/AdminAuthorization'
import { usePlan } from '@components/Hooks/usePlan'
import QuickStats from './QuickStats'
import RecentCourses from './RecentCourses'
import RecentMembers from './RecentMembers'
import ContentOverview from './ContentOverview'
import UsageOverview from './UsageOverview'
import useAdminStatus from '@components/Hooks/useAdminStatus'

const PLAN_COLORS: Record<string, { bg: string; text: string }> = {
  free: { bg: 'bg-gray-100', text: 'text-gray-600' },
  oss: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  standard: { bg: 'bg-blue-100', text: 'text-blue-700' },
  pro: { bg: 'bg-purple-100', text: 'text-purple-700' },
  enterprise: { bg: 'bg-amber-100', text: 'text-amber-700' },
}

export default function DashboardHome() {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const org = useOrg() as any
  const { isAdmin } = useAdminStatus() as any

  const token = session?.data?.tokens?.access_token
  const orgId = org?.id
  const username = session?.data?.user?.username || ''

  // TanStack Query will dedupe with UsageOverview's identical call via shared queryKey
  const { data: usageData } = useQuery<OrgUsageResponse>({
    queryKey: queryKeys.org.usage(orgId),
    queryFn: () => orgUsageFetcher(`${getAPIUrl()}orgs/${orgId}/usage`, token),
    enabled: !!token && !!orgId && isAdmin,
    staleTime: 60_000,
  })

  const plan = usePlan()
  const planStyle = PLAN_COLORS[plan] || PLAN_COLORS.free

  return (
    <div className="h-full w-full bg-[#f8f8f8]">
      <div className="px-4 sm:px-10 pt-8 pb-10">
        <div className="space-y-6 max-w-[1600px] mx-auto w-full">
          {/* Welcome Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {t('dashboard.home.welcome_back')}{username ? `, ${username}` : ''}
              </h1>
              {isAdmin && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full capitalize ${planStyle.bg} ${planStyle.text}`}
                  >
                    {plan === 'oss' ? 'OSS' : `${plan} ${t('dashboard.home.plan')}`}
                  </span>
                  {org?.name && (
                    <span className="text-xs text-gray-400">{org.name}</span>
                  )}
                </div>
              )}
              {!isAdmin && (
                <p className="text-lg text-gray-500 mt-2">
                  Please select your learning mode below.
                </p>
              )}
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href="/dash/courses?new=true"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <PlusCircle size={14} weight="bold" />
                  {t('dashboard.home.create_course')}
                </Link>
                <Link
                  href="/dash/analytics"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-gray-600 bg-white rounded-lg nice-shadow hover:bg-gray-50 transition-colors"
                >
                  <ChartBar size={14} weight="bold" />
                  {t('dashboard.home.analytics')}
                </Link>
                <Link
                  href="/dash/users/settings/users"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-gray-600 bg-white rounded-lg nice-shadow hover:bg-gray-50 transition-colors"
                >
                  <Users size={14} weight="bold" />
                  {t('dashboard.home.members')}
                </Link>
                <Link
                  href="/dash/org/settings/general"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-gray-600 bg-white rounded-lg nice-shadow hover:bg-gray-50 transition-colors"
                >
                  <GearSix size={14} weight="bold" />
                  {t('dashboard.home.settings')}
                </Link>
              </div>
            )}
          </div>

          {isAdmin ? (
            <AdminAuthorization authorizationMode="component">
              <div className="space-y-6">
                {/* Content counts row */}
                <ContentOverview />

                {/* Main grid: courses + members + usage */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-6">
                    <RecentCourses />
                    <RecentMembers />
                  </div>
                  <div className="space-y-6">
                    <UsageOverview />
                    <QuickStats />
                  </div>
                </div>
              </div>
            </AdminAuthorization>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mt-12">
              <Link 
                href="/dash/sniper" 
                className="group relative flex flex-col items-center justify-center gap-4 p-12 bg-white rounded-3xl nice-shadow hover:shadow-xl transition-all duration-300 border border-transparent hover:border-gray-200"
              >
                <div className="p-4 bg-red-50 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                  <Target size={48} weight="fill" className="text-red-500" />
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Sniper Mode</h2>
                  <p className="text-gray-500">Hyper-focused, single-topic micro-learning.</p>
                </div>
              </Link>
              
              <Link 
                href="/dash/campaign" 
                className="group relative flex flex-col items-center justify-center gap-4 p-12 bg-white rounded-3xl nice-shadow hover:shadow-xl transition-all duration-300 border border-transparent hover:border-gray-200"
              >
                <div className="p-4 bg-blue-50 rounded-2xl group-hover:scale-110 transition-transform duration-300">
                  <FlagBanner size={48} weight="fill" className="text-blue-500" />
                </div>
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Campaign Mode</h2>
                  <p className="text-gray-500">Full-syllabus macro-learning roadmap.</p>
                </div>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
