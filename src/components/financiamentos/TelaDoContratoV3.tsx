/**
 * FIN-FINANC-28 · TELA DO CONTRATO v4 (mock aprovado pelo Gabriel 18/10 16:11, caso NJ PR-78.179; substitui o visual da v3/B3) — o
 * TOPO do contrato de crédito (financiamento, empréstimo, consórcio) e as abas Pagamentos e Histórico. Compra parcelada não passa aqui.
 *
 *  · linha do título, uma linha: "←" · "<nº> · <descrição>" 14px/600 · selo da situação · selo laranja "N pendências" (abre a aba A
 *    resolver) · ações (Editar · lugar RESERVADO do Juntar · Dar baixa dourado), botões de 26px a 11px;
 *  · A FICHA: um card só — a faixa Resumo (5 células iguais: Contratado · Liberado · Principal pago · Saldo devedor · Vencido / Próximo
 *    pagamento / Quitado em) e os fatos em 3 colunas (rótulo da largura do maior DAQUELA coluna, valor colado a 10px).
 * ⚠ SÓ DESENHA: nada é somado aqui — totais, "a identificar", taxa a.a. e as pendências vêm de `fn_contrato_tela`.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { REGUA_FIN, ThOrdenavel, emDaRegua, larguraDoMaior } from '@/components/financiamentos/reguaDoFinanciamento';
import { ordenarPor, proximaOrdem, type Ordem, type ValorDeOrdem } from '@/lib/financiamentos/ordemDaTabela';
import type { SaldoDoContrato } from '@/lib/financiamentos/situacaoDoContrato';
import {
  NAO_CADASTRADO, ROTULO_DA_ACAO, ROTULO_DA_SITUACAO, dataBr, textoDaAtividade, textoDaCarencia, textoDaTaxa, textoDaTaxaAa, textoDoSistema,
  type AcaoDoPendente, type EventoNaTela, type PagamentoNaTela, type PendenteDoContrato, type TelaDoContrato,
} from '@/lib/financiamentos/telaDoContrato';

const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* FIN-CONTRATO-TELA-FONTE-01 (Gabriel 19/10/2026) — UMA ESCALA para a tela do contrato, aqui e em `FinanciamentoDetalhe.tsx` (espelho
   declarado): título 13px que quebra em duas linhas reservadas; fatos 11px; cartão rótulo 10px / valor 12px; bloco 11px; tabela
   cabeçalho 10px, célula 10,5px, total 10,5px bold; recado 11px. NUNCA "…": texto longo de uma linha ROLA DENTRO DO LUGAR dele
   (`.uma-linha-que-rola`, a regra do FIN-FILTRO-DOC-01 em `src/index.css`), recado quebra a linha. */
