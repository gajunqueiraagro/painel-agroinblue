/**
 * VendaModalShell — a Venda como Operação Comercial. Aba de identificação.
 *
 * ⚠ PRIMEIRA DE SEIS. Este arquivo entrega SO a aba "Venda". Negociação, Entrega,
 * Documentos, Financeiro e Auditoria vêm uma por vez. São seis, e não sete: o boitel
 * NÃO ganha aba própria — ele é a Negociação com campos a mais. Ver a nota em
 * `ABAS_VENDA`.
 *
 * ⚠ DIVIDA DECLARADA: QUINTA CASCA DO SISTEMA, SEGUNDA COM FAIXA DE ABAS.
 * As outras quatro são CompraModalShell, LancamentoModalEnvelope (Nascimento e Morte),
 * CompraMetaModalShell e VendaMetaModalShell. Esta nasce irmã do CompraModalShell, e não
 * como parametrização dele, por uma razão de MOMENTO e não de mérito: as cinco abas
 * restantes é que vão dizer o que é comum entre compra e venda, e parametrizar agora
 * seria desenhar a junta antes de conhecer as duas peças.
 *
 * ⚠ O GATILHO DA EXTRACAO, escrito para não se perder:
 * quando as seis abas da venda estiverem prontas, medir linha a linha o que ficou
 * IDENTICO ao CompraModalShell e extrair pelo mesmo método do envelope — move verbatim,
 * com md5 antes e depois. O precedente é PR-ZOO-META-COMPRA-EDICAO-01 / o envelope de
 * PR-ZOO-VENDA-META-01: a extração saiu na TERCEIRA cópia, depois de a duplicação ser
 * medida, e deu certo porque quando saiu já se sabia o que era comum.
 *
 * ⚠ NAO COPIEI O QUE A VENDA NAO USA. Ficaram de fora `compraDetalhes`,
 * `CompraLotesApi`, `CompraPermissoesPorEixo`, o diálogo de detalhes e os gates por eixo
 * — nenhum deles tem consumidor nesta aba. Entram quando a aba que precisar deles chegar.
 */
import { useState, useMemo, useEffect } from 'react';
import { useStatusPilares } from '@/hooks/useStatusPilares';
import { GestoDeOperacao } from '@/components/financeiro-v2/GestoDeOperacao';
import {
  ACESSO_TOTAL, MOTIVO_ABATE_BOITEL, MOTIVO_GADO, MOTIVO_SEM_CAPACIDADE, motivoFisicoTravado, motivoReabrirTravado, ocTemGadoMovido,
  type AcessoOperacao,
} from '@/v2/lib/acessoOperacao';
import { ReabrirP1Dialog } from '@/components/ReabrirP1Dialog';
import { ReabrirMesNaOC } from '@/components/operacao-comercial/ReabrirMesNaOC';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { DatePicker } from '@/components/ui/date-picker';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Calendar, Building2, X, Plus, ArrowRight, Check, RotateCcw, Lock } from 'lucide-react';
import type { Categoria } from '@/types/cattle';
import type { CompraLotesApi } from '@/hooks/useCompraLotes';
import { AbaNegociacaoLotes, type ExclusaoLoteOC } from '@/components/compra/AbaNegociacaoLotes';
import { AbaDocumentosOC } from '@/components/compra/AbaDocumentosOC';
import { AbaAuditoriaOC } from '@/components/compra/AbaAuditoriaOC';
import { AbaRecebimentoLotes } from '@/components/compra/AbaRecebimentoLotes';
import { AbaFinanceiroOC } from '@/components/compra/AbaFinanceiroOC';
import { useOcCompromissos } from '@/hooks/useOcCompromissos';
import { useOcContaCorrente } from '@/hooks/useOcContaCorrente';
import { CancelarContaCorrenteDialog } from '@/components/venda/CancelarContaCorrenteDialog';
import { corDoSaldo, COR_SINAL } from '@/lib/oc/contaCorrente';
import { linhasPainelBoitel, linhaIdentificacaoBoitel, entregaEmUmaLinha, classeDaCorPainel } from '@/components/venda/painelBoitel';
import type { ReactNode } from 'react';
import type { LinhaPrevisao, RotulosCompromissos } from '@/components/compra/AbaCompromissosOC';
import type { RecebimentoApi } from '@/hooks/useOperacaoRecebimento';
import type { DocumentosApi } from '@/hooks/useOperacaoDocumentos';
import type { EventosApi } from '@/hooks/useOperacaoEventos';
import type { LiquidacaoApi } from '@/hooks/useOperacaoLiquidacao';
import { BoitelTopoNegociacao, bolsoDaVendaBoitel, unitariosDoLiquido, derivadosBoitel, PilulaCenario, valorDaVendaBoitel, avisoAcertoDivergente, valorDoLoteBoitel, slotDaVendaBoitel, COMO_RESOLVER_DIVERGENCIA_CURTO } from '@/components/venda/BoitelNegociacaoDerivado';
import { BoitelBlocosModais, BoitelAnaliseFaixa, faltamDosCinco, type BoitelEdicao } from '@/components/venda/BoitelBlocosModais';
import { linhasPrevisaoBoitel, avisoBoitelProdutor, propostasBoitelProdutor } from '@/components/venda/previsaoBoitel';
import { pesoMedioPorCabeca } from '@/hooks/useCompraLotes';
import { LinhaResumo, AsideResumo, FaixaTituloResumo, SecaoResumo } from '@/components/ui/linha-resumo';
import { consolidarRecebimento } from '@/components/compra/ResumoLateralOC';
import { formatMoeda } from '@/lib/calculos/formatters';

/* ⚠ "RECEBIMENTO" CHAMA-SE ENTREGA NA VENDA — o gado SAI. A coluna do banco já é
   genérica (`entrega_encerrada`), então o vocabulário muda só na tela.
   ⚠ NAO HA SETIMA ABA. O boitel chegou a ter uma e ela saiu: o boitel E' a negociacao,
   com campos a mais. Quantidade, peso, preco por arroba e valor total sao exatamente o
   que a Negociacao pergunta — uma aba separada deixaria a Negociacao vazia numa venda
   boitel, ou duplicada.
   ⚠ ONDE ELE FICOU: a aba de Negociacao BIFURCA por tipo de venda — lotes na venda
   comum, lotes MAIS a base operacional e o painel de resultado no boitel. Mesmo padrao
   do `AbaRecebimentoLotes`, ja bifurcado entre encerrado e aberto. Feito em
   PR-OC-VENDA-BOITEL-01A; a ENTRADA de dado do boitel e' do 01B. */
/* ⚠ AS TRES DEPENDEM DE HAVER OPERACAO — PR-OC-VENDA-ABAS-01. Documentos, Financeiro e
   Auditoria falam de algo que so' existe depois de salvar: sem `operacao_id` nao ha
   documento a anexar, obrigacao a listar nem evento a mostrar. Ficam travadas com o
   porque no `title`, em vez de abrirem vazias e deixarem o operador descobrir sozinho.
   ⚠ ENTREGA CONTINUA FALSA em qualquer estado: ela e' a saida do rebanho e tem PR proprio.
   Prometer a aba antes disso seria o alarme falso que este modal ja evitou no botao. */
function abasDaVenda(temOperacao: boolean) {
  const semOperacao = 'Salve a operação na aba Venda primeiro';
  return [
    { key: 'venda',        label: 'Venda',        enabled: true,        motivo: undefined },
    { key: 'negociacao',   label: 'Negociação',   enabled: true,        motivo: undefined },
    { key: 'entrega',      label: 'Entrega',      enabled: temOperacao, motivo: temOperacao ? undefined : semOperacao },
    { key: 'documentos',   label: 'Documentos',   enabled: temOperacao, motivo: temOperacao ? undefined : semOperacao },
    { key: 'financeiro',   label: 'Financeiro',   enabled: temOperacao, motivo: temOperacao ? undefined : semOperacao },
    { key: 'auditoria',    label: 'Auditoria',    enabled: temOperacao, motivo: temOperacao ? undefined : semOperacao },
  ];
}

/* ─── A REGRA DO BOTAO QUE EXPLICA — PR-OC-VENDA-ANALISE-02 (B-09 item 1c) ─────
   ⚠ REGRA NOVA, E VALE PARA TODA A OPERACAO COMERCIAL: botao desabilitado SEMPRE diz por
   que. Um botao cinza sem motivo transfere ao operador o trabalho de adivinhar qual das
   cinco condicoes o travou — e quem adivinha erra, tenta de novo e desconfia da tela.
   ⚠ O `title` NAO BASTA, e e' o defeito que esta peca conserta: ele exige passar o mouse e
   esperar, some no toque e nao existe para leitor de tela quando o botao esta' `disabled`.
   A dica fica ESCRITA ao lado, e o `title` continua para quem quiser o texto longo.
   ⚠ 10px E O PISO do PADROES-UI, e aqui ele vale sem excecao: esta linha carrega
   informacao que NAO existe em nenhum outro lugar da tela — nao e' apoio a um numero
   visivel, como as ajudas de 9px do `CampoNum`.
   ⚠ SO' APARECE COM MOTIVO. Botao habilitado nao ganha linha vazia, e botao desabilitado
   sem motivo declarado e' defeito de quem o escreveu — nao de quem o le. */
/* OC-EDITAR-CADASTRAL-01 — o idioma de campo travado da casa (`CompraModalShell`, `MorteModalShell`): com a OC
   fechada o que mexe em valor, quantidade, data ou competencia ja' nasce assim, e o motivo mora no selo do titulo. */
const CAMPO_TRAVADO = 'bg-muted border-border/60 text-muted-foreground';

function DicaBotao({ texto, erro }: { texto: string | null | undefined; erro?: boolean }) {
  if (!texto) return null;
  return (
    <span className={`text-[10px] leading-snug max-w-[15rem] text-right ${erro ? 'font-medium text-red-200' : 'font-normal text-white/80'}`}>
      {texto}
    </span>
  );
}

