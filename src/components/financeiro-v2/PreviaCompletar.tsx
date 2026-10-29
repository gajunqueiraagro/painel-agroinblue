/**
 * P128b → P163 v4 (o mock APROVADO pelo Gabriel 29/10 06:43, ~/Downloads/mock-nota-muda-v4.html) — "O que a nota muda em cada parcela": UMA LINHA
 * POR PARCELA, as colunas na ordem da casa (Parc. · Comp. · Venc. · Pgto. · Descrição · Nº documento · [Fornecedor · Fazenda · Conta · Subcentro ·
 * Safra, só se MUDAM ou DIFEREM] · Valor · Status). Toda célula que pode mudar é um CAMPO (a parcela livre, célula a célula); a 1ª linha "Para
 * todas" aplica a coluna inteira (a caixinha do cabeçalho). A célula que vai mudar tem o fundo azul-claro com o valor NOVO e o de hoje no title —
 * sem riscado, sem "→". 🔒 na paga/conciliada só em Valor e Vencimento (e na Conta: o banco não a muda); nas programadas, Venc. e Valor são campos.
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
import { completarComANota } from '@/lib/financeiro/nfeConsultas';
import {
  CAMPO_DA_COLUNA, COLUNAS_OPCIONAIS, ROTULO_DA_COLUNA, chaveDaGrade, colunasQueAparecem, fraseDoEfeitoNoDre, pedidoDaGrade,
  type AlvoDaPrevia, type CampoDaPrevia, type ColunaCompletar, type ResultadoCompletar, type ValoresParaTodas,
} from '@/lib/financeiro/nfe/notaCompletar';

/** P163-D1 — de início vêm marcadas SÓ a Descrição, a Competência (= emissão) e o Nº/nota; as opcionais nunca (nada do que já está no lançamento
 *  muda sem a pessoa marcar). A Safra desmarcada acompanha a competência (o banco põe a da competência nova, P138). */
/* URGENTE 29/10 — a Descrição vem DESMARCADA (o texto do usuário nunca some sem ele marcar); só Competência e Nº marcados */
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
/** as larguras (px) das colunas fixas; a Descrição leva o resto (o quadro rola de lado abaixo do mínimo: nada corta) */
const LARGURA: Record<string, number> = { parc: 66, competencia: 84, vencimento: 84, pagamento: 72, documento: 112, favorecido: 170, fazenda: 150,
  conta: 150, subcentro: 170, safra: 110, valor: 84, status: 78 };
const DESCRICAO_MIN = 230;

export interface OpcoesDaPrevia {
  fornecedores: FornecedorV2[];
  fazendas: Fazenda[];
  contas: ContaBancariaV2[];
  classificacoes: ClassificacaoItem[];
  safras: Safra[];
}

/** O que a prévia embutida diz ao modal da nota (o botão único "Aplicar: …" dele grava por aqui). */
export interface EstadoDaPrevia { pode: boolean; gravando: boolean; impedimento: string | null; fraseDre: string | null; gravar: () => void }

