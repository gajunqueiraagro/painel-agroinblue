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
import { AbaNegociacaoLotes } from '@/components/compra/AbaNegociacaoLotes';
import { AbaDocumentosOC } from '@/components/compra/AbaDocumentosOC';
import { AbaAuditoriaOC } from '@/components/compra/AbaAuditoriaOC';
import { AbaRecebimentoLotes } from '@/components/compra/AbaRecebimentoLotes';
import { AbaFinanceiroOC } from '@/components/compra/AbaFinanceiroOC';
import type { LinhaPrevisao, RotulosCompromissos } from '@/components/compra/AbaCompromissosOC';
import { siglaCategoria } from '@/lib/financeiro/produtoOC';
import { subcentroVendaPorCategoria, SUBCENTRO_DESPESA_VENDA, SUBCENTRO_ADIANTAMENTO_BOITEL } from '@/hooks/useOperacaoLiquidacao';
import { addDays, format, parseISO } from 'date-fns';
import type { RecebimentoApi } from '@/hooks/useOperacaoRecebimento';
import type { DocumentosApi } from '@/hooks/useOperacaoDocumentos';
import type { EventosApi } from '@/hooks/useOperacaoEventos';
import type { LiquidacaoApi } from '@/hooks/useOperacaoLiquidacao';
import { BoitelTopoNegociacao, BoitelResultadoCompacto, liquidoDaVendaBoitel, derivadosBoitel, PilulaCenario } from '@/components/venda/BoitelNegociacaoDerivado';
import { BoitelBlocosModais, faltamDosCinco, type BoitelEdicao } from '@/components/venda/BoitelBlocosModais';
import { pesoMedioPorCabeca, valorPorKgNegociado } from '@/hooks/useCompraLotes';

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

/* Par rotulo-valor do resumo lateral — idioma do `Linha` de ResumoLateralOC (A17).
   ⚠ SEXTA COPIA deste par. Sai na mesma extracao que levar o resumo para lugar unico. */
function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="text-muted-foreground shrink-0">{rotulo}</span>
      <span className="font-medium text-right truncate">{valor || '—'}</span>
    </div>
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
  ocStatusComercial: string | null;
  /** Lotes da negociação — o mesmo hook da compra, que opera sobre `zoo_operacao_lotes`. */
  lotesApi?: CompraLotesApi;
  /** O planejamento do boitel EM MEMORIA. Os quatro modais o editam; quem persiste e' o
   *  botao da venda, numa chamada so' a `oc_salvar_boitel` — PR-OC-VENDA-BOITEL-01B. */
  boitelData?: BoitelEdicao | null;
  onBoitelChange?: (proximo: BoitelEdicao) => void;
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