export interface VendaModalShellProps {
  data: string;
  setData: (v: string) => void;
  /** O COMPRADOR. Contraparte da operação — `contraparte_id` na OC. */
  compradorId: string;
  setCompradorId: (v: string) => void;
  contrapartes: { id: string; nome: string }[];
  onNovoComprador: () => void;
  /** ⚠ A fazenda de ORIGEM: o gado sai dela. */
  vendaFazendaId: string;
  setVendaFazendaId: (v: string) => void;
  fazendasOC: { id: string; nome: string }[];
  /** Texto livre — a propriedade de quem compra, quando se sabe. */
  propriedadeDestino: string;
  setPropriedadeDestino: (v: string) => void;
  vendaTipoVenda: string;
  setVendaTipoVenda: (v: string) => void;
  observacao: string;
  setObservacao: (v: string) => void;
  ocOperacaoId: string | null;
  /** A versão da operação e seu setter — o pai é dono único (OC-VERSAO-FONTE-UNICA-01). */
  ocVersao?: number | null;
  /* ⚠ ADITIVO — [OC-EXCLUIR-LOTE] (128). Montado no `LancamentosTab`; o shell só repassa. */
  exclusaoLoteOC?: ExclusaoLoteOC | null;
  /* ⚠ ADITIVO — [OC-EDITAR-LOTE-FECHADA] (128b). O modal do lote de uma OC fechada oferece
     "Reabrir e editar"; quem sabe reabrir é o `LancamentosTab`. */
  onReabrirLoteParaEditar?: ((motivo: string) => Promise<boolean>) | null;
  /** ACESSOS-OC-03a — o que ESTA PESSOA pode na operacao, lido pelo hospedeiro (`useAcessoOperacao`). Ausente = tudo, como antes. */
  acessoOC?: AcessoOperacao;
  onOcVersaoChange?: (v: number) => void;
  ocStatusComercial: string | null;
  /** Lotes da negociação — o mesmo hook da compra, que opera sobre `zoo_operacao_lotes`. */
  lotesApi?: CompraLotesApi;
  /** O planejamento do boitel EM MEMORIA. Os quatro modais o editam; quem persiste e' o
   *  botao da venda, numa chamada so' a `oc_salvar_boitel` — PR-OC-VENDA-BOITEL-01B. */
  boitelData?: BoitelEdicao | null;
  onBoitelChange?: (proximo: BoitelEdicao) => void;
  /* ─── O SEGUNDO MUNDO — PR-OC-VENDA-REALIZADO-02 ─────────────────────────────
     `boitelReal` e' a linha `cenario='realizado'`; `null` ate' o abate acontecer.
     `onIniciarRealizado` reabre a OC quando preciso e diz se pode seguir — o guard de
     `fechada` e' resolvido ANTES de o dialogo abrir. */
  boitelReal?: BoitelEdicao | null;
  onAplicarRealizado?: (proximo: BoitelEdicao) => void | Promise<void>;
  onIniciarRealizado?: () => Promise<boolean>;
  /* ─── RASCUNHO x SALVO — OC-BOITEL-REALIZADO-UX-01 ──────────────────────────
     `boitelReal` e' o RASCUNHO: o Aplicar de cada bloco so' o altera na memoria, e ele
     alimenta o cartao e os dialogos. `boitelRealSalvo` e' a linha como o banco a tem, e
     e' ela que o resumo, a previsao, o topo e a analise leem — um rascunho nao pode virar
     "a receber" nem valor da operacao antes de o Salvar passar. */
  boitelRealSalvo?: BoitelEdicao | null;
  /** O que falta no rascunho do realizado, com bloco e campo. Trava o Salvar e o Concluir. */
  pendenciaRealizado?: string | null;
  /** A recusa do banco ao gravar o realizado — escrita ao lado do Salvar, nunca em toast. */
  erroRealizado?: string | null;
  categoria: string;
  categoriasDisponiveis: { value: string; label: string }[];
  quantidadeNum: number;
  pesoKgNum: number;
  submitting: boolean;
  /* ⚠ DEVOLVE O QUE GRAVOU, e por isso nao e' `() => void`: o botao promete "continuar
     para Negociacao" e so' pode continuar se souber que a gravacao deu certo. Falsy = nao
     gravou, e a aba nao muda. */
  onSalvarOperacao: () => void | Promise<unknown>;
  /* ⚠ O RODAPE MUDA DE FUNCAO CONFORME A ABA. Na Venda ele grava a operacao; na
     Negociacao grava os lotes (e o planejamento do boitel, quando houver). Um botao so',
     duas acoes, porque e' sempre "salvar o que esta' na tela" — e e' o mesmo desenho do
     CompraModalShell, cujo rodape de Negociacao chama `lotesApi.salvar()`. */
  onSalvarNegociacao: () => void | Promise<unknown>;
  /** OC-VENDA-ENTREGAS-01c — cancelar a venda em CONTA CORRENTE; devolve o texto da recusa (ou null) para o dialogo. */
  onCancelarContaCorrente?: (motivo: string) => Promise<string | null>;
  /* As tres apis da OC, as MESMAS que a compra usa. A venda as monta; nao as edita. */
  documentosApi?: DocumentosApi;
  eventosApi?: EventosApi;
  liquidacaoApi?: LiquidacaoApi;
  recebimentoApi?: RecebimentoApi;
  ocEntregaEncerrada?: boolean;
  /** Nada mudou desde a ultima gravacao bem-sucedida — o botao apaga. */
  semAlteracoes?: boolean;
  /** `oc_confirmar` pelo `useOperacaoRecebimento`. Devolve se concluiu. */
  /** Recebe a versão fresca do salvar — `oc_confirmar` tem lock otimista. */
  onConcluirNegociacao?: (versaoOverride?: number) => void | Promise<unknown>;
  /** `oc_reabrir` — devolve a operacao a 'programada'. O motivo vai para a auditoria. */
  onReabrirNegociacao?: (motivo: string) => void | Promise<unknown>;
  onFechar: () => void;
  /** OC-EDITAR-CADASTRAL-01 — a recusa do Salvar, escrita ao lado dele (UX-TOAST-01). */
  erroSalvar?: string | null;
  /**
   * A ABA EM QUE A OC ABRE — `?oc_aba` (OC-RECLASSIFICAR-ITEM-01). So' a compra a honrava: a venda e o abate abriam
   * sempre na primeira aba, e a volta do drill do Financeiro caia na identificacao em vez da aba Financeiro de onde o
   * operador saiu. Valor fora das abas deste shell cai na de sempre.
   */
  abaInicial?: string | null;
}


