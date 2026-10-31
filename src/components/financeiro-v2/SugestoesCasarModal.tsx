/**
 * SUGESTÕES PARA CASAR — PR-CONC-SUGESTOES-CASAR-01; desenho do P159c (mock `mock-sugestoes-casar-v1.html`, Gabriel 29/10).
 *
 * ⚠ O MOTOR NÃO MORA AQUI: `sugerirCasamentos` (`src/lib/conciliacao/sugestoesCasamento.ts`) é o mesmo que a prévia da
 * importação usa para somar. Este modal só MOSTRA a lista e entrega a escolhida ao `CasarComBancoModal` — quem casa
 * continua sendo ele, com a mesma RPC e o mesmo Conciliar. Nada casa por aqui.
 * ⚠ MODAL SOBRE MODAL: abre por cima da Conferência (o Radix empilha; Esc fecha só o de cima).
 * ⚠ A LISTA VEM PRONTA DA CONFERÊNCIA — a MESMA que deu o "(N)" do menu, calculada uma vez por mesa (decisão do Gabriel,
 * 30/09). O modal não recalcula: com orçamentos diferentes, o menu dizia (2) e o modal mostrava 1 (medido no Camargo).
 * ⚠ ALINHAMENTO SOBERANO (P159c): o movimento do banco é a 1ª LINHA DA MESMA TABELA — data na coluna Venc., o nome do extrato (o
 * texto limpo do `historicoDoBanco`) em Descrição + Fornecedor, o valor na coluna Valor — valor sob valor, data sob data. O banco
 * vai no título ("Sugestões para casar · <conta>").
 * ⚠ REGRA DE CORTE (21/10): em tabela, texto = UMA linha com "…" e o texto inteiro no `title`; data (dd/mm/aaaa), valor e
 * contador nunca cortam — as colunas deles foram medidas no pior texto.
 * ⚠ SELOS A 8px, a exceção da Conferência (CLAUDE.md): azul tracejado = confere; âmbar cheio = conferir antes de casar.
 * ⚠ P153b (Gabriel 29/10): o modal vai a até 1400px de largura e a ALTURA TODA; 9px, linha de 17px, cabeçalho de 8,5px (EXCEÇÃO DECLARADA
 *   ao piso de 9,5, pedida pelo Gabriel). As sugestões ficam num bloco de ALTURA FIXA (a linha do extrato + 9 linhas; mais rola lá dentro) e o
 *   "Procurar no histórico" ocupa o resto da altura — nada se desloca ao procurar. O achado EM ABERTO do histórico casa por aqui também
 *   (`onCasarDoHistorico`, o mesmo `CasarComBancoModal`); o de outra conta casa trocando a conta (D3).
 */
import { useRef } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { STATUS_PALETA, STATUS_FILTRO_LABEL } from '@/lib/financeiro/statusFinanceiro';
import { fmtBRL } from '@/components/conciliacao/TabelaExtratoDoMes';
import { dataBR } from '@/lib/datas/dataBR';
import { historicoDoBanco } from '@/lib/conciliacao/historicoDoBanco';
/* ⚠ SEM IMPORT DA CONFERÊNCIA NEM DO `CasarComBancoModal`: o tipo do extrato é o estrutural da lib. Importar de lá
   fecharia um ciclo (Espelho → este modal → Casar → Espelho), que o `madge` acusa. */
import type { CandidatoSugestao, ExtratoParaSugerir, Sugestao } from '@/lib/conciliacao/sugestoesCasamento';
import { ProcurarNoHistorico } from '@/components/conciliacao/ProcurarNoHistorico';
import type { AchadoDoHistorico, ModeloDoHistorico } from '@/lib/conciliacao/procurarNoHistorico';

