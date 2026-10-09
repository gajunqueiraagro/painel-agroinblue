/**
 * DocumentoCpr — CPR-EXPORT-01. A folha "Contas a Pagar e Receber" (react-pdf), no chassi do PDF executivo
 * (`PdfHeader`, `PdfRodape`, `estilos`, `COR`). A4 PAISAGEM: a tabela tem até doze colunas.
 *
 * ⚠ SÓ DESENHA. Recebe o `ModeloCpr` (texto pronto, vindo do dono pela tela) e não faz conta nenhuma: nenhuma soma, nenhum
 * filtro, nenhuma regra de sinal — a seta e o tom já vêm em cada célula. Há teste de fonte que prende isso.
 */
import { Document, Page, View, Text, Svg, Polygon, Path, Line, Rect, Circle, G } from '@react-pdf/renderer';
import { estilos, COR } from '@/lib/pdf/analise/estilos';
import { PdfHeader, PdfRodape } from '@/lib/pdf/analise/PdfHeader';
import type { ModeloCpr, CelulaValorCpr, ContaDaFolha, FaixaDaFolha, BlocoSimplesDaFolha } from '@/lib/pdf/cpr/modeloCpr';
import type { GraficoDaFolha, NoDoGrafico } from '@/lib/pdf/cpr/graficoDoDom';
import { hexDoStatus } from '@/lib/financeiro/statusFinanceiro';

const F = 7;
/** A régua da tabela, em pontos (A4 paisagem: 798 úteis). A Descrição é o que sobra. Número, data e status não cortam. */
const W = { comp: 26, venc: 38, conta: 64, fornecedor: 112, subcentro: 104, safra: 46, faz: 24, status: 50, pagar: 70, receber: 70, saldo: 80 };
/** com a coluna Conta ("Todas as contas") Fornecedor e Subcentro cedem, para a Descrição não cair abaixo de ~125pt */
const W_COM_CONTA = { fornecedor: 100, subcentro: 94 };
const wForn = (comConta: boolean) => (comConta ? W_COM_CONTA.fornecedor : W.fornecedor);
const wSub = (comConta: boolean) => (comConta ? W_COM_CONTA.subcentro : W.subcentro);
const TOM: Record<CelulaValorCpr['tom'], string> = { neg: COR.vermelho, pos: COR.verde, apagado: '#9aa5b1', neutro: COR.cinza };
const FUNDO_DIA = '#e3e8ef';
const FUNDO_VENCIDOS = '#f9e9e9';
const FUNDO_NEGATIVO = '#f6d5d5';
/** texto que corta com reticência, numa linha só */
const corta: { maxLines: number; textOverflow: 'ellipsis' } = { maxLines: 1, textOverflow: 'ellipsis' };
/** sem hifenização: o texto corta na palavra, com reticência — o motor partia "San-…" no meio */
const semHifen = (palavra: string): string[] => [palavra];
/** Uma célula de TEXTO que corta: a caixa tem a largura da coluna e o texto para 5pt ANTES da coluna vizinha. */
/** O lugar do "i/N" da parcela, dentro da coluna Descrição: fixo, para o nome cortar ANTES dele. */
const W_PARCELA = 26;

function Corta({ texto, largura, cor, tamanho = F }: { texto: string; largura?: number; cor: string; tamanho?: number }) {
  return (
    <View style={largura == null ? { flex: 1, paddingRight: 5 } : { width: largura, paddingRight: 5 }}>
      <Text hyphenationCallback={semHifen} style={{ ...corta, fontSize: tamanho, color: cor }}>{texto}</Text>
    </View>
  );
}

function Seta({ sentido, cor }: { sentido: 'cima' | 'baixo'; cor: string }) {
  return (
    <Svg width={5} height={5} style={{ marginRight: 2, marginTop: 1.2 }}>
      <Polygon points={sentido === 'cima' ? '2.5,0.4 5,4.6 0,4.6' : '0,0.4 5,0.4 2.5,4.6'} fill={cor} />
    </Svg>
  );
}

