import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Segmentado } from '@/components/ui/segmentado';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatMoeda } from '@/lib/calculos/formatters';
import { CATEGORIAS } from '@/types/cattle';
import { parseNumericValue } from '@/lib/calculos/abate';
import { rotuloCurtoDaConta, rotuloDaConta } from '@/lib/financeiro/rotuloConta';
import {
  barraDaDiferenca, contaComNumero, corDoSaldo, dataCurta, descricaoDoEvento, efeitoNoSaldo, linhasDaPreviaAjuste, rotuloDoSaldo, rotuloExplicacao,
  rotuloSentidoAjuste, sugestaoAjuste, totalDoRascunho, valorAjusteParaRpc, ROTULO_STATUS, TIPOS_EXPLICACAO_DO_LADO,
  type ContaCorrente, type LadoContaCorrente, type LinhaContaCorrente, type LinhaPreviaAjuste, type SentidoAjuste, type TipoExplicacao,
} from '@/lib/oc/contaCorrente';
import type {
  ContaParaExplicacao, ExplicacaoRascunho, LoteParaAjuste, OcContaCorrenteApi, RecebimentoVinculavel,
} from '@/hooks/useOcContaCorrente';

/* OC-VENDA-ENTREGAS-01c — a aba Financeiro da venda no modelo CONTA CORRENTE, em formato de EXTRATO LIDO PELO CAIXA DA FAZENDA
   (mock docs/mocks/oc_conta_corrente_mock_v7.html, ADR-2026-21): recebimento soma (verde), entrega abate (vermelho), explicacao
   soma quando reduz o que falta receber; o Saldo corre linha a linha — negativo falta receber, positivo adiantado, zero quitado.
   O saldo e' do banco (`oc_conta_corrente`); esta tela nao soma nada.
   ⚠ PADRAO DE TABELA (regra permanente, 28/09/2026): 10px nas linhas, 9,5px no cabecalho, linha de 18px, datas dd/mm/aa; cabecalho
     navy nos dois niveis; cards, titulo, cabecalho, Total e barra congelados — so' as linhas rolam; uma informacao por coluna;
     divisor vertical entre grupos; fundo por tipo de linha; cor pelo sinal; cabecalho centralizado, numero a direita; uma linha por registro (texto livre corta com `title`, numero e data nunca).
   ⚠ D6: status e' o que o dado diz ("sem conta" em ambar), nunca um "conciliado" inventado.
   ⚠ RECUSA AO LADO DO BOTAO, nunca em toast (UX-TOAST-01); motivo obrigatorio em vermelho inline (UX-OBRIGATORIOS-01). */

const TH = 'sticky h-[17px] whitespace-nowrap bg-[#2E4B6E] px-[4px] text-center text-[9.5px] font-semibold text-white';
const THG = 'sticky top-0 z-20 h-[17px] whitespace-nowrap bg-primary px-[4px] text-center text-[9.5px] font-semibold text-white';
const TD = 'h-[18px] whitespace-nowrap border-b border-[#eceae4] px-[4px] text-[10px]';
const NUM = `${TD} text-right tabular-nums`;
/* A celula de TEXTO LIVRE (conta, banco): UMA LINHA SO', cortada na borda com "…" e o texto inteiro no `title` — a regra do
   UI-LINHA-UNICA-01 (Gabriel, 04/10/2026: uma linha por registro, sempre; texto longo corta, numero/valor/data nunca). Era a
   celula que QUEBRAVA em duas linhas (27px), pela regra antiga da reticencia. */
const TDQ = `${TD} overflow-hidden text-ellipsis`;
/* ⚠ FORA DO UI-LINHA-UNICA-01: a lista de DATAS das entregas na PREVIA do ajuste de preco (o dialogo "Explicar") ainda quebra —
   data nunca se corta, e a coluna dela nao foi medida para o pior caso. Divida registrada. */
const TD_DATAS_DA_PREVIA = 'h-[18px] border-b border-[#eceae4] px-[4px] py-[1px] text-[10px] leading-[12px] break-words';
/* A celula do "⋯": SEM padding horizontal (com o `px-[4px]` do TD a area util de 22 viraria 14 e o botao de 18 vazaria). */
const TD_MENU = 'h-[18px] border-b border-[#eceae4] p-0 text-center leading-none';
const DV = 'border-l-2 border-l-[#9aa7b6]';
const TF = 'sticky bottom-0 z-10 h-[19px] whitespace-nowrap border-t-2 border-t-[#9aa7b6] bg-[#E8E6DF] px-[4px] text-[10px] tabular-nums';
const COR = { neg: 'text-[#b91c1c]', pos: 'text-[#15803d]', zero: '' };
const FUNDO: Record<LinhaContaCorrente['tipo'], string> = {
  entrega: 'bg-white', recebimento: 'bg-[#EAF1F9]', explicacao: 'bg-[#fffbeb]',
};
const BOTAO = 'h-[22px] px-[9px] text-[10px] font-medium';

/**
 * A REGUA DO EXTRATO — OC-VENDA-FINANCEIRO-COMPLETO-01a-fix1, sem coluna elastica. Soma 764: a LARGURA INTERNA MEDIDA da area que
 * rola no modal real (1024 com o resumo de 240 da' 766, menos 1px de borda de cada lado). ⚠ A primeira versao somava 784 — o
 * comentario dizia "soma 766" e ninguem somou — e a tabela rolava 20px na horizontal, cortando o Saldo (visto na prova de tela da
 * Vera 7d1f8590: scrollWidth 784 x clientWidth 764). O teste agora soma os `col` renderizados.
 * Data 53 · Lote 26 · Cab 26 · Evento 80 · Descricao 94 · Conta 136 · Banco 84 · Entrega/Recebido/Saldo 81 · "⋯" 22.
 * ⚠ OC-CC-ACOES-LINHA-02 — a 11a coluna (o "⋯" de cada linha, 22px) saiu das duas colunas de TEXTO, pela medicao (Inter 10px):
 *   a Descricao e' texto GERADO e nao corta — o pior, "Devol. fornecedor", pede 84,6 + 8 de padding = 92,6, e ela foi de 100 a 94;
 *   a Conta foi de 152 a 136 (128 uteis) e CORTA com o nome inteiro no `title` (UI-LINHA-UNICA-01): "Venda de Fêmeas Adultas"
 *   (122,5) cabe, "Venda de Desmama Machos" (134,5) e "Compra de Desmama Machos" (142,2) cortam. Data, numero e valor nao
 *   cederam nada. A soma segue 764.
 * Medido com os textos reais (Inter): a Descricao quebra em 2 linhas quando nao cabe ("Venda Fêmeas Adultas", 108,2 para 92); a
 * Conta usa o nome curto (`rotuloCurtoDaConta`, nome inteiro no `title`); o Banco cabe "Itaú Personalite" (73,1 para 76) e so'
 * quebra em "sem conta bancária"; o maior valor real, 4.730.486,74 com sinal e em negrito, pede 72,8 para 73.
 */
export const REGUA_EXTRATO: readonly number[] = [53, 26, 26, 80, 94, 136, 84, 81, 81, 81, 22];

const rotuloCategoria = (slug: string | null) => (slug ? (CATEGORIAS.find(c => c.value === slug)?.label ?? slug) : '—');
/* Valor de tabela como no mock v7: sem "R$" (a coluna ja diz que e' dinheiro) e com o sinal de menos tipografico. */
const num2 = (v: number) => {
  const t = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Math.round(v * 100) < 0 ? `\u2212${t}` : t;
};
const moeda = (v: number | null) => (v === null ? '' : num2(v));

/* OC-CONTA-CORRENTE-TODOS-01a — os textos de cada lado (mock oc_conta_corrente_compra_abate_mock_v1). A venda fala do comprador e
   da entrega; a compra, do fornecedor e da entrada do gado. O extrato da compra e' o ESPELHO do da venda: entrada positiva, pagamento
   negativo, saldo positivo = falta pagar. O sinal vem do banco (`oc_conta_corrente` ja' o vira); aqui so' os rotulos e os totais. */
