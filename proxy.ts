import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const isAdminSession = request.cookies.get('admin_session')?.value === 'true'
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!isAdminSession) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  if (pathname === '/admin/login' && isAdminSession) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
