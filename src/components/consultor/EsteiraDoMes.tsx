/**
 * RESUMO-CLIENTES-01 passo b — a aba "Esteira do mês" (mock v9, bloco "Esteira do fechamento"; sem Documentos e sem Boletos).
 * RENDER-ONLY: cada cliente lê os donos em PARALELO, cada célula com o próprio "…" e o próprio "?" (o erro de um não derruba os
 * outros); a agregação por cliente e os textos são de `src/lib/consultor/esteira.ts`.
 *   Pasto P1 / Valor reb. = `get_status_pilares_ano(cliente, ano)` (p1 / p2 por fazenda); data do ✓ do valor do rebanho = o
 *   `fechado_em` de `valor_rebanho_fechamento`, a tabela dona do p2 (o P1 não tem carimbo de fechamento: ✓ sem data).
 *   Conciliação = `fn_conciliacao_resumo_mes`, linha `total`, pela MESMA consulta da Conciliação (`consultaDoResumoMes`).
 *   Cabeças = `zoot_mensal_cache` (realizado, saldo final do mês).
 */
import { useEffect, useMemo } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { consultaDoResumoMes, invalidarDono } from '@/hooks/useResumoConciliacao';
import { usePendenciasConsultor } from '@/hooks/usePendenciasConsultor';
import { emAberto } from '@/lib/consultor/pendencias';
import { STATUS_COR } from '@/lib/conciliacao/resumoDoDono';
import {
  CELULA_FECHAMENTO, agregarPilar, celulaDaConciliacao, diaDaCobranca, mesAoLado, ordenarEsteira, proximoPasso, rodapeDaColuna,
  rotuloDoMes, type CelulaEtapa, type EstadoEtapa, type LinhaDaEsteira, type PilarDaFazenda,
} from '@/lib/consultor/esteira';

export type EtapaDaEsteira = 'p1' | 'p2' | 'conc';
export const CHAVE_ESTEIRA = 'esteira-do-mes';

export interface EsteiraDoMesProps {
  mes: string;
  onMes: (mes: string) => void;
  clientes: readonly { id: string; nome: string }[];
  onAbrirEtapa: (clienteId: string, etapa: EtapaDaEsteira) => void;
  onVerPendencias: (clienteId: string) => void;
}

interface LinhaPilar { fazenda_id: string; fazenda_nome: string; ano_mes: string; p1: string | null; p2: string | null }
const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function lerPilares(data: unknown): LinhaPilar[] {
  const out: LinhaPilar[] = [];
  for (const x of Array.isArray(data) ? data : []) {
    if (!ehObj(x) || typeof x.fazenda_id !== 'string' || typeof x.ano_mes !== 'string') continue;
    out.push({ fazenda_id: x.fazenda_id, fazenda_nome: String(x.fazenda_nome ?? ''), ano_mes: x.ano_mes,
      p1: typeof x.p1 === 'string' ? x.p1 : null, p2: typeof x.p2 === 'string' ? x.p2 : null });
  }
  return out;
}
const msgDe = (e: unknown) => (ehObj(e) && typeof e.message === 'string' ? e.message : String(e));

const SIMBOLO: Record<EstadoEtapa, string> = { ok: '✓', parcial: '●', travado: '!', nada: '–', carregando: '…', erro: '?' };
const COR: Record<EstadoEtapa, string> = {
  ok: 'text-[#2E7D32]', parcial: 'text-[#b45309]', travado: 'text-[#A32D2D]', nada: 'text-muted-foreground', carregando: 'text-muted-foreground', erro: 'text-[#A32D2D]',
};
const TH = 'px-1.5 text-left font-semibold';

function Bolinha({ c, onClick, testId, corConc }: { c: CelulaEtapa; onClick?: () => void; testId: string; corConc?: string }) {
  const conteudo = (<><b className={cn('w-3 shrink-0 text-center', COR[c.estado])} style={corConc ? { color: corConc } : undefined}>{SIMBOLO[c.estado]}</b>
    <span className="truncate">{c.rotulo}</span></>);
  return onClick && c.estado !== 'carregando'
    ? <button type="button" className="flex w-full min-w-0 items-center gap-1 text-left hover:underline" title={c.titulo} data-testid={testId} data-estado={c.estado} onClick={onClick}>{conteudo}</button>
    : <span className="flex min-w-0 items-center gap-1" title={c.titulo} data-testid={testId} data-estado={c.estado}>{conteudo}</span>;
}

