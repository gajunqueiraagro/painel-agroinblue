import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { invalidarDono } from '@/hooks/useResumoConciliacao';
import { MOTIVO_OBRIGATORIO, motivoInformado } from '@/lib/financeiro/cancelamentoLancamento';
import {
  confrontoDoSplit, dataCurta, desfazerSplit, moeda, porQueNaoDesfaz, situacaoDoFilho,
  FRASE_DO_SPLIT, ROTULO_DESFAZER_SPLIT, TITULO_DO_SPLIT, type SplitDoLancamento,
} from '@/lib/conciliacao/cancelarFilhoDeSplit';

/**
 * O AVISO DE QUE O LANÇAMENTO É FILHO DE UM DESMEMBRAMENTO — CONC-SPLIT-FILHO-CANCELADO-01 passo 2, commit B. O molde é o
 * `CancelarParcelaDialog`: a porta pergunta ao banco antes de abrir a confirmação de sempre e, sendo filho de split vivo,
 * abre ESTE diálogo — que não cancela o filho: mostra o desmembramento e oferece desfazê-lo INTEIRO, pelo dono.
 *
 * ⚠ OS NÚMEROS SÃO OS DO BANCO (`fn_split_do_lancamento`); a tela só compara os dois que mostra lado a lado.
 * ⚠ TAMANHO FIXO (560 × 300): a lista de filhos rola por dentro, com o cabeçalho preso; toda linha condicional tem lugar.
 * A recusa (do banco, ou o porquê de o botão estar apagado) fica ESCRITA ao lado do botão — nunca em toast.
 */
interface Props {
  clienteId: string;
  split: SplitDoLancamento;
  /** fecha sem gravar nada */
  aoVoltar: () => void;
  /** desfez: a porta fecha o que estiver aberto */
  aoDesfazer: () => void;
}

const TH = 'sticky top-0 z-10 h-[18px] bg-primary px-1.5 py-0 text-[9.5px] font-semibold text-primary-foreground';
const TD = 'h-[18px] px-1.5 py-0 text-[10px] leading-[17px]';

