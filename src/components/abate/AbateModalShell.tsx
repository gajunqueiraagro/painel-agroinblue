/**
 * AbateModalShell — a Venda como Operação Comercial. Aba de identificação.
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
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { DatePicker } from '@/components/ui/date-picker';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Calendar, Building2, X, Plus, ArrowRight, Check, RotateCcw } from 'lucide-react';
import type { Categoria } from '@/types/cattle';
import type { CompraLotesApi } from '@/hooks/useCompraLotes';
import type { AbateApi, CenarioAbate, LinhaAbate } from '@/hooks/useOperacaoAbate';
import type { LoteAbate } from '@/components/abate/calculoDoLote';
import { AbaLotesAbate } from '@/components/abate/AbaLotesAbate';
import { totaisDoAbate } from '@/components/abate/calculoDoLote';
import { buildAbateCalculation, type AbateCalculation } from '@/lib/calculos/abate';
import { paraCalculo, linhaVazia } from '@/components/abate/calculoDoLote';
import { AbaNegociacaoLotes } from '@/components/compra/AbaNegociacaoLotes';
import { AbaDocumentosOC } from '@/components/compra/AbaDocumentosOC';
import { AbaAuditoriaOC } from '@/components/compra/AbaAuditoriaOC';
import { AbaRecebimentoLotes } from '@/components/compra/AbaRecebimentoLotes';
import { AbaFinanceiroOC } from '@/components/compra/AbaFinanceiroOC';
import { useOcCompromissos } from '@/hooks/useOcCompromissos';
import type { ReactNode } from 'react';
import type { LinhaPrevisao, RotulosCompromissos } from '@/components/compra/AbaCompromissosOC';
import { siglaCategoria } from '@/lib/financeiro/produtoOC';
import { subcentroVendaPorCategoria, SUBCENTRO_DESPESA_VENDA, SUBCENTRO_ADIANTAMENTO_BOITEL } from '@/hooks/useOperacaoLiquidacao';
import { addDays, format, parseISO } from 'date-fns';
import type { RecebimentoApi } from '@/hooks/useOperacaoRecebimento';
import type { DocumentosApi } from '@/hooks/useOperacaoDocumentos';
import type { EventosApi } from '@/hooks/useOperacaoEventos';
import type { LiquidacaoApi } from '@/hooks/useOperacaoLiquidacao';
import { pesoMedioPorCabeca } from '@/hooks/useCompraLotes';
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
function abasDoAbate(temOperacao: boolean) {
  const semOperacao = 'Salve a operação na aba Abate primeiro';
  return [
    { key: 'abate',        label: 'Abate',        enabled: true,        motivo: undefined },
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
function DicaBotao({ texto }: { texto: string | null | undefined }) {
  if (!texto) return null;
  return (
    <span className="text-[10px] font-normal text-white/80 leading-snug max-w-[15rem] text-right">
      {texto}
    </span>
  );
}

/* Par rotulo-valor do resumo lateral — idioma do `Linha` de ResumoLateralOC (A17).
   ⚠ SEXTA COPIA deste par. Sai na mesma extracao que levar o resumo para lugar unico. */
/** Duas casas, como em toda a tela do abate. */
const num2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function LinhaResumo({ rotulo, valor, cor, forte, selo }: {
  rotulo: string; valor: string | null;
  /* ⚠ A COR VEM DE FORA — B-11. O resumo passou a mostrar dois mundos (projecao ambar,
     realizado solido) e a mesma linha serve aos dois; cravar a cor aqui obrigaria a um
     segundo `LinhaResumo`, que e' como dois pares rotulo-valor comecam a divergir. */
  cor?: string; forte?: boolean; selo?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="text-muted-foreground shrink-0">{rotulo}</span>
      <span className="flex items-baseline gap-1.5 min-w-0">
        {selo}
        <span className={`text-right truncate tabular-nums ${forte ? 'font-bold' : 'font-medium'} ${valor ? (cor ?? '') : ''}`}>
          {valor || '—'}
        </span>
      </span>
    </div>
  );
}

export interface AbateModalShellProps {
  data: string;
  setData: (v: string) => void;
  /** O COMPRADOR. Contraparte da operação — `contraparte_id` na OC. */
  frigorificoId: string;
  setFrigorificoId: (v: string) => void;
  /* ⚠ `cpfCnpj` OPCIONAL porque a carga que o traz e' a lista completa do cliente
     (`select('id, nome, nome_normalizado, aliases, cpf_cnpj')`); um fornecedor criado
     dentro do modal entra pelo caminho curto (`select('id, nome')`) e fica sem documento
     ate' a proxima carga. Precedente do campo: PR-OC-UX-LOTE-C1-01, na aba Compra. */
  contrapartes: { id: string; nome: string; cpfCnpj?: string | null }[];
  onNovoFrigorifico: () => void;
  /** ⚠ A fazenda de ORIGEM: o gado sai dela. */
  abateFazendaId: string;
  setAbateFazendaId: (v: string) => void;
  fazendasOC: { id: string; nome: string }[];
  /** Texto livre — a propriedade de quem compra, quando se sabe. */
  observacao: string;
  setObservacao: (v: string) => void;
  ocOperacaoId: string | null;
  /** A versão da operação e seu setter — o pai é dono único (OC-VERSAO-FONTE-UNICA-01). */
  ocVersao?: number | null;
  onOcVersaoChange?: (v: number) => void;
  ocStatusComercial: string | null;
  /** Lotes da negociação — o mesmo hook da compra, que opera sobre `zoo_operacao_lotes`. */
  lotesApi?: CompraLotesApi;
  /* ─── OS DOIS CENARIOS — mesmo desenho do boitel na venda ────────────────────
     `abateApi` carrega as linhas de `zoo_operacao_abate` do cenario ativo e grava
     pela `oc_salvar_abate`. `onIniciarRealizado` reabre a OC quando preciso e diz
     se pode seguir — o guard de `fechada` e' resolvido ANTES de o dialogo abrir. */
  abateApi?: AbateApi;
  /** O que o operador digitou e ainda nao salvou — vive no pai, como o `boitelDaVenda`. */
  abateLinhas?: Map<string, LinhaAbate>;
  onAbateLinhaChange?: (loteId: string, proxima: LinhaAbate) => void;
  cenarioAbate?: CenarioAbate;
  onCenarioAbateChange?: (c: CenarioAbate) => void;
  onIniciarRealizado?: () => Promise<boolean>;
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
  /* As tres apis da OC, as MESMAS que a compra usa. A venda as monta; nao as edita. */
  documentosApi?: DocumentosApi;
  eventosApi?: EventosApi;
  liquidacaoApi?: LiquidacaoApi;
  recebimentoApi?: RecebimentoApi;
  ocEntregaEncerrada?: boolean;
  /** Nada mudou desde a ultima gravacao bem-sucedida — o botao apaga. */
  semAlteracoes?: boolean;
  /** `oc_confirmar` pelo `useOperacaoRecebimento`. Devolve se concluiu. */
  onConcluirNegociacao?: () => void | Promise<unknown>;
  /** `oc_reabrir` — devolve a operacao a 'programada'. O motivo vai para a auditoria. */
  onReabrirNegociacao?: (motivo: string) => void | Promise<unknown>;
  onFechar: () => void;
}

