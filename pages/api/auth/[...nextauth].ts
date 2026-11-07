import NextAuth from 'next-auth'

import { nextAuthOptions } from '@/lib/auth-options'

export default NextAuth(nextAuthOptions)
