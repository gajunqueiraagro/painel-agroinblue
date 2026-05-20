/**
 * FornecedorSelect — componente compartilhado para seleção de fornecedor.
 *
 * Z3 (zoo-fornecedor): componente puro de UI. APENAS leitura + delegação
 * para FornecedorFormDialog. Sem write próprio. Será consumido em Z4
 * (LancamentoZooModal de Compra), Z5 (criação) e telas futuras.
 *
 * REGRAS SOBERANAS (Gabriel):
 *  - fornecedor_id é o ÚNICO source of truth na seleção.
 *  - fornecedor_nome_snapshot é auditoria — NUNCA alimenta o select.
 *  - Componente NÃO aceita texto livre silencioso.
 *  - "Legado sem UUID" é cidadão de primeira classe — CTA explícito.
 *  - FornecedorFormDialog NUNCA abre automaticamente — só via clique
 *    explícito do usuário (evita criar duplicado por acidente).
 *  - Sentinel '[nao informado]' nunca é renderizado como nome.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Check, ChevronsUpDown, Plus, Link2, AlertTriangle, X } from 'lucide-react';
import { FornecedorFormDialog } from '@/components/financeiro-v2/FornecedorFormDialog';

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export type ModoResolucaoLegado =
  | 'permitir'   // padrão — usuário pode resolver legado quando quiser
  | 'obrigar'    // edição forçada: bloqueia save até resolver UUID
  | 'readonly';  // apenas exibe (modal financeiro, leitura, relatórios)

export interface FornecedorSelectProps {
  /** Estado controlado pelo caller. */
  fornecedorId: string | null;
  /** Callback ao selecionar/trocar/criar. `nome` vem do mestre — nunca do snapshot. */
  onFornecedorChange: (id: string | null, nome: string | null) => void;

  /** Contexto multi-tenant — obrigatório. */
  clienteId: string;

  /** Texto histórico sem UUID (estado "legado"). */
  textoLegado?: string;
  /** Snapshot persistido — usado APENAS para display readonly, nunca para select. */
  snapshotNome?: string;

  /** Comportamento. */
  disabled?: boolean;
  required?: boolean;
  label?: string;
  placeholder?: string;

  /** Resolução de legado — default 'permitir'. */
  modoResolucaoLegado?: ModoResolucaoLegado;

  /** Hook opcional antes de abrir FornecedorFormDialog. */
  onAntesDeCriarNovo?: () => void;
}

// ─── Tipos internos ─────────────────────────────────────────────────────────

interface FornecedorRow {
  id: string;
  nome: string;
  nome_normalizado: string | null;
  aliases: string[] | null;
  cpf_cnpj: string | null;
  fazenda_id: string;
  ativo: boolean;
  tipo_recebimento: string | null;
  pix_tipo_chave: string | null;
  pix_chave: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  cpf_cnpj_pagamento: string | null;
  nome_favorecido: string | null;
  observacao_pagamento: string | null;
}

interface FazendaRow {
  id: string;
  nome: string;
}

const SENTINEL_NAO_INFORMADO = '[nao informado]';