const MESES_EXTENSO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function VendaModalShell({
  data, setData, compradorId, setCompradorId, contrapartes, onNovoComprador,
  vendaFazendaId, setVendaFazendaId, fazendasOC,
  propriedadeDestino, setPropriedadeDestino,
  vendaTipoVenda, setVendaTipoVenda, observacao, setObservacao,
  ocOperacaoId, ocVersao, onOcVersaoChange, ocStatusComercial, lotesApi, exclusaoLoteOC = null,
  onReabrirLoteParaEditar = null, boitelData = null, onBoitelChange,
  boitelReal = null, onAplicarRealizado, onIniciarRealizado,
  boitelRealSalvo = null, pendenciaRealizado = null, erroRealizado = null,
  documentosApi, eventosApi, liquidacaoApi, recebimentoApi, ocEntregaEncerrada = false,
  categoria, categoriasDisponiveis,
  quantidadeNum, pesoKgNum, submitting, onSalvarOperacao, onSalvarNegociacao, onCancelarContaCorrente, semAlteracoes = false,
  onConcluirNegociacao, onReabrirNegociacao, onFechar, erroSalvar = null, abaInicial = null, acessoOC = ACESSO_TOTAL,
}: VendaModalShellProps) {
  /* A lista de fazendas no formato do combobox — FAZ-ATIVIDADE-01c. Deriva de `fazendasOC`, que já
     carrega a regra de quem pode receber lançamento; o formato da opção não redecide isso. */
  const opcoesFazenda = useMemo(() => fazendasOC.map(f => ({ value: f.id, label: f.nome })), [fazendasOC]);

  const [abaAtiva, setAbaAtiva] = useState<string>(
    abaInicial && ['negociacao', 'entrega', 'documentos', 'financeiro', 'auditoria'].includes(abaInicial) ? abaInicial : 'venda');
  /* PR-OC-VENDA-REABRIR-NEG-01 — o dialogo de reabertura. Estado local: e' um gesto da
     tela, nao da operacao. */
  const [reabrirAberto, setReabrirAberto] = useState(false);
  const [reabrirP1Aberto, setReabrirP1Aberto] = useState(false);
  const [ofereceGerarCompromissos, setOfereceGerarCompromissos] = useState(false);
  const [motivoReabrir, setMotivoReabrir] = useState('');
  /* FIN-V2-CANCEL-MOTIVO-01 (b) — o motivo da REABERTURA desta sessao da OC vira SUGESTAO no
     "Atualizar compromisso" (editavel, marcado em ambar). Nao funde as duas perguntas: entre elas
     o operador edita o lote, e sao duas decisoes. Zera ao trocar de OC. */
  const [motivoReaberturaSessao, setMotivoReaberturaSessao] = useState<string | null>(null);
  useEffect(() => { setMotivoReaberturaSessao(null); }, [ocOperacaoId]);
  const compradorNome = contrapartes.find(f => f.id === compradorId)?.nome ?? null;
  const fazendaNome = fazendasOC.find(f => f.id === vendaFazendaId)?.nome ?? null;

  /* ⚠ O DADO PERSISTE NA TROCA DE TIPO, e isso nao mudou com a saida da aba: nenhum
     campo e' limpo quando o operador troca o tipo de venda. O que era guardado continua
     guardado — muda apenas ONDE vai aparecer, e sera' dentro da Negociacao. */

  const fazendaFalta = !vendaFazendaId;
  /* OC-EDITAR-CADASTRAL-01 — com a OC FECHADA so' os cadastrais se editam (comprador, observacoes, NF, documentos);
     data, fazenda, tipo de venda, lotes e boitel ficam travados, e cancelada trava tudo. O Salvar da aba Venda
     grava pelo `oc_editar_dados_operacao` e so' precisa do comprador: o tipo de venda nao e' gravado na OC, e a
     venda comum reabre sem ele — exigi-lo aqui prenderia o comprador atras de um campo travado. */
  const fechada = ocStatusComercial === 'fechada';
  const operacionalTravado = fechada || ocStatusComercial === 'cancelada';
  const identificacaoPronta = fechada
    ? !!compradorId
    : !!compradorId && !!vendaFazendaId && !!data && !!vendaTipoVenda;

  /* ⚠ A BIFURCACAO DA NEGOCIACAO, de PR-OC-VENDA-BOITEL-01A. O boitel NAO tem aba
     propria: ele e' a Negociacao com mais coisa. Venda comum mostra os lotes como
     sempre; venda boitel mostra os MESMOS lotes mais a base operacional e o painel de
     resultado. O elemento dos lotes e' construido UMA VEZ e usado nos dois ramos — os
     dois ramos com a mesma lista de props seria a mesma armadilha que fez o `brl`
     chegar a seis copias. */
  const ehBoitel = vendaTipoVenda === 'boitel';
  /* ACESSOS-OC-03a — O COMBINADO x O QUE ACONTECEU. A capacidade vem do hospedeiro; o fato ("houve gado movido?") sai das
     movimentacoes ja' carregadas, pela funcao do dono. Aqui so' se combinam os dois; nenhum `if` de perfil.
     ⚠ BOITEL: ate' o 03b a Negociacao INTEIRA fica so' leitura para quem nao tem 'negociar_abate_boitel'. */
  const gadoMovido = ocTemGadoMovido(recebimentoApi?.movimentacoes);
  const motivoFisicoAcesso = motivoFisicoTravado(acessoOC, gadoMovido);
  const motivoReabrirAcesso = motivoReabrirTravado(acessoOC, gadoMovido);
  const motivoGado = acessoOC.movimentar_gado ? null : MOTIVO_GADO;
  const motivoBoitelAcesso = ehBoitel && !acessoOC.negociar_abate_boitel ? MOTIVO_ABATE_BOITEL : null;
  const motivoLancarRealizado = motivoBoitelAcesso ?? (acessoOC.lancar_realizado_boitel ? null : MOTIVO_GADO);

  /* ⚠ A REGRA NAO E DAQUI. `faltamDosCinco` espelha a lista de `oc_salvar_boitel` para o
     botao poder impedir ANTES da chamada — a licao de 45a7352b, onde o operador so'
     descobria o impedimento no fim. Se as duas divergirem, quem manda e' a RPC, e o texto
     que o operador veria seria o dela. */
  /* ─── O VALOR DA OPERACAO E' O SLOT — OC-BOITEL-VALOR-01 A3 ─────────────────────
     `zoo_operacao_lotes.valor_informado` somado, lido de `useCompraLotes` (a mesma fonte do card
     do lote). Resumo, LoteDialog e a previsao principal leem DAQUI; a projecao e o acerto sao
     calculados so' para conferencia. Ver `valorDaVendaBoitel`.
     ⚠ SOMA ZERO E' SLOT VAZIO, nao valor: `totais.valorNegociado` soma 0 para lote sem
     `valor_informado`, e uma venda boitel nao vale zero — vale "ainda nao gravado". */
  const slotBoitel = slotDaVendaBoitel(lotesApi?.totais);
  const vendaBoitel = ehBoitel
    ? valorDaVendaBoitel({ slot: slotBoitel, realizado: boitelRealSalvo, projetado: boitelData ?? null })
    : null;
  const avisoDivergencia = vendaBoitel?.divergente && vendaBoitel.acerto != null
    ? avisoAcertoDivergente(vendaBoitel.acerto) : null;

  /* A previsao mora em `previsaoBoitel.ts` (movida no BOITEL-ABATE-PRODUTOR-01) — ver o comentario la'. */
  const linhasPrevisao = useMemo<LinhaPrevisao[] | undefined>(() => (ehBoitel
    ? linhasPrevisaoBoitel({ boitelData: boitelData ?? null, boitelRealSalvo, compradorId, data, lotes: lotesApi?.lotes ?? [], vendaBoitel })
    : undefined),
  [ehBoitel, boitelData, boitelRealSalvo, compradorId, data, lotesApi?.lotes, vendaBoitel?.valor, vendaBoitel?.divergente]);
  /* BOITEL-ABATE-PRODUTOR-01c: na B o "Gerar compromissos" le as MESMAS linhas (acerto + frigorifico); na A, `undefined`. */
  const propostasDoMotor = useMemo(() => (ehBoitel
    ? propostasBoitelProdutor({ boitelData: boitelData ?? null, boitelRealSalvo, compradorId, data, lotes: lotesApi?.lotes ?? [], vendaBoitel })
    : undefined),
  [ehBoitel, boitelData, boitelRealSalvo, compradorId, data, lotesApi?.lotes, vendaBoitel?.valor, vendaBoitel?.divergente]);

  /* ⚠ O VOCABULARIO DA COMPRA NO RODAPE DO RESUMO. `AbaCompromissosOC` escrevia
     "Compra {data} · Chegada {data}" literalmente — numa venda de 13/05 o grupo dizia
     "Compra 13/05/2026". O dicionario e' ADITIVO: sem ele a compra fica identica.
     ⚠ `dataChegada: null` PORQUE A VENDA NAO TEM CHEGADA. Nao e' dado que falta: o gado
     SAI, e o shell nem passa a prop. Com null a linha inteira nao e' renderizada, em vez
     de exibir "—" como se houvesse uma data por descobrir.
     ⚠ `mostrarBaseDaOperacao: false` PELO MESMO MOTIVO, um nivel acima — PR-...-01D. As
     caixas "OC (acordado)" e "Restante OC" do dialogo de programacao comparam o valor
     acordado com a soma de TODAS as obrigacoes; numa venda boitel essa soma tem duas
     entradas e duas saidas, e a subtracao deu -204.132,08 na homologacao. Nao e' saldo,
     e' residuo. Decisao do Gabriel: somem. Ver a nota em `RotulosCompromissos`. */
  const rotulosCompromissos = useMemo<RotulosCompromissos>(
    () => ({
      dataOperacao: 'Venda', dataChegada: null,
      mostrarBaseDaOperacao: false,
      /* ⚠ SO' A VENDA TEM DOIS LADOS. As quatro linhas da previsao sao duas entradas e
         duas saidas, e sem o sinal os quatro valores se leem iguais. Na compra o sinal
         seria uniforme — ver a nota em `RotulosCompromissos`. */
      mostrarSentidoDoDinheiro: true,
    }), [],
  );

  /* ⚠ O BOLSO PROJETADO — B-04. UMA chamada, e o topo e o R$/kg saem dela: derivar duas
     vezes seria abrir a porta para os dois numeros do cabecalho discordarem entre si, que
     e' a versao pequena do defeito que este PR conserta. Ver `bolsoDaVendaBoitel`. */
  const bolsoProjetado = ehBoitel ? bolsoDaVendaBoitel(boitelData) : null;
  /* ⚠ O MELHOR CONHECIMENTO — 02H item K. `bolsoDaVendaBoitel` ja e' guardada por
     `exigencias`: nao-nulo E' a definicao operacional de "realizado completo". Nulo — sem
     linha realizada, ou com ela pela metade — e o cabecalho segue na projecao ambar.
     ⚠ UMA CHAMADA, e ela alimenta os tres: o cenario do topo, os dois numeros do topo e a
     cascata gemea. Derivar de novo abriria a porta para o cabecalho dizer "realizado" e o
     numero ao lado ainda ser o projetado. */
  const bolsoRealizado = ehBoitel ? bolsoDaVendaBoitel(boitelRealSalvo) : null;
  /* O bloco Entrega do resumo lateral — MESMO helper da compra, nao uma segunda soma. */
  const entrega = consolidarRecebimento(recebimentoApi?.lotes ?? null);

  /* ─── O FINANCEIRO DO RESUMO LATERAL — B-10 item 4 ───────────────────────────
     ⚠ O HOOK SUBIU PARA CA, e desce por prop para a `AbaFinanceiroOC`. Ele vivia so'
     dentro da aba; o resumo lateral precisa dos MESMOS totais, e montar uma segunda
     instancia daria duas leituras das mesmas tres views para a mesma operacao. Subir, e
     nao duplicar — a licao que os catalogos do `AbaCompromissosOC` ja tinham dado.
     ⚠ AS TRES FORMULAS, e a razao de cada uma:
        A receber = entrada_obrigacao − entrada_liquidado
          O que ainda vem. Sai da OBRIGACAO, e nao do programado: obrigacao e' o que foi
          acordado receber; programado e' so' a parte que ja ganhou data. Descontar o que
          ja entrou e' o que transforma "quanto vou receber" em "quanto FALTA receber".
        Recebido  = entrada_liquidado
          Dinheiro que passou. Liquidado, nunca materializado: materializar e' emitir o
          titulo, e titulo emitido nao e' dinheiro na conta.
        Saldo     = liquido do NIVEL VIGENTE (entrada − saida), pela mesma precedencia da
          Central (liquidado > lancado > programado > obrigacao). E' o que sobra da
          operacao inteira, dos dois lados — numa venda boitel as saidas existem e sao
          reais (adiantamento, frete, taxas), e ignora-las diria que a venda rende mais do
          que rende.
     ⚠ O SALDO NAO E "A receber − Recebido". Esse seria o saldo das ENTRADAS, e a linha
     ficaria igual a primeira sempre que nada tivesse sido recebido — tres linhas para
     duas informacoes. O saldo responde outra pergunta: quanto a operacao deixa. */
  /* ⚠ A VERSÃO VEM DO PAI — OC-VERSAO-FONTE-UNICA-01, e este era o componente
     onde as duas fontes coexistiam: `CompraLotesApi` e `RecebimentoApi` chegam
     por prop, já ligados ao `ocVersao` do pai, enquanto o hook de compromissos
     guardava a própria. Mexer na aba Compromissos incrementava a versão da
     operação e deixava a do pai para trás — o save seguinte batia em 40001, e só
     o F5 resolvia. Agora as três leem e escrevem o mesmo estado. */
  const ocCompromissosApi = useOcCompromissos({
    operacaoId: ocOperacaoId ?? null,
    clienteId: liquidacaoApi?.clienteId ?? null,
    enabled: !!ocOperacaoId && !!liquidacaoApi?.clienteId,
    versao: ocVersao ?? null,
    onVersaoChange: onOcVersaoChange ?? (() => {}),
  });
  /* OC-VENDA-ENTREGAS-01c — a CONTA CORRENTE tambem sobe para ca, pela mesma razao: o resumo lateral e o cancelar leem os
     numeros que a aba Financeiro mostra. Uma instancia, descendo por prop (`ccApiExterno`). */
  const ccApi = useOcContaCorrente({
    operacaoId: ocOperacaoId ?? null,
    enabled: !!ocOperacaoId,
    versao: ocVersao ?? null,
    onVersaoChange: onOcVersaoChange ?? (() => {}),
    /* OC-VENDA-ENTREGAS-01d (A2): ajuste de preco revalora o lote; sem reler, o "Valor acordado" seguia no lote de antes. */
    aoMudarLotes: lotesApi?.recarregar,
  });
  const cc = ccApi.contaCorrente?.modelo === 'conta_corrente' ? ccApi.contaCorrente : null;
  const [cancelarCcAberto, setCancelarCcAberto] = useState(false);
  const fin = ocCompromissosApi.resumoOperacao;
  const temFin = !!fin && fin.temCompromissos;
  const finAReceber = temFin ? fin.entradaObrigacao - fin.entradaLiquidado : null;
  const finRecebido = temFin ? fin.entradaLiquidado : null;
  const finSaldo = !temFin ? null
    : fin.totalLiquidado > 0 ? fin.entradaLiquidado - fin.saidaLiquidado
    : fin.totalMaterializado > 0 ? fin.entradaMaterializado - fin.saidaMaterializado
    : fin.totalProgramado > 0 ? fin.entradaProgramado - fin.saidaProgramado
    : fin.entradaObrigacao - fin.saidaObrigacao;
  const topoNoRealizado = bolsoRealizado != null;

  /* ─── O RESUMO SEGUE O MELHOR CONHECIMENTO — B-11 item 1 ─────────────────────
     ⚠ MESMA REGRA DO TOPO (02H item K): com realizado completo, o valor mostrado e' o
     REAL, solido e sem pilula; sem ele, e' a projecao, ambar e marcada. A regra e' uma so'
     na tela inteira — cabecalho, faixa de analise e resumo respondem igual.
     ⚠ E ELE DERIVA, EM VEZ DE LER O SLOT GRAVADO — e isso o torna IMUNE ao rebaixamento
     medido nesta sessao (ver o relatorio do B-11): mesmo com o lote rebaixado pelo
     re-save, o resumo mostra o valor que a linha realizada produz. Nao e' contorno da
     regressao — e' a doutrina dos dois mundos aplicada: o valor oficial mora no lote, e a
     projecao/realizado se DERIVAM das suas linhas.
     ⚠ SO' NO BOITEL. Numa venda comum nao ha dois mundos: o acordado e' o acordado, e uma
     pilula "projecao" ali marcaria como promessa um numero que e' fato. */
  const derAcerto = ehBoitel ? derivadosBoitel(topoNoRealizado ? (boitelRealSalvo ?? boitelData!) : boitelData!) : null;
  /* ⚠ NO BOITEL TAMBEM E' O SLOT — OC-BOITEL-VALOR-01 A3, e isto DESFAZ a escolha do B-11 descrita
     acima. Derivar da linha realizada tornava o resumo "imune ao rebaixamento" — e cego a ele: na
     8b211cae o resumo dizia 882.608,62 enquanto lote, `valor_acordado`, rebanho e o compromisso
     gerado tinham 848.713,32. A imunidade agora mora no banco (a trava da A2), e o resumo mostra
     o que esta' gravado; se o gravado nao e' o acerto, a linha ambar abaixo diz os dois. */
  const valorAcordadoMostrado = !ehBoitel
    ? (lotesApi && lotesApi.totais.lotes > 0 ? lotesApi.totais.valorNegociado : null)
    : (vendaBoitel?.valor ?? null);
  const corMundo = topoNoRealizado ? 'text-foreground' : 'text-[#854F0B] dark:text-amber-500';

  /* ─── O PAINEL DE BOITEL — PR-OC-BOITEL-PAINEL-01 ────────────────────────────────────────
     ⚠ AS LINHAS SAEM DE `linhasPainelBoitel`, termo a termo do motor: as parcelas `dAcerto*` (com as flags ja'
     aplicadas — custo do lado do produtor vale zero aqui e nao entra), o `saldoReceberBase` (o Pix), o
     `custosDoProdutor` e o `pParte` ate' o `bolsoDaVendaBoitel`. Nenhuma conta mora no resumo: ele desenha.
     ⚠ O BOLSO E' DOS MESMOS DADOS DOS TERMOS — o realizado salvo com o realizado completo, a projecao sem ele —, senao
     a escada fecharia contra um numero de outro mundo.
     ⚠ MODALIDADE B (BOITEL-ABATE-PRODUTOR-01): as tres linhas de sempre (`linhasResumoProdutor`, os mesmos numeros) e a
     cauda Gastos diretos · Liquido no bolso; sem "Financeiro" (divida registrada). */
  const dadosDoPainel = topoNoRealizado ? (boitelRealSalvo ?? boitelData) : boitelData;
  const painelBoitel = ehBoitel && derAcerto ? linhasPainelBoitel({
    termos: derAcerto,
    bolso: topoNoRealizado ? bolsoRealizado : bolsoProjetado,
    modalidade: dadosDoPainel?.quemAbate === 'produtor' ? 'produtor' : 'boitel',
    realizado: topoNoRealizado,
    noFinanceiro: temFin ? fin.entradaObrigacao : null,
  }) : null;
  const linhaIdentificacao = linhaIdentificacaoBoitel(
    data ? data.split('-').reverse().join('/') : null, fazendaNome ?? null, 'Boitel');

  const faltamBoitel = ehBoitel ? faltamDosCinco(boitelData) : [];
  const naNegociacao = abaAtiva === 'negociacao';
  /* ⚠ SALVAR SO ONDE HA O QUE SALVAR — PR-OC-VENDA-ENTREGA-01C. Nas outras quatro abas o
     rodape oferecia "Salvar alterações" aceso, e o operador procurou um salvar depois de
     registrar a saida — que ja tinha gravado na RPC, no ato. Um botao de salvar visivel
     AFIRMA que ha pendencia; nao havia. Pior: na Entrega ele chamaria o salvar da
     operacao, e depois de 'fechada' o `oc_salvar_lotes` recusa de qualquer forma.
     ⚠ ESCONDER, e nao desabilitar: botao apagado ainda diz "existe algo a salvar aqui,
     mas nao agora". Nas abas que gravam sozinhas, a resposta certa e' nao haver botao.
     Documentos, Financeiro, Entrega e Auditoria persistem por conta propria ou nao
     escrevem nada. */
  const rodapeTemSalvar = abaAtiva === 'venda' || naNegociacao;

  /* ⚠ O BOITEL SO TRAVA NA ABA ONDE ELE E EDITADO. Ate' aqui a trava valia no rodape
     inteiro, e o efeito era o oposto do pretendido: numa venda boitel o operador nao
     conseguia nem CRIAR a operacao, porque os cinco campos moram na aba de Negociacao —
     que so' existe depois da operacao criada. */
  const podeSalvar = naNegociacao
    ? !!ocOperacaoId && !fechada && faltamBoitel.length === 0 && !pendenciaRealizado && !motivoBoitelAcesso
    : identificacaoPronta;
  /* ⚠ NAO E' O MESMO QUE "NAO PODE": o botao pode estar apto e nao ter o que gravar. Por
     isso o motivo tem precedencia — quem NAO PODE precisa saber o que falta; quem so' nao
     tem alteracao precisa saber que ja' esta' salvo. */
  /* ⚠ O UNICO LUGAR QUE DECIDE SE O CONCLUIR TRAVA — e ele devolve o MOTIVO, nao um
     booleano. Assim `disabled`, `title` e a dica escrita saem todos da mesma frase: quando
     ha motivo o botao trava E diz; sem motivo, ele funciona. Nao da' para travar em
     silencio por construcao. */
  /**
   * O mês da data escolhida está fechado (P1 oficial) para a fazenda de origem?
   *
   * ⚠ MESMA FONTE DA TRIGGER (`get_status_pilares_fechamento` → `p1_mapa_pastos`), a que
   * `trg_guard_lancamento_mes_fechado_p1` consulta antes de recusar. Medido no abate
   * (`2d60bde2`): a recusa chegava só na gravação, com a operação inteira preenchida.
   */
  const anoMesDaData = data ? data.slice(0, 7) : undefined;
  const pilaresMes = useStatusPilares(vendaFazendaId || undefined, anoMesDaData,
    !!vendaFazendaId && !!anoMesDaData);
  const mesFechadoMotivo = pilaresMes.status.p1_mapa_pastos.status === 'oficial' && anoMesDaData
    ? `${MESES_EXTENSO[Number(anoMesDaData.slice(5, 7)) - 1]}/${anoMesDaData.slice(0, 4)} está fechado (P1) para ${fazendaNome ?? 'esta fazenda'}`
    : null;

  const concluirTravadoPor: string | null =
    motivoBoitelAcesso ? motivoBoitelAcesso
    : mesFechadoMotivo ? `${mesFechadoMotivo} — reabra o período`
    : pendenciaRealizado ? pendenciaRealizado
    : submitting ? 'salvando…'
    : recebimentoApi?.saving ? 'aguarde a entrega terminar'
    : null;
  /* OC-EDITAR-CADASTRAL-01 — o mes fechado (P1) trava o que e' OPERACIONAL; o Salvar da OC fechada grava so'
     cadastral, entao ele nao trava ali. A negociacao da OC fechada diz o caminho, sem esperar o clique. */
  const motivoNaoSalva = naNegociacao && motivoBoitelAcesso
    ? motivoBoitelAcesso
    : mesFechadoMotivo && !fechada
    ? `${mesFechadoMotivo} — reabra o período para lançar`
    : naNegociacao && fechada
    ? 'Operação fechada · reabra para editar'
    : naNegociacao
    ? (!ocOperacaoId ? 'Salve a operação na aba Venda primeiro'
       : faltamBoitel.length > 0 ? `Planejamento do boitel incompleto. Falta ${faltamBoitel.join(', ')}.`
       /* ⚠ UX-OBRIGATORIOS-01: com pendencia no realizado o Salvar NAO grava, e diz o bloco
          e o campo. Cada bloco ja' se valida no Aplicar; isto pega o bloco nunca aberto. */
       : pendenciaRealizado ?? undefined)
    : (identificacaoPronta ? undefined : fechada ? 'Selecione o comprador' : 'Informe comprador, data, fazenda e tipo de venda');
  /* Mesma regra aplicada ao Salvar — B-09 item 1c. O motivo ja existia no `title` desde
     sempre; o que faltava era ele estar ESCRITO ao lado.
     ⚠ `submitting` FICA DE FORA: ali o proprio rotulo do botao vira "Salvando...", e uma
     dica dizendo a mesma coisa seria ruido.
     ⚠ "Nada alterado" TAMBEM E MOTIVO, e talvez o mais importante: e' o unico caso em que
     o botao cinza significa "esta' tudo certo" — sem a frase, ele se le como falha. */
  const salvarTravadoPor: string | null =
    submitting ? null
    : ocStatusComercial === 'cancelada' ? 'operação cancelada'
    : motivoNaoSalva ?? (semAlteracoes ? 'nada alterado desde o último salvamento' : null);

  /* A MESMA ABA DA COMPRA, com quatro textos trocados por prop. O lote e' identico nos
     dois: categoria, quantidade, peso, criterio e valor. Nenhum rotulo de CAMPO muda — o
     lote nao e' comprado nem vendido na tela, ele e' descrito. Vale igual para o boitel:
     o que ele acrescenta fica FORA deste elemento, nao dentro dele. */
  const abaLotes = (
    <AbaNegociacaoLotes
      exclusaoOC={exclusaoLoteOC}
      onReabrirParaEditar={motivoBoitelAcesso ? null : onReabrirLoteParaEditar}
      acesso={{ motivoFisico: motivoFisicoAcesso, motivoReabrir: motivoReabrirAcesso, motivoSomenteLeitura: motivoBoitelAcesso }}
      /* A MESMA trava do fisico da compra (`fisicoBloqueado`), que a venda nao passava: aqui ela so' liga pelo ACESSO — para
         o gestor a venda segue como era (o banco trava quantidade e peso por lote com saida ativa). */
      fisicoBloqueado={!!motivoFisicoAcesso}
      categoria={categoria}
      categoriasDisponiveis={categoriasDisponiveis}
      quantidadeNum={quantidadeNum}
      pesoKgNum={pesoKgNum}
      darkSelectClass=""
      modoOC
      operacaoPronta={!!ocOperacaoId}
      lotesApi={lotesApi}
      somenteLeitura={operacionalTravado || !!motivoBoitelAcesso}
      onVoltarCompra={() => setAbaAtiva('venda')}
      /* ⚠ SO NA VENDA BOITEL. Numa venda comum e numa compra as duas props sao nulas e a
         grade e' exatamente a de antes: valor digitavel, criterio livre, quantos lotes
         quiser. */
      /* ⚠ COM O REALIZADO APLICADO O VALOR E' O DO ACERTO — OC-BOITEL-VALOR-01 A2. E' o
         numero que `oc_revalorar_lote` gravou no lote e que `oc_salvar_lotes` passou a
         preservar; mostrar a projecao aqui seria o dialogo discordando do "Valor acordado"
         do resumo lateral, que ja' le' o realizado. O switch e' o MESMO predicado do banco. */
      /* ⚠ E O VALOR MOSTRADO E' O SLOT — OC-BOITEL-VALOR-01 A3. Na A2 ele mostrava
         `liquidoDaVendaBoitel(boitelReal)`, uma conta, com a nota "derivado do acerto" — e na
         8b211cae a nota afirmava um numero que o lote gravado nao tinha. Agora o numero e' o
         gravado, e a divergencia vira aviso em vez de ser escondida. */
      valorProjetado={vendaBoitel ? valorDoLoteBoitel(vendaBoitel) : null}
      loteUnico={ehBoitel ? {
        motivo: 'Boitel é um embarque só: a operação comercial é o lote. Para negociar outro embarque, crie outra venda.',
      } : null}
      /* ⚠ SO' NA VENDA BOITEL — PR-OC-VENDA-LAYOUT-NEG-01B. A negociacao do boitel virou
         leitura: o lote se reduz a uma linha magra com o lapis. Ver a nota na prop. */
      linhaMagra={ehBoitel}
      rotulos={{
        salveIdentificacao: 'Salve a identificação da venda para adicionar os lotes da negociação.',
        voltarParaIdentificacao: 'Voltar para Venda',
        salveOperacaoPrimeiro: 'Salve a operação na aba Venda primeiro',
        fisicoBloqueado: 'Esta venda já teve entrega: quantidade e peso não mudam. Categoria, observação, critério e valor seguem editáveis.',
      }}
    />
  );

  return (
    /* ⚠ A CASCA DO ABATE — MODAIS-PADRAO-01b. Cabecalho 36, abas 20/10px, rodape 32 com botoes
       22/10px, e a altura mora AQUI (`100vh-32`), uma vez so': as tres faixas sao `shrink-0` e so'
       o corpo rola (A21). Antes a altura estava no corpo (`h-[69vh]`) e o resumo tinha 368px
       contra os 479 do Abate na mesma janela. Conteudo, textos e botoes sao os de antes. */
    <div className="flex flex-col h-[calc(100vh-32px)]">
      {/* CABECALHO — uma linha, na medida do Abate (era `px-6 py-2.5` em duas linhas, 63px). */}
      <div className="h-9 shrink-0 bg-primary text-primary-foreground px-4 flex items-center gap-3">
        <h2 className="shrink-0 text-[13px] font-semibold leading-none">Venda de animais</h2>
        {/* ⚠ MESMO TERNARIO DA COMPRA (CompraModalShell:300), palavra por palavra. Ele
            dizia "(novo)" para sempre — inclusive depois de salva, o que era mentira do
            rotulo: a operacao ja existia e o cabecalho negava. */}
        <span className="shrink-0 rounded-md border border-white/40 px-2 py-px text-[10px] leading-none">
          OC{ocOperacaoId ? ` #${ocOperacaoId.slice(0, 8)}` : ' (novo)'}
        </span>
        <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-[11px] text-white/85">
          <Calendar className="h-3 w-3 shrink-0" /> {data ? data.split('-').reverse().join('/') : '—'}
        </span>
        <span className="flex min-w-0 items-center gap-1 truncate whitespace-nowrap text-[11px] text-white/85">
          <Building2 className="h-3 w-3 shrink-0" /> {fazendaNome ?? '—'}
        </span>
        <button type="button" onClick={onFechar} className="ml-auto shrink-0 text-white/80 hover:text-white"
          title="Fechar" aria-label="Fechar"><X className="h-3.5 w-3.5" /></button>
      </div>

      {/* ⚠ O RESUMO VAI DO CABECALHO AO RODAPE, como no Abate: as abas moram DENTRO da coluna da
          esquerda. Por cima das duas colunas, elas tiravam a altura da barra do resumo. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_240px]">
        <div className="flex min-h-0 min-w-0 flex-col">
        {/* BARRA DE ABAS — a do Abate (botao 20px/10px, barra ~29px; era `px-6 py-3` com h-8 12px). */}
        <div className="shrink-0 bg-card border-b px-2 py-1 flex items-center gap-1">
          {abasDaVenda(!!ocOperacaoId).map(a => {
            const active = a.key === abaAtiva && a.enabled;
            return (
              <button key={a.key} type="button" disabled={!a.enabled}
                onClick={() => a.enabled && setAbaAtiva(a.key)}
                title={a.motivo}
                className={`h-5 px-[7px] rounded-md text-[10px] font-medium transition-colors ${
                  active ? 'bg-primary/10 text-primary'
                  : a.enabled ? 'text-muted-foreground hover:bg-muted/50'
                  : 'text-muted-foreground/40 cursor-not-allowed'}`}>
                {a.label}
              </button>
            );
          })}
        </div>
        <div className="min-h-0 min-w-0 flex-1 space-y-1.5 overflow-y-auto bg-muted/30 p-2">
          {/* ── ENTREGA ────────────────────────────────────────────────────────────
              ⚠ A MESMA GRADE DA COMPRA, com o vocabulario trocado por dicionario. O gesto
              e' o mesmo — dizer quantos animais de cada lote se moveram, em que dia —, e o
              que inverte e' o SENTIDO: na compra o gado entra, aqui ele sai do saldo.
              ⚠ `isCompra={false}` NAO E NOVIDADE: o componente ja' distinguia os dois para
              o campo de peso, que so' a compra pede. Ele foi escrito prevendo este dia.
              ⚠ SO O VERBO MUDA. Quantidade, data e categoria descrevem o mesmo fato nos
              dois lados, e por isso nenhum rotulo de CAMPO entra no dicionario. */}
          {abaAtiva === 'entrega' && recebimentoApi ? (
            <AbaRecebimentoLotes
              api={recebimentoApi}
              operacaoPronta={!!ocOperacaoId}
              concluida={ocStatusComercial === 'fechada'}
              encerrada={ocEntregaEncerrada}
              isCompra={false}
              /* OC-VENDA-ENTREGAS-01a — entrega por saida, com "Adotar saida ja lancada". So' a venda liga (D4a). */
              adocao={{ fazendaNome, contraparteNome: compradorNome }}
              categoriasDisponiveis={categoriasDisponiveis}
              documentosApi={documentosApi}
              /* ⚠ A DATA DA OPERACAO, e nao a de hoje: a saida pertence a' operacao. */
              dataOperacao={data}
              somenteLeitura={ocStatusComercial === 'cancelada' || !!motivoGado}
              motivoSomenteLeitura={motivoGado ?? undefined}
              onVoltarNegociacao={() => setAbaAtiva('negociacao')}
              rotulos={{
                /* ⚠ EIXO "SAIDA/ENVIAR", e nao "entrega/entregar" — decisao do Gabriel.
                   A ABA continua se chamando Entrega, e os motivos gravados no banco
                   continuam dizendo "aba Entrega": o nome do lugar nao muda, o verbo do
                   ato sim. Quem le a auditoria daqui a um ano precisa achar a aba. */
                tituloSecao: 'Saída dos animais da fazenda',
                tituloDialogo: (r) => `Enviar · ${r}`,
                jaMovimentado: 'já entregue',
                informeQuantidade: 'Informe a quantidade entregue',
                indisponivelTitulo: 'Entrega indisponível — negociação ainda não concluída',
                indisponivelDetalhe: 'Conclua a negociação (botão “Concluir negociação”) para registrar a entrega física.',
                movimentarTodos: 'Enviar todos conforme negociado',
                movimentarTodosTexto: 'Enviar todos conforme negociado',
                acaoLote: 'Enviar',
                acaoLoteAria: (cat) => `Enviar lote ${cat}`,
                rotuloTotalTopo: 'Saídas',
                avisoEncerrado: 'Saída encerrada. Use Reabrir entrega para registrar mais movimentações.',
                registrarDoLote: 'Registrar a saída deste lote',
                colunaData: 'Entrega',
                /* ⚠ TAMBEM "Saídas" no dialogo de encerrar, por coerencia com o topo — e'
                   o mesmo contador. Inferido do eixo aprovado, e nao pedido item a item. */
                rotuloTotal: 'Saídas',
                tituloEncerrar: 'Encerrar entrega',
                nenhumMovimentado: 'Nenhum animal foi entregue. Deseja encerrar esta entrega mesmo assim?',
                placeholderJustificativa: 'Justifique a diferença / ausência de entrega',
                tituloReabrir: 'Reabrir entrega',
                avisoReabrir: (<>Esta ação é <b>auditada</b>: reabre a entrega para novas saídas e fica registrada com o motivo informado. <b>Não</b> altera a negociação — se a operação estiver programada, a entrega seguirá indisponível até a negociação ser concluída.</>),
                motivoEncerrarPadrao: 'encerramento pela aba Entrega',
                motivoEstornoPadrao: 'estorno pela aba Entrega',
              }}
            />
          ) : (<>
          {/* ── DOCUMENTOS ─────────────────────────────────────────────────────────
              ⚠ A MESMA ABA DA COMPRA, com as MESMAS props. Ela e' generica de operacao —
              documento fiscal nao muda de natureza porque o gado entra ou sai.
              ⚠ FORNECEDORES DA `liquidacaoApi`, como na compra: fonte unica, sem segunda
              lista nem segundo cadastro. */}
          {abaAtiva === 'documentos' && documentosApi ? (
            <AbaDocumentosOC api={documentosApi} operacaoPronta={!!ocOperacaoId}
              somenteLeitura={ocStatusComercial === 'cancelada'}
              fornecedores={liquidacaoApi?.fornecedores}
              contraparteId={compradorId || null}
              clienteId={liquidacaoApi?.clienteId ?? null}
              /* Negociado = `valor_acordado` da operacao, a mesma ancora da compra. Nao e'
                 recalculado dos lotes: derivar de novo criaria uma segunda verdade. */
              valorNegociado={liquidacaoApi?.valorAcordado ?? null}
              recarregarFornecedores={liquidacaoApi?.recarregar} />
          ) : abaAtiva === 'auditoria' && eventosApi ? (
            /* ⚠ SO LEITURA e sem `somenteLeitura`: a aba nao escreve nada. */
            <AbaAuditoriaOC api={eventosApi} operacaoPronta={!!ocOperacaoId}
              fornecedores={liquidacaoApi?.fornecedores}
              lotes={documentosApi?.lotes} />
          ) : abaAtiva === 'financeiro' && liquidacaoApi ? (
            /* ⚠ A MESMA ABA DA COMPRA. Medido na FASE 0: ela e' tipo-agnostica por desenho
                — `planoTipo` vira '1-Entradas' numa venda, a descricao ja sai "Venda 110 G"
                pelo `verboOC`, e o filtro de centro de custo da compra se desliga sozinho.
                O vazio honesto sai: agora ha o que mostrar. */
            <AbaFinanceiroOC
              motivoReabertura={motivoReaberturaSessao}
              abrirGerarAoMontar={ofereceGerarCompromissos}
              api={liquidacaoApi}
              operacaoPronta={!!ocOperacaoId}
              darkSelectClass=""
              financeiroLegadoReadOnly={ocStatusComercial === 'cancelada'}
              financeiroNovoReadOnly={ocStatusComercial === 'cancelada'}
              motivoAtualizarEntregas={acessoOC.atualizar_entregas ? null : MOTIVO_SEM_CAPACIDADE}
              operacaoId={ocOperacaoId}
              clienteId={liquidacaoApi.clienteId ?? null}
              /* A instancia que o resumo lateral ja monta — uma leitura, dois consumidores. */
              ocApiExterno={ocCompromissosApi}
              ccApiExterno={ccApi}
              /* OC-VENDA-ENTREGAS-01b — a conta corrente escreve (entregas, recebimento) e encadeia a versao da OC. */
              ocVersao={ocVersao}
              onOcVersaoChange={onOcVersaoChange}
              dataOperacao={data}
              linhasPrevisao={linhasPrevisao}
              /* BOITEL-ABATE-PRODUTOR-01: na B o slot tem de ser exatamente recebido - pago; sem isso o principal nao sai. */
              bloqueioPrevisao={avisoDivergencia ?? (ehBoitel ? avisoBoitelProdutor({ boitelData: boitelData ?? null, boitelRealSalvo, compradorId, data, lotes: lotesApi?.lotes ?? [], vendaBoitel }) : null)}
              ehBoitel={ehBoitel}
              propostasDoMotor={propostasDoMotor}
              rotulos={rotulosCompromissos}
              seloProjecao={ehBoitel ? <PilulaCenario cenario="projetado" /> : undefined}
              onIrParaDocumentos={() => setAbaAtiva('documentos')}
              onIrParaEntrega={() => setAbaAtiva('entrega')}
            />
          ) : abaAtiva === 'financeiro' ? (
            /* ── FINANCEIRO — VAZIO HONESTO ──────────────────────────────────────
               ⚠ NAO MONTA A `AbaFinanceiroOC`. A da compra opera sobre compromissos e
               obrigacoes que a venda ainda nao gera: montar aquela tela aqui mostraria
               controles que nao levam a lugar nenhum, que e' pior que nao ter aba.
               ⚠ NENHUM NUMERO. O valor projetado existe e esta no lote — repeti-lo aqui
               como se fosse compromisso financeiro seria dizer que ha titulo quando nao
               ha. A aba diz o que existe, o que falta e de onde vira. */
            <div className="rounded-md border bg-card p-4 shadow-sm space-y-2 min-w-0">
              <div className="text-[15px] font-medium text-foreground">Financeiro da venda</div>
              <p className="text-[12px] text-muted-foreground leading-relaxed max-w-prose">
                Esta venda ainda não gera compromissos financeiros. O valor projetado já está
                no lote da Negociação e entra no resultado por ali; o que ainda não existe é a
                previsão de recebimento — as parcelas, os vencimentos e a conciliação com o
                que for recebido.
              </p>
              <p className="text-[12px] text-muted-foreground leading-relaxed max-w-prose">
                Enquanto isso, o financeiro da venda continua sendo lançado por fora, como
                sempre foi. Nada aqui está pendente de você.
              </p>
            </div>
          ) : abaAtiva === 'negociacao' ? (
            ehBoitel ? (
              /* ⚠ AQUI NAO SE DIGITA O BOITEL. Base operacional e painel de resultado
                 sao LEITURA do que ja esta gravado. Os quatro modais de entrada de dado
                 sao de PR-OC-VENDA-BOITEL-01B — este PR nao os traz, e por isso a tela
                 diz em ambar o que falta em vez de oferecer onde preencher. */
              <div className="space-y-2 min-w-0">
                {motivoBoitelAcesso && (
                  <p className="text-[10px] leading-tight text-amber-700 dark:text-amber-300" data-testid="motivo-negociacao-leitura">{motivoBoitelAcesso}</p>
                )}
                {/* ⚠ 'projetado' FIXO, e nao derivado: e' o unico cenario que esta tela
                    edita — o shell grava 'projetado' sempre em `salvarNegociacaoVendaOC`.
                    PR-OC-VENDA-BOITEL-REALIZADO-01 e' quem passa a variar isto.
                    ⚠ CADA LADO TEM A SUA FONTE — B-04, e a mistura era o defeito. A
                    ESQUERDA e' FATO e sai de `lotesApi.totais`: cabecas e peso do boitel
                    SAO os do lote (ver `boitelDaVenda`). A DIREITA e' PROJECAO e sai do
                    MOTOR, sobre a linha `projetado` — `boitelData` e' exatamente ela.
                    ⚠ `valorPorKgNegociado` E `totais.valorNegociado` SAIRAM DAQUI, e a
                    saida e' a correcao. Eles leem `zoo_operacao_lotes.valor_informado`,
                    que e' o VALOR OFICIAL da operacao e e' realizado-soberano: assim que
                    um rascunho de realizado revalora o lote, aquele slot passa a contar a
                    historia do abate. Mostra-lo sob a pilula "projecao" fazia a tela
                    afirmar como promessa um numero que era realizado — medido na
                    b58bf556: 595.071,81 / R$ 13,26 no lugar de 552.717,00 / R$ 12,32.
                    O slot oficial continua visivel no card do lote, ao lado, e la' esta'
                    certo. Doutrina inteira em `bolsoDaVendaBoitel`.
                    ⚠ O DENOMINADOR DO R$/kg E O MESMO PESO QUE O TOPO EXIBE — cabecas x
                    peso de saida da fazenda —, e vem da irma `unitariosDoLiquido`, com a
                    base trocada para o bolso. Escrever a divisao aqui seria a segunda
                    copia dela. */}
                <BoitelTopoNegociacao
                  cabecas={lotesApi?.totais.animais ?? 0}
                  pesoMedioKg={lotesApi ? pesoMedioPorCabeca(lotesApi.totais) : null}
                  valorPorKg={topoNoRealizado
                    ? unitariosDoLiquido(boitelRealSalvo, bolsoRealizado).porKg
                    : unitariosDoLiquido(boitelData, bolsoProjetado).porKg}
                  valorTotal={(topoNoRealizado ? bolsoRealizado : bolsoProjetado) ?? 0}
                  cenario={topoNoRealizado ? 'realizado' : 'projetado'}
                  /* ⚠ O LOTE ENTRA DENTRO DO TOPO — complemento C. Ele era uma linha
                      abaixo, repetindo cabecas e R$/cab; virou o terceiro FATO, ao lado de
                      Cabecas e Peso. `abaLotes` continua sendo o MESMO elemento de sempre,
                      com o seu `LoteDialog` e o seu `editandoId` — mudou o endereco, nao a
                      maquina. */
                  slotLote={abaLotes}
                />

                {/* ─── DOIS CARDS DE RESUMO ──────────────────────────────────────────
                    PR-OC-VENDA-LAYOUT-NEG-01B, forma final: a aba NAO TEM CAMPOS. Cada
                    card mostra o resumo do seu grupo e abre um dialogo com o estado local
                    — ver a nota em `BoitelBlocosModais`.
                    ⚠ Medido em `max-w-6xl` (1152px): coluna de conteudo 828px, 407px por
                    card. Sem campos dentro, sobra largura para os numeros respirarem.
                    ⚠ `BoitelBlocosModais` devolve um FRAGMENT com os dois cards, entao os
                    dois sao celulas irmas deste grid.
                    ⚠ Abaixo de `lg` tudo vira uma coluna. */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-[14px] items-start">
                  {boitelData && onBoitelChange && (
                    <BoitelBlocosModais
                      valor={boitelData}
                      onChange={onBoitelChange}
                      somenteLeitura={operacionalTravado || !!motivoBoitelAcesso}
                      /* ⚠ EXCECAO: "Lancar realizado" continua com a OC fechada — o iniciar REABRE antes de abrir o
                         dialogo (`iniciarRealizadoBoitel`), e depois disso nada mais esta' travado. */
                      podeLancarRealizado={ocStatusComercial !== 'cancelada'}
                      motivoLancarRealizado={motivoLancarRealizado}
                      motivoTravado={motivoBoitelAcesso ?? (fechada ? 'Operação fechada · reabra para editar' : null)}
                      cenario="projetado"
                      /* ⚠ "enviada em 13/05" — desde quando a projecao corre. Sem isso a
                          pilula diz QUE e' projecao e nao diz de QUANDO, que e' o que
                          permite julgar se ela ainda vale. `data` e' a data da operacao. */
                      detalheCenario={data ? `enviada em ${data.split('-').reverse().slice(0, 2).join('/')}` : null}
                      /* ⚠ O MESMO NUMERO DO TOPO — B-05, achado C: um liquido so' na tela.
                          Era o ACERTO (565.217,00) aqui e o BOLSO (552.717,00) no topo, os
                          dois sob a mesma pilula de projecao, e nada dizia que eram
                          perguntas diferentes. `bolsoProjetado` ja esta calculado acima —
                          nao ha segunda chamada. */
                      bolsoFormatado={bolsoProjetado == null ? null
                        : bolsoProjetado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      realizado={boitelReal}
                      onChangeRealizado={onAplicarRealizado}
                      onIniciarRealizado={onIniciarRealizado}
                      /* ⚠ A ENTRADA DO LOTE NO BOITEL — 02G item 2. E' a `data_operacao`
                          da OC: medido, `data_envio` do boitel esta' nula em 3 de 3
                          registros. No papel vivo, 13/05 -> 25/08 = 104 dias. */
                      dataEntrada={data}
                      /* BOITEL-ABATE-PRODUTOR-01 — o Frigorifico da B usa a MESMA lista do Comprador (favorecidos ativos). */
                      frigorificos={contrapartes}
                    />
                  )}
                </div>

                {/* ⚠ A FAIXA FECHA A ABA COM UMA LINHA — PR-OC-VENDA-ANALISE-01. Eram
                    DOIS blocos largos aqui (as duas cascatas e o "Previsto x realizado"),
                    para uma leitura que acontece uma vez por abate: eles empurravam para
                    baixo os dois cartoes, que sao o que se olha todo dia. A analise
                    inteira mora atras do clique, e nada dela se perdeu — ver a nota em
                    `BoitelAnaliseFaixa`.
                    ⚠ A CATEGORIA E AS CABECAS VEM DO LOTE, como tudo que e' fato nesta
                    aba: sao o cabecalho do modal ("Analise do envio · Garrotes 110"). */}
                <BoitelAnaliseFaixa projetado={boitelData} realizado={boitelRealSalvo}
                  categoria={lotesApi?.lotes[0]?.categoria ?? null}
                  cabecas={lotesApi?.totais.animais ?? 0} />
              </div>
            ) : abaLotes
          ) : (
          <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-[15px] font-medium text-foreground">Identificação da venda</div>
              {/* OC-EDITAR-CADASTRAL-01 — o selo com cadeado de `LancamentoZooModal`. */}
              {fechada && (
                <span className="shrink-0 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-amber-700" />
                  <span className="text-[10px] text-amber-800 leading-none">Operação fechada · reabra para editar</span>
                </span>
              )}
            </div>

            {/* FAIXA DE TOPO — rotulo 11px/400, valor 20px/500. */}
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 px-3.5 py-[11px]">
              <div className="min-w-0">
                <div className="text-[11px] font-normal text-muted-foreground leading-none">Comprador</div>
                <div className="mt-1 text-[20px] font-medium leading-none truncate">{compradorNome ?? '—'}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-normal text-muted-foreground leading-none">Data da venda</div>
                <div className="mt-1 text-[20px] font-medium tabular-nums leading-none">
                  {data ? data.split('-').reverse().join('/') : <span className="text-muted-foreground">—</span>}
                </div>
              </div>
            </div>
            <Separator />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-3">
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground">Comprador <span className="text-destructive">*</span></Label>
                <div className="mt-[3px] flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <SearchableSelect
                      value={compradorId || '__all__'}
                      onValueChange={(v) => setCompradorId(v === '__all__' ? '' : v)}
                      options={contrapartes.map(f => ({ value: f.id, label: f.nome }))}
                      placeholder="Selecione ou cadastre o comprador"
                      allLabel="Nenhum selecionado"
                      allValue="__all__"
                      className="[&_button]:h-8 [&_button]:text-[12px] [&_button]:px-2.5"
                    />
                  </div>
                  <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={onNovoComprador}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                  Data da venda <span className="text-destructive">*</span>
                  {operacionalTravado && <Lock className="w-3 h-3 text-amber-700" />}
                </Label>
                {/* A20 — DatePicker do sistema, nunca `<input type="date">`. */}
                <DatePicker value={data} onChange={setData} disabled={operacionalTravado}
                  className={`mt-[3px] h-8 px-2.5 text-[12px] ${operacionalTravado ? CAMPO_TRAVADO : ''}`} />
                {/* Âmbar: estado do período, não erro do operador — e no instante da data. */}
                {mesFechadoMotivo && (
                  <div className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-800">
                    <b className="font-semibold">{mesFechadoMotivo}.</b>{' '}
                    <ReabrirMesNaOC forma="link" onAbrir={() => setReabrirP1Aberto(true)} />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                {/* ⚠ ORIGEM, e nao destino: numa venda o gado SAI da fazenda. */}
                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                  Fazenda de origem <span className="text-destructive">*</span>
                  {operacionalTravado && <Lock className="w-3 h-3 text-amber-700" />}
                </Label>
                <SearchableSelect
                  value={vendaFazendaId || '__all__'}
                  onValueChange={v => setVendaFazendaId(v === '__all__' ? '' : v)}
                  options={opcoesFazenda}
                  placeholder="Buscar fazenda…"
                  allLabel="Selecione a fazenda"
                  allValue="__all__"
                  disabled={operacionalTravado}
                  className={`mt-[3px] [&_button]:h-8 [&_button]:px-2.5 [&_button]:text-[12px] ${fazendaFalta ? '[&_button]:border-destructive' : ''} ${operacionalTravado ? `[&_button]:${CAMPO_TRAVADO.split(' ').join(' [&_button]:')}` : ''}`}
                />
                {fazendaFalta && !operacionalTravado && (
                  <p className="mt-[3px] text-[10px] text-destructive">Selecione a fazenda de origem.</p>
                )}
              </div>
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground">Propriedade de destino</Label>
                <Input value={propriedadeDestino} onChange={e => setPropriedadeDestino(e.target.value)} placeholder="Opcional"
                  className="mt-[3px] h-8 px-2.5 text-[12px]" />
              </div>
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                  Tipo de venda <span className="text-destructive">*</span>
                  {operacionalTravado && <Lock className="w-3 h-3 text-amber-700" />}
                </Label>
                <Select value={vendaTipoVenda} onValueChange={setVendaTipoVenda} disabled={operacionalTravado || !!motivoBoitelAcesso}>
                  <SelectTrigger className={`mt-[3px] h-8 px-2.5 text-[12px] ${operacionalTravado ? CAMPO_TRAVADO : ''}`}><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gado_adulto">Gado adulto</SelectItem>
                    <SelectItem value="desmama">Desmama</SelectItem>
                    <SelectItem value="boitel" disabled={!acessoOC.negociar_abate_boitel}
                      title={acessoOC.negociar_abate_boitel ? undefined : MOTIVO_ABATE_BOITEL}>Boitel</SelectItem>
                  </SelectContent>
                </Select>
                {/* ACESSOS-OC-03a — a venda vira boitel por ESTE campo: quem nao negocia boitel nao o escolhe (e nao tira a
                    venda do boitel). O motivo fica escrito, so' para quem nao tem a capacidade. */}
                {!acessoOC.negociar_abate_boitel && (
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground" data-testid="motivo-tipo-boitel">{MOTIVO_ABATE_BOITEL}</p>
                )}
              </div>
              <div className="min-w-0 lg:col-span-2">
                <Label className="text-[10px] text-muted-foreground">Observações / Lote</Label>
                <Input value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Opcional"
                  className="mt-[3px] h-8 px-2.5 text-[12px]" />
              </div>
            </div>
          </div>
          )}
          </>)}
        </div>
        </div>

        {/* RESUMO LATERAL — as pecas do Abate (`ui/linha-resumo`), MODAIS-PADRAO-01a: 240px e
            esticado ate' o fim do corpo; quem rola e' a lista dentro do card, nao a coluna. */}
        <div className="lg:min-h-0">
          <AsideResumo faixa={<FaixaTituloResumo />}>
              <SecaoResumo titulo="Identificação" />
              {painelBoitel ? (
                /* PR-OC-BOITEL-PAINEL-01 (D6b): no boitel a Identificacao vai a 2 linhas, para a conta do acerto caber sem
                   rolar a 1135×525. A segunda e' "Data · Fazenda · Tipo", cortada na borda com o texto inteiro no `title`. */
                <div>
                  <LinhaResumo rotulo="Comprador" valor={compradorNome} />
                  <div className="px-2.5 py-px leading-tight truncate font-medium" title={linhaIdentificacao}
                    data-testid="identificacao-boitel">{linhaIdentificacao}</div>
                </div>
              ) : (
              <div>
                <LinhaResumo rotulo="Comprador" valor={compradorNome} />
                <LinhaResumo rotulo="Data" valor={data ? data.split('-').reverse().join('/') : null} />
                <LinhaResumo rotulo="Fazenda" valor={fazendaNome} />
                <LinhaResumo rotulo="Tipo" valor={vendaTipoVenda === 'gado_adulto' ? 'Gado adulto' : vendaTipoVenda === 'desmama' ? 'Desmama' : vendaTipoVenda === 'boitel' ? 'Boitel' : null} />
              </div>
              )}

              <SecaoResumo titulo="Negociação" />
              {/* ⚠ ESTES CAMPOS NUNCA ESTIVERAM LIGADOS — B-08 item 4. Nao eram fonte
                  morta nem campo pre-frente: os rotulos foram desenhados e os valores
                  ficaram `null` LITERAL no JSX. O "—" que aparecia era a sentinela certa
                  para ausencia de DADO, mas aqui a ausencia era do FIO — o resumo dizia
                  "nao sei" sobre numeros que a mesma tela ja tinha em maos.
                  ⚠ A FONTE E A SOBERANA, e a mesma do rodape da aba e do card do lote:
                  `lotesApi.totais`, de `useCompraLotes`. Nao ha segunda conta aqui.
                  ⚠ "VALOR ACORDADO" E O SLOT OFICIAL (`valor_informado` somado) TAMBEM NO
                  BOITEL — e ate' a A3 este comentario mentia: no boitel o numero era DERIVADO
                  da linha realizada (`liquidoDaVendaBoitel`), nao lido do slot. Agora e' o slot
                  nos dois casos (`vendaBoitel.valor`); o acerto e' so' conferencia, e quando
                  diverge aparece na linha ambar logo abaixo. A promessa continua na faixa de
                  analise, derivada da linha projetada. */}
              <div>
                <LinhaResumo rotulo="Lotes" valor={lotesApi && lotesApi.totais.lotes > 0
                  ? `${lotesApi.totais.lotes} · ${lotesApi.totais.animais} cab` : null} />
                <LinhaResumo rotulo="Valor acordado"
                  valor={valorAcordadoMostrado == null ? null : formatMoeda(valorAcordadoMostrado)}
                  cor={ehBoitel ? corMundo : undefined}
                  /* A pilula so' existe onde ha dois mundos — ver a nota em `derAcerto`. */
                  selo={ehBoitel && !topoNoRealizado ? <PilulaCenario cenario="projetado" /> : undefined} />
                {avisoDivergencia && (
                  /* PR-OC-BOITEL-PAINEL-01 (D5): UMA linha de 15px; a frase inteira (com o valor do acerto) vai no `title`. */
                  <div className="px-2.5 py-px leading-tight truncate text-[10px] text-amber-700 dark:text-amber-500"
                    title={avisoDivergencia} data-testid="aviso-lote-acerto">
                    Lote ≠ acerto · {COMO_RESOLVER_DIVERGENCIA_CURTO}
                  </div>
                )}
              </div>

              <SecaoResumo titulo="Entrega" />
              {/* ⚠ MESMO CASO, MESMA CURA. A fonte e' `recebimentoApi.lotes`, consolidada
                  pelo helper que a COMPRA ja usa (`consolidarRecebimento`) — reescrever a
                  soma aqui seria a segunda definicao de "entregue" no mesmo sistema.
                  ⚠ AUSENCIA CONTINUA SENDO TRACO: sem lotes de entrega o helper devolve
                  `null` nos tres, e as duas linhas imprimem "—". O que mudou nao foi a
                  sentinela — foi passar a existir dado por tras dela. */}
              <div>
                <LinhaResumo rotulo="Entregue" valor={entrega.recebido == null ? null
                  : `${entrega.recebido} / ${entrega.negociado ?? '—'} cab`} />
                {/* PR-OC-BOITEL-PAINEL-01 (D6): no boitel, nada a entregar = uma linha so'. */}
                {!(painelBoitel && entregaEmUmaLinha(entrega.diferenca)) && (
                <LinhaResumo rotulo="Saldo a entregar" valor={entrega.diferenca == null ? null
                  : `${Math.max(0, -entrega.diferenca)} cab`} />
                )}
              </div>

              {/* ─── O PAINEL DE BOITEL — PR-OC-BOITEL-PAINEL-01 ──────────────────────────────────────
                  ⚠ UMA CONTA, DE CIMA PARA BAIXO: acerto → A RECEBER DO BOITEL (o Pix) → LIQUIDO NO BOLSO → Financeiro.
                  As linhas saem de `linhasPainelBoitel` (termos do motor + `entrada_obrigacao` da view); a tela so' desenha.
                  Saiu o titulo "Financeiro" acima do acerto, o trio A receber / Recebido / Saldo (o Saldo de nivel liquidado
                  dizia −107.150,94 numa venda que deixa 581.232,52) e a nota de 3 linhas — virou o `title` de "Gastos diretos".
                  ⚠ "Financeiro" leva a diferenca NA MESMA LINHA: o numero neutro vai no `selo`, que o `LinhaResumo` desenha
                  antes do valor, e o "faltam X" vermelho e' o valor. Sem mexer no componente compartilhado. */}
              {painelBoitel ? (<>
                <SecaoResumo titulo={painelBoitel.titulo}
                  extra={!topoNoRealizado ? <PilulaCenario cenario="projetado" /> : undefined} />
                <div data-testid="painel-boitel">
                  {painelBoitel.linhas.filter(l => l.visivel).map(l => (
                    <div key={l.chave} className={l.separador ? 'border-t pt-0.5 mt-0.5' : undefined} title={l.title}
                      data-testid={`painel-boitel-${l.chave}`}>
                      <LinhaResumo rotulo={l.rotulo} forte={l.destaque}
                        valor={l.diferenca ? l.diferenca.texto : l.texto}
                        selo={l.diferenca ? <span className="tabular-nums font-medium">{l.texto}</span> : undefined}
                        cor={l.diferenca ? COR_SINAL.neg : classeDaCorPainel(l.cor, corMundo)} />
                    </div>
                  ))}
                </div>
              </>) : (<>
              {/* ⚠ A RECEBER, e nao "Lancado". Numa venda o dinheiro ENTRA — o vocabulario
                  do financeiro inverte junto com o sentido da operacao. */}
              <SecaoResumo titulo="Financeiro" />
              {/* ⚠ SEM COMPROMISSOS OS TRES SAO TRACO, e nao zero: operacao sem financeiro
                  lancado nao "recebeu zero", ela ainda nao tem financeiro. */}
              {/* OC-VENDA-ENTREGAS-01c — em CONTA CORRENTE nao ha compromisso: os tres numeros sao os da aba, com o MESMO sinal do
                  extrato (saldo negativo = falta receber, vermelho; positivo = adiantado, verde). */}
              {cc ? (
                <div data-testid="resumo-conta-corrente">
                  <LinhaResumo rotulo="Entregue" valor={formatMoeda(cc.entregue)} />
                  <LinhaResumo rotulo="Recebido" valor={formatMoeda(cc.recebido)} cor={cc.recebido > 0 ? COR_SINAL.pos : undefined} />
                  <LinhaResumo rotulo={corDoSaldo(cc.saldo) === 'neg' ? 'Saldo · falta receber' : corDoSaldo(cc.saldo) === 'pos' ? 'Saldo · adiantado' : 'Saldo · quitado'}
                    forte valor={formatMoeda(cc.saldo)}
                    cor={corDoSaldo(cc.saldo) === 'neg' ? COR_SINAL.neg : corDoSaldo(cc.saldo) === 'pos' ? COR_SINAL.pos : undefined} />
                </div>
              ) : (
              <div>
                <LinhaResumo rotulo="A receber" valor={finAReceber == null ? null : formatMoeda(finAReceber)} />
                <LinhaResumo rotulo="Recebido" valor={finRecebido == null ? null : formatMoeda(finRecebido)} />
                <LinhaResumo rotulo="Saldo" valor={finSaldo == null ? null : formatMoeda(finSaldo)} />
              </div>
              )}
              </>)}
          </AsideResumo>
        </div>
      </div>

      {/* RODAPE — 32px com botoes 22px/10px, a medida do Abate (era `px-6 py-2`, 48px). Mesmos
          botoes, mesma ordem, mesmos textos. */}
      <div className="h-8 shrink-0 bg-primary px-2 flex items-center justify-end gap-2">
        {/* OC-VENDA-ENTREGAS-01c, decisao 2 — a venda em conta corrente ganha o Cancelar; o dialogo lista o que sera desfeito. */}
        {cc && onCancelarContaCorrente && ocStatusComercial !== 'cancelada' && (
          <Button type="button" variant="ghost" onClick={() => setCancelarCcAberto(true)} disabled={submitting}
            className="mr-auto h-[22px] px-[9px] text-[10px] text-white/90 hover:bg-white/10 hover:text-white">
            Cancelar operação
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onFechar}
          className="h-[22px] px-[9px] text-[10px] text-white/90 hover:bg-white/10 hover:text-white" title="Fechar sem salvar" aria-label="Fechar">
          Fechar
        </Button>
        {/* ⚠ A VENDA NAO TINHA COMO CONCLUIR — PR-OC-VENDA-ENTREGA-01B. A aba Entrega
            exige `status='fechada'` e dizia "conclua a negociação", mas o gatilho nao
            existia em lugar nenhum do shell: o operador salvava achando que concluia.
            ⚠ SO NA NEGOCIACAO, e a compra faz o contrario (`abaAtiva !== 'negociacao'`)
            por historia propria — aqui o botao mora onde o ato acontece, ao lado dos lotes
            que ele congela.
            ⚠ NAO CONCLUI POR CIMA DE TELA SUJA: com alteracao pendente, o botao trava
            pedindo para salvar. Concluir congela a negociacao — fazer isso com o que esta'
            na tela ainda nao gravado fecharia uma versao que ninguem viu.
            ⚠ SOME DEPOIS DE 'fechada': concluir e' ato unico, e reabrir tem caminho
            proprio. */}
        {/* ⚠ O CAMINHO DE VOLTA — PR-OC-VENDA-REABRIR-NEG-01. Concluir congela a
            negociacao de proposito, e `oc_salvar_lotes`/`oc_salvar_boitel` recusam
            'fechada' mandando "reabra para editar". A venda nao tinha por onde reabrir:
            instrucao certa, destino ausente — o mesmo defeito que o Concluir teve. */}
        {naNegociacao && !!ocOperacaoId && ocStatusComercial === 'fechada' && motivoReabrirAcesso && (
          <GestoDeOperacao podeAlterar={false} motivo={motivoReabrirAcesso} onClick={() => undefined} testId="reabrir-negociacao">
            Reabrir negociação
          </GestoDeOperacao>
        )}
        {naNegociacao && !!ocOperacaoId && ocStatusComercial === 'fechada' && !motivoReabrirAcesso && (
          <Button type="button" variant="secondary" className="h-[22px] px-[9px] text-[10px] gap-1" disabled={submitting}
            title="Reabrir devolve a operação para programada e libera a edição. Fica registrado na Auditoria com o motivo."
            onClick={() => { setMotivoReabrir(''); setReabrirAberto(true); }}>
            <RotateCcw className="h-3 w-3" /> Reabrir negociação
          </Button>
        )}
        {naNegociacao && !!ocOperacaoId && ocStatusComercial === 'programada' && recebimentoApi && (<>
          <DicaBotao texto={concluirTravadoPor} />
          <Button type="button" variant="secondary" className="h-[22px] px-[9px] text-[10px] gap-1"
            /* ⚠ O CONCLUIR NAO ESTAVA QUEBRADO — ele ACORDAVA depois do Salvar. O defeito
               era o SILENCIO: cinza, sem dizer o que faltava, e o operador concluia que o
               botao nao funcionava. Correcao do Gabriel, B-09 item 1.
               ⚠ ELE PASSOU A SALVAR POR DENTRO, e o custo foi MEDIDO: e' exatamente a
               chamada que o operador ja fazia a mao no botao ao lado — `salvarNegociacaoVendaOC`,
               que devolve `boolean`. Nao ha consulta nova, nao ha round-trip a mais; ha um
               clique a menos. Por isso a trava por "nao salvou" saiu do `disabled`.
               ⚠ A SEGURANCA CONTINUA INTEIRA, e e' o `=== false` que a sustenta: se a
               gravacao falhar, NAO conclui. Concluir por cima de edicao nao gravada
               fecharia a negociacao numa versao que ninguem viu, e depois de 'fechada' o
               `oc_salvar_lotes` recusa — a edicao morreria com um erro confuso.
               ⚠ SALVA SO' QUANDO HA O QUE SALVAR. Com `semAlteracoes` a gravacao seria uma
               escrita a toa que ainda subiria a versao. Reaberta, a assinatura nasce nula e
               `semAlteracoes` e' falso mesmo com a tela limpa: ali ele grava, e gravar o
               que ja esta' gravado e' inofensivo — era essa duvida que antes virava trava.
               ⚠ `exigencias()` NAO ENTRA AQUI, e a medicao explica: ela responde "o boitel
               esta' completo?", nao "a tela esta' suja?". Sao perguntas diferentes, e quem
               guarda a completude e' a propria RPC, que recusa com a frase certa desde
               20260831123000. */
            disabled={!!concluirTravadoPor}
            title={concluirTravadoPor ?? (semAlteracoes
              ? 'Concluir a negociação congela os lotes e libera a Entrega'
              : 'Salva a negociação e conclui — congela os lotes e libera a Entrega')}
            onClick={async () => {
              /* ⚠ A VERSÃO SAI DO SALVAR E ENTRA NO CONCLUIR, no mesmo gesto — mesma
                 correção do abate (`c21572c8`). Usar `ocVersao` aqui manda a versão de
                 ANTES do `oc_salvar_lotes` que acabou de rodar, e `oc_confirmar` responde
                 40001: a transação aborta sem deixar evento, e a tela parece não fazer
                 nada. Sem alteração, a versão do state é a correta por construção. */
              const r = await onSalvarNegociacao();
              if (r === false) return;
              await onConcluirNegociacao?.(typeof r === 'number' ? r : undefined);
              /* Concluiu: o financeiro é o próximo passo. A aba decide se há o que propor. */
              setOfereceGerarCompromissos(true);
              setAbaAtiva('financeiro');
            }}>
            <Check className="h-3 w-3" /> Concluir negociação
          </Button>
        </>)}
        {rodapeTemSalvar && (<>
        {/* ⚠ UX-TOAST-01: a recusa do banco ao realizado mora AQUI, ao lado do botao que a
            provocou — e o rascunho continua na tela para corrigir e salvar de novo. */}
        <DicaBotao texto={erroRealizado} erro />
        <DicaBotao texto={erroSalvar} erro />
        <DicaBotao texto={salvarTravadoPor} />
        <Button type="button"
          onClick={async () => {
            if (naNegociacao) { await onSalvarNegociacao(); return; }
            /* ⚠ SO NA CRIACAO. Editando, o botao diz "Salvar alteracoes" e nao promete ir
               a lugar nenhum — mudar de aba ali seria tirar o operador de onde ele estava. */
            const criando = !ocOperacaoId;
            const gravou = await onSalvarOperacao();
            if (criando && gravou) setAbaAtiva('negociacao');
          }}
          disabled={submitting || !podeSalvar || semAlteracoes || ocStatusComercial === 'cancelada'}
          className="h-[22px] px-[9px] text-[10px] bg-white text-primary hover:bg-white/90 font-bold gap-1 disabled:opacity-60"
          title={motivoNaoSalva ?? (semAlteracoes ? 'Nada alterado desde o último salvamento' : undefined)}>
          {/* O TEXTO VOLTOU AO DO MOCKUP em PR-OC-VENDA-ABA-NEGOCIACAO-01, porque agora
              ha para onde ir. Ele ficou em "Salvar operação" enquanto a Negociacao nao
              existia: promessa nao cumprida ensina a desconfiar do botao, do mesmo modo
              que alarme falso ensina a ignorar o alarme. */}
          {submitting ? 'Salvando...'
            : naNegociacao ? 'Salvar negociação'
            : ocOperacaoId ? 'Salvar alterações'
            : (<>Salvar e continuar para Negociação <ArrowRight className="h-3 w-3" /></>)}
        </Button>
        </>)}
      </div>

      {/* ⚠ MOTIVO OBRIGATORIO AQUI, e e' DIVERGENCIA DELIBERADA da compra — decisao do
          Gabriel. Medido: `oc_reabrir` NAO exige motivo (nao ha guard sobre `p_motivo`, ele
          so' vai para `detalhes` do evento), e o dialogo da compra o pede como "opcional".
          Reabrir desfaz um congelamento e e' o que a Auditoria vai mostrar daqui a um ano;
          "reaberta sem motivo" e' um registro que nao explica nada. */}
      {cancelarCcAberto && onCancelarContaCorrente && (
        <CancelarContaCorrenteDialog api={ccApi} onCancelar={onCancelarContaCorrente} onFechar={() => setCancelarCcAberto(false)} />
      )}
      <Dialog open={reabrirAberto} onOpenChange={setReabrirAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-[13px]">Reabrir negociação</DialogTitle></DialogHeader>
          <p className="text-[11px] text-muted-foreground leading-snug">
            A operação volta para <b>programada</b> e a negociação fica editável de novo.
            Esta ação é <b>auditada</b>: o motivo abaixo fica registrado.
          </p>
          <textarea value={motivoReabrir} onChange={e => setMotivoReabrir(e.target.value)} rows={3}
            placeholder="Motivo da reabertura (obrigatório)"
            className="w-full rounded-md border bg-background px-3 py-2 text-[12px]" />
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setReabrirAberto(false)}>Voltar</Button>
            <Button size="sm" disabled={motivoReabrir.trim() === '' || submitting}
              title={motivoReabrir.trim() === '' ? 'Informe o motivo da reabertura' : undefined}
              onClick={async () => { const m = motivoReabrir.trim(); setReabrirAberto(false); const ok = await onReabrirNegociacao?.(m); if (ok !== false) setMotivoReaberturaSessao(m); }}>
              Reabrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {vendaFazendaId && anoMesDaData && (
        <ReabrirP1Dialog open={reabrirP1Aberto} onOpenChange={setReabrirP1Aberto}
          fazendaId={vendaFazendaId} anoMes={anoMesDaData}
          onReaberto={() => { void pilaresMes.refetch(); }} />
      )}
    </div>
  );
}