const TEXTOS: Record<LadoContaCorrente, {
  cardEntrega: string; cardDinheiro: string; titulo: string; buscar: string; grupoSaldo: string;
  colEntrega: string; colDinheiro: string; vazio: string; seloEntrega: string; seloDinheiro: string; verbo: string;
  pendente1: string; pendenteN: (n: number) => string; atualizar: string;
  /* OC-CC-ACOES-LINHA-02 — os textos do menu "⋯" de cada linha, espelhados por lado. */
  nomeDinheiro: string; jaDinheiro: string; irEntrega: string; entregaEDaOperacao: string;
}> = {
  venda: {
    cardEntrega: 'Entregue · DRE R$', cardDinheiro: 'Recebido', titulo: 'Conta corrente do comprador',
    buscar: '+ Buscar recebimento no Financeiro', grupoSaldo: 'Comprador',
    colEntrega: 'Entrega (DRE)', colDinheiro: 'Recebido (caixa)', vazio: 'Nenhuma entrega nem recebimento ainda.',
    seloEntrega: 'Entrega', seloDinheiro: 'Recebimento', verbo: 'Venda',
    pendente1: '1 saída ainda não virou entrega no financeiro.', pendenteN: n => `${n} saídas ainda não viraram entrega no financeiro.`,
    atualizar: 'Atualizar entregas',
    nomeDinheiro: 'recebimento', jaDinheiro: 'já recebido', irEntrega: 'Ir para a entrega',
    entregaEDaOperacao: 'a entrega é da operação · corrija na aba Entrega',
  },
  compra: {
    cardEntrega: 'Entrada · DRE R$', cardDinheiro: 'Pago', titulo: 'Conta corrente do fornecedor',
    buscar: '+ Buscar pagamento no Financeiro', grupoSaldo: 'Fornecedor',
    colEntrega: 'Entrada (DRE)', colDinheiro: 'Pago (caixa)', vazio: 'Nenhuma entrada nem pagamento ainda.',
    seloEntrega: 'Entrada', seloDinheiro: 'Pagamento', verbo: 'Compra',
    pendente1: '1 entrada de gado ainda não virou lançamento no financeiro.',
    pendenteN: n => `${n} entradas de gado ainda não viraram lançamento no financeiro.`,
    atualizar: 'Atualizar entradas',
    nomeDinheiro: 'pagamento', jaDinheiro: 'já pago', irEntrega: 'Ir para a entrada',
    entregaEDaOperacao: 'a entrada é da operação · corrija na aba Recebimento',
  },
};

/* ═══ O MENU "⋯" DE CADA LINHA DO EXTRATO — OC-CC-ACOES-LINHA-02 ═══════════════════════════════════════════════════════════════
   Toda linha e' clicavel e tem "⋯" (regra do Gabriel, 30/09: toda linha/titulo tem sempre acoes). ⚠ ITEM QUE NAO VALE NUNCA SOME:
   fica desabilitado com o MOTIVO escrito no proprio item (e no `title`). O clique na linha e' o PRIMEIRO item do menu dela.
   ⚠ NADA DE BANCO NOVO: o que ainda depende de RPC (parcelar, desvincular e cancelar o programado da conta corrente; abrir a
   entrega em so' leitura) entra apagado com "disponível em breve" e acende no PR seguinte. */
export type ChaveAcaoDaLinha =
  | 'abrir' | 'parcelar' | 'desvincular' | 'cancelar_programado' | 'ir_entrega' | 'abrir_leitura' | 'abrir_explicacoes' | 'desfazer_explicacao';

export interface AcaoDaLinha {
  chave: ChaveAcaoDaLinha;
  texto: string;
  /** `null` = vale; texto = desabilitado, e o texto e' o porque. */
  motivo: string | null;
  perigo?: boolean;
}

export const MOTIVO_ACAO = {
  semLancamento: 'esta linha não tem lançamento',
  emBreve: 'disponível em breve',
  conciliado: 'conciliado · desfaça a conciliação primeiro',
  explicacaoSemLancamento: 'esta explicação não gera lançamento',
} as const;

/** O motivo do item de GRAVAR numa operacao em somente leitura, pelo lado. ⚠ O somente leitura do Financeiro da OC
 *  (`financeiroNovoReadOnly`) NAO e' a OC fechada — ela segue gravando aqui: na venda ele so' liga com a OC CANCELADA; na compra,
 *  em rascunho ou cancelada. A frase diz isso (a primeira versao dizia "operação fechada · reabra para alterar", e mandava reabrir
 *  o que nao se reabre). Um dono: o extrato e o menu das despesas leem daqui. */
export const motivoSomenteLeitura = (lado: LadoContaCorrente): string =>
  (lado === 'compra' ? 'operação em rascunho ou cancelada · somente leitura' : 'operação cancelada · somente leitura');

/** Os itens do menu da linha, na ordem em que aparecem. Funcao pura: o teste a percorre por tipo e por status. */
export function acoesDaLinha(l: LinhaContaCorrente, lado: LadoContaCorrente, somenteLeitura: boolean): AcaoDaLinha[] {
  const t = TEXTOS[lado];
  const semLanc = l.lancamentoId ? null : MOTIVO_ACAO.semLancamento;
  /* o item de GRAVAR numa operacao em somente leitura diz primeiro isso; depois, o motivo do proprio item */
  const gravar = (motivo: string | null) => (somenteLeitura ? motivoSomenteLeitura(lado) : motivo);
  if (l.tipo === 'entrega') {
    return [
      { chave: 'ir_entrega', texto: t.irEntrega, motivo: null },
      { chave: 'abrir_leitura', texto: 'Abrir lançamento (só leitura)', motivo: semLanc ?? MOTIVO_ACAO.emBreve },
      { chave: 'desvincular', texto: 'Desvincular da operação', motivo: t.entregaEDaOperacao },
    ];
  }
  if (l.tipo === 'explicacao') {
    return [
      { chave: 'abrir_explicacoes', texto: 'Abrir explicações', motivo: null },
      { chave: 'abrir', texto: 'Abrir lançamento', motivo: l.lancamentoId ? null : MOTIVO_ACAO.explicacaoSemLancamento },
      { chave: 'desfazer_explicacao', texto: 'Desfazer explicação', perigo: true,
        motivo: gravar(l.status === 'conciliado' ? MOTIVO_ACAO.conciliado : null) },
    ];
  }
  const programado = l.status === 'programado';
  return [
    { chave: 'abrir', texto: 'Abrir lançamento', motivo: semLanc },
    { chave: 'parcelar', texto: `Parcelar este ${t.nomeDinheiro}`,
      motivo: gravar(programado ? MOTIVO_ACAO.emBreve : `${t.jaDinheiro} · só se parcela o que está programado`) },
    { chave: 'desvincular', texto: 'Desvincular da operação',
      motivo: gravar(l.status === 'conciliado' ? MOTIVO_ACAO.conciliado : MOTIVO_ACAO.emBreve) },
    { chave: 'cancelar_programado', texto: `Cancelar ${t.nomeDinheiro} programado`, perigo: true,
      motivo: gravar(programado ? MOTIVO_ACAO.emBreve : `só para ${t.nomeDinheiro} programado`) },
  ];
}

/** O item de menu da OC (extrato e despesas): desabilitado continua VISIVEL, com o motivo na segunda linha (ambar) e no `title`.
 *  ⚠ O menu e' a excecao da linha unica (nao e' tabela): o item com motivo tem duas linhas. O apagado e' so' o rotulo — o motivo
 *  fica na cor cheia, senao a explicacao sumiria junto com o item. */
export function ItemDeMenuOC({ testid, texto, motivo = null, desabilitado, perigo, title, nota, onEscolher }: {
  testid?: string; texto: string; motivo?: string | null; desabilitado?: boolean; perigo?: boolean; title?: string;
  /** O que o gesto VAI fazer (item que vale): segunda linha neutra, nunca ambar — ambar e' o motivo de estar apagado. */
  nota?: string;
  onEscolher?: () => void;
}) {
  const apagado = desabilitado ?? !!motivo;
  return (
    <DropdownMenuItem disabled={apagado} data-testid={testid} title={motivo ?? title}
      className="flex-col items-start gap-0 data-[disabled]:pointer-events-auto data-[disabled]:cursor-not-allowed data-[disabled]:opacity-100"
      onSelect={() => { if (!apagado) onEscolher?.(); }}>
      <span className={`${perigo ? 'text-red-200' : ''} ${apagado ? 'opacity-50' : ''}`}>{texto}</span>
      {motivo && <span className="text-amber-300" data-testid="motivo-do-item">{motivo}</span>}
      {!motivo && nota && <span className="text-zinc-200" data-testid="nota-do-item">{nota}</span>}
    </DropdownMenuItem>
  );
}

/** A sub-aba do Financeiro em conta corrente (OC-VENDA-FINANCEIRO-COMPLETO-01a-fix2). */
export type SubAbaContaCorrente = 'conta' | 'despesas';

