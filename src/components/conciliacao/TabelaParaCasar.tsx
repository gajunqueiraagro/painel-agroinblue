/**
 * CONC-SUGESTOES-TABELA-01 (Gabriel 04/11 06:36) — as DUAS listas do "Sugestões para casar" (as sugestões e o "Procurar no histórico") na
 * TABELA DA LISTA DO FINANCEIRO (`TabelaDaLista`: as mesmas peças, fontes e larguras), com as colunas que o Gabriel listou:
 * ☐ · Comp. · Venc. · Pgto. · Descrição · Fornecedor · Faz. · NF · Valor · Status · Motivo · ação. Uma linha por lançamento, nada quebra:
 * texto com "…" e o inteiro no `title`; data, NF, valor e status nunca cortam (as larguras da lista do Financeiro).
 */
import { useLarguraDaJanela } from '@/hooks/useLarguraDaJanela';
import type { ReactNode } from 'react';
import { docDaLinha } from '@/lib/financeiro/documentoHelper';
import { valorAssinadoDaLinha } from '@/lib/financeiro/sinalPorConta';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import {
  ThDaLista, LinhaDaLista, CelulaCaixinha, CelulaData, CelulaProduto, CelulaFornecedor, CelulaFaz, CelulaValor, CelulaDoc,
  CelulaStatus, RotuloDoStatus, statusDaLinha,
} from '@/components/financeiro-v2/TabelaDaLista';

/** O link das ações ("Casar", "Criar igual"; UI-FONTE-GATE-01: "Casar" com maiúscula nas duas tabelas). */
export const LINK_PARA_CASAR = 'font-semibold text-[#1d4ed8] underline underline-offset-2 hover:text-[#1e40af] whitespace-nowrap';
/* CONC-SUGESTOES-FONTE-01 (Gabriel 08/11 10:26) — a TABELA DA LISTA no tamanho DA LISTA DO FINANCEIRO (a variante grande de 04/11 saiu):
   letra de 9px (datas, NF e Status a 8px), linha de 19px, cabeçalho de 8px. ⚠ AS LARGURAS são as da lista do Financeiro
   (`FinanceiroV2Tab.tsx`): caixinha 28 · as três datas 46 · Faz. 30 · NF 78 · Valor 94 · Status 60; e as duas desta lista: Motivo 120 (o selo
   a 8px; o texto inteiro no `title`) e a ação 62 ("Criar igual" a 9px negrito — NUNCA corta: é largura própria, não a sobra). Descrição e
   Fornecedor dividem o resto (`null`). Sem colunas congeladas. */
export const ALTURA_DA_LINHA_PARA_CASAR = 19;
export const ALTURA_DO_CABECALHO_PARA_CASAR = 18;
/* CONC-CRIAR-COM-NOTA-02 D-g (Gabriel 18/11) — depois do Valor, "Δ valor" (banco − lançamento) e "Δ dias" (pgto. no banco − vencimento), só quando
   a lista tem o movimento do banco de referência (`colunas.deltas`) */
/* 12:02 (a seta ⇅ sempre visível): Faz. 30 → 36 e a reserva de Descrição/Fornecedor 60 → 62 (o rótulo + a seta); o Motivo 120 → 110 paga (o selo
   tem "…" e o inteiro no title) — o piso segue 848 */
/* CONC-SUGESTOES-V2 (mock aprovado 25/11): Δ dias LOGO DEPOIS de Venc./Pgto. (a mesma largura, 38) — o piso não muda */
/* gate 26/11: o vencimento ESTIMADO ("~dd/mm/aaaa", itálico) passava 4,9px da coluna — Venc. 46 → 52, o Motivo 110 → 104 paga (o piso não muda) */
export const COLUNAS_PARA_CASAR: readonly (number | null)[] = [28, 46, 52, 46, 38, null, null, 36, 78, 94, 80, 60, 104, 62];
export const N_COLUNAS_PARA_CASAR = COLUNAS_PARA_CASAR.length;
/** O piso das duas listas: as fixas + 2 × 110 para Descrição e Fornecedor (830px: cabe no modal a 1024 e a 135% de 1240, ~848 úteis — sem
 *  rolagem de lado). Só abaixo dele (janela < ~900px) a lista rola de lado DENTRO da caixa dela. */
