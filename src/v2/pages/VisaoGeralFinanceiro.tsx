/**
 * Financeiro › Visão Geral — FIN-VISAO-GERAL-01 PR 3 (SPEC `docs/specs/SPEC-analise-entradas-saidas.md` §3/§6/§7, decisões do AGRO em
 * `docs/specs/FIN-VISAO-GERAL-01-agro.md`, gabarito `docs/mocks/mock-entradas-saidas-v8.html`).
 *   · Ordem: barra azul (do shell; Contas · Fazenda · Atividade em `FiltrosBarraVG`) · filtros · card | gráfico · grade.
 *   · P83 — saldo de fluxo de caixa existe SÓ por conta: com fazenda ou atividade o banco não devolve saldo (`sem_saldo`) e a tela
 *     escreve o aviso no lugar dele; a Safra saiu da tela (caixa por safra fica no Painel da Safra / DRE).
 *   · Abre SEMPRE em Entradas × saídas, Ano (jan–dez), mês vigente.
 *   · CADA BLOCO TEM ALTURA FIXA (a grade de linhas do quadro é da janela, nunca do conteúdo): trocar modo, mês, contas, fazenda, safra,
 *     atividade ou período não move nada; lista longa rola dentro do próprio quadro.
 *   · RENDER-ONLY: todo número vem de `fn_vg_tela` (o banco). A tela escolhe o período (datas) e escreve.
 *   · Clique em total/grupo (card ou grade): neste PR só REGISTRA a intenção (`onAnalisar`) — o modal de análise é o PR 4.
 *   · P79 (Gabriel 23/10) — os chips de STATUS (o MESMO `ChipsDeStatus` da CPR: Previsto · Programado · Agendado, padrão os três; o
 *     realizado entra sempre) e o de VENCIDOS (padrão ligado, a regra da CPR) numa SEGUNDA linha fixa dos filtros; estado na URL
 *     (`vg_status`, `vg_venc`). A tela só repassa ao banco (`p_status`, `p_incluir_vencidos`) e escreve o que ele diz que usou.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Segmentado } from '@/components/ui/segmentado';
import { cn } from '@/lib/utils';
import { useCarregarFiltrosVG } from '@/components/financeiro-v2/visaoGeral/FiltrosBarraVG';
import { CardVG } from '@/components/financeiro-v2/visaoGeral/CardVG';
import { GraficoVG } from '@/components/financeiro-v2/visaoGeral/GraficoVG';
import { GradeVG } from '@/components/financeiro-v2/visaoGeral/GradeVG';
import { AmpliarVG } from '@/components/financeiro-v2/visaoGeral/AmpliarVG';
import { SeletorCriterioVG } from '@/components/financeiro-v2/visaoGeral/SeletorCriterioVG';
import { ChipsDeStatus, STATUS_INICIAIS, alternarNaLista, pilulasDosStatus } from '@/components/financeiro-v2/ChipsDeStatus';
import { useFiltroUrl } from '@/v2/hooks/useFiltroUrl';
import {
  COR, MESES_ABR, amDe, amHoje, anoDe, contarMeses, corSinal, faixaDoPeriodo, mil1, primeiroDia, rotuloMes, somarMeses, ultimoDia,
  dataCurta, escreverStatusVG, escreverVencidosVG, lerStatusVG, lerVencidosVG,
  type AlvoAnaliseVG, type CriterioTelaVG, type FaixaVG, type ModoVG, type TelaVG,
} from '@/lib/financeiro/visaoGeral';

/* as pílulas: os três status não realizados (o realizado entra sempre, sem pílula) e a dos vencidos */
const PILULAS_VG = [...pilulasDosStatus(STATUS_INICIAIS),
  { chave: 'vencidos', rotulo: 'Vencidos', title: 'O que venceu antes de hoje e não foi pago entra no mês corrente (a regra da Contas a Pagar e Receber)' }];

