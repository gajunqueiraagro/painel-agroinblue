/**
 * PRODUÇÃO › CHUVAS (ANÁLISE) — CHUVAS-ANALISE-01 F1 (mock aprovado `ui-validar/chuvas-analise.html`, Gabriel 12/11 14:20).
 * Duas visões: "Todas as fazendas" (filtro em Global) e "Uma fazenda". A F1 usa o dado de hoje — 1 leitura por fazenda por dia
 * (sem medidor): o bloco "Por medidor", o seletor de medidor e o card "Lançamento atrasado" são da F2.
 *
 * ⚠ FONTE ÚNICA: as leituras vêm do `useChuvas` do `ChuvasTab` (o mesmo da tela de lançar); a análise só LÊ e calcula na hora
 * (`analiseChuvas.ts`). O clique no dia grava pelo MESMO `salvarChuva`/`removerChuva`.
 * ⚠ DIA SEM LANÇAMENTO ≠ ZERO: ver o cabeçalho de `analiseChuvas.ts`.
 */
import { useMemo, useState } from 'react';
import {
  Area, Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, XAxis, YAxis, Cell,
} from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Segmentado } from '@/components/ui/segmentado';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { TH_REGUA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { useLarguraDaJanela } from '@/hooks/useLarguraDaJanela';
import type { Chuva } from '@/hooks/useChuvas';
import {
  acumulado, chuvaPorMes, chuvasFortes, intervalosEntreChuvas, datasDoPeriodo, degrau, diaADia, diasComChuva, diasEntre, diferencaNoDiaDoAno, fraseDiaDoAno, inicioDasChuvas,
  maiorChuva, maiorSecaSemChuva, mediaAteAMesmaData, mediaPorMes, mesesDoPeriodo, mesesExtremos, mesmaJanelaAntes, nomeMes,
  pctDe, periodosDeHistorico, rotuloPeriodo, situacao, somaMm, ultimaChuva, veranicos, ROTULO_SITUACAO,
  type Degrau, type Intervalo, type Leitura, type ModoPeriodo, type Periodo, type Situacao,
} from '@/lib/chuvas/analiseChuvas';

export interface FazendaDaAnalise { id: string; nome: string; codigo?: string | null }

const AZUL = '#24508f'; const AZUL_CLARO = '#7fa6d9'; const CINZA = '#c9d1dc'; const PRETO = '#111827';
const COR_SIT: Record<Situacao, string> = { abaixo: 'bg-[#fdecec] text-[#b91c1c]', dentro: 'bg-[#e3f4e8] text-[#15803d]', acima: 'bg-[#e7f0fb] text-[#24508f]' };
const COR_DEGRAU: Record<Degrau, string> = {
  'muito-abaixo': '#f6b8b8', abaixo: '#fbe0bf', dentro: '#f3f4f6', acima: '#d6e4f6', 'muito-acima': '#9dbde6',
};

/** dd/mm/aaaa (a data da casa). */
export const dataBR = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const mm = (n: number | null | undefined) => (n == null ? '—' : formatNum(n, 1));
const pct = (n: number | null) => (n == null ? '—' : `${formatNum(n, 0)}%`);
const sinal = (n: number | null) => (n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatNum(Math.abs(n), 1)}`);
const codigoDe = (f: FazendaDaAnalise) => f.codigo || f.nome;
const pctSinal = (n: number | null) => (n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatNum(Math.abs(n), 0)}%`);