function Valor({ c, largura, negrito, corFixa }: { c: CelulaValorCpr | null; largura: number; negrito?: boolean; corFixa?: string }) {
  if (!c) return <View style={{ width: largura }} />;
  const cor = corFixa ?? TOM[c.tom];
  return (
    <View style={{ width: largura, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingRight: 3, paddingVertical: c.destaque ? 0.6 : 0, backgroundColor: c.destaque ? FUNDO_NEGATIVO : undefined, borderRadius: 1 }}>
      {c.seta ? <Seta sentido={c.seta} cor={cor} /> : null}
      <Text style={{ fontSize: F, color: cor, fontWeight: negrito ? 700 : 400 }}>{c.texto}</Text>
    </View>
  );
}

function CabecalhoDaTabela({ comConta, fixo }: { comConta: boolean; fixo?: boolean }) {
  const h: { fontSize: number; color: string; fontWeight: 700 } = { fontSize: F, color: COR.branco, fontWeight: 700 };
  return (
    <View fixed={fixo} style={{ flexDirection: 'row', backgroundColor: COR.azul, paddingVertical: 3, paddingHorizontal: 4 }}>
      <Text style={{ ...h, width: W.comp }}>Comp.</Text>
      <Text style={{ ...h, width: W.venc }}>Venc.</Text>
      {comConta ? <Text style={{ ...h, width: W.conta }}>Conta</Text> : null}
      <Text style={{ ...h, flex: 1 }}>Descrição</Text>
      <Text style={{ ...h, width: wForn(comConta) }}>Fornecedor</Text>
      <Text style={{ ...h, width: wSub(comConta) }}>Subcentro</Text>
      <Text style={{ ...h, width: W.safra }}>Safra</Text>
      <Text style={{ ...h, width: W.faz }}>Faz.</Text>
      <Text style={{ ...h, width: W.status, textAlign: 'center' }}>Status</Text>
      <Text style={{ ...h, width: W.pagar, textAlign: 'right', paddingRight: 3 }}>A pagar</Text>
      <Text style={{ ...h, width: W.receber, textAlign: 'right', paddingRight: 3 }}>A receber</Text>
      <Text style={{ ...h, width: W.saldo, textAlign: 'right', paddingRight: 3 }}>Saldo</Text>
    </View>
  );
}

function LinhaDaConta({ c, comConta, zebra }: { c: ContaDaFolha; comConta: boolean; zebra: boolean }) {
  const t = { fontSize: F, color: COR.cinzaMedio };
  const apagada = c.paga || c.foraDoCaixa ? 0.55 : 1;
  return (
    <View wrap={false} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 1.5, paddingHorizontal: 4, backgroundColor: zebra ? COR.zebra : COR.branco, borderBottomWidth: 0.3, borderBottomColor: COR.separador }}>
      <Text style={{ ...t, width: W.comp }}>{c.comp}</Text>
      <Text style={{ ...t, width: W.venc }}>{c.venc}</Text>
      {comConta ? <Corta texto={c.conta} largura={W.conta} cor={COR.cinzaMedio} /> : null}
      {/* PARC-LIVRES-01 passo 5 — parcela de parcelamento: o nome corta e o "i/N" (do contrato) fica inteiro.
          ⚠ O "i/N" TEM LUGAR PROPRIO DE LARGURA FIXA (fechamento C): com `flexShrink` no nome, o motor do PDF nao encolhia o texto e
          o "1/3" saia POR CIMA do nome cortado — so' o PDF gerado de verdade mostrou. 26pt cabem "24/24" a 7pt (20,4pt medidos). */}
      {c.parcela ? (
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingRight: 5 }}>
          <View style={{ flex: 1, paddingRight: 2 }}><Text hyphenationCallback={semHifen} style={{ ...corta, fontSize: F, color: COR.cinza }}>{c.descricao}</Text></View>
          <Text style={{ width: W_PARCELA, fontSize: F, color: COR.cinza, textAlign: 'right' }}>{c.parcela}</Text>
        </View>
      ) : <Corta texto={c.descricao} cor={COR.cinza} />}
      <Corta texto={c.fornecedor} largura={wForn(comConta)} cor={COR.cinzaMedio} />
      <Corta texto={c.subcentro} largura={wSub(comConta)} cor={COR.cinzaMedio} />
      <Text style={{ ...t, width: W.safra }}>{c.safra}</Text>
      <Text style={{ ...t, width: W.faz }}>{c.faz}</Text>
      <Text style={{ width: W.status, fontSize: F, fontWeight: 700, textAlign: 'center', color: hexDoStatus(c.statusChave) ?? COR.cinzaMedio }}>{c.status}</Text>
      <Text style={{ width: W.pagar, fontSize: F, textAlign: 'right', paddingRight: 3, color: COR.vermelho, opacity: apagada }}>{c.pagar}</Text>
      <Text style={{ width: W.receber, fontSize: F, textAlign: 'right', paddingRight: 3, color: COR.verde, opacity: apagada }}>{c.receber}</Text>
      <View style={{ width: W.saldo }} />
    </View>
  );
}