export const ESCALA_DO_CONTRATO = {
  titulo: 'text-[13px] font-semibold leading-[16px]',
  fato: 'text-[11px]',
  cartaoRotulo: 'text-[10px]',
  cartaoValor: 'text-[12px] font-semibold',
  bloco: 'text-[11px] font-semibold',
  /* FIN-FINANC-LAYOUT-03 (Gabriel 12/11 15:40): as tabelas do contrato na RÉGUA ÚNICA com a lista (`reguaDoFinanciamento`): célula N,
     cabeçalho N−1, total N negrito — N é a escolha do Gabriel (10 ou 11). Antes: cabeçalho 10,5 / célula 11 (LAYOUT-02). */
  th: REGUA_FIN.th,
  td: REGUA_FIN.td,
  total: REGUA_FIN.total,
  recado: 'text-[11px]',
  rola: 'uma-linha-que-rola',
  /* FIN-FINANC-LAYOUT-01 (Gabriel 05/11): a DATA fica um passo abaixo do texto ao lado (célula 11px → data 10,5px; nos fatos, o peso do
     rótulo); o valor em R$ segue com destaque */
  /* FIN-FINANC-LAYOUT-03: na tabela, meio passo abaixo da célula da régua */
  data: REGUA_FIN.data,
  /* FIN-FINANC-LAYOUT-01 (Gabriel 05/11, F1): as DUAS fontes acima de 13px da tela, aprovadas — o nome na faixa do título e o valor do Resumo */
  nome: 'text-[15px] font-semibold leading-[16px]',
  /* FIN-FINANC-LAYOUT-02 (Gabriel 11/11): os cards do topo com o valor a 16px negrito (rótulo 10px); abaixo de 800px de janela (zoom
     alto) 14px — a 750 "R$ 593.640,00" a 16px passava 8px do card (check-ui-cortes) */
  /* FIN-FINANC-LAYOUT-03: com 7 cartões (+ A liberar e Encargos na liberação) o valor é 13px até 1.400px de janela e 16px dali para cima;
     abaixo de 1.100px os cartões vão para 2 linhas (4 + 3); a 1.126 os 7 cabem com o valor a 13px (Chat 16:45: "fonte menor nessa faixa"). A 1.126 "R$ 6.219.687,53" a 16px passava do cartão (medido na bancada). */
  resumoValor: 'text-[13px] font-bold leading-[20px] min-[1400px]:text-[16px]',
  /* FORN-01b (regra de corte de 21/10 07h25) — texto em CÉLULA de tabela: uma linha, "…" quando não cabe, o inteiro no `title` */
  celula: 'block truncate',
};
const E = ESCALA_DO_CONTRATO;
const reais = (v: number) => `R$ ${num2(v)}`;
function LinhaPendente({ p, onResolver }: { p: PendenteDoContrato; onResolver: (acao: AcaoDoPendente, p: PendenteDoContrato) => void }) {
  return (
    <div className="flex min-h-[22px] min-w-0 items-center gap-2 py-0.5" data-testid={`pendente-${p.chave}`}>
      <span className={`size-2 shrink-0 rounded-full ${p.tom === 'vencido' ? 'bg-[#b91c1c]' : 'bg-amber-500'}`} />
      <span className={`min-w-0 flex-1 break-words ${REGUA_FIN.td} leading-[14px] ${p.tom === 'vencido' ? 'text-[#b91c1c]' : ''}`}>{p.texto}</span>
      <span className={`w-[110px] shrink-0 text-right ${REGUA_FIN.td} font-medium tabular-nums`}>{p.valor === null ? '' : num2(p.valor)}</span>
      <Button variant="outline" size="sm" className="h-5 w-[118px] shrink-0 px-2 text-[10px]" onClick={() => onResolver(p.acao, p)}
        data-testid={`resolver-${p.chave}`}>{ROTULO_DA_ACAO[p.acao]}</Button>
    </div>
  );
}

/* ═══ TELA DO CONTRATO v4 (Gabriel 18/10 16:11) — a PALETA da tela: rótulo cinza-escuro, valor quase preto, bordas e fundos mais
   firmes ("poluído, cores muito claras"). Laranja e vermelho com fundo próprio. */
export const COR_V4 = {
  rotulo: 'text-[#556070]', valor: 'text-[#111827]', borda: 'border-[#d3dae3]', bordaFina: 'border-[#e3e8ee]', pagina: 'bg-[#e9edf2]',
  laranja: 'text-[#b45309]', fundoLaranja: 'bg-[#fdf0dc]', vermelho: 'text-[#b42318]', fundoVermelho: 'bg-[#fde8e6]',
};
const NaoCadastrado = () => <span className={COR_V4.laranja} data-testid="nao-cadastrado">{NAO_CADASTRADO}</span>;
const ouNaoCadastrado = (v: string | null) => (v === null ? <NaoCadastrado /> : <span className={E.rola}>{v}</span>);
/** a liberação sem lançamento vinculado: a data em laranja, o porquê no `title` (sem selo ao lado) */
function Marco({ m }: { m: TelaDoContrato['contrato']['primeiraLiberacao'] }) {
  if (!m) return <span className={COR_V4.laranja} title="nenhuma liberação gravada">—</span>;
  return m.aConfirmar
    ? <span className={`tabular-nums ${COR_V4.laranja}`} title="a confirmar: liberação sem lançamento vinculado" data-testid="data-a-confirmar">{dataBr(m.data)}</span>
    : <span className="tabular-nums">{dataBr(m.data)}</span>;
}