export function CancelarFilhoDeSplitDialog({ clienteId, split, aoVoltar, aoDesfazer }: Props) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);

  const naoDesfaz = porQueNaoDesfaz(split);
  const motivoOk = motivoInformado(motivo);
  const porQueNao = naoDesfaz ?? (!motivoOk ? MOTIVO_OBRIGATORIO : null);
  const confronto = confrontoDoSplit(split);
  const { extrato } = split;

  const gravar = async () => {
    if (porQueNao || !motivoOk) return;
    setOcupado(true); setRecusa(null);
    try {
      const erro = await desfazerSplit(split, motivoOk);
      if (erro) { setRecusa(erro); return; }
      notificarLancamentosMudaram(clienteId);
      invalidarDono(qc, clienteId);
      for (const chave of ['espelho-conciliacao', 'classificacao-staging', 'extrato-ger-lancs', 'extrato-ger-concil', 'cpr-lancs', 'cpr-caixa']) {
        void qc.invalidateQueries({ queryKey: [chave] });
      }
      aoDesfazer();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <AlertDialog open onOpenChange={o => { if (!o && !ocupado) aoVoltar(); }}>
      <AlertDialogContent className="h-[300px] w-[94vw] max-w-[560px] gap-0 overflow-hidden p-0" data-testid="cancelar-filho-de-split">
        <AlertDialogHeader className="h-[52px] shrink-0 space-y-0 border-b bg-primary/10 px-4 py-2 text-left">
          <AlertDialogTitle className="truncate text-[14px] font-medium leading-[18px] text-primary" data-testid="split-titulo">
            {TITULO_DO_SPLIT}
          </AlertDialogTitle>
          <AlertDialogDescription asChild className="mt-0.5 text-[10px] leading-[16px] text-muted-foreground">
            <div className="flex min-w-0 items-center gap-1.5" data-testid="split-extrato">
              <span className="shrink-0 whitespace-nowrap tabular-nums">extrato de {dataCurta(extrato.data)}</span>
              <span className="shrink-0 whitespace-nowrap">· {extrato.contaNome || '—'}</span>
              <span className="shrink-0 whitespace-nowrap font-medium tabular-nums text-foreground">· {moeda(Math.abs(extrato.valor))}</span>
              <span className="min-w-0 truncate" title={extrato.descricao}>· {extrato.descricao || '—'}</span>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex h-[202px] flex-col gap-1.5 px-4 py-2">
          {/* a lista é o ÚNICO scrollport: cabeçalho preso, altura fixa (cinco linhas à vista) */}
          <div className="h-[110px] shrink-0 overflow-y-auto overflow-x-hidden rounded border rolagem-fina" data-testid="split-filhos">
            <table className="w-full table-fixed border-collapse">
              <colgroup><col /><col style={{ width: 104 }} /><col style={{ width: 104 }} /></colgroup>
              <thead>
                <tr>
                  <th className={`${TH} text-left`}>Lançamento do desmembramento</th>
                  <th className={`${TH} text-right`}>Valor (R$)</th>
                  <th className={`${TH} text-left`}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {split.filhos.map(f => (
                  <tr key={f.lancamentoId} className={`border-b ${f.este ? 'bg-primary/10' : ''}`}
                    data-testid="split-filho" data-este={f.este ? 'sim' : undefined} data-cancelado={f.cancelado ? 'sim' : undefined}>
                    <td className={`${TD} truncate ${f.cancelado ? 'text-muted-foreground line-through' : f.este ? 'font-semibold' : ''}`} title={f.descricao}>
                      {f.descricao || '—'}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-right tabular-nums ${f.cancelado ? 'text-muted-foreground line-through' : f.este ? 'font-semibold' : ''}`}>
                      {moeda(f.valor).replace('R$ ', '')}
                    </td>
                    <td className={`${TD} whitespace-nowrap ${f.cancelado ? 'text-muted-foreground' : f.este ? 'font-semibold text-primary' : ''}`}>
                      {situacaoDoFilho(f)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="flex h-[16px] shrink-0 items-center gap-1.5 text-[10px] tabular-nums" data-testid="split-confronto">
            <span className="text-muted-foreground">soma dos vivos</span>
            <span className="font-medium">{confronto.vivos}</span>
            <span className="text-muted-foreground">· extrato</span>
            <span className="font-medium">{confronto.extrato}</span>
            <span className={confronto.confere ? 'text-[#15803d]' : 'font-medium text-[#b91c1c]'} data-testid="split-confere">
              {confronto.confere ? '· confere ✓' : '· não confere'}
            </span>
          </p>

          <p className="h-[28px] shrink-0 overflow-hidden text-[10px] leading-[14px] text-amber-700" title={FRASE_DO_SPLIT} data-testid="split-frase">
            {FRASE_DO_SPLIT}
          </p>

          <div className="flex h-[22px] shrink-0 items-center gap-2">
            <Label htmlFor="split-motivo" className="shrink-0 text-[10px] font-medium">Motivo *</Label>
            <Input id="split-motivo" value={motivo} onChange={e => { setMotivo(e.target.value); setRecusa(null); }}
              className="h-[22px] min-w-0 flex-1 px-1.5 text-[10px]" placeholder="Por que está desfazendo o desmembramento" maxLength={200}
              disabled={!!naoDesfaz} data-testid="split-motivo" />
          </div>
        </div>

        <AlertDialogFooter className="h-[46px] shrink-0 flex-row items-center gap-2 space-x-0 border-t bg-accent px-4 py-0 sm:justify-end">
          <span className={`mr-auto line-clamp-2 min-w-0 text-[10px] leading-[13px] ${recusa || naoDesfaz ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
            data-testid="split-recado" title={recusa ?? porQueNao ?? undefined}>
            {recusa ?? porQueNao ?? ''}
          </span>
          <Button variant="ghost" size="sm" disabled={ocupado} onClick={aoVoltar} title="Fecha sem gravar nada" data-testid="split-voltar">Voltar</Button>
          <Button type="button" size="sm" variant="destructive" className="shrink-0 gap-1.5" disabled={ocupado || !!porQueNao}
            title={porQueNao ?? undefined} onClick={() => { void gravar(); }} data-testid="split-desfazer">
            {ocupado && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {ROTULO_DESFAZER_SPLIT}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
