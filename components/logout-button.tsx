'use client';

import { useRouter } from 'next/navigation';

export default function LogoutButton({ email }: { email?: string | null }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      {email && <span className="text-sm text-gray-500 hidden sm:block">{email}</span>}
      <button onClick={handleLogout}
        className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
        Sair
      </button>
    </div>
  );
}
