/**
 * FIN-FINANC-28-P3 — a aba "Financiamentos" da lista (mock v1.1, partes 1 e 4). SÓ DESENHA: agrupamento, somas e frases vêm do
 * dono puro `listaDeFinanciamentos.ts`, e cada número do contrato vem da fonte única do saldo (a chave `saldo` do lote).
 * ⚠ UMA LINHA POR REGISTRO E RÉGUA FIXA: `table-layout: fixed` + colgroup em px; só a Descrição estica e corta (inteira no
 *   `title`); Banco e Pendência cortam com `title`; número, data, situação e Nº do contrato nunca cortam. Ordenar ou abrir os
 *   encerrados não mexe em largura nem em card.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_PALETA, STATUS_PILULA_BASE } from '@/lib/financeiro/statusFinanceiro';
import {
  montarListaDeFinanciamentos, textoDasPendencias, temNumero,
  type ColunaDaLista, type ContratoDaLista, type GrupoDaLista, type Soma,
} from '@/lib/financiamentos/listaDeFinanciamentos';

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtReal = (v: number) => `R$ ${fmt(v)}`;
const dataCurta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');

/* RÉGUA (px) = o maior texto RENDERIZADO da coluna (célula ou cabeçalho) + o padding, medida no Chromium com a Inter e a régua
   de Lançamentos (17/10): Nº — o maior nº real do proto, "C_102.022.070.010200" (20 caracteres), 113,2; Situação — o
   cabeçalho "SITUAÇÃO" 62,6 (o selo "cancelado" 58,2); Contratado / Amortizado — o cabeçalho, 77,7; Liberado / Saldo —
   "50.000.000,00 + ?" no subtotal (9,5px), 93,6; Próx. venc. — o cabeçalho, 72,8 (a data 43,4). Banco, Descrição e
   Pendência cortam, com o inteiro no `title`. */
export const REGUA_LISTA_FINANCIAMENTOS: Record<'numero' | 'banco' | 'situacao' | 'contratado' | 'liberado' | 'amortizado' | 'saldo' | 'prox' | 'pendencia', number> = {
  numero: 116, banco: 56, situacao: 64, contratado: 80, liberado: 96, amortizado: 80, saldo: 96, prox: 74, pendencia: 110,
};

/* A RÉGUA DE FONTE É A DE "LANÇAMENTOS FINANCEIROS" (FIN-FINANC-28-P3, ajuste do Chat de 17/10): a tabela leva a classe da
   casa `table-financeiro` (index.css: cabeçalho 8px maiúsculo, célula 9px, linha de 25px) e as células as classes nomeadas
   de lá — `celula-data` (datas em mono 8px), `celula-valor` (valor 9px/600), `celula-status` (o selo a 8px). As strings
   abaixo são as MESMAS de `FinanceiroV2Tab.tsx` (cabeçalho, datas, valor), não uma régua nova; as duas listas de
   financiamentos (esta e a de "Compras parceladas") as importam daqui. */
export const TABELA_LANC = 'table-financeiro';
export const TH_LANC = 'px-1 py-[3px] align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground';
export const TD_DATA_LANC = 'celula-data font-mono tabular-nums whitespace-nowrap';
export const TD_VALOR_LANC = 'celula-valor font-semibold tabular-nums whitespace-nowrap text-right';
export const LINHA_LANC = 'h-[25px]';
/** grupo e total: 27px, 9,5px/600 (`celula-grupo`, index.css) */
const LINHA_GRUPO = 'h-[27px]';

const NUM = `${TD_VALOR_LANC} px-1`;
const AMBAR = 'text-amber-700';
const NEG = 'text-[#b91c1c]';

/* O SELO DA SITUAÇÃO é a forma do status de Lançamentos (`STATUS_PILULA_BASE`, na célula `celula-status`); quitado tem a
   caixa do Realizado e ativo o texto do Programado (as cores da paleta da casa); rolado e cancelado, texto neutro e vermelho. */
const CLASSE_STATUS: Record<string, string> = {
  ativo: STATUS_PALETA.programado.pilula,
  quitado: STATUS_PALETA.realizado.pilula,
  rolado: 'text-[#475569] border-transparent',
  cancelado: 'text-[#b91c1c] border-transparent',
};
export function SeloDoContrato({ status }: { status: string }) {
  return <span className={cn(STATUS_PILULA_BASE, CLASSE_STATUS[status] ?? CLASSE_STATUS.rolado)}>{status}</span>;
}

