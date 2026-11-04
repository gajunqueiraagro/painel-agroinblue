/**
 * SUGESTÕES PARA CASAR — PR-CONC-SUGESTOES-CASAR-01; desenho do P159c (mock `mock-sugestoes-casar-v1.html`, Gabriel 29/10).
 *
 * ⚠ O MOTOR NÃO MORA AQUI: `sugerirCasamentos` (`src/lib/conciliacao/sugestoesCasamento.ts`) é o mesmo que a prévia da
 * importação usa para somar. Este modal só MOSTRA a lista e entrega a escolhida ao `CasarComBancoModal` — quem casa
 * continua sendo ele, com a mesma RPC e o mesmo Conciliar. Nada casa por aqui.
 * ⚠ MODAL SOBRE MODAL: abre por cima da Conferência (o Radix empilha; Esc fecha só o de cima).
 * ⚠ A LISTA VEM PRONTA DA CONFERÊNCIA — a MESMA que deu o "(N)" do menu, calculada uma vez por mesa (decisão do Gabriel,
 * 30/09). O modal não recalcula: com orçamentos diferentes, o menu dizia (2) e o modal mostrava 1 (medido no Camargo).
 * ⚠ CONC-SUGESTOES-TABELA-01 (Gabriel 04/11 06:36): o movimento do banco é o TÍTULO, numa faixa própria ("Lançamento do extrato" · data ·
 * texto do banco · valor), separado das sugestões; as sugestões e o "Procurar no histórico" são a TABELA DA LISTA DO FINANCEIRO
 * (`TabelaDaLista`, as mesmas peças e fontes): ☐ · Comp. · Venc. · Pgto. · Descrição · Fornecedor · Faz. · NF · Valor · Status · Motivo ·
 * casar, uma linha por lançamento, sem quebrar. As caixinhas das duas listas somam juntas no rodapé fixo, e "Casar selecionados" abre o
 * "Casar com o banco" de hoje (`onCasarSelecionados`). O banco vai no título do modal ("Sugestões para casar · <conta>").
 * ⚠ REGRA DE CORTE (21/10): em tabela, texto = UMA linha com "…" e o texto inteiro no `title`; data (dd/mm/aaaa), valor e
 * contador nunca cortam — as colunas deles foram medidas no pior texto.
 * ⚠ SELOS A 8px, a exceção da Conferência (CLAUDE.md): azul tracejado = confere; âmbar cheio = conferir antes de casar.
 * ⚠ P153b (Gabriel 29/10): o modal vai a até 1400px de largura e a ALTURA TODA; as fontes são as da lista do Financeiro (a exceção declarada
 *   "Lancamentos Financeiros"). As sugestões ficam num bloco de ALTURA FIXA (9 linhas; mais rola lá dentro) e o "Procurar no histórico" ocupa
 *   o resto da altura — nada se desloca ao procurar nem ao marcar. O achado EM ABERTO do histórico casa por aqui também
 *   (`onCasarDoHistorico`, o mesmo `CasarComBancoModal`); o de outra conta casa trocando a conta (D3).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { fmtBRL } from '@/components/conciliacao/TabelaExtratoDoMes';
import { dataBR } from '@/lib/datas/dataBR';
import { historicoDoBanco } from '@/lib/conciliacao/historicoDoBanco';
import { lerComplementoDasLinhas, type ComplementoDaLinha } from '@/lib/conciliacao/complementoDasLinhas';
import { motivoCurto, resumoDaSelecao } from '@/lib/conciliacao/selecaoParaCasar';
import { TabelaDaLista } from '@/components/financeiro-v2/TabelaDaLista';
import { CabecalhoParaCasar, LinhaParaCasarNaTabela, COLUNAS_PARA_CASAR, N_COLUNAS_PARA_CASAR, LINK_PARA_CASAR, ALTURA_DA_LINHA_PARA_CASAR,
  ALTURA_DO_CABECALHO_PARA_CASAR, PISO_PARA_CASAR, type LinhaParaCasar } from '@/components/conciliacao/TabelaParaCasar';
/* ⚠ SEM IMPORT DA CONFERÊNCIA NEM DO `CasarComBancoModal`: o tipo do extrato é o estrutural da lib. Importar de lá
   fecharia um ciclo (Espelho → este modal → Casar → Espelho), que o `madge` acusa. */
import type { CandidatoSugestao, ExtratoParaSugerir, Sugestao } from '@/lib/conciliacao/sugestoesCasamento';
import { ProcurarNoHistorico } from '@/components/conciliacao/ProcurarNoHistorico';
import type { AchadoDoHistorico, ModeloDoHistorico } from '@/lib/conciliacao/procurarNoHistorico';

