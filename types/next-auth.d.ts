import 'next-auth'

declare module 'next-auth' {
  interface Session {
    allowed?: boolean
  }
}