function Valor({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined) return <span className={AMBAR} title="sem liberação gravada: o sistema não sabe">?</span>;
  return <span className={v < 0 ? NEG : ''}>{fmt(v)}</span>;
}

function ValorDaSoma({ s }: { s: Soma }) {
  return (
    <span className={s.valor < 0 ? NEG : ''}>
      {fmt(s.valor)}
      {s.aConfirmar > 0 && (
        <span className={AMBAR} title={`${s.aConfirmar} contrato(s) sem o valor gravado, fora desta soma`}> + ?</span>
      )}
    </span>
  );
}

function Cabecalho({ rotulo, col, ordem, aoOrdenar, direita }: {
  rotulo: string; col: ColunaDaLista; ordem: { col: ColunaDaLista; dir: 'asc' | 'desc' };
  aoOrdenar: (c: ColunaDaLista) => void; direita?: boolean;
}) {
  const ativo = ordem.col === col;
  const Seta = !ativo ? ChevronsUpDown : ordem.dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th
      className={`cursor-pointer select-none whitespace-nowrap ${TH_LANC} ${direita ? 'text-right' : 'text-left'}`}
      onClick={() => aoOrdenar(col)}
      aria-sort={ativo ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className={`inline-flex items-center gap-0.5 ${direita ? 'flex-row-reverse' : ''}`}>
        {rotulo}
        <Seta className={`h-2.5 w-2.5 shrink-0 ${ativo ? '' : 'opacity-60'}`} aria-hidden />
      </span>
    </th>
  );
}

function LinhaDoContrato({ c, encerrado, aoAbrir }: { c: ContratoDaLista; encerrado?: boolean; aoAbrir: (id: string) => void }) {
  const s = c.saldo;
  const pend = textoDasPendencias(s?.pendencias ?? []);
  const sucessor = c.status === 'rolado' && c.sucessorNumero ? `→ ${c.sucessorNumero}` : '';
  const textoPend = [sucessor, pend].filter(Boolean).join(' · ');
  return (
    <tr
      role="link" tabIndex={0} data-testid="lista-fin-contrato"
      onClick={() => aoAbrir(c.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aoAbrir(c.id); } }}
      className={`${LINHA_LANC} cursor-pointer border-b border-[#eef0f3] hover:bg-muted/40 ${encerrado ? 'bg-[#f3f5f8] text-[#64748b]' : ''}`}
    >
      <td className="whitespace-nowrap px-1 font-medium text-[#1d3a5d]" data-testid="cel-numero" title={c.numeroContrato ?? undefined}>
        {temNumero(c.numeroContrato) ? c.numeroContrato : <span className={AMBAR}>sem nº</span>}
      </td>
      <td className="truncate px-1" title={c.banco ?? undefined}>{c.banco ?? '—'}</td>
      <td className="truncate px-1" title={c.descricao}>{c.descricao}</td>
      <td className="celula-status whitespace-nowrap px-0.5"><SeloDoContrato status={c.status} /></td>
      <td className={`${NUM}`}><Valor v={s?.contratado} /></td>
      <td className={`${NUM}`} data-testid="cel-liberado"><Valor v={s ? s.liberado : null} /></td>
      <td className={`${NUM}`}><Valor v={s?.amortizado} /></td>
      <td className={`${NUM} font-semibold`} data-testid="cel-saldo"><Valor v={s ? s.saldo : null} /></td>
      <td className={`${TD_DATA_LANC} px-1 text-right`}>{dataCurta(c.proxVencimento)}</td>
      <td className={`truncate px-1 ${textoPend ? AMBAR : 'text-[#94a3b8]'}`} data-testid="cel-pendencia" title={textoPend || undefined}>
        {textoPend || '—'}
      </td>
    </tr>
  );
}