const corVal = (v: number) => (v < 0 ? 'text-rose-600' : 'text-emerald-600');
/* `selo-motivo`: no tamanho grande da tabela o selo vai a 9,5px (`TabelaDaLista.css`) */
const SELO = 'selo-motivo inline-block max-w-full truncate rounded-[3px] border px-[4px] py-[1px] align-middle text-[8px] font-semibold leading-[8px]';
const SELO_CONFERE = 'border-dashed border-[#1d4ed8] text-[#1d4ed8]';
const SELO_CONFERIR = 'border-solid border-amber-500 bg-amber-50 text-amber-700';

/** O que foi marcado nas duas listas (por id): o lançamento da sugestão, ou o achado do histórico (com a troca de conta). */
export type Marcado = { de: 'sugestao'; c: CandidatoSugestao } | { de: 'historico'; a: AchadoDoHistorico; trocar: boolean };

interface Props {
  open: boolean;
  onClose: () => void;
  extrato: ExtratoParaSugerir | null;
  nomeConta?: string;
  /** A lista que a Conferência calculou para esta linha — a mesma do "(N)" do menu. */
  sugestoes: readonly Sugestao[];
  onCasar: (s: Sugestao) => void;
  /** CONC-SUGESTOES-TABELA-01 — "Casar selecionados": o hospedeiro abre o `CasarComBancoModal` de hoje com todos os marcados levados. */
  onCasarSelecionados?: (marcados: Marcado[]) => void;
  /** P153 — o "Procurar no histórico" embaixo das sugestões; sem os dois, ele não aparece. */
  clienteId?: string | null;
  onCriarIgual?: (m: ModeloDoHistorico) => void;
  /** P153b — casar um achado EM ABERTO do "Procurar no histórico" (`trocarConta` = o de outra conta, D3). */
  onCasarDoHistorico?: (a: AchadoDoHistorico, trocarConta: boolean) => void;
  /** P153b — a conta do movimento (decide "outra conta" no histórico). */
  contaBancariaId?: string | null;
}

/* P153b — até 1400px (Gabriel 29/10), nunca mais que 95% da janela; a ALTURA TODA (12px de respiro em cima e embaixo). */
const LARGURA_MODAL = 'min(1400px, 95vw)';
const ALTURA_MODAL = 'calc(100vh - 24px)';
/* AJUSTE 07:55 — as duas listas DIVIDEM a altura do modal (cada uma rola por dentro), com o piso de cabeçalho + 2 linhas cada (o modal de
   459px de altura — a janela de 483 — tem de caber sem rolar: o gate de 04/11 mediu) */
const PISO_DE_CADA_LISTA = ALTURA_DO_CABECALHO_PARA_CASAR + 2 * ALTURA_DA_LINHA_PARA_CASAR + 2;