const corVal = (v: number) => (v < 0 ? 'text-rose-600' : 'text-emerald-600');
/* P153b: linha de 17px a 9px (pedido do Gabriel); número e data numa linha só, na coluna medida. */
const LINHA = 'h-[17px]';
const CEL = 'px-[4px] whitespace-nowrap';
/* Texto livre: uma linha, "…" e o texto inteiro no `title`. */
const TEXTO = 'px-[4px] truncate';
const SELO = 'inline-block max-w-full truncate rounded-[3px] border px-[4px] py-[1px] align-middle text-[8px] font-semibold leading-[8px]';
const SELO_CONFERE = 'border-dashed border-[#1d4ed8] text-[#1d4ed8]';
const SELO_CONFERIR = 'border-solid border-amber-500 bg-amber-50 text-amber-700';

function paletaDoStatus(k: string) {
  switch (k) {
    case 'previsto': return STATUS_PALETA.previsto;
    case 'programado': return STATUS_PALETA.programado;
    case 'agendado': return STATUS_PALETA.agendado;
    case 'realizado': return STATUS_PALETA.realizado;
    case 'conciliado': return STATUS_PALETA.conciliado;
    default: return null;
  }
}

function Status({ status }: { status: string | null }) {
  const k = (status ?? '').trim().toLowerCase();
  const p = paletaDoStatus(k);
  return (
    <span className={cn('text-[8px] font-semibold leading-none', p ? p.texto : 'text-muted-foreground')}>
      {STATUS_FILTRO_LABEL[k] ?? (status || '')}
    </span>
  );
}