export function ListaDeFinanciamentos({ contratos, encerradosAbertos, aoAlternarEncerrados, aoAbrir, filtros }: {
  contratos: readonly ContratoDaLista[];
  /** a fileira de filtros da tela (a mesma da aba "Compras parceladas"), entre os cards e a tabela */
  filtros?: ReactNode;
  encerradosAbertos: boolean;
  aoAlternarEncerrados: () => void;
  aoAbrir: (id: string) => void;
}) {
  const [ordem, setOrdem] = useState<{ col: ColunaDaLista; dir: 'asc' | 'desc' }>({ col: 'contratado', dir: 'desc' });
  const aoOrdenar = (col: ColunaDaLista) => setOrdem((o) => (o.col === col ? { col, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }));
  const lista = useMemo(() => montarListaDeFinanciamentos(contratos, ordem.col, ordem.dir), [contratos, ordem]);
  const R = REGUA_LISTA_FINANCIAMENTOS;

  const lib = lista.total.liberado.aConfirmar;
  const sal = lista.total.saldo.aConfirmar;
  const cards: { rotulo: string; valor: string; extra: string | null; tituloExtra?: string; tom: string }[] = [
    { rotulo: 'Contratado (vigentes)', valor: fmtReal(lista.total.contratado.valor), extra: null, tom: '' },
    { rotulo: 'Liberado', valor: fmtReal(lista.total.liberado.valor), extra: lib > 0 ? `+ ${lib} ?` : null,
      tituloExtra: lib > 0 ? `${lib} contrato(s) sem liberação gravada, fora da soma` : undefined, tom: '' },
    { rotulo: 'Saldo devedor (principal)', valor: fmtReal(lista.total.saldo.valor), extra: sal > 0 ? `+ ${sal} a confirmar` : null,
      tituloExtra: sal > 0 ? `${sal} contrato(s) sem saldo conhecido, fora da soma` : undefined, tom: '' },
    { rotulo: 'Contratos com pendência', valor: String(lista.comPendencia), extra: null, tom: lista.comPendencia > 0 ? AMBAR : '' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 grid shrink-0 grid-cols-4 gap-2" data-testid="lista-fin-cards">
        {cards.map((c) => (
          <div key={c.rotulo} className="h-[40px] rounded-md border border-l-[3px] border-l-primary px-3 py-1">
            {/* o "+ ?" mora na linha do RÓTULO, num lugar sempre presente à direita: o valor nunca divide a linha com ele e o
                cartão não muda de tamanho quando ele aparece (o rótulo é o que corta, inteiro no `title`) */}
            <div className="flex items-center gap-1 text-[10px] leading-none">
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={c.rotulo}>{c.rotulo}</span>
              <span className={`shrink-0 whitespace-nowrap text-[9.5px] ${AMBAR}`} title={c.tituloExtra}>{c.extra ?? ''}</span>
            </div>
            <div className={`mt-0.5 whitespace-nowrap text-[13px] font-semibold leading-tight tabular-nums ${c.tom}`}>{c.valor}</div>
          </div>
        ))}
      </div>

      {/* filtros + tabela no MESMO card da aba "Compras parceladas" (mesma classe, mesma posição dos filtros) */}
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card px-3 pt-2 pb-2 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
      {filtros}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-md border border-border" data-testid="lista-fin-rolagem">
        <table className={`${TABELA_LANC} w-full table-fixed border-collapse`} data-testid="lista-fin-tabela">
          <colgroup>
            <col style={{ width: R.numero }} /><col style={{ width: R.banco }} /><col />
            <col style={{ width: R.situacao }} /><col style={{ width: R.contratado }} /><col style={{ width: R.liberado }} />
            <col style={{ width: R.amortizado }} /><col style={{ width: R.saldo }} /><col style={{ width: R.prox }} />
            <col style={{ width: R.pendencia }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-primary text-primary-foreground">
            <tr>
              <Cabecalho rotulo="Nº contrato" col="numero" ordem={ordem} aoOrdenar={aoOrdenar} />
              <Cabecalho rotulo="Banco" col="banco" ordem={ordem} aoOrdenar={aoOrdenar} />
              <Cabecalho rotulo="Descrição" col="descricao" ordem={ordem} aoOrdenar={aoOrdenar} />
              <Cabecalho rotulo="Situação" col="status" ordem={ordem} aoOrdenar={aoOrdenar} />
              <Cabecalho rotulo="Contratado" col="contratado" ordem={ordem} aoOrdenar={aoOrdenar} direita />
              <Cabecalho rotulo="Liberado" col="liberado" ordem={ordem} aoOrdenar={aoOrdenar} direita />
              <Cabecalho rotulo="Amortizado" col="amortizado" ordem={ordem} aoOrdenar={aoOrdenar} direita />
              <Cabecalho rotulo="Saldo devedor" col="saldo" ordem={ordem} aoOrdenar={aoOrdenar} direita />
              <Cabecalho rotulo="Próx. venc." col="proxVencimento" ordem={ordem} aoOrdenar={aoOrdenar} direita />
              <th className={`whitespace-nowrap text-left ${TH_LANC}`}>Pendência</th>
            </tr>
          </thead>
          <tbody>
            {lista.grupos.map((g) => (
              <GrupoDaTabela key={g.chave} g={g} aoAbrir={aoAbrir} />
            ))}
            <tr
              role="button" tabIndex={0} data-testid="lista-fin-encerrados"
              onClick={aoAlternarEncerrados}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aoAlternarEncerrados(); } }}
              aria-expanded={encerradosAbertos}
              className={`${LINHA_LANC} cursor-pointer border-b border-[#eef0f3] bg-[#f3f5f8] text-[#64748b]`}
            >
              <td colSpan={10} className="whitespace-nowrap px-1">
                {encerradosAbertos ? '▾' : '▸'} Encerrados · {lista.encerrados.length} contrato{lista.encerrados.length === 1 ? '' : 's'}
                <span className="ml-1">(quitados, rolados e cancelados — fora das somas)</span>
              </td>
            </tr>
            {encerradosAbertos && lista.encerrados.map((c) => <LinhaDoContrato key={c.id} c={c} encerrado aoAbrir={aoAbrir} />)}
          </tbody>
          <tfoot className="sticky bottom-0 z-10">
            <tr className={`${LINHA_GRUPO} bg-[#dfe4ea] font-semibold`} data-testid="lista-fin-total">
              <td colSpan={4} className="celula-grupo whitespace-nowrap px-1">Total vigente</td>
              <td className={`${NUM} celula-grupo`}><ValorDaSoma s={lista.total.contratado} /></td>
              <td className={`${NUM} celula-grupo`}><ValorDaSoma s={lista.total.liberado} /></td>
              <td className={`${NUM} celula-grupo`}><ValorDaSoma s={lista.total.amortizado} /></td>
              <td className={`${NUM} celula-grupo`}><ValorDaSoma s={lista.total.saldo} /></td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      </div>
      <p className="mt-1 shrink-0 truncate text-[9.5px] text-muted-foreground"
        title="Saldo devedor = liberado − amortizado (não soma juros futuros). ? = o sistema não tem a liberação gravada: o saldo desse contrato não é somado — nunca inventado.">
        Saldo devedor = liberado − amortizado, sem juros futuros. "?" = liberação não gravada: fora da soma, nunca inventada.
      </p>
    </div>
  );
}

function GrupoDaTabela({ g, aoAbrir }: { g: GrupoDaLista; aoAbrir: (id: string) => void }) {
  return (
    <>
      <tr className={`${LINHA_GRUPO} border-b border-[#eef0f3] bg-[#e8eef5] font-semibold text-[#1d3a5d]`} data-testid="lista-fin-grupo">
        <td colSpan={4} className="celula-grupo truncate px-1" title={g.rotulo}>
          {g.tipo === 'linha' ? 'Linha · ' : ''}{g.rotulo} · {g.contratos.length} contrato{g.contratos.length === 1 ? '' : 's'}
        </td>
        <td className={`${NUM} celula-grupo`}><ValorDaSoma s={g.contratado} /></td>
        <td className={`${NUM} celula-grupo`}><ValorDaSoma s={g.liberado} /></td>
        <td className={`${NUM} celula-grupo`}><ValorDaSoma s={g.amortizado} /></td>
        <td className={`${NUM} celula-grupo`}><ValorDaSoma s={g.saldo} /></td>
        <td colSpan={2} />
      </tr>
      {g.contratos.map((c) => <LinhaDoContrato key={c.id} c={c} aoAbrir={aoAbrir} />)}
    </>
  );
}
