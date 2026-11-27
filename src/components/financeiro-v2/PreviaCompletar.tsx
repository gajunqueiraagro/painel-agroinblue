/**
 * P128b → P163 v4 (o mock APROVADO pelo Gabriel 29/10 06:43, ~/Downloads/mock-nota-muda-v4.html) — "O que a nota muda em cada parcela": UMA LINHA
 * POR PARCELA, as colunas na ordem da casa (Parc. · Comp. · Venc. · Pgto. · Descrição · Nº documento · [Fornecedor · Fazenda · Conta · Subcentro ·
 * Safra, só se MUDAM ou DIFEREM] · Valor · Status). Toda célula que pode mudar é um CAMPO (a parcela livre, célula a célula); a 1ª linha "Para
 * todas" aplica a coluna inteira (a caixinha do cabeçalho). A célula que vai mudar tem o fundo azul-claro com o valor NOVO e o de hoje no title —
 * sem riscado, sem "→" (exceção NOTA-ATUALIZA-PREVISTO-01: o valor do PREVISTO que a nota atualiza vem com o de hoje riscado ao lado). 🔒 na paga/conciliada só em Valor e Vencimento (e na Conta: o banco não a muda); nas programadas, Venc. e Valor são campos.
 * Fonte e linha = a régua (cabeçalho 22px 9,5 · linha 19px 10; as datas 9,5, como na lista de Lançamentos).
 * ⚠ A REGRA É DO BANCO: cada mudança pede a `fn_nota_completar` com `p_simular` e a grade desenha o que ela devolve (o que muda, o cadeado, o DRE).
 *   Nada é gravado antes do clique. P167 (uma compra só) e B2 (a soma não passa da nota) valem como antes.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { TD_REGUA, TD_REGUA_NUM, TH_REGUA } from '@/components/ui/regua-tabela';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { EscolherConta } from '@/components/shared/EscolherConta';
import { FazendaSelect } from '@/components/shared/FazendaSelect';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import type { ClassificacaoItem, ContaBancariaV2, FornecedorV2, Safra } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import { cn } from '@/lib/utils';
import { reais } from '@/lib/financeiro/nfe/formatos';
import { completarComANota, sugestaoDosItensDaNota } from '@/lib/financeiro/nfeConsultas';
import { sugestaoParaAsParcelas, type ItemSugerido } from '@/lib/financeiro/nfe/sugestaoDosItens';
import { Ajuda } from '@/components/ui/ajuda';
import { Segmentado } from '@/components/ui/segmentado';
import { classificacoesParaJuntar, ehRecusaDeClassificacoes, FRASE_CLASSIFICACOES_DIFERENTES, nomeCurtoDaConta } from '@/lib/financeiro/nfe/classificacaoDaJuncao';
import { numerosDaDiferenca, porqueDaDiferenca, type DiferencaDaNota, type EscolhaDaDiferenca, type MotivoDaDiferenca } from '@/lib/financeiro/nfe/diferencaDaNota';
import {
  CAMPO_DA_COLUNA, COLUNAS_OPCIONAIS, ROTULO_DA_COLUNA, camposQueMudam, chaveDaGrade, colunasQueAparecem, fraseDoEfeitoNoDre, pedidoDaGrade,
  type AlvoDaPrevia, type CampoDaPrevia, type ColunaCompletar, type ResultadoCompletar, type ValoresParaTodas,
} from '@/lib/financeiro/nfe/notaCompletar';

/** P163-D1 — de início vêm marcadas SÓ a Descrição, a Competência (= emissão) e o Nº/nota; as opcionais nunca (nada do que já está no lançamento
 *  muda sem a pessoa marcar). A Safra desmarcada acompanha a competência (o banco põe a da competência nova, P138). */