/* Data ISO + N dias, em ISO. `null` quando nao da' para responder — data vazia, data
   malformada ou prazo nao informado. ⚠ NUNCA LANCA: um throw dentro do `useMemo` que
   monta a previsao apagaria o modal inteiro, e `parseISO` de uma string invalida devolve
   Invalid Date, que faz `format` estourar RangeError. */
function dataMaisDias(iso: string | null | undefined, dias: number): string | null {
  if (!iso || !(dias > 0)) return null;
  const base = parseISO(iso);
  if (Number.isNaN(base.getTime())) return null;
  return format(addDays(base, dias), 'yyyy-MM-dd');
}

export function AbateModalShell({
  data, setData, frigorificoId, setFrigorificoId, contrapartes, onNovoFrigorifico,
  abateFazendaId, setAbateFazendaId, fazendasOC,
  observacao, setObservacao,
  ocOperacaoId, ocVersao, onOcVersaoChange, ocStatusComercial, lotesApi,
  abateApi, abateLinhas, onAbateLinhaChange,
  cenarioAbate = 'projetado', onCenarioAbateChange, onIniciarRealizado,
  documentosApi, eventosApi, liquidacaoApi, recebimentoApi, ocEntregaEncerrada = false,
  categoria, categoriasDisponiveis,
  quantidadeNum, pesoKgNum, submitting, onSalvarOperacao, onSalvarNegociacao, semAlteracoes = false,
  onConcluirNegociacao, onReabrirNegociacao, onFechar,
}: AbateModalShellProps) {
  /* ⚠ 'abate', NAO 'venda'. O clone do VendaModalShell trouxe a aba inicial da venda, e
     como `rodapeTemSalvar` pergunta `abaAtiva === 'abate'`, o rodape nascia SEM o Salvar —
     ele so' aparecia depois de trocar de aba e voltar. Nenhuma aba deste shell se chama
     'venda': o valor nao casava com nada. */
  const [abaAtiva, setAbaAtiva] = useState<string>('abate');
  /* PR-OC-VENDA-REABRIR-NEG-01 — o dialogo de reabertura. Estado local: e' um gesto da
     tela, nao da operacao. */
  const [reabrirAberto, setReabrirAberto] = useState(false);
  const [motivoReabrir, setMotivoReabrir] = useState('');
  const contraparteAtual = contrapartes.find(f => f.id === frigorificoId) ?? null;
  const frigorificoNome = contraparteAtual?.nome ?? null;
  const frigorificoDoc = contraparteAtual?.cpfCnpj || null;
  const fazendaNome = fazendasOC.find(f => f.id === abateFazendaId)?.nome ?? null;

  /* ⚠ O DADO PERSISTE NA TROCA DE TIPO, e isso nao mudou com a saida da aba: nenhum
     campo e' limpo quando o operador troca o tipo de venda. O que era guardado continua
     guardado — muda apenas ONDE vai aparecer, e sera' dentro da Negociacao. */

  const fazendaFalta = !abateFazendaId;
  /* ⚠ `tipoAbate` SAIU DAQUI JUNTO COM O CAMPO. Ele era exigido para liberar o salvar, e
     era a UNICA coisa que o campo governava — nao ia a payload nenhum. Deixa-lo na
     expressao depois de remover o `Select` travaria a tela para sempre, com a dica
     pedindo um campo que nao existe mais. */
  const identificacaoPronta = !!frigorificoId && !!abateFazendaId && !!data;

  /* ⚠ A BIFURCACAO DA NEGOCIACAO, de PR-OC-VENDA-BOITEL-01A. O boitel NAO tem aba
     propria: ele e' a Negociacao com mais coisa. Venda comum mostra os lotes como
     sempre; venda boitel mostra os MESMOS lotes mais a base operacional e o painel de
     resultado. O elemento dos lotes e' construido UMA VEZ e usado nos dois ramos — os
     dois ramos com a mesma lista de props seria a mesma armadilha que fez o `brl`
     chegar a seis copias. */

  /* ⚠ A REGRA NAO E DAQUI. `faltamDosCinco` espelha a lista de `oc_salvar_boitel` para o
     botao poder impedir ANTES da chamada — a licao de 45a7352b, onde o operador so'
     descobria o impedimento no fim. Se as duas divergirem, quem manda e' a RPC, e o texto
     que o operador veria seria o dela. */
  /* ─── A PREVISAO DE CAIXA DO BOITEL ───────────────────────────────────────────
     PR-OC-VENDA-FIN-PREVISAO-01, e e' um MODELO NOVO, nao um ajuste do anterior.

     A NEGOCIACAO cuida da OPERACAO — faturamento bruto, custo do boitel, margem. Aqueles
     numeros vivem no painel como analise e NAO viram linha financeira: sao "sem caixa".
     A aba Financeiro cuida SO do que ATRAVESSA O CAIXA, e sao quatro movimentos:

       1. Adiantamento ao boitel        SAI    (o produtor paga na entrada)
       2. Despesas fora do boitel       SAI    (hoje, o frete — custo do produtor)
       3. Recebimento ref. operacao     ENTRA  (o acerto, ja liquido do que o boitel cobra)
       4. Recebimento ref. adiantamento ENTRA  (o adiantamento volta no acerto)

     ⚠ DUAS LINHAS DE RECEBIMENTO, e nao uma soma — decisao do Gabriel: "duas linhas e'
     melhor de entender". 3 + 4 = `saldoReceberBase`, o mesmo numero do painel; separa-las
     nao muda o total, so' diz de onde ele vem.

     ⚠ A LINHA 4 E' `obrigacao` DESCREVENDO UM RECEBIMENTO, e isso e' proposital. O
     `oc_criar_compromisso` limita a SOMA dos compromissos `principal` a base da operacao
     (medido: base 565.217,00 na b58bf556, que a linha 3 consome inteira), entao um
     segundo principal de 96.783,50 seria RECUSADO pelo banco. Como o sentido do dinheiro
     passou a vir do PLANO DE CONTAS (PR-OC-SENTIDO-POR-PLANO-01), uma obrigacao com
     subcentro de '1-Entradas' materializa como ENTRADA — o resultado no caixa e' o certo
     e o teto do principal fica integro. A palavra "obrigacao" descrevendo um recebimento
     e' divida ESTETICA, registrada para o acabamento; nao ha divida de valor.

     ⚠ NENHUM VALOR E' CONGELADO. Tudo sai do motor a cada render — editar o planejamento
     e regerar da os numeros novos, nunca os do dia da primeira geracao.

     ⚠ O ANTECIPADO SAI DO MOTOR, como todo o resto — `valorTotalAntecipadoCalc`. Esta
     linha ja leu uma funcao de tela (`antecipadoTotal`), e vale registrar por que:
     ate' PR-OC-VENDA-BOITEL-ANTECIPADO-NO-MOTOR-01 o motor rederivava o adiantamento de
     `pctAdiantamentoDiarias`, um campo que a tabela da OC nao guarda — a previsao dizia
     96.783,50 e o painel dizia 1.540,00 na mesma tela. Corrigido o motor, a funcao de
     tela virou copia identica dele (md5 `bae60d01…` nas duas) e deixou de existir.
     Uma verdade so': se o antecipado mudar de regra um dia, muda em UM lugar.

     ⚠ A CATEGORIA VEM DOS LOTES, e nao do campo `categoria` do formulario simples. Esse
     campo NUNCA e' preenchido numa OC de venda (a hidratacao nao o seta, e nem poderia:
     uma OC tem N lotes com N categorias), e era por isso que a descricao saia "Boitel
     110" sem sigla — `siglaCategoria('')` devolve string vazia.
     ⚠ LOTES MISTOS: vale o lote de MAIOR numero de cabecas. O boitel guarda UM
     planejamento por operacao (uma linha em `zoo_operacao_boitel`, nao uma por lote),
     entao ja nao ha como classificar por lote aqui. Medido: as vendas boitel existentes
     tem um lote so'. Quem ler um dia uma venda boitel de lotes mistos precisa saber que
     a classificacao seguiu a maioria. */
  /* ⚠ A PREVISAO DOS COMPROMISSOS NASCE NO T2. Aqui morava a do boitel, que a venda
     deriva do planejamento; o abate deriva a dele de `buildAbateCalculation` sobre as
     linhas de `zoo_operacao_abate` — e isso e' o financeiro, nao o shell. Ate' la',
     `undefined` e' a resposta honesta: a aba de compromissos mostra o que ja existe e
     nao inventa previsao.
     ⚠ O CONSUMO JA ESTA LIGADO (`linhasPrevisao={...}` logo abaixo); o que falta e' o
     calculo, e ele entra por aqui — nao ha peca morta esperando ninguem. */
  const linhasPrevisao: LinhaPrevisao[] | undefined = undefined;

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
      /* ⚠ O ROTULO DA DATA E' O DA OPERACAO, e no abate ela e' o abate. `AbaCompromissosOC`
         escreve "{rotulo} {data}" no rodape do grupo; sem trocar, um abate de 13/08 diria
         "Venda 13/08/2026". `dataChegada: null` porque o abate nao tem chegada — nao e'
         dado que falta, e' etapa que nao existe. */
      dataOperacao: 'Abate', dataChegada: null,
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
  /* ⚠ O MELHOR CONHECIMENTO — 02H item K. `bolsoDaVendaBoitel` ja e' guardada por
     `exigencias`: nao-nulo E' a definicao operacional de "realizado completo". Nulo — sem
     linha realizada, ou com ela pela metade — e o cabecalho segue na projecao ambar.
     ⚠ UMA CHAMADA, e ela alimenta os tres: o cenario do topo, os dois numeros do topo e a
     cascata gemea. Derivar de novo abriria a porta para o cabecalho dizer "realizado" e o
     numero ao lado ainda ser o projetado. */
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
  const fin = ocCompromissosApi.resumoOperacao;
  const temFin = !!fin && fin.temCompromissos;
  const finAReceber = temFin ? fin.entradaObrigacao - fin.entradaLiquidado : null;
  const finRecebido = temFin ? fin.entradaLiquidado : null;
  /* ⚠ O QUE O PRODUTOR PAGA POR FORA — frete, Fundersul, Iagro/GTA. Vem somado pela view,
     que resolve o sentido pelo plano de contas; a tela nao decide de que lado cada
     compromisso esta'. Sem compromisso e' traco, nao zero. */
  const finDespesas = temFin && fin.saidaObrigacao > 0 ? fin.saidaObrigacao : null;
  const finLiquidoProdutor = temFin ? fin.entradaObrigacao - fin.saidaObrigacao : null;
  /* A data que a tela mostra e' o MENOR vencimento ainda em aberto — a proxima a chegar. */
  const proximoVencimento = useMemo(() => {
    const datas = (liquidacaoApi?.obrigacoes ?? [])
      .filter(o => !o.cancelada && o.saldoAberto > 0 && o.dataVencimento)
      .map(o => o.dataVencimento!)
      .sort();
    return datas[0] ?? null;
  }, [liquidacaoApi?.obrigacoes]);
  const finSaldo = !temFin ? null
    : fin.totalLiquidado > 0 ? fin.entradaLiquidado - fin.saidaLiquidado
    : fin.totalMaterializado > 0 ? fin.entradaMaterializado - fin.saidaMaterializado
    : fin.totalProgramado > 0 ? fin.entradaProgramado - fin.saidaProgramado
    : fin.entradaObrigacao - fin.saidaObrigacao;

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
  /* ⚠ O VALOR ACORDADO SAI DOS LOTES, sempre. A venda tem um segundo caminho (o
     liquido derivado do boitel) porque ali ha dois mundos; no abate o acordado e' o
     que os lotes dizem — o resultado do abate vive em `zoo_operacao_abate` e entra
     no financeiro, nao no topo. */
  const valorAcordadoMostrado = lotesApi && lotesApi.totais.lotes > 0 ? lotesApi.totais.valorNegociado : null;

  /* ⚠ AS SETE LINHAS DO ACERTO SAEM DO MOTOR — B-11 item 2. `dAcerto*` sao as parcelas que
     `derivadosBoitel` ja calcula com as flags aplicadas, e `valorTotalAntecipadoCalc` e o
     reembolso. NENHUMA conta mora no resumo: ele lista e formata.
     ⚠ "SO' ITENS COM FLAG [boitel]" E POR CONSTRUCAO, nao por filtro escrito: a parcela
     `dAcerto*` de um custo que o contrato pos do lado do PRODUTOR ja vale zero. Frete e
     notas do envio ficam de fora porque os defaults os poem la' — e se um contrato os
     puser no boitel, eles APARECEM, porque a lista segue a flag e nao uma lista fixa.
     ⚠ O SALDO E `fba - descontoDoAcerto`, o mesmo "Acerto liquido" da analise; e o total,
     mais o reembolso, e' o `saldoReceberBase` do motor — o numero que o papel do boitel
     traz. Nao ha uma segunda subtracao aqui. */
  type LinhaAcerto = { rotulo: string; valor: number; sinal: '+' | '−' };

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
  const rodapeTemSalvar = abaAtiva === 'abate' || naNegociacao;

  /* ⚠ NA NEGOCIACAO BASTA A OPERACAO EXISTIR. Aqui a venda tambem exigia os cinco
     campos do planejamento do boitel; o abate nao tem planejamento previo — o detalhe
     (carcaca, rendimento, preco da @) e' o proprio conteudo da negociacao, e exigi-lo
     para salvar impediria de salvar pela metade, que e' como o operador trabalha. */
  const podeSalvar = naNegociacao ? !!ocOperacaoId : identificacaoPronta;
  /* ⚠ NAO E' O MESMO QUE "NAO PODE": o botao pode estar apto e nao ter o que gravar. Por
     isso o motivo tem precedencia — quem NAO PODE precisa saber o que falta; quem so' nao
     tem alteracao precisa saber que ja' esta' salvo. */
  /* ⚠ O UNICO LUGAR QUE DECIDE SE O CONCLUIR TRAVA — e ele devolve o MOTIVO, nao um
     booleano. Assim `disabled`, `title` e a dica escrita saem todos da mesma frase: quando
     ha motivo o botao trava E diz; sem motivo, ele funciona. Nao da' para travar em
     silencio por construcao. */
  const concluirTravadoPor: string | null =
    submitting ? 'salvando…'
    : recebimentoApi?.saving ? 'aguarde a entrega terminar'
    : null;
  const motivoNaoSalva = naNegociacao
    ? (!ocOperacaoId ? 'Salve a operação na aba Abate primeiro' : undefined)
    : (identificacaoPronta ? undefined : 'Informe frigorífico, data e fazenda');
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
  /* ⚠ O QUE A ABA VE E' O BANCO MESCLADO COM O RASCUNHO. `abateApi.linhas` e' o gravado;
     `abateLinhas` e' o que o operador digitou e ainda nao salvou. Mostrar so' o primeiro
     apagaria a digitacao na tela; so' o segundo esconderia o que ja esta gravado nos
     lotes que ele nao tocou. */
  /* ⚠ TUDO AQUI E' CHAVEADO POR `idLocal`, NUNCA PELO ID DO BANCO. O id do banco nao
     existe enquanto o lote nao foi gravado (`LoteForm.id` e' opcional), entao a chave
     do rascunho nascia `undefined`: dois lotes novos colidiam na MESMA chave, e o
     payload subia sem `operacao_lote_id` — a RPC recusava com "Lote <NULL> nao pertence
     a operacao" e o erro morria sem toast. `idLocal` existe desde o nascimento do lote
     e nao muda; a traducao para o id do banco acontece uma vez so', na gravacao.
     ⚠ E O COMPILADOR NAO VIA: `tsconfig.app.json` tem `strict: false`, entao `string |
     undefined` entrando em campo `string` nao e' erro. O gate de 153 e' cego para esta
     classe inteira de defeito. */
  const linhasDoAbate = useMemo(() => {
    const m = new Map<string, LinhaAbate>();
    (lotesApi?.lotes ?? []).forEach(l => {
      const doBanco = l.id ? abateApi?.linhas.get(l.id) : undefined;
      if (doBanco) m.set(l.idLocal, doBanco);
    });
    (abateLinhas ?? new Map()).forEach((v, k) => m.set(k, v));
    return m;
  }, [abateApi?.linhas, abateLinhas, lotesApi?.lotes]);

  /* Os lotes como a aba do abate os conhece — so' o que o calculo precisa. */
  const lotesDoAbate = useMemo<LoteAbate[]>(
    () => (lotesApi?.lotes ?? []).map(l => ({
      id: l.idLocal,
      ordem: l.ordem,
      categoria: l.categoria ?? null,
      categoriaLabel: categoriasDisponiveis.find(c => c.value === l.categoria)?.label ?? (l.categoria ?? '—'),
      quantidade: Number(l.quantidade) || 0,
      pesoMedioKg: Number(l.pesoMedioKg) || 0,
    })),
    [lotesApi?.lotes, categoriasDisponiveis],
  );

  /* ⚠ A MESMA CONTA DA GRADE, pela mesma funcao. O resumo lateral e o bloco de topo
     mostram os mesmos numeros lado a lado; duas somas independentes divergiriam no
     primeiro arredondamento e o operador nao teria como saber qual vale. */
  const totaisAbate = useMemo(() => {
    const calc = new Map<string, AbateCalculation>();
    lotesDoAbate.forEach(l => calc.set(l.id, buildAbateCalculation(
      paraCalculo(linhasDoAbate.get(l.id) ?? linhaVazia(l.id), l))));
    return totaisDoAbate(lotesDoAbate, calc);
  }, [lotesDoAbate, linhasDoAbate]);



  const abaLotes = (
    <AbaNegociacaoLotes
      categoria={categoria}
      categoriasDisponiveis={categoriasDisponiveis}
      quantidadeNum={quantidadeNum}
      pesoKgNum={pesoKgNum}
      darkSelectClass=""
      modoOC
      operacaoPronta={!!ocOperacaoId}
      lotesApi={lotesApi}
      somenteLeitura={ocStatusComercial === 'cancelada'}
      onVoltarCompra={() => setAbaAtiva('abate')}
      /* ⚠ AS TRES NULAS NO ABATE, e de proposito. Elas existem para a venda boitel,
         onde o valor do lote e' DERIVADO do planejamento e o embarque e' unico. O abate
         tem N lotes (macho e femea sao dois), valor digitavel e criterio livre — a grade
         e' a mesma da compra e da venda comum. */
      valorProjetado={null}
      loteUnico={null}
      linhaMagra={false}
      rotulos={{
        salveIdentificacao: 'Salve a identificação do abate para adicionar os lotes da negociação.',
        voltarParaIdentificacao: 'Voltar para Abate',
        salveOperacaoPrimeiro: 'Salve a operação na aba Abate primeiro',
        fisicoBloqueado: 'Esta venda já teve entrega: categoria, quantidade e peso ficam bloqueados. Critério e valor seguem editáveis.',
      }}
    />
  );

  return (
    /* ⚠ A21 — CABECALHO, ABAS E RODAPE NUNCA ROLAM. A altura mora aqui, uma vez so', e as
       tres faixas fixas sao `shrink-0`; o corpo e' o unico que rola. Antes a altura estava
       no CORPO (`h-[69vh]`) e o modal nao tinha altura nenhuma — com o envelope errado no
       pai, a pagina inteira virava a area de rolagem e o rodape descia com o conteudo.
       `min-h-0` e' o que permite ao corpo encolher dentro do flex; sem ele o filho cresce e
       empurra o rodape para fora da tela. */
    <div className="flex flex-col h-[85vh]">
      {/* CABECALHO — medidas do CompraModalShell: `px-6 py-2.5`. */}
      <div className="shrink-0 bg-primary text-primary-foreground px-6 py-2.5 flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold leading-tight">Abate de animais</h2>
            {/* ⚠ MESMO TERNARIO DA COMPRA (CompraModalShell:300), palavra por palavra. Ele
                dizia "(novo)" para sempre — inclusive depois de salva, o que era mentira do
                rotulo: a operacao ja existia e o cabecalho negava. */}
            <span className="rounded-md border border-white/40 px-2 py-0.5 text-xs">
              OC{ocOperacaoId ? ` #${ocOperacaoId.slice(0, 8)}` : ' (novo)'}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-white/80">
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {data ? data.split('-').reverse().join('/') : '—'}</span>
            <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {fazendaNome ?? '—'}</span>
          </div>
        </div>
        <button type="button" onClick={onFechar} className="text-white/80 hover:text-white shrink-0"
          title="Fechar" aria-label="Fechar"><X className="h-5 w-5" /></button>
      </div>

      {/* BARRA DE ABAS — template do CompraModalShell (bg-card, border-b, px-6 py-3). */}
      <div className="shrink-0 bg-card border-b px-6 py-3 flex items-center gap-1">
        {abasDoAbate(!!ocOperacaoId).map(a => {
          const active = a.key === abaAtiva && a.enabled;
          return (
            <button key={a.key} type="button" disabled={!a.enabled}
              onClick={() => a.enabled && setAbaAtiva(a.key)}
              title={a.motivo}
              className={`h-8 px-3 rounded-md text-[12px] font-medium transition-colors ${
                active ? 'bg-primary/10 text-primary'
                : a.enabled ? 'text-muted-foreground hover:bg-muted/50'
                : 'text-muted-foreground/40 cursor-not-allowed'}`}>
              {a.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_280px] lg:grid-rows-[minmax(0,1fr)] gap-3 p-4 overflow-y-auto lg:overflow-hidden bg-muted/30">
        <div className="space-y-2 min-w-0 lg:min-h-0 lg:overflow-y-auto">
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
              categoriasDisponiveis={categoriasDisponiveis}
              documentosApi={documentosApi}
              /* ⚠ A DATA DA OPERACAO, e nao a de hoje: a saida pertence a' operacao. */
              dataOperacao={data}
              somenteLeitura={ocStatusComercial === 'cancelada'}
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
              contraparteId={frigorificoId || null}
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
              api={liquidacaoApi}
              operacaoPronta={!!ocOperacaoId}
              darkSelectClass=""
              financeiroLegadoReadOnly={ocStatusComercial === 'cancelada'}
              financeiroNovoReadOnly={ocStatusComercial === 'cancelada'}
              operacaoId={ocOperacaoId}
              clienteId={liquidacaoApi.clienteId ?? null}
              /* A instancia que o resumo lateral ja monta — uma leitura, dois consumidores. */
              ocApiExterno={ocCompromissosApi}
              dataOperacao={data}
              linhasPrevisao={linhasPrevisao}
              rotulos={rotulosCompromissos}
              seloProjecao={undefined}
              onIrParaDocumentos={() => setAbaAtiva('documentos')}
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
              <div className="text-[15px] font-medium text-foreground">Financeiro do abate</div>
              <p className="text-[12px] text-muted-foreground leading-relaxed max-w-prose">
                Este abate ainda não gera compromissos financeiros. O valor projetado já está
                no lote da Negociação e entra no resultado por ali; o que ainda não existe é a
                previsão de recebimento — as parcelas, os vencimentos e a conciliação com o
                que for recebido.
              </p>
              <p className="text-[12px] text-muted-foreground leading-relaxed max-w-prose">
                Enquanto isso, o financeiro do abate continua sendo lançado por fora, como
                sempre foi. Nada aqui está pendente de você.
              </p>
            </div>
          ) : abaAtiva === 'negociacao' ? (
            /* ⚠ A NEGOCIACAO DO ABATE E' A GRADE DE LOTES, e nada mais neste commit.
               Aqui, na venda, havia o painel de leitura do boitel — topo derivado, blocos
               de entrada e faixa de analise. O abate tem o seu equivalente
               (carcaca/rendimento/@/bonus/descontos/Funrural), e ele entra no commit
               seguinte como `AbaNegociacaoAbate`, ao lado desta grade: os lotes continuam
               sendo lotes, e o detalhe do abate e' POR lote. */
            <div className="space-y-3">
              {/* ⚠ GRADE PROPRIA DO ABATE — ABATE-UX-01b. A compartilhada
                  (`AbaNegociacaoLotes`) continua servindo compra, venda, boitel e
                  recebimento, intocada: o cartao daqui mostra carcaca, rendimento e
                  liquido por arroba, que so' existem depois do frigorifico pesar. O
                  CADASTRO do lote continua sendo o mesmo dialogo compartilhado. */}
              {lotesApi && (
                <AbaLotesAbate
                  lotes={lotesDoAbate}
                  linhas={linhasDoAbate}
                  cenario={cenarioAbate}
                  cenariosExistentes={abateApi?.cenarios ?? []}
                  onCenarioChange={onCenarioAbateChange}
                  lotesApi={lotesApi}
                  categoriasDisponiveis={categoriasDisponiveis}
                  somenteLeitura={ocStatusComercial === 'fechada' || ocStatusComercial === 'cancelada'}
                  onLinhaChange={onAbateLinhaChange ?? (() => {})}
                />
              )}
            </div>
          ) : (
          <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
            <div className="text-[15px] font-medium text-foreground">Identificação do abate</div>

            {/* FAIXA DE TOPO — rotulo 11px/400, valor 20px/500. */}
            <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/20 px-3.5 py-[11px]">
              <div className="min-w-0">
                <div className="text-[11px] font-normal text-muted-foreground leading-none">Comprador</div>
                <div className="mt-1 text-[20px] font-medium leading-none truncate">{frigorificoNome ?? '—'}</div>
                {/* ⚠ SO' APARECE QUANDO EXISTE: uma linha "CNPJ —" fixa diria que o
                    documento falta no cadastro, quando o que falta e' a carga que o traz. */}
                {frigorificoDoc && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground leading-none truncate">
                    CNPJ {frigorificoDoc}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-normal text-muted-foreground leading-none">Data do abate</div>
                <div className="mt-1 text-[20px] font-medium tabular-nums leading-none">
                  {data ? data.split('-').reverse().join('/') : <span className="text-muted-foreground">—</span>}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-normal text-muted-foreground leading-none">Fazenda de origem</div>
                <div className="mt-1 text-[20px] font-medium leading-none truncate">{fazendaNome ?? '—'}</div>
              </div>
            </div>
            <Separator />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-3">
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground">Comprador <span className="text-destructive">*</span></Label>
                <div className="mt-[3px] flex items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <SearchableSelect
                      value={frigorificoId || '__all__'}
                      onValueChange={(v) => setFrigorificoId(v === '__all__' ? '' : v)}
                      options={contrapartes.map(f => ({ value: f.id, label: f.nome }))}
                      placeholder="Selecione ou cadastre o comprador"
                      allLabel="Nenhum selecionado"
                      allValue="__all__"
                      className="[&_button]:h-8 [&_button]:text-[12px] [&_button]:px-2.5"
                    />
                  </div>
                  <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={onNovoFrigorifico}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground">Data do abate <span className="text-destructive">*</span></Label>
                {/* A20 — DatePicker do sistema, nunca `<input type="date">`. */}
                <DatePicker value={data} onChange={setData} className="mt-[3px] h-8 px-2.5 text-[12px]" />
              </div>
              <div className="min-w-0">
                {/* ⚠ ORIGEM, e nao destino: numa venda o gado SAI da fazenda. */}
                <Label className="text-[10px] text-muted-foreground">Fazenda de origem <span className="text-destructive">*</span></Label>
                <Select value={abateFazendaId} onValueChange={setAbateFazendaId}>
                  <SelectTrigger className={`mt-[3px] h-8 px-2.5 text-[12px] ${fazendaFalta ? 'border-destructive' : ''}`}>
                    <SelectValue placeholder="Selecione a fazenda" />
                  </SelectTrigger>
                  <SelectContent>
                    {fazendasOC.map(f => <SelectItem key={f.id} value={f.id} className="text-[12px]">{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                {fazendaFalta && (
                  <p className="mt-[3px] text-[10px] text-destructive">Selecione a fazenda de origem.</p>
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

        {/* RESUMO LATERAL — idioma do ResumoLateralOC. */}
        <div className="lg:min-h-0 lg:overflow-y-auto">
          {/* ⚠ STICKY: a coluna rola sozinha (`lg:overflow-y-auto`), e sem isto o cartao
              some para cima quando o resumo e' mais alto que a area. Fundo opaco porque
              sticky sobrepoe o que rola atras. */}
          <aside className="sticky top-0 bg-card rounded-md border shadow-sm overflow-hidden self-start text-[10px]">
            <div className="h-8 shrink-0 border-b border-border bg-accent/40 flex items-center px-3 text-[11px] font-bold uppercase tracking-wide text-primary">
              Resumo da operação
            </div>
            <div className="pb-1">
              <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 first:mt-0 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Identificação</span>
              </div>
              <div className="px-3 space-y-0.5">
                <LinhaResumo rotulo="Comprador" valor={frigorificoNome} />
                <LinhaResumo rotulo="CNPJ" valor={frigorificoDoc} />
                <LinhaResumo rotulo="Data" valor={data ? data.split('-').reverse().join('/') : null} />
                <LinhaResumo rotulo="Fazenda" valor={fazendaNome} />
              </div>

              <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Negociação</span>
              </div>
              {/* ⚠ ESTES CAMPOS NUNCA ESTIVERAM LIGADOS — B-08 item 4. Nao eram fonte
                  morta nem campo pre-frente: os rotulos foram desenhados e os valores
                  ficaram `null` LITERAL no JSX. O "—" que aparecia era a sentinela certa
                  para ausencia de DADO, mas aqui a ausencia era do FIO — o resumo dizia
                  "nao sei" sobre numeros que a mesma tela ja tinha em maos.
                  ⚠ A FONTE E A SOBERANA, e a mesma do rodape da aba e do card do lote:
                  `lotesApi.totais`, de `useCompraLotes`. Nao ha segunda conta aqui.
                  ⚠ "VALOR ACORDADO" E O SLOT OFICIAL (`valor_informado` somado), que e'
                  REALIZADO-SOBERANO: depois do abate ele mostra o real, e esta' certo —
                  ver a doutrina dos dois mundos em `bolsoDaVendaBoitel`. A promessa vive
                  na faixa de analise, derivada da linha projetada. */}
              {/* ⚠ AS GRANDEZAS DO ABATE VEM DE `totaisAbate`, a MESMA funcao que alimenta o
                  bloco de topo da grade — nao ha segunda soma aqui. Sem lote, tudo e' traco:
                  operacao sem lote nao pesa zero, ela ainda nao tem lote. */}
              <div className="px-3 space-y-0.5">
                <LinhaResumo rotulo="Lotes" valor={lotesApi && lotesApi.totais.lotes > 0
                  ? `${lotesApi.totais.lotes} · ${lotesApi.totais.animais} cab` : null} />
                <LinhaResumo rotulo="Peso vivo" valor={totaisAbate.cabecas > 0
                  ? `${num2(totaisAbate.pesoMedio)} kg/cab` : null} />
                <LinhaResumo rotulo="Carcaça" valor={totaisAbate.carcaca > 0
                  ? `${num2(totaisAbate.carcacaCab)} kg/cab` : null} />
                <LinhaResumo rotulo="Arrobas · RC" valor={totaisAbate.arrobas > 0
                  ? `${num2(totaisAbate.arrobaCab)} @/cab · ${num2(totaisAbate.rc)}%` : null} />
                <LinhaResumo rotulo="Valor bruto" valor={totaisAbate.bruto > 0
                  ? formatMoeda(totaisAbate.bruto) : null} />
                <LinhaResumo rotulo="Acordado (NF)" forte
                  valor={valorAcordadoMostrado == null ? null : formatMoeda(valorAcordadoMostrado)}
                  cor={undefined}
                  /* A pilula so' existe onde ha dois mundos — ver a nota em `derAcerto`. */
                  selo={undefined} />
                {totaisAbate.liquido > 0 && (
                  <LinhaResumo rotulo="por cabeça · por @" forte
                    valor={`${formatMoeda(totaisAbate.cabecas > 0 ? totaisAbate.liquido / totaisAbate.cabecas : 0)} · ${formatMoeda(totaisAbate.arrobas > 0 ? totaisAbate.liquido / totaisAbate.arrobas : 0)}`} />
                )}
              </div>

              <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Entrega</span>
              </div>
              {/* ⚠ MESMO CASO, MESMA CURA. A fonte e' `recebimentoApi.lotes`, consolidada
                  pelo helper que a COMPRA ja usa (`consolidarRecebimento`) — reescrever a
                  soma aqui seria a segunda definicao de "entregue" no mesmo sistema.
                  ⚠ AUSENCIA CONTINUA SENDO TRACO: sem lotes de entrega o helper devolve
                  `null` nos tres, e as duas linhas imprimem "—". O que mudou nao foi a
                  sentinela — foi passar a existir dado por tras dela. */}
              <div className="px-3 space-y-0.5">
                <LinhaResumo rotulo="Entregue" valor={entrega.recebido == null ? null
                  : `${entrega.recebido} / ${entrega.negociado ?? '—'} cab`} />
                <LinhaResumo rotulo="Saldo a entregar" valor={entrega.diferenca == null ? null
                  : `${Math.max(0, -entrega.diferenca)} cab`} />
              </div>

              {/* ⚠ A RECEBER, e nao "Lancado". Numa venda o dinheiro ENTRA — o vocabulario
                  do financeiro inverte junto com o sentido da operacao. */}
              <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Financeiro</span>
              </div>
              {/* ⚠ O ACERTO DO BOITEL NAO EXISTE NO ABATE. Aqui a venda lista as sete
                  linhas do acerto com o boitel — diarias, sanidade, frete, adiantamento.
                  O abate nao tem intermediario: o frigorifico paga o liquido, e a
                  composicao desse liquido (bonus, descontos, Funrural) mora na aba
                  Negociacao e no financeiro, nao no resumo lateral. */}

              {/* ⚠ SEM COMPROMISSOS OS TRES SAO TRACO, e nao zero: operacao sem financeiro
                  lancado nao "recebeu zero", ela ainda nao tem financeiro. */}
              {/* ⚠ OS TOTAIS VEM DA VIEW, ja' separados por sentido — `entradaObrigacao` e
                  `saidaObrigacao` de `resumoOperacao`. O sentido de CADA compromisso sai do
                  plano de contas (`1-Entradas` / `2-Saidas`), regra soberana de
                  `oc_materializar_programacao`; somar isso aqui seria a segunda derivacao
                  da mesma regra. Por isso as despesas aparecem pelo TOTAL: quebra-las por
                  nome (frete, Fundersul, Iagro) exige o plano de contas linha a linha, que
                  hoje so' a aba Financeiro carrega. */}
              <div className="px-3 space-y-0.5">
                <LinhaResumo rotulo="A receber da indústria" valor={finAReceber == null ? null : formatMoeda(finAReceber)} />
                {proximoVencimento && (
                  <LinhaResumo rotulo={`Agendado ${proximoVencimento.split('-').reverse().join('/')}`} valor={null} />
                )}
                <LinhaResumo rotulo="Recebido" valor={finRecebido == null ? null : formatMoeda(finRecebido)} />
                <LinhaResumo rotulo="Despesas do produtor" cor="text-destructive"
                  valor={finDespesas == null ? null : `− ${formatMoeda(finDespesas)}`} />
                <LinhaResumo rotulo="Líquido do produtor" forte
                  valor={finLiquidoProdutor == null ? null : formatMoeda(finLiquidoProdutor)} />
                <LinhaResumo rotulo="Saldo" valor={finSaldo == null ? null : formatMoeda(finSaldo)} />
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ⚠ RODAPE FIXO E PRESENTE EM TODA ABA. `justify-between` poe o Fechar a esquerda e
          os botoes da aba a direita; antes era `justify-end` e o Fechar viajava junto dos
          outros, mudando de lugar conforme a aba tivesse ou nao Salvar. */}
      <div className="shrink-0 bg-primary px-6 py-2 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={onFechar}
          className="text-white/90 hover:bg-white/10 hover:text-white" title="Fechar sem salvar" aria-label="Fechar">
          Fechar
        </Button>
        {/* Os botoes da aba vivem juntos a direita; o Fechar fica sozinho a esquerda. */}
        <div className="flex items-center gap-3">
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
        {naNegociacao && !!ocOperacaoId && ocStatusComercial === 'fechada' && (
          <Button type="button" variant="secondary" className="gap-1.5" disabled={submitting}
            title="Reabrir devolve a operação para programada e libera a edição. Fica registrado na Auditoria com o motivo."
            onClick={() => { setMotivoReabrir(''); setReabrirAberto(true); }}>
            <RotateCcw className="h-4 w-4" /> Reabrir negociação
          </Button>
        )}
        {naNegociacao && !!ocOperacaoId && ocStatusComercial === 'programada' && recebimentoApi && (<>
          <DicaBotao texto={concluirTravadoPor} />
          <Button type="button" variant="secondary" className="gap-1.5"
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
              if (!semAlteracoes) { const ok = await onSalvarNegociacao(); if (ok === false) return; }
              await onConcluirNegociacao?.();
            }}>
            <Check className="h-4 w-4" /> Concluir negociação
          </Button>
        </>)}
        {rodapeTemSalvar && (<>
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
          className="bg-white text-primary hover:bg-white/90 font-bold gap-1.5 disabled:opacity-60"
          title={motivoNaoSalva ?? (semAlteracoes ? 'Nada alterado desde o último salvamento' : undefined)}>
          {/* O TEXTO VOLTOU AO DO MOCKUP em PR-OC-VENDA-ABA-NEGOCIACAO-01, porque agora
              ha para onde ir. Ele ficou em "Salvar operação" enquanto a Negociacao nao
              existia: promessa nao cumprida ensina a desconfiar do botao, do mesmo modo
              que alarme falso ensina a ignorar o alarme. */}
          {submitting ? 'Salvando...'
            : naNegociacao ? 'Salvar negociação'
            : ocOperacaoId ? 'Salvar abate'
            : (<>Salvar e continuar para Negociação <ArrowRight className="h-4 w-4" /></>)}
        </Button>
        </>)}
        </div>
      </div>

      {/* ⚠ MOTIVO OBRIGATORIO AQUI, e e' DIVERGENCIA DELIBERADA da compra — decisao do
          Gabriel. Medido: `oc_reabrir` NAO exige motivo (nao ha guard sobre `p_motivo`, ele
          so' vai para `detalhes` do evento), e o dialogo da compra o pede como "opcional".
          Reabrir desfaz um congelamento e e' o que a Auditoria vai mostrar daqui a um ano;
          "reaberta sem motivo" e' um registro que nao explica nada. */}
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
              onClick={async () => { const m = motivoReabrir.trim(); setReabrirAberto(false); await onReabrirNegociacao?.(m); }}>
              Reabrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
