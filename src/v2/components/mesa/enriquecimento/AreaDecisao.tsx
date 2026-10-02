/**
 * A ÁREA DE DECISÃO da Mesa — PR-CONC-MESA-FAIXAS-FIXAS-01 (regra soberana do Gabriel: layout fixo); BARRA desde o
 * PR-CONC-ENRIQUECER-V2-02.
 *
 * ⚠ ALTURA FIXA, SEMPRE PRESENTE, entre a tabela e o rodapé — agora uma BARRA de 20px. A área de 104px (V2-01) guardava
 *   lugar para a faixa mais alta em TODA linha, e a maioria das linhas não pede decisão: eram 104px de "Nenhuma decisão
 *   pendente" tirados da tabela de campos. A tabela ganhou os 84.
 * ⚠ SEM DECISÃO, A BARRA FICA VAZIA (sem texto); COM DECISÃO, um aviso âmbar e o botão "Abrir decisão", que abre as MESMAS
 *   faixas (`children`, o nó que a aba monta — sobrescrever/desfazer, juntar grupo, agrupar, candidatos) num Dialog por
 *   cima da Mesa. Nenhum handler novo: o nó não é reescrito, só muda de lugar.
 * ⚠ "HÁ DECISÃO" = `children` não nulo. A aba passa `null` quando a linha não pede decisão (`faixasDaLinha`, medido em
 *   MesaEnriquecimentoTab) — é isso que permite a barra saber, sem olhar dentro do nó.
 * ⚠ TROCAR DE LINHA FECHA O DIALOG (`chave`): a decisão aberta é da linha em que se clicou.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export const ALTURA_AREA_DECISAO = '20px';

export function AreaDecisao({ children, chave, titulo }: {
  children?: ReactNode;
  /** A linha a que a decisão pertence — trocar de linha fecha o Dialog. */
  chave?: string | null;
  /** "{fornecedor} · {valor}", no cabeçalho do Dialog. */
  titulo?: string;
}) {
  const [aberta, setAberta] = useState(false);
  const temDecisao = children !== null && children !== undefined && children !== false;
  useEffect(() => { setAberta(false); }, [chave]);
  useEffect(() => { if (!temDecisao) setAberta(false); }, [temDecisao]);

  return (
    <div data-testid="area-decisao" data-tem-decisao={temDecisao ? 'sim' : 'nao'} style={{ height: ALTURA_AREA_DECISAO }}
      className="flex shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap border-t px-3">
      {temDecisao && (
        <>
          <span data-testid="aviso-decisao" className="min-w-0 truncate text-[10px] text-amber-700 dark:text-amber-400">
            ● Esta linha pede uma decisão
          </span>
          <Button type="button" size="sm" variant="outline" data-testid="abrir-decisao"
            className="h-4 shrink-0 px-1.5 text-[9.5px] leading-none" onClick={() => setAberta(true)}>
            Abrir decisão
          </Button>
          <Dialog open={aberta} onOpenChange={setAberta}>
            <DialogContent data-testid="dialog-decisao"
              className="flex max-h-[80vh] w-[720px] max-w-[96vw] flex-col gap-0 overflow-hidden p-0">
              <DialogHeader className="h-9 shrink-0 flex-row items-center space-y-0 bg-primary px-4">
                <DialogTitle className="truncate pr-6 text-[12px] font-medium text-primary-foreground">
                  Decisão · {titulo ?? '—'}
                </DialogTitle>
              </DialogHeader>
              {/* o corpo rola; as faixas são as mesmas que moravam na área fixa */}
              <div data-testid="corpo-decisao" className="flex min-h-0 flex-1 flex-col overflow-y-auto text-[10.5px]">
                {children}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
