/**
 * BoitelBlocosModais — a ENTRADA de dado do boitel, na aba de Negociação da venda.
 *
 * PR-OC-VENDA-BOITEL-01B. O 01A entregou a leitura; este entrega a escrita.
 *
 * ⚠ UI PURA. Nenhuma regra nasce aqui. A lista dos cinco campos obrigatórios vive na
 * RPC `oc_salvar_boitel` (aa4f2630); esta tela repete o AVISO para o operador não
 * descobrir o impedimento só no fim — a lição do peso da morte, em 45a7352b.
 *
 * ⚠ ACORDEAO, E NAO MODAIS — PR-BOITEL-ACORDEAO-01. Os quatro blocos nasceram como
 * botões que abriam um Dialog cada, com um estado `aberto` de valor único: um por vez,
 * por construção. O defeito não era de código, era de desenho. O boitel é SIMULAÇÃO — o
 * operador mexe na diária olhando a margem, mexe no GMD olhando o custo —, e o modal
 * escondia três blocos enquanto se editava um. Agora os campos abrem NA PRÓPRIA SEÇÃO, e
 * o estado é um `Set`: quantos blocos o operador quiser, ao mesmo tempo.
 *
 * ⚠ NÃO GRAVA. As quatro seções editam o objeto em memória e devolvem ao pai. Quem
 * persiste é o botão da venda, numa chamada só — o padrão de `oc_salvar_lotes`, e a
 * mesma forma que o simulador antigo já tem (`handleSave` devolve ao pai, não ao banco).
 *
 * ⚠ NÃO COPIEI AS MEDIDAS DO SIMULADOR ANTIGO. Lá os campos são 7–9px, abaixo do piso
 * de 10px de docs/PADROES-UI.md. As formas aqui são as do repositório: A16 (mesma
 * altura de campo), A17 (par rótulo-valor), A18 (linha densa de duas alturas), A19
 * (dinheiro sempre formatado), A20 (DatePicker, nunca `input type=date`).
 */
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import type { CenarioBoitel } from '@/components/venda/BoitelNegociacaoDerivado';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pencil, TrendingUp, Wallet, Tag, Banknote, BarChart3, ImageDown } from 'lucide-react';
import { formatMoeda, formatKg, formatArroba } from '@/lib/calculos/formatters';
import type { BoitelData } from '@/components/BoitelPlanningDialog';
import { derivadosBoitel, cabecasQueSairam, liquidoDaVendaBoitel, bolsoDaVendaBoitel, unitariosDoLiquido, comparativoOportunidade, PilulaCenario, type BoitelEdicao, type UnitariosLiquido } from '@/components/venda/BoitelNegociacaoDerivado';

const n2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n3 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const n1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Derivado por cabeça — usa o LOTE INTEIRO no denominador, mortes incluídas. */
const porCabeca = (total: number, qtd: number) => qtd > 0 && total > 0 ? `${formatMoeda(total / qtd)} por cab. no período` : null;

/* `BoitelEdicao` e `cabecasQueSairam` DESCERAM para `BoitelNegociacaoDerivado` em
   PR-OC-VENDA-BOITEL-FIX-ARROBAS-MORTE-01: as contas de lá passaram a precisar da morte, e
   este arquivo importa daquele — manter aqui criaria ciclo. Reexportados porque o
   `VendaModalShell` e o `LancamentosTab` os pedem por este caminho. */
export type { BoitelEdicao };
export { cabecasQueSairam };

/* ⚠ ESPELHO DA RPC, e assumido como espelho. A lista canônica é a de
   `oc_salvar_boitel`; esta existe para o botão poder desabilitar ANTES da chamada, e
   não para decidir nada. Se as duas divergirem, quem manda é a RPC — e o texto que o
   operador veria seria o dela, não o daqui. */
const CINCO_OBRIGATORIOS: { rotulo: string; tem: (d: BoitelEdicao) => boolean }[] = [
  { rotulo: 'dias de confinamento', tem: d => d.dias > 0 },
  { rotulo: 'GMD',                  tem: d => d.gmd > 0 },
  { rotulo: 'rendimento de saída',  tem: d => d.rendimento > 0 },
  { rotulo: 'custo da diária',      tem: d => d.custoDiaria > 0 },
  { rotulo: 'preço de venda da @',  tem: d => d.precoVendaArroba > 0 },
];

/** O que falta dos cinco. Vazio = a RPC aceitaria. */
export function faltamDosCinco(d: BoitelEdicao | null): string[] {
  if (!d) return CINCO_OBRIGATORIOS.map(c => c.rotulo);
  return CINCO_OBRIGATORIOS.filter(c => !c.tem(d)).map(c => c.rotulo);
}

/* ─── O MAPA ENTRE `BoitelEdicao` E `zoo_operacao_boitel` ──────────────────────
   UM mapa, e as DUAS direções derivam dele — PR-OC-VENDA-REABRIR-01.
   ⚠ ESCREVER A VOLTA COMO SEGUNDA LISTA seria o defeito do `TRANSLATE` de ontem em
   outra roupa: duas listas paralelas que ninguém percebe desalinhadas. Aqui, esquecer
   um campo o faz sumir da ida E da volta ao mesmo tempo — o que é visível.
   ⚠ `custo_nutricao` SAIU DO MAPA — PR-OC-VENDA-NUTRICAO-DUPLICADA-01: a diária já é a
   nutrição, e o campo era o mesmo conceito duas vezes. A COLUNA FICA NO BANCO, zerada em
   todas as linhas (medido: 1 linha, zero com valor), como legado — sem migration. Fora do
   mapa, ela deixa de ser enviada, e a RPC preserva o que lá estiver: zero.
   ⚠ `zeroEValor` MARCA OS CAMPOS EM QUE ZERO E RESPOSTA, e não ausência. Nos demais,
   zero e vazio são a mesma coisa (não informado) e viram NULL; nos de morte, zero
   significa "informado como nenhuma morte" — está no comentário da própria coluna. */
type TipoCampoBoitel = 'texto' | 'num' | 'int' | 'bool';
interface CampoBoitel { col: string; campo: keyof BoitelEdicao; tipo: TipoCampoBoitel; zeroEValor?: boolean }

const MAPA_BOITEL: CampoBoitel[] = [
  { col: 'nome_boitel',                  campo: 'nomeBoitel',                  tipo: 'texto' },
  { col: 'lote_codigo',                  campo: 'lote',                        tipo: 'texto' },
  { col: 'numero_contrato',              campo: 'numeroContrato',              tipo: 'texto' },
  { col: 'data_envio',                   campo: 'dataEnvio',                   tipo: 'texto' },
  { col: 'peso_saida_fazenda_kg',        campo: 'pesoInicial',                 tipo: 'num' },
  { col: 'dias',                         campo: 'dias',                        tipo: 'int' },
  { col: 'gmd',                          campo: 'gmd',                         tipo: 'num' },
  { col: 'quebra_viagem_pct',            campo: 'quebraViagem',                tipo: 'num' },
  { col: 'rendimento_entrada_pct',       campo: 'rendimentoEntrada',           tipo: 'num' },
  { col: 'rendimento_saida_pct',         campo: 'rendimento',                  tipo: 'num' },
  { col: 'custo_diaria',                 campo: 'custoDiaria',                 tipo: 'num' },
  { col: 'custo_sanidade',               campo: 'custoSanidade',               tipo: 'num' },
  { col: 'custo_frete',                  campo: 'custoFrete',                  tipo: 'num' },
  { col: 'outros_custos',                campo: 'outrosCustos',                tipo: 'num' },
  { col: 'custo_oportunidade',           campo: 'custoOportunidade',           tipo: 'num' },
  { col: 'preco_venda_arroba',           campo: 'precoVendaArroba',            tipo: 'num' },
  /* ⚠ UM CAMPO SO — a unificação com `custoNfAbate` saiu no 01A. */
  { col: 'despesas_abate',               campo: 'despesasAbate',               tipo: 'num' },
  { col: 'possui_adiantamento',          campo: 'possuiAdiantamento',          tipo: 'bool' },
  { col: 'data_adiantamento',            campo: 'dataAdiantamento',            tipo: 'texto' },
  { col: 'valor_adiantamento_diarias',   campo: 'valorAdiantamentoDiarias',    tipo: 'num' },
  { col: 'valor_adiantamento_sanitario', campo: 'valorAdiantamentoSanitario',  tipo: 'num' },
  { col: 'valor_adiantamento_outros',    campo: 'valorAdiantamentoOutros',     tipo: 'num' },
  { col: 'adiantamento_observacao',      campo: 'adiantamentoObservacao',      tipo: 'texto' },
  { col: 'morte_quantidade',             campo: 'morteQuantidade',             tipo: 'int', zeroEValor: true },
  { col: 'morte_valor_indenizacao',      campo: 'morteValorIndenizacao',       tipo: 'num', zeroEValor: true },
  /* ─── AS CINCO DE PR-OC-VENDA-REALIZADO-01A ─────────────────────────────────────
     ⚠ ELAS EXISTIAM NO BANCO E NAO EXISTIAM AQUI. Enquanto estiveram fora deste mapa nao
     eram gravadas NEM hidratadas: a linha nascia com os defaults e qualquer escolha da
     tela sumia ao reabrir. E' o mesmo defeito do `pctAdiantamentoDiarias`, visto do outro
     lado — la' o motor lia um campo que a tabela nao tinha; aqui a tabela tinha campos
     que o mapa nao lia.
     ⚠ `custo_notas_envio` E' `zeroEValor`: zero e' resposta ("nao houve guia"), e nao
     ausencia — o campo nasce zerado de proposito. Sem a marca, `v || null` mandaria nulo
     e a hidratacao devolveria 0 de qualquer forma, mas por acidente, nao por regra.
     ⚠ `data_abate` E 'texto' como as outras datas deste mapa (`data_envio`,
     `data_adiantamento`): o front trafega ISO em string e o `::date` da RPC converte. */
  { col: 'custo_frete_no_boitel',        campo: 'custoFreteNoBoitel',          tipo: 'bool' },
  { col: 'despesas_abate_no_boitel',     campo: 'despesasAbateNoBoitel',       tipo: 'bool' },
  { col: 'notas_envio_no_boitel',        campo: 'notasEnvioNoBoitel',          tipo: 'bool' },
  { col: 'custo_notas_envio',            campo: 'custoNotasEnvio',             tipo: 'num', zeroEValor: true },
  { col: 'data_abate',                   campo: 'dataAbate',                   tipo: 'texto' },
  { col: 'outros_no_boitel',             campo: 'outrosNoBoitel',              tipo: 'bool' },
  /* ─── OS TRES FATOS DO PAPEL — PR-OC-VENDA-REALIZADO-02E (mapa 31 -> 34) ────────
     ⚠ `zeroEValor` NOS TRES, e aqui a marca faz MAIS do que costuma: sem ela o
     `v || null` do payload mandaria nulo para o valor 0, e a hidratacao devolveria 0 —
     apagando a diferenca entre "abateu zero" e "ainda nao abateu". Com ela, `undefined`
     sobrevive ao round-trip nos dois sentidos, que e' o que as colunas nullable pedem. */
  { col: 'qtd_abatida',                  campo: 'qtdAbatida',                  tipo: 'int', zeroEValor: true },
  { col: 'valor_total_abate',            campo: 'valorTotalAbate',             tipo: 'num', zeroEValor: true },
  { col: 'acerto_papel',                 campo: 'acertoPapel',                 tipo: 'num', zeroEValor: true },
  { col: 'valor_total_diarias',          campo: 'valorTotalDiarias',           tipo: 'num', zeroEValor: true },
  /* ─── OS DOIS TOTAIS DA BALANCA — PR-OC-VENDA-REALIZADO-02G (mapa 35 -> 37) ─────
     ⚠ `zeroEValor` PELO MESMO MOTIVO DOS QUATRO ANTERIORES: as colunas sao nullable e sem
     default, e `undefined` significa "o papel ainda nao chegou". Sem a marca, o
     `v || null` do payload mandaria nulo tambem para o zero legitimo e a hidratacao o
     devolveria como 0 — apagando a diferenca entre "pesou zero" e "ainda nao pesou".
     ⚠ E ELAS ESTAO NA LISTA BRANCA DA RPC (migration 20260831102614, oraculo
     f4ad99e4...): coluna e lista branca andam SEMPRE em par, e sem esse par o payload
     seria descartado em silencio com a auditoria dizendo que gravou. */
  { col: 'peso_vivo_total_abate',        campo: 'pesoVivoTotalAbate',          tipo: 'num', zeroEValor: true },
  { col: 'arrobas_totais_abate',         campo: 'arrobasTotaisAbate',          tipo: 'num', zeroEValor: true },
];

/** O payload de `oc_salvar_boitel` — a IDA, derivada do mapa. */
export function payloadBoitel(d: BoitelEdicao): Record<string, unknown> {
  const out: Record<string, unknown> = {
    /* ⚠ SEMPRE 'diaria'. O CHECK do banco recusa as outras duas, e o seletor desta tela
       não as oferece — mandar outra coisa seria pedir um erro que a tela já sabe. */
    modalidade_custo: 'diaria',
  };
  for (const c of MAPA_BOITEL) {
    const v = d[c.campo];
    if (c.tipo === 'bool') out[c.col] = !!v;
    else if (c.zeroEValor) out[c.col] = v ?? null;
    else out[c.col] = v || null;
  }
  return out;
}

/** A VOLTA: uma linha de `zoo_operacao_boitel` vira `BoitelEdicao`, pelo mesmo mapa.
 *  ⚠ CABECAS E PESO SAO SOBRESCRITOS PELOS LOTES depois disto (ver `boitelDaVenda` em
 *  LancamentosTab). O peso vem no mapa porque a coluna existe e é gravada; lê-lo aqui é
 *  inofensivo, e omiti-lo criaria a assimetria que o mapa existe para impedir. */
export function boitelDeLinha(linha: Record<string, unknown> | null | undefined): BoitelEdicao | null {
  if (!linha) return null;
  /* ⚠ SEM `as`. O patch é acumulado num parcial e aplicado por `Object.assign` sobre o
     objeto vazio, que já é `BoitelEdicao` — o resultado é atribuível ao tipo sem cast,
     e o zero-cast do projeto continua valendo. */
  const patch: Partial<Record<keyof BoitelEdicao, unknown>> = {};
  for (const c of MAPA_BOITEL) {
    const v = linha[c.col];
    if (c.tipo === 'bool')       patch[c.campo] = !!v;
    else if (c.tipo === 'texto') patch[c.campo] = v == null ? '' : String(v);
    else if (c.zeroEValor)       patch[c.campo] = v == null ? undefined : Number(v);
    else                         patch[c.campo] = v == null ? 0 : Number(v);
  }
  return Object.assign(boitelVazio(), patch);
}

/** Um boitel em branco.
 *  ⚠ SEM CABEÇAS E SEM PESO, e não por esquecimento: os dois DERIVAM DOS LOTES a cada
 *  render, em `LancamentosTab`, e não fazem parte do estado editável. Semeá-los aqui
 *  corrigiria só a primeira abertura — na primeira tecla o estado deixa de ser nulo,
 *  esta função nunca mais é chamada, e o valor semeado congelaria. */
export function boitelVazio(): BoitelEdicao {
  return {
    qtdCabecas: 0, pesoInicial: 0, fazendaOrigem: '', nomeBoitel: '', lote: '', numeroContrato: '',
    dataEnvio: '', quebraViagem: 0, custoOportunidade: 0, dias: 0, gmd: 0,
    rendimentoEntrada: 0, rendimento: 0, modalidadeCusto: 'diaria',
    custoDiaria: 0, custoArroba: 0, percentualParceria: 0, custosExtrasParceria: 0,
    custoFrete: 0, outrosCustos: 0, custoNutricao: 0, custoSanidade: 0, custoNfAbate: 0,
    precoVendaArroba: 0, despesasAbate: 0, formaReceb: 'avista', qtdParcelas: 1, parcelas: [],
    possuiAdiantamento: false, dataAdiantamento: '', pctAdiantamentoDiarias: 0,
    valorAdiantamentoDiarias: 0, valorAdiantamentoSanitario: 0, valorAdiantamentoOutros: 0,
    valorTotalAntecipado: 0, adiantamentoObservacao: '',
    /* ⚠ OS DEFAULTS SAO OS DO BANCO, letra por letra — PR-OC-VENDA-REALIZADO-01A. Uma
       venda boitel NOVA nasce aqui, antes de existir linha em `zoo_operacao_boitel`; se
       estes valores divergissem dos `DEFAULT` da tabela, a tela mostraria uma composicao
       e o primeiro salvamento gravaria outra. Frete FORA do acerto, abate DENTRO, notas
       de envio fora e zeradas — a regra cravada de hoje, agora declarada. */
    custoFreteNoBoitel: false, despesasAbateNoBoitel: true, outrosNoBoitel: true,
    notasEnvioNoBoitel: false, custoNotasEnvio: 0, dataAbate: '',
  };
}

