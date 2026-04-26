import { useState, useEffect, useRef } from 'react';
import { useFazenda } from '@/contexts/FazendaContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { ResOpFilters } from '../ResumoOperacionalPage';

interface Props { filtros: ResOpFilters; }

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

type StatusVal = 'oficial' | 'provisorio' | 'bloqueado' | null;

interface CelulaStatus {
  p1: StatusVal;
  p2: StatusVal;
  p3: StatusVal;
}

type HeatmapData = Map<string, CelulaStatus>;

const PILAR_LABELS = ['P1 Pastos', 'P2 Rebanho', 'P3 Caixa'] as const;

function StatusDot({ status }: { status: StatusVal }) {
  if (!status) return <span className="w-2 h-2 rounded-full bg-border inline-block" />;
  return (
    <span className={cn(
      'w-2 h-2 rounded-full inline-block',
      status === 'oficial'    && 'bg-emerald-500',
      status === 'provisorio' && 'bg-amber-400',
      status === 'bloqueado'  && 'bg-rose-500',
    )} />
  );
}

function CelulaHeatmap({ p1, p2, p3 }: CelulaStatus) {
  return (
    <div className="flex flex-col gap-0.5 items-center justify-center py-1">
      <StatusDot status={p1} />
      <StatusDot status={p2} />
      <StatusDot status={p3} />
    </div>
  );
}

