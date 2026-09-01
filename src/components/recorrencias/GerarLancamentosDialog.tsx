import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { formatMoeda } from '@/lib/calculos/formatters';
import { gerarRecorrencia, type Recorrencia } from '@/hooks/useRecorrencias';

/**
 * GerarLancamentosDialog — a prévia e a execução, pela MESMA pergunta.
 * FIN-RECORRENCIA-01, Tempo 1.
 *
 * ⚠ PRÉVIA E EXECUÇÃO SÃO A MESMA CHAMADA, com `p_simular` alternando. Uma
 * prévia que responde por um caminho e grava por outro pode prometer N e
 * entregar M — e o operador só descobre depois. Aqui a diferença é só se o banco
 * confirma a transação.
 *
 * ⚠ O AVISO DOS TOTAIS É OBRIGATÓRIO, e não é cortesia: gerar doze meses aumenta
 * os totais do período na proporção do horizonte. Quem gerar até dezembro e
 * depois olhar o ano vai ver um número maior sem ter gasto mais nada. O filtro
 * de status separa previsto do realizado — a tela precisa dizer isso ANTES.
 *
 * ⚠ IDEMPOTENTE POR CONSTRUÇÃO: a segunda chamada devolve 0. O botão não
 * desabilita depois de gerar, porque o horizonte pode ser esticado — o que não
 * acontece é duplicar o que já existe.
 */
interface Props {
  recorrencia: Recorrencia;
  aoFechar: () => void;
  aoGerar: () => void | Promise<void>;
}

export function GerarLancamentosDialog({ recorrencia, aoFechar, aoGerar }: Props) {
  /* O horizonte nasce no fim da regra: o caso comum é gerar tudo o que falta.
     Encurtar é decisão de quem não quer inflar o ano ainda. */
  const [ate, setAte] = useState(recorrencia.dataFim.slice(0, 10));
  const [previa, setPrevia] = useState<{ gerados: number; de: string | null; ate: string | null } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const chamar = async (simular: boolean) => {
    setOcupado(true);
    try {
      const r = await gerarRecorrencia(recorrencia.id, ate || null, simular);
      if (!r.ok || r.erro) { toast.error(r.erro ?? 'O banco recusou a geração.'); return; }
      if (simular) { setPrevia({ gerados: r.gerados, de: r.de, ate: r.ate }); return; }
      /* ⚠ ZERO É RESPOSTA, NÃO FALHA: significa que o horizonte pedido já está
         inteiro gerado. Dizer "nenhum lançamento criado" sem explicar faria
         parecer defeito. */
      if (r.gerados === 0) {
        toast.info('Nada a gerar — este horizonte já está todo lançado.');
      } else {
        toast.success(`${r.gerados} lançamento${r.gerados === 1 ? '' : 's'} previsto${r.gerados === 1 ? '' : 's'} criado${r.gerados === 1 ? '' : 's'}.`);
      }
      await aoGerar();
      aoFechar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && aoFechar()}>
      <DialogContent className="w-[94vw] max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-primary/10 px-4 py-2.5 pr-12 text-left">
          <DialogTitle className="text-[14px] font-medium leading-none text-primary">Gerar lançamentos</DialogTitle>
          <DialogDescription className="mt-1 text-[11px] leading-snug">
            {recorrencia.descricao} · {formatMoeda(recorrencia.valorBase)} · dia {recorrencia.diaVencimento}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 px-4 py-3">
          <div>
            <Label className="text-[10px]">Gerar até (competência)</Label>
            <Input type="date" value={ate} onChange={e => { setAte(e.target.value); setPrevia(null); }}
              className="h-8 text-xs"
              title="Só ENCURTA: o teto é sempre a última competência da regra." />
          </div>

          {/* ⚠ O AVISO VEM ANTES DO BOTÃO, não depois do estrago. */}
          <div className="flex gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-900">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              Os lançamentos nascem <b>previstos</b> e entram nos totais do período: gerar vários meses
              aumenta o total do ano na proporção do horizonte. O filtro de status separa previsto de
              realizado.
            </span>
          </div>

          {previa && (
            /* ⚠ A PRÉVIA MOSTRA A JANELA, e não só o número: "12" sem o de-até
               não deixa conferir se o horizonte é o que se pediu. */
            <div className="rounded border bg-muted/40 px-2 py-1.5 text-[11px]">
              {previa.gerados === 0 ? (
                <span className="text-muted-foreground">Nada a gerar — este horizonte já está todo lançado.</span>
              ) : (
                <span>
                  <b className="tabular-nums">{previa.gerados}</b> lançamento{previa.gerados === 1 ? '' : 's'}
                  {previa.de && previa.ate && (
                    <span className="text-muted-foreground">
                      {' '}· de {mesBr(previa.de)} a {mesBr(previa.ate)}
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="items-center gap-2 border-t bg-accent px-4 py-2.5 sm:justify-between">
          <Button variant="outline" size="sm" disabled={ocupado} onClick={() => { void chamar(true); }}>
            {ocupado && !previa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Prévia
          </Button>
          <span className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={aoFechar}>Fechar</Button>
            <Button type="button" size="sm" className="gap-1.5"
              disabled={ocupado || !ate}
              title={!ate ? 'Escolha até quando gerar.' : undefined}
              onClick={() => { void chamar(false); }}>
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Confirmar
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesBr = (iso: string): string => {
  const [a, m] = iso.slice(0, 7).split('-').map(Number);
  return `${MES_CURTO[m - 1]}/${String(a).slice(2)}`;
};
