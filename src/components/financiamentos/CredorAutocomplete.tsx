import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChevronsUpDown, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeFornecedorNome } from '@/lib/financeiro/normalizeFornecedorNome';

/* PR-PARC-04 item 5 — BUSCA NO SERVIDOR.
   ⚠ O DEFEITO QUE ISTO CORRIGE NAO ERA DE PERFORMANCE, ERA DE DADO SUMIDO. A query
   antiga pedia TODOS os fornecedores ativos do cliente sem `.range`, e o PostgREST
   corta em 1.000 sem avisar ninguem: com 2.564 ativos no NJ, 61% dos credores nunca
   entravam na lista. Pior que nao achar na busca — o NOME do selecionado tambem saia
   dali (`fornecedores.find(...)`), entao um contrato com credor alem do milesimo
   exibia o placeholder "Selecionar credor..." como se nao tivesse nenhum. Dado
   existente aparentando ausencia.
   ⚠ POR ISSO SAO DUAS QUERIES, E NAO UMA. A lista responde "quem casa com o que
   digitei" (20 por vez); o ROTULO responde "qual e' o nome deste id" e nao depende da
   pagina de busca — sem ela, trocar a lista por 20 itens transformaria o defeito de
   1.000 em defeito de 20. */

interface Props {
  value: string;
  onChange: (id: string) => void;
  clienteId: string;
  placeholder?: string;
  disabled?: boolean;
}

const MIN_TERMO = 2;
const DEBOUNCE_MS = 250;