/* ═══ AS CONTAS DESTA TELA ═══════════════════════════════════════════════════════
   ⚠ AS DIÁRIAS E O FATURAMENTO SAÍRAM DAQUI. No 01B eles eram escritos duas vezes — aqui
   e no `derivadosBoitel` —, e as duas cópias divergiam: o painel cobrava a diária do
   animal morto e mostrava o faturamento sem a indenização, enquanto estes blocos não. Dois
   números diferentes para a mesma coisa, na mesma tela. Agora ambos leem `derivadosBoitel`.
   ⚠ O DENOMINADOR NÃO ENCOLHE: o lote continua sendo o lote inteiro nas métricas por
   cabeça. A indenização soma ao faturamento; ela não reduz o tamanho do lote.

   ⚠ O FRETE NÃO ENTRA NO CUSTO DO BOITEL — decisão do Gabriel, e o simulador antigo já
   dizia o mesmo: lá `custoTotalBoitel = cDT + cs + oc` e o frete aparece só no custo
   OPERACIONAL (`cOp = cDT + cs + oc + cf`). Ele é desembolso do produtor, pago por fora.
   ⚠ MAS EM ALGUNS CASOS O BOITEL PAGA O FRETE e o embute na cobrança. Enquanto não houver
   um marcador de QUEM PAGOU, o frete fica fora — a proposta está reportada e o campo
   segue existindo, porque o custo existe de qualquer forma.
   ⚠ `custoTotalDoBoitel` DEIXOU DE EXISTIR — PR-OC-VENDA-NUTRICAO-DUPLICADA-01. Ela
   somava a nutrição por cima das diárias e divergia do motor; tirada a duplicação, ela
   virava `cDT + cs + oc`, que e' letra por letra o `custoTotalBoitel` do
   `derivadosBoitel`. Em vez de manter duas funções com o mesmo corpo, a tela passou a ler
   a do motor: agora os dois numeros sao o MESMO por construcao, e nao por coincidencia.
   ⚠ E O MOTOR ESTAVA CERTO O TEMPO TODO. Ele nunca somou nutrição — o que parecia
   omissão dele era a tela cobrando duas vezes.

   ⚠ `antecipadoTotal` DEIXOU DE EXISTIR — PR-OC-VENDA-BOITEL-ANTECIPADO-NO-MOTOR-01, e
   pela MESMA razão da `custoTotalDoBoitel` logo acima. Ela somava os três campos
   persistidos do adiantamento porque o motor, até então, rederivava o número de um
   percentual que a tabela da OC não guarda. Corrigido o motor, as duas expressões ficaram
   IDÊNTICAS — conferido por md5 do texto normalizado, `bae60d01…` nas duas. Duas cópias
   que hoje concordam são exatamente como esta doença nasce; a tela passou a ler
   `der.valorTotalAntecipadoCalc` e não há mais o que divergir.
   ⚠ CUSTO ZERO: `der` já é o `derivadosBoitel(d)` memoizado desta tela — não há cálculo
   novo, só uma leitura a mais do objeto que já estava em mãos. */

/* ═══ PEÇAS DE FORMA ═════════════════════════════════════════════════════════════ */

/** Campo numérico: vírgula no foco, pt-BR no blur. Mesma mecânica do `IM` do simulador,
 *  nas medidas do repositório (A16: h-8, 12px). */
/* ⚠ `moeda` DELEGA AO CAMPO DO SISTEMA — PR-OC-VENDA-LAYOUT-NEG-01C. A homologacao pediu
   "R$ na frente do numero" (A19) e mandou reusar o existente. Medido: NAO HA adornment de
   prefixo no projeto. O idioma A19 e' o `CampoMoeda` (src/components/ui/campo-moeda.tsx),
   onde o "R$" faz parte do TEXTO formatado por `brl()` e o `parseMoeda` o descarta na
   leitura (`replace(/[^\d.,]/g, '')`). Aquele arquivo diz, em caixa alta:

       ⚠ NAO ESCREVER UM SEGUNDO. Qualquer entrada de dinheiro no sistema usa este campo.

   E era exatamente o que este `CampoNum` estava sendo: um segundo campo de dinheiro, que
   formatava sem o R$ — por isso o valor saia cru. Em vez de acrescentar um prefixo aqui
   (o terceiro jeito), o modo moeda RENDERIZA o campo do sistema por dentro; rotulo, sufixo
   e linha derivada continuam morando neste invólucro, num lugar so'.
   ⚠ O NAO-MONETARIO (dias, GMD, percentuais) continua no caminho de sempre: `casas` e
   `toLocaleString`. Dinheiro tem campo proprio; contagem e percentual nao. */
export function CampoNum({ label, valor, onChange, casas = 2, sufixo, obrigatorio, derivado, desabilitado, titulo, moeda, extra, previsto, separador }: {
  label: string; valor: number; onChange: (v: number) => void; casas?: number;
  sufixo?: string; obrigatorio?: boolean; derivado?: string | null; desabilitado?: boolean;
  /** Campo de dinheiro: usa o `CampoMoeda` do sistema, com o R$ dentro do valor. */
  moeda?: boolean;
  /** Renderizado ABAIXO do campo, indentado na coluna dele — hoje, o `SeletorLado`. */
  extra?: React.ReactNode;
  /* ⚠ SEPARADOR SOB A LINHA INTEIRA — B-05, achado E. No painel de Custos do realizado
     cada celula carrega campo + ajuda + `previsto` + SELETOR, e numa grade de duas colunas
     o seletor ficava a meio caminho entre o campo de cima e o de baixo: nada dizia a qual
     dos dois ele pertencia. A borda fecha o bloco por baixo e amarra o seletor ao campo
     dele. Custa ~1px de altura por linha (borda) mais o `pb-2`. */
  separador?: boolean;
  /* ⚠ O QUE A PROJECAO DIZIA — PR-OC-VENDA-REALIZADO-02. So' aparece no modo realizado, e
     em AMBAR: e' o numero projetado, e a cor ja e' a marca da projecao em toda a tela. Ele
     nao compete com o campo — fica embaixo, 9px, para que digitar o real seja um ato de
     COMPARAR, e nao de lembrar. */
  previsto?: string | null;
  /* ⚠ O TEXTO INTEGRAL quando o rotulo visivel foi encurtado — PR-...-01B. O `label` e' o
     que cabe numa linha; `titulo` e' o que o campo REALMENTE pergunta, e vai no `title`.
     Omitido, o proprio label serve de titulo: nunca fica sem. */
  titulo?: string;
}) {
  const fmt = (v: number) => v ? v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) : '';
  /* ⚠ `rascunho` E' NULO QUANDO NAO SE ESTA DIGITANDO, e ai o campo mostra o valor
     formatado. Guardar o texto sempre exigiria sincronizar estado com prop — e' o
     caminho que leva a `setState` durante o render. Aqui nao ha o que sincronizar:
     fora do foco, o que aparece e' derivado do valor. */
  const [rascunho, setRascunho] = useState<string | null>(null);
  const parse = (t: string) => {
    let limpo = t.replace(/%/g, '').trim();
    if (limpo.includes(',')) limpo = limpo.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(limpo);
    return isNaN(n) ? 0 : Math.round(n * Math.pow(10, casas)) / Math.pow(10, casas);
  };
  /* ─── ROTULO EM CIMA, CAMPO DO TAMANHO DO CONTEUDO ────────────────────────
     PR-OC-VENDA-MODAIS-PAINEIS-01 (mockup aprovado). Substitui o rotulo-a-esquerda do
     01E, e a troca e' consciente: la' o rotulo alinhado numa coluna de 132px era o que
     dava grade a DUAS colunas de linhas largas; aqui os campos ficam DENTRO de paineis,
     em grade de 2-3 colunas estreitas, e uma coluna de rotulo comeria metade da celula.
     Os dois desenhos respondem "campo veste o conteudo" — este com mais densidade.
     ⚠ O CAMPO ENCOLHEU DE NOVO: 90px numerico, 120px moeda. Numero de 3 digitos nao
     precisa de 150.
     ⚠ `bg-card` NO CAMPO, e nao herdado: o painel tem chao proprio (muted/ambar), e um
     input transparente sumiria dentro dele. E' o campo que salta do painel.
     ⚠ AJUDA EM 9px — excecao consciente ao piso de 10px, na mesma familia da frase do
     veredito: e' texto de APOIO sob um numero que ja esta' no campo, e nunca carrega
     informacao que so' exista ali. */
  return (
      <div className={`min-w-0${separador ? ' border-b border-border/60 pb-2' : ''}`}>
        <Label title={titulo ?? label}
          className="block text-[10px] font-medium text-foreground/90 leading-none whitespace-nowrap overflow-hidden text-ellipsis">
          {label}{obrigatorio && <span className="text-destructive"> *</span>}
        </Label>
        <div className="mt-1 flex items-center gap-1">
          {moeda ? (
            <CampoMoeda valor={valor} onChange={(n) => onChange(n ?? 0)} disabled={desabilitado}
              className="h-8 w-[120px] px-2 text-[12px] tabular-nums text-right bg-card" />
          ) : (
            <Input
              value={rascunho ?? fmt(valor)} disabled={desabilitado} inputMode="decimal"
              onChange={e => { setRascunho(e.target.value); onChange(parse(e.target.value)); }}
              onFocus={() => setRascunho(valor ? String(valor).replace('.', ',') : '')}
              onBlur={() => { if (rascunho !== null) onChange(parse(rascunho)); setRascunho(null); }}
              className="h-8 w-[90px] px-2 text-[12px] tabular-nums text-right bg-card"
            />
          )}
          {sufixo && <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{sufixo}</span>}
        </div>
        {derivado !== undefined && (
          <div className="mt-0.5 text-[9px] text-muted-foreground tabular-nums leading-snug">
            {derivado ?? '—'}
          </div>
        )}
        {previsto && (
          <div className="mt-0.5 text-[9px] tabular-nums leading-snug text-[#854F0B] dark:text-amber-500">
            previsto: {previsto}
          </div>
        )}
        {extra}
      </div>
  );
}

/* ─── CAMPO COM TOGGLE [total | /cab] ─────────────────────────────────────────
   PR-OC-VENDA-REALIZADO-02G, itens 3-5 (mockup aprovado). O papel do frigorifico as vezes
   traz o TOTAL e as vezes a MEDIA — depende do documento. Obrigar a converter de cabeca
   antes de lancar e' o mesmo pedido que o 02D ja tinha recusado nos drivers.

   ⚠ O QUE PERSISTE E SEMPRE O TOTAL, e a media e' PORTA DE ENTRADA. Guardar ora um ora
   outro faria a fonte da verdade depender de como o operador digitou naquele dia; o total
   e' o fato do papel, a media e' leitura dele.
   ⚠ CINCO CASAS SO' NO MODO /cab, e nao e' capricho: com 109 cabecas, uma media de duas
   casas erra o total em dezenas de quilos. Medido no papel vivo — 20,65749 @/cab x 109
   reconstitui 2.251,67 @ exato; 20,66 daria 2.251,94. O A15 (duas casas) continua valendo
   em todo o resto da tela: aqui a precisao E o requisito.
   ⚠ O TOGGLE NAO PERSISTE: e' modo de leitura, e comeca sempre em `total` — o formato do
   fato. Estado local, module-level, sem tocar o `BoitelEdicao`. */
