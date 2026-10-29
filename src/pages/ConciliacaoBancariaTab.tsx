import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Segmentado } from '@/components/ui/segmentado';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ouvirContasBancarias } from '@/lib/financeiro/canalContasBancarias';
import { useCliente } from '@/contexts/ClienteContext';
import { PainelExtratoMes } from '@/components/conciliacao/PainelExtratoMes';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { AcoesDoMes } from '@/components/conciliacao/AcoesDoMes';
import { SaldoRealDialog } from '@/components/conciliacao/SaldoRealDialog';
import { EspelhoOfxSistemaModal, EspelhoConciliacaoTab, ABAS_ESPELHO, type AbaEspelho } from '@/components/financeiro-v2/EspelhoConciliacaoTab';
import { useAlturaAteOFim } from '@/hooks/useAlturaAteOFim';
import { ImportarBancoInline } from '@/components/conciliacao/ImportarBancoInline';
import { ExtratoGerencialTab } from '@/components/financeiro-v2/ExtratoGerencialTab';
import { EnriquecerPorPlanilha } from '@/components/conciliacao/EnriquecerPorPlanilha';
import { inscreverEmLancamentos } from '@/hooks/useFinanceiroV2';
import { ORDEM_GRUPO_CONTA, agruparContasPorTipo } from '@/lib/financeiro/gruposDeConta';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Pencil, ArrowLeft,
  ArrowUp, ArrowDown, ArrowUpDown, Plus, ArrowUpRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { belongsToConta, saldoConfere } from '@/lib/financeiro/conciliacaoCalc';
import { useResumoMes, useStatusAno, invalidarDono, useReleDonoAoVoltarAVista } from '@/hooks/useResumoConciliacao';
import {
  ROTULO_STATUS, STATUS_COR, frasesDoStatus, fraseFaltaSaldo, fraseDoRetido, fraseSemConta, contasParaFecharSemMovimento,
  saldosDaLinha, marcaDoPar, diferencaNaPosicao, TITULO_DIFERENCA_NA_POSICAO_INDISPONIVEL,
  frasesDosAvisos, marcaDeAviso, semClassificacaoDaLinha, semFornecedorDaLinha,
  type SemClassificacao,
  type LinhaResumo, type StatusDono,
} from '@/lib/conciliacao/resumoDoDono';
import { detectarDuplicatasCrossOrigin, montarSituacaoFechamento, derivarPendenciasGerenciais } from '@/lib/financeiro/fechamentoPendencias';
import { SemClassificacaoModal } from '@/components/conciliacao/SemClassificacaoModal';
import { ExtratoDoSistemaDialog } from '@/components/conciliacao/ExtratoDoSistemaDialog';
import { buildUnifiedSaldos, type ContaSaldoRef, type SaldoV2SourceRow, type SaldoLegacySourceRow } from '@/lib/financeiro/saldosBancarios';
import { SeletorPeriodo } from '@/v2/components/SeletorPeriodo';
import { mesUnico } from '@/v2/lib/periodo';
import { estadoDoSlotOfx, TITULO_OFX_COM_SALDO, TITULO_OFX_SEM_SALDO, type EstadoDoSlotOfx } from '@/lib/conciliacao/slotOfx';
// PR-MOS-2 — LotesExcelTab (Referências Operacionais antigas) desacoplado da aba Enriquecer (legado).

/* ── Types ── */
export interface ContaRef {
  id: string;
  nome_conta: string;
  nome_exibicao: string | null;
  tipo_conta: string | null;
  codigo_conta: string | null;
  mes_inicio: string | null;
  saldo_inicial_oficial: number | null;
}

export interface SaldoRow {
  id: string;
  ano_mes: string;
  conta_bancaria_id: string;
  saldo_inicial: number;
  saldo_final: number;
  status_mes: string;
  origem_saldo_inicial: string;
  /** SALDO-POSICAO-01c — a data da posição declarada; `null` = fim do mês. */
  saldo_data: string | null;
}

export interface LancamentoResumo {
  id: string;
  tipo_operacao: string;
  valor: number;
  sinal: number;
  data_competencia: string;
  data_pagamento: string | null;
  descricao: string | null;
  status_transacao: string | null;
  favorecido_id: string | null;
  numero_documento: string | null;
  conta_bancaria_id: string | null;
  conta_destino_id: string | null;
  ano_mes: string;
  subcentro: string | null;
  origem_lancamento: string | null;
  macro_custo: string | null;
  centro_custo: string | null;
  /* ⚠ OS TRÊS FILTROS DO SALDO — CONCIL-PARIDADE-VISUAL-01 §5. Eles não vinham
     no `select`, e por isso a conta desta tela somava lançamento cancelado como
     se fosse dinheiro: 38 deles, R$ 410.501,86, só em Vera/Itaú/agosto. O
     filtro não estava errado — não existia. */
  cancelado: boolean | null;
  cenario: string | null;
  sem_movimentacao_caixa: boolean | null;
}

interface FornecedorRef { id: string; nome: string; }

/**
 * O mês aberto — PR-CONC-SALDO-UMA-REGUA-02. Os números saíram daqui: o resumo, o status e os saldos são do dono
 * (`fn_conciliacao_resumo_mes`). Fica só o rótulo e a LISTA de lançamentos do mês (o modal "Todos (N)" e as pendências
 * de classificação), que é lista, não conta.
 */
interface MesCard {
  mes: string;
  label: string;
  anoMes: string;
  lancamentos: LancamentoResumo[];
}

/**
 * Uma conta da tabela "Saldos por conta" — a LINHA DO DONO, com a conta do cadastro ao lado (nome de exibição, mês de
 * início, saldo inicial oficial) para o que só o cadastro diz.
 */
interface PerContaSaldo {
  conta: ContaRef;
  linha: LinhaResumo;
}

/* ── Constants ── */
const MESES_LABELS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/** Inline colors — avoids CSS class conflicts with host */
/* ⚠ AS CHAVES SÃO O STATUS DO DONO — PR-CONC-SALDO-UMA-REGUA-02: 'conciliado' (era 'realizado', o nome do status de
   lançamento que a tela emprestava), 'nao_conciliado', 'pendente'. 'parcial' SAIU: o dono não o tem. Cores iguais. */
/* RESUMO-CLIENTES-01 passo b — a paleta mora no dono (`resumoDoDono.ts`); a esteira do consultor lê a mesma. */

/**
 * "falta saldo · N conta(s)" no lugar do "—" da DIFERENÇA de um agregado — CONC-TOTAL-SEM-SALDO-01b. A frase e o `title` (os nomes
 * das contas, um por linha) são os do dono das frases (`fraseFaltaSaldo`); aqui só a cor, a do status PENDENTE da paleta da
 * conciliação — nunca verde nem vermelho: não é "confere" nem diferença, é dado que falta.
 */
function FaltaSaldo({ frase, testId, tom }: { frase: { texto: string; titulo?: string }; testId: string; tom?: 'navy' | 'grupo' }) {
  /* CONC-SALDOS-LAYOUT-02: no Total (fundo navy escuro) e na faixa de grupo a frase tem tom proprio e 9,5px semibold; sem `tom`
     (o Resumo) e' a de sempre. */
  if (tom) return <span data-testid={testId} title={frase.titulo} className="text-[9.5px] font-semibold" style={{ color: TOM_FALTA_SALDO[tom] }}>{frase.texto}</span>;
  return <span data-testid={testId} title={frase.titulo} className="font-medium" style={{ color: STATUS_COR.pendente.txt }}>{frase.texto}</span>;
}
const TOM_FALTA_SALDO = { navy: '#fcd9a6', grupo: '#b45309' };

/** Negativo é vermelho em TODA coluna de valor de "Saldos por conta" (Sistema e Extrato; Total, grupo e conta). Só a COR do
 *  número que o dono mandou — nulo e não negativo ficam na cor do texto. PR-CONC-SALDOS-LAYOUT-01. */
const corDoValor = (v: number | null | undefined): string => ((v ?? 0) < 0 ? 'text-destructive' : '');
/** P166 — os valores de "Saldos por conta" e do "Resumo do mês" sem "R$" (o cabeçalho diz que é dinheiro): 2 casas, pt-BR; zero é "0,00". */
const valorDaRegua = (v: number): string => formatNum(v, 2);

/* ── "Saldos por conta" — CONC-SALDOS-LAYOUT-02 (Gabriel, 11/10/2026; mock aprovado). Alturas FIXAS: cabecalho 18 · Total 24 ·
   grupo 21 · conta 18. A regua e' `table-layout: fixed` com colgroup em px (Conta = o resto · 100 · 100 · 86 · 22). ── */
/** As larguras fixas da regua, em px: Data · Arquivos · Sistema · Extrato · Diferença · ações. A Conta fica com o resto.
 *  P141 (CONC-LAYOUT-01, mock aprovado 27/10): a data e os selos OFX/PDF sairam da celula da Conta para colunas proprias (nada
 *  colado ao nome); a Diferença ficou ESTREITA como no Finanças (82px, fonte 8px, faixa cinza na coluna toda — excecao declarada
 *  ao piso); Sistema e Extrato seguem com os 100px medidos no pior valor; acoes = ✎ + ↗ de 14px. */
/*  P166 (CONC-TELA-02, 28/10): fonte e altura de linha = a RÉGUA DA CASA (`regua-tabela.tsx`): cabeçalho 22px 9,5/500, linhas de 19px a
 *  10px; os números das CONTAS uma fonte abaixo (9,5px) dos do Total e dos grupos (10px negrito). A Diferença volta à fonte da linha (a
 *  exceção de 8px do P141 saiu); Data 38px (9,5px cinza), selos OFX/PDF em lugares de 20px, valores 86px sem "R$" (o pior valor em negrito). */
const REGUA_SALDOS = [38, 44, 86, 86, 86, 38];
/** O selo do arquivo (OFX/PDF): 7px negrito com borda fina, num lugar FIXO de 20px (sem arquivo, o lugar fica vazio). */
const SELO_ARQUIVO = 'inline-block rounded-[2px] border px-px text-[7px] font-bold leading-[9px]';
const LUGAR_SELO = 'inline-flex h-[11px] w-[20px] shrink-0 items-center justify-center align-middle';
/** A coluna Valor do Resumo do mês (o pior valor em negrito e o "falta saldo · N contas"). */
const LARGURA_VALOR_RESUMO = 108;
/** O TOTAL: navy ESCURO opaco (dois degraus abaixo do `primary`), texto branco, 19px. A sombra de 1px para cada lado, na cor do
 *  proprio fundo, tapa a emenda de subpixel entre celulas vizinhas (a tecnica do cabecalho). */
const TD_TOTAL = 'h-[19px] py-0 text-[10px] font-bold text-white bg-[hsl(213_52%_16%)] shadow-[1px_0_0_hsl(213_52%_16%),-1px_0_0_hsl(213_52%_16%)]';
/** Os dois tons claros sobre o navy (os do rodape navy da CPR): negativo e "confere". */
const TOM_NO_NAVY = { neg: 'text-[#fca5a5]', ok: 'text-[#86efac]' };
const corNoNavy = (v: number | null | undefined): string => ((v ?? 0) < 0 ? TOM_NO_NAVY.neg : '');
/** A FAIXA DE GRUPO: azul-acinzentado CHEIO e opaco (18% de primary sobre o card), filete de 1px em cima e embaixo por sombra
 *  interna (40% de primary), e 1px para cada lado na cor do fundo (a emenda de subpixel). 21px. Nunca a cor da conta escolhida. */
const SOMBRA_FAIXA_GRUPO = 'shadow-[inset_0_1px_0_color-mix(in_srgb,hsl(var(--primary))_40%,hsl(var(--card))),inset_0_-1px_0_color-mix(in_srgb,hsl(var(--primary))_40%,hsl(var(--card))),1px_0_0_color-mix(in_srgb,hsl(var(--primary))_18%,hsl(var(--card))),-1px_0_0_color-mix(in_srgb,hsl(var(--primary))_18%,hsl(var(--card)))]';
const TD_GRUPO = `h-[19px] py-0 leading-[18px] text-[10px] sticky z-[8] bg-[color-mix(in_srgb,hsl(var(--primary))_18%,hsl(var(--card)))] ${SOMBRA_FAIXA_GRUPO}`;
/** A faixa de grupo no Resumo do mês: a mesma, sem grudar (P166). */
const TD_GRUPO_RESUMO = TD_GRUPO.replace('sticky z-[8] ', '');
/** P141 — a FAIXA CINZA da Diferença nos quatro níveis (cabeçalho, Total, grupo, conta): um degrau mais claro do fundo de cada
 *  um. A cor do número é a de hoje. As classes literais ficam aqui, à vista do Tailwind. */
const TD_TOTAL_DIF = TD_TOTAL.replace('bg-[hsl(213_52%_16%)]', 'bg-[hsl(213_45%_25%)]');
const TD_GRUPO_DIF = TD_GRUPO.replace('bg-[color-mix(in_srgb,hsl(var(--primary))_18%,hsl(var(--card)))]', 'bg-[color-mix(in_srgb,hsl(var(--primary))_26%,hsl(var(--card)))]');
/** A LINHA DE CONTA: 19px, nome a 10px. A linha de baixo e' sombra interna (borda colapsada nao tem altura fixa). */
const TD_CONTA = 'h-[19px] py-0 leading-[18px] text-[10px]';
/** Os números da conta (Data, Sistema, Extrato, Diferença): uma fonte abaixo dos do Total e dos grupos. */
const TD_CONTA_NUM = TD_CONTA.replace('text-[10px]', 'text-[9.5px]');
const LINHA_DA_CONTA = 'shadow-[inset_0_-1px_0_hsl(var(--border))]';
/** P141 — a celula da Diferença da conta, sobre a faixa cinza. */
const TD_CONTA_DIF = `${TD_CONTA_NUM} bg-muted`;
/** A CONTA ESCOLHIDA: fundo branco e CONTORNO navy por sombra interna — em cima e embaixo em toda celula, o filete de 3px na
 *  primeira e 1,5px na ultima. Nunca preenchimento: conta escolhida nao parece faixa de grupo. */
const CONTORNO_MEIO = 'shadow-[inset_0_1.5px_0_hsl(var(--primary)),inset_0_-1.5px_0_hsl(var(--primary))]';
const CONTORNO_PRIMEIRA = 'shadow-[inset_3px_0_0_hsl(var(--primary)),inset_0_1.5px_0_hsl(var(--primary)),inset_0_-1.5px_0_hsl(var(--primary))]';
const CONTORNO_ULTIMA = 'shadow-[inset_-1.5px_0_0_hsl(var(--primary)),inset_0_1.5px_0_hsl(var(--primary)),inset_0_-1.5px_0_hsl(var(--primary))]';
/** Opacidade das contas NAO escolhidas quando ha' uma escolhida. */
const OPACIDADE_DAS_OUTRAS = 0.38;

/** A célula do cabeçalho das colunas de "Saldos por conta": navy opaco em duas camadas, 9,5px, sombra interna embaixo e 1px para
 *  cada lado NA MESMA COR do fundo (`color-mix` de 90% primary + 10% primary-foreground = as duas camadas compostas), que tapa
 *  a emenda de subpixel com a célula vizinha sem riscar a vizinha de navy puro (ver o ⚠ no cabeçalho). */
const TH_SALDOS = 'h-[22px] py-0 text-[9.5px] font-medium text-primary-foreground/85 bg-primary bg-[linear-gradient(hsl(var(--primary-foreground)/0.10),hsl(var(--primary-foreground)/0.10))] shadow-[inset_0_-1px_0_hsl(var(--border)),1px_0_0_color-mix(in_srgb,hsl(var(--primary))_90%,hsl(var(--primary-foreground))),-1px_0_0_color-mix(in_srgb,hsl(var(--primary))_90%,hsl(var(--primary-foreground)))]';
/** P141 (D6, Gabriel 28/10): a cor da Diferença nos quatro niveis e' a regra do `corDaDiferenca` do Espelho — positiva VERDE, negativa
 *  VERMELHA, "confere" verde; sem extrato "—" neutro. (Antes, toda diferença ≠ 0 era vermelha na conta e no grupo.) */
/** P141 — o cabecalho da Diferença: um degrau mais claro (a faixa cinza sobre o navy). */
const TH_SALDOS_DIF = TH_SALDOS.replace('bg-[linear-gradient(hsl(var(--primary-foreground)/0.10),hsl(var(--primary-foreground)/0.10))]', 'bg-[linear-gradient(hsl(var(--primary-foreground)/0.22),hsl(var(--primary-foreground)/0.22))]');

/* ⚠ A ORDEM MUDOU DE CASA EM 132 — `@/lib/financeiro/gruposDeConta`. O valor é o mesmo,
   byte a byte; o que mudou é que o dropdown do Importar Banco agora lê a MESMA fonte, em
   vez de uma segunda lista de rótulos. As três faixas literais da tabela de saldos abaixo
   ("Conta corrente", "Investimento", "Cartão") NÃO migraram: é tela homologada, e trocá-la
   junto misturaria duas mudanças num diff só. */
const CONTA_GROUP_ORDER = ORDEM_GRUPO_CONTA;

/* ── Helpers ── */
function fmtDate(d: string | null) {
  if (!d) return '-';
  try { return format(parseISO(d), 'dd/MM/yy'); } catch { return d; }
}

function sortContas(contas: ContaRef[]): ContaRef[] {
  return [...contas].sort((a, b) => {
    const gA = CONTA_GROUP_ORDER[(a.tipo_conta||'').toLowerCase()] ?? 99;
    const gB = CONTA_GROUP_ORDER[(b.tipo_conta||'').toLowerCase()] ?? 99;
    if (gA !== gB) return gA - gB;
    return (a.nome_conta||'').localeCompare(b.nome_conta||'','pt-BR');
  });
}

function getContaLabel(c: ContaRef): string { return c.nome_exibicao || c.nome_conta; }

function classifyLanc(l: LancamentoResumo, contaId: string): 'entrada'|'saida'|'transf_entrada'|'transf_saida' {
  const t = (l.tipo_operacao||'').toLowerCase().replace(/[\s\-–—]/g,'');
  const isT = t.startsWith('3') || t.includes('transfer');
  if (isT) return (contaId !== '__all__' && l.conta_destino_id === contaId) ? 'transf_entrada' : 'transf_saida';
  if (t.startsWith('1') || t.includes('entrada')) return 'entrada';
  return 'saida';
}



