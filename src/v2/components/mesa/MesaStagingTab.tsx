// ============================================================================
// PR6.1A — Aba interna "Revisão Staging" do MesaPareamentoModal
// Substitui a página separada V2StagingRevisao (deletada neste PR).
// Preview humano: colunas e nomes que o operador entende.
// Tipos de domínio NUNCA importam de componentes React (regra travada PR5).
// ============================================================================
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useStaging } from '@/v2/lib/staging/useStaging';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StagingRow } from '@/v2/lib/staging/types';

interface Props {
  sessaoId: string;
}

function fmtData(s: string | null): string {
  if (!s) return '—';
  const [, m, d] = s.split('-');
  return d && m ? `${d}/${m}` : s;
}

function fmtValor(v: number): string {
  return Number(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function IconeSinal({ sinal }: { sinal: string | null }) {
  if (sinal === '1')
    return (
      <span className="text-emerald-600 font-bold" title="Entrada">
        ↑
      </span>
    );
  if (sinal === '-1')
    return (
      <span className="text-rose-600 font-bold" title="Saída">
        ↓
      </span>
    );
  if (sinal === '0')
    return (
      <span className="text-gray-500 font-bold" title="Transferência">
        ⇄
      </span>
    );
  return <span className="text-gray-400">—</span>;
}

function BadgeOrigem({ origem }: { origem: string }) {
  if (origem === 'sugestao_direta')
    return (
      <span className="text-emerald-600 text-[10px]" title="Sugestão direta da Mesa">
        ✓
      </span>
    );
  if (origem === 'corrigido')
    return (
      <span className="text-amber-600 text-[10px]" title="Corrigido pelo operador">
        ✎
      </span>
    );
  if (origem === 'excel_orfao')
    return (
      <span
        className="text-amber-700 text-[10px]"
        title="Excel órfão — sem OFX correspondente"
      >
        ⚠ sem OFX
      </span>
    );
  return null;
}

function Categoria({ row }: { row: StagingRow }) {
  const partes = [row.grupo_custo, row.centro_custo, row.subcentro].filter(
    (v): v is string => !!v,
  );
  if (partes.length === 0) return <span className="text-gray-400">—</span>;
  const completo = partes.join(' › ');
  const truncado = completo.length > 50 ? completo.slice(0, 47) + '…' : completo;
  return (
    <span title={completo} className="text-xs">
      {truncado}
    </span>
  );
}

export function MesaStagingTab({ sessaoId }: Props) {
  const { data: staging = [], isLoading, error } = useStaging(sessaoId);
  const queryClient = useQueryClient();
  const [promovendo, setPromovendo] = useState(false);
  const [descartandoId, setDescartandoId] = useState<string | null>(null);
  // STAGING-01 — filtro de leitura por conta resolvida (client-side; não toca useStaging).
  const [filtroContaResolvida, setFiltroContaResolvida] = useState<string>('todas');

  // P0-C — descarte de linha pendente (somente 'pendente'; promovido fica para a RPC de reversão PR6.3).
  async function handleDescartar(stagingId: string) {
    if (!window.confirm('Descartar esta linha? Ela não será promovida e segue visível para auditoria.')) return;
    setDescartandoId(stagingId);
    try {
      const sb = supabase as any; // mesmo padrão do useStaging (tabelas v2 não tipadas)
      const { error } = await sb
        .from('mesa_lancamento_staging')
        .update({ status_promocao: 'descartado' })
        .eq('staging_id', stagingId)
        .eq('status_promocao', 'pendente');
      if (error) throw error;
      toast.success('Linha descartada.');
      await queryClient.invalidateQueries({ queryKey: ['mesa-staging', sessaoId] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao descartar.');
    } finally {
      setDescartandoId(null);
    }
  }

  // PR6.2-F1 — promoção transacional da sessão inteira via RPC fn_promover_staging.
  async function handlePromover() {
    setPromovendo(true);
    try {
      const sb = supabase as any; // mesmo padrão do useStaging (tabelas/RPC v2 não tipadas)
      const { data, error } = await sb.rpc('fn_promover_staging', { p_sessao_id: sessaoId });
      if (error) throw error;
      const promovidos = data?.promovidos ?? 0;
      const jaPromovidos = data?.ja_promovidos ?? 0;
      if (promovidos > 0) {
        toast.success(`${promovidos} lançamento(s) promovido(s) ao caixa real.`);
      } else if (jaPromovidos > 0) {
        toast.info('Nada novo a promover — itens deste OFX já estão no banco real.');
      } else {
        toast.info('Nada a promover.');
      }
      await queryClient.invalidateQueries({ queryKey: ['mesa-staging', sessaoId] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao promover.');
    } finally {
      setPromovendo(false);
    }
  }

  // STAGING-01 — contas resolvidas presentes na sessão (id → nome) + flag sem-conta.
  const contasResolvidas = useMemo(() => {
    const m = new Map<string, string>();
    let temSemConta = false;
    staging.forEach((s) => {
      if (s.conta_resolvida_id) {
        m.set(s.conta_resolvida_id, s.conta_resolvida_nome ?? s.conta_resolvida_id);
      } else {
        temSemConta = true;
      }
    });
    return {
      opcoes: Array.from(m, ([id, nome]) => ({ id, nome })).sort((a, b) =>
        a.nome.localeCompare(b.nome),
      ),
      temSemConta,
    };
  }, [staging]);

  // STAGING-01 — lista filtrada por conta_resolvida_id. 'todas' = sessão inteira.
  const stagingFiltrado = useMemo(() => {
    if (filtroContaResolvida === 'todas') return staging;
    if (filtroContaResolvida === '__sem__')
      return staging.filter((s) => !s.conta_resolvida_id);
    return staging.filter((s) => s.conta_resolvida_id === filtroContaResolvida);
  }, [staging, filtroContaResolvida]);

  const stats = useMemo(() => {
    let total = 0;
    let aprov_normal = 0;
    let excel_orfao = 0;
    let valor_total = 0;
    stagingFiltrado.forEach((s) => {
      total++;
      if (s.origem_aprovacao === 'excel_orfao') excel_orfao++;
      else aprov_normal++;
      valor_total += Number(s.valor) || 0;
    });
    return { total, aprov_normal, excel_orfao, valor_total };
  }, [stagingFiltrado]);

  if (isLoading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Carregando staging...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-sm text-rose-600">
        Erro ao carregar staging: {error instanceof Error ? error.message : String(error)}
      </div>
    );
  }

  if (staging.length === 0) {
    return (
      <div className="p-12 text-center">
        <div className="text-sm text-muted-foreground mb-2">
          Nenhum registro em staging ainda.
        </div>
        <div className="text-xs text-muted-foreground">
          Finalize a sessão na aba "Pareamento" para gerar staging.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-2 overflow-auto h-full">
      {/* Stats compactos */}
      <div className="flex items-center justify-between text-xs px-3 py-2 bg-muted/30 rounded flex-wrap gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <span className="text-muted-foreground">Total: </span>
            <span className="font-semibold">{stats.total}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Aprovados: </span>
            <span className="font-semibold">{stats.aprov_normal}</span>
          </div>
          {stats.excel_orfao > 0 && (
            <div>
              <span className="text-muted-foreground">Excel órfãos: </span>
              <span className="font-semibold text-amber-700">{stats.excel_orfao}</span>
            </div>
          )}
        </div>
        <div>
          <span className="text-muted-foreground">Valor: </span>
          <span className="font-semibold">R$ {fmtValor(stats.valor_total)}</span>
        </div>
      </div>

      {/* STAGING-01 — filtro de leitura por conta resolvida (destino de promoção). */}
      {(contasResolvidas.opcoes.length > 1 || contasResolvidas.temSemConta) && (
        <div className="flex items-center gap-2 text-xs px-3">
          <span className="text-muted-foreground">Conta resolvida:</span>
          <Select value={filtroContaResolvida} onValueChange={setFiltroContaResolvida}>
            <SelectTrigger className="h-7 w-56 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {contasResolvidas.opcoes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
              {contasResolvidas.temSemConta && (
                <SelectItem value="__sem__">Sem conta resolvida</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Aviso PR6.2 + botões disabled */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs flex-wrap">
        <span className="text-amber-900">
          ⓘ Reversão será habilitada em PR6.3.
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs"
            disabled={promovendo}
            onClick={handlePromover}
          >
            {promovendo ? 'Promovendo…' : 'Promover ao banco real'}
          </Button>
          <Button disabled size="sm" variant="outline" className="h-7 text-xs">
            Reverter promovido
          </Button>
        </div>
      </div>

      {/* PR-Staging-UX / P0-C — linhas compactas. Descartados ficam visíveis (auditoria). */}
      <div className="space-y-1">
        {stagingFiltrado.map((row) => (
          <CardLinha
            key={row.staging_id}
            row={row}
            onDescartar={handleDescartar}
            descartando={descartandoId === row.staging_id}
          />
        ))}
      </div>
    </div>
  );
}

function BadgeStatus({ status }: { status: string }) {
  const map: Record<string, { txt: string; cls: string }> = {
    pendente:   { txt: 'Pendente',   cls: 'bg-gray-100 text-gray-600' },
    promovido:  { txt: 'Promovido',  cls: 'bg-emerald-100 text-emerald-700' },
    descartado: { txt: 'Descartado', cls: 'bg-gray-100 text-gray-500' },
    erro:       { txt: 'Erro',       cls: 'bg-rose-100 text-rose-700' },
  };
  const m = map[status] ?? { txt: status, cls: 'bg-gray-100 text-gray-600' };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.cls}`}>{m.txt}</span>;
}

function BadgeConta({ row }: { row: StagingRow }) {
  const ambasPresentes = !!row.conta_bancaria_id && !!row.conta_resolvida_id;
  if (!ambasPresentes) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">—</span>;
  }
  const divergente = row.conta_bancaria_id !== row.conta_resolvida_id;
  return divergente ? (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-medium">
      Conta divergente
    </span>
  ) : (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
      Conta OK
    </span>
  );
}

function Favorecido({ row }: { row: StagingRow }) {
  if (row.favorecido_nome_marcado_novo)
    return (
      <span className="text-blue-700" title="Fornecedor a criar na promoção">
        + {row.favorecido_nome_marcado_novo}
      </span>
    );
  if (row.favorecido_nome) return <span>{row.favorecido_nome}</span>;
  return <span className="text-gray-400">—</span>;
}

function CardLinha({
  row,
  onDescartar,
  descartando,
}: {
  row: StagingRow;
  onDescartar: (id: string) => void;
  descartando: boolean;
}) {
  const ehOrfao = row.origem_aprovacao === 'excel_orfao';
  const corValor =
    row.sinal === '-1' ? 'text-rose-700' : row.sinal === '1' ? 'text-emerald-700' : '';
  const descartado = row.status_promocao === 'descartado';
  const podeDescartar = row.status_promocao === 'pendente';

  return (
    <Card
      className={`px-2 py-1 text-xs ${ehOrfao ? 'border-l-2 border-l-amber-400' : ''} ${descartado ? 'opacity-60' : ''}`}
    >
      {/* Linha principal: sinal+data · valor · categoria · conta · divergência · status · descartar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="tabular-nums shrink-0">
          <IconeSinal sinal={row.sinal} /> {fmtData(row.data_pagamento)}
        </span>
        <span className={`font-semibold tabular-nums shrink-0 ${corValor}`}>R$ {fmtValor(Number(row.valor))}</span>
        <span className="min-w-0 truncate"><Categoria row={row} /></span>
        <span className="text-muted-foreground min-w-0 truncate" title={row.conta_nome ?? ''}>
          {row.conta_nome ?? '—'}
        </span>
        <BadgeConta row={row} />
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          <BadgeStatus status={row.status_promocao} />
          {podeDescartar && (
            <Button
              size="sm"
              variant="ghost"
              className="h-5 px-1.5 text-[10px] text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              disabled={descartando}
              onClick={() => onDescartar(row.staging_id)}
            >
              {descartando ? '…' : 'Descartar'}
            </Button>
          )}
        </span>
      </div>

      {/* Linha secundária: favorecido · origem · produto · descrição · fazenda · competência · conta resolvida */}
      <div className="flex items-center gap-x-2 flex-wrap text-[11px] leading-tight text-muted-foreground">
        <span className="text-foreground"><Favorecido row={row} /></span>
        <BadgeOrigem origem={row.origem_aprovacao} />
        <span>· Prod: {row.produto ?? '—'}</span>
        <span className="min-w-0 truncate" title={row.descricao ?? ''}>· {row.descricao ?? '—'}</span>
        <span>· Faz: {row.fazenda_nome ?? '—'}</span>
        <span>· Comp: {fmtData(row.data_competencia)}</span>
        <span>· Resolv: {row.conta_resolvida_nome ?? '—'}</span>
      </div>

      {/* Erro de promoção (só se houver) */}
      {row.erro_promocao && (
        <div className="text-rose-700 text-[11px] leading-tight">{row.erro_promocao}</div>
      )}
    </Card>
  );
}