export function SugestoesCasarModal({ open, onClose, extrato, nomeConta, sugestoes, onCasar, onCasarSelecionados, clienteId, onCriarIgual,
  onCasarDoHistorico, contaBancariaId }: Props) {
  const campoProcurar = useRef<HTMLInputElement>(null);
  const [marcados, setMarcados] = useState<ReadonlyMap<string, Marcado>>(new Map());
  const [complemento, setComplemento] = useState<ReadonlyMap<string, ComplementoDaLinha>>(new Map());
  /* abrir outro extrato começa do zero */
  useEffect(() => { setMarcados(new Map()); }, [open, extrato]);
  const idsDasSugestoes = useMemo(() => sugestoes.flatMap((s) => s.lancamentos.map((c) => c.lancamento_id)), [sugestoes]);
  useEffect(() => {
    let vivo = true;
    if (!open || !clienteId || !idsDasSugestoes.length) { setComplemento(new Map()); return; }
    void lerComplementoDasLinhas(clienteId, idsDasSugestoes).then((m) => { if (vivo) setComplemento(m ?? new Map()); });
    return () => { vivo = false; };
  }, [open, clienteId, idsDasSugestoes]);

  if (!extrato) return null;
  const titulo = ['Sugestões para casar', nomeConta].filter(Boolean).join(' · ');
  const h = historicoDoBanco(extrato.historico, extrato.data);
  const original = extrato.historico ?? '';
  const tituloHistorico = h.texto && h.texto !== original ? `${h.texto}\n${original}` : original || undefined;

  const alternar = (id: string, m: Marcado) => setMarcados((atual) => {
    const n = new Map(atual); if (n.has(id)) n.delete(id); else n.set(id, m); return n;
  });
  const valorDe = (m: Marcado) => (m.de === 'sugestao' ? Number(m.c.valor_assinado) : m.a.valor);
  const resumo = resumoDaSelecao([...marcados.values()].map(valorDe), extrato.valor);
  const podeCasarSelecionados = marcados.size > 0 && !!onCasarSelecionados;

  const linhaDoCandidato = (c: CandidatoSugestao): LinhaParaCasar => {
    const x = complemento.get(c.lancamento_id);
    return {
      id: c.lancamento_id, comp: c.competencia, venc: c.data_vencimento, pgto: x?.dataPagamento ?? null, descricao: c.descricao,
      fornecedor: c.fornecedor, fazendaCodigo: x?.fazendaCodigo ?? null, fazendaNome: x?.fazendaNome ?? null,
      tipoDocumento: x?.tipoDocumento ?? null, numeroDocumento: x?.numeroDocumento ?? null,
      valor: Number(c.valor_assinado), status: c.status_transacao, conciliado: !!c.ja_conciliado,
    };
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* P159f: sem sugestão automática, o cursor vai direto ao campo do "Procurar no histórico" (no lugar do foco padrão do Radix) */}
      <DialogContent className="flex max-h-none max-w-[95vw] flex-col p-0 gap-0 overflow-hidden [&>button.absolute]:hidden"
        onOpenAutoFocus={(ev) => { if (sugestoes.length === 0 && campoProcurar.current) { ev.preventDefault(); campoProcurar.current.focus(); } }}
        style={{ width: LARGURA_MODAL, height: ALTURA_MODAL }} aria-describedby={undefined} data-testid="sugestoes-casar">
        <div className="flex h-8 shrink-0 items-center justify-between gap-2 bg-primary px-3 text-primary-foreground">
          {/* o nome da conta pode passar da largura: "…" e o título inteiro no `title` (a exceção declarada, como o da Conferência) */}
          <DialogTitle className="min-w-0 truncate whitespace-nowrap text-[12px] font-medium" title={titulo} data-reticencias-com-title="">
            {titulo}
          </DialogTitle>
          <button type="button" onClick={onClose} aria-label="Fechar" className="shrink-0 rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-primary-foreground/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* O TÍTULO: o lançamento do extrato numa faixa própria, separada das sugestões (data · texto do banco · valor, cada um no seu lugar) */}
        <div className="mx-3 mt-2 grid h-[34px] shrink-0 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-sm border border-[#c9d6ea] bg-[#eef3fb] px-3 text-[12px]"
          data-testid="sugestoes-extrato">
          <span className="whitespace-nowrap font-semibold text-[#1e3a5f]">Lançamento do extrato</span>
          <span className="whitespace-nowrap tabular-nums" data-testid="sugestoes-extrato-data">{dataBR(extrato.data)}</span>
          {/* a faixa é o TÍTULO do modal (Gabriel 04/11 06:36): o texto do banco que passa da largura leva "…" e o inteiro no `title` — a
              exceção declarada dos títulos (`data-reticencias-com-title`, a mesma do título "Sugestões para casar · <conta>") */}
          <span className="min-w-0 truncate font-semibold" title={tituloHistorico} data-testid="sugestoes-extrato-nome" data-reticencias-com-title="">{h.texto || '—'}</span>
          <span className={cn('whitespace-nowrap text-right text-[15px] font-bold tabular-nums', corVal(extrato.valor))} data-testid="sugestoes-extrato-valor">{fmtBRL(extrato.valor)}</span>
        </div>

        {/* a legenda dos selos mora aqui (é deles que ela fala), à direita do título: o rodapé fica só com a seleção */}
        <div className="mx-3 mt-2 flex h-[18px] shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-semibold">
          Sugestões <span className="font-normal text-muted-foreground">· mais provável primeiro</span>
          <span className="ml-auto font-normal text-muted-foreground">âmbar = conferir antes de casar</span>
        </div>
        {/* ⚠ AJUSTE 07:55: o bloco das sugestões e o do histórico DIVIDEM a altura do modal (flex-1 cada) e vão até o rodapé; o cabeçalho
            navy fica, só as linhas rolam. O modal não muda de altura (a altura dele é a da janela). */}
        <div className="mx-3 min-h-0 flex-1 overflow-auto rounded-sm border bg-card" style={{ minHeight: PISO_DE_CADA_LISTA }} data-testid="sugestoes-lista">
          <div style={{ minWidth: PISO_PARA_CASAR }} data-testid="sugestoes-piso">
          <TabelaDaLista larguras={COLUNAS_PARA_CASAR} cabecalho={<CabecalhoParaCasar />} grande>
            {sugestoes.length === 0 && (
              <tr style={{ height: ALTURA_DA_LINHA_PARA_CASAR }}><td colSpan={N_COLUNAS_PARA_CASAR} className="px-1 py-1 italic text-muted-foreground" data-testid="sugestoes-nenhuma">Nenhuma sugestão automática</td></tr>
            )}
            {sugestoes.flatMap((s, i) => s.lancamentos.map((c, j) => (
              <LinhaParaCasarNaTabela key={`${i}-${c.lancamento_id}`} l={linhaDoCandidato(c)} testid="sugestao" testidDaLinha="sugestao"
                marcada={marcados.has(c.lancamento_id)} podeMarcar={!c.ja_conciliado} motivoMarcar="já conciliado"
                alternar={() => alternar(c.lancamento_id, { de: 'sugestao', c })}
                motivo={<span className={cn(SELO, s.valorDiferente ? SELO_CONFERIR : SELO_CONFERE)} title={s.motivo} data-testid="sugestao-motivo">
                  {s.lancamentos.length > 1 ? `${j + 1}/${s.lancamentos.length} · ` : ''}{motivoCurto(s)}</span>}
                acao={<button type="button" onClick={() => onCasar(s)} className={LINK_PARA_CASAR} data-testid="sugestao-casar"
                  title={s.lancamentos.length > 1 ? `Casar a sugestão inteira (${s.lancamentos.length} lançamentos)` : 'Casar com o movimento do banco'}>casar</button>} />
            )))}
          </TabelaDaLista>
          </div>
        </div>

        {onCriarIgual && (
          <div className="mx-3 flex min-h-0 flex-1 flex-col" style={{ minHeight: PISO_DE_CADA_LISTA + 32 }}>
            <ProcurarNoHistorico clienteId={clienteId ?? null} onCriarIgual={onCriarIgual} campoRef={campoProcurar} preencher
              onCasar={onCasarDoHistorico} contaDoExtrato={{ id: contaBancariaId ?? null, nome: nomeConta ?? null }}
              movimento={{ data: extrato.data, historico: extrato.historico, valor: extrato.valor }}
              selecao={{ marcado: (id) => marcados.has(id), alternar: (a, trocar) => alternar(a.lancamentoId, { de: 'historico', a, trocar }) }} />
          </div>
        )}

        {/* O RODAPÉ FIXO: Selecionados · soma · extrato · diferença, em colunas de largura reservada (nada se desloca ao marcar), e o
            "Casar selecionados". Cabe a 750px (o modal a 95%): o "Fechar" é o ✕ do topo e a legenda subiu para o título das sugestões. */}
        <div className="mt-2 flex h-[36px] shrink-0 items-center gap-2 border-t px-3 text-[11px]" data-testid="sugestoes-rodape">
          <span className="w-[96px] shrink-0 whitespace-nowrap tabular-nums" data-testid="selecionados-n">Selecionados {resumo.n}</span>
          <span className="flex w-[136px] shrink-0 justify-between gap-1 whitespace-nowrap tabular-nums"><span className="text-muted-foreground">soma</span>
            <span className={cn('font-semibold', resumo.n ? corVal(resumo.soma) : 'text-muted-foreground')} data-testid="selecionados-soma">{resumo.n ? fmtBRL(resumo.soma) : '—'}</span></span>
          <span className="flex w-[136px] shrink-0 justify-between gap-1 whitespace-nowrap tabular-nums"><span className="text-muted-foreground">extrato</span>
            <span className={cn('font-semibold', corVal(resumo.extrato))}>{fmtBRL(resumo.extrato)}</span></span>
          <span className="flex w-[136px] shrink-0 justify-between gap-1 whitespace-nowrap tabular-nums"><span className="text-muted-foreground">diferença</span>
            <span className={cn('font-semibold', !resumo.n ? 'text-muted-foreground' : Math.abs(resumo.diferenca) < 0.005 ? 'text-emerald-600' : 'text-amber-600')}
              data-testid="selecionados-diferenca">{resumo.n ? fmtBRL(resumo.diferenca) : '—'}</span></span>
          <button type="button" disabled={!podeCasarSelecionados} onClick={() => onCasarSelecionados?.([...marcados.values()])} data-testid="casar-selecionados"
            title={podeCasarSelecionados ? 'Abre o "Casar com o banco" com os marcados: lá se ajusta o valor de um ou mais para bater com o extrato.' : 'Marque um ou mais lançamentos nas listas.'}
            className={cn('ml-auto h-[26px] shrink-0 whitespace-nowrap rounded px-3 font-medium',
              podeCasarSelecionados ? 'bg-[#E7C873] text-foreground hover:bg-[#D9B95F]' : 'cursor-not-allowed bg-muted text-muted-foreground')}>
            Casar selecionados
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