/** O que o slot das despesas recebe: onde por os botoes (a faixa de sub-abas) e a altura do bloco fixo (o cabecalho gruda abaixo). */
export interface ContextoDespesas { host: HTMLElement | null; topo: number }

interface Props {
  api: OcContaCorrenteApi;
  somenteLeitura: boolean;
  /** De que lado a conta corrente fala. Padrao: venda (a tela de antes, sem nenhuma mudanca). */
  lado?: LadoContaCorrente;
  /* OC-VENDA-FINANCEIRO-COMPLETO-01a — as despesas da operacao voltam a ser a LISTA VIVA de sempre (`AbaCompromissosOC` no modo
     so' despesas), montada por quem tem o `ocApi` (o roteador da aba). Esta tela so' reserva o lugar — desde o fix2, a sua
     sub-aba; a funcao recebe o host dos botoes e o topo fixo. */
  despesas?: ReactNode | ((ctx: ContextoDespesas) => ReactNode);
  /** Os dois cards da direita, somados dos compromissos de obrigacao vivos. `null` = ainda nao lidos ("—", nunca zero). */
  totaisDespesas?: { lancadas: number; pagas: number } | null;
  /** Quantas linhas a tabela das despesas tem — o contador da sub-aba. `null` = ainda nao lidas (sem contador). */
  qtdDespesas?: number | null;
  /** A sub-aba aberta, quando quem monta a guarda (na URL, para sobreviver a' ida ao lancamento). Sem ela, estado local. */
  subAba?: SubAbaContaCorrente;
  onSubAba?: (s: SubAbaContaCorrente) => void;
  /** OC-CC-ACOES-LINHA-02 — abre o lancamento da linha no modal do Financeiro (o MESMO caminho das despesas:
   *  `paramsAbrirLancamentoDaOC`); quem monta tem a URL. */
  onAbrirLancamento?: (lancamentoId: string) => void;
  /** Leva a' aba da entrega (venda) / do recebimento do gado (compra) — do shell, como o `onIrParaDocumentos`. */
  onIrParaEntrega?: () => void;
}

/* O bloco fixo tem 34 (cards) + 5 + 26 (sub-abas) + 5 de folga; medido depois de montar (o aviso de saidas o aumenta). */
const TOPO_PADRAO = 70;

