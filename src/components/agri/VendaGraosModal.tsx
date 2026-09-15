/**
 * VENDER DO ESTOQUE — o documento inteiro, de bruto a parcela (F3.1).
 *
 * ⚠⚠ ABAS + RESUMO LATERAL FIXO — e o shell é o do `LancamentoV2Dialog`, não um desenho novo.
 * A primeira versão empilhou os cinco blocos numa coluna só, seguindo a ordem do abate: BASE →
 * DEDUÇÕES → LÍQUIDO → PAGAMENTO. A ordem estava certa e o MEIO estava errado — cinco blocos numa
 * coluna viram uma página que rola, e o A21 diz que o resumo nunca sai da tela. Aqui a ordem
 * sobrevive nas ABAS (a numeração delas É o fluxo), e o que era "ver o líquido nascer do bruto"
 * passa a ser o resumo da direita, que mostra os quatro números ao mesmo tempo, sempre.
 * ⚠ O GRID É O DE LÁ, copiado: `grid-cols-[1fr_300px] grid-rows-[auto_minmax(0,1fr)_auto]` com
 * altura FIXA `h-[92vh]`. É a altura fixa que garante o A23 — trocar de aba não muda o tamanho do
 * modal, porque só o miolo da coluna esquerda rola.
 *
 * ⚠ ELE CRESCEU DO `VendaAvulsaModal`, que era só o bloco 1. O nome mudou junto: "avulsa" era o
 * que ela era enquanto não tinha dedução nem parcela — hoje é uma operação comercial completa,
 * como o barter e a OC, e o arquivo diz isso.
 *
 * ⚠⚠ NENHUMA CONTA AQUI É SOBERANA. `agri_venda_graos_registrar` calcula bruto, líquido e o rateio
 * das parcelas; o front repete a MESMA conta (round2 por linha, soma depois) só para PREVER e para
 * travar o botão quando as parcelas não fecham. Onde os dois discordarem, quem vale é a RPC — e é
 * por isso que a prévia usa exatamente o arredondamento dela, item a item.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FornecedorSelect } from '@/components/shared/FornecedorSelect';
import { ContaBancariaSelect, type ContaSelecionavel } from '@/components/shared/ContaBancariaSelect';
import { CINZA_CABECALHO, TH_CINZA as TH } from '@/lib/idiomaVisual';
import { DatePicker, formatIsoToBr } from '@/components/ui/date-picker';
import { CampoMoeda, CampoNumero } from '@/components/ui/campo-moeda';
import { parseMoeda, round2, roundCasas, formatCasas } from '@/lib/calculos/numeroBR';
import { Save, AlertTriangle, X, Plus, Trash2, Ban, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { rotuloCulturaUnidade, unidadeCurtaDaCultura } from '@/lib/agri/colheita';
import { labelDaClasse, corDaClasse } from '@/lib/agri/barterVenda';
import type { EstoqueClasse, LancamentoSubstituivel, VendaGrao } from '@/hooks/useEstoqueGraos';
import { ComposicaoLeitura, DeducoesLeitura, ParcelasLeitura } from '@/components/agri/VendaGraosLeitura';
import { ConfirmarComMotivo } from '@/components/ui/confirmar-com-motivo';
/* ⚠ O VOCABULARIO DE DOCUMENTO E' O DO FINANCEIRO, IMPORTADO — nao uma lista nova aqui.
   `TIPOS_DOCUMENTO` e' a mesma constante que o `LancamentoV2Dialog` usa no seletor de tipo, e
   e' ela que define o que o banco aceita em `tipo_documento`. Uma copia local divergiria no
   primeiro tipo que o Financeiro acrescentasse, e a venda gravaria um tipo que o resto do
   sistema nao conhece. */
import { TIPOS_DOCUMENTO, type TipoDocumento } from '@/lib/financeiro/documentoHelper';

/** O que o modal devolve para quem chama `agri_venda_graos_registrar`. */
export interface VendaGraosPayload {
  comprador_id: string;
  data: string;
  /** `preco` OU `valor` — nunca os dois. A RPC dá precedência ao `valor` quando ele vem. */
  itens: Array<{ classe: string; sacas: number; preco: number | null; valor: number | null }>;
  /** `null` = critério PREÇO (a RPC soma os itens). Informado = critério VALOR TOTAL. */
  valor_bruto: number | null;
  senar: number;
  descontos: Array<{ descricao: string; valor: number }>;
  parcelas: Array<{
    vencimento: string; valor: number; pago: boolean;
    data_pagamento: string | null; conta_id: string | null;
  }>;
  observacoes: string | null;
  /** Numero do documento da venda (NF, romaneio, simulacao). `null` = sem documento. */
  documento: string | null;
  /** Um dos `TIPOS_DOCUMENTO`. So' existe com documento — a RPC ignora tipo sem numero. */
  tipo_documento: string | null;
  substituir: string[] | null;
}

/** O Senar da agricultura — 0,2% sobre o bruto. Editável, e pode ser zero. */
const SENAR_PCT_PADRAO = 0.2;

/**
 * O IDIOMA DOS CAMPOS — e ele é o sinal de modo, não um enfeite.
 *
 * ⚠ O DEFEITO QUE ISTO CORRIGE: "Editar" não mudava nada visível. Os três campos editáveis moram
 * na aba Recebimento, e quem clicava Editar na Composição continuava olhando a mesma tela de
 * leitura — o modo tinha mudado e a tela não dizia.
 * ⚠ BRANCO COM BORDA = SE ESCREVE. CINZA SEM CONTRASTE = NÃO SE ESCREVE. Nenhum dos dois muda
 * altura, padding ou fonte: o A23 vale entre modos, e um campo que cresce ao virar editável
 * empurraria os de baixo a cada clique.
 */
const CAMPO_EDITAVEL = 'border-input bg-background';
const CAMPO_TRAVADO = 'border-border/60 bg-muted text-muted-foreground';

interface ParcelaForm {
  vencimento: string; valor: string; pago: boolean;
  dataPagamento: string; contaId: string;
}

const novaParcela = (): ParcelaForm =>
  ({ vencimento: '', valor: '', pago: false, dataPagamento: '', contaId: '' });


/* ⚠ AS DUAS PEÇAS DO RESUMO SÃO CÓPIA do `LancamentoV2Dialog` (`ResumoBlocoHead`/`ResumoRow`,
   linhas 234-253), onde nasceram privadas. A régua tem de ser a MESMA — o briefing pede que as
   duas telas se leiam como irmãs —, e importar de lá arrastaria um arquivo de 2.300 linhas do
   Financeiro para dentro do estoque.
   ⚠⚠ O TERCEIRO CONSUMIDOR CHEGOU, e a conta que este comentário prometia está VENCIDA:
   `ResumoLateralOC` (compra/ResumoLateralOC.tsx:176) declara a terceira cópia, dizendo-se
   "ESPELHO de ResumoBlocoHead / ResumoRow". Subir as duas para `ui/` exige migrar também o
   `LancamentoV2Dialog` (25 usos) e a OC — é frente própria, [RESUMO-LATERAL-UI], não este PR.
   Não há nada em `ui/` para reusar hoje: `ui/bloco-topo-aba.tsx` é outra peça (o bloco cinza de
   números do TOPO de uma aba), conferido antes de escrever isto. */

/**
 * ⚠⚠ AS QUATRO PEÇAS MORAM AQUI FORA, em nível de módulo, e isso é correção de defeito latente
 * — [COMPONENTE-INTERNO-REMONTA]. Declaradas dentro do corpo, cada render criava um TIPO novo, e
 * o React desmonta e remonta um subtree cujo tipo mudou em vez de atualizá-lo. É exatamente o que
 * fazia o campo do motivo de cancelamento perder o foco a cada tecla no histórico de vendas
 * (0a99c9c5), medido lá: seis teclas, seis remontagens. Aqui nenhuma delas tem campo de digitação
 * hoje — mas o `AvisoSomenteLeitura` tem um `<button>`, e a próxima peça a nascer no lugar errado
 * herdaria o defeito inteiro.
 */
function BlocoHead({ titulo }: { titulo: string }) {
  return (
    <div className="mb-0.5 mt-0.5 border-y border-primary/15 bg-primary/10 px-3 py-0.5 first:mt-0">
      <span className="text-[9px] font-bold uppercase leading-none tracking-wide text-primary/90">{titulo}</span>
    </div>
  );
}

function Row({ label, value, valueClassName }: {
  label: string; value: string | null; valueClassName?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('truncate text-right font-medium', valueClassName)}>{value || '—'}</span>
    </div>
  );
}

/**
 * A LINHA QUE DIZ ONDE SE EDITA — só em edição, e só nas abas que não se editam.
 *
 * ⚠ ELA NÃO EXISTE EM VISUALIZAR: ali TUDO é leitura, e dizer "somente leitura" numa tela que
 * não prometeu edição nenhuma seria ruído. O aviso responde a uma pergunta que só quem clicou
 * em Editar tem — "então cadê o campo?".
 * ⚠ E O ATALHO É UM BOTÃO DE VERDADE, não um texto que ensina a clicar na aba: quem leu a
 * frase já quer ir, e obrigá-lo a mirar a aba lá em cima é cobrar duas mirações pelo mesmo
 * pedido.
 */
function AvisoSomenteLeitura({ editando, onIr }: { editando: boolean; onIr: () => void }) {
  if (!editando) return null;
  return (
    <div className="shrink-0 border-b border-border bg-muted/40 px-3 py-1 text-[10px] text-muted-foreground">
      Somente leitura.{' '}
      <button type="button" onClick={onIr}
        className="rounded font-medium text-primary underline-offset-2 hover:underline">
        O que pode ser editado está em Comprador.
      </button>
    </div>
  );
}