export function PreviaCompletar({ open, onFechar, clienteId, alvos, rotulos, todasIniciais, atualizarNaoPagas, juntar, chave, onConfirmar, valorNotaCent = null,
  embutida = false, opcoes, cabecalho, semRodape = false, aoMudarEstado }: {
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

  const pedido = useMemo(() => pedidoDaGrade(alvos, todas, marcadas, celulas, atualizarNaoPagas), [alvos, todas, marcadas, celulas, atualizarNaoPagas]);
  /* a prévia do BANCO a cada mudança (a última resposta vence; a que chega atrasada é ignorada) */
  const pedidoSeq = useRef(0);
  useEffect(() => {
    if (!open) return;
    const seq = ++pedidoSeq.current;
    setConferindo(true);
    const t = setTimeout(() => {
      void completarComANota(clienteId, pedido, { juntar, chave, simular: true, valorNotaCent }).then((r) => {
        if (seq !== pedidoSeq.current) return;
        setConferindo(false);
        if (r.ok === false) { setFalha(r.motivo); return; }
        setFalha(null); setPrevia(r.valor);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [open, clienteId, pedido, juntar, chave, valorNotaCent]);

  const linhaDe = (id: string) => previa?.linhas.find((l) => l.id === id) ?? null;
  const n = alvos.length;
  const recusas = previa?.recusas ?? [];
  const fraseDre = previa ? fraseDoEfeitoNoDre(previa.efeitoDre) : null;
  const podeGravar = !!previa && previa.ok && !falha && !conferindo && !gravando && recusas.length === 0;
  const rotuloDoBotao = juntar ? `Juntar as ${n}, padronizar e anexar` : atualizarNaoPagas ? `Atualizar as ${n} e anexar` : `Completar as ${n} e anexar`;
  /* as colunas OPCIONAIS: só as que mudam ou diferem (a legenda diz as que ficaram iguais) */
  const opcionais = useMemo(() => colunasQueAparecem(previa?.linhas ?? [], todas, alvos), [previa, todas, alvos]);
  const iguais = COLUNAS_OPCIONAIS.filter((c) => !opcionais.includes(c));
  const trocarMarca = (c: ColunaCompletar) => setMarcadas((m) => { const x = new Set(m); if (x.has(c)) x.delete(c); else x.add(c); return x; });
  const editar = (k: string, valor: string | number | null, texto?: string) => {
    setCelulas((m) => { const x = new Map(m); if (valor === null) x.delete(k); else x.set(k, valor); return x; });
    if (texto !== undefined) setTextos((m) => new Map(m).set(k, texto));
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
  const impedimento = falha ? `Não consegui conferir a prévia (${falha}).` : recusas.length ? `${recusas[0]}${recusas.length > 1 ? ` (+${recusas.length - 1})` : ''}` : erro;
  useEffect(() => {
    aoMudarEstado?.({ pode: podeGravar, gravando, impedimento, fraseDre: conferindo ? null : fraseDre ?? 'DRE: não muda', gravar: () => { void gravarRef.current(); } });
  }, [aoMudarEstado, podeGravar, gravando, impedimento, fraseDre, conferindo]);

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
      return (
        <span title={dica} data-testid={testid} data-hoje={hoje} className="block">
          <Input value={texto === '—' ? '' : texto} className={cn(CAMPO, c === 'competencia' && DATA, classe)} aria-label={`${ROTULO_DA_COLUNA[c]} de ${rotulos[a.id] ?? ''}`}
            onChange={(e) => {
              const t = e.target.value;
              if (c === 'competencia') editar(k, dataIso(t), t);
              else editar(k, t.trim() ? t : null, t);
            }} data-testid={`previa-campo-${c}`} />
        </span>
      );
    }
    if (!opcoes) return <span title={dica} data-testid={testid} data-hoje={hoje} className={cn('block truncate', classe)}>{textoDo(fica, campo.ficaNome)}</span>;
    const escolher = (v: string) => editar(k, v || null);
    return (
      <span title={dica} data-testid={testid} data-hoje={hoje} className="block">
        {c === 'favorecido' ? <FavorecidoSelect value={idDe(fica)} onChange={escolher} fornecedores={opcoes.fornecedores} clienteId={clienteId} size="compact" linhaDoDocumento={false}
          triggerClassName={cn(GATILHO, classe)} />
          : c === 'fazenda' ? <FazendaSelect value={idDe(fica)} onChange={escolher} fazendas={opcoes.fazendas} forcaAdministrativo={false} hideAviso triggerClassName={cn(GATILHO, classe)} />
          : c === 'conta' ? <ContaBancariaSelect value={idDe(fica) || '__none__'} onValueChange={(v) => escolher(v === '__none__' ? '' : v)} contas={opcoes.contas}
            prependItems={[{ value: '__none__', label: '—' }]} className={cn(GATILHO, classe)} />
          : c === 'subcentro' ? <EscolherConta valor={idDe(fica)} onEscolher={(x) => escolher(x.id)} classificacoes={opcoes.classificacoes} tipoOperacao=""
            triggerClassName={cn(GATILHO, classe)} itemClassName="text-[10.5px]" />
          : <SearchableSelect value={idDe(fica)} onValueChange={escolher} semTodos allValue="" allLabel="—" dense options={opcoes.safras.map((sf) => ({ value: sf.id, label: sf.nome }))}
            placeholder="Buscar safra…" triggerClassName={cn(GATILHO, classe)} />}
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
    return (
      <span title={`hoje: ${hoje}`} data-testid={muda ? 'previa-muda' : 'previa-igual'} data-hoje={hoje} className="block">
        <Input value={texto} className={cn(CAMPO, qual === 'vencimento' ? DATA : 'text-right tabular-nums', muda && MUDA)}
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
      return <Input value={todas.descricaoBase} onChange={(e) => { const t = e.target.value; paraTodas('descricao', (x) => ({ ...x, descricaoBase: t })); }}
        className={CAMPO} placeholder="a base · vira «base i/N»" title={`vira «base 1/${n}» … «base ${n}/${n}»`} data-testid="previa-descricao-base" />;
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
    return c === 'favorecido' ? <FavorecidoSelect value={valor ?? ''} onChange={(v) => por(v || null)} fornecedores={opcoes.fornecedores} clienteId={clienteId} size="compact" linhaDoDocumento={false} triggerClassName={GATILHO} />
      : c === 'fazenda' ? <FazendaSelect value={valor ?? ''} onChange={(v) => por(v || null)} fazendas={opcoes.fazendas} forcaAdministrativo={false} hideAviso triggerClassName={GATILHO} />
      : c === 'conta' ? <ContaBancariaSelect value={valor || '__none__'} onValueChange={(v) => por(v === '__none__' ? null : v)} contas={opcoes.contas} prependItems={[{ value: '__none__', label: '—' }]} className={GATILHO} />
      : c === 'subcentro' ? <EscolherConta valor={valor ?? ''} onEscolher={(x) => por(x.id)} classificacoes={opcoes.classificacoes} tipoOperacao="" triggerClassName={GATILHO} itemClassName="text-[10.5px]" />
      : <SearchableSelect value={valor ?? ''} onValueChange={(v) => por(v || null)} semTodos allValue="" allLabel="a da competência" dense options={opcoes.safras.map((sf) => ({ value: sf.id, label: sf.nome }))} placeholder="Buscar safra…" triggerClassName={GATILHO} />;
  };

  const larguraMin = LARGURA.parc + LARGURA.competencia + LARGURA.vencimento + LARGURA.pagamento + DESCRICAO_MIN + LARGURA.documento
    + opcionais.reduce((t, c) => t + LARGURA[c], 0) + LARGURA.valor + LARGURA.status;
  const somaCent = alvos.reduce((t, a) => t + Math.round(Number(linhaDe(a.id)?.campos.valor?.hoje ?? 0) * 100), 0);
  const conteudo = (<>
    <div className="min-h-0 flex-1 overflow-auto px-4 py-2" data-testid="previa-rolagem">
      <table className="w-full table-fixed border-collapse" style={{ minWidth: larguraMin }} data-testid="previa-tabela">
        <colgroup>
          <col style={{ width: LARGURA.parc }} /><col style={{ width: LARGURA.competencia }} /><col style={{ width: LARGURA.vencimento }} /><col style={{ width: LARGURA.pagamento }} />
          <col style={{ minWidth: DESCRICAO_MIN }} /><col style={{ width: LARGURA.documento }} />
          {opcionais.map((c) => <col key={c} style={{ width: LARGURA[c] }} />)}
          <col style={{ width: LARGURA.valor }} /><col style={{ width: LARGURA.status }} />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-primary"><tr>
          <th className={cn(TH_REGUA, 'text-left')} title="Parcela">Parc.</th>
          <th className={cn(TH_REGUA, 'text-left')}>{cabeca('competencia', 'Comp.')}</th>
          <th className={cn(TH_REGUA, 'text-left')} title="Vencimento">Venc.</th>
          <th className={cn(TH_REGUA, 'text-left')} title="Pagamento">Pgto.</th>
          <th className={cn(TH_REGUA, 'text-left')}>{cabeca('descricao', 'Descrição')}</th>
          <th className={cn(TH_REGUA, 'text-left')}>{cabeca('documento', 'Nº documento')}</th>
          {opcionais.map((c) => <th key={c} className={cn(TH_REGUA, 'text-left')}>{cabeca(c, ROTULO_DA_COLUNA[c])}</th>)}
          <th className={cn(TH_REGUA, 'text-right')} title="Valor">Valor</th>
          <th className={cn(TH_REGUA, 'text-right')} title="Status">Status</th>
        </tr></thead>
        <tbody>
          {/* a linha "Para todas" (fundo cinza): o valor que a coluna MARCADA leva às N */}
          <tr className="border-b border-border/50 bg-muted font-medium" data-testid="previa-para-todas">
            <td className={cn(TD_REGUA, 'whitespace-nowrap')}>Para todas</td>
            <td className={TD_REGUA}>{todasDe('competencia')}</td>
            <td className={TD_REGUA} /><td className={TD_REGUA} />
            <td className={TD_REGUA}>
              {/* a base e o "· i/N" do mock: cada parcela leva «base i/N» */}
              <span className="flex min-w-0 items-center gap-1">{todasDe('descricao')}<span className="shrink-0 font-normal text-muted-foreground">· i/{n}</span></span>
            </td>
            <td className={TD_REGUA}>{todasDe('documento')}</td>
            {opcionais.map((c) => <td key={c} className={TD_REGUA}>{todasDe(c)}</td>)}
            <td className={TD_REGUA_NUM} title={valorNotaCent !== null ? 'o valor da nota' : 'a soma das parcelas hoje'}>{valorNotaCent !== null ? reais(valorNotaCent) : previa ? reais(somaCent) : '—'}</td>
            <td className={TD_REGUA} />
          </tr>
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
                <td className={TD_REGUA} data-coluna="documento">{campos ? celula(a, 'documento', campos[CAMPO_DA_COLUNA.documento]) : '…'}</td>
                {opcionais.map((c) => <td key={c} className={TD_REGUA} data-coluna={c}>{campos ? celula(a, c, campos[CAMPO_DA_COLUNA[c]]) : '…'}</td>)}
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
    <div className="flex h-[18px] shrink-0 items-center gap-3 overflow-hidden px-4 text-[9.5px] text-muted-foreground" data-testid="previa-legenda">
      <span className="flex shrink-0 items-center gap-1"><i className={cn('inline-block h-2.5 w-4 rounded-sm border', MUDA)} />vai mudar</span>
      <span className="flex shrink-0 items-center gap-1"><i className="inline-block h-2.5 w-4 rounded-sm border bg-background" />igual (pode editar)</span>
      <span className="flex shrink-0 items-center gap-1"><Lock className="h-2.5 w-2.5" />pago/conciliado</span>
      {iguais.length > 0 && (
        <span className="min-w-0 uma-linha-que-rola" data-testid="previa-iguais">
          {iguais.map((c, i) => (i === 0 ? ROTULO_DA_COLUNA[c] : ROTULO_DA_COLUNA[c].toLowerCase())).join(', ')}: {iguais.length === 1 ? 'igual em todas, não muda' : 'iguais em todas, não mudam'}
        </span>
      )}
    </div>
    {/* o rodapé numa linha: o DRE (ou o que impede, a frase pronta do banco) · nada é gravado antes do clique · Voltar · a ação */}
    {!semRodape && (
    <div className="flex h-10 shrink-0 items-center gap-2 border-t bg-card px-4 text-[10px]">
      {/* P104: frase nunca rola nem corta — duas linhas reservadas (a 750 o "nada é gravado…" desce para a 2ª) */}
      <span className="flex h-[26px] min-w-0 flex-1 items-center leading-[13px]" data-testid="previa-rodape-frase"><span className="line-clamp-2">
        {falha ? <span className="text-destructive" data-testid="previa-falha">Não consegui conferir a prévia ({falha}).</span>
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
