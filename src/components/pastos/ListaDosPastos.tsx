/**
 * PASTOS-CAD-02 fatia 1 (Gabriel 09:54, mock `ui-validar/pastos-cadastro.html`) — a LISTA ÚNICA dos pastos, na régua da casa:
 *   · Vigentes · Encerrados · Todos, num MÊS escolhido; o encerrado em cinza com o selo "encerrado" na Vigência; o selo "arrendado";
 *   · colunas Pasto · Destino · Área · Forrageira · Reforma · Suporte · Lot. <mês> · Vigência · Mapa; toda coluna ordena;
 *   · cabeçalho preso; o rodapé (preso no pé do quadro) com Própria · Arrendada · Total, cada número NA SUA COLUNA (nunca ao lado do texto);
 *   · os 5 números do topo (vigentes · área própria × matrícula · arrendada · sem desenho no mapa · lotação da própria);
 *   · piquetes recuados abaixo do pai (▸/▾), a área do pai = a soma deles (PASTO-FICHA-01); o nome do pasto NUNCA corta (09:22).
 * As contas são da lib (`listaDosPastos.ts`); aqui só se desenha.
 */
import { Fragment, useLayoutEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Edit2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';
import { QUADRO_REGUA, RODAPE_REGUA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { CampoDoMes, anosDoCampo } from '@/components/mapa-geo/CampoDoMes';
import { useAlturaAteOFim } from '@/hooks/useAlturaAteOFim';
import { formatarAreaBR } from '@/lib/areaBR';
import { casaNaBusca } from '@/lib/texto/busca';
import { cn } from '@/lib/utils';
import { TIPOS_USO_OPTIONS_AGRUPADAS, corTextoDoTipoUso, grupoDoTipoUso, labelDoTipoUso } from '@/lib/pastos/tiposUso';
import {
  acimaDoSuporte, colunaDoPasto, COLUNAS_DE_TEXTO, ehArrendado, encerradoNoMes, filtrarPorVigencia, FONTE_PASTO_PX, montarLinhas, ordenarLinhas,
  somaDasAreas, textoDaVigencia, totaisPorPosse, vigenteNoMes,
  type ColunaDaLista, type Direcao, type FichaNaLista, type FiltroDeVigencia, type LinhaDaLista, type PastoDaLista, type TotalDaPosse,
} from '@/lib/pastos/listaDosPastos';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** 'AAAA-MM' → "out/26" */
export const mesCurto = (am: string | null): string => {
  if (!am) return '—';
  const [a, m] = am.split('-').map(Number);
  return `${MESES[(m || 1) - 1]}/${String(a).slice(2)}`;
};
const dec2 = (n: number | null) => (n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const area = (n: number | null) => (n == null ? '—' : formatarAreaBR(n));

/** a bolinha do destino (a cor do texto do destino da casa) */
const BOLINHA: Record<string, string> = { cria: 'bg-emerald-600', recria: 'bg-orange-600', engorda: 'bg-blue-600' };

/* as larguras fixas (a Pasto é a do maior nome, medida; a Forrageira leva o resto) */
const COLUNAS: { c: ColunaDaLista; rotulo: string; px?: number; direita?: boolean }[] = [
  { c: 'pasto', rotulo: 'Pasto' },
  { c: 'uso', rotulo: 'Destino', px: 82 },
  { c: 'area', rotulo: 'Área ha', px: 62, direita: true },
  { c: 'forrageira', rotulo: 'Forrageira' },
  { c: 'reforma', rotulo: 'Reforma', px: 58, direita: true },
  { c: 'suporte', rotulo: 'Suporte', px: 58, direita: true },
  { c: 'lotacao', rotulo: 'Lotação', px: 70, direita: true },
  { c: 'vigencia', rotulo: 'Vigência', px: 150 },
  { c: 'mapa', rotulo: 'Mapa', px: 76 },
];
const LARGURA_ACOES = 22;
const LARGURA_DAS_OUTRAS = COLUNAS.reduce((s, k) => s + (k.px ?? 0), 0) + LARGURA_ACOES;

let contexto: CanvasRenderingContext2D | null | undefined;
function medir(texto: string, fontePx: number, peso: number): number {
  if (contexto === undefined) contexto = typeof document === 'undefined' ? null : document.createElement('canvas').getContext?.('2d') ?? null;
  if (!contexto) return texto.length * fontePx * 0.6;
  contexto.font = `${peso} ${fontePx}px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
  return contexto.measureText(texto).width;
}
/** o que a célula do nome pede: padding (8) + seta/recuo + o nome + o selo "arrendado" + "· N piq." */
function pedidoDoNome(l: LinhaDaLista): number {
  const recuo = l.ehPiquete ? 16 + 2 : 12 + 2;
  const piq = l.piquetes.length > 0 ? 2 + medir(`· ${l.piquetes.length} piq.`, 9.5, 400) : 0;
  const selo = ehArrendado(l.pasto) ? 6 + medir('arrendado', 9.5, 400) + 8 : 0;
  return 8 + recuo + medir(l.pasto.nome, FONTE_PASTO_PX, l.ehPiquete ? 400 : 500) + piq + selo;
}

export type Agrupar = 'nenhum' | 'destino' | 'posse';

export interface ListaDosPastosProps {
  pastos: readonly PastoDaLista[];
  ficha: ReadonlyMap<string, FichaNaLista>;
  /** o mês escolhido ('AAAA-MM') e quem o troca (a lotação, o suporte e o mapa são dele) */
  mes: string;
  onMes: (m: string) => void;
  mesDeHoje: string;
  /** faixa da leitura que falhou (P146: falhou nunca vira zero) */
  erroDaFicha?: string | null;
  onEditar: (pastoId: string) => void;
  /** a matrícula da fazenda (o topo diz se a área própria bate) */
  matricula: number | null;
  matriculaConferida: boolean;
}

function Numero({ valor, rotulo, cor }: { valor: string; rotulo: string; cor?: string }) {
  return (
    /* fora de tabela não há "…": o número nunca corta e o rótulo QUEBRA em até 2 linhas, de altura reservada (nada se desloca) */
    <div className="min-w-0 rounded-lg border bg-card px-2.5 py-1">
      <div className={cn('whitespace-nowrap text-[14px] font-semibold tabular-nums leading-[18px]', cor)}>{valor}</div>
      <div className="h-[24px] text-[10px] leading-[12px] text-muted-foreground">{rotulo}</div>
    </div>
  );
}

export function ListaDosPastos({
  pastos, ficha, mes, onMes, mesDeHoje, erroDaFicha, onEditar, matricula, matriculaConferida,
}: ListaDosPastosProps) {
  const [ordem, setOrdem] = useState<{ coluna: ColunaDaLista; direcao: Direcao }>({ coluna: 'pasto', direcao: 'asc' });
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<FiltroDeVigencia>('vigentes');
  const [agrupar, setAgrupar] = useState<Agrupar>('nenhum');
  const quadro = useAlturaAteOFim({ folga: 28, minimo: 120 }); /* o pb-3 da PastosTab + o pé do pai (PASTO-CADASTRO-GEO-01: medido, a página não rola) */
  const [rolo, setRolo] = useState<HTMLDivElement | null>(null);
  const [disponivel, setDisponivel] = useState(0);
  useLayoutEffect(() => {
    if (!rolo) return;
    const ler = () => setDisponivel(rolo.clientWidth);
    ler();
    const obs = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(ler);
    obs?.observe(rolo);
    return () => obs?.disconnect();
  }, [rolo]);

  const todas = useMemo(() => montarLinhas(pastos, ficha), [pastos, ficha]);
  const pedido = useMemo(() => todas.reduce((m, l) => Math.max(m, pedidoDoNome(l), ...l.piquetes.map(pedidoDoNome)), 0), [todas]);
  const colPasto = colunaDoPasto(pedido, disponivel, LARGURA_DAS_OUTRAS);

  const filtradas = useMemo(() => {
    const porVigencia = filtrarPorVigencia(todas, filtro, mes);
    const t = busca.trim();
    if (!t) return porVigencia;
    const casa = (l: LinhaDaLista) => casaNaBusca(l.pasto.nome, t) || casaNaBusca(l.ficha.forrageira, t);
    return porVigencia.filter(l => casa(l) || l.piquetes.some(casa));
  }, [todas, filtro, mes, busca]);
  const ordenadas = useMemo(() => ordenarLinhas(filtradas, ordem.coluna, ordem.direcao, labelDoTipoUso), [filtradas, ordem]);
  /* o rodapé e o topo: SÓ os vigentes no mês (da lista à vista, com a busca) */
  const tot = useMemo(() => totaisPorPosse(filtradas, mes), [filtradas, mes]);
  const vigentesDoMes = useMemo(() => todas.filter(l => vigenteNoMes(l.pasto, mes) && l.pasto.tipo_uso !== 'divergencia'), [todas, mes]);
  const topo = useMemo(() => totaisPorPosse(vigentesDoMes, mes), [vigentesDoMes, mes]);
  const semDesenho = vigentesDoMes.filter(l => l.ficha.poligonos === 0).length;
  const bate = matricula != null && topo.propria.area != null && Math.abs(topo.propria.area - matricula) < 0.005;

  const ordenar = (c: ColunaDaLista) => setOrdem(o => (o.coluna === c
    ? { coluna: c, direcao: o.direcao === 'asc' ? 'desc' : 'asc' }
    : { coluna: c, direcao: COLUNAS_DE_TEXTO.has(c) || c === 'vigencia' ? 'asc' : 'desc' }));
  const alternar = (id: string) => setAbertos(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const grupos = useMemo(() => {
    if (agrupar === 'nenhum') return [{ chave: 'todos', rotulo: null as string | null, cor: '', linhas: ordenadas }];
    if (agrupar === 'posse') {
      return [{ chave: 'propria', rotulo: 'Própria', cor: 'text-foreground', linhas: ordenadas.filter(l => !ehArrendado(l.pasto)) },
        { chave: 'arrendada', rotulo: 'Arrendada', cor: 'text-amber-800', linhas: ordenadas.filter(l => ehArrendado(l.pasto)) }].filter(g => g.linhas.length > 0);
    }
    const ordemDoTipo = TIPOS_USO_OPTIONS_AGRUPADAS.flatMap(g => g.options.map(o => o.value));
    const familia = (t: string) => TIPOS_USO_OPTIONS_AGRUPADAS.find(g => g.grupo === grupoDoTipoUso(t))?.label ?? 'Fora da taxonomia';
    const porTipo = new Map<string, LinhaDaLista[]>();
    for (const l of ordenadas) porTipo.set(l.pasto.tipo_uso, [...(porTipo.get(l.pasto.tipo_uso) ?? []), l]);
    return [...porTipo.entries()]
      .sort(([a], [b]) => (ordemDoTipo.findIndex(t => t === a) + 1 || 999) - (ordemDoTipo.findIndex(t => t === b) + 1 || 999))
      .map(([tipo, linhas]) => ({ chave: tipo, rotulo: `${familia(tipo)} › ${labelDoTipoUso(tipo)}`, cor: corTextoDoTipoUso(tipo), linhas }));
  }, [agrupar, ordenadas]);

  const thClasse = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary');
  const colgroup = (
    <colgroup>
      {COLUNAS.map(k => <col key={k.c} style={k.c === 'pasto' ? { width: colPasto.px } : k.px ? { width: k.px } : undefined} />)}
      <col style={{ width: LARGURA_ACOES }} />
    </colgroup>
  );
  const nColunas = COLUNAS.length + 1;

  const linha = (l: LinhaDaLista) => {
    const p = l.pasto; const f = l.ficha;
    const aberto = abertos.has(p.id);
    const acima = acimaDoSuporte(f);
    const fora = !vigenteNoMes(p, mes);
    const encerrado = encerradoNoMes(p, mes);
    const vig = textoDaVigencia(p);
    return (
      <tr className={cn('border-b border-border/40 hover:bg-muted/40', l.ehPiquete ? 'bg-muted/20' : 'bg-card', fora && 'text-muted-foreground')}
        data-testid={l.ehPiquete ? 'linha-piquete' : 'linha-pasto'} data-encerrado={encerrado ? '' : undefined}>
        <td className={cn(TD_REGUA, 'whitespace-nowrap')} title={`${p.nome}${l.ehPiquete ? ' · piquete' : ''}${ehArrendado(p) ? ' · arrendado' : ''}`} data-testid="celula-nome">
          <span className={cn('flex items-center gap-0.5', l.ehPiquete && 'pl-4')} style={{ fontSize: colPasto.fontePx }}>
            {l.piquetes.length > 0 ? (
              <button type="button" onClick={() => alternar(p.id)} className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={aberto ? `Fechar os piquetes de ${p.nome}` : `Abrir os piquetes de ${p.nome}`} aria-expanded={aberto} data-testid="abrir-piquetes">
                {aberto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            ) : <span className={cn('shrink-0', l.ehPiquete ? 'w-0' : 'w-3')} />}
            <span className={cn('whitespace-nowrap', l.ehPiquete ? 'text-muted-foreground' : !fora && 'font-medium')}>{p.nome}</span>
            {ehArrendado(p) && <span className="ml-1.5 shrink-0 rounded bg-amber-100 px-1 text-[9.5px] leading-[14px] text-amber-800" data-testid="selo-arrendado">arrendado</span>}
            {l.piquetes.length > 0 && <span className="shrink-0 text-[9.5px] text-muted-foreground">· {l.piquetes.length} piq.</span>}
          </span>
        </td>
        <td className={TD_REGUA_TEXTO} title={labelDoTipoUso(p.tipo_uso)}>
          <span className="inline-flex items-center gap-1">
            <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', BOLINHA[p.tipo_uso] ?? 'bg-slate-400', fora && 'opacity-50')} />
            {labelDoTipoUso(p.tipo_uso)}
          </span>
        </td>
        <td className={TD_REGUA_NUM} title={l.areaDoCadastro != null ? `soma dos piquetes · cadastro do pasto: ${formatarAreaBR(l.areaDoCadastro)} ha` : undefined}>
          {area(l.area)}{l.areaDoCadastro != null && <span className="text-amber-700">*</span>}
        </td>
        <td className={TD_REGUA_TEXTO} title={f.forrageira ?? undefined}>{f.forrageira ?? '—'}</td>
        <td className={TD_REGUA_NUM}>{f.reformaAno ?? '—'}</td>
        <td className={TD_REGUA_NUM}>{dec2(f.suporte)}</td>
        <td className={cn(TD_REGUA_NUM, acima && !fora && 'font-semibold text-red-700')} title={acima ? 'Lotação acima do suporte' : undefined}>{dec2(f.lotacao)}</td>
        <td className={cn(TD_REGUA, 'whitespace-nowrap')} title={vig ? `${vig}${encerrado ? ' · encerrado' : ''}` : 'sem data: vale todos os meses'}>
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            {vig}
            {encerrado && <span className="rounded bg-muted px-1 text-[9.5px] leading-[14px] text-muted-foreground" data-testid="selo-encerrado">encerrado</span>}
          </span>
        </td>
        <td className={cn(TD_REGUA, 'whitespace-nowrap', f.poligonos === 0 && !fora && 'text-red-700')}>
          {f.poligonos == null ? '—' : f.poligonos > 0 ? '✓' : 'sem desenho'}
        </td>
        <td className={cn(TD_REGUA, 'text-right')}>
          <button type="button" onClick={() => onEditar(p.id)} title={`Abrir a ficha de ${p.nome}`} aria-label={`Abrir a ficha de ${p.nome}`}
            className="flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground" data-testid="editar-pasto">
            <Edit2 className="h-3 w-3" />
          </button>
        </td>
      </tr>
    );
  };

  /* uma linha do rodapé: o rótulo na coluna do Pasto, cada número na coluna dele */
  const linhaDoRodape = (rotulo: string, t: TotalDaPosse, forte: boolean, testid: string, comSuporte: boolean) => (
    <tr className={cn(forte ? 'font-semibold' : 'text-primary-foreground/85')} data-testid={testid}>
      <td className={cn(TD_REGUA, 'whitespace-nowrap', forte ? 'h-[22px]' : 'h-[19px]')} colSpan={2}>{rotulo}</td>
      <td className={TD_REGUA_NUM}>{area(t.area)}</td>
      <td className={TD_REGUA} /><td className={TD_REGUA} />
      <td className={TD_REGUA_NUM} title="média ponderada pela área">{comSuporte ? dec2(t.suporteMedio) : ''}</td>
      <td className={TD_REGUA_NUM} title="média ponderada pela área">{t.pastos > 0 ? dec2(t.lotacaoMedia) : ''}</td>
      <td className={TD_REGUA} colSpan={3} />
    </tr>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {/* os 5 números do topo (do mês escolhido) */}
      <div className="grid shrink-0 grid-cols-5 gap-2" data-testid="topo-pastos">
        <Numero valor={String(topo.total.pastos)} rotulo={`pastos vigentes em ${mesCurto(mes)}`} />
        <Numero valor={`${area(topo.propria.area)} ha`}
          rotulo={matricula == null ? 'própria · matrícula não informada' : bate ? `própria · bate matrícula${matriculaConferida ? ' ✓' : ' (não conferida)'}`
            : `própria · matrícula ${formatarAreaBR(matricula)} ha`} cor={matricula != null && !bate ? 'text-red-700' : undefined} />
        <Numero valor={`${area(topo.arrendada.area)} ha`} rotulo={`arrendada (${topo.arrendada.pastos} pasto${topo.arrendada.pastos === 1 ? '' : 's'})`} />
        <Numero valor={String(semDesenho)} rotulo="sem desenho no mapa" cor={semDesenho > 0 ? 'text-amber-700' : undefined} />
        <Numero valor={topo.propria.lotacaoMedia == null ? '—' : `${dec2(topo.propria.lotacaoMedia)} UA/ha`} rotulo={`lotação ${mesCurto(mes)} (própria)`} />
      </div>
      {/* filtro · mês · busca · agrupar */}
      <div className="flex h-7 shrink-0 items-center gap-2">
        <Segmentado altura={26} valor={filtro} onEscolher={setFiltro} opcoes={[
          { valor: 'vigentes', rotulo: 'Vigentes' }, { valor: 'encerrados', rotulo: 'Encerrados' }, { valor: 'todos', rotulo: 'Todos' }]} />
        <span className="text-[10px] text-muted-foreground">em</span>
        <CampoDoMes valor={mes} onMudar={(v) => { if (v) onMes(v); }} anos={anosDoCampo(mesDeHoje)} anoDeReferencia={Number(mesDeHoje.slice(0, 4))} testid="lista-mes" />
        <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pasto ou forrageira" aria-label="Buscar pasto ou forrageira"
          className="h-7 w-[200px] px-2 text-[10px]" data-testid="busca-pastos" />
        <span className="text-[10px] text-muted-foreground">Agrupar</span>
        <Segmentado altura={26} valor={agrupar} onEscolher={setAgrupar} opcoes={[
          { valor: 'nenhum', rotulo: 'Nenhum' }, { valor: 'destino', rotulo: 'Destino' }, { valor: 'posse', rotulo: 'Posse' }]} />
        <span className="min-w-0 flex-1 truncate text-[10px] text-red-700" title={erroDaFicha ?? undefined}>{erroDaFicha ?? ''}</span>
      </div>
      <div ref={quadro.ref} className={QUADRO_REGUA} style={{ height: quadro.altura }} data-testid="quadro-pastos">
        <div ref={setRolo} className="min-h-0 flex-1 overflow-auto" style={{ scrollbarGutter: 'stable' }} data-tabela-que-rola="">
          <table className="w-full table-fixed border-collapse" data-testid="lista-pastos">
            {colgroup}
            <thead>
              <tr>
                {COLUNAS.map(k => (
                  <ThOrdenavel key={k.c} coluna={k.c} rotulo={k.c === 'lotacao' ? `Lot. ${mesCurto(mes)}` : k.rotulo} ordem={ordem}
                    onOrdenar={ordenar} className={thClasse} alinhaDireita={k.direita} />
                ))}
                <th className={thClasse} aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {grupos.map(g => (
                <Fragment key={g.chave}>
                  {g.rotulo && (
                    <tr className="bg-muted/60" data-testid="linha-grupo">
                      <td colSpan={2} className={cn(TD_REGUA_TEXTO, 'font-semibold', g.cor)} title={g.rotulo}>
                        {g.rotulo} <span className="font-normal text-muted-foreground">· {g.linhas.length} pasto{g.linhas.length !== 1 ? 's' : ''}</span>
                      </td>
                      <td className={cn(TD_REGUA_NUM, 'font-semibold')}>{area(somaDasAreas(g.linhas.filter(l => vigenteNoMes(l.pasto, mes)).map(l => l.area)))}</td>
                      <td colSpan={nColunas - 3} className={TD_REGUA} />
                    </tr>
                  )}
                  {g.linhas.map(l => (
                    <Fragment key={l.pasto.id}>
                      {linha(l)}
                      {abertos.has(l.pasto.id) && l.piquetes.map(q => <Fragment key={q.pasto.id}>{linha(q)}</Fragment>)}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
              {ordenadas.length === 0 && (
                <tr><td colSpan={nColunas} className={cn(TD_REGUA, 'h-8 text-center text-muted-foreground')}>
                  {busca.trim() ? 'Nenhum pasto com esse nome ou forrageira.' : filtro === 'encerrados' ? `Nenhum pasto encerrado em ${mesCurto(mes)}.` : 'Nenhum pasto cadastrado.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* o rodapé PRESO no pé do quadro: Própria · Arrendada · Total, cada número na coluna dele (o mesmo colgroup) */}
        <div className={RODAPE_REGUA} style={{ scrollbarGutter: 'stable' }}>
          <table className="w-full table-fixed border-collapse">
            {colgroup}
            <tbody>
              {linhaDoRodape(`Própria · vigentes ${mesCurto(mes)}`, tot.propria, false, 'rodape-propria', true)}
              {linhaDoRodape(`Arrendada · vigentes ${mesCurto(mes)}`, tot.arrendada, false, 'rodape-arrendada', false)}
              {linhaDoRodape(`Total · ${tot.total.pastos} vigente${tot.total.pastos === 1 ? '' : 's'}${tot.naLista !== tot.total.pastos ? ` de ${tot.naLista} na lista` : ''}`,
                tot.total, true, 'rodape-pastos', false)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
