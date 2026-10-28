import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import type { ForaDaVigencia, LancamentoForaDaVigencia } from '@/hooks/useRecorrencias';

/**
 * P154 (Gabriel 28/10/2026) — OS PREVISTOS FORA DA VIGÊNCIA, antes de mexer: a regra ENCURTADA (depois de salvar) ou CANCELADA (antes de
 * confirmar). A lista é a do BANCO (`fn_recorrencia_fora_da_vigencia` com `p_simular`): o que será cancelado (só previsto, fora de mês
 * fechado; o "valor do mês" com a marca) e o que NÃO se mexe, com o porquê (programado, agendado, realizado, conciliado, mês fechado).
 * Cancelar nunca apaga. A recusa do banco fica escrita no rodapé (nunca toast); nada fecha sozinho. Tamanho fixo: a lista rola no lugar dela.
 */
export type ModoForaDaVigencia = 'encurtada' | 'cancelar';

interface Props {
  modo: ModoForaDaVigencia;
  descricao: string;
  previa: ForaDaVigencia | null;
  /** a simulação ainda não respondeu */
  carregando: boolean;
  erro: string | null;
  /** `true` = cancelar os previstos (e, no modo `cancelar`, a regra junto); `false` = só a regra (modo `cancelar`). */
  aoConfirmar: (comPrevistos: boolean) => Promise<void>;
  aoFechar: () => void;
}

const mesAno = (iso: string) => (iso.length >= 7 ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const dataBr = (iso: string | null) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const hojeBr = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };

/** A frase do rodapé — uma regra só para o texto e o `title`. */
export function fraseDoFora(modo: ModoForaDaVigencia, p: ForaDaVigencia | null): string {
  if (!p) return '';
  const quando = p.modo === 'cancelada' && p.corte ? `a partir de ${mesAno(p.corte + '-01')}` : 'depois da vigência nova';
  const n = p.qtde;
  const base = n === 0
    ? `Nenhum previsto ${quando}.`
    : `${n} previsto${n === 1 ? '' : 's'} ${quando} · ${formatMoeda(p.soma)} — cancelado${n === 1 ? '' : 's'} com o motivo "recorrência encerrada em ${hojeBr()}"; nada se apaga.`;
  const fica = p.naoMexe.length > 0 ? ` ${p.naoMexe.length} fica${p.naoMexe.length === 1 ? '' : 'm'} como está (abaixo).` : '';
  return modo === 'cancelar' && n === 0 ? `${base}${fica} A regra para de gerar.` : `${base}${fica}`;
}

function Linha({ l, cancela }: { l: LancamentoForaDaVigencia; cancela: boolean }) {
  const obs = cancela ? (l.valorDoMes ? 'previsto · valor do mês ajustado' : 'previsto') : (l.motivo ?? l.status);
  return (
    <tr className={cn('h-[19px] border-b border-border/50', !cancela && 'text-muted-foreground')} data-testid={cancela ? 'fora-cancela' : 'fora-nao-mexe'}>
      <td className="px-1 tabular-nums">{mesAno(l.competencia)}</td>
      <td className="px-1 tabular-nums">{dataBr(l.vencimento)}</td>
      <td className="whitespace-nowrap px-1 text-right tabular-nums">{formatMoeda(l.valor)}</td>
      <td className={cn('truncate px-1', cancela && l.valorDoMes && 'text-amber-700')} title={obs}>{obs}</td>
    </tr>
  );
}

