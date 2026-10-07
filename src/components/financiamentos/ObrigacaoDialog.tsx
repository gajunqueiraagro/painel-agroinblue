import { useCallback, useEffect, useMemo, useState } from 'react';
import { DocumentosDoContrato } from '@/components/financiamentos/DocumentosDoContrato';
import { usarDuplicatasDaNota } from '@/lib/financiamentos/notaContraContrato';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda, brl, parseMoeda } from '@/components/ui/campo-moeda';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { CredorAutocomplete } from '@/components/financiamentos/CredorAutocomplete';
import { DestinacoesForm, DestinacaoItem } from '@/components/financiamentos/DestinacoesForm';
import { useFinanciamentoCadastro, FinanciamentoForm, NaturezaContrato } from '@/hooks/useFinanciamentoCadastro';
/* PAR-01c — a MESMA classificação do modal do financeiro, reusada sem copiar a regra. */
import { ClassificacaoLancamento, atividadeValida } from '@/components/shared/ClassificacaoLancamento';
import { FazendaSelect } from '@/components/shared/FazendaSelect';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCulturasDaSafra } from '@/hooks/useAreaPlantada';
import { FORMAS_PAGAMENTO_V2, FORMA_PAGAMENTO_V2_NENHUMA } from '@/lib/financeiro/formasPagamentoV2';
import { ehSubcentroAdministrativo } from '@/lib/financeiro/escopoDoSubcentro';
import { CULTURAS_LANCAMENTO, FASES } from '@/lib/agri/rateioLancamento';
import {
  MOTIVO_PARCELA_DE_PARCELAMENTO, MOTIVO_PRIMEIRA_PARCELA_DO_PARCELAMENTO, MOTIVO_VALE_POR_PARCELA, VARIA_ENTRE_AS_PARCELAS, textoDasParcelas, valorComumDasParcelas,
} from '@/lib/financiamentos/valorDasParcelas';
import ModalBaixaParcela from '@/components/financiamentos/ModalBaixaParcela';
import { TableFooter } from '@/components/ui/table';
import { Pencil } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { GradeDeParcelas, type ModoDasParcelas } from '@/components/financiamentos/GradeDeParcelas';
import {
  centavos, houveEdicao, motivoNaoSalva, parcelasGravadasParaGrade, parcelasParaEditar, parcelasParaPayload, type ParcelaLivre,
} from '@/lib/financiamentos/parcelasLivres';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { PropagarContratoDialog } from '@/components/financiamentos/PropagarContratoDialog';
import { DocumentosNaCriacao } from '@/components/financiamentos/DocumentosNaCriacao';
import { gravarDocumentosDoParcelamento, lancamentosDoParcelamento, novoPendente, todosGravados, type DocumentoPendente } from '@/lib/financeiro/documentosPendentes';
import { parcelasDaNota } from '@/lib/financiamentos/parcelasLivres';
import type { NotaLida } from '@/lib/financeiro/nfe/tipos';
import { camposAPropagar, lerPreviaDaPropagacao, type CamposAPropagar, type CamposDasParcelas, type ComumDasParcelas, type PreviaDaPropagacao } from '@/lib/financiamentos/propagarContrato';
import type { EscopoDePropagacao } from '@/components/financeiro-v2/OpcoesDeEscopo';

/* ══ NOVA OBRIGACAO — a casca do CompraModalShell aplicada ao contrato ═══════════
   PR-PARC-04. Substitui a PAGINA `src/pages/FinanciamentoCadastro.tsx` como porta de
   entrada do "+ Nova obrigacao": mesma gravacao (o hook `useFinanciamentoCadastro`
   continua a fonte unica — form, parcelas, salvar), outra apresentacao.
   ⚠ A PAGINA NAO FOI APAGADA e continua sendo o caminho de outros pontos; quando a
   EDICAO tambem migrar para ca, ela sai num PR de limpeza. */

/* ── Constantes de medida — a casca inteira sai daqui ─────────────────────────── */
/* ⚠ ALTURA FIXA E' O QUE IMPEDE A CASCA DE PULAR ENTRE ABAS. Sem ela, Contrato
   (curta) e Classificacao (com Destinacoes) dariam dois modais de tamanhos
   diferentes, e o rodape mudaria de lugar debaixo do cursor. */
/* ⚠ 69vh, E NAO 62: espelha o CODIGO do CompraModalShell:408, nao o comentario
   dele (que ficou dizendo 62vh depois que o valor subiu). Encolher cabecalho e
   rodape libera pixel FIXO enquanto a area de conteudo cresce em PROPORCAO — os
   dois nunca se anulam em toda altura de janela, e o caso que importa e' a janela
   BAIXA, onde o modal quase nao cabe. */
const ALTURA_CORPO = 'h-[69vh]';
/**
 * A ALTURA DA TABELA DE PARCELAS — OBRIGACAO-UI-03.
 *
 * ⚠ SUBIU DE 190 PARA 260px COM ALTURA MEDIDA, nao no olho: a linha unica dos quatro campos
 * devolveu 66px (139 -> 73, OBRIGACAO-UI-02) e as duas frases-guia que subiram para a linha do
 * rotulo devolveram outra faixa. O que se ganhou em cima, a tabela recebe — que e' o unico
 * bloco da aba onde mais altura vira mais informacao.
 * ⚠ CONTINUA SENDO `max-h`, NAO `h`: com tres parcelas a caixa encolhe para tres linhas em vez
 * de reservar 260px de vazio. Altura fixa aqui seria moldura em volta de nada.
 */
const ALTURA_PREVIA = 'max-h-[260px]';
/** PARC-LIVRES-01 — a grade de parcelas da criação do parcelamento: altura FIXA (barra 26 + lista + totais 20 + aviso 18). */
const ALTURA_GRADE = 276;
const CAMPO = 'h-8';                       // A16 — todo campo do formulario na mesma altura
const CAMPO_CELULA = 'h-6';                // A16 — dentro da grade densa, todos na dela
/* Idioma canonico de campo travado (AbaLiquidacaoOC / CompraModalShell). */
const CAMPO_TRAVADO = 'bg-muted border-border/60 text-muted-foreground';
const ROTULO = 'text-[10px] font-normal text-muted-foreground';
const APOIO = 'mt-0.5 text-[10px] text-muted-foreground';
const NUM = 'font-mono tabular-nums';
/* 9px so' para numero monetario em mono — mesma excecao da lista e do detalhe. */
const MOEDA = 'text-right font-mono tabular-nums whitespace-nowrap text-[9px]';
const MIN_PARCELAS = 1;
const MAX_PARCELAS = 360;

export type Escopo = 'pecuaria' | 'agricultura';
export type AbaDaObrigacao = 'contrato' | 'parcelas' | 'classificacao' | 'documentos';
type Aba = AbaDaObrigacao;
type Frequencia = FinanciamentoForm['frequencia_parcela'];

/* ⚠ GUARDAS, NAO CASTS (regra zero-cast). O `onValueChange` do Select entrega `string`;
   `as` calaria o compilador SEM olhar o valor, e um dia um `value` errado entraria no
   form como se fosse valido. O predicado confere de verdade e simplesmente ignora o que
   nao pertence ao conjunto. */
const ehEscopo = (v: string): v is Escopo => v === 'pecuaria' || v === 'agricultura';
const ehNatureza = (v: string): v is NaturezaContrato =>
  v === 'financiamento' || v === 'parcelamento' || v === 'emprestimo';

/* Situacao do CONTRATO (nao confundir com a situacao da parcela). Os identificadores
   gravados continuam ativo/quitado/cancelado. */
type StatusContrato = 'ativo' | 'quitado' | 'cancelado';

/** A linha de `financiamento_parcelas` como a grade da aba a consome. */
interface ParcelaGravada {
  id: string;
  numero_parcela: number | null;
  data_vencimento: string | null;
  valor_principal: number | null;
  valor_juros: number | null;
  status: string | null;
  data_pagamento?: string | null;
  observacao?: string | null;
  lancamento_id?: string | null;
  lancamento_juros_id?: string | null;
}
const ehStatusContrato = (v: string): v is StatusContrato =>
  v === 'ativo' || v === 'quitado' || v === 'cancelado';
/* ⚠ O dropdown tem a largura do campo: sem `position="popper"` a variavel
   `--radix-select-trigger-width` nao existe e a caixa e' medida pelo item mais longo. */
const SELECT_POPPER = 'w-[var(--radix-select-trigger-width)]';
/* Cabecalho da grade — override LOCAL, igual ao da lista e do detalhe: azul de fundo,
   branco por cima, caixa normal. O primitivo dense nao muda. */
const TH_PREVIA = 'text-primary-foreground normal-case tracking-normal';
const ehAba = (v: string): v is Aba => v === 'contrato' || v === 'parcelas' || v === 'classificacao' || v === 'documentos';
const FREQUENCIAS: Frequencia[] = ['mensal', 'bimestral', 'trimestral', 'semestral', 'anual'];
const ehFrequencia = (v: string): v is Frequencia => FREQUENCIAS.some(f => f === v);

const APOIO_NATUREZA: Record<NaturezaContrato, string> = {
  financiamento: 'Crédito com bem vinculado',
  parcelamento: 'Compra ou despesa dividida em N vezes, sem juros',
  emprestimo: 'Crédito sem bem vinculado',
};

export const NOME_NATUREZA: Record<NaturezaContrato, string> = {
  financiamento: 'Financiamento',
  parcelamento: 'Parcelamento',
  emprestimo: 'Empréstimo',
};

export const PILULA_NATUREZA: Record<NaturezaContrato, string> = {
  financiamento: 'FIN',
  parcelamento: 'PARC',
  emprestimo: 'EMP',
};

const ORDEM_NATUREZA: NaturezaContrato[] = ['parcelamento', 'financiamento', 'emprestimo'];

/* ⚠ LITERAIS MEDIDOS NO BANCO PROTO, nao supostos — `financeiro_plano_contas`, 08/09/2026.
   Sao os MESMOS subcentros que `fn_reconciliar_parcela_financiamento` fixa por
   `tipo_financiamento` (pecuaria -> 0d42d354/5d4a5c70; agricultura -> 576eb57d/0c489373),
   e por isso a tela os mostra travados: quem decide e' o escopo, nao o operador.
   ⚠ A ASSIMETRIA DO NOME E' DO BANCO: "Amortização Financiamento X" mas "Juros de
   Financiamento X". Nao uniformizar aqui — o nome exibido tem de ser o nome real. */
export const SUBCENTRO_AMORTIZACAO: Record<Escopo, string> = {
  pecuaria: 'Amortização Financiamento Pecuária',
  agricultura: 'Amortização Financiamento Agricultura',
};
export const SUBCENTRO_JUROS: Record<Escopo, string> = {
  pecuaria: 'Juros de Financiamento Pecuária',
  agricultura: 'Juros de Financiamento Agricultura',
};

const dataBR = (iso: string): string | null =>
  iso ? iso.split('-').reverse().join('/') : null;

/* ── Resumo lateral: faixa de secao e par rotulo-valor (A17) ──────────────────── */
function BlocoHead({ titulo }: { titulo: string }) {
  return (
    /* ⚠ SEM RESPIRO VERTICAL EM VOLTA — OBRIGACAO-UI-03. As bordas do proprio bloco ja'
       separam uma secao da outra; `py`/`mt`/`mb` de 2px cada somavam ~18px nos tres blocos, e
       essa altura estava empurrando o resumo para a rolagem. O fundo e as bordas fazem a
       separacao que o espaco fazia. */
    <div className="bg-muted/40 border-y border-border/60 px-3 mt-0 mb-0">
      <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">{titulo}</span>
    </div>
  );
}
/* ⚠ `h-6` (24px) e nao `h-5` — PR-PARC-05b item 1. Em 20px os pares do resumo ficavam
   colados e o bloco lia-se como um paragrafo; 24px separa linha de linha sem custar
   altura de tela, porque o resumo tem rolagem propria. `items-center` acompanha a troca:
   com altura fixa, alinhar pela base deixava o valor flutuando. */
/**
 * UM CAMPO QUE MORA NAS PARCELAS (forma de pagamento, safra, cultura, fase) — PARC-CONTRATO-01 item 2.
 * Mostra o que TODAS as parcelas têm (ou "varia entre as parcelas") e deixa escolher outro valor; a escolha NÃO é gravada aqui:
 * vai para a prévia do banco no Salvar, que pergunta até onde ela alcança. `VAZIO` é a palavra da casa para "nenhum".
 */