/* CONC-CRIAR-COM-NOTA-02 D-g: com Δ valor (80: "+99.999.999,99" a 9px pede 79) e Δ dias (38) o piso segue em 848 com Descrição e Fornecedor
   a 2 × 60 (o rótulo "Fornecedor" pede 60) — em linha única ("…" + `title`), não quebram mais */
export const PISO_PARA_CASAR = COLUNAS_PARA_CASAR.reduce<number>((t, w) => t + (w ?? 0), 0) + 124;

/** UI-FONTE-GATE-01 (Chat 12/11 15:22) — Faz. e NF só existem quando alguma linha DESTA lista tem o dado: vazias, a largura delas vai
 *  para Descrição e Fornecedor (as duas `null`). A ordem das colunas não muda. */
export interface ColunasParaCasar { faz: boolean; nf: boolean; deltas?: boolean }
export const TODAS_AS_COLUNAS_PARA_CASAR: ColunasParaCasar = { faz: true, nf: true };
const I_DD = 4;
const I_FAZ = 7;
const I_NF = 8;
const I_DV = 10;
export function colunasParaCasar(linhas: readonly Pick<LinhaParaCasar, 'fazendaCodigo' | 'fazendaNome' | 'numeroDocumento'>[]): ColunasParaCasar {
  return { faz: linhas.some((l) => !!(l.fazendaCodigo || l.fazendaNome)), nf: linhas.some((l) => !!l.numeroDocumento) };
}
export function largurasParaCasar(c: ColunasParaCasar): (number | null)[] {
  return COLUNAS_PARA_CASAR.filter((_, i) => (i !== I_FAZ || c.faz) && (i !== I_NF || c.nf) && ((i !== I_DV && i !== I_DD) || !!c.deltas));
}

/* CONC-CRIAR-COM-NOTA-02 (homologação Edson 11:40, D3 — regra soberana 29/10: TODA tabela ordena em TODAS as colunas): + NF, Δ valor, Δ dias, Motivo */
export type ColunaQueOrdena = 'comp' | 'venc' | 'pgto' | 'descricao' | 'fornecedor' | 'fazenda' | 'nf' | 'valor' | 'dvalor' | 'ddias' | 'status' | 'motivo';
export interface OrdemParaCasar { coluna: ColunaQueOrdena; sentido: 'asc' | 'desc' }
/** Clicar no cabeçalho: a mesma coluna inverte; outra começa descendo nas datas e nos números, subindo nos textos. */
export function proximaOrdemParaCasar(atual: OrdemParaCasar | null, coluna: ColunaQueOrdena): OrdemParaCasar {
  if (atual?.coluna === coluna) return { coluna, sentido: atual.sentido === 'asc' ? 'desc' : 'asc' };
  const desce = ['comp', 'venc', 'pgto', 'valor', 'dvalor', 'ddias'].includes(coluna);
  return { coluna, sentido: desce ? 'desc' : 'asc' };
}
/** A chave de uma linha da tabela de casar numa coluna (o texto sem acento e em minúscula; vazio = null, vai ao fim nos dois sentidos). */
export function chaveDaLinhaParaCasar(l: LinhaParaCasar, coluna: ColunaQueOrdena, motivo?: string | null): string | number | null {
  const txt = (s: string | null | undefined) => (s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : null);
  switch (coluna) {
    case 'comp': return l.comp; case 'venc': return l.venc; case 'pgto': return l.pgto;
    case 'descricao': return txt(l.descricao); case 'fornecedor': return txt(l.fornecedor);
    case 'fazenda': return txt(l.fazendaCodigo ?? l.fazendaNome); case 'nf': return l.numeroDocumento ? l.numeroDocumento.replace(/\D/g, '').padStart(20, '0') : null;
    case 'valor': return l.valor; case 'dvalor': return l.deltaValor ?? null; case 'ddias': return l.deltaDias ?? null;
    case 'status': return l.conciliado ? 'conciliado' : (l.status ?? null); case 'motivo': return txt(motivo);
  }
}
/** Ordena pela chave; empate fica na ordem de chegada; não muda a lista de entrada. */
export function ordenarParaCasar<T>(itens: readonly T[], chaveDe: (t: T) => string | number | null, sentido: 'asc' | 'desc'): T[] {
  const s = sentido === 'asc' ? 1 : -1;
  return itens.map((t, i) => ({ t, i, k: chaveDe(t) })).sort((x, y) => {
    if (x.k == null && y.k == null) return x.i - y.i;
    if (x.k == null) return 1;
    if (y.k == null) return -1;
    const d = typeof x.k === 'number' && typeof y.k === 'number' ? x.k - y.k : String(x.k).localeCompare(String(y.k), 'pt-BR');
    return d !== 0 ? d * s : x.i - y.i;
  }).map((x) => x.t);
}