function LinhaDaFaixa({ f }: { f: FaixaDaFolha }) {
  const vencidos = f.tipo === 'vencidos_contam';
  const hoje = f.tipo === 'saldo_hoje';
  const cor = vencidos ? COR.vermelho : COR.azul;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2.4, paddingHorizontal: 4, backgroundColor: hoje ? COR.branco : vencidos ? FUNDO_VENCIDOS : FUNDO_DIA, borderTopWidth: hoje ? 0 : 0.9, borderTopColor: cor, borderBottomWidth: hoje ? 0.5 : 0, borderBottomColor: COR.separador }}>
      <Text hyphenationCallback={semHifen} style={{ ...corta, flex: 1, fontSize: 7.5, fontWeight: 700, color: cor }}>{f.titulo}</Text>
      <Valor c={f.pagar} largura={W.pagar} negrito />
      <Valor c={f.receber} largura={W.receber} negrito />
      <Valor c={f.saldo} largura={W.saldo} negrito />
    </View>
  );
}

/** A faixa NUNCA fica órfã no fim da página: ela e a primeira conta dela formam um bloco que não se parte. */
function Faixa({ f, comConta }: { f: FaixaDaFolha; comConta: boolean }) {
  const [primeira, ...resto] = f.contas;
  return (
    <View>
      <View wrap={false}>
        <LinhaDaFaixa f={f} />
        {primeira ? <LinhaDaConta c={primeira} comConta={comConta} zebra={false} /> : null}
      </View>
      {resto.map((c, i) => <LinhaDaConta key={i} c={c} comConta={comConta} zebra={i % 2 === 0} />)}
    </View>
  );
}

/** Quantas linhas um bloco pode ter para ir INTEIRO (sem partir entre páginas). Acima disso ele ganha página própria, com o
 *  cabeçalho da tabela fixo — bloco nenhum continua noutra página sem o cabeçalho. */
const CABE_INTEIRO = 30;

function BlocoSimples({ b, comConta, inteiro }: { b: BlocoSimplesDaFolha; comConta: boolean; inteiro: boolean }) {
  return (
    <View wrap={!inteiro} style={{ marginBottom: 10 }}>
      <View wrap={false}>
        <Text style={estilos.secao}>{b.titulo}</Text>
        <Text style={{ fontSize: 7.5, color: COR.cinzaMedio, marginBottom: 4 }}>{b.frase}</Text>
      </View>
      <CabecalhoDaTabela comConta={comConta} fixo={!inteiro} />
      {b.contas.map((c, i) => <LinhaDaConta key={i} c={c} comConta={comConta} zebra={i % 2 === 1} />)}
      <View wrap={false} style={{ flexDirection: 'row', paddingVertical: 2.4, paddingHorizontal: 4, borderTopWidth: 0.9, borderTopColor: COR.cinzaMedio }}>
        <Text style={{ flex: 1, fontSize: 7.5, fontWeight: 700, color: COR.cinza }}>Total · fora do saldo</Text>
        <Text style={{ width: W.pagar, fontSize: F, fontWeight: 700, textAlign: 'right', paddingRight: 3, color: COR.cinza }}>{b.pagar}</Text>
        <Text style={{ width: W.receber, fontSize: F, fontWeight: 700, textAlign: 'right', paddingRight: 3, color: COR.cinza }}>{b.receber}</Text>
        <View style={{ width: W.saldo }} />
      </View>
    </View>
  );
}

