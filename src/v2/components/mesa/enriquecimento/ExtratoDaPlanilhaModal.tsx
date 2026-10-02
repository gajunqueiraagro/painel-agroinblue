/**
 * O EXTRATO DA PLANILHA — PR-CONC-ENRIQUECER-V2-01, quadro 2 do mock.
 *
 * A Conferência OFX × Sistema com a PLANILHA no lugar do banco. Esquerda: Data · "Conta do plano · Fornecedor" · Valor;
 * no meio, a coluna de 26px do símbolo (✓ ≈ ≠ ○ ! ↳); direita: Valor · Data · descrição · fornecedor · status (Conciliado /
 * Realizado) · selo · "⋯". Linhas por dia, com o fecho do dia ("confere" / "difere R$ X"); totais no topo; legenda; "Só não
 * enriquecidos"; fundo verde-claro na linha já enriquecida.
 *
 * ⚠ A MONTAGEM É A DA CONFERÊNCIA (`montarExtratoDaPlanilha` → `montarMesa`), e as medidas também: linha de 18px, 10px
 *   no corpo, 9,5px no cabeçalho navy, cabeçalho e totais congelados, só o corpo rola, nada quebra.
 * ⚠ PLANILHA = REFERÊNCIA, SISTEMA = VERDADE (PR-CONC-ENRIQUECER-V2-02): o cabeçalho diz isso (azul-claro × navy); o dia
 *   FECHA no fim, como na Conferência ("fechamento DD/MM", o mesmo par de tokens), e o fechamento do MÊS fica congelado
 *   abaixo do corpo.
 * ⚠ AGRUPAR PELA SELEÇÃO (PR-CONC-ENRIQ-AGRUP-2b-TELA), o gesto da Conferência: a caixa marca a linha "sem par" da planilha
 *   e o lançamento "Só no sistema"; a barra no rodapé diz a forma (`gestoDaSelecao`: bloco · casar · desmembrar · juntar)
 *   e grava pela RPC que a aba liga (`onAgrupar`). A recusa da RPC fica ESCRITA na barra e a seleção fica.
 * ⚠ O BLOCO E O CASAR 1×1 GRAVAM (PR-CONC-ENRIQ-BLOCO-NM-B): lançamentos classificados -> "Conferir bloco N×M" (sem
 *   confirmação em dois passos: não altera lançamento nenhum e tem desfazer); cru 1×1 -> "Casar". O bloco conferido se
 *   desfaz pelo ✓ da linha da planilha ou pelo selo "Em bloco": a barra entra no MODO BLOCO (resumo + motivo obrigatório +
 *   "Desfazer bloco" + "voltar"), as linhas do bloco ficam realçadas, Esc sai — tudo nos MESMOS 26px do rodapé.
 * ⚠ CLICAR NA LINHA (ou no "⋯") ABRE A MESA NAQUELA LINHA, por cima deste modal: ele continua montado, e fechar a Mesa
 *   volta ao MESMO ponto da rolagem. O ✓ de bloco e o selo "Em bloco" não abrem (stopPropagation).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Segmentado } from '@/components/ui/segmentado';
import type { ClassificacaoStagingPreviewRow } from '@/v2/hooks/useClassificacaoStaging';
import { useEspelhadosReais } from '@/components/financeiro-v2/EspelhoConciliacaoTab';
import { useEspelhoInternas } from '@/hooks/useEspelhoInternas';
import { contaDaLinhaStaging } from '@/v2/lib/mesa/enriquecimentoView';
import {
  LEGENDA_SIMBOLOS, montarExtratoDaPlanilha, soNaoEnriquecidos, type LinhaExtratoPlanilha, type ParDaLinha, type SeloSistema,
} from '@/v2/lib/mesa/extratoDaPlanilha';
import {
  doMesmoFornecedor, gestoDaSelecao, type FormaDoGesto, type LadoDoExtrato,
} from '@/v2/lib/mesa/agruparNoExtrato';
import { STATUS_PALETA, STATUS_PILULA_BASE } from '@/lib/financeiro/statusFinanceiro';

/** O colgroup — a régua da Conferência (pior texto renderizado + 8 + padding), medida no navegador. */
export const COLUNAS_EXTRATO_PLANILHA: ReadonlyArray<{ chave: string; largura: string | null }> = [
  /* as caixas de seleção — PR-CONC-ENRIQ-AGRUP-2b-TELA: 18px, SEMPRE presentes (layout fixo), vazias onde não se marca */
  { chave: 'p-sel', largura: '18px' },
  { chave: 'p-data', largura: '44px' },
  { chave: 'p-texto', largura: null },
  { chave: 'p-valor', largura: '84px' },
  { chave: 'simbolo', largura: '26px' },
  { chave: 's-sel', largura: '18px' },
  { chave: 's-valor', largura: '84px' },
  { chave: 's-data', largura: '44px' },
  { chave: 's-descricao', largura: null },
  { chave: 's-fornecedor', largura: '124px' },
  /* "Conciliado" na pílula de 9,5px semibold (STATUS_PILULA_BASE) mede 49px + 12 de padding + 2 de borda = 63, + 8 de
     folga + 6 da célula = 77 -> 78 (medido no navegador). */
  { chave: 's-status', largura: '78px' },
  { chave: 's-selo', largura: '84px' },
  { chave: 'acoes', largura: '22px' },
];
export const ALTURA_LINHA_EXTRATO = '18px';
/** A faixa do rodapé: o fechamento do mês OU a barra da seleção, no MESMO lugar e com a MESMA altura. */
export const ALTURA_RODAPE_EXTRATO = '26px';