/* ⚠ `buildMonthCards` SAIU — PR-CONC-SALDO-UMA-REGUA-02. Era a conta da tela (saldo inicial, entradas, saídas,
   diferença e o status dos doze meses, inclusive o 'parcial') feita por `calcConciliacaoMensal` sobre o VALOR CHEIO dos
   realizados. O dono é `fn_conciliacao_resumo_mes` (o mês aberto) e `fn_conciliacao_status_ano` (a régua); o teste
   `conciliacaoAgregadoTransferencia.test.ts` saiu com ela — a interna fora da soma é regra do dono, provada no
   `conc_saldo_uma_regua_01b_test.sql`. */

/* ── Props ── */
interface ConciliacaoProps {
  onNavigateToLancamentos?: (ano: string, mes: number) => void;
  onBack?: () => void;
  initialAno?: string;
  initialMes?: string;
}

/** As cinco abas, na ORDEM DO FLUXO (Gabriel, 17/09). P166: só a 1ª letra maiúscula. "Casar lançamentos" foi renomeada pelo Gabriel
 *  em 30/09 (PR-CONC-CONFERENCIA-MODAL-01) — a chave interna continua `enriquecer_sistema`. */
const ABAS_DA_CONCILIACAO: { chave: 'importar' | 'enriquecer_sistema' | 'enriquecer' | 'gerencial' | 'conciliacao'; rotulo: string }[] = [
  { chave: 'importar', rotulo: 'Importar banco' },
  { chave: 'enriquecer_sistema', rotulo: 'Casar lançamentos' },
  { chave: 'enriquecer', rotulo: 'Enriquecer (Excel)' },
  { chave: 'gerencial', rotulo: 'Extrato gerencial' },
  { chave: 'conciliacao', rotulo: 'Conciliação' },
];

/**
 * A frase de apoio de cada aba — PR-CONCILIACAO-PASSOS-01.
 *
 * ⚠ SÓ AS TRÊS DO FLUXO. `gerencial` e `conciliacao` não estão aqui, e a ausência é a decisão:
 * elas são consulta, não passo do trabalho.
 * ⚠ CURTAS POR MEDIÇÃO: 65 caracteres cabem numa linha até 700px de largura. Acima disso a
 * frase quebraria, e o `truncate` a cortaria — dizer menos é melhor que dizer cortado.
 */
const APOIO_DA_ABA: Partial<Record<'importar' | 'enriquecer_sistema' | 'enriquecer' | 'gerencial' | 'conciliacao', string>> = {
  importar: 'Confira se o extrato do mês está completo. Nada é conciliado aqui.',
  enriquecer_sistema: 'Case o extrato com o que já está lançado. O que sobrar vira novo.',
  enriquecer: 'Classifique o que entrou: subcentro, fornecedor, safra.',
};

