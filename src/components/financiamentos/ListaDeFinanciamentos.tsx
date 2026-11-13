/**
 * FIN-FINANC-28-P3 — a aba "Financiamentos" da lista (mock v1.1, partes 1 e 4). SÓ DESENHA: agrupamento, somas e frases vêm do
 * dono puro `listaDeFinanciamentos.ts`, e cada número do contrato vem da fonte única do saldo (a chave `saldo` do lote).
 * ⚠ UMA LINHA POR REGISTRO E RÉGUA FIXA: `table-layout: fixed` + colgroup em px; só a Descrição estica e corta (inteira no
 *   `title`); Banco e Pendência cortam com `title`; número, data, situação e Nº do contrato nunca cortam. Ordenar ou abrir os
 *   encerrados não mexe em largura nem em card.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { REGUA_FIN, ThOrdenavel, emDaRegua, larguraDoMaior } from '@/components/financiamentos/reguaDoFinanciamento';
import { proximaOrdem } from '@/lib/financiamentos/ordemDaTabela';
import { cn } from '@/lib/utils';
import { STATUS_PALETA, STATUS_PILULA_BASE } from '@/lib/financeiro/statusFinanceiro';
import { nomeEDocumento } from '@/lib/fornecedores/fornecedorTexto';
import {
  montarListaDeFinanciamentos, pendenciaCurta, somaConhecida, textoDasPendencias, temNumero,
  type ColunaDaLista, type ContratoDaLista, type GrupoDaLista, type Soma,
} from '@/lib/financiamentos/listaDeFinanciamentos';

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtReal = (v: number) => `R$ ${fmt(v)}`;
/* FIN-FINANC-LAYOUT-03: data SEMPRE dd/mm/aaaa (a regra da casa; a lista era a última em dd/mm/aa) */
const dataCurta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

/* RÉGUA (px) = o maior texto RENDERIZADO da coluna (célula ou cabeçalho) + o padding, medida no Chromium com a Inter e a régua
   de Lançamentos (17/10, FIN-FINANC-28-P3-FIX): Data — "31/12/24" mono 8px, 43,4; Nº — o maior nº real do proto,
   "C_102.022.070.010200", 113,2; Banco — o nome curto ("John Deere") 57,1; Situação — o cabeçalho, 62,6; Contratado /
   Amortizado — o cabeçalho, 77,7; Liberado / Saldo — "50.000.000,00 + ?" no subtotal, 93,6; Próx. venc. — o cabeçalho, 72,8;
   Pendência — "sem liberação · sem nº", 105. Só a Descrição estica e corta (74 a 1.126), com o inteiro no `title`. */
/* FIN-FINANC-LAYOUT-03 (Gabriel 12/11 15:40: "fonte pequena demais", "amort. s/ la…" cortado; decisão 16:58: régua 11/10 "sem quebrar";
   escolha A do Chat 18:00): a lista saiu da régua de Lançamentos (8/9px) e foi para a RÉGUA ÚNICA com o contrato (`reguaDoFinanciamento`).
   As larguras são MEDIDAS A 11px (cabeçalho com a seta de ordenar, 3px de cada lado: Chat 18:35, a Descrição precisa da sobra a 1.126) e vão para a tela em `em` (`emDaRegua`). Medido na
   bancada com os tamanhos reais do proto (12/11): Data "31/12/2026" 65 · Nº "C_102.022.070.010200" 129 · Situação o selo 66 · valores
   "48.500.000,00" 81 e "+ ?" no subtotal ~100 · Pendência pelo maior texto (`larguraDoMaior`). A coluna Banco SAIU (o banco vai na linha do
   grupo); a Descrição fica com a sobra e é a única que quebra a linha. A tabela não tem largura mínima: de 1.126px para cima nunca rola. */
export const REGUA_LISTA_FINANCIAMENTOS: Record<'data' | 'numero' | 'situacao' | 'contratado' | 'liberado' | 'amortizado' | 'saldo' | 'prox' | 'pendencia', number> = {
  data: 72, numero: 136, situacao: 72, contratado: 88, liberado: 106, amortizado: 88, saldo: 106, prox: 68, pendencia: 88,
};

