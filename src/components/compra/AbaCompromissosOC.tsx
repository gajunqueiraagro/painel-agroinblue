import { useState, useEffect, useMemo, useRef } from 'react';
import { useOperacaoEstornoFinanceiro } from '@/hooks/useOperacaoEstornoFinanceiro';
import type { OcCompromissosApi, CompromissoResumo, ParcelaMaterializacao, CriarCompromissoPayload, ProgramarParcelaInput } from '@/hooks/useOcCompromissos';
import { classificarLotesCompra, SUBCENTRO_OBRIGACAO_COMPRA, CENTRO_CUSTO_COMPRA_BOVINOS, type LoteOC } from '@/hooks/useOperacaoLiquidacao';
import { usePlanoContasOC } from '@/hooks/usePlanoContasOC';
import { useComponentesFinanceiros } from '@/hooks/useComponentesFinanceiros';
import { useContasBancariasLeves } from '@/hooks/useContasBancariasLeves';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { produtoOCCompromisso, produtoOCCompromissoLote } from '@/lib/financeiro/produtoOC';
import { CATEGORIAS } from '@/types/cattle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, AlertTriangle, Trash2, Pencil, MoreHorizontal } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { NovoFornecedorDialog } from '@/components/financeiro-v2/NovoFornecedorDialog';

// PR-OC-UI-FIN-VIEW / FIX-01 / FIX-01b — aba Financeiro do modelo de compromissos (Blocos A/B/C).
//   Consome APENAS useOcCompromissos (totais/flags/modo soberanos da view; React nunca soma). Escrita
//   via os 3 writers homologados, com oc.versao SEMPRE explícita. Sem estorno/renegociação/lote.

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// FIX-01b — parser monetário NATURAL: não força centavos durante a digitação. Retorna null p/ vazio/inválido
//   (nunca NaN). Regra de separadores: último separador = decimal quando há '.' e ','; só ',' = decimal;
//   só '.' = decimal se 1-2 dígitos após, senão milhar (ex.: 10.000). Arredonda só na normalização final.
function parseMoeda(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.replace(/[^\d.,]/g, '');           // remove R$, espaços, letras — mantém dígitos . ,
  if (s === '') return null;
  const hasDot = s.includes('.'), hasComma = s.includes(',');
  let intRaw = '', decRaw = '';
  if (hasDot && hasComma) {
    const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    intRaw = s.slice(0, last).replace(/[.,]/g, '');
    decRaw = s.slice(last + 1).replace(/[.,]/g, '');
  } else if (hasComma) {
    const i = s.lastIndexOf(',');
    intRaw = s.slice(0, i).replace(/,/g, '');
    decRaw = s.slice(i + 1).replace(/,/g, '');
  } else if (hasDot) {
    const i = s.lastIndexOf('.');
    const dec = s.slice(i + 1);
    if (dec.length === 1 || dec.length === 2) { intRaw = s.slice(0, i).replace(/\./g, ''); decRaw = dec; }
    else { intRaw = s.replace(/\./g, ''); decRaw = ''; }
  } else {
    intRaw = s;
  }
  if (intRaw === '' && decRaw === '') return null;
  const n = Number(`${intRaw === '' ? '0' : intRaw}.${decRaw === '' ? '0' : decRaw}`);
  return Number.isFinite(n) ? n : null;
}

// Campo monetário: texto de edição livre enquanto foca; normaliza p/ BRL (2 casas) no blur; emite o número.
function CampoMoeda({ valor, onChange, placeholder, className }: {
  valor: number | null; onChange: (n: number | null) => void; placeholder?: string; className?: string;
}) {
  const [texto, setTexto] = useState(valor != null ? brl(valor) : '');
  const [editando, setEditando] = useState(false);
  useEffect(() => { if (!editando) setTexto(valor != null ? brl(valor) : ''); }, [valor, editando]);
  return (
    <Input
      inputMode="decimal" value={texto} placeholder={placeholder} className={className}
      onFocus={() => setEditando(true)}
      onChange={(e) => { setTexto(e.target.value); onChange(parseMoeda(e.target.value)); }}
      onBlur={() => {
        setEditando(false);
        const n = parseMoeda(texto);
        const r = n != null ? round2(n) : null;
        onChange(r);
        setTexto(r != null ? brl(r) : '');
      }}
    />
  );
}

interface Props {
  ocApi: OcCompromissosApi;
  bloqueado: boolean;                 // gate de escrita do modelo novo (rascunho/cancelada/legado/misto)
  clienteId: string | null;
  tipoOperacao: string | null;        // 'compra'
  fornecedores: { id: string; nome: string }[];
  valorAcordado: number | null;       // default do principal
  lotes: LoteOC[];                     // sugestão de subcentro por categorias
  contraparteId: string | null;       // descrição rica
  dataOperacao: string | null;        // contexto: data da compra
  dataChegada: string | null;         // contexto: data de chegada (recebimento)
  darkSelectClass: string;
  recarregarDados?: () => void | Promise<void>;   // refresh da API de negociação antes de abrir "Novo compromisso"
}

/* Tema escuro para o painel do `SearchableSelect` (Lote, Subcentro, Favorecido).
   O componente do sistema para CONTA e' o `ContaBancariaSelect`, que ja traz o seu
   `DARK_GLASS_CONTENT`; aqui o alvo e' um dropdown de outra familia, cujos itens sao
   <button> e nao `[role=option]` — por isso os seletores descendentes apontam para
   `button` e `input` em vez de `[role=option]`. As cores sao as mesmas do
   DARK_GLASS_CONTENT, para as duas familias se lerem como uma so. */
const DARK_SEARCHABLE_CONTENT =
  'bg-zinc-950/85 backdrop-blur-xl border-zinc-700/40 text-zinc-100 ' +
  '[&_input]:bg-zinc-900/60 [&_input]:border-zinc-700/50 [&_input]:text-zinc-100 [&_input]:placeholder:text-zinc-500 ' +
  '[&_button]:text-zinc-100 [&_button:hover]:bg-zinc-800/45 ' +
  '[&_.bg-accent]:bg-zinc-800/55 [&_.bg-accent]:text-zinc-100';

const badgeStatusParcela = (s: string) => (s === 'materializada' ? 'default' : s === 'paga' ? 'default' : s === 'cancelada' ? 'destructive' : 'secondary');

// PR-OC-HOMOLOG-01 item 2 — status financeiro em LINGUAGEM DE USUÁRIO (estados internos preservados).
//   materializado + liquidado total → 🟢 Pago; materializado sem liquidação → 🟡 Programado;
//   liquidação parcial → 🟠 Parcial; prevista → Previsto; cancelada → Cancelado.
/* ⚠ O ESTADO QUE FALTAVA. `status` (cru) e `materializada` (derivado, "existe
   titulo VIVO?") discordam quando o titulo foi cancelado. Antes, uma parcela
   materializada com titulo morto nao casava com nenhuma condicao e caia no
   fallback: a tela escrevia "Programado" sobre uma parcela cujo lancamento nao
   existe mais. Agora ela tem estado proprio e diz o que fazer. */
function statusFinanceiroParcela(p: ParcelaMaterializacao): { icon: string; label: string; title: string; alerta: boolean } {
  if (p.status === 'cancelada') return { icon: '', label: 'Cancelado', title: 'Parcela cancelada.', alerta: false };
  if (!p.materializada && p.status === 'prevista') return { icon: '', label: 'Previsto', title: 'Parcela prevista; ainda sem título.', alerta: false };
  if (!p.materializada && (p.status === 'materializada' || p.status === 'paga')) {
    return {
      icon: '⚠️', label: 'Sem título', alerta: true,
      title: 'A parcela foi lançada, mas o título financeiro foi cancelado. '
        + 'Estorne o lançamento para devolver a parcela a PREVISTA.',
    };
  }
  const liq = p.totalLiquidadoTitulo ?? 0;
  const tot = p.tituloValor ?? p.valor ?? 0;
  if (tot > 0 && liq >= tot - 0.005) return { icon: '🟢', label: 'Pago', title: 'Título liquidado por completo.', alerta: false };
  if (liq > 0) return { icon: '🟠', label: 'Parcial', title: 'Título com liquidação parcial.', alerta: false };
  return { icon: '🟡', label: 'Programado', title: 'Título gerado, ainda sem liquidação.', alerta: false };
}

/* PR-OC-UX-LOTE-B-01 — tolerancia de centavo, a mesma ja usada em
   `statusFinanceiroParcela` e no resumo lateral. Nao e' numero novo: e' o mesmo
   criterio, escrito uma vez so. */
const TOL_CENTAVO = 0.005;

/* O DESVIO, NUNCA O CAMINHO. A tabela mostrava obrigacao -> programado -> lancado
   -> liquidado em sete colunas; com a operacao paga, o MESMO numero aparecia seis
   vezes na linha. Aqui so sai o que FALTA, e so quando falta. Cadeia inteira igual
   ao valor => null, e a linha fica limpa: o Status ja diz tudo. */
function desvioCompromisso(c: CompromissoResumo): string | null {
  if (c.status === 'cancelado') return null;
  if (c.saldoAProgramar > TOL_CENTAVO) return `falta programar ${brl(c.saldoAProgramar)}`;
  const aLancar = c.totalProgramado - c.totalMaterializado;
  if (aLancar > TOL_CENTAVO) return `falta lançar ${brl(aLancar)}`;
  if (c.saldoFinanceiro > TOL_CENTAVO) return `falta liquidar ${brl(c.saldoFinanceiro)}`;
  return null;
}

/* ESTADO do compromisso — MESMA regra ja aplicada as parcelas
   (`statusFinanceiroParcela`) e ao resumo lateral (`statusFinanceiro`), agora no
   nivel do compromisso. Nao ha fonte nem calculo novo: sao os totais que a view ja
   entrega, lidos na ordem em que a cadeia acontece.
   ⚠ O `status` CRU (aberto/programado/cancelado) nao some — vai no `title`, porque
   e' ele que os gates do banco usam e quem depura precisa dele. */
