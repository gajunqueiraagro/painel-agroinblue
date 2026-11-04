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
  ThDaLista, LinhaDaLista, CelulaCaixinha, CelulaData, CelulaProduto, CelulaFornecedor, NomeNaCelula, CelulaFaz, CelulaValor, CelulaDoc,
  CelulaStatus, RotuloDoStatus, statusDaLinha,
} from '@/components/financeiro-v2/TabelaDaLista';

/** O link das ações ("casar", "Casar", "Criar igual"). */
export const LINK_PARA_CASAR = 'font-semibold text-[#1d4ed8] underline underline-offset-2 hover:text-[#1e40af] whitespace-nowrap';
/* CONC-SUGESTOES-TABELA-01 (Gabriel 04/11 07:55 e 08:1x) — a TABELA DA LISTA no tamanho GRANDE (`TabelaDaLista grande`, `TabelaDaLista.css`):
   letra de 12px (datas, NF e Status a 11px), linha de 26px, cabeçalho de 11px sem caixa alta (26px). ⚠ AS LARGURAS para esse tamanho (o pior
   texto + o recuo): caixinha 28 · as três datas 74 ("00/00/0000" a 11px tabular, com folga entre as três) · Faz. 40 ("ADM") · NF 102
   ("NF 000.000.000" a 11px) · Valor 126 ("-R$ 99.999.999,99" a 12px negrito) · Status 86 (a pílula "Conciliado") · Motivo 170 (o selo
   "1/2 · nome · soma de 2" a 10,5px) · ação 84 ("Criar igual"). Descrição e Fornecedor dividem o resto (`null`). Sem colunas congeladas. */
export const ALTURA_DA_LINHA_PARA_CASAR = 26;
export const ALTURA_DO_CABECALHO_PARA_CASAR = 26;
export const COLUNAS_PARA_CASAR: readonly (number | null)[] = [28, 74, 74, 74, null, null, 40, 102, 126, 86, 170, 84];
export const N_COLUNAS_PARA_CASAR = COLUNAS_PARA_CASAR.length;
/** O piso das duas listas: as fixas + 2 × 120 para Descrição e Fornecedor. Abaixo dele a lista rola de lado DENTRO da caixa dela. */
export const PISO_PARA_CASAR = COLUNAS_PARA_CASAR.reduce<number>((t, w) => t + (w ?? 0), 0) + 240;

export type ColunaQueOrdena = 'comp' | 'venc' | 'pgto' | 'descricao' | 'fornecedor' | 'fazenda' | 'valor' | 'status';

/** O cabeçalho das duas listas: os rótulos da lista do Financeiro. Com `ordenar`, o clique no cabeçalho ordena e a seta tem lugar reservado
 *  (o cabeçalho não anda ao trocar a ordem); `prefixo` dá o testid de cada um (`<prefixo>-ordenar-<coluna>`). */
export function CabecalhoParaCasar({ ordenar, seta, prefixo }: { ordenar?: (c: ColunaQueOrdena) => void; seta?: (c: ColunaQueOrdena) => string; prefixo?: string }) {
  const th = (c: ColunaQueOrdena, rotulo: string, recuo: 'px-0.5' | 'px-1', fixa?: string, title?: string) => (
    <ThDaLista recuo={recuo} ordenar={ordenar ? () => ordenar(c) : undefined} fixa={fixa} title={title}
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
    {th('descricao', 'Descrição', 'px-1')}
    {th('fornecedor', 'Fornecedor', 'px-1')}
    {th('fazenda', 'Faz.', 'px-1', undefined, 'Fazenda')}
    <ThDaLista recuo="px-1">NF</ThDaLista>
    {th('valor', 'Valor', 'px-1')}
    {th('status', 'Status', 'px-1')}
    <ThDaLista recuo="px-1">Motivo</ThDaLista>
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
export function LinhaParaCasarNaTabela({ l, marcada, alternar, podeMarcar, motivoMarcar, motivo, acao, testid, testidDaLinha, dadoAcao }: {
  l: LinhaParaCasar; marcada: boolean; alternar: () => void; podeMarcar: boolean; motivoMarcar?: string;
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
      <CelulaProduto title={l.tituloDescricao ?? (l.descricao || '')}>{l.descricao || '-'}</CelulaProduto>
      <CelulaFornecedor title={l.fornecedor ?? ''}>{l.fornecedor ? <NomeNaCelula nome={l.fornecedor} /> : '-'}</CelulaFornecedor>
      <CelulaFaz codigo={l.fazendaCodigo} nome={l.fazendaNome} />
      <CelulaDoc rotulo={doc.rotulo} titulo={doc.titulo} />
      <CelulaValor classe={v.classe}>{v.texto}</CelulaValor>
      <CelulaStatus title={st.stPilula || st.stEstagio ? undefined : st.stLabel}><RotuloDoStatus st={st} /></CelulaStatus>
      <td className="truncate px-1 py-1 align-middle leading-tight" data-testid={`${testid}-coluna-motivo`}>{motivo}</td>
      <td className="whitespace-nowrap px-1 py-1 text-right align-middle leading-tight" data-testid={`${testid}-coluna-acao`}>{acao}</td>
    </LinhaDaLista>
  );
}