const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function VisaoGeralFinanceiro({ hoje = hojeLocal(), onAnalisar, inicial }: {
  hoje?: string; onAnalisar?: (a: AlvoAnaliseVG) => void;
  /** só a bancada/teste abrem noutro estado; o app abre SEMPRE em Entradas × saídas, Ano, mês vigente */
  inicial?: { modo?: ModoVG; faixa?: FaixaVG; de?: string; ate?: string; sel?: string };
}) {
  const { clienteAtual } = useCliente();
  const filtros = useCarregarFiltrosVG();
  const atual = amHoje(hoje);
  const [modo, setModo] = useState<ModoVG>(inicial?.modo ?? 'flx');
  const [sel, setSel] = useState(inicial?.sel ?? atual);
  const [faixa, setFaixa] = useState<FaixaVG>(inicial?.faixa ?? 'ano');
  const [per, setPer] = useState<[string, string]>([inicial?.de ?? somarMeses(atual, -9), inicial?.ate ?? somarMeses(atual, 2)]);
  const [de, ate] = faixaDoPeriodo(faixa, sel, per[0], per[1]);
  const [tela, setTela] = useState<TelaVG | null>(null);
  /* P90 — mês · média · acumulado: o card, a grade e os ampliados (a série vem do banco; trocar não pede nada de novo) */
  const [criterio, setCriterio] = useState<CriterioTelaVG>('mes');
  const [erro, setErro] = useState<string | null>(null);
  const [, setIntencao] = useState<AlvoAnaliseVG | null>(null);
  const clienteId = clienteAtual?.id ?? null;
  const contasChave = filtros.contas?.join(',') ?? '';
  const [status, setStatus] = useFiltroUrl<string[]>('vg_status', STATUS_INICIAIS, lerStatusVG, escreverStatusVG);
  const [vencidos, setVencidos] = useFiltroUrl<boolean>('vg_venc', true, lerVencidosVG, escreverVencidosVG);
  const alternar = (chave: string) => (chave === 'vencidos' ? setVencidos((v) => !v) : setStatus((a) => alternarNaLista(a, chave)));

  useEffect(() => {
    if (!clienteId) return;
    let vivo = true;
    (supabase.rpc as any)('fn_vg_tela', {
      p_cliente: clienteId, p_de: primeiroDia(de), p_ate: ultimoDia(ate), p_contas: filtros.contas,
      p_fazendas: filtros.fazenda ? [filtros.fazenda] : null, p_atividade: filtros.atividade, p_hoje: hoje,
      p_status: status, p_incluir_vencidos: vencidos,
    }).then(({ data, error }: { data: TelaVG | null; error: { message: string } | null }) => {
      if (!vivo) return;
      if (error) { setErro(error.message); return; }
      setErro(null);
      setTela(data);
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, de, ate, contasChave, filtros.fazenda, filtros.atividade, hoje, status.join(','), vencidos]);

  const analisar = (a: AlvoAnaliseVG) => { setIntencao(a); onAnalisar?.(a); };
  /* a tela só desenha o que o banco devolveu para ESTE período; enquanto o novo não chega, fica o anterior (nada pisca nem encolhe) */
  const pronta = tela && tela.meses.length > 0 ? tela : null;
  const ano = anoDe(sel);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#eef1f5] text-[11px]" data-testid="visao-geral">
      {/* FILTROS — cada controle com largura fixa; a linha quebra só pela largura da janela, nunca pelo estado */}
      <div className="flex min-h-[32px] shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-[#dfe4ea] bg-white px-3 py-1" data-testid="vg-filtros">
        <Segmentado altura={22} valor={modo} onEscolher={setModo} opcoes={[
          { valor: 'sai', rotulo: 'Saídas' }, { valor: 'ent', rotulo: 'Entradas' }, { valor: 'flx', rotulo: 'Entradas × saídas' }]} />
        <div className="flex h-[22px] shrink-0 items-center rounded border border-[#cfd6df] bg-white" data-desloca="">
          <button type="button" aria-label="Ano anterior" className="h-full w-[18px] text-muted-foreground" onClick={() => setSel(somarMeses(sel, -12))}>‹</button>
          <b className="w-[34px] text-center text-[11px] tabular-nums" data-testid="vg-ano">{ano}</b>
          <button type="button" aria-label="Próximo ano" className="h-full w-[18px] text-muted-foreground" onClick={() => setSel(somarMeses(sel, 12))}>›</button>
        </div>
        <div className="flex shrink-0 gap-0.5">
          {MESES_ABR.map((m, i) => {
            const am = amDe(ano, i);
            return (
              <button key={m} type="button" data-testid={`vg-mes-${i + 1}`} onClick={() => setSel(am)} title={`${rotuloMes(am)}${am > atual ? ' · previsto' : ''}`}
                className={cn('h-[20px] w-[29px] rounded border text-center text-[10px]', am === sel ? 'border-[#1f3f66] bg-[#e8eef7] font-semibold text-[#1b2430]' : 'border-[#e3e7ec] bg-white text-[#5b6878]',
                  am > atual && 'border-dashed')}>{m}</button>
            );
          })}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Segmentado altura={22} valor={faixa === 'per' ? ('' as FaixaVG) : faixa} onEscolher={setFaixa} opcoes={[
            { valor: 'ano', rotulo: 'Ano', title: 'jan a dez do ano do mês escolhido' }, { valor: 'u12', rotulo: 'Últ. 12', title: '12 meses até o mês escolhido' },
            { valor: '66', rotulo: '6 + 6', title: '6 meses antes e 6 depois do mês escolhido' }]} />
          <SeletorPeriodo de={de} ate={ate} atual={atual} ativo={faixa === 'per'} onEscolher={(d, a) => { setPer([d, a]); setFaixa('per'); if (sel < d || sel > a) setSel(a < atual ? a : d > atual ? d : atual); }} />
        </div>
      </div>

      {/* P79 — a SEGUNDA linha dos filtros, de altura fixa: as pílulas e, ao lado, o que ficou de fora (pelo eco do banco) */}
      <div className="flex h-[26px] shrink-0 items-center gap-1.5 border-b border-[#dfe4ea] bg-white px-3" data-testid="vg-status-linha">
        <span className="shrink-0 text-[10px] text-muted-foreground">Realizado sempre entra ·</span>
        <ChipsDeStatus testId="vg-status" pilulas={PILULAS_VG} ligados={vencidos ? [...status, 'vencidos'] : status} onAlternar={alternar} />
        <span className="uma-linha-que-rola min-w-0 flex-1 text-[10px] text-amber-700" data-testid="vg-status-aviso" data-desloca-livre="">
          {pronta ? avisoDoFiltro(pronta, hoje) : ''}
        </span>
        <SeletorCriterioVG valor={criterio} onEscolher={setCriterio} />
      </div>

      {/* QUADROS — linhas da grade do quadro pela janela (nunca pelo conteúdo) */}
      <div className="grid min-h-0 flex-1 gap-2 p-2" style={{ gridTemplateRows: 'minmax(200px, 0.9fr) minmax(150px, 1fr)' }}>
        <div className="grid min-h-0 gap-2" style={{ gridTemplateColumns: 'clamp(430px, 43%, 560px) minmax(0, 1fr)' }}>
          <section className="min-h-0 overflow-hidden rounded-md border border-[#dfe4ea] bg-white px-2.5 py-[7px]" data-testid="vg-card" data-desloca="">
            <div className="h-full" data-desloca-livre="">
              {pronta ? <CardVG tela={pronta} modo={modo} sel={sel} onAnalisar={analisar} criterio={criterio}
                acao={<AmpliarVG titulo={`${modo === 'flx' ? 'Entradas e saídas' : modo === 'sai' ? 'Saídas por grupo' : 'Entradas por grupo'} · ${rotuloMes(sel)}`} testid="card" largura="w-[min(640px,96vw)]"
                  extra={<SeletorCriterioVG valor={criterio} onEscolher={setCriterio} testid="vg-criterio-ampliado-card" />}>
                  {() => <CardVG tela={pronta} modo={modo} sel={sel} onAnalisar={analisar} ampliado criterio={criterio} />}</AmpliarVG>} /> : <Estado erro={erro} />}
            </div>
          </section>
          <section className="flex min-h-0 min-w-0 flex-col rounded-md border border-[#dfe4ea] bg-white pb-1 pl-2.5 pr-2 pt-[7px]" data-testid="vg-grafico" data-desloca="">
            <div className="flex h-[17px] shrink-0 items-baseline justify-between gap-2" data-desloca-livre="">
              {/* P83 — abaixo de lg o "por mês" e o "previsto" da legenda saem: o botão "ampliar" cabe no bloco (1000px: 392px de largura) */}
              <span className="whitespace-nowrap text-[11.5px] font-bold">{modo === 'flx' ? 'Entradas × saídas' : modo === 'sai' ? 'Saídas totais' : 'Entradas totais'}<span className="hidden lg:inline"> por mês</span></span>
              <span className="flex min-w-0 items-center gap-1.5">
                <Legenda modo={modo} tela={pronta} sel={sel} />
                {pronta && <AmpliarVG titulo={modo === 'flx' ? 'Entradas × saídas por mês' : modo === 'sai' ? 'Saídas totais por mês' : 'Entradas totais por mês'} testid="grafico">
                  {() => <div className="flex h-[70vh] min-h-0 flex-col"><GraficoVG tela={pronta} modo={modo} sel={sel} onSel={setSel} /></div>}</AmpliarVG>}
              </span>
            </div>
            <div className="mt-[3px] flex min-h-0 flex-1 flex-col" data-desloca-livre="">
              {pronta && <GraficoVG tela={pronta} modo={modo} sel={sel} onSel={setSel} />}
            </div>
          </section>
        </div>
        <section className="min-h-0 overflow-hidden rounded-md border border-[#dfe4ea] bg-white" data-testid="vg-grade" data-desloca="">
          <div className="h-full" data-desloca-livre="">
            {pronta ? <GradeVG tela={pronta} sel={sel} onAnalisar={analisar} criterio={criterio}
              acao={<AmpliarVG titulo="Entradas e saídas · grade" testid="grade" corpo="px-3"
                extra={<SeletorCriterioVG valor={criterio} onEscolher={setCriterio} testid="vg-criterio-ampliado-grade" />}>
                {() => <GradeVG tela={pronta} sel={sel} onAnalisar={analisar} ampliado criterio={criterio} />}</AmpliarVG>} />
              : <Estado erro={erro} />}
          </div>
        </section>
      </div>
    </div>
  );
}

/** o que ficou FORA das somas, pelo que o banco diz que usou (o eco), nunca pelo estado da tela */
export function avisoDoFiltro(tela: TelaVG, hoje: string): string {
  const partes: string[] = [];
  if (tela.status && tela.status.length === 0) partes.push('só o realizado nas somas');
  else if (tela.status && tela.status.length < 3) partes.push(`dos não realizados, só ${tela.status.join(' e ')}`);
  if (tela.incluir_vencidos === false) partes.push(`vencidos antes de ${dataCurta(hoje)} fora das somas e do saldo`);
  return partes.join(' · ');
}

const Estado = ({ erro }: { erro: string | null }) => (
  <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">{erro ? `Não foi possível carregar: ${erro}` : 'Carregando…'}</div>
);

function Legenda({ modo, tela, sel }: { modo: ModoVG; tela: TelaVG | null; sel: string }) {
  const k = tela?.meses.findIndex((m) => m.am === sel) ?? -1;
  const sf = k >= 0 ? tela?.linhas.find((l) => l.chave === 'saldo_final')?.valores[k] ?? null : null;
  const i = (estilo: CSSProperties) => <i className="mr-[3px] inline-block align-middle" style={estilo} />;
  return modo === 'flx' ? (
    <div className="flex items-center gap-[9px] whitespace-nowrap text-[8.5px] text-[#3a4655]">
      <span>{i({ width: 8, height: 8, background: COR.barraEnt })}entradas</span>
      <span>{i({ width: 8, height: 8, background: COR.barraSai })}saídas</span>
      {/* P90 — o previsto: a coluna clara e a linha do saldo laranja pontilhada */}
      <span className="hidden lg:inline">{i({ width: 8, height: 8, background: COR.barraSaiP })}{i({ width: 9, borderTop: `2px dotted ${COR.previsto}` })}previsto</span>
      {/* P83 — sem contas no recorte não há saldo: o lugar da legenda do saldo fica, com o aviso curto */}
      {tela?.sem_saldo ? (
        <span className="inline-block w-[93px] text-[#a05a00]" title="Saldo existe só por conta — escolha contas para ver o saldo" data-testid="legenda-sem-saldo">saldo só por conta</span>
      ) : (
      <span className="inline-block w-[93px]" title={`Saldo final de ${rotuloMes(sel)}`}>{i({ width: 14, borderTop: `2px solid ${COR.saldo}` })}saldo{' '}
        <b className="inline-block w-[58px] tabular-nums" style={{ color: corSinal(sf) }} data-testid="legenda-saldo">{mil1(sf)} mil</b></span>
      )}
    </div>
  ) : (
    <div className="flex items-center gap-[9px] whitespace-nowrap text-[8.5px] text-[#3a4655]">
      <span>{i({ width: 8, height: 8, background: modo === 'ent' ? COR.barraEnt : COR.barraSai })}realizado</span>
      <span>{i({ width: 8, height: 8, background: modo === 'ent' ? COR.barraEntP : COR.barraSaiP })}previsto</span>
      <span>{i({ width: 14, borderTop: `2px solid ${modo === 'ent' ? COR.mediaEnt : COR.mediaSai}` })}média acumulada</span>
      <span>{i({ width: 14, borderTop: `2px dotted ${COR.meta}` })}meta</span>
    </div>
  );
}

/** o período De → Até: quadro com ‹ano› e grade de meses (nunca lista longa) — SPEC §3.2 */
function SeletorPeriodo({ de, ate, atual, ativo, onEscolher }: { de: string; ate: string; atual: string; ativo: boolean; onEscolher: (de: string, ate: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [anoDe_, setAnoDe] = useState(anoDe(de));
  const [anoAte, setAnoAte] = useState(anoDe(ate));
  useEffect(() => { if (aberto) { setAnoDe(anoDe(de)); setAnoAte(anoDe(ate)); } }, [aberto, de, ate]);
  const escolher = (campo: 'de' | 'ate', am: string) => {
    let d = campo === 'de' ? am : de, a = campo === 'ate' ? am : ate;
    if (d > a) [d, a] = [a, d];
    if (contarMeses(d, a) > 36) return;
    onEscolher(d, a);
  };
  const painel = (rot: string, campo: 'de' | 'ate', a: number, setA: (n: number) => void) => (
    <div className="w-[168px]">
      <div className="mb-[5px] flex items-center justify-between">
        <small className="text-[8.5px] font-semibold tracking-wide text-muted-foreground">{rot}</small>
        <div className="flex items-center gap-0.5">
          <button type="button" aria-label="Ano anterior" className="h-5 w-5 rounded-sm border border-[#e3e7ec]" onClick={() => setA(a - 1)}>‹</button>
          <b className="w-9 text-center tabular-nums">{a}</b>
          <button type="button" aria-label="Próximo ano" className="h-5 w-5 rounded-sm border border-[#e3e7ec]" onClick={() => setA(a + 1)}>›</button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-[3px]">
        {MESES_ABR.map((m, i) => {
          const am = amDe(a, i);
          const on = campo === 'de' ? am === de : am === ate;
          const dentro = am > de && am < ate;
          return (
            <button key={m} type="button" onClick={() => escolher(campo, am)}
              className={cn('h-[22px] rounded-sm border text-[10px]', on ? 'border-[#1b2430] bg-[#1b2430] text-white' : dentro ? 'border-[#c8d6ea] bg-[#e8eef7]' : 'border-[#e3e7ec] bg-white',
                am > atual && 'border-dashed')}>{m}</button>
          );
        })}
      </div>
    </div>
  );
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" data-testid="vg-periodo"
          className={cn('flex h-[22px] w-[128px] shrink-0 items-center justify-between gap-1.5 rounded border bg-white px-2 text-left text-[10px]',
            ativo ? 'border-[#1f3f66] font-semibold' : 'border-[#cfd6df]')}>
          <span className="tabular-nums">{rotuloMes(de)} → {rotuloMes(ate)}</span><ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-2 text-[10px]">
        <div className="flex gap-3">{painel('DE', 'de', anoDe_, setAnoDe)}{painel('ATÉ', 'ate', anoAte, setAnoAte)}</div>
        <div className="mt-[7px] flex items-center justify-between text-[9px] text-muted-foreground">
          <span>{contarMeses(de, ate)} meses · tracejado = previsto · até 36</span>
          <button type="button" className="rounded border border-[#cfd6df] px-2 py-0.5" onClick={() => setAberto(false)}>OK</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
