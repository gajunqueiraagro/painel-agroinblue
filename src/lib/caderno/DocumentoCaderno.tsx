/**
 * CADERNO-CAMPO-01 peça 1 — o PDF do "Exportar mês" (react-pdf), no desenho do mock v3 aprovado (Gabriel 04/11 10:21).
 * ⚠ SÓ DESENHA: recebe o `CadernoDoMes` pronto (`cadernoDoMes.ts`) e não faz conta. Zero = célula vazia; "—" = o sistema não tem o dado.
 * A4: a Conciliação e o Mapa em paisagem; as listas e a Chuva em retrato (D7). Fonte padrão (Helvetica); nada monoespaçado.
 */
import { Document, Page, View, Text } from '@react-pdf/renderer';
import {
  CATEGORIAS_DO_CADERNO, MESES_CURTOS, TRACO, celula, type CadernoDoMes, type LinhaDaConciliacao, type ListaDoAno,
} from '@/lib/caderno/cadernoDoMes';

const NAVY = '#1f2a44';
const BORDA = '#8c96a3';
const FUNDO_CAB = '#eef1f5';
const ENT = '#f1f6fc', ENT_TIT = '#cfe0f5', ENT_TOT = '#dce8f7';
const SAI = '#fdf3ea', SAI_TIT = '#f7dcc6', SAI_TOT = '#f9e3d1';
const MES = '#fff3cd';
const F = 8.5;

const pagina = { paddingTop: 22, paddingBottom: 30, paddingHorizontal: 22, fontFamily: 'Helvetica', color: NAVY, fontSize: F };

interface Coluna { largura?: number; direita?: boolean }
interface Estilo { fundo?: string; cor?: string; negrito?: boolean; tamanho?: number; altura?: number }
/** a largura útil da folha (A4 menos as margens de 22pt): paisagem e retrato */
const UTIL_PAISAGEM = 798;
const UTIL_RETRATO = 551;
/** toda coluna com largura em pontos: a que não tem divide o que sobra (flex deixava fresta entre as bordas) */
function comLarguras(cols: Coluna[], util: number): Coluna[] {
  const fixas = cols.reduce((s, c) => s + (c.largura ?? 0), 0);
  const livres = cols.filter((c) => c.largura == null).length;
  const sobra = livres ? Math.floor(((util - fixas) / livres) * 10) / 10 : 0;
  return cols.map((c) => ({ ...c, largura: c.largura ?? sobra }));
}
const semHifen = (palavra: string): string[] => [palavra];

function Linha({ celulas, colunas, estilo, cabecalho }: { celulas: string[]; colunas: Coluna[]; estilo?: Estilo; cabecalho?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: estilo?.fundo ?? (cabecalho ? FUNDO_CAB : undefined), borderBottomWidth: 0.5, borderColor: BORDA }} wrap={false}>
      {celulas.map((c, i) => (
        <View key={i} style={{
          width: colunas[i]?.largura,
          borderLeftWidth: i === 0 ? 0.7 : 0, borderRightWidth: 0.7, borderColor: BORDA, paddingHorizontal: 3, paddingVertical: estilo?.altura ?? 2.2,
        }}>
          <Text hyphenationCallback={semHifen} style={{
            fontSize: estilo?.tamanho ?? (cabecalho ? F - 0.5 : F), fontFamily: estilo?.negrito || cabecalho ? 'Helvetica-Bold' : 'Helvetica',
            color: estilo?.cor ?? NAVY, textAlign: colunas[i]?.direita ? 'right' : 'left',
          }}>{c}</Text>
        </View>
      ))}
    </View>
  );
}

function Cabeca({ titulo, sub }: { titulo: string; sub: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1.5, borderColor: NAVY, paddingBottom: 5, marginBottom: 7 }}>
      <View>
        <Text style={{ fontSize: 15, fontFamily: 'Helvetica-Bold' }}>{titulo}</Text>
        <Text style={{ fontSize: 9, color: '#444', marginTop: 2 }}>{sub}</Text>
      </View>
      <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold' }}>AGROinBLUE</Text>
    </View>
  );
}

