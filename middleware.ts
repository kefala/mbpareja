import { withAuth } from 'next-auth/middleware'

export default withAuth({
  callbacks: {
    authorized: ({ token }) => Boolean((token as { allowed?: boolean } | null)?.allowed)
  }
})

export const config = {
  matcher: ['/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)']
}
