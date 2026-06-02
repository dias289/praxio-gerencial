'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Trash2, KeyRound, Users, ArrowLeft, Check } from 'lucide-react';
import Link from 'next/link';

interface User {
  id:        string;
  email:     string;
  name:      string;
  createdAt: string;
}

export default function UsuariosClient() {
  const [users,   setUsers]   = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulário de criação
  const [nome,   setNome]   = useState('');
  const [email,  setEmail]  = useState('');
  const [senha,  setSenha]  = useState('');
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Troca de senha
  const [trocandoId,   setTrocandoId]   = useState<string | null>(null);
  const [novaSenha,    setNovaSenha]    = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/usuarios');
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await fetch('/api/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nome, email, password: senha }),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg({ tipo: 'ok', texto: `Usuário ${data.email} criado com sucesso.` });
      setNome(''); setEmail(''); setSenha('');
      load();
    } else {
      setMsg({ tipo: 'erro', texto: data.error ?? 'Erro ao criar usuário.' });
    }
    setSaving(false);
  }

  async function handleDelete(id: string, email: string) {
    if (!confirm(`Remover o usuário ${email}? Esta ação não pode ser desfeita.`)) return;
    const res = await fetch(`/api/admin/usuarios/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setUsers(prev => prev.filter(u => u.id !== id));
    } else {
      const data = await res.json();
      alert(data.error ?? 'Erro ao remover.');
    }
  }

  async function handleChangeSenha(id: string) {
    if (!novaSenha || novaSenha.length < 6) { alert('Mínimo 6 caracteres.'); return; }
    setSalvandoSenha(true);
    const res = await fetch(`/api/admin/usuarios/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: novaSenha }),
    });
    if (res.ok) {
      setTrocandoId(null);
      setNovaSenha('');
    } else {
      const data = await res.json();
      alert(data.error ?? 'Erro ao alterar senha.');
    }
    setSalvandoSenha(false);
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Cabeçalho */}
      <div className="flex items-center gap-4">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Gerenciar Usuários
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Usuários com acesso ao dashboard</p>
        </div>
      </div>

      {/* Lista de usuários */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">
            Usuários cadastrados {!loading && <span className="text-gray-400 font-normal">({users.length})</span>}
          </h2>
        </div>
        {loading ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">Carregando...</div>
        ) : users.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-400">Nenhum usuário.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Criado em</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <>
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3.5 font-medium text-gray-900">{u.name}</td>
                    <td className="px-4 py-3.5 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3.5 text-gray-400 text-xs hidden sm:table-cell">
                      {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => { setTrocandoId(trocandoId === u.id ? null : u.id); setNovaSenha(''); }}
                          title="Alterar senha"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(u.id, u.email)}
                          title="Remover usuário"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {trocandoId === u.id && (
                    <tr key={`senha-${u.id}`} className="bg-blue-50 border-b border-blue-100">
                      <td colSpan={4} className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-blue-700 font-medium w-32">Nova senha para {u.name.split(' ')[0]}:</span>
                          <input
                            type="password"
                            value={novaSenha}
                            onChange={e => setNovaSenha(e.target.value)}
                            placeholder="Mínimo 6 caracteres"
                            className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-blue-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                          <button
                            onClick={() => handleChangeSenha(u.id)}
                            disabled={salvandoSenha}
                            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50">
                            <Check className="h-3.5 w-3.5" />
                            Salvar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Formulário de criação */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-green-600" />
          Adicionar usuário
        </h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nome completo</label>
              <input
                type="text" required value={nome} onChange={e => setNome(e.target.value)}
                placeholder="Ex: João Silva"
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="joao@empresa.com"
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="sm:w-64">
            <label className="block text-xs font-medium text-gray-600 mb-1">Senha inicial</label>
            <input
              type="password" required value={senha} onChange={e => setSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {msg && (
            <p className={`text-sm ${msg.tipo === 'ok' ? 'text-green-600' : 'text-red-500'}`}>{msg.texto}</p>
          )}
          <button
            type="submit" disabled={saving}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <UserPlus className="h-4 w-4" />
            {saving ? 'Criando...' : 'Criar usuário'}
          </button>
        </form>
      </div>
    </div>
  );
}
