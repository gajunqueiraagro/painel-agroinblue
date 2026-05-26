/**
 * CONTRATO ARQUITETURAL — Aliases de Subcentro
 * ════════════════════════════════════════════════
 * Classificação financeira vem APENAS de cadastros oficiais.
 * Alias mapeia string legada do Excel → plano_conta_id canônico,
 * curado manualmente pelo operador.
 *
 * PROIBIDO: fuzzy, LIKE, ILIKE, inferência por texto livre, IA.
 * PERMITIDO: match exato com lower(trim()) — tolerância de caixa
 * e espaço, igual ao lookup atual de financeiro_plano_contas.
 *
 * Cliente_id NULL = alias global (todos os clientes).
 * Cliente_id preenchido = alias específico do cliente, prioridade
 * sobre global na resolução.
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface SubcentroAlias {
  id: string;
  cliente_id: string | null;
  alias_text: string;
  plano_conta_id: string;
  origem: string;
  observacao: string | null;
  ativo: boolean;
  created_at: string;
  plano_subcentro?: string | null;
  plano_macro?: string | null;
}

interface PlanoConta {
  id: string;
  subcentro: string;
  macro_custo: string | null;
  grupo_custo: string | null;
  centro_custo: string | null;
}

interface FormState {
  alias_text: string;
  plano_conta_id: string;
  observacao: string;
  escopo: 'cliente' | 'global';
}

const EMPTY_FORM: FormState = {
  alias_text: '',
  plano_conta_id: '',
  observacao: '',
  escopo: 'cliente',
};

export function FinV2SubcentroAliasesTab() {
  const { clienteAtual } = useCliente();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<SubcentroAlias | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Query: aliases (cliente + globais).
  // Cast `(supabase as any)` segue padrão do projeto enquanto types
  // não foram regenerados para a tabela financeiro_subcentro_aliases.
  const aliasesQuery = useQuery({
    queryKey: ['subcentro-aliases', clienteAtual?.id],
    enabled: !!clienteAtual?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('financeiro_subcentro_aliases')
        .select(
          `id, cliente_id, alias_text, plano_conta_id, origem,
           observacao, ativo, created_at,
           plano:financeiro_plano_contas!plano_conta_id (subcentro, macro_custo)`,
        )
        .or(`cliente_id.is.null,cliente_id.eq.${clienteAtual!.id}`)
        .order('cliente_id', { nullsFirst: false })
        .order('alias_text');
      if (error) throw error;
      return ((data ?? []) as any[]).map((d) => ({
        ...d,
        plano_subcentro: d.plano?.subcentro ?? null,
        plano_macro: d.plano?.macro_custo ?? null,
      })) as SubcentroAlias[];
    },
  });

  // Query: plano de contas (para dropdown do dialog).
  const planoQuery = useQuery({
    queryKey: ['plano-contas-active', clienteAtual?.id],
    enabled: dialogOpen && !!clienteAtual?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('financeiro_plano_contas')
        .select('id, subcentro, macro_custo, grupo_custo, centro_custo')
        .eq('ativo', true)
        .or(`cliente_id.is.null,cliente_id.eq.${clienteAtual!.id}`)
        .order('subcentro');
      if (error) throw error;
      return (data ?? []) as PlanoConta[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        cliente_id: form.escopo === 'cliente' ? clienteAtual!.id : null,
        alias_text: form.alias_text.trim(),
        plano_conta_id: form.plano_conta_id,
        observacao: form.observacao.trim() || null,
        origem: 'manual',
        ativo: true,
      };
      if (editando) {
        const { error } = await (supabase as any)
          .from('financeiro_subcentro_aliases')
          .update(payload)
          .eq('id', editando.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('financeiro_subcentro_aliases')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subcentro-aliases'] });
      toast.success(editando ? 'Alias atualizado' : 'Alias criado');
      setDialogOpen(false);
      setEditando(null);
      setForm(EMPTY_FORM);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Erro ao salvar: ' + msg);
    },
  });

  const toggleAtivoMut = useMutation({
    mutationFn: async (a: SubcentroAlias) => {
      const { error } = await (supabase as any)
        .from('financeiro_subcentro_aliases')
        .update({ ativo: !a.ativo })
        .eq('id', a.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subcentro-aliases'] });
    },
  });

  const filtrados = useMemo(() => {
    const list = aliasesQuery.data ?? [];
    if (!busca.trim()) return list;
    const q = busca.toLowerCase();
    return list.filter(
      (a) =>
        a.alias_text.toLowerCase().includes(q) ||
        (a.plano_subcentro ?? '').toLowerCase().includes(q),
    );
  }, [aliasesQuery.data, busca]);

  function abrirNovo() {
    setEditando(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function abrirEdicao(a: SubcentroAlias) {
    setEditando(a);
    setForm({
      alias_text: a.alias_text,
      plano_conta_id: a.plano_conta_id,
      observacao: a.observacao ?? '',
      escopo: a.cliente_id === null ? 'global' : 'cliente',
    });
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Aliases de Subcentro</h2>
          <p className="text-xs text-muted-foreground">
            Mapeamento explícito de strings legadas do Excel para subcentros do plano oficial.
            Alias específico do cliente tem prioridade sobre global.
          </p>
        </div>
        <Button onClick={abrirNovo} disabled={!clienteAtual?.id}>
          + Novo alias
        </Button>
      </div>

      <Input
        placeholder="Buscar por alias ou subcentro canônico..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="max-w-md"
      />

      <Card>
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Escopo</th>
              <th className="px-3 py-2 text-left font-medium">Alias (Excel legado)</th>
              <th className="px-3 py-2 text-left font-medium">→ Subcentro oficial</th>
              <th className="px-3 py-2 text-left font-medium">Macro</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {aliasesQuery.isLoading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Carregando...
                </td>
              </tr>
            )}
            {!aliasesQuery.isLoading && filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhum alias cadastrado. Crie o primeiro com "+ Novo alias".
                </td>
              </tr>
            )}
            {filtrados.map((a) => (
              <tr key={a.id} className="border-b hover:bg-slate-50">
                <td className="px-3 py-2">
                  {a.cliente_id === null ? (
                    <Badge variant="secondary">Global</Badge>
                  ) : (
                    <Badge variant="outline">Cliente</Badge>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{a.alias_text}</td>
                <td className="px-3 py-2">
                  {a.plano_subcentro ?? (
                    <span className="italic text-muted-foreground">∅</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {a.plano_macro ?? '—'}
                </td>
                <td className="px-3 py-2">
                  {a.ativo ? (
                    <Badge className="bg-emerald-100 text-emerald-900">Ativo</Badge>
                  ) : (
                    <Badge variant="secondary">Inativo</Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-right space-x-2">
                  <Button size="sm" variant="ghost" onClick={() => abrirEdicao(a)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleAtivoMut.mutate(a)}
                  >
                    {a.ativo ? 'Inativar' : 'Ativar'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editando ? 'Editar alias' : 'Novo alias de subcentro'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">String legada (do Excel)</label>
              <Input
                placeholder="ex: Pec/ADM/Despesas Financeiras"
                value={form.alias_text}
                onChange={(e) => setForm({ ...form, alias_text: e.target.value })}
                className="font-mono mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Match será case-insensitive e ignora espaços extras.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Subcentro oficial do plano</label>
              <select
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={form.plano_conta_id}
                onChange={(e) => setForm({ ...form, plano_conta_id: e.target.value })}
              >
                <option value="">Selecione...</option>
                {(planoQuery.data ?? []).map((pc) => (
                  <option key={pc.id} value={pc.id}>
                    {pc.subcentro} ({pc.macro_custo ?? '—'})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Escopo</label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={form.escopo === 'cliente'}
                    onChange={() => setForm({ ...form, escopo: 'cliente' })}
                  />
                  Apenas para este cliente
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={form.escopo === 'global'}
                    onChange={() => setForm({ ...form, escopo: 'global' })}
                  />
                  Global (todos os clientes)
                </label>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Observação (opcional)</label>
              <Textarea
                placeholder="Contexto histórico, motivo do alias, etc."
                value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={
                !form.alias_text.trim() ||
                !form.plano_conta_id ||
                saveMut.isPending
              }
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending
                ? 'Salvando...'
                : editando
                  ? 'Salvar'
                  : 'Criar alias'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