const VALOR_VAZIO_DAS_PARCELAS = '__vazio__';
function CampoDasParcelas({ testid, comum, escolhido, vazio, opcoes, aoMudar }: {
  testid: string; comum: ComumDasParcelas[keyof ComumDasParcelas]; escolhido: string | null | undefined; vazio: string;
  opcoes: ReadonlyArray<{ valor: string; label: string }>; aoMudar: (v: string | null) => void;
}) {
  const atual = escolhido !== undefined ? (escolhido || VALOR_VAZIO_DAS_PARCELAS)
    : comum.tipo === 'igual' ? (comum.valor || VALOR_VAZIO_DAS_PARCELAS) : undefined;
  const dica = comum.tipo === 'varia' ? VARIA_ENTRE_AS_PARCELAS : '—';
  /* o valor que as parcelas têm e que não está na lista (legado) continua visível como opção */
  const lista = atual && atual !== VALOR_VAZIO_DAS_PARCELAS && !opcoes.some(o => o.valor === atual) ? [...opcoes, { valor: atual, label: atual }] : opcoes;
  return (
    <Select value={atual} onValueChange={v => aoMudar(v === VALOR_VAZIO_DAS_PARCELAS ? null : v)} disabled={comum.tipo === 'sem_parcelas'}>
      <SelectTrigger className={CAMPO} data-testid={testid} data-escolhido={escolhido !== undefined ? 'sim' : 'nao'}><SelectValue placeholder={dica} /></SelectTrigger>
      <SelectContent position="popper" className={SELECT_POPPER}>
        <SelectItem value={VALOR_VAZIO_DAS_PARCELAS}>{vazio}</SelectItem>
        {lista.map(o => <SelectItem key={o.valor} value={o.valor}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function Linha({ rotulo, valor, valorClassName }: { rotulo: string; valor: string | null; valorClassName?: string }) {
  return (
    <div className="flex h-6 items-center justify-between gap-1.5 leading-tight">
      <span className="text-muted-foreground shrink-0">{rotulo}</span>
      <span className={`font-medium text-right truncate ${valorClassName ?? ''}`} title={valor ?? undefined}>
        {valor || '—'}
      </span>
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Chamado APOS a gravacao bem-sucedida — quem fecha, invalida e avisa e' o caller. */
  onSalvo?: () => void;
  /** 'criar' (default) grava pelo hook; 'editar' carrega um contrato e grava pelo caller. */
  modo?: 'criar' | 'editar';
  /** Obrigatorio em modo editar. */
  financiamentoId?: string;
  /**
   * ⚠ SO' EM MODO EDITAR, e POR INJECAO de proposito. A atualizacao de um contrato nao e'
   * "o insert ao contrario": ela sincroniza o lancamento de captacao em
   * `financeiro_lancamentos_v2` (criar / atualizar / cancelar conforme a captacao entrou
   * ou saiu) e invalida sete chaves de saldo e auditoria. Esse escritor JA' EXISTE e roda
   * em producao dentro do `FinanciamentoDetalhe`; traze-lo para ca' seria reescrever
   * codigo que mexe em dinheiro para ganhar nada. O dialogo e' o FORMULARIO; quem grava
   * continua sendo quem ja' gravava — o mesmo padrao de prop-bag do CompraModalShell.
   */
  onSalvarEdicao?: (form: FinanciamentoForm, extras: { status: StatusContrato; parcelasAtualizadas?: number }) => Promise<boolean>;
  /** PARC-CONTRATO-01: a aba em que o diálogo abre ("Documentos" e "Editar parcelas" da tela do contrato). Sem ela, Contrato. */
  abaInicial?: AbaDaObrigacao;
}

export function ObrigacaoDialog({ open, onOpenChange, onSalvo, modo = 'criar', financiamentoId, onSalvarEdicao, abaInicial }: Props) {
  const {
    form, setForm,
    parcelas, setParcelas,
    gerarParcelas,
    updateParcela,
    totalParcelas,
    salvar, saving,
    contas,
    planosEntrada, planosSaida, planosParcelamento,
    classificacao, setClassificacao,
    classificacoes, safras,
    clienteId,
  } = useFinanciamentoCadastro();

  /* ── PAR-01c — a classificação do parcelamento ─────────────────────────────────────────── */
  const { fazendas } = useFazenda();
  /**
   * ⚠ ORDENA, NUNCA FILTRA — é a prop que o cluster pede para pôr as culturas com área
   * plantada naquela safra no topo da lista. Sem ela o componente aceita `[]` e perde só o
   * atalho; com ela, a tela de Parcelamentos oferece a mesma ordem que o modal do financeiro.
   */
  const culturasDaSafra = useCulturasDaSafra(classificacao.safra_id || null);
  /**
   * ⚠ A MESMA PERGUNTA QUE DESLIGA A SAFRA DESLIGA A FAZENDA — a regra da casa, em
   * `escopoDoSubcentro`. Conta administrativa não tem fazenda operacional: o `FazendaSelect`
   * força o Administrativo e se trava sozinho. Não é regra nova desta tela; é a que o
   * `LancamentoV2Dialog` já aplica, chamada da mesma função pura.
   */
  const ehAdministrativo = ehSubcentroAdministrativo(classificacoes, classificacao.subcentro);

  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>(abaInicial ?? 'contrato');
  const [destinacoes, setDestinacoes] = useState<DestinacaoItem[]>([]);
  const [carregado, setCarregado] = useState(false);
  /* ⚠ FORA DO `FinanciamentoForm` DE PROPOSITO: `status` nao e' campo de CRIACAO (todo
     contrato nasce 'ativo', o gravador fixa). Ele so' existe na edicao, e por isso viaja
     em `extras` em vez de inchar o form que as duas telas compartilham. */
  const [statusContrato, setStatusContrato] = useState<StatusContrato>('ativo');
  /* A grade da aba Parcelas abre o MESMO modal do detalhe — um editor de parcela so'
     para o sistema, e ele ja' reconcilia o financeiro ao salvar. */
  const [parcelaEdit, setParcelaEdit] = useState<ParcelaGravada | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const ehEdicao = modo === 'editar';
  const ehParcelamento = form.natureza === 'parcelamento';

  /* ── MODO EDITAR — o contrato existente e o cronograma que ele ja' tem ──────── */
  const { data: contrato, isFetching: buscandoContrato } = useQuery({
    queryKey: ['obrigacao-edicao', financiamentoId],
    enabled: ehEdicao && !!financiamentoId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from('financiamentos')
        .select('*')
        .eq('id', financiamentoId!)
        .maybeSingle();
      return data ?? null;
    },
  });

  const { data: parcelasGravadas = [] } = useQuery({
    queryKey: ['obrigacao-edicao-parcelas', financiamentoId],
    enabled: ehEdicao && !!financiamentoId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from('financiamento_parcelas')
        /* `*` porque a grade agora abre o MESMO ModalBaixaParcela do detalhe, e ele
           consome data_pagamento, observacao e os dois ponteiros de lancamento. */
        .select('*')
        .eq('financiamento_id', financiamentoId!)
        .order('numero_parcela');
      return data ?? [];
    },
  });

  /**
   * O QUE AS PARCELAS TÊM — PARC-OBRIGACAO-EDICAO-01a. Safra, cultura, fase e forma de pagamento não são colunas do contrato:
   * moram no LANÇAMENTO de cada parcela. Na edição a tela as LÊ daqui e as mostra em leitura — o Salvar do contrato não as grava.
   * ⚠ PELO `financiamento_id` DO LANÇAMENTO, uma consulta só (medido: os 38 lançamentos de parcela dos 9 parcelamentos do proto o
   * têm); um `.in()` com os ids das parcelas estouraria a URL num contrato de 360. Só as linhas que SÃO de parcela contam — o
   * recorte é feito abaixo, contra `lancamento_id` das parcelas gravadas (a captação também leva `financiamento_id`).
   */
  const { data: lancamentosDoContrato } = useQuery({
    queryKey: ['obrigacao-edicao-lancamentos', financiamentoId],
    enabled: ehEdicao && !!financiamentoId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id, safra_id, cultura, fase, forma_pagamento, status_transacao, data_pagamento')
        .eq('financiamento_id', financiamentoId!)
        .eq('cancelado', false);
      const linhas = data ?? [];
      /* O NOME da safra vem do cadastro por id: a lista do hook só tem as ATIVAS, e a parcela pode estar numa inativa. */
      const idsSafra = [...new Set(linhas.map(l => l.safra_id).filter((v): v is string => !!v))];
      const nomes: Record<string, string> = {};
      if (idsSafra.length > 0) {
        const { data: cad } = await supabase.from('financeiro_safras').select('id, nome').in('id', idsSafra);
        for (const sf of cad ?? []) nomes[sf.id] = sf.nome;
      }
      return { linhas, nomes };
    },
  });
  const dasParcelas = useMemo(() => {
    const ids = new Set(parcelasGravadas.map(p => p.lancamento_id).filter((v): v is string => !!v));
    const linhas = (lancamentosDoContrato?.linhas ?? []).filter(l => ids.has(l.id));
    const nomes = lancamentosDoContrato?.nomes ?? {};
    return {
      safra: textoDasParcelas(valorComumDasParcelas(linhas.map(l => l.safra_id)), 'Sem safra', v => nomes[v] ?? 'safra fora do cadastro'),
      cultura: textoDasParcelas(valorComumDasParcelas(linhas.map(l => l.cultura)), 'Todas (rateia)',
        v => CULTURAS_LANCAMENTO.find(c => c.valor === v)?.label ?? v),
      fase: textoDasParcelas(valorComumDasParcelas(linhas.map(l => l.fase)), 'Todas (rateia)',
        v => FASES.find(f => f.valor === v)?.label ?? v),
      forma: textoDasParcelas(valorComumDasParcelas(linhas.map(l => l.forma_pagamento)), 'Nenhuma'),
    };
  }, [parcelasGravadas, lancamentosDoContrato]);
  /* PARC-CONTRATO-01 item 2 — o valor CRU que as parcelas têm em comum (ou "varia"): é contra ele que a escolha do operador é
     comparada, e é ele que o campo mostra enquanto ninguém mexeu. */
  const comumDasParcelas = useMemo((): ComumDasParcelas => {
    const ids = new Set(parcelasGravadas.map(p => p.lancamento_id).filter((v): v is string => !!v));
    const linhas = (lancamentosDoContrato?.linhas ?? []).filter(l => ids.has(l.id));
    return {
      forma_pagamento: valorComumDasParcelas(linhas.map(l => l.forma_pagamento)),
      safra_id: valorComumDasParcelas(linhas.map(l => l.safra_id)),
      cultura: valorComumDasParcelas(linhas.map(l => l.cultura)),
      fase: valorComumDasParcelas(linhas.map(l => l.fase)),
    };
  }, [parcelasGravadas, lancamentosDoContrato]);
  /* o que o operador escolheu para as parcelas (não é coluna do contrato); `undefined` = não mexeu */
  const [escolhaDasParcelas, setEscolhaDasParcelas] = useState<CamposDasParcelas>({});
  const escolher = (k: keyof CamposDasParcelas, v: string | null) => setEscolhaDasParcelas(a => ({ ...a, [k]: v }));
  /* a prévia do banco, aberta no diálogo de escopo; nada foi gravado enquanto ela está na tela */
  const [propagar, setPropagar] = useState<{ previa: PreviaDaPropagacao; campos: CamposAPropagar } | null>(null);

  const temParcelaPaga = parcelasGravadas.some(p => p.status === 'pago');
  /* Somas do rodape da grade — sobre TODAS as parcelas gravadas, nao so' as visiveis na
     rolagem. Mesmas linhas ja' carregadas; nenhuma consulta nova. */
  const parcelasPagas = parcelasGravadas.filter(p => p.status === 'pago').length;
  const somaPrincipalGravado = parcelasGravadas.reduce((a, p) => a + (Number(p.valor_principal) || 0), 0);
  const somaJurosGravado = parcelasGravadas.reduce((a, p) => a + (Number(p.valor_juros) || 0), 0);
  const somaPagoGravado = parcelasGravadas
    .filter(p => p.status === 'pago')
    .reduce((a, p) => a + (Number(p.valor_principal) || 0) + (Number(p.valor_juros) || 0), 0);

  /* ⚠ CARREGA UMA VEZ (`carregado`), e nao a cada render: o form e' de escrita, e
     re-semear a cada resposta de query apagaria o que o operador acabou de digitar. */
  /* ⚠ E SÓ COM DADO FRESCO — PARC-OBRIGACAO-EDICAO-01a. O diálogo desmonta ao fechar e o react-query guarda a última leitura:
     reaberto, ele entregava a cópia de ANTES do salvar, este efeito semeava com ela e travava (`carregado`) — a tela mostrava o
     valor antigo com o banco no novo, e salvar de novo regravava o velho por cima (Vera, contrato 4f53db54, 05/10/2026).
     `buscandoContrato` é o `isFetching` da query: enquanto a busca corre, o form ESPERA; semeia quando ela termina.
     A edição em curso continua protegida pelo `carregado`: busca que chega DEPOIS de semear não reescreve nada. */
  useEffect(() => {
    if (!ehEdicao || !contrato || carregado || buscandoContrato) return;
    /* O banco guarda a taxa MENSAL; a tela fala em ANUAL. A volta e' a inversa exata
       da ida do gravador — juros compostos, nao 12x. */
    const mensal = Number(contrato.taxa_juros_mensal) || 0;
    const anual = mensal > 0 ? (Math.pow(1 + mensal / 100, 12) - 1) * 100 : 0;
    /* O guarda estreita a EXPRESSAO, nao a propriedade: sem estas duas consts o TS
       continua vendo `string` do outro lado do ternario. */
    const naturezaBruta = contrato.natureza ?? '';
    const escopoBruto = contrato.tipo_financiamento ?? '';
    setForm({
      natureza: ehNatureza(naturezaBruta) ? naturezaBruta : 'financiamento',
      descricao: contrato.descricao ?? '',
      numero_contrato: contrato.numero_contrato ?? '',
      tipo_financiamento: ehEscopo(escopoBruto) ? escopoBruto : 'pecuaria',
      credor_id: contrato.credor_id ?? '',
      conta_bancaria_id: contrato.conta_bancaria_id ?? '',
      valor_total: Number(contrato.valor_total) || 0,
      valor_entrada: Number(contrato.valor_entrada) || 0,
      data_contrato: contrato.data_contrato ?? '',
      data_primeira_parcela: contrato.data_primeira_parcela ?? '',
      total_parcelas: Number(contrato.total_parcelas) || 0,
      taxa_juros_anual: Math.round(anual * 10000) / 10000,
      /* ⚠ `frequencia_parcela` NAO EXISTE NA TABELA — conferido em types.ts. A frequencia
         so' molda as datas na geracao e nunca e' persistida, entao aqui nao ha' o que
         restaurar. Por isso o campo NAO aparece em modo editar: mostrar 'Mensal' para um
         contrato semestral seria inventar um dado. */
      frequencia_parcela: 'mensal',
      observacao: contrato.observacao ?? '',
      plano_conta_captacao_id: contrato.plano_conta_captacao_id ?? '',
      plano_conta_parcela_id: contrato.plano_conta_parcela_id ?? '',
      gerar_lancamento_captacao: !!contrato.gerar_lancamento_captacao,
      /* ⚠ A FAZENDA HIDRATA; A FORMA DE PAGAMENTO NAO TEM DE ONDE — PAR-01c. `fazenda_id` e'
         coluna de `financiamentos` e volta do contrato. Ja' `forma_pagamento` mora no
         LANCAMENTO de cada parcela, nao no contrato: o pai nao a guarda, e inventar um valor
         aqui seria mostrar em tela algo que o banco nao disse.
         ⚠ E O GRAVADOR DE EDICAO NAO ESCREVE NENHUMA DAS DUAS (`FinanciamentoDetalhe.saveEdit`
         lista as colunas que grava, e elas nao estao la'). Este PR muda o NASCIMENTO; trocar a
         fazenda de um parcelamento ja' criado — e o que fazer com os lancamentos que ja'
         nasceram nela — e' frente propria. */
      fazenda_id: contrato.fazenda_id ?? '',
      forma_pagamento: '',
    });
    const statusBruto = contrato.status ?? '';
    setStatusContrato(ehStatusContrato(statusBruto) ? statusBruto : 'ativo');
    setCarregado(true);
  }, [ehEdicao, contrato, carregado, buscandoContrato, setForm]);

  /**
   * O CLUSTER NASCE COM A CONTA DO CONTRATO — PARC-OBRIGACAO-EDICAO-01a.
   *
   * ⚠ O DEFEITO: na edição o cluster de classificação abria VAZIO, e o efeito de espelho (abaixo) copiava esse vazio para
   * `form.plano_conta_parcela_id` — abrir o diálogo ZERAVA a conta do contrato no form e acendia a pendência "Escolha a
   * classificação da parcela". Agora ele é hidratado UMA vez, com a linha do plano que o contrato aponta: conta, macro, grupo,
   * centro e a atividade (a do plano; na falta dela, o escopo do contrato).
   * ⚠ SÓ NO PARCELAMENTO, e só depois de o form estar semeado e o plano carregado. Conta que não está no plano carregado
   * (inativa) não hidrata — e o espelho, sem hidratação, NÃO toca o form: a conta gravada fica como está.
   */
  const [clusterHidratado, setClusterHidratado] = useState(false);
  useEffect(() => {
    if (!ehEdicao || !contrato || !carregado || clusterHidratado) return;
    if (contrato.natureza !== 'parcelamento' || classificacoes.length === 0) return;
    const idDoContrato = contrato.plano_conta_parcela_id ?? '';
    const linha = idDoContrato ? classificacoes.find(c => c.id === idDoContrato) : undefined;
    if (!linha) return;
    setClassificacao(c => ({
      ...c,
      subcentro: linha.subcentro,
      macro_custo: linha.macro_custo,
      grupo_custo: linha.grupo_custo || '',
      centro_custo: linha.centro_custo,
      escopo_negocio: linha.escopo_negocio || '',
      plano_conta_id: idDoContrato,
      atividade: atividadeValida(linha.escopo_negocio) ?? atividadeValida(contrato.tipo_financiamento),
    }));
    setClusterHidratado(true);
  }, [ehEdicao, contrato, carregado, clusterHidratado, classificacoes, setClassificacao]);

  /* O cronograma gravado alimenta a previa em modo editar — ela e' so' leitura. */
  useEffect(() => {
    if (!ehEdicao || parcelasGravadas.length === 0) return;
    setParcelas(parcelasGravadas.map(p => ({
      numero: p.numero_parcela,
      data_vencimento: p.data_vencimento,
      valor_principal: Number(p.valor_principal) || 0,
      valor_juros: Number(p.valor_juros) || 0,
    })));
  }, [ehEdicao, parcelasGravadas, setParcelas]);

  const set = useCallback(
    <K extends keyof FinanciamentoForm>(k: K, v: FinanciamentoForm[K]) =>
      setForm(prev => ({ ...prev, [k]: v })),
    [setForm],
  );

  /* ── Campos numericos: TEXTO enquanto digita, min/max e reformatacao no blur/Enter.
     ⚠ O idioma do repo (133i-b, `fecharNumParcelas` do LancamentoV2Dialog). Ligar o
     campo direto ao numero com `Number(e.target.value)` — como a pagina fazia — quebra
     a digitacao: apagar tudo vira 0, e "400" nunca chega a virar 360 porque nao ha'
     momento em que o valor se fecha. Dinheiro nao entra aqui: usa `CampoMoeda` (A19). */
  const [parcelasTexto, setParcelasTexto] = useState(String(form.total_parcelas));
  const fecharParcelas = () => {
    const n = Math.max(MIN_PARCELAS, Math.min(MAX_PARCELAS, parseInt(parcelasTexto, 10) || MIN_PARCELAS));
    set('total_parcelas', n);
    setParcelasTexto(String(n));
  };

  const [jurosTexto, setJurosTexto] = useState(form.taxa_juros_anual ? String(form.taxa_juros_anual) : '');
  const fecharJuros = () => {
    const n = Math.max(0, parseMoeda(jurosTexto) ?? 0);
    set('taxa_juros_anual', n);
    setJurosTexto(n ? n.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : '');
  };

  /* ── PARC-LIVRES-01 — "Igual todo mês" × "Parcelas livres", só na CRIAÇÃO do parcelamento ──────────────
     No mensal a grade mostra a prévia (só leitura: é o que a RPC grava). Nas livres a lista é do operador, e o número de
     parcelas e a 1ª parcela do formulário passam a ser OS DA LISTA (os campos ficam em leitura). */
  const [modoParcelas, setModoParcelas] = useState<ModoDasParcelas>('mensal');
  const [parcelasLivres, setParcelasLivres] = useState<ParcelaLivre[]>([]);
  const [baseLivres, setBaseLivres] = useState<ParcelaLivre[] | null>(null);
  useEffect(() => { if (!open) { setModoParcelas('mensal'); setParcelasLivres([]); setBaseLivres(null); } }, [open]);
  const livresAbertas = !ehEdicao && form.natureza === 'parcelamento' && modoParcelas === 'livres';
  /** A prévia mensal no formato da grade (o valor da parcela é principal + juros; no parcelamento os juros são zero). */
  const previaComoParcelas = useMemo<ParcelaLivre[]>(() => parcelas.map((p) => {
    const valorCent = centavos(p.valor_principal + p.valor_juros);
    return { chave: `mensal-${p.numero}`, vencimento: p.data_vencimento, valorCent, origem: 'mensal', era: { vencimento: p.data_vencimento, valorCent } };
  }), [parcelas]);
  const trocarModoDasParcelas = (m: ModoDasParcelas) => {
    if (m === 'livres') { setParcelasLivres(previaComoParcelas); setBaseLivres(previaComoParcelas); }
    else { setParcelasLivres([]); setBaseLivres(null); }
    setModoParcelas(m);
  };
  const nLivres = parcelasLivres.length;
  const primeiroVencimentoLivre = parcelasLivres[0]?.vencimento ?? '';
  useEffect(() => {
    if (!livresAbertas) return;
    set('total_parcelas', nLivres); setParcelasTexto(String(nLivres));
    set('data_primeira_parcela', primeiroVencimentoLivre);
  }, [livresAbertas, nLivres, primeiroVencimentoLivre]);
  const motivoDasParcelas = livresAbertas ? motivoNaoSalva(parcelasLivres, centavos(Number(form.valor_total) || 0), 'o contrato') : null;

  /* ── PARC-LIVRES-01 passo 2B — EDITAR as parcelas de um parcelamento já criado ───────────────────────────────────────────
     A MESMA grade do nascimento, sobre as parcelas GRAVADAS: a paga fica apagada (data e valor não mudam) e entra na soma; a não
     paga se edita, se tira e se acrescenta. Quem grava é UMA RPC (`fn_parcelamento_editar_parcelas`): parcela, lançamento e
     contrato na mesma transação. A lista nasce UMA vez (`baseEdicao`), com o dado fresco; "Desfazer alterações" volta a ela. */
  const [gradeEdicao, setGradeEdicao] = useState<ParcelaLivre[]>([]);
  const [baseEdicao, setBaseEdicao] = useState<ParcelaLivre[] | null>(null);
  const [erroDaGrade, setErroDaGrade] = useState<string | null>(null);
  /* a RPC já gravou esta lista e o gravador do contrato falhou depois: a nova tentativa NÃO a manda de novo (a acrescentada
     entraria duas vezes) e a grade fica travada até o diálogo reabrir com o dado do banco */
  const [gradeGravada, setGradeGravada] = useState(false);
  const edicaoDeParcelamento = ehEdicao && ehParcelamento;
  /* a data LOCAL (nunca `toISOString`, que é UTC), para a leitura da situação do contrato na aba Documentos */
  const hojeLocalDosDocumentos = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  useEffect(() => { if (!open) { setGradeEdicao([]); setBaseEdicao(null); setErroDaGrade(null); setGradeGravada(false); } }, [open]);
  useEffect(() => {
    if (!edicaoDeParcelamento || !carregado || baseEdicao !== null || !lancamentosDoContrato || parcelasGravadas.length === 0) return;
    const semente = parcelasGravadasParaGrade(parcelasGravadas, lancamentosDoContrato.linhas);
    setGradeEdicao(semente); setBaseEdicao(semente);
  }, [edicaoDeParcelamento, carregado, baseEdicao, lancamentosDoContrato, parcelasGravadas]);
  const nDaGradeEdicao = gradeEdicao.length;
  useEffect(() => {
    if (!edicaoDeParcelamento || baseEdicao === null) return;
    set('total_parcelas', nDaGradeEdicao);
  }, [edicaoDeParcelamento, baseEdicao, nDaGradeEdicao]);
  const motivoDaGradeEdicao = edicaoDeParcelamento && baseEdicao !== null
    ? motivoNaoSalva(gradeEdicao, centavos(Number(form.valor_total) || 0), 'o contrato') : null;
  const gradeEdicaoMudou = edicaoDeParcelamento && baseEdicao !== null && houveEdicao(gradeEdicao, baseEdicao);

  /* Auto-gerar parcelas — mesma cadeia de dependencias da pagina. */
  useEffect(() => {
    /* ⚠ EM EDICAO NAO SE REGERA NADA. As parcelas gravadas podem ter lancamento
       vinculado (`lancamento_id` / `lancamento_juros_id`) mesmo ainda pendentes; refaze-las
       a cada tecla no valor total orfanaria esses lancamentos em silencio. */
    if (ehEdicao) return;
    if (form.valor_total > 0 && form.total_parcelas > 0 && form.data_primeira_parcela) {
      gerarParcelas();
    }
  }, [ehEdicao, form.valor_total, form.valor_entrada, form.total_parcelas, form.taxa_juros_anual, form.data_primeira_parcela, form.frequencia_parcela]);

  /* ── O plano de amortizacao do escopo ─────────────────────────────────────────
     ⚠ A TELA MOSTRA TRAVADO, MAS A COLUNA CONTINUA SENDO GRAVADA. `plano_conta_parcela_id`
     nao e' lido pelo motor no caminho de financiamento (ele fixa o plano por
     `tipo_financiamento` antes, e so' o ramo de parcelamento relê a coluna) — mas E'
     lido por `usePlanejamentoFinanceiro` (L486-489), que joga o PRINCIPAL no subcentro
     desta coluna para TODAS as naturezas. Deixa-la nula tiraria a amortizacao do
     Planejamento Financeiro, calada. Por isso o campo travado nao e' so' enfeite: ele
     preenche com o MESMO id que o motor usaria. */
  const idAmortizacaoEscopo = useMemo(
    () => planosSaida.find(p => p.subcentro === SUBCENTRO_AMORTIZACAO[form.tipo_financiamento])?.id ?? '',
    [planosSaida, form.tipo_financiamento],
  );

  useEffect(() => {
    /* ⚠ EM EDIÇÃO, NADA ANTES DE O FORM SER SEMEADO — PARC-OBRIGACAO-EDICAO-01a. Antes disso o `form` é o de fábrica (um
       financiamento vazio), e este efeito escrevia nele a conta de amortização do escopo. Quando o plano e o contrato chegavam
       no MESMO ciclo, esse `set` (updater sobre o estado vivo) caía DEPOIS da semeadura e trocava a conta do contrato pela de
       amortização — que o ramo do parcelamento, logo abaixo, zerava. Achado pelo teste da conta fora do plano carregado. */
    if (ehEdicao && !carregado) return;
    if (ehParcelamento) {
      /* Virou parcelamento: o id de amortizacao herdado nao serve — a lista e' outra
         (saidas operacionais) e quem escolhe e' o operador. */
      if (form.plano_conta_parcela_id && form.plano_conta_parcela_id === idAmortizacaoEscopo) {
        set('plano_conta_parcela_id', '');
        return;
      }
      /* ⚠ QUEM ESCOLHE A CONTA AGORA E' O CLUSTER — PAR-01c, e esta linha e' a costura.
         `plano_conta_parcela_id` continua sendo a coluna que o contrato grava e que as
         pendencias, o resumo e o gravador leem; o que mudou e' de onde o valor VEM. Espelhar
         aqui, num lugar so', evitou reescrever esses tres consumidores — e evitou que a
         classificacao passasse a ter duas fontes. */
      const doCluster = classificacao.plano_conta_id ?? '';
      /* ⚠ EM EDIÇÃO O CLUSTER SÓ MANDA DEPOIS DE HIDRATADO (ou de o operador escolher uma conta) — PARC-OBRIGACAO-EDICAO-01a.
         Antes disso ele está vazio por não ter sido preenchido, não por decisão de ninguém; copiá-lo zerava a conta do contrato. */
      if (ehEdicao && !clusterHidratado && !doCluster) return;
      if (form.plano_conta_parcela_id !== doCluster) set('plano_conta_parcela_id', doCluster);
      return;
    }
    /* ⚠ EM EDICAO SO' PREENCHE O VAZIO. Um contrato antigo pode apontar para outro plano,
       e `usePlanejamentoFinanceiro` joga o principal no subcentro DESTA coluna: reescreve-la
       ao abrir o modal mudaria de bucket um contrato que ninguem pediu para mudar. */
    if (ehEdicao && form.plano_conta_parcela_id) return;
    if (idAmortizacaoEscopo && form.plano_conta_parcela_id !== idAmortizacaoEscopo) {
      set('plano_conta_parcela_id', idAmortizacaoEscopo);
    }
  }, [ehEdicao, carregado, ehParcelamento, idAmortizacaoEscopo, form.plano_conta_parcela_id, classificacao.plano_conta_id, clusterHidratado, set]);

  /* ── PENDENCIAS — a MESMA cadeia que ja desabilitava o botao, agora como lista ──
     ⚠ MESMAS REGRAS, MESMAS FRASES, MESMA ORDEM da pagina: o que muda e' que cada uma
     sabe em que aba mora, para a aba poder contar as suas. Nenhuma regra nova — o
     `salvar()` continua sendo a segunda barreira. */
  const pendencias = useMemo(() => {
    const lista: Array<{ aba: Aba; texto: string }> = [];
    if (!form.descricao?.trim()) lista.push({ aba: 'contrato', texto: 'Informe a descrição do contrato.' });
    if (!Number(form.valor_total)) lista.push({ aba: 'parcelas', texto: 'Informe o valor total.' });
    if (!form.data_contrato) lista.push({ aba: 'contrato', texto: 'Informe a data do contrato.' });
    /* PARC-LIVRES-01 — nas livres quem fala é a grade: a MESMA função que ela lê (`motivoNaoSalva`). */
    if (motivoDasParcelas) lista.push({ aba: 'parcelas', texto: motivoDasParcelas });
    else if (motivoDaGradeEdicao) lista.push({ aba: 'parcelas', texto: motivoDaGradeEdicao });
    else if (!livresAbertas) {
      if (!form.data_primeira_parcela) lista.push({ aba: 'parcelas', texto: 'Informe a data da 1ª parcela.' });
      if (!Number(form.total_parcelas)) lista.push({ aba: 'parcelas', texto: 'Informe o número de parcelas.' });
    }
    if (ehParcelamento && !form.plano_conta_parcela_id) lista.push({ aba: 'classificacao', texto: 'Escolha a classificação da parcela' });
    /* ⚠ A FAZENDA E' OBRIGATORIA NO PARCELAMENTO — PAR-01c, e a RPC recusa sem ela. A pendencia
       existe para o operador ler a frase ANTES de clicar, em vez de receber de volta a recusa do
       banco: o botao ja fica desabilitado com o motivo no `title`. */
    if (ehParcelamento && !form.fazenda_id) lista.push({ aba: 'contrato', texto: 'Escolha a fazenda do parcelamento.' });
    return lista;
  }, [form.descricao, form.valor_total, form.data_contrato, form.data_primeira_parcela,
      form.total_parcelas, form.plano_conta_parcela_id, form.fazenda_id, ehParcelamento, motivoDasParcelas, livresAbertas, motivoDaGradeEdicao]);

  const primeiraPendencia = pendencias[0]?.texto ?? null;
  const contarPendencias = (a: Aba) => pendencias.filter(p => p.aba === a).length;

  /* ── Nomes para o resumo ──────────────────────────────────────────────────────
     O credor vem da MESMA query por id do CredorAutocomplete (mesma queryKey — o
     react-query serve as duas da mesma entrada de cache, sem segunda ida ao banco). */
  const { data: credor } = useQuery({
    queryKey: ['credor-por-id', clienteId, form.credor_id],
    enabled: !!clienteId && !!form.credor_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_fornecedores')
        .select('id, nome')
        .eq('cliente_id', clienteId)
        .eq('id', form.credor_id)
        .maybeSingle();
      return data ?? null;
    },
  });

  /* ── GUARD: a conta do contrato pode nao estar na lista ──────────────────────
     ⚠ CONTA QUE NAO APARECE E' CONTA QUE PARECE NAO EXISTIR. A lista traz so' as ATIVAS
     dos quatro tipos; um contrato antigo pode apontar para uma conta desativada depois,
     ou de um tipo que ainda nao entrou. Sem isto o seletor abre no placeholder e o
     resumo diz "—" para um contrato que TEM conta — a mesma classe de defeito que o
     PR-PARC-04 fechou no credor.
     ⚠ O valor gravado nunca depende desta lista: `form.conta_bancaria_id` vem do
     contrato e so' muda se o operador trocar. Ausencia na lista jamais vira `null`. */
  const contaForaDaLista = !!form.conta_bancaria_id && !contas.some(c => c.id === form.conta_bancaria_id);

  const { data: contaAvulsa } = useQuery({
    queryKey: ['conta-por-id', clienteId, form.conta_bancaria_id],
    enabled: contaForaDaLista && !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_contas_bancarias')
        .select('id, nome_conta, nome_exibicao, banco, tipo_conta, ativa')
        .eq('cliente_id', clienteId)
        .eq('id', form.conta_bancaria_id)
        .maybeSingle();
      return data ?? null;
    },
  });

  /* A conta avulsa entra na lista do seletor com sufixo, para o operador entender por
     que ela nao esta' entre as demais — e continuar podendo trocar. */
  const contasComAtual = useMemo(() => {
    if (!contaAvulsa) return contas;
    const sufixo = contaAvulsa.ativa === false ? ' (inativa)' : '';
    return [
      ...contas,
      {
        id: contaAvulsa.id,
        nome_conta: contaAvulsa.nome_conta,
        nome_exibicao: (contaAvulsa.nome_exibicao || contaAvulsa.nome_conta) + sufixo,
        banco: contaAvulsa.banco,
        tipo_conta: contaAvulsa.tipo_conta,
      },
    ];
  }, [contas, contaAvulsa]);

  const nomeConta = useMemo(() => {
    const c = contasComAtual.find(x => x.id === form.conta_bancaria_id);
    return c ? (c.nome_exibicao || c.nome_conta) : null;
  }, [contasComAtual, form.conta_bancaria_id]);

  const nomePlano = (lista: Array<{ id: string; subcentro: string | null; centro_custo: string | null }>, id: string) => {
    const p = lista.find(x => x.id === id);
    return p ? (p.subcentro || p.centro_custo) : null;
  };

  const nomeCaptacao = nomePlano(planosEntrada, form.plano_conta_captacao_id);
  /**
   * ⚠ O NOME DA CONTA VEM DO CLUSTER NO PARCELAMENTO — PAR-01c.
   *
   * `planosParcelamento` e' a lista PENEIRADA (saidas operacionais, sem "Saida Financeira" nem
   * "Transferencias"); o cluster escolhe sobre o plano INTEIRO. Uma conta valida que a peneira
   * nao contem faria o `find` devolver `null` e o resumo mostrar "—" ao lado de um contrato que
   * TEM classificacao — e "—" significa dado ausente, nunca "nao procurei direito".
   * O `subcentro` que o cluster ja' resolveu e' a resposta, sem segunda busca.
   */
  const nomeParcela = ehParcelamento
    ? (classificacao.subcentro || nomePlano(planosParcelamento, form.plano_conta_parcela_id))
    : nomePlano(planosParcelamento, form.plano_conta_parcela_id);

  const valorParcela = parcelas.length > 0 ? parcelas[0].valor_principal + parcelas[0].valor_juros : null;
  const ultimaParcela = parcelas.length > 0 ? parcelas[parcelas.length - 1].data_vencimento : '';

  const handleSalvar = async () => {
    if (ehEdicao) {
      if (!onSalvarEdicao) return;
      setSalvandoEdicao(true);
      /* PARC-LIVRES-01 2B — as PARCELAS primeiro, pela RPC (parcela + lançamento + total, uma transação). Recusou: a frase fica
         escrita ao lado do botão e NADA mais é gravado. Só depois o contrato (os campos dele). */
      if (gradeEdicaoMudou && !gradeGravada && financiamentoId) {
        setErroDaGrade(null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
        const { error } = await (supabase as any).rpc('fn_parcelamento_editar_parcelas', {
          p_financiamento_id: financiamentoId,
          p_parcelas: parcelasParaEditar(gradeEdicao),
          p_valor_total: form.valor_total,
        });
        if (error) {
          setErroDaGrade(typeof error.message === 'string' && error.message ? error.message : 'Não foi possível gravar as parcelas. Nada foi gravado.');
          setSalvandoEdicao(false);
          return;
        }
        /* gravada: lista, Conciliação e CPR releem sozinhas */
        setGradeGravada(true);
        qc.invalidateQueries({ queryKey: ['obrigacao-edicao-parcelas', financiamentoId] });
        qc.invalidateQueries({ queryKey: ['obrigacao-edicao-lancamentos', financiamentoId] });
        qc.invalidateQueries({ queryKey: ['cpr-lancs'] });
        if (clienteId) notificarLancamentosMudaram(clienteId);
      }
      /* PARC-CONTRATO-01 item 2 — a edição do contrato chega às parcelas? Quem responde é o BANCO (a prévia da MESMA função que
         grava). Se algum lançamento mudaria, abre o diálogo de escopo e NADA é gravado ainda; se nenhum, segue como sempre. */
      if (edicaoDeParcelamento && financiamentoId && contrato) {
        const campos = camposAPropagar(
          { descricao: contrato.descricao ?? '', credor_id: contrato.credor_id ?? '', conta_bancaria_id: contrato.conta_bancaria_id ?? '', fazenda_id: contrato.fazenda_id ?? '', plano_conta_id: contrato.plano_conta_parcela_id ?? '' },
          { descricao: form.descricao ?? '', credor_id: form.credor_id ?? '', conta_bancaria_id: form.conta_bancaria_id ?? '', fazenda_id: form.fazenda_id ?? '', plano_conta_id: form.plano_conta_parcela_id ?? '' },
          escolhaDasParcelas, comumDasParcelas);
        if (Object.keys(campos).length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
          const { data, error } = await (supabase as any).rpc('fn_parcelamento_propagar', {
            p_financiamento_id: financiamentoId, p_campos: campos, p_escopo: 'todos', p_simular: true,
          });
          const previa = error ? null : lerPreviaDaPropagacao(data);
          if (!previa) {
            setErroDaGrade(typeof error?.message === 'string' && error.message ? error.message : 'Não foi possível calcular o que muda nas parcelas. Nada foi gravado.');
            setSalvandoEdicao(false);
            return;
          }
          if (previa.alteradas.todos > 0) {
            setPropagar({ previa, campos });
            setSalvandoEdicao(false);
            return;
          }
        }
      }
      const ok = await onSalvarEdicao(form, { status: statusContrato });
      setSalvandoEdicao(false);
      if (ok) onSalvo?.();
      return;
    }
    /* PARC-CONTRATO-01 item 3 — contrato JÁ gravado e documento que falhou: o Salvar tenta de novo SÓ os documentos */
    if (posCriacao) {
      setErroDaGrade(null);
      const falha = await gravarDocumentosDoContratoNovo(posCriacao.id);
      if (falha) { setPosCriacao({ id: posCriacao.id, erro: falha }); return; }
      setPosCriacao(null);
      onSalvo?.();
      return;
    }
    /* os documentos pendentes (a NF da compra, ligada às N; o boleto de cada parcela) são gravados DEPOIS de o contrato nascer,
       pelo mesmo pós-salvar do lançamento parcelado. Falhou um: o contrato FICA e a frase diz qual documento não gravou. */
    let criado: string | null = null; let falha: string | null = null;
    const ok = await salvar(destinacoes, livresAbertas ? parcelasParaPayload(parcelasLivres) : null,
      ehParcelamento && pendentesDaCriacao.length > 0
        ? async (id) => { criado = id; falha = await gravarDocumentosDoContratoNovo(id); }
        : undefined);
    if (ok && criado && falha) { setPosCriacao({ id: criado, erro: falha }); setAba('documentos'); return; }
    if (ok) onSalvo?.();
  };

  /* O "Salvar" do diálogo de escopo: UMA gravação atômica no banco (contrato + lançamentos das parcelas) e, depois, o gravador
     do contrato de sempre para os campos que não se propagam. Recusou: devolve a frase, que fica escrita ao lado do botão. */
  const salvarComEscopo = async (escopo: EscopoDePropagacao): Promise<string | null> => {
    if (!propagar || !financiamentoId || !onSalvarEdicao) return 'Nada a gravar.';
    let gravadas = 0;
    if (escopo !== 'nenhum') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_parcelamento_propagar', {
        p_financiamento_id: financiamentoId, p_campos: propagar.campos, p_escopo: escopo, p_simular: false,
      });
      const feito = error ? null : lerPreviaDaPropagacao(data);
      if (!feito) return typeof error?.message === 'string' && error.message ? error.message : 'O banco recusou a gravação. Nada foi gravado.';
      gravadas = feito.gravadas;
      qc.invalidateQueries({ queryKey: ['obrigacao-edicao-lancamentos', financiamentoId] });
      qc.invalidateQueries({ queryKey: ['financiamento-safra-das-parcelas', financiamentoId] });
      qc.invalidateQueries({ queryKey: ['cpr-lancs'] });
      if (clienteId) notificarLancamentosMudaram(clienteId);
    }
    const ok = await onSalvarEdicao(form, { status: statusContrato, parcelasAtualizadas: gravadas });
    if (!ok) return 'As parcelas foram gravadas, mas o contrato não: confira os campos e salve de novo.';
    setPropagar(null);
    onSalvo?.();
    return null;
  };

  /* ── PARC-CONTRATO-01 item 3 — DOCUMENTOS AO CRIAR: pendentes em memória, gravados junto com o Salvar ─────────────────── */
  const [pendentesDaCriacao, setPendentesDaCriacao] = useState<DocumentoPendente[]>([]);
  /* o contrato nasceu e algum documento não gravou: guarda o id para o "tentar de novo" não criar outro contrato */
  const [posCriacao, setPosCriacao] = useState<{ id: string; erro: string } | null>(null);
  /* o que o XML preencheu — a tela diz, em âmbar; nada é gravado ao importar */
  const [recadoDoXml, setRecadoDoXml] = useState<string | null>(null);
  const gravarDocumentosDoContratoNovo = async (id: string): Promise<string | null> => {
    if (!clienteId) return 'Contrato gravado, mas sem cliente para gravar os documentos.';
    const gravadas = await lancamentosDoParcelamento(id);
    if (gravadas.length === 0) return 'Contrato gravado, mas as parcelas não foram encontradas: anexe os documentos pelo Editar obrigação.';
    const lista = await gravarDocumentosDoParcelamento(clienteId, gravadas, pendentesDaCriacao);
    setPendentesDaCriacao(lista);
    if (todosGravados(lista)) return null;
    const f = lista.find(p => !p.gravado);
    const qual = f ? (f.parcela != null ? `o boleto da parcela ${f.parcela}` : `o documento "${f.payload.nome || f.payload.numero || f.payload.especie}"`) : 'um documento';
    return `Contrato gravado. Não foi gravado ${qual}: ${f?.erro ?? 'falha'}. Clique em salvar para tentar de novo.`;
  };
  /* as parcelas que o contrato VAI criar, como a grade dos boletos as lê (só as que já têm data e valor) */
  const parcelasParaOsBoletos = useMemo(() => (livresAbertas ? parcelasLivres : previaComoParcelas)
    .map((p, i) => ({ numero: i + 1, dataVencimento: p.vencimento, valor: p.valorCent / 100 }))
    .filter(p => p.dataVencimento && p.valor > 0), [livresAbertas, parcelasLivres, previaComoParcelas]);
  /* IMPORTAR XML NA CRIAÇÃO: preenche o contrato novo (credor pelo CNPJ/CPF, valor, emissão, duplicatas → parcelas livres) e
     guarda a NF como pendente com o XML. NADA é gravado. */
  const preencherPelaNota = async (nota: NotaLida, arquivo: File) => {
    const feito: string[] = [];
    let credorId: string | null = null;
    if (clienteId && nota.emitente.documento) {
      /* o documento é gravado com máscaras variadas: procura pelos dígitos em ordem, com qualquer coisa entre eles */
      const { data } = await supabase.from('financeiro_fornecedores').select('id, nome, cpf_cnpj')
        .eq('cliente_id', clienteId).ilike('cpf_cnpj', `%${nota.emitente.documento.split('').join('%')}%`).limit(2);
      if (data && data.length === 1) { credorId = data[0].id; set('credor_id', data[0].id); feito.push('credor'); }
    }
    const valorCent = nota.duplicatas.length > 0 ? nota.somaDuplicatasCent : nota.totais.notaCent;
    set('valor_total', valorCent / 100); feito.push('valor');
    if (nota.emissao) { set('data_contrato', nota.emissao); feito.push('data do contrato'); }
    if (nota.duplicatas.length > 0) {
      const lista = parcelasDaNota(nota.duplicatas.map(d => ({ vencimento: d.vencimento, valorCent: d.valorCent })));
      setModoParcelas('livres'); setParcelasLivres(lista); setBaseLivres(lista);
      feito.push(`${lista.length} ${lista.length === 1 ? 'parcela' : 'parcelas'}`);
    }
    setPendentesDaCriacao(l => [...l.filter(p => !(p.parcela == null && p.payload.especie === 'nf' && p.payload.chaveAcesso === nota.chave)),
      novoPendente({
        especie: 'nf', nome: `nf ${nota.numero}`, numero: nota.numero, serie: nota.serie || null, chaveAcesso: nota.chave,
        dataEmissao: nota.emissao, valorDocumento: nota.totais.notaCent / 100,
        emitenteId: credorId, emitenteNome: credorId ? null : nota.emitente.nome, emitenteDocumento: credorId ? null : nota.emitente.documento,
      }, arquivo, null)]);
    setRecadoDoXml(`Da NF ${nota.numero}: ${feito.join(', ')}${credorId ? '' : ' · credor não encontrado pelo CNPJ/CPF: escolha no contrato'} · nada foi gravado`);
  };

  const gravando = saving || salvandoEdicao;

  const subtitulo = ehParcelamento
    ? 'Uma despesa paga em N vezes. Ela gera as parcelas, e as parcelas geram os lançamentos.'
    : 'Um crédito contratado. Ele gera as parcelas, e cada parcela gera amortização e juros.';

  /* PARC-CONTRATO-01 item 3: a aba Documentos existe também ao CRIAR um parcelamento (os documentos ficam pendentes até o Salvar) */
  const abaDeDocumentos: Array<{ key: Aba; label: string }> = ehParcelamento ? [{ key: 'documentos', label: 'Documentos' }] : [];
  const abas: Array<{ key: Aba; label: string }> = [
    { key: 'contrato', label: 'Contrato' },
    { key: 'parcelas', label: 'Parcelas' },
    { key: 'classificacao', label: 'Classificação' },
    /* PARC-LIVRES-01 passo 6 — só na EDIÇÃO de PARCELAMENTO: os documentos moram nos lançamentos das parcelas, que só existem
       depois de o contrato nascer; financiamento com juros fica fora deste PR. */
    ...abaDeDocumentos,
  ];

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ⚠ ENVELOPE CANONICO DAS CASCAS PROPRIAS (LancamentosTab:5741, o mesmo que o
          CompraModalShell recebe): `p-0 gap-0 overflow-hidden` e o X nativo escondido.
          Sem `gap-0` o DialogContent injeta `gap-4` entre cabecalho, abas, corpo e
          rodape; sem esconder o X nativo ficam DOIS botoes de fechar sobrepostos. */}
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden [&>button.absolute]:hidden">
        <div className="flex flex-col">
          {/* ── CABECALHO ───────────────────────────────────────────────────────── */}
          <div className="bg-primary text-primary-foreground px-6 py-2.5 flex items-start justify-between">
            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold leading-tight">
              {ehEdicao ? 'Editar obrigação' : 'Nova obrigação'}
            </DialogTitle>
              {/* A frase muda com a natureza porque a CADEIA muda: no parcelamento nao
                  existe captacao nem juros, e prometer "crédito contratado" ali ensina
                  errado o operador. */}
              <DialogDescription className="mt-1 text-xs text-white/80">{subtitulo}</DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-white/80 hover:text-white shrink-0"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>

          <Tabs value={aba} onValueChange={(v) => { if (ehAba(v)) setAba(v); }} className="flex flex-col">
            {/* ── BARRA DE ABAS ──────────────────────────────────────────────────
                A contagem de pendencias por aba e' MARCADOR, nao parede: navegar
                nunca e' bloqueado — o operador so' precisa saber onde falta algo,
                inclusive olhando de outra aba. */}
            <div className="bg-card border-b px-6 py-1.5">
              <TabsList className="h-auto bg-transparent p-0 gap-1">
                {abas.map(a => {
                  const n = contarPendencias(a.key);
                  return (
                    <TabsTrigger
                      key={a.key}
                      value={a.key}
                      className="px-3 py-1 text-[12px] font-semibold data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none -mb-px"
                    >
                      {a.label}
                      {n > 0 && (
                        <span className="ml-1.5 text-[10px] font-medium text-amber-600 dark:text-amber-500">
                          ● {n} {n === 1 ? 'pendência' : 'pendências'}
                        </span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            {/* ── CORPO ──────────────────────────────────────────────────────────
                ⚠ A ROLAGEM MORA NAS COLUNAS, NAO NO CORPO (A21). Se o corpo rolasse,
                o resumo lateral subiria junto e sumiria — foi o defeito que o
                CompraModalShell ja pagou. `grid-rows-[minmax(0,1fr)]` e `min-h-0`
                nao sao decorativos: item de grid nasce `min-height:auto` e se recusa
                a encolher abaixo do conteudo, o que DESLIGA a rolagem da coluna e
                deixa o conteudo ser cortado pelo `overflow-hidden`.
                ⚠ SO A PARTIR DE `lg`: abaixo disso as colunas viram linhas empilhadas
                e altura fixa por coluna cortaria o resumo — ali o corpo rola inteiro. */}
            <div className={`grid grid-cols-1 lg:grid-cols-[1fr_280px] lg:grid-rows-[minmax(0,1fr)] gap-3 p-4 ${ALTURA_CORPO} overflow-y-auto lg:overflow-hidden bg-muted/30`}>
              <div className="space-y-2 min-w-0 lg:min-h-0 lg:overflow-y-auto">

                {/* ══ ABA CONTRATO ══════════════════════════════════════════════ */}
                <TabsContent value="contrato" className="mt-0 space-y-2.5">
                  {/* ⚠ PRIMEIRO CAMPO DA TELA. A natureza governa o resto (esconde
                      juros e captacao, troca a lista da classificacao); um campo que
                      muda os outros nao pode vir depois deles. */}
                  <div>
                    <Label className={ROTULO}>Natureza *</Label>
                    <div className="mt-0.5 grid grid-cols-3 gap-2">
                      {ORDEM_NATUREZA.map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => set('natureza', n)}
                          className={`rounded-md border px-2.5 py-2 text-left transition-colors ${
                            form.natureza === n ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
                          }`}
                        >
                          <div className="text-[12px] font-semibold leading-tight">{NOME_NATUREZA[n]}</div>
                          <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{APOIO_NATUREZA[n]}</div>
                        </button>
                      ))}
                    </div>
                    {/* ⚠ AVISO, NAO TRAVA. Trocar a natureza muda para onde as PROXIMAS
                        parcelas vao (o motor le' a natureza a cada reconciliacao), mas nao
                        desfaz lancamento ja' gerado por parcela paga. Quem troca precisa
                        saber disso ANTES, nao descobrir conferindo o caixa. */}
                    {ehEdicao && temParcelaPaga && (
                      <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-500">
                        Trocar a natureza não refaz parcelas pagas
                      </p>
                    )}
                  </div>

                  {/* ⚠ A QUARTA COLUNA SO' EXISTE SE A SITUACAO EXISTIR — OBRIGACAO-UI-02.
                      Ela hospeda o campo "Situacao do contrato", que agora some tambem ao editar
                      um parcelamento; manter `[2fr_1fr_1fr_1fr]` deixaria um quarto de linha
                      vazio a' direita, que e' o mesmo defeito que este PR veio tirar da Forma. */}
                  <div className={`grid gap-2 ${ehEdicao && !ehParcelamento ? 'grid-cols-[2fr_1fr_1fr_1fr]' : 'grid-cols-[2fr_1fr_1fr]'}`}>
                    <div>
                      <Label className={ROTULO}>Descrição *</Label>
                      <Input className={CAMPO} value={form.descricao}
                        onChange={e => set('descricao', e.target.value)}
                        placeholder="Ex: Custeio safra 2025" />
                    </div>
                    <div>
                      <Label className={ROTULO}>Nº do contrato</Label>
                      <Input className={CAMPO} value={form.numero_contrato}
                        onChange={e => set('numero_contrato', e.target.value)}
                        placeholder="opcional" />
                    </div>
                    <div>
                      {/* "Escopo", nao "Tipo": desde que a natureza existe, "tipo"
                          ficou ambiguo. Coluna e valores continuam os mesmos. */}
                      <Label className={ROTULO}>Escopo *</Label>
                      <Select value={form.tipo_financiamento} onValueChange={v => { if (ehEscopo(v)) set('tipo_financiamento', v); }}>
                        <SelectTrigger className={CAMPO}><SelectValue /></SelectTrigger>
                        <SelectContent position="popper" className={SELECT_POPPER}>
                          <SelectItem value="pecuaria">Pecuária</SelectItem>
                          <SelectItem value="agricultura">Agricultura</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* ⚠ SO' NA EDICAO. Na criacao nao ha' o que escolher — todo contrato
                        nasce 'ativo' e quem fixa isso e' o gravador; oferecer "Quitado" a um
                        contrato que ainda nao existe seria um campo que nao decide nada. */}
                    {/* ⚠ E NEM AO EDITAR UM PARCELAMENTO — OBRIGACAO-UI-02. O campo ja' nao
                        existia na criacao (todo contrato nasce 'ativo'); agora tambem some do
                        parcelamento em edicao. Um parcelamento nao tem "situacao de contrato" a
                        governar: ele e' N despesas, e quem diz se acabaram sao as parcelas. */}
                    {ehEdicao && !ehParcelamento && (
                      <div>
                        <Label className={ROTULO}>Situação do contrato</Label>
                        <Select value={statusContrato} onValueChange={v => { if (ehStatusContrato(v)) setStatusContrato(v); }}>
                          <SelectTrigger className={CAMPO}><SelectValue /></SelectTrigger>
                          <SelectContent position="popper" className={SELECT_POPPER}>
                            <SelectItem value="ativo">Ativo</SelectItem>
                            <SelectItem value="quitado">Quitado</SelectItem>
                            <SelectItem value="cancelado">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* ⚠ TRES COLUNAS SO' NO PARCELAMENTO — a Fazenda entra ao lado do Credor e da
                      Conta porque as tres respondem "de quem, de onde, para qual fazenda". */}
                  <div className={`grid gap-2 ${ehParcelamento ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {/* ⚠ A FAZENDA SO' EXISTE NO PARCELAMENTO — PAR-01c. Financiamento e
                        emprestimo continuam nascendo na fazenda Administrativo, fixada pelo
                        gravador e sem campo aqui: a regra nao foi revogada, foi DELIMITADA. O
                        parcelamento e' N despesas operacionais (o IPTU de uma fazenda, o seguro
                        de um maquinario), e manda-las para o Administrativo tiraria essas N
                        parcelas do rateio da fazenda que de fato as gastou.
                        ⚠ `forcaAdministrativo` NAO E' O CONTRARIO DISSO: se a conta escolhida no
                        cluster for administrativa, a propria regra da casa devolve a fazenda ao
                        Administrativo e trava o campo — a mesma porta que desliga a safra. */}
                    {ehParcelamento && (
                      <div>
                        <Label className={ROTULO}>Fazenda *</Label>
                        <FazendaSelect
                          value={form.fazenda_id}
                          onChange={(id) => set('fazenda_id', id)}
                          fazendas={fazendas}
                          forcaAdministrativo={ehAdministrativo}
                          triggerClassName={CAMPO}
                          hideAviso
                        />
                        <p className={APOIO}>Onde a despesa cai</p>
                      </div>
                    )}
                    <div>
                      <Label className={ROTULO}>Credor</Label>
                      {clienteId && (
                        <CredorAutocomplete
                          value={form.credor_id || ''}
                          onChange={(id) => set('credor_id', id)}
                          clienteId={clienteId}
                        />
                      )}
                    </div>
                    <div>
                      <Label className={ROTULO}>Conta bancária *</Label>
                      <ContaBancariaSelect
                        value={form.conta_bancaria_id}
                        onValueChange={(v) => set('conta_bancaria_id', v)}
                        contas={contasComAtual}
                        placeholder="Selecione"
                        showBankDetails="banco"
                        className={CAMPO}
                      />
                      <p className={APOIO}>De onde saem as parcelas</p>
                    </div>
                  </div>

                  {/* ⚠ A FORMA DE PAGAMENTO E' DO LANCAMENTO, NAO DO CONTRATO — PAR-01c, e e'
                      por isso que ela so' aparece no parcelamento e nao ao lado da Conta lá em
                      cima. `financiamentos` nao tem esta coluna; quem a tem e' cada PARCELA, que
                      nasce linha de `financeiro_lancamentos_v2`. A RPC a repassa para as N.
                      ⚠ AS OITO SAO AS DO MODAL DO FINANCEIRO, lidas do mesmo const — e' a MESMA
                      coluna do banco, entao oferecer um vocabulario diferente aqui faria a
                      parcela nascer com uma forma que a tela que a edita nao sabe mostrar.
                      ⚠ NAO E' A LISTA DA OC (`formasPagamento.ts`, com Cheque): aquela serve
                      `zoo_operacao_parcelas_programacao.forma`, outra tabela.
                      ⚠ OPCIONAL, e "Nenhuma" grava NULO — ausencia, nunca a palavra. */}
                  {/* ⚠ UMA LINHA SO', E AS LARGURAS SEGUEM O CONTEUDO — OBRIGACAO-UI-02.
                      A Forma morava num `grid-cols-2` com UM filho: metade da linha ocupada e
                      metade VAZIA a direita, que se le como campo que faltou carregar. Agora as
                      tres dividem a mesma faixa, e a Observacao — que e' texto livre e a unica
                      que cresce com o conteudo — fica com o dobro das outras duas.
                      ⚠ SEM A FORMA (financiamento/emprestimo) A GRADE VIRA DE DUAS, nao de tres
                      com um vao: esconder a celula mantendo o `[1fr_1fr_2fr]` deixaria o buraco
                      que este item veio tirar. */}
                  <div className={`grid gap-2 ${ehParcelamento ? 'grid-cols-[1fr_1fr_2fr]' : 'grid-cols-[1fr_2fr]'}`}>
                    {ehParcelamento && (
                      ehEdicao ? (
                      /* ⚠ EM EDIÇÃO É LEITURA — PARC-OBRIGACAO-EDICAO-01a. A forma mora em cada PARCELA e o Salvar do contrato
                         não a grava: o campo aceitava a escolha e a jogava fora. Agora mostra o que as parcelas têm (o valor,
                         ou "varia entre as parcelas"); o motivo vai na linha de baixo, inteiro. */
                      <div>
                        <Label className={ROTULO}>Forma de pagamento</Label>
                        <CampoDasParcelas testid="forma-das-parcelas" comum={comumDasParcelas.forma_pagamento} escolhido={escolhaDasParcelas.forma_pagamento}
                          vazio="Nenhuma" opcoes={FORMAS_PAGAMENTO_V2.map(v => ({ valor: v, label: v }))} aoMudar={v => escolher('forma_pagamento', v)} />
                        <p className={APOIO}>Das parcelas</p>
                      </div>
                      ) : (
                      <div>
                        <Label className={ROTULO}>Forma de pagamento</Label>
                        <Select
                          value={form.forma_pagamento || FORMA_PAGAMENTO_V2_NENHUMA}
                          onValueChange={v => set('forma_pagamento', v === FORMA_PAGAMENTO_V2_NENHUMA ? '' : v)}
                        >
                          <SelectTrigger className={CAMPO}><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent position="popper" className={SELECT_POPPER}>
                            <SelectItem value={FORMA_PAGAMENTO_V2_NENHUMA}>Nenhuma</SelectItem>
                            {FORMAS_PAGAMENTO_V2.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <p className={APOIO}>Vai em cada parcela</p>
                      </div>
                      )
                    )}
                    <div>
                      <Label className={ROTULO}>Data do contrato *</Label>
                      <DatePicker value={form.data_contrato} onChange={v => set('data_contrato', v)} />
                    </div>
                    <div>
                      <Label className={ROTULO}>Observação</Label>
                      <Input className={CAMPO} value={form.observacao}
                        onChange={e => set('observacao', e.target.value)}
                        placeholder="opcional" />
                    </div>
                  </div>
                  {ehEdicao && ehParcelamento && (
                    <p data-testid="motivo-forma" className="truncate text-[10px] leading-[14px] text-muted-foreground"
                      title={MOTIVO_VALE_POR_PARCELA}>
                      Forma de pagamento: {MOTIVO_VALE_POR_PARCELA}
                    </p>
                  )}
                </TabsContent>

                {/* ══ ABA PARCELAS ══════════════════════════════════════════════ */}
                <TabsContent value="parcelas" className="mt-0 space-y-2.5">
                  {/* ⚠ CAMPO NAO ESTICA PARA PREENCHER LINHA (PR-PARC-05b item 2). Um
                      campo de valor com 300px de largura nao aceita mais digito nenhum —
                      so' anuncia importancia que nao tem, e afasta o rotulo do numero. A
                      grade e' de 4 colunas com teto de 200px por campo; a quarta fica
                      VAZIA de proposito. */}
                  {/* ⚠ A GRADE ACOMPANHA O CAMPO QUE SUMIU — PAR-01c. Sem a entrada, o
                      parcelamento tem dois campos nesta linha; manter `grid-cols-3` deixaria
                      um vão de uma coluna no meio da linha, e a Lei da Estabilidade Visual vale
                      também para o espaço vazio. */}
                  {/* ⚠ UMA LINHA SO' NO PARCELAMENTO — OBRIGACAO-UI-02. Sem entrada e sem
                      juros, sobram QUATRO campos (valor, N, 1a parcela, frequencia) que estavam
                      em DUAS linhas de dois — e cada linha custa rotulo + campo + a linha de
                      apoio embaixo. Juntas, some uma faixa inteira do topo da aba.
                      ⚠ `contents` E' O MECANISMO, e e' o mesmo de que o cluster de classificacao
                      ja' depende: um elemento `display:contents` some do layout e seus filhos
                      viram itens da grade do AVO. Assim as duas grades internas continuam
                      existindo — com suas proprias regras de coluna para financiamento e para a
                      edicao — sem que nenhum campo mude de lugar no JSX. Mover a marcacao dos
                      campos para juntar as linhas seria a chance de errar um.
                      ⚠ SO' NA CRIACAO DE PARCELAMENTO: em edicao a grade ja' e' de quatro com
                      teto de 200px por campo, e o financiamento tem seis campos, que em uma
                      linha ficariam ilegiveis. */}
                  <div className={ehParcelamento ? 'grid grid-cols-4 gap-2' : 'space-y-2.5'}>
                  <div className={ehParcelamento ? 'contents' : `grid gap-2 ${ehEdicao ? 'grid-cols-4 [&>div]:max-w-[200px]' : 'grid-cols-3'}`}>
                    <div>
                      <Label className={ROTULO}>Valor total *</Label>
                      <CampoMoeda valor={form.valor_total || null}
                        onChange={n => set('valor_total', n ?? 0)}
                        placeholder="R$ 0,00"
                        className={`${CAMPO} text-right ${NUM}`} />
                    </div>
                    {/* ⚠ SEM ENTRADA NO PARCELAMENTO — PAR-01c, e o motivo é que a tela e o
                        banco discordavam. A prévia daqui calcula
                        `(valor_total − valor_entrada) / total_parcelas`; a RPC que passou a
                        gravar divide o total CHEIO por N e grava `valor_entrada` em 0. Com uma
                        entrada preenchida, a tabela de prévia mostrava um valor de parcela e o
                        banco gravava outro — a tela mentiria sobre o que ela mesma criou.
                        ⚠ ESCONDIDO É SUFICIENTE PORQUE O VALOR NÃO VIAJA: o gravador do
                        parcelamento não manda `valor_entrada` no payload, então o que ficou no
                        state de uma troca de natureza não chega ao banco. É a mesma escolha que
                        a Frequência e os juros já faziam. */}
                    {!ehParcelamento && (
                    <div>
                      <Label className={ROTULO}>Valor de entrada</Label>
                      <CampoMoeda valor={form.valor_entrada || null}
                        onChange={n => set('valor_entrada', n ?? 0)}
                        placeholder="R$ 0,00"
                        className={`${CAMPO} text-right ${NUM}`} />
                      <p className={APOIO}>Pago à vista, fora das parcelas</p>
                    </div>
                    )}
                    <div>
                      <Label className={ROTULO}>Nº de parcelas *</Label>
                      {/* ⚠ TRAVADO EM EDICAO, e nao aceito-e-ignorado. Mudar o numero aqui
                          exigiria refazer o cronograma, e o cronograma nao se refaz (as
                          parcelas ja' podem ter lancamento vinculado). Campo que aceita o
                          que nao vai acontecer e' pior que campo travado. */}
                      {ehEdicao || livresAbertas ? (
                        <>
                          <Input readOnly tabIndex={-1} value={String(form.total_parcelas)}
                            className={`${CAMPO} text-right ${NUM} ${CAMPO_TRAVADO}`} />
                          <p className={APOIO}>{livresAbertas || edicaoDeParcelamento ? 'O da lista: use "+ Parcela" e o ✕.' : 'Para mudar a quantidade, edite ou cancele parcelas na tabela.'}</p>
                        </>
                      ) : (
                        <>
                          <Input
                            type="number" min={MIN_PARCELAS} max={MAX_PARCELAS}
                            className={`${CAMPO} text-right ${NUM}`}
                            value={parcelasTexto}
                            onChange={e => setParcelasTexto(e.target.value)}
                            onBlur={fecharParcelas}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fecharParcelas(); } }}
                          />
                          <p className={APOIO}>Mínimo {MIN_PARCELAS}, máximo {MAX_PARCELAS}</p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* ⚠ A GRADE ENCOLHE DE 3 PARA 2 COLUNAS quando os juros somem.
                      Esconder a terceira celula mantendo `grid-cols-3` deixaria um
                      terco vazio a' direita, e buraco em grade le-se como campo que
                      faltou carregar. */}
                  <div className={ehParcelamento ? 'contents' : `grid gap-2 ${ehEdicao ? 'grid-cols-4 [&>div]:max-w-[200px]' : 'grid-cols-3'}`}>
                    <div>
                      <Label className={ROTULO}>1ª parcela *</Label>
                      <DatePicker value={form.data_primeira_parcela} onChange={v => set('data_primeira_parcela', v)}
                        disabled={livresAbertas || (ehEdicao && ehParcelamento)} />
                      {/* ⚠ EDITAVEL, E COM CONSEQUENCIA ESCRITA. Mudar a 1a parcela DESLOCA
                          os vencimentos das pendentes pelo mesmo numero de dias — quem
                          renegocia a data de entrada espera que o resto ande junto. As PAGAS
                          nao se movem: a data delas ja' virou lancamento no caixa, e reescreve-la
                          seria mentir sobre um fato. O deslocamento roda no gravador. */}
                      {ehEdicao && (
                        <p className={ehParcelamento ? 'mt-0.5 truncate text-[10px] text-amber-600 dark:text-amber-500' : 'mt-0.5 text-[10px] text-amber-600 dark:text-amber-500'}
                           title={ehParcelamento ? MOTIVO_PRIMEIRA_PARCELA_DO_PARCELAMENTO : undefined}>
                          {ehParcelamento ? 'A da lista: edite na grade.' : 'Move os vencimentos das parcelas pendentes; as pagas não mudam.'}
                        </p>
                      )}
                    </div>
                    {/* ⚠ FREQUENCIA NAO APARECE EM EDICAO porque NAO E' PERSISTIDA: nao ha'
                        coluna `frequencia_parcela` em `financiamentos` (conferido em
                        types.ts). Ela so' molda as datas na geracao. Mostrar "Mensal" para
                        um contrato semestral seria inventar um dado que o banco nao tem. */}
                    {!ehEdicao && (
                    <div>
                      <Label className={ROTULO}>Frequência</Label>
                      <Select value={form.frequencia_parcela} onValueChange={v => { if (ehFrequencia(v)) set('frequencia_parcela', v); }}>
                        <SelectTrigger className={CAMPO}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mensal">Mensal</SelectItem>
                          <SelectItem value="bimestral">Bimestral</SelectItem>
                          <SelectItem value="trimestral">Trimestral</SelectItem>
                          <SelectItem value="semestral">Semestral</SelectItem>
                          <SelectItem value="anual">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    )}
                    {!ehParcelamento && (
                      <div>
                        <Label className={ROTULO}>Juros ao ano (%) *</Label>
                        <Input
                          className={`${CAMPO} text-right ${NUM}`}
                          inputMode="decimal"
                          value={jurosTexto}
                          onChange={e => setJurosTexto(e.target.value)}
                          onBlur={fecharJuros}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fecharJuros(); } }}
                          placeholder="0"
                        />
                        <p className={APOIO}>
                          {form.taxa_juros_anual > 0
                            ? `≈ ${((Math.pow(1 + form.taxa_juros_anual / 100, 1 / 12) - 1) * 100).toFixed(4)}% a.m.`
                            : ' '}
                        </p>
                      </div>
                    )}
                  </div>
                  </div>{/* fecha o wrapper de uma-linha-so — OBRIGACAO-UI-02 */}

                  <div>
                    {/* ⚠ A FRASE-GUIA SOBE PARA A LINHA DO ROTULO — OBRIGACAO-UI-03. As duas
                        (arredondamento na criacao, lapis na edicao) ocupavam uma FAIXA INTEIRA
                        cada, e a altura que elas comiam saia da tabela, que e' o que o operador
                        precisa ver. Na mesma linha do rotulo, a direita, custam ZERO altura: o
                        rotulo ja' reservava aquela faixa.
                        ⚠ NENHUMA FRASE FOI CORTADA e a fonte nao desceu do piso de 10px — o
                        briefing pedia comprimir, e comprimir espacamento e' diferente de apagar
                        informacao. As duas sao exclusivas entre si (uma so' na criacao, outra so'
                        na edicao), entao a linha nunca leva as duas.
                        ⚠ `min-w-0` + `truncate` NA FRASE, nao no rotulo: em coluna estreita quem
                        cede e' a explicacao, nunca o nome do campo. */}
                    {/* PARC-LIVRES-01 — na CRIAÇÃO do parcelamento a prévia é a GRADE: "Igual todo mês" (o que a RPC grava, só
                        leitura) × "Parcelas livres" (vencimento e valor por parcela, com a soma contra o contrato). */}
                    {edicaoDeParcelamento ? (
                      /* PARC-LIVRES-01 2B — as parcelas GRAVADAS na mesma grade: a paga apagada, a não paga editável. */
                      <GradeDeParcelas
                        modo="livres"
                        parcelas={gradeEdicao}
                        onParcelas={(lista) => { setErroDaGrade(null); setGradeEdicao(lista); }}
                        compraCent={centavos(Number(form.valor_total) || 0)}
                        oQue={{ frase: 'o contrato', rotulo: 'Valor do contrato', passaAValer: 'O contrato vale' }}
                        onCompraVale={(somaCent) => set('valor_total', somaCent / 100)}
                        base={baseEdicao}
                        rotuloVoltar="Desfazer alterações"
                        recado="Parcela paga não muda. Salvar grava parcela, lançamento e contrato juntos."
                        travado={gradeGravada}
                        altura={ALTURA_GRADE}
                      />
                    ) : ehParcelamento && !ehEdicao ? (
                      <GradeDeParcelas
                        modo={modoParcelas}
                        onModo={trocarModoDasParcelas}
                        parcelas={livresAbertas ? parcelasLivres : previaComoParcelas}
                        onParcelas={setParcelasLivres}
                        compraCent={centavos(Number(form.valor_total) || 0)}
                        oQue={{ frase: 'o contrato', rotulo: 'Valor do contrato', passaAValer: 'O contrato vale' }}
                        onCompraVale={(somaCent) => set('valor_total', somaCent / 100)}
                        base={baseLivres}
                        rotuloVoltar="Desfazer edições"
                        recado={livresAbertas ? null : 'Sem juros. Cada parcela é o total dividido por N; a última absorve o arredondamento.'}
                        altura={ALTURA_GRADE}
                      />
                    ) : (<>
                    <div className="flex items-baseline justify-between gap-2">
                      <Label className={ROTULO}>{ehEdicao ? 'Parcelas do contrato' : 'Prévia das parcelas'}</Label>
                      {ehParcelamento && !ehEdicao && (
                        <span className="min-w-0 truncate text-[10px] text-muted-foreground">
                          Sem juros. Cada parcela é o total dividido por N; a última absorve o arredondamento.
                        </span>
                      )}
                      {ehEdicao && (
                        <span className="min-w-0 truncate text-[10px] text-amber-600 dark:text-amber-500">
                          Cada parcela se edita pelo lápis. Valor total, nº e 1ª parcela não refazem o cronograma.
                        </span>
                      )}
                    </div>
                    {parcelas.length === 0 ? (
                      <p className="mt-0.5 rounded-md border border-dashed px-2 py-3 text-center text-[10px] text-muted-foreground">
                        {ehEdicao ? 'Este contrato não tem parcelas.' : 'Preencha valor total, nº de parcelas e data da 1ª parcela.'}
                      </p>
                    ) : ehEdicao ? (
                      /* ═══ EDICAO — A MESMA TABELA DO DETALHE ═══════════════════════
                         ⚠ MESMA GRADE, MESMO EDITOR, MESMO TOTAL. Duas tabelas para as
                         mesmas parcelas divergem no primeiro ajuste que so' uma receber;
                         aqui as colunas, o cabecalho preso, o rodape de total e o lapis
                         sao os do detalhe, e o lapis abre o MESMO ModalBaixaParcela — que
                         valida e chama a RPC de reconciliacao. */
                      <Table
                        density="dense"
                        className="table-fixed"
                        wrapperClassName={`mt-0.5 ${ALTURA_PREVIA} overflow-y-auto rounded-md border`}
                      >
                        {/* Cabecalho azul — o mesmo da lista e do detalhe (item 3). */}
                        <TableHeader className="sticky top-0 z-10 bg-primary text-primary-foreground [&_tr]:border-b-0 [&_tr]:hover:bg-primary">
                          <TableRow>
                            <TableHead className={`w-8 ${TH_PREVIA}`}>N</TableHead>
                            <TableHead className={`w-20 ${TH_PREVIA}`}>Vencimento</TableHead>
                            {!ehParcelamento && <TableHead className={`text-right ${TH_PREVIA}`}>Principal</TableHead>}
                            {!ehParcelamento && <TableHead className={`text-right ${TH_PREVIA}`}>Juros</TableHead>}
                            <TableHead className={`text-right ${TH_PREVIA}`}>Total</TableHead>
                            <TableHead className={`w-20 ${TH_PREVIA}`}>Situação</TableHead>
                            <TableHead className={`w-20 ${TH_PREVIA}`}>Pago em</TableHead>
                            <TableHead className={`w-8 ${TH_PREVIA}`} />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parcelasGravadas.map(pg => {
                            const principal = Number(pg.valor_principal) || 0;
                            const juros = Number(pg.valor_juros) || 0;
                            const situacaoLabel = pg.status === 'pago' ? 'Paga'
                              : pg.status === 'cancelado' ? 'Cancelada' : 'Pendente';
                            const situacaoClass = pg.status === 'pago'
                              ? 'bg-emerald-100 text-emerald-800'
                              : pg.status === 'cancelado'
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-amber-100 text-amber-800';
                            return (
                              <TableRow key={pg.id}>
                                <TableCell className={NUM}>{pg.numero_parcela}</TableCell>
                                <TableCell className={NUM}>{dataBR(pg.data_vencimento) ?? '—'}</TableCell>
                                {!ehParcelamento && <TableCell className={MOEDA}>{brl(principal)}</TableCell>}
                                {!ehParcelamento && <TableCell className={MOEDA}>{brl(juros)}</TableCell>}
                                <TableCell className={`${MOEDA} font-semibold`}>{brl(principal + juros)}</TableCell>
                                <TableCell>
                                  <span className={`inline-flex items-center rounded px-1 py-0 text-[9px] font-normal leading-tight ${situacaoClass}`}>
                                    {situacaoLabel}
                                  </span>
                                </TableCell>
                                <TableCell className={NUM}>{dataBR(pg.data_pagamento) ?? '—'}</TableCell>
                                <TableCell className="px-0 text-right select-none">
                                  <Button variant="ghost" size="icon" className="h-5 w-5 p-0"
                                    onClick={() => setParcelaEdit(pg)}
                                    /* PARC-LIVRES-01 2A — o editor de parcela chama o motor do financiamento; em parcelamento ele
                                       cancelava o lançamento e criava outro. Apagado com o motivo, nunca escondido. */
                                    disabled={ehParcelamento}
                                    title={ehParcelamento ? MOTIVO_PARCELA_DE_PARCELAMENTO : 'Editar parcela'} aria-label="Editar parcela">
                                    <Pencil className="size-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                        <TableFooter className="sticky bottom-0 z-10 border-t border-border bg-card [&>tr]:border-b-0">
                          <TableRow>
                            <TableCell className="font-semibold">Total</TableCell>
                            <TableCell />
                            {!ehParcelamento && <TableCell className={`${MOEDA} font-semibold`}>{brl(somaPrincipalGravado)}</TableCell>}
                            {!ehParcelamento && <TableCell className={`${MOEDA} font-semibold`}>{brl(somaJurosGravado)}</TableCell>}
                            <TableCell className={`${MOEDA} font-semibold`}>{brl(somaPrincipalGravado + somaJurosGravado)}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {parcelasPagas}/{parcelasGravadas.length} pagas
                            </TableCell>
                            <TableCell className={`${MOEDA} font-semibold`}>{brl(somaPagoGravado)}</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableFooter>
                      </Table>
                    ) : (
                      <Table
                        density="dense"
                        wrapperClassName={`mt-0.5 ${ALTURA_PREVIA} overflow-y-auto rounded-md border`}
                      >
                        {/* ⚠ CABECALHO PRESO (A21): o scrollport e' o wrapper acima, e
                            e' nele que o `sticky` ancora. Fundo OPACO e `z` acima das
                            linhas — transparente e' pior que nao fixar. */}
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          {/* Mesmo override local da lista e do detalhe: o primitivo dense
                              entrega `uppercase tracking-wide` e cinza; aqui o cabecalho e'
                              escuro e em caixa normal (A18/A24 nao mexem no primitivo). */}
                          <TableRow>
                            <TableHead className={`w-8 ${TH_PREVIA}`}>N</TableHead>
                            <TableHead className={`w-28 ${TH_PREVIA}`}>Vencimento</TableHead>
                            {!ehParcelamento && <TableHead className={`text-right ${TH_PREVIA}`}>Amortização</TableHead>}
                            {!ehParcelamento && <TableHead className={`text-right ${TH_PREVIA}`}>Juros</TableHead>}
                            <TableHead className={`text-right ${TH_PREVIA}`}>Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parcelas.map((p, idx) => (
                            <TableRow key={idx}>
                              <TableCell className={`${NUM} text-[10px]`}>{p.numero}</TableCell>
                              {/* Em edicao a grade e' LEITURA: quem mexe numa parcela e' o
                                  modal da parcela, no detalhe, que reconcilia o financeiro. */}
                              <TableCell>
                                {ehEdicao ? (
                                  <span className={`text-[11px] ${NUM}`}>
                                    {p.data_vencimento.split('-').reverse().join('/')}
                                  </span>
                                ) : (
                                  <DatePicker
                                    size="compact"
                                    value={p.data_vencimento}
                                    onChange={v => updateParcela(idx, 'data_vencimento', v)}
                                  />
                                )}
                              </TableCell>
                              {!ehParcelamento && (
                                <TableCell className={ehEdicao ? `text-right text-[11px] ${NUM}` : undefined}>
                                  {ehEdicao ? brl(p.valor_principal) : (
                                    <CampoMoeda valor={p.valor_principal}
                                      onChange={n => updateParcela(idx, 'valor_principal', n ?? 0)}
                                      className={`${CAMPO_CELULA} text-right text-[11px] ${NUM}`} />
                                  )}
                                </TableCell>
                              )}
                              {!ehParcelamento && (
                                <TableCell className={ehEdicao ? `text-right text-[11px] ${NUM}` : undefined}>
                                  {ehEdicao ? brl(p.valor_juros) : (
                                    <CampoMoeda valor={p.valor_juros}
                                      onChange={n => updateParcela(idx, 'valor_juros', n ?? 0)}
                                      className={`${CAMPO_CELULA} text-right text-[11px] ${NUM}`} />
                                  )}
                                </TableCell>
                              )}
                              <TableCell className={`text-right text-[11px] font-semibold ${NUM}`}>
                                {brl(p.valor_principal + p.valor_juros)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    </>)}
                  </div>
                </TabsContent>

                {/* ══ ABA DOCUMENTOS (parcelamento) — edição: PARC-LIVRES-01 passo 6; criação: PARC-CONTRATO-01 item 3 ═══ */}
                {ehParcelamento && (!ehEdicao || (!!financiamentoId && !!clienteId)) && (
                  <TabsContent value="documentos" className="mt-0">
                    {/* altura FIXA pela janela (como a grade das parcelas): só a grade dos boletos rola */}
                    <div style={{ height: 'clamp(250px, calc(100vh - 262px), 420px)' }}>
                      {!ehEdicao ? (
                        <DocumentosNaCriacao pendentes={pendentesDaCriacao} onMudar={setPendentesDaCriacao}
                          parcelas={parcelasParaOsBoletos} credor={credor ? { id: credor.id, nome: credor.nome } : null}
                          travado={!!posCriacao} onNotaDoXml={(nota, arquivo) => { void preencherPelaNota(nota, arquivo); }} recadoDoXml={recadoDoXml} />
                      ) : (
                      <DocumentosDoContrato financiamentoId={financiamentoId} clienteId={clienteId} hoje={hojeLocalDosDocumentos}
                        credorId={form.credor_id || null} valorDoContrato={Number(form.valor_total) || 0}
                        onUsarDuplicatas={gradeGravada ? undefined : (nota) => {
                          setErroDaGrade(null);
                          setGradeEdicao((g) => usarDuplicatasDaNota(g, nota));
                          setAba('parcelas');
                        }} />
                      )}
                    </div>
                  </TabsContent>
                )}

                {/* ══ ABA CLASSIFICACAO ═════════════════════════════════════════ */}
                <TabsContent value="classificacao" className="mt-0 space-y-2.5">
                  {ehParcelamento ? (
                    <>
                      {/* ⚠ AQUI MORAVA UM `<Select>` SO' — PAR-01c. A classificação do
                          parcelamento era uma conta do plano e mais nada: sem Atividade, sem
                          Safra, sem Cultura, sem Fase. Cada parcela vira um lançamento no v2, e
                          um lançamento sem safra não entra no DRE da safra — o parcelamento
                          nascia fora da análise que ele mesmo deveria alimentar.
                          ⚠ O COMPONENTE E' O MESMO DO MODAL DO FINANCEIRO, reusado sem uma
                          linha de cópia. As regras que cruzam os campos (trocar a atividade
                          limpa o subcentro de outro escopo; escolher o subcentro sobrescreve a
                          atividade; administrativo apaga a safra; cultura só em lavoura, fase só
                          em pecuária) valem aqui de graça, e continuarão valendo quando mudarem
                          lá — que é a razão de ele ter sido extraído.
                          ⚠ NADA DE GRADE EM VOLTA — E ESTE COMENTARIO JA' DISSE O CONTRARIO,
                          o que custou um defeito visivel em tela (OBRIGACAO-UI-03). O cluster
                          NAO devolve campos soltos: o Fragment dele traz DUAS
                          `grid grid-cols-12 gap-2 items-start` COMPLETAS (ClassificacaoLancamento
                          :237 e :370). Envolve-lo noutra `grid grid-cols-12` fazia cada uma
                          dessas duas grades virar um ITEM de UMA coluna do envelope — 1/12 da
                          largura, ~58px — e o cluster inteiro colapsava: as pilulas de atividade
                          viravam bolinhas e os rotulos se sobrepunham. O texto de apoio abaixo
                          saia inteiro porque e' irmao do envelope, e era esse contraste no print
                          que denunciava o problema.
                          ⚠ O QUE O FINANCEIRO FAZ, e e' o que passa a valer aqui: monta o
                          componente em BLOCO SIMPLES, depois de as grades dele proprio fecharem
                          (LancamentoV2Dialog :1750 fecha, :1767 monta). Sem wrapper de grade.
                          ⚠ O HARNESS DISSE QUE ESTAVA CERTO, E O HARNESS ESTAVA ERRADO: eu
                          reproduzi a arvore a' mao com um `col-span-4` no lugar do componente, em
                          vez da estrutura real de duas grades — entao medi 700px de largura numa
                          arvore que nao era a da tela. Medicao que nao usa a arvore real mede
                          outra coisa; o print e' que era o dado.
                          ⚠ `planosParcelamento` DEIXOU DE SER USADA AQUI e segue carregada: ela
                          é a lista peneirada de saídas operacionais, e o cluster precisa do
                          plano INTEIRO para cruzar escopo e atividade. Quem filtra agora é o
                          `PlanoSubcentroSelect`, por `tipoOperacao`. */}
                      <ClassificacaoLancamento
                          value={classificacao}
                          /* ⚠ O SETTER DO `useState` VAI DIRETO — o cluster manda updater
                             funcional e quem o resolve é o estado vivo do pai (PAR-01a-ii-fix1).
                             Um lambda intermediário recriaria o bug do closure. */
                          onChange={setClassificacao}
                          classificacoes={classificacoes}
                          safras={safras}
                          /* ⚠ A COMPETÊNCIA QUE SUGERE A SAFRA E' A DATA DO CONTRATO, a mesma
                             que o gravador manda para a RPC. Se a tela sugerisse por uma data e
                             o banco gravasse outra, a safra sugerida não bateria com a
                             competência gravada. */
                          dataCompetencia={form.data_contrato}
                          culturasDaSafra={culturasDaSafra}
                          /* Um parcelamento é sempre despesa — é o que filtra a lista de contas. */
                          tipoOperacao="2-Saídas"
                          /* ⚠ NA EDIÇÃO A LINHA DA SAFRA É DAS PARCELAS — PARC-OBRIGACAO-EDICAO-01a: o cluster não a desenha
                             (nem sugere safra); quem a mostra, em leitura, é o bloco logo abaixo. Na criação, nada muda. */
                          ocultarLinhaDaSafra={ehEdicao}
                      />
                      {ehEdicao && (
                        /* ⚠ SAFRA E FASE/CULTURA EM LEITURA, COM O MOTIVO — o Salvar do contrato não as grava (não são
                           colunas dele). Mesma grade de 12 do cluster, para os rótulos alinharem com os de cima; o eixo é o da
                           atividade (lavoura = cultura, pecuária = fase), a regra do próprio cluster. */
                        <div data-testid="das-parcelas">
                          <div className="grid grid-cols-12 gap-2 items-start">
                            <div className="col-span-4">
                              <Label className="text-[10px]">Safra</Label>
                              <CampoDasParcelas testid="safra-das-parcelas" comum={comumDasParcelas.safra_id} escolhido={escolhaDasParcelas.safra_id}
                                vazio="Sem safra" aoMudar={v => escolher('safra_id', v)}
                                opcoes={[...safras.filter(sf => sf.ativa).map(sf => ({ valor: sf.id, label: sf.nome })),
                                  ...Object.entries(lancamentosDoContrato?.nomes ?? {}).filter(([id]) => !safras.some(sf => sf.ativa && sf.id === id)).map(([id, nome]) => ({ valor: id, label: nome }))]} />
                            </div>
                            {classificacao.atividade === 'agricultura' && (
                              <div className="col-span-4">
                                <Label className="text-[10px]">Cultura</Label>
                                <CampoDasParcelas testid="cultura-das-parcelas" comum={comumDasParcelas.cultura} escolhido={escolhaDasParcelas.cultura}
                                  vazio="Todas (rateia)" opcoes={CULTURAS_LANCAMENTO.map(c => ({ valor: c.valor, label: c.label }))} aoMudar={v => escolher('cultura', v)} />
                              </div>
                            )}
                            {classificacao.atividade === 'pecuaria' && (
                              <div className="col-span-4">
                                <Label className="text-[10px]">Fase</Label>
                                <CampoDasParcelas testid="fase-das-parcelas" comum={comumDasParcelas.fase} escolhido={escolhaDasParcelas.fase}
                                  vazio="Todas (rateia)" opcoes={FASES.map(c => ({ valor: c.valor, label: c.label }))} aoMudar={v => escolher('fase', v)} />
                              </div>
                            )}
                          </div>
                          <p data-testid="motivo-safra" className="mt-0.5 truncate text-[10px] leading-[14px] text-muted-foreground"
                            title={MOTIVO_VALE_POR_PARCELA}>
                            {MOTIVO_VALE_POR_PARCELA}
                          </p>
                        </div>
                      )}
                      <p className={APOIO}>Cada parcela vira um lançamento nesta classificação</p>
                      <p className="text-[10px] text-muted-foreground">
                        Parcelamento não tem captação: o dinheiro não entra, a despesa é que sai em N vezes.
                      </p>
                    </>
                  ) : (
                    <>
                      {/* ⚠ TRAVADOS PORQUE QUEM DECIDE E' O ESCOPO. Sao os mesmos
                          subcentros que o motor fixa no banco por `tipo_financiamento`;
                          oferecer um Select aqui prometeria uma escolha que a
                          reconciliacao ignora. */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className={ROTULO}>Conta de amortização</Label>
                          <Input readOnly tabIndex={-1}
                            className={`${CAMPO} ${CAMPO_TRAVADO}`}
                            value={SUBCENTRO_AMORTIZACAO[form.tipo_financiamento]} />
                          <p className={APOIO}>Definida pelo escopo</p>
                        </div>
                        <div>
                          <Label className={ROTULO}>Conta de juros</Label>
                          <Input readOnly tabIndex={-1}
                            className={`${CAMPO} ${CAMPO_TRAVADO}`}
                            value={SUBCENTRO_JUROS[form.tipo_financiamento]} />
                          <p className={APOIO}>Definida pelo escopo</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className={ROTULO}>Conta de captação</Label>
                          <Select value={form.plano_conta_captacao_id} onValueChange={v => set('plano_conta_captacao_id', v)}>
                            <SelectTrigger className={CAMPO}><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              {planosEntrada.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.subcentro || p.centro_custo}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className={APOIO}>Macro › Grupo › Centro</p>
                        </div>
                        <div>
                          {/* ⚠ ESTE CAMPO DECIDE SE O DINHEIRO ENTRA NO CAIXA. Passar
                              despercebido custa caro: houve contrato com parcelas
                              nascidas e a entrada da captacao nunca aparecendo no
                              fluxo. A consequencia de cada estado fica escrita ao lado. */}
                          <Label className={ROTULO}>Registrar entrada da captação no caixa</Label>
                          <Select
                            value={form.gerar_lancamento_captacao ? 'sim' : 'nao'}
                            onValueChange={v => set('gerar_lancamento_captacao', v === 'sim')}
                          >
                            <SelectTrigger className={CAMPO}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sim">Sim, na data do contrato</SelectItem>
                              <SelectItem value="nao">Não</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className={APOIO}>
                            {form.gerar_lancamento_captacao
                              ? 'O valor contratado entra como recebimento na data do contrato.'
                              : 'O contrato e as parcelas nascem, mas a entrada NÃO aparece no caixa.'}
                          </p>
                        </div>
                      </div>

                      {/* ⚠ DESTINACOES SO' NA CRIACAO. Em edicao elas nao sao carregadas do
                          banco e o gravador de edicao nao as grava: o bloco apareceria VAZIO
                          (sugerindo que o contrato nao tem nenhuma, quando pode ter) e o que
                          fosse digitado ali sumiria no Salvar. Campo que perde o que recebe e'
                          pior que campo ausente. Editar destinacao segue sendo frente propria. */}
                      {!ehEdicao && (
                      <div className="rounded-md border bg-card p-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-primary/90">Destinação do contrato</p>
                        <p className="mb-1.5 text-[10px] text-muted-foreground">
                          Como o valor contratado será distribuído (opcional — pode ser preenchido depois)
                        </p>
                        <DestinacoesForm
                          clienteId={clienteId}
                          valorContrato={form.valor_total}
                          destinacoes={destinacoes}
                          onChange={setDestinacoes}
                        />
                      </div>
                      )}
                    </>
                  )}
                </TabsContent>
              </div>

              {/* ── RESUMO LATERAL (280px) ─────────────────────────────────────
                  ⚠ FORA do scrollport da coluna de conteudo, por construcao: e' o
                  numero que se confere enquanto se preenche, e nao pode subir junto
                  com o formulario. Ausencia e' "—", nunca zero (A19/sentinelas). */}
              <aside className="lg:min-h-0 lg:overflow-y-auto">
                <div className="bg-card rounded-md border shadow-sm overflow-hidden text-[10px]">
                  <div className="h-8 border-b border-border bg-accent/40 flex items-center px-3 text-[11px] font-bold uppercase tracking-wide text-primary">
                    Resumo da obrigação
                  </div>
                  <div className="pb-1">
                    <BlocoHead titulo="Contrato" />
                    <div className="px-3">
                      <div className="flex h-6 items-center justify-between gap-1.5 leading-tight">
                        <span className="text-muted-foreground shrink-0">Natureza</span>
                        <span className="flex items-center gap-1 min-w-0">
                          <span className="rounded border border-primary/40 bg-primary/10 px-1 text-[9px] font-bold text-primary">
                            {PILULA_NATUREZA[form.natureza]}
                          </span>
                          <span className="font-medium truncate">{NOME_NATUREZA[form.natureza]}</span>
                        </span>
                      </div>
                      {/* ⚠ A DESCRICAO E' O NOME DO CONTRATO e faltava no resumo: com tres
                          abas e o formulario rolando, dava para estar preenchendo os juros
                          de um contrato sem ter a menor pista de QUAL. */}
                      <Linha rotulo="Descrição" valor={form.descricao || null} />
                      <Linha rotulo="Escopo" valor={form.tipo_financiamento === 'pecuaria' ? 'Pecuária' : 'Agricultura'} />
                      <Linha rotulo="Credor" valor={credor?.nome ?? null} />
                      <Linha rotulo="Conta" valor={nomeConta} />
                      <Linha rotulo="Contrato em" valor={dataBR(form.data_contrato)} />
                    </div>

                    <BlocoHead titulo="Cronograma" />
                    <div className="px-3">
                      <div className="flex items-baseline justify-between gap-1.5 leading-tight">
                        <span className="text-muted-foreground shrink-0">Valor total</span>
                        <span className={`text-[14px] font-semibold ${NUM}`}>
                          {form.valor_total > 0 ? brl(form.valor_total) : '—'}
                        </span>
                      </div>
                      <Linha rotulo="Entrada" valor={form.valor_entrada > 0 ? brl(form.valor_entrada) : null} />
                      <Linha rotulo="Parcelas"
                        valor={parcelas.length > 0 && valorParcela != null ? `${parcelas.length} × ${brl(valorParcela)}` : null} />
                      <Linha rotulo="1ª" valor={dataBR(form.data_primeira_parcela)} />
                      <Linha rotulo="Última" valor={dataBR(ultimaParcela)} />
                      {!ehParcelamento && (
                        <Linha rotulo="Juros ao ano"
                          valor={form.taxa_juros_anual > 0 ? `${form.taxa_juros_anual.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%` : null} />
                      )}
                      {!ehParcelamento && (
                        <Linha rotulo="Total com juros" valor={totalParcelas > 0 ? brl(totalParcelas) : null} />
                      )}
                    </div>

                    <BlocoHead titulo="Classificação" />
                    <div className="px-3">
                      {ehParcelamento ? (
                        <Linha rotulo="Parcela" valor={nomeParcela} />
                      ) : (
                        <>
                          <Linha rotulo="Amortização" valor={SUBCENTRO_AMORTIZACAO[form.tipo_financiamento]} />
                          <Linha rotulo="Juros" valor={SUBCENTRO_JUROS[form.tipo_financiamento]} />
                          <Linha rotulo="Captação" valor={nomeCaptacao} />
                        </>
                      )}
                    </div>

                    {pendencias.length > 0 && (
                      <div className="mx-3 mt-2 border-l-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30 px-2 py-1">
                        <span className="font-semibold text-amber-700 dark:text-amber-500">Falta: </span>
                        <span className="text-amber-800 dark:text-amber-400">
                          {pendencias.map(p => p.texto.replace(/\.$/, '')).join(' · ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          </Tabs>

          {/* ── RODAPE ─────────────────────────────────────────────────────────
              ⚠ UMA FRASE, TRES USOS: a mesma pendencia governa o `disabled`, o
              `title` e a dica escrita. Botao desabilitado sem motivo transfere ao
              operador o trabalho de adivinhar. */}
          <div className="border-t px-4 py-2.5 flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground min-w-0 truncate">
              {posCriacao ? (
                <span className="font-medium text-destructive" title={posCriacao.erro} data-testid="erro-dos-documentos">{posCriacao.erro}</span>
              ) : erroDaGrade ? (
                <span className="font-medium text-destructive" title={erroDaGrade} data-testid="erro-da-grade">{erroDaGrade}</span>
              ) : primeiraPendencia && (
                <>
                  <span className="font-medium text-amber-600 dark:text-amber-500">Pendência:</span> {primeiraPendencia}
                </>
              )}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)} disabled={gravando}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="h-8 bg-cta text-cta-foreground hover:bg-cta-hover font-semibold"
                onClick={handleSalvar}
                disabled={gravando || pendencias.length > 0}
                title={primeiraPendencia ?? undefined}
              >
                {gravando ? 'Salvando...' : ehEdicao ? 'Salvar alterações' : 'Ver prévia e salvar'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* ⚠ O EDITOR DE PARCELA E' O MESMO DO DETALHE, montado aqui como IRMAO do dialogo.
        Ao fechar, invalida a grade desta aba E as consultas do detalhe atras: a parcela
        que acabou de mudar aparece nos dois lugares sem F5. */}
    {ehEdicao && parcelaEdit && contrato && (
      <ModalBaixaParcela
        /* ⚠ PROP-BAG EXPLICITO, e nao um cast do row. A linha do banco tem colunas
           anulaveis (`descricao`, `total_parcelas`, `cliente_id`...) e o modal pede os
           campos fechados; `as` calaria a diferenca em vez de resolve-la. Montado a mao,
           cada coalescencia fica visivel — e a regra zero-cast continua de pe'. */
        parcela={{
          id: parcelaEdit.id,
          numero_parcela: Number(parcelaEdit.numero_parcela) || 0,
          valor_principal: Number(parcelaEdit.valor_principal) || 0,
          valor_juros: Number(parcelaEdit.valor_juros) || 0,
          data_vencimento: parcelaEdit.data_vencimento ?? '',
          data_pagamento: parcelaEdit.data_pagamento,
          status: parcelaEdit.status ?? 'pendente',
          observacao: parcelaEdit.observacao,
          lancamento_id: parcelaEdit.lancamento_id,
          lancamento_juros_id: parcelaEdit.lancamento_juros_id,
        }}
        financiamento={{
          id: contrato.id,
          cliente_id: contrato.cliente_id ?? '',
          fazenda_id: contrato.fazenda_id ?? null,
          descricao: contrato.descricao ?? '',
          total_parcelas: Number(contrato.total_parcelas) || parcelasGravadas.length,
          tipo_financiamento: contrato.tipo_financiamento ?? undefined,
          status: contrato.status ?? undefined,
          plano_conta_parcela_id: contrato.plano_conta_parcela_id ?? null,
          conta_bancaria_id: contrato.conta_bancaria_id ?? null,
          numero_contrato: contrato.numero_contrato,
          credor_id: contrato.credor_id,
          data_contrato: contrato.data_contrato,
          natureza: contrato.natureza,
        }}
        modo="editar"
        onClose={() => {
          setParcelaEdit(null);
          qc.invalidateQueries({ queryKey: ['obrigacao-edicao-parcelas', financiamentoId] });
          qc.invalidateQueries({ queryKey: ['financiamento-parcelas', financiamentoId] });
          qc.invalidateQueries({ queryKey: ['financiamento-detalhe', financiamentoId] });
        }}
      />
    )}
    {/* PARC-CONTRATO-01 item 2 — até onde a edição alcança as parcelas. "Voltar" fecha sem gravar nada. */}
    {propagar && (
      <PropagarContratoDialog descricao={form.descricao || contrato?.descricao || ''} previa={propagar.previa}
        aoSalvar={salvarComEscopo} aoVoltar={() => setPropagar(null)} />
    )}
    </>
  );
}