/** Um nó do gráfico, como a tela o desenhou (`graficoDoDom`): a folha só repete — nenhuma escala, nenhum ponto nasce aqui. */
function No({ n }: { n: NoDoGrafico }) {
  const cor = (c: string) => (c === 'none' ? undefined : c);
  if (n.t === 'path') {
    const p = <Path d={n.d} fill={cor(n.fill) ?? 'none'} stroke={cor(n.stroke)} strokeWidth={n.sw} strokeDasharray={n.dash ?? undefined} fillOpacity={n.fo} strokeOpacity={n.so} strokeLinecap={n.cap === 'round' ? 'round' : undefined} />;
    return n.tx === 0 && n.ty === 0 ? p : <G transform={`translate(${n.tx}, ${n.ty})`}>{p}</G>;
  }
  if (n.t === 'line') return <Line x1={n.x1} y1={n.y1} x2={n.x2} y2={n.y2} stroke={cor(n.stroke)} strokeWidth={n.sw} strokeDasharray={n.dash ?? undefined} strokeOpacity={n.so} strokeLinecap={n.cap === 'round' ? 'round' : undefined} />;
  if (n.t === 'rect') return <Rect x={n.x} y={n.y} width={n.w} height={n.h} fill={cor(n.fill) ?? 'none'} stroke={cor(n.stroke)} strokeWidth={n.sw} fillOpacity={n.fo} />;
  if (n.t === 'circle') return <Circle cx={n.cx} cy={n.cy} r={n.r} fill={cor(n.fill) ?? 'none'} stroke={cor(n.stroke)} strokeWidth={n.sw} fillOpacity={n.fo} />;
  return <Text x={n.x} y={n.y} fill={n.fill} fillOpacity={n.fo} textAnchor={n.ancora} style={{ fontSize: n.tamanho, fontWeight: n.peso >= 600 ? 700 : 400 }}>{n.texto}</Text>;
}

/** O GRÁFICO DA ABA FLUXO — bloco INTEIRO (`wrap={false}`): se não couber no resto da página vai para a seguinte, nunca cortado.
 *  Título, frase e legenda na família e nos tamanhos do resto da folha (o título é o das seções; frase e legenda a 7,5pt). */
function GraficoDoFluxo({ g }: { g: GraficoDaFolha }) {
  return (
    <View wrap={false} style={{ marginBottom: 8 }}>
      <Text style={{ ...estilos.secao, marginTop: 0, marginBottom: 4 }}>{g.titulo}</Text>
      {g.subtitulo ? <Text style={{ fontSize: 7.5, color: COR.cinzaMedio, marginBottom: 3 }}>{g.subtitulo}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 2 }}>
        {g.legenda.map((l) => (
          <View key={l.rotulo} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10 }}>
            <Svg width={l.ponto ? 8 : 18} height={8} style={{ marginRight: 3 }}>
              {l.ponto ? <Circle cx={4} cy={4} r={3} fill={l.cor} /> : <Line x1={0} y1={4} x2={18} y2={4} stroke={l.cor} strokeWidth={2.2} strokeDasharray={l.tracejado ? '4 3' : undefined} />}
            </Svg>
            <Text style={{ fontSize: 7.5, color: COR.cinza }}>{l.rotulo}</Text>
          </View>
        ))}
      </View>
      <Svg width={g.largura} height={g.altura} viewBox={`0 0 ${g.largura} ${g.altura}`}>
        {g.nos.map((n, i) => <No key={i} n={n} />)}
      </Svg>
    </View>
  );
}

