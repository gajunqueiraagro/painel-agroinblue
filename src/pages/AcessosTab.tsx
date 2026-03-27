import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { UserPlus, Trash2, Users, KeyRound } from 'lucide-react';

interface MembroCompleto {
  id: string;
  user_id: string;
  perfil: string;
  nome: string | null;
  fazendas_ids: string[];
}

const PERFIS: Record<string, string> = {
  gestor_cliente: 'Gestor do Cliente',
  financeiro: 'Financeiro',
  campo: 'Campo',
  leitura: 'Leitura',
};

const PERFIL_COLORS: Record<string, string> = {
  admin_agroinblue: 'bg-primary text-primary-foreground',
  gestor_cliente: 'bg-accent text-accent-foreground',
  financeiro: 'bg-secondary text-secondary-foreground',
  campo: 'bg-muted text-muted-foreground',
  leitura: 'bg-muted text-muted-foreground',
};

export function AcessosTab() {
  const { fazendas } = useFazenda();
  const { clienteAtual, isAdmin } = useCliente();
  const { user } = useAuth();
  const { isManager } = usePermissions();

  const [membros, setMembros] = useState<MembroCompleto[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [perfil, setPerfil] = useState('campo');
  const [fazendaSelecionadas, setFazendaSelecionadas] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  // Reset password state
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetSenha, setResetSenha] = useState('');

  useEffect(() => {
    if (clienteAtual) loadMembros();
  }, [clienteAtual?.id]);

  const loadMembros = async () => {
    if (!clienteAtual) return;
    setLoading(true);
    try {
      // Load cliente_membros for this client
      const { data: membroRows } = await supabase
        .from('cliente_membros')
        .select('id, user_id, perfil')
        .eq('cliente_id', clienteAtual.id)
        .eq('ativo', true);

      if (!membroRows || membroRows.length === 0) {
        setMembros([]);
        setLoading(false);
        return;
      }

      const userIds = membroRows.map(m => m.user_id);

      // Load profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, nome')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p.nome]) || []);

      // Load fazenda_membros for all fazendas of this client
      const fazendaIds = fazendas.map(f => f.id);
      let fazendaMembroMap = new Map<string, string[]>();

      if (fazendaIds.length > 0) {
        const { data: fmRows } = await supabase
          .from('fazenda_membros')
          .select('user_id, fazenda_id')
          .in('user_id', userIds)
          .in('fazenda_id', fazendaIds);

        for (const fm of fmRows || []) {
          const existing = fazendaMembroMap.get(fm.user_id) || [];
          existing.push(fm.fazenda_id);
          fazendaMembroMap.set(fm.user_id, existing);
        }
      }

      setMembros(membroRows.map(m => ({
        id: m.id,
        user_id: m.user_id,
        perfil: m.perfil,
        nome: profileMap.get(m.user_id) || null,
        fazendas_ids: fazendaMembroMap.get(m.user_id) || [],
      })));
    } catch {
      toast.error('Erro ao carregar membros');
    }
    setLoading(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !senha || !clienteAtual) return;
    if (!nome.trim()) { toast.error('Informe o nome do usuário'); return; }
    if (fazendaSelecionadas.length === 0) { toast.error('Selecione ao menos uma fazenda'); return; }

    setAdding(true);
    try {
      const res = await supabase.functions.invoke('criar-usuario', {
        body: {
          email,
          senha,
          nome,
          cliente_id: clienteAtual.id,
          perfil,
          fazenda_ids: fazendaSelecionadas,
        },
      });

      if (res.error || res.data?.error) {
        toast.error(res.data?.error || 'Erro ao adicionar membro');
      } else {
        toast.success('Membro adicionado com sucesso!');
        setEmail('');
        setSenha('');
        setNome('');
        setPerfil('campo');
        setFazendaSelecionadas([]);
        loadMembros();
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro inesperado');
    }
    setAdding(false);
  };

  const handleRemove = async (membro: MembroCompleto) => {
    if (!confirm(`Remover ${membro.nome || 'este membro'}?`)) return;

    const res = await supabase.functions.invoke('remover-membro', {
      body: { membro_id: membro.id, fazenda_id: membro.fazendas_ids[0] || '' },
    });

    if (res.error || res.data?.error) {
      toast.error(res.data?.error || 'Erro ao remover');
    } else {
      toast.success('Membro removido');
      loadMembros();
    }
  };

  const handleResetSenha = async (userId: string) => {
    if (!resetSenha || resetSenha.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres');
      return;
    }
    const res = await supabase.functions.invoke('redefinir-senha', {
      body: { user_id: userId, nova_senha: resetSenha },
    });
    if (res.error || res.data?.error) {
      toast.error(res.data?.error || 'Erro ao redefinir senha');
    } else {
      toast.success('Senha redefinida com sucesso!');
      setResetUserId(null);
      setResetSenha('');
    }
  };

  const toggleFazenda = (fazendaId: string) => {
    setFazendaSelecionadas(prev =>
      prev.includes(fazendaId)
        ? prev.filter(id => id !== fazendaId)
        : [...prev, fazendaId]
    );
  };

  const selectAllFazendas = () => {
    if (fazendaSelecionadas.length === fazendas.length) {
      setFazendaSelecionadas([]);
    } else {
      setFazendaSelecionadas(fazendas.map(f => f.id));
    }
  };

  const canManage = isManager;

  const fazendaNameMap = new Map(fazendas.map(f => [f.id, f.nome]));

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Gestão de Acessos</h2>
        {clienteAtual && (
          <Badge variant="outline" className="ml-auto text-xs">
            {clienteAtual.nome}
          </Badge>
        )}
      </div>

      {/* Lista de membros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">
            Membros do Cliente ({membros.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : membros.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum membro encontrado</p>
          ) : (
            membros.map(m => (
              <div key={m.id} className="p-3 rounded-lg border bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{m.nome || 'Sem nome'}</p>
                    </div>
                    <Badge className={PERFIL_COLORS[m.perfil] || ''} variant="secondary">
                      {PERFIS[m.perfil] || m.perfil}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {canManage && m.user_id !== user?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setResetUserId(resetUserId === m.user_id ? null : m.user_id); setResetSenha(''); }}
                        className="text-muted-foreground hover:text-foreground"
                        title="Redefinir senha"
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                    )}
                    {canManage && m.user_id !== user?.id && (
                      <Button variant="ghost" size="sm" onClick={() => handleRemove(m)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Fazendas do membro */}
                {m.fazendas_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {m.fazendas_ids.map(fid => (
                      <Badge key={fid} variant="outline" className="text-[10px]">
                        {fazendaNameMap.get(fid) || fid}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Reset password inline */}
                {resetUserId === m.user_id && (
                  <div className="flex gap-2 items-end pt-1">
                    <Input
                      type="text"
                      placeholder="Nova senha (mín. 6)"
                      value={resetSenha}
                      onChange={e => setResetSenha(e.target.value)}
                      minLength={6}
                      className="flex-1"
                    />
                    <Button size="sm" onClick={() => handleResetSenha(m.user_id)}>
                      Redefinir
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Form para adicionar */}
      {canManage && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1">
              <UserPlus className="h-4 w-4" /> Adicionar Membro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <Label className="text-xs font-bold">Nome *</Label>
                <Input
                  placeholder="Nome completo"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-bold">Email (login) *</Label>
                <Input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-bold">Senha temporária *</Label>
                <Input
                  type="text"
                  placeholder="Mínimo 6 caracteres"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  required
                  minLength={6}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  O usuário poderá trocar a senha após o primeiro acesso
                </p>
              </div>

              <div>
                <Label className="text-xs font-bold">Perfil de acesso *</Label>
                <Select value={perfil} onValueChange={setPerfil}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gestor_cliente">Gestor do Cliente</SelectItem>
                    <SelectItem value="financeiro">Financeiro</SelectItem>
                    <SelectItem value="campo">Campo</SelectItem>
                    <SelectItem value="leitura">Leitura</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs font-bold">Fazendas liberadas *</Label>
                  <button
                    type="button"
                    onClick={selectAllFazendas}
                    className="text-[10px] text-primary underline"
                  >
                    {fazendaSelecionadas.length === fazendas.length ? 'Desmarcar todas' : 'Selecionar todas'}
                  </button>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto border rounded-md p-2">
                  {fazendas.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma fazenda cadastrada</p>
                  ) : (
                    fazendas.map(f => (
                      <label key={f.id} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={fazendaSelecionadas.includes(f.id)}
                          onCheckedChange={() => toggleFazenda(f.id)}
                        />
                        <span className="text-sm">{f.nome}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={adding}>
                {adding ? 'Adicionando...' : 'Adicionar Membro'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