export function EsteiraDoMes({ mes, onMes, clientes, onAbrirEtapa, onVerPendencias }: EsteiraDoMesProps) {
  const qc = useQueryClient();
  const ano = Number(mes.slice(0, 4));
  const ids = useMemo(() => clientes.map(c => c.id), [clientes]);

  /* ao voltar ao painel, relê (nada de F5) */
  useEffect(() => {
    void qc.invalidateQueries({ queryKey: [CHAVE_ESTEIRA] }, { cancelRefetch: false });
    ids.forEach(id => invalidarDono(qc, id));
  }, [qc, ids]);

  const pilares = useQueries({
    queries: clientes.map(c => ({
      queryKey: [CHAVE_ESTEIRA, 'pilares', c.id, ano],
      queryFn: async () => {
        const { data, error } = await (supabase as any).rpc('get_status_pilares_ano', { p_cliente_id: c.id, p_ano: ano });
        if (error) throw error;
        return lerPilares(data);
      },
    })),
  });
  const conc = useQueries({ queries: clientes.map(c => consultaDoResumoMes(c.id, mes, null)) });
  const datasP2 = useQuery({
    queryKey: [CHAVE_ESTEIRA, 'p2-datas', mes, ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('valor_rebanho_fechamento').select('fazenda_id, fechado_em')
        .eq('ano_mes', mes).eq('status', 'fechado').in('cliente_id', ids);
      if (error) throw error;
      return new Map((data ?? []).filter(r => r.fazenda_id && r.fechado_em).map(r => [r.fazenda_id, String(r.fechado_em).slice(0, 10)]));
    },
  });
  const cabecas = useQuery({
    queryKey: [CHAVE_ESTEIRA, 'cab', mes, ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('zoot_mensal_cache').select('cliente_id, saldo_final')
        .eq('ano_mes', mes).eq('cenario', 'realizado').in('cliente_id', ids);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of data ?? []) if (r.cliente_id) m.set(r.cliente_id, (m.get(r.cliente_id) ?? 0) + (r.saldo_final ?? 0));
      return m;
    },
  });
  const pend = usePendenciasConsultor(null, true);

  const linhas: (LinhaDaEsteira & { sub: string })[] = clientes.map((c, i) => {
    const qp = pilares[i]; const qc2 = conc[i];
    const doMes = (qp?.data ?? []).filter(r => r.ano_mes === mes);
    const faz = (campo: 'p1' | 'p2'): PilarDaFazenda[] => doMes.map(r => ({ fazendaId: r.fazenda_id, fazendaNome: r.fazenda_nome, status: r[campo] }));
    const pilar = (campo: 'p1' | 'p2'): CelulaEtapa => qp?.isError ? { estado: 'erro', rotulo: '', titulo: msgDe(qp.error) }
      : !qp?.data ? { estado: 'carregando', rotulo: '', titulo: 'lendo…' }
      : agregarPilar(faz(campo), campo === 'p2' ? datasP2.data : undefined);
    const celConc: CelulaEtapa = qc2?.isError ? { estado: 'erro', rotulo: '', titulo: msgDe(qc2.error) }
      : !qc2?.data ? { estado: 'carregando', rotulo: '', titulo: 'lendo…' }
      : celulaDaConciliacao(qc2.data.find(l => l.nivel === 'total') ?? null);
    const nomes = doMes.map(r => r.fazenda_nome.replace(/^Faz\.?\s+/i, '')).join(' · ');
    const cab = cabecas.data?.get(c.id);
    return {
      clienteId: c.id, nome: c.nome, p1: pilar('p1'), p2: pilar('p2'), conc: celConc,
      pendencias: pend.lista.filter(p => p.clienteId === c.id && emAberto(p)).length,
      sub: [nomes, cab != null ? `${cab.toLocaleString('pt-BR')} cab` : null].filter(Boolean).join(' · '),
    };
  });
  const ordenadas = ordenarEsteira(linhas);
  const sub = new Map(linhas.map(l => [l.clienteId, l.sub]));
  const statusConc = new Map(clientes.map((c, i) => [c.id, conc[i]?.data?.find(l => l.nivel === 'total')?.status]));
  const dia = diaDaCobranca(mes);

  return (
    <div className="flex h-full min-h-0 flex-col px-2 pb-2" data-testid="esteira-do-mes">
      <div className="flex h-9 shrink-0 items-center gap-2">
        <h1 className="text-[13px] font-semibold">Esteira do fechamento</h1>
        <span className="flex items-center gap-0.5 text-[11px]">
          <button type="button" aria-label="mês anterior" data-testid="mes-anterior" onClick={() => onMes(mesAoLado(mes, -1))}><ChevronLeft className="h-3.5 w-3.5" /></button>
          <b className="w-12 text-center tabular-nums" data-testid="mes-da-esteira">{rotuloDoMes(mes)}</b>
          <button type="button" aria-label="mês seguinte" data-testid="mes-seguinte" onClick={() => onMes(mesAoLado(mes, 1))}><ChevronRight className="h-3.5 w-3.5" /></button>
        </span>
        <span className="text-[10px] text-muted-foreground" data-testid="dia-da-cobranca">{dia != null ? `dia ${dia} da cobrança` : ''}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">clique na bolinha abre a etapa · mais atrasado primeiro</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed text-[10px]">
          <colgroup><col style={{ width: 280 }} /><col style={{ width: 96 }} /><col style={{ width: 96 }} /><col style={{ width: 108 }} /><col style={{ width: 84 }} /><col /></colgroup>
          <thead className="sticky top-0 z-10 bg-primary text-primary-foreground">
            <tr className="h-[22px] text-[9.5px]">
              <th className={TH}>Cliente</th><th className={TH}>Pasto P1</th><th className={TH}>Valor reb.</th><th className={TH}>Conciliação</th>
              <th className={TH}>Fechamento</th><th className={TH}>Próximo passo · o que trava</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map(l => {
              const st = statusConc.get(l.clienteId);
              return (
                <tr key={l.clienteId} className="h-[22px] border-b" data-testid="esteira-linha" data-cliente={l.clienteId}>
                  <td className="truncate px-1.5" title={[l.nome, sub.get(l.clienteId)].filter(Boolean).join(' · ')}>
                    <b className="font-semibold">{l.nome}</b> <span className="text-muted-foreground">{sub.get(l.clienteId)}</span>
                  </td>
                  <td className="px-1.5"><Bolinha c={l.p1} testId="etapa-p1" onClick={() => onAbrirEtapa(l.clienteId, 'p1')} /></td>
                  <td className="px-1.5"><Bolinha c={l.p2} testId="etapa-p2" onClick={() => onAbrirEtapa(l.clienteId, 'p2')} /></td>
                  <td className="px-1.5"><Bolinha c={l.conc} testId="etapa-conc" corConc={st ? STATUS_COR[st].txt : undefined} onClick={() => onAbrirEtapa(l.clienteId, 'conc')} /></td>
                  <td className="px-1.5"><Bolinha c={CELULA_FECHAMENTO} testId="etapa-fech" /></td>
                  <td className="truncate px-1.5" title={proximoPasso(l)} data-testid="proximo-passo">
                    {proximoPasso(l)}
                    {l.pendencias > 0 && (
                      <button type="button" className="ml-1 rounded bg-[#fef3c7] px-1 font-semibold text-[#92400e]" data-testid="esteira-pendencias"
                        onClick={() => onVerPendencias(l.clienteId)}> · ⚑ {l.pendencias}</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-[#E8E6DF] font-semibold">
            <tr className="h-[22px]" data-testid="esteira-rodape">
              <td className="px-1.5">{clientes.length} clientes</td>
              <td className="px-1.5">{rodapeDaColuna(linhas.map(l => l.p1))}</td>
              <td className="px-1.5">{rodapeDaColuna(linhas.map(l => l.p2))}</td>
              <td className="px-1.5">{rodapeDaColuna(linhas.map(l => l.conc))}</td>
              <td className="px-1.5">—</td>
              <td className="px-1.5" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
