import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { textoDoGerado, textoNaoGerados, textoVagas, type RespostaDoGerar } from '@/hooks/useRecorrencias';

/**
 * O QUE O SALVAR DA EDIÇÃO GEROU — RECORRENCIA-GERA-A-VIGENCIA-INTEIRA-01, parte 2 (Gabriel, 10/10/2026).
 *
 * Salvar uma regra já gerada com a vigência mais larga gera, no mesmo fluxo, os meses que ela passou a cobrir — pela MESMA
 * `fn_recorrencia_gerar` do "Gerar lançamentos", depois do propagar. Este diálogo SUBSTITUI o da regra (como o do propagar) e
 * só ESCREVE o que o banco respondeu, no molde do `GerarLancamentosDialog`: o que foi gerado, as competências preenchidas e
 * o que NÃO foi gerado com o motivo. Sem toast. Tamanho fixo: o lugar das três linhas existe em todo estado.
 */
export interface EstadoDoGerado { rodando: boolean; resposta: RespostaDoGerar | null; erro: string | null }

interface Props { descricao: string; estado: EstadoDoGerado; aoFechar: () => void }

export function GeradoAposSalvarDialog({ descricao, estado, aoFechar }: Props) {
  const r = estado.resposta;
  const principal = r ? textoDoGerado(r) : '';
  const vagas = r && r.vagas.length > 0 ? textoVagas(r.vagas) : '';
  const naoGerados = r && r.naoGerados.length > 0 ? textoNaoGerados(r.naoGerados) : '';
  return (
    <Dialog open onOpenChange={o => { if (!o && !estado.rodando) aoFechar(); }}>
      <DialogContent className="w-[94vw] max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-primary/10 px-4 py-2.5 pr-12 text-left">
          <DialogTitle className="text-[14px] font-medium leading-none text-primary">Lançamentos da vigência nova</DialogTitle>
          <DialogDescription className="mt-1 truncate text-[11px] leading-snug" title={descricao}>
            {descricao} · a regra já foi salva
          </DialogDescription>
        </DialogHeader>
        <div className="px-4 py-3">
          <div data-testid="gerado-lugar" className="h-[57px] rounded border bg-muted/40 px-2 py-1.5 text-[11px] leading-[15px]">
            {estado.rodando ? (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Gerando os meses que a vigência passou a cobrir…
              </div>
            ) : estado.erro ? (
              <div data-testid="gerado-erro" title={estado.erro} className="line-clamp-3 text-destructive">{estado.erro}</div>
            ) : (<>
              <div data-testid="gerado-resultado" title={principal}
                className={`truncate ${r && r.gerados > 0 ? 'font-medium text-emerald-700' : 'text-muted-foreground'}`}>{principal}</div>
              <div data-testid={vagas ? 'gerado-vagas' : undefined} title={vagas || undefined} className="truncate text-[10px] text-muted-foreground">{vagas}</div>
              <div data-testid={naoGerados ? 'gerado-nao-gerados' : undefined} title={naoGerados || undefined} className="truncate text-[10px] text-amber-700">{naoGerados}</div>
            </>)}
          </div>
        </div>
        <DialogFooter className="items-center gap-2 border-t bg-accent px-4 py-2.5 sm:justify-end">
          <Button size="sm" disabled={estado.rodando} onClick={aoFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