/* A RÉGUA DE "LANÇAMENTOS FINANCEIROS" (a classe `table-financeiro`: cabeçalho 8px maiúsculo, célula 9px) — as MESMAS strings de
   `FinanceiroV2Tab.tsx`. ⚠ FIN-FINANC-LAYOUT-03: a lista de Financiamentos DEIXOU esta régua (está na `reguaDoFinanciamento`); estas
   constantes seguem para a aba "Compras parceladas" e a tabela da compra parcelada, que ainda as usam. */
export const TABELA_LANC = 'table-financeiro';
export const TH_LANC = 'px-1 py-[3px] align-middle text-[8px] uppercase leading-tight font-semibold text-primary-foreground';
export const TD_DATA_LANC = 'celula-data tabular-nums whitespace-nowrap';
export const TD_VALOR_LANC = 'celula-valor font-semibold tabular-nums whitespace-nowrap text-right';
export const LINHA_LANC = 'h-[25px]';

/* a célula da lista na régua única */
const TD_LISTA = `${REGUA_FIN.linha} px-[3px] py-0 align-middle ${REGUA_FIN.td} whitespace-nowrap`;
const NUM = `${TD_LISTA} text-right font-semibold tabular-nums`;
const DATA = `${TD_LISTA} tabular-nums`;
/** a Descrição: a única célula da lista que quebra a linha (texto livre; Chat 18:00). Abaixo de 1.350px vai a 2 linhas (Chat 18:35); só a maior
 *  descrição real (43 letras) a 1.126 precisa de uma 3ª — nunca "…" (dado não se corta) */
const TD_DESCRICAO = `${REGUA_FIN.linha} px-[3px] py-[2px] align-middle ${REGUA_FIN.td} whitespace-normal break-words leading-[1.25]`;
const TH_LISTA = `h-[calc(var(--fin-linha)+4px)] px-[3px] py-0 align-middle ${REGUA_FIN.th} font-semibold text-primary-foreground whitespace-nowrap`;
const AMBAR = 'text-amber-700';
const NEG = 'text-[#b91c1c]';

/* O SELO DA SITUAÇÃO é a forma do status de Lançamentos (`STATUS_PILULA_BASE`, na célula `celula-status`); quitado tem a
   caixa do Realizado e ativo o texto do Programado (as cores da paleta da casa); rolado e cancelado, texto neutro e vermelho. */
const CLASSE_STATUS: Record<string, string> = {
  ativo: STATUS_PALETA.programado.pilula,
  quitado: STATUS_PALETA.realizado.pilula,
  rolado: 'text-[#475569] border-transparent',
  prorrogado: STATUS_PALETA.agendado.pilula,
  cancelado: 'text-[#b91c1c] border-transparent',
};
/** FIN-CONTRATO-JUNTAR-01: o cadastro juntado a outro (cancelado com sucessor) diz "juntado", no tom neutro do rolado */
export function SeloDoContrato({ status, juntado = false }: { status: string; juntado?: boolean }) {
  if (juntado) return <span className={cn(STATUS_PILULA_BASE, CLASSE_STATUS.rolado)} data-testid="selo-juntado">juntado</span>;
  return <span className={cn(STATUS_PILULA_BASE, CLASSE_STATUS[status] ?? CLASSE_STATUS.rolado)}>{status}</span>;
}

function Valor({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined) return <span className={AMBAR} title="sem liberação gravada: o sistema não sabe">?</span>;
  return <span className={v < 0 ? NEG : ''}>{fmt(v)}</span>;
}

const FORA = (n: number) => `${n} contrato(s) sem o valor gravado, fora desta soma`;
/* ZERO INVENTADO NÃO EXISTE (FIN-FINANC-28-P3-FIX): soma sem nenhum valor conhecido é "?" — "0,00 + ?" só com algum conhecido. */
function ValorDaSoma({ s }: { s: Soma }) {
  if (!somaConhecida(s)) return <span className={AMBAR} title={FORA(s.aConfirmar)}>?</span>;
  return (
    <span className={s.valor < 0 ? NEG : ''}>
      {fmt(s.valor)}
      {s.aConfirmar > 0 && (
        <span className={AMBAR} title={FORA(s.aConfirmar)}> + ?</span>
      )}
    </span>
  );
}

