/**
 * V2PainelConsultor — Painel Consultor / Auditoria
 * Ambiente /v2 · Fase 2
 *
 * Hooks (somente leitura, zero modificação):
 *   useStatusPilares      · useRebanhoOficial · useAuditoriaDesfrutes · useValorRebanho
 *
 * NÃO usa: useLancamentos · useResumoStatus · useIndicadoresZootecnicos · useAnaliseTrimestral
 * Zero cálculo no componente.
 */
import { useMemo } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { useStatusPilares, type StatusPilares } from '@/hooks/useStatusPilares';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { useAuditoriaDesfrutes } from '@/hooks/useAuditoriaDesfrutes';
import { useValorRebanho } from '@/hooks/useValorRebanho';
import { AuditoriaRebanhoTable } from '@/v2/components/auditoria/AuditoriaRebanhoTable';
import { FazendaMesCard } from '@/v2/components/auditoria/FazendaMesCard';
import { cn } from '@/lib/utils';

type Trimestre = 1 | 2 | 3 | 4;

function fmt(n: number | null | undefined, dec = 0): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtR(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function mesParaTrimestre(mes: number): Trimestre {
  if (mes <= 3) return 1; if (mes <= 6) return 2; if (mes <= 9) return 3; return 4;
}

type PilarKey = keyof StatusPilares;
const PILARES: { key: PilarKey; label: string }[] = [
  { key: 'p1_mapa_pastos',           label: 'P1 Pastos'      },
  { key: 'p2_valor_rebanho',         label: 'P2 Valor'       },
  { key: 'p3_financeiro_caixa',      label: 'P3 Caixa'       },
  { key: 'p4_competencia',           label: 'P4 Competência' },
  { key: 'p5_economico_consolidado', label: 'P5 Econômico'   },
];
const PILAR_CLS: Record<string, string> = {
  oficial:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  provisorio: 'bg-amber-50   text-amber-700   border-amber-200',
  bloqueado:  'bg-red-50     text-red-700     border-red-200',
};
const PILAR_ICON: Record<string, string> = { oficial: '🟢', provisorio: '🟡', bloqueado: '🔴' };

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
      {children}
    </p>
  );
}
function Unavailable({ label }: { label: string }) {
  return (
    <p className="text-xs text-muted-foreground/60 italic py-1">
      {label} — não disponível nesta fase · exige fonte oficial futura
    </p>
  );
}
function MetaBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-[3px] border-amber-500 bg-amber-50 px-3 py-2.5 rounded-r mt-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-200 px-1.5 py-0.5 rounded">META</span>
        <span className="text-[10px] text-amber-600">somente leitura</span>
      </div>
      <div className="text-xs text-amber-800 space-y-0.5">{children}</div>
    </div>
  );
}