const COL_RESUMO = { rotulo: 150, valor: 96 };
function CabecalhoResumo({ primeira, colunas }: { primeira: string; colunas: string[] }) {
  const h: { fontSize: number; color: string; fontWeight: 700 } = { fontSize: F, color: COR.branco, fontWeight: 700 };
  return (
    <View style={{ flexDirection: 'row', backgroundColor: COR.azul, paddingVertical: 3, paddingHorizontal: 4 }}>
      <Text style={{ ...h, width: COL_RESUMO.rotulo }}>{primeira}</Text>
      {colunas.map((c) => <Text key={c} style={{ ...h, width: COL_RESUMO.valor, textAlign: 'right', paddingRight: 3 }}>{c}</Text>)}
    </View>
  );
}
function LinhaResumo({ rotulo, caixa, pagar, receber, saldo, forte, zebra }: { rotulo: string; caixa?: string; pagar: CelulaValorCpr | null; receber: CelulaValorCpr | null; saldo: CelulaValorCpr | null; forte?: boolean; zebra?: boolean }) {
  return (
    <View wrap={false} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 1.8, paddingHorizontal: 4, backgroundColor: forte ? FUNDO_DIA : zebra ? COR.zebra : COR.branco, borderBottomWidth: 0.3, borderBottomColor: COR.separador }}>
      <View style={{ width: COL_RESUMO.rotulo, paddingRight: 5 }}>
        <Text hyphenationCallback={semHifen} style={{ ...corta, fontSize: F, color: COR.cinza, fontWeight: forte ? 700 : 400 }}>{rotulo}</Text>
      </View>
      {caixa == null ? null : <Text style={{ width: COL_RESUMO.valor, fontSize: F, textAlign: 'right', paddingRight: 3, color: COR.cinza, fontWeight: forte ? 700 : 400 }}>{caixa}</Text>}
      <Valor c={pagar} largura={COL_RESUMO.valor} negrito={forte} />
      <Valor c={receber} largura={COL_RESUMO.valor} negrito={forte} />
      <Valor c={saldo} largura={COL_RESUMO.valor} negrito={forte} />
    </View>
  );
}