function normalizarBusca(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function casaBusca(query: string, f: FornecedorRow): boolean {
  if (!query) return true;
  const q = normalizarBusca(query);
  if (normalizarBusca(f.nome).includes(q)) return true;
  if (f.nome_normalizado && normalizarBusca(f.nome_normalizado).includes(q)) return true;
  if (f.aliases) {
    for (const alias of f.aliases) {
      if (normalizarBusca(alias).includes(q)) return true;
    }
  }
  return false;
}

// ─── Componente ─────────────────────────────────────────────────────────────

export function FornecedorSelect({
  fornecedorId,
  onFornecedorChange,
  clienteId,
  textoLegado,
  snapshotNome,
  disabled = false,
  required = false,
  label = 'Fornecedor',
  placeholder = 'Selecione ou cadastre',
  modoResolucaoLegado = 'permitir',
  onAntesDeCriarNovo,
}: FornecedorSelectProps) {
  const queryClient = useQueryClient();
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [criarDialogOpen, setCriarDialogOpen] = useState(false);
  const [pendingNewName, setPendingNewName] = useState<string | null>(null);

  // ── Defesa em profundidade contra sentinel ──
  const snapshotLimpo = snapshotNome && snapshotNome !== SENTINEL_NAO_INFORMADO
    ? snapshotNome : undefined;
  const textoLegadoLimpo = textoLegado && textoLegado !== SENTINEL_NAO_INFORMADO
    ? textoLegado : undefined;

  // ── Query interna: fornecedores ativos do cliente ──
  const fornecedoresQuery = useQuery({
    queryKey: ['fornecedores-ativos', clienteId] as const,
    enabled: !!clienteId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FornecedorRow[]> => {
      const { data, error } = await supabase
        .from('financeiro_fornecedores')
        .select('id, nome, nome_normalizado, aliases, cpf_cnpj, fazenda_id, ativo, tipo_recebimento, pix_tipo_chave, pix_chave, banco, agencia, conta, tipo_conta, cpf_cnpj_pagamento, nome_favorecido, observacao_pagamento')
        .eq('cliente_id', clienteId)
        .eq('ativo', true)
        .order('nome', { ascending: true });
      if (error) throw new Error(error.message);
      return (data as FornecedorRow[]) ?? [];
    },
  });

  // ── Query interna: fazendas do cliente (necessária p/ FornecedorFormDialog) ──
  const fazendasQuery = useQuery({
    queryKey: ['fazendas-cliente', clienteId] as const,
    enabled: !!clienteId && criarDialogOpen,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<FazendaRow[]> => {
      const { data, error } = await supabase
        .from('fazendas')
        .select('id, nome')
        .eq('cliente_id', clienteId)
        .order('nome', { ascending: true });
      if (error) throw new Error(error.message);
      return (data as FazendaRow[]) ?? [];
    },
  });

  const fornecedores = fornecedoresQuery.data ?? [];

  // ── Auto-seleção do recém-criado após onSaved ──
  // FornecedorFormDialog.onSaved não retorna id; resolvemos por nome após refetch.
  useEffect(() => {
    if (!pendingNewName) return;
    const novo = fornecedores.find(f =>
      normalizarBusca(f.nome) === normalizarBusca(pendingNewName)
    );
    if (novo) {
      onFornecedorChange(novo.id, novo.nome);
      setPendingNewName(null);
      setCriarDialogOpen(false);
    }
  }, [fornecedores, pendingNewName, onFornecedorChange]);

  // ── Fornecedor selecionado atual ──
  const fornecedorSelecionado = useMemo(
    () => fornecedores.find(f => f.id === fornecedorId) ?? null,
    [fornecedores, fornecedorId],
  );

  // ── Filtro do combobox ──
  const filtrados = useMemo(() => {
    const list = fornecedores.filter(f => casaBusca(search, f));
    return list.slice(0, 50);
  }, [fornecedores, search]);

  // ── Sugestão de match exato com legado ──
  const sugestaoLegado = useMemo(() => {
    if (!textoLegadoLimpo) return null;
    return fornecedores.find(f =>
      normalizarBusca(f.nome) === normalizarBusca(textoLegadoLimpo) ||
      (f.nome_normalizado && normalizarBusca(f.nome_normalizado) === normalizarBusca(textoLegadoLimpo))
    ) ?? null;
  }, [fornecedores, textoLegadoLimpo]);

  // ─── ESTADO D — DISABLED / READONLY ────────────────────────────────────────
  if (disabled || modoResolucaoLegado === 'readonly') {
    const nomeDisplay = fornecedorSelecionado?.nome ?? snapshotLimpo ?? textoLegadoLimpo ?? '—';
    const ehLegado = !fornecedorSelecionado && (snapshotLimpo || textoLegadoLimpo);
    return (
      <div>
        {label && <Label className="text-[10px] text-muted-foreground">{label}</Label>}
        <div className="mt-0.5 h-8 px-2 py-1.5 text-[12px] rounded-md border border-border bg-muted/30 text-foreground flex items-center">
          <span className="truncate">{nomeDisplay}</span>
          {ehLegado && (
            <span className="ml-2 text-[10px] text-muted-foreground italic">(histórico, não vinculado)</span>
          )}
        </div>
      </div>
    );
  }

  // ─── ESTADO B — LEGADO SEM VÍNCULO ─────────────────────────────────────────
  if (!fornecedorId && textoLegadoLimpo) {
    const obrigar = modoResolucaoLegado === 'obrigar';
    return (
      <div className="space-y-1">
        {label && <Label className="text-[10px] text-muted-foreground">{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>}
        <div className={cn(
          'rounded-md border p-2 space-y-1.5',
          obrigar
            ? 'border-destructive/50 bg-destructive/5'
            : 'border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30',
        )}>
          <div className="flex items-start gap-1.5">
            <AlertTriangle className={cn(
              'h-3.5 w-3.5 shrink-0 mt-0.5',
              obrigar ? 'text-destructive' : 'text-amber-700 dark:text-amber-400',
            )} />
            <div className="flex-1 min-w-0">
              <p className={cn(
                'text-[11px] font-semibold',
                obrigar ? 'text-destructive' : 'text-amber-800 dark:text-amber-300',
              )}>
                Fornecedor legado não vinculado
              </p>
              <p className={cn(
                'text-[10px] truncate',
                obrigar ? 'text-destructive/80' : 'text-amber-700 dark:text-amber-400',
              )}>
                Texto histórico: <span className="font-mono">"{textoLegadoLimpo}"</span>
              </p>
              {obrigar && (
                <p className="text-[10px] text-destructive mt-0.5 italic">
                  Necessário resolver antes de salvar.
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-1.5 pt-0.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 text-[10px] flex-1"
              onClick={() => {
                setSearch(textoLegadoLimpo);
                setComboboxOpen(true);
              }}
            >
              <Link2 className="h-3 w-3 mr-1" />
              Vincular fornecedor
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 text-[10px] flex-1"
              onClick={() => {
                if (onAntesDeCriarNovo) onAntesDeCriarNovo();
                setPendingNewName(textoLegadoLimpo);
                setCriarDialogOpen(true);
              }}
            >
              <Plus className="h-3 w-3 mr-1" />
              Criar novo
            </Button>
          </div>
        </div>

        {/* Combobox/Popover de vinculação — só monta quando aberto */}
        {comboboxOpen && (
          <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
            <PopoverTrigger asChild>
              <span className="hidden" />
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Buscar fornecedor..."
                  value={search}
                  onValueChange={setSearch}
                  className="h-8 text-[12px]"
                />
                <CommandList>
                  <CommandEmpty className="py-3 text-[11px] text-center text-muted-foreground">
                    Nenhum fornecedor encontrado.
                  </CommandEmpty>
                  {sugestaoLegado && (
                    <CommandGroup heading="Sugerido">
                      <CommandItem
                        value={sugestaoLegado.id}
                        onSelect={() => {
                          onFornecedorChange(sugestaoLegado.id, sugestaoLegado.nome);
                          setComboboxOpen(false);
                          setSearch('');
                        }}
                      >
                        <Check className="h-3.5 w-3.5 mr-2 text-emerald-600" />
                        <span className="truncate">{sugestaoLegado.nome}</span>
                      </CommandItem>
                    </CommandGroup>
                  )}
                  <CommandGroup heading={filtrados.length > 0 ? 'Resultados' : undefined}>
                    {filtrados
                      .filter(f => !sugestaoLegado || f.id !== sugestaoLegado.id)
                      .map(f => (
                        <CommandItem
                          key={f.id}
                          value={f.id}
                          onSelect={() => {
                            onFornecedorChange(f.id, f.nome);
                            setComboboxOpen(false);
                            setSearch('');
                          }}
                        >
                          <span className="truncate">{f.nome}</span>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}

        {/* FornecedorFormDialog — só monta quando clicado */}
        {criarDialogOpen && (
          <FornecedorFormDialog
            open={criarDialogOpen}
            onClose={() => { setCriarDialogOpen(false); setPendingNewName(null); }}
            editing={null}
            allFornecedores={fornecedores}
            fazendas={fazendasQuery.data ?? []}
            clienteId={clienteId}
            onSaved={() => {
              // Invalida cache; useEffect detecta o novo pelo nome e auto-seleciona.
              queryClient.invalidateQueries({ queryKey: ['fornecedores-ativos', clienteId] });
            }}
          />
        )}
      </div>
    );
  }

  // ─── ESTADOS A (Resolvido) + C (Vazio) — combobox normal ───────────────────
  return (
    <div className="space-y-1">
      {label && <Label className="text-[10px] text-muted-foreground">{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>}
      <div className="flex gap-1.5">
        <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={comboboxOpen}
              className={cn(
                'flex-1 h-8 text-[12px] justify-between font-normal',
                !fornecedorSelecionado && 'text-muted-foreground',
              )}
            >
              <span className="truncate text-left">
                {fornecedorSelecionado?.nome ?? placeholder}
              </span>
              <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Buscar fornecedor..."
                value={search}
                onValueChange={setSearch}
                className="h-8 text-[12px]"
              />
              <CommandList>
                <CommandEmpty className="py-3 text-[11px] text-center text-muted-foreground">
                  Nenhum fornecedor encontrado.
                </CommandEmpty>
                <CommandGroup>
                  {filtrados.map(f => (
                    <CommandItem
                      key={f.id}
                      value={f.id}
                      onSelect={() => {
                        onFornecedorChange(f.id, f.nome);
                        setComboboxOpen(false);
                        setSearch('');
                      }}
                    >
                      <Check
                        className={cn(
                          'h-3.5 w-3.5 mr-2',
                          fornecedorId === f.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="truncate">{f.nome}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {fornecedorSelecionado && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onFornecedorChange(null, null)}
            title="Remover seleção"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => {
            if (onAntesDeCriarNovo) onAntesDeCriarNovo();
            setPendingNewName(null);
            setCriarDialogOpen(true);
          }}
          title="Cadastrar novo fornecedor"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* FornecedorFormDialog — só monta quando clicado */}
      {criarDialogOpen && (
        <FornecedorFormDialog
          open={criarDialogOpen}
          onClose={() => { setCriarDialogOpen(false); setPendingNewName(null); }}
          editing={null}
          allFornecedores={fornecedores}
          fazendas={fazendasQuery.data ?? []}
          clienteId={clienteId}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['fornecedores-ativos', clienteId] });
          }}
        />
      )}
    </div>
  );
}