/** Vencimento em mês anterior ao do banco: âmbar e negrito — o operador casa um atrasado sabendo. */
function Venc({ c, mesBanco }: { c: CandidatoSugestao; mesBanco: string }) {
  const d = c.data_vencimento ?? c.competencia;
  const antes = !!c.data_vencimento && c.data_vencimento.slice(0, 7) < mesBanco;
  return (
    <td className={cn(CEL, 'tabular-nums text-muted-foreground', antes && 'font-semibold text-amber-600')}
      title={d ? `vencimento ${dataBR(d)}${antes ? ' · mês anterior' : ''}` : undefined}>
      {d ? dataBR(d) : '—'}
    </td>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  extrato: ExtratoParaSugerir | null;
  nomeConta?: string;
  /** A lista que a Conferência calculou para esta linha — a mesma do "(N)" do menu. */
  sugestoes: readonly Sugestao[];
  onCasar: (s: Sugestao) => void;
  /** P153 — o "Procurar no histórico" embaixo das sugestões; sem os dois, ele não aparece. */
  clienteId?: string | null;
  onCriarIgual?: (m: ModeloDoHistorico) => void;
  /** P153b — casar um achado EM ABERTO do "Procurar no histórico" (`trocarConta` = o de outra conta, D3). */
  onCasarDoHistorico?: (a: AchadoDoHistorico, trocarConta: boolean) => void;
  /** P153b — a conta do movimento (decide "outra conta" no histórico). */
  contaBancariaId?: string | null;
}

/* ⚠ AS LARGURAS (P159c; P153b a 9px): Venc. 58 = "00/00/0000" a 9px tabular (~47) + 8 de padding + folga — a data inteira, nunca em duas
     linhas · Motivo 220 ("mesmo fornecedor · valor difere: previsto 99.999.999,99", ~200 a 8px + selo) · Valor 88 (o teto "-99.999.999,99")
     · Status 62 ("Programado") · casar 52. Descrição e Fornecedor dividem o resto (`null` = sem largura). */
const COLUNAS: readonly (number | null)[] = [58, null, null, 220, 88, 62, 52];
const FIXAS = COLUNAS.reduce<number>((a, b) => a + (b ?? 0), 0);
/* P153b — até 1400px (Gabriel 29/10), nunca mais que 95% da janela; a ALTURA TODA (12px de respiro em cima e embaixo). */
const LARGURA_MODAL = 'min(1400px, 95vw)';
const ALTURA_MODAL = 'calc(100vh - 24px)';
/* as sugestões: cabeçalho 20 + a linha do extrato 17 + o título 17 + 9 linhas de 17 + 2 de borda = 209, FIXO (mais rola dentro) */
const ALTURA_SUGESTOES = 20 + 17 + 17 + 9 * 17 + 2;

export function SugestoesCasarModal({ open, onClose, extrato, nomeConta, sugestoes, onCasar, clienteId, onCriarIgual, onCasarDoHistorico,
  contaBancariaId }: Props) {
  const campoProcurar = useRef<HTMLInputElement>(null);
  if (!extrato) return null;
  const mesBanco = (extrato.data ?? '').slice(0, 7);
  const titulo = ['Sugestões para casar', nomeConta].filter(Boolean).join(' · ');
  const h = historicoDoBanco(extrato.historico, extrato.data);
  const original = extrato.historico ?? '';
  const tituloHistorico = h.texto && h.texto !== original ? `${h.texto}\n${original}` : original || undefined;

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

        {/* ⚠ o bloco das sugestões tem ALTURA FIXA: o cabeçalho navy fica, só as linhas rolam (sem o Procurar, ele ocupa o modal todo). */}
        <div className={cn('mx-3 mt-2 shrink-0 overflow-y-auto border rounded-sm', !onCriarIgual && 'min-h-0 flex-1')}
          style={onCriarIgual ? { height: ALTURA_SUGESTOES } : undefined} data-testid="sugestoes-lista">
          <table className="w-full table-fixed border-collapse text-[9px]" style={{ minWidth: FIXAS + 160 }}>
            <colgroup>
              {COLUNAS.map((w, i) => <col key={i} style={w == null ? undefined : { width: w }} />)}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-primary text-primary-foreground">
              <tr className="h-[20px]">
                {['Venc.', 'Descrição', 'Fornecedor', 'Motivo', 'Valor', 'Status', ''].map((t, i) => (
                  <th key={i} className={cn('px-[4px] text-[8.5px] font-medium whitespace-nowrap', i === 4 ? 'text-right' : 'text-left')}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* O MOVIMENTO DO BANCO, nas mesmas colunas das sugestões */}
              <tr className={cn(LINHA, 'border-b-2 border-[#c9d6ea] bg-[#eef3fb] font-semibold')} data-testid="sugestoes-extrato">
                <td className={cn(CEL, 'tabular-nums')}>{dataBR(extrato.data)}</td>
                <td colSpan={2} className={TEXTO} title={tituloHistorico} data-testid="sugestoes-extrato-nome">{h.texto || '—'}</td>
                <td />
                <td className={cn(CEL, 'text-right tabular-nums', corVal(extrato.valor))}>{fmtBRL(extrato.valor)}</td>
                <td className="px-[4px] whitespace-nowrap">
                  <span className="text-[8px] font-semibold leading-none text-muted-foreground">extrato</span>
                </td>
                <td />
              </tr>
              <tr className={cn(LINHA, 'bg-muted')}>
                <td colSpan={7} className="px-[4px] font-medium text-muted-foreground whitespace-nowrap">Sugestões · mais provável primeiro</td>
              </tr>
              {sugestoes.length === 0 && (
                <tr className={LINHA}><td colSpan={7} className="px-[4px] italic text-muted-foreground" data-testid="sugestoes-nenhuma">Nenhuma sugestão automática</td></tr>
              )}
              {sugestoes.map((s, i) => {
                const um = s.lancamentos.length === 1 ? s.lancamentos[0] : null;
                const soma = s.lancamentos.reduce((t, c) => t + Number(c.valor_assinado), 0);
                const fornecedores = [...new Set(s.lancamentos.map((c) => c.fornecedor || '—'))];
                const casar = (
                  <td className="px-[4px] text-right">
                    <button type="button" onClick={() => onCasar(s)} data-testid="sugestao-casar"
                      className="font-semibold text-[#1d4ed8] underline underline-offset-2 hover:text-[#1e40af]">
                      casar
                    </button>
                  </td>
                );
                const motivo = (
                  <td className="px-[4px] whitespace-nowrap" title={s.motivo}>
                    <span className={cn(SELO, s.valorDiferente ? SELO_CONFERIR : SELO_CONFERE)} data-testid="sugestao-motivo">{s.motivo}</span>
                  </td>
                );
                const zebra = i % 2 === 1 && 'bg-muted/30';
                if (um) {
                  return (
                    <tr key={um.lancamento_id} className={cn(LINHA, 'border-b border-border/50', zebra)} data-testid="sugestao">
                      <Venc c={um} mesBanco={mesBanco} />
                      <td className={TEXTO} title={um.descricao ?? undefined}>{um.descricao ?? '—'}</td>
                      <td className={TEXTO} title={um.fornecedor || undefined}>{um.fornecedor || '—'}</td>
                      {motivo}
                      <td className={cn(CEL, 'text-right tabular-nums', corVal(Number(um.valor_assinado)))}>{fmtBRL(Number(um.valor_assinado))}</td>
                      <td className="px-[4px] whitespace-nowrap"><Status status={um.status_transacao} /></td>
                      {casar}
                    </tr>
                  );
                }
                return [
                  <tr key={`s${i}`} className={cn(LINHA, 'border-b border-border/30', zebra)} data-testid="sugestao">
                    <td />
                    <td className={cn(TEXTO, 'text-muted-foreground')} title={`${s.lancamentos.length} lançamentos`}>{s.lancamentos.length} lançamentos</td>
                    <td className={TEXTO} title={fornecedores.join(' · ')}>{fornecedores.length === 1 ? fornecedores[0] : 'vários'}</td>
                    {motivo}
                    <td className={cn(CEL, 'text-right font-semibold tabular-nums', corVal(soma))}>{fmtBRL(soma)}</td>
                    <td />
                    {casar}
                  </tr>,
                  ...s.lancamentos.map((c, j) => (
                    <tr key={`s${i}-${c.lancamento_id}`} data-testid="sugestao-filha"
                      className={cn(LINHA, j === s.lancamentos.length - 1 ? 'border-b border-border/50' : 'border-b border-border/20', zebra)}>
                      <Venc c={c} mesBanco={mesBanco} />
                      <td className="px-[4px]">
                        <span className="flex min-w-0 items-center">
                          <span className="shrink-0 text-muted-foreground">↳&nbsp;</span>
                          <span className="min-w-0 truncate" title={c.descricao ?? undefined}>{c.descricao ?? '—'}</span>
                        </span>
                      </td>
                      <td className={TEXTO} title={c.fornecedor || undefined}>{c.fornecedor || '—'}</td>
                      <td />
                      <td className={cn(CEL, 'text-right tabular-nums', corVal(Number(c.valor_assinado)))}>{fmtBRL(Number(c.valor_assinado))}</td>
                      <td className="px-[4px] whitespace-nowrap"><Status status={c.status_transacao} /></td>
                      <td />
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>

        {onCriarIgual && (
          <div className="mx-3 flex min-h-0 flex-1 flex-col">
            <ProcurarNoHistorico clienteId={clienteId ?? null} onCriarIgual={onCriarIgual} campoRef={campoProcurar} preencher
              onCasar={onCasarDoHistorico} contaDoExtrato={{ id: contaBancariaId ?? null, nome: nomeConta ?? null }}
              movimento={{ data: extrato.data, historico: extrato.historico, valor: extrato.valor }} />
          </div>
        )}

        <div className="flex h-[30px] shrink-0 items-center justify-between gap-2 px-3">
          <span className="text-[9.5px] text-muted-foreground">âmbar = conferir antes de casar</span>
          <button type="button" onClick={onClose} className="h-[22px] rounded border px-2 text-[10px] hover:bg-muted">Fechar</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