function Rodape({ k, folha }: { k: CadernoDoMes; folha: string }) {
  return (
    <View fixed style={{ position: 'absolute', bottom: 12, left: 22, right: 22, flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 8, color: '#555' }}>Gerado pelo AGROinBLUE em {k.geradoEm}</Text>
      <Text style={{ fontSize: 8, color: '#555' }} render={({ pageNumber, totalPages }) => `${folha} · ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

const Nota = ({ children }: { children: string }) => <Text style={{ fontSize: 8.5, color: '#444', marginTop: 6 }}>{children}</Text>;

const mesAno = (k: CadernoDoMes) => `${MESES_CURTOS[k.mes - 1].toLowerCase()}/${String(k.ano).slice(2)}`;
const sub = (k: CadernoDoMes, resto: string) => `${k.fazenda} · ${k.cliente} · ${resto}`;

/* ---------------------------------------------------------------- Conciliação ---------------------------------------------------------------- */
function FolhaConciliacao({ k }: { k: CadernoDoMes }) {
  const c = k.conciliacao;
  const cols = comLarguras([{ largura: 130 }, ...Array.from({ length: 13 }, () => ({ direita: true }))], UTIL_PAISAGEM);
  /* os meses depois do escolhido ficam VAZIOS (fora do recorte, não "sem dado") */
  const valores = (l: LinhaDaConciliacao) => [l.rotulo, ...l.meses.map((v, i) => (i + 1 > k.mes ? '' : celula(v))), celula(l.ano)];
  const forte: Estilo = { fundo: NAVY, cor: '#fff', negrito: true, tamanho: 10 };
  const titulo = (t: string, fundo: string) => <Linha celulas={[t, ...Array<string>(13).fill('')]} colunas={cols} estilo={{ fundo, negrito: true }} />;
  return (
    <Page size="A4" orientation="landscape" style={pagina}>
      <Cabeca titulo={`Conciliação do Rebanho · ${k.ano}`} sub={sub(k, `até ${mesAno(k)} · cabeças`)} />
      <Linha cabecalho celulas={['', ...MESES_CURTOS, 'Ano']} colunas={cols} />
      <Linha celulas={valores(c.saldoInicial)} colunas={cols} estilo={forte} />
      {titulo('Entradas', ENT_TIT)}
      {c.entradas.map((l) => <Linha key={l.rotulo} celulas={valores(l)} colunas={cols} estilo={{ fundo: ENT }} />)}
      <Linha celulas={valores(c.totalEntradas)} colunas={cols} estilo={{ fundo: ENT_TOT, negrito: true }} />
      {titulo('Saídas', SAI_TIT)}
      {c.saidas.map((l) => <Linha key={l.rotulo} celulas={valores(l)} colunas={cols} estilo={{ fundo: SAI }} />)}
      <Linha celulas={valores(c.totalSaidas)} colunas={cols} estilo={{ fundo: SAI_TOT, negrito: true }} />
      <Linha celulas={valores(c.saldoFinal)} colunas={cols} estilo={forte} />
      <View style={{ height: 2, backgroundColor: NAVY }} />
      <Linha celulas={valores(c.saldoNoMapa)} colunas={cols} />
      <Linha celulas={valores(c.diferenca)} colunas={cols} estilo={{ negrito: true }} />
      <Nota>Saldo final = saldo inicial + total de entradas - total de saídas: a mesma conta do Fechamento do mês. "Saldo no mapa" = a contagem dos pastos no fechamento do mês; "Diferença" = mapa - saldo final. Em branco = zero; "—" = sem dado.</Nota>
      <Rodape k={k} folha="Conciliação" />
    </Page>
  );
}

/* ---------------------------------------------------------------- Mapa do Rebanho ---------------------------------------------------------------- */
function FolhaMapa({ k }: { k: CadernoDoMes }) {
  const m = k.mapa;
  const cols = comLarguras([{ largura: 74 }, { largura: 42, direita: true }, { largura: 112 }, { largura: 20 },
    ...CATEGORIAS_DO_CADERNO.map(() => ({ direita: true })), { largura: 50, direita: true }], UTIL_PAISAGEM);
  const fino: Estilo = { tamanho: 7.8, altura: 1.3 };
  return (
    <Page size="A4" orientation="landscape" style={pagina}>
      <Cabeca titulo={`Mapa do Rebanho · ${mesAno(k)}`} sub={sub(k, 'fechamento de pastos do mês · quantidade e peso médio (kg)')} />
      <View fixed>
        <Linha cabecalho celulas={['Pasto', 'Área ha', 'Lote', '', ...CATEGORIAS_DO_CADERNO.map((c) => c.rotulo), 'Total cab.']} colunas={cols} estilo={{ altura: 1.6 }} />
      </View>
      {m.linhas.map((l, i) => (
        <View key={i} wrap={false}>
          <Linha celulas={[l.pasto, celula(l.areaHa, 2), l.lote, 'cab', ...CATEGORIAS_DO_CADERNO.map((c) => celula(l.porCategoria[c.codigo]?.quantidade ?? 0)), celula(l.total)]}
            colunas={cols} estilo={fino} />
          <Linha celulas={['', '', '', 'kg', ...CATEGORIAS_DO_CADERNO.map((c) => {
            const v = l.porCategoria[c.codigo];
            return v ? (v.pesoMedioKg == null ? TRACO : celula(Math.round(v.pesoMedioKg))) : '';
          }), '']} colunas={cols} estilo={{ ...fino, cor: '#555', tamanho: 7 }} />
        </View>
      ))}
      <Linha celulas={['Total', celula(m.areaHa, 2), '', 'cab', ...CATEGORIAS_DO_CADERNO.map((c) => celula(m.totalPorCategoria[c.codigo] ?? 0)), celula(m.total)]}
        colunas={cols} estilo={{ fundo: NAVY, cor: '#fff', negrito: true, altura: 1.6 }} />
      <Nota>Só os pastos de pecuária do mês. Mais de um lote no pasto = uma linha por lote. Peso = o peso médio da categoria no lote.</Nota>
      <Rodape k={k} folha="Mapa do Rebanho" />
    </Page>
  );
}

/* ---------------------------------------------------------------- Listas ---------------------------------------------------------------- */
const LARGURAS: Record<string, number> = { Data: 54, 'Quantidade cab.': 52, 'Peso kg': 44, Operação: 70, Evento: 50, Sexo: 30, Raça: 40, Lote: 50, Pasto: 46, Safra: 40 };

function FolhaLista({ k, l, folha }: { k: CadernoDoMes; l: ListaDoAno; folha: string }) {
  const larga = l.cabecalho.length - 1;
  const cols = comLarguras(l.cabecalho.map((h, i) => ({
    largura: i === larga ? undefined : LARGURAS[h] ?? 72,
    direita: h === 'Data' || h === 'Quantidade cab.' || h === 'Peso kg',
  })), UTIL_RETRATO);
  return (
    <Page size="A4" style={pagina}>
      <Cabeca titulo={`${l.titulo} · ${k.ano}`} sub={sub(k, `do início do ano até ${mesAno(k)} · ${mesAno(k)} em destaque`)} />
      <View fixed><Linha cabecalho celulas={l.cabecalho} colunas={cols} /></View>
      {l.linhas.length === 0 ? <Text style={{ fontSize: F, marginTop: 6 }}>Nenhum lançamento no período.</Text> : null}
      {l.linhas.map((r, i) => (
        <Linha key={i} celulas={[r.data, ...r.colunas]} colunas={cols} estilo={r.mes === k.mes ? { fundo: MES, negrito: true } : undefined} />
      ))}
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold' }}>{`${mesAno(k)}: ${celula(l.totalCabNoMes) || 'nenhum'}${l.totalCabNoMes ? ' cab.' : ''}   ·   Ano: ${celula(l.totalCab) || 'nenhum'}${l.totalCab ? ' cab.' : ''}`}</Text>
      </View>
      {l.nota ? <Nota>{l.nota}</Nota> : null}
      <Rodape k={k} folha={folha} />
    </Page>
  );
}

function FolhaPesagens({ k }: { k: CadernoDoMes }) {
  return (
    <Page size="A4" style={pagina}>
      <Cabeca titulo={`Pesagens · ${k.ano}`} sub={sub(k, `até ${mesAno(k)}`)} />
      <Linha cabecalho celulas={['Data', 'Manejo', 'Pasto origem', 'Quantidade cab.', 'Peso kg', 'Pasto destino', 'Quantidade cab.', 'Peso kg']}
        colunas={comLarguras([{ largura: 54 }, { largura: 60 }, {}, { largura: 52 }, { largura: 44 }, {}, { largura: 52 }, { largura: 44 }], UTIL_RETRATO)} />
      <Nota>O sistema ainda não guarda pesagens: a folha sai vazia até existir o registro.</Nota>
      <Rodape k={k} folha="Pesagens" />
    </Page>
  );
}

/* ---------------------------------------------------------------- Chuva ---------------------------------------------------------------- */
function FolhaChuva({ k }: { k: CadernoDoMes }) {
  const ch = k.chuva;
  const cols = comLarguras([{ largura: 30, direita: true }, ...Array.from({ length: 12 }, () => ({ direita: true }))], UTIL_RETRATO);
  const colsH = comLarguras([{ largura: 34, direita: true }, ...Array.from({ length: 13 }, () => ({ direita: true }))], UTIL_RETRATO);
  const mm = (v: number | null) => (v == null ? '' : celula(v, v % 1 ? 1 : 0));
  return (
    <Page size="A4" style={pagina}>
      <Cabeca titulo={`Chuva · ${k.ano} (mm)`} sub={sub(k, `dia × mês até ${mesAno(k)}, total, acumulado e histórico`)} />
      <Linha cabecalho celulas={['Dia', ...MESES_CURTOS]} colunas={cols} />
      {ch.grade.map((dias, d) => <Linha key={d} celulas={[String(d + 1), ...dias.map(mm)]} colunas={cols} estilo={{ tamanho: F - 0.5 }} />)}
      <Linha celulas={['Total', ...ch.total.map((v) => (v == null ? '' : mm(v)))]} colunas={cols} estilo={{ fundo: NAVY, cor: '#fff', negrito: true }} />
      <Linha celulas={['Acum.', ...ch.acumulado.map((v) => (v == null ? '' : mm(v)))]} colunas={cols} />
      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 8, marginBottom: 3 }}>Histórico (mm)</Text>
      <Linha cabecalho celulas={['Ano', ...MESES_CURTOS, 'Total']} colunas={colsH} />
      {ch.historico.map((h) => <Linha key={h.ano} celulas={[String(h.ano), ...h.meses.map(mm), h.total == null ? '' : mm(h.total)]} colunas={colsH} />)}
      <Nota>{`${ch.diasComChuva} dias com chuva no ano até ${mesAno(k)}. Em branco = sem chuva lançada.`}</Nota>
      <Rodape k={k} folha="Chuva" />
    </Page>
  );
}

export function DocumentoCaderno({ caderno: k }: { caderno: CadernoDoMes }) {
  const L = k.listas;
  return (
    <Document title={`Caderno de campo · ${k.fazenda} · ${mesAno(k)}`} author="AGROinBLUE">
      {k.folhas.map((f) => {
        switch (f) {
          case 'conciliacao': return <FolhaConciliacao key={f} k={k} />;
          case 'mapa': return <FolhaMapa key={f} k={k} />;
          case 'entradas': return <FolhaLista key={f} k={k} l={L.entradas} folha="Entradas" />;
          case 'saidas': return <FolhaLista key={f} k={k} l={L.saidas} folha="Saídas" />;
          case 'nascimentos': return <FolhaLista key={f} k={k} l={L.nascimentos} folha="Nascimentos" />;
          case 'mortes': return <FolhaLista key={f} k={k} l={L.mortes} folha="Mortes" />;
          case 'desmamas': return <FolhaLista key={f} k={k} l={L.desmamas} folha="Desmamas" />;
          case 'engorda': return <FolhaLista key={f} k={k} l={L.engorda} folha="Engorda" />;
          case 'pesagens': return <FolhaPesagens key={f} k={k} />;
          case 'chuva': return <FolhaChuva key={f} k={k} />;
          default: return null;
        }
      })}
    </Document>
  );
}