export function ConciliacaoBancariaTab({ onNavigateToLancamentos, onBack, initialAno, initialMes }: ConciliacaoProps = {}) {
  const { clienteAtual } = useCliente();
  const queryClient = useQueryClient();
  const perm = usePermissions();
  const isAdmin = perm.perfil === 'admin_agroinblue' || perm.perfil === 'gestor_cliente';
  const isFinanceiro = perm.perfil === 'financeiro';
  const clienteId = clienteAtual?.id;

  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [anos, setAnos] = useState<string[]>([String(currentYear)]);

  useEffect(() => {
    if (!clienteId) return;
    Promise.all([
      supabase.from('financeiro_saldos_bancarios_v2').select('ano_mes').eq('cliente_id',clienteId).limit(10000),
      supabase.from('financeiro_lancamentos_v2').select('ano_mes').eq('cliente_id',clienteId)
              .eq('cancelado',false).not('sem_movimentacao_caixa','is',true).limit(10000),
    ]).then(([sR,lancR]) => {
      const set = new Set<string>([String(currentYear)]);
      ([...(sR.data||[]),...(lancR.data||[])]).forEach((r:any) => {
        if (r.ano_mes) set.add(r.ano_mes.substring(0,4));
      });
      setAnos(Array.from(set).sort((a,b)=>b.localeCompare(a)));
    });
  }, [clienteId, currentYear]);

  const [ano, setAno] = useState(initialAno || String(currentYear));
  const [selectedConta, setSelectedConta] = useState<string>('__all__');
  const [contas, setContas] = useState<ContaRef[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorRef[]>([]);
  const [saldos, setSaldos] = useState<SaldoRow[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoResumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [fechandoSemMovimento, setFechandoSemMovimento] = useState(false);
  const [selectedMes, setSelectedMes] = useState<string>(initialMes || String(currentMonth).padStart(2,'0'));

  /* Modal */
  const [showLancModal, setShowLancModal]     = useState(false);
  const [filtroModal, setFiltroModal]         = useState<'todos'|'entradas'|'saidas'|'transf_entrada'|'transf_saida'>('todos');
  const [lancSort, setLancSort]               = useState<{col:'data'|'descricao'|'fornecedor'|'valor';dir:'asc'|'desc'}>({col:'data',dir:'asc'});

  /* Fase 1B: import OFX/CSV + visualização do extrato importado */
  /* ⚠ REMONTA O PAINEL APOS GRAVAR — B-24. `PainelExtratoMes` carrega o mes no
     mount; sem um sinal, a lista continuaria mostrando o extrato de antes da
     importacao que o operador acabou de confirmar. A `key` e' o gesto mais
     simples que existe para isso e nao exige o painel expor um `recarregar`. */
  const [refreshExtrato, setRefreshExtrato] = useState(0);
  /* ⚠ A SUB-ABA DO ESPELHO MORA AQUI — PR-SISTEMA-BARRA-COMPACTA-01: a fileira foi para a barra
     de ações desta tela, então quem governa a escolha é quem desenha os botões. */
  /* ⚠ NASCE EM "Extrato (banco)" — PR-CONC-CONFERENCIA-MODAL-01: a Conferência virou modal, e
     nascer nela abriria o Dialog sozinho ao entrar na aba. */
  const [abaEspelho, setAbaEspelho] = useState<AbaEspelho>('ofx');
  /* O dia em que a Conferência abre — o link "N dias com diferença" do Status (PR-CONC-SALDO-UMA-REGUA-02). */
  const [diaFoco, setDiaFoco] = useState<string | null>(null);
  const [showPendencias, setShowPendencias] = useState(false);
  /* CONC-SEM-CLASSIFICACAO-01: o modal de classificar na linha, aberto para UMA conta (`null` = todas as contas). */
  const [semClassificacaoDe, setSemClassificacaoDe] = useState<{ contaId: string | null } | null>(null);
  /* P141 — o "Extrato do sistema" de UMA conta no mês (o ↗ da linha de Saldos). `null` = fechado. */
  const [extratoSistemaDe, setExtratoSistemaDe] = useState<string | null>(null);
  /* ⚠ O ESPELHO CONTINUA MODAL, E TAMBÉM VIRA ABA — PR-ESPELHO-02 e PR-CONCILIACAO-5-ABAS-01.
     O modal "Espelho OFX × Sistema", aberto pelo botão em "Importar Banco", segue sendo o FECHO
     do mês: só realizados, sem candidatos. A aba "Casar lançamentos" monta o MESMO
     componente do Espelho, só na sub-aba Conferência e com os candidatos (previsto, agendado,
     programado) casáveis — é onde o extrato atualiza o sistema antes do Excel. "Auditoria fica
     separada" continua valendo para a Auditoria Bancária.
     ⚠ CINCO ABAS, NA ORDEM DO FLUXO (decisão do Gabriel, 17/09; a segunda renomeada em 30/09): Importar
     Banco → Casar lançamentos → Enriquecer · Excel → Extrato Gerencial → Conciliação. Os filtros do CABEÇALHO (ano,
     mês, conta) valem para todas e se mantêm ao trocar de aba: são estado desta tela, não de cada
     aba — trocar de aba nunca perde onde o operador estava. */
  const [vistaExtrato, setVistaExtrato] = useState<'importar' | 'enriquecer_sistema' | 'enriquecer' | 'gerencial' | 'conciliacao'>('conciliacao');
  const [espelhoAberto, setEspelhoAberto] = useState(false);

  /* Edit saldo */
  /* SALDO-POSICAO-01c — o lápis abre o modal ÚNICO. `saldoData` viaja junto para
     o modal abrir na posição já declarada, em vez de propor o fim do mês por
     cima de uma data que o operador informou. */
  const [editingSaldo, setEditingSaldo] = useState<{anoMes:string;contaId:string;current:number|null;saldoData:string|null}|null>(null);

  useEffect(() => {
    if (!clienteId) return;
    supabase.from('financeiro_contas_bancarias')
      .select('id,nome_conta,nome_exibicao,tipo_conta,codigo_conta,mes_inicio,saldo_inicial_oficial')
      .eq('cliente_id',clienteId).eq('ativa',true).order('ordem_exibicao')
      .then(({data}) => setContas(sortContas((data as ContaRef[])||[])));
    supabase.from('financeiro_fornecedores')
      .select('id,nome').eq('cliente_id',clienteId).eq('ativo',true)
      .then(({data}) => setFornecedores((data as FornecedorRef[])||[]));
  }, [clienteId]);

  /* CAD-CONTAS-BANCARIAS-01 — o cadastro de Contas bancárias salvou uma conta: relê SÓ ela, sem F5 (a inativa sai da lista). Os saldos
     e a régua chegam pelo dono (`invalidarDono`, que o cadastro chama quando muda o saldo inicial, a data ou a marca "Sem extrato"). */
  useEffect(() => {
    if (!clienteId) return;
    return ouvirContasBancarias(clienteId, (contaId) => {
      void supabase.from('financeiro_contas_bancarias')
        .select('id,nome_conta,nome_exibicao,tipo_conta,codigo_conta,mes_inicio,saldo_inicial_oficial,ativa')
        .eq('id', contaId).maybeSingle()
        .then(({ data }) => setContas(atual => {
          const outras = atual.filter(c => c.id !== contaId);
          const lida = data as (ContaRef & { ativa?: boolean }) | null;
          return lida && lida.ativa ? sortContas([...outras, lida]) : outras;
        }));
    });
  }, [clienteId]);

  /* ⚠ OS ÍCONES DE CONFIANÇA DO SALDO — PR-SALDO-ICONES-LINHA-02C. Duas consultas por
     carga, nunca uma por linha: quais contas têm OFX com saldo declarado e quais têm
     extrato anexado. Carregam o ANO inteiro, agrupado por mês, porque trocar de mês na
     régua não recarrega o `loadData` — consultar só o mês selecionado deixaria os ícones
     do mês anterior na tela. Os filtros do OFX são os mesmos de `useSaldoDeclaradoOfx`. */
  /* ⚠ `contasComExtrato` SAIU — PR-CONC-SALDO-UMA-REGUA-02. Era a leitura em levas do extrato do ano inteiro só para a
     regra das contas ocultas saber quem teve movimento de extrato no mês; o dono responde isso na linha da conta
     (`tem_extrato`), e a leitura deixou de existir. */
  const [contasComOfx, setContasComOfx] = useState<Map<string, Set<string>>>(new Map());
  const [contasComPdf, setContasComPdf] = useState<Map<string, Set<string>>>(new Map());
  /* UI-SEM-CORTE-02 — as contas que importam OFX (qualquer mês): com extrato no mês e sem saldo declarado, o ícone fica vazado. */
  const [contasQueImportamOfx, setContasQueImportamOfx] = useState<Set<string>>(new Set());
  const carregarIndicadoresSaldo = useCallback(async () => {
    if (!clienteId) return;
    const [{ data: imps }, { data: docs }, { data: ofxs }] = await Promise.all([
      supabase.from('financeiro_importacoes_v2')
        .select('conta_bancaria_id, saldo_declarado_data')
        .eq('cliente_id', clienteId)
        .not('saldo_declarado', 'is', null)
        .is('cancelado_em', null)
        .is('cancelada_em', null)
        .neq('status', 'cancelada')
        .gte('saldo_declarado_data', `${ano}-01-01`)
        .lt('saldo_declarado_data', `${Number(ano) + 1}-01-01`),
      supabase.from('financeiro_saldo_documentos')
        .select('conta_bancaria_id, ano_mes')
        .eq('cliente_id', clienteId)
        .eq('cancelado', false)
        .gte('ano_mes', `${ano}-01`)
        .lte('ano_mes', `${ano}-12`),
      supabase.from('financeiro_importacoes_v2')
        .select('conta_bancaria_id')
        .eq('cliente_id', clienteId)
        .ilike('tipo_arquivo', '%ofx%')
        .is('cancelado_em', null)
        .is('cancelada_em', null)
        .neq('status', 'cancelada'),
    ]);
    const porMes = (linhas: { conta: string | null; mes: string | null }[]) => {
      const m = new Map<string, Set<string>>();
      for (const l of linhas) {
        if (!l.conta || !l.mes) continue;
        const k = l.mes.slice(0, 7);
        const set = m.get(k) ?? new Set<string>();
        set.add(l.conta);
        m.set(k, set);
      }
      return m;
    };
    setContasComOfx(porMes((imps ?? []).map(i => ({ conta: i.conta_bancaria_id, mes: i.saldo_declarado_data }))));
    setContasComPdf(porMes((docs ?? []).map(d => ({ conta: d.conta_bancaria_id, mes: d.ano_mes }))));
    setContasQueImportamOfx(new Set((ofxs ?? []).map(o => o.conta_bancaria_id).filter((c): c is string => !!c)));

  }, [clienteId, ano]);

  /* ⚠ `silencioso` — CONC-SEM-F5-01: a recarga disparada pelo CANAL não liga o `loading` nem esvazia a lista. Três das abas
     internas se desenham atrás de `!loading`; com o Casar e o Importar avisando o canal a cada gesto, a recarga normal as
     DESMONTARIA no meio do trabalho (a Conferência aberta, a prévia da importação). Os números de antes ficam na tela até os
     novos chegarem. Trocar de cliente ou de ano segue pela carga normal. */
  const loadData = useCallback(async (silencioso: boolean = false) => {
    if (!clienteId) return;
    void carregarIndicadoresSaldo();
    if (!silencioso) {
      setLoading(true);
      setLancamentos([]);
    }
    const prevDec    = `${Number(ano)-1}-12`;
    const anoMesMin  = `${ano}-01`;
    const anoMesMax  = `${ano}-12`;

    const [{data:sData},{data:legData}] = await Promise.all([
      supabase.from('financeiro_saldos_bancarios_v2')
        .select('id,ano_mes,conta_bancaria_id,fazenda_id,saldo_inicial,saldo_final,fechado,status_mes,origem_saldo,origem_saldo_inicial,observacao,saldo_data')
        .eq('cliente_id',clienteId).gte('ano_mes',prevDec).lte('ano_mes',anoMesMax),
      supabase.from('financeiro_saldos_bancarios')
        .select('id,ano_mes,conta_banco,fazenda_id,saldo_final')
        .eq('cliente_id',clienteId).gte('ano_mes',prevDec).lte('ano_mes',anoMesMax),
    ]);

    const contasRef: ContaSaldoRef[] = contas.map(c => ({
      id:c.id, nome_conta:c.nome_conta, nome_exibicao:c.nome_exibicao,
      tipo_conta:c.tipo_conta, codigo_conta:c.codigo_conta,
    }));
    const unified = buildUnifiedSaldos({
      v2Saldos:(sData as SaldoV2SourceRow[])||[],
      legacySaldos:(legData as SaldoLegacySourceRow[])||[],
      contas:contasRef, movSummary:{},
    });
    // Conciliação bancária só pode confiar em saldos v2 reais. Linhas legacy mapeadas via
    // fuzzy match (tipo+codigo / nome) podem atribuir o extrato à conta errada
    // (ex: BTG legacy aparecendo na linha "Dinheiro"). Fonte 'v2' apenas.
    /* ⚠ `saldo_data` VEM DA FONTE V2, não do unificado — SALDO-POSICAO-01c. O
       `buildUnifiedSaldos` junta v2 e legacy, e a posição só existe do lado v2;
       alargar o tipo compartilhado para carregar um campo que metade das fontes
       nunca terá poria um `null` permanente no legacy fingindo ser resposta.
       Aqui a linha v2 original é reencontrada por id. */
    const posicaoPorId = new Map<string, string | null>(
      ((sData as SaldoV2SourceRow[]) || []).map(r => [r.id, r.saldo_data ?? null]));
    setSaldos(unified
      .filter(u => u.fonte === 'v2')
      .map(u => ({
        id:u.id, ano_mes:u.ano_mes,
        conta_bancaria_id: u.conta_bancaria_id_v2 || u.conta_bancaria_id,
        saldo_inicial:u.saldo_inicial, saldo_final:u.saldo_final,
        status_mes:u.status_mes, origem_saldo_inicial:u.origem_saldo_inicial,
        saldo_data: posicaoPorId.get(u.id) ?? null,
      })));

    const allLanc: LancamentoResumo[] = [];
    let from = 0;
    const batchSize = 1000;
    while (true) {
      const {data:lData} = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id,tipo_operacao,valor,sinal,data_competencia,data_pagamento,descricao,status_transacao,favorecido_id,numero_documento,conta_bancaria_id,conta_destino_id,ano_mes,subcentro,origem_lancamento,macro_custo,centro_custo,cancelado,cenario,sem_movimentacao_caixa')
        .eq('cliente_id',clienteId).eq('cancelado',false)
        .eq('sem_movimentacao_caixa', false)
        .eq('status_transacao', 'realizado')
        .eq('cenario', 'realizado')
        .gte('data_pagamento',`${ano}-01-01`).lte('data_pagamento',`${ano}-12-31`)
        .order('ano_mes').order('data_pagamento').order('id')
        .range(from, from+batchSize-1);
      if (!lData || lData.length === 0) break;
      allLanc.push(...(lData as LancamentoResumo[]).filter(l => belongsToConta(l,'__all__')));
      if (lData.length < batchSize) break;
      from += batchSize;
    }
    setLancamentos(allLanc);
    setLoading(false);
  }, [clienteId, ano, contas, carregarIndicadoresSaldo]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ⚠ E RELÊ QUANDO OS LANÇAMENTOS MUDAM — [CONCIL-MES-02] (132). O "Conciliar o mês"
     grava por RPC, fora daqui; sem ouvir, o "Todos (12)" desta aba continuava em 12 depois
     de 107 movimentos entrarem, até um F5 (medido em 07/09). O registro é o mesmo que o
     `useFinanceiroV2` já usava internamente — inventar um segundo seria a segunda fonte
     para a mesma pergunta. */
  /* O dono relido junto com a carga: onde esta tela já recarregava (lançamentos mudaram, saldo informado), o resumo e a
     régua do ano também relêem — senão a tela mostraria o número de antes do gesto. CONC-SEM-F5-01: os gestos das abas
     internas (Casar, Importar, Enriquecer) avisam o canal, e o retorno à vista relê o que foi gravado em outra seção. */
  const releDono = useCallback(() => invalidarDono(queryClient, clienteId), [clienteId, queryClient]);

  useEffect(() => {
    if (!clienteId) return;
    return inscreverEmLancamentos(clienteId, () => { void loadData(true); releDono(); });
  }, [clienteId, loadData, releDono]);

  /* ═══ O DONO — PR-CONC-SALDO-UMA-REGUA-02 ═══
     ⚠ A TELA SÓ DESENHA. O resumo do mês (todas as contas, os subtotais e o total) é UMA chamada a
     `fn_conciliacao_resumo_mes`, e a régua dos doze meses é `fn_conciliacao_status_ano`. Nada aqui soma linha, subtrai
     saldo ou escolhe conta: o universo de contas (ativa e já existente no mês) também é do dono (01c).
     ⚠ A RÉGUA NÃO SEGURA A TELA: os meses nascem neutros e se pintam quando o status do ano responde; o mês aberto já
     nasce pintado pelo total do resumo. */
  const anoMesSel = `${ano}-${selectedMes}`;
  const resumoQ = useResumoMes(clienteId, anoMesSel, null);
  const resumo = resumoQ.data ?? null;
  const statusAnoQ = useStatusAno(clienteId, Number(ano));
  /* CONC-SEM-F5-01 — a rede de segurança: ao entrar na seção, ao voltar para esta aba interna e quando a janela volta a ter
     foco, o dono é relido (uma chamada do resumo e uma da régua). Declarado DEPOIS das duas leituras: a releitura que elas
     já fazem ao montar não é duplicada. */
  useReleDonoAoVoltarAVista(clienteId, vistaExtrato === 'conciliacao');

  const linhaTotal = useMemo(() => resumo?.find(l => l.nivel === 'total') ?? null, [resumo]);
  const linhaSel: LinhaResumo | null = selectedConta === '__all__'
    ? linhaTotal
    : (resumo?.find(l => l.nivel === 'conta' && l.conta_id === selectedConta) ?? null);
  /* ⚠ OS NÚMEROS DO RESUMO SÃO OS DA CONTA (PR-CONC-INTERNA-SEPARADA-01b, D3): com uma conta aberta, o `proprio` do dono — na
     conta-mãe o topo é o consolidado do par, que é veredito e não saldo; no Todas, a linha 'total'. `saldosDaLinha` só lê. */
  const saldosSel = saldosDaLinha(linhaSel);

  /* ⚠ O MAPA DE TONS: `STATUS_COR` pela cor e `ROTULO_STATUS` pelo `title`. Mês sem status do ano ainda fica SEM tom
     (o seletor o desenha neutro); o mês aberto leva o status do total do resumo enquanto o do ano não chega. */
  const tomDosMeses = useMemo(() => {
    /* ⚠ A COR É O STATUS (o saldo); o aviso do extrato é um PONTO ÂMBAR no canto do mês conciliado, com os avisos no
       `title` — PR-CONC-STATUS-SALDO-01b. `marcaDeAviso` só lê o status e os avisos do dono. */
    /* ⚠ O CONTADOR VERMELHO (CONC-SEM-CLASSIFICACAO-01) é a quantidade do aviso 'sem_classificacao' do TOTAL do mês, lida do
       dono: NÃO muda a cor do mês (D6) — o mês conciliado segue verde, com o número no canto. */
    const m: Record<number, { bg: string; border: string; txt: string; title?: string; marca?: string; contador?: { qtde: number; title: string } }> = {};
    for (const r of statusAnoQ.data ?? []) {
      if (r.nivel !== 'total' || r.ano_mes.slice(0, 4) !== ano) continue;
      m[Number(r.ano_mes.slice(5, 7))] = { ...STATUS_COR[r.status], title: ROTULO_STATUS[r.status], marca: marcaDeAviso(r) ?? undefined, contador: contadorDoMes(semClassificacaoDaLinha(r)) };
    }
    if (!statusAnoQ.data && linhaTotal) {
      m[Number(selectedMes)] = { ...STATUS_COR[linhaTotal.status], title: ROTULO_STATUS[linhaTotal.status], marca: marcaDeAviso(linhaTotal) ?? undefined, contador: contadorDoMes(semClassificacaoDaLinha(linhaTotal)) };
    }
    return m;
  }, [statusAnoQ.data, linhaTotal, ano, selectedMes]);

  /* O mês aberto: rótulo e a lista de lançamentos realizados dele (o modal "Todos (N)"). Lista, não conta. */
  const selectedCard = useMemo((): MesCard => ({
    mes: selectedMes,
    label: MESES_LABELS[Number(selectedMes) - 1] ?? selectedMes,
    anoMes: anoMesSel,
    lancamentos: lancamentos.filter(l =>
      (l.data_pagamento || '').slice(0, 7) === anoMesSel && belongsToConta(l, selectedConta)),
  }), [selectedMes, anoMesSel, lancamentos, selectedConta]);

  /* ── As contas do mês: as linhas de CONTA do dono, na ordem do cadastro ──
     ⚠ A CONTA INTERNA TEM LINHA, NO TIPO DELA (PR-CONC-INTERNA-SEPARADA-01b, D2): cada conta mostra o saldo PRÓPRIO (`proprio`
     do dono) — a mãe em Conta corrente, a interna em Investimentos —, e o que as liga é a marca "conferida com". Antes a
     interna não tinha linha e a mãe mostrava o consolidado. */
  const perContaSaldos = useMemo((): PerContaSaldo[] => {
    const linhas = (resumo ?? []).filter(l => l.nivel === 'conta' && l.conta_id);
    const porId = new Map(contas.map(c => [c.id, c]));
    return linhas.map(l => {
      const id = l.conta_id ?? '';
      const conta = porId.get(id) ?? {
        id, nome_conta: l.conta_nome, nome_exibicao: null, tipo_conta: l.tipo_conta,
        codigo_conta: null, mes_inicio: null, saldo_inicial_oficial: null,
      };
      return { conta, linha: l };
    });
  }, [resumo, contas]);

  // Fonte única conta+mês — situacao e diagPendencias derivam DESTE lancMes (proibido recriar o filtro).
  const lancMes = useMemo(() => {
    const anoMes = `${ano}-${selectedMes}`;
    return lancamentos.filter(l =>
      (l.data_pagamento || '').slice(0, 7) === anoMes &&
      (selectedConta === '__all__' || belongsToConta(l, selectedConta)));
  }, [ano, selectedMes, selectedConta, lancamentos]);

  // PR-FechamentoFinanceiro-Pendencias-A1 — verdict read-time (saldo + duplicados).
  const situacao = useMemo(() => {
    const dup = detectarDuplicatasCrossOrigin(lancMes);
    const pendGerenciais = derivarPendenciasGerenciais(lancMes);
    /* D9 — a diferença de saldo é a do DONO (a linha da conta, ou o total no Todas); duplicatas e pendências gerenciais
       seguem no front (dívida D8 do 01b). */
    const difSaldo = saldosSel.diferenca ?? 0;
    return montarSituacaoFechamento({ diferencaSaldo: difSaldo, duplicatas: dup, pendenciasGerenciais: pendGerenciais });
  }, [lancMes, saldosSel.diferenca]);

  /* Duplicados entre origens (mesmo lancMes canônico) — alimenta o card Status e o diálogo de duplicados.
     ⚠ O "SEM CLASSIFICAÇÃO" SAIU DAQUI (CONC-SEM-CLASSIFICACAO-01): era `derivarDetalhePendencias`, uma regra do front que nem
       olhava `plano_conta_id` e acendia por falta de fornecedor. Agora a quantidade e o valor são os avisos do DONO
       (`semClassificacaoDaLinha` / `semFornecedorDaLinha`) e a lista é a de `fn_conciliacao_sem_classificacao_lista`. */
  const diagPendencias = useMemo(() => {
    const dup = detectarDuplicatasCrossOrigin(lancMes);
    const duplicados = lancMes.filter(l => dup.ids.includes(l.id));
    return { duplicadosCount: dup.qtd, duplicados };
  }, [lancMes]);

  /* ── Lançamentos for modal ── */
  const fornecedorMap = useMemo(() => new Map(fornecedores.map(f=>[f.id,f.nome])), [fornecedores]);

  const entradas = useMemo(() => (selectedCard?.lancamentos||[]).filter(l=>classifyLanc(l,selectedConta)==='entrada'), [selectedCard, selectedConta]);
  const saidas   = useMemo(() => (selectedCard?.lancamentos||[]).filter(l=>classifyLanc(l,selectedConta)==='saida'),   [selectedCard, selectedConta]);

  const lancFiltrados = useMemo(() => {
    const all = selectedCard?.lancamentos || [];
    if (filtroModal==='entradas')       return all.filter(l=>classifyLanc(l,selectedConta)==='entrada');
    if (filtroModal==='saidas')           return all.filter(l=>classifyLanc(l,selectedConta)==='saida');
    if (filtroModal==='transf_entrada')   return all.filter(l=>classifyLanc(l,selectedConta)==='transf_entrada');
    if (filtroModal==='transf_saida')     return all.filter(l=>classifyLanc(l,selectedConta)==='transf_saida');
    return all;
  }, [selectedCard, filtroModal, selectedConta]);

  const lancSorted = useMemo(() => [...lancFiltrados].sort((a,b) => {
    const dir = lancSort.dir==='asc' ? 1 : -1;
    switch (lancSort.col) {
      case 'data': return dir*(a.data_pagamento||a.data_competencia||'').localeCompare(b.data_pagamento||b.data_competencia||'');
      case 'descricao': return dir*(a.descricao||'').localeCompare(b.descricao||'','pt-BR');
      case 'fornecedor': {
        const fa = a.favorecido_id ? fornecedorMap.get(a.favorecido_id)||'' : '';
        const fb = b.favorecido_id ? fornecedorMap.get(b.favorecido_id)||'' : '';
        return dir*fa.localeCompare(fb,'pt-BR');
      }
      case 'valor': {
        const va = classifyLanc(a,selectedConta)==='entrada' ? a.valor : -a.valor;
        const vb = classifyLanc(b,selectedConta)==='entrada' ? b.valor : -b.valor;
        return dir*(va-vb);
      }
      default: return 0;
    }
  }), [lancFiltrados, lancSort, fornecedorMap, selectedConta]);

  const transfEntrada = useMemo(() => (selectedCard?.lancamentos||[]).filter(l=>classifyLanc(l,selectedConta)==='transf_entrada'), [selectedCard, selectedConta]);
  const transfSaida   = useMemo(() => (selectedCard?.lancamentos||[]).filter(l=>classifyLanc(l,selectedConta)==='transf_saida'),   [selectedCard, selectedConta]);
  // Somas refletem APENAS o filtro ativo
  const sumModal = useMemo(() => {
    let ent=0, sai=0, trE=0, trS=0;
    lancFiltrados.forEach(l => {
      const cls = classifyLanc(l, selectedConta);
      if (cls==='entrada')       ent += l.valor;
      else if (cls==='saida')    sai += l.valor;
      else if (cls==='transf_entrada') trE += l.valor;
      else if (cls==='transf_saida')   trS += l.valor;
    });
    return {ent, sai, trE, trS, total: ent+sai+trE+trS};
  }, [lancFiltrados, selectedConta]);
  const totalEntradasModal = sumModal.ent;
  const totalSaidasModal   = sumModal.sai;

  /* ── Handlers ── */
  /* A posição sai da linha já carregada — `saldo_data` entrou no `select` acima
     desde que o types.ts foi regenerado, e o modal a recebe pronta. */
  const handleEditSaldo = (anoMes: string, cId: string, current: number | null) => {
    const linha = saldos.find(x => x.ano_mes === anoMes && x.conta_bancaria_id === cId);
    setEditingSaldo({anoMes, contaId:cId, current, saldoData: linha?.saldo_data ?? null});
  };


  const canEditSaldoFinal = (anoMes: string): boolean => {
    if (isAdmin) return true;
    const [y,mn] = anoMes.split('-').map(Number);
    return y===currentYear && mn===currentMonth && isFinanceiro;
  };

  /* ── Derived display values ── */
  /* P166 (CONC-TELA-02): o card Status virou a FAIXA do mês (`FaixaDoMes`), que lê a linha aberta do dono (a conta, ou o total no
     Todas). Saíram com ele a 2ª prova, o pareamento (e a leitura `useConciliacaoDoMes` que só o alimentava) e o link "N dias com
     diferença" → Conferência; o "sem fornecedor" segue no `title` de cada conta.
     CONC-SEM-CLASSIFICACAO-01: o aviso de classificação da linha aberta, do dono. */
  const semClassificacaoSel = semClassificacaoDaLinha(linhaSel);
  const retido = linhaSel ? fraseDoRetido(linhaSel.retido_em_depositos) : null;
  const semConta = selectedConta === '__all__' && linhaTotal ? fraseSemConta(linhaTotal.sem_conta) : null;

  const contaAtual = selectedConta === '__all__'
    ? 'Todas as contas'
    : getContaLabel(contas.find(c=>c.id===selectedConta) || {id:'',nome_conta:selectedConta,nome_exibicao:null,tipo_conta:null,codigo_conta:null});

  /**
   * A POSIÇÃO DO CARD — CONCIL-PARIDADE-VISUAL-01 §3.
   *
   * ⚠ MESMA FONTE DA ABA IMPORTAR, nada recalculado: `saldo_data` da linha do
   * mês, e o fim do mês quando ela é nula — o mesmo `coalesce` de leitura que o
   * `useSaldoGerencialDoMes` faz. Uma segunda régua aqui faria as duas telas
   * discordarem sobre qual data a diferença usou, que é exatamente o defeito
   * que o §5 acabou de matar no saldo.
   */
  /* ⚠ PR-CONC-SALDO-UMA-REGUA-02 (D5): a data do saldo do extrato e a posição são do DONO — `saldo_extrato_data` e
     `posicao` (que só existe com a posição ANTES do fim do mês, com os realizados depois dela). Nada se conta aqui. */
  /* ⚠ SEM DATA FANTASMA — CONC-TOTAL-SEM-SALDO-01b (M4): a data entre parênteses e a do rodapé só existem quando o DONO devolve
     a data do saldo da linha aberta. Antes, sem ela, a tela caía no fim do mês e escrevia "Saldo extrato (31/10)" no Total — uma
     data que ninguém informou (o agregado não tem data de saldo). */
  const dataExtratoDoCard = linhaSel?.saldo_extrato_data ?? null;
  const posicaoDoCard = dataExtratoDoCard ? dataExtratoDoCard.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '';
  const posicaoDono = linhaSel?.posicao ?? null;
  const avisoAposPosicao = posicaoDono?.realizados_apos.qtde ?? 0;
  /* A diferença NA POSIÇÃO: a do dono; em conta de par ele ainda não a devolve, e a tela diz "—" com o motivo. */
  const difNaPosicao = diferencaNaPosicao(linhaSel);
  const ddmmPosicao = posicaoDono ? posicaoDono.data.slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '';
  /* ⚠ OCULTAR NÃO É INATIVAR — PR-CONCILIACAO-CARDS-01a. Conta que abriu o mês com
     saldo 0,00, sem lançamento e sem saldo de extrato não diz nada sobre o mês e só
     empurra as outras para baixo. Some da LISTA; o Total continua somando todas
     (a oculta vale zero nas três colunas, então o número é o mesmo). */
  const [mostrarOcultas, setMostrarOcultas] = useState(false);

  /* P166 (CONC-TELA-02): os dois blocos (Saldos por conta e Resumo do mês) vão do topo deles até o fim da janela, com qualquer
     número de contas (TABELA-ALTURA-FIXA-01); só a tabela de cada um rola. O cabeçalho do card saiu do rolador, então o
     `thead` gruda no topo dele (a medida do cabeçalho do card, PR-CONCILIA-SALDOS-UI-01, não é mais necessária). */
  const { ref: refBlocos, altura: alturaBlocos } = useAlturaAteOFim({ ativo: vistaExtrato === 'conciliacao' && !!resumo, folga: 8, minimo: 240 });
  /* A altura do `thead` fixo (colunas + Total) — PR-CONCILIA-GRUPOS-STICKY-02. A faixa de grupo gruda logo abaixo dele.
     Medida, não escrita: o Total muda de altura com a fonte. Callback ref: o card só monta na aba Conciliação. */
  const [alturaThead, setAlturaThead] = useState(0);
  const observadorThead = useRef<ResizeObserver | null>(null);
  const refThead = useCallback((el: HTMLTableSectionElement | null) => {
    observadorThead.current?.disconnect();
    observadorThead.current = null;
    if (!el) return;
    setAlturaThead(el.getBoundingClientRect().height);
    const ro = new ResizeObserver(() => setAlturaThead(el.getBoundingClientRect().height));
    ro.observe(el);
    observadorThead.current = ro;
  }, []);
  /**
   * A CONTA PARADA E ZERADA NO MÊS — PR-CONC-CONTA-PARADA-01.
   *
   * ⚠ DUAS CONDIÇÕES ENTRARAM NESTA RODADA, e cada uma corrige um caso real:
   *   `ext` ZERO, e não só `ext` NULO. Antes, só sumia a conta SEM linha de saldo; uma conta
   *     com linha declarando 0,00 continuava ocupando a tela. Medido na Vera/set: Bradesco
   *     Pessoal e Dinheiro declaram 0,00 e não tinham por que aparecer.
   *   SEM EXTRATO no mês. Conta zerada COM extrato importado tem o que conferir — ocultá-la
   *     esconderia justamente o trabalho a fazer.
   * ⚠ E `saldo_final <> 0` SEGUE APARECENDO SEMPRE: investimento parado e dinheiro esquecido
   *   precisam ser carregados e conciliados. São 12 casos em agosto no proto, e nenhum deles
   *   pode sumir — a conta não movimentou, mas TEM saldo.
   * ⚠ "SEM MOVIMENTAÇÃO" NÃO É "INATIVA": a conta continua viva e `cb.ativa` não é tocada. O
   *   rodapé "mostrar" a traz de volta para quem precisar digitar uma posição nela.
   */
  /* ⚠ AS QUATRO PERGUNTAS LEEM A LINHA DO DONO (PR-CONC-SALDO-UMA-REGUA-02): saldo inicial, saldo do extrato,
     entradas/saídas do mês e `tem_extrato`. É regra de EXIBIÇÃO: o Total e o subtotal são do dono, com ou sem ela.
     ⚠ SOBRE O `proprio` (PR-CONC-INTERNA-SEPARADA-01b, D2): a interna com aplicação ou resgate no mês tem entradas/saídas
     próprias e aparece; e a interna de um par NÃO conciliado nunca se oculta — é ali que o operador vai conferir.
     ⚠ "PAR NÃO CONCILIADO" SÃO DUAS PERGUNTAS desde o PR-CONC-STATUS-SALDO-01b: cada conta é julgada pelo SEU saldo, e
     `par_status` é só o status da MÃE. A interna fica visível quando o status DELA não é conciliado OU o da mãe não é. */
  const ehOculta = (c: PerContaSaldo) => {
    const p = saldosDaLinha(c.linha);
    return Math.round((p.saldo_inicial ?? 0) * 100) === 0
      && Math.round((p.saldo_extrato ?? 0) * 100) === 0
      && Math.round(p.entradas * 100) === 0 && Math.round(p.saidas * 100) === 0
      && !c.linha.tem_extrato
      && !(c.linha.par_conta_id !== null && (c.linha.status !== 'conciliado' || c.linha.par_status !== 'conciliado'));
  };
  const qtdOcultas = perContaSaldos.filter(ehOculta).length;
  const contasVisiveis = mostrarOcultas ? perContaSaldos : perContaSaldos.filter(c => !ehOculta(c));
  /* ⚠ OS GRUPOS SAEM DO AGRUPADOR ÚNICO — PR-CONCILIA-GRUPOS-01. Eram três `<tr>` literais
     (cc/inv/cartao), e a conta de qualquer outro tipo (a permuta da NJ) ficava INVISÍVEL na
     tabela mas entrava no Total — nenhum subtotal fecharia. `agruparContasPorTipo` dá faixa a
     todo tipo, com o rótulo e a ordem que o dropdown do Importar Banco já usa.
     ⚠ O SUBTOTAL É A LINHA 'tipo' DO DONO (PR-CONC-SALDO-UMA-REGUA-02), com a MESMA chave de `grupoDaConta`; a tela
     não soma. Sem linha do dono para o grupo, o subtotal fica em "—". */
  const gruposSaldos = agruparContasPorTipo(
    contasVisiveis.map(c => ({ ...c, tipo_conta: c.linha.tipo_conta ?? c.conta.tipo_conta, label: getContaLabel(c.conta) })),
  ).map(g => ({ ...g, subtotal: resumo?.find(l => l.nivel === 'tipo' && l.tipo_conta === g.chave) ?? null }));

  /* A diferença do resumo — `null` quando não há saldo de extrato. Ausência é
     traço, nunca "confere". "Todas" compara o total do extrato com o do sistema,
     o mesmo cálculo que o card já fazia. */
  const difResumo: number | null = saldosSel.diferenca;
  const difResumoConfere = difResumo !== null && saldoConfere(difResumo);
  /* CONC-TOTAL-SEM-SALDO-01b — diferença nula COM o motivo `contas_sem_saldo`: a tela diz o que falta, no lugar do "—". */
  const faltaSaldoSel = difResumo === null ? fraseFaltaSaldo(linhaSel) : null;
  const faltaSaldoTotal = fraseFaltaSaldo(linhaTotal);

  /* ⚠ D8 — O QUE SE GRAVA É O DO DONO (`contasParaFecharSemMovimento`): saldo final = `saldo_sistema`, saldo inicial = o
     do dono; conta com movimento no mês (entrada, saída ou extrato) NÃO se fecha — ela é para conferir. Antes gravava o
     `saldoCalculado` da tela, a valor cheio, e fechava também a conta com movimento (sem a marca 'sem_movimento'). */
  const fechamentoSemMovimento = useMemo(
    () => contasParaFecharSemMovimento((resumo ?? []).filter(l => l.nivel === 'conta')),
    [resumo]);

  const handleFecharSemMovimento = useCallback(async () => {
    if (!clienteId) return;
    const anoMes = anoMesSel;
    const { fechar, comMovimento, semReferencia } = fechamentoSemMovimento;
    if (fechar.length === 0) {
      toast.info('Nenhuma conta sem extrato e sem movimento para fechar neste mês.');
      return;
    }

    setFechandoSemMovimento(true);
    let salvos = 0;
    let erros = 0;

    try {
      for (const f of fechar) {
        // Buscar fazenda_id da conta
        const { data: cd } = await supabase
          .from('financeiro_contas_bancarias')
          .select('fazenda_id')
          .eq('id', f.conta_id)
          .single();
        if (!cd) { erros++; continue; }

        const { error } = await supabase
          .from('financeiro_saldos_bancarios_v2')
          .insert({
            cliente_id: clienteId,
            fazenda_id: cd.fazenda_id,
            conta_bancaria_id: f.conta_id,
            ano_mes: anoMes,
            saldo_inicial: f.saldo_inicial,
            saldo_final: f.saldo_final,
            origem_saldo_inicial: 'propagacao_automatica',
            status_mes: 'aberto',
            origem_saldo: 'sem_movimento',
          });

        if (error) { erros++; } else { salvos++; }
      }
    } finally {
      setFechandoSemMovimento(false);
    }

    if (salvos > 0) {
      toast.success(`${salvos} conta${salvos > 1 ? 's fechadas' : ' fechada'} com sucesso.`);
      loadData();
      releDono();
    }
    if (erros > 0) {
      toast.error(`${erros} conta${erros > 1 ? 's' : ''} com erro ao fechar.`);
    }
    if (semReferencia > 0) {
      toast.info(`${semReferencia} conta(s) sem referência de saldo anterior — informe o saldo manualmente.`);
    }
    if (comMovimento > 0) {
      toast.info(`${comMovimento} conta(s) com movimento no mês não foram fechadas — confira e informe o saldo.`);
    }
  }, [clienteId, anoMesSel, fechamentoSemMovimento, loadData, releDono]);

  /* ── Render ── */
  return (
    <div className="animate-fade-in pb-20 md:pb-0 md:flex-1 md:min-h-0 md:flex md:flex-col md:overflow-hidden">
      {/* ⚠ A COR SEPARA MOLDURA DE CONTEÚDO — PR-CONCILIACAO-CABECALHO-COR-01. Cabeçalho em
          `bg-muted/40`, corpo em `bg-card`: antes os dois eram o mesmo fundo e não se
          distinguia o que é filtro do que é resposta.
          ⚠ O FIO DE BAIXO É SOMBRA INTERNA, NÃO BORDA, e a razão é medida: a altura daqui é do
          conteúdo, então `border-b` somaria 1px POR FORA (`box-border` só segura borda quando há
          altura declarada) e a tabela de saldos, que teto em `calc(100vh - 230px)` fixo, passaria
          a ser cortada embaixo. `inset shadow` pinta dentro da caixa e não move layout — o mesmo
          idioma da fresta do Total naquela tabela. */}
      <div className="p-3 pb-0 space-y-1 sticky top-0 z-20 bg-[hsl(var(--header))] shadow-[inset_0_-1px_0_hsl(var(--border)/0.6)] md:static md:z-auto md:shrink-0">

        {/* ⚠ O CABEÇALHO DA PÁGINA — CONCIL-PARIDADE-VISUAL-01 §1. A tela abria
            direto no seletor de ano, sem dizer o que ela é: quem chegava por um
            atalho via doze cards de mês e nenhum nome. O subtítulo é o da
            referência, e diz a pergunta que a tela responde. */}
        {/* ⚠ A FRASE DE APOIO SUBIU PARA CÁ — PR-IMPORTAR-VER-EXTRATO-01. Ela morava abaixo das
            abas e custava uma linha inteira do cabeçalho (19,13px + o gap), justamente onde a
            tela tem menos espaço: a tabela de saldos tem teto FIXO em `calc(100vh - 230px)` e
            não acompanha o que cresce acima dela.
            ⚠ AQUI ELA NÃO CUSTA NADA, e isso foi medido: esta linha já tem duas alturas de texto
            (o título de 15px e o subtítulo de 11px) e sobrava largura à direita. A frase ocupa a
            largura vazia, na mesma base do subtítulo — o cabeçalho encolhe pelo tanto que a
            linha de baixo deixou de existir.
            ⚠ `items-end` E NÃO `items-center`: as duas frases têm o mesmo tamanho e a mesma cor,
            e alinhá-las pela base faz delas uma linha só aos olhos, em vez de dois textos soltos
            na mesma altura. */}
        <div className="flex min-w-0 items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-none">Conciliação</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Extrato, saldo corrente e o mês fechando — conta a conta
            </p>
          </div>
          {selectedCard && !loading && APOIO_DA_ABA[vistaExtrato] && (
            <p className="min-w-0 max-w-[52%] truncate text-right text-[11px] leading-snug text-muted-foreground"
              title={APOIO_DA_ABA[vistaExtrato]}>
              {APOIO_DA_ABA[vistaExtrato]}
            </p>
          )}
        </div>

        {/* ════ HEADER: year dropdown + 12 month cards ════ */}
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          {/* ⚠ O BLOCO SAIU PARA `SeletorPeriodo` — PR-BARRA-UNICA-01a, e a troca é de casa,
              não de comportamento: as mesmas cores (`STATUS_COR`), o mesmo `title`
              (`STATUS_META`), o mesmo `outline`/`scale` do selecionado e o mesmo esqueleto
              enquanto carrega. O componente nasceu com `tomPorMes` exatamente porque aqui a
              COR É INFORMAÇÃO: cada mês é pintado pelo status de conciliação, e um seletor
              que só soubesse selecionar deixaria esta tela com um seletor só dela. */}
          <SeletorPeriodo
            modo="ano-mes"
            modoUnico
            anos={anos}
            periodo={mesUnico(Number(ano), Number(selectedMes))}
            onPeriodoChange={(p) => {
              setAno(String(p.de.ano));
              setSelectedMes(String(p.de.mes).padStart(2, '0'));
            }}
            /* A régua não espera nada (PR-CONC-SALDO-UMA-REGUA-02): os tons vêm do dono e o mês sem tom é neutro. */
            carregando={false}
            className="flex-1"
            tomPorMes={tomDosMeses}
          />
        </div>

        {/* PR-MOS-1 — abas da Conciliação Bancária. A Auditoria Bancária continua separada;
            o Espelho é modal (o fecho) e também a aba "Casar lançamentos" — ver o comentário
            do `vistaExtrato`.
            ⚠ A BARRA NÃO USA O `Segmentado` da casa: são botões à mão, como já eram. Migrar é
            frente própria.
            ⚠ A ATIVA É BRANCA, NÃO NAVY — PR-CONCILIACAO-CABECALHO-COR-01. Ela é a aba RECORTADA
            do corpo (`bg-card`, os três lados em sombra interna, o de baixo aberto para o
            conteúdo); a inativa perdeu o `bg-muted`, que agora seria a própria cor da faixa e a
            faria sumir. As três medidas (`px-2.5 py-1`, 10px/700) não mudam: com sombra em vez de
            borda, a barra continua nos 23px de sempre.
            ⚠ OS BOTÕES DIVIDEM ESTA LINHA COM AS ABAS — PR-CONCILIACAO-CABECALHO-BOTOES-02. A
            barra terminava em "Conciliação" com metade da largura vazia à direita, e os dois
            botões gastavam uma faixa inteira logo abaixo. Eles vieram para cá, na ponta direita.
            ⚠ E O `!loading` DESCEU PARA DENTRO, de propósito: ele governava a linha toda e, se
            continuasse governando, os botões passariam a sumir a cada recarga — exatamente o
            piscar que o comentário da faixa abaixo dizia estar evitando. A linha agora existe
            sempre que há mês selecionado; só as abas esperam o carregamento, como antes.
            ⚠ E OS BOTÕES DESCERAM DE `h-6` PARA `h-5`, POR MEDIÇÃO: 24px numa linha de abas de
            23px esticava a linha em 1px, e a altura desta faixa é justamente o que a tabela de
            saldos não pode perder (teto fixo em `calc(100vh - 230px)`). Com `h-5` a linha fica nos
            mesmos 23px. Medido em Chromium: cabeçalho 146,5 → 143,5 na Conciliação e → 118,5 nas
            demais abas, que perderam a faixa vazia. */}
        {selectedCard && (
          <div className="flex gap-1 items-center">
            {/* As abas não esperam a carga dos lançamentos (PR-CONC-SALDO-UMA-REGUA-02): a Conciliação desenha o dono e
                as outras abas mantêm o próprio "Carregando..." no corpo. */}
            {(<>
            {/* P166 (CONC-TELA-02): os rótulos com só a 1ª letra maiúscula; a aberta é BRANCA com o traço navy embaixo (sombra interna:
                a barra segue nos 23px). Todas no MESMO peso (500): trocar de aba não muda a largura de nenhuma — nada anda. */}
            {ABAS_DA_CONCILIACAO.map(a => (
              <button key={a.chave} type="button" onClick={() => setVistaExtrato(a.chave)} data-aba={a.chave}
                className={`px-2.5 py-1 rounded-t text-[10px] font-medium transition-colors ${vistaExtrato === a.chave ? 'bg-card text-primary shadow-[inset_0_-2px_0_hsl(var(--primary)),inset_0_1px_0_hsl(var(--border)/0.6),inset_1px_0_0_hsl(var(--border)/0.6),inset_-1px_0_0_hsl(var(--border)/0.6)]' : 'bg-transparent text-muted-foreground hover:bg-background/60'}`}>
                {a.rotulo}
              </button>
            ))}
            </>)}
            <div className="flex-1" />
            {/* ⚠ O BOTAO "⬆ Importar Extrato" DO CABECALHO SAIU — B-24. Ele era a
                outra porta para o modal antigo, e era por ela que o fluxo legado
                voltava a aparecer depois do clone. O gesto de importar mora na
                aba, inteiro: escolher a conta, escolher o arquivo, conferir a
                previa ali e confirmar. Duas portas para o mesmo ato, uma delas
                para o miolo velho, e' como o defeito reabriria sozinho.
                ⚠ O MODAL SEGUE MONTADO no fim deste arquivo e vivo nas telas
                velhas — nada morre antes da homologacao da rodada 2. */}
            {onNavigateToLancamentos && (
              <Button size="sm" variant="outline" className="h-5 text-[10px] gap-1 px-2.5"
                onClick={() => onNavigateToLancamentos(ano, parseInt(selectedMes))}>
                ↗ Lançamentos
              </Button>
            )}
            {/* ⚠ CONTA E MÊS VÊM DO CABEÇALHO: o espelho não tem seletor próprio, e com
                "todas" o botão fica desabilitado dizendo por quê — a RPC compara UMA conta,
                e somar o extrato de uma com o sistema de várias não é espelho nenhum. */}
          </div>
        )}

        {/* ⚠ A FAIXA DO MÊS FICA ABAIXO DAS ABAS — PR-CONCILIA-FAIXA-MES-CONTA-01, e mora fora de
            qualquer área que rola (o container é `md:shrink-0`, A21). Sem `!loading`: não pisca a
            cada recarga.
            ⚠ MÊS + STATUS + CONTA SÓ NA ABA CONCILIAÇÃO — PR-CONCILIA-FAIXA-SO-CONCILIACAO-01.
            Importar e Extrato Gerencial têm filtro de conta PRÓPRIO, e a conta global aqui
            contradizia a do corpo ("Banco Bradesco" em cima, "B.Brasil-Invest.Facil" embaixo). A
            Conciliação não tem seletor, então é a única aba onde esta conta é a que vale.
            ⚠ OS DOIS BOTÕES SUBIRAM PARA A LINHA DAS ABAS — PR-CONCILIACAO-CABECALHO-BOTOES-02.
            Eles moraram aqui de PR-IMPORTAR-CABECALHO-01 até agora, e a faixa existia por causa
            deles em abas que não tinham mais nada a dizer: nas outras quatro ela era uma linha em
            branco com um botão na ponta. Ela agora só nasce quando tem conteúdo PRÓPRIO, que hoje
            é mês + status + conta — ou seja, só na aba Conciliação. As condições dos botões não
            mudaram, mudou onde eles são desenhados. */}
        {/* ⚠ CADA ABA DIZ O QUE SE FAZ NELA — PR-CONCILIACAO-PASSOS-01. A tela tem cinco abas e
            nenhuma dizia para que servia; o operador aprendia o fluxo clicando, e aprendia
            errado enquanto os botões de conciliar moravam na aba de importar.
            ⚠ SÓ NAS TRÊS DO FLUXO. Extrato Gerencial e Conciliação são consulta, não passo — uma
            frase de apoio ali seria enfeite, e enfeite que custa 19px de cabeçalho.
            ⚠ E A FRASE DESCREVE O QUE A TELA FAZ HOJE, não o fluxo que ainda vamos construir:
            dizer "primeiro o exato, depois agrupa" seria prometer no cabeçalho uma ordem que o
            próximo PR é que vai criar.
            ⚠ `truncate` + `title` DE PROPÓSITO: a frase muda de tamanho por aba e a largura da
            tela varia; sem ele, o texto quebraria para duas linhas abaixo de ~1000px e o
            cabeçalho cresceria justo onde há menos espaço — e a tabela de saldos tem teto FIXO
            em `calc(100vh - 230px)`, que não acompanha. Com ele o custo é 19,13px, sempre. */}
        {/* ⚠ `pb-0` E NÃO `pb-1` — PR-CONC-ABAS-FOLDER-04, e é ele que faz a aba virar PASTA.
          A peça toda já existia: a prateleira é o `shadow-[inset_0_-1px_0_...]` deste container,
          e a aba ativa já é `bg-card` + `rounded-t` + sombra interna em cima/esquerda/direita —
          três lados, sem o de baixo, que é o desenho de uma pasta aberta. O que faltava era ela
          ENCOSTAR: os 4px de `pb-1` deixavam a aba flutuando acima da hairline, e no vão aparecia
          a faixa azul separando a aba do conteúdo que ela deveria abrir.
          ⚠ COM `pb-0` A ABA ATIVA COBRE A HAIRLINE embaixo dela e emenda no branco do conteúdo;
          as inativas, sendo transparentes, deixam a linha passar por trás — pastas no fundo.
          Nenhum `z-index`, nenhuma borda nova: é o padding que faltava.
          ⚠ ELE SUPERSEDE O `pb-1` DE PR-CONC-HEADER-AJUSTES-02 (T3), e o respiro do seletor NÃO
          depende dele: aquele vem do `pt-2` no wrapper de cada aba com seletor, que fica. */}
      {/* ⚠ A FAIXA "mês · status · conta" SAIU DAQUI — PR-CONC-FAIXA-STATUS-03. Ela era o ÚLTIMO
            filho deste bloco colorido e só existia numa das cinco abas, o que fazia a Conciliação
            ser a única com cabeçalho mais alto: 136px contra 107px das outras.
            ⚠ E ISSO ERA UMA EXCEÇÃO NO COMPARTILHADO, não um detalhe de layout: este `div` é o
            cabeçalho de TODAS as abas, e um filho condicional a uma delas faz a régua comum
            depender de quem está aberto. A faixa desceu para o conteúdo da própria Conciliação,
            onde ela pode variar sem arrastar as outras quatro junto. */}
      </div>

      {/* PR-2.7.2 — Região de conteúdo: recebe o flex-1 real do app-shell; as branches
          (Importar/Enriquecer/Conciliação) vivem aqui. O cabeçalho/abas acima é shrink-0.
          Padding horizontal/inferior preservado (px-3 pb-3).
          ⚠ ELE NÃO GANHOU `pt-2` — PR-CONC-HEADER-AJUSTES-02. O respiro acima do seletor de conta
          era para as abas que TÊM seletor; este container é de TODAS, inclusive a Conciliação,
          cujos cards desceriam 8px sem ninguém ter pedido. O `pt-2` foi para o wrapper de cada
          aba com seletor — quatro lugares, nenhum compartilhado. */}
      <div className="px-3 pb-3 bg-card md:flex-1 md:min-h-0 md:flex md:flex-col md:min-w-0">

        {/* A Conciliação não espera os lançamentos do ano (PR-CONC-SALDO-UMA-REGUA-02): ela desenha o dono, e a lista do
            mês só alimenta os contadores do rodapé do Resumo e as pendências — que dizem "…" enquanto chegam. */}
        {loading && vistaExtrato !== 'conciliacao' && <div className="text-center text-xs text-muted-foreground py-8">Carregando...</div>}

        {/* ─── IMPORTAR BANCO — clone da aba "Importar Extrato" do Financas ────
            ⚠ O CONTEUDO LEGADO SAIU: era um texto explicando o que a propria
            tela mostra, mais um botao que repetia o do cabecalho. O que entra e'
            a linha do original — seletor de conta, o botao do arquivo, a frase e
            as acoes — e, ABAIXO dela, o card do mes com a LISTA COMPLETA
            (Situacao e Revisar inclusive). Duplicada la, duplicada aqui:
            fidelidade e' o criterio, e "otimizar" seria decidir pelo Gabriel.
            ⚠ A FRASE E VERDADEIRA AQUI TAMBEM, e isso foi medido antes de
            copia-la: o nosso importador e' o `ExtratoImportPreview` — o mesmo
            componente que o Financas cita como gabarito da tela dele —, e ele
            le' o arquivo no navegador e mostra a previa antes de gravar. */}
        {!loading && selectedCard && vistaExtrato === 'importar' && (
          <div className="space-y-2.5 pt-2 md:flex-1 md:min-h-0 md:overflow-y-auto">
            {/* ⚠ O FLUXO E O DO ORIGINAL, e nao so' a casca — correcao do B-24. O
                botao abre um `input file` ali mesmo, o arquivo e' lido no
                navegador e a previa nasce NESTA aba. O modal antigo nao e' mais
                chamado daqui; ele segue vivo nas telas velhas ate a rodada 2.
                ⚠ SEM `variant` no botao, como no original — e o botao daqui ja
                e' byte a byte o de la: o bloco `cva` do `button.tsx` e' IDENTICO
                nos dois repos, e o `variant` default resolve para `bg-cta`. A cor
                sai do TOKEN --cta de cada casa, nao do --primary (o --primary do
                Financas e' 205 88% 26%, azul escuro): la --cta e' verde-agua
                168 72% 40%, aqui e' ambar 43 87% 63%. E a divergencia e'
                deliberada dos dois lados — o proprio index.css do Financas
                registra "cta -> verde-agua (AGRO usa ambar 43 87% 63%)". O ambar
                nao e' desvio da portagem; e' a identidade desta casa, e cravar
                cor num botao so' seria inventar. (Medido em B-26.) */}
            <ImportarBancoInline
              contas={contas.map(c => ({ id: c.id, label: getContaLabel(c), tipo_conta: c.tipo_conta }))}
              contaId={selectedConta !== '__all__' ? selectedConta : ''}
              onContaChange={(id) => setSelectedConta(id || '__all__')}
              onImportado={() => { setRefreshExtrato(n => n + 1); queryClient.invalidateQueries({ queryKey: ['extrato-bancario-v2'] }); }}
            />

            {/* ⚠ A TABELA "Importações desta conta" SAIU DAQUI — PR-IMPORTAR-CORPO-01. Ela
                respondia à mesma pergunta do "Ver importações (N)" do painel abaixo, e o modal
                responde melhor: ele filtra pelo MÊS que os movimentos cobrem e esconde as
                canceladas. A tabela listava a conta inteira, então agosto e setembro apareciam
                juntos na tela de agosto.
                ⚠ E COM ELA MORRE O SEGUNDO "DESFAZER", que é o motivo real de ela sair: havia
                duas telas desfazendo importação, com listas diferentes, e desfazer numa não
                atualizava a outra. Agora o desfazer tem UMA fonte — o modal.
                ⚠ O COMPONENTE `ImportacoesDaConta` CONTINUA EXISTINDO: só deixou de ser montado
                aqui. Quem o quiser de volta monta; quem for apagá-lo abre frente própria. */}
            <PainelExtratoMes
              key={refreshExtrato}
              clienteId={clienteAtual?.id ?? null}
              contaId={selectedConta !== '__all__' ? selectedConta : null}
              ano={Number(ano)} mes={Number(selectedMes)}
              contaNome={contaAtual}
              aoMudar={() => { setRefreshExtrato(n => n + 1); }}
            />

          </div>
        )}

        {/* ─── EXTRATO GERENCIAL — a tela que ja existia, transferida ─────────
            ⚠ TRANSFERIR, NAO RECRIAR: e' o mesmo componente do menu lateral,
            montado aqui com o ano/mes do CABECALHO desta tela. O item do menu
            continua vivo ate a homologacao — nada morre antes dela.
            ⚠ `periodo` CONTROLADO — correcao do B-25. Com `initialAno`/`initialMes`
            a aba SEMEAVA estado proprio e depois ignorava o cabecalho: `useState`
            le' o valor uma unica vez, no primeiro render. Somado aos selects de Mes
            e Ano que ela tinha no corpo, o dado ganhava dois donos e o de dentro
            vencia — regua marcando Mai e extrato mostrando Jun (print de 15:39).
            Passando `periodo`, esta tela e' a dona: os selects nao sao renderizados
            e trocar o mes na regua chega na aba no mesmo render. */}
        {/* ⚠ CASAR LANÇAMENTOS — PR-CONCILIACAO-5-ABAS-01 (renomeada em 30/09). O Espelho na sub-aba Conferência, com os
            candidatos casáveis: o extrato atualiza o programado/previsto que já está no sistema.
            ⚠ PAI EM COLUNA FLEX SEM ROLAGEM, no molde do Enriquecer: a mesa tem rolagem própria, e
            um pai com `overflow-y-auto` daria duas barras. Sem conta, o componente pede a escolha. */}
        {!loading && selectedCard && vistaExtrato === 'enriquecer_sistema' && (
          <div className="pt-2 md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden">
            {/* ⚠ AS AÇÕES DO MÊS VIERAM DA ABA IMPORTAR — PR-CONCILIACAO-PASSOS-01. "Conciliar o
                mês" e "Ver o mês" CONCILIAM, e conciliar é o passo 2; elas moravam no cabeçalho
                do painel de importação, onde o operador entrava para conferir se o arquivo tinha
                chegado completo. A tela ensinava o passo errado, e quem explicava o próprio fluxo
                se perdia no meio.
                ⚠ O "Fecho do mês (só realizados)" SAIU — PR-SISTEMA-BARRA-COMPACTA-01, decisão
                do Gabriel: "não faz sentido duas telas iguais; se preciso a gente arruma isso na
                tabela que já tem". Ele abria em modal o MESMO componente desta aba.
                ⚠ E COM ELE SE PERDE UMA CAPACIDADE, que fica registrada: era a única forma de ver
                a Conferência SÓ com realizados (`mostrarCandidatos={false}`), sem os previstos e
                programados no meio da mesa. Medido antes de remover — `mostrarCandidatos` só é
                lido pela `AbaConferencia`; as outras três visões nunca dependeram dele. Se fizer
                falta, a saída é um interruptor dentro da própria Conferência, não um segundo modal.
                ⚠ `EspelhoOfxSistemaModal` FICA SEM CONSUMIDOR e NÃO foi apagado: quem o quiser de
                volta monta; quem for apagá-lo abre frente própria. */}
            {/* P159a (mock `mock-extrato-banco-v1.html`, Gabriel 28/10): UMA LINHA SÓ — conta · ⇄ Transferências · Criar em lote ·
                Conciliar unitário e, à direita, as quatro sub-abas no `Segmentado`. Nada quebra em duas linhas (`flex-nowrap`, e o
                segmentado é `whitespace-nowrap`); abaixo da largura, a linha rola no lugar dela, nunca empilha. */}
            <div className="mb-2 flex flex-nowrap items-center gap-2 overflow-x-auto" data-testid="barra-casar">
              {/* ⚠ O SELETOR DE CONTA — PR-SISTEMA-SELETOR-CONTA-01: o MESMO componente da aba Importar (`ContaBancariaSelect`, o seletor
                  da casa, com busca). A fonte da verdade continua sendo `selectedConta`.
                  ⚠ P159a — "__none__" NO GATILHO era defeito: o valor ia como '__none__', que não é opção nenhuma, e o seletor
                  mostrava a string crua. Sem conta escolhida ("Todas"), o valor vai VAZIO e o gatilho diz "Escolha a conta".
                  ⚠ P159a D10 (Gabriel 28/10): nome maior que os 200px termina em "…" com o nome inteiro no `title` — a exceção declarada do
                  P71 (`data-reticencias-com-title`, como a Fazenda da VG e o `FavorecidoSelect`). */}
              <div className="w-[200px] shrink-0" title={selectedConta !== '__all__' ? contaAtual : undefined} data-reticencias-com-title="">
                <ContaBancariaSelect
                  value={selectedConta !== '__all__' ? selectedConta : ''}
                  onValueChange={v => setSelectedConta(v ? v : '__all__')}
                  contas={contas.map(c => ({
                    id: c.id, nome_conta: getContaLabel(c), nome_exibicao: null, tipo_conta: c.tipo_conta ?? null,
                  }))}
                  placeholder="Escolha a conta"
                  className="h-7 text-xs"
                />
              </div>
              <AcoesDoMes curto
                clienteId={clienteId ?? null}
                contaId={selectedConta === '__all__' ? null : selectedConta}
                contaNome={contaAtual}
                ano={Number(ano)} mes={Number(selectedMes)}
                aoMudar={() => { setRefreshExtrato(n => n + 1); }}
              />

              {/* ⚠ AS QUATRO SUB-ABAS MORAM NESTA LINHA — PR-SISTEMA-BARRA-COMPACTA-01 (dentro do corpo custavam 23px de Mesa). O estado
                  é que subiu (`aba` + `onAbaChange`), sem portal. P159a: o `Segmentado` da casa (seleção em navy), à direita. */}
              <Segmentado className="ml-auto" altura={22} valor={abaEspelho} onEscolher={setAbaEspelho}
                opcoes={ABAS_ESPELHO.map(a => ({ valor: a.key, rotulo: a.label }))} />
            </div>
            {/* ⚠ AS QUATRO VISÕES VIERAM PARA A ABA — PR-SISTEMA-SUBABAS-01, e o que mudou foi
                UMA prop: `soConferencia` saiu. Ela escondia a fileira das quatro visões, e era só
                por causa dela que o operador precisava abrir um modal para vê-las.
                ⚠ A FILEIRA MUDOU DE LUGAR DEPOIS — PR-SISTEMA-BARRA-COMPACTA-01: ela é desenhada
                na barra acima, e a sub-aba aberta chega por prop.
                ⚠ `mostrarCandidatos` FICA: a Conferência desta aba é a mesa de casar o extrato
                com o previsto/programado, e é o que separa esta montagem da do modal.
                ⚠ A INICIAL PASSOU A SER "Extrato (banco)" — PR-CONC-CONFERENCIA-MODAL-01: a
                Conferência abre num modal largo por cima da sub-aba que estava aberta, e fechar
                volta para ela. */}
            <EspelhoConciliacaoTab clienteId={clienteId ?? null}
              contaId={selectedConta === '__all__' ? null : selectedConta}
              ano={String(ano)} mes={selectedMes} mostrarCandidatos
              aba={abaEspelho} onAbaChange={setAbaEspelho}
              diaFoco={diaFoco} onDiaFocado={() => setDiaFoco(null)}
              /* P159b — a Evolução do saldo: "ver o dia na Conferência" sem `onVerDiaNaConferencia` (o `irParaConferencia` saiu no
                 P166): o próprio Espelho abre a Conferência no dia, pelo `onAbaChange` daqui (a mesma conta, a mesma vista). */ />
          </div>
        )}

        {!loading && selectedCard && vistaExtrato === 'gerencial' && (
          <div className="pt-2 md:flex-1 md:min-h-0 md:overflow-y-auto">
            <ExtratoGerencialTab periodo={{ ano: Number(ano), mes: Number(selectedMes) }} />
          </div>
        )}

        {/* ⚠ SEM O GATE DE `loading` — [ENRIQUECER-DEPARA-ESTADO-01] (133b-b) regra 3, e é
            perda de trabalho, não cosmética. `loadData` faz `setLoading(true)` e é
            redisparada por `inscreverEmLancamentos`: a cada notificação de que os
            lançamentos mudaram, esta aba DESMONTAVA — levando junto o arquivo lido e o
            de-para inteiro, meia hora de escolhas, para redesenhar um número.
            ⚠ E ELA NÃO DEPENDE DE `lancamentos`: o de-para é trabalho sobre o ARQUIVO, no
            navegador. As outras três abas continuam com o gate porque leem o mês.
            ⚠ `selectedCard` SOBREVIVE À RECARGA: `buildMonthCards` devolve os doze meses
            sempre, mesmo com `lancamentos` vazio — conferido antes de tirar o `loading`,
            porque tirar um dos dois guardas de nada adiantaria se o outro caísse junto. */}
        {selectedCard && vistaExtrato === 'enriquecer' && (
          /* ⚠ ESTE DIV ERA O SCROLLPORT DA PÁGINA — 133h item 4, e era ELE que tirava o
             cabeçalho, os cards e a toolbar da tela. O `EnriquecerTresPassos` já nasce
             `flex-1 min-h-0` esperando um pai com altura; num pai que só rola, `flex-1` não
             tem contra o que medir, tudo cresce e quem rola é a página inteira. Trocar
             `overflow-y-auto` por uma coluna flex sem rolagem devolve a altura ao filho, e a
             rolagem volta para dentro das listas — que é onde o A21 a quer.
             ⚠ FIXAR CABEÇALHO É PÔR A ROLAGEM NO NÍVEL CERTO, não acrescentar `sticky`: um
             `sticky` aqui ancoraria neste scrollport e subiria junto com ele. */
          <div className="space-y-2 pt-2 md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden">
            {/* ⚠ OS DOIS CAMINHOS VIRARAM UM — 133b, e a decisão de produto veio no
                envelope. O B-22a deixou a planilha AO LADO da Mesa justamente por não
                ter recebido essa decisão; o custo medido foi o operador não saber qual
                usar e os dois blocos responderem à mesma pergunta com números diferentes
                (379 × 183 para a mesma planilha de 492 linhas). */}
            <EnriquecerPorPlanilha
              contaNome={contaAtual}
              ano={Number(ano)} mes={Number(selectedMes)}
              /* ⚠ O MESMO DESTINO DO "↗ Lançamentos" do topo — 131. Reusar a prop que já
                 existe é o que garante que os dois cheguem ao mesmo lugar; uma rota
                 própria aqui divergiria da outra no primeiro ajuste. */
              onVerNoFinanceiro={onNavigateToLancamentos
                ? () => onNavigateToLancamentos(ano, Number(selectedMes)) : undefined}
              clienteNome={clienteAtual?.nome ?? undefined}
            />
            {/* ⚠ A MESA NÃO É MAIS UM SEGUNDO BLOCO — 133b. Ela virou o PASSO 2 de
                `EnriquecerPorPlanilha`; montá-la aqui de novo poria duas instâncias da
                mesma sessão na mesma tela, cada uma com o seu filtro. */}
            {/* PR-CLEANUP-MESA-CLASSIFICACAO-01 — o link para a Mesa de Classificação antiga
                foi removido junto com o item de menu e a rota. A tela legada saiu de circulação;
                o motor (staging + vw_classificacao_staging_preview + fn_classificacao_*) segue
                intacto e continua sendo a fonte deste Enriquecimento. */}
          </div>
        )}

        {/* O resumo do dono ainda não respondeu, ou falhou: a frase fica no lugar do conteúdo, nunca em toast. */}
        {vistaExtrato === 'conciliacao' && !resumo && (
          <div className="py-8 text-center text-xs text-muted-foreground" data-testid="resumo-estado">
            {resumoQ.error ? `Não foi possível ler o resumo do mês: ${resumoQ.error instanceof Error ? resumoQ.error.message : String(resumoQ.error)}` : 'Carregando o resumo do mês…'}
          </div>
        )}
        {resumo && vistaExtrato === 'conciliacao' && (
          <div className="space-y-2 md:flex-1 md:min-h-0 md:overflow-y-auto">
            {/* ⚠ A LINHA DO MÊS: "Out/2026 · Todas as contas". P166 (CONC-TELA-02): o selo do status saiu daqui — o status é a FAIXA
                logo abaixo, em toda a largura (no lugar do card Status). `px-3` alinha com os blocos; 12px/medium é o RÓTULO da linha. */}
            <div className="flex items-center gap-2 px-3 pt-1.5">
              <span className="text-[12px] font-medium">{selectedCard.label}/{ano}</span>
              <span className="text-[10px] text-muted-foreground" aria-hidden>·</span>
              {/* ⚠ O `text-[#185FA5]` É HEX SOLTO e fica ANOTADO, não corrigido: trocá-lo por token é frente própria. */}
              <span className="text-[12px] font-medium text-[#185FA5]">{contaAtual}</span>
            </div>
            <FaixaDoMes mes={`${selectedCard.label}/${ano}`} linha={linhaSel ?? null} semClassificacao={semClassificacaoSel}
              onCorrigir={() => setSemClassificacaoDe({ contaId: selectedConta === '__all__' ? null : selectedConta })}
              duplicados={diagPendencias.duplicadosCount} onDuplicados={() => setShowPendencias(true)} />

            {/* ════ 2 BLOCOS: [Saldos por conta] [Resumo do mês] — P166 (CONC-TELA-02, mock aprovado 28/10). Era Saldos | Resumo | Status
                (P141, 3.05fr 1.7fr 0.7fr); o Status virou a faixa acima. Os dois blocos vão até o fim da janela (`useAlturaAteOFim`): a
                altura nunca depende do número de contas e só a tabela de cada um rola. Os cabeçalhos têm a MESMA altura (26px) e o das
                colunas também (22px): a 1ª linha do Resumo (Saldo inicial) fica na altura do Total. ════ */}
            <div ref={refBlocos} className="grid gap-2 px-3" style={{gridTemplateColumns:'minmax(0,1fr) 260px', height:alturaBlocos}}
                 data-testid="blocos-conciliacao">

              {/* ── Saldos por conta ── */}
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card" data-testid="card-saldos">
                <div className="flex h-[26px] shrink-0 items-center justify-between bg-primary px-3 text-primary-foreground">
                  <span className="text-[10px] font-medium">Saldos por conta</span>
                  <div className="flex items-center gap-2">
                    {/* ⚠ LUGAR RESERVADO (UI-BOTOES-LUGAR-FIXO-01): o "← Todas" so' existe com conta escolhida, e o lugar dele
                        existe sempre — o "+ Cadastrar" nao anda. */}
                    <span className="inline-flex w-[52px] shrink-0 justify-end" data-testid="lugar-todas">
                      {selectedConta !== '__all__' && (
                        <button onClick={() => setSelectedConta('__all__')}
                          className="text-[9.5px] text-primary-foreground border border-primary-foreground/40 rounded px-1.5 py-0.5 bg-transparent hover:bg-primary-foreground/10 cursor-pointer whitespace-nowrap">
                          ← Todas
                        </button>
                      )}
                    </span>
                    {fechamentoSemMovimento.fechar.length > 0 && canEditSaldoFinal(anoMesSel) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleFecharSemMovimento}
                        disabled={fechandoSemMovimento}
                        className="h-5 text-[9.5px] px-2 text-primary-foreground border border-primary-foreground/40 rounded bg-transparent hover:bg-primary-foreground/10 hover:text-primary-foreground"
                      >
                        {fechandoSemMovimento ? 'Fechando...' : 'Fechar contas sem movimento'}
                      </Button>
                    )}
                    <button
                      onClick={() => {
                        const cId = selectedConta !== '__all__' ? selectedConta : (contas[0]?.id || '');
                        if (cId) handleEditSaldo(anoMesSel, cId, 0);
                      }}
                      className="text-[9.5px] text-primary-foreground border border-primary-foreground/40 rounded px-1.5 py-0.5 bg-transparent hover:bg-primary-foreground/10 cursor-pointer flex items-center gap-0.5">
                      <Plus className="h-2.5 w-2.5" /> Cadastrar
                    </button>
                  </div>
                </div>

                {/* ⚠ SÓ A TABELA ROLA (P166): o cabeçalho do card fica fora do rolador; o das colunas e o Total grudam no topo dele. */}
                <div className="min-h-0 flex-1 overflow-y-auto" data-testid="rolagem-saldos">
                {/* ⚠ `table-layout: FIXED` COM COLGROUP EM px — CONC-SALDOS-LAYOUT-02. As colunas da direita tem px medidos no pior
                    texto (`REGUA_SALDOS`) e a Conta e' a unica que estica; o nome corta numa linha so' quando nao cabe (inteiro no
                    `title` da linha) — de 1024px para cima, com os 260px do Resumo, o nome real cabe inteiro (P166). */}
                <table className="w-full border-collapse" style={{fontSize:'10px', tableLayout:'fixed'}}>
                  <colgroup>
                    <col />
                    {REGUA_SALDOS.map((w, i) => <col key={i} style={{width:`${w}px`}} />)}
                  </colgroup>
                  {/* O Total mora no `thead`: gruda junto com o cabeçalho das colunas no topo do rolador. A borda inferior é sombra
                      interna nas células — com `border-collapse` a borda da tabela não viaja com o sticky. */}
                  <thead ref={refThead} className="sticky top-0 z-[9] bg-card">
                    {/* ⚠ O CABEÇALHO DAS COLUNAS É NAVY, UM DEGRAU MAIS CLARO QUE A BARRA DO CARD — PR-CONC-SALDOS-LAYOUT-01: fundo
                        OPACO em duas camadas; a régua da casa (22px, 9,5/500). Cada célula leva 1px de navy para cada lado (a emenda
                        de subpixel, ver `TH_SALDOS`). */}
                    <tr className="bg-primary bg-[linear-gradient(hsl(var(--primary-foreground)/0.10),hsl(var(--primary-foreground)/0.10))]">
                      <th className={`${TH_SALDOS} pl-2 pr-2 text-left truncate`} title="Conta">Conta</th>
                      {/* P141 — Data e Arquivos sem rótulo, como no mock: o "30/09" e os selos OFX/PDF se explicam sozinhos */}
                      <th className={TH_SALDOS} aria-label="Data do saldo do extrato" />
                      <th className={TH_SALDOS} aria-label="Arquivos do extrato" />
                      <th className={`${TH_SALDOS} px-1 text-right`}>Sistema</th>
                      <th className={`${TH_SALDOS} px-1 text-right`}>Extrato</th>
                      <th className={`${TH_SALDOS_DIF} px-1 text-right`}>Diferença</th>
                      <th className={TH_SALDOS} />
                    </tr>
                    {/* ⚠ O TOTAL E' UMA FAIXA NAVY ESCURA, TEXTO BRANCO — CONC-SALDOS-LAYOUT-02. Negativo e "confere" nos dois tons
                        claros (`TOM_NO_NAVY`). Com conta que pesa sem saldo, a frase ocupa Extrato + Diferença JUNTAS. */}
                    <tr
                      className="cursor-pointer bg-[hsl(213_52%_16%)]"
                      onClick={() => setSelectedConta('__all__')}
                      data-testid="linha-total"
                    >
                      <td className={`${TD_TOTAL} pl-2 pr-1 text-left truncate`} title="Total · todas as contas">Total</td>
                      <td className={TD_TOTAL} /><td className={TD_TOTAL} />
                      {/* O Total é a linha 'total' do dono. */}
                      <td className={`${TD_TOTAL} px-1 text-right tabular-nums whitespace-nowrap ${corNoNavy(linhaTotal?.saldo_sistema)}`} data-testid="total-sistema">{linhaTotal?.saldo_sistema != null ? valorDaRegua(linhaTotal.saldo_sistema) : '—'}</td>
                      {faltaSaldoTotal ? (
                        <td colSpan={2} className={`${TD_TOTAL} px-1 text-right whitespace-nowrap`} data-testid="total-diferenca">
                          <FaltaSaldo frase={faltaSaldoTotal} testId="total-falta-saldo" tom="navy" />
                        </td>
                      ) : (<>
                        <td className={`${TD_TOTAL} px-1 text-right tabular-nums whitespace-nowrap ${corNoNavy(linhaTotal?.saldo_extrato)}`} data-testid="total-extrato">{linhaTotal?.saldo_extrato != null ? valorDaRegua(linhaTotal.saldo_extrato) : '—'}</td>
                        <td className={`${TD_TOTAL_DIF} px-1 text-right tabular-nums whitespace-nowrap ${linhaTotal?.diferenca == null ? 'text-white/60' : saldoConfere(linhaTotal.diferenca) || linhaTotal.diferenca > 0 ? TOM_NO_NAVY.ok : TOM_NO_NAVY.neg}`} data-testid="total-diferenca">
                          {linhaTotal?.diferenca == null ? '—' : saldoConfere(linhaTotal.diferenca) ? 'confere' : valorDaRegua(linhaTotal.diferenca)}
                        </td>
                      </>)}
                      <td className={TD_TOTAL} />
                    </tr>
                  </thead>
                  {/* ⚠ UM <tbody> POR GRUPO, e a FAIXA DE GRUPO GRUDA ABAIXO DO TOTAL — PR-CONCILIA-GRUPOS-STICKY-02: sticky nas
                      CÉLULAS (z-[8], abaixo do thead z-[9]), fundo OPACO; o `top` é a altura MEDIDA do thead. A faixa do grupo
                      seguinte chega ao mesmo `top` e COBRE a anterior (opacas e da mesma altura: a troca é limpa). */}
                  {gruposSaldos.map(g => (
                    <tbody key={g.chave}>
                      {/* ⚠ P166: o rótulo do grupo como o cadastro o escreve (1ª letra maiúscula), 10px negrito; valores 10px negrito.
                          "falta saldo" ocupa Extrato + Diferença juntas, em âmbar. */}
                      {(() => {
                        const topo = {top:`${alturaThead}px`};
                        const falta = fraseFaltaSaldo(g.subtotal);
                        return (
                      <tr>
                        <td style={topo} className={`${TD_GRUPO} pl-2 pr-1 text-left font-bold text-primary truncate`} title={g.rotulo} data-testid="faixa-grupo">{g.rotulo}</td>
                        <td style={topo} className={TD_GRUPO} /><td style={topo} className={TD_GRUPO} />
                        <td style={topo} className={`${TD_GRUPO} px-1 text-right font-bold tabular-nums whitespace-nowrap ${corDoValor(g.subtotal?.saldo_sistema) || 'text-primary'}`}>{g.subtotal?.saldo_sistema != null ? valorDaRegua(g.subtotal.saldo_sistema) : '—'}</td>
                        {falta ? (
                          <td style={topo} colSpan={2} className={`${TD_GRUPO} px-1 text-right whitespace-nowrap`}>
                            <FaltaSaldo frase={falta} testId={`subtotal-falta-saldo-${g.chave}`} tom="grupo" />
                          </td>
                        ) : (<>
                          <td style={topo} className={`${TD_GRUPO} px-1 text-right font-bold tabular-nums whitespace-nowrap ${corDoValor(g.subtotal?.saldo_extrato) || 'text-primary'}`} data-testid="subtotal-extrato">{g.subtotal?.saldo_extrato == null ? '—' : valorDaRegua(g.subtotal.saldo_extrato)}</td>
                          <td style={topo} className={`${TD_GRUPO_DIF} px-1 text-right font-bold tabular-nums whitespace-nowrap ${g.subtotal?.diferenca == null?'text-muted-foreground':saldoConfere(g.subtotal.diferenca)||g.subtotal.diferenca>0?'text-success':'text-destructive'}`}>
                            {g.subtotal?.diferenca == null ? '—' : saldoConfere(g.subtotal.diferenca) ? 'confere' : valorDaRegua(g.subtotal.diferenca)}
                          </td>
                        </>)}
                        <td style={topo} className={TD_GRUPO} />
                      </tr>
                        );
                      })()}
                      {g.contas.map(s=>(
                      <SaldoContaRow key={s.conta.id} data={s}
                        isActive={selectedConta===s.conta.id}
                        isDimmed={selectedConta!=='__all__'&&selectedConta!==s.conta.id}
                        onClick={()=>setSelectedConta(s.conta.id)}
                        onEdit={()=>handleEditSaldo(anoMesSel,s.conta.id,saldosDaLinha(s.linha).saldo_extrato)}
                        canEdit={canEditSaldoFinal(anoMesSel)}
                        showSaldoAlert={anoMesSel === s.conta.mes_inicio && s.conta.saldo_inicial_oficial === null}
                        estadoOfx={estadoDoSlotOfx({
                          comSaldoNoMes: contasComOfx.get(anoMesSel)?.has(s.conta.id) ?? false,
                          importaOfx: contasQueImportamOfx.has(s.conta.id),
                          temExtratoNoMes: s.linha.tem_extrato,
                        })}
                        temPdf={contasComPdf.get(anoMesSel)?.has(s.conta.id) ?? false}
                        onClassificar={() => setSemClassificacaoDe({ contaId: s.conta.id })}
                        onExtratoSistema={() => setExtratoSistemaDe(s.conta.id)} />
                      ))}
                    </tbody>
                  ))}
                  {/* As ocultas — só exibição, estado local, não persiste. P166: a última linha DA TABELA (era rodapé fora dela). */}
                  {qtdOcultas > 0 && (
                    <tbody>
                      <tr>
                        <td colSpan={7} className={`${TD_CONTA_NUM} pl-2 text-muted-foreground truncate`} data-testid="linha-ocultas"
                          title={`${qtdOcultas} ${qtdOcultas === 1 ? 'conta sem saldo e sem movimento oculta' : 'contas sem saldo e sem movimento ocultas'}`}>
                          {qtdOcultas} {qtdOcultas === 1 ? 'conta sem saldo e sem movimento oculta' : 'contas sem saldo e sem movimento ocultas'}
                          {' · '}
                          <button type="button" className="text-primary hover:underline cursor-pointer"
                            onClick={() => setMostrarOcultas(v => !v)}>
                            {mostrarOcultas ? 'ocultar' : 'mostrar'}
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  )}
                </table>
                </div>
              </div>

              {/* ── Resumo do mês ── P166: no MESMO desenho do Saldos por conta (cabeçalho do card 26px, das colunas 22px, linhas de 19px):
                  Saldo inicial e Saldo no sistema na faixa navy do Total; Entradas, Saídas e Saldo do extrato como os grupos; a
                  Diferença com a faixa cinza da coluna Diferença. ⚠ TUDO DA LINHA DO DONO — PR-CONC-SALDO-UMA-REGUA-02 (D1): a conta
                  aberta, ou o total no Todas. Nulo é "—", nunca zero. As saídas vêm com o sinal do dono (negativas, em vermelho). */}
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card" data-testid="card-resumo">
                <div className="flex h-[26px] shrink-0 items-center bg-primary px-3 text-primary-foreground">
                  <span className="text-[10px] font-medium whitespace-nowrap">Resumo do mês</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto" data-testid="rolagem-resumo">
                <table className="w-full border-collapse" style={{fontSize:'10px', tableLayout:'fixed'}}>
                  <colgroup><col /><col style={{width:`${LARGURA_VALOR_RESUMO}px`}} /></colgroup>
                  <thead className="sticky top-0 z-[9] bg-card">
                    <tr className="bg-primary bg-[linear-gradient(hsl(var(--primary-foreground)/0.10),hsl(var(--primary-foreground)/0.10))]">
                      <th className={`${TH_SALDOS} pl-2 pr-2 text-left`}>Movimento</th>
                      <th className={`${TH_SALDOS} px-1 text-right`}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className={`${TD_TOTAL} pl-2 pr-1 text-left truncate`}>Saldo inicial</td>
                      <td className={`${TD_TOTAL} px-1 text-right tabular-nums whitespace-nowrap ${corNoNavy(saldosSel.saldo_inicial)}`} data-testid="resumo-saldo-inicial">
                        {saldosSel.saldo_inicial != null ? valorDaRegua(saldosSel.saldo_inicial) : '—'}
                      </td>
                    </tr>
                    <tr>
                      <td className={`${TD_GRUPO_RESUMO} pl-2 pr-1 text-left font-bold text-primary truncate`}>Entradas</td>
                      <td className={`${TD_GRUPO_RESUMO} px-1 text-right font-bold text-success tabular-nums whitespace-nowrap`} data-testid="resumo-entradas">{linhaSel ? valorDaRegua(saldosSel.entradas) : '—'}</td>
                    </tr>
                    <LinhaAbertura rotulo="↳ terceiros" valor={linhaSel ? valorDaRegua(saldosSel.entradas_terceiros) : '—'} />
                    <LinhaAbertura rotulo="↳ transferências" valor={linhaSel ? valorDaRegua(saldosSel.entradas_transferencias) : '—'} />
                    {retido && (
                      <tr title={retido.titulo} data-testid="resumo-retido">
                        <td colSpan={2} className={`${TD_CONTA_NUM} pl-4 pr-1 text-muted-foreground truncate ${LINHA_DA_CONTA}`}>↳ {retido.texto}</td>
                      </tr>
                    )}
                    <tr>
                      <td className={`${TD_GRUPO_RESUMO} pl-2 pr-1 text-left font-bold text-primary truncate`}>Saídas</td>
                      <td className={`${TD_GRUPO_RESUMO} px-1 text-right font-bold text-destructive tabular-nums whitespace-nowrap`} data-testid="resumo-saidas">{linhaSel ? valorDaRegua(saldosSel.saidas) : '—'}</td>
                    </tr>
                    <LinhaAbertura rotulo="↳ terceiros" valor={linhaSel ? valorDaRegua(saldosSel.saidas_terceiros) : '—'} />
                    <LinhaAbertura rotulo="↳ transferências" valor={linhaSel ? valorDaRegua(saldosSel.saidas_transferencias) : '—'} />
                    {semConta && (
                      <tr title={semConta.titulo} data-testid="resumo-sem-conta">
                        <td colSpan={2} className={`${TD_CONTA_NUM} pl-2 pr-1 text-warning truncate ${LINHA_DA_CONTA}`}>{semConta.texto}</td>
                      </tr>
                    )}
                    <tr>
                      <td className={`${TD_TOTAL} pl-2 pr-1 text-left truncate`}>Saldo no sistema</td>
                      <td className={`${TD_TOTAL} px-1 text-right tabular-nums whitespace-nowrap ${corNoNavy(saldosSel.saldo_sistema)}`} data-testid="resumo-saldo-sistema">
                        {saldosSel.saldo_sistema != null ? valorDaRegua(saldosSel.saldo_sistema) : '—'}
                      </td>
                    </tr>
                    {/* ⚠ A DATA DO SALDO DO EXTRATO É A DO DONO (`saldo_extrato_data`); sem ela, o rótulo não afirma data nenhuma. */}
                    <tr>
                      <td className={`${TD_GRUPO_RESUMO} pl-2 pr-1 text-left font-bold text-primary truncate`}
                        title={posicaoDoCard ? `Saldo do extrato (${posicaoDoCard})` : 'Saldo do extrato'}>
                        Saldo do extrato {posicaoDoCard && <span className="font-normal text-muted-foreground">({posicaoDoCard})</span>}
                      </td>
                      <td className={`${TD_GRUPO_RESUMO} px-1 text-right font-bold tabular-nums whitespace-nowrap ${corDoValor(saldosSel.saldo_extrato) || 'text-primary'}`} data-testid="resumo-saldo-extrato">
                        {saldosSel.saldo_extrato != null ? valorDaRegua(saldosSel.saldo_extrato) : '—'}
                      </td>
                    </tr>
                    {/* Diferença — sem extrato é "—": ausência nunca aparenta "confere". A faixa cinza é a da coluna Diferença. */}
                    <tr>
                      <td className={`${TD_CONTA} pl-2 pr-1 text-left font-bold truncate ${LINHA_DA_CONTA}`}>Diferença</td>
                      <td className={`${TD_CONTA} bg-muted px-1 text-right font-bold tabular-nums whitespace-nowrap ${LINHA_DA_CONTA} ${difResumo === null ? 'text-muted-foreground' : difResumoConfere ? 'text-success' : 'text-destructive'}`} data-testid="resumo-diferenca">
                        {faltaSaldoSel ? <FaltaSaldo frase={faltaSaldoSel} testId="resumo-falta-saldo" />
                          : difResumo === null ? '—' : difResumoConfere ? 'confere' : valorDaRegua(difResumo)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                  {/* ⚠ A POSIÇÃO É DO DONO (D5): `posicao` só existe com o saldo declarado ANTES do fim do mês, e traz quantos
                      realizados vieram depois dela. A posição no meio do mês é declaração TEMPORÁRIA: sem esta linha o operador
                      fecharia o mês achando que conferiu o mês inteiro. */}
                  {avisoAposPosicao > 0 && (
                    <div className="mx-2 mt-1 rounded bg-destructive/5 px-2 py-1 text-[9.5px] leading-snug text-destructive" data-testid="resumo-realizados-apos">
                      {avisoAposPosicao} realizado{avisoAposPosicao === 1 ? '' : 's'} após {ddmmPosicao} não
                      conferido{avisoAposPosicao === 1 ? '' : 's'} — informe o saldo de uma data mais recente
                      para o mês fechar.
                    </div>
                  )}
                  {/* A frase de rodapé: qual data o saldo do extrato usou. */}
                  {saldosSel.saldo_extrato != null && (posicaoDono || posicaoDoCard) && (
                    <div className="px-2 pt-1 text-[9.5px] leading-snug text-muted-foreground" data-testid="resumo-rodape"
                      title={posicaoDono && difNaPosicao.indisponivel ? TITULO_DIFERENCA_NA_POSICAO_INDISPONIVEL : undefined}>
                      {posicaoDono
                        ? `Posição declarada em ${ddmmPosicao}: na data, a diferença é ${difNaPosicao.valor != null ? formatMoeda(difNaPosicao.valor) : '—'}.`
                        : `A diferença compara o saldo do extrato de ${posicaoDoCard}.`}
                    </div>
                  )}
                </div>
              {/* Os lançamentos do mês — embaixo do Resumo, fora do rolador (sempre à vista). */}
              <div className="flex shrink-0 flex-wrap items-center gap-1 border-t px-2 py-1.5" data-testid="chips-resumo">
                <button onClick={()=>{setFiltroModal('todos');setShowLancModal(true);}}
                  className="px-2 py-0.5 rounded text-[9.5px] font-medium bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer">
                  Todos ({loading ? '…' : selectedCard.lancamentos.length})
                </button>
                <button onClick={()=>{setFiltroModal('entradas');setShowLancModal(true);}}
                  className="px-2 py-0.5 rounded text-[9.5px] font-medium bg-success/10 text-success hover:bg-success/20 cursor-pointer">
                  Entradas ({loading ? '…' : entradas.length})
                </button>
                <button onClick={()=>{setFiltroModal('saidas');setShowLancModal(true);}}
                  className="px-2 py-0.5 rounded text-[9.5px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 cursor-pointer">
                  Saídas ({loading ? '…' : saidas.length})
                </button>
                {transfEntrada.length > 0 && (
                  <button onClick={()=>{setFiltroModal('transf_entrada');setShowLancModal(true);}}
                    className="px-2 py-0.5 rounded text-[9.5px] font-medium border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 cursor-pointer">
                    Transf. entrada ({transfEntrada.length})
                  </button>
                )}
                {transfSaida.length > 0 && (
                  <button onClick={()=>{setFiltroModal('transf_saida');setShowLancModal(true);}}
                    className="px-2 py-0.5 rounded text-[9.5px] font-medium border border-warning/30 bg-warning/10 text-warning-foreground hover:bg-warning/20 cursor-pointer">
                    Transf. saída ({transfSaida.length})
                  </button>
                )}
              </div>
            </div>
            </div>

            {/* ⚠ A LISTA ANTIGA SAIU — PR-CONCILIACAO-CARDS-01a. Aqui era montado o
                `ExtratoListaTab`, um segundo lugar dizendo o estado do mês, com contagens
                e soma próprias. Criar de OFX órfão e conciliar por linha vivem no Espelho
                e na EstacaoConciliar; criar em lote e a prévia de rematch viraram frentes
                ([CONCIL-CRIAR-DE-ORFAO], [REMATCH-PREVIA]). */}
          </div>
        )}
      </div>

      <EspelhoOfxSistemaModal
        open={espelhoAberto}
        onClose={() => setEspelhoAberto(false)}
        clienteId={clienteId ?? null}
        contaId={selectedConta === '__all__' ? null : selectedConta}
        ano={ano}
        mes={selectedMes}
        nomeConta={contaAtual}
      />

      {/* ════ LANÇAMENTOS MODAL ════ */}
      <Dialog open={showLancModal} onOpenChange={setShowLancModal}>
        <DialogContent className="max-w-4xl p-0 gap-0 flex flex-col" style={{height:'82vh', maxHeight:'82vh'}}>
          <div className="px-4 py-3 border-b flex items-center gap-2 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={()=>setShowLancModal(false)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium flex-1 min-w-0 truncate">
              Lançamentos — {selectedCard?.label}/{ano} — {contaAtual}
            </span>
            <div className="flex gap-1 flex-shrink-0 flex-wrap">
              {sumModal.ent > 0 && <span className="text-[10px] bg-success/15 text-success px-2 py-0.5 rounded-full tabular-nums">+ {formatMoeda(sumModal.ent)}</span>}
              {sumModal.sai > 0 && <span className="text-[10px] bg-destructive/15 text-destructive px-2 py-0.5 rounded-full tabular-nums">- {formatMoeda(sumModal.sai)}</span>}
              {sumModal.trE > 0 && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full tabular-nums">↔ {formatMoeda(sumModal.trE)}</span>}
              {sumModal.trS > 0 && <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full tabular-nums">↔ {formatMoeda(sumModal.trS)}</span>}
            </div>
          </div>
          {/* Filter badges */}
          <div className="px-4 py-1.5 border-b flex gap-1.5 flex-shrink-0 flex-wrap">
            {([
              {key:'todos'         as const, label:`Todos (${selectedCard?.lancamentos.length||0})`, base:'bg-blue-100 text-blue-800',     active:'bg-blue-600 text-white'},
              {key:'entradas'      as const, label:`Entradas (${entradas.length})`,                  base:'bg-success/15 text-success',   active:'bg-success text-white'},
              {key:'saidas'        as const, label:`Saídas (${saidas.length})`,                      base:'bg-destructive/15 text-destructive',       active:'bg-destructive text-white'},
              {key:'transf_entrada'as const, label:`Transf. Ent. (${transfEntrada.length})`,         base:'bg-blue-50 text-blue-700 border border-blue-200', active:'bg-blue-500 text-white'},
              {key:'transf_saida'  as const, label:`Transf. Saída (${transfSaida.length})`,          base:'bg-orange-50 text-orange-700 border border-orange-200', active:'bg-orange-500 text-white'},
            ]).map(({key,label,base,active})=>(
              <button key={key} onClick={()=>setFiltroModal(key as any)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold cursor-pointer transition-all ${filtroModal===key?active:base}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="overflow-y-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow className="bg-blue-600 hover:bg-blue-600">
                  {([
                    {key:'data'      as const, label:'Data pgto',  cls:'w-[72px]', right:false},
                    {key:'fornecedor'as const, label:'Fornecedor',  cls:'w-[120px]',right:false},
                    {key:'descricao' as const, label:'Descrição',   cls:'',         right:false},
                  ]).map(h=>{
                    const active = lancSort.col===h.key;
                    const Icon = active ? (lancSort.dir==='asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                    return (
                      <TableHead key={h.key}
                        className={`text-[9px] text-white font-semibold cursor-pointer select-none ${h.cls} ${h.right?'text-right':''}`}
                        onClick={()=>setLancSort(p=>p.col===h.key?{col:h.key,dir:p.dir==='asc'?'desc':'asc'}:{col:h.key,dir:'asc'})}>
                        <span className="inline-flex items-center gap-0.5">
                          {h.label}<Icon className={`h-2.5 w-2.5 ${active?'opacity-100':'opacity-50'}`} />
                        </span>
                      </TableHead>
                    );
                  })}
                  <TableHead className="text-[9px] text-white font-semibold w-[100px]">Grupo</TableHead>
                  {([
                    {key:'valor'     as const, label:'Valor',       cls:'w-[90px]', right:true},
                  ]).map(h=>{
                    const active = lancSort.col===h.key;
                    const Icon = active ? (lancSort.dir==='asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                    return (
                      <TableHead key={h.key}
                        className={`text-[9px] text-white font-semibold cursor-pointer select-none ${h.cls} ${h.right?'text-right':''}`}
                        onClick={()=>setLancSort(p=>p.col===h.key?{col:h.key,dir:p.dir==='asc'?'desc':'asc'}:{col:h.key,dir:'asc'})}>
                        <span className="inline-flex items-center gap-0.5">
                          {h.label}<Icon className={`h-2.5 w-2.5 ${active?'opacity-100':'opacity-50'}`} />
                        </span>
                      </TableHead>
                    );
                  })}
                  <TableHead className="w-[32px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lancSorted.slice(0,200).map((l,idx)=>{
                  const cls     = classifyLanc(l,selectedConta);
                  const isEntr  = cls==='entrada'||cls==='transf_entrada';
                  const fornNome = l.favorecido_id ? fornecedorMap.get(l.favorecido_id)||'' : '';
                  return (
                    <TableRow key={idx} className={idx%2===1?'bg-muted/20':''}>
                      <TableCell className="text-[9px] py-0.5">{fmtDate(l.data_pagamento||l.data_competencia)}</TableCell>
                      <TableCell className="text-[9px] py-0.5 truncate max-w-[110px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {fornNome||<span className="italic">n/c</span>}
                          {(l.tipo_operacao?.startsWith('1-')
                            ? (!l.conta_destino_id && !l.conta_bancaria_id)
                            : l.tipo_operacao?.startsWith('3-')
                              ? (!l.conta_bancaria_id && !l.conta_destino_id)
                              : !l.conta_bancaria_id
                          ) && (
                            <span
                              title="Lançamento sem conta bancária vinculada"
                              className="inline-flex items-center px-1 py-0 rounded text-[8px] font-semibold border border-amber-300 bg-warning/10 text-warning"
                            >
                              Sem conta
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-[9px] py-0.5 truncate max-w-[180px]">{l.descricao||'-'}</TableCell>
                      <TableCell className="text-[9px] py-0.5 text-muted-foreground truncate max-w-[90px]">{l.subcentro||'-'}</TableCell>
                      <TableCell className={`text-[9px] py-0.5 text-right font-medium tabular-nums ${isEntr?'text-success':'text-destructive'}`}>
                        {formatMoeda(isEntr ? Math.abs(l.valor) : -Math.abs(l.valor))}
                      </TableCell>
                      <TableCell className="py-0.5 text-center">
                        <button
                          className="border border-border rounded px-1 py-0.5 hover:bg-muted cursor-pointer"
                          onClick={()=>{
                            setShowLancModal(false);
                            if (onNavigateToLancamentos) onNavigateToLancamentos(ano,parseInt(selectedMes));
                          }}>
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {lancSorted.length > 200 && (
              <p className="text-[9px] text-center text-muted-foreground py-1">+{lancSorted.length-200} lançamentos</p>
            )}
          </div>
          <div className="px-4 py-2 border-t text-[9px] text-muted-foreground text-center flex-shrink-0">
            Colunas ordenáveis ↕ · ✏ abre lançamentos do mês
          </div>
        </DialogContent>
      </Dialog>

      {/* ⚠ UM MODAL SÓ — SALDO-POSICAO-01c. Aqui vivia um segundo diálogo de
          saldo real, sem campo de data: dois lápis escreviam pedaços diferentes
          da MESMA linha, e juntos montavam um saldo de 31/08 carimbado com a
          posição de 13/08. Não era divergência de layout — era um dado composto
          por duas telas que não se conheciam. O antigo morreu por substituição;
          a história dele está no git. */}
      {editingSaldo && clienteId && (
        <SaldoRealDialog
          clienteId={clienteId}
          contaId={editingSaldo.contaId}
          contaNome={getContaLabel(contas.find(c=>c.id===editingSaldo.contaId) || {id:'',nome_conta:editingSaldo.contaId,nome_exibicao:null,tipo_conta:null,codigo_conta:null})}
          ano={Number(editingSaldo.anoMes.slice(0,4))}
          mes={Number(editingSaldo.anoMes.slice(5,7))}
          saldoAtual={editingSaldo.current}
          saldoDataAtual={editingSaldo.saldoData}
          /* Anexar ou cancelar um extrato no modal não passa pelo `aoSalvar` (grava na hora),
             então os ícones recarregam ao fechar. */
          aoFechar={()=>{ setEditingSaldo(null); void carregarIndicadoresSaldo(); }}
          aoSalvar={()=>{ loadData(); releDono(); }}
        />
      )}

      {/* ⚠ O "Pendências de fechamento" VIROU ESTA TELA (CONC-SEM-CLASSIFICACAO-01): classificar na linha, pelo escritor do modal
          do lançamento. O diálogo abaixo ficou só com os duplicados entre origens, que seguem onde estavam. */}
      {clienteId && (
        <SemClassificacaoModal
          aberto={semClassificacaoDe !== null}
          aoFechar={() => setSemClassificacaoDe(null)}
          clienteId={clienteId}
          clienteNome={clienteAtual?.nome ?? ''}
          anoMes={anoMesSel}
          contaId={semClassificacaoDe?.contaId ?? null}
          contaNome={nomeDaContaDoModal(contas.find(c => c.id === semClassificacaoDe?.contaId))}
        />
      )}

      {/* P141 — o ↗ de "Saldos por conta": a aba Sistema do Casar, ampliada (mesmo componente, mesma fonte). Só leitura. */}
      <ExtratoDoSistemaDialog
        aberto={extratoSistemaDe !== null}
        clienteId={clienteId ?? null}
        contaId={extratoSistemaDe}
        contaNome={nomeDaContaDoModal(contas.find(c => c.id === extratoSistemaDe))}
        anoMes={anoMesSel}
        onFechar={() => setExtratoSistemaDe(null)}
      />

      <Dialog open={showPendencias} onOpenChange={setShowPendencias}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Duplicados entre origens — {selectedConta === '__all__' ? 'Todas as contas' : (contas.find(c => c.id === selectedConta)?.nome_exibicao ?? '')} · {ano}-{selectedMes}</DialogTitle>
          </DialogHeader>
          <div className="text-xs max-h-[60vh] overflow-auto space-y-4">
            {diagPendencias.duplicadosCount > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Duplicados ({diagPendencias.duplicadosCount})</div>
                <div className="divide-y">
                  {diagPendencias.duplicados.map(l => (
                    <div key={l.id} className="py-1.5 flex items-center gap-2">
                      {selectedConta === '__all__' && <span className="text-muted-foreground w-28 shrink-0 truncate">{contas.find(c => c.id === l.conta_bancaria_id)?.nome_exibicao ?? '—'}</span>}
                      <span className="w-14 shrink-0 text-muted-foreground">{l.data_pagamento ? l.data_pagamento.slice(8,10)+'/'+l.data_pagamento.slice(5,7) : '—'}</span>
                      <span className="flex-1 truncate">{l.descricao ?? '—'}</span>
                      <span className="w-24 text-right tabular-nums">{formatMoeda(l.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ⚠ O `ExtratoImportPreview` SAIU DAQUI — B-24. Com a unica porta que o
          abria removida do cabecalho, ele ficaria montado com `open` sempre
          falso: codigo morto disfarcado de funcionalidade, que e' o que o
          `BoitelPainelResultado` ja custou uma vez. O MOTOR dele
          (`useImportacaoExtrato`) e' exatamente o que a previa inline desta aba
          passou a consumir. Nada foi perdido; mudou quem apresenta.
          ⚠ O COMPONENTE NAO EXISTE MAIS — PR-REMOVE-AUDITORIA-BANCARIA-01,
          2026-09-10. Este comentario dizia "continua vivo, a Auditoria Bancaria o
          monta"; com a Auditoria apagada ele ficou sem nenhuma porta, e a previsao
          que ele mesmo fazia se cumpriu — virou o codigo morto que descrevia. O
          motor segue vivo e e' o desta aba. */}
    </div>
  );
}

/** O nome da conta no título do modal "Sem classificação"; sem conta é o Todas. */
function nomeDaContaDoModal(conta: ContaRef | undefined): string {
  return conta ? getContaLabel(conta) : 'Todas as contas';
}

/** O contador vermelho do mês na régua: a quantidade sem classificação do total do mês, do dono. */
function contadorDoMes(sc: SemClassificacao | null): { qtde: number; title: string } | undefined {
  return sc ? { qtde: sc.qtde, title: `${sc.qtde} sem classificação` } : undefined;
}

/* ── Sub-component: SaldoContaRow ── */
interface SaldoContaRowProps {
  data: PerContaSaldo;
  isActive: boolean;
  isDimmed: boolean;
  onClick: () => void;
  onEdit: () => void;
  canEdit: boolean;
  showSaldoAlert?: boolean;
  /** UI-SEM-CORTE-02 — 'cheio' (OFX com saldo do banco no mês) · 'vazado' (OFX com movimentos, sem saldo) · null. */
  estadoOfx?: EstadoDoSlotOfx;
  /** O mês desta conta tem extrato (PDF/imagem) anexado. */
  temPdf?: boolean;
  /** Abre o modal "Sem classificação" desta conta (CONC-SEM-CLASSIFICACAO-01). */
  onClassificar: () => void;
  /** P141 — abre o "Extrato do sistema" desta conta neste mês (o ↗ da linha). */
  onExtratoSistema: () => void;
}

function SaldoContaRow({data, isActive, isDimmed, onClick, onEdit, canEdit, showSaldoAlert, estadoOfx = null, temPdf, onClassificar, onExtratoSistema}: SaldoContaRowProps) {
  /* ⚠ A LINHA É A DO DONO — PR-CONC-SALDO-UMA-REGUA-02 (D4): o status (o ponto) e os motivos (o `title`).
     ⚠ OS TRÊS NÚMEROS SÃO OS DA CONTA, o `proprio` do dono (PR-CONC-INTERNA-SEPARADA-01b, D2): a mãe e a interna têm cada uma
     a sua linha e o seu saldo; a marca "· conferida com X" diz que o mês delas só fecha junto. O status é o do par. */
  const { conta, linha } = data;
  const proprio = saldosDaLinha(linha);
  const sis = proprio.saldo_sistema;
  const ext = proprio.saldo_extrato;
  const dif = proprio.diferenca;
  const par = marcaDoPar(linha);
  const dotColor = linha.status==='conciliado' ? '#2E7D32' : linha.status==='nao_conciliado' ? '#C62828' : '#90A4AE';
  const frases = frasesDoStatus(linha);
  /* O `title` diz o status (o saldo) e, à parte, a 2ª prova (os avisos do extrato) — PR-CONC-STATUS-SALDO-01b. */
  const avisos = frasesDosAvisos(linha);
  const marcaAviso = marcaDeAviso(linha);
  /* CONC-SEM-CLASSIFICACAO-01: os dois avisos da classificação, do dono. Não mudam o ponto nem a cor da linha (D6). */
  const semClass = semClassificacaoDaLinha(linha);
  const semForn = semFornecedorDaLinha(linha);
  /* CONC-SALDOS-LAYOUT-02: o `title` COMECA PELO NOME (e pela frase do par): o nome corta na linha e tem de estar inteiro aqui. */
  const titulo = `${getContaLabel(conta)}${par ? ` · ${par.tituloLinha}` : ''} — ${ROTULO_STATUS[linha.status]}${frases.length > 0 ? ': ' + frases.map(f => f.texto).join(' · ') : ''}`
    + (avisos.length > 0 ? ` — 2ª prova · extrato: ${avisos.map(f => f.texto).join(' · ')}` : '')
    + (semClass ? ` — ${semClass.qtde} sem classificação` : '')
    + (semForn > 0 ? ` — ${semForn} sem fornecedor` : '');
  return (
    <tr
      /* ⚠ A ESCOLHIDA TEM CONTORNO NAVY E FUNDO BRANCO, NUNCA PREENCHIMENTO — CONC-SALDOS-LAYOUT-02: o `bg-primary/10` de antes
         era a mesma cor da faixa de grupo. O contorno e' sombra interna em toda celula (borda colapsada nao desenha). As outras
         ficam a 0,38. Sem selecao: todas a 1, sem contorno. */
      className={`cursor-pointer transition-all ${isActive ? 'bg-card' : 'hover:bg-muted/20 last:[&>td]:shadow-none'}`}
      style={{opacity:isDimmed?OPACIDADE_DAS_OUTRAS:1}}
      data-ativa={isActive ? 'sim' : undefined}
      onClick={onClick}
      title={titulo}
      data-testid="linha-saldo-conta" data-conta={conta.id} data-status={linha.status}
    >
      <td className={`relative ${TD_CONTA} pl-0 pr-1 overflow-hidden ${isActive ? CONTORNO_PRIMEIRA : LINHA_DA_CONTA}`}>
        {/* ⚠ O CONTADOR VERMELHO DA CONTA mora NO RECUO de 19px (posição absoluta): abre o modal desta conta. O "sem fornecedor"
            da conta fica no `title` da linha e no card Status — não há lugar para um segundo contador. */}
        {semClass && (
          <button type="button" onClick={e => { e.stopPropagation(); onClassificar(); }}
            className="absolute left-[2px] top-1/2 h-[12px] min-w-[13px] -translate-y-1/2 rounded-[6px] bg-destructive px-[2px] text-[8.5px] font-semibold leading-[12px] text-destructive-foreground tabular-nums cursor-pointer"
            title={`${semClass.qtde} sem classificação · classificar agora`} data-testid="contador-sem-classificacao">
            {semClass.qtde}
          </button>
        )}
        {/* ⚠ UMA LINHA, SEMPRE — CONC-SALDOS-LAYOUT-02: ponto · NOME (o unico que corta; "· par" e "⚠" cortam junto, inteiros no
            `title` da linha). P141 (CONC-LAYOUT-01): a DATA e os selos OFX/PDF sairam daqui para colunas proprias — nada colado ao nome. */}
        <div className="flex h-[18px] min-w-0 items-center gap-1 pl-[19px]" data-testid="celula-conta">
          {/* O PONTO É O STATUS (o saldo). Conta CONCILIADA com aviso do extrato leva um ponto âmbar de 4px SOBRE o canto. */}
          <span style={{width:7,height:7,borderRadius:'50%',background:dotColor,flexShrink:0,position:'relative'}}>
            {marcaAviso && (
              <span aria-hidden data-testid="marca-aviso-conta" style={{position:'absolute',top:-2,right:-2,width:4,height:4,borderRadius:'50%',background:'#D97706',boxShadow:'0 0 0 1px #fff'}} />
            )}
          </span>
          <span className={`min-w-0 flex-1 truncate ${isActive ? 'font-semibold text-primary' : ''}`} data-testid="nome-conta">
            {getContaLabel(conta)}
            {par && (
              <span className="ml-1 text-muted-foreground" title={par.tituloLinha} data-testid="marca-par">· {par.curto}</span>
            )}
            {showSaldoAlert && (
              <span className="ml-1 font-semibold text-warning border border-amber-300 bg-warning/10 rounded px-0.5" title="Saldo inicial não definido">⚠</span>
            )}
          </span>
        </div>
      </td>
      {/* ATÉ QUANDO ESTA CONTA FOI CONFERIDA — a data do saldo do extrato do DONO. Sem saldo de extrato o lugar fica vazio. */}
      <td className={`${TD_CONTA_NUM} px-1 text-right text-muted-foreground tabular-nums whitespace-nowrap ${isActive ? CONTORNO_MEIO : LINHA_DA_CONTA}`} data-testid="slot-data">
        {ext !== null && linha.saldo_extrato_data ? `${linha.saldo_extrato_data.slice(8, 10)}/${linha.saldo_extrato_data.slice(5, 7)}` : ''}
      </td>
      {/* P141 — os ARQUIVOS em dois lugares FIXOS de 24px: "OFX" (azul) e "PDF" (roxo), 7px com borda fina, no lugar dos ícones.
          O OFX tem os dois estados de UI-SEM-CORTE-02 no MESMO selo (D1): cheio (o banco informou o saldo) e vazado — cinza com
          borda tracejada (só movimentos). Sem arquivo, o lugar fica vazio e nada anda. */}
      <td className={`${TD_CONTA} px-0 text-center whitespace-nowrap ${isActive ? CONTORNO_MEIO : LINHA_DA_CONTA}`} data-testid="celula-arquivos">
        <span className={LUGAR_SELO} data-testid="slot-ofx" data-estado={estadoOfx ?? 'vazio'}
          title={estadoOfx === 'cheio' ? TITULO_OFX_COM_SALDO : estadoOfx === 'vazado' ? TITULO_OFX_SEM_SALDO : undefined}
          aria-label={estadoOfx === 'cheio' ? TITULO_OFX_COM_SALDO : estadoOfx === 'vazado' ? TITULO_OFX_SEM_SALDO : undefined}>
          {estadoOfx === 'cheio' && <span className={`${SELO_ARQUIVO} border-blue-300 bg-blue-50 text-blue-700`}>OFX</span>}
          {estadoOfx === 'vazado' && <span className={`${SELO_ARQUIVO} border-dashed border-muted-foreground/60 text-muted-foreground`}>OFX</span>}
        </span>
        <span className={LUGAR_SELO} data-testid="slot-pdf"
          title={temPdf ? 'PDF do extrato anexado' : undefined} aria-label={temPdf ? 'PDF do extrato anexado' : undefined}>
          {temPdf && <span className={`${SELO_ARQUIVO} border-purple-300 bg-purple-50 text-purple-700`}>PDF</span>}
        </span>
      </td>
      {/* ⚠ NEGATIVO VERMELHO NAS DUAS COLUNAS: `corDoValor` é a mesma regra nos três níveis (Total, grupo, conta). */}
      <td className={`${TD_CONTA_NUM} px-1 text-right tabular-nums whitespace-nowrap ${isActive ? `font-semibold ${CONTORNO_MEIO}` : LINHA_DA_CONTA} ${corDoValor(sis)}`}>{sis===null?'—':valorDaRegua(sis)}</td>
      <td className={`${TD_CONTA_NUM} px-1 text-right tabular-nums whitespace-nowrap ${isActive ? `font-semibold ${CONTORNO_MEIO}` : LINHA_DA_CONTA} ${corDoValor(ext)}`} data-testid="conta-extrato">{ext===null?'—':valorDaRegua(ext)}</td>
      {/* Sem extrato é "—" (dado ausente); com extrato, "confere" só com diferença ZERO. Sobre a faixa cinza da coluna. */}
      <td className={`${TD_CONTA_DIF} px-1 text-right tabular-nums whitespace-nowrap ${isActive ? CONTORNO_MEIO : LINHA_DA_CONTA} ${dif===null?'font-medium text-muted-foreground':saldoConfere(dif)?'font-medium text-success':dif>0?'font-semibold text-success':'font-semibold text-destructive'}`}>
        {dif===null ? '—' : saldoConfere(dif) ? 'confere' : valorDaRegua(dif)}
      </td>
      {/* AS AÇÕES: célula de 38px, ✎ e ↗ de 14 x 14 (D5). O lugar do ✎ existe sempre (sem `canEdit` fica vazio) — o ↗ não anda.
          O ↗ (P141) abre o "Extrato do sistema" desta conta neste mês: só leitura, a lista do dono. */}
      <td className={`h-[19px] p-0 leading-none ${isActive ? CONTORNO_ULTIMA : LINHA_DA_CONTA}`} data-testid="slot-lapis">
        <div className="flex items-center justify-end gap-[2px] pr-[4px]">
          <span className="inline-flex h-[14px] w-[14px] shrink-0">
            {canEdit && (
              <button className="inline-flex h-[14px] w-[14px] items-center justify-center border border-border rounded-[3px] p-0 hover:bg-muted cursor-pointer"
                onClick={e=>{e.stopPropagation();onEdit();}} data-testid="botao-lapis">
                <Pencil className="h-[8px] w-[8px]" />
              </button>
            )}
          </span>
          <button type="button" title="Extrato do sistema desta conta neste mês" aria-label="Extrato do sistema desta conta neste mês"
            className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[3px] border border-blue-600 bg-card p-0 text-blue-700 hover:bg-blue-50 cursor-pointer"
            onClick={e=>{e.stopPropagation();onExtratoSistema();}} data-testid="abrir-extrato-sistema">
            <ArrowUpRight className="h-[8px] w-[8px]" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ── Sub-component: LinhaAbertura ── */
/** Uma linha "↳ terceiros / transferências" do Resumo do mês: como a linha de conta (19px; o número uma fonte abaixo). */
function LinhaAbertura({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <tr>
      <td className={`${TD_CONTA} pl-4 pr-1 text-left text-muted-foreground truncate ${LINHA_DA_CONTA}`}>{rotulo}</td>
      <td className={`${TD_CONTA_NUM} px-1 text-right tabular-nums whitespace-nowrap ${LINHA_DA_CONTA}`}>{valor}</td>
    </tr>
  );
}

/* ── Sub-component: FaixaDoMes ── */
/**
 * O meio da faixa do mês: o que o STATUS DO DONO diz, sem valor de conta (os valores estão na tabela, e a conta com diferença já
 * tem o ponto vermelho). No Todas, "não batem em N contas" é o `qtde` do motivo `contas_nao_conciliadas` (os nomes, no `title`);
 * pendente escreve as frases do dono. Nada se conta aqui.
 */
function fraseDaFaixa(l: LinhaResumo | null): { texto: string; titulo?: string } {
  if (!l) return { texto: '—' };
  if (l.status === 'conciliado') {
    return { texto: l.nivel === 'conta' ? 'O saldo do sistema bate com o do extrato' : 'Todas as contas batem com o extrato' };
  }
  const frases = frasesDoStatus(l).filter(f => f.chave !== 'confere_dias' && f.chave !== 'conferida_com');
  const titulo = frases.map(f => f.titulo ?? f.texto).join('\n') || undefined;
  if (l.status === 'nao_conciliado') {
    const m = l.motivos.find(x => x.motivo === 'contas_nao_conciliadas');
    if (m) {
      const n = m.qtde ?? m.contas?.length ?? 0;
      return { texto: `Saldo do sistema e do extrato não batem em ${n} ${n === 1 ? 'conta' : 'contas'}`, titulo };
    }
    if (l.motivos.some(x => x.motivo === 'extrato_nao_fecha') && !l.motivos.some(x => x.motivo === 'saldo_diverge')) {
      return { texto: 'O extrato não fecha com o saldo informado', titulo };
    }
    return { texto: 'Saldo do sistema e do extrato não batem', titulo };
  }
  const t = frases.map(f => f.texto).join(' · ');
  return { texto: t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Saldo do mês ainda não conferido', titulo };
}

/** As quatro cores da faixa: vermelho (não conciliado), verde (conciliado), âmbar (conciliado com sem classificação), cinza (pendente). */
const TOM_DA_FAIXA = {
  nao: { caixa: 'border-destructive/40 bg-destructive/10', status: 'text-destructive', icone: '✕' },
  ok: { caixa: 'border-success/40 bg-success/10', status: 'text-success', icone: '✓' },
  pendencia: { caixa: 'border-warning/50 bg-warning/10', status: 'text-amber-700', icone: '⚠' },
  pendente: { caixa: 'border-border bg-muted', status: 'text-muted-foreground', icone: '⏳' },
} as const;

/**
 * P166 (CONC-TELA-02, mock aprovado 28/10) — a FAIXA do status do mês, no lugar do card Status: UMA linha, toda a largura, altura
 * fixa (o texto nunca quebra: a tabela abaixo não anda). O status e a frase são os do DONO da linha aberta (a conta, ou o total no
 * Todas). "Classificação" é o aviso `sem_classificacao` do dono (realizados do mês sem plano de contas = sem subcentro; o subcentro
 * vem do plano). Conciliado com sem classificação fica ÂMBAR — só a cor da faixa; o status não muda (D6 da CONC-SEM-CLASSIFICACAO-01).
 * Saíram com o card: a 2ª prova, o pareamento e as contas com aviso (seguem no `title` de cada linha, no ✎ e no ↗).
 */
function FaixaDoMes({ mes, linha, semClassificacao, onCorrigir, duplicados, onDuplicados }: {
  mes: string;
  linha: LinhaResumo | null;
  semClassificacao: SemClassificacao | null;
  onCorrigir: () => void;
  duplicados: number;
  onDuplicados: () => void;
}) {
  const status: StatusDono = linha?.status ?? 'pendente';
  const tom = status === 'nao_conciliado' ? TOM_DA_FAIXA.nao
    : status === 'conciliado' ? (semClassificacao ? TOM_DA_FAIXA.pendencia : TOM_DA_FAIXA.ok)
    : TOM_DA_FAIXA.pendente;
  const rotulo = status === 'nao_conciliado' ? `${mes} não conciliado`
    : status === 'conciliado' ? (semClassificacao ? `${mes} conciliado, com pendência` : `${mes} conciliado`)
    : `${mes} pendente`;
  const frase = fraseDaFaixa(linha);
  return (
    <div className={`mx-3 flex h-[26px] items-center gap-3 overflow-hidden whitespace-nowrap rounded-md border px-3 text-[10px] ${tom.caixa}`}
      data-testid="faixa-status" data-status={status} data-pendencia={semClassificacao ? 'sim' : undefined}>
      <span className={`shrink-0 text-[11px] font-semibold ${tom.status}`} data-testid="faixa-status-rotulo">{tom.icone} {rotulo}</span>
      <span className="shrink-0 text-foreground/80" title={frase.titulo} data-testid="faixa-status-frase">{frase.texto}</span>
      <span className="shrink-0 text-foreground/80" data-testid="faixa-classificacao"
        title="lançamentos realizados do mês sem plano de contas (sem subcentro): ficam fora do DRE">
        Classificação:{' '}
        {semClassificacao
          ? <b className="font-semibold text-amber-700" data-testid="sem-classificacao-qtde">{semClassificacao.qtde} sem subcentro</b>
          : <b className="font-semibold text-success">✓ completa</b>}
      </span>
      {duplicados > 0 && (
        <button type="button" onClick={onDuplicados} className="shrink-0 font-medium text-destructive hover:underline cursor-pointer"
          data-testid="faixa-duplicados">
          {duplicados} {duplicados === 1 ? 'duplicado' : 'duplicados'} ›
        </button>
      )}
      {semClassificacao && (
        <button type="button" onClick={onCorrigir} className="ml-auto shrink-0 text-primary hover:underline cursor-pointer"
          data-testid="classificar-agora">
          corrigir ›
        </button>
      )}
    </div>
  );
}