export function DocumentoCpr({ modelo: m, logoData }: { modelo: ModeloCpr; logoData?: string }) {
  const pagina = { ...estilos.pagina, paddingTop: 74 };
  const cab = <PdfHeader titulo="Contas a Pagar e Receber" clienteNome={m.cabecalho.clienteNome} fazenda={m.cabecalho.fazenda} contaNome={m.cabecalho.contaNome} periodoLabel={m.cabecalho.periodo} linha2={m.cabecalho.linha2} logoData={logoData} />;
  /* bloco curto vai inteiro na página dos resumos; bloco longo ganha página própria com o cabeçalho da tabela fixo */
  const anterioresLongo = !!m.anteriores && m.anteriores.contas.length > CABE_INTEIRO;
  const semVencimentoLongo = !!m.semVencimento && m.semVencimento.contas.length > CABE_INTEIRO;
  const anterioresCurto = m.anteriores && !anterioresLongo ? m.anteriores : null;
  const semVencimentoCurto = m.semVencimento && !semVencimentoLongo ? m.semVencimento : null;
  const temResumos = !!anterioresCurto || !!semVencimentoCurto || m.semanas.length > 0 || !!m.porConta;
  return (
    <Document title="Contas a Pagar e Receber" author="AGROinBLUE">
      <Page size="A4" orientation="landscape" style={pagina} wrap>
        {cab}
        <PdfRodape />

        {/* O BLOCO DE NÚMEROS — os mesmos dos cartões e do rodapé da tela: rótulo em cima, valor embaixo */}
        <View style={{ flexDirection: 'row', borderWidth: 0.6, borderColor: COR.separador, borderRadius: 2, marginBottom: 8 }}>
          {m.numeros.map((n, i) => (
            <View key={n.rotulo} style={{ flex: 1, paddingVertical: 5, paddingHorizontal: 6, borderLeftWidth: i === 0 ? 0 : 0.6, borderLeftColor: COR.separador }}>
              <Text style={{ fontSize: 7.5, color: COR.cinzaMedio }}>{n.rotulo}</Text>
              <Text style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: n.tom === 'neg' ? COR.vermelho : n.tom === 'pos' ? COR.verde : COR.azul }}>{n.valor}</Text>
              {/* o detalhe ocupa UMA linha: o bloco de números tem a mesma altura com qualquer texto */}
              <Text hyphenationCallback={semHifen} style={{ ...corta, fontSize: 7, color: COR.cinzaMedio, marginTop: 1 }}>{n.detalhe ?? ' '}</Text>
            </View>
          ))}
        </View>
        {m.notaSemSaldo ? <Text style={{ fontSize: 7.5, color: COR.ambar, marginBottom: 4 }}>{m.notaSemSaldo}</Text> : null}
        {m.notaSegmento ? <Text style={{ fontSize: 7.5, color: COR.cinzaMedio, marginBottom: 4 }}>{m.notaSegmento}</Text> : null}

        {/* DEPOIS DO RESUMO, o gráfico da aba Fluxo — o mesmo desenho e a mesma série da tela */}
        {m.grafico ? <GraficoDoFluxo g={m.grafico} /> : null}

        <CabecalhoDaTabela comConta={m.comColunaConta} fixo />
        {m.faixas.map((f, i) => <Faixa key={i} f={f} comConta={m.comColunaConta} />)}
        <View wrap={false} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COR.azul, paddingVertical: 3.5, paddingHorizontal: 4 }}>
          <Text style={{ flex: 1, fontSize: 8, fontWeight: 700, color: COR.branco }}>{m.fim.titulo}</Text>
          <Valor c={m.fim.pagar} largura={W.pagar} negrito corFixa="#fca5a5" />
          <Valor c={m.fim.receber} largura={W.receber} negrito corFixa="#86efac" />
          <Valor c={m.fim.saldo} largura={W.saldo} negrito corFixa={m.fim.saldo?.tom === 'neg' ? '#fca5a5' : m.fim.saldo?.tom === 'pos' ? '#86efac' : COR.branco} />
        </View>
      </Page>

      {m.anteriores && anterioresLongo ? (
        <Page size="A4" orientation="landscape" style={pagina} wrap>
          {cab}
          <PdfRodape />
          <BlocoSimples b={m.anteriores} comConta={m.comColunaConta} inteiro={false} />
        </Page>
      ) : null}
      {m.semVencimento && semVencimentoLongo ? (
        <Page size="A4" orientation="landscape" style={pagina} wrap>
          {cab}
          <PdfRodape />
          <BlocoSimples b={m.semVencimento} comConta={m.comColunaConta} inteiro={false} />
        </Page>
      ) : null}

      {temResumos ? (
        <Page size="A4" orientation="landscape" style={pagina} wrap>
          {cab}
          <PdfRodape />
          {anterioresCurto ? <BlocoSimples b={anterioresCurto} comConta={m.comColunaConta} inteiro /> : null}
          {semVencimentoCurto ? <BlocoSimples b={semVencimentoCurto} comConta={m.comColunaConta} inteiro /> : null}

          {/* os dois resumos vão INTEIROS (`wrap={false}`): nunca partem entre páginas, então o cabeçalho nunca falta */}
          {m.semanas.length > 0 ? (
            <View wrap={false} style={{ marginBottom: 10 }}>
              <Text style={estilos.secao}>Resumo por semana</Text>
              <CabecalhoResumo primeira="Semana" colunas={['A pagar', 'A receber', 'Saldo no fim da semana']} />
              {m.semanas.map((w, i) => (
                <LinhaResumo key={w.semana} rotulo={w.semana} zebra={i % 2 === 1} pagar={w.pagar} receber={w.receber} saldo={w.saldo} />
              ))}
            </View>
          ) : null}

          {m.porConta ? (
            <View wrap={false}>
              <Text style={estilos.secao}>Resumo por conta</Text>
              <CabecalhoResumo primeira="Conta" colunas={['Caixa hoje', 'A pagar', 'A receber', 'Saldo no fim']} />
              {m.porConta.linhas.map((c, i) => (
                <LinhaResumo key={`${c.conta}-${i}`} rotulo={c.conta} zebra={i % 2 === 1} caixa={c.caixa} pagar={c.pagar} receber={c.receber} saldo={c.saldo} />
              ))}
              <LinhaResumo rotulo="Total" forte caixa={m.porConta.total.caixa} pagar={m.porConta.total.pagar} receber={m.porConta.total.receber} saldo={m.porConta.total.saldo} />
              <Text style={{ fontSize: 7, color: COR.cinzaMedio, marginTop: 3 }}>{m.porConta.nota}</Text>
            </View>
          ) : null}
        </Page>
      ) : null}
    </Document>
  );
}