export function V2PainelConsultor({ ano, mes }: { ano: string; mes: string }) {
  const { clienteAtual } = useCliente();
  const { fazendaAtual, isGlobal } = useFazenda();

  const anoNum     = parseInt(ano);
  const mesNum     = parseInt(mes);
  const mesEfetivo = mesNum === 0 ? 12 : mesNum;
  const trimestre: Trimestre = useMemo(() => mesParaTrimestre(mesEfetivo), [mesEfetivo]);
  const anoMes = `${ano}-${String(mesEfetivo).padStart(2, '0')}`;

  const { data: pilares, loading: loadingPilares } = useStatusPilares(
    isGlobal ? undefined : fazendaAtual?.id,
    anoMes,
  );
  const rebanhoReal = useRebanhoOficial({ ano: anoNum, cenario: 'realizado' });
  const rebanhoMeta = useRebanhoOficial({ ano: anoNum, cenario: 'meta' });
  const { data: desfrutes, isLoading: loadingDesfrutes } = useAuditoriaDesfrutes({
    clienteId: clienteAtual?.id,
    ano: anoNum,
    trimestre,
  });
  const { precos, isFechado: p2Fechado } = useValorRebanho(anoMes);

  // leitura via API do hook — zero cálculo novo
  const saldoFinalReal    = rebanhoReal.getSaldoFinalTotal?.(anoNum, mesEfetivo) ?? null;
  const saldoFinalMeta    = rebanhoMeta.getSaldoFinalTotal?.(anoNum, mesEfetivo) ?? null;
  const categoriasDetalhe = rebanhoReal.getCategoriasDetalhe?.(mesEfetivo) ?? [];
  const fazendaMes        = rebanhoReal.getFazendaMes?.(mesEfetivo) ?? null;
  const desfrutesAcum     = desfrutes?.realizado?.desfrutes?.acum;
  const metaDesfrutesAcum = desfrutes?.meta?.desfrutes?.acum;

  return (
    <div className="space-y-8 px-4 py-4">

      {/* Contexto */}
      <div>
        <h2 className="text-base font-semibold text-foreground">Painel Consultor · Auditoria</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isGlobal ? 'Todas as fazendas' : (fazendaAtual?.nome ?? '—')}
          {' · '}{ano}{mes !== '0' ? `/${mes.padStart(2, '0')}` : ''}
          {' · '}T{trimestre}
        </p>
      </div>

      {/* ── 1. PILARES ────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Status dos Pilares de Fechamento</SectionTitle>
        {isGlobal ? (
          <Unavailable label="Pilares disponíveis somente por fazenda específica" />
        ) : loadingPilares ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : pilares ? (
          <div className="flex flex-wrap gap-2">
            {PILARES.map(({ key, label }) => {
              const status = pilares[key]?.status ?? 'provisorio';
              return (
                <div key={key} className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium',
                  PILAR_CLS[status] ?? PILAR_CLS.provisorio,
                )}>
                  <span>{PILAR_ICON[status]}</span>
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <Unavailable label="Pilares" />
        )}
      </div>

      {/* ── 2. TABELA MOVIMENTAÇÃO OFICIAL POR CATEGORIA ──────────────── */}
      <div>
        <SectionTitle>Movimentação Oficial por Categoria</SectionTitle>
        <AuditoriaRebanhoTable
          categorias={categoriasDetalhe}
          loading={rebanhoReal.loading}
        />
      </div>

      {/* ── 3. TOTAIS DA FAZENDA + PRODUÇÃO BIOLÓGICA ─────────────────── */}
      <div>
        <SectionTitle>Totais da Fazenda no Mês</SectionTitle>
        <FazendaMesCard
          fazendaMes={fazendaMes}
          categorias={categoriasDetalhe}
          loading={rebanhoReal.loading}
        />
      </div>

      {/* ── Preços P2 ─────────────────────────────────────────────────── */}
      {precos.length > 0 && (
        <div>
          <SectionTitle>
            Preços por Categoria — P2 {p2Fechado ? '🟢 Fechado' : '🟡 Aberto'}
          </SectionTitle>
          <div className="flex flex-wrap gap-x-6 gap-y-0.5 text-xs text-muted-foreground">
            {precos.map(p => (
              <span key={p.categoria}>{p.categoria}: {fmtR(p.preco_kg)}/kg</span>
            ))}
          </div>
        </div>
      )}

      {/* ── META rebanho ──────────────────────────────────────────────── */}
      <MetaBlock>
        <p>Rebanho Meta: <strong>{fmt(saldoFinalMeta)} cab</strong>{' · '}Realizado: <strong>{fmt(saldoFinalReal)} cab</strong></p>
        <p className="text-[10px] text-amber-600 mt-0.5">
          Desvio — não disponível nesta fase · exige fonte oficial futura
        </p>
      </MetaBlock>

      {/* ── 4. DESFRUTES DO TRIMESTRE ─────────────────────────────────── */}
      <div>
        <SectionTitle>Desfrutes — T{trimestre}/{ano}</SectionTitle>
        {loadingDesfrutes ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : desfrutes ? (
          <>
            <p className="text-[10px] text-muted-foreground/60 italic mb-2">
              Leitura da fonte oficial. Esta versão não recalcula saldos nem valida divergências automaticamente.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold pr-4">Tipo</th>
                    {desfrutes.meses.map(m => (
                      <th key={m} className="text-right py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold px-3">
                        {new Date(anoNum, m - 1).toLocaleString('pt-BR', { month: 'short' })}
                      </th>
                    ))}
                    <th className="text-right py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold pl-3">Acum</th>
                  </tr>
                </thead>
                <tbody>
                  {(['abate', 'venda', 'consumo'] as const).map(tipo => {
                    const r = desfrutes.realizado[tipo];
                    const label = { abate: 'Abates', venda: 'Vendas', consumo: 'Consumo' }[tipo];
                    return (
                      <tr key={tipo} className="border-b border-border/40">
                        <td className="py-1.5 pr-4 text-muted-foreground">{label}</td>
                        {([0, 1, 2] as const).map(i => (
                          <td key={i} className="py-1.5 text-right px-3 tabular-nums">{fmt(r.cabecas[i])} cab</td>
                        ))}
                        <td className="py-1.5 text-right pl-3 tabular-nums font-medium">{fmt(r.acum.cabecas)} cab</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="py-1.5 pr-4 text-muted-foreground font-medium">Preço/@</td>
                    {([0, 1, 2] as const).map(i => (
                      <td key={i} className="py-1.5 text-right px-3 tabular-nums">{fmtR(desfrutes.realizado.desfrutes.precoArroba[i])}</td>
                    ))}
                    <td className="py-1.5 text-right pl-3 tabular-nums">{fmtR(desfrutesAcum?.precoArroba)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <MetaBlock>
              <p>Desfrutes Meta: <strong>{fmt(metaDesfrutesAcum?.cabecas)} cab</strong>{' · '}Realizado: <strong>{fmt(desfrutesAcum?.cabecas)} cab</strong></p>
              <p className="text-[10px] text-amber-600 mt-0.5">Desvio — não disponível nesta fase · exige fonte oficial futura</p>
            </MetaBlock>
          </>
        ) : (
          <Unavailable label="Desfrutes" />
        )}
      </div>

      {/* ── HISTÓRICO 6 ANOS ──────────────────────────────────────────── */}
      <div>
        <SectionTitle>Histórico de Desfrutes — 6 Anos</SectionTitle>
        {loadingDesfrutes ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : desfrutes?.historico?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  {['Ano','Cabeças','Peso Méd.','Arrobas','Preço/@','Fat. Pec.'].map(h => (
                    <th key={h} className="text-right first:text-left py-1.5 px-2 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {desfrutes.historico.map(h => (
                  <tr key={h.ano} className={cn('border-b border-border/40', h.ano === anoNum && 'bg-primary/5 font-medium')}>
                    <td className="py-1.5 px-2 tabular-nums">{h.ano}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmt(h.cabecas)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmt(h.pesoMedioCab, 1)} kg</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmt(h.arrobas, 1)} @</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmtR(h.precoArroba)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmtR(h.faturamentoReceitaPec)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Unavailable label="Histórico" />
        )}
      </div>

      {/* ── DADOS NÃO DISPONÍVEIS ─────────────────────────────────────── */}
      <div>
        <SectionTitle>Dados não disponíveis nesta fase</SectionTitle>
        <div className="space-y-1 text-xs text-muted-foreground/60 italic">
          <p>• Caixa atual / resultado financeiro — exige useResumoStatus (requer lancamentos)</p>
          <p>• KPIs comparativos MoM/YoY — exige useIndicadoresZootecnicos (requer lancamentos)</p>
          <p>• Divergência SI mês N vs SF mês N-1 — exige hook oficial futuro</p>
          <p>• Realizado vs META por categoria — exige hook oficial futuro</p>
          <p>• Alertas automáticos de inconsistência — exige hook oficial futuro</p>
          <p>• Endividamento total — exige hook oficial futuro</p>
        </div>
      </div>

      {/* Banner */}
      <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs text-primary">
        <strong>/v2 · Fase 2 · Painel Consultor.</strong>{' '}
        Hooks: useStatusPilares · useRebanhoOficial · useAuditoriaDesfrutes · useValorRebanho.
        App original em <code>/</code> intacto.
      </div>
    </div>
  );
}
