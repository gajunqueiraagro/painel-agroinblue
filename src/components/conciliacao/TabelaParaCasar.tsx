/**
 * CONC-SUGESTOES-TABELA-01 (Gabriel 04/11 06:36) — as DUAS listas do "Sugestões para casar" (as sugestões e o "Procurar no histórico") na
 * TABELA DA LISTA DO FINANCEIRO (`TabelaDaLista`: as mesmas peças, fontes e larguras), com as colunas que o Gabriel listou:
 * ☐ · Comp. · Venc. · Pgto. · Descrição · Fornecedor · Faz. · NF · Valor · Status · Motivo · ação. Uma linha por lançamento, nada quebra:
 * texto com "…" e o inteiro no `title`; data, NF, valor e status nunca cortam (as larguras da lista do Financeiro).
 */
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
export const COLUNAS_PARA_CASAR: readonly (number | null)[] = [28, 46, 46, 46, null, null, 30, 78, 94, 60, 120, 62];
export const N_COLUNAS_PARA_CASAR = COLUNAS_PARA_CASAR.length;
/** O piso das duas listas: as fixas + 2 × 110 para Descrição e Fornecedor (830px: cabe no modal a 1024 e a 135% de 1240, ~848 úteis — sem
 *  rolagem de lado). Só abaixo dele (janela < ~900px) a lista rola de lado DENTRO da caixa dela. */
export const PISO_PARA_CASAR = COLUNAS_PARA_CASAR.reduce<number>((t, w) => t + (w ?? 0), 0) + 220;

/** UI-FONTE-GATE-01 (Chat 12/11 15:22) — Faz. e NF só existem quando alguma linha DESTA lista tem o dado: vazias, a largura delas vai
 *  para Descrição e Fornecedor (as duas `null`). A ordem das colunas não muda. */
export interface ColunasParaCasar { faz: boolean; nf: boolean }
export const TODAS_AS_COLUNAS_PARA_CASAR: ColunasParaCasar = { faz: true, nf: true };
const I_FAZ = 6;
const I_NF = 7;
export function colunasParaCasar(linhas: readonly Pick<LinhaParaCasar, 'fazendaCodigo' | 'fazendaNome' | 'numeroDocumento'>[]): ColunasParaCasar {
  return { faz: linhas.some((l) => !!(l.fazendaCodigo || l.fazendaNome)), nf: linhas.some((l) => !!l.numeroDocumento) };
}
export function largurasParaCasar(c: ColunasParaCasar): (number | null)[] {
  return COLUNAS_PARA_CASAR.filter((_, i) => (i !== I_FAZ || c.faz) && (i !== I_NF || c.nf));
}

export type ColunaQueOrdena = 'comp' | 'venc' | 'pgto' | 'descricao' | 'fornecedor' | 'fazenda' | 'valor' | 'status';

/** O cabeçalho das duas listas: os rótulos da lista do Financeiro. Com `ordenar`, o clique no cabeçalho ordena e a seta tem lugar reservado
 *  (o cabeçalho não anda ao trocar a ordem); `prefixo` dá o testid de cada um (`<prefixo>-ordenar-<coluna>`). */
export function CabecalhoParaCasar({ ordenar, seta, prefixo, colunas = TODAS_AS_COLUNAS_PARA_CASAR }: {
  ordenar?: (c: ColunaQueOrdena) => void; seta?: (c: ColunaQueOrdena) => string; prefixo?: string; colunas?: ColunasParaCasar;
}) {
  /* UI-FONTE-GATE-01 (Gabriel 12/11 13:38): o rótulo alinhado como a coluna — Descrição, Fornecedor e Motivo à esquerda; NF e Valor à
     direita; datas, Faz. e Status no centro (a célula é centrada) */
  const th = (c: ColunaQueOrdena, rotulo: string, recuo: 'px-0.5' | 'px-1', fixa?: string, title?: string, alinhar: 'left' | 'center' | 'right' = 'center') => (
    <ThDaLista recuo={recuo} ordenar={ordenar ? () => ordenar(c) : undefined} fixa={fixa} title={title} alinhar={alinhar}
      data-testid={ordenar && prefixo ? `${prefixo}-ordenar-${c}` : undefined}>
      {/* a seta não ocupa largura (o cabeçalho não anda nem quebra ao trocar a ordem; "Faz." tem 30px): ela fica no recuo da célula */}
      {rotulo}{ordenar ? <span className="relative inline-block w-0"><span className="absolute left-[1px] top-1/2 -translate-y-1/2">{seta?.(c) ?? ''}</span></span> : null}
    </ThDaLista>
  );
  return (<>
    {/* SEM colunas congeladas (as do Financeiro): o quadro destas listas nem sempre rola, e preso num quadro que não rola é vão (o gate) */}
    <ThDaLista recuo="px-1" semTexto />
    {th('comp', 'Comp.', 'px-0.5')}
    {th('venc', 'Venc.', 'px-0.5')}
    {th('pgto', 'Pgto.', 'px-0.5')}
    {th('descricao', 'Descrição', 'px-1', undefined, undefined, 'left')}
    {th('fornecedor', 'Fornecedor', 'px-1', undefined, undefined, 'left')}
    {colunas.faz && th('fazenda', 'Faz.', 'px-1', undefined, 'Fazenda')}
    {colunas.nf && <ThDaLista recuo="px-1" alinhar="right">NF</ThDaLista>}
    {th('valor', 'Valor', 'px-1', undefined, undefined, 'right')}
    {th('status', 'Status', 'px-1')}
    <ThDaLista recuo="px-1" alinhar="left">Motivo</ThDaLista>
    <ThDaLista recuo="px-1" aria-label="Ações" />
  </>);
}