export const ResOpAuditoria = ({ filtros }: Props) => {
  const { fazendas, isGlobal, fazendaAtual } = useFazenda();
  const anoNum = Number(filtros.ano);

  const [heatmap, setHeatmap] = useState<HeatmapData>(new Map());
  const [loading, setLoading] = useState(false);

  const fazendasRebanho = (fazendas || []).filter(f =>
    !f.nome?.toLowerCase().includes('administra') &&
    !f.nome?.toLowerCase().includes('retiro agri'),
  );
  const fazendasAlvo = isGlobal ? fazendasRebanho : (fazendaAtual ? [fazendaAtual] : []);

  const fazendasRef = useRef(fazendasAlvo);
  useEffect(() => { fazendasRef.current = fazendasAlvo; }, [fazendasAlvo]);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      const faz = fazendasRef.current;
      if (!faz.length) {
        setHeatmap(new Map());
        return;
      }
      setLoading(true);

      const map: HeatmapData = new Map();
      const tasks: { fazendaId: string; anoMes: string }[] = [];
      for (const f of faz) {
        if (f.id === '__global__') continue;
        for (let m = 1; m <= 12; m++) {
          tasks.push({ fazendaId: f.id, anoMes: `${anoNum}-${String(m).padStart(2, '0')}` });
        }
      }

      const CHUNK = 10;
      for (let i = 0; i < tasks.length; i += CHUNK) {
        if (cancelled) break;
        const chunk = tasks.slice(i, i + CHUNK);
        const results = await Promise.all(
          chunk.map(({ fazendaId, anoMes }) =>
            supabase.rpc('get_status_pilares_fechamento' as any, { _fazenda_id: fazendaId, _ano_mes: anoMes })
              .then(({ data }) => ({ fazendaId, anoMes, data }))
              .catch(() => ({ fazendaId, anoMes, data: null })),
          ),
        );
        for (const { fazendaId, anoMes, data } of results) {
          const key = `${fazendaId}/${anoMes}`;
          map.set(key, {
            p1: (data as any)?.p1_mapa_pastos?.status ?? null,
            p2: (data as any)?.p2_valor_rebanho?.status ?? null,
            p3: (data as any)?.p3_financeiro_caixa?.status ?? null,
          });
        }
      }

      if (!cancelled) {
        setHeatmap(map);
        setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, [anoNum, isGlobal, fazendaAtual?.id]);

  const pendencias: { fazenda: string; mes: string; pilar: string; status: StatusVal }[] = [];
  for (const f of fazendasAlvo) {
    if (f.id === '__global__') continue;
    for (let m = 1; m <= 12; m++) {
      const anoMes = `${anoNum}-${String(m).padStart(2, '0')}`;
      const cel = heatmap.get(`${f.id}/${anoMes}`);
      if (!cel) continue;
      if (cel.p1 && cel.p1 !== 'oficial') pendencias.push({ fazenda: f.nome, mes: MESES[m - 1], pilar: 'P1 Pastos', status: cel.p1 });
      if (cel.p2 && cel.p2 !== 'oficial') pendencias.push({ fazenda: f.nome, mes: MESES[m - 1], pilar: 'P2 Rebanho', status: cel.p2 });
      if (cel.p3 && cel.p3 !== 'oficial') pendencias.push({ fazenda: f.nome, mes: MESES[m - 1], pilar: 'P3 Caixa', status: cel.p3 });
    }
  }

  const fazendasParaTabela = fazendasAlvo.filter(f => f.id !== '__global__');

  return (
    <div className="p-4 space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-400">
          Auditoria de fechamentos — {filtros.ano}
        </span>
        {loading && <span className="text-[10px] text-muted-foreground">Carregando...</span>}
        <div className="flex-1 h-px bg-border" />
      </div>

      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground items-center">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Oficial</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Provisório</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />Bloqueado</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-border inline-block" />Sem dados</span>
        <span className="ml-2 text-[9px]">Linhas por célula: {PILAR_LABELS.join(' · ')}</span>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="text-[10px] border-collapse min-w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left py-1.5 px-2 font-semibold text-muted-foreground min-w-[120px]">Fazenda</th>
              {MESES.map(m => (
                <th key={m} className="text-center py-1.5 px-1 font-semibold text-muted-foreground w-12">{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fazendasParaTabela.length === 0 ? (
              <tr><td colSpan={13} className="py-4 text-center text-muted-foreground text-[11px]">Selecione uma fazenda ou visualize global.</td></tr>
            ) : fazendasParaTabela.map(f => (
              <tr key={f.id} className="border-b border-border/40 hover:bg-muted/20">
                <td className="py-1 px-2 font-medium truncate max-w-[160px]" title={f.nome}>{f.nome}</td>
                {Array.from({ length: 12 }, (_, i) => {
                  const m = i + 1;
                  const anoMes = `${anoNum}-${String(m).padStart(2, '0')}`;
                  const cel = heatmap.get(`${f.id}/${anoMes}`) ?? { p1: null, p2: null, p3: null };
                  return (
                    <td key={m} className="py-0.5 px-0.5 text-center" title={`${MESES[i]}/${anoNum} — P1 ${cel.p1 ?? '—'} · P2 ${cel.p2 ?? '—'} · P3 ${cel.p3 ?? '—'}`}>
                      <CelulaHeatmap {...cel} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pendencias.length > 0 && (
        <div className="space-y-2">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
            Pendências ativas ({pendencias.length})
          </p>
          <div className="space-y-1">
            {pendencias.slice(0, 20).map((p, i) => (
              <div key={i} className={cn(
                'flex items-center gap-2 text-[11px] px-2 py-1.5 rounded',
                p.status === 'provisorio'
                  ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300'
                  : 'bg-rose-50 dark:bg-rose-950/20 text-rose-800 dark:text-rose-300',
              )}>
                <span className="font-medium">{p.fazenda}</span>
                <span>·</span>
                <span>{p.mes}/{filtros.ano}</span>
                <span>·</span>
                <span>{p.pilar}</span>
                <span className="ml-auto font-semibold capitalize">{p.status}</span>
              </div>
            ))}
            {pendencias.length > 20 && (
              <p className="text-[10px] text-muted-foreground pl-2">+ {pendencias.length - 20} mais...</p>
            )}
          </div>
        </div>
      )}
      {!loading && pendencias.length === 0 && heatmap.size > 0 && (
        <div className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
          Nenhuma pendência ativa — todos os pilares com dados estão oficiais.
        </div>
      )}
    </div>
  );
};
