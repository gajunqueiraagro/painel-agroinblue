/**
 * SUGESTÕES PARA CASAR — PR-CONC-SUGESTOES-CASAR-01.
 *
 * ⚠ O MOTOR NÃO MORA AQUI: `sugerirCasamentos` (`src/lib/conciliacao/sugestoesCasamento.ts`) é o mesmo que a prévia da
 * importação usa para somar. Este modal só MOSTRA a lista e entrega a escolhida ao `CasarComBancoModal` — quem casa
 * continua sendo ele, com a mesma RPC e o mesmo Conciliar. Nada casa por aqui.
 * ⚠ MODAL SOBRE MODAL: abre por cima da Conferência (o Radix empilha; Esc fecha só o de cima).
 * ⚠ A LISTA VEM PRONTA DA CONFERÊNCIA — a MESMA que deu o "(N)" do menu, calculada uma vez por mesa (decisão do Gabriel,
 * 30/09). O modal não recalcula: com orçamentos diferentes, o menu dizia (2) e o modal mostrava 1 (medido no Camargo).
 * ⚠ SEM RETICÊNCIAS (regra do CLAUDE.md): as colunas foram medidas no maior texto do NJ, e o que ainda passar QUEBRA em
 * duas linhas naquela linha — descrição, fornecedor, histórico e o selo do motivo.
 * ⚠ SELOS A 8px, a exceção da Conferência (CLAUDE.md): azul tracejado = confere; âmbar cheio = conferir antes de casar.
 */
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { STATUS_PALETA, STATUS_FILTRO_LABEL } from '@/lib/financeiro/statusFinanceiro';
import { fmtBRL, fmtData } from '@/components/conciliacao/TabelaExtratoDoMes';
/* ⚠ SEM IMPORT DA CONFERÊNCIA NEM DO `CasarComBancoModal`: o tipo do extrato é o estrutural da lib. Importar de lá
   fecharia um ciclo (Espelho → este modal → Casar → Espelho), que o `madge` acusa. */
import type { CandidatoSugestao, ExtratoParaSugerir, Sugestao } from '@/lib/conciliacao/sugestoesCasamento';

const corVal = (v: number) => (v < 0 ? 'text-rose-600' : 'text-emerald-600');
/* Número e data: uma linha, e a coluna foi medida para caber. */
const CEL = 'px-[4px] whitespace-nowrap';
/* Texto livre: quebra em vez de cortar. 3 em cima + `leading-[12px]` + 2 embaixo + 1 da borda da linha (border-collapse)
   = os 18px da linha, medido na tela; com duas linhas, 30. */
const TEXTO = 'px-[4px] pt-[3px] pb-[2px] leading-[12px] whitespace-normal break-words';
/* 8px de corpo, 8 de entrelinha, 1+1 de respiro e 1+1 de borda = 12px numa linha; se o motivo não couber, quebra. */
const SELO = 'inline-block rounded-[3px] border px-[4px] py-[1px] text-[8px] font-semibold leading-[8px] align-top';
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
      title={d ? `vencimento ${fmtData(d)}${antes ? ' · mês anterior' : ''}` : undefined}>
      {d ? fmtData(d) : '—'}
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
}

/* ⚠ AS LARGURAS SAEM DA MEDIÇÃO (Inter, NJ · BB · set/26): pior texto + 8 de folga + 8 de padding.
     Descrição 196 ("↳ Monitoramento Segurança Escritorio", 176,5) · Fornecedor 220 ("Ademicon Administradora de
     Consorcios S/A", 202,3) · Motivo 160 ("soma de 3 · fornecedores diferentes", 139,8 a 8px + selo) · Status 64
     ("Programado", 47,4 — com 52 ele vazava para a coluna do lado) · Valor 74 ("-134.613,84", 52,4). */
const COLUNAS = [40, 196, 220, 160, 74, 64, 52];
const LARGURA_MESA = COLUNAS.reduce((a, b) => a + b, 0);

