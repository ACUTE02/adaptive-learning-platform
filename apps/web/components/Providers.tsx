'use client'
import React, { useState } from 'react'
import '../lib/i18n'
import { SessionProvider } from '@components/Contexts/AuthContext'
import LHSessionProvider from '@components/Contexts/LHSessionContext'
import I18nProvider from '@components/Contexts/I18nContext'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from '@/lib/query/client'

import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useLHSession } from '@components/Contexts/LHSessionContext'

function RBACDevtools() {
  const session = useLHSession() as any;
  if (session?.status !== 'authenticated') return null;
  
  const isSuperadmin = session?.data?.user?.is_superadmin === true;
  const hasAdminRole = session?.data?.roles?.some((r: any) => 
    r?.role?.rights?.dashboard?.action_access === true
  );

  if (!isSuperadmin && !hasAdminRole) return null;
  
  return <ReactQueryDevtools initialIsOpen={false} />;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider refetchInterval={600000}>
        <LHSessionProvider>
          <I18nProvider>
            {children}
            {process.env.NODE_ENV === 'development' && <RBACDevtools />}
          </I18nProvider>
        </LHSessionProvider>
      </SessionProvider>
    </QueryClientProvider>
  )
}