/**
 * O gesto que a aba grava — `conferirBloco` / `casarManual` (NM-B) e os mutations da Mesa (`splitSubstituir` /
 * `resolverGrupo`).
 */
export interface GestoAgrupar { forma: FormaDoGesto; stagingIds: string[]; lancamentoIds: string[] }
export type ResultadoAgrupar = { ok: boolean; mensagem?: string };
/** Desfazer um bloco conferido — `desfazerBloco`; o motivo é obrigatório (a tela cobra antes, a RPC cobra de novo). */
export interface GestoDesfazerBloco { blocoId: string; motivo: string }

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataCurta = (s: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? '');
  return m ? `${m[3]}/${m[2]}` : '—';
};
const corVal = (v: number) => (v < 0 ? 'text-rose-600' : 'text-emerald-600');
/* ⚠ CORTADO NA BORDA, SEM "…", COM O TEXTO INTEIRO NO `title` — a exceção que o Gabriel declarou para o "Criar
   lançamentos" (PR-CONC-CRIAR-LOTE-LAYOUT-01), a mesma régua: uma linha por registro, e a reticência é proibida. */
const CEL = 'px-[5px] overflow-hidden whitespace-nowrap';

const COR_SIMBOLO: Record<string, string> = {
  '✓': 'text-emerald-600', '≈': 'text-amber-600', '≠': 'text-red-600', '○': 'text-slate-400', '!': 'text-red-600',
  '↳': 'text-violet-600',
};
const COR_SELO: Record<SeloSistema, string> = {
  'Enriquecido': 'border-emerald-300 bg-emerald-50 text-emerald-800',
  'Cru · aplicar': 'border-amber-300 bg-amber-50 text-amber-800',
  'Diverge': 'border-red-300 bg-red-50 text-red-700',
  'Valor ≠': 'border-red-300 bg-red-50 text-red-700',
  'Só no sistema': 'border-slate-300 bg-slate-50 text-slate-700',
  'Desmembrar': 'border-violet-300 bg-violet-50 text-violet-800',
  'Transferência': 'border-sky-300 bg-sky-50 text-sky-800',
  /* a cor do "Enriquecido": o lançamento está explicado pelas linhas do bloco */
  'Em bloco': 'border-emerald-300 bg-emerald-50 text-emerald-800',
  /* o vermelho do "Diverge": duas linhas no mesmo lançamento que não fecham — o par está errado */
  'Par repetido': 'border-red-300 bg-red-50 text-red-700',
};

export interface ExtratoDaPlanilhaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string | null;
  anoMes: string;
  mesRotulo: string;
  /** As linhas da SESSÃO (todas as contas); o modal recorta pela conta escolhida. */
  staging: readonly ClassificacaoStagingPreviewRow[];
  /** As contas da sessão, na ordem do painel. */
  contas: ReadonlyArray<{ id: string; nome: string }>;
  contaId: string | null;
  onContaId: (id: string) => void;
  sobrescreverIds?: ReadonlySet<string>;
  /** Abre a Mesa nesta linha da planilha (por cima deste modal). */
  onAbrirLinha: (stagingId: string, contaId: string) => void;
  /** Grava o agrupamento da seleção pela RPC; devolve `ok` e, na recusa, a frase. Sem ela, a barra só mostra. */
  onAgrupar?: (g: GestoAgrupar) => Promise<ResultadoAgrupar>;
  /** Desfaz o bloco conferido; devolve `ok` e, na recusa, a frase. Sem ela, o modo bloco só mostra. */
  onDesfazerBloco?: (g: GestoDesfazerBloco) => Promise<ResultadoAgrupar>;
}

const STATUS_ROTULO = { conciliado: 'Conciliado', realizado: 'Realizado' } as const;

