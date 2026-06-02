import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json();
  const { name, email, password } = body as { name: string; email: string; password: string };

  if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
    return NextResponse.json({ error: 'Dados inválidos. Senha mínima: 6 caracteres.' }, { status: 400 });
  }

  const existe = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existe) {
    return NextResponse.json({ error: 'Email já cadastrado.' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name: name.trim(), email: email.toLowerCase(), passwordHash },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  return NextResponse.json(user, { status: 201 });
}
