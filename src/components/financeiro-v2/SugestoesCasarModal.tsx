/**
 * SUGESTÕES PARA CASAR — PR-CONC-SUGESTOES-CASAR-01; desenho do P159c (mock `mock-sugestoes-casar-v1.html`, Gabriel 29/10).
 *
 * ⚠ O MOTOR NÃO MORA AQUI: `sugerirCasamentos` (`src/lib/conciliacao/sugestoesCasamento.ts`) é o mesmo que a prévia da
 * importação usa para somar. Este modal só MOSTRA a lista e entrega a escolhida ao `CasarComBancoModal` — quem casa
 * continua sendo ele, com a mesma RPC e o mesmo Conciliar. Nada casa por aqui.
 * ⚠ MODAL SOBRE MODAL: abre por cima da Conferência (o Radix empilha; Esc fecha só o de cima).
 * ⚠ A LISTA VEM PRONTA DA CONFERÊNCIA — a MESMA que deu o "(N)" do menu, calculada uma vez por mesa (decisão do Gabriel,
 * 30/09). O modal não recalcula: com orçamentos diferentes, o menu dizia (2) e o modal mostrava 1 (medido no Camargo).
 * ⚠ CONC-SUGESTOES-TABELA-01 (Gabriel 04/11 06:36): o movimento do banco é o TÍTULO, numa faixa própria ("Lançamento do extrato" · data ·
 * texto do banco · valor), separado das sugestões; as sugestões e o "Procurar no histórico" são a TABELA DA LISTA DO FINANCEIRO
 * (`TabelaDaLista`, as mesmas peças e fontes): ☐ · Comp. · Venc. · Pgto. · Descrição · Fornecedor · Faz. · NF · Valor · Status · Motivo ·
 * casar, uma linha por lançamento, sem quebrar. As caixinhas das duas listas somam juntas no rodapé fixo, e "Casar selecionados" abre o
 * "Casar com o banco" de hoje (`onCasarSelecionados`). O banco vai no título do modal ("Sugestões para casar · <conta>").
 * ⚠ REGRA DE CORTE (21/10): em tabela, texto = UMA linha com "…" e o texto inteiro no `title`; data (dd/mm/aaaa), valor e
 * contador nunca cortam — as colunas deles foram medidas no pior texto.
 * ⚠ SELOS A 8px, a exceção da Conferência (CLAUDE.md): azul tracejado = confere; âmbar cheio = conferir antes de casar.
 * ⚠ P153b (Gabriel 29/10): o modal vai a até 1400px de largura e a ALTURA TODA; as fontes são as da lista do Financeiro (a exceção declarada
 *   "Lancamentos Financeiros"). As sugestões ficam num bloco de ALTURA FIXA (9 linhas; mais rola lá dentro) e o "Procurar no histórico" ocupa
 *   o resto da altura — nada se desloca ao procurar nem ao marcar. O achado EM ABERTO do histórico casa por aqui também
 *   (`onCasarDoHistorico`, o mesmo `CasarComBancoModal`); o de outra conta casa trocando a conta (D3).
 * ⚠ CONC-SUGESTOES-V2 A (mock aprovado 25/11 17:19): o movimento do banco é a 1ª linha DA MESMA TABELA ("Banco", Pgto./Valor alinhados, o nome
 *   sem caixa alta e o CNPJ na coluna Fornecedor); em cima o bloco "✓ Exata" (valor + CNPJ, do MOTOR AMPLIADO do banco — `motorAmpliado.ts`), com
 *   "Casar" cheio; embaixo "Possíveis — conferir" (a lista de hoje + o que só o ampliado acha: outro banco, o fornecedor pelo CNPJ, nota sem
 *   lançamento). NUNCA casa sozinha. Vencimento ESTIMADO (nada o declara, lote 114390) = "~" cinza itálico e Δ dias neutro.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { fmtBRL } from '@/components/conciliacao/TabelaExtratoDoMes';
import { dataBR } from '@/lib/datas/dataBR';
import { historicoDoBanco } from '@/lib/conciliacao/historicoDoBanco';
import { lerComplementoDasLinhas, type ComplementoDaLinha } from '@/lib/conciliacao/complementoDasLinhas';
import { motivoCurto, resumoDaSelecao } from '@/lib/conciliacao/selecaoParaCasar';
import { TabelaDaLista } from '@/components/financeiro-v2/TabelaDaLista';
import { CabecalhoParaCasar, LinhaParaCasarNaTabela, LINK_PARA_CASAR, ALTURA_DA_LINHA_PARA_CASAR, colunasParaCasar, largurasParaCasar,
  ALTURA_DO_CABECALHO_PARA_CASAR, PISO_PARA_CASAR, deltasDoMovimento, type LinhaParaCasar, chaveDaLinhaParaCasar, ordenarParaCasar,
  proximaOrdemParaCasar, type OrdemParaCasar } from '@/components/conciliacao/TabelaParaCasar';
/* ⚠ SEM IMPORT DA CONFERÊNCIA NEM DO `CasarComBancoModal`: o tipo do extrato é o estrutural da lib. Importar de lá
   fecharia um ciclo (Espelho → este modal → Casar → Espelho), que o `madge` acusa. */
