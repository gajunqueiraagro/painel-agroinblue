import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d: string | null) =>
  d ? format(new Date(d + 'T12:00:00'), 'dd/MM/yyyy') : '—';

interface ParcelaInput {
  id: string;
  numero_parcela: number;
  lancamento_id?: string | null;
  lancamento_juros_id?: string | null;
}

interface FinanciamentoInput {
  numero_contrato?: string | null;
  descricao?: string | null;
}

interface Props {
  parcela: ParcelaInput | null;
  financiamento: FinanciamentoInput | null;
  onClose: () => void;
  onEditarParcela: (p: ParcelaInput) => void;
}

interface LancamentoOficial {
  id: string;
  valor: number;
  sinal: number | null;
  data_pagamento: string | null;
  status_transacao: string | null;
  cancelado: boolean | null;
  origem_lancamento: string | null;
  origem_tipo: string | null;
  descricao: string | null;
  favorecido_id: string | null;
  conta_bancaria_id: string | null;
  plano_conta_id: string | null;
  observacao: string | null;
  favorecido_nome?: string | null;
  conta_nome?: string | null;
  plano_subcentro?: string | null;
}

export default function DialogVerLancamentosOficiais({
  parcela,
  financiamento,
  onClose,
  onEditarParcela,
}: Props) {
  const open =
    !!parcela && (!!parcela.lancamento_id || !!parcela.lancamento_juros_id);

  const ids = useMemo(() => {
    if (!parcela) return [];
    return [parcela.lancamento_id, parcela.lancamento_juros_id].filter(
      Boolean,
    ) as string[];
  }, [parcela]);

  const { data: lancs = [], isLoading } = useQuery({
    queryKey: ['parcela-lancamentos-oficiais', parcela?.id, ids.join(',')],
    enabled: open && ids.length > 0,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('financeiro_lancamentos_v2')
        .select(
          'id, valor, sinal, data_pagamento, status_transacao, cancelado, origem_lancamento, origem_tipo, descricao, favorecido_id, conta_bancaria_id, plano_conta_id, observacao',
        )
        .in('id', ids);
      if (error) throw error;
      const list = (rows ?? []) as unknown as LancamentoOficial[];

      const favIds = Array.from(
        new Set(list.map((l) => l.favorecido_id).filter(Boolean)),
      ) as string[];
      const contaIds = Array.from(
        new Set(list.map((l) => l.conta_bancaria_id).filter(Boolean)),
      ) as string[];
      const planoIds = Array.from(
        new Set(list.map((l) => l.plano_conta_id).filter(Boolean)),
      ) as string[];

      const [favs, contas, planos] = await Promise.all([
        favIds.length
          ? supabase
              .from('financeiro_fornecedores')
              .select('id, nome')
              .in('id', favIds)
              .then((r) => (r.data ?? []) as any[])
          : Promise.resolve([] as any[]),
        contaIds.length
          ? supabase
              .from('financeiro_contas_bancarias')
              .select('id, nome_conta, nome_exibicao')
              .in('id', contaIds)
              .then((r) => (r.data ?? []) as any[])
          : Promise.resolve([] as any[]),
        planoIds.length
          ? supabase
              .from('financeiro_plano_contas')
              .select('id, subcentro')
              .in('id', planoIds)
              .then((r) => (r.data ?? []) as any[])
          : Promise.resolve([] as any[]),
      ]);

      const fMap = new Map<string, string>(
        favs.map((x: any) => [x.id, x.nome]),
      );
      const cMap = new Map<string, string>(
        contas.map((x: any) => [x.id, x.nome_exibicao || x.nome_conta]),
      );
      const pMap = new Map<string, string>(
        planos.map((x: any) => [x.id, x.subcentro]),
      );

      return list.map((l) => ({
        ...l,
        favorecido_nome: l.favorecido_id
          ? fMap.get(l.favorecido_id) ?? null
          : null,
        conta_nome: l.conta_bancaria_id
          ? cMap.get(l.conta_bancaria_id) ?? null
          : null,
        plano_subcentro: l.plano_conta_id
          ? pMap.get(l.plano_conta_id) ?? null
          : null,
      }));
    },
  });

  // Ordem: principal primeiro, juros depois
  const ordered = useMemo(() => {
    const rank = (l: LancamentoOficial) =>
      l.origem_tipo === 'parcela_principal' ? 0 : 1;
    return [...lancs].sort((a, b) => rank(a) - rank(b));
  }, [lancs]);

  const missingIds = useMemo(() => {
    if (!parcela || isLoading) return [];
    const got = new Set(lancs.map((l) => l.id));
    return ids.filter((id) => !got.has(id));
  }, [ids, lancs, parcela, isLoading]);

  const labelTipo = (l: LancamentoOficial) => {
    if (l.origem_tipo === 'parcela_principal') return 'Amortização (principal)';
    if (l.origem_tipo === 'parcela_juros') return 'Juros';
    return l.origem_tipo || '—';
  };

  const idCurto = (id: string) => id.substring(0, 8);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Lançamentos oficiais — Parcela {parcela?.numero_parcela}
            {financiamento?.numero_contrato
              ? ` · Contrato ${financiamento.numero_contrato}`
              : ''}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <p>
              Estes lançamentos são gerados pela parcela do contrato. Para
              alterar valor, data ou status, edite a parcela.
            </p>
          </div>

          {isLoading && (
            <p className="text-xs text-muted-foreground">
              Carregando lançamentos…
            </p>
          )}

          {!isLoading && ordered.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Vínculo financeiro informado na parcela, mas lançamento não
              encontrado.
            </p>
          )}

          {!isLoading && missingIds.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-800">
              {missingIds.length === 1
                ? 'Um dos IDs apontados pela parcela não foi encontrado: '
                : 'IDs apontados pela parcela não encontrados: '}
              {missingIds.map(idCurto).join(', ')}.
            </div>
          )}

          {!isLoading &&
            ordered.map((l) => {
              const valorNum = Number(l.valor);
              const sinal = Number(l.sinal) || 1;
              const valorAssinado = sinal * valorNum;
              return (
                <div
                  key={l.id}
                  className="rounded-md border border-border bg-card p-2.5 space-y-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold">{labelTipo(l)}</span>
                    {l.cancelado && (
                      <Badge variant="destructive" className="text-[10px]">
                        cancelado
                      </Badge>
                    )}
                    {l.status_transacao && (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          l.status_transacao === 'realizado'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : ''
                        }`}
                      >
                        {l.status_transacao}
                      </Badge>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                      ID {idCurto(l.id)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    <Linha label="Valor" value={fmt(valorAssinado)} />
                    <Linha
                      label="Data pagamento"
                      value={fmtDate(l.data_pagamento)}
                    />
                    <Linha label="Favorecido" value={l.favorecido_nome || '—'} />
                    <Linha label="Conta" value={l.conta_nome || '—'} />
                    <Linha label="Plano" value={l.plano_subcentro || '—'} />
                    {l.observacao && (
                      <Linha label="Observação" value={l.observacao} />
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        <DialogFooter className="gap-2">
          {parcela && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEditarParcela(parcela)}
            >
              Editar parcela
            </Button>
          )}
          <Button size="sm" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Linha({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-xs min-w-0">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}
