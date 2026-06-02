import { NextResponse } from 'next/server';

// NextAuth removido — auth via JWT customizado em /api/auth/login e /api/auth/logout
export function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
export function POST() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