const SITUACAO_TOM: Record<string, string> = {
  ativo: 'bg-[#e0e9f5] text-[#1d3a5d]', prorrogado: 'bg-[#e0e9f5] text-[#1d3a5d]', quitado: 'bg-[#dcf2e3] text-[#166534]',
  rolado: 'bg-[#e3e8ee] text-[#475569]', cancelado: 'bg-[#e3e8ee] text-[#475569]',
};

/** a 5ª célula do Resumo: Vencido (vermelho) quando há; senão o próximo pagamento; no quitado, a data da quitação. Vem pronta da tela. */
export interface QuintaCelula { rotulo: string; valor: string; title?: string; vermelho?: boolean }

/** FIN-FINANC-LAYOUT-03 — um fato do contrato: rótulo pequeno cinza EM CIMA, valor embaixo (11px); `largo` = duas colunas da grade */
function BlocoDeFato({ rotulo, valor, testId, largo = false }: { rotulo: string; valor: ReactNode; testId?: string; largo?: boolean }) {
  return (
    <div className={`min-w-0 ${largo ? 'col-span-2' : ''}`} data-testid={testId}>
      <div className={`h-[13px] whitespace-nowrap text-[10px] leading-[13px] ${COR_V4.rotulo}`}>{rotulo}</div>
      <div className={`flex h-[17px] min-w-0 items-center whitespace-nowrap ${E.fato} font-medium leading-[17px] ${COR_V4.valor}`}>{valor}</div>
    </div>
  );
}

function CelulaDoResumo({ rotulo, valor, title, vermelho, laranja, testId }: { rotulo: string; valor: string; title?: string; vermelho?: boolean; laranja?: boolean; testId?: string }) {
  return (
    <div className={`min-w-0 border-l px-2 py-1 first:border-l-0 ${COR_V4.bordaFina}`} title={title} data-testid={testId ?? `resumo-${rotulo.split(' ')[0]}`}>
      {/* FIN-FINANC-LAYOUT-02 (Gabriel 11/11): rótulo 10px, valor 16px negrito */}
      <div className={`${E.rola} ${E.cartaoRotulo} leading-[14px] ${vermelho ? COR_V4.vermelho : COR_V4.rotulo}`}>{rotulo}</div>
      <div className={`whitespace-nowrap ${E.resumoValor} tabular-nums ${vermelho ? COR_V4.vermelho : laranja ? COR_V4.laranja : COR_V4.valor}`}>{valor}</div>
    </div>
  );
}