export function ForaDaVigenciaDialog({ modo, descricao, previa, carregando, erro, aoConfirmar, aoFechar }: Props) {
  const [gravando, setGravando] = useState(false);
  const confirmar = async (comPrevistos: boolean) => { setGravando(true); try { await aoConfirmar(comPrevistos); } finally { setGravando(false); } };
  const n = previa?.qtde ?? 0;
  const frase = erro ?? (carregando ? 'Lendo os lançamentos da regra…' : fraseDoFora(modo, previa));
  const ocupado = carregando || gravando;
  return (
    <Dialog open onOpenChange={o => { if (!o && !gravando) aoFechar(); }}>
      <DialogContent className="flex h-[min(430px,calc(100vh-16px))] w-[min(560px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0"
        data-testid="modal-fora-da-vigencia">
        <DialogHeader className="shrink-0 border-b bg-primary/10 px-4 py-2.5 pr-12 text-left">
          <DialogTitle className="text-[14px] font-medium leading-none text-primary">
            {modo === 'cancelar' ? 'Cancelar recorrência' : 'Lançamentos fora da vigência nova'}
          </DialogTitle>
          <DialogDescription className="uma-linha-que-rola mt-1 text-[11px] leading-snug" title={descricao}>
            {modo === 'cancelar' ? `${descricao} · a regra para de gerar` : `${descricao} · a regra já foi salva`}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2" data-testid="lista-fora">
          <table className="w-full table-fixed text-[10px]">
            <colgroup><col style={{ width: '64px' }} /><col style={{ width: '84px' }} /><col style={{ width: '104px' }} /><col /></colgroup>
            <thead className="sticky top-0 bg-primary text-primary-foreground">
              <tr className="h-[22px] text-[9.5px] font-medium">
                <th className="px-1 text-left font-medium">Competência</th><th className="px-1 text-left font-medium">Vencimento</th>
                <th className="px-1 text-right font-medium">Valor</th><th className="px-1 text-left font-medium">O que acontece</th>
              </tr>
            </thead>
            <tbody>
              {(previa?.cancela ?? []).map((l) => <Linha key={l.id} l={l} cancela />)}
              {(previa?.naoMexe ?? []).length > 0 && (
                <tr className="h-[19px]"><td colSpan={4} className="px-1 pt-1 text-[9.5px] font-medium text-muted-foreground">Não mexo (só à mão)</td></tr>
              )}
              {(previa?.naoMexe ?? []).map((l) => <Linha key={l.id} l={l} cancela={false} />)}
            </tbody>
          </table>
          {!carregando && previa && previa.cancela.length === 0 && previa.naoMexe.length === 0 && (
            <div className="py-3 text-center text-[11px] text-muted-foreground">Nenhum lançamento fora da vigência.</div>
          )}
        </div>
        <DialogFooter className="shrink-0 flex-col items-stretch gap-1.5 border-t bg-accent px-4 py-2 sm:flex-col sm:justify-end">
          <div className={cn('h-[45px] overflow-hidden text-[10.5px] leading-[15px]', erro ? 'text-destructive' : 'text-muted-foreground')}
            title={frase} data-testid="rodape-fora">{carregando && !erro ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : null}{frase}</div>
          <div className="flex justify-end gap-2">
            {modo === 'cancelar' ? (<>
              <Button variant="outline" size="sm" disabled={gravando} onClick={aoFechar}>Voltar</Button>
              <Button variant="outline" size="sm" disabled={ocupado} onClick={() => { void confirmar(false); }} data-testid="so-a-regra">Só a regra</Button>
              <Button size="sm" className="w-[230px]" disabled={ocupado || n === 0} onClick={() => { void confirmar(true); }} data-testid="cancelar-com-previstos"
                title={n === 0 ? 'Nenhum previsto a cancelar' : undefined}>
                {gravando ? 'Gravando…' : `Cancelar a regra e os ${n} previsto${n === 1 ? '' : 's'}`}
              </Button>
            </>) : (<>
              <Button variant="outline" size="sm" disabled={gravando} onClick={aoFechar} data-testid="deixar-como-esta">Deixar como está</Button>
              <Button size="sm" className="w-[180px]" disabled={ocupado || n === 0} onClick={() => { void confirmar(true); }} data-testid="cancelar-previstos"
                title={n === 0 ? 'Nenhum previsto a cancelar' : undefined}>
                {gravando ? 'Gravando…' : `Cancelar os ${n} previsto${n === 1 ? '' : 's'}`}
              </Button>
            </>)}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
