/**
 * MAPA-IMPRESSAO-01 (D2) — o PDF da folha, pelo @react-pdf. Só DESENHA a `FolhaPronta` (toda conta está em `montarFolha`).
 * Uma página do tamanho da folha; um SVG com `viewBox` em MILÍMETROS por cima de tudo (polígonos, grade, rótulos, painel: vetor, nítido
 * até no A0); a imagem do satélite (se houver) é a única coisa raster, por baixo, só no quadro.
 * ⚠ Este arquivo importa o motor: só se carrega por `import()` dinâmico (gerarPdfDoMapa).
 */
import { Document, Page, Image, Svg, Path, Rect, Line, Text, G, Circle, Font } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import type { Style } from '@react-pdf/types';
import { ESTILOS } from './classesDaFolha';
import type { FolhaPronta } from './montarFolha';
import type { FundoDaFolha } from './imagemDoFundo';

const PT = 72 / 25.4;
const NAVY = '#1F2A44';
const CINZA = '#5B6577';
const AMBAR = '#B26A00';
const VERDE = '#2E7D32';
export const FAMILIA = 'LiberationSans';

let registrada = false;
/** A fonte da folha (Liberation Sans, OFL, a do pdfjs): a Helvetica do PDF não tem "≈", "′" nem "–" em todas as leituras. */
export function registrarFonteDaFolha(f: { regular: string; negrito: string; italico: string; negritoItalico: string }) {
  if (registrada) return;
  Font.register({
    family: FAMILIA,
    fonts: [
      { src: f.regular, fontWeight: 400 }, { src: f.negrito, fontWeight: 700 },
      { src: f.italico, fontWeight: 400, fontStyle: 'italic' }, { src: f.negritoItalico, fontWeight: 700, fontStyle: 'italic' },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
  registrada = true;
}

const br2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Texto com contorno (o "halo" que separa a letra da imagem): o mesmo texto duas vezes, o de baixo com traço. */
function TextoComHalo(p: { x: number; y: number; t: string; corpo: number; cor: string; halo: string; negrito?: boolean; italico?: boolean; ancora?: 'start' | 'middle' | 'end' }) {
  const estilo = { fontFamily: FAMILIA, fontSize: p.corpo, fontWeight: p.negrito ? 700 : 400, fontStyle: p.italico ? 'italic' : 'normal' } satisfies Style;
  return (
    <G>
      <Text x={p.x} y={p.y} textAnchor={p.ancora ?? 'middle'} style={estilo} fill={p.halo} stroke={p.halo} strokeWidth={p.corpo * 0.28} strokeLinejoin="round">{p.t}</Text>
      <Text x={p.x} y={p.y} textAnchor={p.ancora ?? 'middle'} style={estilo} fill={p.cor}>{p.t}</Text>
    </G>
  );
}

function T(p: { x: number; y: number; t: string; corpo: number; cor?: string; negrito?: boolean; italico?: boolean; ancora?: 'start' | 'middle' | 'end' }) {
  return (
    <Text x={p.x} y={p.y} textAnchor={p.ancora ?? 'start'} fill={p.cor ?? NAVY}
      style={{ fontFamily: FAMILIA, fontSize: p.corpo, fontWeight: p.negrito ? 700 : 400, fontStyle: p.italico ? 'italic' : 'normal' }}>{p.t}</Text>
  );
}

export function FolhaDoMapaPdf({ folha, fundo, logo }: { folha: FolhaPronta; fundo: FundoDaFolha; logo: string | null }): ReactElement {
  const { layout, corpo } = folha;
  const { quadro: q, painel: pn, s } = layout;
  const naImagem = fundo.tipo === 'imagem';
  const elementos: ReactElement[] = [];
  let k = 0;
  const add = (e: ReactElement) => elementos.push(<G key={k++}>{e}</G>);

  /* fundo do quadro: o papel (com imagem, a imagem já está por baixo do SVG) */
  if (!naImagem) add(<Rect x={q.x} y={q.y} width={q.w} height={q.h} fill="#F4F1EA" />);

  /* polígonos */
  const desenhoDoMapa: ReactElement[] = [];
  folha.desenhos.forEach((d, i) => {
    const e = ESTILOS[d.classe];
    const borda = naImagem ? e.borda : e.bordaPapel;
    if (e.contorno) {
      desenhoDoMapa.push(<Path key={`d${i}`} d={d.caminho} fill="none" stroke={borda} strokeWidth={0.5 * s} strokeDasharray={`${2 * s} ${1.2 * s}`} />);
      return;
    }
    desenhoDoMapa.push(<Path key={`d${i}`} d={d.caminho} fill={e.cor} fillOpacity={naImagem ? e.opImagem : e.opPapel} fillRule="evenodd" />);
    if (d.hachuras.length) {
      desenhoDoMapa.push(
        <G key={`g${i}`}>
          {d.hachuras.map(([x1, y1, x2, y2], j) => <Line key={j} x1={x1} y1={y1} x2={x2} y2={y2} stroke={borda} strokeWidth={0.3 * s} />)}
        </G>,
      );
    }
    desenhoDoMapa.push(<Path key={`b${i}`} d={d.caminho} fill="none" stroke={borda} strokeWidth={(d.classe === 'pastagem' ? 0.45 : 0.32) * s} strokeLinejoin="round" />);
  });
  folha.divisoes.forEach((c, i) => desenhoDoMapa.push(
    <Path key={`v${i}`} d={c} fill="none" stroke={naImagem ? '#FFF6C8' : '#2F6B44'} strokeWidth={0.18 * s} strokeDasharray={`${0.8 * s} ${0.5 * s}`} />,
  ));

  /* grade E/N (linhas pelo quadro) */
  for (const l of folha.grade.linhas) {
    desenhoDoMapa.push(l.eixo === 'E'
      ? <Line key={`gE${l.valor}`} x1={l.pos} y1={q.y} x2={l.pos} y2={q.y + q.h} stroke={naImagem ? '#FFFFFF' : '#8A93A3'} strokeOpacity={0.6} strokeWidth={0.2 * s} strokeDasharray={`${1.2 * s} ${1.2 * s}`} />
      : <Line key={`gN${l.valor}`} x1={q.x} y1={l.pos} x2={q.x + q.w} y2={l.pos} stroke={naImagem ? '#FFFFFF' : '#8A93A3'} strokeOpacity={0.6} strokeWidth={0.2 * s} strokeDasharray={`${1.2 * s} ${1.2 * s}`} />);
  }

  /* rótulos */
  const corNome = naImagem ? '#FFFFFF' : NAVY;
  const corSub = naImagem ? '#FFF6C8' : '#2F3B52';
  const halo = naImagem ? '#1d2a1a' : '#FFFFFF';
  for (const r of folha.rotulos) {
    if (r.modo === 'oculto') continue;
    const completo = r.modo === 'completo' && r.sub;
    const yNome = completo ? r.y - 0.15 * corpo.nome : r.y + 0.35 * corpo.nome;
    desenhoDoMapa.push(<TextoComHalo key={`rn${r.id}`} x={r.x} y={yNome} t={r.nome} corpo={corpo.nome} cor={corNome} halo={halo} negrito />);
    if (completo && r.sub) {
      desenhoDoMapa.push(<TextoComHalo key={`rs${r.id}`} x={r.x} y={r.y + 0.95 * corpo.sub} t={r.sub} corpo={corpo.sub} cor={corSub} halo={halo} italico={folha.medidas.has(r.id)} />);
    }
  }
  /* tudo cabe no quadro por construção (a escala é a que cabe; a grade vai de borda a borda): sem recorte, que o @react-pdf não faz */
  add(<G>{desenhoDoMapa}</G>);

  /* moldura + rótulos da grade nas bordas */
  add(<Rect x={q.x} y={q.y} width={q.w} height={q.h} fill="none" stroke={NAVY} strokeWidth={0.5 * s} />);
  for (const l of folha.grade.linhas) {
    if (l.eixo === 'E' && l.pos > q.x + 14 * s && l.pos < q.x + q.w - 14 * s) {
      add(<TextoComHalo x={l.pos} y={q.y + 3.2 * s} t={l.rotulo} corpo={corpo.pequeno} cor={naImagem ? '#FFFFFF' : NAVY} halo={naImagem ? NAVY : '#FFFFFF'} />);
    }
    if (l.eixo === 'N' && l.pos > q.y + 8 * s && l.pos < q.y + q.h - 16 * s) {
      add(<TextoComHalo x={q.x + 1.2 * s} y={l.pos - 0.8 * s} t={l.rotulo} corpo={corpo.pequeno} cor={naImagem ? '#FFFFFF' : NAVY} halo={naImagem ? NAVY : '#FFFFFF'} ancora="start" />);
    }
  }

  /* norte verdadeiro (girado pela convergência) */
  const nx = q.x + q.w - 16 * s; const ny = q.y + 12 * s;
  add(
    <G>
      <Circle cx={nx} cy={ny} r={7.5 * s} fill="#FFFFFF" fillOpacity={0.88} stroke={NAVY} strokeWidth={0.3 * s} />
      <G transform={`rotate(${folha.norte.angulo.toFixed(3)} ${nx} ${ny})`}>
        <Path d={`M${nx} ${ny - 5.5 * s} L${nx + 2.4 * s} ${ny + 3.2 * s} L${nx} ${ny + 1.6 * s} Z`} fill={NAVY} />
        <Path d={`M${nx} ${ny - 5.5 * s} L${nx - 2.4 * s} ${ny + 3.2 * s} L${nx} ${ny + 1.6 * s} Z`} fill="#FFFFFF" stroke={NAVY} strokeWidth={0.25 * s} />
      </G>
      <T x={nx} y={ny + 6.4 * s} t="N" corpo={2.6 * s} negrito ancora="middle" />
    </G>,
  );

  /* escala gráfica */
  /* a escala gráfica fica ACIMA da faixa da atribuição (4,6 mm), que pode ocupar a largura toda do rodapé do mapa */
  const sx = q.x + 6 * s; const sy = q.y + q.h - 14 * s; const e = folha.escala;
  add(<Rect x={sx - 3 * s} y={sy - 5.5 * s} width={e.mm + 16 * s} height={11 * s} rx={0.8 * s} fill="#FFFFFF" fillOpacity={0.88} />);
  for (let i = 0; i < 4; i++) {
    add(<Rect x={sx + (e.mm * i) / 4} y={sy} width={e.mm / 4} height={1.6 * s} fill={i % 2 === 0 ? NAVY : '#FFFFFF'} stroke={NAVY} strokeWidth={0.25 * s} />);
  }
  e.marcas.forEach((m, i) => add(<T x={sx + m.pos} y={sy - 1 * s} t={m.rotulo} corpo={2.1 * s} ancora={i === 4 ? 'start' : 'middle'} />));
  add(<T x={sx} y={sy + 4.4 * s} t={`Escala ${folha.escalaTexto}`} corpo={2.1 * s} />);

  /* atribuição da imagem (Esri: "Powered by Esri" + Sources, canto de baixo à direita, fundo branco) */
  if (fundo.tipo === 'imagem') {
    const frase = `Powered by Esri · Sources: ${fundo.fontes} · Map image is the intellectual property of Esri and is used herein under license.`;
    const cp = 2.3 * s; const w = frase.length * cp * 0.5 + 3 * s;
    add(<Rect x={q.x + q.w - w} y={q.y + q.h - 4.6 * s} width={w} height={4.6 * s} fill="#FFFFFF" fillOpacity={0.75} />);
    add(<T x={q.x + q.w - 1.2 * s} y={q.y + q.h - 1.5 * s} t={frase} corpo={cp} cor="#323232" ancora="end" />);
  }

  /* ---- painel ---- */
  add(<Rect x={pn.x} y={pn.y} width={pn.w} height={pn.h} fill="none" stroke={NAVY} strokeWidth={0.5 * s} />);
  add(<Rect x={pn.x} y={pn.y} width={pn.w} height={13 * s} fill={NAVY} />);
  add(<T x={pn.x + 4 * s} y={pn.y + 6 * s} t="MAPA DA FAZENDA" corpo={4.2 * s} cor="#FFFFFF" negrito />);
  add(<T x={pn.x + 4 * s} y={pn.y + 10.6 * s} t={`Pastos e áreas · ${folha.identificacao.find(([r]) => r === 'Dados de')?.[1] ?? ''}`} corpo={2.8 * s} cor="#C9D3E6" />);
  let y = pn.y + 20 * s;
  const x0 = pn.x + 4 * s; const x1 = pn.x + pn.w - 4 * s;
  const titulo = (t: string) => {
    add(<T x={x0} y={y} t={t} corpo={corpo.titulo} negrito />);
    add(<Line x1={x0} y1={y + 1.2 * s} x2={x1} y2={y + 1.2 * s} stroke={NAVY} strokeWidth={0.25 * s} />);
    y += 5.5 * s;
  };

  titulo('Identificação');
  for (const [rot, val] of folha.identificacao) {
    add(<T x={x0} y={y} t={rot} corpo={corpo.texto} cor={CINZA} />);
    add(<T x={x0 + 21 * s} y={y} t={val} corpo={corpo.texto} negrito />);
    y += 4.1 * s;
  }
  add(<T x={x0} y={y} t={folha.norte.frase} corpo={corpo.pequeno} cor={CINZA} />);
  y += 6 * s;

  titulo('Legenda');
  for (const c of folha.legenda) {
    const st = ESTILOS[c];
    if (st.contorno) {
      add(<Rect x={x0} y={y - 2.6 * s} width={6 * s} height={3.4 * s} fill="none" stroke={NAVY} strokeWidth={0.4 * s} strokeDasharray={`${1.2 * s} ${0.8 * s}`} />);
    } else {
      add(<Rect x={x0} y={y - 2.6 * s} width={6 * s} height={3.4 * s} fill={st.cor} fillOpacity={Math.max(st.opPapel, 0.45)} stroke="#555555" strokeWidth={0.3 * s} />);
      if (st.hachura) for (let i = 0; i < 5; i++) add(<Line x1={x0 + i * 1.5 * s} y1={y + 0.8 * s} x2={x0 + Math.min(6, i * 1.5 + 3.4) * s} y2={y + 0.8 * s - Math.min(3.4, 6 - i * 1.5) * s} stroke="#B9E39A" strokeWidth={0.3 * s} />);
    }
    add(<T x={x0 + 8 * s} y={y} t={st.rotulo} corpo={corpo.texto} />);
    y += 4.6 * s;
  }
  add(<T x={x0} y={y} t="“67,75 ha” = área do cadastro (a do mês)." corpo={corpo.pequeno} cor={CINZA} />); y += 3.4 * s;
  add(<T x={x0} y={y} t="“≈ 12,3 ha” = medida do desenho (sem área no cadastro)." corpo={corpo.pequeno} cor={CINZA} italico />); y += 3.4 * s;
  add(<T x={x0} y={y} t="“—” = pasto sem área no cadastro." corpo={corpo.pequeno} cor={CINZA} />); y += 6 * s;

  titulo('Resumo de áreas (ha)');
  const r = folha.resumo;
  const colV = x1 - 18 * s;
  add(<T x={colV} y={y} t="ha" corpo={2.2 * s} cor={CINZA} ancora="end" />);
  add(<T x={x1} y={y} t="% matr." corpo={2.2 * s} cor={CINZA} ancora="end" />);
  y += 4 * s;
  for (const l of r.linhas) {
    add(<T x={x0} y={y} t={l.rotulo} corpo={2.6 * s} />);
    add(<T x={colV} y={y} t={l.ha == null ? '—' : br2(l.ha)} corpo={2.6 * s} negrito ancora="end" />);
    add(<T x={x1} y={y} t={l.ha == null || !r.matricula ? '—' : `${br1((l.ha / r.matricula) * 100)}%`} corpo={2.4 * s} cor={CINZA} ancora="end" />);
    y += 4.4 * s;
  }
  add(<Line x1={x0} y1={y - 2.6 * s} x2={x1} y2={y - 2.6 * s} stroke={NAVY} strokeWidth={0.2 * s} />);
  y += 0.6 * s;
  const dif = r.diferenca == null ? '—' : r.confere ? 'confere' : `${r.diferenca > 0 ? '+' : '−'}${br2(Math.abs(r.diferenca))}`;
  const linhasFim: [string, string, string][] = [
    ['Soma dos pastos', br2(r.soma), NAVY],
    ['Matrícula', r.matricula == null ? '—' : br2(r.matricula), NAVY],
    ['Diferença', dif, r.diferenca == null ? CINZA : r.confere ? VERDE : AMBAR],
  ];
  for (const [rot, val, cor] of linhasFim) {
    add(<T x={x0} y={y} t={rot} corpo={2.6 * s} cor={cor} negrito />);
    add(<T x={colV} y={y} t={val} corpo={2.6 * s} cor={cor} negrito ancora="end" />);
    y += 4.4 * s;
  }
  y += 1 * s;
  /* a medida do desenho só do que FOI desenhado (sem polígono do tipo = não se escreve "≈ 0,0": ausência não é zero) */
  const desenhado = [r.desenho.reserva > 0 ? `reserva ≈ ${br1(r.desenho.reserva)} ha` : null, r.desenho.app > 0 ? `APP ≈ ${br1(r.desenho.app)} ha` : null]
    .filter((t): t is string => t !== null);
  const informativas = [
    'Pasto dividido = a unidade do mês (o pai ou a soma dos piquetes).',
    ...(desenhado.length ? [`Desenhado (informativo): ${desenhado.join(' · ')}.`] : []),
  ];
  for (const t of informativas) { add(<T x={x0} y={y} t={t} corpo={corpo.pequeno} cor={CINZA} />); y += 3.2 * s; }
  y += 1.5 * s;
  /* notas (nome que não coube, sem desenho, sem satélite): quebradas em linhas que cabem no painel */
  const notas = [...folha.notas, ...(fundo.tipo === 'papel' && fundo.motivo ? [fundo.motivo] : [])];
  const porLinha = Math.floor((pn.w - 8 * s) / (corpo.pequeno * 0.5));
  for (const n of notas) {
    for (const l of quebrar(n, porLinha)) {
      if (y > pn.y + pn.h - 26 * s) break;
      add(<T x={x0} y={y} t={l} corpo={corpo.pequeno} cor={AMBAR} />); y += 3.1 * s;
    }
    y += 1 * s;
  }

  /* rodapé do painel */
  add(<T x={x1} y={pn.y + pn.h - 13 * s} t="AGROinBLUE" corpo={2.3 * s} negrito ancora="end" />);
  add(<T x={x1} y={pn.y + pn.h - 9.4 * s} t={`gerado em ${folha.identificacao.find(([rot]) => rot === 'Data')?.[1] ?? ''}`} corpo={2.1 * s} cor={CINZA} ancora="end" />);
  add(<T x={x1} y={pn.y + pn.h - 6 * s} t="dados do sistema, sem edição" corpo={2.1 * s} cor={CINZA} ancora="end" />);

  const W = layout.largura * PT; const H = layout.altura * PT;
  return (
    <Document title={`Mapa da fazenda · ${folha.identificacao[1]?.[1] ?? ''}`} author="AGROinBLUE" creator="AGROinBLUE">
      <Page size={{ width: W, height: H }} style={{ backgroundColor: '#FFFFFF' }}>
        {fundo.tipo === 'imagem' && fundo.blocos.map((b, i) => (
          <Image key={i} src={b.dados} style={{ position: 'absolute', left: (q.x + b.x) * PT, top: (q.y + b.y) * PT, width: b.w * PT, height: b.h * PT }} />
        ))}
        {logo && <Image src={logo} style={{ position: 'absolute', left: (pn.x + 4 * s) * PT, top: (pn.y + pn.h - 22 * s) * PT, width: 34 * s * PT, height: 14 * s * PT, objectFit: 'contain' }} />}
        <Svg width={W} height={H} viewBox={`0 0 ${layout.largura} ${layout.altura}`} style={{ position: 'absolute', left: 0, top: 0 }}>
          {elementos}
        </Svg>
      </Page>
    </Document>
  );
}

/** Quebra uma frase em linhas de até `n` letras, nas palavras. */
export function quebrar(frase: string, n: number): string[] {
  const linhas: string[] = [];
  let atual = '';
  for (const p of frase.split(' ')) {
    if (atual && (atual + ' ' + p).length > n) { linhas.push(atual); atual = p; } else atual = atual ? `${atual} ${p}` : p;
  }
  if (atual) linhas.push(atual);
  return linhas;
}
