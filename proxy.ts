import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE = '__praxio_session';

export async function proxy(req: NextRequest) {
  const token  = req.cookies.get(COOKIE)?.value;
  const login  = new URL('/login', req.url);

  if (!token) return NextResponse.redirect(login);

  try {
    const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? 'fallback-secret');
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(login);
  }
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon\\.ico|login).*)'],
};
