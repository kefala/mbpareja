import type { NextAuthOptions } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import GoogleProvider from 'next-auth/providers/google'

import { isEmailAllowed } from '@/lib/auth'

export const nextAuthOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? ''
    })
  ],
  callbacks: {
    async signIn({ user }) {
      return isEmailAllowed(user?.email)
    },
    async jwt({ token, user }) {
      if (user?.email) token.email = user.email
      const email = typeof token.email === 'string' ? token.email : ''
      ;(token as JWT & { allowed?: boolean }).allowed = isEmailAllowed(email)
      return token
    },
    async session({ session, token }) {
      const email = typeof token.email === 'string' ? token.email : session.user?.email
      if (session.user && email) session.user.email = email
      ;(session as { allowed?: boolean }).allowed = Boolean(
        (token as JWT & { allowed?: boolean }).allowed
      )
      return session
    }
  },
  pages: {
    signIn: '/login'
  },
  secret: process.env.NEXTAUTH_SECRET?.trim() || undefined,
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 }
}
