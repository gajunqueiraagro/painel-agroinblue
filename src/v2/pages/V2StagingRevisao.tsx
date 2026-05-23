/**
 * V2StagingRevisao — PR6.1
 *
 * Tela de leitura dos registros de staging gerados a partir de uma sessão da
 * Mesa. Promoção real ao financeiro (PR6.2) e reversão (PR6.3) ainda
 * desabilitadas — botões presentes como placeholder visual.
 *
 * Rota: /v2/mesa-staging/:sessaoId
 */
import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useStaging } from '@/v2/lib/staging/useStaging';
import type { StagingRow } from '@/v2/lib/staging/types';

const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v);

export default function V2StagingRevisao() {
  const { sessaoId } = useParams<{ sessaoId: string }>();
  const navigate = useNavigate();

  const { data: staging = [], isLoading } = useStaging(sessaoId ?? null);

  const stats = useMemo(() => {
    const por_status: Record<string, number> = { pendente: 0, promovido: 0, descartado: 0, erro: 0 };
    const por_tipo: Record<string, number> = { aprovado_normal: 0, excel_orfao: 0 };
    let total_valor = 0;
    staging.forEach((s) => {
      por_status[s.status_promocao] = (por_status[s.status_promocao] ?? 0) + 1;
      if (s.origem_aprovacao === 'excel_orfao') por_tipo.excel_orfao++;
      else por_tipo.aprovado_normal++;
      total_valor += Number(s.valor) || 0;
    });
    return { por_status, por_tipo, total_valor, total: staging.length };
  }, [staging]);

  if (!sessaoId) {
    return <div className="p-6 text-center text-rose-700">Sessão inválida</div>;
  }
  if (isLoading) {
    return <div className="p-6 text-center text-muted-foreground">Carregando staging…</div>;
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Revisão de Staging</h1>
          <p className="text-sm text-muted-foreground">
            Sessão: <span className="font-mono">{sessaoId.slice(0, 8)}…</span>
            {' · '}{stats.total} registros
            {' · '}<span className="font-medium">{fmtBRL(stats.total_valor)}</span>
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          ← Voltar para Mesa
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Pendentes</div>
          <div className="text-2xl font-semibold text-amber-700">{stats.por_status.pendente}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Promovidos</div>
          <div className="text-2xl font-semibold text-emerald-700">{stats.por_status.promovido}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Aprovados normais</div>
          <div className="text-2xl font-semibold">{stats.por_tipo.aprovado_normal}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Excel órfãos</div>
          <div className="text-2xl font-semibold text-amber-700">{stats.por_tipo.excel_orfao}</div>
        </Card>
      </div>

      {/* Botoes de acao — DESABILITADOS em PR6.1 */}
      <div className="flex items-center gap-2 p-3 bg-muted/30 rounded border border-dashed flex-wrap">
        <span className="text-xs text-muted-foreground flex-1 min-w-[200px]">
          Promoção real será habilitada em PR6.2. Reversão em PR6.3.
        </span>
        <Button disabled variant="default" size="sm">
          Promover ao banco real
        </Button>
        <Button disabled variant="outline" size="sm">
          Reverter promovido
        </Button>
      </div>

      {/* Tabela */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Data</th>
                <th className="text-left p-2">Tipo</th>
                <th className="text-left p-2">Conta</th>
                <th className="text-left p-2">Fornecedor</th>
                <th className="text-left p-2">Subcentro</th>
                <th className="text-right p-2">Valor</th>
                <th className="text-left p-2">Origem</th>
              </tr>
            </thead>
            <tbody>
              {staging.map((s) => (
                <LinhaStaging key={s.staging_id} row={s} />
              ))}
            </tbody>
          </table>
        </div>
        {staging.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Nenhum registro em staging. Finalize uma sessão da Mesa para gerar.
          </div>
        )}
      </Card>
    </div>
  );
}

function LinhaStaging({ row }: { row: StagingRow }) {
  const corStatus =
    row.status_promocao === 'promovido' ? 'bg-emerald-100 text-emerald-700' :
    row.status_promocao === 'erro' ? 'bg-rose-100 text-rose-700' :
    row.status_promocao === 'descartado' ? 'bg-gray-100 text-gray-700' :
    'bg-amber-100 text-amber-700';

  return (
    <tr className="border-t hover:bg-muted/20">
      <td className="p-2">
        <Badge className={corStatus + ' text-[10px]'}>{row.status_promocao}</Badge>
      </td>
      <td className="p-2 text-xs tabular-nums">{row.data_pagamento}</td>
      <td className="p-2 text-xs">{row.tipo_operacao ?? '—'}</td>
      <td className="p-2 text-xs font-mono">
        {row.conta_bancaria_id
          ? row.conta_bancaria_id.slice(0, 8) + '…'
          : <span className="text-amber-700 font-sans">sem conta</span>}
      </td>
      <td className="p-2 text-xs">
        {row.favorecido_nome_marcado_novo
          ? <span className="text-blue-700">+ {row.favorecido_nome_marcado_novo}</span>
          : (row.favorecido_id
              ? <span className="font-mono">{row.favorecido_id.slice(0, 8)}…</span>
              : '—')}
      </td>
      <td className="p-2 text-xs">{row.subcentro ?? '—'}</td>
      <td className="p-2 text-right font-medium tabular-nums">
        {fmtBRL(Number(row.valor))}
      </td>
      <td className="p-2 text-xs">
        <Badge variant="outline" className="text-[9px]">{row.origem_aprovacao}</Badge>
      </td>
    </tr>
  );
}