/** O cabeçalho das duas listas: os rótulos da lista do Financeiro. Com `ordenar`, o clique no cabeçalho ordena e a seta tem lugar reservado
 *  (o cabeçalho não anda ao trocar a ordem); `prefixo` dá o testid de cada um (`<prefixo>-ordenar-<coluna>`). */
export function CabecalhoParaCasar({ ordenar, seta, prefixo, colunas = TODAS_AS_COLUNAS_PARA_CASAR }: {
  ordenar?: (c: ColunaQueOrdena) => void; seta?: (c: ColunaQueOrdena) => string; prefixo?: string; colunas?: ColunasParaCasar;
}) {
  /* UI-FONTE-GATE-01 (Gabriel 12/11 13:38): o rótulo alinhado como a coluna — Descrição, Fornecedor e Motivo à esquerda; NF e Valor à
     direita; datas, Faz. e Status no centro (a célula é centrada) */
  const marca = (c: ColunaQueOrdena) => {
    const s = seta?.(c) ?? '';
    return s ? s : <span className="opacity-50" data-seta-inativa="">⇅</span>;
  };
  const th = (c: ColunaQueOrdena, rotulo: string, recuo: 'px-0.5' | 'px-1', fixa?: string, title?: string, alinhar: 'left' | 'center' | 'right' = 'center') => (
    <ThDaLista recuo={recuo} ordenar={ordenar ? () => ordenar(c) : undefined} fixa={fixa} title={title} alinhar={alinhar}
      data-testid={ordenar && prefixo ? `${prefixo}-ordenar-${c}` : undefined}>
      {/* a seta não ocupa largura (o cabeçalho não anda nem quebra ao trocar a ordem; "Faz." tem 30px): ela fica no recuo da célula */}
      {/* UI-FONTE-GATE-01: no rótulo à DIREITA (Valor, NF) a seta vai à ESQUERDA dele — depois do texto ela passava do recuo e vazava */}
      {/* homologação Edson 12:02 (Gabriel): a seta SEMPRE visível nas colunas que ordenam — ⇅ apagada; ↑/↓ cheia na coluna ativa (sem ela o
          usuário não sabe que ordena; como na Lançamentos) */}
      {ordenar && alinhar === 'right' ? <span className="relative inline-block w-0"><span className="absolute right-[1px] top-1/2 -translate-y-1/2">{marca(c)}</span></span> : null}
      {rotulo}{ordenar && alinhar !== 'right' ? <span className="relative inline-block w-0"><span className="absolute left-[1px] top-1/2 -translate-y-1/2">{marca(c)}</span></span> : null}
    </ThDaLista>
  );
  return (<>
    {/* SEM colunas congeladas (as do Financeiro): o quadro destas listas nem sempre rola, e preso num quadro que não rola é vão (o gate) */}
    <ThDaLista recuo="px-1" semTexto />
    {th('comp', 'Comp.', 'px-0.5')}
    {th('venc', 'Venc.', 'px-0.5')}
    {th('pgto', 'Pgto.', 'px-0.5')}
    {colunas.deltas && th('ddias', 'Δ dias', 'px-1', undefined, 'dias entre o pagamento no banco e o vencimento (− = antes do vencimento; ~ = vencimento estimado)', 'right')}
    {th('descricao', 'Descrição', 'px-1', undefined, undefined, 'left')}
    {th('fornecedor', 'Fornecedor', 'px-1', undefined, undefined, 'left')}
    {colunas.faz && th('fazenda', 'Faz.', 'px-1', undefined, 'Fazenda')}
    {colunas.nf && th('nf', 'NF', 'px-1', undefined, undefined, 'right')}
    {th('valor', 'Valor', 'px-1', undefined, undefined, 'right')}
    {colunas.deltas && th('dvalor', 'Δ valor', 'px-1', undefined, 'valor do banco − valor do lançamento', 'right')}
    {th('status', 'Status', 'px-1')}
    {th('motivo', 'Motivo', 'px-1', undefined, undefined, 'left')}
    <ThDaLista recuo="px-1" aria-label="Ações" />
  </>);
}

