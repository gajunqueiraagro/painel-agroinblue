/**
 * A DECISÃO da Mesa — PR-CONC-MESA-FAIXAS-FIXAS-01 (regra soberana do Gabriel: layout fixo); barra de 20px no
 * PR-CONC-ENRIQUECER-V2-02; SLOT NO RODAPÉ desde o PR-CONC-MESA-ORDEM-03.
 *
 * ⚠ NÃO É MAIS UMA LINHA: era uma barra de 20px entre a tabela e o rodapé, vazia na maioria das linhas — mais 18px do slot
 *   acima do rodapé, duas linhas em branco tiradas da tabela de campos. Agora é um lugar de LARGURA FIXA dentro do rodapé
 *   (◀ ▶ Reverter | decisão | mensagem | Pular | Aprovar), sempre presente: com decisão, o botão "● Abrir decisão" em
 *   âmbar; sem decisão, o mesmo espaço, vazio. Nada anda ao trocar de linha.
 * ⚠ O BOTÃO ABRE AS MESMAS FAIXAS (`children`, o nó que a aba monta — sobrescrever/desfazer, juntar grupo, agrupar,
 *   candidatos) num Dialog por cima da Mesa. Nenhum handler novo: o nó não é reescrito, só muda de lugar.
 * ⚠ "HÁ DECISÃO" = `children` não nulo (a aba passa `null` quando a linha não pede decisão — `faixasDaLinha`).
 * ⚠ TROCAR DE LINHA FECHA O DIALOG (`chave`): a decisão aberta é da linha em que se clicou.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * A largura do slot no rodapé: "● Abrir decisão" a 10px mede 70px (canvas, Inter) + 16 de padding + 2 de borda = 88,
 * + 8 de folga = 96 (conferido no navegador).
 */
export const LARGURA_SLOT_DECISAO = '96px';

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
    <span data-testid="slot-decisao" data-tem-decisao={temDecisao ? 'sim' : 'nao'}
      className="flex shrink-0 items-center" style={{ width: LARGURA_SLOT_DECISAO }}>
      {temDecisao && (
        <>
          <Button type="button" size="sm" variant="outline" data-testid="abrir-decisao"
            title="Esta linha pede uma decisão"
            className="h-[22px] w-full whitespace-nowrap border-amber-500 px-2 text-[10px] text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-400"
            onClick={() => setAberta(true)}>
            ● Abrir decisão
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
    </span>
  );
}