/* URGENTE 29/10 — a Descrição vem DESMARCADA (o texto do usuário nunca some sem ele marcar); só Competência e Nº marcados */
/** a ordem das colunas opcionais na grade = a da lista do Financeiro; o cabeçalho com o nome da lista */
const ORDEM_DA_LISTA: readonly ColunaCompletar[] = ['favorecido', 'fazenda', 'subcentro', 'safra', 'conta'];
const CABECALHO_DA_LISTA: Partial<Record<ColunaCompletar, string>> = { subcentro: 'Plano de contas', documento: 'NF' };
const cabecalhoDe = (c: ColunaCompletar) => CABECALHO_DA_LISTA[c] ?? ROTULO_DA_COLUNA[c];
/** a frase curta quando a prévia do banco não veio (o motivo vai no ⓘ) */
export const FRASE_SEM_PREVIA = 'Não consegui conferir agora. Tente de novo.';
const MARCADAS_DE_INICIO: ReadonlySet<ColunaCompletar> = new Set<ColunaCompletar>(['competencia', 'documento']);
const dataBr = (x: unknown) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}` : null);
const dataIso = (t: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t.trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const numeroDoValor = (t: string) => { const v = Number(t.trim().replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) && t.trim() !== '' ? v : null; };
/** O texto de um valor do campo: a data dd/mm/aaaa, o nome (cadastro) ou o texto. P163 (a Vera, NF 31776): a DATA vem antes do "nome". */
const textoDo = (v: unknown, nome: string | null): string => dataBr(v) ?? (nome && !/^[0-9a-f-]{36}$/.test(nome) ? nome : (v === null || v === undefined || v === '' ? '—' : String(v)));
/** os campos sem os quais o lançamento fica incompleto: vazio aparece em destaque (P128b, a 4/4 da Alta Paulista sem conta) */
const OBRIGATORIAS: ReadonlySet<ColunaCompletar> = new Set<ColunaCompletar>(['favorecido', 'fazenda', 'conta', 'subcentro']);
const ROTULO_SITUACAO: Record<string, string> = { conciliada: 'conciliada', realizada: 'realizada', programada: 'programada' };
const SELO_SITUACAO: Record<string, string> = { conciliada: 'bg-emerald-100 text-emerald-800', realizada: 'bg-sky-100 text-sky-800', programada: 'bg-indigo-50 text-indigo-800' };
/* a régua: o campo cabe na linha de 19px; o que vai mudar é azul-claro (o valor novo; o de hoje no title) */
const CAMPO = 'h-[15px] w-full min-w-0 rounded-sm px-1 py-0 text-[10px] leading-none';
const MUDA = 'border-sky-300 bg-sky-50 font-medium text-sky-900';
const GATILHO = 'h-[15px] min-w-0 rounded-sm px-1 text-[10px] leading-none [&_svg]:h-2.5 [&_svg]:w-2.5';
const DATA = 'text-[9.5px] tabular-nums';
/* DA-NOTA ETAPA 2 (Gabriel 24/11 19:07: "não dá para ler") — NADA CORTADO NO QUE SE CONFERE e NENHUMA coluna fora da tela (1126/1280/1920): as colunas
   de número/data têm largura FIXA (px medidos para o conteúdo inteiro); as de TEXTO (Descrição, Fornecedor, Fazenda, Conta, Subcentro, Safra) dividem o
   resto e QUEBRAM LINHA (2 linhas, nunca "…"); a grade nunca rola de lado. */
const LARGURA: Record<string, number> = { parc: 62, competencia: 74, vencimento: 80, pagamento: 64, documento: 88, valor: 76, status: 72 };
/* o mínimo de cada coluna de texto: com a Descrição e as 3 da classificação (o caso de sempre) a grade cabe INTEIRA de 1126px para cima; abaixo
   disso (750–1000, as telas estreitas) a grade rola de lado em vez de espremer o texto letra a letra */
const TEXTO_MIN = 100;
/* o texto inteiro do campo (quebra), por baixo do seletor de sempre — que fica por cima, transparente, e é quem recebe o clique (a lista abre num portal) */
const QUEBRA = 'block min-h-[15px] whitespace-normal break-words rounded-sm border border-input bg-background px-1 pr-2.5 text-left text-[10px] leading-[12px]';
const GATILHO_POR_CIMA = '!h-full w-full';
const TEXTO_QUE_QUEBRA = 'block w-full min-h-[15px] resize-none overflow-hidden whitespace-pre-wrap break-words rounded-sm border border-input bg-background px-1 py-[1px] text-[10px] leading-[12px] [field-sizing:content] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
function PorCima({ texto, classe, children }: { texto: string; classe?: string; children: ReactNode }) {
  return (
    <span className="relative block rounded-sm focus-within:ring-1 focus-within:ring-ring">
      <span aria-hidden className={cn(QUEBRA, classe)} data-testid="previa-texto-inteiro">{texto}</span>
      {/* o seletor POR CIMA de propósito (a exceção declarada do gate de sobreposição, `data-painel-por-cima`): transparente, recebe o clique */}
      <span className="absolute inset-0 opacity-0 [&_*]:!h-full [&_*]:!text-[0px]" data-painel-por-cima="">{children}</span>
    </span>
  );
}

export interface OpcoesDaPrevia {
  fornecedores: FornecedorV2[];
  fazendas: Fazenda[];
  contas: ContaBancariaV2[];
  classificacoes: ClassificacaoItem[];
  safras: Safra[];
}

/** O que a prévia embutida diz ao modal da nota (o botão único "Aplicar: …" dele grava por aqui). */
export interface EstadoDaPrevia { pode: boolean; gravando: boolean; impedimento: string | null; fraseDre: string | null; gravar: () => void;
  /** DA-NOTA-ETAPAS-01 — os campos que mudam em alguma parcela (a etapa 4 Confirmar: "Atualizar N campos"); vazio enquanto confere */
  mudam: readonly string[];
  /** NOTA-ENTREGA-FUTURA-01 (3) — o motivo técnico da falha (vai ao title/ⓘ, nunca à frase da tela); `null` sem falha */
  motivo?: string | null;
  /** DA-NOTA ETAPA 2 — o subcentro troca em alguma parcela (o Resultado diz "DRE muda (subcentro)", nunca "veja o title") */
  trocaConta?: boolean }

export function PreviaCompletar({ open, onFechar, clienteId, alvos, rotulos, todasIniciais, atualizarNaoPagas, juntar, chave, onConfirmar, valorNotaCent = null,
  embutida = false, opcoes, cabecalho, semRodape = false, aoMudarEstado, diferenca = null }: {
  /** DA-NOTA-JUROS-01 — tudo pago e o pago ≠ nota: a linha "pago · nota · diferença" com o motivo (sugerido ou escolhido) e a troca; o motivo
   *  que vale vai à prévia do banco (`p_diferenca`) */
  diferenca?: { d: DiferencaDaNota; motivo: MotivoDaDiferenca | null; escolha: EscolhaDaDiferenca | null; onEscolher: (e: EscolhaDaDiferenca) => void } | null;
  open: boolean;
  /** Nota já lançada (Gabriel 29/10 10:38) — UM botão só: o rodapé da prévia sai e o modal da nota grava pelo `aoMudarEstado` */
  semRodape?: boolean;
  aoMudarEstado?: (e: EstadoDaPrevia) => void;
  /** P163-2 — a aba 3 "Como vai ficar" do modal da nota: o mesmo conteúdo, sem o diálogo próprio (o "Voltar" leva à aba anterior) */
  embutida?: boolean;
  /** P167-B2 — o valor da nota: o banco recusa na prévia quando o que fica nos lançamentos passa dele */
  valorNotaCent?: number | null;
  onFechar: () => void;
  clienteId: string;
  /** os lançamentos achados, na ordem das parcelas (1..N) */
  alvos: readonly AlvoDaPrevia[];
  /** o rótulo de cada um na coluna "Parc." ("1/5"…), pelo id */
  rotulos: Readonly<Record<string, string>>;
  todasIniciais: ValoresParaTodas;
  /** "atualizar as não pagas": as programadas não editadas levam valor e vencimento da nota */
  atualizarNaoPagas: boolean;
  /** as soltas viram UMA compra parcelada (P96a) na mesma gravação */
  juntar: boolean;
  chave: string | null;
  /** grava (a sequência é de quem chama: as que faltam, a função, a nota, o registro). Devolve a frase do que impediu, ou `null`. */
  onConfirmar: (pedido: Record<string, unknown>[]) => Promise<string | null>;
  /** as listas dos seletores (fornecedor, fazenda, conta, subcentro, safra) — sem elas, essas colunas são só leitura */
  opcoes?: OpcoesDaPrevia;
  /** o cabeçalho numa linha: "NF … · fornecedor · R$ …" */
  cabecalho?: string;
}) {
  const [todas, setTodas] = useState<ValoresParaTodas>(todasIniciais);
  const [marcadas, setMarcadas] = useState<ReadonlySet<ColunaCompletar>>(MARCADAS_DE_INICIO);
  /* a célula EDITADA (só ela): o valor para o pedido e o texto do campo enquanto se digita */
  const [celulas, setCelulas] = useState<ReadonlyMap<string, string | number>>(new Map());
  const [textos, setTextos] = useState<ReadonlyMap<string, string>>(new Map());
  const [previa, setPrevia] = useState<ResultadoCompletar | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /* DA-NOTA-CLASSIF-01 (2) — a sugestão da conta pelos itens (PLANO-SUGESTAO-01 B2): só SUGERE; o "usar" põe no "Aplicar a todas" e quem grava é o
     botão de sempre. `undefined` = procurando; `null` = a nota ainda não está gravada; `{ falha }` = não consegui verificar (P146). */
  const [itensSugeridos, setItensSugeridos] = useState<ItemSugerido[] | null | undefined | { falha: string }>(undefined);
  const [releSugestao, setReleSugestao] = useState(0);
  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setItensSugeridos(undefined);
    void sugestaoDosItensDaNota(clienteId, chave).then((r) => { if (!vivo) return; if (r.ok === false) setItensSugeridos({ falha: r.motivo }); else setItensSugeridos(r.valor); });
    return () => { vivo = false; };
  }, [open, clienteId, chave, releSugestao]);

  const pedido = useMemo(() => pedidoDaGrade(alvos, todas, marcadas, celulas, atualizarNaoPagas), [alvos, todas, marcadas, celulas, atualizarNaoPagas]);
  /* a prévia do BANCO a cada mudança (a última resposta vence; a que chega atrasada é ignorada) */
  /* DA-NOTA-JUROS-01 — o motivo que vale vai à prévia do banco (sem ele, a guarda da soma de sempre) */
  const motivoDaDiferenca = diferenca?.motivo ?? null;
  const pedidoSeq = useRef(0);
  useEffect(() => {
    if (!open) return;
    const seq = ++pedidoSeq.current;
    setConferindo(true);
    const t = setTimeout(() => {
      void completarComANota(clienteId, pedido, { juntar, chave, simular: true, valorNotaCent, diferenca: motivoDaDiferenca }).then((r) => {
        if (seq !== pedidoSeq.current) return;
        setConferindo(false);
        if (r.ok === false) { setFalha(r.motivo); return; }
        setFalha(null); setPrevia(r.valor);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [open, clienteId, pedido, juntar, chave, valorNotaCent, motivoDaDiferenca]);

  const linhaDe = (id: string) => previa?.linhas.find((l) => l.id === id) ?? null;
  const n = alvos.length;
  /* NOTA-JUNTAR-CLASSIF-01 — juntar com classificações diferentes HOJE: as opções (a de cada parcela); o clique põe a conta e a safra dela no "Aplicar a
     todas" e o banco padroniza antes de juntar. Pelo HOJE (não pelo que fica): a linha continua depois da escolha, com a escolhida marcada. */
  const idDoCampo = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const paraJuntar = juntar && previa ? classificacoesParaJuntar(alvos.map((a) => {
    const campos = linhaDe(a.id)?.campos;
    return { id: a.id, rotulo: rotulos[a.id] ?? '', planoContaId: idDoCampo(campos?.[CAMPO_DA_COLUNA.subcentro]?.hoje), safraId: idDoCampo(campos?.[CAMPO_DA_COLUNA.safra]?.hoje) };
  })) : null;
  /* a recusa do banco que a linha resolve vira a frase curta (o rodapé nunca corta) */
  const recusas = (previa?.recusas ?? []).map((r) => (paraJuntar && ehRecusaDeClassificacoes(r) ? FRASE_CLASSIFICACOES_DIFERENTES : r));
  const fraseDre = previa ? fraseDoEfeitoNoDre(previa.efeitoDre) : null;
  const podeGravar = !!previa && previa.ok && !falha && !conferindo && !gravando && recusas.length === 0;
  const rotuloDoBotao = juntar ? `Juntar as ${n}, padronizar e anexar` : atualizarNaoPagas ? `Atualizar as ${n} e anexar` : `Completar as ${n} e anexar`;
  /* as colunas OPCIONAIS: só as que mudam ou diferem (a legenda diz as que ficaram iguais) */
  /* NOTA-ENTREGA-FUTURA-01 (3, Gabriel 25/11) — as colunas na ORDEM DA LISTA do Financeiro (Fornecedor · Faz. · Plano de contas · Conta · NF · Valor
     · Status); a Safra ao lado do plano (é classificação); só o desenho: quais aparecem segue a regra de sempre */
  const opcionais = useMemo(() => ORDEM_DA_LISTA.filter((c) => colunasQueAparecem(previa?.linhas ?? [], todas, alvos).includes(c)), [previa, todas, alvos]);
  const iguais = COLUNAS_OPCIONAIS.filter((c) => !opcionais.includes(c));
  const trocarMarca = (c: ColunaCompletar) => setMarcadas((m) => { const x = new Set(m); if (x.has(c)) x.delete(c); else x.add(c); return x; });
  const editar = (k: string, valor: string | number | null, texto?: string) => {
    setCelulas((m) => { const x = new Map(m); if (valor === null) x.delete(k); else x.set(k, valor); return x; });
    if (texto !== undefined) setTextos((m) => new Map(m).set(k, texto));
  };
  /* DA-NOTA ETAPA 2 — o nome inteiro de cada escolha (o subcentro: nome curto + atividade, o que DIFERENCIA "· Pecuária" de "· Agricultura") */
  const nomeDe = (c: ColunaCompletar, id: string): string | null => {
    if (!opcoes || !id) return null;
    if (c === 'favorecido') return opcoes.fornecedores.find((f) => f.id === id)?.nome ?? null;
    if (c === 'fazenda') return opcoes.fazendas.find((f) => f.id === id)?.nome ?? null;
    if (c === 'conta') { const ct = opcoes.contas.find((x) => x.id === id); return ct ? (ct.nome_exibicao || ct.nome_conta) : null; }
    if (c === 'subcentro') { const cl = opcoes.classificacoes.find((x) => x.id === id); return cl ? nomeCurtoDaConta(cl.subcentro, cl.escopo_negocio) : null; }
    if (c === 'safra') return opcoes.safras.find((x) => x.id === id)?.nome ?? null;
    return null;
  };
  /* "Para todas": a coluna inteira volta ao valor para todas (as células editadas dela saem) e a coluna fica marcada */
  const paraTodas = (c: ColunaCompletar, mudar: (t: ValoresParaTodas) => ValoresParaTodas) => {
    setTodas(mudar);
    setMarcadas((m) => new Set(m).add(c));
    const fora = (k: string) => k.endsWith(`:${c}`) && !k.startsWith('todas:');
    setCelulas((m) => new Map([...m].filter(([k]) => !fora(k))));
    setTextos((m) => new Map([...m].filter(([k]) => !fora(k))));
  };
  const gravar = async () => {
    setGravando(true); setErro(null);
    try { const e = await onConfirmar(pedido); if (e) setErro(e); } finally { setGravando(false); }
  };
  /* o botão único do modal da nota: o estado (pode, o que impede, o DRE) sobe a cada mudança; o gravar é sempre o desta renderização */
  const gravarRef = useRef(gravar);
  gravarRef.current = gravar;
  /* NOTA-ENTREGA-FUTURA-01 (3, mock aprovado 25/11): sem mensagem técnica na tela — a frase curta; o motivo vai no ⓘ / title (`motivo`) */
  const impedimento = falha ? FRASE_SEM_PREVIA : recusas.length ? `${recusas[0]}${recusas.length > 1 ? ` (+${recusas.length - 1})` : ''}` : erro;
  const mudam = useMemo(() => (previa ? camposQueMudam(previa.linhas) : []), [previa]);
  const chaveDasMudancas = conferindo ? '' : mudam.join('|');
  useEffect(() => {
    aoMudarEstado?.({ pode: podeGravar, gravando, impedimento, motivo: falha, fraseDre: conferindo ? null : fraseDre ?? 'DRE: não muda', gravar: () => { void gravarRef.current(); },
      mudam: chaveDasMudancas ? chaveDasMudancas.split('|') : [], trocaConta: !conferindo && mudam.includes(ROTULO_DA_COLUNA.subcentro) });
  }, [aoMudarEstado, podeGravar, gravando, impedimento, falha, fraseDre, conferindo, chaveDasMudancas, mudam]);

  /* ── a célula de uma coluna da grade (Comp., Descrição, Nº e as opcionais) ── */
  const celula = (a: AlvoDaPrevia, c: ColunaCompletar, campo: CampoDaPrevia | undefined): ReactNode => {
    if (!campo) return <span className="text-muted-foreground">…</span>;
    const k = chaveDaGrade(a.id, c);
    const hoje = textoDo(campo.hoje, campo.hojeNome);
    const editada = celulas.has(k);
    const fica = editada ? celulas.get(k) : campo.fica;
    const muda = editada ? String(fica ?? '') !== String(campo.hoje ?? '') : campo.muda;
    if (campo.cadeado) {
      return <span className="text-muted-foreground" title={`🔒 ${campo.cadeado}`} data-testid="previa-cadeado">🔒 {hoje}</span>;
    }
    const vazio = !muda && OBRIGATORIAS.has(c) && (campo.hoje === null || campo.hoje === undefined || campo.hoje === '');
    const dica = vazio ? `Este lançamento está sem ${ROTULO_DA_COLUNA[c]}: escolha ou marque a coluna ${ROTULO_DA_COLUNA[c]} para completar.` : `hoje: ${hoje}`;
    const classe = cn(muda && MUDA, vazio && 'border-amber-400 bg-amber-50');
    const testid = muda ? 'previa-muda' : vazio ? 'previa-vazio' : 'previa-igual';
    const idDe = (v: string | number | undefined | unknown) => (typeof v === 'string' ? v : '');
    if (c === 'descricao' || c === 'documento' || c === 'competencia') {
      const texto = textos.get(k) ?? textoDo(fica, editada ? null : campo.ficaNome);
      const aoDigitar = (t: string) => { if (c === 'competencia') editar(k, dataIso(t), t); else editar(k, t.trim() ? t : null, t); };
      const rotulo = `${ROTULO_DA_COLUNA[c]} de ${rotulos[a.id] ?? ''}`;
      return (
        <span title={dica} data-testid={testid} data-hoje={hoje} className="block">
          {/* DA-NOTA ETAPA 2 — a Descrição QUEBRA (o texto do item inteiro, em 2 linhas se precisar), nunca corta */}
          {c === 'descricao'
            ? <textarea rows={1} value={texto === '—' ? '' : texto} className={cn(TEXTO_QUE_QUEBRA, classe)} aria-label={rotulo}
                onChange={(e) => aoDigitar(e.target.value)} data-testid={`previa-campo-${c}`} />
            : <Input value={texto === '—' ? '' : texto} className={cn(CAMPO, c === 'competencia' && DATA, classe)} aria-label={rotulo}
                onChange={(e) => aoDigitar(e.target.value)} data-testid={`previa-campo-${c}`} />}
        </span>
      );
    }
    const inteiro = nomeDe(c, idDe(fica)) ?? textoDo(fica, editada ? null : campo.ficaNome);
    if (!opcoes) return <span title={dica} data-testid={testid} data-hoje={hoje} className={cn(QUEBRA, 'border-transparent bg-transparent', classe)}>{inteiro}</span>;
    const escolher = (v: string) => editar(k, v || null);
    const g = cn(GATILHO, GATILHO_POR_CIMA);
    return (
      <span title={dica} data-testid={testid} data-hoje={hoje} className="block">
        <PorCima texto={inteiro} classe={classe}>
        {c === 'favorecido' ? <FavorecidoSelect value={idDe(fica)} onChange={escolher} fornecedores={opcoes.fornecedores} clienteId={clienteId} size="compact" linhaDoDocumento={false}
          triggerClassName={g} />
          : c === 'fazenda' ? <FazendaSelect value={idDe(fica)} onChange={escolher} fazendas={opcoes.fazendas} forcaAdministrativo={false} hideAviso triggerClassName={g} />
          : c === 'conta' ? <ContaBancariaSelect value={idDe(fica) || '__none__'} onValueChange={(v) => escolher(v === '__none__' ? '' : v)} contas={opcoes.contas}
            prependItems={[{ value: '__none__', label: '—' }]} className={g} />
          : c === 'subcentro' ? <EscolherConta valor={idDe(fica)} onEscolher={(x) => escolher(x.id)} classificacoes={opcoes.classificacoes} tipoOperacao=""
            triggerClassName={g} itemClassName="text-[10.5px]" />
          : <SearchableSelect value={idDe(fica)} onValueChange={escolher} semTodos allValue="" allLabel="—" dense options={opcoes.safras.map((sf) => ({ value: sf.id, label: sf.nome }))}
            placeholder="Buscar safra…" triggerClassName={g} />}
        </PorCima>
      </span>
    );
  };
  /* ── vencimento e valor: a paga/conciliada tem 🔒 (não mudam); a programada, o campo ── */
  const dinheiro = (a: AlvoDaPrevia, qual: 'vencimento' | 'valor', campo: CampoDaPrevia | undefined): ReactNode => {
    if (!campo) return <span className="text-muted-foreground">—</span>;
    const k = chaveDaGrade(a.id, qual);
    const fmt = (v: unknown) => (qual === 'vencimento' ? (dataBr(v) ?? '—') : reais(Math.round(Number(v) * 100)));
    const hoje = fmt(campo.hoje);
    if (campo.cadeado || !a.programada) {
      /* o cadeado é ÍCONE (a coluna de data só tem a data — o gate "data"); o porquê no title */
      return <span className={cn('inline-flex items-center gap-1 text-muted-foreground', qual === 'vencimento' && DATA)} title={`🔒 ${campo.cadeado ?? 'paga: valor e vencimento não mudam'}`}
        data-testid="previa-cadeado"><Lock className="h-2.5 w-2.5 shrink-0" aria-label="não muda" />{hoje}</span>;
    }
    const editada = celulas.has(k);
    const muda = editada ? String(celulas.get(k)) !== String(campo.hoje ?? '') : campo.muda;
    const texto = textos.get(k) ?? fmt(editada ? celulas.get(k) : campo.fica);
    /* NOTA-ATUALIZA-PREVISTO-01 (R5) — o previsto que a nota atualiza: o valor de hoje RISCADO antes do novo (1.000,00 → 1.561,42) */
    const riscado = qual === 'valor' && a.atualizar && muda;
    return (
      <span title={`hoje: ${hoje}`} data-testid={muda ? 'previa-muda' : 'previa-igual'} data-hoje={hoje} className={riscado ? 'flex min-w-0 items-center gap-1' : 'block'}>
        {riscado && <s className="shrink-0 tabular-nums text-muted-foreground" data-testid="previa-valor-riscado">{hoje}</s>}
        <Input value={texto} className={cn(CAMPO, qual === 'vencimento' ? DATA : 'text-right tabular-nums', muda && MUDA, riscado && 'min-w-0 flex-1')}
          aria-label={`${qual === 'vencimento' ? 'Vencimento' : 'Valor'} de ${rotulos[a.id] ?? ''}`}
          onChange={(e) => { const t = e.target.value; editar(k, qual === 'vencimento' ? dataIso(t) : numeroDoValor(t), t); }} data-testid={`previa-campo-${qual}`} />
      </span>
    );
  };

  /* ── o cabeçalho de uma coluna que muda: a caixinha "para todas" ── */
  const cabeca = (c: ColunaCompletar, rotulo: string) => (
    <label className="flex min-w-0 cursor-pointer items-center gap-1" title={`${ROTULO_DA_COLUNA[c]} — marcar = o valor de "Para todas" em todas`}>
      <Checkbox checked={marcadas.has(c)} onCheckedChange={() => trocarMarca(c)} className="h-3 w-3 border-primary-foreground" data-testid={`previa-coluna-${c}`} />
      <span className="min-w-0 truncate">{rotulo}</span>
    </label>
  );
  /* ── a linha "Para todas" (fundo cinza): o valor que a coluna marcada leva às N ── */
  const todasDe = (c: ColunaCompletar): ReactNode => {
    const k = `todas:${c}`;
    if (c === 'descricao') {
      return <textarea rows={1} value={todas.descricaoBase} onChange={(e) => { const t = e.target.value; paraTodas('descricao', (x) => ({ ...x, descricaoBase: t })); }}
        className={cn(TEXTO_QUE_QUEBRA, 'font-medium')} placeholder="a base · vira «base i/N»" title={`vira «base 1/${n}» … «base ${n}/${n}»`} data-testid="previa-descricao-base" />;
    }
    if (c === 'documento') {
      return <Input value={todas.numeroDocumento} onChange={(e) => { const t = e.target.value; paraTodas('documento', (x) => ({ ...x, numeroDocumento: t })); }}
        className={cn(CAMPO, 'tabular-nums')} data-testid="previa-numero" />;
    }
    if (c === 'competencia') {
      const texto = textos.get(k) ?? dataBr(todas.competencia) ?? '';
      return <Input value={texto} className={cn(CAMPO, DATA)} title="dd/mm/aaaa (= emissão)" data-testid="previa-competencia"
        onChange={(e) => { const t = e.target.value; setTextos((m) => new Map(m).set(k, t)); const iso = dataIso(t); if (iso) paraTodas('competencia', (x) => ({ ...x, competencia: iso })); }} />;
    }
    if (!opcoes) return null;
    const valor = c === 'favorecido' ? todas.favorecidoId : c === 'fazenda' ? todas.fazendaId : c === 'conta' ? todas.contaId : c === 'subcentro' ? todas.planoContaId : todas.safraId;
    const por = (v: string | null) => paraTodas(c, (x) => (c === 'favorecido' ? { ...x, favorecidoId: v } : c === 'fazenda' ? { ...x, fazendaId: v } : c === 'conta' ? { ...x, contaId: v }
      : c === 'subcentro' ? { ...x, planoContaId: v } : { ...x, safraId: v }));
    const g = cn(GATILHO, GATILHO_POR_CIMA);
    /* o texto inteiro do vazio: "escolha" no cadastro, "a da competência" na Safra (o banco põe a da competência, P138) */
    const texto = nomeDe(c, valor ?? '') ?? (c === 'safra' ? 'a da competência' : c === 'conta' ? '—' : c === 'subcentro' ? 'Selecione o subcentro' : 'Selecione');
    return (
      <PorCima texto={texto} classe={valor ? undefined : 'text-muted-foreground'}>
        {c === 'favorecido' ? <FavorecidoSelect value={valor ?? ''} onChange={(v) => por(v || null)} fornecedores={opcoes.fornecedores} clienteId={clienteId} size="compact" linhaDoDocumento={false} triggerClassName={g} />
          : c === 'fazenda' ? <FazendaSelect value={valor ?? ''} onChange={(v) => por(v || null)} fazendas={opcoes.fazendas} forcaAdministrativo={false} hideAviso triggerClassName={g} />
          : c === 'conta' ? <ContaBancariaSelect value={valor || '__none__'} onValueChange={(v) => por(v === '__none__' ? null : v)} contas={opcoes.contas} prependItems={[{ value: '__none__', label: '—' }]} className={g} />
          : c === 'subcentro' ? <EscolherConta valor={valor ?? ''} onEscolher={(x) => por(x.id)} classificacoes={opcoes.classificacoes} tipoOperacao="" triggerClassName={g} itemClassName="text-[10.5px]" />
          : <SearchableSelect value={valor ?? ''} onValueChange={(v) => por(v || null)} semTodos allValue="" allLabel="a da competência" dense options={opcoes.safras.map((sf) => ({ value: sf.id, label: sf.nome }))} placeholder="Buscar safra…" triggerClassName={g} />}
      </PorCima>
    );
  };

  const somaCent = alvos.reduce((t, a) => t + Math.round(Number(linhaDe(a.id)?.campos.valor?.hoje ?? 0) * 100), 0);
  /* DA-NOTA-CLASSIF-01 (2) — a sugestão numa linha, à direita do título (lugar reservado: nada empurra a tabela) */
  const planoHoje = alvos.map((a) => { const v = linhaDe(a.id)?.campos[CAMPO_DA_COLUNA.subcentro]?.hoje; return typeof v === 'string' && v ? v : null; });
  const sugestao = Array.isArray(itensSugeridos) ? sugestaoParaAsParcelas(itensSugeridos, planoHoje) : null;
  const subcentroDaGrade = celulas.size === 0 && marcadas.has('subcentro') ? todas.planoContaId : null;
  const sugestaoNaTela = (
    <span className="ml-auto flex h-[16px] min-w-0 max-w-[60%] items-center justify-end gap-1 text-[9.5px] font-normal text-muted-foreground" data-testid="previa-sugestao">
      {itensSugeridos === undefined ? <span>procurando a sugestão pelos itens…</span>
        : itensSugeridos === null ? <span data-testid="previa-sugestao-sem-nota">Sugestão pelos itens depois de gravar a nota</span>
        : !Array.isArray(itensSugeridos) ? (<>
            <span className="min-w-0 truncate" title={itensSugeridos.falha} data-testid="previa-sugestao-falha">Não consegui verificar a sugestão pelos itens</span>
            <button type="button" className="shrink-0 text-primary underline-offset-2 hover:underline" onClick={() => setReleSugestao((x) => x + 1)}>Tentar de novo</button>
          </>)
        : sugestao?.tipo === 'uma' ? (<>
            <span className="shrink-0">Sugestão pelos itens:</span>
            <span className="min-w-0 truncate font-medium text-foreground" title={`${sugestao.subcentro} — ${sugestao.porque}`} data-testid="previa-sugestao-conta">{sugestao.subcentro}</span>
            {sugestao.igualAHoje || subcentroDaGrade === sugestao.planoContaId
              ? <span className="shrink-0" data-testid="previa-sugestao-igual">· {sugestao.igualAHoje ? 'já está nela' : 'em uso'}</span>
              : <button type="button" className="shrink-0 font-medium text-primary underline-offset-2 hover:underline" data-testid="previa-sugestao-usar"
                  onClick={() => paraTodas('subcentro', (x) => ({ ...x, planoContaId: sugestao.planoContaId }))}>usar</button>}
          </>)
        : sugestao?.tipo === 'varias' ? <span data-testid="previa-sugestao-varias">Os itens vão para {sugestao.contas} contas: divida na etapa Itens da nota</span>
        : <span data-testid="previa-sugestao-nenhuma">Sem sugestão pelos itens</span>}
      <Ajuda titulo="Sugestão pelos itens" lado="left"
        oQueE="A conta que os itens desta nota indicam (regra sua, uso neste cliente, o resto da nota, outros clientes ou o NCM)."
        porQue="Na paga ou conciliada só o caixa trava (valor, pagamento e conta bancária); a classificação continua editável, com trilha e o DRE acompanhando."
        comoFazer="Clique em usar: a conta vai para o Aplicar a todas. Nada é gravado antes do botão do rodapé." />
    </span>
  );
  /* DA-NOTA ETAPA 2 (Gabriel 19:30) — a troca de subcentro DESTACADA ("muda de X para Y", nomes curtos com a atividade), nunca só "DRE muda (veja o
     title)". Linha de altura FIXA, sempre presente ("não muda" quando nada troca): o "usar" da sugestão não empurra a tabela. */
  const trocasDeConta = (() => {
    const pares = new Map<string, { de: string; para: string }>();
    for (const l of previa?.linhas ?? []) {
      const c = l.campos[CAMPO_DA_COLUNA.subcentro];
      if (!c || !c.muda) continue;
      const de = nomeDe('subcentro', idDoCampo(c.hoje) ?? '') ?? textoDo(c.hoje, c.hojeNome);
      const para = nomeDe('subcentro', idDoCampo(c.fica) ?? '') ?? textoDo(c.fica, c.ficaNome);
      pares.set(`${de}|${para}`, { de, para });
    }
    return [...pares.values()];
  })();
  const conteudo = (<>
    {/* o título da tabela: quantas parcelas (a linha "Aplicar a todas" não é uma delas) */}
    <div className="flex h-[18px] shrink-0 items-center gap-2 px-4 pt-1 text-[10.5px]" data-testid="previa-titulo">
      <span className="shrink-0 font-semibold">{n} parcela{n === 1 ? '' : 's'}</span>
      {sugestaoNaTela}
    </div>
    {/* DA-NOTA-JUROS-01 — pago ≠ nota com tudo pago: os números cada um no seu lugar + o motivo (sugerido em âmbar; trocar = "não é"); nunca trava */}
    {diferenca && (() => {
      const nums = numerosDaDiferenca(diferenca.d);
      const mais = diferenca.d.difCent > 0;
      const valor: EscolhaDaDiferenca = diferenca.escolha ?? diferenca.d.sugerido;
      return (
        <div className="flex h-[24px] shrink-0 items-center gap-2 px-4 text-[10px]" data-testid="previa-diferenca" title={porqueDaDiferenca(diferenca.d)}>
          <span className="shrink-0 text-muted-foreground">pago</span><span className="shrink-0 font-medium tabular-nums" data-testid="previa-diferenca-pago">{nums.pago}</span>
          <span className="shrink-0 text-muted-foreground">· nota</span><span className="shrink-0 font-medium tabular-nums" data-testid="previa-diferenca-nota">{nums.nota}</span>
          <span className="shrink-0 text-muted-foreground">· diferença</span>
          <span className={cn('shrink-0 font-semibold tabular-nums', mais ? 'text-amber-800' : 'text-emerald-800')} data-testid="previa-diferenca-valor">{nums.diferenca}</span>
          <Segmentado altura={20} fonte={9.5} valor={valor} onEscolher={diferenca.onEscolher} sugestao={diferenca.escolha === null}
            opcoes={mais
              ? [{ valor: 'juros', rotulo: 'Juros/multa', title: 'A diferença vai para Despesas Financeiras, no mesmo pagamento' },
                 { valor: 'conferir', rotulo: 'Não é juros', title: 'A soma passa da nota: confira se todos são desta compra' }]
              : [{ valor: 'desconto', rotulo: 'Desconto', title: 'Pago a menos: o lançamento fica como está' },
                 { valor: 'conferir', rotulo: 'Não é desconto', title: 'Confira o que falta pagar desta nota' }]} />
          <Ajuda titulo="Pago × nota" oQueE="A diferença entre o que foi pago e a nota."
            porQue={mais ? 'Pago a mais depois do vencimento costuma ser juros ou multa: a nota não deixa de ser desta compra.' : 'Pago a menos costuma ser desconto.'}
            comoFazer={mais ? 'Juros/multa: o pagamento fica dividido em duas contas (a da nota e Despesas Financeiras); valor, caixa e conciliação não mudam.'
              : 'Desconto: nada muda no lançamento.'} />
        </div>
      );
    })()}
    {/* DA-NOTA ETAPA 2 — de 1126px para cima só rola para BAIXO: as colunas de texto quebram linha em vez de empurrar a grade para fora da tela */}
    {paraJuntar && (() => {
      const escolhida = marcadas.has('subcentro') ? paraJuntar.opcoes.find((o) => o.planoContaId === todas.planoContaId) ?? null : null;
      const nomeDaOpcao = (planoContaId: string, safraId: string | null) =>
        [opcoes?.classificacoes.find((x) => x.id === planoContaId)?.subcentro ?? 'a conta desta parcela', safraId ? nomeDe('safra', safraId) : null].filter(Boolean).join(' · ');
      return (
        <div className="flex h-[24px] shrink-0 items-center gap-2 px-4 text-[10px]" data-testid="previa-juntar-classif">
          <span className="shrink-0 font-medium text-amber-900">Classificações diferentes</span>
          <span className="shrink-0 text-muted-foreground">· juntar pede uma só:</span>
          <Segmentado altura={20} fonte={9.5} valor={escolhida?.planoContaId ?? ''}
            onEscolher={(v) => {
              const o = paraJuntar.opcoes.find((x) => x.planoContaId === v);
              if (!o) return;
              paraTodas('subcentro', (x) => ({ ...x, planoContaId: o.planoContaId }));
              /* a safra vem junto: conta de outra atividade com a safra antiga o banco recusa ("Safra é de pecuária…") */
              if (o.safraId) { const sf = o.safraId; paraTodas('safra', (x) => ({ ...x, safraId: sf })); }
            }}
            opcoes={[...paraJuntar.opcoes.map((o) => ({ valor: o.planoContaId, rotulo: `Usar a da ${o.rotulo} em todas`, title: nomeDaOpcao(o.planoContaId, o.safraId) })),
              { valor: 'dividir', rotulo: 'Dividir por item · em breve', desabilitada: true, title: 'O rateio por item (cada item na sua conta) ainda não existe: enquanto isso, não junta.' }]} />
          {paraJuntar.mais > 0 && <span className="shrink-0 text-muted-foreground" data-testid="previa-juntar-classif-mais">+{paraJuntar.mais}: no Aplicar a todas</span>}
          <Ajuda titulo="Juntar com classificações diferentes"
            oQueE="As parcelas desta nota estão em contas diferentes (por exemplo, uma na Agricultura e outra na Pecuária)."
            porQue="Uma compra parcelada tem uma classificação só: juntar pede a mesma conta em todas as parcelas."
            comoFazer="Clique na parcela cuja conta vale para todas: a conta e a safra dela vão para o Aplicar a todas (paga ou conciliada também; o caixa não muda). Nada é gravado antes do botão do rodapé." />
        </div>
      );
    })()}
    <div className="min-h-0 flex-1 overflow-auto px-4 pb-1" data-testid="previa-rolagem">
      <table className="w-full table-fixed border-collapse" style={{ minWidth: Object.values(LARGURA).reduce((t, x) => t + x, 0) + (1 + opcionais.length) * TEXTO_MIN }}
        data-testid="previa-tabela">
        <colgroup>
          <col style={{ width: LARGURA.parc }} /><col style={{ width: LARGURA.competencia }} /><col style={{ width: LARGURA.vencimento }} /><col style={{ width: LARGURA.pagamento }} />
          {/* a Descrição e as de texto (fornecedor, fazenda, conta, subcentro, safra) dividem o resto, por igual */}
          <col />
          {opcionais.map((c) => <col key={c} />)}
          <col style={{ width: LARGURA.documento }} />
          <col style={{ width: LARGURA.valor }} /><col style={{ width: LARGURA.status }} />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-primary"><tr>
          <th className={cn(TH_REGUA, 'text-left')} title="Parcela">Parc.</th>
          <th className={cn(TH_REGUA, 'text-left')}>{cabeca('competencia', 'Comp.')}</th>
          <th className={cn(TH_REGUA, 'text-left')} title="Vencimento">Venc.</th>
          <th className={cn(TH_REGUA, 'text-left')} title="Pagamento">Pgto.</th>
          <th className={cn(TH_REGUA, 'text-left')}>{cabeca('descricao', 'Descrição')}</th>
          {opcionais.map((c) => <th key={c} className={cn(TH_REGUA, 'text-left')}>{cabeca(c, cabecalhoDe(c))}</th>)}
          <th className={cn(TH_REGUA, 'text-left')}>{cabeca('documento', cabecalhoDe('documento'))}</th>
          <th className={cn(TH_REGUA, 'text-right')} title="Valor">Valor</th>
          <th className={cn(TH_REGUA, 'text-right')} title="Status">Status</th>
        </tr>
          {/* Ajuste 29/10 14:02 (item 6) — "Aplicar a todas" é a 2ª linha do CABEÇALHO (azul-claro), não uma parcela: o valor que a coluna MARCADA
              leva às N, nas mesmas colunas; as parcelas começam logo abaixo */}
          <tr className="border-b border-blue-200 bg-blue-50 font-medium" data-testid="previa-para-todas">
            <td className={cn(TD_REGUA, 'leading-[12px] text-blue-900')} title="o valor desta linha vai para a coluna inteira (marcada)">Aplicar a todas ↓</td>
            <td className={TD_REGUA}>{todasDe('competencia')}</td>
            <td className={TD_REGUA} /><td className={TD_REGUA} />
            <td className={TD_REGUA}>
              {/* a base e o "· i/N" do mock: cada parcela leva «base i/N» */}
              <span className="flex min-w-0 items-center gap-1">{todasDe('descricao')}<span className="shrink-0 font-normal text-muted-foreground">· i/{n}</span></span>
            </td>
            {/* a Safra vazia diz "a da competência" inteiro (quebra se precisar) */}
            {opcionais.map((c) => <td key={c} className={TD_REGUA} title={c === 'safra' && !todas.safraId ? 'a da competência: a safra que o banco põe pela competência' : undefined}>{todasDe(c)}</td>)}
            <td className={TD_REGUA}>{todasDe('documento')}</td>
            <td className={TD_REGUA_NUM} title={valorNotaCent !== null ? 'o valor da nota' : 'a soma das parcelas hoje'}>{valorNotaCent !== null ? reais(valorNotaCent) : previa ? reais(somaCent) : '—'}</td>
            <td className={TD_REGUA} />
          </tr>
        </thead>
        <tbody>
          {alvos.map((a) => {
            const l = linhaDe(a.id);
            const campos = l?.campos;
            return (
              <tr key={a.id} className="border-b border-border/50" data-testid="previa-linha" data-alvo={a.id} data-situacao={l?.situacao ?? ''}>
                <td className={cn(TD_REGUA_NUM, 'text-left')} title={l?.descricao ?? undefined}>{rotulos[a.id] ?? '—'}</td>
                <td className={TD_REGUA} data-coluna="competencia">{campos ? celula(a, 'competencia', campos[CAMPO_DA_COLUNA.competencia]) : '…'}</td>
                <td className={TD_REGUA} data-coluna="vencimento">{campos ? dinheiro(a, 'vencimento', campos.data_vencimento) : '—'}</td>
                <td className={cn(TD_REGUA, DATA, 'text-muted-foreground')}>{dataBr(a.pagamento) ?? '—'}</td>
                <td className={TD_REGUA} data-coluna="descricao">{campos ? celula(a, 'descricao', campos[CAMPO_DA_COLUNA.descricao]) : '…'}</td>
                {opcionais.map((c) => <td key={c} className={TD_REGUA} data-coluna={c}>{campos ? celula(a, c, campos[CAMPO_DA_COLUNA[c]]) : '…'}</td>)}
                <td className={TD_REGUA} data-coluna="documento">{campos ? celula(a, 'documento', campos[CAMPO_DA_COLUNA.documento]) : '…'}</td>
                <td className={TD_REGUA_NUM} data-coluna="valor">{campos ? dinheiro(a, 'valor', campos.valor) : '—'}</td>
                <td className={cn(TD_REGUA, 'text-right')}>
                  {l && <span className={cn('inline-block rounded-full px-1.5 text-[9px] leading-[14px]', SELO_SITUACAO[l.situacao])}>{ROTULO_SITUACAO[l.situacao]}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {/* a legenda numa linha: o que é azul, o igual, o cadeado e as colunas que ficaram iguais em todas (por isso não aparecem) */}
    {/* DA-NOTA ETAPA 2 (Gabriel 19:30) — a troca de subcentro DESTACADA ("Subcentro muda de X para Y", nomes curtos com a atividade) no LUGAR da legenda
        (a mesma linha de 18px: nada cresce, nada se desloca); sem troca, a legenda de sempre */}
    {trocasDeConta.length > 0 ? (
      <div className="flex h-[18px] shrink-0 items-center gap-1 overflow-hidden px-4 text-[10px]" data-testid="previa-troca-conta"
        title={trocasDeConta.map((t) => `${t.de} → ${t.para}`).join('\n')}>
        <span className="shrink-0 text-muted-foreground">Subcentro muda de</span>
        <span className="shrink-0 font-medium text-foreground" data-testid="previa-troca-conta-de">{trocasDeConta[0].de}</span>
        <span className="shrink-0 text-muted-foreground">para</span>
        <span className={cn('shrink-0 rounded-sm border px-1 font-semibold leading-[13px]', MUDA)} data-testid="previa-troca-conta-para">{trocasDeConta[0].para}</span>
        {trocasDeConta.length > 1 && <span className="shrink-0 text-muted-foreground">+{trocasDeConta.length - 1} troca{trocasDeConta.length > 2 ? 's' : ''}</span>}
      </div>
    ) : (
    <div className="flex h-[18px] shrink-0 items-center gap-3 overflow-hidden px-4 text-[9.5px] text-muted-foreground" data-testid="previa-legenda">
      <span className="flex shrink-0 items-center gap-1"><i className={cn('inline-block h-2.5 w-4 rounded-sm border', MUDA)} />vai mudar</span>
      <span className="flex shrink-0 items-center gap-1"><i className="inline-block h-2.5 w-4 rounded-sm border bg-background" />igual (pode editar)</span>
      <span className="flex shrink-0 items-center gap-1"><Lock className="h-2.5 w-2.5" />pago/conciliado</span>
      {iguais.length > 0 && (
        <span className="min-w-0 uma-linha-que-rola" data-testid="previa-iguais">
          {iguais.map((c, i) => (i === 0 ? ROTULO_DA_COLUNA[c] : ROTULO_DA_COLUNA[c].toLowerCase())).join(', ')}: {iguais.length === 1 ? 'igual em todas' : 'iguais em todas'}
        </span>
      )}
    </div>
    )}
    {/* o rodapé numa linha: o DRE (ou o que impede, a frase pronta do banco) · nada é gravado antes do clique · Voltar · a ação */}
    {!semRodape && (
    <div className="flex h-10 shrink-0 items-center gap-2 border-t bg-card px-4 text-[10px]">
      {/* P104: frase nunca rola nem corta — duas linhas reservadas (a 750 o "nada é gravado…" desce para a 2ª) */}
      <span className="flex h-[26px] min-w-0 flex-1 items-center leading-[13px]" data-testid="previa-rodape-frase"><span className="line-clamp-2">
        {falha ? <span className="inline-flex items-center gap-1 text-destructive"><span data-testid="previa-falha">{FRASE_SEM_PREVIA}</span>
            <Ajuda titulo="Por que a prévia não veio" oQueE={`O banco não respondeu à conferência: ${falha}.`} porQue="Sem a prévia nada é gravado: o Aplicar só grava o que o banco conferiu." comoFazer="Tente de novo em instantes; se continuar, feche e abra a nota." /></span>
          : recusas.length ? <span className="text-destructive" data-testid="previa-recusa">{recusas[0]}{recusas.length > 1 ? ` (+${recusas.length - 1})` : ''}</span>
          : erro ? <span className="text-destructive" data-testid="previa-erro">{erro}</span>
          : <span className="text-muted-foreground"><span className="text-foreground" data-testid="previa-dre">{fraseDre ?? 'DRE: não muda'}</span> · {conferindo ? 'conferindo com o banco…' : 'nada é gravado antes de você clicar'}</span>}
      </span></span>
      <Button type="button" size="sm" variant="outline" className="h-[24px] shrink-0 px-2.5 text-[10.5px]" onClick={onFechar} disabled={gravando}>Voltar</Button>
      <Button type="button" size="sm" className="h-[24px] w-[220px] shrink-0 px-2.5 text-[10.5px]" disabled={!podeGravar} onClick={() => { void gravar(); }}
        data-testid="previa-gravar">{gravando ? 'Gravando…' : rotuloDoBotao}</Button>
    </div>
    )}
  </>);

  if (embutida) {
    return open ? <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-card" data-testid="previa-completar">{conteudo}</div> : null;
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !gravando) onFechar(); }}>
      <DialogContent className="flex h-[min(600px,calc(100dvh-32px))] w-[min(1180px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="previa-completar">
        <div className="flex h-9 shrink-0 items-center bg-primary px-4 pr-10">
          {/* o cabeçalho numa linha (o mock v4): o título e a nota */}
          <DialogTitle className="min-w-0 uma-linha-que-rola text-[13px] font-semibold leading-none text-primary-foreground">
            O que a nota muda em cada parcela{cabecalho ? ` · ${cabecalho}` : ''}</DialogTitle>
          <DialogDescription className="sr-only">Prévia campo a campo: cada parcela numa linha, o que muda em azul, antes de gravar.</DialogDescription>
        </div>
        {conteudo}
      </DialogContent>
    </Dialog>
  );
}
