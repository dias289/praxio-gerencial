import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/session";
import LoginForm from "./login-form";

export default async function LoginPage() {
  const session = await getServerSession();
  if (session) redirect("/");

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white">Dashboard Gerencial</h1>
          <p className="text-gray-400 text-sm mt-1">Praxio — Métricas de Suporte</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
