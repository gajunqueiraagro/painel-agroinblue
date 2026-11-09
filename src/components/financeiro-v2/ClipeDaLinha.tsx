/**
 * O CLIPE DA LISTA DE LANÇAMENTOS — DOC-ANEXO-E-IMPORT-01 F2 (D1 do mock `ui-validar/doc-anexo-mock.html`, aprovado 05/11 17:41).
 * Abre o documento DIRETO DA LISTA, sem o modal do lançamento:
 *   · 1 documento → o clique abre o arquivo (nova aba; o XML sem PDF abre os itens da nota, nunca cru — DOC-NOTA-XML-PDF-01);
 *   · 2+ → o número no clipe (selo cinza) e o popover ancorado: "N documentos · clique para abrir" + uma linha por documento =
 *     o SELO DO TIPO primeiro (`SeloDoTipo`, o único) · nome ("…" + `title`) · data (dd/mm/aaaa, à direita — a regra da casa, sem exceção: decisão da noite 05/11, confirmar de manhã); clicar abre aquele.
 * ⚠ LIDO NO CLIQUE (`lerLinhasDoClipe`, a fonte e a regra da aba Documentos): "Carregando…" enquanto lê; a contagem velha que não acha
 *   nada diz "sem documento"; a leitura que falha diz a frase e "Tentar de novo" (P146).
 * ⚠ O CLIQUE NÃO CHEGA À LINHA: o embrulho para o clique e o duplo clique — o popover e o diálogo dos itens são portais, e o evento do
 *   React sobe pela árvore dos componentes até a linha, que abriria o modal.
 */
import { useRef, useState, type MouseEvent } from 'react';
import { Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SeloDoTipo } from '@/components/financeiro-v2/SeloDoTipo';
import { ItensDaNotaDialog } from '@/components/financeiro-v2/ItensDaNotaDialog';
import { assinarDocumento, type LancDocumento } from '@/hooks/useLancamentoDocumentos';
import { lerLinhasDoClipe } from '@/lib/financeiro/documentosDoClipe';
import { dataBR } from '@/lib/datas/dataBR';
import { oQueAbrir, type LinhaDeDocumento } from '@/lib/financeiro/notaDosDocumentos';
import { tipoDoSelo } from '@/lib/financeiro/tipoDoDocumento';
import { cn } from '@/lib/utils';

type Estado = { fase: 'fechado' } | { fase: 'lendo' } | { fase: 'lista'; linhas: LinhaDeDocumento[] } | { fase: 'erro'; frase: string };

const parar = (e: MouseEvent) => e.stopPropagation();