/** Uma linha do bloco de deduções — rótulo à esquerda, R$ à direita (A17). */
function LinhaConta({ rotulo, children, destaque }: {
  rotulo: React.ReactNode; children: React.ReactNode; destaque?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-2 py-0.5', destaque && 'border-t pt-1.5')}>
      <div className={cn('min-w-0 flex-1 truncate text-[11px]',
        destaque ? 'font-semibold' : 'text-muted-foreground')}>{rotulo}</div>
      <div className={cn('shrink-0 tabular-nums', destaque ? 'text-[13px] font-bold' : 'text-[11px]')}>
        {children}
      </div>
    </div>
  );
}

export function VendaGraosModal({
  aberto, onFechar, onRegistrar, salvando, estoque, cultura, safraRotulo,
  clienteId, contas, substituiveis,
  modo = 'criar', venda = null, onEditar, onCancelar, onCorrigir, onPedirCorrecao,
}: {
  aberto: boolean;
  onFechar: () => void;
  onRegistrar: (p: VendaGraosPayload) => void;
  salvando: boolean;
  estoque: readonly EstoqueClasse[];
  cultura: string;
  safraRotulo: string;
  clienteId: string;
  contas: ContaSelecionavel[];
  /** Lançamentos manuais que esta venda pode substituir. Vazio = o bloco nem aparece. */
  substituiveis: readonly LancamentoSubstituivel[];
  /**
   * ⚠ UM MODAL, TRÊS MODOS — não três componentes. Criar, ver e editar uma venda são a MESMA
   * coisa vista em momentos diferentes, e é assim que a OC já faz: quem aprendeu onde fica o
   * líquido ao vender encontra o líquido no mesmo lugar ao conferir.
   */
  modo?: 'criar' | 'visualizar' | 'editar' | 'corrigir';
  /**
   * ⚠ CORRIGIR É CANCELAR-E-REFAZER, e por isso é um modo e não um quarto botão do Editar: o
   * formulário inteiro volta a ser formulário, e o que sai dele não altera a venda — cancela a
   * antiga e grava outra no lugar, com os lançamentos do Financeiro refeitos.
   */
  onCorrigir?: (p: VendaGraosPayload & { venda_id: string; motivo: string }) => void;
  /** Pedir para reabrir ESTA venda no modo Corrigir — o mesmo gesto do lápis do histórico. */
  onPedirCorrecao?: (venda: VendaGrao) => void;
  /** A venda sendo vista ou editada. `null` no modo criar. */
  venda?: VendaGrao | null;
  onEditar?: (p: { id: string; data: string; comprador_id: string | null; observacoes: string | null }) => void;
  onCancelar?: (id: string, motivo: string) => void;
}) {
  /** A aba aberta. A ordem delas É o fluxo: compor → deduzir → receber. */
  const [aba, setAba] = useState<'composicao' | 'deducoes' | 'recebimento' | 'comprador' | 'substituir'>('composicao');
  /* ⚠ O MODO PODE MUDAR DENTRO DO MODAL (ver → editar), e por isso ele é estado, não só prop: o
     botão "Editar" troca de modo sem fechar e reabrir, que é o que faria o operador perder de vista
     o que estava conferindo. */
  const [modoAtual, setModoAtual] = useState<'criar' | 'visualizar' | 'editar' | 'corrigir'>(modo);
  const [cancelando, setCancelando] = useState(false);
  const [motivoCancel, setMotivoCancel] = useState('');
  const [motivoCorrecao, setMotivoCorrecao] = useState('');
  /* ⚠ DE ONDE O OPERADOR VEIO — para "Voltar" devolvê-lo à aba em que estava. Entrar em edição
     troca de aba (é lá que moram os campos editáveis); sair sem desfazer a troca o deixaria
     numa aba que ele não escolheu. */
  const [abaAntesDeEditar, setAbaAntesDeEditar] = useState<'composicao' | 'deducoes' | 'recebimento' | 'comprador' | 'substituir'>('composicao');
  const compradorRef = useRef<HTMLDivElement>(null);
  const leitura = modoAtual === 'visualizar';
  const corrigindo = modoAtual === 'corrigir';
  /* ⚠ `criando` PASSA A SIGNIFICAR "O FORMULÁRIO ESTÁ MONTADO", e corrigir também monta — é o
     mesmo formulário, preenchido. Quem precisa distinguir os dois usa `corrigindo`. */
  const criando = modoAtual === 'criar' || corrigindo;
  const registrando = modoAtual === 'criar';
  /* ⚠ SÓ A VENDA AVULSA ATIVA SE MEXE. O barter se governa no Barter e a cancelada não se
     reescreve — a RPC recusa os dois, e esconder o botão diz isso antes da tentativa. */
  const editavel = !!venda && venda.ativo && venda.tipo === 'venda_avulsa';
  /* ⚠ OS DOIS PREDICADOS DE TRAVA, nomeados uma vez porque decidem a cor de cinco campos.
     `camposTravados` é o que já existia repetido em cada campo (`leitura || (venda && !editavel)`);
     `docTravado` é mais estreito e a razão é do banco: `agri_venda_avulsa_editar` não recebe
     documento, então ele só se digita ao CRIAR. */
  /* ⚠ A MESMA PERGUNTA QUE A RPC FAZ antes de aceitar a correção — `bool_or(conciliado_em is
     not null)` sobre os lançamentos NÃO cancelados. Contar os cancelados travaria uma venda que
     já foi corrigida uma vez. É a mesma regra do lápis do histórico, escrita duas vezes porque
     os dois lados precisam dela antes do clique. */
  const jaConciliada = !!venda && venda.lancamentos.some(l => !l.cancelado && l.conciliado);
  const camposTravados = !corrigindo && (leitura || (!!venda && !editavel));
  const docTravado = !criando;   // `criando` já inclui corrigir
  /**
   * OS TRÊS CRITÉRIOS, e eles são três PERGUNTAS diferentes ao mesmo documento.
   *
   * ⚠ `preco` — sei quanto vale a saca. `linha` — sei quanto a classe rendeu em R$. `valor` —
   * sei só o total do documento e deixo a RPC ratear. A precedência no banco é a mesma:
   * valor total > valor de linha > preço por saca.
   * ⚠ `linha` NÃO RATEIA NADA: o R$ da classe é o que veio no papel da cooperativa, e o preço
   * por saca passa a ser derivado (`valor / sacas`, 4 casas). É o único critério que reproduz um
   * acerto sem inventar centavo — e por isso é ele que a correção usa para reabrir uma venda.
   */
  const [criterio, setCriterio] = useState<'preco' | 'linha' | 'valor'>('preco');
  const [valorTotal, setValorTotal] = useState('');
  const [itens, setItens] = useState<Record<string, { sacas: string; preco: number | null; valor: number | null }>>({});
  const [senarPct, setSenarPct] = useState(String(SENAR_PCT_PADRAO).replace('.', ','));
  const [senarReais, setSenarReais] = useState('');
  const [senarTocado, setSenarTocado] = useState(false);
  const [descontos, setDescontos] = useState<Array<{ descricao: string; valor: string }>>([]);
  const [condicao, setCondicao] = useState<'avista' | 'aprazo'>('avista');
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([novaParcela()]);
  const [compradorId, setCompradorId] = useState('');
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [obs, setObs] = useState('');
  const [documento, setDocumento] = useState('');
  const [tipoDoc, setTipoDoc] = useState<TipoDocumento | ''>('');
  const [substituir, setSubstituir] = useState<Set<string>>(new Set());
  const [abreSubstituir, setAbreSubstituir] = useState(false);

  const unidade = unidadeCurtaDaCultura(cultura);
  const editando = modoAtual === 'editar';

  /**
   * TROCAR DE CRITÉRIO CONVERTE O QUE JÁ FOI DIGITADO — não apaga, não deixa em branco.
   *
   * ⚠ O OPERADOR JÁ DIGITOU QUANDO PERCEBE QUE O CRITÉRIO ERA OUTRO. Zerar as linhas puniria
   * a descoberta; manter os números em campos que aquele critério não lê seria pior ainda,
   * porque a tela mostraria um total que a RPC não vai gravar.
   * ⚠ A CONVERSÃO NÃO É REVERSÍVEL SEM PERDA e é por isso que ela AVISA: de preço para valor,
   * `valor = round2(sacas × preço)`; de valor para preço, `preço = valor / sacas` a 4 casas.
   * Ida e volta em 1.234,56 com 3 sacas não devolve o mesmo centavo.
   */
  const [criterioConvertido, setCriterioConvertido] = useState<string | null>(null);
  const trocarCriterio = (novo: 'preco' | 'linha' | 'valor') => {
    if (novo === criterio) return;
    setItens(o => {
      const out: typeof o = {};
      for (const [classe, v] of Object.entries(o)) {
        const sacas = parseMoeda(v.sacas) ?? 0;
        if (novo === 'linha' && v.valor == null && sacas > 0 && (v.preco ?? 0) > 0) {
          out[classe] = { ...v, valor: round2(sacas * (v.preco ?? 0)) };
        } else if (novo === 'preco' && (v.preco ?? 0) <= 0 && sacas > 0 && (v.valor ?? 0) > 0) {
          out[classe] = { ...v, preco: roundCasas((v.valor ?? 0) / sacas, 4) };
        } else {
          out[classe] = v;
        }
      }
      return out;
    });
    setCriterioConvertido(
      novo === 'linha' ? 'Os preços viraram o R$ de cada linha (sacas × preço).'
        : criterio === 'linha' && novo === 'preco' ? 'Os valores viraram preço por saca (valor ÷ sacas, 4 casas).'
          : null);
    setCriterio(novo);
  };

  /**
   * ENTRAR EM EDIÇÃO É IR ONDE SE EDITA — e é isto que faltava.
   *
   * ⚠ OS CAMPOS EDITÁVEIS MORAM NO RECEBIMENTO (comprador, data, observações), e o botão Editar
   * vive no rodapé, visível de qualquer aba. Quem clicava a partir da Composição trocava de modo
   * sem sair do lugar e concluía, com razão, que o botão não fazia nada.
   */
  const entrarEmEdicao = () => {
    setAbaAntesDeEditar(aba);
    setModoAtual('editar');
    setAba('comprador');
  };
  const voltarDaEdicao = () => {
    setModoAtual('visualizar');
    setAba(abaAntesDeEditar);
  };

  /**
   * O CURSOR CAI NO COMPRADOR — e o anel dele é `focus:`, não `focus-visible:`, DE PROPÓSITO.
   *
   * ⚠ A ABA É `comprador` DESDE O VENDA-08 — era `recebimento`, e os campos mudaram de casa.
   * ⚠ MEDIDO NO CHROME: `.focus()` programático logo depois de um clique de mouse NÃO casa
   * `:focus-visible` num `button` nem num `[role=combobox]` (só casa em campo de texto). Focar o
   * comprador e parar por aí seria repetir o defeito em outra forma — o foco iria para lá e o
   * operador não veria nada mudar. O anel abaixo é incondicional enquanto se edita.
   */
  useEffect(() => {
    if (!aberto || !editando || aba !== 'comprador') return;
    const id = requestAnimationFrame(() => {
      compradorRef.current?.querySelector<HTMLElement>('button[role="combobox"]')?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [aberto, editando, aba]);

  /* ⚠ RECOMEÇA A CADA ABERTURA — sem isto, reabrir traz a venda anterior e um Registrar distraído
     vende o mesmo grão duas vezes. O preço nasce no `preco_ref` da classe: é um palpite honesto,
     porque é o que já se praticou naquela classe. */
  useEffect(() => {
    if (!aberto) return;
    const inicial: Record<string, { sacas: string; preco: number | null; valor: number | null }> = {};
    for (const c of estoque) inicial[c.classe] = { sacas: '', preco: c.preco_ref > 0 ? c.preco_ref : null, valor: null };
    setItens(inicial);
    setAba('composicao');
    setModoAtual(modo);
    setCancelando(false); setMotivoCancel('');
    setCriterio('preco'); setValorTotal('');
    setAbaAntesDeEditar('composicao');
    setDocumento(''); setTipoDoc('');
    /* ⚠ VER E EDITAR PREENCHEM O QUE A RPC DE EDIÇÃO ACEITA — comprador, data e observações. O
       resto do formulário nem é montado nesses modos: são as telas de leitura. */
    if (venda) {
      setCompradorId(venda.comprador_id ?? '');
      setData(venda.data.slice(0, 10));
      setObs(venda.observacoes ?? '');
      setMotivoCorrecao('');
      if (modo !== 'corrigir') return;
      /**
       * ⚠⚠ CORRIGIR REABRE NO CRITÉRIO `linha`, e é o ÚNICO que reproduz o gravado sem perda.
       * O banco guarda `sacas`, `preco_saca` (4 casas) e `valor` (2) por entrega; refazer por
       * `sacas × preço` devolveria centavos diferentes dos que estão lá. Com o valor da linha,
       * a venda nova nasce com os mesmos números da antiga — e o que mudar terá sido o operador.
       */
      setCriterio('linha');
      setCriterioConvertido(null);
      setItens(o => {
        const out = { ...o };
        for (const it of venda.itens) {
          out[it.classe] = { sacas: formatCasas(it.sacas, 4), preco: it.preco_saca, valor: it.valor };
        }
        return out;
      });
      setSenarTocado(true);
      setSenarReais(formatCasas(venda.senar, 2));
      setSenarPct(venda.bruto > 0 ? formatCasas(round2(venda.senar / venda.bruto * 100), 2) : '0,00');
      /* ⚠ OS DESCONTOS VOLTAM COMO UMA LINHA SÓ, e não como os que foram digitados: a RPC soma
         `p_descontos` num único `v_desc` e nunca guarda a descrição de cada um. O total é
         recuperável; a discriminação foi perdida na gravação original. */
      const outrosDescontos = round2(Math.max(venda.deducoes - venda.senar, 0));
      setDescontos(outrosDescontos > 0 ? [{ descricao: 'Descontos', valor: formatCasas(outrosDescontos, 2) }] : []);
      /* ⚠ AS PARCELAS SÃO OS LANÇAMENTOS DE RECEITA não cancelados — a mesma leitura do
         `ParcelasLeitura`. A CONTA não vem: `fn_vendas_graos` não devolve `conta_destino_id`,
         então ela volta em branco e o rodapé trava até o operador escolher. É consciente, não
         silencioso: gravar a conta errada seria pior que pedi-la de novo. */
      const vivos = venda.lancamentos.filter(l => !l.cancelado);
      const recibos = vivos.filter(l => l.natureza === 'receita_venda');
      /**
       * ⚠ O VALOR DA PARCELA É O LÍQUIDO, e o lançamento de receita guarda o BRUTO dela:
       * a RPC grava `receita_i = parcela_i + senar_i + desconto_i`. Para voltar ao que o
       * operador digitou, subtraem-se as deduções DAQUELA parcela — casadas pelo vencimento,
       * que é o mesmo `v_venc` nos três lançamentos.
       * ⚠ RATEAR `deducoes / n` DARIA ERRADO NA ÚLTIMA: a RPC manda o resíduo dos centavos para
       * a parcela final, e uma divisão igual não o reproduz.
       */
      const deducaoDoVencimento = (venc: string | null) => vivos
        .filter(l => l.natureza !== 'receita_venda' && l.data_vencimento === venc)
        .reduce((a, l) => a + l.valor, 0);
      /* ⚠ SEMPRE "A PRAZO", mesmo com uma parcela: o modo à vista sobrescreve valor e data com o
         líquido e a data da venda, e aqui o que vale é o que foi gravado. Uma parcela a prazo é
         a mesma coisa, sem a sobrescrita. */
      setCondicao('aprazo');
      setParcelas(recibos.length > 0
        ? recibos.map(l => ({
            vencimento: (l.data_vencimento ?? '').slice(0, 10),
            valor: formatCasas(round2(l.valor - deducaoDoVencimento(l.data_vencimento)), 2),
            pago: !!l.data_pagamento || l.conciliado,
            dataPagamento: (l.data_pagamento ?? '').slice(0, 10),
            contaId: '',
          }))
        : [novaParcela()]);
      return;
    }
    setSenarPct(String(SENAR_PCT_PADRAO).replace('.', ',')); setSenarReais(''); setSenarTocado(false);
    setDescontos([]); setCondicao('avista'); setParcelas([novaParcela()]);
    setCompradorId(''); setObs(''); setSubstituir(new Set()); setAbreSubstituir(false);
    setData(new Date().toISOString().slice(0, 10));
  }, [aberto, estoque, modo, venda]);

  /**
   * AS LINHAS, COM O PREÇO QUE VALE EM CADA CRITÉRIO.
   *
   * ⚠ NO CRITÉRIO "VALOR TOTAL" O PREÇO É DERIVADO, e a conta é a da RPC: se o operador informou
   * preços, eles viram PESO — `fator = valor / soma(sacas × preço)` — e cada classe fica com
   * `preço × fator`. Se não informou nenhum, o rateio é por saca: `valor / total de sacas`.
   * ⚠ POR QUE PESO E NÃO MÉDIA: um documento de duas classes raramente as paga igual, e o operador
   * sabe a proporção mesmo quando não sabe o preço exato. Ratear tudo por saca achataria grão bom
   * e roça no mesmo valor.
   */
  const linhas = useMemo(() => {
    const brutos = estoque.map(c => {
      const sacas = parseMoeda(itens[c.classe]?.sacas ?? '') ?? 0;
      const preco = itens[c.classe]?.preco ?? 0;
      const valor = itens[c.classe]?.valor ?? 0;
      return { classe: c.classe, sacas, preco, valor };
    });
    const somaAoPreco = brutos.reduce((a, b) => a + round2(b.sacas * b.preco), 0);
    const somaSacas = brutos.reduce((a, b) => a + b.sacas, 0);
    const alvo = criterio === 'valor' ? (parseMoeda(valorTotal) ?? 0) : 0;
    const fator = criterio === 'valor' && somaAoPreco > 0 ? alvo / somaAoPreco : 0;

    return estoque.map(c => {
      const b = brutos.find(x => x.classe === c.classe)!;
      /* ⚠ NO CRITÉRIO `linha` O PREÇO É QUE DERIVA, e a divisão é a mesma da RPC: `valor / sacas`
         a 4 casas. Sem saca não há preço — a RPC recusa com `VALOR_DE_LINHA_SEM_SACAS`, e aqui
         o zero apenas evita dividir por zero até o operador digitar a quantidade. */
      const precoEfetivo = criterio === 'linha'
        ? (b.sacas > 0 ? roundCasas(b.valor / b.sacas, 4) : 0)
        : criterio === 'preco' ? b.preco
          : somaAoPreco > 0 ? b.preco * fator
            : somaSacas > 0 ? alvo / somaSacas : 0;
      return {
        ...c,
        sacas: b.sacas,
        precoDigitado: b.preco,
        valorDigitado: b.valor,
        precoEfetivo,
        /* ⚠ EM `linha` O TOTAL É O QUE VEIO NO PAPEL, não `sacas × preço`: refazer a conta a
           partir do preço derivado devolveria centavos diferentes do documento. */
        total: criterio === 'linha' ? round2(b.valor) : round2(b.sacas * precoEfetivo),
        excede: b.sacas > c.saldo + 0.005,
        travada: c.saldo <= 0,
        sobra: Math.max(c.saldo - b.sacas, 0),
      };
    });
  }, [estoque, itens, criterio, valorTotal]);

  const vendidas = linhas.reduce((a, l) => a + l.sacas, 0);
  const sobraTotal = linhas.reduce((a, l) => a + l.sobra, 0);
  const saldoAtual = linhas.reduce((a, l) => a + l.saldo, 0);
  const excede = linhas.some(l => l.excede);

  /* ⚠ O BRUTO É O CRITÉRIO, não a soma sempre: no "valor total" quem manda é o documento, e a
     soma das linhas apenas o distribui. Trocar isso faria a tela mostrar um bruto e a RPC gravar
     outro, por centavos de rateio. */
  const bruto = criterio === 'valor'
    ? (parseMoeda(valorTotal) ?? 0)
    : linhas.reduce((a, l) => a + l.total, 0);   // `linha` e `preco` somam o total da linha

  /**
   * SENAR: O % E O R$ SE PERSEGUEM, como o funrural do abate.
   *
   * ⚠ ENQUANTO NINGUÉM TOCA, o R$ segue o bruto — mudar a quantidade vendida recalcula a dedução
   * sozinha, que é o que o operador espera. Depois do primeiro toque, o que ele escreveu manda:
   * um documento pode trazer um Senar que não é exatamente 0,2%, e sobrescrevê-lo seria apagar o
   * dado do papel.
   */
  const senar = useMemo(() => {
    if (senarTocado) return parseMoeda(senarReais) ?? 0;
    return round2(bruto * (parseMoeda(senarPct) ?? 0) / 100);
  }, [senarTocado, senarReais, senarPct, bruto]);

  const mudarSenarPct = (v: string) => {
    setSenarPct(v);
    setSenarTocado(true);
    setSenarReais(formatCasas(round2(bruto * (parseMoeda(v) ?? 0) / 100), 2));
  };
  const mudarSenarReais = (v: string) => {
    setSenarReais(v);
    setSenarTocado(true);
    const n = parseMoeda(v) ?? 0;
    setSenarPct(bruto > 0 ? formatCasas(round2(n / bruto * 100), 2) : '0,00');
  };

  const totalDescontos = descontos.reduce((a, d) => a + (parseMoeda(d.valor) ?? 0), 0);
  const liquido = round2(bruto - senar - totalDescontos);

  /* ⚠ À VISTA É UMA PARCELA, e ela não é um caso especial no banco: a RPC recebe `p_parcelas`
     sempre. Aqui o toggle só monta a parcela única com a data da venda e já paga — o operador não
     digita duas vezes o que já disse. */
  const parcelasEfetivas: ParcelaForm[] = condicao === 'avista'
    ? [{ vencimento: data, valor: formatCasas(liquido, 2), pago: true, dataPagamento: data,
         contaId: parcelas[0]?.contaId ?? '' }]
    : parcelas;

  const somaParcelas = parcelasEfetivas.reduce((a, p) => a + (parseMoeda(p.valor) ?? 0), 0);
  const diferenca = round2(liquido - somaParcelas);
  const fecha = Math.abs(diferenca) <= 0.01;

  const dividirIgual = () => {
    const n = parcelas.length;
    if (n === 0 || liquido <= 0) return;
    /* ⚠ O RESÍDUO VAI NA ÚLTIMA — dividir 10.000 em 3 dá 3.333,33 duas vezes e 3.333,34 uma. Sem
       isso a soma fecha um centavo abaixo e a RPC recusa com `PARCELAS_NAO_FECHAM_LIQUIDO`. */
    const base = round2(liquido / n);
    setParcelas(parcelas.map((p, i) => ({
      ...p,
      valor: formatCasas(i === n - 1 ? round2(liquido - base * (n - 1)) : base, 2),
    })));
  };

  const impedimento = vendidas <= 0 ? `Informe quantas ${unidade === 't' ? 'toneladas' : 'sacas'} vender.`
    : excede ? 'Há classe acima do saldo em estoque.'
      : bruto <= 0 ? (criterio === 'valor' ? 'Informe o valor total do documento.'
        : criterio === 'linha' ? 'Informe o valor em R$ de cada classe que está vendendo.'
          : 'Informe o preço das classes que está vendendo.')
        : liquido <= 0 ? 'As deduções não podem consumir o valor da venda.'
          : !compradorId ? 'Escolha o comprador.'
            : !data ? 'Informe a data da venda.'
              : parcelasEfetivas.some(p => !p.vencimento) ? 'Informe o vencimento de cada parcela.'
                : parcelasEfetivas.some(p => !p.contaId) ? 'Escolha a conta de cada parcela.'
                  : !fecha ? `As parcelas não fecham o líquido — diferença de ${formatMoeda(Math.abs(diferenca))}.`
                    : corrigindo && !motivoCorrecao.trim() ? 'Informe o motivo da correção.'
                      : null;

  const registrar = () => {
    if (impedimento) return;
    /* ⚠ O MESMO FORMULÁRIO, DUAS SAÍDAS: corrigir manda o payload inteiro mais o id e o motivo,
       e quem chama decide a RPC. Montar dois payloads diferentes faria a correção divergir do
       registro no dia em que um campo novo entrasse só num deles. */
    const enviar = corrigindo && venda && onCorrigir
      ? (p: VendaGraosPayload) => onCorrigir({ ...p, venda_id: venda.id, motivo: motivoCorrecao.trim() })
      : onRegistrar;
    enviar({
      comprador_id: compradorId,
      data,
      /* ⚠ MANDA O PREÇO DIGITADO, não o derivado: no critério "valor total" quem deriva é a RPC, e
         mandar o derivado faria a conta acontecer duas vezes, com dois arredondamentos. */
      /* ⚠ EM `linha` VAI O VALOR E NÃO O PREÇO: mandar os dois faria a RPC escolher (ela dá
         precedência ao `valor`) e o front afirmaria duas coisas sobre a mesma linha. */
      itens: linhas.filter(l => l.sacas > 0).map(l => criterio === 'linha'
        ? { classe: l.classe, sacas: l.sacas, preco: null, valor: round2(l.valorDigitado) }
        : { classe: l.classe, sacas: l.sacas, preco: l.precoDigitado > 0 ? l.precoDigitado : null, valor: null }),
      valor_bruto: criterio === 'valor' ? bruto : null,
      senar,
      descontos: descontos
        .filter(d => (parseMoeda(d.valor) ?? 0) > 0)
        .map(d => ({ descricao: d.descricao.trim() || 'Desconto', valor: parseMoeda(d.valor) ?? 0 })),
      parcelas: parcelasEfetivas.map(p => ({
        vencimento: p.vencimento,
        valor: parseMoeda(p.valor) ?? 0,
        pago: p.pago,
        data_pagamento: p.pago ? (p.dataPagamento || p.vencimento) : null,
        conta_id: p.contaId || null,
      })),
      observacoes: obs.trim() || null,
      /* ⚠ O TIPO SÓ VIAJA COM O NÚMERO, espelhando a RPC: ela grava `tipo_documento` só quando
         `nullif(btrim(p_documento),'')` não é nulo. Mandar um tipo sozinho seria classificar
         um documento que não existe. */
      documento: documento.trim() || null,
      tipo_documento: documento.trim() ? (tipoDoc || 'Outros') : null,
      substituir: substituir.size > 0 ? [...substituir] : null,
    });
  };


  /* ⚠ O RECEBIMENTO EM UMA FRASE, para o resumo: "A vista em 15/09/26" ou a lista dos vencimentos.
     Ele é o único item do resumo que não é um número — e é o que o operador confere por último. */
  const resumoRecebimento = condicao === 'avista'
    ? (data ? `À vista em ${formatIsoToBr(data)}` : null)
    : parcelas.some(p => p.vencimento)
      ? parcelas.filter(p => p.vencimento)
          .map(p => `${formatIsoToBr(p.vencimento)} ${formatMoeda(parseMoeda(p.valor) ?? 0)}`).join(' · ')
      : null;

  const abas = [
    { id: 'composicao' as const, label: 'Composição' },
    { id: 'deducoes' as const, label: 'Deduções' },
    { id: 'recebimento' as const, label: 'Recebimento' },
    /* ⚠ COMPRADOR É ABA, e não mais o rodapé da Recebimento: quem estava ali lia duas coisas
       diferentes na mesma tela — QUANDO o dinheiro entra (parcelas) e DE QUEM é a venda
       (comprador, data, documento). Separadas, a tabela de parcelas ganha a altura inteira da
       aba, que é o que faltava para quatro parcelas caberem.
       ⚠ DEPOIS DE RECEBIMENTO, não antes: a ordem das abas É o fluxo (compor → deduzir →
       receber → identificar), e identificação é o que se confere por último, junto do resumo. */
    { id: 'comprador' as const, label: 'Comprador' },
    /* ⚠ A ABA DE SUBSTITUIÇÃO SÓ EXISTE COM CANDIDATO, e leva a contagem no título: uma aba vazia
       ensinaria que há uma decisão a tomar onde não há. */
    /* ⚠ SÓ NO MODO CRIAR: substituir um lançamento manual é decisão de quem está REGISTRANDO a
       venda. Depois de gravada, a substituição já aconteceu (ou não) e a aba viraria um botão que
       não faz nada. */
    ...(criando && substituiveis.length > 0
      ? [{ id: 'substituir' as const, label: `Substituir (${substituiveis.length})` }]
      : []),
  ];

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      {/* ⚠ ALTURA FIXA `h-[92vh]` E GRID DE 2×3 — o shell do `LancamentoV2Dialog`. A altura fixa é
          o que faz o A23 valer: trocar de aba não muda o tamanho do modal, porque quem rola é só o
          miolo da coluna esquerda. O resumo faz `row-span-2` e ocupa a coluna direita inteira,
          inclusive ao lado do rodapé. */}
      <DialogContent className={cn(
        'flex flex-col overflow-hidden border border-border bg-card p-0 shadow-2xl',
        'h-[92vh] max-h-[92vh] max-w-5xl [&>button.absolute]:hidden',
        'grid grid-cols-[1fr_300px] grid-rows-[auto_minmax(0,1fr)_auto]',
      )}>
        <div className="col-span-2 col-start-1 row-start-1 flex items-start gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">
              {corrigindo ? 'Corrigir venda' : registrando ? 'Vender do estoque' : 'Venda'} · {labelDaCultura(cultura)}
              {safraRotulo && ` · Safra ${safraRotulo}`}
              {venda && ` · ${formatIsoToBr(venda.data.slice(0, 10))}`}
            </h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">
              {corrigindo
                ? 'A venda atual será cancelada e esta registrada no lugar; os lançamentos do Financeiro são refeitos.'
                : criando
                ? `${formatNum(saldoAtual, 2)} ${unidade} disponíveis. A venda baixa o estoque e gera os lançamentos no Financeiro, parcela a parcela.`
                /* ⚠ O SUBTÍTULO É O SINAL DE MODO MAIS ALTO da tela, e diz o LIMITE junto: o que
                   não se edita aqui tem conserto (cancelar e registrar de novo), e dizê-lo agora
                   evita a busca por um campo de sacas que não existe.
                   ⚠ E ELE NÃO PROMETE O DOCUMENTO. O briefing pedia "comprador, data, documento e
                   observações", mas `agri_venda_avulsa_editar` tem 4 argumentos e nenhum é
                   documento — conferido em pg_proc. Prometer no cabeçalho uma edição que o campo
                   logo abaixo mostra travada seria a tela discordando de si mesma. */
                : editando
                  ? 'Editando dados · comprador, data e observações. Para sacas, preço, deduções ou parcelas use Corrigir.'
                : venda && !venda.ativo
                  /* ⚠ A FAIXA DA CANCELADA É MUDA, não alarmante: o estorno já aconteceu e foi
                     deliberado. Vermelho aqui trataria uma decisão do operador como acidente. */
                  ? `Cancelada em ${formatIsoToBr((venda.cancelado_em ?? '').slice(0, 10) || venda.data.slice(0, 10))} por ${venda.cancelado_por || '—'}${venda.motivo_cancelamento ? `: ${venda.motivo_cancelamento}` : ''}`
                  : venda?.tipo === 'barter'
                    ? 'Entrega de barter — o contrato e as entregas se editam no próprio Barter.'
                    : 'Composição, deduções e recebimento desta venda.'}
            </p>
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="icon"
            className="h-7 w-7 shrink-0 text-primary-foreground/90 hover:bg-white/10 hover:text-white"
            title="Fechar" onClick={onFechar}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Tabs value={aba} onValueChange={v => setAba(v as typeof aba)}
          className="col-start-1 row-start-2 flex min-h-0 flex-col">
          {/* ⚠ A RÉGUA DAS ABAS É A DO FINANCEIRO, copiada: inativa discreta, ativa com fundo
              `background`, borda fininha SEM a de baixo e um `after:` de 1px no primário. Duas
              bordas somadas dariam a linha grossa que o briefing chama de "pasta evidente". */}
          <TabsList className="h-8 w-full shrink-0 justify-start gap-0.5 rounded-none border-b border-border bg-accent/40 px-2">
            {abas.map(a => (
              <TabsTrigger key={a.id} value={a.id} className={cn(
                'relative h-6 rounded-b-none rounded-t-md px-3 text-[12px] font-medium text-muted-foreground',
                'hover:bg-background/60 hover:text-foreground',
                'data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-foreground',
                'data-[state=active]:border data-[state=active]:border-border data-[state=active]:border-b-transparent data-[state=active]:shadow-sm',
                'data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-px data-[state=active]:after:bg-primary',
              )}>
                {a.label}
                {/* ⚠ O PONTO VERMELHO NA ABA QUE TRAVA O BOTÃO — o mesmo recurso do Financeiro. Sem
                    ele, o operador lê "as parcelas não fecham" no rodapé e não sabe onde ir. */}
                {a.id === 'recebimento' && !fecha && vendidas > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-destructive"
                    aria-label="pendência" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── ABA 1 — COMPOSIÇÃO ─────────────────────────────────────────────────────────── */}
          <TabsContent value="composicao" className="min-h-0 flex-1 overflow-hidden p-0 data-[state=inactive]:hidden">
            {venda && !corrigindo ? (
              <div className="flex h-full min-h-0 flex-col">
                <AvisoSomenteLeitura editando={editando} onIr={() => setAba('comprador')} />
                <ComposicaoLeitura venda={venda} unidade={unidade} />
              </div>
            ) : (
            <div className="flex h-full min-h-0 flex-col gap-1.5 px-3 py-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">{rotuloCulturaUnidade(cultura)}</p>
                <div className="flex h-8 w-fit overflow-hidden rounded-md border">
                  {([['preco', 'Preço por saca'], ['linha', 'Valor por linha'], ['valor', 'Valor total']] as const).map(([v, r]) => (
                    <button key={v} type="button" onClick={() => trocarCriterio(v)}
                      className={cn('px-3 text-[11px] font-medium transition-colors',
                        criterio === v ? 'bg-primary text-primary-foreground'
                          : 'bg-transparent text-muted-foreground hover:bg-muted')}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* ⚠ UMA LINHA MUTED, e ela some ao próximo gesto: o aviso responde "cadê meus
                  números?" no instante em que a pergunta existe, e não vira mobília depois. */}
              {criterioConvertido && (
                <p className="text-[10px] text-muted-foreground">{criterioConvertido}</p>
              )}

              {criterio === 'valor' && (
                <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 px-2 py-1.5">
                  <div className="w-[190px]">
                    <Label className="text-[10px]">Valor total do documento (R$) <span className="text-destructive">*</span></Label>
                    <CampoNumero valor={valorTotal} onChange={setValorTotal} casas={2}
                      className="mt-0.5 h-8 text-right text-[12px]" />
                  </div>
                  <p className="min-w-0 flex-1 text-[10px] leading-snug text-muted-foreground">
                    O R$/{unidade} de cada classe é derivado do total. Com preços informados eles
                    entram como <strong>peso</strong> do rateio; em branco, rateia por saca.
                  </p>
                </div>
              )}

              {/* ⚠ QUEM ROLA É A LISTA, NÃO O MODAL (A28): o `overflow-auto` mora aqui, e o
                  cabeçalho e o Total da tabela ficam dentro dele — com três classes nunca rola,
                  e numa cultura de muitas classes rola só esta caixa. */}
              <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                <table className="w-full table-fixed border-collapse">
                  <colgroup>
                    {['22%', '14%', '17%', '17%', '15%', '15%'].map((w, i) => <col key={i} style={{ width: w }} />)}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={cn(TH, 'text-left')}>Classe</th>
                      <th className={cn(TH, 'text-right')}>Em estoque</th>
                      <th className={cn(TH, 'text-right')}>Vender ({unidade})</th>
                      <th className={cn(TH, 'text-right')}>R$ / {unidade}</th>
                      <th className={cn(TH, 'text-right')}>{criterio === 'linha' ? 'Valor (R$)' : 'Total'}</th>
                      <th className={cn(TH, 'text-right')}>Saldo final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map(l => (
                      <tr key={l.classe} className={cn('border-t border-slate-100', l.travada && 'opacity-45')}>
                        <td className="truncate px-2 py-1 text-[11px]">
                          <span className={cn('mr-1.5 inline-block h-2 w-2 rounded-full align-[-1px]',
                            corDaClasse(l.classe))} />
                          {labelDaClasse(l.classe)}
                        </td>
                        <td className="px-2 py-1 text-right text-[11px] tabular-nums">{formatNum(l.saldo, 2)}</td>
                        <td className="px-1 py-1">
                          <CampoNumero valor={itens[l.classe]?.sacas ?? ''} disabled={l.travada}
                            casas={4} title={itens[l.classe]?.sacas ?? ''}
                            onChange={v => setItens(o => ({
                              ...o, [l.classe]: { ...(o[l.classe] ?? { preco: null, valor: null }), sacas: v },
                            }))}
                            className={cn('h-7 text-right text-[11px]',
                              l.excede && 'border-destructive focus-visible:ring-destructive')} />
                          {l.excede && (
                            <div className="mt-0.5 flex items-center gap-1 text-[9px] text-destructive">
                              <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                              acima do saldo ({formatNum(l.saldo, 2)} {unidade})
                            </div>
                          )}
                        </td>
                        <td className="px-1 py-1">
                          {/* ⚠ EM `valor` E EM `linha` O PREÇO É DERIVADO e aparece muted — a coluna
                              não muda de lugar nem de largura, só deixa de ser campo (A23). */}
                          {criterio !== 'preco' ? (
                            <div className="truncate px-1 text-right text-[11px] tabular-nums text-muted-foreground"
                              title={l.precoEfetivo ? formatCasas(l.precoEfetivo, 4) : undefined}>
                              {l.precoEfetivo > 0 ? formatCasas(l.precoEfetivo, 4) : '—'}
                            </div>
                          ) : (
                            <CampoMoeda valor={itens[l.classe]?.preco ?? null} disabled={l.travada}
                              casas={4}
                              onChange={v => setItens(o => ({
                                ...o, [l.classe]: { ...(o[l.classe] ?? { sacas: '', valor: null }), preco: v },
                              }))}
                              className="h-7 text-right text-[11px]" />
                          )}
                        </td>
                        {/* ⚠ É A COLUNA `TOTAL` QUE VIRA CAMPO, não uma coluna nova: o número que
                            o operador tem no papel é o total da classe, e ele o digita onde já o
                            lê. Nenhuma coluna muda de posição entre os três critérios (A23). */}
                        {criterio === 'linha' ? (
                          <td className="px-1 py-1">
                            <CampoMoeda valor={itens[l.classe]?.valor ?? null} disabled={l.travada}
                              casas={2}
                              onChange={v => setItens(o => ({
                                ...o, [l.classe]: { ...(o[l.classe] ?? { sacas: '', preco: null }), valor: v },
                              }))}
                              className="h-7 text-right text-[11px]" />
                          </td>
                        ) : (
                          <td className="px-2 py-1 text-right text-[11px] font-medium tabular-nums">
                            {l.total > 0 ? formatMoeda(l.total) : '—'}
                          </td>
                        )}
                        <td className={cn('px-2 py-1 text-right text-[11px] font-medium tabular-nums',
                          l.sacas > 0 && 'text-success')}>
                          {formatNum(l.sobra, 2)}
                        </td>
                      </tr>
                    ))}
                    <tr className={cn(CINZA_CABECALHO, 'text-white')}>
                      <td className="px-2 py-1 text-[11px] font-bold">Total</td>
                      <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">{formatNum(saldoAtual, 2)}</td>
                      <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                        {vendidas > 0 ? formatNum(vendidas, 2) : '—'}
                      </td>
                      <td className="px-2 py-1" />
                      <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                        {bruto > 0 ? formatMoeda(bruto) : '—'}
                      </td>
                      <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">{formatNum(sobraTotal, 2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </TabsContent>

          {/* ── ABA 2 — DEDUÇÕES ───────────────────────────────────────────────────────────── */}
          <TabsContent value="deducoes" className="min-h-0 flex-1 overflow-auto p-0 data-[state=inactive]:hidden">
            {venda && !corrigindo ? (
              <div className="flex h-full min-h-0 flex-col">
                <AvisoSomenteLeitura editando={editando} onIr={() => setAba('comprador')} />
                <DeducoesLeitura venda={venda} />
              </div>
            ) : (
            <div className="px-3 py-2">
              <div className="rounded-md border bg-muted/20 px-3 py-2">
                <LinhaConta rotulo="= Bruto">{bruto > 0 ? formatMoeda(bruto) : '—'}</LinhaConta>
                <div className="flex items-center gap-2 py-0.5">
                  <div className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">(−) Senar</div>
                  <div className="flex shrink-0 items-center gap-1">
                    <CampoNumero valor={senarPct} onChange={mudarSenarPct} casas={2}
                      className="h-7 w-[64px] text-right text-[11px]" />
                    <span className="text-[10px] text-muted-foreground">%</span>
                    <CampoNumero valor={senarTocado ? senarReais : formatCasas(senar, 2)}
                      onChange={mudarSenarReais} casas={2}
                      className="h-7 w-[104px] text-right text-[11px]" />
                  </div>
                </div>
                {descontos.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 py-0.5">
                    <Input value={d.descricao} placeholder="Secagem, armazenagem…"
                      onChange={e => setDescontos(o => o.map((x, j) => j === i ? { ...x, descricao: e.target.value } : x))}
                      className="h-7 min-w-0 flex-1 text-[11px]" />
                    <CampoNumero valor={d.valor} casas={2}
                      onChange={v => setDescontos(o => o.map((x, j) => j === i ? { ...x, valor: v } : x))}
                      className="h-7 w-[104px] shrink-0 text-right text-[11px]" />
                    <button type="button" title="Remover desconto" aria-label="Remover desconto"
                      onClick={() => setDescontos(o => o.filter((_, j) => j !== i))}
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-rose-100 hover:text-rose-700">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setDescontos(o => [...o, { descricao: '', valor: '' }])}
                  className="mt-0.5 inline-flex items-center gap-1 rounded px-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground">
                  <Plus className="h-3 w-3" /> outro desconto
                </button>
                <LinhaConta rotulo="= Líquido a receber" destaque>
                  {liquido > 0 ? formatMoeda(liquido) : '—'}
                </LinhaConta>
              </div>
            </div>
            )}
          </TabsContent>

          {/* ── ABA 3 — RECEBIMENTO ────────────────────────────────────────────────────────── */}
          {/* ⚠⚠ A TABELA OCUPA A ALTURA INTEIRA DA ABA, e é o conserto do defeito: as parcelas
              viviam numa pilha de `div`s com rótulo por linha, dentro de um `overflow-auto` sem
              cabeçalho fixo — com duas parcelas a primeira aparecia pela metade no topo, e com
              quatro a aba ficava inoperável. Tabela densa, cabeçalho fixo, rótulo UMA vez.
              ⚠ TRÊS FAIXAS, e só a do meio rola (A21/A28): a barra em cima, a tabela no
              `flex-1 min-h-0`, o juiz embaixo. O juiz NUNCA rola junto — ele é a conta que
              trava o botão, e um total que sai da tela é um total que não se confere. */}
          <TabsContent value="recebimento" className="min-h-0 flex-1 overflow-hidden p-0 data-[state=inactive]:hidden">
            <div className="flex h-full min-h-0 flex-col">
              <AvisoSomenteLeitura editando={editando} onIr={() => setAba('comprador')} />
              {/* ⚠ QUEM ROLA É ESTE `div`, não o `ParcelasLeitura`: ele é `min-h-0 overflow-auto`
                  mas sem ALTURA, então crescia e era cortado pelo `overflow-hidden` da aba — o
                  aviso do CLAUDE.md, "antes de escrever `sticky`/`overflow`, achar quem rola".
                  Um scrollport só, aqui. */}
              {venda && !corrigindo ? (
                <div className="min-h-0 flex-1 overflow-y-auto"><ParcelasLeitura venda={venda} /></div>
              ) : (
              <div className="flex h-full min-h-0 flex-col gap-2 px-3 py-2">
                <div className="flex shrink-0 flex-wrap items-end justify-between gap-2">
                  <div>
                    <Label className="text-[10px]">Recebimento</Label>
                    <div className="mt-0.5 flex h-8 w-fit overflow-hidden rounded-md border">
                      {(['avista', 'aprazo'] as const).map(c => (
                        <button key={c} type="button" onClick={() => setCondicao(c)}
                          className={cn('px-3 text-[11px] font-medium transition-colors',
                            condicao === c ? 'bg-primary text-primary-foreground'
                              : 'bg-transparent text-muted-foreground hover:bg-muted')}>
                          {c === 'avista' ? 'À vista' : 'A prazo'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* ⚠ À VISTA NÃO TEM OS DOIS BOTÕES: dividir uma parcela em uma parcela e
                      acrescentar a segunda são gestos de "a prazo". Mostrá-los desabilitados
                      ensinaria que há algo a fazer ali. */}
                  {condicao === 'aprazo' && (
                    <div className="flex items-end gap-2">
                      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 px-2 text-[11px]"
                        onClick={dividirIgual} disabled={liquido <= 0}
                        title="Preenche os valores dividindo o líquido; o resíduo vai na última">
                        Dividir igual
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 px-2 text-[11px]"
                        onClick={() => setParcelas(o => [...o, novaParcela()])}>
                        <Plus className="h-3.5 w-3.5" /> parcela
                      </Button>
                    </div>
                  )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
                  <table className="w-full table-fixed border-collapse">
                    {/* ⚠ px MEDIDOS PELO MAIOR CONTEÚDO, não porcentagem. "30/04/2025" a 12px são
                        70,9px, e o `DatePicker` da casa soma `px-2.5` à esquerda e `pr-8` à
                        direita (o botão do calendário): 112,9px de campo, 120,9 de coluna. Com os
                        118px que a grade antiga dava, a data saía "15/09/2" — o defeito 2 do
                        briefing. 128 dá o mínimo com folga.
                        ⚠ CONTA FICA SEM LARGURA: é ela que absorve o aperto quando o modal
                        encolhe, truncando um nome que o `title` guarda — as datas e o valor não
                        podem encolher sem cortar número. */}
                    <colgroup>
                      {['28px', '128px', '116px', '52px', '128px', '', '32px'].map((w, i) => (
                        <col key={i} style={w ? { width: w } : undefined} />
                      ))}
                    </colgroup>
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th className={cn(TH, 'text-center')}>#</th>
                        <th className={cn(TH, 'text-left')}>Vencimento</th>
                        <th className={cn(TH, 'text-right')}>Valor</th>
                        <th className={cn(TH, 'text-center')}>Pago?</th>
                        <th className={cn(TH, 'text-left')}>Pagamento</th>
                        <th className={cn(TH, 'text-left')}>Conta</th>
                        <th className={TH} />
                      </tr>
                    </thead>
                    <tbody>
                      {parcelasEfetivas.map((p, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-1 py-1 text-center text-[11px] tabular-nums text-muted-foreground">{i + 1}</td>
                          <td className="px-1 py-1">
                            {/* ⚠ À VISTA A LINHA É ESPELHO, não formulário: vencimento, valor e
                                pagamento saem da data da venda e do líquido, e deixá-los editáveis
                                permitiria uma parcela única que não fecha o próprio líquido. */}
                            <DatePicker value={p.vencimento} disabled={condicao === 'avista'}
                              className={cn(condicao === 'avista' && CAMPO_TRAVADO)}
                              onChange={v => setParcelas(o => o.map((x, j) => j === i ? { ...x, vencimento: v } : x))} />
                          </td>
                          <td className="px-1 py-1">
                            <CampoNumero valor={p.valor} casas={2} disabled={condicao === 'avista'}
                              className={cn('h-8 text-right text-[12px]', condicao === 'avista' && CAMPO_TRAVADO)}
                              onChange={v => setParcelas(o => o.map((x, j) => j === i ? { ...x, valor: v } : x))} />
                          </td>
                          <td className="px-1 py-1 text-center">
                            <span className="inline-flex h-8 items-center">
                              <Checkbox checked={p.pago} disabled={condicao === 'avista'}
                                onCheckedChange={c => setParcelas(o => o.map((x, j) => j === i
                                  ? { ...x, pago: c === true, dataPagamento: c === true ? (x.dataPagamento || x.vencimento) : '' }
                                  : x))} />
                            </span>
                          </td>
                          <td className="px-1 py-1">
                            <DatePicker value={p.dataPagamento} disabled={condicao === 'avista' || !p.pago}
                              className={cn((condicao === 'avista' || !p.pago) && CAMPO_TRAVADO)}
                              onChange={v => setParcelas(o => o.map((x, j) => j === i ? { ...x, dataPagamento: v } : x))} />
                          </td>
                          <td className="px-1 py-1">
                            <ContaBancariaSelect value={p.contaId} contas={contas} placeholder="Escolha"
                              className="h-8 text-[12px]"
                              onValueChange={v => setParcelas(o => {
                                /* À vista o array tem uma posição só, e ela pode nem existir ainda. */
                                if (condicao === 'avista') return [{ ...(o[0] ?? novaParcela()), contaId: v }];
                                return o.map((x, j) => j === i ? { ...x, contaId: v } : x);
                              })} />
                          </td>
                          <td className="px-1 py-1 text-center">
                            {condicao === 'aprazo' && parcelas.length > 1 && (
                              <button type="button" title="Remover parcela" aria-label="Remover parcela"
                                onClick={() => setParcelas(o => o.filter((_, j) => j !== i))}
                                className="rounded p-0.5 text-muted-foreground hover:bg-rose-100 hover:text-rose-700">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ⚠ O JUIZ FICA FORA DA ÁREA QUE ROLA — é ele que diz por que o botão está
                    travado, e um total que sai da tela com a oitava parcela seria a conta
                    escondida justamente quando ela fica difícil. */}
                <div className={cn('shrink-0 rounded-md px-2 py-1 text-[11px]',
                  fecha ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
                  Parcelas <strong className="tabular-nums">{formatMoeda(somaParcelas)}</strong> ·
                  Líquido <strong className="tabular-nums">{formatMoeda(liquido)}</strong> ·{' '}
                  {fecha ? 'confere' : `diferença ${formatMoeda(Math.abs(diferenca))}`}
                </div>
              </div>
              )}
            </div>
          </TabsContent>

          {/* ── ABA 4 — COMPRADOR ──────────────────────────────────────────────────────────── */}
          {/* ⚠ AQUI MORAM OS CAMPOS EDITÁVEIS, e é para cá que o botão "Editar" pula. Comprador,
              data, documento e observações descrevem DE QUEM é a venda; parcelas descrevem
              QUANDO o dinheiro entra. Eram a mesma aba, e a tabela de parcelas pagava a conta. */}
          <TabsContent value="comprador" className="min-h-0 flex-1 overflow-auto p-0 data-[state=inactive]:hidden">
            <div className="flex min-h-full flex-col gap-2 px-3 py-2">
              {/* ⚠⚠ `gap-x-6` E NÃO `gap-2`, e a razão é medida: o `FornecedorSelect` já traz o
                  "＋" e o "✕" dentro do SEU grupo, a 6px do combobox — o arranjo da casa estava
                  certo. O que estava errado era a calha da grade: com `gap-2` a Data ficava a 8px
                  do "＋" contra os 6px que o separam do campo dele, e 6 contra 8 é equidistante
                  aos olhos — o botão parecia da Data. Com 24px a distância de fora é 4× a de
                  dentro, e a leitura fica óbvia sem mover nada de lugar.
                  ⚠ `gap-y-2` PRESERVADO: só a calha horizontal mudou, as linhas continuam a 8px. */}
              <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
                <div>
                  <Label className="text-[10px]">Comprador <span className="text-destructive">*</span></Label>
                  {/* ⚠ O ANEL DE FOCO AQUI É `focus:`, NÃO `focus-visible:`, e é escopado a este
                      campo. Medido: `.focus()` programático depois de um clique de mouse não casa
                      `:focus-visible` num `[role=combobox]` — o foco iria para o comprador e a tela
                      não mostraria nada. Fora da edição a regra nem existe, então nenhum outro
                      clique ganha anel grosso.
                      ⚠ O `:focus` VAI DENTRO DO COLCHETE — `[&_button[role=combobox]:focus]`, não
                      `[&_button[role=combobox]]:focus`. Medido no CSS construído: a segunda forma
                      compila para `.classe:focus button[role=combobox]`, que prende o `:focus` na
                      DIV de fora — e uma div nunca recebe foco. A regra existia e era morta. */}
                  <div ref={compradorRef} className={cn('mt-0.5',
                    editando && '[&_button[role=combobox]:focus]:ring-2 [&_button[role=combobox]:focus]:ring-ring [&_button[role=combobox]:focus]:ring-offset-1',
                    camposTravados && '[&_button[role=combobox]]:border-border/60 [&_button[role=combobox]]:bg-muted [&_button[role=combobox]]:text-muted-foreground')}>
                    <FornecedorSelect fornecedorId={compradorId || null}
                      onFornecedorChange={id => setCompradorId(id ?? '')}
                      clienteId={clienteId} label="" placeholder="Escolha"
                      disabled={camposTravados} />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px]">Data da venda <span className="text-destructive">*</span></Label>
                  <DatePicker value={data} onChange={setData} disabled={camposTravados}
                    className={cn('mt-0.5', camposTravados ? CAMPO_TRAVADO : CAMPO_EDITAVEL)} />
                </div>
              </div>
              <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
                <div>
                  <Label className="text-[10px]">Documento</Label>
                  {/* ⚠ O TIPO NASCE "Outros" AO PRIMEIRO CARACTERE, e é a mesma regra da RPC
                      (`coalesce(p_tipo_documento,'Outros')`). Quem digitou um número já disse que
                      há papel; obrigá-lo a classificar antes de continuar seria cobrar uma
                      decisão que o padrão já resolve. */}
                  <Input value={documento} disabled={docTravado} placeholder="NF, romaneio, simulação…"
                    title={docTravado ? 'O documento se edita no lançamento do Financeiro.' : 'Número do documento desta venda'}
                    onChange={e => {
                      setDocumento(e.target.value);
                      if (e.target.value.trim() && !tipoDoc) setTipoDoc('Outros');
                    }}
                    className={cn('mt-0.5 h-8 text-[12px]', docTravado ? CAMPO_TRAVADO : CAMPO_EDITAVEL)} />
                </div>
                <div>
                  <Label className="text-[10px]">Tipo</Label>
                  {/* ⚠ DESABILITADO SEM NÚMERO: tipo sem documento é uma classificação de nada, e
                      a RPC o descartaria de qualquer jeito. */}
                  <Select value={tipoDoc} disabled={docTravado || !documento.trim()}
                    onValueChange={v => setTipoDoc(v as TipoDocumento)}>
                    <SelectTrigger className={cn('mt-0.5 h-8 text-[12px]',
                      docTravado || !documento.trim() ? CAMPO_TRAVADO : CAMPO_EDITAVEL)}>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_DOCUMENTO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* ⚠ A NOTA APARECE NOS DOIS MODOS DE VENDA GRAVADA (ver e editar), não só em
                  editar — é o que faz o A23 valer aqui: trocar de modo não move a linha de
                  Observações um pixel. E ela diz ONDE se edita, que é a única pergunta que um
                  campo travado deixa em aberto. */}
              {!criando && (
                <p className="shrink-0 text-[10px] text-muted-foreground">
                  Documento se edita no lançamento do Financeiro.
                </p>
              )}
              {/* ⚠ O DOCUMENTO NÃO VOLTA NA CORREÇÃO, e o campo em branco não pode passar por
                  "não tinha": `fn_vendas_graos` não devolve `numero_documento` (conferido no
                  `prosrc`), então a venda nova nasceria sem o papel da antiga sem ninguém notar.
                  Enquanto a RPC de leitura não o devolver, quem corrige redigita. */}
              {corrigindo && (
                <p className="shrink-0 text-[10px] text-amber-600">
                  O documento da venda original não é lido de volta — redigite-o se havia um.
                </p>
              )}
              <div>
                <Label className="text-[10px]">Observações</Label>
                <Input value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional"
                  disabled={camposTravados}
                  className={cn('mt-0.5 h-8 text-[12px]', camposTravados ? CAMPO_TRAVADO : CAMPO_EDITAVEL)} />
              </div>
            </div>
          </TabsContent>

          {/* ── ABA 4 — SUBSTITUIR ─────────────────────────────────────────────────────────── */}
          {substituiveis.length > 0 && (
            <TabsContent value="substituir" className="min-h-0 flex-1 overflow-hidden p-0 data-[state=inactive]:hidden">
              <div className="flex h-full min-h-0 flex-col gap-1.5 px-3 py-2">
                <p className="shrink-0 text-[11px] text-muted-foreground">
                  Esta venda substitui lançamentos já feitos à mão? Os marcados são cancelados com
                  motivo na mesma gravação.
                </p>
                <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                  {substituiveis.map(l => (
                    <label key={l.id}
                      className="flex cursor-pointer items-start gap-2 border-t border-slate-100 px-2 py-1.5 first:border-t-0 hover:bg-muted/30">
                      <Checkbox className="mt-0.5 shrink-0" checked={substituir.has(l.id)}
                        onCheckedChange={c => setSubstituir(o => {
                          const n = new Set(o);
                          if (c === true) n.add(l.id); else n.delete(l.id);
                          return n;
                        })} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-medium" title={l.descricao ?? ''}>
                          {l.descricao || 'Lançamento sem descrição'} · {formatMoeda(l.valor)}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {l.data_competencia ? formatIsoToBr(l.data_competencia.slice(0, 10)) : '—'}
                          {' · '}{l.favorecido || '—'}{' · '}{l.status || '—'}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>

        {/* ── RESUMO LATERAL ─────────────────────────────────────────────────────────────── */}
        <aside className="col-start-2 row-span-2 row-start-2 flex flex-col overflow-hidden border-l border-border bg-muted/20">
          {/* Faixa de título com a MESMA altura e fundo da TabsList — alinha com as abas. */}
          <div className="flex h-8 shrink-0 items-center border-b border-border bg-accent/40 px-3 text-[11px] font-bold uppercase tracking-wide text-primary">
            Resumo da venda
          </div>
          <div className="flex-1 overflow-y-auto pb-1 text-[10px]">
            <BlocoHead titulo="Identificação" />
            <div className="space-y-0.5 px-3">
              <Row label="Cultura" value={labelDaCultura(cultura)} />
              <Row label="Safra" value={safraRotulo || null} />
              <Row label="Comprador" value={compradorId ? 'Selecionado' : null} />
              <Row label="Data" value={data ? formatIsoToBr(data) : null} />
              {/* ⚠ EM VENDA GRAVADA ISTO É SEMPRE "—", E O TRAÇO ESTÁ CERTO: `fn_vendas_graos` não
                  devolve `numero_documento` em `lancamentos[]` (conferido no `prosrc` — o
                  `jsonb_build_object` traz id, natureza, descrição, valor, sinal, status, datas,
                  conciliado e cancelado, e mais nada). Traço é "não sei", que é a verdade aqui,
                  e não "não tem". Sai do traço quando a RPC devolver o campo. */}
              <Row label="Documento" value={criando
                ? (documento.trim() ? `${tipoDoc || 'Outros'} ${documento.trim()}` : null)
                : null} />
            </div>

            <BlocoHead titulo="Composição" />
            <div className="space-y-0.5 px-3">
              {/* ⚠ SÓ AS CLASSES COM QUANTIDADE: listar as três com "—" gastaria o espaço do
                  resumo com o que o operador não está vendendo. */}
              {(venda ? venda.itens.map(i => ({ classe: i.classe, sacas: i.sacas }))
                      : linhas.filter(l => l.sacas > 0)).map(l => (
                <Row key={l.classe} label={labelDaClasse(l.classe)}
                  value={`${formatNum(l.sacas, 2)} ${unidade}`} />
              ))}
              <Row label="Total" value={(venda ? venda.sacas : vendidas) > 0
                ? `${formatNum(venda ? venda.sacas : vendidas, 2)} ${unidade}` : null} />
              {/* ⚠ "SOBRA" SÓ FAZ SENTIDO AO CRIAR: numa venda gravada o saldo atual já a reflete,
                  e repeti-la aqui contaria a mesma baixa duas vezes na cabeça de quem lê. */}
              {criando && <Row label="Sobra" value={`${formatNum(sobraTotal, 2)} ${unidade}`} />}
            </div>

            <BlocoHead titulo="Financeiro" />
            <div className="space-y-0.5 px-3">
              {/* ⚠ COM VENDA, O RESUMO LÊ O GRAVADO, não o formulário: em ver/editar o formulário
                  de composição nem é montado, e recalcular daria zero num documento que existe. */}
              <Row label="Bruto" value={(venda ? venda.bruto : bruto) > 0 ? formatMoeda(venda ? venda.bruto : bruto) : null} />
              <Row label="(−) Senar" value={(venda ? venda.senar : senar) > 0 ? formatMoeda(venda ? venda.senar : senar) : null} />
              <Row label="(−) Descontos"
                value={(venda ? Math.max(venda.deducoes - venda.senar, 0) : totalDescontos) > 0
                  ? formatMoeda(venda ? Math.max(venda.deducoes - venda.senar, 0) : totalDescontos) : null} />
              <Row label="= Líquido" value={(venda ? venda.liquido : liquido) > 0 ? formatMoeda(venda ? venda.liquido : liquido) : null}
                valueClassName="text-[12px] font-bold text-primary" />
              <Row label="Recebimento" value={venda
                ? `${venda.lancamentos.filter(l => l.natureza === 'receita_venda').length} parcela(s)`
                : resumoRecebimento} />
            </div>

            {criando && (
              <>
                <BlocoHead titulo="Substituição" />
                <div className="space-y-0.5 px-3">
                  <Row label="Lançamentos"
                    value={substituir.size > 0
                      ? `${substituir.size} marcado${substituir.size > 1 ? 's' : ''}`
                      : null} />
                </div>
              </>
            )}
          </div>
        </aside>

        <div className="col-start-1 row-start-3 flex flex-col gap-1.5 border-t border-border bg-accent px-4 py-2.5">
          {/* ⚠ O PAINEL DE CANCELAMENTO ABRE AQUI DENTRO, acima do rodapé: o operador está olhando
              a venda, e mandá-lo fechar o modal para cancelar em outra tela seria pedir que ele
              confie na memória do que acabou de ver. */}
          {cancelando && venda && (
            <ConfirmarComMotivo
              titulo="Cancelar esta venda (lógico — cancela os lançamentos junto)"
              motivo={motivoCancel} onMotivoChange={setMotivoCancel}
              onVoltar={() => setCancelando(false)}
              confirmando={salvando}
              onConfirmar={() => { onCancelar?.(venda.id, motivoCancel.trim()); setCancelando(false); }} />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {criando ? (
              <span className="text-[11px]">
                Vende <strong className="tabular-nums">{formatNum(vendidas, 2)}</strong> {unidade} ·
                sobra <strong className="tabular-nums">{formatNum(sobraTotal, 2)}</strong> {unidade}
              </span>
            ) : venda && venda.tipo === 'barter' ? (
              /* ⚠ O BARTER DIZ ONDE SE EDITA, em vez de só não ter botão: "sem ação" sem explicação
                 faz o operador procurar o que não existe. */
              <span className="text-[11px] text-muted-foreground">
                Este barter se edita no próprio Barter.
              </span>
            ) : (
              <span className="text-[11px]">
                <strong className="tabular-nums">{formatNum(venda?.sacas ?? 0, 2)}</strong> {unidade} ·
                bruto <strong className="tabular-nums">{formatMoeda(venda?.bruto ?? 0)}</strong>
              </span>
            )}
            <div className="flex-1" />
            <span className="text-[11px]">
              Líquido <strong className="tabular-nums">{formatMoeda(venda ? venda.liquido : liquido)}</strong>
              {criando && <> em {parcelasEfetivas.length} parcela{parcelasEfetivas.length > 1 ? 's' : ''}</>}
            </span>

            {criando ? (
              <>
                {impedimento && (
                  <span className="w-full text-[10px] text-muted-foreground md:w-auto">{impedimento}</span>
                )}
                {/* ⚠ O MOTIVO É OBRIGATÓRIO E MORA NO RODAPÉ, ao lado do botão que ele destrava —
                    é o idioma do `ConfirmarComMotivo`, e a RPC recusa sem ele
                    (`CORRECAO_SEM_MOTIVO`). Travar antes é dizer a mesma coisa sem gastar uma ida
                    ao servidor. */}
                {corrigindo && (
                  <Input value={motivoCorrecao} onChange={e => setMotivoCorrecao(e.target.value)}
                    placeholder="Motivo da correção (obrigatório)"
                    className="h-8 w-full min-w-0 flex-1 text-[11px] md:w-auto" />
                )}
                <Button size="sm" variant="acao" className="h-8 gap-1 px-3 text-[11px]"
                  disabled={!!impedimento || salvando} title={impedimento ?? (corrigindo ? 'Cancelar a venda atual e gravar esta' : 'Registrar a venda')}
                  onClick={registrar}>
                  <Save className="h-3.5 w-3.5" /> {corrigindo ? 'Confirmar correção' : 'Registrar venda'}
                </Button>
              </>
            ) : leitura ? (
              <>
                <Button size="sm" variant="ghost" className="h-8 px-3 text-[11px]" onClick={onFechar}>
                  Fechar
                </Button>
                {editavel && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-[11px]"
                      onClick={() => setCancelando(true)} disabled={salvando}
                      title="Cancelar esta venda">
                      <Ban className="h-3.5 w-3.5" /> Cancelar venda
                    </Button>
                    {/* ⚠⚠ CORRIGIR VEM ANTES E É O PRIMÁRIO, e a ordem é o conserto do defeito:
                        o Gabriel abriu a venda, clicou "Editar" esperando mudar sacas e Senar, e
                        achou três campos de cadastro. O botão que responde à pergunta mais comum
                        — "este número está errado" — não existia aqui; morava só no lápis do
                        histórico, uma tela atrás.
                        ⚠ E OS DOIS NOMES PASSARAM A DIZER O TAMANHO DO GESTO: "Corrigir" refaz os
                        lançamentos; "Editar dados" não encosta no Financeiro. */}
                    <Button size="sm" variant="acao" className="h-8 gap-1 px-3 text-[11px]"
                      disabled={jaConciliada || salvando || !onPedirCorrecao}
                      title={jaConciliada ? 'Já conciliada: corrija no Financeiro'
                        : 'Corrigir sacas, preço, deduções ou parcelas (cancela e grava outra)'}
                      onClick={() => venda && onPedirCorrecao?.(venda)}>
                      <Pencil className="h-3.5 w-3.5" /> Corrigir
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1 px-3 text-[11px]"
                      onClick={entrarEmEdicao} title="Editar comprador, data e observações — não mexe no Financeiro">
                      Editar dados
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" className="h-8 px-3 text-[11px]"
                  onClick={voltarDaEdicao}>
                  Voltar
                </Button>
                <Button size="sm" variant="acao" className="h-8 gap-1 px-3 text-[11px]"
                  disabled={!data || salvando}
                  title={!data ? 'Informe a data da venda.' : 'Salvar as alterações'}
                  onClick={() => venda && onEditar?.({
                    id: venda.id, data,
                    comprador_id: compradorId || null,
                    observacoes: obs.trim() || null,
                  })}>
                  <Save className="h-3.5 w-3.5" /> Salvar alterações
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
