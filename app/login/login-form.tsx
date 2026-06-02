'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const router   = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });

    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      let msg = 'Email ou senha incorretos.';
      try {
        const data = await res.json();
        if (data?.error) msg = data.error;
      } catch {}
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-8 space-y-5 shadow-2xl">
      <div>
        <label className="block text-sm text-gray-300 mb-1.5">Email</label>
        <input
          type="email" required value={email} onChange={e => setEmail(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          placeholder="seu@email.com" autoComplete="email"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-300 mb-1.5">Senha</label>
        <input
          type="password" required value={password} onChange={e => setPassword(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          placeholder="••••••••" autoComplete="current-password"
        />
      </div>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button type="submit" disabled={loading}
        className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors">
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