export function AbaContaCorrenteOC({ api, somenteLeitura, lado = 'venda', despesas, totaisDespesas = null, qtdDespesas = null,
  subAba, onSubAba, onAbrirLancamento, onIrParaEntrega }: Props) {
  const cc = api.contaCorrente;
  const t = TEXTOS[lado];
  /* sinal da coluna da entrega no total: a venda mostra o gado que saiu negativo; a compra, o que entrou positivo */
  const sinalEntrega = lado === 'compra' ? 1 : -1;
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<'buscar' | 'explicar' | null>(null);
  /* a explicacao cujo "Desfazer" abriu o dialogo: ele nasce no passo de remocao DAQUELA linha (nada sai sem o motivo e o confirmar) */
  const [removerAlvo, setRemoverAlvo] = useState<string | null>(null);
  const [subLocal, setSubLocal] = useState<SubAbaContaCorrente>('conta');
  const sub = subAba ?? subLocal;
  const escolherSub = (s: SubAbaContaCorrente) => { setSubLocal(s); onSubAba?.(s); };
  /* ⚠ CALLBACK REF, nao `useRef`: o host dos botoes das despesas e o bloco fixo so' existem depois do primeiro render, e quem os
     usa (o portal, a medida) precisa re-renderizar quando chegam (mesma licao da barra do PastosTab). */
  const [topoEl, setTopoEl] = useState<HTMLDivElement | null>(null);
  const [hostDespesas, setHostDespesas] = useState<HTMLSpanElement | null>(null);
  const [topo, setTopo] = useState(TOPO_PADRAO);
  useEffect(() => {
    if (!topoEl) return;
    const medir = () => setTopo(topoEl.offsetHeight);
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(topoEl);
    return () => ro.disconnect();
  }, [topoEl]);

  if (!cc) {
    return (
      <div className="py-10 text-center text-[11px] text-muted-foreground">
        {api.erro ? <span className="text-destructive" role="alert">{api.erro}</span> : 'Carregando…'}
      </div>
    );
  }

  const barra = barraDaDiferenca(cc, lado);
  const corSaldo = corDoSaldo(cc.saldo);
  const atualizarEntregas = async () => {
    setErroAcao(null);
    const erro = await api.sincronizarEntregas();
    if (erro) setErroAcao(erro);
  };
  const temDespesas = despesas !== undefined;
  /* O gesto de cada item do menu da linha. So' chega aqui item que VALE (o apagado nao dispara). */
  const executarAcao = (l: LinhaContaCorrente, chave: ChaveAcaoDaLinha) => {
    setErroAcao(null);
    if (chave === 'abrir') { if (l.lancamentoId) onAbrirLancamento?.(l.lancamentoId); return; }
    if (chave === 'ir_entrega') { onIrParaEntrega?.(); return; }
    if (chave === 'abrir_explicacoes') { setRemoverAlvo(null); setDialogo('explicar'); return; }
    if (chave === 'desfazer_explicacao') {
      setRemoverAlvo(cc.explicacoes.some(e => e.parteId === l.parteId) ? l.parteId : null);
      setDialogo('explicar');
    }
  };
  const abrirExplicar = () => { setErroAcao(null); setRemoverAlvo(null); setDialogo('explicar'); };
  const conteudoDespesas = typeof despesas === 'function' ? despesas({ host: hostDespesas, topo }) : despesas;

  return (
    /* ⚠ OC-VENDA-FINANCEIRO-COMPLETO-01a-fix2 — UM SCROLLPORT SO', O DO MODAL. Com 8 despesas (SR 125448f9) o extrato encolhia a
       2 linhas com rolagem propria: duas tabelas disputavam a mesma altura. Agora cada sub-aba mostra UMA tabela com a altura toda,
       nenhuma rola por dentro; os cards e a faixa de sub-abas ficam FIXOS no alto, e o cabecalho de cada tabela gruda logo abaixo
       deles (`topo`, medido), o total no pe'. */
    <div className="flex flex-col gap-[5px]" data-testid="conta-corrente-oc">
      <div ref={setTopoEl} className="sticky top-0 z-30 -mt-2 bg-background pt-2" data-testid="topo-fixo">
        <div className="flex flex-col gap-[5px] bg-muted/30 pb-[5px]">
          {/* OC-VENDA-FINANCEIRO-COMPLETO-01a (mock v4) — cinco cards de mesma altura, rotulo em cima e valor embaixo. ⚠ O SALDO TEM
              170px, os outros dividem o resto: medido (Inter 9,5px), "Saldo · adiantado pelo comprador" pede 151,7px e
              "Saldo · adiantado ao fornecedor" 144, e com cinco iguais o card teria 132 uteis. Os outros rotulos pedem ate' 90,5 e o
              maior valor real (4.730.486,74 a 12px) 87,3, para 127 uteis. */}
          <div className="grid flex-none gap-[6px]" style={{ gridTemplateColumns: '1fr 1fr 170px 1fr 1fr' }} data-testid="cards-conta-corrente">
            <CardEmPe rotulo={t.cardEntrega} valor={cc.entregue} cor={COR.pos} testid="card-entrega" />
            <CardEmPe rotulo={t.cardDinheiro} valor={-sinalEntrega * cc.recebido} cor={lado === 'compra' ? COR.neg : COR.pos} testid="card-dinheiro" />
            <CardEmPe rotulo={rotuloDoSaldo(cc.saldo, lado)} valor={cc.saldo} cor={COR[corSaldo]} destaque={corSaldo !== 'zero'} testid="card-saldo" />
            <CardEmPe rotulo="Despesas lançadas" valor={totaisDespesas?.lancadas ?? null} cor={COR.neg} divisor testid="card-despesas-lancadas" />
            <CardEmPe rotulo="Despesas pagas" valor={totaisDespesas?.pagas ?? null} cor={COR.neg} testid="card-despesas-pagas" />
          </div>

          {cc.saidasSemEntrega > 0 && (
            <div className="flex flex-none items-center gap-2 rounded border border-amber-300 bg-amber-50 px-2 text-[10.5px] text-amber-800">
              <span>{cc.saidasSemEntrega === 1 ? t.pendente1 : t.pendenteN(cc.saidasSemEntrega)}</span>
              <Button type="button" size="sm" className={`${BOTAO} ml-auto`} disabled={somenteLeitura || api.ocupado} onClick={atualizarEntregas}>
                {t.atualizar}
              </Button>
            </div>
          )}

          {/* A FAIXA DE SUB-ABAS — o `Segmentado` da casa (a selecao se marca em navy, regra permanente; o sublinhado do mock v5 nao
              entra, como a pilula do mock da Conciliacao nao entrou). Os botoes da direita trocam com a sub-aba. */}
          <div className="flex h-[26px] flex-none items-center gap-1.5" data-testid="faixa-subabas">
            {temDespesas ? (
              <Segmentado<SubAbaContaCorrente> valor={sub} onEscolher={escolherSub} opcoes={[
                { valor: 'conta', rotulo: t.titulo },
                { valor: 'despesas', rotulo: (
                  <span className="inline-flex items-center gap-[5px]">
                    Despesas da operação
                    {qtdDespesas !== null && (
                      <span className="rounded-[7px] bg-[#e8eef6] px-[5px] text-[9.5px] font-semibold leading-[13px] text-primary"
                        data-testid="contador-despesas">{qtdDespesas}</span>
                    )}
                  </span>
                ) },
              ]} />
            ) : (
              <span className="text-[10.5px] font-semibold">{t.titulo}</span>
            )}
            {sub === 'conta' || !temDespesas ? (
              <span className="ml-auto flex gap-[5px]" data-testid="botoes-conta">
                <Button type="button" variant="outline" size="sm" className={BOTAO} disabled={somenteLeitura || api.ocupado}
                  onClick={() => { setErroAcao(null); setDialogo('buscar'); }}>
                  {t.buscar}
                </Button>
              </span>
            ) : (
              <span ref={setHostDespesas} className="ml-auto flex gap-[5px]" data-testid="botoes-despesas" />
            )}
          </div>
        </div>
      </div>

      {(sub === 'conta' || !temDespesas) && (
        <>
          <div className="rounded border" data-testid="conta-corrente-rolagem">
            <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums" data-testid="conta-corrente-tabela">
              <colgroup>
                {/* Larguras MEDIDAS no modal (1024px por decisao do MODAIS-PADRAO-01b): pior texto de cada coluna + 8 de padding, com
                    o total em negrito. ⚠ Por isso a Conta vai SEM o numero do plano: com ele, "1120 Venda de Desmama Machos" pedia 171px
                    e a linha nao cabia sem quebrar ou cortar numero. A regua mora em `REGUA_EXTRATO` (acima), soma 764. */}
                {REGUA_EXTRATO.map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className={THG} style={{ top: topo }} colSpan={7}>Evento</th>
                  <th className={`${THG} ${DV}`} style={{ top: topo }} colSpan={2}>Movimento</th>
                  <th className={`${THG} ${DV}`} style={{ top: topo }} colSpan={2}>{t.grupoSaldo}</th>
                </tr>
                <tr>
                  {['Data', 'Lote', 'Cab', 'Evento', 'Descrição', 'Conta', 'Banco'].map(h => (
                    <th key={h} className={`${TH} z-20`} style={{ top: topo + 17 }}>{h}</th>
                  ))}
                  <th className={`${TH} z-20 ${DV}`} style={{ top: topo + 17 }}>{t.colEntrega}</th>
                  <th className={`${TH} z-20`} style={{ top: topo + 17 }}>{t.colDinheiro}</th>
                  <th className={`${TH} z-20 ${DV}`} style={{ top: topo + 17 }}>Saldo</th>
                  <th className={`${TH} z-20`} style={{ top: topo + 17 }} aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {cc.linhas.map(l => (
                  <LinhaExtrato key={l.parteId} l={l} linhas={cc.linhas} lado={lado}
                    acoes={acoesDaLinha(l, lado, somenteLeitura)} onAcao={chave => executarAcao(l, chave)} />
                ))}
                {cc.linhas.length === 0 && (
                  <tr><td colSpan={11} className={`${TD} py-4 text-center text-muted-foreground`}>{t.vazio}</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className={TF}>Total</td>
                  <td className={TF} />
                  <td className={`${TF} text-right`}>{cc.cabEntregue}</td>
                  <td className={TF} colSpan={4} />
                  <td className={`${TF} text-right ${lado === 'compra' ? COR.pos : COR.neg} ${DV}`}>{num2(sinalEntrega * cc.entregue)}</td>
                  <td className={`${TF} text-right ${lado === 'compra' ? COR.neg : COR.pos}`}>{num2(-sinalEntrega * cc.recebido)}</td>
                  <td className={`${TF} text-right ${COR[corSaldo]} ${DV}`} data-testid="total-saldo">{num2(cc.saldo)}</td>
                  <td className={TF} />
                </tr>
              </tfoot>
            </table>
          </div>

          {barra && (
            <div className="flex h-6 flex-none items-center gap-2 rounded border border-[#fde68a] bg-[#fffbeb] px-2 text-[10.5px]" data-testid="barra-diferenca">
              <b>{barra.frase}</b>
              <span className="text-muted-foreground">A OC fecha mesmo assim; o saldo fica pendente até ser explicado.</span>
              <Button type="button" size="sm" className={`${BOTAO} ml-auto`} disabled={somenteLeitura || api.ocupado}
                onClick={abrirExplicar}>
                Explicar diferença
              </Button>
            </div>
          )}
          {/* A compra mostra o "Quitado." do mock mesmo sem explicacao (o botao de explicar fica a' mao); a venda segue como era. */}
          {!barra && lado === 'compra' && cc.explicacoes.length === 0 && cc.linhas.some(l => l.tipo === 'entrega') && (
            <div className="flex h-6 flex-none items-center gap-2 rounded border border-[#bbf7d0] bg-[#f0fdf4] px-2 text-[10.5px]" data-testid="barra-quitado">
              <b>Quitado.</b>
              <span className="text-muted-foreground">Com saldo positivo aparece "Falta pagar"; negativo, "Adiantado ao fornecedor".</span>
              <Button type="button" variant="outline" size="sm" className={`${BOTAO} ml-auto`} disabled={somenteLeitura || api.ocupado}
                onClick={abrirExplicar}>
                Explicar diferença
              </Button>
            </div>
          )}
          {!barra && cc.explicacoes.length > 0 && (
            <div className="flex h-6 flex-none items-center gap-2 rounded border border-[#bbf7d0] bg-[#f0fdf4] px-2 text-[10.5px]">
              <b>Diferença explicada.</b>
              <Button type="button" variant="outline" size="sm" className={`${BOTAO} ml-auto`} disabled={somenteLeitura || api.ocupado}
                onClick={abrirExplicar}>
                Ver explicação
              </Button>
            </div>
          )}
        </>
      )}

      {/* OC-VENDA-FINANCEIRO-COMPLETO-01a — as despesas da operacao (compra e venda), vivas: a lista de compromissos de obrigacao,
          montada fora. Desde o fix2, na sua sub-aba, com a altura toda. */}
      {sub === 'despesas' && temDespesas && conteudoDespesas}

      {erroAcao && <div className="flex-none text-[10px] text-destructive" role="alert">{erroAcao}</div>}

      {dialogo === 'buscar' && <DialogoBuscarRecebimento api={api} lado={lado} onFechar={() => setDialogo(null)} />}
      {dialogo === 'explicar' && (
        <DialogoExplicarDiferenca api={api} somenteLeitura={somenteLeitura} lado={lado} removerAoAbrir={removerAlvo}
          onFechar={() => { setDialogo(null); setRemoverAlvo(null); }} />
      )}
    </div>
  );
}

/* O card do topo da aba (mock v4): rotulo 9,5 em cima, valor 12 negrito embaixo a' direita, 34px. Sem "R$" no valor, como
   nas celulas da tabela. `null` = dado ainda nao lido: "—", nunca zero. */
function CardEmPe({ rotulo, valor, cor, destaque, divisor, testid }: {
  rotulo: string; valor: number | null; cor: string; destaque?: boolean; divisor?: boolean; testid?: string;
}) {
  return (
    <div className={`flex h-[34px] flex-col justify-center rounded border px-[7px] ${destaque ? 'border-[#fde68a] bg-[#fffbeb]' : ''} ${divisor ? DV : ''}`}
      data-testid={testid}>
      <span className="whitespace-nowrap text-[9.5px] leading-none text-muted-foreground">{rotulo}</span>
      <span className={`mt-[3px] whitespace-nowrap text-right text-[12px] font-bold leading-none tabular-nums ${valor === null ? 'text-muted-foreground' : cor}`}>
        {valor === null ? '—' : num2(valor)}
      </span>
    </div>
  );
}

function Card({ rotulo, valor, cor, destaque, testid }: { rotulo: string; valor: number; cor: string; destaque?: boolean; testid?: string }) {
  return (
    <div className={`flex h-6 items-center justify-between rounded border px-[7px] ${destaque ? 'border-[#fde68a] bg-[#fffbeb]' : ''}`} data-testid={testid}>
      <span className="text-[9.5px] text-muted-foreground">{rotulo}</span>
      <span className={`text-[11.5px] font-bold tabular-nums ${cor}`}>{formatMoeda(valor)}</span>
    </div>
  );
}

function Selo({ tipo, lado }: { tipo: LinhaContaCorrente['tipo']; lado: LadoContaCorrente }) {
  const estilo = tipo === 'entrega' ? 'bg-[#f0fdf4] text-[#15803d]' : tipo === 'recebimento' ? 'bg-[#dbe7f6] text-[#1d4ed8]' : 'bg-[#fde68a] text-[#b45309]';
  const texto = tipo === 'entrega' ? TEXTOS[lado].seloEntrega : tipo === 'recebimento' ? TEXTOS[lado].seloDinheiro : 'Explicação';
  return <span className={`rounded-[3px] px-[5px] text-[9.5px] font-semibold ${estilo}`}>{texto}</span>;
}

function LinhaExtrato({ l, linhas, lado, acoes, onAcao }: {
  l: LinhaContaCorrente; linhas: readonly LinhaContaCorrente[]; lado: LadoContaCorrente;
  acoes: readonly AcaoDaLinha[]; onAcao: (chave: ChaveAcaoDaLinha) => void;
}) {
  /* OC-VENDA-FINANCEIRO-COMPLETO-01a-fix2 — a Descricao sai da lib (`descricaoDoEvento`) e e' texto GERADO: curta e numa linha. */
  const descricao = descricaoDoEvento(l, linhas, lado, rotuloCategoria);
  const banco = l.tipo === 'recebimento' || l.subtipo === 'devolucao_comprador'
    ? (l.banco ?? (l.status === 'programado' ? ROTULO_STATUS.programado : ROTULO_STATUS.sem_conta_bancaria))
    : '';
  const bancoAmbar = !l.banco && (l.tipo === 'recebimento' || l.subtipo === 'devolucao_comprador');
  const cSaldo = corDoSaldo(l.saldo);
  /* OC-CC-ACOES-LINHA-02 — o clique na linha e' o PRIMEIRO item do menu dela; se ele nao vale, a linha nao e' clicavel (o "⋯"
     continua la', dizendo por que). ⚠ O evento do menu SOBE pela arvore do React mesmo estando num portal: a celula do "⋯" o segura
     (`stopPropagation`), e o Enter so' vale com o foco na PROPRIA linha — senao abrir o menu pelo teclado abriria o lancamento. */
  const primeira = acoes[0];
  const clicavel = !!primeira && primeira.motivo === null;
  return (
    <tr className={`${FUNDO[l.tipo]} outline-none ${clicavel ? 'cursor-pointer hover:bg-primary/10 focus-visible:bg-primary/10' : ''}`}
      data-tipo={l.tipo} data-status={l.status} data-clicavel={clicavel ? 'sim' : 'nao'}
      title={clicavel ? primeira.texto : undefined} tabIndex={clicavel ? 0 : undefined}
      onClick={clicavel ? () => onAcao(primeira.chave) : undefined}
      onKeyDown={clicavel ? e => { if (e.key === 'Enter' && e.target === e.currentTarget) onAcao(primeira.chave); } : undefined}>
      <td className={`${TD} text-center`}>{dataCurta(l.data)}</td>
      <td className={`${TD} text-center`}>{l.loteOrdem ?? ''}</td>
      <td className={`${NUM}`}>{l.cab ?? ''}</td>
      <td className={`${TD} text-center`}><Selo tipo={l.tipo} lado={lado} /></td>
      <td className={TD}>{descricao}</td>
      <td className={TDQ} title={contaComNumero(l.contaOrdem, l.conta)} data-celula="conta">{rotuloCurtoDaConta(l.conta) ?? '—'}</td>
      {/* o nome do banco e' dado (corta, com o nome inteiro no `title`); "s/ conta" e "programado" sao gerados e curtos */}
      <td className={`${l.banco ? TDQ : TD} text-center ${bancoAmbar ? 'text-[#b45309]' : ''}`} title={l.banco ?? undefined} data-celula="banco">{banco}</td>
      <td className={`${NUM} ${DV} ${COR[corDoSaldo(l.movEntrega)]}`}>{moeda(l.movEntrega)}</td>
      <td className={`${NUM} ${l.noSaldo ? COR[corDoSaldo(l.movRecebido)] : 'text-muted-foreground'}`}>{moeda(l.movRecebido)}</td>
      <td className={`${NUM} ${DV} font-bold ${COR[cSaldo]}`}>{num2(l.saldo)}</td>
      <td className={TD_MENU} data-celula="menu" onClick={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="mx-auto block h-[16px] w-[18px] text-[11px] font-bold leading-none tracking-[1px] text-primary"
              aria-label={`Ações de ${descricao || TEXTOS[lado].seloDinheiro}`} title="Ações desta linha">⋯</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-[11px]" data-testid="menu-linha-extrato">
            {acoes.map(a => (
              <ItemDeMenuOC key={a.chave} testid={`acao-${a.chave}`} texto={a.texto} motivo={a.motivo} perigo={a.perigo}
                onEscolher={() => onAcao(a.chave)} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

/* ─── Buscar recebimento no Financeiro (vincular recebimento ja lancado) ─── */
function DialogoBuscarRecebimento({ api, lado, onFechar }: { api: OcContaCorrenteApi; lado: LadoContaCorrente; onFechar: () => void }) {
  const compra = lado === 'compra';
  const [itens, setItens] = useState<RecebimentoVinculavel[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [tentou, setTentou] = useState(false);
  const { listarVinculaveis } = api;

  useEffect(() => {
    let vivo = true;
    void listarVinculaveis().then(r => { if (vivo) { setItens(r.itens); setErro(r.erro); } });
    return () => { vivo = false; };
  }, [listarVinculaveis]);

  const faltaMotivo = tentou && !motivo.trim();
  const faltaEscolha = tentou && !escolhido;
  const vincular = async () => {
    setTentou(true);
    if (!escolhido || !motivo.trim()) return;
    const e = await api.vincularRecebimento(escolhido, motivo);
    if (e) { setErro(e); return; }
    onFechar();
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle className="text-[12px]">{compra ? 'Buscar pagamento no Financeiro' : 'Buscar recebimento no Financeiro'}</DialogTitle></DialogHeader>
        <div className="text-[10px] text-muted-foreground">
          {compra
            ? 'O lançamento fica na conta da compra e sai do DRE pela OC (o custo entrou pela entrada do gado). Valor, datas, conta bancária e conciliação não mudam.'
            : 'O lançamento fica na conta da venda e sai do DRE pela OC (a receita entrou pela entrega). Valor, datas, conta bancária e conciliação não mudam.'}
        </div>
        <div className="max-h-[50vh] overflow-auto rounded border">
          <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums">
            <colgroup><col style={{ width: 28 }} /><col style={{ width: 62 }} /><col /><col style={{ width: 180 }} /><col style={{ width: 90 }} /><col style={{ width: 96 }} /></colgroup>
            <thead>
              <tr>
                <th className={`${THG}`} /><th className={THG}>Pagamento</th><th className={THG}>Descrição</th>
                <th className={THG}>Conta atual</th><th className={THG}>Banco</th><th className={THG}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {itens === null && <tr><td colSpan={6} className={`${TD} text-center text-muted-foreground`}>Carregando…</td></tr>}
              {itens?.length === 0 && <tr><td colSpan={6} className={`${TD} text-center text-muted-foreground`}>{compra ? 'Nenhuma saída do cliente disponível para vincular.' : 'Nenhuma entrada do cliente disponível para vincular.'}</td></tr>}
              {itens?.map(r => (
                <tr key={r.lancamentoId} className={`cursor-pointer ${escolhido === r.lancamentoId ? 'bg-primary/10' : 'bg-white'}`}
                  onClick={() => setEscolhido(r.lancamentoId)} data-lancamento={r.lancamentoId}>
                  <td className={`${TD} text-center`}>
                    <input type="radio" aria-label={`Escolher ${r.descricao ?? r.lancamentoId}`} checked={escolhido === r.lancamentoId}
                      onChange={() => setEscolhido(r.lancamentoId)} />
                  </td>
                  <td className={`${TD} text-center`}>{dataCurta(r.data)}</td>
                  <td className={`${TD} whitespace-normal break-words`}>{r.descricao ?? '—'}{!r.mesmoFavorecido ? ' · outro favorecido' : ''}</td>
                  <td className={`${TD} whitespace-normal break-words`}>{rotuloDaConta(r.subcentro) ?? '—'}</td>
                  <td className={`${TD} text-center ${r.semContaBancaria ? 'text-[#b45309]' : ''}`}>{r.conciliado ? 'conciliado' : (r.semContaBancaria ? 'sem conta' : (r.status ?? '—'))}</td>
                  <td className={`${NUM} ${compra ? COR.neg : COR.pos}`}>{formatMoeda(compra ? -r.valor : r.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {faltaEscolha && <div className="text-[10px] text-destructive">{compra ? 'Escolha o pagamento.' : 'Escolha o recebimento.'}</div>}
        <CampoMotivo id="motivo-buscar-recebimento" valor={motivo} onChange={setMotivo} falta={faltaMotivo} />
        <DialogFooter className="items-center">
          {erro && <span className="mr-auto text-[10px] text-destructive" role="alert">{erro}</span>}
          <Button type="button" variant="ghost" size="sm" className={BOTAO} onClick={onFechar}>Cancelar</Button>
          <Button type="button" size="sm" className={BOTAO} disabled={api.ocupado} onClick={vincular}>Vincular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampoMotivo({ id, valor, onChange, falta }: { id: string; valor: string; onChange: (v: string) => void; falta: boolean }) {
  return (
    <div>
      <label className="text-[10px] font-medium" htmlFor={id}>Motivo *</label>
      <Textarea id={id} value={valor} onChange={e => onChange(e.target.value)} rows={2}
        className={`text-[11px] ${falta ? 'border-destructive' : ''}`} />
      {falta && <div className="text-[10px] text-destructive">Informe o motivo.</div>}
    </div>
  );
}

/* ─── Programar recebimento futuro: compromisso sem lote na conta da OC (a categoria do lote de maior valor), fora do DRE ───
   ⚠ SEM PONTO DE ENTRADA desde o OC-CC-ACOES-LINHA-02: o botao "+ Programar … futuro" saiu do topo (uso medido: zero). O dialogo, o
   hook (`programarRecebimento`) e a RPC ficam: voltam pelo "Parcelar" da linha, no PR de banco. Exportado para o teste dele. */
export function DialogoProgramarRecebimento({ api, lado, sugerido, onFechar }: { api: OcContaCorrenteApi; lado: LadoContaCorrente; sugerido: number | null; onFechar: () => void }) {
  const compra = lado === 'compra';
  const [valor, setValor] = useState(sugerido ? sugerido.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
  const [vencimento, setVencimento] = useState('');
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const v = parseNumericValue(valor);
  const faltaValor = tentou && !(v > 0);
  const faltaVenc = tentou && !vencimento;
  const salvar = async () => {
    setTentou(true);
    if (!(v > 0) || !vencimento) return;
    const e = await api.programarRecebimento(v, vencimento);
    if (e) { setErro(e); return; }
    onFechar();
  };
  return (
    <Dialog open onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-[12px]">{compra ? 'Programar pagamento futuro' : 'Programar recebimento futuro'}</DialogTitle></DialogHeader>
        <div className="text-[10px] text-muted-foreground">
          {compra
            ? 'Nasce um pagamento programado na conta da compra (a do lote de maior valor), fora do DRE. Ele entra no saldo quando for pago.'
            : 'Nasce um recebimento programado na conta da venda (a do lote de maior valor), fora do DRE. Ele entra no saldo quando for pago.'}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium" htmlFor="valor-programar">Valor *</label>
            <Input id="valor-programar" value={valor} onChange={e => setValor(e.target.value)} className={`h-7 text-right text-[11px] ${faltaValor ? 'border-destructive' : ''}`} />
            {faltaValor && <div className="text-[10px] text-destructive">Informe o valor.</div>}
          </div>
          <div>
            <span className="text-[10px] font-medium">Vencimento *</span>
            <DatePicker value={vencimento} onChange={setVencimento} size="compact" className={faltaVenc ? 'border-destructive' : ''} />
            {faltaVenc && <div className="text-[10px] text-destructive">Informe o vencimento.</div>}
          </div>
        </div>
        <DialogFooter className="items-center">
          {erro && <span className="mr-auto text-[10px] text-destructive" role="alert">{erro}</span>}
          <Button type="button" variant="ghost" size="sm" className={BOTAO} onClick={onFechar}>Cancelar</Button>
          <Button type="button" size="sm" className={BOTAO} disabled={api.ocupado} onClick={salvar}>Programar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Explicar diferenca (mock v7): uma linha por explicacao; salvas, viram linhas ambar no extrato ─── */
export interface Rascunho {
  chave: number; tipo: TipoExplicacao; valor: string; loteId: string; contaId: string; motivo: string; vencimento: string;
  /** Ajuste de preco: sobe ou baixa (OC-CC-VOLTA-01b). */
  sentido: SentidoAjuste;
  /** Permuta / outra receita: a data do fato (padrao: a do ultimo recebimento). */
  data: string;
}

/** OC-CC-VOLTA-01b — "todos os lotes" no seletor do ajuste; vai a' RPC como lote NULO (rateio por kg). */
const TODOS_LOTES = '__todos__';

/* A linha do rascunho como a RPC a recebe. Uma funcao so' para o salvar e a previa: as duas mandam a mesma coisa. */
export function itemDoRascunho(r: Rascunho): ExplicacaoRascunho {
  const v = parseNumericValue(r.valor);
  const comData = r.tipo === 'permuta_despesa' || r.tipo === 'outra_receita';
  return {
    tipo: r.tipo, valor: r.tipo === 'ajuste_preco' ? valorAjusteParaRpc(r.sentido, v) : v,
    loteId: r.tipo === 'ajuste_preco' && r.loteId && r.loteId !== TODOS_LOTES ? r.loteId : null,
    planoContaId: r.contaId || null, motivo: r.motivo,
    vencimento: r.tipo === 'devolucao_comprador' ? (r.vencimento || null) : comData ? (r.data || null) : null,
  };
}

/* A data do recebimento que gerou a diferenca: o ultimo que entrou no saldo; sem nenhum, a ultima entrega (regra 4). */
function dataPadraoDoFato(cc: ContaCorrente): string {
  const datas = cc.linhas.filter(l => l.tipo === 'recebimento' && l.noSaldo).map(l => l.data).sort();
  return datas[datas.length - 1] ?? cc.ultimaEntrega ?? '';
}

interface EstadoPrevia { carregando: boolean; linhas: LinhaPreviaAjuste[]; erro: string | null }

export function DialogoExplicarDiferenca({ api, somenteLeitura, lado = 'venda', removerAoAbrir = null, onFechar }: {
  api: OcContaCorrenteApi; somenteLeitura: boolean; lado?: LadoContaCorrente; onFechar: () => void;
  /** OC-CC-ACOES-LINHA-02 — o "Desfazer explicação" da linha abre o dialogo JA' no passo de remocao desta explicacao; o motivo e o
   *  botao "Remover explicação" continuam obrigatorios (nada sai so' por abrir). Em somente leitura nao vale. */
  removerAoAbrir?: string | null;
}) {
  const TIPOS = TIPOS_EXPLICACAO_DO_LADO[lado];
  const cc = api.contaCorrente;
  const [rascunhos, setRascunhos] = useState<Rascunho[]>([]);
  const [tentou, setTentou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [lotes, setLotes] = useState<LoteParaAjuste[]>([]);
  const [contasSaida, setContasSaida] = useState<ContaParaExplicacao[]>([]);
  const [contasEntrada, setContasEntrada] = useState<ContaParaExplicacao[]>([]);
  const [removendo, setRemovendo] = useState<string | null>(somenteLeitura ? null : removerAoAbrir);
  const [motivoRemover, setMotivoRemover] = useState('');
  const [tentouRemover, setTentouRemover] = useState(false);
  const [previa, setPrevia] = useState<EstadoPrevia | null>(null);
  const { listarLotes, listarContas, simularExplicacao } = api;

  useEffect(() => {
    let vivo = true;
    void listarLotes().then(l => { if (vivo) setLotes(l); });
    void listarContas('2-Saídas').then(c => { if (vivo) setContasSaida(c); });
    void listarContas('1-Entradas').then(c => { if (vivo) setContasEntrada(c); });
    return () => { vivo = false; };
  }, [listarLotes, listarContas]);

  /* OC-CC-VOLTA-01b (regra 5) — a PREVIA antes de salvar, do primeiro ajuste do rascunho: a propria RPC em simulacao. So' com lote e
     valor; refeita quando a linha do ajuste muda (o objeto da linha so' troca quando ela e' editada). */
  const ajusteRasc = rascunhos.find(r => r.tipo === 'ajuste_preco');
  useEffect(() => {
    if (!ajusteRasc || !ajusteRasc.loteId || !(parseNumericValue(ajusteRasc.valor) > 0)) { setPrevia(null); return; }
    let vivo = true;
    setPrevia({ carregando: true, linhas: [], erro: null });
    const t = setTimeout(() => {
      void simularExplicacao(itemDoRascunho(ajusteRasc)).then(res => {
        if (vivo) setPrevia({ carregando: false, linhas: linhasDaPreviaAjuste(res.previa), erro: res.erro });
      });
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [ajusteRasc, simularExplicacao]);

  if (!cc) return null;
  const itens: ExplicacaoRascunho[] = rascunhos.map(itemDoRascunho);
  const explicadoRascunho = totalDoRascunho(itens, lado);
  const explicadoTotal = Math.round((cc.explicado + explicadoRascunho) * 100) / 100;
  const falta = Math.round((cc.saldoAExplicar + explicadoTotal) * 100) / 100;

  /* TODOS os campos que faltam na linha, nao so' o primeiro: cada um fica vermelho (UX-OBRIGATORIOS-01). */
  const pendencias = (r: Rascunho): string[] => [
    ...(r.tipo === 'ajuste_preco' && !r.loteId ? ['lote'] : []),
    ...((r.tipo === 'permuta_despesa' || r.tipo === 'outra_receita') && !r.contaId ? ['conta'] : []),
    ...(r.tipo === 'devolucao_comprador' && !r.vencimento ? ['vencimento'] : []),
    ...((r.tipo === 'permuta_despesa' || r.tipo === 'outra_receita') && !r.data ? ['data'] : []),
    ...(!r.motivo.trim() ? ['motivo'] : []),
    ...(!(parseNumericValue(r.valor) > 0) ? ['valor'] : []),
  ];
  const faltando = rascunhos.flatMap(r => pendencias(r));
  const adicionar = (tipo: TipoExplicacao) => {
    /* o valor nasce com o que falta explicar, no sinal do tipo — valor sugerido e' valor aceito, e fica marcado em ambar.
       ⚠ O AJUSTE TEM DOIS SENTIDOS (OC-CC-VOLTA-01b): nasce no sentido que zera o que falta — o comprador pagou a mais, SOBE —, com
       "todos os lotes" quando a OC tem mais de um. */
    const aj = sugestaoAjuste(falta, lado);
    const sugerido = tipo === 'ajuste_preco' ? aj.valor : efeitoNoSaldo(tipo, 1, lado) > 0 ? Math.max(0, -falta) : Math.max(0, falta);
    setRascunhos(prev => [...prev, { chave: Date.now() + prev.length, tipo, valor: sugerido > 0 ? sugerido.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
      loteId: tipo === 'ajuste_preco' ? (lotes.length > 1 ? TODOS_LOTES : (lotes[0]?.id ?? '')) : '', contaId: '', motivo: '',
      vencimento: '', sentido: aj.sentido, data: tipo === 'permuta_despesa' || tipo === 'outra_receita' ? dataPadraoDoFato(cc) : '' }]);
  };
  const alterar = (chave: number, campo: Partial<Rascunho>) =>
    setRascunhos(prev => prev.map(r => (r.chave === chave ? { ...r, ...campo } : r)));
  const salvar = async () => {
    setTentou(true);
    setErro(null);
    if (rascunhos.length === 0) { onFechar(); return; }
    if (faltando.length > 0) return;
    const e = await api.explicarSaldo(itens);
    if (e) { setErro(e); return; }
    onFechar();
  };
  const remover = async (parteId: string) => {
    setTentouRemover(true);
    if (!motivoRemover.trim()) return;
    const e = await api.desfazerExplicacao(parteId, motivoRemover);
    if (e) { setErro(e); return; }
    setRemovendo(null); setMotivoRemover(''); setTentouRemover(false);
  };
  const contasDoTipo = (t: TipoExplicacao) => (t === 'outra_receita' ? contasEntrada : contasSaida);

  return (
    <Dialog open onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-[920px]" data-testid="dialogo-explicar">
        <DialogHeader><DialogTitle className="text-[12px]">Explicar diferença</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-[5px]">
          <Card rotulo="Saldo a explicar" valor={cc.saldoAExplicar} cor={COR[corDoSaldo(cc.saldoAExplicar)]} testid="card-saldo-a-explicar" />
          <Card rotulo="Explicado" valor={explicadoTotal} cor={COR[corDoSaldo(explicadoTotal)]} testid="card-explicado" />
          <Card rotulo="Falta explicar" valor={falta} cor={COR[corDoSaldo(falta)]} testid="card-falta-explicar" />
        </div>
        <div className="max-h-[45vh] overflow-auto rounded border">
          <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums">
            <colgroup>
              <col style={{ width: 112 }} /><col style={{ width: 190 }} /><col style={{ width: 92 }} /><col style={{ width: 160 }} /><col />
              <col style={{ width: 116 }} /><col style={{ width: 40 }} />
            </colgroup>
            <thead>
              <tr>{['Tipo', 'Lote', 'Data', 'Conta', 'Motivo', 'Valor', ''].map((h, i) => <th key={i} className={THG}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {cc.explicacoes.map(e => (
                <tr key={e.parteId} className={`bg-[#fffbeb] ${removendo === e.parteId ? 'outline outline-1 -outline-offset-1 outline-destructive' : ''}`}
                  data-explicacao={e.tipo} data-removendo={removendo === e.parteId ? 'sim' : undefined}>
                  <td className={TD}>{rotuloExplicacao(e.tipo, lado)}</td>
                  <td className={`${TD} text-center`}>{e.tipo === 'ajuste_preco' && e.loteOrdem == null ? 'todos' : (e.loteOrdem ?? '')}</td>
                  <td className={TD} />
                  <td className={`${TD} whitespace-normal break-words`}>{contaComNumero(e.contaOrdem, rotuloDaConta(e.conta))}</td>
                  <td className={`${TD} whitespace-normal break-words`}>{e.motivo ?? ''}</td>
                  <td className={`${NUM} ${COR[corDoSaldo(e.valor)]}`}>{formatMoeda(e.valor)}</td>
                  <td className={`${TD} text-center`}>
                    {!somenteLeitura && (
                      <button type="button" className="text-[10px] text-muted-foreground hover:text-destructive"
                        onClick={() => { setRemovendo(e.parteId); setMotivoRemover(''); setTentouRemover(false); }}>remover</button>
                    )}
                  </td>
                </tr>
              ))}
              {rascunhos.map(r => {
                const p = tentou ? pendencias(r) : [];
                const verm = (campo: string) => (p.includes(campo) ? 'border-destructive' : '');
                return (
                  <tr key={r.chave} className="bg-white" data-rascunho={r.tipo}>
                    <td className={TD}>{rotuloExplicacao(r.tipo, lado)}</td>
                    <td className={`${TD} text-center`}>
                      {r.tipo === 'ajuste_preco' ? (
                        <Select value={r.loteId} onValueChange={v => alterar(r.chave, { loteId: v })}>
                          <SelectTrigger className={`h-[18px] px-1 text-[10px] ${verm('lote')}`} aria-label="Lote do ajuste"><SelectValue placeholder="lote" /></SelectTrigger>
                          <SelectContent>
                            {lotes.length > 1 && <SelectItem value={TODOS_LOTES}>Todos os lotes (rateio por kg)</SelectItem>}
                            {lotes.map(l => <SelectItem key={l.id} value={l.id}>{`${l.ordem} · ${rotuloCategoria(l.categoria)}`}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : ''}
                    </td>
                    <td className={`${TD} text-center`}>
                      {r.tipo === 'devolucao_comprador' ? (
                        <DatePicker value={r.vencimento} onChange={v => alterar(r.chave, { vencimento: v })} size="compact" className={verm('vencimento')} />
                      ) : r.tipo === 'permuta_despesa' || r.tipo === 'outra_receita' ? (
                        <DatePicker value={r.data} onChange={v => alterar(r.chave, { data: v })} size="compact" className={verm('data')} />
                      ) : (
                        <span className="text-muted-foreground">por entrega</span>
                      )}
                    </td>
                    <td className={TD}>
                      {r.tipo === 'permuta_despesa' || r.tipo === 'outra_receita' ? (
                        <Select value={r.contaId} onValueChange={v => alterar(r.chave, { contaId: v })}>
                          <SelectTrigger className={`h-[18px] px-1 text-[10px] ${verm('conta')}`} aria-label="Conta da explicação"><SelectValue placeholder="conta" /></SelectTrigger>
                          <SelectContent>
                            {contasDoTipo(r.tipo).map(c => <SelectItem key={c.id} value={c.id}>{contaComNumero(c.ordem, c.subcentro)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : r.tipo === 'ajuste_preco' ? (
                        <Select value={r.sentido} onValueChange={v => alterar(r.chave, { sentido: v === 'sobe' ? 'sobe' : 'baixa' })}>
                          <SelectTrigger className="h-[18px] px-1 text-[10px]" aria-label="Sentido do ajuste"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sobe">Sobe o preço</SelectItem>
                            <SelectItem value="baixa">Baixa o preço</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : r.tipo === 'devolucao_comprador' ? (
                        <span>{lado === 'compra' ? 'conta da compra' : 'conta da venda'}</span>
                      ) : (
                        <span>5020 Deduções Outras Operações Pecuária</span>
                      )}
                    </td>
                    <td className={TD}>
                      <Input value={r.motivo} onChange={e => alterar(r.chave, { motivo: e.target.value })} aria-label="Motivo *"
                        className={`h-[18px] px-1 text-[10px] ${verm('motivo')}`} />
                    </td>
                    <td className={TD}>
                      <Input value={r.valor} onChange={e => alterar(r.chave, { valor: e.target.value })} aria-label="Valor"
                        className={`h-[18px] px-1 text-right text-[10px] ${verm('valor')}`} />
                    </td>
                    <td className={`${TD} text-center`}>
                      <button type="button" className="text-[10px] text-muted-foreground hover:text-destructive"
                        onClick={() => setRascunhos(prev => prev.filter(x => x.chave !== r.chave))}>tirar</button>
                    </td>
                  </tr>
                );
              })}
              {cc.explicacoes.length === 0 && rascunhos.length === 0 && (
                <tr><td colSpan={7} className={`${TD} text-center text-muted-foreground`}>Nenhuma explicação ainda. Escolha um tipo abaixo.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td colSpan={5} className="sticky bottom-0 h-[19px] border-t-2 border-[#9aa7b6] bg-[#E8E6DF] px-[5px] text-[10px]">Total explicado</td>
                <td className={`sticky bottom-0 h-[19px] border-t-2 border-[#9aa7b6] bg-[#E8E6DF] px-[5px] text-right text-[10px] ${COR[corDoSaldo(explicadoTotal)]}`}>{formatMoeda(explicadoTotal)}</td>
                <td className="sticky bottom-0 border-t-2 border-[#9aa7b6] bg-[#E8E6DF]" />
              </tr>
            </tfoot>
          </table>
        </div>
        {tentou && faltando.length > 0 && (
          <div className="text-[10px] text-destructive">Complete cada linha: {faltando.join(', ')}.</div>
        )}
        {ajusteRasc && previa && (
          <PreviaAjuste previa={previa} rotulo={rotuloSentidoAjuste(ajusteRasc.sentido, parseNumericValue(ajusteRasc.valor), ajusteRasc.loteId === TODOS_LOTES)} />
        )}
        {removendo && (
          <div className="rounded border border-destructive/40 p-2">
            <CampoMotivo id="motivo-remover-explicacao" valor={motivoRemover} onChange={setMotivoRemover} falta={tentouRemover && !motivoRemover.trim()} />
            <div className="mt-1 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" className={BOTAO} onClick={() => setRemovendo(null)}>Voltar</Button>
              <Button type="button" variant="destructive" size="sm" className={BOTAO} disabled={api.ocupado} onClick={() => remover(removendo)}>Remover explicação</Button>
            </div>
          </div>
        )}
        {!somenteLeitura && (
          <div className="flex flex-wrap gap-[5px]">
            {TIPOS.map(t => (
              <Button key={t} type="button" variant="outline" size="sm" className={BOTAO} onClick={() => adicionar(t)}>+ {rotuloExplicacao(t, lado)}</Button>
            ))}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground">
          {/* OC-CC-VOLTA-01b (regra 4): o DRE e' cada entrega na data da SUA saida — nunca a ultima para o total. */}
          {lado === 'compra'
            ? <>Ajuste de preço muda o valor dos lotes (em “Todos”, rateio pelo kg negociado) e o de cada entrada, na data dela. Permuta fica
              na data informada. Devolução do fornecedor programa uma entrada de caixa na conta da compra, fora do DRE.</>
            : <>Ajuste de preço e desconto são preço: mudam cada entrega, por kg, na data da saída dela. Outra receita e permuta ficam na data
              informada. Devolver ao comprador programa um pagamento de caixa.</>}
        </div>
        <DialogFooter className="items-center">
          {erro && <span className="mr-auto text-[10px] text-destructive" role="alert">{erro}</span>}
          <Button type="button" variant="ghost" size="sm" className={BOTAO} onClick={onFechar}>Cancelar</Button>
          {!somenteLeitura && (
            <Button type="button" size="sm" className={`${BOTAO} bg-[#15803d] hover:bg-[#15803d]/90`} disabled={api.ocupado} onClick={salvar}>Salvar explicação</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* OC-CC-VOLTA-01b (regra 5) — a previa do ajuste: lote | entregas (data) | kg | valor hoje | valor novo | R$/kg novo. Os numeros sao os
   da RPC em simulacao; aqui so' se mostram. Lote com mais de uma entrega abre as entregas embaixo, cada uma na data da sua saida. */
function PreviaAjuste({ previa, rotulo }: { previa: EstadoPrevia; rotulo: string }) {
  const kg = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  return (
    <div className="rounded border" data-testid="previa-ajuste">
      <div className="flex h-[20px] items-center gap-2 border-b bg-[#fffbeb] px-[5px] text-[10px]">
        <b data-testid="previa-rotulo">{rotulo}</b>
        <span className="text-muted-foreground">prévia — nada é gravado até salvar</span>
      </div>
      {previa.carregando && <div className="px-[5px] py-1 text-[10px] text-muted-foreground">Calculando a prévia…</div>}
      {previa.erro && <div className="px-[5px] py-1 text-[10px] text-destructive" role="alert">{previa.erro}</div>}
      {!previa.carregando && !previa.erro && previa.linhas.length > 0 && (
        <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums">
          <colgroup><col style={{ width: 120 }} /><col /><col style={{ width: 80 }} /><col style={{ width: 104 }} /><col style={{ width: 104 }} /><col style={{ width: 80 }} /></colgroup>
          <thead>
            <tr>{['Lote', 'Entregas (data)', 'kg', 'Valor hoje', 'Valor novo', 'R$/kg novo'].map(h => <th key={h} className={THG}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {previa.linhas.map(l => (
              <tr key={l.chave} data-previa={l.nivel} className={l.nivel === 'total' ? 'bg-[#E8E6DF] font-bold' : l.nivel === 'entrega' ? 'bg-[#f8fafc]' : 'bg-white'}>
                <td className={`${TD} ${l.nivel === 'entrega' ? 'pl-[14px] text-muted-foreground' : ''}`}>
                  {l.nivel === 'total' ? 'Total' : l.nivel === 'entrega' ? 'entrega' : `${l.loteOrdem ?? ''} · ${rotuloCategoria(l.categoria)}`}
                </td>
                <td className={TD_DATAS_DA_PREVIA}>{l.datas.join(' · ')}</td>
                <td className={NUM}>{kg(l.kg)}</td>
                <td className={NUM}>{num2(l.hoje)}</td>
                <td className={`${NUM} font-semibold`}>{num2(l.novo)}</td>
                <td className={NUM}>{l.porKgNovo === null ? '—' : num2(l.porKgNovo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
