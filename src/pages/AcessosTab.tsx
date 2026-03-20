import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { UserPlus, Trash2, Users } from 'lucide-react';

interface Membro {
  id: string;
  user_id: string;
  papel: string;
  profiles: { nome: string | null } | null;
  user_email?: string;
}

const PAPEIS: Record<string, string> = {
  dono: 'Proprietário',
  gerente: 'Gerente',
  capataz: 'Capataz',
};

const PAPEL_COLORS: Record<string, string> = {
  dono: 'bg-primary text-primary-foreground',
  gerente: 'bg-accent text-accent-foreground',
  capataz: 'bg-muted text-muted-foreground',
};

export function AcessosTab() {
  const { fazendaAtual, fazendas } = useFazenda();
  const { user } = useAuth();
  const [membros, setMembros] = useState<Membro[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [papel, setPapel] = useState('capataz');
  const [fazendaSelecionada, setFazendaSelecionada] = useState(fazendaAtual?.id || '');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (fazendaAtual) {
      setFazendaSelecionada(fazendaAtual.id);
    }
  }, [fazendaAtual]);

  useEffect(() => {
    if (fazendaSelecionada) loadMembros();
  }, [fazendaSelecionada]);

  const loadMembros = async () => {
    if (!fazendaSelecionada) return;
    setLoading(true);
    const { data } = await supabase
      .from('fazenda_membros')
      .select('id, user_id, papel')
      .eq('fazenda_id', fazendaSelecionada);

    if (data) {
      // Load profiles separately
      const userIds = data.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, nome')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      setMembros(data.map(m => ({
        ...m,
        profiles: profileMap.get(m.user_id) || null,
      })));
    }
    setLoading(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !senha || !fazendaSelecionada) return;
    setAdding(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('criar-usuario', {
        body: { email, senha, nome, fazenda_id: fazendaSelecionada, papel },
      });

      if (res.error || res.data?.error) {
        toast.error(res.data?.error || 'Erro ao adicionar membro');
      } else {
        toast.success('Membro adicionado com sucesso!');
        setEmail('');
        setSenha('');
        setNome('');
        setPapel('capataz');
        loadMembros();
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro inesperado');
    }
    setAdding(false);
  };

  const handleRemove = async (membro: Membro) => {
    if (!confirm(`Remover ${membro.profiles?.nome || 'este membro'}?`)) return;

    const res = await supabase.functions.invoke('remover-membro', {
      body: { membro_id: membro.id, fazenda_id: fazendaSelecionada },
    });

    if (res.error || res.data?.error) {
      toast.error(res.data?.error || 'Erro ao remover');
    } else {
      toast.success('Membro removido');
      loadMembros();
    }
  };

  const isDono = fazendaAtual?.owner_id === user?.id;
  const myPapel = membros.find(m => m.user_id === user?.id)?.papel;
  const canManage = isDono || myPapel === 'gerente';

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Gestão de Acessos</h2>
      </div>

      {fazendas.length > 1 && (
        <Select value={fazendaSelecionada} onValueChange={setFazendaSelecionada}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione a fazenda" />
          </SelectTrigger>
          <SelectContent>
            {fazendas.map(f => (
              <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Lista de membros */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Membros da Fazenda</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : membros.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum membro encontrado</p>
          ) : (
            membros.map(m => (
              <div key={m.id} className="flex items-center justify-between p-2 rounded-lg border bg-card">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{m.profiles?.nome || 'Sem nome'}</p>
                  </div>
                  <Badge className={PAPEL_COLORS[m.papel] || ''} variant="secondary">
                    {PAPEIS[m.papel] || m.papel}
                  </Badge>
                </div>
                {canManage && m.papel !== 'dono' && m.user_id !== user?.id && (
                  <Button variant="ghost" size="sm" onClick={() => handleRemove(m)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
              <Input
                placeholder="Nome"
                value={nome}
                onChange={e => setNome(e.target.value)}
              />
              <Input
                type="email"
                placeholder="E-mail"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <Input
                type="text"
                placeholder="Senha temporária"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                required
                minLength={6}
              />
              <Select value={papel} onValueChange={setPapel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gerente">Gerente</SelectItem>
                  <SelectItem value="capataz">Capataz</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" className="w-full" disabled={adding}>
                {adding ? 'Adicionando...' : 'Adicionar'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