/** O que a tabela mostra de um lançamento, venha da sugestão ou do histórico (as colunas da lista do Financeiro). */
export interface LinhaParaCasar {
  id: string; comp: string | null; venc: string | null; pgto: string | null; descricao: string | null; tituloDescricao?: string;
  fornecedor: string | null; fazendaCodigo: string | null; fazendaNome: string | null; tipoDocumento: string | null; numeroDocumento: string | null;
  valor: number; status: string | null; conciliado: boolean;
  /** D-g — com o movimento de referência: banco − lançamento (em módulo, R$) e pgto. no banco − vencimento (dias; − = antes) */
  deltaValor?: number | null; deltaDias?: number | null;
  /** CONC-SUGESTOES-V2 C (D-5a): vencimento ESTIMADO (nenhum boleto, duplicata nem contrato o declara) — "~" cinza itálico, Δ dias neutro */
  vencEstimado?: boolean;
}

/** CONC-SUGESTOES-V2: o vencimento estimado — "~dd/mm/aaaa", cinza e itálico; o inteiro diz por quê. Nunca "vencido" nem "pago antes". */
export const TITULO_DO_ESTIMADO = 'Vencimento estimado: nenhum boleto, duplicata da NF ou contrato o declara (foi digitado ou sugerido).';
function CelulaVencEstimado({ iso }: { iso: string | null }) {
  const t = iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';
  return (
    <td className="celula-data tabular-nums px-[1px] py-1 align-middle leading-tight bg-background text-center italic text-muted-foreground/80"
      title={TITULO_DO_ESTIMADO} data-testid="venc-estimado">~{t}</td>
  );
}

/** CONC-SUGESTOES-V2 A — a faixa de seção dentro da tabela ("✓ Exata · 1", "Possíveis — conferir · 3"). */
export function FaixaParaCasar({ n, children, testid, tom = 'neutro' }: { n: number; children: ReactNode; testid?: string; tom?: 'exata' | 'neutro' }) {
  return (
    <tr style={{ height: ALTURA_DA_LINHA_PARA_CASAR - 1 }} data-testid={testid}>
      <td colSpan={n} className={`truncate px-1 text-[9px] font-semibold ${tom === 'exata' ? 'bg-emerald-50 text-emerald-800' : 'bg-muted/60 text-muted-foreground'}`}>{children}</td>
    </tr>
  );
}

/** CONC-SUGESTOES-V2 A (ALINHAMENTO SOBERANO): o movimento do banco é a 1ª linha DA MESMA TABELA — "Banco" · Pgto. · o nome sem caixa alta (o
 *  texto cru no `title`) · o CNPJ na coluna Fornecedor · o Valor sob o Valor. */