/** o texto inteiro da célula Pendência (a mesma regra da linha), para medir a coluna; o selo "+N" mede como "+Nxx" (o padding e o
 *  arredondado do selo) */
function textoDaPendencia(c: ContratoDaLista): string {
  const codigos = c.saldo?.pendencias ?? [];
  /* o rolado: só o número precisa caber numa linha (a seta quebra antes dele, se faltar largura) */
  if ((c.status === 'rolado' || c.juntado) && c.sucessorNumero) return c.sucessorNumero;
  if (codigos.length === 0) return '—';
  return `${pendenciaCurta(codigos.slice(0, 1))}${codigos.length > 1 ? ` +${codigos.length - 1}xx` : ''}`;
}
/** FIN-FINANC-LAYOUT-03 (Chat 18:00, escolha A): os bancos dos contratos do grupo de LINHA vão na linha do grupo (a coluna Banco saiu) */
const bancosDoGrupo = (g: GrupoDaLista): string[] => [...new Set(g.contratos.map((c) => c.banco ?? 'sem banco'))];
/** os pedaços do rótulo do grupo (a linha quebra só entre eles): "Linha · <linha>", cada banco, "N contratos" */
const pedacosDoGrupo = (g: GrupoDaLista): string[] => [
  ...(g.tipo === 'linha' ? [`Linha · ${g.rotulo}`, ...bancosDoGrupo(g)] : [g.rotulo]),
  `${g.contratos.length} contrato${g.contratos.length === 1 ? '' : 's'}`,
];
const textoDoGrupo = (g: GrupoDaLista) => pedacosDoGrupo(g).join(' · ');

function LinhaDoContrato({ c, encerrado, aoAbrir }: { c: ContratoDaLista; encerrado?: boolean; aoAbrir: (id: string) => void }) {
  const s = c.saldo;
  const codigos = s?.pendencias ?? [];
  const sucessor = (c.status === 'rolado' || c.juntado) && c.sucessorNumero ? `→ ${c.sucessorNumero}` : '';
  /* a célula: o sucessor do rolado (quando há) ou a 1ª pendência curta, e as outras num SELO "+N" (Chat 18:00, escolha A; antes o "+1" solto
     não se lia); o `title` diz todas por extenso */
  const textoPend = sucessor || (codigos.length ? pendenciaCurta(codigos.slice(0, 1)) : '');
  const maisPend = sucessor ? 0 : Math.max(0, codigos.length - 1);
  const tituloPend = [sucessor ? `${c.juntado ? 'juntado ao' : 'rolado para o'} contrato ${c.sucessorNumero}` : '', textoDasPendencias(codigos)].filter(Boolean).join(' · ');
  return (
    <tr
      role="link" tabIndex={0} data-testid="lista-fin-contrato"
      onClick={() => aoAbrir(c.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aoAbrir(c.id); } }}
      className={`cursor-pointer border-b border-[#eef0f3] hover:bg-muted/40 ${encerrado ? 'bg-[#f3f5f8] text-[#64748b]' : ''}`}
    >
      <td className={DATA} data-testid="cel-data"
        title={c.dataOrigem === 'liberacao' ? 'data da 1ª liberação' : c.dataOrigem === 'contrato' ? 'data do contrato (sem liberação gravada)' : undefined}>
        {dataCurta(c.data)}
      </td>
      <td className={`${TD_LISTA} font-medium text-[#1d3a5d]`} data-testid="cel-numero" title={c.numeroContrato ?? undefined}>
        {temNumero(c.numeroContrato) ? c.numeroContrato : <span className={AMBAR}>sem nº</span>}
      </td>
      {/* FIN-FINANC-LAYOUT-03 (Chat 18:00, escolha A): a coluna Banco SAIU — o banco está na linha do grupo (o grupo é o banco, ou "Linha · … ·
          <bancos>") e no `title` da Descrição ("Nome · CPF/CNPJ"). A Descrição (texto livre, como a Obs.) é a ÚNICA que quebra a linha,
          quando falta largura (abaixo de ~1.310px); número, datas, valores e situação nunca quebram nem cortam. */}
      <td className={TD_DESCRICAO} title={[c.descricao, nomeEDocumento(c.banco, c.bancoDocumento)].filter(Boolean).join(' · ')} data-testid="cel-descricao">{c.descricao}</td>
      <td className={`${TD_LISTA} px-[4px]`}><SeloDoContrato status={c.status} juntado={c.juntado} /></td>
      <td className={`${NUM}`}><Valor v={s?.contratado} /></td>
      <td className={`${NUM}`} data-testid="cel-liberado"><Valor v={s ? s.liberado : null} /></td>
      <td className={`${NUM}`}><Valor v={s?.amortizado} /></td>
      <td className={`${NUM} font-semibold`} data-testid="cel-saldo"><Valor v={s ? s.saldo : null} /></td>
      <td className={`${DATA} text-right`}>{dataCurta(c.proxVencimento)}</td>
      {/* o sucessor do rolado: a seta pode ficar numa linha e o NÚMERO inteiro na outra (Chat 22:00: nunca encostar/cortar na borda) */}
      <td className={`${sucessor ? TD_DESCRICAO : TD_LISTA} ${textoPend ? AMBAR : 'text-[#94a3b8]'}`} data-testid="cel-pendencia" title={tituloPend || undefined}>
        {sucessor ? <>→ <span className="whitespace-nowrap">{c.sucessorNumero}</span></> : textoPend || '—'}
        {maisPend > 0 && <> <span className="rounded-full bg-[#fdf0dc] px-[5px] text-[10px] font-semibold leading-[14px]" data-testid="mais-pendencias">+{maisPend}</span></>}
      </td>
    </tr>
  );
}