export function SugestoesCasarModal({ open, onClose, extrato, nomeConta, sugestoes, onCasar }: Props) {
  if (!extrato) return null;
  const mesBanco = (extrato.data ?? '').slice(0, 7);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* ⚠ 834 = 806 da mesa + 24 de margem + 2 da borda da caixa + 2 da borda do Dialog. Sem as 4 das bordas, a caixa
            fica 4px menor que a mesa e ela rola na horizontal (medido na tela, NJ · BB · set/26). */}
      <DialogContent className="w-[834px] max-w-[95vw] grid-cols-[minmax(0,1fr)] p-0 gap-0 overflow-hidden [&>button.absolute]:hidden"
        aria-describedby={undefined} data-testid="sugestoes-casar">
        <div className="flex h-8 shrink-0 items-center justify-between gap-2 bg-primary px-3 text-primary-foreground">
          <DialogTitle className="text-[12px] font-medium">Sugestões para casar</DialogTitle>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-primary-foreground/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="px-3 pt-2 pb-1.5 grid grid-cols-[56px_1fr] gap-x-2 gap-y-0.5 items-baseline text-[9.5px]">
          <span className="text-muted-foreground">banco</span>
          <span className="whitespace-nowrap">
            <span className={cn('font-semibold tabular-nums', corVal(extrato.valor))}>{fmtBRL(extrato.valor)}</span>
            <span className="text-muted-foreground">{' · '}{[fmtData(extrato.data), nomeConta].filter(Boolean).join(' · ')}</span>
          </span>
          <span className="text-muted-foreground">histórico</span>
          <span className="min-w-0 break-words">{extrato.historico ?? '—'}</span>
        </div>

        {/* ⚠ UM SCROLLPORT SÓ, e é este: o cabeçalho navy fica, só as linhas rolam. */}
        <div className="mx-3 max-h-[60vh] overflow-y-auto border rounded-sm">
          <table className="table-fixed border-collapse text-[9.5px]" style={{ width: LARGURA_MESA }}>
            <colgroup>
              {COLUNAS.map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-primary text-primary-foreground">
              <tr className="h-[18px]">
                {['Venc.', 'Descrição', 'Fornecedor', 'Motivo', 'Valor', 'Status', ''].map((h, i) => (
                  <th key={i} className="px-[4px] text-center font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sugestoes.length === 0 && (
                <tr className="h-[18px]"><td colSpan={7} className="px-[4px] italic text-muted-foreground">nenhuma sugestão para este movimento</td></tr>
              )}
              {sugestoes.map((s, i) => {
                const um = s.lancamentos.length === 1 ? s.lancamentos[0] : null;
                const soma = s.lancamentos.reduce((t, c) => t + Number(c.valor_assinado), 0);
                const fornecedores = [...new Set(s.lancamentos.map((c) => c.fornecedor || '—'))];
                const casar = (
                  <td className="px-[4px] text-right">
                    <button type="button" onClick={() => onCasar(s)} data-testid="sugestao-casar"
                      className="text-[9.5px] font-semibold text-[#1d4ed8] underline underline-offset-2 hover:text-[#1e40af]">
                      casar
                    </button>
                  </td>
                );
                const motivo = (
                  /* ⚠ `leading-[12px]` NA CÉLULA E O SELO NO TOPO: com a entrelinha herdada e o selo ao meio, a linha subia a
                     21px (medido na tela). Assim: 3 + 12 + 2 + 1 da borda = 18. */
                  <td className="px-[4px] pt-[3px] pb-[2px] leading-[12px]">
                    <span className={cn(SELO, s.valorDiferente ? SELO_CONFERIR : SELO_CONFERE)} data-testid="sugestao-motivo">{s.motivo}</span>
                  </td>
                );
                const zebra = i % 2 === 1 && 'bg-muted/30';
                if (um) {
                  return (
                    <tr key={um.lancamento_id} className={cn('h-[18px] border-b border-border/50', zebra)} data-testid="sugestao">
                      <Venc c={um} mesBanco={mesBanco} />
                      <td className={TEXTO}>{um.descricao ?? '—'}</td>
                      <td className={TEXTO}>{um.fornecedor || '—'}</td>
                      {motivo}
                      <td className={cn(CEL, 'text-right tabular-nums', corVal(Number(um.valor_assinado)))}>{fmtBRL(Number(um.valor_assinado))}</td>
                      <td className="px-[4px] whitespace-nowrap"><Status status={um.status_transacao} /></td>
                      {casar}
                    </tr>
                  );
                }
                return [
                  <tr key={`s${i}`} className={cn('h-[18px] border-b border-border/30', zebra)} data-testid="sugestao">
                    <td />
                    <td className={cn(TEXTO, 'text-muted-foreground')}>{s.lancamentos.length} lançamentos</td>
                    <td className={TEXTO} title={fornecedores.join(' · ')}>{fornecedores.length === 1 ? fornecedores[0] : 'vários'}</td>
                    {motivo}
                    <td className={cn(CEL, 'text-right font-semibold tabular-nums', corVal(soma))}>{fmtBRL(soma)}</td>
                    <td />
                    {casar}
                  </tr>,
                  ...s.lancamentos.map((c, j) => (
                    <tr key={`s${i}-${c.lancamento_id}`} data-testid="sugestao-filha"
                      className={cn('h-[18px]', j === s.lancamentos.length - 1 ? 'border-b border-border/50' : 'border-b border-border/20', zebra)}>
                      <Venc c={c} mesBanco={mesBanco} />
                      <td className={TEXTO}><span className="text-muted-foreground">↳ </span>{c.descricao ?? '—'}</td>
                      <td className={TEXTO}>{c.fornecedor || '—'}</td>
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

        <div className="flex h-[30px] items-center justify-between gap-2 px-3">
          <span className="text-[9.5px] text-muted-foreground">ordem: mais provável primeiro · âmbar = conferir antes de casar</span>
          <button type="button" onClick={onClose} className="h-[22px] rounded border px-2 text-[10px] hover:bg-muted">Fechar</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
