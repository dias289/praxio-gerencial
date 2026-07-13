import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { getServerSession } from "@/lib/session";
import LogoutButton from "@/components/logout-button";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dashboard Gerencial | Praxio",
  description: "Métricas de desempenho dos consultores de suporte Praxio",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();

  return (
    <html lang="pt-BR" className="h-full">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('tema');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}` }} />
      </head>
      <body className={`${inter.className} h-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 antialiased`}>
        {session && (
          <div className="fixed top-3 right-4 z-50">
            <LogoutButton email={session.email} />
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