export function VendaModalShell({
  data, setData, compradorId, setCompradorId, contrapartes, onNovoComprador,
  vendaFazendaId, setVendaFazendaId, fazendasOC,
  propriedadeDestino, setPropriedadeDestino,
  vendaTipoVenda, setVendaTipoVenda, observacao, setObservacao,
  ocOperacaoId, ocStatusComercial, lotesApi, boitelData = null, onBoitelChange,
  documentosApi, eventosApi, liquidacaoApi, recebimentoApi, ocEntregaEncerrada = false,
  categoria, categoriasDisponiveis,
  quantidadeNum, pesoKgNum, submitting, onSalvarOperacao, onSalvarNegociacao, semAlteracoes = false,
  onConcluirNegociacao, onReabrirNegociacao, onFechar,
}: VendaModalShellProps) {
  const [abaAtiva, setAbaAtiva] = useState<string>('venda');
  /* PR-OC-VENDA-REABRIR-NEG-01 — o dialogo de reabertura. Estado local: e' um gesto da
     tela, nao da operacao. */
  const [reabrirAberto, setReabrirAberto] = useState(false);
  const [motivoReabrir, setMotivoReabrir] = useState('');
  const compradorNome = contrapartes.find(f => f.id === compradorId)?.nome ?? null;
  const fazendaNome = fazendasOC.find(f => f.id === vendaFazendaId)?.nome ?? null;

  /* ⚠ O DADO PERSISTE NA TROCA DE TIPO, e isso nao mudou com a saida da aba: nenhum
     campo e' limpo quando o operador troca o tipo de venda. O que era guardado continua
     guardado — muda apenas ONDE vai aparecer, e sera' dentro da Negociacao. */

  const fazendaFalta = !vendaFazendaId;
  const identificacaoPronta = !!compradorId && !!vendaFazendaId && !!data && !!vendaTipoVenda;

  /* ⚠ A BIFURCACAO DA NEGOCIACAO, de PR-OC-VENDA-BOITEL-01A. O boitel NAO tem aba
     propria: ele e' a Negociacao com mais coisa. Venda comum mostra os lotes como
     sempre; venda boitel mostra os MESMOS lotes mais a base operacional e o painel de
     resultado. O elemento dos lotes e' construido UMA VEZ e usado nos dois ramos — os
     dois ramos com a mesma lista de props seria a mesma armadilha que fez o `brl`
     chegar a seis copias. */
  const ehBoitel = vendaTipoVenda === 'boitel';

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
  const linhasPrevisao = useMemo<LinhaPrevisao[] | undefined>(() => {
    if (!ehBoitel || !boitelData || faltamDosCinco(boitelData).length > 0) return undefined;
    const qtd = boitelData.qtdCabecas || 0;

    /* O lote de maior rebanho decide a sigla e a classificacao — ver a nota acima. */
    const catDominante = (lotesApi?.lotes ?? [])
      .map(l => ({ cat: l.categoria, q: Number(l.quantidade) || 0 }))
      .filter(x => !!x.cat)
      .sort((a, b) => b.q - a.q)[0]?.cat ?? '';
    const subEntrada = subcentroVendaPorCategoria(catDominante);
    /* ⚠ SEM CLASSIFICACAO NAO HA PREVISAO. O writer recusa subcentro que nao exista no
       plano; gerar tres linhas e engasgar na quarta deixaria a operacao pela metade. */
    if (!subEntrada) return undefined;

    const rot = `Boitel ${String(qtd).padStart(3, '0')} ${siglaCategoria(catDominante)}`.trim();
    /* A data PROJETADA do abate: o gado sai da fazenda na data da operacao e fica `dias`
       no boitel. E' previsao, e o "~" do rotulo da linha diz isso ao operador. */
    const dataAbate = dataMaisDias(data, boitelData.dias);
    const antecipado = derivadosBoitel(boitelData).valorTotalAntecipadoCalc;
    const liquido = liquidoDaVendaBoitel(boitelData);

    const linhas: LinhaPrevisao[] = [];
    if (boitelData.possuiAdiantamento && antecipado > 0) linhas.push({
      natureza: 'obrigacao', componente: 'adiantamento',
      subcentro: SUBCENTRO_ADIANTAMENTO_BOITEL,
      valor: antecipado,
      rotulo: 'Adiantamento ao boitel',
      descricao: `${rot} - Adiantamento`,
      favorecidoId: compradorId || null,
      vencimentoPrevisto: boitelData.dataAdiantamento || null,
    });
    /* ⚠ A LINHA OBEDECE AO SELETOR — PR-OC-VENDA-REALIZADO-01A. Ela somava SO' o frete,
       porque "fora do boitel" era regra cravada e o frete era o unico que estava fora.
       Agora cada despesa declara o lado, e `custosDoProdutor` e' o complemento exato do
       `descontoDoAcerto`: entra aqui o que o operador marcou como "produtor", sai o que
       ele marcou como "boitel" — que nao tem caixa proprio, e' desconto no repasse.
       ⚠ UMA FONTE SO'. O valor vem do motor, e nao de uma soma repetida aqui: somar
       `custoFrete + custoNotasEnvio + despesasAbate` na tela seria a segunda copia da
       regra, e ela divergiria do liquido no primeiro seletor que alguem virasse. */
    const foraDoBoitel = derivadosBoitel(boitelData).custosDoProdutor;
    if (foraDoBoitel > 0) linhas.push({
      natureza: 'obrigacao', componente: 'frete',
      subcentro: SUBCENTRO_DESPESA_VENDA,
      valor: Math.round(foraDoBoitel * 100) / 100,
      rotulo: 'Despesas fora do boitel',
      descricao: `${rot} - Despesas fora do boitel`,
      favorecidoId: compradorId || null,
      vencimentoPrevisto: data || null,
    });
    if (liquido != null && liquido > 0) linhas.push({
      natureza: 'principal', componente: 'principal',
      subcentro: subEntrada,
      valor: liquido,
      rotulo: 'Recebimento ref. operação',
      descricao: rot,
      favorecidoId: compradorId || null,
      vencimentoPrevisto: dataAbate,
    });
    if (antecipado > 0) linhas.push({
      natureza: 'obrigacao', componente: 'adiantamento_devolvido',
      subcentro: subEntrada,
      valor: antecipado,
      rotulo: 'Recebimento ref. adiantamento',
      descricao: `${rot} - Adiantamento devolvido`,
      favorecidoId: compradorId || null,
      vencimentoPrevisto: dataAbate,
    });
    return linhas.length > 0 ? linhas : undefined;
  }, [ehBoitel, boitelData, compradorId, data, lotesApi?.lotes]);

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
    ? !!ocOperacaoId && faltamBoitel.length === 0
    : identificacaoPronta;
  /* ⚠ NAO E' O MESMO QUE "NAO PODE": o botao pode estar apto e nao ter o que gravar. Por
     isso o motivo tem precedencia — quem NAO PODE precisa saber o que falta; quem so' nao
     tem alteracao precisa saber que ja' esta' salvo. */
  const motivoNaoSalva = naNegociacao
    ? (!ocOperacaoId ? 'Salve a operação na aba Venda primeiro'
       : faltamBoitel.length > 0 ? `Planejamento do boitel incompleto. Falta ${faltamBoitel.join(', ')}.`
       : undefined)
    : (identificacaoPronta ? undefined : 'Informe comprador, data, fazenda e tipo de venda');

  /* A MESMA ABA DA COMPRA, com quatro textos trocados por prop. O lote e' identico nos
     dois: categoria, quantidade, peso, criterio e valor. Nenhum rotulo de CAMPO muda — o
     lote nao e' comprado nem vendido na tela, ele e' descrito. Vale igual para o boitel:
     o que ele acrescenta fica FORA deste elemento, nao dentro dele. */
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
      onVoltarCompra={() => setAbaAtiva('venda')}
      /* ⚠ SO NA VENDA BOITEL. Numa venda comum e numa compra as duas props sao nulas e a
         grade e' exatamente a de antes: valor digitavel, criterio livre, quantos lotes
         quiser. */
      valorProjetado={ehBoitel ? {
        valor: liquidoDaVendaBoitel(boitelData),
        explicacao: 'Valor projetado do boitel: faturamento menos o custo do boitel e as despesas de abate. Vem do planejamento, não se digita.',
      } : null}
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
        fisicoBloqueado: 'Esta venda já teve entrega: categoria, quantidade e peso ficam bloqueados. Critério e valor seguem editáveis.',
      }}
    />
  );

  return (
    <div className="flex flex-col">
      {/* CABECALHO — medidas do CompraModalShell: `px-6 py-2.5`. */}
      <div className="bg-primary text-primary-foreground px-6 py-2.5 flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold leading-tight">Venda de animais</h2>
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
      <div className="bg-card border-b px-6 py-3 flex items-center gap-1">
        {abasDaVenda(!!ocOperacaoId).map(a => {
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] lg:grid-rows-[minmax(0,1fr)] gap-3 p-4 h-[69vh] overflow-y-auto lg:overflow-hidden bg-muted/30">
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
              api={liquidacaoApi}
              operacaoPronta={!!ocOperacaoId}
              darkSelectClass=""
              financeiroLegadoReadOnly={ocStatusComercial === 'cancelada'}
              financeiroNovoReadOnly={ocStatusComercial === 'cancelada'}
              operacaoId={ocOperacaoId}
              clienteId={liquidacaoApi.clienteId ?? null}
              dataOperacao={data}
              linhasPrevisao={linhasPrevisao}
              rotulos={rotulosCompromissos}
              seloProjecao={ehBoitel ? <PilulaCenario cenario="projetado" /> : undefined}
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
                {/* ⚠ 'projetado' FIXO, e nao derivado: e' o unico cenario que esta tela
                    edita — o shell grava 'projetado' sempre em `salvarNegociacaoVendaOC`.
                    PR-OC-VENDA-BOITEL-REALIZADO-01 e' quem passa a variar isto.
                    ⚠ O TOPO NAO DERIVA: os quatro numeros saem de `lotesApi.totais` pelos
                    MESMOS dois helpers que o cabecalho de lotes usa. Cabecas e peso do
                    boitel SAO os do lote (ver `boitelDaVenda`), entao nao ha segunda
                    fonte — ha uma so', agora mostrada uma vez so'. */}
                <BoitelTopoNegociacao
                  cabecas={lotesApi?.totais.animais ?? 0}
                  pesoMedioKg={lotesApi ? pesoMedioPorCabeca(lotesApi.totais) : null}
                  valorPorKg={lotesApi ? valorPorKgNegociado(lotesApi.totais) : null}
                  valorTotal={lotesApi?.totais.valorNegociado ?? 0}
                  cenario="projetado"
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
                      somenteLeitura={ocStatusComercial === 'cancelada'}
                      cenario="projetado"
                      /* ⚠ "enviada em 13/05" — desde quando a projecao corre. Sem isso a
                          pilula diz QUE e' projecao e nao diz de QUANDO, que e' o que
                          permite julgar se ela ainda vale. `data` e' a data da operacao. */
                      detalheCenario={data ? `enviada em ${data.split('-').reverse().slice(0, 2).join('/')}` : null}
                      /* O liquido migrou da faixa para DENTRO do cartao de projecao. */
                      liquidoFormatado={(() => {
                        const v = liquidoDaVendaBoitel(boitelData);
                        return v == null ? null : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      })()}
                    />
                  )}
                </div>

                {/* ⚠ A FAIXA FECHA A ABA com os DOIS numeros que decidem: o que a venda
                    rende e se valeu a pena contra vender vivo hoje. Os quatro pares de
                    memoria de calculo vivem no `BoitelPainelResultado`; o campo do custo
                    de oportunidade voltou ao modal de Custos, que e' onde se digita. */}
                <BoitelResultadoCompacto boitelData={boitelData} cenario="projetado" />
              </div>
            ) : abaLotes
          ) : (
          <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
            <div className="text-[15px] font-medium text-foreground">Identificação da venda</div>

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
                <Label className="text-[10px] text-muted-foreground">Data da venda <span className="text-destructive">*</span></Label>
                {/* A20 — DatePicker do sistema, nunca `<input type="date">`. */}
                <DatePicker value={data} onChange={setData} className="mt-[3px] h-8 px-2.5 text-[12px]" />
              </div>
              <div className="min-w-0">
                {/* ⚠ ORIGEM, e nao destino: numa venda o gado SAI da fazenda. */}
                <Label className="text-[10px] text-muted-foreground">Fazenda de origem <span className="text-destructive">*</span></Label>
                <Select value={vendaFazendaId} onValueChange={setVendaFazendaId}>
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
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground">Propriedade de destino</Label>
                <Input value={propriedadeDestino} onChange={e => setPropriedadeDestino(e.target.value)} placeholder="Opcional"
                  className="mt-[3px] h-8 px-2.5 text-[12px]" />
              </div>
              <div className="min-w-0">
                <Label className="text-[10px] text-muted-foreground">Tipo de venda <span className="text-destructive">*</span></Label>
                <Select value={vendaTipoVenda} onValueChange={setVendaTipoVenda}>
                  <SelectTrigger className="mt-[3px] h-8 px-2.5 text-[12px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gado_adulto" className="text-[12px]">Gado adulto</SelectItem>
                    <SelectItem value="desmama" className="text-[12px]">Desmama</SelectItem>
                    <SelectItem value="boitel" className="text-[12px]">Boitel</SelectItem>
                  </SelectContent>
                </Select>
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
          <aside className="bg-card rounded-md border shadow-sm overflow-hidden self-start text-[10px]">
            <div className="h-8 shrink-0 border-b border-border bg-accent/40 flex items-center px-3 text-[11px] font-bold uppercase tracking-wide text-primary">
              Resumo da operação
            </div>
            <div className="pb-1">
              <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 first:mt-0 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Identificação</span>
              </div>
              <div className="px-3 space-y-0.5">
                <LinhaResumo rotulo="Comprador" valor={compradorNome} />
                <LinhaResumo rotulo="Data" valor={data ? data.split('-').reverse().join('/') : null} />
                <LinhaResumo rotulo="Fazenda" valor={fazendaNome} />
                <LinhaResumo rotulo="Tipo" valor={vendaTipoVenda === 'gado_adulto' ? 'Gado adulto' : vendaTipoVenda === 'desmama' ? 'Desmama' : vendaTipoVenda === 'boitel' ? 'Boitel' : null} />
              </div>

              <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Negociação</span>
              </div>
              <div className="px-3 space-y-0.5">
                <LinhaResumo rotulo="Lotes" valor={null} />
                <LinhaResumo rotulo="Valor acordado" valor={null} />
              </div>

              <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Entrega</span>
              </div>
              <div className="px-3 space-y-0.5">
                <LinhaResumo rotulo="Entregue" valor={null} />
                <LinhaResumo rotulo="Saldo a entregar" valor={null} />
              </div>

              {/* ⚠ A RECEBER, e nao "Lancado". Numa venda o dinheiro ENTRA — o vocabulario
                  do financeiro inverte junto com o sentido da operacao. */}
              <div className="bg-primary/10 border-y border-primary/15 px-3 py-0.5 mt-0.5 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">Financeiro</span>
              </div>
              <div className="px-3 space-y-0.5">
                <LinhaResumo rotulo="A receber" valor={null} />
                <LinhaResumo rotulo="Recebido" valor={null} />
                <LinhaResumo rotulo="Saldo" valor={null} />
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className="bg-primary px-6 py-2 flex items-center justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onFechar}
          className="text-white/90 hover:bg-white/10 hover:text-white" title="Fechar sem salvar" aria-label="Fechar">
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
        {naNegociacao && !!ocOperacaoId && ocStatusComercial === 'fechada' && (
          <Button type="button" variant="secondary" className="gap-1.5" disabled={submitting}
            title="Reabrir devolve a operação para programada e libera a edição. Fica registrado na Auditoria com o motivo."
            onClick={() => { setMotivoReabrir(''); setReabrirAberto(true); }}>
            <RotateCcw className="h-4 w-4" /> Reabrir negociação
          </Button>
        )}
        {naNegociacao && !!ocOperacaoId && ocStatusComercial === 'programada' && recebimentoApi && (
          <Button type="button" variant="secondary" className="gap-1.5"
            /* ⚠ EXIGE UMA GRAVACAO NESTA SESSAO, e nao apenas "nada mudou". A assinatura
               nasce nula ao reabrir: ali nao da' para distinguir tela limpa de tela suja, e
               na duvida o custo dos dois erros e' assimetrico. Concluir por cima de edicao
               nao gravada fecharia a negociacao numa versao que ninguem viu — e depois de
               'fechada' o `oc_salvar_lotes` recusa, entao a edicao morreria com um erro
               confuso. Pedir um Salvar a mais custa um clique. */
            disabled={submitting || recebimentoApi.saving || !semAlteracoes}
            title={semAlteracoes
              ? 'Concluir a negociação congela os lotes e libera a Entrega'
              : 'Salve a negociação antes de concluir'}
            onClick={async () => { await onConcluirNegociacao?.(); }}>
            <Check className="h-4 w-4" /> Concluir negociação
          </Button>
        )}
        {rodapeTemSalvar && (
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
            : ocOperacaoId ? 'Salvar alterações'
            : (<>Salvar e continuar para Negociação <ArrowRight className="h-4 w-4" /></>)}
        </Button>
        )}
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