export function ClipeDaLinha({ clienteId, lancamentoId, qtd, resumo }: {
  clienteId: string | null;
  lancamentoId: string;
  /** as linhas da aba Documentos (`quantasLinhasDoClipe`): 0 = sem clipe, 1 = abre direto, 2+ = o número e o popover */
  qtd: number;
  /** o `title` do clipe ("NF 000.000.518 · 1 boleto") */
  resumo: string;
}) {
  const [estado, setEstado] = useState<Estado>({ fase: 'fechado' });
  const [itensDe, setItensDe] = useState<LancDocumento | null>(null);
  /* SEM DUPLO CLIQUE: o segundo clique durante a leitura não lê de novo (nem abre a segunda aba) */
  const lendo = useRef(false);
  if (qtd <= 0 || !clienteId) return <span className="text-muted-foreground/60" data-testid="clipe-vazio">—</span>;

  const abrir = async (l: LinhaDeDocumento) => {
    const o = oQueAbrir(l);
    if (!o) return;
    if (o.tipo === 'itens') { setItensDe(o.doc); return; }
    const url = o.doc.url ? await assinarDocumento(o.doc.url, o.doc.origem) : null;
    if (!url) { toast.error('Não foi possível abrir o arquivo.'); return; }
    window.open(url, '_blank', 'noopener');
  };
  const ler = async () => {
    if (lendo.current) return;
    lendo.current = true;
    if (qtd >= 2) setEstado({ fase: 'lendo' });
    const r = await lerLinhasDoClipe(clienteId, lancamentoId).finally(() => { lendo.current = false; });
    if (r.ok === false) { setEstado({ fase: 'erro', frase: r.motivo }); return; }
    /* um só, com arquivo: abre direto (com 1 no clipe o popover nem aparece) */
    if (r.valor.length === 1 && oQueAbrir(r.valor[0])) { setEstado({ fase: 'fechado' }); void abrir(r.valor[0]); return; }
    setEstado({ fase: 'lista', linhas: r.valor });
  };
  const clicar = (e: MouseEvent) => {
    /* (a linha não recebe o clique: quem para é o embrulho) aberto: o clique no clipe FECHA (o Radix cuida); fechado: lê */
    if (estado.fase !== 'fechado') return;
    e.preventDefault();
    void ler();
  };
  const xmlDe = async (d: LancDocumento): Promise<ArrayBuffer | null> => {
    const url = d.url ? await assinarDocumento(d.url, d.origem) : null;
    if (!url) return null;
    const r = await fetch(url);
    return r.ok ? r.arrayBuffer() : null;
  };

  return (
    <span className="inline-flex" onClick={parar} onDoubleClick={parar} data-testid="clipe-da-linha-embrulho">
      <Popover open={estado.fase !== 'fechado'} onOpenChange={(o) => { if (!o) setEstado({ fase: 'fechado' }); }}>
        <PopoverTrigger asChild>
          <button type="button" onClick={clicar} title={resumo} aria-label={`Documentos: ${resumo}`} data-testid="clipe-da-linha"
            className="inline-flex h-[15px] items-center gap-0.5 rounded px-0.5 text-[#41506a] hover:bg-[#e7eef8] hover:text-primary">
            <Paperclip className="h-2.5 w-2.5" aria-hidden />
            {qtd >= 2 && (
              <b className="rounded-[7px] bg-[#6b7a90] px-1 text-[9.5px] font-semibold leading-[13px] text-white tabular-nums" data-testid="clipe-numero">{qtd}</b>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={2} className="w-max min-w-[200px] max-w-[430px] p-1" data-testid="clipe-popover">
          {estado.fase === 'lendo' && <div className="px-1.5 py-1 text-[10px] text-muted-foreground" data-testid="clipe-carregando">Carregando…</div>}
          {estado.fase === 'erro' && (
            <div className="flex items-center gap-2 px-1.5 py-1 text-[10px] text-destructive" data-testid="clipe-erro">
              <span>{estado.frase}</span>
              <button type="button" className="flex-none text-blue-700 underline-offset-2 hover:underline" onClick={() => { void ler(); }}>Tentar de novo</button>
            </div>
          )}
          {estado.fase === 'lista' && (estado.linhas.length === 0
            ? <div className="px-1.5 py-1 text-[10px] text-muted-foreground" data-testid="clipe-sem-documento">sem documento</div>
            : <>
              <div className="px-1.5 pb-[3px] pt-0.5 text-[10px] text-muted-foreground" data-testid="clipe-titulo">
                {estado.linhas.length} {estado.linhas.length === 1 ? 'documento' : 'documentos'} · clique para abrir
              </div>
              {/* UMA TABELA (a regra de corte: nome em tabela = "…" + o nome inteiro no `title`; fora de tabela "…" reprova — gate de 06/11):
                  colunas fixas, a linha inteira abre (clique, Enter ou espaço) */}
              <table className="table-fixed border-collapse text-[11px]" style={{ width: 412 }}>
                <colgroup><col style={{ width: 92 }} /><col style={{ width: 250 }} /><col style={{ width: 70 }} /></colgroup>
                <tbody>
                  {estado.linhas.map((l) => {
                    const d = l.principal;
                    const nome = l.pdf?.nome || d.nome || '—';
                    const temArquivo = !!oQueAbrir(l);
                    const abrirEsta = () => { if (!temArquivo) return; setEstado({ fase: 'fechado' }); void abrir(l); };
                    return (
                      <tr key={d.id} data-testid="clipe-documento" tabIndex={temArquivo ? 0 : -1} aria-disabled={!temArquivo}
                        onClick={abrirEsta} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirEsta(); } }}
                        className={cn('h-[21px] outline-none focus-visible:bg-[#eef3fa]', temArquivo ? 'cursor-pointer hover:bg-[#eef3fa]' : 'cursor-default opacity-60')}>
                        <td className="whitespace-nowrap rounded-l-[5px] pl-1.5"><SeloDoTipo tipo={tipoDoSelo({ especie: d.especie, especieOC: d.especieOC, chaveAcesso: d.chaveAcesso })} /></td>
                        <td className="truncate whitespace-nowrap px-1" title={temArquivo ? nome : `${nome} · sem arquivo anexado`} data-testid="clipe-documento-nome">{nome}</td>
                        <td className="whitespace-nowrap rounded-r-[5px] pr-1.5 text-right tabular-nums text-muted-foreground" data-testid="clipe-documento-data">{dataBR(d.dataEmissao)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>)}
        </PopoverContent>
      </Popover>
      {itensDe && clienteId && (
        <ItensDaNotaDialog clienteId={clienteId} chave={(itensDe.chaveAcesso ?? '').replace(/\D/g, '')} onClose={() => setItensDe(null)}
          lerArquivo={() => xmlDe(itensDe)} />
      )}
    </span>
  );
}