/** O período e a data de corte (o fim do mês escolhido, nunca depois de hoje). */
interface Recorte { periodo: Periodo; mesAte: string; ate: string }
function recorteDe(periodo: Periodo, mesAte: string, hoje: string): Recorte {
  const fimMes = datasDoPeriodo({ modo: 'civil', ano: Number(mesAte.slice(0, 4)) }).ate.slice(0, 4) + mesAte.slice(4)
    + '-' + String(new Date(Date.UTC(Number(mesAte.slice(0, 4)), Number(mesAte.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0');
  return { periodo, mesAte, ate: fimMes > hoje ? hoje : fimMes };
}

/** O que a análise de UMA fazenda precisa, calculado uma vez. */
export interface Resumo {
  leituras: Leitura[]; hist: Periodo[]; lancadoAte: string | null;
  porMes: (number | null)[]; media: (number | null)[]; anterior: (number | null)[];
  acumulado: number; mediaAcum: number | null; pctAcum: number | null; situacao: Situacao | null;
  acumAnterior: number | null; diasChuva: number; diasChuvaAnterior: number | null;
  ultima: Leitura | null; diasDesdeUltima: number | null; maior: Leitura | null;
  /** o maior intervalo ENTRE CHUVAS LANÇADAS no período (D-A) */
  maiorIntervalo: Intervalo | null;
  /** Δ% do acumulado contra o mesmo período do ano anterior; `null` sem ele */
  dPctAnterior: number | null;
}
export function resumir(ls: Leitura[], r: Recorte): Resumo {
  const { periodo: p, ate } = r;
  const dentro = ls.filter(l => l.data <= ate);
  const lancadoAte = dentro.reduce<string | null>((a, l) => (a == null || l.data > a ? l.data : a), null);
  const hist = periodosDeHistorico(ls, p);
  const de = datasDoPeriodo(p).de;
  const ant = mesmaJanelaAntes(p, ate);
  const temAnterior = ls.some(l => l.data <= datasDoPeriodo({ modo: p.modo, ano: p.ano - 1 }).ate) && ls.some(l => l.data < de);
  const acum = somaMm(ls, de, ate);
  const mediaAcum = mediaAteAMesmaData(ls, p, hist, ate);
  const pa = pctDe(acum, mediaAcum);
  const ultima = ultimaChuva(ls, ate);
  const qAnt = { modo: p.modo, ano: p.ano - 1 };
  return {
    leituras: ls, hist, lancadoAte,
    porMes: chuvaPorMes(ls, p, lancadoAte),
    media: mediaPorMes(ls, hist),
    anterior: temAnterior ? chuvaPorMes(ls, qAnt, datasDoPeriodo(qAnt).ate) : Array.from({ length: 12 }, () => null),
    acumulado: acum, mediaAcum, pctAcum: pa, situacao: situacao(pa),
    acumAnterior: temAnterior ? somaMm(ls, ant.de, ant.ate) : null,
    diasChuva: diasComChuva(ls, de, ate), diasChuvaAnterior: temAnterior ? diasComChuva(ls, ant.de, ant.ate) : null,
    ultima, diasDesdeUltima: ultima ? diasEntre(ultima.data, ate) : null, maior: maiorChuva(ls, de, ate),
    maiorIntervalo: intervalosEntreChuvas(ls, de, ate).reduce<Intervalo | null>((a, b) => (a == null || b.dias > a.dias ? b : a), null),
    dPctAnterior: (() => { const x = temAnterior ? pctDe(acum, somaMm(ls, ant.de, ant.ate)) : null; return x == null ? null : x - 100; })(),
  };
}

const leiturasDe = (chuvas: readonly Chuva[], fazendaId: string): Leitura[] =>
  chuvas.filter(c => c.fazendaId === fazendaId).map(c => ({ data: c.data, mm: c.milimetros }));

export function ChuvasAnalise({
  chuvas, fazendas, isGlobal, fazendaAtualId, fazendaEscolhida, onEscolherFazenda, salvarChuva, removerChuva, onLancar,
  hoje = hojeLocal(),
}: {
  chuvas: readonly Chuva[];
  fazendas: readonly FazendaDaAnalise[];
  isGlobal: boolean;
  fazendaAtualId: string | null;
  /** Em Global, a fazenda aberta pelo clique na tabela (a mesma escolha do `ChuvasTab`). */
  fazendaEscolhida: string | null;
  onEscolherFazenda: (id: string | null) => void;
  salvarChuva: (data: string, milimetros: number) => Promise<void>;
  removerChuva: (id: string) => Promise<void>;
  /** "Ver lançamentos" / "+ Lançar chuva": vai para a planilha de lançar. Sem ele os botões não aparecem. */
  onLancar?: () => void;
  hoje?: string;
}) {
  const anoHoje = Number(hoje.slice(0, 4)); const mesHoje = Number(hoje.slice(5, 7));
  /* P1: abre em ANO CIVIL; o botão troca para o ano-safra (jul–jun) */
  const [modo, setModo] = useState<ModoPeriodo>('civil');
  const [ano, setAno] = useState(anoHoje);
  const [mesAte, setMesAte] = useState(hoje.slice(0, 7));
  const periodo: Periodo = { modo, ano };
  const meses = mesesDoPeriodo(periodo);
  /* o mês de corte fica dentro do período; trocar de período leva ao último mês (ou ao de hoje, no período de hoje) */
  const mesOk = meses.includes(mesAte) ? mesAte : (meses.includes(hoje.slice(0, 7)) ? hoje.slice(0, 7) : meses[11]);
  const recorte = recorteDe(periodo, mesOk, hoje);
  const trocarModo = (m: ModoPeriodo) => {
    setModo(m);
    setAno(m === 'safra' ? (mesHoje >= 7 ? anoHoje : anoHoje - 1) : anoHoje);
    setMesAte(hoje.slice(0, 7));
  };
  const anos = Array.from({ length: 6 }, (_, i) => anoHoje - i);

  const todas = isGlobal && !fazendaEscolhida;
  const idUma = isGlobal ? fazendaEscolhida : fazendaAtualId;
  const fazUma = fazendas.find(f => f.id === idUma) ?? null;
  const titulo = `${todas ? 'Todas as fazendas' : (fazUma?.nome ?? '—')} — ${nomeMes(meses[0], false)} a ${nomeMes(mesOk, true)}${modo === 'safra' ? ` · ${rotuloPeriodo(periodo)}` : ''}`;

  return (
    <div className="flex flex-col" data-testid="chuvas-analise">
      <div className="sticky top-0 z-20 flex h-[34px] flex-none items-center gap-2 border-b border-[#D9DEE5] bg-background px-2.5" data-testid="chuvas-analise-barra">
        <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
          <SelectTrigger className="h-[24px] w-[84px] text-[11px] font-semibold" data-testid="chuvas-analise-ano"><SelectValue /></SelectTrigger>
          <SelectContent>{anos.map(a => <SelectItem key={a} value={String(a)}>{rotuloPeriodo({ modo, ano: a })}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={mesOk} onValueChange={setMesAte}>
          <SelectTrigger className="h-[24px] w-[76px] text-[11px]" data-testid="chuvas-analise-mes"><SelectValue /></SelectTrigger>
          <SelectContent>{meses.map(m => <SelectItem key={m} value={m}>{nomeMes(m, true)}</SelectItem>)}</SelectContent>
        </Select>
        <Segmentado valor={modo} onEscolher={trocarModo} altura={24}
          opcoes={[{ valor: 'civil', rotulo: 'Ano civil' }, { valor: 'safra', rotulo: 'Ano-safra jul–jun' }]} />
        {isGlobal && fazendaEscolhida && (
          <button type="button" onClick={() => onEscolherFazenda(null)} className="whitespace-nowrap text-[11px] text-primary hover:underline">
            ‹ Todas as fazendas
          </button>
        )}
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold" title={titulo} data-testid="chuvas-analise-titulo">{titulo}</span>
        {onLancar && (
          <div className="flex flex-none gap-1.5">
            {!todas && <Button size="sm" variant="outline" className="h-[24px] px-2 text-[11px]" onClick={onLancar}>Ver lançamentos</Button>}
            <Button size="sm" className="h-[24px] px-2 text-[11px]" onClick={onLancar}>+ Lançar chuva</Button>
          </div>
        )}
      </div>
      <div className="grid gap-2 bg-muted/30 p-2 pb-20">
        {todas
          ? <VisaoTodas chuvas={chuvas} fazendas={fazendas} recorte={recorte} onAbrir={onEscolherFazenda} />
          : fazUma
            ? <VisaoUma chuvas={chuvas} fazenda={fazUma} recorte={recorte} salvarChuva={salvarChuva} removerChuva={removerChuva} />
            : <div className="p-6 text-center text-[11px] text-muted-foreground">Escolha uma fazenda.</div>}
      </div>
    </div>
  );
}

/* ───────────────────────────── blocos comuns ───────────────────────────── */

function Bloco({ titulo, nota, children, testid, className }: { titulo: string; nota?: string; children: React.ReactNode; testid?: string; className?: string }) {
  return (
    <section className={cn('min-w-0 rounded-[7px] border border-[#d9dee6] bg-card px-2.5 py-1.5', className)} data-testid={testid}>
      <div className="mb-1.5 flex items-baseline gap-2 border-b border-[#eef0f3] pb-1">
        <h3 className="whitespace-nowrap text-[12px] font-semibold">{titulo}</h3>
        {nota && <span className="ml-auto min-w-0 text-right text-[10px] text-muted-foreground">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

function Cards({ itens, testid }: { itens: { rotulo: string; valor: React.ReactNode; unidade?: string; sub?: React.ReactNode; cor?: string; id: string }[]; testid: string }) {
  return (
    <div className="grid grid-cols-3 rounded-[7px] border border-[#d9dee6] bg-card min-[1200px]:grid-cols-6" data-testid={testid}>
      {itens.map(c => (
        <div key={c.id} data-card={c.id} className="min-w-0 border-r border-t border-[#eef0f3] px-2.5 py-1.5 last:border-r-0 min-[1200px]:border-t-0">
          <div className="whitespace-nowrap text-[10px] text-muted-foreground">{c.rotulo}</div>
          <div className={cn('whitespace-nowrap text-[16px] font-semibold tabular-nums leading-[20px]', c.cor)}>
            {c.valor}{c.unidade && <span className="ml-1 text-[10px] font-medium text-muted-foreground">{c.unidade}</span>}
          </div>
          {c.sub && <div className="whitespace-nowrap text-[10px] text-muted-foreground">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

const Selo = ({ s }: { s: Situacao | null }) => (s == null
  ? <span className="text-[9.5px] text-muted-foreground">sem histórico</span>
  : <span className={cn('rounded-[3px] px-1.5 text-[9.5px] font-semibold', COR_SIT[s])}>{ROTULO_SITUACAO[s]}</span>);

const corDif = (n: number | null) => (n == null ? '' : n < 0 ? 'text-[#b91c1c]' : n > 0 ? 'text-[#24508f]' : '');

/* ───────────────────────────── todas as fazendas ───────────────────────────── */

interface LinhaFaz { f: FazendaDaAnalise; r: Resumo; mesMm: number | null; mesMedia: number | null }
type Ordem = 'fazenda' | 'mes' | 'acum' | 'pct' | 'dias';

function VisaoTodas({ chuvas, fazendas, recorte, onAbrir }: {
  chuvas: readonly Chuva[]; fazendas: readonly FazendaDaAnalise[]; recorte: Recorte; onAbrir: (id: string) => void;
}) {
  const iMes = mesesDoPeriodo(recorte.periodo).indexOf(recorte.mesAte);
  /* Fazenda monitorada = tem lançamento; a que nunca lançou chuva (ex.: Administrativo) não entra */
  const linhas = useMemo<LinhaFaz[]>(() => fazendas
    .map(f => ({ f, ls: leiturasDe(chuvas, f.id) }))
    .filter(x => x.ls.length > 0)
    .map(({ f, ls }) => { const r = resumir(ls, recorte); return { f, r, mesMm: r.porMes[iMes], mesMedia: r.media[iMes] }; }),
  [chuvas, fazendas, recorte, iMes]);
  const [ordem, setOrdem] = useState<Ordem>('fazenda');
  const ordenadas = useMemo(() => {
    const v = (l: LinhaFaz): number | string => (ordem === 'fazenda' ? codigoDe(l.f) : ordem === 'mes' ? -(l.mesMm ?? -1)
      : ordem === 'acum' ? -l.r.acumulado : ordem === 'pct' ? -(l.r.pctAcum ?? -1) : -(l.r.diasDesdeUltima ?? -1));
    return [...linhas].sort((a, b) => { const x = v(a); const y = v(b); return x < y ? -1 : x > y ? 1 : 0; });
  }, [linhas, ordem]);
  /* Cabeçalho em 2 linhas curtas (Chat 12/11 17:30); as 16 colunas cabem de 1100px para cima. Abaixo disso saem 3 que repetem o que
     outra coluna já diz (o valor vai para o title dela). */
  const largo = useLarguraDaJanela() >= 1100;

  if (linhas.length === 0) return <div className="p-6 text-center text-[11px] text-muted-foreground">Nenhuma chuva lançada nas fazendas deste cliente.</div>;

  const n = linhas.length;
  const por = (s: Situacao) => linhas.filter(l => l.r.situacao === s);
  const semHist = linhas.filter(l => l.r.situacao == null);
  const maior = linhas.reduce((a, b) => (b.r.acumulado > a.r.acumulado ? b : a));
  const seca = linhas.filter(l => l.r.diasDesdeUltima != null).reduce<LinhaFaz | null>((a, b) => (a == null || (b.r.diasDesdeUltima ?? 0) > (a.r.diasDesdeUltima ?? 0) ? b : a), null);
  const nomes = (ls: LinhaFaz[]) => (ls.length === 0 ? '—' : ls.map(l => codigoDe(l.f)).join(' · '));
  const media = (f: (l: LinhaFaz) => number | null) => {
    const v = linhas.map(f).filter((x): x is number => x != null);
    return v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length;
  };
  const meses = mesesDoPeriodo(recorte.periodo);
  const th = (l1: string, l2: string, o: Ordem | null, num = true, titulo?: string) => (
    <th className={cn(TH_REGUA, 'h-[30px] bg-primary align-middle leading-[11px]', num && 'text-right', o && 'cursor-pointer select-none')} title={titulo} onClick={o ? () => setOrdem(o) : undefined}>
      <span className="block">{l1}{o && ordem === o ? ' ▾' : ''}</span><span className="block">{l2}</span>
    </th>
  );

  return (
    <>
      <Cards testid="chuvas-todas-cards" itens={[
        { id: 'acima', rotulo: 'Fazendas acima da média', valor: por('acima').length, unidade: `de ${n}`, sub: nomes(por('acima')), cor: 'text-[#24508f]' },
        { id: 'dentro', rotulo: 'Dentro da média', valor: por('dentro').length, unidade: `de ${n}`, sub: nomes(por('dentro')) },
        { id: 'abaixo', rotulo: 'Abaixo da média', valor: por('abaixo').length, unidade: `de ${n}`, sub: nomes(por('abaixo')), cor: 'text-[#b91c1c]' },
        { id: 'sem-historico', rotulo: 'Sem histórico (1º ano)', valor: semHist.length, unidade: `de ${n}`, sub: nomes(semHist) },
        { id: 'maior', rotulo: 'Maior acumulado', valor: mm(maior.r.acumulado), unidade: 'mm', sub: maior.r.pctAcum == null ? `${codigoDe(maior.f)} · sem histórico` : `${codigoDe(maior.f)} · ${pct(maior.r.pctAcum)} da média` },
        { id: 'seca', rotulo: 'Mais tempo sem chuva lançada', valor: seca?.r.diasDesdeUltima ?? '—', unidade: 'dias', sub: seca ? `${codigoDe(seca.f)} · última em ${dataBR(seca.r.ultima?.data)}` : '—', cor: 'text-[#b45309]' },
      ]} />

      <Bloco titulo="Comparativo das fazendas" nota="mm · clique no cabeçalho para ordenar · clique na fazenda para abrir a análise dela" testid="chuvas-comparativo">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col style={{ width: 56 }} /><col style={{ width: 48 }} />{largo && <col style={{ width: 48 }} />}<col style={{ width: 54 }} /><col style={{ width: 54 }} />
            <col style={{ width: 54 }} /><col style={{ width: 44 }} /><col style={{ width: 104 }} />{largo && <col style={{ width: 52 }} />}<col style={{ width: 52 }} />
            <col style={{ width: 52 }} /><col style={{ width: 50 }} /><col style={{ width: 60 }} />{largo && <col style={{ width: 40 }} />}<col style={{ width: 72 }} /><col style={{ width: 72 }} />
          </colgroup>
          <thead><tr>
            {th('Fazenda', '', 'fazenda', false)}{th(nomeMes(recorte.mesAte), '(mm)', 'mes')}{largo && th('Média', nomeMes(recorte.mesAte), null)}
            {th('Período', '(mm)', 'acum')}{th('Média', 'período', null)}{th('Diferença', '(mm)', null)}{th('%', 'média', 'pct')}
            <th className={cn(TH_REGUA, 'h-[30px] bg-primary text-center')}>Situação</th>
            {largo && th('Ano', 'anterior', null, true, 'Ano anterior, mesma janela (mm)')}{th('Δ%', 'ano ant.', null, true, 'Δ% contra o ano anterior')}{th('Dias', 'c/ chuva', null)}{th('Maior', 'chuva', null)}
            {th('Maior', 'intervalo', null, true, 'Maior intervalo entre chuvas lançadas')}{largo && th('Dias', 'sem', 'dias', true, 'Dias desde a última chuva lançada')}{th('Última', 'chuva', null)}{th('Lançado', 'até', null)}
          </tr></thead>
          <tbody>
            {ordenadas.map(l => (
              <tr key={l.f.id} data-fazenda={codigoDe(l.f)} className="hover:bg-muted/40">
                <td className={cn(TD_REGUA_TEXTO, 'font-semibold')} title={l.f.nome}>
                  <button type="button" className="max-w-full truncate text-left hover:underline" onClick={() => onAbrir(l.f.id)}>{codigoDe(l.f)}</button>
                </td>
                <td className={TD_REGUA_NUM} title={largo ? undefined : `média ${mm(l.mesMedia)}`}>{mm(l.mesMm)}</td>
                {largo && <td className={cn(TD_REGUA_NUM, 'text-muted-foreground')}>{mm(l.mesMedia)}</td>}
                <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{mm(l.r.acumulado)}</td>
                <td className={cn(TD_REGUA_NUM, 'text-muted-foreground')}>{mm(l.r.mediaAcum)}</td>
                <td className={cn(TD_REGUA_NUM, corDif(l.r.mediaAcum == null ? null : l.r.acumulado - l.r.mediaAcum))}>{l.r.mediaAcum == null ? '—' : sinal(l.r.acumulado - l.r.mediaAcum)}</td>
                <td className={TD_REGUA_NUM}>{pct(l.r.pctAcum)}</td>
                <td className={cn(TD_REGUA, 'text-center')}><Selo s={l.r.situacao} /></td>
                {largo && <td className={cn(TD_REGUA_NUM, 'text-muted-foreground')}>{mm(l.r.acumAnterior)}</td>}
                <td className={cn(TD_REGUA_NUM, corDif(l.r.dPctAnterior))} title={largo ? undefined : `ano anterior ${mm(l.r.acumAnterior)}`} data-col="dpct">{pctSinal(l.r.dPctAnterior)}</td>
                <td className={TD_REGUA_NUM}>{l.r.diasChuva}</td>
                <td className={TD_REGUA_NUM} title={l.r.maior ? dataBR(l.r.maior.data) : undefined} data-col="maior">{mm(l.r.maior?.mm)}</td>
                <td className={TD_REGUA_NUM} title={l.r.maiorIntervalo ? `${dataBR(l.r.maiorIntervalo.de)} a ${dataBR(l.r.maiorIntervalo.ate)}` : undefined} data-col="intervalo">{l.r.maiorIntervalo ? `${l.r.maiorIntervalo.dias} dias` : '—'}</td>
                {largo && <td className={TD_REGUA_NUM}>{l.r.diasDesdeUltima ?? '—'}</td>}
                <td className={TD_REGUA_NUM} title={largo || l.r.diasDesdeUltima == null ? undefined : `há ${l.r.diasDesdeUltima} dias`}>{dataBR(l.r.ultima?.data)}</td>
                <td className={TD_REGUA_NUM}>{dataBR(l.r.lancadoAte)}</td>
              </tr>
            ))}
            <tr className="bg-[#f4f6f9] font-semibold" data-linha="media">
              <td className={TD_REGUA_TEXTO}>Média</td>
              <td className={TD_REGUA_NUM}>{mm(media(l => l.mesMm))}</td>
              {largo && <td className={TD_REGUA_NUM}>{mm(media(l => l.mesMedia))}</td>}
              <td className={TD_REGUA_NUM}>{mm(media(l => l.r.acumulado))}</td>
              <td className={TD_REGUA_NUM}>{mm(media(l => l.r.mediaAcum))}</td>
              <td className={TD_REGUA} /><td className={TD_REGUA} /><td className={TD_REGUA} />
              {largo && <td className={TD_REGUA_NUM}>{mm(media(l => l.r.acumAnterior))}</td>}
              <td className={TD_REGUA} />
              <td className={TD_REGUA_NUM}>{(() => { const v = media(l => l.r.diasChuva); return v == null ? '—' : formatNum(v, 0); })()}</td>
              <td className={TD_REGUA} /><td className={TD_REGUA} />
              {largo && <td className={TD_REGUA} />}<td className={TD_REGUA} /><td className={TD_REGUA} />
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-[10px] text-muted-foreground">
          A situação compara o acumulado com a média dos anos completos lançados da própria fazenda, no mesmo período (abaixo de 85% · 85 a 115% · acima de 115%).
          "Lançado até" é o último lançamento; dia sem lançamento não conta como zero. "Intervalo" é o maior entre chuvas lançadas; "Dias sem" = dias desde a última chuva lançada (abaixo de 1100px, Média do mês, Ano ant. e Dias sem saem e vão para o title da coluna vizinha).
          A linha Média é a média das fazendas (soma dos lançamentos não é pluviometria oficial: cada fazenda é uma estação).
        </p>
      </Bloco>

      <div className="grid grid-cols-1 gap-2 min-[1100px]:grid-cols-2">
        <Bloco titulo="Chuva por mês × média histórica" nota="mm no mês · cor = % da média do mês" testid="chuvas-mapa-calor">
          <table className="w-full table-fixed border-collapse">
            <colgroup><col style={{ width: 52 }} />{meses.map(m => <col key={m} />)}<col style={{ width: 58 }} /></colgroup>
            <thead><tr>
              <th className={cn(TH_REGUA, 'bg-primary text-left')}>Fazenda</th>
              {meses.map(m => <th key={m} className={cn(TH_REGUA, 'bg-primary text-right')}>{nomeMes(m)}</th>)}
              <th className={cn(TH_REGUA, 'bg-primary text-right')}>Período</th>
            </tr></thead>
            <tbody>
              {ordenadas.map(l => (
                <tr key={l.f.id}>
                  <td className={cn(TD_REGUA_TEXTO, 'font-semibold')} title={l.f.nome}>{codigoDe(l.f)}</td>
                  {l.r.porMes.map((v, i) => {
                    const d = degrau(pctDe(v, l.r.media[i]));
                    return <td key={meses[i]} className={TD_REGUA_NUM} data-degrau={d ?? undefined} style={{ backgroundColor: d ? COR_DEGRAU[d] : undefined }}>{v == null ? '–' : formatNum(v, 0)}</td>;
                  })}
                  <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{mm(l.r.acumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            {([['muito-abaixo', 'menos de 60%'], ['abaixo', '60 a 85%'], ['dentro', '85 a 115%'], ['acima', '115 a 140%'], ['muito-acima', 'mais de 140%']] as const).map(([d, t]) => (
              <span key={d} className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: COR_DEGRAU[d] }} />{t}</span>
            ))}
            <span>sem cor = sem histórico · – = não lançado</span>
          </div>
        </Bloco>

        <Bloco titulo="Acumulado × média histórica" nota={`${nomeMes(meses[0])} a ${nomeMes(recorte.mesAte)} · mm`} testid="chuvas-acumulado-fazendas">
          <BarrasDoAcumulado linhas={ordenadas} />
        </Bloco>
      </div>
    </>
  );
}

/** As barras horizontais do acumulado (o do período, o mesmo período do ano anterior e o traço da média). */
function BarrasDoAcumulado({ linhas }: { linhas: LinhaFaz[] }) {
  const max = Math.max(1, ...linhas.flatMap(l => [l.r.acumulado, l.r.acumAnterior ?? 0, l.r.mediaAcum ?? 0])) * 1.1;
  const w = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="flex flex-col gap-2 pt-1">
      {linhas.map(l => (
        <div key={l.f.id} className="grid grid-cols-[52px_1fr_118px] items-center gap-2" data-barra={codigoDe(l.f)}>
          <span className="truncate text-[11px] font-semibold" title={l.f.nome}>{codigoDe(l.f)}</span>
          <div className="relative h-[22px]">
            <div className="absolute left-0 top-0 h-[13px] rounded-[2px]" style={{ width: w(l.r.acumulado), backgroundColor: AZUL }} />
            {l.r.acumAnterior != null && <div className="absolute left-0 top-[15px] h-[6px] rounded-[2px]" style={{ width: w(l.r.acumAnterior), backgroundColor: CINZA }} />}
            {l.r.mediaAcum != null && <div className="absolute top-[-2px] h-[26px] w-[2px]" style={{ left: w(l.r.mediaAcum), backgroundColor: PRETO }} title={`média histórica ${mm(l.r.mediaAcum)} mm`} />}
          </div>
          <div className="leading-[12px]">
            <div className="whitespace-nowrap text-[11px] font-semibold tabular-nums">{mm(l.r.acumulado)} mm</div>
            <div className={cn('whitespace-nowrap text-[10px]', l.r.situacao === 'abaixo' ? 'text-[#b91c1c]' : 'text-muted-foreground')}>
              {l.r.pctAcum == null ? 'sem histórico' : `${pct(l.r.pctAcum)} da média`}
            </div>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5" style={{ backgroundColor: AZUL }} />acumulado</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5" style={{ backgroundColor: CINZA }} />mesmo período do ano anterior</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-[2px]" style={{ backgroundColor: PRETO }} />média histórica do período</span>
      </div>
    </div>
  );
}

/* ───────────────────────────── uma fazenda ───────────────────────────── */

function VisaoUma({ chuvas, fazenda, recorte, salvarChuva, removerChuva }: {
  chuvas: readonly Chuva[]; fazenda: FazendaDaAnalise; recorte: Recorte;
  salvarChuva: (data: string, milimetros: number) => Promise<void>; removerChuva: (id: string) => Promise<void>;
}) {
  const ls = useMemo(() => leiturasDe(chuvas, fazenda.id), [chuvas, fazenda.id]);
  const r = useMemo(() => resumir(ls, recorte), [ls, recorte]);
  const meses = mesesDoPeriodo(recorte.periodo);
  const iMes = meses.indexOf(recorte.mesAte);
  const [dia, setDia] = useState<string | null>(null);
  const anoAnt = rotuloPeriodo({ modo: recorte.periodo.modo, ano: recorte.periodo.ano - 1 });
  const mesMm = r.porMes[iMes]; const mesMedia = r.media[iMes];
  const dif = r.mediaAcum == null ? null : r.acumulado - r.mediaAcum;
  const nHist = r.hist.length;
  const rotHist = nHist === 0 ? 'sem histórico (1º ano lançado)' : `média histórica (${nHist} ${nHist === 1 ? 'ano' : 'anos'})`;

  if (ls.length === 0) return <div className="p-6 text-center text-[11px] text-muted-foreground">Nenhuma chuva lançada em {fazenda.nome}.</div>;

  return (
    <>
      <Cards testid="chuvas-uma-cards" itens={[
        { id: 'mes', rotulo: `Chuva em ${nomeMes(recorte.mesAte)}${recorte.ate.slice(0, 7) === recorte.mesAte ? ` · até ${dataBR(recorte.ate)}` : ''}`, valor: mesMm == null ? <span className="text-[12px] font-medium text-muted-foreground">sem lançamento em {nomeMes(recorte.mesAte)}</span> : mm(mesMm),
          unidade: mesMm == null ? undefined : 'mm',
          sub: mesMedia == null ? 'sem histórico do mês' : `média: ${mm(mesMedia)} mm · ${pct(pctDe(mesMm, mesMedia))}` },
        { id: 'acumulado', rotulo: 'Acumulado no período', valor: mm(r.acumulado), unidade: 'mm', sub: r.mediaAcum == null ? 'sem histórico' : `média até ${nomeMes(recorte.mesAte)}: ${mm(r.mediaAcum)} mm` },
        { id: 'diferenca', rotulo: 'Diferença para a média', valor: sinal(dif), unidade: dif == null ? undefined : 'mm', cor: corDif(dif),
          sub: r.pctAcum == null ? 'sem histórico' : <>{pct(r.pctAcum)} da média · <Selo s={r.situacao} /></> },
        { id: 'dias-chuva', rotulo: 'Dias com chuva', valor: r.diasChuva, unidade: 'dias', sub: r.diasChuvaAnterior == null ? 'sem o período anterior' : `${anoAnt} no mesmo período: ${r.diasChuvaAnterior}` },
        { id: 'sem-chuva', rotulo: 'Desde a última chuva lançada', valor: r.diasDesdeUltima ?? '—', unidade: 'dias', cor: 'text-[#b45309]',
          sub: r.ultima ? `última: ${dataBR(r.ultima.data)} · ${mm(r.ultima.mm)} mm` : '—' },
        { id: 'maior', rotulo: 'Maior chuva em um dia', valor: mm(r.maior?.mm), unidade: 'mm', sub: dataBR(r.maior?.data) },
      ]} />

      <div className="grid grid-cols-1 gap-2 min-[1100px]:grid-cols-2">
        <Bloco titulo="Chuva por mês" nota={`mm · ${rotuloPeriodo(recorte.periodo)} × ${rotHist} × ${anoAnt}`} testid="chuvas-por-mes">
          <Numeros itens={[[`${rotuloPeriodo(recorte.periodo)} até ${nomeMes(recorte.mesAte)}`, r.acumulado], ['Média do período', r.mediaAcum], [`${anoAnt} no período`, r.acumAnterior]]} />
          <GraficoMensal meses={meses} porMes={r.porMes} media={r.media} anterior={r.anterior} iMes={iMes} emAndamento={recorte.ate.slice(0, 7) === recorte.mesAte} />
          <Legenda itens={[['bar', AZUL, rotuloPeriodo(recorte.periodo)], ['bar', AZUL_CLARO, 'mês em andamento'], ['linha', PRETO, rotHist], ['bar', CINZA, anoAnt]]} />
        </Bloco>
        <Bloco titulo="Acumulado no período" nota="mm" testid="chuvas-acumulado">
          <Numeros itens={[['Acumulado hoje', r.acumulado], [`Média até ${nomeMes(recorte.mesAte)}`, r.mediaAcum], ['Média do período inteiro', r.media[0] == null ? null : r.media.reduce<number>((a, b) => a + (b ?? 0), 0)]]} />
          <GraficoAcumulado meses={meses} atual={acumulado(r.porMes)} media={r.media[0] == null ? null : acumulado(r.media)} anterior={acumulado(r.anterior)} />
          <Legenda itens={[['linha', AZUL, rotuloPeriodo(recorte.periodo)], ['linha', PRETO, rotHist], ['tracejada', '#9ca3af', anoAnt],
            ...(r.mediaAcum == null ? [] : [['bar', 'rgba(36,80,143,.25)', 'acima da média'], ['bar', 'rgba(185,28,28,.25)', 'abaixo da média']] as ['bar', string, string][])]} />
        </Bloco>
      </div>

      <Bloco titulo="Dia a dia — últimos 90 dias" nota="mm por dia · clique no dia para abrir o lançamento (editar ou cancelar)" testid="chuvas-dia-a-dia">
        <DiaADia dias={diaADia(ls, recorte.ate, 90)} onDia={setDia} />
      </Bloco>

      <Bloco titulo="Leitura da estação" nota="o sistema explica, o operador decide" testid="chuvas-leitura">
        <LeituraDaEstacao ls={ls} recorte={recorte} porMes={r.porMes} media={r.media} />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Tudo calculado na hora a partir dos lançamentos; nada digitado duas vezes. Média histórica = média dos anos completos lançados da própria fazenda
          {nHist > 0 ? ` (aqui ${rotuloPeriodo(r.hist[0])} a ${rotuloPeriodo(r.hist[nHist - 1])})` : ' (ainda nenhum)'}. Intervalos e veranicos contam entre chuvas lançadas: dia sem lançamento não é dia seco.
        </p>
      </Bloco>

      <EditarDia dia={dia} chuva={dia ? chuvas.find(c => c.fazendaId === fazenda.id && c.data === dia) ?? null : null}
        fazendaNome={fazenda.nome} onFechar={() => setDia(null)} salvarChuva={salvarChuva} removerChuva={removerChuva} />
    </>
  );
}

function Numeros({ itens }: { itens: [string, number | null][] }) {
  return (
    <div className="mb-1 flex flex-wrap gap-x-5">
      {itens.map(([t, v]) => (
        <div key={t}><div className="whitespace-nowrap text-[10px] text-muted-foreground">{t}</div>
          <div className="whitespace-nowrap text-[14px] font-semibold tabular-nums">{v == null ? '—' : `${mm(v)} mm`}</div></div>
      ))}
    </div>
  );
}

function Legenda({ itens }: { itens: ['bar' | 'linha' | 'tracejada', string, string][] }) {
  return (
    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
      {itens.map(([t, c, rot]) => (
        <span key={rot} className="inline-flex items-center gap-1">
          {t === 'bar' ? <i className="inline-block h-2.5 w-2.5" style={{ backgroundColor: c }} />
            : <i className="inline-block h-0 w-3.5" style={{ borderTop: `2px ${t === 'tracejada' ? 'dashed' : 'solid'} ${c}` }} />}
          {rot}
        </span>
      ))}
    </div>
  );
}

function GraficoMensal({ meses, porMes, media, anterior, iMes, emAndamento }: {
  meses: string[]; porMes: (number | null)[]; media: (number | null)[]; anterior: (number | null)[]; iMes: number; emAndamento: boolean;
}) {
  const dados = meses.map((m, i) => ({ m: nomeMes(m), atual: porMes[i], media: media[i], anterior: anterior[i], andamento: emAndamento && i === iMes }));
  return (
    <div className="h-[200px]" data-testid="chuvas-grafico-mensal">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dados} margin={{ top: 14, right: 6, bottom: 0, left: -18 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="#eef0f3" />
          <XAxis dataKey="m" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={0} />
          <YAxis tick={{ fontSize: 9.5 }} tickLine={false} axisLine={false} />
          <Bar dataKey="atual" isAnimationActive={false} maxBarSize={18}>
            {dados.map(d => <Cell key={d.m} fill={d.andamento ? AZUL_CLARO : AZUL} />)}
            <LabelList dataKey="atual" position="top" fontSize={9.5} fontWeight={700} formatter={(v: unknown) => (typeof v === 'number' ? formatNum(v, 0) : '')} />
          </Bar>
          <Bar dataKey="anterior" fill={CINZA} isAnimationActive={false} maxBarSize={12} />
          <Line dataKey="media" type="monotone" stroke={PRETO} strokeWidth={1.5} dot={{ r: 2.5, fill: '#fff', stroke: PRETO }} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Ponto do acumulado; `acima`/`abaixo` = a faixa entre 2026 e a média (azul acima, vermelho abaixo — Chat 12/11 17:30). */
interface PontoAcum { x: number; atual?: number | null; media?: number | null; anterior?: number | null; acima?: [number, number] | null; abaixo?: [number, number] | null }

/** A faixa entre o atual e a média, com o ponto exato onde as duas se cruzam (o eixo é numérico para caber o ponto do meio). */
export function faixaEntreAtualEMedia(atual: (number | null)[], media: (number | null)[] | null, anterior: (number | null)[]): PontoAcum[] {
  const faixa = (a: number | null, m: number | null) => ({
    acima: a != null && m != null && a >= m ? [m, a] as [number, number] : null,
    abaixo: a != null && m != null && a < m ? [a, m] as [number, number] : null,
  });
  const out: PontoAcum[] = [];
  atual.forEach((a, i) => {
    const m = media?.[i] ?? null;
    out.push({ x: i, atual: a, media: m, anterior: anterior[i], ...faixa(a, m) });
    const a2 = atual[i + 1]; const m2 = media?.[i + 1];
    if (a != null && m != null && a2 != null && m2 != null && (a - m) * (a2 - m2) < 0) {
      const t = (m - a) / ((a2 - a) - (m2 - m)); const v = a + t * (a2 - a);
      out.push({ x: i + t, acima: [v, v], abaixo: [v, v] });
    }
  });
  return out;
}

function GraficoAcumulado({ meses, atual, media, anterior }: {
  meses: string[]; atual: (number | null)[]; media: (number | null)[] | null; anterior: (number | null)[];
}) {
  const dados = faixaEntreAtualEMedia(atual, media, anterior);
  return (
    <div className="h-[200px]" data-testid="chuvas-grafico-acumulado">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dados} margin={{ top: 14, right: 10, bottom: 0, left: -10 }}>
          <CartesianGrid vertical={false} stroke="#eef0f3" />
          <XAxis dataKey="x" type="number" domain={[0, meses.length - 1]} ticks={meses.map((_, i) => i)} tickFormatter={(i: number) => nomeMes(meses[i] ?? '')}
            tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={0} padding={{ left: 10, right: 10 }} />
          <YAxis tick={{ fontSize: 9.5 }} tickLine={false} axisLine={false} />
          <Area dataKey="acima" type="linear" stroke="none" fill={AZUL} fillOpacity={0.16} isAnimationActive={false} connectNulls={false} />
          <Area dataKey="abaixo" type="linear" stroke="none" fill="#b91c1c" fillOpacity={0.16} isAnimationActive={false} connectNulls={false} />
          <Line dataKey="anterior" type="linear" stroke="#9ca3af" strokeDasharray="4 3" strokeWidth={1.2} dot={false} isAnimationActive={false} connectNulls />
          <Line dataKey="media" type="linear" stroke={PRETO} strokeWidth={1.5} dot={{ r: 2.5, fill: '#fff', stroke: PRETO }} isAnimationActive={false} connectNulls />
          <Line dataKey="atual" type="linear" stroke={AZUL} strokeWidth={2} dot={{ r: 2.5, fill: AZUL }} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Escala do dia a dia: passo de 20 mm até 80, de 50 até 200, de 100 acima. */
export function escalaDoDia(max: number): { topo: number; marcas: number[] } {
  const passo = max <= 80 ? 20 : max <= 200 ? 50 : 100;
  const topo = Math.max(passo, Math.ceil(max / passo) * passo);
  return { topo, marcas: Array.from({ length: topo / passo + 1 }, (_, i) => i * passo) };
}
const ALT_DIA = 70;
const ROTULO_DIA_MM = 30;

/**
 * O dia a dia: uma coluna por dia; só a chuva lançada desenha (D-A, Chat 12/11 15:00: sem distinguir "0 mm" de "sem lançamento"); a
 * faixa vermelha marca o veranico. Escala (Chat 12/11 17:30): eixo em mm, o dia do mês a cada 5 e o mm em cima da chuva de 30 mm ou mais.
 */
function DiaADia({ dias, onDia }: { dias: ReturnType<typeof diaADia>; onDia: (d: string) => void }) {
  const { topo, marcas } = escalaDoDia(Math.max(...dias.map(d => d.mm ?? 0)));
  const y = (v: number) => (v / topo) * ALT_DIA;
  return (
    <div>
      <div className="flex">
        <div className="relative h-[84px] w-[24px] flex-none" aria-hidden>
          {marcas.map(v => <span key={v} className="absolute right-1 translate-y-1/2 text-[9.5px] leading-none text-muted-foreground tabular-nums" style={{ bottom: y(v) }}>{v}</span>)}
        </div>
        <div className="relative h-[84px] min-w-0 flex-1 border-b border-[#d9dee6]">
          {marcas.slice(1).map(v => <i key={v} className="pointer-events-none absolute left-0 right-0 border-t border-[#eef0f3]" style={{ bottom: y(v) }} />)}
          <div className="relative flex h-full items-end gap-px" data-testid="chuvas-dias">
            {dias.map(d => (
              <button key={d.data} type="button" onClick={() => onDia(d.data)} data-dia={d.data} data-estado={d.estado}
                title={`${dataBR(d.data)} · ${d.estado === 'chuva' ? `${mm(d.mm)} mm` : 'sem lançamento'}${d.veranico ? ' · veranico (entre chuvas lançadas)' : ''}`}
                className={cn('relative flex h-full min-w-0 flex-1 items-end hover:bg-muted/60', d.data.endsWith('-01') && 'border-l border-[#d9dee6]')}>
                {d.veranico && <i className="absolute left-0 right-0 top-0 h-[3px] bg-[#b91c1c]" />}
                {d.estado === 'chuva' && <i className="block w-full" style={{ height: `${Math.max(2, y(d.mm ?? 0))}px`, backgroundColor: AZUL }} />}
                {d.estado === 'chuva' && (d.mm ?? 0) >= ROTULO_DIA_MM && (
                  <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[9.5px] font-bold leading-none tabular-nums" style={{ bottom: y(d.mm ?? 0) + 2 }}>
                    {formatNum(d.mm ?? 0, 0)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="relative ml-[24px] h-[12px]" aria-hidden>
        {dias.map((d, i) => {
          const dia = Number(d.data.slice(8, 10));
          if (dia !== 1 && (dia % 5 !== 0 || dia >= 30)) return null; /* o 30 encostava no nome do mês seguinte */
          return (
            <span key={d.data} className={cn('absolute -translate-x-1/2 whitespace-nowrap text-[9.5px] leading-[12px] text-muted-foreground tabular-nums', dia === 1 && 'font-semibold text-foreground')}
              style={{ left: `${((i + 0.5) / dias.length) * 100}%` }}>
              {dia === 1 ? nomeMes(d.data.slice(0, 7)) : dia}
            </span>
          );
        })}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2.5 w-2.5" style={{ backgroundColor: AZUL }} />chuva lançada (mm)</span>
        <span>vazio = sem lançamento</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-[3px] w-3.5 bg-[#b91c1c]" />veranico: 10 dias ou mais entre chuvas lançadas (out a mar)</span>
      </div>
    </div>
  );
}

function LeituraDaEstacao({ ls, recorte, porMes, media }: { ls: Leitura[]; recorte: Recorte; porMes: (number | null)[]; media: (number | null)[] }) {
  const p = recorte.periodo;
  const { de } = datasDoPeriodo(p);
  const ate = recorte.ate;
  const ant = mesmaJanelaAntes(p, ate);
  const anoEst = p.modo === 'safra' ? p.ano : Number(ate.slice(0, 4)) - (Number(ate.slice(5, 7)) >= 9 ? 0 : 1);
  const ini = inicioDasChuvas(ls, anoEst, ate);
  const iniAnt = inicioDasChuvas(ls, anoEst - 1, `${anoEst}-08-31`);
  const seca = maiorSecaSemChuva(ls, de, ate); const secaAnt = maiorSecaSemChuva(ls, ant.de, ant.ate);
  const ver = veranicos(ls, de, ate); const verAnt = veranicos(ls, ant.de, ant.ate);
  const maiorVer = ver.reduce<(typeof ver)[number] | null>((a, b) => (a == null || b.dias > a.dias ? b : a), null);
  const fortes = chuvasFortes(ls, de, ate); const fortesAnt = chuvasFortes(ls, ant.de, ant.ate);
  const ext = mesesExtremos(porMes, p);
  const ms = mesesDoPeriodo(p);
  const anoAnt = rotuloPeriodo({ modo: p.modo, ano: p.ano - 1 });
  const temAnt = ls.some(l => l.data >= ant.de && l.data <= ant.ate);
  const linhas: { id: string; o: string; quando: string; quanto: string; comp: string; alerta?: boolean }[] = [
    { id: 'inicio', o: 'Início das chuvas (1ª de 20 mm ou mais desde 1º/09)', quando: dataBR(ini?.data), quanto: ini ? `${mm(ini.mm)} mm` : '—',
      comp: iniAnt ? `anterior: ${dataBR(iniAnt.data)}${ini ? ` · ${fraseDiaDoAno(diferencaNoDiaDoAno(ini.data, iniAnt.data))}` : ''}` : '—' },
    { id: 'seca', o: 'Maior intervalo entre chuvas lançadas na seca', quando: seca ? `${dataBR(seca.de)} a ${dataBR(seca.ate)}` : '—', quanto: seca ? `${seca.dias} dias` : '—',
      comp: temAnt ? `${anoAnt}: ${secaAnt ? `${secaAnt.dias} dias` : 'nenhum'}` : '—' },
    { id: 'veranico', o: 'Veranico (entre chuvas lançadas) na estação chuvosa', quando: maiorVer ? `${dataBR(maiorVer.de)} a ${dataBR(maiorVer.ate)}` : 'nenhum', quanto: maiorVer ? `${maiorVer.dias} dias` : '—',
      comp: temAnt ? `${anoAnt}: ${verAnt.length === 0 ? 'nenhum' : `${verAnt.length} (maior ${Math.max(...verAnt.map(v => v.dias))} dias)`}` : '—', alerta: maiorVer != null },
    { id: 'forte', o: 'Chuva forte em um dia (50 mm ou mais)', quando: fortes.length === 0 ? 'nenhuma' : fortes.map(f => dataBR(f.data)).join(' · '), quanto: `${fortes.length} ${fortes.length === 1 ? 'dia' : 'dias'}`,
      comp: temAnt ? `${anoAnt}: ${fortesAnt.length} ${fortesAnt.length === 1 ? 'dia' : 'dias'}` : '—' },
    { id: 'chuvoso', o: 'Mês mais chuvoso', quando: ext ? nomeMes(ext.chuvoso) : '—', quanto: ext ? `${mm(porMes[ms.indexOf(ext.chuvoso)])} mm` : '—',
      comp: ext && media[ms.indexOf(ext.chuvoso)] != null ? `média do mês: ${mm(media[ms.indexOf(ext.chuvoso)])} mm` : '—' },
    { id: 'seco', o: 'Mês mais seco', quando: ext ? nomeMes(ext.seco) : '—', quanto: ext ? `${mm(porMes[ms.indexOf(ext.seco)])} mm` : '—',
      comp: ext && media[ms.indexOf(ext.seco)] != null ? `média do mês: ${mm(media[ms.indexOf(ext.seco)])} mm` : '—' },
  ];
  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup><col /><col style={{ width: 190 }} /><col style={{ width: 90 }} /><col style={{ width: 240 }} /></colgroup>
      <thead><tr>
        <th className={cn(TH_REGUA, 'bg-primary text-left')}>O que aconteceu</th>
        <th className={cn(TH_REGUA, 'bg-primary text-right')}>Quando</th>
        <th className={cn(TH_REGUA, 'bg-primary text-right')}>Quanto</th>
        <th className={cn(TH_REGUA, 'bg-primary text-left')}>Comparação</th>
      </tr></thead>
      <tbody>
        {linhas.map(l => (
          <tr key={l.id} data-leitura={l.id}>
            <td className={TD_REGUA_TEXTO} title={l.o}>{l.o}</td>
            <td className={TD_REGUA_TEXTO + ' text-right'} title={l.quando}>{l.quando}</td>
            <td className={cn(TD_REGUA_NUM, l.alerta && 'text-[#b91c1c]')}>{l.quanto}</td>
            <td className={TD_REGUA_TEXTO} title={l.comp}>{l.comp}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** O lançamento do dia: editar o mm ou cancelar (pelos MESMOS `salvarChuva`/`removerChuva` da tela de lançar). */
function EditarDia({ dia, chuva, fazendaNome, onFechar, salvarChuva, removerChuva }: {
  dia: string | null; chuva: Chuva | null; fazendaNome: string; onFechar: () => void;
  salvarChuva: (data: string, milimetros: number) => Promise<void>; removerChuva: (id: string) => Promise<void>;
}) {
  const [valor, setValor] = useState<number | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  if (dia !== aberto) { setAberto(dia); setValor(chuva?.milimetros ?? null); }
  const [gravando, setGravando] = useState(false);
  const pendente = valor == null;
  return (
    <Dialog open={dia != null} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-[340px]" data-testid="chuvas-editar-dia">
        <DialogHeader><DialogTitle className="text-[13px]">Chuva de {dataBR(dia)} · {fazendaNome}</DialogTitle></DialogHeader>
        <div className="grid gap-1">
          <span className="text-[11px] text-muted-foreground">{chuva ? 'Lançado' : 'Sem lançamento neste dia'}</span>
          <CampoNumeroComConta valor={valor} onChange={setValor} casas={1} sufixoDentro="mm" placeholder="0,0" invalido={false} />
          {pendente && <span className="text-[10px] text-muted-foreground">Digite os milímetros (0 = lançado sem chuva).</span>}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {chuva && (
            <Button variant="outline" size="sm" className="h-[26px] text-[11px] text-[#b91c1c]" disabled={gravando}
              onClick={async () => { setGravando(true); await removerChuva(chuva.id); setGravando(false); onFechar(); }}>
              Cancelar lançamento
            </Button>
          )}
          <Button size="sm" className="ml-auto h-[26px] text-[11px]" disabled={pendente || gravando} title={pendente ? 'Digite os milímetros' : undefined}
            onClick={async () => { if (valor == null || dia == null) return; setGravando(true); await salvarChuva(dia, valor); setGravando(false); onFechar(); }}>
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
