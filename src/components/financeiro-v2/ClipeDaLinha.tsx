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
import { chaveDoDanfeSobDemanda, oQueAbrir, type LinhaDeDocumento } from '@/lib/financeiro/notaDosDocumentos';
import { xmlDaCaixaDaReceita } from '@/lib/fiscal/danfeDasNotasGuardadas';
import { danfePdfDoXml } from '@/lib/fiscal/danfePdf';
import { VisualizadorDeDocumento } from '@/components/financeiro-v2/VisualizadorDeDocumento';
import { tipoDoSelo } from '@/lib/financeiro/tipoDoDocumento';
import { cn } from '@/lib/utils';

/* ANEXO-COL-ALINHA-01 (Chat 17/11 06:11, UI-ALINHAMENTO soberano): o clipe fica SEMPRE no mesmo x em todas as linhas — um grupo de
   largura FIXA (o lugar do clipe + o lugar RESERVADO do contador, 2 dígitos) centrado na coluna; com 1 anexo o lugar do contador fica
   vazio, e o "—" sem anexo ocupa o lugar do clipe. */
const GRUPO = 'inline-flex h-[15px] w-[31px] items-center gap-[2px]';
const LUGAR_DO_CLIPE = 'inline-flex w-[11px] flex-none items-center justify-center';
const LUGAR_DO_NUMERO = 'inline-flex w-[18px] flex-none items-center justify-start';

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
  /* DANFE-SOB-DEMANDA-01 — o DANFE gerado na hora (nada gravado) e o "gerando" (sem duplo clique) */
  const [danfe, setDanfe] = useState<{ bytes: ArrayBuffer; nome: string } | null>(null);
  const gerando = useRef(false);
  /* SEM DUPLO CLIQUE: o segundo clique durante a leitura não lê de novo (nem abre a segunda aba) */
  const lendo = useRef(false);
  if (qtd <= 0 || !clienteId) return (
    <span className={GRUPO} data-clipe-grupo="">
      <span className={cn(LUGAR_DO_CLIPE, 'text-muted-foreground/60')} data-testid="clipe-vazio">—</span>
      <span className={LUGAR_DO_NUMERO} aria-hidden />
    </span>
  );

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
    /* um só, com arquivo: abre direto (com 1 no clipe o popover nem aparece) — menos a NF com PDF E XML (NOTA-RECEITA-DANFE-ANEXO-01):
       o popover mostra os dois ("PDF · DANFE" e "XML · Itens") */
    if (r.valor.length === 1 && oQueAbrir(r.valor[0]) && !(r.valor[0].pdf?.url && r.valor[0].xml?.url) && !chaveDoDanfeSobDemanda(r.valor[0])) {
      setEstado({ fase: 'fechado' }); void abrir(r.valor[0]); return;
    }
    setEstado({ fase: 'lista', linhas: r.valor });
  };
  const clicar = (e: MouseEvent) => {
    /* (a linha não recebe o clique: quem para é o embrulho) aberto: o clique no clipe FECHA (o Radix cuida); fechado: lê */
    if (estado.fase !== 'fechado') return;
    e.preventDefault();
    void ler();
  };
  const xmlDe = async (d: LancDocumento): Promise<ArrayBuffer | null> => {
    /* DANFE-SOB-DEMANDA-01: sem arquivo guardado, o XML da Receita pela chave */
    if (!d.url) { const c = (d.chaveAcesso ?? '').replace(/\D/g, ''); return c.length === 44 ? xmlDaCaixaDaReceita(clienteId, c) : null; }
    const url = await assinarDocumento(d.url, d.origem);
    if (!url) return null;
    const r = await fetch(url);
    return r.ok ? r.arrayBuffer() : null;
  };
  /* DANFE-SOB-DEMANDA-01 — o DANFE do XML (o MESMO gerador do DANFE-LAYOUT-02, `danfePdfDoXml`) aberto no visualizador; nada é gravado */
  const gerarDanfe = async (l: LinhaDeDocumento, chave: string) => {
    if (gerando.current) return;
    gerando.current = true;
    try {
      const bytes = await xmlDe(l.xml ?? l.principal);
      if (!bytes) { toast.error('Esta nota não tem o XML guardado nem na Receita: não dá para gerar o DANFE.'); return; }
      const r = await danfePdfDoXml(new File([bytes], `NFe${chave}.xml`, { type: 'application/xml' }));
      if (r.ok === false) { toast.error(r.frase); return; }
      setDanfe({ bytes: await new Response(r.pdf).arrayBuffer(), nome: r.pdf.name });
    } catch (e) {
      console.error('[ClipeDaLinha] DANFE', e); toast.error('Não consegui gerar o DANFE agora. Tente de novo.');
    } finally { gerando.current = false; }
  };

  return (
    <span className="inline-flex" onClick={parar} onDoubleClick={parar} data-testid="clipe-da-linha-embrulho">
      <Popover open={estado.fase !== 'fechado'} onOpenChange={(o) => { if (!o) setEstado({ fase: 'fechado' }); }}>
        <PopoverTrigger asChild>
          <button type="button" onClick={clicar} title={resumo} aria-label={`Documentos: ${resumo}`} data-testid="clipe-da-linha"
            className={cn(GRUPO, 'rounded text-[#41506a] hover:bg-[#e7eef8] hover:text-primary')} data-clipe-grupo="">
            <span className={LUGAR_DO_CLIPE} data-testid="clipe-lugar"><Paperclip className="h-2.5 w-2.5" aria-hidden /></span>
            <span className={LUGAR_DO_NUMERO} data-testid="clipe-lugar-numero">
              {qtd >= 2 && (
                <b className="rounded-[7px] bg-[#6b7a90] px-[3px] text-[9.5px] font-semibold leading-[13px] text-white tabular-nums" data-testid="clipe-numero">{qtd}</b>
              )}
            </span>
          </button>
        </PopoverTrigger>
        {/* UI-LARGURA-FIXA-01 (Gabriel 19/11): o popover tem a largura da tabela (412 + p-1 + borda), não a do conteúdo */}
        <PopoverContent align="end" sideOffset={2} className="w-[422px] p-1" data-testid="clipe-popover">
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
                  {estado.linhas.flatMap((l) => {
                    /* DANFE-SOB-DEMANDA-01 — a NF sem PDF: "PDF · DANFE" (gerado do XML na hora) e "XML · Itens" */
                    const chaveDanfe = chaveDoDanfeSobDemanda(l);
                    if (chaveDanfe) {
                      const doc = l.xml ?? l.principal;
                      return [
                        { key: `${doc.id}-danfe`, d: l.principal, nome: 'PDF · DANFE', title: 'DANFE gerado do XML na hora (não fica gravado)', linha: l, testId: 'clipe-documento-danfe',
                          acao: () => { void gerarDanfe(l, chaveDanfe); } },
                        { key: `${doc.id}-xml`, d: l.principal, nome: 'XML · Itens', title: `${doc.nome || 'XML'} · abre os itens da nota`, linha: l, testId: 'clipe-documento-xml',
                          acao: () => { setItensDe(doc); } },
                      ];
                    }
                    /* NOTA-RECEITA-DANFE-ANEXO-01 — a NF com PDF E XML vira DUAS linhas: o PDF (o DANFE) e o XML (os itens) */
                    if (l.pdf?.url && l.xml?.url) {
                      const { pdf, xml } = l;
                      return [
                        { key: `${pdf.id}-pdf`, d: l.principal, nome: 'PDF · DANFE', title: pdf.nome || 'DANFE', linha: { ...l, xml: null }, testId: 'clipe-documento-pdf', acao: null },
                        { key: `${xml.id}-xml`, d: l.principal, nome: 'XML · Itens', title: `${xml.nome || 'XML'} · abre os itens da nota`, linha: { ...l, pdf: null }, testId: 'clipe-documento-xml', acao: null },
                      ];
                    }
                    const nome = l.pdf?.nome || l.principal.nome || '—';
                    return [{ key: l.principal.id, d: l.principal, nome, title: nome, linha: l, testId: 'clipe-documento-unico', acao: null }];
                  }).map(({ key, d, nome, title, linha: l, testId, acao }) => {
                    const temArquivo = !!acao || !!oQueAbrir(l);
                    const abrirEsta = () => { if (!temArquivo) return; setEstado({ fase: 'fechado' }); if (acao) acao(); else void abrir(l); };
                    return (
                      <tr key={key} data-testid="clipe-documento" data-qual={testId} tabIndex={temArquivo ? 0 : -1} aria-disabled={!temArquivo}
                        onClick={abrirEsta} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirEsta(); } }}
                        className={cn('h-[21px] outline-none focus-visible:bg-[#eef3fa]', temArquivo ? 'cursor-pointer hover:bg-[#eef3fa]' : 'cursor-default opacity-60')}>
                        <td className="whitespace-nowrap rounded-l-[5px] pl-1.5"><SeloDoTipo tipo={tipoDoSelo({ especie: d.especie, especieOC: d.especieOC, chaveAcesso: d.chaveAcesso })} /></td>
                        <td className="truncate whitespace-nowrap px-1" title={temArquivo ? title : `${title} · sem arquivo anexado`} data-testid="clipe-documento-nome">{nome}</td>
                        <td className="whitespace-nowrap rounded-r-[5px] pr-1.5 text-right tabular-nums text-muted-foreground" data-testid="clipe-documento-data">{dataBR(d.dataEmissao)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>)}
        </PopoverContent>
      </Popover>
      {danfe && (
        <VisualizadorDeDocumento open bytes={danfe.bytes} nome={danfe.nome} onFechar={() => setDanfe(null)}
          onNovaAba={() => { const u = URL.createObjectURL(new Blob([danfe.bytes], { type: 'application/pdf' })); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60_000); }} />
      )}
      {itensDe && clienteId && (
        <ItensDaNotaDialog clienteId={clienteId} chave={(itensDe.chaveAcesso ?? '').replace(/\D/g, '')} onClose={() => setItensDe(null)}
          lerArquivo={() => xmlDe(itensDe)} />
      )}
    </span>
  );
}
