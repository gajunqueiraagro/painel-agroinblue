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
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import type { CenarioBoitel } from '@/components/venda/BoitelNegociacaoDerivado';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pencil } from 'lucide-react';
import { formatMoeda, formatKg, formatArroba } from '@/lib/calculos/formatters';
import type { BoitelData } from '@/components/BoitelPlanningDialog';
import { derivadosBoitel, cabecasQueSairam, PilulaCenario, type BoitelEdicao } from '@/components/venda/BoitelNegociacaoDerivado';

const n2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n3 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
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
export function CampoNum({ label, valor, onChange, casas = 2, sufixo, obrigatorio, derivado, desabilitado, titulo, moeda, extra }: {
  label: string; valor: number; onChange: (v: number) => void; casas?: number;
  sufixo?: string; obrigatorio?: boolean; derivado?: string | null; desabilitado?: boolean;
  /** Campo de dinheiro: usa o `CampoMoeda` do sistema, com o R$ dentro do valor. */
  moeda?: boolean;
  /** Renderizado ABAIXO do campo, indentado na coluna dele — hoje, o `SeletorLado`. */
  extra?: React.ReactNode;
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
  /* ─── UMA LINHA: ROTULO · CAMPO · SUFIXO ───────────────────────────────────
          PR-OC-VENDA-LAYOUT-NEG-01E. O rotulo estava EM CIMA e o campo ocupava a coluna
          inteira da grade: um input de tres digitos com 229px de largura, e um mar de
          branco entre o numero e a borda. Largura de campo tem de vir do CONTEUDO, e nao
          da coluna que o hospeda.
          ⚠ A COLUNA DE ROTULO E FIXA e alinhada a' DIREITA: e' o que faz as linhas se
          empilharem numa grade legivel em vez de cada campo comecar num lugar. Sem a
          largura fixa, "GMD" e "Desp. notas/docs. abate" empurrariam os campos para
          posicoes diferentes e o alinhamento morreria — que era o defeito 2.
          ⚠ A HIERARQUIA DE CONTRASTE CONTINUA: titulo 12px/600 foreground · rotulo
          11px/500 foreground/90 · ajuda 10px muted. Tres degraus.
          ⚠ A AJUDA FICA INDENTADA NA COLUNA DO CAMPO, e nao sob o rotulo: ela fala do
     numero, e alinhada a ele se le' como continuacao dele. */
  return (
      <div className="flex items-baseline gap-2 min-w-0">
        <Label title={titulo ?? label}
          className="w-[132px] shrink-0 text-right text-[11px] font-medium text-foreground/90 leading-8 whitespace-nowrap overflow-hidden text-ellipsis">
          {label}{obrigatorio && <span className="text-destructive"> *</span>}
        </Label>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {/* ⚠ DUAS LARGURAS, POR TIPO DE CONTEUDO: dinheiro cabe em 150px com o R$ e o
                separador de milhar; contagem e percentual cabem em 100px. Nao ha terceira
                — inventar uma por campo faria a grade voltar a desalinhar. */}
            {moeda ? (
              <CampoMoeda valor={valor} onChange={(n) => onChange(n ?? 0)} disabled={desabilitado}
                className="h-8 w-[150px] px-2.5 text-[13px] tabular-nums text-right" />
            ) : (
              <Input
                value={rascunho ?? fmt(valor)} disabled={desabilitado} inputMode="decimal"
                onChange={e => { setRascunho(e.target.value); onChange(parse(e.target.value)); }}
                onFocus={() => setRascunho(valor ? String(valor).replace('.', ',') : '')}
                onBlur={() => { if (rascunho !== null) onChange(parse(rascunho)); setRascunho(null); }}
                className="h-8 w-[100px] px-2.5 text-[13px] tabular-nums text-right"
              />
            )}
            {/* Colado ao campo — o sufixo denomina AQUELE numero, nao a coluna. */}
            {sufixo && <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{sufixo}</span>}
          </div>
          {derivado !== undefined && (
            <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums leading-snug">
              {derivado ?? '—'}
            </div>
          )}
          {extra}
        </div>
      </div>
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
  return (
    <div className="mt-1 flex w-fit items-center gap-1"
      title="boitel = desconta do acerto · produtor = caixa próprio, vira previsão no financeiro">
      <Button type="button" size="sm" variant={noBoitel ? 'default' : 'outline'} disabled={desabilitado}
        className="h-6 text-[11px] px-2" onClick={() => onChange(true)}>boitel</Button>
      <Button type="button" size="sm" variant={!noBoitel ? 'default' : 'outline'} disabled={desabilitado}
        className="h-6 text-[11px] px-2" onClick={() => onChange(false)}>produtor</Button>
    </div>
  );
}

/* Linha do formulario para o que NAO e' `CampoNum` (Select, DatePicker, Input de texto).
   ⚠ A COLUNA DE ROTULO E A MESMA `w-[132px]` alinhada a' direita: se cada controle
   escolhesse a sua, a grade voltaria a desalinhar — que e' o defeito 2 do 01E. */
function LinhaCampo({ label, largura, children, span }: {
  label: string; largura: string; children: React.ReactNode; span?: boolean;
}) {
  return (
    <div className={`flex items-baseline gap-2 min-w-0 ${span ? 'sm:col-span-2' : ''}`}>
      <Label className="w-[132px] shrink-0 text-right text-[11px] font-medium text-foreground/90 leading-8 whitespace-nowrap overflow-hidden text-ellipsis">
        {label}
      </Label>
      <div className={`min-w-0 ${largura}`}>{children}</div>
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
  desempenho: { card: 'A', titulo: 'Desempenho' },
  custos: { card: 'A', titulo: 'Custos' },
  comercializacao: { card: 'B', titulo: 'Comercialização' },
  adiantamento: { card: 'B', titulo: 'Adiantamento' },
} as const;
type IdGrupo = keyof typeof GRUPOS;
type IdCard = 'A' | 'B';
/** Um numero do cartao. `pendente` = falta o dado que o sustenta (ambar + traco). */
interface Indicador { rotulo: string; valor: string; pendente?: boolean }
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
function indicadoresDoBoitel(d: BoitelEdicao): Record<IdCard, Indicador[]> {
  const der = derivadosBoitel(d);
  const qtd = d.qtdCabecas || 0;
  const temDesempenho = d.dias > 0 && d.gmd > 0 && d.rendimento > 0;
  const temCusto = d.custoDiaria > 0;
  const temPreco = d.precoVendaArroba > 0;
  const custoCab = qtd > 0 && der.custoTotalBoitel > 0 ? der.custoTotalBoitel / qtd : null;

  return {
    A: [
      { rotulo: 'GMD',           valor: temDesempenho ? `${n3(d.gmd)} kg` : '—', pendente: !temDesempenho },
      { rotulo: 'Dias',          valor: temDesempenho ? String(d.dias) : '—',    pendente: !temDesempenho },
      { rotulo: 'RC saída',      valor: temDesempenho ? `${n2(d.rendimento)}%` : '—', pendente: !temDesempenho },
      { rotulo: 'Diária',        valor: temCusto ? formatMoeda(d.custoDiaria) : '—', pendente: !temCusto },
      { rotulo: 'Custo/cab',     valor: custoCab == null ? '—' : formatMoeda(custoCab), pendente: !temCusto },
      { rotulo: 'Custo @ prod.', valor: der.cPArr > 0 ? formatMoeda(der.cPArr) : '—', pendente: !temCusto },
    ],
    /* ⚠ O ADIANTADO SAIU DAQUI — decisao do Gabriel. Ele continua no modal, onde se
       digita; o cartao guarda o que a Comercializacao PRODUZ. Com ele fora, o unico
       numero que era fato saiu junto, e a marca "(fato)" nao tem hoje o que marcar —
       ela volta quando voltar um fato ao resumo (o REALIZADO). */
    B: [
      { rotulo: 'Preço',  valor: temPreco ? `${formatMoeda(d.precoVendaArroba)}/@` : '—', pendente: !temPreco },
      { rotulo: 'Fatura', valor: der.fba > 0 ? formatMoeda(der.fba) : '—', pendente: !temPreco },
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
  onChange: (proximo: BoitelEdicao) => void, somenteLeitura?: boolean) {
  const der = derivadosBoitel(d);
  const qtd = d.qtdCabecas || 0;
  const sairam = cabecasQueSairam(d);
  const diarias = der.cDT;
  const corpos: Record<string, React.ReactNode> = {
    desempenho: (<><div className="grid grid-cols-1 gap-y-2">
          <CampoNum desabilitado={somenteLeitura} label="Dias confinamento" titulo="Dias de confinamento" valor={d.dias} onChange={v => set('dias', v)} casas={0} obrigatorio />
          <CampoNum desabilitado={somenteLeitura} label="GMD" valor={d.gmd} onChange={v => set('gmd', v)} casas={3} sufixo="kg/dia" obrigatorio />
          <CampoNum desabilitado={somenteLeitura} label="Quebra de viagem" valor={d.quebraViagem} onChange={v => set('quebraViagem', v)} sufixo="%" />
          <CampoNum desabilitado={somenteLeitura} label="Rend. entrada" titulo="Rendimento de entrada" valor={d.rendimentoEntrada} onChange={v => set('rendimentoEntrada', v)} sufixo="%" />
          <CampoNum desabilitado={somenteLeitura} label="Rend. saída" titulo="Rendimento de saída" valor={d.rendimento} onChange={v => set('rendimento', v)} sufixo="%" obrigatorio />
        </div></>),
    custos: (<><div className="grid grid-cols-1 gap-y-2 items-start">
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
          <CampoNum desabilitado={somenteLeitura} label="Diária" moeda valor={d.custoDiaria} onChange={v => set('custoDiaria', v)} sufixo="/cab/dia" obrigatorio />
          {/* ⚠ ALINHADO NA MESMA GRADE — defeito 2 do 01E. Ele flutuava fora da linha
              porque montava o proprio rotulo em cima; agora usa a `LinhaCampo`, e o valor
              derivado ocupa a coluna do campo como qualquer outro. */}
          <LinhaCampo label="Diárias no período" largura="w-[150px]">
            <div className="h-8 px-2.5 flex items-center justify-end rounded-md border bg-muted/40 text-[13px] font-medium tabular-nums">
              {diarias > 0 ? formatMoeda(diarias) : <span className="text-muted-foreground font-normal">—</span>}
            </div>
            {/* ⚠ CABEÇAS QUE SAÍRAM, não as que entraram. O boitel não cobra diária de
                animal morto — medido no acerto real: 109 × 104 × 18,93. */}
            <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums leading-snug">
              {d.custoDiaria > 0 && d.dias > 0
                ? `${sairam} cab. × ${d.dias} dias × ${formatMoeda(d.custoDiaria)}`
                : '—'}
            </div>
          </LinhaCampo>
          {/* ⚠ NAO HA CAMPO DE NUTRICAO, e a ausencia e' a correcao — PR-OC-VENDA-NUTRICAO-DUPLICADA-01.
              A DIARIA JA E A NUTRICAO: e' o que o boitel cobra para alimentar o gado. Um
              campo "Nutrição (total)" ao lado das Diárias era o mesmo conceito pedido duas
              vezes, e somava em cima. */}
          <CampoNum desabilitado={somenteLeitura} label="Sanidade (total)" moeda valor={d.custoSanidade} onChange={v => set('custoSanidade', v)}
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
          <CampoNum desabilitado={somenteLeitura} label="Frete (total)" moeda
            titulo="Frete (total) — o seletor abaixo diz de que lado do acerto ele mora"
            valor={d.custoFrete} onChange={v => set('custoFrete', v)}
            derivado={d.custoFrete > 0 ? `${formatMoeda(d.custoFrete / (qtd || 1))}/cab` : null}
            extra={<SeletorLado noBoitel={d.custoFreteNoBoitel ?? false} desabilitado={somenteLeitura}
              onChange={v => set('custoFreteNoBoitel', v)} />} />
          <CampoNum desabilitado={somenteLeitura} label="Outros (total)" moeda valor={d.outrosCustos} onChange={v => set('outrosCustos', v)}
            derivado={porCabeca(d.outrosCustos, qtd)}
            extra={<SeletorLado noBoitel={d.outrosNoBoitel ?? true} desabilitado={somenteLeitura}
              onChange={v => set('outrosNoBoitel', v)} />} />
          {/* ⚠ DESPESA NOVA — PR-OC-VENDA-REALIZADO-01A. As guias de envio (Fundersul,
              Iagro) nao tinham campo: iam somadas em "Outros" e perdiam a identidade, e
              sem identidade nao ha como dizer de que lado do acerto elas moram. Nasce
              zerada e do lado do PRODUTOR, que e' o caso comum. */}
          <CampoNum desabilitado={somenteLeitura} label="Notas de envio" moeda
            titulo="Notas de envio — guias tipo Fundersul e Iagro"
            valor={d.custoNotasEnvio ?? 0} onChange={v => set('custoNotasEnvio', v)}
            derivado={(d.custoNotasEnvio ?? 0) > 0 ? `${formatMoeda((d.custoNotasEnvio ?? 0) / (qtd || 1))}/cab` : null}
            extra={<SeletorLado noBoitel={d.notasEnvioNoBoitel ?? false} desabilitado={somenteLeitura}
              onChange={v => set('notasEnvioNoBoitel', v)} />} />
          {/* ⚠ O CUSTO DE OPORTUNIDADE VOLTOU PARA CA — forma final do 01B. Ele chegou a
              morar na faixa de Resultado (onde a COMPARACAO acontece), mas a faixa final
              nao tem campo: ela e' leitura. O numero segue sendo termo de comparacao e
              nao desembolso — quem o le' e' o veredito la' embaixo —, e e' por isso que o
              derivado ao lado mostra o total no lote, e nao um custo por cabeca.
              ⚠ A unidade e' R$/kg de peso de saida da fazenda: `coT = co x peso x cab`,
              como no simulador antigo ("Custo oport. R$/kg"). */}
          <CampoNum desabilitado={somenteLeitura} label="Custo oportunidade" moeda titulo="Custo de oportunidade (R$/kg de peso de saída)"
            valor={d.custoOportunidade} onChange={v => set('custoOportunidade', v)} sufixo="/kg"
            derivado={der.coT > 0 ? `${formatMoeda(der.coT)} no lote` : 'termo de comparação — não entra no custo'} />
        </div>
        {/* ⚠ A LINHA "OUTROS CUSTOS" DO FINANCEIRO SOMA TRES COLUNAS — `outros_custos`,
            `custo_nutricao` e `custos_extras_parceria` (ver useBoitelOperacoes.ts). Das
            tres, so' `Outros` tem campo aqui: a nutrição saiu por ser a própria diária, e
            os extras de parceria são de uma modalidade que ainda não existe. As duas
            colunas ficam zeradas, então a linha do financeiro é o que se digita em Outros. */}
        <p className="text-[10px] text-muted-foreground leading-snug"
          title="A linha “Outros Custos” do financeiro soma outros_custos, custo_nutricao e custos_extras_parceria; das três, só “Outros” tem campo aqui.">
          “Outros” vira “Outros Custos” no financeiro.
        </p></>),
    comercializacao: (<><div className="grid grid-cols-1 gap-y-2">
          <CampoNum desabilitado={somenteLeitura} label="Preço de venda" moeda valor={d.precoVendaArroba} onChange={v => set('precoVendaArroba', v)} sufixo="/@" obrigatorio />
          {/* ⚠ TOTAL, não por cabeça. Medido no acerto real: DAEMS/GTA de R$ 4.514,57
              contra faturamento de R$ 813 mil. */}
          <CampoNum desabilitado={somenteLeitura} label="Desp. notas/docs. abate" moeda titulo="Despesas com notas e documentos no abate" valor={d.despesasAbate} onChange={v => set('despesasAbate', v)}
            extra={<SeletorLado noBoitel={d.despesasAbateNoBoitel ?? true} desabilitado={somenteLeitura}
              onChange={v => set('despesasAbateNoBoitel', v)} />} />
        </div>

        {/* ⚠ A MORTE FICOU AQUI, e os dois campos juntos. É no acerto que ela se sabe e se
            liquida, e a indenização entra no faturamento bruto — o próprio rodapé deste
            modal. A quantidade também reduz as diárias, no modal de Custos. */}
        <div className="rounded-md border bg-card p-2.5 shadow-sm space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/90">Morte no período</div>
          <div className="grid grid-cols-1 gap-y-2">
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
          <div className="grid grid-cols-1 gap-y-2">
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
            <LinhaCampo label="Observação" largura="flex-1">
              <Input value={d.adiantamentoObservacao} onChange={e => set('adiantamentoObservacao', e.target.value)}
                disabled={somenteLeitura} placeholder="Opcional" className="h-8 px-2.5 text-[13px]" />
            </LinhaCampo>
          </div>
        )}</>),
  };

  return corpos;
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
function GrupoIndicadores({ titulo, itens, onAbrir }: {
  titulo: string;
  itens: { rotulo: string; valor: string; pendente?: boolean; fato?: boolean }[];
  onAbrir: () => void;
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
            <div className="text-[10px] font-normal text-muted-foreground leading-none whitespace-nowrap">
              {i.rotulo}
              {i.fato && <span className="ml-1 text-[9px] font-normal">(fato)</span>}
            </div>
            {/* ⚠ `whitespace-nowrap`, nunca `truncate`: numero cortado nao e' numero.
                ⚠ A PENDENCIA MANDA NA COR — ver a precedencia em `indicadoresDoBoitel`. */}
            <div className={`mt-1 text-[15px] font-medium leading-none tabular-nums whitespace-nowrap ${
              i.pendente ? 'text-amber-700 dark:text-amber-500'
              : i.fato ? 'text-foreground'
              : 'text-[#854F0B] dark:text-amber-500'}`}>
              {i.valor}
            </div>
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
function DialogoGrupo({ card, valor, somenteLeitura, onAplicar, onFechar }: {
  card: IdCard;
  valor: BoitelEdicao;
  somenteLeitura?: boolean;
  onAplicar: (proximo: BoitelEdicao) => void;
  onFechar: () => void;
}) {
  const [local, setLocal] = useState<BoitelEdicao>(valor);
  const set = <K extends keyof BoitelEdicao>(k: K, v: BoitelEdicao[K]) => setLocal(a => ({ ...a, [k]: v }));
  const corpos = corposDoBoitel(local, set, setLocal, somenteLeitura);
  const ids = (Object.keys(GRUPOS) as IdGrupo[]).filter(id => GRUPOS[id].card === card);

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
            <div key={id} className="min-w-0">
              {/* ⚠ O TITULO E O TOPO DA HIERARQUIA e precisa se ler de relance: 12px/600
                  em `text-foreground`. Estava 10px muted, do mesmo peso da ajuda derivada —
                  tres degraus achatados em um, e a secao sumia. Separador `border-border`
                  no proprio titulo, e nao entre os campos. */}
              <div className="text-[12px] font-semibold uppercase tracking-wide text-foreground border-b border-border pb-1 mb-2.5">
                {GRUPOS[id].titulo}
              </div>
              {corpos[id]}
            </div>
          ))}
          </div>
        </div>
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

export function BoitelBlocosModais({ valor, onChange, somenteLeitura, cenario, detalheCenario, liquidoFormatado }: {
  valor: BoitelEdicao; onChange: (proximo: BoitelEdicao) => void; somenteLeitura?: boolean;
  /** Marca de projecao — UMA por cartao, no titulo. Ver `GrupoIndicadores`. */
  cenario?: CenarioBoitel;
  /** Texto que acompanha a pilula (mockup: "enviada em 13/05"). */
  detalheCenario?: string | null;
  /** O liquido projetado, ja formatado — mora DENTRO do cartao de projecao. */
  liquidoFormatado?: string | null;
}) {
  const [editando, setEditando] = useState<IdCard | null>(null);
  const indicadores = useMemo(() => indicadoresDoBoitel(valor), [valor]);

  /* ⚠ UM FRAGMENT COM DOIS FILHOS, e nao um `<div>`: a grade e' montada pelo shell, e um
     container aqui viraria UMA celula com dois cartoes empilhados dentro. */
  return (
    <>
      {/* ─── CARTAO PROJECAO — moldura ambar, tudo o que se planeja ───────────── */}
      <section className="rounded-md border-2 border-amber-500/70 bg-card p-3 shadow-sm min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-2 border-b pb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-medium text-foreground leading-none">Projeção</span>
            <PilulaCenario cenario={cenario} />
            {/* ⚠ O DETALHE ACOMPANHA A PILULA, e nao vira segunda marca: "enviada em
                13/05" diz DESDE QUANDO a projecao corre, que e' o contexto que faltava
                para julgar se ela ainda vale. */}
            {detalheCenario && (
              <span className="text-[10px] font-normal text-muted-foreground leading-none truncate">{detalheCenario}</span>
            )}
          </div>
          {liquidoFormatado && (
            <div className="shrink-0 text-right">
              <div className="text-[10px] font-normal text-muted-foreground leading-none whitespace-nowrap">Líquido projetado</div>
              <div className="mt-1 text-[20px] font-medium leading-none tabular-nums whitespace-nowrap text-[#854F0B] dark:text-amber-500">
                {liquidoFormatado}
              </div>
            </div>
          )}
        </div>
        <GrupoIndicadores titulo={TITULO_CARD.A} itens={indicadores.A} onAbrir={() => setEditando('A')} />
        <GrupoIndicadores titulo={TITULO_CARD.B} itens={indicadores.B} onAbrir={() => setEditando('B')} />
      </section>

      {/* ─── CARTAO REALIZADO — o vazio HONESTO ────────────────────────────────
          ⚠ BORDA TRACEJADA E SEM BOTAO. Ele nao promete acao nenhuma porque ainda nao ha
          caminho: o "lancar realizado" nasce na PARTE 2, com o cenario ligado. Um botao
          aqui seria mais uma instrucao apontando para o que nao existe.
          ⚠ E NAO E ESPACO DESPERDICADO: e' o lugar reservado que faz a projecao ao lado
          se ler como projecao, e nao como fato. */}
      <section className="rounded-md border border-dashed bg-muted/10 p-3 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 border-b border-dashed pb-1.5">
          <span className="text-[13px] font-medium text-muted-foreground leading-none">Realizado</span>
        </div>
        <div className="flex-1 flex items-center justify-center py-6">
          <p className="text-[11px] text-muted-foreground text-center leading-snug max-w-[16rem]">
            Será lançado no acerto do abate.
          </p>
        </div>
      </section>
      {editando && (
        <DialogoGrupo
          key={editando}
          card={editando}
          valor={valor}
          somenteLeitura={somenteLeitura}
          onAplicar={onChange}
          onFechar={() => setEditando(null)}
        />
      )}
    </>
  );
}