export function TopoDoContrato({ numero, descricao, status, saldo, aLiberar, encargos, tela, parcelas, quinta, onVoltar, onEditar, acaoDeBaixa, acaoDeJuntar, pendencias, onAbrirPendencias, jurosNoCronograma = false }: {
  numero: string | null; descricao: string; status: string | null; saldo: SaldoDoContrato | null | undefined;
  /** FIN-FINANC-LAYOUT-03: contratado − liberado (`aLiberarDoContrato`, do saldo do banco); nulo = "—" */
  aLiberar: number | null;
  /** FIN-FINANC-LAYOUT-03: a soma dos encargos ligados (`encargosDoContrato`); nulo = nenhum; undefined = lendo */
  encargos: { total: number; papeis: string } | null | undefined;
  tela: TelaDoContrato | null; parcelas: { total: number; pagas: number } | null; quinta: QuintaCelula | null;
  /** FIN-FINANC-LAYOUT-01 (b): o cronograma tem juros (a taxa 0 vira "não cadastrado") */
  jurosNoCronograma?: boolean;
  onVoltar?: () => void; onEditar: () => void; acaoDeBaixa?: ReactNode;
  /** FIN-CONTRATO-JUNTAR-01: o botão "Juntar", no lugar reservado */
  acaoDeJuntar?: ReactNode;
  /** quantas pendências a aba "A resolver" tem; o selo laranja a abre e some sem pendência */
  pendencias: { qtde: number; vencido: boolean }; onAbrirPendencias: () => void;
}) {
  const s = saldo ?? null;
  const semLiberacao = s !== null && s.liberado === null;
  const c = tela?.contrato ?? null; const k = tela?.condicoes ?? null;
  /* FIN-FINANC-LAYOUT-01 (Gabriel 05/11/2026): o TÍTULO é a descrição do contrato ("FCO - Curral"); o credor e o nº da cédula vão
     pequenos ao lado — antes o nº vinha na frente e um placeholder ("Atualizar") escondia o nome */
  const titulo = descricao.trim() || numero || 'sem nº';
  const aoLado = [c?.credor ?? null, descricao.trim() && numero ? `Nº ${numero}` : null].filter(Boolean).join(' · ');
  const r = (v: number | null | undefined) => (v === null || v === undefined ? '—' : reais(v));
  return (
    <div className="space-y-2" data-testid="topo-do-contrato">
      {/* 1 — A LINHA DE CIMA: ← · ações à direita (botões de 26px, 11px). FIN-FINANC-LAYOUT-01: o título, os selos e o credor foram
          para a faixa do título, a 1ª linha do card */}
      <div className="flex h-[34px] min-w-0 items-center gap-2" data-testid="linha-do-titulo-credito">
        <button type="button" onClick={onVoltar} className="flex size-[26px] shrink-0 items-center justify-center rounded text-[#1d3a5d] hover:bg-[#dfe5ec]"
          title="Voltar para Financiamentos" aria-label="Voltar para Financiamentos" data-testid="voltar-do-contrato">
          <ArrowLeft className="size-4" />
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1.5" data-testid="botoes-do-credito">
          <Button variant="outline" size="sm" className="h-[26px] gap-1 px-2.5 text-[11px]" onClick={onEditar}><Pencil className="size-3" /> Editar</Button>
          {/* FIN-CONTRATO-JUNTAR-01 — o lugar do "Juntar" é reservado (nada se move quando ele acende) */}
          <span className="inline-flex h-[26px] w-[64px] shrink-0" aria-hidden={acaoDeJuntar ? undefined : true} data-testid="lugar-do-juntar">{acaoDeJuntar}</span>
          {acaoDeBaixa}
        </div>
      </div>

      {/* 2 — A FICHA: um card só. FIN-FINANC-LAYOUT-01 (Gabriel 05/11, referência fin-financ-referencia-chat.html `.tt`): a 1ª linha do card
          é a FAIXA DO TÍTULO — o nome do contrato 15px negrito, os selos e o credor · Nº 11px cinza; no topo da página ficam só a seta e os
          botões. Depois o Resumo em faixa (5 células iguais) e os fatos em 3 colunas */}
      <section className={`overflow-hidden rounded-lg border bg-white ${COR_V4.borda}`} data-testid="ficha-do-contrato">
        <div className="flex min-h-[34px] min-w-0 items-center gap-2.5 rounded-t-lg border-b border-[#eef0f3] bg-[#f7f9fc] px-3 pb-[7px] pt-[9px]" data-testid="faixa-do-titulo">
          <span className={`max-h-[32px] min-w-0 shrink overflow-y-auto break-words ${E.nome} ${COR_V4.valor}`} data-testid="titulo-do-contrato">{titulo}</span>
        {status && (
          <span className={`shrink-0 rounded-full px-2 text-[10.5px] font-semibold leading-[18px] ${SITUACAO_TOM[status] ?? SITUACAO_TOM.rolado}`}
            data-testid="selo-da-situacao">{ROTULO_DA_SITUACAO[status] ?? status}</span>
        )}
        {pendencias.qtde > 0 && (
          <button type="button" onClick={onAbrirPendencias} title="abrir a aba A resolver" data-testid="selo-das-pendencias"
            className={`shrink-0 rounded-full px-2 text-[10.5px] font-semibold leading-[18px] hover:underline ${COR_V4.fundoLaranja} ${COR_V4.laranja}`}>
            {pendencias.qtde === 1 ? '1 pendência' : `${pendencias.qtde} pendências`}
          </button>
        )}
          {aoLado && <span className={`min-w-0 max-w-[340px] shrink-[2] ${E.rola} text-[11px] ${COR_V4.rotulo}`} title={aoLado} data-testid="credor-e-cedula">{aoLado}</span>}
        </div>
        {/* FIN-FINANC-LAYOUT-03 (Gabriel 12/11): 7 cartões — "A liberar" (contratado − liberado, do saldo do banco) e "Encargos na liberação"
            (os encargos ligados ao contrato: tarifas, IOF, estudo) entram ao lado do Liberado; números prontos de quem chama */}
        <div className={`grid grid-cols-4 border-b bg-[#f4f6f9] min-[1100px]:grid-cols-7 ${COR_V4.bordaFina}`} data-testid="bloco-resumo">
          <CelulaDoResumo rotulo="Contratado" valor={r(s?.contratado)} />
          <CelulaDoResumo rotulo="Liberado" valor={semLiberacao ? '?' : r(s?.liberado)} laranja={semLiberacao} title={semLiberacao ? 'Nenhuma liberação gravada.' : undefined} />
          <CelulaDoResumo rotulo="A liberar" testId="resumo-a-liberar" valor={semLiberacao ? '?' : r(aLiberar)} laranja={semLiberacao}
            title={semLiberacao ? 'Nenhuma liberação gravada.' : 'contratado − liberado (fn_financiamento_saldo)'} />
          <CelulaDoResumo rotulo="Encargos na liberação" testId="resumo-encargos" valor={encargos === undefined ? '…' : r(encargos?.total ?? 0)}
            title={encargos ? `encargos ligados ao contrato: ${encargos.papeis}` : 'nenhum encargo ligado ao contrato'} />
          <CelulaDoResumo rotulo="Principal pago" valor={r(s?.amortizado)} />
          <CelulaDoResumo rotulo="Saldo devedor" valor={semLiberacao ? '?' : r(s?.saldo)} laranja={semLiberacao}
            title={semLiberacao ? 'Sem liberação gravada: o saldo devedor não se deduz do contratado.' : 'liberado − principal pago (fn_financiamento_saldo)'} />
          {quinta ? <CelulaDoResumo rotulo={quinta.rotulo} valor={quinta.valor} title={quinta.title} vermelho={quinta.vermelho} /> : <CelulaDoResumo rotulo="Próx. pgto." valor="—" title="Próximo pagamento" />}
        </div>
        {/* FIN-FINANC-LAYOUT-03 (Gabriel 12/11 15:40: "compactado à esquerda, sobra metade vazia"): os fatos numa GRADE na largura inteira — 7
            colunas iguais (4 abaixo de 1.100px de janela), rótulo pequeno cinza EM CIMA do valor, nada colado; o Credor ocupa duas */}
        <div className="grid grid-cols-4 gap-x-4 gap-y-1 px-3 py-1.5 min-[1100px]:grid-cols-7" data-testid="colunas-do-contrato">
          <BlocoDeFato rotulo="Credor" testId="campo-credor" largo valor={c?.credor
            ? <span className={`min-w-0 ${E.rola}`} data-testid="credor-do-contrato">{c.credor}</span> : <NaoCadastrado />} />
          <BlocoDeFato rotulo="CNPJ/CPF" testId="campo-documento" valor={c?.credorDocumento ? <span className="tabular-nums">{c.credorDocumento}</span> : <NaoCadastrado />} />
          <BlocoDeFato rotulo="Atividade" testId="campo-atividade" valor={ouNaoCadastrado(textoDaAtividade(c?.atividade ?? null))} />
          <BlocoDeFato rotulo="Sistema" testId="campo-sistema" valor={k ? ouNaoCadastrado(textoDoSistema(k.sistema)) : '…'} />
          <BlocoDeFato rotulo="Parcelas" testId="campo-parcelas" valor={<span className="tabular-nums">{parcelas ? `${parcelas.total} · ${parcelas.pagas} pagas` : '…'}</span>} />
          <BlocoDeFato rotulo="Carência" testId="campo-carencia" valor={k ? ouNaoCadastrado(textoDaCarencia(k.carenciaAte)) : '…'} />
          <BlocoDeFato rotulo="Data do contrato" testId="campo-data-do-contrato" valor={<span className="tabular-nums">{dataBr(c?.dataContrato ?? null) ?? '—'}</span>} />
          <BlocoDeFato rotulo="1ª liberação" testId="campo-primeira-liberacao" valor={<Marco m={c?.primeiraLiberacao ?? null} />} />
          <BlocoDeFato rotulo="Última liberação" testId="campo-ultima-liberacao" valor={<Marco m={c?.ultimaLiberacao ?? null} />} />
          <BlocoDeFato rotulo="Vencimento final" testId="campo-vencimento-final" valor={<span className="tabular-nums">{dataBr(c?.vencimentoFinal ?? null) ?? '—'}</span>} />
          <BlocoDeFato rotulo="Taxa" testId="campo-taxa" valor={k ? ouNaoCadastrado(textoDaTaxa(k, jurosNoCronograma)) : '…'} />
          <BlocoDeFato rotulo="Taxa a.a." testId="campo-taxa-aa" valor={k ? ouNaoCadastrado(textoDaTaxaAa(k, jurosNoCronograma)) : '…'} />
        </div>
      </section>
    </div>
  );
}