export function CredorAutocomplete({ value, onChange, clienteId, placeholder = 'Selecionar credor...', disabled }: Props) {
  const qc = useQueryClient();
  const { fazendas, fazendaAtual } = useFazenda();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [termo, setTermo] = useState('');
  const [novoOpen, setNovoOpen] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [reativarTarget, setReativarTarget] = useState<{ id: string; nome: string } | null>(null);
  const [reativando, setReativando] = useState(false);

  /* Debounce de 250ms: o termo que vai ao servidor atrasa; o que o operador ve'
     no campo, nunca. */
  useEffect(() => {
    const t = setTimeout(() => setTermo(search.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const termoValido = termo.length >= MIN_TERMO;

  const { data: resultados = [], isFetching: buscando } = useQuery({
    queryKey: ['credor-busca', clienteId, termo],
    enabled: !!clienteId && termoValido,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_fornecedores')
        .select('id, nome')
        .eq('cliente_id', clienteId)
        .eq('ativo', true)
        .ilike('nome', `%${termo}%`)
        .order('nome')
        .limit(20);
      return data ?? [];
    },
  });

  /* ⚠ O ROTULO DO SELECIONADO — nao filtra por `ativo` DE PROPOSITO. Um contrato
     antigo pode apontar para um credor desativado depois; mostrar o nome dele e'
     o certo, e "Credor nao encontrado" fica reservado para o id que realmente nao
     existe mais. Filtrar aqui devolveria o placeholder pelo caminho novo — o mesmo
     defeito que este PR veio fechar. */
  const { data: selecionado, isLoading: carregandoSelecionado } = useQuery({
    queryKey: ['credor-por-id', clienteId, value],
    enabled: !!clienteId && !!value,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_fornecedores')
        .select('id, nome')
        .eq('cliente_id', clienteId)
        .eq('id', value)
        .maybeSingle();
      return data ?? null;
    },
  });

  /* O denominador do rodape: quantos existem ao todo. `head: true` nao traz linha
     nenhuma — so' o cabecalho com a contagem. */
  const { data: totalAtivos } = useQuery({
    queryKey: ['credor-total', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const { count } = await supabase
        .from('financeiro_fornecedores')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', clienteId)
        .eq('ativo', true);
      return count ?? 0;
    },
  });

  const resolveFazendaId = (): string | null => {
    if (fazendaAtual?.id && fazendaAtual.id !== '__global__') return fazendaAtual.id;
    const first = fazendas.find(f => f.id !== '__global__');
    return first?.id ?? null;
  };

  /* Invalidacoes do fluxo "+ novo": a lista de busca (o nome novo passa a casar) e
     o rotulo por id (o value recem-setado precisa do nome na hora). */
  const invalidarCredores = () => {
    qc.invalidateQueries({ queryKey: ['credor-busca', clienteId] });
    qc.invalidateQueries({ queryKey: ['credor-por-id', clienteId] });
    qc.invalidateQueries({ queryKey: ['credor-total', clienteId] });
  };

  const salvarNovo = async () => {
    const nome = novoNome.trim();
    if (!nome) {
      toast.error('Informe o nome do credor');
      return;
    }
    const fazendaId = resolveFazendaId();
    if (!fazendaId) {
      toast.error('Selecione uma fazenda antes de criar um credor');
      return;
    }

    // Pré-check: verificar duplicata por nome_normalizado (inclui inativos).
    // Index único no banco impede duplicata mesmo entre ativo/inativo.
    const normalizado = normalizeFornecedorNome(nome);
    const { data: existing } = await supabase
      .from('financeiro_fornecedores')
      .select('id, nome, ativo')
      .eq('cliente_id', clienteId)
      .eq('nome_normalizado', normalizado)
      .maybeSingle();

    if (existing) {
      if (existing.ativo) {
        // Já cadastrado e ativo — apenas selecionar e fechar.
        onChange(existing.id);
        toast.info(`Fornecedor "${existing.nome}" já cadastrado — selecionado.`);
        setNovoOpen(false);
        setNovoNome('');
        setOpen(false);
        return;
      }
      // Inativo → oferecer reativação.
      setReativarTarget({ id: existing.id, nome: existing.nome });
      return;
    }

    setSalvando(true);
    const { data, error } = await supabase
      .from('financeiro_fornecedores')
      .insert({ cliente_id: clienteId, fazenda_id: fazendaId, nome, ativo: true })
      .select('id, nome')
      .single();
    setSalvando(false);
    if (error) {
      toast.error('Erro ao criar credor: ' + error.message);
      return;
    }
    if (data) {
      invalidarCredores();
      onChange(data.id);
      toast.success('Credor criado');
      setNovoOpen(false);
      setNovoNome('');
      setOpen(false);
    }
  };

  const reativarExistente = async () => {
    if (!reativarTarget) return;
    setReativando(true);
    const { error } = await supabase
      .from('financeiro_fornecedores')
      .update({ ativo: true })
      .eq('id', reativarTarget.id);
    setReativando(false);
    if (error) {
      toast.error('Erro ao reativar: ' + error.message);
      return;
    }
    invalidarCredores();
    onChange(reativarTarget.id);
    toast.success(`Fornecedor "${reativarTarget.nome}" reativado e selecionado`);
    setReativarTarget(null);
    setNovoOpen(false);
    setNovoNome('');
    setOpen(false);
  };

  /* O rotulo do gatilho. Enquanto a query por id corre, "…" — NUNCA o placeholder
     de vazio: um value preenchido nao pode piscar como campo em branco. */
  const rotulo = !value
    ? <span className="text-muted-foreground truncate">{placeholder}</span>
    : carregandoSelecionado
      ? <span className="text-muted-foreground truncate">…</span>
      : selecionado
        ? <span className="truncate">{selecionado.nome}</span>
        : <span className="truncate text-amber-600 dark:text-amber-500">Credor não encontrado</span>;

  return (
    <div className="flex gap-1">
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) { setSearch(''); setTermo(''); }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="flex-1 justify-between font-normal min-w-0"
            title={selecionado?.nome}
          >
            {rotulo}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0 z-[100]"
          align="start"
          sideOffset={4}
        >
          {/* `shouldFilter={false}`: quem filtra e' o servidor. */}
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar credor..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList className="max-h-60">
              {!termoValido ? (
                <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                  Digite para buscar
                </div>
              ) : buscando ? (
                <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                  Buscando…
                </div>
              ) : (
                <>
                  <CommandEmpty>Nenhum credor encontrado.</CommandEmpty>
                  <CommandGroup>
                    {resultados.map(f => (
                      <CommandItem
                        key={f.id}
                        value={f.id}
                        onSelect={() => { onChange(f.id); setOpen(false); setSearch(''); setTermo(''); }}
                      >
                        {f.nome}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
            {/* RODAPE — quantos vieram, de quantos existem. O denominador e' o que
                impede a leitura "achei tudo que ha'" numa lista cortada em 20. */}
            <div className="flex items-center justify-between gap-2 border-t px-2 py-1 text-[10px] text-muted-foreground">
              <span className="truncate">
                {termoValido ? `${resultados.length} de ${totalAtivos ?? '—'} fornecedores` : `${totalAtivos ?? '—'} fornecedores`}
                {' · digite para refinar'}
              </span>
              <button
                type="button"
                className="shrink-0 font-medium text-primary hover:underline"
                onClick={() => setNovoOpen(true)}
              >
                + novo
              </button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        onClick={() => setNovoOpen(true)}
        disabled={disabled}
        title="Novo credor"
      >
        <Plus className="h-4 w-4" />
      </Button>

      <Dialog open={novoOpen} onOpenChange={(v) => { setNovoOpen(v); if (!v) setNovoNome(''); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo credor</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Nome *</Label>
            <Input
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              placeholder="Ex: Banco do Brasil"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') salvarNovo(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoOpen(false)} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvarNovo} disabled={salvando}>{salvando ? 'Salvando...' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!reativarTarget} onOpenChange={(v) => { if (!v) setReativarTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Credor inativo já cadastrado</AlertDialogTitle>
            <AlertDialogDescription>
              Já existe um credor inativo com o nome <strong>"{reativarTarget?.nome}"</strong>.
              Em vez de criar uma duplicata, deseja reativá-lo e selecioná-lo neste financiamento?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reativando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={reativarExistente} disabled={reativando}>
              {reativando ? 'Reativando...' : 'Reativar e selecionar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
