import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const COOKIE = '__praxio_session';
const ALGO   = 'HS256';

function secret() {
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? 'fallback-secret');
}

export interface SessionPayload {
  sub:   string;
  email: string;
  name:  string;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, string>)
    .setProtectedHeader({ alg: ALGO })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// Lê a sessão a partir dos cookies do servidor (Server Components / Route Handlers)
export async function getServerSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export { COOKIE };
