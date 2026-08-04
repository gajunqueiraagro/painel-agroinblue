/**
 * ExtratoGerencialTab — PR-FIN-V2-EXTRATO-GERENCIAL-01.
 *
 * Extrato bancário GERENCIAL (visão do sistema) de UMA conta + período: saldo inicial +
 * movimentações (financeiro_lancamentos_v2) + saldo corrido + saldo final oficial.
 *
 * Frontend puro. Reutiliza FONTES existentes (sem hook/RPC/tabela nova):
 *   - conta: financeiro_contas_bancarias
 *   - saldo inicial/final: financeiro_saldos_bancarios_v2 por (cliente_id, conta_bancaria_id, ano_mes)
 *   - timeline: financeiro_lancamentos_v2 (conta_bancaria_id=saída / conta_destino_id=entrada)
 *   - conciliação: conciliacao_bancaria_itens (indicador Conciliado/Parcial/Sem vínculo)
 *   - clique na linha: LancamentoLeituraDialog (fluxo existente; sem novo modal)
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { ContaBancariaSelect, type ContaSelecionavel } from '@/components/shared/ContaBancariaSelect';
import { LancamentoLeituraDialog } from '@/components/financeiro-v2/LancamentoLeituraDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_FILTRO_LABEL } from '@/lib/financeiro/statusFinanceiro';
import { formatMoeda } from '@/lib/calculos/formatters';
import { format, parseISO } from 'date-fns';

interface ContaRow extends ContaSelecionavel { fazenda_id: string | null; }
interface LancExtrato {
  id: string; data_pagamento: string | null; data_competencia: string; valor: number;
  tipo_operacao: string; descricao: string | null; historico: string | null;
  numero_documento: string | null; favorecido_id: string | null; centro_custo: string | null;
  status_transacao: string | null; cancelado: boolean;
  conta_bancaria_id: string | null; conta_destino_id: string | null;
}
interface SaldoRow { saldo_inicial: number | null; saldo_final: number | null; status_mes: string | null; }

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
function fmtData(d: string | null): string { if (!d) return '—'; try { return format(parseISO(d), 'dd/MM/yy'); } catch { return d; } }

export function ExtratoGerencialTab({ initialAno, initialMes }: { initialAno?: number; initialMes?: number }) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const { fazendaAtual } = useFazenda();
  const fazScope = fazendaAtual?.id && fazendaAtual.id !== '__global__' ? fazendaAtual.id : null;

  const hoje = new Date();
  const [ano, setAno] = useState<number>(initialAno ?? hoje.getFullYear());
  const [mes, setMes] = useState<number>(initialMes ?? hoje.getMonth() + 1);
  const [contaSel, setContaSel] = useState<string | null>(null);
  const [lancLeituraId, setLancLeituraId] = useState<string | null>(null);
  const anoMes = `${ano}-${String(mes).padStart(2, '0')}`;

  // Contas do cliente (escopo da fazenda global, quando não é __global__).
  const { data: contas = [] } = useQuery({
    queryKey: ['extrato-ger-contas', clienteId, fazScope],
    enabled: !!clienteId,
    queryFn: async (): Promise<ContaRow[]> => {
      let q = (supabase as any).from('financeiro_contas_bancarias')
        .select('id, nome_conta, nome_exibicao, tipo_conta, banco, agencia, numero_conta, conta_digito, fazenda_id, ordem_exibicao')
        .eq('cliente_id', clienteId).eq('ativa', true).order('ordem_exibicao');
      if (fazScope) q = q.eq('fazenda_id', fazScope);
      const { data } = await q;
      return data ?? [];
    },
  });

  const contaId = contaSel ?? contas[0]?.id ?? null;
  const conta = useMemo(() => contas.find((c) => c.id === contaId) ?? null, [contas, contaId]);

  const { data: fornMap } = useQuery({
    queryKey: ['extrato-ger-forn', clienteId],
    enabled: !!clienteId,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data } = await (supabase as any).from('financeiro_fornecedores').select('id, nome').eq('cliente_id', clienteId);
      const rows: { id: string; nome: string }[] = data ?? [];
      return new Map(rows.map((f) => [f.id, f.nome]));
    },
  });

  const { data: saldo } = useQuery({
    queryKey: ['extrato-ger-saldo', clienteId, contaId, anoMes],
    enabled: !!clienteId && !!contaId,
    queryFn: async (): Promise<SaldoRow | null> => {
      const { data } = await (supabase as any).from('financeiro_saldos_bancarios_v2')
        .select('saldo_inicial, saldo_final, status_mes')
        .eq('cliente_id', clienteId).eq('conta_bancaria_id', contaId).eq('ano_mes', anoMes).maybeSingle();
      return data ?? null;
    },
  });

  const { data: lancs = [] } = useQuery({
    queryKey: ['extrato-ger-lancs', clienteId, contaId, anoMes],
    enabled: !!clienteId && !!contaId,
    queryFn: async (): Promise<LancExtrato[]> => {
      const { data } = await (supabase as any).from('financeiro_lancamentos_v2')
        .select('id, data_pagamento, data_competencia, valor, tipo_operacao, descricao, historico, numero_documento, favorecido_id, centro_custo, status_transacao, cancelado, conta_bancaria_id, conta_destino_id')
        .eq('cliente_id', clienteId).eq('ano_mes', anoMes)
        .or(`conta_bancaria_id.eq.${contaId},conta_destino_id.eq.${contaId}`);
      return data ?? [];
    },
  });

  const lancIds = useMemo(() => lancs.map((l) => l.id), [lancs]);
  const { data: concilMap } = useQuery({
    queryKey: ['extrato-ger-concil', contaId, anoMes, lancIds.length],
    enabled: lancIds.length > 0,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data } = await (supabase as any).from('conciliacao_bancaria_itens')
        .select('lancamento_id, valor_aplicado').in('lancamento_id', lancIds).is('desfeito_em', null);
      const rows: { lancamento_id: string; valor_aplicado: number }[] = data ?? [];
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.lancamento_id, (m.get(r.lancamento_id) ?? 0) + Number(r.valor_aplicado));
      return m;
    },
  });

  // Saldo inicial/final oficiais (narrow por typeof — sem cast). null = "não informado".
  const siRaw = saldo?.saldo_inicial;
  const sfRaw = saldo?.saldo_final;
  const saldoIni = typeof siRaw === 'number' ? siRaw : null;
  const saldoFin = typeof sfRaw === 'number' ? sfRaw : null;

  // Timeline: ordena por data do movimento e calcula saldo corrido (só se saldo inicial existir).
  const linhas = useMemo(() => {
    const ord = [...lancs].sort((a, b) => {
      const da = a.data_pagamento ?? a.data_competencia; const db = b.data_pagamento ?? b.data_competencia;
      return da < db ? -1 : da > db ? 1 : 0;
    });
    let acc: number | null = saldoIni;
    return ord.map((l) => {
      // Regra da conta: origem (conta_bancaria_id) = saída (−); destino (conta_destino_id) = entrada (+).
      const mov = l.cancelado ? 0 : (l.conta_bancaria_id === contaId ? -Math.abs(l.valor) : Math.abs(l.valor));
      if (acc !== null && !l.cancelado) acc += mov;
      return { l, mov, saldo: acc, data: l.data_pagamento ?? l.data_competencia };
    });
  }, [lancs, saldoIni, contaId]);

  const totais = useMemo(() => {
    let ent = 0, sai = 0;
    for (const x of linhas) { if (x.l.cancelado) continue; if (x.mov > 0) ent += x.mov; else sai += Math.abs(x.mov); }
    return { ent, sai };
  }, [linhas]);

  const anos = useMemo(() => { const y = hoje.getFullYear(); return [y - 3, y - 2, y - 1, y, y + 1]; }, []);
  const contaNome = conta ? (conta.nome_exibicao || conta.nome_conta) : '—';

  function concStatus(l: LancExtrato): { txt: string; cls: string } {
    const aplic = concilMap?.get(l.id) ?? 0;
    if (aplic <= 0) return { txt: 'Sem vínculo', cls: 'text-muted-foreground' };
    if (aplic + 0.005 >= Math.abs(l.valor)) return { txt: 'Conciliado', cls: 'text-emerald-600' };
    return { txt: 'Parcial', cls: 'text-amber-600' };
  }
  const card = (label: string, valor: string, cls = '') => (
    <div className="rounded-md border bg-white px-2 py-1 flex-1 min-w-0">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-[13px] font-bold tabular-nums leading-tight ${cls}`}>{valor}</div>
    </div>
  );

  return (
    <div className="space-y-1.5 pb-10">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-1.5">
        <div className="min-w-[220px]">
          <label className="text-[9px] font-semibold text-muted-foreground block mb-0.5">Conta</label>
          <ContaBancariaSelect value={contaId} onValueChange={setContaSel} contas={contas} showBankDetails="agencia" placeholder="Selecionar conta" />
        </div>
        <div>
          <label className="text-[9px] font-semibold text-muted-foreground block mb-0.5">Mês</label>
          <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="h-6 text-[10px] w-[84px]"><SelectValue /></SelectTrigger>
            <SelectContent>{MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)} className="text-[10px]">{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[9px] font-semibold text-muted-foreground block mb-0.5">Ano</label>
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="h-6 text-[10px] w-[76px]"><SelectValue /></SelectTrigger>
            <SelectContent>{anos.map((a) => <SelectItem key={a} value={String(a)} className="text-[10px]">{a}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="text-[10px] text-muted-foreground pb-1">
          {conta ? <>Banco {conta.banco || '—'} · {conta.agencia ? `Ag ${conta.agencia}` : ''} {conta.numero_conta || ''}</> : null}
          {fazScope && fazendaAtual?.nome ? ` · ${fazendaAtual.nome}` : ''}
        </div>
      </div>

      {/* Cabeçalho: conta/período + cards */}
      <div className="rounded-lg border bg-muted/20 p-2 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[12px] font-semibold truncate">{contaNome}</div>
          <div className="text-[10px] text-muted-foreground">{MESES[mes - 1]}/{ano}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {card('Saldo inicial', saldoIni !== null ? formatMoeda(saldoIni) : 'Saldo não informado', saldoIni !== null ? '' : 'text-muted-foreground text-[11px]')}
          {card('Entradas', formatMoeda(totais.ent), 'text-emerald-700')}
          {card('Saídas', formatMoeda(totais.sai), 'text-rose-700')}
          {card('Saldo final', saldoFin !== null ? formatMoeda(saldoFin) : 'Saldo não informado', saldoFin !== null ? '' : 'text-muted-foreground text-[11px]')}
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-lg border overflow-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-primary text-primary-foreground">
              {['Data', 'Histórico', 'Produto', 'Fornecedor', 'Centro', 'Valor', 'Saldo', 'Status'].map((h, i) => (
                <th key={h} className={`px-1.5 py-1 text-[9px] uppercase font-semibold ${i >= 5 && i <= 6 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-[10px] text-muted-foreground py-6">Nenhuma movimentação para esta conta no período.</td></tr>
            ) : linhas.map(({ l, mov, saldo: sAcc, data }) => {
              const cs = concStatus(l);
              return (
                <tr key={l.id} onClick={() => setLancLeituraId(l.id)}
                    className={`border-b cursor-pointer hover:bg-muted/50 text-[10px] ${l.cancelado ? 'opacity-50 line-through' : ''}`}>
                  <td className="px-1.5 py-0.5 whitespace-nowrap text-muted-foreground">{fmtData(data)}</td>
                  <td className="px-1.5 py-0.5 max-w-[180px] truncate" title={l.historico ?? ''}>{l.historico || '—'}</td>
                  <td className="px-1.5 py-0.5 max-w-[180px] truncate" title={l.descricao ?? ''}>{l.descricao || '—'}</td>
                  <td className="px-1.5 py-0.5 max-w-[140px] truncate">{(l.favorecido_id && fornMap?.get(l.favorecido_id)) || '—'}</td>
                  <td className="px-1.5 py-0.5 max-w-[120px] truncate text-muted-foreground">{l.centro_custo || '—'}</td>
                  <td className={`px-1.5 py-0.5 text-right tabular-nums ${mov > 0 ? 'text-emerald-700' : mov < 0 ? 'text-rose-700' : 'text-muted-foreground'}`}>{l.cancelado ? '—' : formatMoeda(mov)}</td>
                  <td className="px-1.5 py-0.5 text-right tabular-nums">{sAcc === null ? '—' : formatMoeda(sAcc)}</td>
                  <td className="px-1.5 py-0.5 whitespace-nowrap">
                    <span>{STATUS_FILTRO_LABEL[(l.status_transacao || '').toLowerCase()] ?? (l.status_transacao || '—')}</span>
                    <span className={`ml-1 ${cs.cls}`}>· {cs.txt}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <LancamentoLeituraDialog open={!!lancLeituraId} lancamentoId={lancLeituraId} onClose={() => setLancLeituraId(null)} />
    </div>
  );
}
