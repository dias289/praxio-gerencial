import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signSession, COOKIE } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email    = String(body?.email    ?? '').toLowerCase().trim();
    const password = String(body?.password ?? '');

    if (!email || !password) {
      return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: 'Email ou senha incorretos.' }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Email ou senha incorretos.' }, { status: 401 });
    }

    const token = await signSession({ sub: user.id, email: user.email, name: user.name });

    const store = await cookies();
    store.set(COOKIE, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   8 * 60 * 60,
      path:     '/',
    });

    return NextResponse.json({ ok: true, name: user.name });
  } catch (err: unknown) {
    console.error('[/api/auth/login]', err);
    const msg = err instanceof Error ? err.message : 'Erro interno.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
