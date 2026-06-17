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

  // PR6.2-F1 — promoção transacional da sessão inteira via RPC fn_promover_staging.
  async function handlePromover() {
    setPromovendo(true);
    try {
      const sb = supabase as any; // mesmo padrão do useStaging (tabelas/RPC v2 não tipadas)
      const { data, error } = await sb.rpc('fn_promover_staging', { p_sessao_id: sessaoId });
      if (error) throw error;
      toast.success(`${data?.promovidos ?? 0} lançamento(s) promovido(s) ao caixa real.`);
      await queryClient.invalidateQueries({ queryKey: ['mesa-staging', sessaoId] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao promover.');
    } finally {
      setPromovendo(false);
    }
  }

  const stats = useMemo(() => {
    let total = 0;
    let aprov_normal = 0;
    let excel_orfao = 0;
    let valor_total = 0;
    staging.forEach((s) => {
      total++;
      if (s.origem_aprovacao === 'excel_orfao') excel_orfao++;
      else aprov_normal++;
      valor_total += Number(s.valor) || 0;
    });
    return { total, aprov_normal, excel_orfao, valor_total };
  }, [staging]);

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

      {/* Tabela preview financeiro */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide">
              <tr>
                <th className="text-left p-2 w-14">Data</th>
                <th className="text-center p-2 w-10">Tipo</th>
                <th className="text-left p-2">Conta</th>
                <th className="text-left p-2">Favorecido</th>
                <th className="text-left p-2">Categoria</th>
                <th className="text-right p-2 w-32">Valor</th>
                <th className="text-center p-2 w-20">Origem</th>
              </tr>
            </thead>
            <tbody>
              {staging.map((row) => (
                <LinhaPreview key={row.staging_id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function LinhaPreview({ row }: { row: StagingRow }) {
  const ehOrfao = row.origem_aprovacao === 'excel_orfao';
  const corValor =
    row.sinal === '-1' ? 'text-rose-700' : row.sinal === '1' ? 'text-emerald-700' : '';

  return (
    <tr
      className={`border-t hover:bg-muted/20 ${ehOrfao ? 'border-l-2 border-l-amber-400' : ''}`}
    >
      <td className="p-2 whitespace-nowrap tabular-nums">{fmtData(row.data_pagamento)}</td>
      <td className="p-2 text-center">
        <IconeSinal sinal={row.sinal} />
      </td>
      <td className="p-2 truncate max-w-[140px]" title={row.conta_nome ?? ''}>
        {row.conta_nome ? (
          row.conta_nome
        ) : ehOrfao ? (
          <span className="text-amber-700 text-[10px]">— sem OFX</span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="p-2 truncate max-w-[160px]">
        {row.favorecido_nome_marcado_novo ? (
          <span className="text-blue-700" title="Fornecedor a criar na promoção">
            + {row.favorecido_nome_marcado_novo}
          </span>
        ) : row.favorecido_nome ? (
          <span title={row.favorecido_nome}>{row.favorecido_nome}</span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="p-2">
        <Categoria row={row} />
      </td>
      <td className={`p-2 text-right whitespace-nowrap font-medium tabular-nums ${corValor}`}>
        R$ {fmtValor(Number(row.valor))}
      </td>
      <td className="p-2 text-center">
        <BadgeOrigem origem={row.origem_aprovacao} />
      </td>
    </tr>
  );
}