export function ListaDeFinanciamentos({ contratos, encerradosAbertos, aoAlternarEncerrados, aoAbrir, filtros, aoAbrirCronograma, parcelasAPagar }: {
  contratos: readonly ContratoDaLista[];
  /** ⚠ SEM EFEITO desde o FIN-FINANC-LAYOUT-03 (Chat 18:00, escolha A): a coluna Banco saiu da tabela (o banco vai na linha do grupo).
   *  Fica declarada porque a página ainda a passa (FIN-FINANC-28-P3-FIX2: "false quando a lista é agrupada só por banco"). */
  mostrarBanco?: boolean;
  /** a fileira de filtros da tela (a mesma da aba "Compras parceladas"), entre os cards e a tabela */
  filtros?: ReactNode;
  encerradosAbertos: boolean;
  aoAlternarEncerrados: () => void;
  aoAbrir: (id: string) => void;
  /** FIN-FINANC-28 P3-GRAFICO — o clique no card "Parcelas a pagar" abre o cronograma anual do que falta pagar. */
  aoAbrirCronograma?: () => void;
  /**
   * FIN-FINANC-28 P3-GRAFICO / passo 4c — o PRINCIPAL A PAGAR (parcelas a vencer) do recorte, em reais, do dono `graficoDeSaidas`
   * (o mesmo do modal anual; os vencidos e os juros ficam no gráfico). Sem ele, o card "Parcelas a pagar" não aparece e a fileira é a de antes.
   */
  parcelasAPagar?: number | null;
}) {
  const [ordem, setOrdem] = useState<{ col: ColunaDaLista; dir: 'asc' | 'desc' }>({ col: 'data', dir: 'asc' });
  const aoOrdenar = (col: ColunaDaLista) => setOrdem((o) => proximaOrdem(o, col));
  const th = { ordem, aoOrdenar, className: TH_LISTA };
  const lista = useMemo(() => montarListaDeFinanciamentos(contratos, ordem.col, ordem.dir), [contratos, ordem]);
  const R = REGUA_LISTA_FINANCIAMENTOS;
  /* Pendência: o maior texto inteiro ("amort. s/ lanç." + o selo "+N", "→ <sucessor>"); a Descrição fica com a sobra e quebra (Chat 18:00).
     Sem largura mínima na tabela: de 1.126px para cima NUNCA rola na horizontal. */
  const larguraDaPendencia = larguraDoMaior(contratos.map(textoDaPendencia), { piso: R.pendencia, folga: 10 });

  /* card de soma: sem nenhum valor conhecido o número é "?" e o lado diz "N a confirmar"; com algum, "R$ x" e "+ N a confirmar" */
  const cardDaSoma = (rotulo: string, titulo: string, s: Soma) => {
    const conhecida = somaConhecida(s);
    return {
      rotulo, titulo, valor: conhecida ? fmtReal(s.valor) : '?', tom: conhecida ? '' : AMBAR,
      extra: s.aConfirmar > 0 ? `${conhecida ? '+ ' : ''}${s.aConfirmar} a confirmar` : null,
      tituloExtra: s.aConfirmar > 0 ? FORA(s.aConfirmar) : undefined,
    };
  };
  const cards: { rotulo: string; titulo: string; valor: string; extra: string | null; tituloExtra?: string; tom: string }[] = [
    cardDaSoma('Contratado', 'Contratado (vigentes)', lista.total.contratado),
    cardDaSoma('Liberado', 'Liberado (vigentes)', lista.total.liberado),
    cardDaSoma('Saldo devedor', 'Saldo devedor (principal: liberado − amortizado)', lista.total.saldo),
    ...(parcelasAPagar !== undefined ? [{ rotulo: 'Parcelas a pagar', titulo: 'Principal das parcelas a vencer; vencidos e juros previstos no gráfico',
      valor: parcelasAPagar === null ? '…' : fmtReal(parcelasAPagar), extra: null, tom: '' }] : []),
    { rotulo: 'Com pendência', titulo: 'Contratos com pendência', valor: String(lista.comPendencia), extra: null,
      tom: lista.comPendencia > 0 ? AMBAR : '' },
  ];

  return (
    /* FIN-FINANC-LAYOUT-03 (Chat 18:35): abaixo de 1.310px a lista desce para 10/9 (`regua-fin-lista`, reguaDoFinanciamento.css) */
    <div className="regua-fin-lista flex h-full min-h-0 flex-col" data-testid="lista-de-financiamentos">
      <div className={`mb-2 grid shrink-0 gap-2 ${cards.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`} data-testid="lista-fin-cards">
        {cards.map((c) => (
          <div key={c.rotulo} className="h-[40px] rounded-md border border-l-[3px] border-l-primary px-3 py-1">
            {/* o "+ ?" mora na linha do RÓTULO, num lugar sempre presente à direita: o valor nunca divide a linha com ele e o
                cartão não muda de tamanho quando ele aparece (o rótulo é o que corta, inteiro no `title`) */}
            <div className="flex items-center gap-1 text-[10px] leading-none">
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={c.titulo}>{c.rotulo}</span>
              <span className={`shrink-0 whitespace-nowrap text-[9.5px] ${AMBAR}`} title={c.tituloExtra}>{c.extra ?? ''}</span>
            </div>
            {c.rotulo === 'Parcelas a pagar' && aoAbrirCronograma ? (
              <button type="button" onClick={aoAbrirCronograma} data-testid="abrir-cronograma-anual"
                className={`mt-0.5 block whitespace-nowrap text-[13px] font-semibold leading-tight tabular-nums ${c.tom}`}>{c.valor}</button>
            ) : (
              <div className={`mt-0.5 whitespace-nowrap text-[13px] font-semibold leading-tight tabular-nums ${c.tom}`}>{c.valor}</div>
            )}
          </div>
        ))}
      </div>

      {/* filtros + tabela no MESMO card da aba "Compras parceladas" (mesma classe, mesma posição dos filtros) */}
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card px-3 pt-2 pb-2 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
      {filtros}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-md border border-border" data-testid="lista-fin-rolagem">
        <table className={`w-full table-fixed border-collapse ${REGUA_FIN.tabela}`} data-testid="lista-fin-tabela">
          <colgroup>
            <col style={{ width: emDaRegua(R.data) }} /><col style={{ width: emDaRegua(R.numero) }} /><col />
            <col style={{ width: emDaRegua(R.situacao) }} /><col style={{ width: emDaRegua(R.contratado) }} /><col style={{ width: emDaRegua(R.liberado) }} />
            <col style={{ width: emDaRegua(R.amortizado) }} /><col style={{ width: emDaRegua(R.saldo) }} /><col style={{ width: emDaRegua(R.prox) }} />
            <col style={{ width: emDaRegua(larguraDaPendencia) }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-primary text-primary-foreground">
            <tr>
              <ThOrdenavel col="data" {...th}>Data</ThOrdenavel>
              <ThOrdenavel col="numero" {...th}>Nº contrato</ThOrdenavel>
              <ThOrdenavel col="descricao" {...th}>Descrição</ThOrdenavel>
              <ThOrdenavel col="status" {...th}>Situação</ThOrdenavel>
              <ThOrdenavel col="contratado" direita {...th}>Contratado</ThOrdenavel>
              <ThOrdenavel col="liberado" direita {...th}>Liberado</ThOrdenavel>
              <ThOrdenavel col="amortizado" direita {...th}>Amortizado</ThOrdenavel>
              <ThOrdenavel col="saldo" direita {...th}>Saldo devedor</ThOrdenavel>
              {/* FIN-FINANC-LAYOUT-03 (Chat 22:00): toda coluna ordena (Próx. venc. e Pendência também); o rótulo "Próx. / venc." em 2 linhas
                  (o Chat permitiu encurtar SÓ rótulo de cabeçalho) — a coluna fica com a largura da data e a sobra vai para a Descrição */}
              <ThOrdenavel col="proxVencimento" direita {...th} title="Próximo vencimento">
                <span className="inline-block whitespace-normal text-right leading-[calc(var(--fin-linha)/2)]">Próx.<br />venc.</span>
              </ThOrdenavel>
              <ThOrdenavel col="pendencia" {...th}>Pendência</ThOrdenavel>
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
              className="cursor-pointer border-b border-[#eef0f3] bg-[#f3f5f8] text-[#64748b]"
            >
              <td colSpan={10} className={TD_LISTA}>
                {encerradosAbertos ? '▾' : '▸'} Encerrados · {lista.encerrados.length} contrato{lista.encerrados.length === 1 ? '' : 's'}
                <span className="ml-1">(quitados, rolados e cancelados — fora das somas)</span>
              </td>
            </tr>
            {encerradosAbertos && lista.encerrados.map((c) => <LinhaDoContrato key={c.id} c={c} encerrado aoAbrir={aoAbrir} />)}
          </tbody>
          <tfoot className="sticky bottom-0 z-10">
            <tr className="bg-[#dfe4ea] font-semibold" data-testid="lista-fin-total">
              <td colSpan={4} className={`${TD_LISTA} font-bold`}>Total vigente</td>
              <td className={`${NUM} font-bold`}><ValorDaSoma s={lista.total.contratado} /></td>
              <td className={`${NUM} font-bold`}><ValorDaSoma s={lista.total.liberado} /></td>
              <td className={`${NUM} font-bold`}><ValorDaSoma s={lista.total.amortizado} /></td>
              <td className={`${NUM} font-bold`}><ValorDaSoma s={lista.total.saldo} /></td>
              <td colSpan={2} className={TD_LISTA} />
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
      <tr className="border-b border-[#eef0f3] bg-[#e8eef5] font-semibold text-[#1d3a5d]" data-testid="lista-fin-grupo">
        {/* FIN-FINANC-LAYOUT-03 (escolha A): o rótulo do grupo leva os bancos; ele quebra a linha SÓ ENTRE os pedaços — cada nome inteiro
            (nome nunca quebra nem corta) */}
        <td colSpan={4} className={`${TD_DESCRICAO} font-bold`} title={textoDoGrupo(g)} data-testid="rotulo-do-grupo">
          {pedacosDoGrupo(g).map((t, i) => <span key={t} className="whitespace-nowrap">{i > 0 ? ' · ' : ''}{t}</span>)}
        </td>
        <td className={`${NUM} font-bold`}><ValorDaSoma s={g.contratado} /></td>
        <td className={`${NUM} font-bold`}><ValorDaSoma s={g.liberado} /></td>
        <td className={`${NUM} font-bold`}><ValorDaSoma s={g.amortizado} /></td>
        <td className={`${NUM} font-bold`}><ValorDaSoma s={g.saldo} /></td>
        <td colSpan={2} className={TD_LISTA} />
      </tr>
      {g.contratos.map((c) => <LinhaDoContrato key={c.id} c={c} aoAbrir={aoAbrir} />)}
    </>
  );
}