import type { CandidatoSugestao, ExtratoParaSugerir, Sugestao } from '@/lib/conciliacao/sugestoesCasamento';
import { ProcurarNoHistorico } from '@/components/conciliacao/ProcurarNoHistorico';
import type { AchadoDoHistorico, ModeloDoHistorico } from '@/lib/conciliacao/procurarNoHistorico';
import { FaixaParaCasar, LinhaDoBancoParaCasar } from '@/components/conciliacao/TabelaParaCasar';
import { nomeDoHistorico, documentoDoHistorico, formatarDocumento } from '@/lib/conciliacao/nomeDoHistorico';
import { motorAmpliadoDoMovimento, exatasDoMotor, possiveisDoMotor, apelidoDaConta, nomeDoExtratoSemCaixa, lerVencimentosDeclarados,
  vencimentoEstimado, parcelasDoMotor, parcelaDifere, prazoDaParcela, type RespostaDoAmpliado, type ParcelaDoMotor } from '@/lib/conciliacao/motorAmpliado';
import { lerContratosDasParcelas, type ContratoDaParcela } from '@/lib/conciliacao/detalheDaSugestao';
import { DetalheDaSugestao, type AlvoDoDetalhe } from '@/components/conciliacao/DetalheDaSugestao';
import type { CandidatoConciliacao } from '@/hooks/useConciliacaoDoMes';

const corVal = (v: number) => (v < 0 ? 'text-rose-600' : 'text-emerald-600');
const SELO = 'selo-motivo inline-block max-w-full truncate rounded-[3px] border px-[4px] py-[1px] align-middle text-[8px] font-semibold leading-[8px]';
const SELO_CONFERE = 'border-dashed border-[#1d4ed8] text-[#1d4ed8]';
const SELO_CONFERIR = 'border-solid border-amber-500 bg-amber-50 text-amber-700';

/** O que foi marcado nas duas listas (por id): o lançamento da sugestão, ou o achado do histórico (com a troca de conta). */
export type Marcado = { de: 'sugestao'; c: CandidatoSugestao } | { de: 'historico'; a: AchadoDoHistorico; trocar: boolean }
  /** CONC-SUGESTOES-V2 — do motor ampliado (exata ou possível; de outro banco casa trocando a conta) */
  | { de: 'motor'; c: CandidatoConciliacao };

interface Props {
  open: boolean;
  onClose: () => void;
  extrato: ExtratoParaSugerir | null;
  nomeConta?: string;
  /** A lista que a Conferência calculou para esta linha — a mesma do "(N)" do menu. */
  sugestoes: readonly Sugestao[];
  onCasar: (s: Sugestao) => void;
  /** CONC-SUGESTOES-TABELA-01 — "Casar selecionados": o hospedeiro abre o `CasarComBancoModal` de hoje com todos os marcados levados. */
  onCasarSelecionados?: (marcados: Marcado[]) => void;
  /** P153 — o "Procurar no histórico" embaixo das sugestões; sem os dois, ele não aparece. */
  clienteId?: string | null;
  onCriarIgual?: (m: ModeloDoHistorico) => void;
  /** P153b — casar um achado EM ABERTO do "Procurar no histórico" (`trocarConta` = o de outra conta, D3). */
  onCasarDoHistorico?: (a: AchadoDoHistorico, trocarConta: boolean) => void;
  /** P153b — a conta do movimento (decide "outra conta" no histórico). */
  contaBancariaId?: string | null;
  /** CONC-SUGESTOES-V2 — o id do movimento: o motor ampliado do banco (as exatas e o que só ele acha). Sem ele, só a lista de hoje. */
  extratoId?: string | null;
  /** CONC-SUGESTOES-V2 — casar o que veio do motor (o hospedeiro leva ao `CasarComBancoModal`; outro banco = trocando a conta). */
  onCasarDoMotor?: (c: CandidatoConciliacao) => void;
  /** MODAL ÚNICO (06:56) — a entrada sem a lista da Conferência (painel da conta, palco do mês): o motor ampliado é a lista inteira
   *  (também os da própria conta, que na Conferência vêm da lista de hoje) */
  soMotor?: boolean;
}