export function ExtratoDaPlanilhaModal({
  open, onOpenChange, clienteId, anoMes, mesRotulo, staging, contas, contaId, onContaId, sobrescreverIds, onAbrirLinha,
  onAgrupar, onDesfazerBloco,
}: ExtratoDaPlanilhaModalProps) {
  const [soPendentes, setSoPendentes] = useState(false);
  const conta = contaId ?? contas[0]?.id ?? null;
  const contaReal = conta && conta !== '__sem__' ? conta : null;
  const { data: espelho, isLoading } = useEspelhadosReais(open ? clienteId : null, contaReal, anoMes);
  const internas = useEspelhoInternas(open ? clienteId : null, contaReal, anoMes);
  const internos = internas.lancamentosInternos;

  const daConta = useMemo(
    () => (conta ? staging.filter((r) => contaDaLinhaStaging(r).id === conta) : []),
    [staging, conta]);
  const extrato = useMemo(
    () => (espelho && contaReal ? montarExtratoDaPlanilha(daConta, espelho, contaReal, internos, sobrescreverIds) : null),
    [espelho, contaReal, daConta, internos, sobrescreverIds]);
  const dias = useMemo(
    () => (extrato ? (soPendentes ? soNaoEnriquecidos(extrato.dias) : extrato.dias) : []),
    [extrato, soPendentes]);
  const nomeConta = contas.find((c) => c.id === conta)?.nome ?? '—';

  const abrir = (l: LinhaExtratoPlanilha) => { if (l.stagingId && conta) onAbrirLinha(l.stagingId, conta); };

  /* ── A SELEÇÃO — local ao modal; trocar de conta ou fechar limpa ─────────────────────────────────────────────── */
  const [marcP, setMarcP] = useState<ReadonlySet<string>>(new Set());
  const [marcS, setMarcS] = useState<ReadonlySet<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);
  /* a ÚLTIMA caixa marcada de cada lado — é dela que sai o "+ N de {fornecedor}" (PR-CONC-ENRIQ-MARCAR-FAVORECIDO) */
  const [ultimo, setUltimo] = useState<{ planilha: string | null; sistema: string | null }>({ planilha: null, sistema: null });
  const limpar = () => {
    setMarcP(new Set()); setMarcS(new Set()); setConfirmando(false); setRecusa(null);
    setUltimo({ planilha: null, sistema: null });
  };
  /* ── O MODO BLOCO — o "Desfazer bloco" (NM-B); entrar nele limpa a seleção, marcar uma caixa sai dele ───────────── */
  const [blocoAtivo, setBlocoAtivo] = useState<string | null>(null);
  const [motivoBloco, setMotivoBloco] = useState('');
  const [faltaMotivo, setFaltaMotivo] = useState(false);
  const [recusaBloco, setRecusaBloco] = useState<string | null>(null);
  const motivoRef = useRef<HTMLInputElement>(null);
  const sairDoBloco = () => { setBlocoAtivo(null); setMotivoBloco(''); setFaltaMotivo(false); setRecusaBloco(null); };
  /* ── O MODO PAR — o "Soltar o par" (PR-CONC-ENRIQ-BLOCO-ESTADOS): o mesmo molde do modo bloco, na mesma faixa ────── */
  const [parAtivo, setParAtivo] = useState<{ stagingId: string; par: ParDaLinha; soltavel: boolean } | null>(null);
  const [recusaPar, setRecusaPar] = useState<string | null>(null);
  const sairDoPar = () => { setParAtivo(null); setRecusaPar(null); };
  const abrirBloco = (id: string) => {
    if (gravando) return;
    limpar();
    sairDoPar();
    setBlocoAtivo(id); setMotivoBloco(''); setFaltaMotivo(false); setRecusaBloco(null);
  };
  const abrirPar = (l: LinhaExtratoPlanilha) => {
    if (gravando || !l.stagingId || !l.par) return;
    limpar();
    sairDoBloco();
    setRecusaPar(null);
    setParAtivo({ stagingId: l.stagingId, par: l.par, soltavel: l.parSoltavel === l.stagingId });
  };
  useEffect(() => { limpar(); sairDoBloco(); sairDoPar(); }, [conta, open]);
  const alternar = (lado: LadoDoExtrato, id: string) => {
    const atual = lado === 'planilha' ? marcP : marcS;
    const marcando = !atual.has(id);
    (lado === 'planilha' ? setMarcP : setMarcS)((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    /* desmarcar continua item a item; só a caixa MARCADA vira a "última" */
    if (marcando) setUltimo((u) => ({ ...u, [lado]: id }));
    setConfirmando(false);
    setRecusa(null);
    sairDoBloco();
    sairDoPar();
  };
  /* os valores vêm das MESMAS linhas desenhadas (com sinal) — nenhuma soma de outra fonte */
  const valores = useMemo(() => {
    const vp = new Map<string, number>(); const vs = new Map<string, { valor: number; cru: boolean }>();
    for (const d of extrato?.dias ?? []) for (const l of d.linhas) {
      if (l.selPlanilha && l.planilha) vp.set(l.selPlanilha, l.planilha.valor);
      if (l.selSistema && l.sistema) vs.set(l.selSistema, { valor: l.sistema.valor, cru: l.sistema.cru });
    }
    return { vp, vs };
  }, [extrato]);
  const gesto = useMemo(() => gestoDaSelecao({
    planilha: [...marcP].filter((id) => valores.vp.has(id)).map((id) => ({ id, valor: valores.vp.get(id) ?? 0 })),
    sistema: [...marcS].flatMap((id) => {
      const v = valores.vs.get(id);
      return v ? [{ id, valor: v.valor, cru: v.cru }] : [];
    }),
  }), [marcP, marcS, valores]);
  const temSelecao = marcP.size > 0 || marcS.size > 0;
  /* ── "+ N de {fornecedor}" — por lado, a partir da ÚLTIMA caixa marcada; marca SÓ aquele lado ─────────────────── */
  const linhasTodas = useMemo(() => (extrato?.dias ?? []).flatMap((d) => d.linhas), [extrato]);
  /* o par morto se explica: marcada uma linha livre porque o par dela foi cancelado, o recado diz isso (só texto) */
  const motivoLivreMarcado = linhasTodas.find((l) => l.selPlanilha && marcP.has(l.selPlanilha) && l.motivoLivre)?.motivoLivre ?? '';
  const recadoSelecao = [!gesto.habilitado ? gesto.motivo : null, motivoLivreMarcado || null].filter(Boolean).join(' · ');
  const acaoFornecedor = (lado: LadoDoExtrato) => {
    const id = ultimo[lado];
    const marcados = lado === 'planilha' ? marcP : marcS;
    if (!id || !marcados.has(id)) return null;
    const l = linhasTodas.find((x) => (lado === 'planilha' ? x.selPlanilha : x.selSistema) === id);
    if (!l) return null;
    const faltam = doMesmoFornecedor(linhasTodas, lado, l.chaveFornecedor[lado]).filter((x) => !marcados.has(x));
    return faltam.length > 0 ? { lado, faltam, nome: l.nomeFornecedor[lado] || '—' } : null;
  };
  const acoesFornecedor = [acaoFornecedor('planilha'), acaoFornecedor('sistema')].flatMap((a) => (a ? [a] : []));
  const marcarDoFornecedor = (lado: LadoDoExtrato, ids: readonly string[]) => {
    (lado === 'planilha' ? setMarcP : setMarcS)((a) => new Set([...a, ...ids]));
    setConfirmando(false);
    setRecusa(null);
  };
  /* o resumo do bloco aberto: N e M e a soma saem das linhas JÁ carregadas, as de mesmo `blocoId` */
  const resumoBloco = useMemo(() => {
    if (!blocoAtivo) return null;
    let n = 0; let m = 0; let soma = 0;
    for (const d of extrato?.dias ?? []) for (const l of d.linhas) {
      if (l.blocoId !== blocoAtivo) continue;
      if (l.planilha) { n++; soma += l.planilha.valor; }
      else if (l.sistema) m++;
    }
    return { n, m, soma: Math.round(soma * 100) / 100 };
  }, [blocoAtivo, extrato]);

  const soltarPar = async () => {
    if (!parAtivo || !parAtivo.soltavel || !onAgrupar || gravando) return;
    setGravando(true);
    setRecusaPar(null);
    try {
      const res = await onAgrupar({ forma: 'soltar', stagingIds: [parAtivo.stagingId], lancamentoIds: [] });
      if (res.ok) sairDoPar();
      else setRecusaPar(res.mensagem ?? 'O banco recusou soltar o par.');
    } catch (e: unknown) {
      setRecusaPar(e instanceof Error ? e.message : 'Erro ao soltar o par.');
    } finally {
      setGravando(false);
    }
  };

  const desfazerBloco = async () => {
    if (!blocoAtivo || !onDesfazerBloco || gravando) return;
    const motivo = motivoBloco.trim();
    /* UX-OBRIGATORIOS-01: sem motivo, o campo fica vermelho com a frase, recebe o foco, e nada grava */
    if (!motivo) { setFaltaMotivo(true); motivoRef.current?.focus(); return; }
    setGravando(true);
    setRecusaBloco(null);
    try {
      const res = await onDesfazerBloco({ blocoId: blocoAtivo, motivo });
      if (res.ok) sairDoBloco();
      else setRecusaBloco(res.mensagem ?? 'O banco recusou o desfazer.');
    } catch (e: unknown) {
      setRecusaBloco(e instanceof Error ? e.message : 'Erro ao desfazer o bloco.');
    } finally {
      setGravando(false);
    }
  };

  const gravar = async () => {
    if (!gesto.forma || !gesto.habilitado || !onAgrupar || gravando) return;
    /* ⚠ O DESMEMBRAR PEDE CONFIRMAÇÃO NA BARRA: cria N lançamentos e cancela o consolidado. */
    if (gesto.forma === 'desmembrar' && !confirmando) { setConfirmando(true); return; }
    setGravando(true);
    setRecusa(null);
    try {
      const res = await onAgrupar({ forma: gesto.forma, stagingIds: [...marcP], lancamentoIds: [...marcS] });
      if (res.ok) limpar();
      /* ⚠ A RECUSA FICA ESCRITA E A SELEÇÃO FICA (UX-TOAST-01) — o operador corrige sem remarcar. */
      else { setRecusa(res.mensagem ?? 'O banco recusou o agrupamento.'); setConfirmando(false); }
    } catch (e: unknown) {
      setRecusa(e instanceof Error ? e.message : 'Erro ao gravar o agrupamento.');
      setConfirmando(false);
    } finally {
      setGravando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-[1400px] flex-col gap-0 overflow-hidden p-0"
        /* com seleção, o Esc LIMPA a seleção em vez de fechar o modal; no modo bloco, sai do modo */
        onEscapeKeyDown={(e) => {
          if (blocoAtivo) { e.preventDefault(); if (!gravando) sairDoBloco(); return; }
          if (parAtivo) { e.preventDefault(); if (!gravando) sairDoPar(); return; }
          if (temSelecao) { e.preventDefault(); if (!gravando) limpar(); }
        }}>
        <DialogHeader className="h-9 shrink-0 flex-row items-center gap-2.5 space-y-0 bg-primary px-4">
          <DialogTitle className="whitespace-nowrap text-[12px] font-medium text-primary-foreground">
            Extrato da planilha · {nomeConta} · {mesRotulo}
          </DialogTitle>
          <span className="whitespace-nowrap text-[10px] text-primary-foreground/85">Planilha × Sistema</span>
        </DialogHeader>

        {/* ═══ TOPO FIXO: conta, totais, legenda, chave ══════════════════════ */}
        <div className="flex shrink-0 flex-col gap-1 border-b px-3.5 py-1.5">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {contas.filter((c) => c.id !== '__sem__').length > 1 && (
              <Segmentado<string> valor={conta ?? ''} onEscolher={onContaId} altura={22}
                opcoes={contas.filter((c) => c.id !== '__sem__').map((c) => ({ valor: c.id, rotulo: c.nome, title: c.nome }))} />
            )}
          </div>
          {extrato ? (
            <div data-testid="totais-extrato-planilha" className="flex flex-nowrap items-center gap-5 whitespace-nowrap text-[10px] tabular-nums">
              <div className="flex gap-2">
                <span className="text-muted-foreground">Entradas</span>
                <span className="text-blue-700">planilha {brl(extrato.totais.entradasBanco)}</span>
                <span>sistema {brl(extrato.totais.entradasSistema)}</span>
                <span className={Math.abs(extrato.totais.difEntradas) < 0.005 ? 'text-emerald-700' : 'text-red-600'}>
                  {Math.abs(extrato.totais.difEntradas) < 0.005 ? 'confere' : `difere ${brl(extrato.totais.difEntradas)}`}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground">Saídas</span>
                <span className="text-blue-700">planilha {brl(extrato.totais.saidasBanco)}</span>
                <span>sistema {brl(extrato.totais.saidasSistema)}</span>
                <span className={Math.abs(extrato.totais.difSaidas) < 0.005 ? 'text-emerald-700' : 'text-red-600'}>
                  {Math.abs(extrato.totais.difSaidas) < 0.005 ? 'confere' : `difere ${brl(extrato.totais.difSaidas)}`}
                </span>
              </div>
              <div className="ml-auto text-right text-muted-foreground">
                {extrato.nPlanilha} linhas da planilha · {extrato.nSistema} lançamentos do sistema
              </div>
            </div>
          ) : (
            <div className="h-[15px] text-[10px] text-muted-foreground">
              {!contaReal ? 'Linhas sem conta não têm lado Sistema para conferir.' : isLoading ? 'Carregando o sistema…' : '—'}
            </div>
          )}
          <div className="flex items-center gap-3 text-[9.5px] text-muted-foreground">
            <span data-testid="legenda" className="flex flex-nowrap gap-2.5 overflow-hidden whitespace-nowrap">
              {LEGENDA_SIMBOLOS.map(([s, t]) => (
                <span key={s}><b className={COR_SIMBOLO[s]}>{s}</b> {t}</span>
              ))}
            </span>
            <label className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap">
              <input type="checkbox" data-testid="so-nao-enriquecidos" checked={soPendentes}
                onChange={(e) => setSoPendentes(e.target.checked)} />
              Só não enriquecidos
            </label>
          </div>
        </div>

        {/* ═══ O CORPO — o único scrollport ═══════════════════════════════════ */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-2">
          <table data-testid="tabela-extrato-planilha" className="w-full table-fixed border-collapse text-[10px] tabular-nums">
            <colgroup>
              {COLUNAS_EXTRATO_PLANILHA.map((c) => (
                <col key={c.chave} style={c.largura ? { width: c.largura } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr style={{ height: ALTURA_LINHA_EXTRATO }} className="text-[9.5px]">
                <th colSpan={4} data-testid="cabecalho-planilha" className="sticky top-0 z-[3] bg-blue-100 px-[5px] text-center font-medium text-blue-900">Planilha · referência</th>
                <th className="sticky top-0 z-[3] border-x border-primary-foreground/30 bg-primary text-center font-medium text-primary-foreground" />
                <th colSpan={8} data-testid="cabecalho-sistema" className="sticky top-0 z-[3] bg-primary px-[5px] text-center font-medium text-primary-foreground">Sistema · o que vale</th>
              </tr>
            </thead>
            <tbody>
              {dias.length === 0 && (
                <tr style={{ height: ALTURA_LINHA_EXTRATO }}>
                  <td colSpan={COLUNAS_EXTRATO_PLANILHA.length} className="py-6 text-center text-muted-foreground">
                    {extrato ? 'Nada neste recorte.' : '—'}
                  </td>
                </tr>
              )}
              {dias.map((d) => (
                <DiaRows key={d.data ?? 'sem-data'} d={d} onAbrir={abrir} marcP={marcP} marcS={marcS} travado={gravando}
                  onMarcarP={(id) => alternar('planilha', id)} onMarcarS={(id) => alternar('sistema', id)}
                  blocoAtivo={blocoAtivo} onAbrirBloco={abrirBloco}
                  parAtivoId={parAtivo?.stagingId ?? null} onAbrirPar={abrirPar} />
              ))}
            </tbody>
          </table>
        </div>

        {/* ═══ O RODAPÉ — congelado, fora do scrollport, sempre presente, 26px ═══
            Sem seleção: o fechamento do mês (PR-CONC-ENRIQUECER-V2-02; NENHUM CÁLCULO NOVO, os totais do topo somados).
            Com seleção: a barra, no MESMO lugar — nada muda de altura (PR-CONC-ENRIQ-AGRUP-2b-TELA). */}
        <div data-testid="rodape-extrato" style={{ height: ALTURA_RODAPE_EXTRATO }} className="flex shrink-0 flex-col">
          {blocoAtivo && resumoBloco ? (
            <div data-testid="barra-bloco"
              className="flex h-full items-center gap-3 overflow-hidden whitespace-nowrap border-t-2 border-t-[#E7C873] bg-primary px-3.5 text-[10px] tabular-nums text-primary-foreground">
              <span data-testid="resumo-bloco">
                bloco conferido · {resumoBloco.n} {resumoBloco.n === 1 ? 'linha' : 'linhas'} × {resumoBloco.m}{' '}
                {resumoBloco.m === 1 ? 'lançamento' : 'lançamentos'} · soma {brl(resumoBloco.soma)}
              </span>
              <input ref={motivoRef} type="text" data-testid="motivo-bloco" value={motivoBloco} disabled={gravando}
                aria-label="Motivo para desfazer o bloco" aria-invalid={faltaMotivo || undefined}
                placeholder="motivo *"
                onChange={(e) => { setMotivoBloco(e.target.value); if (e.target.value.trim()) setFaltaMotivo(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void desfazerBloco(); }}
                className={`h-[18px] w-[220px] shrink-0 rounded border bg-background px-1.5 text-[10px] text-foreground outline-none ${
                  faltaMotivo ? 'border-red-500 ring-1 ring-red-500' : 'border-transparent'}`} />
              <span data-testid="recado-bloco" className={`min-w-0 truncate ${faltaMotivo || recusaBloco ? 'text-[#F5B5B5]' : ''}`}
                title={recusaBloco ?? undefined}>
                {faltaMotivo ? 'informe o motivo' : recusaBloco ?? ''}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                <button type="button" data-testid="desfazer-bloco" disabled={gravando || !onDesfazerBloco}
                  title={!onDesfazerBloco ? 'Gravação indisponível nesta tela.' : undefined}
                  onClick={() => { void desfazerBloco(); }}
                  className={`h-[18px] rounded px-2 text-[10px] font-medium ${
                    onDesfazerBloco && !gravando
                      ? 'bg-[#E7C873] text-foreground hover:bg-[#D9B95F]'
                      : 'cursor-not-allowed bg-primary-foreground/20 text-primary-foreground/50'}`}>
                  {gravando ? 'Desfazendo…' : 'Desfazer bloco'}
                </button>
                <button type="button" data-testid="voltar-bloco" disabled={gravando} onClick={sairDoBloco}
                  className="h-[18px] rounded bg-primary-foreground/20 px-2 text-[10px] hover:bg-primary-foreground/30">voltar</button>
              </span>
            </div>
          ) : parAtivo ? (
            <div data-testid="barra-par"
              className="flex h-full items-center gap-3 overflow-hidden whitespace-nowrap border-t-2 border-t-[#E7C873] bg-primary px-3.5 text-[10px] tabular-nums text-primary-foreground">
              <span data-testid="resumo-par" className="min-w-0 truncate" title={parAtivo.par.descricao}>
                par desta linha: {parAtivo.par.descricao}{parAtivo.par.valor === null ? '' : ` ${brl(parAtivo.par.valor)}`}
              </span>
              <span data-testid="recado-par" className={`min-w-0 truncate ${recusaPar ? 'text-[#F5B5B5]' : 'text-primary-foreground/70'}`}
                title={recusaPar ?? undefined}>
                {recusaPar ?? (parAtivo.soltavel ? ''
                  : parAtivo.par.repetido ? 'par repetido já gravado: reverta as linhas na Mesa antes de soltar'
                  : 'par já gravado: reverta a linha na Mesa antes de soltar')}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {parAtivo.soltavel && (
                  <button type="button" data-testid="soltar-par" disabled={gravando || !onAgrupar}
                    title={!onAgrupar ? 'Gravação indisponível nesta tela.' : 'A linha volta a não ter par e pode ser casada de novo. O lançamento não muda.'}
                    onClick={() => { void soltarPar(); }}
                    className={`h-[18px] rounded px-2 text-[10px] font-medium ${
                      onAgrupar && !gravando ? 'bg-[#E7C873] text-foreground hover:bg-[#D9B95F]'
                        : 'cursor-not-allowed bg-primary-foreground/20 text-primary-foreground/50'}`}>
                    {gravando ? 'Soltando…' : 'Soltar o par'}
                  </button>
                )}
                <button type="button" data-testid="voltar-par" disabled={gravando} onClick={sairDoPar}
                  className="h-[18px] rounded bg-primary-foreground/20 px-2 text-[10px] hover:bg-primary-foreground/30">voltar</button>
              </span>
            </div>
          ) : temSelecao ? (
            <div data-testid="barra-selecao"
              className="flex h-full items-center gap-3 overflow-hidden whitespace-nowrap border-t-2 border-t-[#E7C873] bg-primary px-3.5 text-[10px] tabular-nums text-primary-foreground">
              <span>
                marcados: {marcP.size} da planilha {brl(gesto.somaPlanilha)} · {marcS.size} do sistema {brl(gesto.somaSistema)}
              </span>
              <span data-testid="diferenca-selecao" className="text-[#E7C873]">diferença {brl(gesto.diferenca)}</span>
              {gesto.forma && <span className="opacity-80">{marcP.size}×{marcS.size}</span>}
              <span data-testid="recado-selecao"
                className={`min-w-0 truncate ${recusa ? 'text-[#F5B5B5]' : 'text-primary-foreground/70'}`}
                title={recusa ?? (recadoSelecao || undefined)}>
                {recusa ?? recadoSelecao}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {/* "+ N de {fornecedor} (lado)": marca as que faltam DAQUELE lado; o nome corta na borda, inteiro no title */}
                {!confirmando && acoesFornecedor.map((a) => (
                  <button key={a.lado} type="button" data-testid={`marcar-fornecedor-${a.lado}`} disabled={gravando}
                    title={`Marcar as outras ${a.faltam.length} de ${a.nome} (${a.lado})`}
                    onClick={() => marcarDoFornecedor(a.lado, a.faltam)}
                    className="flex h-[18px] items-center rounded border border-primary-foreground/40 px-1.5 text-[10px] hover:bg-primary-foreground/15">
                    <span>+ {a.faltam.length} de&nbsp;</span>
                    <span className="max-w-[110px] overflow-hidden whitespace-nowrap">{a.nome}</span>
                    <span>&nbsp;({a.lado})</span>
                  </button>
                ))}
                {gesto.forma && confirmando ? (
                  <>
                    <button type="button" data-testid="confirmar-gesto" disabled={gravando} onClick={() => { void gravar(); }}
                      className="h-[18px] rounded bg-[#E7C873] px-2 text-[10px] font-medium text-foreground hover:bg-[#D9B95F]">
                      {gravando ? 'Gravando…' : `Confirmar: cria ${marcP.size} lançamentos e cancela o consolidado`}
                    </button>
                    <button type="button" data-testid="voltar-gesto" disabled={gravando} onClick={() => setConfirmando(false)}
                      className="h-[18px] rounded bg-primary-foreground/20 px-2 text-[10px] hover:bg-primary-foreground/30">voltar</button>
                  </>
                ) : gesto.forma ? (
                  <button type="button" data-testid="botao-gesto"
                    disabled={!gesto.habilitado || gravando || !onAgrupar}
                    title={!gesto.habilitado ? gesto.motivo ?? undefined : !onAgrupar ? 'Gravação indisponível nesta tela.' : undefined}
                    onClick={() => { void gravar(); }}
                    className={`h-[18px] rounded px-2 text-[10px] font-medium ${
                      gesto.habilitado && onAgrupar && !gravando
                        ? 'bg-[#E7C873] text-foreground hover:bg-[#D9B95F]'
                        : 'cursor-not-allowed bg-primary-foreground/20 text-primary-foreground/50'}`}>
                    {gravando ? 'Gravando…' : gesto.rotulo}
                  </button>
                ) : null}
                <button type="button" data-testid="limpar-selecao" disabled={gravando} onClick={limpar}
                  className="h-[18px] rounded bg-primary-foreground/20 px-2 text-[10px] hover:bg-primary-foreground/30">limpar</button>
              </span>
            </div>
          ) : (
            <FechamentoDoMes mesRotulo={mesRotulo} totais={extrato?.totais ?? null} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** O fechamento do mês (a altura é a do rodapé): "planilha P · sistema S · confere | difere R$ P−S"; sem extrato, "—". */
export function FechamentoDoMes({ mesRotulo, totais }: {
  mesRotulo: string;
  totais: { entradasBanco: number; saidasBanco: number; entradasSistema: number; saidasSistema: number } | null;
}) {
  const p = totais ? totais.entradasBanco + totais.saidasBanco : null;
  const sis = totais ? totais.entradasSistema + totais.saidasSistema : null;
  const dif = p !== null && sis !== null ? p - sis : null;
  return (
    <div data-testid="fechamento-mes"
      className="flex h-full shrink-0 items-center overflow-hidden whitespace-pre bg-primary px-3.5 text-[10px] tabular-nums text-primary-foreground">
      <span className="font-semibold">Fechamento {mesRotulo}</span>
      {p === null || sis === null || dif === null ? (
        <span>{' · —'}</span>
      ) : (
        <>
          <span>{` · planilha ${brl(p)}`}</span>
          <span>{` · sistema ${brl(sis)}`}</span>
          <span className="font-semibold">{` · ${Math.abs(dif) < 0.005 ? 'confere' : `difere R$ ${brl(dif)}`}`}</span>
        </>
      )}
    </div>
  );
}

function DiaRows({ d, onAbrir, marcP, marcS, travado, onMarcarP, onMarcarS, blocoAtivo, onAbrirBloco, parAtivoId, onAbrirPar }: {
  d: ReturnType<typeof soNaoEnriquecidos>[number];
  onAbrir: (l: LinhaExtratoPlanilha) => void;
  marcP: ReadonlySet<string>; marcS: ReadonlySet<string>; travado: boolean;
  onMarcarP: (id: string) => void; onMarcarS: (id: string) => void;
  blocoAtivo: string | null; onAbrirBloco: (blocoId: string) => void;
  parAtivoId: string | null; onAbrirPar: (l: LinhaExtratoPlanilha) => void;
}) {
  const dif = d.planilha - d.sistema;
  return (
    <>
      {d.linhas.map((l) => (
        <tr key={l.chave} data-testid="linha-extrato-planilha" data-staging={l.stagingId ?? undefined}
          style={{ height: ALTURA_LINHA_EXTRATO }}
          onClick={() => onAbrir(l)}
          data-bloco={l.blocoId ?? undefined}
          data-realce={(l.blocoId && l.blocoId === blocoAtivo) || (l.planilha && l.stagingId && l.stagingId === parAtivoId) ? 'sim' : undefined}
          className={`border-b border-border/40 ${l.stagingId ? 'cursor-pointer hover:bg-primary/[0.04]' : ''} ${
            (l.blocoId && l.blocoId === blocoAtivo) || (l.planilha && l.stagingId && l.stagingId === parAtivoId) ? 'bg-amber-100'
              : l.enriquecida ? 'bg-success/[0.06]' : ''}`}>
          {/* ⚠ O CLIQUE NA CAIXA NÃO ABRE A MESA (stopPropagation); o clique na linha continua abrindo. */}
          <td className="text-center" data-testid="p-sel" onClick={(e) => { if (l.selPlanilha) e.stopPropagation(); }}>
            {l.selPlanilha && (
              <input type="checkbox" className="h-3 w-3 align-middle" checked={marcP.has(l.selPlanilha)} disabled={travado}
                onChange={() => { if (l.selPlanilha) onMarcarP(l.selPlanilha); }} aria-label="Marcar linha da planilha" />
            )}
          </td>
          <td className={`${CEL} text-[9.5px] text-muted-foreground`}>{l.planilha ? dataCurta(l.data) : ''}</td>
          <td className={`${CEL} ${l.filha ? 'pl-[14px]' : ''}`} title={l.planilha?.texto}>{l.planilha?.texto ?? ''}</td>
          <td className={`${CEL} text-right ${l.planilha ? corVal(l.planilha.valor) : ''}`}>{l.planilha ? brl(l.planilha.valor) : ''}</td>
          {/* o ✓ de uma linha em bloco abre o "Desfazer bloco"; o símbolo de uma linha com par abre o modo par — e não a Mesa */}
          <td data-testid="simbolo"
            className={`border-x text-center font-bold ${l.simbolo ? COR_SIMBOLO[l.simbolo] : ''} ${
              (l.blocoId || l.par) && l.planilha ? 'cursor-pointer hover:bg-emerald-100' : ''}`}
            title={l.blocoId && l.planilha ? 'Conferido em bloco — clique para ver ou desfazer o bloco'
              : l.par && l.planilha ? 'Clique para ver o par desta linha (e soltá-lo)' : undefined}
            onClick={(e) => {
              if (l.blocoId && l.planilha) { e.stopPropagation(); onAbrirBloco(l.blocoId); return; }
              if (l.par && l.planilha) { e.stopPropagation(); onAbrirPar(l); }
            }}>
            {l.simbolo ?? ''}
          </td>
          <td className="text-center" data-testid="s-sel" onClick={(e) => { if (l.selSistema) e.stopPropagation(); }}>
            {l.selSistema && (
              <input type="checkbox" className="h-3 w-3 align-middle" checked={marcS.has(l.selSistema)} disabled={travado}
                onChange={() => { if (l.selSistema) onMarcarS(l.selSistema); }} aria-label="Marcar lançamento do sistema" />
            )}
          </td>
          <td className={`${CEL} text-right ${l.sistema ? corVal(l.sistema.valor) : ''}`}>{l.sistema ? brl(l.sistema.valor) : ''}</td>
          <td className={`${CEL} text-[9.5px] text-muted-foreground`}>{l.sistema ? dataCurta(l.sistema.data) : ''}</td>
          <td className={CEL} title={l.sistema?.descricao}>{l.sistema?.descricao ?? ''}</td>
          <td className={`${CEL} text-muted-foreground`} title={l.sistema?.fornecedor}>{l.sistema?.fornecedor ?? ''}</td>
          {/* ⚠ O STATUS TEM UM DONO SÓ: `STATUS_PALETA` (a mesma pílula do Financeiro), nunca cor copiada aqui. */}
          <td className="px-[3px] text-center" data-testid="status-sistema">
            {l.sistema && (
              <span className={`${STATUS_PILULA_BASE} ${STATUS_PALETA[l.sistema.status].pilula}`}>{STATUS_ROTULO[l.sistema.status]}</span>
            )}
          </td>
          <td className="px-[3px] text-center">
            {l.selo === 'Em bloco' && l.blocoId ? (
              <button type="button" data-testid="selo"
                title="Conferido em bloco — clique para ver ou desfazer o bloco"
                onClick={(e) => { e.stopPropagation(); if (l.blocoId) onAbrirBloco(l.blocoId); }}
                className={`inline-flex h-[13px] cursor-pointer items-center whitespace-nowrap rounded-[3px] border px-[4px] text-[9.5px] leading-none ${COR_SELO[l.selo]}`}>
                {l.selo}
              </button>
            ) : l.selo && (
              <span data-testid="selo" className={`inline-flex h-[13px] items-center whitespace-nowrap rounded-[3px] border px-[4px] text-[9.5px] leading-none ${COR_SELO[l.selo]}`}>
                {l.selo}
              </span>
            )}
          </td>
          <td className="text-center">
            {l.stagingId && (
              <button type="button" aria-label="Abrir na Mesa" data-testid="abrir-mesa"
                onClick={(e) => { e.stopPropagation(); onAbrir(l); }}
                className="rounded px-1 text-muted-foreground hover:bg-muted">⋯</button>
            )}
          </td>
        </tr>
      ))}
      {/* ⚠ O DIA FECHA NO FIM, COMO NA CONFERÊNCIA (PR-CONC-ENRIQUECER-V2-02): "fechamento DD/MM", o par de tokens de lá.
          No fechamento o azul vence o verde/vermelho — a linha é subtotal, o sinal já está no número. */}
      <tr data-testid="dia" style={{ height: ALTURA_LINHA_EXTRATO }} className="border-b border-t border-border bg-primary/10 text-[9.5px]">
        <td colSpan={3} className={`${CEL} font-semibold text-primary`}>fechamento {dataCurta(d.data)}</td>
        <td className={`${CEL} text-right font-semibold text-primary`}>{brl(d.planilha)}</td>
        <td />
        <td />
        <td className={`${CEL} text-right font-semibold text-primary`}>{brl(d.sistema)}</td>
        <td colSpan={6} className={`${CEL} text-right font-semibold`} data-testid="fecho-dia">
          {d.confere ? <span className="text-emerald-700">confere</span> : <span className="text-red-600">difere R$ {brl(dif)}</span>}
        </td>
      </tr>
    </>
  );
}