function CampoTotalOuMedia({ label, titulo, total, divisor, onChangeTotal, sufixoTotal, sufixoMedia,
  casasMedia = 5, moeda, desabilitado, obrigatorio, previsto, contexto, separador }: {
  label: string; titulo?: string;
  total: number;
  /** Cabecas abatidas — ou cabecas x dias, no caso das diarias. */
  divisor: number;
  onChangeTotal: (v: number) => void;
  sufixoTotal?: string; sufixoMedia?: string;
  casasMedia?: number; moeda?: boolean; desabilitado?: boolean; obrigatorio?: boolean;
  previsto?: string | null;
  /** Texto extra da ajuda no modo total (ex.: "109 cab × 104 dias"). */
  contexto?: string | null;
  /** Fecha a linha por baixo — mesmo contrato do `CampoNum`; ver a nota la'. */
  separador?: boolean;
}) {
  const [modo, setModo] = useState<'total' | 'cab'>('total');
  const media = divisor > 0 ? total / divisor : 0;
  const nMedia = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: casasMedia, maximumFractionDigits: casasMedia });

  return (
    <div className={`min-w-0${separador ? ' border-b border-border/60 pb-2' : ''}`}>
      <div className="flex items-center gap-1.5">
        <Label title={titulo ?? label}
          className="block text-[10px] font-medium text-foreground/90 leading-none whitespace-nowrap overflow-hidden text-ellipsis">
          {label}{obrigatorio && <span className="text-destructive"> *</span>}
        </Label>
        {/* Pilula dupla colada ao rotulo — o idioma do `SeletorLado`, em escala menor. */}
        <div className="inline-flex shrink-0 items-center overflow-hidden rounded-full border">
          {(['total', 'cab'] as const).map(m => (
            <button key={m} type="button" onClick={() => setModo(m)}
              className={`px-1.5 py-px text-[9px] leading-4 transition-colors ${
                modo === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
              {m === 'total' ? 'total' : (sufixoMedia ?? '/cab')}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1">
        {modo === 'total' ? (
          <CampoNumBase valor={total} onChange={onChangeTotal} casas={2} moeda={moeda}
            sufixo={sufixoTotal} desabilitado={desabilitado} />
        ) : (
          /* ⚠ A MEDIA ESCREVE O TOTAL, e nao um campo proprio: `media x divisor`, e o que
             desce para o banco continua sendo o total. */
          <CampoNumBase valor={media} onChange={v => onChangeTotal(Math.round(v * divisor * 100) / 100)}
            casas={casasMedia} moeda={moeda} sufixo={sufixoMedia} desabilitado={desabilitado} />
        )}
      </div>
      <div className="mt-0.5 text-[9px] text-muted-foreground tabular-nums leading-snug">
        {divisor > 0
          ? (modo === 'total'
              ? `${nMedia(media)}${sufixoMedia ? ' ' + sufixoMedia : ''}${contexto ? ' · ' + contexto : ''}`
              : `total ${moeda ? formatMoeda(total) : n2(total)}${contexto ? ' · ' + contexto : ''}`)
          : '—'}
      </div>
      {previsto && (
        <div className="mt-0.5 text-[9px] tabular-nums leading-snug text-[#854F0B] dark:text-amber-500">
          previsto: {previsto}
        </div>
      )}
    </div>
  );
}

/* O input nu, sem rotulo nem ajuda — o miolo que `CampoNum` e `CampoTotalOuMedia`
   compartilham. Extraido para o toggle nao reimplementar virgula-no-foco e blur-format. */
function CampoNumBase({ valor, onChange, casas, sufixo, moeda, desabilitado }: {
  valor: number; onChange: (v: number) => void; casas: number;
  sufixo?: string; moeda?: boolean; desabilitado?: boolean;
}) {
  const fmt = (v: number) => v ? v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) : '';
  const [rascunho, setRascunho] = useState<string | null>(null);
  const parse = (t: string) => {
    let limpo = t.replace(/%/g, '').trim();
    if (limpo.includes(',')) limpo = limpo.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(limpo);
    return isNaN(n) ? 0 : Math.round(n * Math.pow(10, casas)) / Math.pow(10, casas);
  };
  return (
    <div className="flex items-center gap-1">
      {moeda && casas === 2 ? (
        <CampoMoeda valor={valor} onChange={n => onChange(n ?? 0)} disabled={desabilitado}
          className="h-8 w-[120px] px-2 text-[12px] tabular-nums text-right bg-card" />
      ) : (
        <Input value={rascunho ?? fmt(valor)} disabled={desabilitado} inputMode="decimal"
          onChange={e => { setRascunho(e.target.value); onChange(parse(e.target.value)); }}
          onFocus={() => setRascunho(valor ? String(valor).replace('.', ',') : '')}
          onBlur={() => { if (rascunho !== null) onChange(parse(rascunho)); setRascunho(null); }}
          className={`h-8 ${casas > 2 ? 'w-[120px]' : 'w-[110px]'} px-2 text-[12px] tabular-nums text-right bg-card`} />
      )}
      {sufixo && <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{sufixo}</span>}
    </div>
  );
}

/* ─── O PAINEL DE UM GRUPO ─────────────────────────────────────────────────────
   PR-OC-VENDA-MODAIS-PAINEIS-01 (mockup aprovado). Cada grupo ganha CHAO proprio, e nao
   so' um titulo com filete: dentro de um dialogo com sete campos, o filete separava sem
   agrupar — o olho nao sabia onde um grupo acabava.
   ⚠ O TOM CARREGA SIGNIFICADO, e nao decoracao: `ambar` e' o mesmo do fato-x-projecao
   (PR-...-01D), entao o painel de CUSTOS ja se le' como territorio do que ainda vai
   acontecer. `azul` e' o `primary` da faixa do shell — a marca da casa. `cinza` e' o
   neutro de apoio.
   ⚠ O EXTRA VAI NO TITULO, a' direita: o custo/cab e' o veredito do painel de Custos, e
   no titulo ele e' lido junto com o nome do grupo em vez de virar mais um campo. */
function Painel({ titulo, tom, icone, extra, children }: {
  titulo: string; tom: 'azul' | 'ambar' | 'cinza';
  icone?: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode;
}) {
  const chao = tom === 'ambar' ? 'bg-amber-50/30 dark:bg-amber-950/15 border-amber-500/40'
    : tom === 'azul' ? 'bg-muted/50 border-border'
    : 'bg-muted/30 border-border';
  const corTitulo = tom === 'ambar' ? 'text-[#854F0B] dark:text-amber-500'
    : tom === 'azul' ? 'text-primary'
    : 'text-muted-foreground';
  return (
    <section className={`rounded-md border p-2.5 min-w-0 ${chao}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className={`flex items-center gap-1.5 min-w-0 text-[12px] font-medium leading-none ${corTitulo}`}>
          {icone}
          <span className="truncate">{titulo}</span>
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

/* ─── DE QUE LADO DO ACERTO ────────────────────────────────────────────────────
   PR-OC-VENDA-REALIZADO-01A. Duas opcoes, e a escolha muda ONDE a despesa e' cobrada:
   "boitel" desconta do repasse; "produtor" fica fora do acerto e vira previsao de caixa
   na aba Financeiro.
   ⚠ O IDIOMA E O DO SIM/NAO DO ADIANTAMENTO — dois `<Button>` com
   `variant={ativo ? 'default' : 'outline'}`, o precedente vivo deste arquivo. A casa TEM
   um `ToggleGroup` em `ui/`, mas ele nao e' usado neste padrao em lugar nenhum do modal;
   convergir os dois e' PR proprio, e nao carona deste.
   ⚠ VAI NA LINHA ABAIXO DO CAMPO, indentado na coluna dele — nao cabe ao lado: rotulo 132
   + campo 150 + sufixo 46 ja da' 328 numa coluna de 352, e o seletor estouraria. Mesmo
   lugar das ajudas derivadas, e pela mesma razao: fala daquele numero.
   ⚠ O `title` CARREGA A EXPLICACAO INTEIRA — o piso de 10px vale para o texto da tela,
   nao para o que o mouse revela. */
function SeletorLado({ noBoitel, onChange, desabilitado }: {
  noBoitel: boolean; onChange: (v: boolean) => void; desabilitado?: boolean;
}) {
  /* ⚠ PILULAS COLADAS, e nao dois botoes soltos: sao UMA escolha de duas faces, e o
     espaco entre elas as fazia ler como duas acoes independentes. */
  return (
    <div className="mt-1 inline-flex w-fit items-center overflow-hidden rounded-full border"
      title="boitel = desconta do acerto · produtor = caixa próprio, vira previsão no financeiro">
      <button type="button" disabled={desabilitado} onClick={() => onChange(true)}
        className={`px-2 py-px text-[10px] leading-4 transition-colors disabled:cursor-not-allowed ${
          noBoitel ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>boitel</button>
      <button type="button" disabled={desabilitado} onClick={() => onChange(false)}
        className={`px-2 py-px text-[10px] leading-4 transition-colors disabled:cursor-not-allowed ${
          !noBoitel ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>produtor</button>
    </div>
  );
}

/* Celula do formulario para o que NAO e' `CampoNum` (Select, DatePicker, Input de texto).
   ⚠ ROTULO EM CIMA, IGUAL AO `CampoNum` — PR-OC-VENDA-REALIZADO-02C. Ela ficou para tras
   quando o PR dos paineis migrou o `CampoNum` de rotulo-a-esquerda para rotulo-em-cima:
   continuou reservando uma coluna FIXA de 132px para o rotulo MAIS o campo ao lado, e
   dentro de uma celula de painel (~157px) os dois nao cabiam. O resultado foi o que a
   homologacao viu — "Diarias no periodo" sobrepondo o proprio valor e a Modalidade
   renderizando deslocada. Os TRES controles quebrados eram exatamente os tres que
   passavam por aqui.
   ⚠ A LICAO, escrita para nao repetir: quando o idioma de um campo muda, TODOS os que
   compartilham a grade mudam junto — um que fique no formato antigo nao "fica feio", ele
   estoura a celula do vizinho. */
function LinhaCampo({ label, largura, children, span }: {
  label: string; largura: string; children: React.ReactNode; span?: boolean;
}) {
  return (
    <div className={`min-w-0 ${span ? 'col-span-2' : ''}`}>
      <Label className="block text-[10px] font-medium text-foreground/90 leading-none whitespace-nowrap overflow-hidden text-ellipsis">
        {label}
      </Label>
      <div className={`mt-1 ${largura}`}>{children}</div>
    </div>
  );
}

/* ─── A SECAO DO ACORDEAO ──────────────────────────────────────────────────────
   FECHADA: uma linha — seta, nome e o resumo à direita. O resumo diz o conteúdo sem
   abrir, e é a mesma informação que os botões antigos já mostravam.
   ⚠ PENDENCIA EM AMBAR NA LINHA FECHADA. O operador vê o que falta sem abrir nada, e é
   melhor que o painel dizer: aqui ele está a um clique de resolver. */
/* ─── GRUPO DENTRO DE UM CARD ──────────────────────────────────────────────────
   PR-OC-VENDA-LAYOUT-NEG-01, item 2. Isto era `SecaoAcordeao`: um botao que abria e
   fechava, com o resumo da linha fechada a' direita.

   ⚠ O ACORDEAO SAIU INTEIRO, e o motivo e' que ele resolvia um problema que deixou de
   existir. Ele nasceu para caber quatro secoes numa coluna sem rolagem infinita; com os
   grupos distribuidos em DOIS cards lado a lado, tudo cabe aberto — e um clique para ver
   o que ja cabe na tela e' trabalho sem resposta.
   ⚠ O RESUMO CONTINUA, e agora ao lado do titulo: com a secao sempre aberta ele deixou
   de ser "o que ha aqui dentro" e virou o veredito do grupo (o total, o que falta). E'
   ele que carrega o AMBAR da pendencia, que era a unica coisa do acordeao que informava
   sem precisar de clique.
   ⚠ TITULO 10px/400 muted, como pede o item 2 — o card e' que tem nome; o grupo e'
   subdivisao dentro dele. */
/* ═══ AS DUAS METADES DO PLANEJAMENTO ════════════════════════════════════════════
   PR-OC-VENDA-LAYOUT-NEG-01B (forma final, mockup aprovado). A aba deixou de ter campos:
   ela mostra o RESUMO de cada grupo e a edicao acontece num dialogo por grupo.

   ⚠ POR QUE O DIALOGO, E NAO O CAMPO NA ABA. Com os campos na aba, cada tecla subia ate'
   `LancamentosTab` (`onBoitelChange` -> estado do pai -> shell -> aba inteira). Alem do
   custo, era isso que EXERCITAVA o remount do `NegociacaoOC` aninhado
   (PR-OC-LOTES-ANINHAMENTO-01) a cada digito. Com estado LOCAL no dialogo, a digitacao
   nao atravessa: ela vive dentro do modal e so' desce no Aplicar. A causa-raiz da
   familia do foco perdido some por construcao, e nao por cuidado.
   ⚠ APLICAR NAO GRAVA NO BANCO. Ele despeja o estado local em `onChange`, exatamente
   como os campos faziam — quem persiste continua sendo o "Salvar negociação" do rodape.
   Nenhum caminho novo de escrita.
   ⚠ CANCELAR DESCARTA, e por isso o estado local nasce no MOUNT a partir do valor
   vigente: fechar sem aplicar tem de deixar a aba como estava. */

const GRUPOS = {
  desempenho: { card: 'A', titulo: 'Desempenho', tom: 'azul' },
  custos: { card: 'A', titulo: 'Custos', tom: 'ambar' },
  comercializacao: { card: 'B', titulo: 'Comercialização', tom: 'azul' },
  adiantamento: { card: 'B', titulo: 'Adiantamento', tom: 'cinza' },
} as const;
type IdGrupo = keyof typeof GRUPOS;
type IdCard = 'A' | 'B';
/** Um numero do cartao. `pendente` = falta o dado que o sustenta (ambar + traco). */
interface Indicador { rotulo: string; valor: string; pendente?: boolean;
  /** O nome inteiro, quando o rotulo visivel foi encurtado — mesmo contrato do `CampoNum`. */
  titulo?: string;
  /* ⚠ A VARIACAO CONTRA A PROJECAO — 02H item G. So' existe no cartao Realizado e so'
     quando ha projecao completa para comparar. `bom` e' VEREDITO, nunca sinal cru: cada
     linha declara o que e' bom PARA ELA (GMD a mais e' bom, dia a mais e' ruim), a regra
     que `BoitelComparacoes` ja tinha fixado. `null` = variou zero, e ai nao ha veredito. */
  delta?: { texto: string; bom: boolean | null } }
const TITULO_CARD: Record<IdCard, string> = {
  A: 'Desempenho e Custos',
  B: 'Comercialização e Adiantamento',
};

/* Os INDICADORES de cada cartao — o que a aba mostra sem abrir nada.
   ⚠ SEIS E DOIS, e nao um por grupo. Ate' aqui cada cartao trazia UMA frase por grupo
   ("GMD 1,500 · 110 dias · RC 55,00%"), herdada da linha fechada do acordeao. Frase
   resume; indicador nomeado se COMPARA — e' o que o operador faz com estes numeros.

   ⚠ TODOS SAEM DE `derivadosBoitel`, e nenhum e' calculado aqui:
       Custo/cab      = custoTotalBoitel / cabecas
       Custo @ prod.  = `cPArr`, que o motor ja exporta (`cOp / aP`) e veio VERBATIM do
                        simulador (BoitelPlanningDialog.tsx:117). O painel longo ja o
                        mostra como "Custo da arroba" — e' o mesmo numero, e nao uma
                        segunda conta com o mesmo nome.
   ⚠ A DIVISAO POR CABECAS FICA AQUI de proposito: e' apresentacao de um total que o
   motor ja deu, e nao regra. Regra nova vira funcao irma — foi o que `comparativoOportunidade`
   e `unitariosDoLiquido` fizeram.
   ⚠ TRACO, NUNCA ZERO: sem o dado que sustenta a conta, o indicador nao imprime numero —
   ele diz que falta, em ambar. */
function indicadoresDoBoitel(d: BoitelEdicao, modoRealizado?: boolean, projetado?: BoitelEdicao | null): Record<IdCard, Indicador[]> {
  const der = derivadosBoitel(d);
  const qtd = d.qtdCabecas || 0;
  const temDesempenho = d.dias > 0 && d.gmd > 0 && d.rendimento > 0;
  const temCusto = d.custoDiaria > 0;
  const temPreco = d.precoVendaArroba > 0;
  const custoCab = qtd > 0 && der.custoTotalBoitel > 0 ? der.custoTotalBoitel / qtd : null;
  const suf = modoRealizado ? 'real.' : 'proj.';
  const sufLongo = modoRealizado ? 'Realizado' : 'Projetado';
  /* ⚠ O GMD E O RC DO REALIZADO SAO OS EFETIVOS — 02G/02H. No realizado o papel manda:
     `gmd` e `rendimento` guardados sao a premissa herdada da projecao, e mostra-los aqui
     poria dois numeros para a mesma coisa na mesma tela (o modal ja exibe o efetivo).
     Na projecao os dois pares sao IDENTICOS por construcao — `pf = pi + gmd x dias` faz
     `gmdEfetivo` voltar a ser `gmd` —, entao a distincao so' morde no realizado. */
  const gmdMostrado = modoRealizado ? der.gmdEfetivo : d.gmd;
  const rcMostrado  = modoRealizado ? der.rcEfetivo  : d.rendimento;
  /* ⚠ A DIARIA TAMBEM ERA COPIA — B-07 item 3, a varredura completando a decisao 1 do
     02H. No realizado o FATO e' o total (`valorTotalDiarias`); a tarifa e' o que se
     descobre dividindo. O campo do modal ja escreve as duas juntas, mas a linha realizada
     NASCE COPIANDO a projecao: enquanto o operador nao abrir o modal de Custos, o cartao
     mostrava a tarifa NEGOCIADA (19,68) ao lado de um total que dizia outra coisa.
     ⚠ O DIVISOR E `cabAbate x dias`, EXATAMENTE o do campo (`CampoTotalOuMedia` das
     Diarias): assim o cartao e o modal nao podem discordar — a mesma divisao, a mesma
     base. Medido no papel: 214.590,48 / (109 x 104) = R$ 18,93/cab/dia, que e' o que o
     acerto cobra; por 110 dariam 18,76, que nao esta escrito em lugar nenhum.
     ⚠ SO' COM O FATO NA MAO. Sem `valorTotalDiarias` a tarifa digitada continua sendo a
     resposta certa — reconstitui-la de um `cDT` derivado seria dividir por uma base
     diferente da que o multiplicou. */
  const diariaMostrada = modoRealizado && d.valorTotalDiarias != null && (der.cabAbate * d.dias) > 0
    ? d.valorTotalDiarias / (der.cabAbate * d.dias)
    : d.custoDiaria;

  /* ⚠ A VARIACAO SO' EXISTE COM OS DOIS MUNDOS NA MAO — item G. Sem projecao completa nao
     ha contra o que comparar, e inventar uma base seria pior que nao comparar.
     ⚠ `maiorEMelhor` E' DECLARADO POR LINHA, e e' a regra ja registrada em
     `BoitelComparacoes`: a cor traduz o que a variacao SIGNIFICA para aquele indicador,
     nao o sinal dela. Dia a mais e' pior; GMD a mais e' melhor; custo a mais e' pior.
     ⚠ ZERO NAO TEM VEREDITO (`bom: null`): "manteve" nao e' vitoria nem derrota, e pintar
     empate de verde faria a cor mentir por arredondamento. */
  const derP = modoRealizado && projetado ? derivadosBoitel(projetado) : null;
  /* ⚠ SO' A VARIACAO, SEM O "prev." — B-08 item 2, homologacao do Gabriel. A linha trazia
     `prev. R$ 2.178,80 · −R$ 214,10` em 9px dentro de uma celula de ~117px: dois numeros
     de dinheiro nao cabem lado a lado ali, e o par quebrava ou atropelava o vizinho.
     ⚠ E O PREVISTO NAO SE PERDE — ele esta' no cartao de Projecao, a 14px de distancia,
     na mesma linha e no mesmo rotulo. Repeti-lo aqui era a terceira copia do mesmo numero
     na mesma tela; o que so' existe nesta linha e' a VARIACAO.
     ⚠ O PERCENTUAL ENTRA JUNTO porque ele e' o que da escala: "−R$ 214,10" nao diz se e'
     muito, "−9,8%" diz. Omitido quando a base nao sustenta divisao. */
  const delta = (atual: number, anterior: number | null, maiorEMelhor: boolean,
                 fmt: (v: number) => string): Indicador['delta'] => {
    if (derP == null || anterior == null || !(anterior > 0)) return undefined;
    const dif = atual - anterior;
    const sinal = dif > 0 ? '+' : dif < 0 ? '−' : '';
    const p = Math.abs(dif) < 1e-9 ? '' : ` (${sinal}${(Math.abs(dif) / anterior * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)`;
    return {
      texto: `${sinal}${fmt(Math.abs(dif))}${p}`,
      bom: Math.abs(dif) < 1e-9 ? null : (dif > 0) === maiorEMelhor,
    };
  };
  const pCustoCab = derP && (projetado?.qtdCabecas ?? 0) > 0 && derP.custoTotalBoitel > 0
    ? derP.custoTotalBoitel / (projetado?.qtdCabecas ?? 1) : null;

  return {
    A: [
      { rotulo: 'GMD',           valor: temDesempenho ? `${n3(gmdMostrado)} kg` : '—', pendente: !temDesempenho,
        delta: delta(gmdMostrado, projetado?.gmd ?? null, true, n3) },
      { rotulo: 'Dias',          valor: temDesempenho ? String(d.dias) : '—',    pendente: !temDesempenho,
        delta: delta(d.dias, projetado?.dias ?? null, false, v => String(Math.round(v))) },
      { rotulo: 'RC saída',      valor: temDesempenho ? `${n2(rcMostrado)}%` : '—', pendente: !temDesempenho,
        delta: delta(rcMostrado, projetado?.rendimento ?? null, true, n2) },
      { rotulo: 'Diária',        valor: temCusto ? formatMoeda(diariaMostrada) : '—', pendente: !temCusto,
        delta: delta(diariaMostrada, projetado?.custoDiaria ?? null, false, formatMoeda) },
      /* ⚠ "Custo/cab" DIVIDE PELO LOTE, e nao pelas abatidas — a mesma divisao de aguas
         do 02H item L. O custo do boitel e' de quem ESTEVE la': diaria, sanidade e outros
         correram para o lote inteiro, inclusive para o animal que morreu no meio e para o
         que ficou no abate parcial. Dividir por `cabAbate` diria que os que foram ao
         gancho pagaram a estadia dos que nao foram. */
      { rotulo: 'Custo/cab',     valor: custoCab == null ? '—' : formatMoeda(custoCab), pendente: !temCusto,
        delta: custoCab == null ? undefined : delta(custoCab, pCustoCab, false, formatMoeda) },
      { rotulo: 'Custo @ prod.', valor: der.cPArr > 0 ? formatMoeda(der.cPArr) : '—', pendente: !temCusto,
        delta: delta(der.cPArr, derP?.cPArr ?? null, false, formatMoeda) },
    ],
    /* ⚠ O ADIANTADO SAIU DAQUI — decisao do Gabriel. Ele continua no modal, onde se
       digita; o cartao guarda o que a Comercializacao PRODUZ. Com ele fora, o unico
       numero que era fato saiu junto, e a marca "(fato)" nao tem hoje o que marcar —
       ela volta quando voltar um fato ao resumo (o REALIZADO). */
    /* ⚠ OS ROTULOS DIZEM O QUE SAO — B-05, achado D. "Preço" e "Fatura" eram curtos
       demais para o que carregam: numa tela que mostra projecao e realizado lado a lado,
       "Fatura" nao diz se e' o faturamento do abate nem de qual cenario. Os nomes agora
       dizem as duas coisas.
       ⚠ O SUFIXO ACOMPANHA O CARTAO, e nao e' fixo: os MESMOS indicadores montam o cartao
       Realizado (`indReal`). Cravar "Projetado" faria o cartao da direita mentir.
       ⚠ FORMA CURTA COM `titulo` INTEGRAL: medido, o nome inteiro nao cabe numa linha na
       celula do cartao (~130px uteis a 10px), e `whitespace-nowrap` no rotulo faria ele
       vazar por cima do vizinho — o defeito que o 01E ja pagou uma vez. */
    B: [
      { rotulo: `Preço venda ${suf}`, titulo: `Preço de Venda ${sufLongo}`,
        valor: temPreco ? `${formatMoeda(d.precoVendaArroba)}/@` : '—', pendente: !temPreco,
        delta: delta(d.precoVendaArroba, projetado?.precoVendaArroba ?? null, true, formatMoeda) },
      { rotulo: `Faturamento abate ${suf}`, titulo: `Faturamento no Abate ${sufLongo}`,
        valor: der.fba > 0 ? formatMoeda(der.fba) : '—', pendente: !temPreco,
        delta: delta(der.fba, derP?.fba ?? null, true, formatMoeda) },
    ],
  };
}

/* Os CAMPOS de cada grupo. Recebe o estado e o `set` de QUEM O RENDERIZA — na forma
   final, sempre o dialogo, com o seu estado local.
   ⚠ OS ELEMENTOS SAO OS MESMOS E NA MESMA ORDEM. O que mudou foi a FONTE do `d` e do
   `set`; nenhum campo trocou de lugar dentro do seu grupo. E' a licao do revert do
   abate: reordenar a sequencia de leitura dentro de um grupo e' mudanca de conteudo
   disfarcada de layout. */
function corposDoBoitel(d: BoitelEdicao, set: <K extends keyof BoitelEdicao>(k: K, v: BoitelEdicao[K]) => void,
  onChange: (proximo: BoitelEdicao) => void, somenteLeitura?: boolean,
  modoRealizado?: boolean, projetado?: BoitelEdicao | null, dataEntrada?: string | null) {
  const der = derivadosBoitel(d);
  /* ⚠ AS ABATIDAS MANDAM NOS DERIVADOS POR CABECA — 02E. Com abate parcial, dividir pelo
     que SAIU do boitel daria peso medio e valor/cab de um rebanho que nao foi abatido.
     Vazia (projetado, ou realizado sem parcial), vale `sairam`.
     ⚠ VEM DO MOTOR desde o 02H item L — a conta era escrita aqui E la'. Uma so'. */
  const cabAbate = der.cabAbate;
  /* Os dias entre a entrada do lote e o abate — `null` sem uma das pontas. Nunca lanca:
     data invalida devolve null, como `dataMaisDias` do shell ja faz do outro lado. */
  const diasDaData = (() => {
    if (!dataEntrada || !d.dataAbate) return null;
    const a = new Date(`${dataEntrada}T00:00:00`), b = new Date(`${d.dataAbate}T00:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    const n = Math.round((b.getTime() - a.getTime()) / 86400000);
    return n > 0 ? n : null;
  })();
  const derP = projetado ? derivadosBoitel(projetado) : null;
  /* O "previsto: X" so' existe quando ha projecao para comparar E o modo e' o realizado. */
  const prev = (fn: (p: BoitelEdicao, x: ReturnType<typeof derivadosBoitel>) => string | null): string | null =>
    (modoRealizado && projetado && derP) ? fn(projetado, derP) : null;
  const qtd = d.qtdCabecas || 0;
  const sairam = cabecasQueSairam(d);
  const diarias = der.cDT;
  const corpos: Record<string, React.ReactNode> = {
    desempenho: (<><div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {modoRealizado && (
            /* ⚠ CABECAS ABATIDAS — o TERCEIRO numero (02E). Negociadas menos mortes nao
               bastava: no ABATE PARCIAL animais doentes ficam no boitel e o acerto deles
               vem depois. `qtd_abatida` e' coluna propria porque o saldo NAO pode virar
               "morte" — morte propaga ao rebanho.
               ⚠ ELA MANDA NOS DERIVADOS POR CABECA: e' o rebanho que de fato foi a'
               balanca. Vazia, vale `sairam`, o comportamento de sempre. */
            <CampoNum desabilitado={somenteLeitura} label="Cabeças abatidas" titulo="Cabeças efetivamente abatidas — do papel do frigorífico"
              valor={d.qtdAbatida ?? der.sairam} casas={0} obrigatorio
              onChange={v => set('qtdAbatida', v)}
              derivado={`previsto: ${d.qtdCabecas || 0}${(d.morteQuantidade || 0) > 0 ? ` · ${d.morteQuantidade} mortes no período` : ''}`} />
          )}
          {modoRealizado && (
            <LinhaCampo label="Data do abate" largura="w-[130px]">
              <DatePicker value={d.dataAbate ?? ''} onChange={v => set('dataAbate', v)}
                disabled={somenteLeitura} className="h-8 px-2 text-[12px] bg-card" />
            </LinhaCampo>
          )}
          {/* ⚠ NO REALIZADO OS DIAS DERIVAM DA DATA — 02G item 2. A data de entrada e' a
              `data_operacao` da OC (medido: `data_envio` do boitel esta' NULA em 3 de 3
              registros; se um dia for preenchida, ela e' a mais precisa e a preferencia
              muda AQUI, num lugar so'). No papel vivo: 13/05 -> 25/08 = 104 dias.
              ⚠ MANUAL VENCE, e a ajuda diz que venceu: quem digitou por cima tinha razao
              para isso — reentrada, contagem diferente do boitel — e sobrescrever a
              escolha dele a cada render seria o campo brigando com o operador. */}
          <CampoNum previsto={prev(p => String(p.dias))} desabilitado={somenteLeitura} label="Dias confinamento" titulo="Dias de confinamento" valor={d.dias} onChange={v => onChange({ ...d, dias: v, diasEditadoManual: true })} casas={0} obrigatorio
            derivado={modoRealizado ? (diasDaData != null
              ? (d.diasEditadoManual ? `editado · pela data seriam ${diasDaData}` : `${diasDaData} dias entre entrada e abate`)
              : 'informe a data do abate para derivar') : undefined} />
          {/* ⚠ NO REALIZADO QUEM SE DIGITA E O PESO DE ABATE, e o GMD passa a ser
              DERIVADO — decisao do Gabriel. Ninguem mede GMD no frigorifico; mede-se o
              peso na balanca. A conta e' `(pesoAbate − pesoSaidaFaz) / dias`, e o que se
              PERSISTE continua sendo o `gmd`: `pf = pi + gmd × dias` reconstroi o peso de
              abate sem coluna nova. Uma verdade, gravada uma vez.
              ⚠ NO PROJETADO E O CONTRARIO, e continua como sempre foi: digita-se o GMD
              esperado e o peso final e' que deriva. Os dois modos leem e escrevem o MESMO
              campo — nunca dois. */}
          {modoRealizado ? (
            /* ─── O QUE O PAPEL DIZ — PR-OC-VENDA-REALIZADO-02D ────────────────────
               ⚠ A CONTA INVERTE DE DIRECAO NO REALIZADO. O papel do frigorifico traz
               TOTAIS — peso vivo na balanca, arrobas, valor —, e nao os drivers unitarios
               que a projecao usa. Digitar GMD no acerto seria pedir ao operador que
               desfizesse a conta de cabeca antes de lancar.
               ⚠ 02G: CADA TOTAL ESCREVE A SUA PROPRIA COLUNA. Ate' o 02F eles escreviam
               por cima de `gmd` e `rendimento`, desfazendo a conta de cabeca para caber
               em campos da PROJECAO — e o papel do Santa Clara mostrou o preco disso:
               2.251,67 @ em 109 cabecas nao voltam de nenhum arredondamento do `gmd`.
               Agora o fato e' guardado como fato, e `gmd`/`rendimento` viram EXIBICAO
               PURA aqui — a ajuda diz o que o papel implica, e nada e' reescrito.
               ⚠ O DENOMINADOR E `sairam` (negociadas menos mortes), e nao as negociadas:
               e' o rebanho que de fato foi para a balanca. */
            <CampoTotalOuMedia label="Peso vivo" titulo="Peso vivo na balança — do papel do frigorífico"
              total={der.pvTotal} divisor={cabAbate}
              onChangeTotal={v => set('pesoVivoTotalAbate', v)}
              sufixoTotal="kg" sufixoMedia="kg/cab" desabilitado={somenteLeitura} obrigatorio
              contexto={cabAbate > 0 ? `${cabAbate} cab · GMD ${n3(der.gmdEfetivo)} kg/dia` : null}
              previsto={prev((_, x) => `${n2(x.pvTotal)} kg`)} />
          ) : (
            /* ⚠ AS AJUDAS SAEM DO MOTOR, e nenhuma e' conta escrita aqui: `ganho`, `ple`,
               `aEF`, `aS` e `pf` ja sao exportados por `derivadosBoitel`. Conferidos contra
               os numeros do mockup — 165,0 · 395,76 · 13,60 · 21,01 · 573,00. */
            <CampoNum desabilitado={somenteLeitura} label="GMD" valor={d.gmd} onChange={v => set('gmd', v)} casas={3} sufixo="kg/dia" obrigatorio
              derivado={d.gmd > 0 && d.dias > 0 ? `ganho no período: ${n1(der.ganho)} kg/cab` : null} />
          )}
          {/* ⚠ OS HERDADOS NAO SE EDITAM NO REALIZADO — PR-OC-VENDA-REALIZADO-02C, decisao
              do Gabriel. Quebra de viagem, rendimento de ENTRADA, modalidade e custo de
              oportunidade descrevem a ENTRADA no boitel e a premissa da decisao: nada no
              papel do frigorifico os revisa. Eles valem os da projecao por baixo — a linha
              realizada nasce como copia integral dela —, e some-los da tela declara isso
              em vez de convidar a redigitar o que ninguem mediu de novo.
              ⚠ MESMO CRITERIO DO PESO DE ENTRADA, que ja era herdado. */}
          {!modoRealizado && (
            <CampoNum desabilitado={somenteLeitura} label="Quebra de viagem" valor={d.quebraViagem} onChange={v => set('quebraViagem', v)} sufixo="%"
              derivado={d.pesoInicial > 0 ? `peso pós-viagem: ${n2(der.ple)} kg` : null} />
          )}
          {!modoRealizado && (
            <CampoNum desabilitado={somenteLeitura} label="Rend. entrada" titulo="Rendimento de entrada" valor={d.rendimentoEntrada} onChange={v => set('rendimentoEntrada', v)} sufixo="%"
              derivado={d.rendimentoEntrada > 0 && d.pesoInicial > 0 ? `${n2(der.aEF)} @/cab na entrada` : null} />
          )}
          {modoRealizado ? (
            /* ⚠ ARROBAS TOTAIS, e o RC deriva delas. `rc = carcacaKg / vivoKg`, com
               `carcacaKg = arrobas x 15` — a conversao que o mockup pede na ajuda.
               ⚠ E O RC FECHA DE FATO: ele deixa de ser premissa digitada e passa a ser
               consequencia de dois numeros do papel. */
            <CampoTotalOuMedia label="Arrobas" titulo="Arrobas do abate (@) — do papel do frigorífico"
              total={der.aTS} divisor={cabAbate}
              onChangeTotal={v => set('arrobasTotaisAbate', v)}
              sufixoTotal="@" sufixoMedia="@/cab" desabilitado={somenteLeitura} obrigatorio
              contexto={der.aTS > 0 ? `${n2(der.aTS * 15)} kg carcaça · RC ${n2(der.rcEfetivo)}%` : null}
              previsto={prev((_, x) => `${n2(x.aTS)} @`)} />
          ) : (
            <CampoNum desabilitado={somenteLeitura} label="Rend. saída" titulo="Rendimento de saída" valor={d.rendimento} onChange={v => set('rendimento', v)} sufixo="%" obrigatorio
              derivado={d.rendimento > 0 && der.pf > 0 ? `${n2(der.aS)} @/cab na saída (${n2(der.pf)} kg × ${n2(d.rendimento)}% / 15)` : null} />
          )}
          {/* ⚠ GMC — GANHO DE CARCACA POR DIA, e vem do motor: `gmc` e' exportado por
              `derivadosBoitel` e ja aparece no painel longo com este nome. Nao ha funcao
              irma nem conta na tela — seria um SEGUNDO GMC na mesma operacao.
              ⚠ A BASE E O PESO DE SAIDA DA FAZENDA, por decisao de produto do Gabriel
              (31/08): porteira -> carcaca, com a viagem DENTRO do ciclo. O motor foi
              corrigido no mesmo PR; ver a nota em `derivadosBoitel`. */}
          {!modoRealizado && (
            <div className="min-w-0">
              <Label className="block text-[10px] font-medium text-foreground/90 leading-none whitespace-nowrap">GMC</Label>
              <div className="mt-1 h-8 px-2 flex items-center justify-end rounded-md border bg-muted/40 text-[12px] font-medium tabular-nums">
                {der.gmc > 0 ? n3(der.gmc) : <span className="text-muted-foreground font-normal">—</span>}
              </div>
              <div className="mt-0.5 text-[9px] text-muted-foreground leading-snug">kg carc./dia</div>
            </div>
          )}
        </div>
        {/* ⚠ ABATE PARCIAL — AVISA, NAO TRAVA (02E, v1). Animais doentes ficam no boitel e
            o acerto deles vem depois; travar aqui obrigaria a mentir a quantidade para
            conseguir lancar. O saldo fica dito na tela e vai no evento pelo payload.
            ⚠ O SEGUNDO ACERTO NAO EXISTE AINDA: registrado como
            OC-VENDA-ABATE-PARCIAL-02, e casa com a conta-corrente do boitel — o acerto
            complementar e' um movimento dela, nao uma segunda venda. */}
        {modoRealizado && d.qtdAbatida != null && d.qtdAbatida < der.sairam && (
          <div className="mt-2.5 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 text-[10px] leading-snug text-amber-800 dark:text-amber-200">
            {der.sairam - d.qtdAbatida} cabeça{der.sairam - d.qtdAbatida > 1 ? 's seguem' : ' segue'} no boitel — acerto complementar em aberto.
          </div>
        )}
        {!modoRealizado && (
        <div className="mt-2.5 rounded-md border bg-muted/30 px-2.5 py-2 flex flex-wrap items-end gap-x-4 gap-y-1.5">
          <CampoNum desabilitado={somenteLeitura} label="Custo oportunidade" moeda titulo="Custo de oportunidade (R$/kg de peso de saída)"
            valor={d.custoOportunidade} onChange={v => set('custoOportunidade', v)} sufixo="/kg" />
          <div className="text-[9px] text-muted-foreground tabular-nums leading-snug pb-1.5">
            {der.coT > 0
              ? `${formatMoeda(der.coT)} no lote · ${formatMoeda(der.coT / (qtd || 1))}/cab · ${formatMoeda(d.custoOportunidade)}/kg`
              : 'termo de comparação — não entra no custo'}
          </div>
        </div>
        )}</>),
    custos: (<><div className="grid grid-cols-2 gap-x-3 gap-y-2.5 items-start">
          {!modoRealizado && (
          <LinhaCampo label="Modalidade *" largura="w-[140px]">
            <Select value="diaria" onValueChange={() => { /* só diária — ver os itens desabilitados */ }} disabled={somenteLeitura}>
              <SelectTrigger className="h-8 px-2.5 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="diaria" className="text-[12px]">Diária</SelectItem>
                {/* ⚠ APARECEM E DIZEM QUE NÃO DÁ. Sumir com elas faria o operador achar que
                    o sistema não conhece a modalidade; desabilitadas, ele sabe que existe e
                    que ainda não está pronta. O CHECK do banco recusa as duas de qualquer
                    forma — nenhuma rodou com dado real. */}
                <SelectItem value="arroba" disabled className="text-[12px]">Arroba produzida — ainda não disponível</SelectItem>
                <SelectItem value="parceria" disabled className="text-[12px]">Parceria — ainda não disponível</SelectItem>
              </SelectContent>
            </Select>
          </LinhaCampo>
          )}
          {/* ⚠ NO REALIZADO A ORDEM INVERTE: o FATO na frente, a tarifa como ajuda. O
              papel do acerto traz o total; a tarifa e' que se descobre dividindo. Na
              projecao continua o contrario — la' a tarifa e' o que se negocia, e o total
              deriva dela. Mesmo campo, dois sentidos, como o peso de abate ja fazia. */}
          {modoRealizado ? (
            <CampoTotalOuMedia separador={modoRealizado} label="Diárias" titulo="Valor total das diárias (R$) — do papel do acerto"
              total={d.valorTotalDiarias ?? der.cDT} divisor={cabAbate * d.dias} moeda
              onChangeTotal={v => onChange({ ...d, valorTotalDiarias: v,
                custoDiaria: (cabAbate * d.dias) > 0 ? Math.round((v / (cabAbate * d.dias)) * 100) / 100 : 0 })}
              sufixoTotal="R$" sufixoMedia="/cab/dia" desabilitado={somenteLeitura} obrigatorio
              contexto={(cabAbate * d.dias) > 0 ? `${cabAbate} cab × ${d.dias} dias` : null}
              previsto={prev((_, x) => formatMoeda(x.cDT))} />
          ) : (
            <CampoNum desabilitado={somenteLeitura} label="Diária" moeda valor={d.custoDiaria} onChange={v => set('custoDiaria', v)} sufixo="/cab/dia" obrigatorio />
          )}
          {/* ⚠ ALINHADO NA MESMA GRADE — defeito 2 do 01E. Ele flutuava fora da linha
              porque montava o proprio rotulo em cima; agora usa a `LinhaCampo`, e o valor
              derivado ocupa a coluna do campo como qualquer outro. */}
          {!modoRealizado && (
          <LinhaCampo label="Diárias no período" largura="w-[150px]">
            <div className="h-8 px-2.5 flex items-center justify-end rounded-md border bg-muted/40 text-[13px] font-medium tabular-nums">
              {diarias > 0 ? formatMoeda(diarias) : <span className="text-muted-foreground font-normal">—</span>}
            </div>
            {/* ⚠ CABEÇAS QUE SAÍRAM, não as que entraram. O boitel não cobra diária de
                animal morto — medido no acerto real: 109 × 104 × 18,93. */}
            {/* ⚠ 9px COMO AS IRMAS — adendo 3. Ela era a unica ajuda em 10px, e dentro do
                `LinhaCampo` antigo (rotulo a' esquerda, celula estourada) empilhava
                verticalmente. Corrigido o container, falta a voz: todas as ajudas falam
                no mesmo tom. */}
            <div className="mt-0.5 text-[9px] text-muted-foreground tabular-nums leading-snug">
              {d.custoDiaria > 0 && d.dias > 0
                ? `${sairam} cab. × ${d.dias} dias × ${formatMoeda(d.custoDiaria)}`
                : '—'}
            </div>
          </LinhaCampo>
          )}
          {/* ⚠ NAO HA CAMPO DE NUTRICAO, e a ausencia e' a correcao — PR-OC-VENDA-NUTRICAO-DUPLICADA-01.
              A DIARIA JA E A NUTRICAO: e' o que o boitel cobra para alimentar o gado. Um
              campo "Nutrição (total)" ao lado das Diárias era o mesmo conceito pedido duas
              vezes, e somava em cima. */}
          <CampoNum separador={modoRealizado} previsto={prev(p => formatMoeda(p.custoSanidade))} desabilitado={somenteLeitura} label="Sanidade (total)" moeda valor={d.custoSanidade} onChange={v => set('custoSanidade', v)}
            derivado={porCabeca(d.custoSanidade, qtd)} />
          {/* ⚠ FICA NA TELA E FORA DA SOMA. O frete é custo operacional do produtor, pago
              por fora — o rodapé abaixo não o inclui, e o campo diz isso em vez de deixar
              o operador descobrir subtraindo. */}
          {/* ⚠ A EXPLICACAO LONGA VIROU `title` — PR-...-01B. Ela ocupava tres linhas
              abaixo do campo numa coluna de 180px e empurrava o vizinho; a informacao
              continua inteira, so' deixou de gastar altura. Na tela fica o numero, que e'
              o que se compara de relance. */}
          {/* ⚠ O `title` E O DERIVADO PARARAM DE AFIRMAR O LADO — PR-OC-VENDA-REALIZADO-01A.
              Diziam "custo do produtor, fora do custo do boitel" como se fosse lei; agora
              e' escolha, e quem a responde e' o seletor logo abaixo. Um texto fixo ao lado
              de um seletor que o contradiz e' a nona instrucao sem destino. */}
          {/* ⚠ "ENVIO" NO ROTULO porque o MOMENTO importa — adendo do 02F. Frete e notas
              sao lancados quando os animais EMBARCAM, muito antes do abate; quem abre o
              acerto meses depois procurava por eles achando que faltavam, quando ja
              estavam no financeiro desde o envio. O rotulo diz quando, a ajuda diz onde. */}
          <CampoNum separador={modoRealizado} previsto={prev(p => formatMoeda(p.custoFrete))} desabilitado={somenteLeitura} label="Frete · Envio (total)" moeda
            titulo="Frete do envio (total) — lançado quando os animais embarcam; o seletor diz de que lado do acerto ele mora"
            valor={d.custoFrete} onChange={v => set('custoFrete', v)}
            derivado={`${formatMoeda(d.custoFrete / (qtd || 1))}/cab · lançado no envio`}
            extra={<SeletorLado noBoitel={d.custoFreteNoBoitel ?? false} desabilitado={somenteLeitura}
              onChange={v => set('custoFreteNoBoitel', v)} />} />
          <CampoNum separador={modoRealizado} previsto={prev(p => formatMoeda(p.outrosCustos))} desabilitado={somenteLeitura} label="Outros (total)" moeda valor={d.outrosCustos} onChange={v => set('outrosCustos', v)}
            derivado={`${formatMoeda(d.outrosCustos / (qtd || 1))}/cab`}
            extra={<SeletorLado noBoitel={d.outrosNoBoitel ?? true} desabilitado={somenteLeitura}
              onChange={v => set('outrosNoBoitel', v)} />} />
          {/* ⚠ DESPESA NOVA — PR-OC-VENDA-REALIZADO-01A. As guias de envio (Fundersul,
              Iagro) nao tinham campo: iam somadas em "Outros" e perdiam a identidade, e
              sem identidade nao ha como dizer de que lado do acerto elas moram. Nasce
              zerada e do lado do PRODUTOR, que e' o caso comum. */}
          <CampoNum separador={modoRealizado} desabilitado={somenteLeitura} label="Notas · Envio (total)" moeda
            titulo="Notas do envio (total) — guias tipo Fundersul e Iagro, lançadas quando os animais embarcam"
            valor={d.custoNotasEnvio ?? 0} onChange={v => set('custoNotasEnvio', v)}
            derivado={`${formatMoeda((d.custoNotasEnvio ?? 0) / (qtd || 1))}/cab · lançado no envio`}
            extra={<SeletorLado noBoitel={d.notasEnvioNoBoitel ?? false} desabilitado={somenteLeitura}
              onChange={v => set('notasEnvioNoBoitel', v)} />} />
        </div>
        {/* ─── OPORTUNIDADE: FAIXA PROPRIA, FORA DO PAINEL DE CUSTOS ────────────────
            PR-OC-VENDA-MODAIS-PAINEIS-01. Ele morava DENTRO dos custos e NAO E CUSTO: e'
            termo de comparacao, o que o capital renderia noutro lugar. No painel ambar
            ele se lia como mais uma despesa que o boitel cobra — e a nota ao lado tinha
            de dizer "nao entra no custo" justamente porque o lugar dizia o contrario.
            ⚠ FICA NO MESMO MODAL: quem digita a diaria e' quem julga se valeu, e separar
            os dois obrigaria a abrir dois dialogos para uma decisao so'. */}

        {/* ⚠ A LINHA "OUTROS CUSTOS" DO FINANCEIRO SOMA TRES COLUNAS — `outros_custos`,
            `custo_nutricao` e `custos_extras_parceria` (ver useBoitelOperacoes.ts). Das
            tres, so' `Outros` tem campo aqui: a nutrição saiu por ser a própria diária, e
            os extras de parceria são de uma modalidade que ainda não existe. As duas
            colunas ficam zeradas, então a linha do financeiro é o que se digita em Outros. */}
        {/* ⚠ A NOTA DO "OUTROS" MORREU — decisao do Gabriel (adendo 2). Ela explicava um
            mapeamento do financeiro dentro de um painel de custos zootecnicos; quem
            precisa daquela informacao esta' na aba Financeiro, olhando a linha. */}
        </>),
    comercializacao: (<><div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {modoRealizado ? (
            /* ⚠ O VALOR TOTAL E O FATO DO PAPEL; o preco da arroba e' que deriva dele.
               ⚠ JA LIQUIDO do que o frigorifico somou e tirou — bonus, tributos e
               descontos entram no numero do papel, e a ajuda diz isso para ninguem
               procurar onde lancar cada um.
               ⚠ E FATO GRAVADO, e nao reconstruido — 02E, decisao (a) do Gabriel. O total
               chegou a ser `aTS x preco/@`, e o arredondamento da persistencia introduzia
               centavos: medido R$ 93,76 no papel do mockup, o que faria a conferencia
               acusar divergencia contra o numero que o operador acabou de digitar. Agora
               ele vai para `valor_total_abate`; o preco da arroba SEGUE derivando dele,
               porque preco e' consequencia e total e' fato. */
            <CampoNum desabilitado={somenteLeitura} label="Valor total do abate" titulo="Valor total do abate (R$) — já líquido de bônus, tributos e descontos do frigorífico"
              moeda valor={d.valorTotalAbate ?? Math.round(der.aTS * d.precoVendaArroba * 100) / 100}
              onChange={v => onChange({ ...d, valorTotalAbate: v,
                precoVendaArroba: der.aTS > 0 ? Math.round((v / der.aTS) * 100) / 100 : 0 })}
              derivado={der.aTS > 0 ? `${formatMoeda(d.precoVendaArroba)}/@` : null}
              previsto={prev((p, x) => formatMoeda(Math.round(x.aTS * p.precoVendaArroba * 100) / 100))} />
          ) : (
            <CampoNum desabilitado={somenteLeitura} label="Preço de venda" moeda valor={d.precoVendaArroba} onChange={v => set('precoVendaArroba', v)} sufixo="/@" obrigatorio />
          )}
          {/* ⚠ TOTAL, não por cabeça. Medido no acerto real: DAEMS/GTA de R$ 4.514,57
              contra faturamento de R$ 813 mil. */}
          <CampoNum previsto={prev(p => formatMoeda(p.despesasAbate))} desabilitado={somenteLeitura} label="Desp. notas/docs. abate" moeda titulo="Despesas com notas e documentos no abate" valor={d.despesasAbate} onChange={v => set('despesasAbate', v)}
            extra={<SeletorLado noBoitel={d.despesasAbateNoBoitel ?? true} desabilitado={somenteLeitura}
              onChange={v => set('despesasAbateNoBoitel', v)} />} />
        </div>

        {/* ⚠ A MORTE FICOU AQUI, e os dois campos juntos. É no acerto que ela se sabe e se
            liquida, e a indenização entra no faturamento bruto — o próprio rodapé deste
            modal. A quantidade também reduz as diárias, no modal de Custos. */}
        <div className="rounded-md border bg-card p-2.5 shadow-sm space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/90">Morte no período</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            <CampoNum desabilitado={somenteLeitura} label="Qtd. de mortes" titulo="Quantidade de mortes" valor={d.morteQuantidade ?? 0} onChange={v => set('morteQuantidade', v)} casas={0} />
            <CampoNum desabilitado={somenteLeitura} label="Indenização" moeda titulo="Valor de indenização" valor={d.morteValorIndenizacao ?? 0} onChange={v => set('morteValorIndenizacao', v)} />
          </div>
          {/* ⚠ INDENIZAÇÃO EXISTE MAS NEM SEMPRE ACONTECE — medido: 1 morte, indenização
              zero; o boitel só deixou de cobrar a diária dela. E o lote continua sendo o
              lote inteiro nas métricas por cabeça. */}
          <p className="text-[10px] text-muted-foreground">
            A indenização soma ao faturamento. O lote continua sendo de {qtd || '—'} cabeças
            nas métricas por cabeça; o que muda é a diária, cobrada de {sairam} que saíram.
          </p>
        </div></>),
    adiantamento: (<><div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Houve adiantamento:</span>
          <Button type="button" size="sm" variant={d.possuiAdiantamento ? 'default' : 'outline'} disabled={somenteLeitura}
            className="h-8 text-[12px] px-3" onClick={() => set('possuiAdiantamento', true)}>Sim</Button>
          <Button type="button" size="sm" variant={!d.possuiAdiantamento ? 'default' : 'outline'} disabled={somenteLeitura}
            className="h-8 text-[12px] px-3"
            onClick={() => onChange({ ...d, possuiAdiantamento: false, dataAdiantamento: '',
              valorAdiantamentoDiarias: 0, valorAdiantamentoSanitario: 0, valorAdiantamentoOutros: 0,
              adiantamentoObservacao: '' })}>Não</Button>
        </div>

        {/* Com "não", os campos somem — e o estado deles some junto, no clique acima. */}
        {d.possuiAdiantamento && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            {/* A20 — DatePicker do sistema. */}
            <LinhaCampo label="Data do adiantamento" largura="w-[130px]">
              <DatePicker value={d.dataAdiantamento} onChange={v => set('dataAdiantamento', v)}
                disabled={somenteLeitura} className="h-8 px-2.5 text-[13px]" />
            </LinhaCampo>
            {/* ⚠ VALOR CHEIO DIGITADO, sem dias e sem percentual: o acerto varia por
                contrato e o cálculo é feito fora. O percentual que existia no simulador
                antigo não vem para cá. */}
            <CampoNum desabilitado={somenteLeitura} label="Total adiantado" moeda titulo="Valor total adiantado" valor={d.valorAdiantamentoDiarias} onChange={v => set('valorAdiantamentoDiarias', v)} />
            <CampoNum desabilitado={somenteLeitura} label="Sanitário adiant." moeda titulo="Sanitário adiantado" valor={d.valorAdiantamentoSanitario} onChange={v => set('valorAdiantamentoSanitario', v)} />
            <CampoNum desabilitado={somenteLeitura} label="Outros adiant." moeda titulo="Outros adiantados" valor={d.valorAdiantamentoOutros} onChange={v => set('valorAdiantamentoOutros', v)} />
            <LinhaCampo label="Observação" largura="w-full" span>
              <Input value={d.adiantamentoObservacao} onChange={e => set('adiantamentoObservacao', e.target.value)}
                disabled={somenteLeitura} placeholder="Opcional" className="h-8 px-2.5 text-[13px]" />
            </LinhaCampo>
          </div>
        )}</>),
  };

  return corpos;
}

/* Um degrau da conferencia do acerto — rotulo e valor, sem `truncate` no numero. */
/* ⚠ COR POR DIRECAO — B-05, achado F. Oito linhas de numeros iguais obrigavam a ler o
   sinal de cada uma para saber o que somava e o que subtraia. Entrada em verde, saida em
   vermelho, e o total NEUTRO — ele nao e' entrada nem saida, e' o resultado.
   ⚠ A REGRA DA CASA VALE: a cor ACOMPANHA o sinal que ja esta escrito ("−", "+"), nunca e'
   o unico canal. Quem nao distingue as duas cores le a tabela exatamente como antes.
   ⚠ O FATURAMENTO NAO LEVA "+": ele e' a base de onde tudo parte, e um sinal ali sugeriria
   que ha algo antes dele para somar. A cor sozinha ja diz o lado. */
function LinhaConferencia({ rotulo, valor, direcao }: {
  rotulo: string; valor: string; direcao?: 'entra' | 'sai';
}) {
  return (
    /* ⚠ `leading-[1.45]`, e nao 1.6: com ate' oito itens a diferenca sao 24px, e era o
       que separava o pior caso do realizado do teto de rolagem. */
    <div className="flex items-baseline justify-between gap-6 leading-[1.45]">
      <span className="text-[11px] font-normal text-muted-foreground whitespace-nowrap">{rotulo}</span>
      <span className={`text-[11px] tabular-nums whitespace-nowrap ${
        direcao === 'entra' ? 'text-success' : direcao === 'sai' ? 'text-destructive' : ''}`}>{valor}</span>
    </div>
  );
}

/* ─── OS DOIS MUNDOS ──────────────────────────────────────────────────────────
   PR-OC-VENDA-CASCATA-BOLSO-01 (adendo C), estado PRE-ABATE do mockup aprovado. Os dois
   cartoes de resumo eram irmaos anonimos; agora sao UM cartao — a PROJECAO inteira, com
   moldura ambar — e ao lado dele o REALIZADO, ainda vazio.

   ⚠ E ISSO E O DESENHO, NAO ENFEITE: a aba passa a mostrar os DOIS MUNDOS lado a lado
   desde antes de existir o segundo. Quem abre a venda ve, sem ler nada, que ha um lugar
   reservado para o que vai acontecer — e no dia do abate o realizado nasce SOLIDO ali,
   ao lado do ambar, e o comparativo aparece por diferenca de cor. E' a regra plantada em
   PR-OC-VENDA-LAYOUT-NEG-01D cobrando o seu encaixe.
   ⚠ O REALIZADO NASCE SEM BOTAO, de proposito. Um "lancar realizado" que ainda nao liga
   em lugar nenhum seria a decima instrucao sem destino desta frente — e esta sessao ja
   apagou uma ("marque abaixo" para uma caixa que nunca existiu). O botao nasce na PARTE 2,
   junto com o caminho que ele abre. */

/* Um grupo de indicadores DENTRO do card de projecao, com o seu proprio lapis.
   ⚠ DOIS LAPIS NUM CARTAO SO', e nao um: os dois modais continuam sendo dois, e um lapis
   unico teria de perguntar qual abrir — pergunta que o proprio grupo ja responde. */
function GrupoIndicadores({ titulo, itens, onAbrir, solido }: {
  titulo: string;
  itens: Indicador[];
  onAbrir: () => void;
  /* ⚠ O CARTAO INTEIRO E FATO — 02H item G, a regra fundacional do 01D acordando. O
     realizado nao e' projecao: os valores vao SOLIDOS (`text-foreground`) contra o ambar
     do vizinho, e o comparativo nasce da cor, sem terceira coluna dizendo "previsto x
     realizado".
     ⚠ A MARCA E DO CARTAO, NAO DO ITEM. A `PilulaCenario` ja devolve `null` no realizado,
     e e' a AUSENCIA dela — mais o preto — que diz "isto aconteceu". A marca "(fato)" por
     item, que nascera' no 01D e nunca chegou a ser usada por indicador nenhum (medido:
     zero atribuicoes de `fato` em toda a arvore), sairia repetida seis vezes no mesmo
     cartao e viraria ruido de fundo. Removida com o campo que a alimentava. */
  solido?: boolean;
}) {
  return (
    <button type="button" onClick={onAbrir} title="Clique para editar"
      aria-label={`Editar ${titulo}`}
      className="group w-full min-w-0 text-left cursor-pointer rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/30 transition-colors">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-medium text-muted-foreground leading-none truncate">{titulo}</span>
        <Pencil className="h-3.5 w-3.5 shrink-0 text-secondary" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
        {itens.map(i => (
          <div key={i.rotulo} className="min-w-0">
            <div title={i.titulo ?? i.rotulo}
              className="text-[10px] font-normal text-muted-foreground leading-none whitespace-nowrap">
              {i.rotulo}
            </div>
            {/* ⚠ `whitespace-nowrap`, nunca `truncate`: numero cortado nao e' numero.
                ⚠ A PENDENCIA MANDA NA COR — ver a precedencia em `indicadoresDoBoitel`. */}
            <div className={`mt-1 text-[15px] font-medium leading-none tabular-nums whitespace-nowrap ${
              i.pendente ? 'text-amber-700 dark:text-amber-500'
              : solido ? 'text-foreground'
              : 'text-[#854F0B] dark:text-amber-500'}`}>
              {i.valor}
            </div>
            {/* ⚠ A VARIACAO, EM 9px — item G. Excecao consciente ao piso de 10px, na mesma
                familia das ajudas do `CampoNum`: e' texto de APOIO sob um numero que ja
                esta' ali, e nao carrega informacao que so' exista nela (o previsto tambem
                esta' no cartao ao lado).
                ⚠ COR DE VEREDITO, e o sinal continua escrito: quem nao distingue as cores
                le o "+"/"−" do mesmo jeito. Empate fica neutro — ver a nota do `delta`. */}
            {i.delta && (
              <div className={`mt-0.5 text-[9px] leading-snug tabular-nums whitespace-nowrap ${
                i.delta.bom == null ? 'text-muted-foreground'
                : i.delta.bom ? 'text-success' : 'text-destructive'}`}>
                {i.delta.texto}
              </div>
            )}
          </div>
        ))}
      </div>
    </button>
  );
}

/* ─── O DIALOGO DE UM CARD ─────────────────────────────────────────────────────
   ⚠ MODULE-LEVEL e com estado LOCAL — as duas regras duras juntas. Declarado aqui fora,
   a identidade do tipo e' estavel entre renders do pai; com `useState` semeado no mount,
   digitar nao sai daqui.
   ⚠ `key` NUNCA DE VALOR EDITAVEL: quem monta passa o id do CARD ('A'/'B'), que nao muda
   enquanto se digita. Uma key derivada do que se edita recriaria o input a cada tecla —
   e' a familia do foco perdido, escrita ao contrario.
   ⚠ SEM `useEffect` DE SINCRONIA com a prop: o valor vigente entra uma vez, no mount.
   Sincronizar durante a digitacao traria de volta exatamente o que este desenho evita. */
const ICONE_GRUPO: Record<IdGrupo, React.ReactNode> = {
  desempenho: <TrendingUp className="h-3.5 w-3.5 shrink-0" />,
  custos: <Wallet className="h-3.5 w-3.5 shrink-0" />,
  comercializacao: <Tag className="h-3.5 w-3.5 shrink-0" />,
  adiantamento: <Banknote className="h-3.5 w-3.5 shrink-0" />,
};

function DialogoGrupo({ card, valor, somenteLeitura, onAplicar, onFechar, modoRealizado, projetado, dataEntrada }: {
  card: IdCard;
  valor: BoitelEdicao;
  somenteLeitura?: boolean;
  /** Modo realizado: peso de abate digitado, data do abate, "previsto: X" nos campos. */
  modoRealizado?: boolean;
  /** A linha `projetado`, para o "previsto: X". Sem ela, nada e' comparado. */
  projetado?: BoitelEdicao | null;
  /** `data_operacao` da OC — a entrada do lote no boitel, para derivar os dias. */
  dataEntrada?: string | null;
  onAplicar: (proximo: BoitelEdicao) => void;
  onFechar: () => void;
}) {
  const [local, setLocal] = useState<BoitelEdicao>(valor);
  /* ⚠ O PAPEL PERSISTE desde o 02E (`acerto_papel`, coluna e lista branca no par de
     sempre). Nasce do valor gravado e volta a cada abertura: quem reabrir a operacao ve a
     divergencia que estava la', em vez de um campo vazio que apaga o que se sabia. */
  const [acertoPapel, setAcertoPapel] = useState(valor.acertoPapel ?? 0);
  const set = <K extends keyof BoitelEdicao>(k: K, v: BoitelEdicao[K]) => setLocal(a => ({ ...a, [k]: v }));
  const corpos = corposDoBoitel(local, set, setLocal, somenteLeitura, modoRealizado, projetado, dataEntrada);
  const ids = (Object.keys(GRUPOS) as IdGrupo[]).filter(id => GRUPOS[id].card === card);
  /* O veredito do painel de Custos, no proprio titulo — ver a nota em `Painel`. */
  const derLocal = derivadosBoitel(local);
  /* ⚠ A PREFERENCIA SAIU DAQUI — 02H item M. Esta linha era
     `local.valorTotalAbate ?? derLocal.fba`: a conferencia escolhia o fato POR CONTA
     PROPRIA, enquanto o motor seguia derivando para todos os outros leitores. Era a
     doutrina do 02G violada por um consumidor — e ela nao apareceu antes porque a cascata
     do realizado nao existia para discordar. Agora `fba` ja nasce preferindo o fato, e
     esta linha volta a ser o que sempre devia ter sido: uma leitura.
     ⚠ E O NUMERO NAO MUDOU AQUI, de proposito: com fato, `derLocal.fba` E' o fato (mais a
     indenizacao, que o papel do frigorifico nao contem e o boitel paga a parte).
     ⚠ O ACERTO E O QUE O BOITEL REPASSA — faturamento menos o que ele desconta, mais o
     adiantamento que volta. NAO e' o liquido da venda: aquele ja e' o resultado depois de
     tudo. Duas perguntas, dois numeros. */
  const faturamentoConferencia = derLocal.fba;
  const acertoCalculado = Math.round((faturamentoConferencia - derLocal.descontoDoAcerto + derLocal.valorTotalAntecipadoCalc) * 100) / 100;
  const qtdLocal = local.qtdCabecas || 0;
  const extraCustos = qtdLocal > 0 && derLocal.custoTotalBoitel > 0 ? (
    <span className="shrink-0 text-[11px] tabular-nums text-[#854F0B] dark:text-amber-500">
      {formatMoeda(derLocal.custoTotalBoitel / qtdLocal)}/cab
    </span>
  ) : undefined;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      {/* ⚠ LARGO, NAO ALTO — PR-OC-VENDA-LAYOUT-NEG-01C. Em `max-w-lg` (512px) os grupos
          empilhavam em duas colunas estreitas e o dialogo virava uma coluna alta com
          rolagem interna: o operador perdia a visao do grupo enquanto editava. Em 768px
          cabem TRES colunas de ~230px e cada grupo fecha em poucas linhas.
          ⚠ A REGRA "nunca grid de 3" NAO SE APLICA AQUI, e vale registrar por que: ela
          nasceu para colunas de ~180px do modal de 512px. Com 768px as colunas passam de
          220px — a regra era sobre a LARGURA RESULTANTE, nao sobre o numero 3. */}
      {/* ⚠ A21 NO DIALOGO: cabecalho e rodape FIXOS, so' o corpo rola. Sem
          `flex flex-col` + `flex-1 overflow-y-auto` no meio, o `max-h` faz o dialogo
          INTEIRO rolar e o Aplicar desce para fora da tela — o operador preenche e nao
          acha o botao. `p-0` porque o padding passa a ser de cada faixa.
          ⚠ A LARGURA FICA EM `max-w-3xl` — ver a nota no relatorio: o A1 do PADROES-UI
          diz "Minimo max-w-3xl" e chama modal estreito com campo espremido de defeito.
          Encolher para 2xl violaria o padrao escrito; quem tinha de encolher era o
          CAMPO, e encolheu. */}
      <DialogContent className="max-w-3xl max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col">
        {/* Faixa azul do CompraModalShell — o mesmo cabecalho dos outros dialogos da OC. */}
        <DialogHeader className="shrink-0 space-y-0 bg-primary px-5 py-3">
          <DialogTitle className="text-[15px] text-primary-foreground">{TITULO_CARD[card]}</DialogTitle>
        </DialogHeader>
        {/* ─── DOIS GRUPOS LADO A LADO ──────────────────────────────────────────
            PR-OC-VENDA-CASCATA-BOLSO-01 (adendo B). Empilhados, os dois grupos somavam
            altura e o modal rolava por dentro — rolagem em modal de formulario e' defeito
            (A1), e foi cobrado repetidas vezes.
            ⚠ E CADA GRUPO PASSA A UMA COLUNA DE CAMPOS, o que parece contraditorio e nao
            e': lado a lado, cada grupo recebe 354px dos 728 uteis, e a linha
            rotulo(132)+campo(150)+sufixo(46) ocupa 342. Duas colunas DENTRO de 354px
            espremeriam o campo — exatamente o defeito que o 01E corrigiu. Uma coluna por
            grupo, dois grupos por modal: a altura cai pela metade e nenhum campo encolhe.
            ⚠ `items-start` para o grupo curto nao esticar ate' a altura do longo. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-5 items-start">
          {ids.map(id => (
            <Painel key={id} titulo={GRUPOS[id].titulo} tom={GRUPOS[id].tom}
              icone={ICONE_GRUPO[id]}
              extra={id === 'custos' ? extraCustos : undefined}>
              {corpos[id]}
            </Painel>
          ))}
          </div>
        </div>
        {/* ─── ACERTO COM O BOITEL ──────────────────────────────────────────────────
            So' no modal de Comercializacao do REALIZADO. O boitel manda um papel com o
            valor a repassar; o sistema monta o dele a partir do que foi digitado.
            ⚠ E SO A RELACAO COM O BOITEL, e o subtitulo diz isso: os gastos DIRETOS do
            produtor (frete e notas do envio, quando marcados "produtor") NAO entram aqui
            — eles nunca passaram pela mao do boitel. Sem essa frase, quem confere procura
            o frete na lista e conclui que faltou lancar.
            ⚠ AS LINHAS SAEM DAS PARCELAS DO MOTOR (`dAcerto*`), ja condicionadas pelas
            flags. Somar os itens aqui seria a segunda copia da composicao: no dia em que
            uma flag mudasse, a lista e o total discordariam. So' entra o que vale > 0.
            ⚠ O PAPEL E A VERDADE: a divergencia AVISA e nao IMPEDE. Travar obrigaria a
            falsear um insumo para a conta fechar, que e' a pior saida possivel. */}
        {modoRealizado && card === 'B' && (
          <div className="shrink-0 border-t bg-muted/20 px-5 py-2">
            {/* ⚠ TITULO E SUBTITULO NA MESMA LINHA — o gate de rolagem cobrou. Empilhados,
                o pior caso da conferencia (oito linhas itemizadas) passava 19px do teto de
                85vh em viewport de 800px. Medido antes e depois; ver o relatorio. */}
            <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[11px] font-medium text-foreground leading-none shrink-0">Acerto com o boitel</span>
              <span className="text-[10px] text-muted-foreground leading-snug">
                gastos diretos do produtor (frete e notas do envio) não entram neste acerto — vivem no financeiro
              </span>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <div className="min-w-0 w-fit">
                <LinhaConferencia direcao="entra" rotulo="Faturamento do frigorífico" valor={formatMoeda(faturamentoConferencia)} />
                {derLocal.dAcertoDiarias > 0 && <LinhaConferencia direcao="sai" rotulo="− Diárias do período" valor={`− ${formatMoeda(derLocal.dAcertoDiarias)}`} />}
                {derLocal.dAcertoSanidade > 0 && <LinhaConferencia direcao="sai" rotulo="− Sanidade" valor={`− ${formatMoeda(derLocal.dAcertoSanidade)}`} />}
                {derLocal.dAcertoOutros > 0 && <LinhaConferencia direcao="sai" rotulo="− Outros" valor={`− ${formatMoeda(derLocal.dAcertoOutros)}`} />}
                {derLocal.dAcertoFrete > 0 && <LinhaConferencia direcao="sai" rotulo="− Frete do envio" valor={`− ${formatMoeda(derLocal.dAcertoFrete)}`} />}
                {derLocal.dAcertoNotas > 0 && <LinhaConferencia direcao="sai" rotulo="− Notas do envio" valor={`− ${formatMoeda(derLocal.dAcertoNotas)}`} />}
                {derLocal.dAcertoAbate > 0 && <LinhaConferencia direcao="sai" rotulo="− Notas/docs do abate" valor={`− ${formatMoeda(derLocal.dAcertoAbate)}`} />}
                {derLocal.valorTotalAntecipadoCalc > 0 && (
                  <LinhaConferencia direcao="entra" rotulo="+ Reembolso do adiantamento" valor={`+ ${formatMoeda(derLocal.valorTotalAntecipadoCalc)}`} />
                )}
                <div className="mt-1 border-t pt-1 flex items-baseline justify-between gap-6">
                  {/* ⚠ O TOTAL FICA NEUTRO — B-05, achado F. Ele nao e' entrada nem saida:
                      e' o resultado das duas colunas de cor acima, e pinta-lo escolheria um
                      lado para um numero que nao tem lado. O peso 500 e' quem o destaca. */}
                  <span className="text-[11px] font-medium text-foreground whitespace-nowrap">= A repassar pelo boitel</span>
                  <span className="text-[13px] font-medium tabular-nums whitespace-nowrap text-foreground">{formatMoeda(acertoCalculado)}</span>
                </div>
              </div>
              <div className="min-w-0">
                <CampoNum label="Acerto do boitel (papel)" titulo="O valor que o boitel informou no acerto"
                  moeda valor={acertoPapel} desabilitado={somenteLeitura}
                  onChange={(v) => { setAcertoPapel(v); setLocal(a => ({ ...a, acertoPapel: v })); }} />
              </div>
              <div className="min-w-0 max-w-[18rem]">
                {acertoPapel <= 0 ? (
                  <span className="text-[10px] text-muted-foreground leading-snug">
                    Informe o acerto do papel para conferir.
                  </span>
                ) : Math.abs(acertoPapel - acertoCalculado) <= 0.005 ? (
                  <span className="text-[11px] font-medium text-success leading-snug">Confere com o papel.</span>
                ) : (
                  <span className="text-[11px] leading-snug text-amber-700 dark:text-amber-500">
                    Difere em <b className="tabular-nums">{formatMoeda(Math.abs(acertoPapel - acertoCalculado))}</b> — confira preço, arrobas ou custos.
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        <DialogFooter className="shrink-0 border-t bg-card px-5 py-3">
          <Button variant="outline" size="sm" onClick={onFechar}>Cancelar</Button>
          <Button size="sm" disabled={somenteLeitura}
            onClick={() => { onAplicar(local); onFechar(); }}>Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══ O COMPONENTE ═══════════════════════════════════════════════════════════════ */

export function BoitelBlocosModais({ valor, onChange, somenteLeitura, cenario, detalheCenario, bolsoFormatado,
  realizado = null, onChangeRealizado, onIniciarRealizado, dataEntrada }: {
  valor: BoitelEdicao; onChange: (proximo: BoitelEdicao) => void; somenteLeitura?: boolean;
  /** Marca de projecao — UMA por cartao, no titulo. Ver `GrupoIndicadores`. */
  cenario?: CenarioBoitel;
  /** Texto que acompanha a pilula (mockup: "enviada em 13/05"). */
  detalheCenario?: string | null;
  /** O liquido projetado, ja formatado — mora DENTRO do cartao de projecao. */
  /* ⚠ O BOLSO, e nao mais o acerto — B-05, achado C. Ver a doutrina em
     `bolsoDaVendaBoitel`: um liquido so' na tela, e e' o que sobra depois dos gastos
     diretos. O ACERTO nao sumiu — ele vive inteiro na cascata e, item a item, na
     conferencia "Acerto com o boitel" do modal do realizado, que e' onde ele responde a
     pergunta dele ("o boitel me repassa quanto?"). */
  bolsoFormatado?: string | null;
  /* ─── O SEGUNDO MUNDO — PR-OC-VENDA-REALIZADO-02 ──────────────────────────────
     `realizado` e' a linha `cenario='realizado'`; `null` enquanto o abate nao aconteceu,
     e e' esse null que mantem o cartao tracejado do 01D.
     ⚠ SEM `onChangeRealizado` NAO HA EDICAO, e sem `onIniciarRealizado` nao ha botao: o
     cartao continua sendo o vazio honesto. E' o mesmo contrato aditivo do resto da
     familia — quem nao passa, nao ganha. */
  realizado?: BoitelEdicao | null;
  onChangeRealizado?: (proximo: BoitelEdicao) => void;
  /** Abre o fluxo do realizado — reabre a OC se preciso e devolve `true` para editar. */
  onIniciarRealizado?: () => void | Promise<boolean | void>;
  /** `data_operacao` da OC — a entrada do lote, para os dias derivarem da data. */
  dataEntrada?: string | null;
}) {
  const [editando, setEditando] = useState<{ card: IdCard; modo: CenarioBoitel } | null>(null);
  const indicadores = useMemo(() => indicadoresDoBoitel(valor), [valor]);
  const indReal = useMemo(() => realizado ? indicadoresDoBoitel(realizado, true, valor) : null, [realizado, valor]);
  const temRealizado = !!realizado;

  const abrir = async (card: IdCard, modo: CenarioBoitel) => {
    if (modo === 'realizado' && !temRealizado) {
      /* ⚠ NASCE SABENDO DO GUARD. `oc_salvar_boitel` recusa operacao `fechada` de
         proposito — o fluxo e' reabrir, lancar, concluir. Quem resolve isso e' o
         chamador, ANTES de o dialogo abrir: preencher tudo para levar erro no fim e' a
         licao que o `faltamDosCinco` ja tinha ensinado. */
      const ok = await onIniciarRealizado?.();
      if (ok === false) return;
    }
    setEditando({ card, modo });
  };

  return (
    <>
      {/* ─── CARTAO PROJECAO ───────────────────────────────────────────────────── */}
      <section className="rounded-md border-2 border-amber-500/70 bg-card p-3 shadow-sm min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-2 border-b pb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-medium text-foreground leading-none">Projeção</span>
            <PilulaCenario cenario={cenario} />
            {detalheCenario && (
              <span className="text-[10px] font-normal text-muted-foreground leading-none truncate">{detalheCenario}</span>
            )}
          </div>
          {bolsoFormatado && (
            <div className="shrink-0 text-right">
              <div className="text-[10px] font-normal text-muted-foreground leading-none whitespace-nowrap">Liq. no bolso projetado</div>
              <div className="mt-1 text-[20px] font-medium leading-none tabular-nums whitespace-nowrap text-[#854F0B] dark:text-amber-500">
                {bolsoFormatado}
              </div>
            </div>
          )}
        </div>
        <GrupoIndicadores titulo={TITULO_CARD.A} itens={indicadores.A} onAbrir={() => abrir('A', 'projetado')} />
        <GrupoIndicadores titulo={TITULO_CARD.B} itens={indicadores.B} onAbrir={() => abrir('B', 'projetado')} />
      </section>

      {/* ─── CARTAO REALIZADO ──────────────────────────────────────────────────────
          ⚠ VAZIO ENQUANTO NAO HOUVER ABATE, e ai sem numero nenhum — o tracejado e' a
          promessa do lugar, nao um card quebrado.
          ⚠ QUANDO PREENCHE, VEM SOLIDO: `text-foreground` contra o ambar do vizinho. E'
          a regra plantada em PR-...-01D cobrando o encaixe — o comparativo nasce da cor,
          sem terceira coluna dizendo "previsto x realizado". */}
      <section className={`rounded-md p-3 min-w-0 flex flex-col ${
        temRealizado ? 'border-2 border-border bg-card shadow-sm space-y-3' : 'border border-dashed bg-muted/10'}`}>
        <div className={`flex items-center justify-between gap-2 pb-1.5 ${temRealizado ? 'border-b' : 'border-b border-dashed'}`}>
          <span className={`text-[13px] font-medium leading-none ${temRealizado ? 'text-foreground' : 'text-muted-foreground'}`}>
            Realizado
          </span>
          {temRealizado && realizado && (
            <div className="shrink-0 text-right">
              <div className="text-[10px] font-normal text-muted-foreground leading-none whitespace-nowrap">Liq. no bolso realizado</div>
              <div className="mt-1 text-[20px] font-medium leading-none tabular-nums whitespace-nowrap text-foreground">
                {(() => { const v = bolsoDaVendaBoitel(realizado); return v == null ? '—' : formatMoeda(v); })()}
              </div>
            </div>
          )}
        </div>

        {temRealizado && indReal ? (
          <>
            <GrupoIndicadores solido titulo={TITULO_CARD.A} itens={indReal.A} onAbrir={() => abrir('A', 'realizado')} />
            <GrupoIndicadores solido titulo={TITULO_CARD.B} itens={indReal.B} onAbrir={() => abrir('B', 'realizado')} />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-6">
            <p className="text-[11px] text-muted-foreground text-center leading-snug max-w-[16rem]">
              Será lançado no acerto do abate.
            </p>
            {onIniciarRealizado && !somenteLeitura && (
              <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]"
                onClick={() => abrir('A', 'realizado')}>
                Lançar realizado do abate
              </Button>
            )}
          </div>
        )}
      </section>

      {/* ⚠ O SLOT DE COMPARACOES SAIU — PR-OC-VENDA-ANALISE-01. Ele recebia o cartao
          "Previsto x realizado", que virou o rodape zootecnico do modal da analise. Os
          dois cartoes acima ja dizem previsto e realizado lado a lado, na cor; a
          comparacao detalhada mora na faixa, abaixo deles, no shell. */}

      {editando && (
        <DialogoGrupo
          key={`${editando.modo}:${editando.card}`}
          card={editando.card}
          valor={editando.modo === 'realizado' ? (realizado ?? valor) : valor}
          somenteLeitura={somenteLeitura}
          modoRealizado={editando.modo === 'realizado'}
          projetado={editando.modo === 'realizado' ? valor : null}
          dataEntrada={dataEntrada}
          onAplicar={editando.modo === 'realizado' ? (onChangeRealizado ?? onChange) : onChange}
          onFechar={() => setEditando(null)}
        />
      )}
    </>
  );
}

/* ═══ A ANALISE DO ENVIO ═════════════════════════════════════════════════════════
   PR-OC-VENDA-ANALISE-01, mockup aprovado. Absorve o PR 3 (a tabela Mercado | Projecao |
   Realizado), que deixa de existir como frente propria.

   ⚠ O QUE ESTA SUPERFICIE SUBSTITUI. A aba tinha DOIS blocos largos no rodape — as duas
   cascatas lado a lado e o cartao "Previsto x realizado" — para uma leitura que acontece
   UMA VEZ POR ABATE. Eles empurravam para baixo o que se olha todo dia (os dois cartoes
   editaveis) e obrigavam a rolar a aba para ver o cabecalho. Agora ha uma FAIXA de uma
   linha, e a analise inteira mora atras de um clique.
   ⚠ NADA FOI JOGADO FORA. Os cinco degraus da cascata viraram as LINHAS da tabela; a
   regra de veredito por linha veio junto; os quatro indicadores do "Previsto x realizado"
   viraram o rodape zootecnico. O que morreu foi a largura.
   ⚠ NENHUMA CONTA MORA AQUI. Tudo sai do motor e das irmas — `derivadosBoitel`,
   `bolsoDaVendaBoitel`, `unitariosDoLiquido`, `comparativoOportunidade` e as parcelas
   `dAcerto*`. Uma analise que recalcula por conta propria e' a segunda copia da verdade,
   e esta frente inteira passou consertando exatamente isso. */

/* ⚠ A PALAVRA "LIQUIDO" SOZINHA E PROIBIDA — adendo do Gabriel ao B-07, e vale para toda
   esta frente. Todo valor se chama pelo DEGRAU: "Acerto liquido" (o que o boitel repassa)
   ou "Liquido no bolso" (o que sobra depois dos gastos diretos). Nunca "Liquido".
   ⚠ POR QUE E REGRA E NAO ESTILO: o bloco "Previsto x realizado" comparava ACERTOS sob o
   rotulo "Liquido", enquanto os cartoes, a cascata e o topo comparavam BOLSOS. Duas
   reguas com o mesmo nome na mesma tela — e a diferenca entre elas sao os gastos diretos
   do produtor, que e' justamente o que o 02H tornou visivel. O redesenho matou aquele
   bloco; esta nota existe para a palavra orfa nao renascer no proximo rotulo.
   ⚠ E O DELTA FINANCEIRO DA ANALISE E SEMPRE DE BOLSO: `difPrev` aqui e no modal compara
   `bolsoDaVendaBoitel` com `bolsoDaVendaBoitel`, nunca acerto com bolso. */

/** O maior conhecimento disponivel: o realizado quando ha, a projecao enquanto nao ha. */
function melhorLinha(projetado: BoitelEdicao | null, realizado: BoitelEdicao | null) {
  const bReal = bolsoDaVendaBoitel(realizado);
  return bReal != null
    ? { d: realizado, bolso: bReal, real: true }
    : { d: projetado, bolso: bolsoDaVendaBoitel(projetado), real: false };
}

/* ⚠ VEREDITO, NUNCA SINAL CRU — a regra da casa, a mesma do cartao e da cascata. Cada
   comparacao declara o que e' bom PARA ELA. Empate nao tem veredito. */
function veredito(dif: number, maiorEMelhor: boolean, tol = 0.005): boolean | null {
  return Math.abs(dif) < tol ? null : (dif > 0) === maiorEMelhor;
}
function classeVeredito(bom: boolean | null): string {
  return bom == null ? 'text-muted-foreground' : bom ? 'text-success' : 'text-destructive';
}
function pct(parte: number, base: number): string {
  if (!(Math.abs(base) > 0)) return '';
  const v = (parte / base) * 100;
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
const assinado = (v: number) => `${v >= 0 ? '+' : '−'}${formatMoeda(Math.abs(v))}`;

/* ─── A FAIXA ──────────────────────────────────────────────────────────────────
   Uma linha, clicavel, fechando a aba. Mostra O NUMERO que decide e as DUAS comparacoes
   que o qualificam; o resto esta' a um clique.
   ⚠ SEGUE O MELHOR CONHECIMENTO, igual ao cabecalho (02H item K): realizado solido quando
   existe, projecao ambar enquanto nao. Sem realizado nao ha "vs. previsto" — comparar a
   promessa com ela mesma seria uma linha que sempre diz zero.
   ⚠ E UM `button`, e nao uma `div` com `onClick`: teclado e leitor de tela alcancam a
   analise pelo mesmo caminho que o mouse. */
export function BoitelAnaliseFaixa({ projetado, realizado, categoria, cabecas }: {
  projetado: BoitelEdicao | null;
  realizado: BoitelEdicao | null;
  /** Cabecalho do modal: "Analise do envio · Garrotes 110". */
  categoria?: string | null;
  cabecas?: number;
}) {
  const [aberto, setAberto] = useState(false);
  const melhor = useMemo(() => melhorLinha(projetado, realizado), [projetado, realizado]);
  const bolsoProj = useMemo(() => bolsoDaVendaBoitel(projetado), [projetado]);
  const cmp = useMemo(() => comparativoOportunidade(melhor.d), [melhor.d]);

  const difPrev = melhor.real && melhor.bolso != null && bolsoProj != null ? melhor.bolso - bolsoProj : null;
  const cor = melhor.real ? 'text-foreground' : 'text-[#854F0B] dark:text-amber-500';

  return (
    <>
      <button type="button" onClick={() => setAberto(true)}
        aria-label="Abrir a análise do envio"
        className="w-full min-w-0 rounded-md border bg-card px-3.5 py-2 shadow-sm text-left cursor-pointer hover:bg-muted/30 transition-colors">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-[11px] font-normal text-muted-foreground leading-none whitespace-nowrap">
            Líquido no bolso {melhor.real ? 'realizado' : 'projetado'}
          </span>
          <span className={`text-[17px] font-medium leading-none tabular-nums whitespace-nowrap ${
            melhor.bolso == null ? 'text-muted-foreground font-normal' : cor}`}>
            {melhor.bolso == null ? '—' : formatMoeda(melhor.bolso)}
          </span>
          {/* ⚠ A COMPARACAO COM A PROMESSA so' existe depois do abate. */}
          {difPrev != null && bolsoProj != null && (
            <span className={`text-[11px] tabular-nums leading-none whitespace-nowrap ${
              classeVeredito(veredito(difPrev, true))}`}>
              vs. previsto {assinado(difPrev)} ({pct(difPrev, bolsoProj)})
            </span>
          )}
          {cmp != null && (
            <span className={`text-[11px] tabular-nums leading-none whitespace-nowrap ${
              classeVeredito(veredito(cmp.diferenca, true))}`}>
              vs. vender vivo na época {assinado(cmp.diferenca)} ({pct(cmp.diferenca, cmp.oportunidade)})
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-primary leading-none whitespace-nowrap">
            <BarChart3 className="h-3.5 w-3.5 shrink-0" /> Análise completa
          </span>
        </div>
      </button>
      {aberto && (
        <BoitelAnaliseModal projetado={projetado} realizado={realizado}
          categoria={categoria} cabecas={cabecas} onFechar={() => setAberto(false)} />
      )}
    </>
  );
}

/* ─── UMA CELULA DE VALOR DA TABELA ────────────────────────────────────────────
   ⚠ TRAVESSAO, NUNCA ZERO. A coluna do mercado nao tem desconto de boitel nem gasto
   direto — vender vivo nao passa por nenhum dos dois —, e a do realizado esta' vazia ate'
   o abate. Zero ali afirmaria "custou zero", que e' outra coisa. */
function CelulaAnalise({ valor, cor, forte }: { valor: string | null; cor?: string; forte?: boolean }) {
  return (
    <div className={`text-right tabular-nums whitespace-nowrap ${forte ? 'text-[13px] font-semibold' : 'text-[12px]'} ${
      valor == null ? 'text-muted-foreground font-normal' : (cor ?? '')}`}>
      {valor ?? '—'}
    </div>
  );
}

/* ─── UM CENARIO EMPILHADO (abaixo de sm) ──────────────────────────────────────
   ⚠ MESMOS DEGRAUS, MESMA ORDEM, MESMOS CENTAVOS da tabela — B-09 item 3. Nao e' um resumo
   do celular: e' a MESMA informacao noutra geometria. Abreviar milhar ou cortar centavo
   aqui faria o print do celular e o da tela discordarem sobre o mesmo abate.
   ⚠ O `extra` CARREGA O DELTA e so' o realizado o recebe — os outros dois nao tem contra o
   que comparar dentro do proprio bloco. */
function BlocoAnalise({ titulo, cor, destaque, linhas, total, totalExtra, unitarios }: {
  titulo: string; cor: string; destaque?: boolean;
  linhas: { rotulo: string; valor: string | null; cor: string; extra?: React.ReactNode }[];
  total: string | null; totalExtra?: React.ReactNode; unitarios: string;
}) {
  return (
    <div className={`rounded-md border px-3 py-2 min-w-0 ${destaque ? 'border-2' : ''}`}>
      <div className={`text-[10px] font-medium uppercase tracking-wide leading-none ${cor}`}>{titulo}</div>
      <div className="mt-1.5 space-y-0.5">
        {linhas.map(l => (
          <div key={l.rotulo} className="flex items-baseline justify-between gap-3 leading-[1.45]">
            <span className="text-[11px] font-normal text-secondary whitespace-nowrap">{l.rotulo}</span>
            <span className="flex items-baseline gap-2 whitespace-nowrap">
              <span className={`text-[11px] tabular-nums ${l.valor == null ? 'text-muted-foreground' : l.cor}`}>
                {l.valor ?? '—'}
              </span>
              {l.extra && <span className="text-[10px] tabular-nums">{l.extra}</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 border-t pt-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-medium text-foreground whitespace-nowrap">= Líquido no bolso</span>
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          <span className={`text-[13px] font-semibold tabular-nums ${total == null ? 'text-muted-foreground font-normal' : cor}`}>
            {total ?? '—'}
          </span>
          {totalExtra && <span className="text-[10px] font-medium tabular-nums">{totalExtra}</span>}
        </span>
      </div>
      <div className={`mt-0.5 text-right text-[10px] tabular-nums text-muted-foreground`}>{unitarios}</div>
    </div>
  );
}

/* ─── O MODAL ──────────────────────────────────────────────────────────────────
   ⚠ TRES COLUNAS NA MESMA REGUA — o PR 3, absorvido. "Vender vivo na epoca" e' o termo de
   comparacao (o custo de oportunidade), "Projecao" e' a promessa e "Realizado" e' o fato.
   Na mesma tabela, com os MESMOS cinco degraus, a comparacao nao precisa ser explicada.
   ⚠ A QUARTA COLUNA E O VEREDITO, nao um numero a mais: `real x proj.` com a cor dizendo
   o que a variacao SIGNIFICA em cada linha.
   ⚠ A21 — cabecalho fixo e ZERO ROLAGEM INTERNA. Medido: a tabela tem 5 linhas, um rodape
   de unitarios, a frase e o rodape zootecnico; em `max-w-3xl` o conteudo fecha em ~330px,
   contra os ~680px do teto de 85vh. Nao ha `overflow-y-auto` no corpo de proposito. */
function BoitelAnaliseModal({ projetado, realizado, categoria, cabecas, onFechar }: {
  projetado: BoitelEdicao | null;
  realizado: BoitelEdicao | null;
  categoria?: string | null;
  cabecas?: number;
  onFechar: () => void;
}) {
  const p = useMemo(() => projetado ? derivadosBoitel(projetado) : null, [projetado]);
  const bolsoProj = useMemo(() => bolsoDaVendaBoitel(projetado), [projetado]);
  const bolsoReal = useMemo(() => bolsoDaVendaBoitel(realizado), [realizado]);
  const temReal = bolsoReal != null && realizado != null;
  const r = useMemo(() => temReal && realizado ? derivadosBoitel(realizado) : null, [temReal, realizado]);
  /* ⚠ O MERCADO SAI DA IRMA, e da linha de maior conhecimento: e' o `coT` — o que o mesmo
     capital renderia vendendo vivo. Uma so' chamada, e o veredito da frase final vem dela. */
  const cmp = useMemo(() => comparativoOportunidade(temReal ? realizado : projetado), [temReal, realizado, projetado]);
  const mercado = cmp?.oportunidade ?? null;

  const uniProj = useMemo(() => unitariosDoLiquido(projetado, bolsoProj), [projetado, bolsoProj]);
  const uniReal = useMemo(() => unitariosDoLiquido(realizado ?? null, bolsoReal), [realizado, bolsoReal]);

  const AMBAR = 'text-[#854F0B] dark:text-amber-500';
  /* ⚠ OS CINCO DEGRAUS, NA ORDEM DA CASCATA QUE ELES VIERAM. `mercado` nulo onde vender
     vivo nao tem a linha; `maiorEMelhor` e' o que cada degrau considera bom. */
  const linhas: { rotulo: string; mercado: number | null; proj: number | null; real: number | null; maiorEMelhor: boolean; negativo?: boolean }[] = [
    { rotulo: 'Faturamento',           mercado, proj: p?.fba ?? null, real: r?.fba ?? null, maiorEMelhor: true },
    { rotulo: '− Descontos do boitel', mercado: null, proj: p?.descontoDoAcerto ?? null, real: r?.descontoDoAcerto ?? null, maiorEMelhor: false, negativo: true },
    { rotulo: '= Acerto líquido',      mercado, proj: p ? p.fba - p.descontoDoAcerto : null, real: r ? r.fba - r.descontoDoAcerto : null, maiorEMelhor: true },
    { rotulo: '− Gastos diretos',      mercado: null, proj: p?.custosDoProdutor ?? null, real: r?.custosDoProdutor ?? null, maiorEMelhor: false, negativo: true },
  ];
  const fmt = (v: number | null, neg?: boolean) => v == null ? null : (neg ? `− ${formatMoeda(v)}` : formatMoeda(v));
  const delta = (real: number | null, proj: number | null, maiorEMelhor: boolean) => {
    if (real == null || proj == null) return null;
    const dif = real - proj;
    return <span className={classeVeredito(veredito(dif, maiorEMelhor))}>{assinado(dif)}</span>;
  };

  /* ⚠ O RODAPE ZOOTECNICO — os quatro do antigo "Previsto x realizado". GMD e RC sao os
     EFETIVOS do abate (a decisao do 02H item G): mostrar o campo copiado poria a premissa
     da projecao ao lado de um fato que a contradiz. */
  const zoot: { rotulo: string; real: string | null; prev: string | null }[] = [
    { rotulo: 'GMD', real: r ? `${n3(r.gmdEfetivo)} kg/dia` : null, prev: p ? `${n3(projetado?.gmd ?? 0)} kg/dia` : null },
    { rotulo: 'Dias', real: realizado && temReal ? String(realizado.dias) : null, prev: projetado ? String(projetado.dias) : null },
    { rotulo: 'RC saída', real: r ? `${n2(r.rcEfetivo)}%` : null, prev: projetado ? `${n2(projetado.rendimento)}%` : null },
    { rotulo: 'R$/@', real: realizado && temReal ? formatMoeda(realizado.precoVendaArroba) : null, prev: projetado ? formatMoeda(projetado.precoVendaArroba) : null },
  ];

  const cartaoRef = useRef<HTMLDivElement | null>(null);
  const [salvandoPrint, setSalvandoPrint] = useState(false);
  /* ⚠ IMPORT DINAMICO: `html2canvas` sao ~200kB e a analise e' aberta uma vez por abate.
     Carrega-la no bundle da tela faria todo mundo pagar por um botao que poucos apertam —
     e o `capturarAnalise` do PDF ja e' code-split pelo mesmo motivo. */
  const salvarPrint = async () => {
    const el = cartaoRef.current;
    if (!el || salvandoPrint) return;
    setSalvandoPrint(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el, { scale: 2.5, backgroundColor: '#ffffff', logging: false, useCORS: true });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      /* Nome que se acha depois: o que e', de quem, e de quando. */
      a.download = `analise-envio${categoria ? `-${categoria.toLowerCase().replace(/\s+/g, '-')}` : ''}${realizado?.dataAbate ? `-${realizado.dataAbate}` : ''}.png`;
      a.click();
    } finally {
      setSalvandoPrint(false);
    }
  };

  const difPrev = temReal && bolsoReal != null && bolsoProj != null ? bolsoReal - bolsoProj : null;
  /* ⚠ OS UNITARIOS DO VIVO SAEM DA MESMA IRMA — B-09 item 2c. A coluna do mercado tinha
     total e nao tinha por cabeca nem por quilo, e era a unica das tres sem eles: quem
     compara "vale a pena?" compara justamente R$/cab e R$/kg. `unitariosDoLiquido` recebe
     a base trocada, exatamente como ja faz para o bolso — nenhuma divisao escrita aqui. */
  const uniVivo = useMemo(() => unitariosDoLiquido(temReal ? realizado ?? null : projetado, mercado), [temReal, realizado, projetado, mercado]);
  const grade = 'grid grid-cols-[1fr_repeat(4,minmax(0,7.5rem))] gap-x-3 items-baseline';
  const uni = (u: UnitariosLiquido) => u.porCabeca == null ? '—'
    : `${formatMoeda(u.porCabeca)}/cab · ${formatMoeda(u.porKg ?? 0)}/kg`;
  /* ⚠ COR POR DIRECAO NA COLUNA DO REALIZADO — B-09 item 2b, a mesma regra que o acerto
     itemizado ja usa: entrada em verde, saida em vermelho, TOTAIS neutros. O total nao e'
     entrada nem saida — e' o resultado dos dois —, e pinta-lo escolheria um lado para um
     numero que nao tem lado.
     ⚠ SO' NO REALIZADO. A projecao e' ambar porque ambar quer dizer "ainda nao aconteceu",
     e trocar isso por verde/vermelho perderia a marca que organiza a tela inteira. */
  const corReal = (l: { negativo?: boolean }) => l.negativo ? 'text-destructive' : 'text-success';

  const cabecalhos = ['Vender vivo na época', 'Projetado', 'Realizado', 'Dif. real vs proj.'];

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      {/* ⚠ `max-h-[85vh]` E O CORPO QUE ROLA — B-09 item 3, e a medicao mandou. Em sm+ a
          analise fecha em ~385px contra os ~680px do teto: ZERO rolagem, como o A21 pede.
          No celular, porem, os tres blocos empilhados somam ~695px contra ~544px (85vh de
          640px), e nao ha como caber sem abreviar milhar ou cortar centavo — que e'
          justamente o que o item 3 proibe. Entao rola, e rola SO' onde precisa
          (`sm:overflow-visible`): a alternativa era o `overflow-hidden` do dialogo CORTAR o
          terceiro bloco, que e' perder dado em silencio.
          ⚠ O `overflow` MORA NO ENVOLTORIO, e nao no cartao: `html2canvas` captura a caixa
          do elemento, e um cartao com rolagem propria sairia cortado no PNG. Envoltorio
          rola, cartao inteiro e' capturado. */}
      <DialogContent className="max-w-3xl max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0 border-b bg-primary/10 px-5 py-3 space-y-0.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="text-[14px] font-medium text-primary leading-none">
                Análise do envio{categoria ? ` · ${categoria}` : ''}{cabecas ? ` ${cabecas}` : ''}
              </DialogTitle>
              <p className="mt-0.5 text-[11px] font-normal text-muted-foreground leading-snug">
                {realizado?.dataAbate
                  ? `abate em ${realizado.dataAbate.split('-').reverse().join('/')}`
                  : 'o abate ainda não foi lançado — a coluna do realizado enche no acerto'}
              </p>
            </div>
            {/* ⚠ SALVAR PRINT — B-09 item 3. `html2canvas` E A LIB DA CASA: ja e' dependencia
                direta (1.4.1) e ja captura os componentes reais do PDF Executivo em
                `src/lib/pdf/capturarAnalise.tsx`. Trazer `html-to-image` seria uma segunda
                lib para o mesmo trabalho.
                ⚠ MESMOS PARAMETROS DAQUELE MODULO — `scale: 2.5`, fundo branco, sem log:
                dois lugares capturando com escalas diferentes dariam prints de nitidez
                diferente para a mesma empresa.
                ⚠ CAPTURA O CARTAO, NAO O DIALOGO: o `ref` esta' no corpo, entao o PNG sai
                sem a moldura do modal e sem o proprio botao. */}
            <Button type="button" variant="ghost" size="sm" disabled={salvandoPrint}
              className="h-7 shrink-0 gap-1.5 text-[11px] text-primary"
              title="Salva esta análise como imagem PNG"
              onClick={salvarPrint}>
              <ImageDown className="h-3.5 w-3.5" /> {salvandoPrint ? 'Gerando…' : 'Salvar print'}
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto sm:overflow-visible">
        <div ref={cartaoRef} className="px-5 py-3 min-w-0 bg-card">
          {/* ─── A TABELA (sm+) ──────────────────────────────────────────────────────
              ⚠ CABECALHOS POR EXTENSO — B-09 item 2a. "Projeção"/"Realizado" sozinhos nao
              diziam de que lado do tempo estavam, e "real × proj." era abreviacao de
              quem ja sabia. A cor continua dizendo, e agora a palavra confirma. */}
          <div className="hidden sm:block">
            <div className={`${grade} border-b pb-1.5 text-[10px] font-medium uppercase tracking-wide`}>
              <div className="text-muted-foreground">&nbsp;</div>
              <div className="text-right text-muted-foreground">{cabecalhos[0]}</div>
              <div className={`text-right ${AMBAR}`}>{cabecalhos[1]}</div>
              <div className="text-right text-foreground">{cabecalhos[2]}</div>
              <div className="text-right text-muted-foreground">{cabecalhos[3]}</div>
            </div>

            {linhas.map(l => (
              <div key={l.rotulo} className={`${grade} py-1 leading-[1.45]`}>
                <div className="text-[12px] font-normal text-secondary whitespace-nowrap">{l.rotulo}</div>
                <CelulaAnalise valor={fmt(l.mercado)} />
                <CelulaAnalise valor={fmt(l.proj, l.negativo)} cor={AMBAR} />
                <CelulaAnalise valor={fmt(l.real, l.negativo)} cor={corReal(l)} />
                <div className="text-right text-[11px] tabular-nums whitespace-nowrap">
                  {delta(l.real, l.proj, l.maiorEMelhor) ?? <span className="text-muted-foreground">—</span>}
                </div>
              </div>
            ))}

            {/* ⚠ O TOTAL EM PESO 600 — e' a resposta, e as quatro linhas acima sao o caminho.
                Neutro nas tres colunas: total nao tem lado. */}
            <div className={`${grade} border-t pt-1.5 mt-0.5`}>
              <div className="text-[12px] font-medium text-foreground whitespace-nowrap">= Líquido no bolso</div>
              <CelulaAnalise forte valor={mercado == null ? null : formatMoeda(mercado)} />
              <CelulaAnalise forte valor={bolsoProj == null ? null : formatMoeda(bolsoProj)} cor={AMBAR} />
              <CelulaAnalise forte valor={bolsoReal == null ? null : formatMoeda(bolsoReal)} cor="text-foreground" />
              <div className="text-right text-[11px] font-medium tabular-nums whitespace-nowrap">
                {delta(bolsoReal, bolsoProj, true) ?? <span className="text-muted-foreground">—</span>}
              </div>
            </div>
            {/* ⚠ UNITARIOS SOB AS TRES COLUNAS — item 2c. O vivo tinha total e nao tinha
                unitario, e era a coluna com que as outras duas se comparam. */}
            <div className={`${grade} pt-0.5 text-[10px] tabular-nums text-muted-foreground`}>
              <div>&nbsp;</div>
              <div className="text-right">{uni(uniVivo)}</div>
              <div className={`text-right ${AMBAR}`}>{uni(uniProj)}</div>
              <div className="text-right text-foreground">{uni(uniReal)}</div>
              <div>&nbsp;</div>
            </div>
          </div>

          {/* ─── EMPILHADO (abaixo de sm) ────────────────────────────────────────────
              ⚠ POR COLUNA, E NAO POR LINHA — B-09 item 3. Cinco linhas x quatro colunas nao
              cabem em 360px sem cortar centavo ou virar rolagem lateral, e abreviar milhar
              esta' proibido. Empilhado, cada cenario vira um bloco COMPLETO: mesmos cinco
              degraus, centavos inteiros, unitarios no fim.
              ⚠ REALIZADO PRIMEIRO, e com os deltas: no celular o operador abre a analise
              DEPOIS do abate, e a primeira tela tem de responder o que aconteceu. A
              projecao vem em seguida, como referencia, e o vivo por ultimo.
              ⚠ SEM REALIZADO O BLOCO DELE NAO APARECE — a mesma regra da faixa: nao ha
              coluna vazia esperando, ha um bloco a menos. */}
          <div className="sm:hidden space-y-3">
            {temReal && (
              <BlocoAnalise titulo={cabecalhos[2]} cor="text-foreground" destaque
                linhas={linhas.map(l => ({ rotulo: l.rotulo, valor: fmt(l.real, l.negativo),
                  cor: corReal(l), extra: delta(l.real, l.proj, l.maiorEMelhor) }))}
                total={bolsoReal == null ? null : formatMoeda(bolsoReal)}
                totalExtra={delta(bolsoReal, bolsoProj, true)} unitarios={uni(uniReal)} />
            )}
            <BlocoAnalise titulo={cabecalhos[1]} cor={AMBAR}
              linhas={linhas.map(l => ({ rotulo: l.rotulo, valor: fmt(l.proj, l.negativo), cor: AMBAR }))}
              total={bolsoProj == null ? null : formatMoeda(bolsoProj)} unitarios={uni(uniProj)} />
            <BlocoAnalise titulo={cabecalhos[0]} cor="text-muted-foreground"
              linhas={linhas.map(l => ({ rotulo: l.rotulo, valor: fmt(l.mercado), cor: 'text-muted-foreground' }))}
              total={mercado == null ? null : formatMoeda(mercado)} unitarios={uni(uniVivo)} />
          </div>

          {/* ⚠ AS DUAS COMPARACOES NUMA FRASE, CADA METADE NA SUA COR — item 2d. Elas
              respondem perguntas diferentes e podem ter vereditos OPOSTOS: render mais que
              vender vivo (verde) e menos que o previsto (vermelho) e' o caso comum de um
              envio que valeu a pena mas frustrou a promessa. Uma cor so' na frase inteira
              apagaria metade da noticia. */}
          <div className="mt-3 border-t pt-2">
            {cmp == null ? (
              <p className="text-[11px] text-muted-foreground leading-snug">
                {projetado && projetado.custoOportunidade > 0
                  ? 'Faltam dados do planejamento para comparar com a venda de hoje.'
                  : 'Informe o custo de oportunidade em Custos para comparar com a venda de hoje.'}
              </p>
            ) : (
              <p className="text-[11px] leading-[1.45] text-muted-foreground">
                <span className={classeVeredito(veredito(cmp.diferenca, true))}>
                  O boitel {temReal ? 'rendeu' : 'deve render'}{' '}
                  <span className="font-medium tabular-nums">{formatMoeda(Math.abs(cmp.diferenca))}</span>{' '}
                  <span className="font-medium">{cmp.diferenca >= 0 ? 'a mais' : 'a menos'}</span>{' '}
                  (<span className="font-medium tabular-nums">{pct(cmp.diferenca, cmp.oportunidade)}</span>)
                  {' '}que vender vivo na época
                </span>
                {difPrev != null && bolsoProj != null && (<>
                  {' e '}
                  <span className={classeVeredito(veredito(difPrev, true))}>
                    <span className="font-medium tabular-nums">{formatMoeda(Math.abs(difPrev))}</span>{' '}
                    <span className="font-medium">{difPrev >= 0 ? 'a mais' : 'a menos'}</span>{' '}
                    (<span className="font-medium tabular-nums">{pct(difPrev, bolsoProj)}</span>)
                    {' '}que o previsto
                  </span>
                </>)}
                .
              </p>
            )}
          </div>

          {/* ⚠ RODAPE ZOOTECNICO EM 9px — o que aconteceu com o ANIMAL, sob o que aconteceu
              com o dinheiro. Cada um com o `prev.` do lado, no ambar da projecao. */}

          <div className="mt-2 border-t pt-2 flex flex-wrap gap-x-6 gap-y-1.5">
            {zoot.map(z => (
              <div key={z.rotulo} className="min-w-0">
                <span className="text-[9px] text-muted-foreground leading-none">{z.rotulo} </span>
                <span className="text-[9px] font-medium tabular-nums leading-none text-foreground">{z.real ?? '—'}</span>
                <span className={`ml-1.5 text-[9px] tabular-nums leading-none ${AMBAR}`}>prev. {z.prev ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>

        </div>
        <DialogFooter className="shrink-0 border-t bg-card px-5 py-3">
          <Button variant="outline" size="sm" onClick={onFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
