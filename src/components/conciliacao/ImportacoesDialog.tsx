import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Loader2, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { importacoesDoMes, type ImportacaoDaConta } from '@/hooks/useExtratoDaConta';

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
  /** O mês da régua, `YYYY-MM`: a lista mostra só as importações com movimento nele. */
  anoMes: string;
  carregando: boolean;
  desfazendo: boolean;
  aoDesfazer: (id: string) => void;
}

export function ImportacoesDialog({
  aberto, aoFechar, contaNome, importacoes: todas, anoMes, carregando, desfazendo, aoDesfazer,
}: Props) {
  /* ⚠ SÓ O MÊS DA RÉGUA, PELO MOVIMENTO — PR-IMPORTACOES-MES-01. A lista trazia todas as
     importações da conta, e em agosto aparecia a cancelada de setembro. O mês de um arquivo é o
     dos movimentos dele (não a data do envio), e o que atravessa dois meses aparece nos dois.
     ⚠ CANCELADA FICA ATRÁS DE "ver canceladas": cancelar é história e não se apaga, mas não
     polui a lista de trabalho. Cancelada é o registro marcado (as DUAS colunas, `cancelado_em`
     e o legado `cancelada_em`) ou o arquivo com todas as linhas desfeitas. */
  const [verCanceladas, setVerCanceladas] = useState(false);
  useEffect(() => { setVerCanceladas(false); }, [anoMes]);
  const { ativas, canceladas } = importacoesDoMes(todas, anoMes);
  const canceladasIds = new Set(canceladas.map(i => i.id));
  const eCancelada = (i: ImportacaoDaConta) => canceladasIds.has(i.id);
  const importacoes = verCanceladas ? [...ativas, ...canceladas] : ativas;
  return (
    <Dialog open={aberto} onOpenChange={o => !o && aoFechar()}>
      {/* ⚠ `max-w-2xl` E NAO `max-w-lg` — PR-IMPORTAR-CORPO-02, e a largura foi medida, nao
          escolhida no olho. O nome de arquivo mais longo do proto
          ("07.26_2_modelo_cartao_bb_ouro_financeiro_referencia.xlsx") mede 371px em mono 11px; o
          cromo da linha (padding, icone, gaps e o botao Desfazer) come 126px. Em `max-w-lg` (512)
          sobravam 386px — passava raspando; em `max-w-2xl` (672) sobram 546px. */}
      <DialogContent className="flex max-h-[80vh] w-[92vw] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-2 pr-12 text-left">
          <DialogTitle className="text-sm font-semibold">Importações desta conta</DialogTitle>
          <DialogDescription className="text-[10px]">
            {contaNome} · {importacoes.length} arquivo{importacoes.length === 1 ? '' : 's'} rastreado
            {importacoes.length === 1 ? '' : 's'}
          </DialogDescription>
        </DialogHeader>

        {/* ⚠ DUAS LINHAS POR ARQUIVO, NAO UMA — PR-IMPORTAR-CORPO-02. O nome dividia a linha com
            a data e as contagens, e era o unico `truncate` da fila: bastava a contagem crescer
            ("128 importados · 113 conciliado(s) (106 crus)") para o nome virar "Banco…". Agora o
            nome tem a linha dele e o contexto desce para 10px em muted — a hierarquia diz qual e
            o assunto e qual e a nota de rodape. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {carregando ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">Carregando…</p>
          ) : importacoes.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              Nenhuma importação com movimento neste mês.
            </p>
          ) : (
            <ul className="divide-y">
              {importacoes.map(imp => (
                <li key={imp.id}
                  className={`flex items-start gap-2 px-4 py-1.5 text-[11px] ${
                    imp.desfeitaEm ? 'text-muted-foreground' : ''}`}>
                  <FileText className="mt-[3px] h-3 w-3 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                  <div className="truncate font-mono" title={imp.nomeArquivo}>{imp.nomeArquivo}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {imp.data.split('-').reverse().join('/')}
                    {' · '}
                    {imp.importados} importado{imp.importados === 1 ? '' : 's'}
                    {imp.comVinculo > 0 && ` · ${imp.comVinculo} conciliado(s)`}
                    {/* ⚠ DE ONDE VEIO O VÍNCULO — 130 item 5. "Conciliado" não distingue o
                        lançamento que o sistema CRIOU do que já existia e foi ajustado, e
                        são coisas diferentes na hora de desfazer. */}
                    {/* ⚠ DESFEITA CONTINUA NA LISTA, em cinza e com a data — 132. Sumir
                        faria o operador reimportar o mesmo arquivo achando que nunca
                        entrou. */}
                    {imp.desfeitaEm && (
                      <span> · desfeita em {imp.desfeitaEm.slice(0, 10).split('-').reverse().join('/')}</span>
                    )}
                    {!imp.desfeitaEm && imp.canceladaNoRegistro && <span> · cancelada</span>}
                    {(imp.crus > 0 || imp.substituidos > 0) && (
                      <span className="text-muted-foreground/80">
                        {' ('}
                        {imp.crus > 0 ? `${imp.crus} cru${imp.crus === 1 ? '' : 's'}` : ''}
                        {imp.crus > 0 && imp.substituidos > 0 ? ' · ' : ''}
                        {imp.substituidos > 0 ? `${imp.substituidos} substituído${imp.substituidos === 1 ? '' : 's'}` : ''}
                        {')'}
                      </span>
                    )}
                  </div>
                  </div>
                  {/* ⚠ O BOTÃO DIZ POR QUE, quando não dá — a regra do B-09. Com
                      vínculo ativo ele não some: some a possibilidade, e a frase
                      explica qual é. */}
                  {/* Arquivo já desfeito não tem o que desfazer: o botão SOME, em vez de
                      ficar cinza pedindo um clique que não faria nada. */}
                  {!eCancelada(imp) && (
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
                  )}
                </li>
              ))}
            </ul>
          )}
          {!carregando && canceladas.length > 0 && (
            <button type="button"
              className="block w-full px-4 py-1.5 text-left text-[10px] text-muted-foreground underline hover:text-foreground"
              onClick={() => setVerCanceladas(v => !v)}>
              {verCanceladas ? 'ocultar canceladas' : `ver canceladas (${canceladas.length})`}
            </button>
          )}
        </div>

        {/* ⚠ O ALCANCE DO DESFAZER MUDOU DE ASSUNTO — 130 item 5. Antes o limite era só a
            data de corte do rastreio; agora existe um segundo limite, maior: o Conciliar o
            mês cria lançamentos e vínculos que este botão NÃO desfaz — ele recusa arquivo
            com vínculo, e é só. Dizer "pode ser desfeito" sem o caminho existir seria a
            tela prometendo o que ninguém entrega. */}
        <p className="shrink-0 border-t px-4 py-2 text-[9px] leading-snug text-muted-foreground">
          Importações anteriores a 25/08/2026 não são rastreadas — os movimentos delas entraram
          sem vínculo de arquivo, e o Desfazer não os alcança.
          {' '}Desfazer só alcança arquivos sem vínculo. Os lançamentos crus e os vínculos criados
          pela conciliação em lote serão desfeitos por um caminho próprio — em construção.
        </p>
      </DialogContent>
    </Dialog>
  );
}