export function LinhaDoBancoParaCasar({ data, nome, textoCru, documento, valor, colunas = TODAS_AS_COLUNAS_PARA_CASAR }: {
  data: string | null; nome: string; textoCru: string; documento: string | null; valor: number; colunas?: ColunasParaCasar;
}) {
  const v = valorAssinadoDaLinha(valor);
  const documentoEmDuas = useLarguraDaJanela() < 1000;
  const vazio = <td className="px-1 py-1" />;
  return (
    <tr className="border-b-2 border-primary bg-[#eaf0fa] font-semibold" style={{ height: ALTURA_DA_LINHA_PARA_CASAR + 3 }} data-testid="linha-do-banco">
      <td colSpan={2} className="px-1 py-1 align-middle"><span className="rounded-[3px] bg-primary px-1 text-[8px] font-bold leading-[12px] text-primary-foreground">Banco</span></td>
      {vazio}
      <CelulaData iso={data} coluna="pgto" solta />
      {colunas.deltas && vazio}
      {/* o `title` leva o que a célula mostra E o texto cru do banco (o gate: "…" só com o inteiro no title) */}
      <td className="truncate px-1 py-1 align-middle text-[12px] leading-tight" title={nome && nome !== textoCru ? `${nome}\n${textoCru}` : textoCru || nome}
        data-testid="linha-do-banco-nome">{nome || '—'}</td>
      {/* CNPJ NUNCA CORTA: abaixo de 1000px de janela a coluna Fornecedor fica estreita — o documento desce em 2 linhas (raiz / filial) */}
      <td className={`whitespace-nowrap px-1 align-middle text-[9px] tabular-nums ${documentoEmDuas ? 'py-0 leading-[10px]' : 'py-1 leading-tight'}`}
        title={documento ?? undefined} data-testid="linha-do-banco-documento">
        {documento && documentoEmDuas && documento.includes('/')
          ? <>{documento.slice(0, documento.indexOf('/') + 1)}<br />{documento.slice(documento.indexOf('/') + 1)}</>
          : (documento ?? '')}</td>
      {colunas.faz && vazio}
      {colunas.nf && vazio}
      <CelulaValor classe={v.classe}>{v.texto}</CelulaValor>
      {colunas.deltas && vazio}
      {vazio}{vazio}{vazio}
    </tr>
  );
}

/** D-g — os dois Δ de um lançamento contra o movimento do banco: valor (|banco| − |lançamento|) e dias (pgto. no banco − vencimento) */
export function deltasDoMovimento(mov: { data: string | null; valor: number }, l: { valor: number; venc: string | null }): { deltaValor: number; deltaDias: number | null } {
  const deltaValor = Math.round((Math.abs(mov.valor) - Math.abs(l.valor)) * 100) / 100;
  const deltaDias = mov.data && l.venc ? Math.round((Date.parse(mov.data.slice(0, 10)) - Date.parse(l.venc.slice(0, 10))) / 86400000) : null;
  return { deltaValor, deltaDias };
}