/** O que a tabela mostra de um lançamento, venha da sugestão ou do histórico (as colunas da lista do Financeiro). */
export interface LinhaParaCasar {
  id: string; comp: string | null; venc: string | null; pgto: string | null; descricao: string | null; tituloDescricao?: string;
  fornecedor: string | null; fazendaCodigo: string | null; fazendaNome: string | null; tipoDocumento: string | null; numeroDocumento: string | null;
  valor: number; status: string | null; conciliado: boolean;
}

/** Uma linha das duas listas: as células da lista do Financeiro + Motivo + a ação. */
export function LinhaParaCasarNaTabela({ l, marcada, alternar, podeMarcar, motivoMarcar, motivo, acao, testid, testidDaLinha, dadoAcao,
  colunas = TODAS_AS_COLUNAS_PARA_CASAR }: {
  l: LinhaParaCasar; colunas?: ColunasParaCasar; marcada: boolean; alternar: () => void; podeMarcar: boolean; motivoMarcar?: string;
  motivo: ReactNode; acao: ReactNode; testid: string; testidDaLinha?: string; dadoAcao?: string;
}) {
  const v = valorAssinadoDaLinha(l.valor);
  const doc = docDaLinha({ tipo_documento: l.tipoDocumento, numero_documento: l.numeroDocumento }, null);
  const st = statusDaLinha(l.status, l.conciliado);
  const vencido = !!l.venc && !l.pgto && l.venc < hojeLocal();
  return (
    <LinhaDaLista marcada={marcada} testid={testidDaLinha} dadoAcao={dadoAcao}>
      {podeMarcar
        ? <CelulaCaixinha marcada={marcada} alternar={alternar} solta />
        : <td className="px-1 py-1 align-middle text-center bg-background" title={motivoMarcar} data-testid="caixinha-fora" />}
      <CelulaData iso={l.comp} coluna="comp" solta />
      <CelulaData iso={l.venc} coluna="venc" vencido={vencido} solta />
      <CelulaData iso={l.pgto} coluna="pgto" solta />
      {/* UI-FONTE-GATE-01 (regra do Gabriel: nome nunca cortado): Descrição e Fornecedor QUEBRAM na célula, a linha cresce */}
      <CelulaProduto title={l.tituloDescricao ?? (l.descricao || '')} quebra>{l.descricao || '-'}</CelulaProduto>
      <CelulaFornecedor title={l.fornecedor ?? ''} quebra>{l.fornecedor || '-'}</CelulaFornecedor>
      {colunas.faz && <CelulaFaz codigo={l.fazendaCodigo} nome={l.fazendaNome} />}
      {colunas.nf && <CelulaDoc rotulo={doc.rotulo} titulo={doc.titulo} />}
      <CelulaValor classe={v.classe}>{v.texto}</CelulaValor>
      <CelulaStatus title={st.stPilula || st.stEstagio ? undefined : st.stLabel}><RotuloDoStatus st={st} /></CelulaStatus>
      <td className="truncate px-1 py-1 align-middle leading-tight" data-testid={`${testid}-coluna-motivo`}>{motivo}</td>
      <td className="whitespace-nowrap px-1 py-1 text-right align-middle leading-tight" data-testid={`${testid}-coluna-acao`}>{acao}</td>
    </LinhaDaLista>
  );
}