function estadoCompromisso(c: CompromissoResumo): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (c.status === 'cancelado') return { label: 'Cancelado', variant: 'destructive' };
  if (c.valorCompromisso <= 0) return { label: '—', variant: 'outline' };
  if (c.totalLiquidado >= c.valorCompromisso - TOL_CENTAVO) return { label: 'Pago', variant: 'default' };
  if (c.totalLiquidado > TOL_CENTAVO) return { label: 'Parcial', variant: 'secondary' };
  if (c.totalMaterializado > TOL_CENTAVO) return { label: 'Lançado', variant: 'secondary' };
  if (c.totalProgramado > TOL_CENTAVO) return { label: 'Programado', variant: 'secondary' };
  return { label: 'Aberto', variant: 'outline' };
}

export function AbaCompromissosOC({ ocApi, bloqueado, clienteId, tipoOperacao, fornecedores, valorAcordado, lotes, contraparteId, dataOperacao, dataChegada, darkSelectClass, recarregarDados }: Props) {
  const { resumoOperacao, compromissos, parcelas, versao, saving } = ocApi;
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recemMaterializada, setRecemMaterializada] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [programarAberto, setProgramarAberto] = useState(false);
  /* ACRESCENTAR SALDO e' caminho DISTINTO de programar, nao um modo do mesmo botao:
     um cria a programacao (writer `oc_programar_compromisso`, exige que nao exista),
     o outro cresce a que ja existe (`oc_acrescentar_parcelas`, exige que exista).
     Guardar o compromisso alvo aqui deixa a acao viver na LINHA dele, como o
     cancelamento — com tres compromissos, uma acao no bloco de detalhe nao diz sobre
     qual deles age. */
  const [saldoAlvo, setSaldoAlvo] = useState<CompromissoResumo | null>(null);
  const [confirmarParcela, setConfirmarParcela] = useState<ParcelaMaterializacao | null>(null);
  /* PR-OC-UX-LOTE-B-01 — o detalhe virou MODAL. `selectedId` continua existindo e
     seguindo a regra de estabilidade apos refetch (ver acima): e' o que mantem o
     modal aberto e no mesmo compromisso quando uma acao interna recarrega os dados.
     A abertura e' um estado SEPARADO porque `selecionado` ja nasce preenchido (1o
     nao-cancelado) — usar ele como "aberto" faria o modal saltar na tela sozinho. */
  const [detalheAberto, setDetalheAberto] = useState(false);
  /* CANCELADOS OCULTOS por padrao, com toggle para auditoria — mesmo idioma da
     Central, que ja esconde OC cancelada. Cancelado nao e' trabalho pendente:
     poluia a lista e competia com o que ainda pede acao. */
  const [mostrarCancelados, setMostrarCancelados] = useState(false);
  /* Complemento (nao substituto) da mensagem do backend quando a base ja esta
     coberta. O hook segue exibindo o texto do banco no toast; aqui entra o que
     fazer a seguir, que a mensagem do banco nao tem como saber. */
  const [avisoBaseCoberta, setAvisoBaseCoberta] = useState('');

  const compromissosVisiveis = useMemo(
    () => compromissos.filter(c => mostrarCancelados || c.status !== 'cancelado'),
    [compromissos, mostrarCancelados],
  );
  const qtdCancelados = useMemo(() => compromissos.filter(c => c.status === 'cancelado').length, [compromissos]);

  /* Seleção ESTÁVEL por compromisso_id: preserva o selecionado após refetch; senão 1º não-cancelado.
     ⚠ Roda sobre a lista VISIVEL: com o cancelado escondido, manter a selecao nele
     deixaria o bloco de detalhe falando de uma linha que nao esta na tabela. */
  useEffect(() => {
    if (compromissosVisiveis.length === 0) { if (selectedId !== null) setSelectedId(null); return; }
    if (!compromissosVisiveis.some(c => c.compromissoId === selectedId)) {
      const alvo = compromissosVisiveis.find(c => c.status !== 'cancelado') ?? compromissosVisiveis[0];
      setSelectedId(alvo?.compromissoId ?? null);
    }
  }, [compromissosVisiveis, selectedId]);

  const selecionado = useMemo(() => compromissos.find(c => c.compromissoId === selectedId) ?? null, [compromissos, selectedId]);

  /* PROXIMO VENCIMENTO EM ABERTO do compromisso. Um compromisso pode ter N parcelas
     com N vencimentos; o que interessa na lista e' a proxima que ainda cobra algo.
     'paga' e 'cancelada' saem; do resto, o MENOR vencimento. Sem parcela em aberto
     (ou sem programacao) devolve null e a coluna imprime '—' — ausencia nunca vira
     data. */
  const proximoVencimento = (compromissoId: string | null): string | null => {
    if (!compromissoId) return null;
    const emAberto = parcelas
      .filter(p => p.compromissoId === compromissoId && p.status !== 'paga' && p.status !== 'cancelada')
      .map(p => p.vencimento)
      .filter((v): v is string => !!v);
    if (emAberto.length === 0) return null;
    return emAberto.reduce((a, b) => (a <= b ? a : b));
  };
  const parcelasDoComp = useMemo(
    () => parcelas
      .filter(p => p.compromissoId === selectedId && (mostrarCancelados || p.status !== 'cancelada'))
      .sort((a, b) => a.sequencia - b.sequencia),
    [parcelas, selectedId, mostrarCancelados],
  );
  const qtdParcelasCanceladas = useMemo(
    () => parcelas.filter(p => p.compromissoId === selectedId && p.status === 'cancelada').length,
    [parcelas, selectedId],
  );
  const podeEscrever = !bloqueado && versao != null && !saving;

  /* ESTORNO — `onSucesso` ligado ao `recarregar`, que rele a versao do banco.
     E' o que impede o 40001 na acao seguinte da cadeia folha -> raiz. */
  const estorno = useOperacaoEstornoFinanceiro({
    operacaoId: resumoOperacao?.operacaoId ?? null,
    clienteId,
    onSucesso: ocApi.recarregar,
  });
  /* Qual estorno esta em confirmacao, e em que etapa. `null` fechado. */
  const [estAlvo, setEstAlvo] = useState<null | {
    nivel: 'materializacao' | 'programacao' | 'compromisso';
    programacaoId?: string; parcelaId?: string; compromissoId?: string; descricao: string;
  }>(null);
  const [estEtapa, setEstEtapa] = useState<1 | 2>(1);
  const [estMotivo, setEstMotivo] = useState('');
  /* ⚠ ESTADO PROPRIO, NAO `estorno.saving`. As guardas de Esc/clique-fora e o
     botao Voltar leem esta flag; se ela ficar presa em true o dialogo modal
     recusa QUALQUER fechamento e a pagina inteira fica inerte sob o overlay —
     sem saida a nao ser recarregar. Por isso o `finally` de `confirmarEstorno`
     e' o unico ponto que a limpa, e ele roda em todo caminho, inclusive quando
     um guard do backend recusa. Guard disparando e' operacao NORMAL. */
  const [estRodando, setEstRodando] = useState(false);

  /* ⚠ SO OFERECE O QUE O ESTADO PERMITE. O banco recusa cancelar programacao
     com parcela materializada e compromisso com programacao ativa; mostrar o
     botao assim mesmo seria prometer o que sera negado.

     ⚠⚠ DOIS CAMPOS PARECIDOS, PERGUNTAS DIFERENTES — nao trocar um pelo outro:
       `p.status === 'materializada'`  coluna CRUA da parcela: "ja foi materializada?"
       `p.materializada`               derivado (20260828140000): "existe titulo VIVO?"
     Com o titulo cancelado o derivado vira false enquanto a parcela segue
     materializada — medido na OC 69115ef9, parcela d77762fd, titulo 802deece.
     `totalMaterializado` e `totalLiquidado` sao da MESMA familia derivada
     (a view soma partes com `f.cancelado IS NOT TRUE`), entao tambem nao
     servem de gate. Os guards do banco olham `pp.status IN ('materializada',
     'paga')`; os gates abaixo espelham isso literalmente. */
  const parcelaComEfeito = (p: ParcelaMaterializacao) => p.status === 'materializada' || p.status === 'paga';
  const parcelasSel = parcelas.filter(p => p.compromissoId === selectedId);
  const temParcelaComEfeito = parcelasSel.some(parcelaComEfeito);

  /* ⚠ O GATE DEVOLVE O MOTIVO, NAO SO UM BOOLEANO. Botao escondido nao ensina
     nada: o usuario ve a acao sumir e nao descobre o que falta fazer. Visivel e
     desabilitado, com o motivo no tooltip, e' o que fecha a duvida. Os
     predicados sao os mesmos de antes — mudou o que se faz com o resultado.
     `motivo` vazio = desabilitado sem explicacao (ja cancelado, ou sem
     permissao de escrita): nao ha o que ensinar. */
  type Gate = { pode: boolean; motivo: string };
  const podeCancelarProgramacao: Gate =
    !podeEscrever || !selecionado?.temProgramacaoAtiva ? { pode: false, motivo: '' }
    : temParcelaComEfeito ? { pode: false, motivo: 'Estorne o lançamento da parcela antes de cancelar a programação.' }
    : { pode: true, motivo: '' };

  /* `temProgramacaoAtiva` E' cru: a view o define como `pr.status = 'ativa'`,
     o mesmo predicado do guard. Por LINHA, para a acao viver na propria linha
     da tabela — com tres compromissos, uma acao no bloco de detalhe nao diz
     sobre qual deles ela age. */
  const gateCancelarCompromisso = (c: CompromissoResumo): Gate => {
    if (!podeEscrever || c.status === 'cancelado') return { pode: false, motivo: '' };
    if (c.temProgramacaoAtiva) return { pode: false, motivo: 'Cancele a programação antes de cancelar o compromisso.' };
    const suas = parcelas.filter(p => p.compromissoId === c.compromissoId);
    if (suas.some(parcelaComEfeito)) return { pode: false, motivo: 'Estorne o lançamento da parcela antes de cancelar o compromisso.' };
    return { pode: true, motivo: '' };
  };

  const abrirEstorno = (alvo: NonNullable<typeof estAlvo>) => {
    setEstMotivo(''); setEstEtapa(1); setEstAlvo(alvo);
  };
  const confirmarEstorno = async () => {
    if (!estAlvo || versao == null) return;
    setEstRodando(true);
    try {
      if (estAlvo.nivel === 'materializacao' && estAlvo.programacaoId && estAlvo.parcelaId) {
        await estorno.estornarMaterializacao(versao, estAlvo.programacaoId, estAlvo.parcelaId, estMotivo.trim());
      } else if (estAlvo.nivel === 'programacao' && estAlvo.programacaoId) {
        await estorno.cancelarProgramacao(versao, estAlvo.programacaoId, estMotivo.trim());
      } else if (estAlvo.nivel === 'compromisso' && estAlvo.compromissoId) {
        await estorno.cancelarCompromisso(versao, estAlvo.compromissoId, estMotivo.trim());
      }
      setEstAlvo(null);
    } catch {
      /* Fica aberto com o motivo digitado: o usuario corrige e tenta de novo
         sem redigitar. A mensagem ja foi exibida pelo hook. */
    } finally {
      setEstRodando(false);
    }
  };

  // Abre "Novo compromisso" AGUARDANDO o refresh da OC (valor_acordado/lotes/contraparte) concluir,
  // para o dialog herdar o snapshot atual — evita compor o Produto com lotes obsoletos/vazios
  // ("Compra principal"). Se o refresh falhar, ainda abre (o guard de submit protege a persistência).
  const abrirNovo = async () => {
    try { await recarregarDados?.(); } catch { /* abre mesmo assim; guard de submit protege */ }
    setNovoAberto(true);
  };

  // Editar o título vinculado à parcela materializada: reutiliza o modal oficial do Financeiro V2
  // via o fluxo existente ?flancId={tituloId} (V2Index consome, troca de seção e abre o modal com a
  // proteção OC — valor/classificação/favorecido/vencimento seguem travados). Sem modal/RPC/writer novo.
  /* ⚠ ESTA IDA APAGA `oc_compra` e `oc_id` — e' a identidade da OC morrendo aqui, nao no
     fechamento do modal. Sem deixar endereco, o Editar era o unico drill da base que saia
     sem dizer de onde veio: salvar, X ou clicar fora largavam o usuario no Financeiro e
     ele refazia o caminho inteiro para reabrir a operacao.
     `returnOcId` e' o espelho de `returnZooId` (PR-B1-R2): mesmo gesto, mesmo useEffect
     do outro lado, mesmo estado `drillReturn`. Nao inventa convencao nova — usa a que ja
     existia e que so a OC nao usava. */
  const editarTitulo = (tituloId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('flancId', tituloId);
    next.set('ocfin', '1');   // PR-OC-FIN-EDIT-FIX-02 — contexto OC: libera edição de favorecido no título
    const ocId = resumoOperacao?.operacaoId ?? null;
    // Sem id nao ha para onde voltar: melhor nao prometer retorno do que prometer errado.
    if (ocId) next.set('returnOcId', ocId); else next.delete('returnOcId');
    next.delete('oc_compra');
    next.delete('oc_id');
    setSearchParams(next, { replace: true });
  };

  /* ITEM 2 — "quanto falta programar?" e' a pergunta do operador, e a resposta
     estava escondida numa coluna do meio. Soma dos saldos dos NAO cancelados
     (cancelado nao tem saldo a programar; incluir inflaria o numero). Somar
     `saldoAProgramar` da view nao e' calcular regra: e' totalizar coluna soberana. */
  const totalAProgramar = useMemo(
    () => compromissos.filter(c => c.status !== 'cancelado').reduce((s, c) => s + c.saldoAProgramar, 0),
    [compromissos],
  );

  /* ITEM 4 — a coluna dizia natureza/componente, iguais em todos: quatro linhas
     "principal/principal" nao distinguem a Desmama da Vaca. Quem identifica e' o
     LOTE. `lote_id` vem da view; a categoria sai do proprio array `lotes` que a
     aba ja recebe — nenhuma leitura nova. Sem lote (compromisso da operacao
     inteira) permanece natureza/componente, que ali E' a identidade. */
  const identidadeCompromisso = (c: CompromissoResumo): string | null => {
    if (!c.loteId) return null;
    const lote = lotes.find(l => l.id === c.loteId);
    if (!lote) return null;
    const cat = CATEGORIAS.find(x => x.value === lote.categoria)?.label ?? lote.categoria;
    return `${cat}${lote.qtd ? ` · ${lote.qtd} cab` : ''}`;
  };

  /* O COMPONENTE SO ACRESCENTA quando diz algo alem da natureza. `principal/principal`
     e' a mesma palavra duas vezes; frete, comissao e taxa_aquisicao informam. */
  const componenteAdicional = (c: CompromissoResumo): string | null => {
    const comp = c.componente ?? '';
    return (comp === '' || comp === c.natureza) ? null : comp;
  };

  /* ⚠ UMA REGRA, DOIS CONSUMIDORES. A coluna Componente e o cabecalho da Programacao
     precisam dizer a MESMA coisa sobre o mesmo compromisso — foram duas copias que
     deixaram o cabecalho preso em "principal/principal" depois que a coluna ja tinha
     sido corrigida. Com cinco compromissos na tabela, um cabecalho que nao identifica
     nao diz de qual deles e' a programacao aberta logo abaixo. */
  const rotuloCompromisso = (c: CompromissoResumo): string =>
    identidadeCompromisso(c) ?? componenteAdicional(c) ?? (c.natureza ?? '—');

  const sugestaoSubcentro = useMemo(() => {
    const c = classificarLotesCompra(lotes);
    if (c.status !== 'ok') return '';
    const subs = new Set(c.itens.map(i => i.subcentro));
    return subs.size === 1 ? Array.from(subs)[0] : '';
  }, [lotes]);

  // Lotes prontos = há quantidade negociada carregada. Guarda contra criar compromisso PRINCIPAL
  // com o fallback "Compra principal" (lotes stale/vazios). Ver descricaoDefault + NovoCompromissoDialog.
  const lotesProntos = useMemo(() => lotes.reduce((s, l) => s + (l.qtd ?? 0), 0) > 0, [lotes]);

  /* PR-OC-COMPROMISSO-UX-01 — cadastro rapido de favorecido SEM sair do modal.
     Reusa o `NovoFornecedorDialog` que a aba Compra ja usa (LancamentosTab:4414);
     nao ha segundo cadastro, so um segundo acesso ao mesmo.
     ⚠ O refresh e' `recarregarDados` (= liquidacaoApi.recarregar), que reconstroi
     a lista de fornecedores paginada. Sem ele o registro nasce e nao aparece.
     ⚠ `ativo` nao vai no insert de proposito: a coluna tem DEFAULT true, e a
     lista filtra por ativo — conferido no schema. Sem esse default o fornecedor
     seria criado invisivel.
     ⚠ `fazenda_id` vai NULO: a aba Financeiro nao tem fazenda em maos, e o banco
     aceita (337 dos 6.770 fornecedores ja sao assim). A lista filtra so por
     cliente e ativo, entao a visibilidade nao muda. O tipo gerado dizia o
     contrario e foi corrigido em PR-TYPES-PATCH-FORN-01. */
  const criarFornecedor = async (nome: string, cpfCnpj: string): Promise<{ id: string; nome: string } | null> => {
    const { data, error } = await supabase
      .from('financeiro_fornecedores')
      .insert({ cliente_id: clienteId, nome, cpf_cnpj: cpfCnpj || null })
      .select('id, nome')
      .single();
    if (error || !data) { toast.error('Erro ao salvar fornecedor'); return null; }
    try { await recarregarDados?.(); } catch { /* o registro ja existe; a lista volta no proximo refresh */ }
    toast.success(`Fornecedor "${data.nome}" criado e selecionado`);
    return data;
  };

  const descricaoDefault = useMemo(() => {
    const qtd = lotes.reduce((s, l) => s + (l.qtd ?? 0), 0);
    const cats = Array.from(new Set(lotes.map(l => l.categoria).filter(Boolean)));
    const catLabel = cats.map(slug => CATEGORIAS.find(c => c.value === slug)?.label ?? slug).join('/');
    // Formato soberano do compromisso principal (fonte única produtoOC.ts): "Compra 007 Garrotes".
    // O fornecedor NÃO entra na descrição — permanece no campo Favorecido/dados da OC.
    // Sem lotes classificados (qtd 0), mantém o fallback simples p/ não exibir "Compra 000".
    if (qtd <= 0) return 'Compra principal';
    return produtoOCCompromisso(tipoOperacao ?? 'compra', qtd, catLabel);
  }, [lotes, tipoOperacao]);

  /* Cria N compromissos em SEQUENCIA (N=1 e' o caso normal).
     ⚠ VERSION-LOCK: cada criacao incrementa a versao da operacao, entao a
     chamada seguinte precisa da versao que a anterior DEVOLVEU. Reusar a versao
     do state faria a segunda falhar com 40001 — e o state so atualiza depois do
     recarregar, que nao acontece dentro do laco.
     Falha no meio: os ja criados PERMANECEM (cada RPC e' sua propria transacao)
     e o dialogo fica aberto com o toast do hook. Nao ha rollback a fazer pela
     tela; o usuario ve na tabela o que entrou e refaz o que falta. */
  async function criar(payloads: CriarCompromissoPayload[]) {
    if (versao == null || payloads.length === 0) return;
    let v = versao;
    let ultimo: string | null = null;
    setAvisoBaseCoberta('');
    try {
      for (const payload of payloads) {
        const r = await ocApi.criarCompromisso(v, payload);
        v = r.operacaoVersao;
        ultimo = r.compromissoId;
      }
      setSelectedId(ultimo);
      setNovoAberto(false);
    } catch (e) {
      /* O hook já exibiu o toast com o texto do banco — que está CORRETO e não é
         mascarado aqui. O que falta a ele é o proximo passo: quem tentou criar um
         segundo compromisso queria, quase sempre, programar o saldo do que ja
         existe. Ler a mensagem do backend e' o unico jeito de distinguir esse erro
         dos outros sem inventar um codigo novo no writer. */
      const msg = e instanceof Error ? e.message : String(e);
      if (/excede a base da opera/i.test(msg)) {
        setAvisoBaseCoberta(
          'A base desta operação já está totalmente coberta pelos compromissos existentes — '
          + 'por isso o banco recusou mais um. Se o que você quer é o saldo ainda não programado, '
          + 'ele pertence a um compromisso que já existe: feche esta janela e use Programar na linha dele.',
        );
      }
    }
  }
  async function programar(lista: ProgramarParcelaInput[]) {
    if (versao == null || !selecionado?.compromissoId) return;
    try {
      await ocApi.programarCompromisso(versao, selecionado.compromissoId, { parcelas: lista });
      setProgramarAberto(false);
    } catch { /* toast pelo hook */ }
  }
  async function acrescentar(lista: ProgramarParcelaInput[]) {
    if (versao == null || !saldoAlvo?.compromissoId) return;
    try {
      /* `sequencia` e' descartada de proposito: quem numera e' o servidor, a partir de
         max+1 da programacao. O dialogo e' o mesmo do Programar e a produz; aqui ela
         morre, em vez de virar um numero que o writer ignora. */
      await ocApi.acrescentarParcelas(versao, saldoAlvo.compromissoId, {
        parcelas: lista.map(({ valor, vencimento, conta_bancaria_id, forma }) => ({ valor, vencimento, conta_bancaria_id, forma })),
      });
      setSelectedId(saldoAlvo.compromissoId);   // o resultado aparece na lista deste compromisso
      setSaldoAlvo(null);
    } catch { /* toast pelo hook */ }
  }
  async function materializar(p: ParcelaMaterializacao) {
    if (versao == null || !p.programacaoId || !p.parcelaId) return;
    setConfirmarParcela(null);                       // fecha JÁ (nunca congela)
    try {
      await ocApi.materializarParcela(versao, p.programacaoId, p.parcelaId);
      setRecemMaterializada(p.parcelaId);            // destaque da recém-materializada
    } catch { /* toast pelo hook */ }
  }

  return (
    <div className="space-y-2 min-w-0 text-[12px]">
      {resumoOperacao && (
        <div className="rounded-md border bg-card p-1.5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-semibold">Resumo financeiro</span>
              <span>· Compra {fmtData(dataOperacao)}</span>
              <span>· Chegada {fmtData(dataChegada)}</span>
            </div>
            <div className="flex items-center gap-1">
              {/* `modo` (novo_modelo / nova_vazia) era TELEMETRIA DE MIGRACAO, nao
                  informacao de produtor. Saiu da Central em c1aaffbd pelo mesmo motivo;
                  o campo segue na view e no hook, so nao e' mais exibido. */}
              {resumoOperacao.temDivergencia && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600" title="Divergência detectada">
                  <AlertTriangle className="h-3 w-3" /> divergência
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            <ResumoCard rotulo="Obrigação" valor={resumoOperacao.obrigacaoTotal} />
            <ResumoCard rotulo="Programado" valor={resumoOperacao.totalProgramado} />
            {/* "Lancado", nao "Materializado": materializado e' jargao do modelo. Lancado
                casa com o vocabulario do Financeiro e contrasta com Liquidado — lancado e'
                compromisso registrado, liquidado e' dinheiro que saiu. So o ROTULO muda:
                `totalMaterializado` segue sendo o nome do campo da view. */}
            <ResumoCard rotulo="Lançado" valor={resumoOperacao.totalMaterializado} />
            <ResumoCard rotulo="Liquidado" valor={resumoOperacao.totalLiquidado} />
            {/* "Saldo fin." (materializado − liquidado) saiu daqui: na 765058f8 marcava
                R$ 0,00 porque tudo que virou titulo foi pago — verdadeiro e inutil.
                Continua na coluna Saldo da tabela, que e' onde ele e' detalhe por
                compromisso. O topo passa a responder "quanto falta programar?". */}
            <ResumoCard rotulo="A programar" valor={totalAProgramar} />
          </div>
        </div>
      )}

      {/* ===== BLOCO A — COMPROMISSOS (FIX-01b: densidade p/ notebook 13", sem scroll horizontal) ===== */}
      <div className="rounded-md border bg-card p-1.5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] font-semibold text-muted-foreground">Compromissos</div>
          <div className="flex items-center gap-1.5">
            {(qtdCancelados > 0 || qtdParcelasCanceladas > 0) && (
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                <Checkbox checked={mostrarCancelados} onCheckedChange={(v) => setMostrarCancelados(v === true)} className="h-3 w-3" />
                mostrar cancelados
              </label>
            )}
            <Button size="sm" className="h-6 text-[11px] px-2" disabled={!podeEscrever} onClick={abrirNovo}>
              <Plus className="h-3 w-3 mr-1" /> Novo compromisso
            </Button>
          </div>
        </div>

        {compromissosVisiveis.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div className="text-[11px] text-muted-foreground">Nenhum compromisso nesta operação.</div>
            <Button size="sm" className="h-7 text-[11px]" disabled={!podeEscrever} onClick={abrirNovo}>
              <Plus className="h-3 w-3 mr-1" /> Novo compromisso
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] tabular-nums">
              <thead>
                <tr className="text-left text-[9px] text-muted-foreground border-b">
                  <th className="py-0.5 pr-1.5">Componente</th>
                  <th className="py-0.5 pr-1.5">Favorecido</th>
                  <th className="py-0.5 pr-1.5 whitespace-nowrap">Vencimento</th>
                  <th className="py-0.5 pr-1.5 text-right whitespace-nowrap">Valor</th>
                  <th className="py-0.5 pr-1.5">Status</th>
                  <th className="py-0.5 pr-0.5"></th>
                  <th className="py-0.5 pl-0.5"></th>
                </tr>
              </thead>
              <tbody>
                {compromissosVisiveis.map(c => {
                  const favNome = fornecedores.find(f => f.id === c.favorecidoId)?.nome ?? (c.favorecidoId ? '—' : '');
                  const ident = identidadeCompromisso(c);
                  const desvio = desvioCompromisso(c);
                  const estado = estadoCompromisso(c);
                  return (
                    <tr key={c.compromissoId ?? ''}
                      onClick={() => { setSelectedId(c.compromissoId); setDetalheAberto(true); }}
                      className={`border-b cursor-pointer hover:bg-muted/50 ${selectedId === c.compromissoId ? 'bg-muted' : ''}`}>
                      {/* Identidade em cima, natureza/componente embaixo em corpo menor:
                          continua disponivel, deixa de ser a unica coisa dita.
                          ⚠ `principal/principal` NAO e' mais impresso: dizer duas vezes a
                          mesma palavra nao informa nada e ainda competia com a identidade.
                          O subtexto so aparece quando o componente ACRESCENTA (frete,
                          comissao, taxa de aquisicao). O par completo segue no `title`. */}
                      <td className="py-0.5 pr-1.5 whitespace-nowrap" title={`${c.natureza ?? '—'}/${c.componente ?? '—'}`}>
                        {ident ? (
                          <span className="leading-tight block">
                            <span className="block">{ident}</span>
                            {componenteAdicional(c) && (
                              <span className="block text-[9px] text-muted-foreground">{componenteAdicional(c)}</span>
                            )}
                          </span>
                        ) : (
                          <>{rotuloCompromisso(c)}</>
                        )}
                      </td>
                      <td className="py-0.5 pr-1.5 max-w-[110px] truncate" title={favNome}>{favNome}</td>
                      <td className="py-0.5 pr-1.5 whitespace-nowrap">{fmtData(proximoVencimento(c.compromissoId))}</td>
                      {/* O desvio entra como segunda linha DISCRETA sob o valor, e so quando
                          existe. Cadeia completa nao gera texto: a coluna Status ja diz. */}
                      <td className="py-0.5 pr-1.5 text-right whitespace-nowrap">
                        <span className="block">{brl(c.valorCompromisso)}</span>
                        {desvio && <span className="block text-[9px] text-amber-700 dark:text-amber-500 font-normal">{desvio}</span>}
                      </td>
                      <td className="py-0.5 pr-1.5" title={`status: ${c.status}`}>
                        <Badge variant={estado.variant} className="text-[9px] px-1">{estado.label}</Badge>
                      </td>
                      <td className="py-0.5 pr-0.5 text-right">{c.temDivergencia && <AlertTriangle className="h-3 w-3 text-amber-600 inline" aria-label="divergência" />}</td>
                      {/* ⚠ ACAO NA PROPRIA LINHA. A RPC sempre recebeu p_compromisso_id — o
                          backend suporta por linha desde o inicio; era a tela que so
                          oferecia a acao no bloco de detalhe, longe de qual compromisso
                          ela agiria. `stopPropagation` para o clique abrir o menu sem que
                          a selecao da linha engula o evento. */}
                      <td className="py-0.5 pl-0.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {/* PROGRAMAR SALDO — so quando JA existe programacao ativa e ainda
                            sobra saldo. Sem programacao ativa quem aparece e' o "Programar"
                            do bloco de detalhe: sao writers diferentes e nao devem se
                            confundir num botao so. Cancelado nao recebe parcela. */}
                        {podeEscrever && c.status !== 'cancelado' && c.temProgramacaoAtiva && c.saldoAProgramar > 0 && (
                          <Button size="sm" variant="outline" className="h-5 mr-1 px-1.5 text-[10px]"
                            onClick={() => setSaldoAlvo(c)}>
                            Programar saldo
                          </Button>
                        )}
                        {(() => {
                          const g = gateCancelarCompromisso(c);
                          return (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                                  aria-label={`Ações de ${c.natureza ?? ''}/${c.componente ?? ''}`}>
                                  <MoreHorizontal className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="text-[11px]">
                                <DropdownMenuItem
                                  disabled={!g.pode || estRodando}
                                  title={g.motivo || undefined}
                                  onSelect={() => abrirEstorno({ nivel: 'compromisso', compromissoId: c.compromissoId ?? undefined,
                                    descricao: `o compromisso ${c.natureza ?? ''}/${c.componente ?? ''} de ${brl(c.valorCompromisso)} é cancelado` })}>
                                  Cancelar compromisso
                                </DropdownMenuItem>
                                {g.motivo !== '' && (
                                  <div className="px-2 py-1 text-[10px] text-muted-foreground max-w-[220px] leading-tight">{g.motivo}</div>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== DETALHE DO COMPROMISSO — em MODAL (PR-OC-UX-LOTE-B-01) =====
          Antes este bloco abria ABAIXO da tabela. Com varios compromissos o detalhe
          ficava longe da linha clicada e o cabecalho nem sempre dizia de qual era —
          confusao relatada em 27/08. Agora abre por cima, com o titulo IDENTIFICANDO
          o compromisso pela mesma regra da coluna Componente (`rotuloCompromisso`).
          ⚠ O conteudo foi MOVIDO, nao reescrito: as acoes chamam as mesmas funcoes.
          A cadeia (obrigacao -> programado -> lancado -> liquidado) mora aqui agora,
          que e' onde ela responde uma pergunta; na tabela ela so se repetia. */}
      <Dialog open={detalheAberto && !!selecionado} onOpenChange={(o) => { if (!o) setDetalheAberto(false); }}>
        <DialogContent className="max-w-4xl">
          {selecionado && (
          <div className="space-y-2">
          <DialogHeader>
            <DialogTitle className="text-[13px]">
              {rotuloCompromisso(selecionado)} — {brl(selecionado.valorCompromisso)}
            </DialogTitle>
            <DialogDescription className="text-[11px]">
              {fornecedores.find(f => f.id === selecionado.favorecidoId)?.nome ?? 'Sem favorecido'}
            </DialogDescription>
          </DialogHeader>

          {/* A CADEIA COMPLETA — os numeros que sairam da tabela. Mesmo `ResumoCard`
              das caixas do topo da aba, para o olho nao aprender dois formatos. */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            <ResumoCard rotulo="Obrigação" valor={selecionado.valorCompromisso} />
            <ResumoCard rotulo="Programado" valor={selecionado.totalProgramado} />
            <ResumoCard rotulo="A programar" valor={selecionado.saldoAProgramar} />
            <ResumoCard rotulo="Lançado" valor={selecionado.totalMaterializado} />
            <ResumoCard rotulo="Liquidado" valor={selecionado.totalLiquidado} />
            <ResumoCard rotulo="Saldo" valor={selecionado.saldoFinanceiro} />
          </div>

          <div className="rounded-md border bg-card p-1.5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-semibold text-muted-foreground">
              Programação
            </div>
            <span className="inline-flex gap-1">
              {!selecionado.temProgramacaoAtiva && selecionado.status === 'aberto' && (
                <Button size="sm" className="h-6 text-[11px] px-2" disabled={!podeEscrever} onClick={() => setProgramarAberto(true)}>Programar</Button>
              )}
              {/* VISIVEL e DESABILITADO com o motivo, nunca escondido. O `title` vai no
                  SPAN e nao no Button: botao desabilitado nao dispara evento de mouse
                  em todos os navegadores, entao o tooltip do proprio botao nao aparece.
                  "Cancelar compromisso" NAO mora aqui — vive na linha da tabela, um
                  lugar so, porque e' acao daquele compromisso e nao da programacao. */}
              {selecionado.programacaoAtivaId && (
                <span title={podeCancelarProgramacao.motivo || undefined} className="inline-flex">
                  <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                    disabled={!podeCancelarProgramacao.pode || estRodando}
                    onClick={() => abrirEstorno({ nivel: 'programacao', programacaoId: selecionado.programacaoAtivaId ?? undefined,
                      descricao: 'as parcelas previstas são canceladas, a programação é cancelada e o compromisso volta a ABERTO' })}>
                    Cancelar programação
                  </Button>
                </span>
              )}
            </span>
          </div>

          {/* PR-OC-HOMOLOG-01 item 4 — gate de edição do compromisso: após materialização, alteração
              direta é bloqueada; ajustes seguem por renegociação/estorno. */}
          {selecionado.totalMaterializado > 0 && (
            <div className="mb-1 rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 text-[10px] text-amber-800 dark:text-amber-200 leading-tight">
              Compromisso lançado. Para alterações utilize renegociação ou estorno.
            </div>
          )}

          {parcelasDoComp.length === 0 ? (
            <div className="py-3 text-center text-[11px] text-muted-foreground">
              {selecionado.status === 'aberto' ? 'Compromisso aberto — clique em "Programar".' : 'Sem programação ativa.'}
            </div>
          ) : (
            <table className="w-full text-[10px] tabular-nums">
              <thead>
                <tr className="text-left text-[9px] text-muted-foreground border-b">
                  <th className="py-0.5 pr-2">Seq</th>
                  <th className="py-0.5 pr-2">Vencimento</th>
                  <th className="py-0.5 pr-2 text-right">Valor</th>
                  <th className="py-0.5 pr-2">Status</th>
                  <th className="py-0.5 pr-2">Título</th>
                  <th className="py-0.5 pr-1"></th>
                </tr>
              </thead>
              <tbody>
                {parcelasDoComp.map(p => {
                  const podeMaterializar = podeEscrever && p.status === 'prevista' && selecionado.status === 'programado';
                  return (
                    <tr key={p.parcelaId ?? ''} className={`border-b ${recemMaterializada === p.parcelaId ? 'bg-green-50 dark:bg-green-950/30' : ''}`}>
                      <td className="py-0.5 pr-2">{p.sequencia}</td>
                      <td className="py-0.5 pr-2">{fmtData(p.vencimento)}</td>
                      <td className="py-0.5 pr-2 text-right whitespace-nowrap">{brl(p.valor)}</td>
                      <td className="py-0.5 pr-2">{(() => { const s = statusFinanceiroParcela(p); return (
                        <Badge variant={s.alerta ? 'destructive' : badgeStatusParcela(p.status)} className="text-[9px] px-1"
                          title={`${s.title} (estado interno: ${p.status})`}>{s.icon ? `${s.icon} ` : ''}{s.label}</Badge>
                      ); })()}</td>
                      <td className="py-0.5 pr-2">
                        {p.tituloId
                          ? <span className="text-[10px] text-muted-foreground" title={p.tituloId}>#{p.tituloId.slice(0, 8)} · {p.tituloStatusTransacao ?? '—'} · {p.tituloValor != null ? brl(p.tituloValor) : '—'}</span>
                          : <span className="text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="py-0.5 pr-1 text-right">
                        {/* ⚠ RAMO PELO STATUS CRU, e nao por `p.materializada`. Com o titulo
                            cancelado o derivado e' false e a linha caia em "Materializar",
                            desabilitado pelo gate — a parcela dizia "Sem titulo" e o Estornar,
                            que e' justamente o caminho de saida, ficava inalcancavel.
                            EDITAR continua atras do derivado: titulo morto nao se edita. */}
                        {(p.status === 'materializada' || p.status === 'paga')
                          ? (p.parcelaId
                              ? <span className="inline-flex gap-1">
                                  {p.materializada && p.tituloId && (
                                    <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5" onClick={() => { if (p.tituloId) editarTitulo(p.tituloId); }}>
                                      <Pencil className="h-2.5 w-2.5 mr-0.5" /> Editar
                                    </Button>
                                  )}
                                  {/* GHOST, e nao `outline` como o Editar: desfazer nao pode ter o
                                      mesmo peso visual de uma acao corriqueira. */}
                                  <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-foreground"
                                    disabled={!podeEscrever || estRodando}
                                    onClick={() => abrirEstorno({ nivel: 'materializacao', programacaoId: p.programacaoId ?? undefined,
                                      parcelaId: p.parcelaId ?? undefined,
                                      descricao: `a parcela ${p.sequencia} de ${brl(p.valor)} volta a PREVISTA e o título é cancelado` })}>
                                    Estornar
                                  </Button>
                                </span>
                              : <span className="text-[10px] text-green-600">ok</span>)
                          : <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5" disabled={!podeMaterializar} onClick={() => setConfirmarParcela(p)}>Lançar</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          </div>
          </div>
          )}
        </DialogContent>
      </Dialog>

      {novoAberto && (
        <NovoCompromissoDialog
          onClose={() => { setNovoAberto(false); setAvisoBaseCoberta(''); }} onSubmit={criar} saving={saving}
          clienteId={clienteId} tipoOperacao={tipoOperacao} fornecedores={fornecedores} darkSelectClass={darkSelectClass}
          onCriarFornecedor={criarFornecedor}
          valorAcordado={valorAcordado} sugestaoSubcentro={sugestaoSubcentro} descricaoDefault={descricaoDefault}
          contraparteId={contraparteId} lotesProntos={lotesProntos} lotes={lotes}
          avisoBaseCoberta={avisoBaseCoberta}
        />
      )}
      {programarAberto && selecionado && (
        <ProgramarDialog
          onClose={() => setProgramarAberto(false)} onSubmit={programar} saving={saving}
          clienteId={clienteId} valorCompromisso={selecionado.valorCompromisso}
          valorAcordado={valorAcordado} totalComprometido={resumoOperacao?.obrigacaoTotal ?? 0}
          saldoAProgramar={selecionado.saldoAProgramar}
          identificacao={identidadeCompromisso(selecionado)}
          naturezaComponente={`${selecionado.natureza ?? '—'}/${selecionado.componente ?? '—'}`}
          favorecidoNome={fornecedores.find(f => f.id === selecionado.favorecidoId)?.nome ?? null}
        />
      )}
      {/* MESMO dialogo, outro writer. O que muda e' o titulo, o teto (o saldo, nao o
          valor cheio) e para onde o submit vai — a mecanica de parcelas e' identica e
          duplicar o componente so criaria dois lugares para consertar. */}
      {saldoAlvo && (
        <ProgramarDialog
          onClose={() => setSaldoAlvo(null)} onSubmit={acrescentar} saving={saving}
          clienteId={clienteId} valorCompromisso={saldoAlvo.valorCompromisso}
          valorAcordado={valorAcordado} totalComprometido={resumoOperacao?.obrigacaoTotal ?? 0}
          saldoAProgramar={saldoAlvo.saldoAProgramar}
          identificacao={identidadeCompromisso(saldoAlvo)}
          naturezaComponente={`${saldoAlvo.natureza ?? '—'}/${saldoAlvo.componente ?? '—'}`}
          favorecidoNome={fornecedores.find(f => f.id === saldoAlvo.favorecidoId)?.nome ?? null}
          titulo="Programar saldo"
        />
      )}
      {confirmarParcela && (
        <Dialog open onOpenChange={(o) => { if (!o) setConfirmarParcela(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Lançar parcela</DialogTitle></DialogHeader>
            <div className="text-[13px]">Gerar título de <b>{brl(confirmarParcela.valor)}</b> com vencimento <b>{fmtData(confirmarParcela.vencimento)}</b>?</div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setConfirmarParcela(null)}>Cancelar</Button>
              <Button size="sm" disabled={saving} onClick={() => materializar(confirmarParcela)}>Lançar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ⚠ `onOpenChange` so fecha quando NAO esta rodando: Esc e clique fora ficam
          inertes durante a execucao. Fechar no meio deixaria o usuario sem saber se
          o desfazimento chegou a acontecer. Mesmo padrao de 376aa17d. */}
      {estAlvo && (
        <Dialog open onOpenChange={(o) => { if (!o && !estRodando) setEstAlvo(null); }}>
          <DialogContent className="sm:max-w-md"
            onInteractOutside={(e) => { if (estRodando) e.preventDefault(); }}
            onEscapeKeyDown={(e) => { if (estRodando) e.preventDefault(); }}>
            <DialogHeader>
              <DialogTitle>
                {estAlvo.nivel === 'materializacao' ? 'Estornar lançamento'
                : estAlvo.nivel === 'programacao' ? 'Cancelar programação'
                : 'Cancelar compromisso'}
              </DialogTitle>
              <DialogDescription>
                {estEtapa === 1
                  ? 'Confira o que será desfeito antes de continuar.'
                  : 'Informe o motivo. Ele fica registrado na auditoria da operação.'}
              </DialogDescription>
            </DialogHeader>

            {estEtapa === 1 && (
              <div className="text-[12px] space-y-1.5 leading-snug">
                <p>Será desfeito: {estAlvo.descricao}.</p>
                <p className="text-muted-foreground">A operação permanece aberta e o passo pode ser refeito.</p>
              </div>
            )}

            {estEtapa === 2 && (
              <textarea
                value={estMotivo}
                onChange={(e) => setEstMotivo(e.target.value)}
                disabled={estRodando}
                rows={3}
                placeholder="Motivo (obrigatório)"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            )}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" size="sm" disabled={estRodando}
                onClick={() => setEstAlvo(null)}>Voltar</Button>
              {estEtapa === 1 ? (
                <Button type="button" size="sm" onClick={() => setEstEtapa(2)}>Continuar</Button>
              ) : (
                <Button type="button" size="sm" variant="destructive"
                  disabled={estMotivo.trim() === '' || estRodando}
                  onClick={confirmarEstorno}>
                  {estRodando ? 'Desfazendo...' : 'Confirmar'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function ResumoCard({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded border bg-muted/30 px-1.5 py-0.5">
      <div className="text-[9px] text-muted-foreground">{rotulo}</div>
      <div className="text-[12px] font-semibold tabular-nums whitespace-nowrap">{brl(valor)}</div>
    </div>
  );
}

// ===== Dialog: Novo compromisso =====
function NovoCompromissoDialog({ onClose, onSubmit, saving, clienteId, tipoOperacao, fornecedores, darkSelectClass, valorAcordado, sugestaoSubcentro, descricaoDefault, contraparteId, lotesProntos, lotes, avisoBaseCoberta, onCriarFornecedor }: {
  onClose: () => void; onSubmit: (p: CriarCompromissoPayload[]) => void; saving: boolean;
  clienteId: string | null; tipoOperacao: string | null; fornecedores: { id: string; nome: string }[]; darkSelectClass: string;
  valorAcordado: number | null; sugestaoSubcentro: string; descricaoDefault: string; contraparteId: string | null; lotesProntos: boolean;
  onCriarFornecedor?: (nome: string, cpfCnpj: string) => Promise<{ id: string; nome: string } | null>;
  lotes: LoteOC[]; avisoBaseCoberta: string;
}) {
  const plano = usePlanoContasOC(clienteId ?? undefined);
  const comps = useComponentesFinanceiros();
  const [natureza, setNatureza] = useState<'principal' | 'obrigacao'>('principal');
  const [componente, setComponente] = useState('');
  const [valor, setValor] = useState<number | null>(null);
  const [subcentro, setSubcentro] = useState('');
  const [favorecidoId, setFavorecidoId] = useState('');
  const [novoFornecedorOpen, setNovoFornecedorOpen] = useState(false);
  const [descricao, setDescricao] = useState('');
  const ultimoDefaultRef = useRef('');   // último default de descrição aplicado automaticamente (ajuste vinculante 3)
  /* LOTE — 1 OC vira N lancamentos, um por categoria, que podem ir para
     favorecidos e bancos diferentes. `''` = compromisso da OPERACAO INTEIRA,
     que e' o comportamento de sempre (lote_id nulo no payload). */
  const [loteId, setLoteId] = useState('');
  const [varios, setVarios] = useState(false);   // DESMARCADO por padrao: separado e' o normal

  const itensLote = useMemo(() => {
    const c = classificarLotesCompra(lotes);
    return c.status === 'ok' ? c.itens : [];
  }, [lotes]);
  const loteOptions = useMemo(() => itensLote.map(i => ({
    value: i.lote.id,
    label: `${CATEGORIAS.find(c => c.value === i.lote.categoria)?.label ?? i.lote.categoria} · ${i.lote.qtd ?? 0} cab · ${brl(i.valorBruto)}`,
  })), [itensLote]);
  const itemSel = useMemo(() => itensLote.find(i => i.lote.id === loteId) ?? null, [itensLote, loteId]);

  // Defaults por natureza: principal pré-carrega valor acordado, subcentro sugerido e favorecido = contraparte
  // da OC; obrigacao zera. Campos seguem editáveis (mesma semântica de valor/subcentro).
  useEffect(() => {
    setComponente('');
    setLoteId(''); setVarios(false);
    if (natureza === 'principal') { setValor(valorAcordado); setSubcentro(sugestaoSubcentro); setFavorecidoId(contraparteId ?? ''); }
    /* Obrigacao da compra (frete, comissao, taxa de aquisicao) tem subcentro proprio
       e unico — sugerir e' melhor do que deixar em branco. Segue editavel. */
    else { setValor(null); setSubcentro(tipoOperacao === 'compra' ? SUBCENTRO_OBRIGACAO_COMPRA : ''); setFavorecidoId(''); }
  }, [natureza, valorAcordado, sugestaoSubcentro, contraparteId, tipoOperacao]);

  /* ⚠ ITEM 3 — A GUARDA LIA O REF DEPOIS DE ELE JA TER MUDADO. O padrao antigo era

         setDescricao(prev => (prev === ultimoDefaultRef.current ? alvo : prev));
         ultimoDefaultRef.current = alvo;

     e parece certo lendo de cima para baixo, mas nao e': o updater funcional NAO roda
     na chamada, roda no render seguinte — depois da linha de baixo. Quando ele
     finalmente le `ultimoDefaultRef.current`, o ref JA VALE `alvo`. A comparacao
     virava "default novo === default novo?" contra um `prev` que e' o ANTERIOR, dava
     false, e o campo nunca era atualizado. Por isso valor e subcentro (setters diretos)
     seguiam o lote e so a descricao ficava para tras — medido na 69115ef9, e a prova
     final foi trocar de lote tres vezes seguidas e o texto nao sair de "Compra 029 DF".

     Correcao: capturar o default anterior em CONSTANTE, antes de mexer no ref. O
     closure guarda o valor certo e a comparacao volta a ser a pretendida.
     `descricaoDefault` entra junto porque o texto da operacao inteira tambem foi
     escrito pela tela e tambem pode ser sobrescrito. Digitacao a mao nao casa com
     nenhum dos tres e segue intocada — o contrato original nao mudou. */
  const aplicarDefaultDescricao = (alvo: string) => {
    const anterior = ultimoDefaultRef.current;
    const daOperacao = descricaoDefault;
    ultimoDefaultRef.current = alvo;
    setDescricao(prev => (prev === '' || prev === anterior || prev === daOperacao ? alvo : prev));
  };

  /* LOTE ESCOLHIDO -> valor, subcentro e descricao daquele lote. Os tres seguem
     EDITAVEIS: o default e' ponto de partida, nao trava. */
  useEffect(() => {
    if (!itemSel) return;
    setValor(itemSel.valorBruto);
    setSubcentro(itemSel.subcentro);
  }, [itemSel]);

  const planoTipo = tipoOperacao === 'compra' ? '2-Saídas' : '1-Entradas';
  const componenteOptions = useMemo(() => comps.porNatureza(natureza), [comps, natureza]);

  const nomeComponente = useMemo(
    () => componenteOptions.find(c => c.codigo === componente)?.nome ?? '',
    [componenteOptions, componente],
  );

  /* Descrição = DEFAULT EDITÁVEL, com UM UNICO ESCRITOR.
       principal  → base
       obrigacao  → "base - Componente"  (PR-OC-COMPROMISSO-UX-01)
     onde base = descricao do LOTE escolhido, ou a da operacao inteira.
     Só atualiza se o campo está vazio OU ainda contém o último default gerado.
     Após edição manual do usuário, NUNCA sobrescreve — contrato inalterado.

     ⚠ POR QUE UM ESCRITOR SO. Antes eram DOIS efeitos escrevendo descricao (o do
     lote e o da natureza), e o segundo ja atropelou o primeiro uma vez: a descricao
     de tres compromissos por lote saiu com o texto da operacao inteira, porque
     `descricaoDefault` muda DEPOIS que o dialogo abre (os lotes chegam via
     `recarregarDados`) e a guarda `prev === ultimoDefaultRef.current` dava true.
     Agora o lote decide dentro do MESMO efeito, e a corrida deixa de existir.
     O efeito do lote ficou apenas com valor/subcentro — que, de proposito, NAO
     dependem do componente: trocar o componente nao pode reescrever o valor.

     ⚠ Obrigacao SEM componente escolhido segue com '', como antes. Sugerir
     "Compra 115 DM" sozinho numa obrigacao leria como o principal e convidaria a
     salvar assim. Quando o componente entra, a guarda casa ('' -> sugestao). */
  useEffect(() => {
    const base = itemSel
      ? produtoOCCompromissoLote(tipoOperacao ?? 'compra', itemSel.lote.qtd ?? 0, itemSel.lote.categoria)
      : descricaoDefault;
    if (natureza === 'principal') { aplicarDefaultDescricao(base); return; }
    aplicarDefaultDescricao(nomeComponente ? `${base} - ${nomeComponente}` : '');
  }, [itemSel, tipoOperacao, natureza, descricaoDefault, nomeComponente]);

  /* ⚠ RESTRITO AO CENTRO DE CUSTO DA COMPRA. Sem isto a lista traz TODOS os
     subcentros de saida do plano, e os tres que interessam se perdem no meio.
     Medido no proto: `Compra de Bovinos` agrupa exatamente Femeas, Machos e
     Frete/Comissao. So vale para tipo_operacao 'compra' — os outros tipos ficam
     como estao ate haver regra propria.
     ⚠ FAIL-OPEN: se o centro nao existir no plano do cliente a lista voltaria
     VAZIA e ninguem conseguiria criar compromisso. Nesse caso cai na lista
     inteira — restringir e' conveniencia, nunca uma parede. */
  const subcentroOptions = useMemo(() => {
    const doTipo = plano.rows.filter(r => r.tipo_operacao === planoTipo && r.subcentro);
    const restritos = tipoOperacao === 'compra'
      ? doTipo.filter(r => r.centro_custo === CENTRO_CUSTO_COMPRA_BOVINOS)
      : [];
    const base = restritos.length > 0 ? restritos : doTipo;
    const set = new Set<string>();
    base.forEach(r => { if (r.subcentro) set.add(r.subcentro); });
    return Array.from(set).sort().map(s => ({ value: s, label: s }));
  }, [plano.rows, planoTipo, tipoOperacao]);

  // GUARD "Compra principal": um compromisso PRINCIPAL não pode ser criado sem os lotes carregados,
  //   pois o Produto seria o fallback "Compra principal" (dados de negociação obsoletos/ausentes).
  const principalSemLotes = natureza === 'principal' && !lotesProntos;
  /* No modo JUNTO valor/subcentro/descricao saem de cada lote, entao os campos da
     tela deixam de ser requisito — o que precisa existir e' a lista de lotes. */
  const podeSubmeter = !!componente && !!(varios ? itensLote.length > 0 : (valor != null && valor > 0 && subcentro))
    && !saving && !principalSemLotes;

  /* UM payload por lote no modo junto; um so no modo separado. Favorecido e
     componente sao os comuns e se repetem — foi a decisao: separado e' o normal
     porque favorecido e banco mudam por categoria; junto e' atalho para quando
     e' tudo igual. */
  const montarPayloads = (): CriarCompromissoPayload[] => {
    const comum = { natureza, componente, favorecido_id: favorecidoId || null };
    if (varios) {
      return itensLote.map(i => ({
        ...comum,
        valor_total: i.valorBruto,
        subcentro: i.subcentro,
        lote_id: i.lote.id,
        descricao: produtoOCCompromissoLote(tipoOperacao ?? 'compra', i.lote.qtd ?? 0, i.lote.categoria),
      }));
    }
    if (valor == null || valor <= 0 || !subcentro) return [];
    return [{ ...comum, valor_total: valor, subcentro, lote_id: loteId || null, descricao: descricao || null }];
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* ITEM 9 — cabecalho no azul do sistema, o mesmo do header do CompraModalShell.
          Margens negativas + padding devolvem a faixa a borda do dialogo, que tem
          padding proprio; sem isso o azul flutuaria com moldura branca em volta. */}
      <DialogContent className="max-w-md">
        <DialogHeader className="-mx-6 -mt-6 mb-1 space-y-0 bg-primary px-6 py-3">
          <DialogTitle className="text-[15px] text-primary-foreground">Novo compromisso</DialogTitle>
        </DialogHeader>
        {avisoBaseCoberta && (
          <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-1.5 text-[11px] leading-snug text-amber-800 dark:text-amber-200">
            {avisoBaseCoberta}
          </div>
        )}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Natureza</Label>
              <Select value={natureza} onValueChange={(v) => setNatureza(v === 'principal' ? 'principal' : 'obrigacao')}>
                <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent className={darkSelectClass}>
                  <SelectItem value="principal">principal</SelectItem>
                  <SelectItem value="obrigacao">obrigacao</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Componente</Label>
              <Select value={componente || '__none__'} onValueChange={(v) => setComponente(v === '__none__' ? '' : v)}>
                <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className={darkSelectClass}>
                  {componenteOptions.map(c => <SelectItem key={c.codigo} value={c.codigo}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {natureza === 'principal' && loteOptions.length > 0 && (
            <div>
              <Label className="text-[11px]">Lote · categoria {loteId ? '· valor, classificação e descrição preenchidos (editáveis)' : '· opcional'}</Label>
              <SearchableSelect
                value={loteId || '__none__'} onValueChange={(v) => setLoteId(v === '__none__' ? '' : v)}
                options={loteOptions} placeholder="Selecione o lote"
                allLabel="— operação inteira —" allValue="__none__" dense className="[&>button]:h-8 [&>button]:text-[12px]"
                contentClassName={DARK_SEARCHABLE_CONTENT}
              />
              {loteOptions.length > 1 && (
                <label className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                  <Checkbox checked={varios} onCheckedChange={(v) => setVarios(v === true)} className="h-3.5 w-3.5" />
                  lançar os {loteOptions.length} lotes de uma vez
                </label>
              )}
              {varios && (
                <div className="mt-0.5 text-[10px] text-muted-foreground leading-tight">
                  Cria um compromisso por lote, repetindo favorecido e componente. Valor, classificação
                  e descrição vêm de cada lote.
                </div>
              )}
            </div>
          )}
          <div>
            <Label className="text-[11px]">Classificação (subcentro) *{natureza === 'principal' && sugestaoSubcentro ? ' · sugerido dos lotes (editável)' : ''}</Label>
            <SearchableSelect
              value={subcentro || '__none__'} onValueChange={(v) => setSubcentro(v === '__none__' ? '' : v)}
              options={subcentroOptions} placeholder="Selecione o subcentro"
              allLabel="— selecione —" allValue="__none__" dense className="[&>button]:h-8 [&>button]:text-[12px]"
              contentClassName={DARK_SEARCHABLE_CONTENT}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Valor total *</Label>
              <CampoMoeda valor={valor} onChange={setValor} placeholder="R$ 0,00" className="mt-0.5 h-8 text-[12px]" />
            </div>
            <div>
              <Label className="text-[11px]">Favorecido</Label>
              {/* PR-OC-COMPROMISSO-UX-01 — o "+" abre o MESMO cadastro rapido da aba
                  Compra. Sem ele o usuario precisava abandonar o compromisso, ir ao
                  cadastro e voltar. `min-w-0` no seletor para ele ceder largura ao
                  botao em vez de estourar a coluna. */}
              <div className="flex items-center gap-1">
                <div className="flex-1 min-w-0">
                  <SearchableSelect
                    value={favorecidoId || '__none__'} onValueChange={(v) => setFavorecidoId(v === '__none__' ? '' : v)}
                    options={fornecedores.map(f => ({ value: f.id, label: f.nome }))} placeholder="Opcional"
                    allLabel="— nenhum —" allValue="__none__" dense className="[&>button]:h-8 [&>button]:text-[12px]"
                    contentClassName={DARK_SEARCHABLE_CONTENT}
                  />
                </div>
                {onCriarFornecedor && (
                  <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0 mt-0.5"
                    aria-label="Novo favorecido" title="Cadastrar favorecido"
                    onClick={() => setNovoFornecedorOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div>
            <Label className="text-[11px]">Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className="mt-0.5 text-[12px]" placeholder="Opcional" />
          </div>
        </div>
        {/* Criar e' meio trabalho; o contrato e' criar E SELECIONAR. */}
        <NovoFornecedorDialog
          open={novoFornecedorOpen}
          onClose={() => setNovoFornecedorOpen(false)}
          onSave={async (nome, cpfCnpj) => {
            const rec = await onCriarFornecedor?.(nome, cpfCnpj);
            if (rec) setFavorecidoId(rec.id);
            setNovoFornecedorOpen(false);
          }}
        />
        {principalSemLotes && (
          <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-200">
            Aguardando os dados da negociação (lotes) para compor o Produto. Feche e reabra o compromisso em instantes — o compromisso principal não pode ser criado sem os lotes carregados.
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={!podeSubmeter}
            onClick={() => { if (podeSubmeter) { const ps = montarPayloads(); if (ps.length > 0) onSubmit(ps); } }}>
            {varios ? `Criar ${itensLote.length}` : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== Dialog: Programar (parcelas; conta OPCIONAL por parcela; identidade estável por idLocal) =====
type LinhaParcela = { idLocal: string; valor: number | null; vencimento: string; contaId: string };

function ProgramarDialog({ onClose, onSubmit, saving, clienteId, valorCompromisso, valorAcordado, totalComprometido,
  saldoAProgramar, identificacao, naturezaComponente, favorecidoNome, titulo = 'Programar parcelas' }: {
  onClose: () => void; onSubmit: (p: ProgramarParcelaInput[]) => void; saving: boolean;
  clienteId: string | null; valorCompromisso: number; valorAcordado: number | null; totalComprometido: number;
  saldoAProgramar: number; identificacao: string | null; naturezaComponente: string; favorecidoNome: string | null;
  titulo?: string;
}) {
  const { contas } = useContasBancariasLeves(clienteId);
  const idRef = useRef(0);
  // idLocal ESTÁVEL por linha (ajuste vinculante 2): React key E identidade do estado. Add/remove só recalcula
  // a sequência 1..N na submissão — nunca desloca valor/vencimento/conta entre linhas.
  const novaLinha = (): LinhaParcela => ({ idLocal: `p${idRef.current++}`, valor: null, vencimento: '', contaId: '' });
  /* ITEM 5 — a primeira parcela nasce com o SALDO A PROGRAMAR DAQUELE compromisso,
     nao vazia e nunca com o total da operacao. `saldoAProgramar` e' o mesmo campo
     soberano da coluna "A prog." — nao se deriva outro aqui.
     So a PRIMEIRA: "Adicionar parcela" segue criando linha vazia, senao cada nova
     linha estouraria o teto sozinha. */
  const [linhas, setLinhas] = useState<LinhaParcela[]>(
    () => [{ ...novaLinha(), valor: saldoAProgramar > 0 ? round2(saldoAProgramar) : null }],
  );
  const [confirmarParcial, setConfirmarParcial] = useState(false);

  const soma = useMemo(() => round2(linhas.reduce((s, l) => s + (l.valor ?? 0), 0)), [linhas]);
  const todasComValor = linhas.length > 0 && linhas.every(l => l.valor != null && l.valor > 0);
  /* ⚠ O TETO E' O SALDO, NAO O VALOR CHEIO. Acrescentando a uma programacao que ja
     consome parte do compromisso, medir contra `valorCompromisso` deixaria a tela
     aceitar uma soma que o writer recusa — o backend compara Sigma novo + Sigma
     existente contra o valor total. Na PRIMEIRA programacao os dois numeros sao o
     mesmo (nada foi programado ainda), entao este teto vale para os dois caminhos. */
  const tetoCompromisso = round2(saldoAProgramar);
  const podeSubmeter = todasComValor && soma <= tetoCompromisso && !saving;
  const restanteOC = (valorAcordado ?? 0) - totalComprometido;
  const restanteCompromisso = round2(tetoCompromisso - soma);

  const setLinha = (idLocal: string, patch: Partial<Omit<LinhaParcela, 'idLocal'>>) =>
    setLinhas(prev => prev.map(l => (l.idLocal === idLocal ? { ...l, ...patch } : l)));
  const removerLinha = (idLocal: string) => setLinhas(prev => prev.filter(l => l.idLocal !== idLocal));

  /* O AGRUPAMENTO NAO E' DESTA TELA — o padrao do sistema ja existe em
     `ContaBancariaSelect` (shared), o mesmo do filtro Conta Origem do Financeiro V2:
     fundo dark/glass, grupos com cabecalho (CONTAS CORRENTES · INVESTIMENTOS ·
     CARTOES) e o NOME PURO da conta no item.
     ⚠ O PR anterior criou uma TERCEIRA variacao — lista plana ordenada por tipo com
     "Corrente · " grudado no rotulo. Ela sai inteira aqui: convergir era o objetivo,
     e reusar o componente e' mais barato do que reproduzir o tratamento. */

  // Sequência é derivada 1..N na ordem visual, na hora de emitir (nunca guardada por linha).
  const emitir = () => {
    if (!podeSubmeter) return;
    onSubmit(linhas.map((l, i) => ({ sequencia: i + 1, valor: l.valor ?? 0, vencimento: l.vencimento || null, conta_bancaria_id: l.contaId || null })));
  };
  // item 3: Σ = teto segue direto; Σ > teto fica bloqueado (writer); Σ < teto exige confirmação de parcial.
  const aoProgramar = () => {
    if (!podeSubmeter) return;
    if (soma < tetoCompromisso) { setConfirmarParcial(true); return; }
    emitir();
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-lg">
          {/* ITEM 6 — o modal mostrava so valor e saldo: com tres compromissos na tela
              o operador nao sabia qual estava programando sem fechar e reabrir.
              ITEM 9 — mesma faixa azul do Novo compromisso e do CompraModalShell. */}
          <DialogHeader className="-mx-6 -mt-6 mb-1 space-y-0 bg-primary px-6 py-3">
            <DialogTitle className="text-[15px] text-primary-foreground">{titulo}</DialogTitle>
            <DialogDescription className="text-[11px] text-primary-foreground/80">
              {identificacao ?? naturezaComponente} · {brl(valorCompromisso)}
              {identificacao ? ` · ${naturezaComponente}` : ''}
              {favorecidoNome ? ` · ${favorecidoNome}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <div className="rounded border bg-muted/30 px-1.5 py-0.5"><span className="text-muted-foreground">OC (acordado): </span><b>{valorAcordado != null ? brl(valorAcordado) : '—'}</b></div>
              <div className="rounded border bg-muted/30 px-1.5 py-0.5"><span className="text-muted-foreground">Comprometido: </span><b>{brl(totalComprometido)}</b></div>
              <div className="rounded border bg-muted/30 px-1.5 py-0.5"><span className="text-muted-foreground">Restante OC: </span><b>{brl(restanteOC)}</b></div>
              <div className="rounded border bg-muted/30 px-1.5 py-0.5"><span className="text-muted-foreground">A programar: </span><b>{brl(saldoAProgramar)}</b> · Σ {brl(soma)}</div>
            </div>
            {linhas.map((l, i) => (
              <div key={l.idLocal} className="grid grid-cols-[16px_1fr_1fr_1fr_24px] items-end gap-1.5">
                <div className="text-[11px] text-muted-foreground pb-2">{i + 1}</div>
                <div>
                  <Label className="text-[10px]">Valor</Label>
                  <CampoMoeda valor={l.valor} onChange={(n) => setLinha(l.idLocal, { valor: n })} placeholder="R$ 0,00" className="mt-0.5 h-8 text-[12px]" />
                </div>
                <div>
                  <Label className="text-[10px]">Vencimento</Label>
                  <DatePicker value={l.vencimento} onChange={(v) => setLinha(l.idLocal, { vencimento: v })} size="compact" />
                </div>
                <div>
                  <Label className="text-[10px]">Conta</Label>
                  <ContaBancariaSelect
                    value={l.contaId}
                    onValueChange={(v) => setLinha(l.idLocal, { contaId: v === '__none__' ? '' : v })}
                    contas={contas}
                    prependItems={[{ value: '__none__', label: '— definir depois —' }]}
                    className="h-8 text-[11px]"
                  />
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={linhas.length === 1}
                  onClick={() => removerLinha(l.idLocal)} aria-label="remover parcela">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => setLinhas(prev => [...prev, novaLinha()])}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar parcela
            </Button>
            {soma > tetoCompromisso && (
              /* Diz o numero e o que fazer, nao so que esta errado — mesmo criterio do
                 aviso de base coberta (d9aae3aa): a mensagem do backend continua sendo
                 a do backend, e aqui se orienta antes de chegar la. */
              <div className="text-[11px] text-destructive leading-snug">
                As parcelas somam {brl(soma)} e só há {brl(tetoCompromisso)} a programar neste
                compromisso. Reduza o valor ou remova uma parcela.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" disabled={!podeSubmeter} onClick={aoProgramar}>Programar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* item 3 — confirmação de programação PARCIAL (Σ < valor do compromisso). Contrato do writer intacto. */}
      {confirmarParcial && (
        <Dialog open onOpenChange={(o) => { if (!o) setConfirmarParcial(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Programação parcial</DialogTitle></DialogHeader>
            <div className="text-[13px]">
              As parcelas somam <b>{brl(soma)}</b> de <b>{brl(tetoCompromisso)}</b>. Restarão <b>{brl(restanteCompromisso)}</b> a programar. Confirmar programação parcial?
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setConfirmarParcial(false)}>Voltar</Button>
              <Button size="sm" disabled={saving} onClick={() => { setConfirmarParcial(false); emitir(); }}>Confirmar parcial</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
