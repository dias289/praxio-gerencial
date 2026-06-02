import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;

  const self = await prisma.user.findUnique({ where: { email: session.email } });
  if (self?.id === id) {
    return NextResponse.json({ error: 'Você não pode remover sua própria conta.' }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  const { password } = await req.json() as { password: string };

  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Senha mínima: 6 caracteres.' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.update({
    where: { id },
    data:  { passwordHash },
    select: { id: true, email: true, name: true },
  });
  return NextResponse.json(user);
}