/** D-g — a cor do Δ: zero = verde (confere); diferente = âmbar (valor) / antes do vencimento = azul, depois = âmbar (dias) */
export function textoDoDelta(tipo: 'valor' | 'dias', d: number | null | undefined): { texto: string; classe: string } {
  if (d == null) return { texto: '—', classe: 'text-muted-foreground' };
  if (tipo === 'valor') {
    if (Math.abs(d) < 0.005) return { texto: '0,00', classe: 'text-emerald-700' };
    return { texto: `${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, classe: 'text-amber-700' };
  }
  if (d === 0) return { texto: '0', classe: 'text-emerald-700' };
  return { texto: `${d > 0 ? '+' : '−'}${Math.abs(d)}`, classe: d < 0 ? 'text-sky-700' : 'text-amber-700' };
}

/** Uma linha das duas listas: as células da lista do Financeiro + Motivo + a ação. */
export function LinhaParaCasarNaTabela({ l, marcada, alternar, podeMarcar, motivoMarcar, motivo, acao, testid, testidDaLinha, dadoAcao,
  colunas = TODAS_AS_COLUNAS_PARA_CASAR, exata = false, onAbrir }: {
  l: LinhaParaCasar; colunas?: ColunasParaCasar; marcada: boolean; alternar: () => void; podeMarcar: boolean; motivoMarcar?: string;
  motivo: ReactNode; acao: ReactNode; testid: string; testidDaLinha?: string; dadoAcao?: string;
  /** CONC-SUGESTOES-V2 A — a exata (valor + CNPJ): fundo verde, faixa à esquerda, negrito */
  exata?: boolean;
  /** CONC-SUGESTOES-V2 ajuste (1) 07:45 — o clique na Descrição abre o mini-modal SÓ LEITURA (o inteiro segue no `title`) */
  onAbrir?: () => void;
}) {
  const v = valorAssinadoDaLinha(l.valor);
  const doc = docDaLinha({ tipo_documento: l.tipoDocumento, numero_documento: l.numeroDocumento }, null);
  const st = statusDaLinha(l.status, l.conciliado);
  const vencido = !l.vencEstimado && !!l.venc && !l.pgto && l.venc < hojeLocal();
  const deltaDias = () => {
    if (l.vencEstimado) return (
      <td className="whitespace-nowrap px-1 py-1 text-right align-middle text-[9px] tabular-nums leading-tight text-muted-foreground" title={`contra vencimento estimado — ${TITULO_DO_ESTIMADO}`}
        data-testid={`${testid}-delta-dias`}>{l.deltaDias == null ? '—' : `${l.deltaDias > 0 ? '+' : l.deltaDias < 0 ? '−' : ''}${Math.abs(l.deltaDias)}`}</td>);
    const d = textoDoDelta('dias', l.deltaDias);
    return <td className={`whitespace-nowrap px-1 py-1 text-right align-middle text-[9px] tabular-nums leading-tight ${d.classe}`} data-testid={`${testid}-delta-dias`}>{d.texto}</td>;
  };
  return (
    <LinhaDaLista marcada={marcada} testid={testidDaLinha} dadoAcao={dadoAcao}
      classe={exata ? 'bg-emerald-50 font-semibold [&>td:first-child]:shadow-[inset_4px_0_0_#1f8a3e] [&>td]:bg-emerald-50' : undefined}>
      {podeMarcar
        ? <CelulaCaixinha marcada={marcada} alternar={alternar} solta />
        : <td className="px-1 py-1 align-middle text-center bg-background" title={motivoMarcar} data-testid="caixinha-fora" />}
      <CelulaData iso={l.comp} coluna="comp" solta />
      {l.vencEstimado ? <CelulaVencEstimado iso={l.venc} /> : <CelulaData iso={l.venc} coluna="venc" vencido={vencido} solta />}
      <CelulaData iso={l.pgto} coluna="pgto" solta />
      {colunas.deltas && deltaDias()}
      {/* CONC-CRIAR-COM-NOTA-02 D-g (Gabriel 18/11, substitui a quebra do UI-FONTE-GATE-01): LINHA ÚNICA — Descrição e Fornecedor com "…" e o
          inteiro no `title` */}
      <CelulaProduto title={l.tituloDescricao ?? (l.descricao || '')}>{onAbrir
        ? <button type="button" onClick={onAbrir} className="block w-full truncate text-left hover:underline" data-testid={`${testid}-abrir`}>{l.descricao || '-'}</button>
        : (l.descricao || '-')}</CelulaProduto>
      <CelulaFornecedor title={l.fornecedor ?? ''}>{l.fornecedor || '-'}</CelulaFornecedor>
      {colunas.faz && <CelulaFaz codigo={l.fazendaCodigo} nome={l.fazendaNome} />}
      {colunas.nf && <CelulaDoc rotulo={doc.rotulo} titulo={doc.titulo} />}
      <CelulaValor classe={v.classe}>{v.texto}</CelulaValor>
      {colunas.deltas && (() => { const d = textoDoDelta('valor', l.deltaValor); return (
        <td className={`whitespace-nowrap px-1 py-1 text-right align-middle text-[9px] tabular-nums leading-tight ${d.classe}`} data-testid={`${testid}-delta-valor`}>{d.texto}</td>); })()}
      <CelulaStatus title={st.stPilula || st.stEstagio ? undefined : st.stLabel}><RotuloDoStatus st={st} /></CelulaStatus>
      <td className="truncate px-1 py-1 align-middle leading-tight" data-testid={`${testid}-coluna-motivo`}>{motivo}</td>
      <td className="whitespace-nowrap px-1 py-1 text-right align-middle leading-tight" data-testid={`${testid}-coluna-acao`}>{acao}</td>
    </LinhaDaLista>
  );
}