/* P153b — até 1400px (Gabriel 29/10), nunca mais que 95% da janela; a ALTURA TODA (12px de respiro em cima e embaixo). */
const LARGURA_MODAL = 'min(1400px, 95vw)';
const ALTURA_MODAL = 'calc(100vh - 24px)';
/* AJUSTE 07:55 — as duas listas DIVIDEM a altura do modal (cada uma rola por dentro), com o piso de cabeçalho + 2 linhas cada (o modal de
   459px de altura — a janela de 483 — tem de caber sem rolar: o gate de 04/11 mediu) */
const PISO_DE_CADA_LISTA = ALTURA_DO_CABECALHO_PARA_CASAR + 2 * ALTURA_DA_LINHA_PARA_CASAR + 2;

export function SugestoesCasarModal({ open, onClose, extrato, nomeConta, sugestoes, onCasar, onCasarSelecionados, clienteId, onCriarIgual,
  onCasarDoHistorico, contaBancariaId, extratoId, onCasarDoMotor, soMotor = false }: Props) {
  const campoProcurar = useRef<HTMLInputElement>(null);
  const [marcados, setMarcados] = useState<ReadonlyMap<string, Marcado>>(new Map());
  /* D3 (homologação Edson 11:40) — a ordem pelo cabeçalho; sem clique, a do motor (o mais provável primeiro) */
  const [ordemSug, setOrdemSug] = useState<OrdemParaCasar | null>(null);
  const [complemento, setComplemento] = useState<ReadonlyMap<string, ComplementoDaLinha>>(new Map());
  /* abrir outro extrato começa do zero */
  useEffect(() => { setMarcados(new Map()); setOrdemSug(null); }, [open, extrato]);
  const idsDasSugestoes = useMemo(() => sugestoes.flatMap((s) => s.lancamentos.map((c) => c.lancamento_id)), [sugestoes]);
  useEffect(() => {
    let vivo = true;
    if (!open || !clienteId || !idsDasSugestoes.length) { setComplemento(new Map()); return; }
    void lerComplementoDasLinhas(clienteId, idsDasSugestoes).then((m) => { if (vivo) setComplemento(m ?? new Map()); });
    return () => { vivo = false; };
  }, [open, clienteId, idsDasSugestoes]);
  /* CONC-SUGESTOES-V2 — o motor ampliado do banco para este movimento (uma leitura ao abrir) */
  const [motor, setMotor] = useState<RespostaDoAmpliado | null>(null);
  useEffect(() => {
    let vivo = true;
    setMotor(null);
    if (!open || !clienteId || !extratoId) return;
    void motorAmpliadoDoMovimento(clienteId, extratoId).then((r) => { if (vivo) setMotor(r); });
    return () => { vivo = false; };
  }, [open, clienteId, extratoId]);
  const exatas = useMemo(() => (motor?.ok ? exatasDoMotor(motor.candidatos).filter((c) => c.origem !== 'nota') : []), [motor]);
  const idsDaExata = useMemo(() => new Set(exatas.map((c) => c.id)), [exatas]);
  const doMotor = useMemo(() => (!motor?.ok ? []
    : soMotor ? motor.candidatos.filter((c) => !c.indisponivel && c.exata !== true && !c.parcelaId)
      : possiveisDoMotor(motor.candidatos, new Set(idsDasSugestoes))), [motor, idsDasSugestoes, soMotor]);
  /* REGRA DE FINANCIAMENTO (07:07) — a parcela aberta do credor é UMA linha (amortização + juros); os dois lançamentos saem da lista solta */
  const parcelas = useMemo(() => (motor?.ok ? parcelasDoMotor(motor.candidatos) : []), [motor]);
  const idsDeParcela = useMemo(() => new Set(parcelas.flatMap((p) => p.candidatos.map((c) => c.id))), [parcelas]);
  const [contratos, setContratos] = useState<ReadonlyMap<string, ContratoDaParcela> | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!open || !parcelas.length) { setContratos(null); return; }
    void lerContratosDasParcelas(parcelas.map((p) => p.parcelaId)).then((m) => { if (vivo) setContratos(m); });
    return () => { vivo = false; };
  }, [open, parcelas]);
  /* ajuste (1) 07:45 — o mini-modal só leitura da linha clicada */
  const [detalhe, setDetalhe] = useState<{ alvo: AlvoDoDetalhe; casar?: () => void } | null>(null);
  useEffect(() => { setDetalhe(null); }, [open, extrato]);
  /* C (lote 114390): o que declara o vencimento de cada linha mostrada — estimado = nada declara */
  const [declarados, setDeclarados] = useState<ReadonlyMap<string, string | null> | null>(null);
  const idsMostrados = useMemo(() => [...idsDasSugestoes, ...exatas.map((c) => c.id), ...doMotor.filter((c) => c.origem !== 'nota').map((c) => c.id)],
    [idsDasSugestoes, exatas, doMotor]);
  useEffect(() => {
    let vivo = true;
    if (!open || !clienteId || !idsMostrados.length) { setDeclarados(null); return; }
    void lerVencimentosDeclarados(clienteId, idsMostrados).then((m) => { if (vivo) setDeclarados(m); });
    return () => { vivo = false; };
  }, [open, clienteId, idsMostrados]);

  if (!extrato) return null;
  const titulo = ['Sugestões para casar', nomeConta].filter(Boolean).join(' · ');
  const h = historicoDoBanco(extrato.historico, extrato.data);
  const original = extrato.historico ?? '';
  const tituloHistorico = h.texto && h.texto !== original ? `${h.texto}\n${original}` : original || undefined;

  const alternar = (id: string, m: Marcado) => setMarcados((atual) => {
    const n = new Map(atual); if (n.has(id)) n.delete(id); else n.set(id, m); return n;
  });
  const valorDe = (m: Marcado) => (m.de === 'sugestao' ? Number(m.c.valor_assinado) : m.de === 'motor' ? (extrato.valor < 0 ? -1 : 1) * Math.abs(m.c.valor) : m.a.valor);
  const resumo = resumoDaSelecao([...marcados.values()].map(valorDe), extrato.valor);
  const podeCasarSelecionados = marcados.size > 0 && !!onCasarSelecionados;

  const linhaDoCandidato = (c: CandidatoSugestao): LinhaParaCasar => {
    const x = complemento.get(c.lancamento_id);
    return {
      vencEstimado: vencimentoEstimado(declarados, c.lancamento_id),
      id: c.lancamento_id, comp: c.competencia, venc: c.data_vencimento, pgto: x?.dataPagamento ?? null, descricao: c.descricao,
      fornecedor: c.fornecedor, fazendaCodigo: x?.fazendaCodigo ?? null, fazendaNome: x?.fazendaNome ?? null,
      tipoDocumento: x?.tipoDocumento ?? null, numeroDocumento: x?.numeroDocumento ?? null,
      valor: Number(c.valor_assinado), status: c.status_transacao, conciliado: !!c.ja_conciliado,
      /* CONC-CRIAR-COM-NOTA-02 D-g — Δ valor e Δ dias contra o movimento do banco */
      ...(extrato ? deltasDoMovimento({ data: extrato.data, valor: extrato.valor }, { valor: Number(c.valor_assinado), venc: c.data_vencimento }) : {}),
    };
  };
  /* UI-FONTE-GATE-01: Faz. e NF só quando alguma sugestão tem o dado (a largura vazia vai para Descrição e Fornecedor) */
  const colunasDeHoje = colunasParaCasar(sugestoes.flatMap((s) => s.lancamentos.map(linhaDoCandidato)));
  /* ajuste (3) 07:45 — a coluna NF/DOC também aparece quando uma parcela tem o nº do contrato (ou a linha do motor tem NF) */
  const colunasDasSugestoes = { ...colunasDeHoje, deltas: !!extrato,
    nf: colunasDeHoje.nf || parcelas.some((p) => !!contratos?.get(p.parcelaId)?.numeroContrato)
      || [...exatas, ...doMotor].some((c) => !!c.numeroDocumento) };
  /* D1/D2 (homologação Edson 11:40) — UMA LINHA POR LANÇAMENTO: o mesmo lançamento em duas sugestões (a 402 "do fornecedor" e na soma de 3)
     aparecia duas vezes e marcar uma marcava as duas. Fica a 1ª (a do motivo mais forte: o motor já ordena); a outra não repete a linha. */
  const vistos = new Set<string>();
  const linhasDasSugestoes = sugestoes.flatMap((s, i) => s.lancamentos.map((c, j) => ({ s, i, j, c })))
    .filter((x) => (vistos.has(x.c.lancamento_id) ? false : (vistos.add(x.c.lancamento_id), true)));
  const motivoDaLinha = (x: { s: Sugestao; j: number }) => `${x.s.lancamentos.length > 1 ? `${x.j + 1}/${x.s.lancamentos.length} · ` : ''}${motivoCurto(x.s)}`;
  const linhasNaOrdem = ordemSug
    ? ordenarParaCasar(linhasDasSugestoes, (x) => chaveDaLinhaParaCasar(linhaDoCandidato(x.c), ordemSug.coluna, motivoDaLinha(x)), ordemSug.sentido)
    : linhasDasSugestoes;
  const largurasDasSugestoes = largurasParaCasar(colunasDasSugestoes);
  /* CONC-SUGESTOES-V2 — a linha de um candidato do motor (lançamento de qualquer banco, ou nota sem lançamento) */
  const sinalDoMov = extrato.valor < 0 ? -1 : 1;
  const linhaDoMotor = (c: CandidatoConciliacao): LinhaParaCasar => ({
    id: c.id, comp: c.origem === 'nota' ? c.dataReferencia : null, venc: c.vencimento ?? null, pgto: null,
    descricao: c.descricao, tituloDescricao: [c.descricao, c.outraConta ? `Conta prevista: ${c.contaNome ?? '—'} — casar troca para ${nomeConta ?? 'a do extrato'}` : null]
      .filter(Boolean).join('\n') || undefined,
    fornecedor: c.favorecido, fazendaCodigo: null, fazendaNome: null, tipoDocumento: c.numeroDocumento ? 'NF' : null, numeroDocumento: c.numeroDocumento,
    valor: sinalDoMov * Math.abs(c.valor), status: c.origem === 'nota' ? 'nota' : c.status, conciliado: false,
    vencEstimado: c.origem !== 'nota' && vencimentoEstimado(declarados, c.id),
    ...deltasDoMovimento({ data: extrato.data, valor: extrato.valor }, { valor: c.valor, venc: c.vencimento ?? null }),
  });
  const seloDoMotor = (c: CandidatoConciliacao) => {
    if (c.exata) return <span className="inline-block rounded-full bg-emerald-700 px-[6px] text-[8px] font-semibold leading-[13px] text-white" data-testid="motor-motivo">✓ valor + {c.documentoCasa === 'raiz' ? 'CNPJ (filial)' : 'CNPJ'}</span>;
    /* soMotor: o da PRÓPRIA conta (sem documento) diz o valor — igual (azul tracejado) ou diferente (âmbar) */
    if (c.origem !== 'nota' && !c.documentoCasa && !c.outraConta) {
      const igual = Math.abs(c.deltaValor) < 0.005;
      return <span className={cn(SELO, igual ? SELO_CONFERE : SELO_CONFERIR)} data-testid="motor-motivo">{igual ? 'valor igual' : 'valor ≠'}</span>;
    }
    const t = c.origem === 'nota' ? 'nota sem lançamento' : c.documentoCasa ? `mesmo ${c.documentoCasa === 'raiz' ? 'CNPJ (filial)' : 'CNPJ'}` : 'outro banco';
    return <span className={cn(SELO, SELO_CONFERIR)} data-testid="motor-motivo">{t}</span>;
  };
  const chipDoBanco = (c: CandidatoConciliacao) => (c.outraConta ? (
    <span className="ml-1 rounded-full bg-muted px-[5px] text-[8px] font-medium leading-[12px] text-muted-foreground" title={`Conta prevista: ${c.contaNome ?? '—'}`}
      data-testid="motor-outra-conta">{apelidoDaConta(c.contaNome)}</span>) : null);
  const acaoDoMotor = (c: CandidatoConciliacao) => (c.origem === 'nota'
    ? <span className="text-[9px] text-muted-foreground" title="Nota sem lançamento: crie pelo “+ Da nota” do Financeiro (a mesma nota)." data-testid="motor-nota">nota</span>
    : <button type="button" onClick={() => onCasarDoMotor?.(c)} disabled={!onCasarDoMotor} data-testid="motor-casar"
        className={c.exata ? 'h-[17px] rounded bg-emerald-700 px-2 text-[9px] font-semibold text-white hover:bg-emerald-800 disabled:opacity-50' : LINK_PARA_CASAR}
        title={c.outraConta ? `Casar e trocar a conta (${c.contaNome ?? '—'} → ${nomeConta ?? 'a do extrato'})` : 'Casar com o movimento do banco'}>Casar</button>);
  const nomeDoBanco = nomeDoHistorico(extrato.historico, extrato.data);
  const docDoBanco = documentoDoHistorico(extrato.historico);
  const possiveis = linhasNaOrdem.filter((x) => !idsDaExata.has(x.c.lancamento_id) && !idsDeParcela.has(x.c.lancamento_id));
  /* a parcela: Descrição = "FCO – Curral · 1/12 · venc. 01/11"; Fornecedor = o credor; NF/DOC = o nº do CONTRATO (ajuste (3)) */
  const contratoDe = (p: ParcelaDoMotor) => contratos?.get(p.parcelaId) ?? null;
  const prazoDe = (p: ParcelaDoMotor) => prazoDaParcela(p, extrato.data)?.texto ?? null;
  const linhaDaParcela = (p: ParcelaDoMotor): LinhaParaCasar => {
    const k = contratoDe(p);
    return {
      id: p.parcelaId, comp: null, venc: p.vencimento, pgto: null, descricao: p.rotulo,
      tituloDescricao: [p.rotulo, k?.contrato && `Contrato: ${k.contrato}`, k?.numeroContrato && `Cédula nº ${k.numeroContrato}`,
        k?.credor && `Credor: ${k.credor}`, prazoDe(p) && `Pagamento ${prazoDe(p)}`,
        p.outraConta ? `Conta prevista: ${p.contaNome ?? '—'} — casar troca para ${nomeConta ?? 'a do extrato'}` : null].filter(Boolean).join('\n'),
      fornecedor: k?.credor ?? p.candidatos[0]?.favorecido ?? null, fazendaCodigo: null, fazendaNome: null,
      tipoDocumento: k?.numeroContrato ? 'Contrato' : null, numeroDocumento: k?.numeroContrato ?? null,
      valor: sinalDoMov * p.valor, status: p.candidatos[0]?.status ?? null, conciliado: false,
      ...deltasDoMovimento({ data: extrato.data, valor: extrato.valor }, { valor: p.valor, venc: p.vencimento }),
    };
  };
  const abrirLancamento = (id: string, descricao: string | null, casar?: () => void) =>
    setDetalhe({ alvo: { tipo: 'lancamento', id, titulo: descricao || 'Lançamento' }, casar });
  const marcadaParcela = (p: ParcelaDoMotor) => p.candidatos.every((c) => marcados.has(c.id));
  const alternarParcela = (p: ParcelaDoMotor) => setMarcados((atual) => {
    const n = new Map(atual); const tudo = p.candidatos.every((c) => n.has(c.id));
    for (const c of p.candidatos) { if (tudo) n.delete(c.id); else n.set(c.id, { de: 'motor', c }); }
    return n;
  });
  /* casar a parcela = os DOIS lançamentos juntos no "Casar com o banco" (o valor diferente pergunta o motivo lá) */
  const casarParcela = onCasarSelecionados ? (p: ParcelaDoMotor) => onCasarSelecionados(p.candidatos.map((c) => ({ de: 'motor', c }))) : null;
  const seloDaParcela = (p: ParcelaDoMotor) => {
    const difere = parcelaDifere(p, extrato.valor);
    const pz = prazoDe(p);
    const t = ['parcela', difere ? 'valor difere' : null, pz].filter(Boolean).join(' · ');
    return <span className={cn(SELO, difere ? SELO_CONFERIR : SELO_CONFERE)} data-testid="parcela-motivo" title={t}>{t}</span>;
  };
  const alvoDaParcela = (p: ParcelaDoMotor): AlvoDoDetalhe => ({ tipo: 'parcela', rotulo: p.rotulo, valor: p.valor, contrato: contratoDe(p),
    prazo: prazoDe(p), conta: p.contaNome });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* P159f: sem sugestão automática, o cursor vai direto ao campo do "Procurar no histórico" (no lugar do foco padrão do Radix) */}
      {/* CONC-CRIAR-COM-NOTA-02 D2 (homologação 14:32, REGRA SOBERANA do Gabriel): o modal SEMPRE no tamanho padrão — a sobra fica DENTRO das
          listas (a de 12:02, "altura do conteúdo", foi revertida) */}
      <DialogContent className="flex max-h-none max-w-[95vw] flex-col p-0 gap-0 overflow-hidden [&>button.absolute]:hidden"
        onOpenAutoFocus={(ev) => { if (sugestoes.length === 0 && campoProcurar.current) { ev.preventDefault(); campoProcurar.current.focus(); } }}
        style={{ width: LARGURA_MODAL, height: ALTURA_MODAL }} aria-describedby={undefined} data-testid="sugestoes-casar">
        {/* CONC-SUGESTOES-FONTE-01 (08/11): o cabeçalho e a faixa do extrato UM DEGRAU menores (título 11, faixa 28px a 11, valor 13) */}
        <div className="flex h-7 shrink-0 items-center justify-between gap-2 bg-primary px-3 text-primary-foreground">
          {/* o nome da conta pode passar da largura: "…" e o título inteiro no `title` (a exceção declarada, como o da Conferência) */}
          <DialogTitle className="min-w-0 truncate whitespace-nowrap text-[11px] font-medium" title={titulo} data-reticencias-com-title="">
            {titulo}
          </DialogTitle>
          <button type="button" onClick={onClose} aria-label="Fechar" className="shrink-0 rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-primary-foreground/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* CONC-SUGESTOES-V2 A: o extrato é a 1ª linha DA TABELA ("Banco") — a faixa do título e a legenda saíram (mock aprovado 25/11) */}
        <div className="h-2 shrink-0" />
        {/* ⚠ AJUSTE 07:55: o bloco das sugestões e o do histórico DIVIDEM a altura do modal (flex-1 cada) e vão até o rodapé; o cabeçalho
            navy fica, só as linhas rolam. O modal não muda de altura (a altura dele é a da janela). */}
        <div className="mx-3 min-h-0 flex-1 overflow-auto rounded-sm border bg-card" style={{ minHeight: PISO_DE_CADA_LISTA }} data-testid="sugestoes-lista">
          <div style={{ minWidth: PISO_PARA_CASAR }} data-testid="sugestoes-piso">
          <TabelaDaLista larguras={largurasDasSugestoes} cabecalho={<CabecalhoParaCasar colunas={colunasDasSugestoes} prefixo="sugestoes"
            ordenar={(k) => setOrdemSug((o) => proximaOrdemParaCasar(o, k))} seta={(k) => (ordemSug?.coluna === k ? (ordemSug.sentido === 'asc' ? '↑' : '↓') : '')} />}>
            <LinhaDoBancoParaCasar data={extrato.data} nome={nomeDoExtratoSemCaixa(extrato.historico, nomeDoBanco)} textoCru={original}
              documento={docDoBanco ? formatarDocumento(docDoBanco) : null} valor={extrato.valor} colunas={colunasDasSugestoes} />
            {exatas.length > 0 && <FaixaParaCasar n={largurasDasSugestoes.length} tom="exata" testid="faixa-exata">✓ Exata · {exatas.length}</FaixaParaCasar>}
            {exatas.map((c) => (
              <LinhaParaCasarNaTabela key={`ex-${c.id}`} l={linhaDoMotor(c)} colunas={colunasDasSugestoes} testid="exata" testidDaLinha="exata" exata
                marcada={marcados.has(c.id)} podeMarcar alternar={() => alternar(c.id, { de: 'motor', c })}
                motivo={<>{seloDoMotor(c)}{chipDoBanco(c)}</>} acao={acaoDoMotor(c)}
                onAbrir={() => abrirLancamento(c.id, c.descricao, onCasarDoMotor ? () => onCasarDoMotor(c) : undefined)} />
            ))}
            {(exatas.length > 0 || possiveis.length + doMotor.length + parcelas.length > 0) && (
              <FaixaParaCasar n={largurasDasSugestoes.length} testid="faixa-possiveis">Possíveis — conferir · {possiveis.length + doMotor.length + parcelas.length}</FaixaParaCasar>
            )}
            {parcelas.map((p) => (
              <LinhaParaCasarNaTabela key={`p-${p.parcelaId}`} l={linhaDaParcela(p)} colunas={colunasDasSugestoes} testid="parcela" testidDaLinha="parcela"
                marcada={marcadaParcela(p)} podeMarcar alternar={() => alternarParcela(p)}
                motivo={<>{seloDaParcela(p)}{p.outraConta ? chipDoBanco(p.candidatos[0]) : null}</>}
                acao={<button type="button" onClick={() => casarParcela?.(p)} disabled={!casarParcela} className={LINK_PARA_CASAR} data-testid="parcela-casar"
                  title={p.outraConta ? `Casar a parcela (amortização + juros) e trocar a conta (${p.contaNome ?? '—'} → ${nomeConta ?? 'a do extrato'})` : 'Casar a parcela (amortização + juros)'}>Casar</button>}
                onAbrir={() => setDetalhe({ alvo: alvoDaParcela(p), casar: casarParcela ? () => casarParcela(p) : undefined })} />
            ))}
            {sugestoes.length === 0 && exatas.length === 0 && doMotor.length === 0 && parcelas.length === 0 && (
              <tr style={{ height: ALTURA_DA_LINHA_PARA_CASAR }}><td colSpan={largurasDasSugestoes.length} className="px-1 py-1 italic text-muted-foreground" data-testid="sugestoes-nenhuma">
                {motor === null && extratoId ? 'procurando em todos os bancos…' : motor && !motor.ok ? 'Não consegui ver as sugestões de todos os bancos.' : 'Nenhuma sugestão automática'}</td></tr>
            )}
            {possiveis.map(({ s, i, j, c }) => (
              <LinhaParaCasarNaTabela key={`${i}-${c.lancamento_id}`} l={linhaDoCandidato(c)} colunas={colunasDasSugestoes} testid="sugestao" testidDaLinha="sugestao"
                marcada={marcados.has(c.lancamento_id)} podeMarcar={!c.ja_conciliado} motivoMarcar="já conciliado"
                alternar={() => alternar(c.lancamento_id, { de: 'sugestao', c })}
                /* o title leva o texto CURTO (o que a coluna mostra e pode cortar) e o motivo inteiro, quando são diferentes */
                motivo={<span className={cn(SELO, s.valorDiferente ? SELO_CONFERIR : SELO_CONFERE)} data-testid="sugestao-motivo"
                  title={motivoDaLinha({ s, j }) === s.motivo ? s.motivo : `${motivoDaLinha({ s, j })} — ${s.motivo}`}>
                  {motivoDaLinha({ s, j })}</span>}
                acao={<button type="button" onClick={() => onCasar(s)} className={LINK_PARA_CASAR} data-testid="sugestao-casar"
                  title={s.lancamentos.length > 1 ? `Casar a sugestão inteira (${s.lancamentos.length} lançamentos)` : 'Casar com o movimento do banco'}>Casar</button>}
                onAbrir={() => abrirLancamento(c.lancamento_id, c.descricao, () => onCasar(s))} />
            ))}
            {doMotor.map((c) => (
              <LinhaParaCasarNaTabela key={`m-${c.id}`} l={linhaDoMotor(c)} colunas={colunasDasSugestoes} testid="do-motor" testidDaLinha="do-motor"
                marcada={marcados.has(c.id)} podeMarcar={c.origem !== 'nota'} motivoMarcar="nota sem lançamento: crie pelo “+ Da nota”"
                alternar={() => alternar(c.id, { de: 'motor', c })} motivo={<>{seloDoMotor(c)}{chipDoBanco(c)}</>} acao={acaoDoMotor(c)}
                onAbrir={c.origem === 'nota' ? undefined : () => abrirLancamento(c.id, c.descricao, onCasarDoMotor ? () => onCasarDoMotor(c) : undefined)} />
            ))}
          </TabelaDaLista>
          </div>
        </div>

        {onCriarIgual && (
          <div className="mx-3 flex min-h-0 flex-1 flex-col" style={{ minHeight: PISO_DE_CADA_LISTA + 32 }}>
            <ProcurarNoHistorico clienteId={clienteId ?? null} onCriarIgual={onCriarIgual} campoRef={campoProcurar} preencher
              onCasar={onCasarDoHistorico} contaDoExtrato={{ id: contaBancariaId ?? null, nome: nomeConta ?? null }}
              movimento={{ data: extrato.data, historico: extrato.historico, valor: extrato.valor }}
              selecao={{ marcado: (id) => marcados.has(id), alternar: (a, trocar) => alternar(a.lancamentoId, { de: 'historico', a, trocar }) }} />
          </div>
        )}

        {/* O RODAPÉ FIXO: Selecionados · soma · extrato · diferença, em colunas de largura reservada (nada se desloca ao marcar), e o
            "Casar selecionados". Cabe a 750px (o modal a 95%): o "Fechar" é o ✕ do topo e a legenda subiu para o título das sugestões. */}
        <div className="mt-2 flex h-[36px] shrink-0 items-center gap-2 border-t px-3 text-[10px]" data-testid="sugestoes-rodape">
          <span className="w-[96px] shrink-0 whitespace-nowrap tabular-nums" data-testid="selecionados-n">Selecionados {resumo.n}</span>
          <span className="flex w-[136px] shrink-0 justify-between gap-1 whitespace-nowrap tabular-nums"><span className="text-muted-foreground">soma</span>
            <span className={cn('font-semibold', resumo.n ? corVal(resumo.soma) : 'text-muted-foreground')} data-testid="selecionados-soma">{resumo.n ? fmtBRL(resumo.soma) : '—'}</span></span>
          <span className="flex w-[136px] shrink-0 justify-between gap-1 whitespace-nowrap tabular-nums"><span className="text-muted-foreground">extrato</span>
            <span className={cn('font-semibold', corVal(resumo.extrato))}>{fmtBRL(resumo.extrato)}</span></span>
          <span className="flex w-[136px] shrink-0 justify-between gap-1 whitespace-nowrap tabular-nums"><span className="text-muted-foreground">diferença</span>
            <span className={cn('font-semibold', !resumo.n ? 'text-muted-foreground' : Math.abs(resumo.diferenca) < 0.005 ? 'text-emerald-600' : 'text-amber-600')}
              data-testid="selecionados-diferenca">{resumo.n ? fmtBRL(resumo.diferenca) : '—'}</span></span>
          <button type="button" disabled={!podeCasarSelecionados} onClick={() => onCasarSelecionados?.([...marcados.values()])} data-testid="casar-selecionados"
            title={podeCasarSelecionados ? 'Abre o "Casar com o banco" com os marcados: lá se ajusta o valor de um ou mais para bater com o extrato.' : 'Marque um ou mais lançamentos nas listas.'}
            className={cn('ml-auto h-[26px] shrink-0 whitespace-nowrap rounded px-3 font-medium',
              podeCasarSelecionados ? 'bg-[#E7C873] text-foreground hover:bg-[#D9B95F]' : 'cursor-not-allowed bg-muted text-muted-foreground')}>
            Casar selecionados
          </button>
        </div>
      </DialogContent>
      <DetalheDaSugestao alvo={detalhe?.alvo ?? null} clienteId={clienteId} onFechar={() => setDetalhe(null)}
        onCasar={detalhe?.casar ? () => { const f = detalhe.casar; setDetalhe(null); f?.(); } : undefined} />
    </Dialog>
  );
}
