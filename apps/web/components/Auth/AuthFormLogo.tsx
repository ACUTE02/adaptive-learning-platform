import React from 'react'

// Sopan wordmark for the light card on the login and signup pages
// (green text, made for light backgrounds).
export default function AuthFormLogo({ align = 'left' }: { align?: 'left' | 'center' }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/sopan-logo-dark.png"
      alt="Sopan - Adaptive Learning"
      className={`h-16 w-auto mb-8 ${align === 'center' ? 'mx-auto' : ''}`}
    />
  )
}