/* ═══ ABA "A RESOLVER" (B3, Gabriel 18/10): a lista das pendências, uma por linha (bolinha, texto, valor, botão que resolve).
   As do banco (`fn_contrato_tela`) e, por último, os avisos do cronograma (o principal que não fecha com o contratado e a 1ª parcela; só informam). */
export function ListaDePendencias({ pendencias, avisos, onResolver }: {
  pendencias: readonly PendenteDoContrato[]; avisos: readonly string[]; onResolver: (acao: AcaoDoPendente, p: PendenteDoContrato) => void;
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto rounded-md border bg-card px-3 py-1.5" data-testid="lista-de-pendencias">
      {pendencias.map((p) => <LinhaPendente key={p.chave} p={p} onResolver={onResolver} />)}
      {avisos.map((a) => (
        <div key={a} className="flex min-h-[22px] min-w-0 items-center gap-2 py-0.5" data-testid="pendente-aviso">
          <span className="size-2 shrink-0 rounded-full bg-amber-500" />
          <span className={`min-w-0 flex-1 break-words ${REGUA_FIN.td}`}>{a}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══ ABAS PAGAMENTOS e HISTÓRICO — a régua única (`reguaDoFinanciamento`), cabeçalho e total presos (só o corpo rola).
   FIN-FINANC-LAYOUT-03: todo cabeçalho ordena (`ThOrdenavel`, ordem padrão pela data); o total não se mexe. Larguras em `em` da célula. */
const TH = `sticky top-0 z-10 ${REGUA_FIN.linha} bg-primary px-2 text-left ${E.th} font-semibold text-primary-foreground whitespace-nowrap`;
const TD = `${REGUA_FIN.linha} px-2 ${E.td} whitespace-nowrap`;
const TD_D = `${TD} tabular-nums`;
const TD_R = `${TD} text-right tabular-nums`;
const TF = `sticky bottom-0 z-10 ${REGUA_FIN.linha} bg-[#E8E6DF] px-2 ${E.total} whitespace-nowrap`;
const col = (px11: number) => <col style={{ width: emDaRegua(px11) }} />;

type ColunaDoPagamento = 'data' | 'item' | 'principal' | 'juros' | 'encargos' | 'total' | 'conta' | 'lancamento';
const valorDoPagamento = (p: PagamentoNaTela, c: ColunaDoPagamento): ValorDeOrdem =>
  c === 'data' ? p.data : c === 'item' ? p.item : c === 'conta' ? p.conta : c === 'lancamento' ? (p.lancamentoId ? 1 : 0) : p[c];

export function TabelaDePagamentos({ tela, onAbrirLancamento }: { tela: TelaDoContrato | null; onAbrirLancamento: (id: string) => void }) {
  const t = tela?.pagamentosTotal;
  const [ordem, setOrdem] = useState<Ordem<ColunaDoPagamento>>({ col: 'data', dir: 'asc' });
  const aoOrdenar = (c: ColunaDoPagamento) => setOrdem((o) => proximaOrdem(o, c));
  const linhas = useMemo(() => (tela?.pagamentos ? ordenarPor(tela.pagamentos, ordem, valorDoPagamento) : null), [tela?.pagamentos, ordem]);
  const th = { ordem, aoOrdenar, className: TH };
  /* FIN-FINANC-LAYOUT-03 (16:58 "sem quebrar"): Conta pelo maior nome; o Item fica com a sobra e tem como mínimo o maior item — abaixo
     disso a tabela rola dentro do quadro (nunca corta nem quebra) */
  const largConta = larguraDoMaior((tela?.pagamentos ?? []).map((p) => p.conta ?? '—'), { piso: 70 });
  const minimoDoItem = larguraDoMaior((tela?.pagamentos ?? []).map((p) => p.item), { piso: 120 });
  return (
    <div className="h-full min-h-0 overflow-auto rounded-md border" data-testid="area-que-rola-pagamentos">
      <table className={`w-full table-fixed border-collapse ${REGUA_FIN.tabela}`} style={{ minWidth: emDaRegua(84 + minimoDoItem + 96 + 88 + 92 + 100 + largConta + 108) }} data-testid="tabela-pagamentos">
        <colgroup>{col(84)}<col />{col(96)}{col(88)}{col(92)}{col(100)}{col(largConta)}{col(108)}</colgroup>
        <thead data-testid="cabecalho-pagamentos"><tr>
          <ThOrdenavel col="data" {...th}>Pago em</ThOrdenavel><ThOrdenavel col="item" {...th}>Item</ThOrdenavel>
          <ThOrdenavel col="principal" direita {...th}>Principal</ThOrdenavel><ThOrdenavel col="juros" direita {...th}>Juros</ThOrdenavel>
          <ThOrdenavel col="encargos" direita {...th}>Encargos</ThOrdenavel><ThOrdenavel col="total" direita {...th}>Total</ThOrdenavel>
          <ThOrdenavel col="conta" {...th}>Conta</ThOrdenavel><ThOrdenavel col="lancamento" {...th}>Lançamento</ThOrdenavel>
        </tr></thead>
        <tbody>
          {linhas === null && <tr><td colSpan={8} className={`${TD} text-muted-foreground`}>…</td></tr>}
          {linhas !== null && linhas.length === 0 && <tr><td colSpan={8} className={`${TD} text-muted-foreground`}>Nenhum pagamento identificado.</td></tr>}
          {(linhas ?? []).map((p, i) => (
            <tr key={`${p.item}-${p.data ?? ''}-${i}`} className="border-b" data-testid="linha-pagamento">
              <td className={TD_D}><span className={E.data}>{dataBr(p.data) ?? '—'}</span></td>
              <td className={TD}><span className={REGUA_FIN.inteiro} title={p.item}>{p.item}</span></td>
              <td className={TD_R}>{p.principal ? num2(p.principal) : ''}</td>
              <td className={TD_R}>{p.juros ? num2(p.juros) : ''}</td>
              <td className={TD_R}>{p.encargos ? num2(p.encargos) : ''}</td>
              <td className={`${TD_R} font-medium`}>{num2(p.total)}</td>
              <td className={TD}><span className={REGUA_FIN.inteiro} title={p.conta ?? undefined}>{p.conta ?? '—'}</span></td>
              <td className={TD}>{p.lancamentoId
                ? <button type="button" className="text-primary hover:underline" onClick={() => onAbrirLancamento(p.lancamentoId!)}>↔ abrir</button>
                : <span className="text-muted-foreground" title="parcela paga sem lançamento no Financeiro">sem lançamento</span>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot data-testid="total-pagamentos"><tr>
          <td className={TF} colSpan={2}>Total{t ? ` · ${t.qtde} ${t.qtde === 1 ? 'pagamento' : 'pagamentos'}` : ''}</td>
          <td className={`${TF} text-right tabular-nums`}>{t ? num2(t.principal) : '…'}</td>
          <td className={`${TF} text-right tabular-nums`}>{t ? num2(t.juros) : '…'}</td>
          <td className={`${TF} text-right tabular-nums`}>{t ? num2(t.encargos) : '…'}</td>
          <td className={`${TF} text-right tabular-nums`}>{t ? num2(t.total) : '…'}</td>
          <td className={TF} colSpan={2} />
        </tr></tfoot>
      </table>
    </div>
  );
}

type ColunaDoHistorico = 'data' | 'evento' | 'valor';
const valorDoEvento = (e: EventoNaTela, c: ColunaDoHistorico): ValorDeOrdem => e[c];

/** FIN-CONTRATO-JUNTAR-01: o evento de junção viva tem "Desfazer" (o gesto contrário); o resto do Histórico é só leitura */
export function TabelaDoHistorico({ tela, onDesfazerJuncao }: { tela: TelaDoContrato | null; onDesfazerJuncao?: (juncaoId: string, evento: string) => void }) {
  const [ordem, setOrdem] = useState<Ordem<ColunaDoHistorico>>({ col: 'data', dir: 'asc' });
  const aoOrdenar = (c: ColunaDoHistorico) => setOrdem((o) => proximaOrdem(o, c));
  const linhas = useMemo(() => (tela?.historico ? ordenarPor(tela.historico, ordem, valorDoEvento) : null), [tela?.historico, ordem]);
  const th = { ordem, aoOrdenar, className: TH };
  /* o Evento fica com a sobra; o mínimo é o maior evento (inteiro numa linha) */
  const minimoDoEvento = larguraDoMaior((tela?.historico ?? []).map((e) => e.evento), { piso: 200 });
  return (
    <div className="h-full min-h-0 overflow-auto rounded-md border" data-testid="area-que-rola-historico">
      <table className={`w-full table-fixed border-collapse ${REGUA_FIN.tabela}`} style={{ minWidth: emDaRegua(84 + minimoDoEvento + 120 + 64) }} data-testid="tabela-historico">
        <colgroup>{col(84)}<col />{col(120)}{col(64)}</colgroup>
        <thead><tr>
          <ThOrdenavel col="data" {...th}>Data</ThOrdenavel><ThOrdenavel col="evento" {...th}>Evento</ThOrdenavel>
          <ThOrdenavel col="valor" direita {...th}>Valor</ThOrdenavel><th className={TH} aria-label="ação" />
        </tr></thead>
        <tbody>
          {linhas === null && <tr><td colSpan={4} className={`${TD} text-muted-foreground`}>…</td></tr>}
          {linhas !== null && linhas.length === 0 && <tr><td colSpan={4} className={`${TD} text-muted-foreground`}>Nenhum evento.</td></tr>}
          {(linhas ?? []).map((e, i) => (
            <tr key={`${e.evento}-${e.data ?? ''}-${i}`} className="border-b" data-testid="linha-historico">
              <td className={TD_D}><span className={E.data}>{dataBr(e.data) ?? '—'}</span></td>
              <td className={TD}><span className={REGUA_FIN.inteiro} title={e.evento}>{e.evento}</span></td>
              <td className={TD_R}>{e.valor === null ? '' : num2(e.valor)}</td>
              <td className={TD}>
                {e.juncaoId && e.desfazivel && onDesfazerJuncao && (
                  <button type="button" className="text-primary hover:underline" onClick={() => { if (e.juncaoId) onDesfazerJuncao(e.juncaoId, e.evento); }}
                    title="desfazer a junção: os dois cadastros voltam ao que eram" data-testid="desfazer-juncao">Desfazer</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
