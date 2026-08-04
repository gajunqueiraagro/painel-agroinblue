/**
 * ExtratoGerencialTab — PR-FIN-V2-EXTRATO-GERENCIAL (01 + 02).
 *
 * Extrato bancário GERENCIAL de UMA conta + período: linha de Saldo Inicial + movimentações
 * (financeiro_lancamentos_v2) + saldo corrido + saldo final oficial.
 *
 * PR-02 — reconcilia com o Financeiro V2:
 *   - recorte temporal pela DATA DO MOVIMENTO = COALESCE(data_pagamento, data_vencimento) no mês
 *     (mesma dimensão 'financeira' do grid), NÃO por ano_mes (causava perda de lançamentos);
 *   - exclui cancelado / conciliado / cenario='meta' por padrão (como o grid); "Incluir legados" opcional;
 *   - sem coluna Histórico; coluna de Data = exclusivamente data do movimento (nunca competência).
 *
 * Frontend puro. Fontes existentes (sem hook/RPC/tabela nova). Zero-cast (só idioma supabase).
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
  id: string; data_pagamento: string | null; data_vencimento: string | null; valor: number;
  tipo_operacao: string; descricao: string | null; numero_documento: string | null;
  favorecido_id: string | null; centro_custo: string | null; status_transacao: string | null;
  conta_bancaria_id: string | null; conta_destino_id: string | null;
}
interface SaldoRow { saldo_inicial: number | null; saldo_final: number | null; status_mes: string | null; }

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const STATUS_OFICIAIS: string[] = ['realizado', 'programado', 'agendado', 'previsto'];
const pad = (n: number) => String(n).padStart(2, '0');
function fmtData(d: string | null): string { if (!d) return '—'; try { return format(parseISO(d), 'dd/MM/yy'); } catch { return d; } }
function isOficial(s: string | null): boolean { return !!s && STATUS_OFICIAIS.includes(s.toLowerCase()); }

export function ExtratoGerencialTab({ initialAno, initialMes }: { initialAno?: number; initialMes?: number }) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const { fazendaAtual } = useFazenda();
  const fazScope = fazendaAtual?.id && fazendaAtual.id !== '__global__' ? fazendaAtual.id : null;

  const hoje = new Date();
  const [ano, setAno] = useState<number>(initialAno ?? hoje.getFullYear());
  const [mes, setMes] = useState<number>(initialMes ?? hoje.getMonth() + 1);
  const [contaSel, setContaSel] = useState<string | null>(null);
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set(STATUS_OFICIAIS));
  const [incluirLegados, setIncluirLegados] = useState(false);
  const [lancLeituraId, setLancLeituraId] = useState<string | null>(null);

  const ini = `${ano}-${pad(mes)}-01`;
  const fim = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${pad(mes + 1)}-01`;
  const anoMes = `${ano}-${pad(mes)}`;

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

  // Timeline: recorte pela DATA DO MOVIMENTO (COALESCE(pgto,venc) no mês) — mesma dimensão do grid.
  const { data: lancs = [] } = useQuery({
    queryKey: ['extrato-ger-lancs', clienteId, contaId, ini, fim, incluirLegados],
    enabled: !!clienteId && !!contaId,
    queryFn: async (): Promise<LancExtrato[]> => {
      let q = (supabase as any).from('financeiro_lancamentos_v2')
        .select('id, data_pagamento, data_vencimento, valor, tipo_operacao, descricao, numero_documento, favorecido_id, centro_custo, status_transacao, conta_bancaria_id, conta_destino_id')
        .eq('cliente_id', clienteId).eq('cancelado', false)
        .or(`conta_bancaria_id.eq.${contaId},conta_destino_id.eq.${contaId}`)
        .or(`and(data_pagamento.gte.${ini},data_pagamento.lt.${fim}),and(data_pagamento.is.null,data_vencimento.gte.${ini},data_vencimento.lt.${fim})`);
      if (!incluirLegados) q = q.neq('cenario', 'meta').neq('status_transacao', 'conciliado');
      const { data } = await q;
      return data ?? [];
    },
  });

  const lancIds = useMemo(() => lancs.map((l) => l.id), [lancs]);
  const { data: concilMap } = useQuery({
    queryKey: ['extrato-ger-concil', contaId, ini, lancIds.length],
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

  const siRaw = saldo?.saldo_inicial;
  const sfRaw = saldo?.saldo_final;
  const saldoIni = typeof siRaw === 'number' ? siRaw : null;
  const saldoFin = typeof sfRaw === 'number' ? sfRaw : null;

  // Filtro por status (client-side) + saldo corrido recalculado SOBRE O CONJUNTO EXIBIDO (item #6).
  const linhas = useMemo(() => {
    const dataMov = (l: LancExtrato) => l.data_pagamento ?? l.data_vencimento ?? '';
    const visiveis = lancs.filter((l) => {
      if (isOficial(l.status_transacao)) return statusSel.has((l.status_transacao || '').toLowerCase());
      return incluirLegados; // legado (meta/conciliado/etc.) só quando o toggle estiver ligado
    }).sort((a, b) => { const da = dataMov(a), db = dataMov(b); return da < db ? -1 : da > db ? 1 : 0; });

    let acc: number | null = saldoIni;
    return visiveis.map((l) => {
      // Regra da conta: origem (conta_bancaria_id) = saída (−); destino (conta_destino_id) = entrada (+).
      const mov = l.conta_bancaria_id === contaId ? -Math.abs(l.valor) : Math.abs(l.valor);
      if (acc !== null) acc += mov;
      return { l, mov, saldo: acc, data: dataMov(l) };
    });
  }, [lancs, statusSel, incluirLegados, saldoIni, contaId]);

  const totais = useMemo(() => {
    let ent = 0, sai = 0;
    for (const x of linhas) { if (x.mov > 0) ent += x.mov; else sai += Math.abs(x.mov); }
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
  const toggleStatus = (s: string) => setStatusSel((prev) => {
    const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n;
  });
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
        {/* Status chips (4 oficiais) + Incluir legados */}
        <div className="flex items-center gap-1 pb-0.5">
          {STATUS_OFICIAIS.map((s) => (
            <button key={s} type="button" onClick={() => toggleStatus(s)}
              className={`px-1.5 h-6 rounded border text-[9px] ${statusSel.has(s) ? 'bg-primary/10 border-primary text-foreground' : 'bg-card text-muted-foreground'}`}>
              {STATUS_FILTRO_LABEL[s] ?? s}
            </button>
          ))}
          <label className="flex items-center gap-1 text-[9px] text-muted-foreground ml-1 cursor-pointer">
            <input type="checkbox" checked={incluirLegados} onChange={(e) => setIncluirLegados(e.target.checked)} className="h-3 w-3" />
            Incluir legados
          </label>
        </div>
      </div>

      {/* Cabeçalho: conta/período + cards */}
      <div className="rounded-lg border bg-muted/20 p-2 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-[12px] font-semibold truncate">
            {contaNome}
            {conta ? <span className="text-[10px] font-normal text-muted-foreground"> · Banco {conta.banco || '—'} {conta.agencia ? `· Ag ${conta.agencia}` : ''} {conta.numero_conta || ''}</span> : null}
            {fazScope && fazendaAtual?.nome ? <span className="text-[10px] font-normal text-muted-foreground"> · {fazendaAtual.nome}</span> : null}
          </div>
          <div className="text-[10px] text-muted-foreground shrink-0">{MESES[mes - 1]}/{ano}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {card('Saldo inicial', saldoIni !== null ? formatMoeda(saldoIni) : 'Saldo não informado', saldoIni !== null ? '' : 'text-muted-foreground text-[11px]')}
          {card('Entradas', formatMoeda(totais.ent), 'text-emerald-700')}
          {card('Saídas', formatMoeda(totais.sai), 'text-rose-700')}
          {card('Saldo final', saldoFin !== null ? formatMoeda(saldoFin) : 'Saldo não informado', saldoFin !== null ? '' : 'text-muted-foreground text-[11px]')}
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-lg border overflow-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-primary text-primary-foreground">
              {['Data Movimento', 'Produto', 'Fornecedor', 'Centro', 'Valor', 'Saldo', 'Status', 'Doc'].map((h, i) => (
                <th key={h} className={`px-1.5 py-1 text-[9px] uppercase font-semibold ${i === 4 || i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Linha fixa de Saldo Inicial (item #4) */}
            <tr className="border-b bg-muted/40 text-[10px] font-semibold">
              <td className="px-1.5 py-0.5">Saldo Inicial</td>
              <td /><td /><td /><td />
              <td className="px-1.5 py-0.5 text-right tabular-nums">{saldoIni !== null ? formatMoeda(saldoIni) : 'Saldo não informado'}</td>
              <td /><td />
            </tr>
            {linhas.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-[10px] text-muted-foreground py-6">Nenhuma movimentação para esta conta no período.</td></tr>
            ) : linhas.map(({ l, mov, saldo: sAcc, data }) => {
              const cs = concStatus(l);
              return (
                <tr key={l.id} onClick={() => setLancLeituraId(l.id)}
                    className="border-b cursor-pointer hover:bg-muted/50 text-[10px]">
                  <td className="px-1.5 py-0.5 whitespace-nowrap text-muted-foreground">{fmtData(data)}</td>
                  <td className="px-1.5 py-0.5 max-w-[200px] truncate" title={l.descricao ?? ''}>{l.descricao || '—'}</td>
                  <td className="px-1.5 py-0.5 max-w-[150px] truncate">{(l.favorecido_id && fornMap?.get(l.favorecido_id)) || '—'}</td>
                  <td className="px-1.5 py-0.5 max-w-[120px] truncate text-muted-foreground">{l.centro_custo || '—'}</td>
                  <td className={`px-1.5 py-0.5 text-right tabular-nums ${mov >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {mov >= 0 ? '+' : '−'} {formatMoeda(Math.abs(mov))}
                  </td>
                  <td className="px-1.5 py-0.5 text-right tabular-nums">{sAcc === null ? '—' : formatMoeda(sAcc)}</td>
                  <td className="px-1.5 py-0.5 whitespace-nowrap">
                    <span>{STATUS_FILTRO_LABEL[(l.status_transacao || '').toLowerCase()] ?? (l.status_transacao || '—')}</span>
                    <span className={`ml-1 ${cs.cls}`}>· {cs.txt}</span>
                  </td>
                  <td className="px-1.5 py-0.5 max-w-[90px] truncate text-muted-foreground" title={l.numero_documento ?? ''}>{l.numero_documento || '—'}</td>
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
