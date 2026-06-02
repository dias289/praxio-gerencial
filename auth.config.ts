import type { NextAuthConfig } from "next-auth";

// Configuração mínima usada no proxy (edge runtime — sem Prisma)
export const authConfig: NextAuthConfig = {
  pages:   { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [],  // providers completos ficam em auth.ts
};
