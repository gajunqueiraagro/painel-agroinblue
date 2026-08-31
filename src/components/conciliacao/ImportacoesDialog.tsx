import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, Undo2 } from 'lucide-react';
import type { ImportacaoDaConta } from '@/hooks/useExtratoDaConta';

/**
 * ImportacoesDialog — portado do `AllinBlues/financas`
 * (`src/features/extrato/components/ImportacoesDialog.tsx`), spec do print 3.
 *
 * ⚠ ESTRUTURA COPIADA, FONTE TROCADA: mesma lista de uma linha por arquivo, com
 * nome em mono, data, contagem e o Desfazer à direita. O que muda é de onde as
 * linhas vêm.
 *
 * ⚠ O AVISO DE ALCANCE É PARTE DA TELA, não rodapé decorativo. Medido no Proto:
 * `importacao_id` está preenchido em 47 dos 3.685 movimentos — três arquivos,
 * todos de 25/08/2026. Sem a frase, a lista curta se leria como "só importaram
 * três vezes", quando o que houve foi 3.638 movimentos entrando sem rastro.
 */
interface Props {
  aberto: boolean;
  aoFechar: () => void;
  contaNome: string;
  importacoes: ImportacaoDaConta[];
  carregando: boolean;
  desfazendo: boolean;
  aoDesfazer: (id: string) => void;
}

export function ImportacoesDialog({
  aberto, aoFechar, contaNome, importacoes, carregando, desfazendo, aoDesfazer,
}: Props) {
  return (
    <Dialog open={aberto} onOpenChange={o => !o && aoFechar()}>
      <DialogContent className="flex max-h-[80vh] w-[92vw] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-2 pr-12 text-left">
          <DialogTitle className="text-sm font-semibold">Importações desta conta</DialogTitle>
          <DialogDescription className="text-[10px]">
            {contaNome} · {importacoes.length} arquivo{importacoes.length === 1 ? '' : 's'} rastreado
            {importacoes.length === 1 ? '' : 's'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {carregando ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">Carregando…</p>
          ) : importacoes.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              Nenhuma importação rastreada nesta conta.
            </p>
          ) : (
            <ul className="divide-y">
              {importacoes.map(imp => (
                <li key={imp.id} className="flex items-center gap-2 px-4 py-1.5 text-[11px]">
                  <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono" title={imp.nomeArquivo}>{imp.nomeArquivo}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {imp.data.split('-').reverse().join('/')}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    {imp.importados} importado{imp.importados === 1 ? '' : 's'}
                    {imp.comVinculo > 0 && ` · ${imp.comVinculo} conciliado(s)`}
                  </span>
                  <div className="flex-1" />
                  {/* ⚠ O BOTÃO DIZ POR QUE, quando não dá — a regra do B-09. Com
                      vínculo ativo ele não some: some a possibilidade, e a frase
                      explica qual é. */}
                  <Button
                    type="button" variant="ghost" size="sm"
                    className="h-6 shrink-0 gap-1 px-1.5 text-[10px] text-muted-foreground"
                    disabled={desfazendo || imp.comVinculo > 0}
                    title={imp.comVinculo > 0
                      ? `${imp.comVinculo} movimento(s) já conciliado(s) — desfaça os vínculos primeiro.`
                      : 'Desfaz os movimentos deste arquivo que não tenham vínculo ativo.'}
                    onClick={() => aoDesfazer(imp.id)}>
                    {desfazendo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                    Desfazer
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="shrink-0 border-t px-4 py-2 text-[9px] leading-snug text-muted-foreground">
          Importações anteriores a 25/08/2026 não são rastreadas — os movimentos delas entraram
          sem vínculo de arquivo, e o Desfazer não os alcança.
        </p>
      </DialogContent>
    </Dialog>
  );
}
