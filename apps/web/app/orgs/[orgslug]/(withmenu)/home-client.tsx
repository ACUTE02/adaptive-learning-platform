'use client'
import React from 'react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCourses } from '@/hooks/queries/useCourses'
import { useCollections } from '@/hooks/queries/useCollections'
import LandingClassic from '@components/Landings/LandingClassic'
import LandingCustom from '@components/Landings/LandingCustom'
import { JsonLd } from '@components/SEO/JsonLd'
import { getUriWithOrg } from '@services/config/config'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import useAdminStatus from '@components/Hooks/useAdminStatus'
import Link from 'next/link'
import { Target, Flag } from '@phosphor-icons/react'

export default function HomeClient({ orgslug }: { orgslug: string }) {
  const org = useOrg() as any
  const orgId = org?.id as number | undefined
  const { isAdmin } = useAdminStatus()
  
  // We don't necessarily need these for non-admins if they don't see LandingClassic, 
  // but they will load in background anyway
  const { data: courses, isLoading: coursesLoading } = useCourses(orgslug)
  const { data: collections, isLoading: collectionsLoading } = useCollections(orgId)

  const landingConfig = org?.config?.config?.customization?.landing || org?.config?.config?.landing
  const hasCustomLanding = landingConfig?.enabled

  const orgJsonLd = org
    ? {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: org.name,
        description: org.description,
        url: getUriWithOrg(orgslug, '/'),
        ...(org.logo_image && {
          logo: getOrgLogoMediaDirectory(org.org_uuid, org.logo_image),
        }),
      }
    : null

  // If user is a standard student, show the Adaptive Learning cards immediately
  if (isAdmin === false && org) {
    return (
      <div className="w-full">
        {orgJsonLd && <JsonLd data={orgJsonLd} />}
        <GeneralWrapperStyled>
          <div className="flex flex-col items-center justify-center space-y-6 pt-12">
            <h1 className="text-3xl font-black text-gray-900 text-center max-w-2xl">
              Welcome to your Adaptive Learning Experience
            </h1>
            <p className="text-gray-500 text-center max-w-xl">
              Focus on what matters most. Choose a mode below to begin.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl mt-8">
              <Link
                href={getUriWithOrg(orgslug, '/dash/sniper')}
                className="flex flex-col items-center p-8 bg-white rounded-2xl nice-shadow hover:shadow-lg hover:-translate-y-1 transition-all border border-gray-100 group"
              >
                <div className="p-4 bg-red-50 rounded-full mb-4 group-hover:scale-110 transition-transform">
                  <Target size={48} className="text-red-500" weight="duotone" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Sniper Mode</h2>
                <p className="text-center text-gray-500 text-sm">
                  Targeted, micro-learning sessions designed to help you master specific concepts quickly.
                </p>
              </Link>

              <Link
                href={getUriWithOrg(orgslug, '/dash/campaign')}
                className="flex flex-col items-center p-8 bg-white rounded-2xl nice-shadow hover:shadow-lg hover:-translate-y-1 transition-all border border-gray-100 group"
              >
                <div className="p-4 bg-blue-50 rounded-full mb-4 group-hover:scale-110 transition-transform">
                  <Flag size={48} className="text-blue-500" weight="duotone" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">Campaign Mode</h2>
                <p className="text-center text-gray-500 text-sm">
                  Structured, long-term learning paths to guide you from beginner to expert.
                </p>
              </Link>
            </div>
          </div>
        </GeneralWrapperStyled>
      </div>
    )
  }

  // Admin loading state
  if (!org || (!hasCustomLanding && (coursesLoading || collectionsLoading))) {
    return (
      <GeneralWrapperStyled>
        <div className="animate-pulse space-y-6 pt-6">
          <div className="h-6 bg-gray-200 rounded w-40" />
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
      </GeneralWrapperStyled>
    )
  }

  return (
    <div className="w-full">
      {orgJsonLd && <JsonLd data={orgJsonLd} />}
      {hasCustomLanding ? (
        <LandingCustom landing={landingConfig} orgslug={orgslug} />
      ) : (
        <LandingClassic
          courses={courses || []}
          collections={collections || []}
          orgslug={orgslug}
          org_id={org.id}
        />
      )}
    </div>
  )
}
