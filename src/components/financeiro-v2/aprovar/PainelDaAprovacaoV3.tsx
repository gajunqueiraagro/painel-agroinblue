/**
 * APROVAR-PAGAMENTOS-V3 (mock aprovado) — o painel "decidir este pagamento", ALTURA FIXA (nada empurra):
 *   · à esquerda, ABAS: uma por DOCUMENTO anexado (PDF + XML da mesma nota = UMA aba, pela `linhasDosDocumentos` — o erro da NF repetida
 *     da St Repro) + a aba PAGAMENTO (linha digitável do boleto; chave do Pix; banco/agência/conta da TED; débito automático), com o
 *     "confere" do CPF/CNPJ de quem recebe contra o emitente da NF;
 *   · à direita, o valor grande, o fornecedor numa linha e a descrição embaixo, o que é, a forma, a NF e o pronto, o confronto do banco,
 *     quem lançou, os ÚLTIMOS PAGAMENTOS em tabelinha (data · parcela · valor) e o comentário (obrigatório para recusar);
 *   · ‹ › passa ao próximo sem fechar; Aprovar / Recusar pelo `fn_aprovacao_decidir` (prévia antes; o banco confere de novo).
 * No celular (`celular`), o MESMO conteúdo em tela cheia: o topo com ‹ › e "k de N", o valor, as abas e os botões no rodapé.
 * O aprovador não edita nada aqui. Erro fica no painel (UX-TOAST-01).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { VisualizadorDeDocumento } from '@/components/financeiro-v2/VisualizadorDeDocumento';
import { ItensDaNotaDialog } from '@/components/financeiro-v2/ItensDaNotaDialog';
import { useLancamentoDocumentos } from '@/hooks/useLancamentoDocumentos';
import { decidirAprovacao } from '@/hooks/useAprovacaoDaCpr';
import { linhasDosDocumentos, oQueAbrir } from '@/lib/financeiro/notaDosDocumentos';
import { lancadoPorTexto } from '@/lib/financeiro/aprovacaoNaCpr';
import {
  conferirFavorecido, ddmm, motivoSemDecidir, rotuloDaAbaDoDocumento, ddmmaaaa, diaDaSemana, documentoComMascara, numeroDaNf, saida, siglaDaForma, textoDoPronto, estaPronto,
  variacaoDoDa, type LinhaV3, type UltimoPagamento,
} from '@/lib/financeiro/aprovacaoV3';
import type { ParcelaDoContrato } from '@/lib/financiamentos/nomeDaParcela';
import { cn } from '@/lib/utils';

function formatoPdf(tipo: string | null, nome: string | null): boolean {
  return (tipo ?? '').toLowerCase().includes('pdf') || (nome ?? '').toLowerCase().endsWith('.pdf');
}

interface Anterior { id: string; data: string; valor: number }

function Copiar({ texto, testid }: { texto: string; testid: string }) {
  const [feito, setFeito] = useState(false);
  return (
    <button type="button" data-testid={testid} className="ml-1.5 shrink-0 text-[10.5px] text-primary underline-offset-2 hover:underline"
      onClick={() => { void navigator.clipboard?.writeText(texto).then(() => setFeito(true)).catch(() => setFeito(false)); }}>
      <span className="inline-block w-[44px]">{feito ? 'copiado' : 'copiar'}</span>
    </button>
  );
}

function Confere({ c }: { c: ReturnType<typeof conferirFavorecido> }) {
  return <span className={cn(c.tom === 'ok' && 'font-semibold text-emerald-700', c.tom === 'diferente' && 'text-amber-700')}>{c.texto}</span>;
}

/** a aba PAGAMENTO — como vai ser pago */
export function AbaPagamentoV3({ linha }: { linha: LinhaV3 }) {
  const p = linha.pagamento;
  const forma = siglaDaForma(linha.forma);
  const linhas: [string, ReactNode][] = [];
  if (forma.sigla === 'Bol') {
    linhas.push(['Forma', 'Boleto']);
    /* a do boleto LIGADO; sem ele, a digitada no lançamento (`dados_pagamento`) */
    const linhaDig = p.linhaDigitavel ?? p.dados;
    if (linhaDig) {
      linhas.push(['Linha digitável', <span className="flex min-w-0 items-start"><span className="min-w-0 break-all tabular-nums">{linhaDig}</span>
        <Copiar texto={linhaDig.replace(/\D/g, '')} testid="v3-copiar-linha" /></span>]);
      if (!p.linhaDigitavel) linhas.push(['Origem', 'digitada no lançamento']);
      if (p.linhaDigitavel) {
        linhas.push(['Beneficiário', p.beneficiario ?? '—']);
        linhas.push(['CPF/CNPJ', <span>{documentoComMascara(p.beneficiarioDoc)} · <Confere c={conferirFavorecido(p.beneficiarioDoc, p, linha.nf)} /></span>]);
      }
    } else {
      linhas.push(['Boleto', p.boletoAnexado ? 'anexado (veja a aba Boleto)' : 'não anexado']);
    }
  } else if (forma.sigla === 'Pix') {
    linhas.push(['Forma', `Pix${p.tipoChave ? ` · chave ${p.tipoChave}` : ''}`]);
    linhas.push(['Chave', p.chave ? <span className="flex min-w-0 items-start"><span className="min-w-0 break-all">{p.chave}</span><Copiar texto={p.chave} testid="v3-copiar-chave" /></span> : '—']);
    linhas.push(['Favorecido', p.titular ?? '—']);
    linhas.push(['CPF/CNPJ', <span>{documentoComMascara(p.docPagamento)} · <Confere c={conferirFavorecido(p.docPagamento, p, linha.nf)} /></span>]);
  } else if (forma.sigla === 'TED') {
    linhas.push(['Forma', 'Transferência (TED)']);
    linhas.push(['Banco', p.banco ?? '—']);
    linhas.push(['Agência · conta', p.agencia || p.conta ? `${p.agencia ?? '—'} · ${p.conta ?? '—'}` : '—']);
    linhas.push(['Titular', p.titular ?? '—']);
    linhas.push(['CPF/CNPJ', <span>{documentoComMascara(p.docPagamento)} · <Confere c={conferirFavorecido(p.docPagamento, p, linha.nf)} /></span>]);
  } else if (forma.sigla === 'DA') {
    linhas.push(['Forma', `Débito automático${linha.conta ? ` no ${linha.conta}` : ''}`]);
  } else {
    linhas.push(['Forma', forma.sigla === '—' ? 'sem forma de pagamento' : forma.nome]);
  }
  linhas.push(['Valor', <b className="tabular-nums text-destructive">{saida(linha.valor)}</b>]);
  linhas.push(['Conta de saída', linha.conta ?? '—']);
  const pronto = textoDoPronto(linha.pronto);
  return (
    <div className="h-full overflow-y-auto p-3 text-[11.5px]" data-testid="v3-aba-pagamento">
      <dl className="grid grid-cols-[104px_minmax(0,1fr)] gap-x-2 gap-y-1.5">
        {linhas.map(([k, v]) => (<div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>))}
      </dl>
      {!estaPronto(linha.pronto) && pronto !== '—' && (
        <p className="mt-3 text-[11px] font-semibold text-destructive" data-testid="v3-pagamento-falta">{pronto}</p>
      )}
    </div>
  );
}

export function PainelDaAprovacaoV3({ clienteId, linhas, indice, onIndice, nomes, parcelas, ultimosPagamentos, celular, onFechar, onDecidido }: {
  clienteId: string; linhas: readonly LinhaV3[]; indice: number | null; onIndice: (i: number) => void; nomes: ReadonlyMap<string, string>;
  parcelas: ReadonlyMap<string, ParcelaDoContrato>; ultimosPagamentos: ReadonlyMap<string, UltimoPagamento>; celular: boolean; onFechar: () => void; onDecidido: () => void;
}) {
  const linha = indice != null ? linhas[indice] ?? null : null;
  const docs = useLancamentoDocumentos(linha?.id ?? null, clienteId);
  const abasDoc = linhasDosDocumentos(docs.documentos.filter((d) => !d.cancelado));
  const [aba, setAba] = useState<number>(0);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [lendoDoc, setLendoDoc] = useState(false);
  const [itensDe, setItensDe] = useState<string | null>(null);
  const [comentario, setComentario] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [anteriores, setAnteriores] = useState<Anterior[] | null>(null);

  useEffect(() => { setAba(0); setComentario(''); setAviso(null); }, [linha?.id]);

  const naPagamento = aba >= abasDoc.length;
  const abrir = naPagamento ? null : oQueAbrir(abasDoc[aba]);
  const arquivo = abrir?.tipo === 'arquivo' ? abrir.doc : null;
  useEffect(() => {
    setBytes(null);
    if (!arquivo?.url) return;
    let vivo = true;
    setLendoDoc(true);
    void (async () => {
      try {
        const url = await docs.urlAssinada(arquivo.url ?? '', arquivo.origem);
        if (!url) return;
        const b = await (await fetch(url)).arrayBuffer();
        if (vivo) setBytes(b);
      } catch (e) { console.warn('[bpo-v3] documento:', e); } finally { if (vivo) setLendoDoc(false); }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o documento escolhido decide; a função do hook é estável por lançamento
  }, [arquivo?.id]);

  useEffect(() => {
    setAnteriores(null);
    if (!linha?.favorecidoId) return;
    let vivo = true;
    void (async () => {
      const { data } = await (supabase as any).from('financeiro_lancamentos_v2').select('id, data_pagamento, valor')
        .eq('cliente_id', clienteId).eq('favorecido_id', linha.favorecidoId).in('status_transacao', ['realizado', 'conciliado']).eq('cancelado', false)
        .neq('id', linha.id).order('data_pagamento', { ascending: false }).limit(3);
      if (!vivo) return;
      const lidos: Anterior[] = [];
      for (const x of Array.isArray(data) ? data : []) {
        if (x && typeof x.id === 'string' && typeof x.data_pagamento === 'string') lidos.push({ id: x.id, data: x.data_pagamento, valor: Math.abs(Number(x.valor) || 0) });
      }
      setAnteriores(lidos);
    })();
    return () => { vivo = false; };
  }, [linha?.id, linha?.favorecidoId, clienteId]);

  if (!linha) return null;
  const pode = linha.possoDecidir;
  const decidir = async (aprovar: boolean) => {
    const motivo = comentario.trim() || null;
    if (!aprovar && (motivo?.length ?? 0) < 3) { setAviso('Escreva o motivo para recusar.'); return; }
    setOcupado(true); setAviso(null);
    try {
      const previa = await decidirAprovacao({ clienteId, ids: [linha.id], aprovar, motivo, simular: true });
      if (previa.ok === false) { setAviso(previa.frase); return; }
      const r = await decidirAprovacao({ clienteId, ids: [linha.id], aprovar, motivo, simular: false });
      if (r.ok === false) { setAviso(r.frase); return; }
      onDecidido();
      if (indice != null && indice + 1 < linhas.length) onIndice(indice + 1); else onFechar();
    } finally { setOcupado(false); }
  };

  const parcela = parcelas.get(linha.id);
  const forma = siglaDaForma(linha.forma);
  const variacao = variacaoDoDa(linha, linha.favorecidoId ? ultimosPagamentos.get(linha.favorecidoId) : undefined);
  const pronto = textoDoPronto(linha.pronto);
  const confere = docs.confronto;
  const textoConfere = !confere || confere.docsAtivos === 0 ? 'sem documento anexado'
    : confere.confere ? '✓ valor = documentos' : `diferença de ${saida(confere.diferenca).slice(1)}`;
  const nfComChave = abasDoc.find((l) => l.principal.especie === 'nf' && !!(l.xml?.chaveAcesso ?? l.principal.chaveAcesso));
  const chaveItens = nfComChave ? (nfComChave.xml?.chaveAcesso ?? nfComChave.principal.chaveAcesso) : null;
  const n = indice ?? 0;
  const sel = (i: number) => (i === aba ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground');

  const abas = (
    <div className="flex h-[30px] shrink-0 items-center gap-1 overflow-x-auto px-2" data-testid="v3-abas-documento">
      {abasDoc.map((l, i) => (
        <button key={l.principal.id} type="button" onClick={() => setAba(i)} aria-pressed={i === aba}
          className={cn('h-[22px] shrink-0 whitespace-nowrap rounded-full border px-2.5 text-[11px]', sel(i))}>{rotuloDaAbaDoDocumento(l)}</button>
      ))}
      <button type="button" onClick={() => setAba(abasDoc.length)} aria-pressed={naPagamento} data-testid="v3-aba-pagamento-botao"
        className={cn('h-[22px] shrink-0 whitespace-nowrap rounded-full border px-2.5 text-[11px]', sel(abasDoc.length))}>Pagamento</button>
    </div>
  );
  const documento = naPagamento ? <AbaPagamentoV3 linha={linha} />
    : arquivo && bytes && formatoPdf(arquivo.tipo, arquivo.nome)
      ? <VisualizadorDeDocumento embutido open bytes={bytes} nome={arquivo.nome} onFechar={() => {}} onNovaAba={() => {}} />
      : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-[11px] text-muted-foreground">
          {abrir?.tipo === 'itens' && abrir.doc.chaveAcesso
            ? <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setItensDe(abrir.doc.chaveAcesso)}>Ver os itens da nota</Button>
            : lendoDoc ? 'Abrindo o documento…' : arquivo ? 'Documento sem visualização aqui (não é PDF).' : 'Sem arquivo.'}
        </div>
      );
  const decisao = (
    <>
      <Textarea value={comentario} onChange={(e) => { setComentario(e.target.value); setAviso(null); }} disabled={ocupado || !pode}
        placeholder="Comentário (obrigatório para recusar)" className="h-[52px] min-h-0 shrink-0 resize-none text-[11.5px]" data-testid="v3-comentario" />
      <p className="min-h-[15px] shrink-0 break-words text-[11px] leading-[15px] text-destructive" data-testid="v3-painel-aviso">{aviso ?? (pode ? '' : motivoSemDecidir(linha))}</p>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 flex-1 text-[12px] text-destructive" disabled={ocupado || !pode} onClick={() => void decidir(false)} data-testid="v3-recusar">Recusar</Button>
        <Button size="sm" className="h-8 flex-1 bg-emerald-700 text-[12px] text-white hover:bg-emerald-800" disabled={ocupado || !pode} onClick={() => void decidir(true)} data-testid="v3-aprovar">Aprovar</Button>
      </div>
    </>
  );
  const ultimos = (
    <div className="shrink-0" data-testid="v3-ultimos">
      <div className="mb-0.5 text-[10.5px] font-semibold text-muted-foreground">Últimos pagamentos a este fornecedor</div>
      {anteriores === null ? <div className="h-[16px]" />
        : anteriores.length === 0 ? <div className="text-[10.5px] text-muted-foreground">nenhum pago antes</div>
          : (
            <table className="w-full table-fixed text-[10.5px]">
              <colgroup><col style={{ width: 78 }} /><col /><col style={{ width: 86 }} /></colgroup>
              <tbody>
                {anteriores.map((x) => {
                  const p = parcelas.get(x.id);
                  return (
                    <tr key={x.id} className="h-[17px]">
                      <td className="tabular-nums text-muted-foreground">{ddmmaaaa(x.data)}</td>
                      <td className="text-muted-foreground">{p ? `parcela ${p.numero}/${p.total}` : ''}</td>
                      <td className="text-right font-semibold tabular-nums text-destructive">{saida(x.valor)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
    </div>
  );
  const ficha = (
    <dl className="grid shrink-0 grid-cols-[80px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[11.5px]">
      <dt className="text-muted-foreground">Vencimento</dt>
      <dd className="tabular-nums">{linha.vencimento ? `${ddmmaaaa(linha.vencimento)} · ${diaDaSemana(linha.vencimento)}` : '—'}</dd>
      <dt className="text-muted-foreground">Itens</dt>
      <dd>{chaveItens ? <button type="button" className="text-primary hover:underline" onClick={() => setItensDe(chaveItens)} data-testid="v3-ver-itens">da NF · ver ⓘ</button> : '—'}</dd>
      <dt className="text-muted-foreground">Classificação</dt><dd className="break-words">{linha.subcentro ?? '—'}</dd>
      <dt className="text-muted-foreground">Forma</dt>
      <dd className="break-words">{forma.sigla === '—' ? '—' : forma.nome}{linha.conta ? ` · ${linha.conta}` : ''}
        {linha.daPelaRegra && <span className="font-semibold text-violet-700"> · aprovado · DA</span>}
        {variacao && <span className="font-semibold text-amber-700" title={variacao.titulo} data-testid="v3-painel-variacao"> · {variacao.selo} · {variacao.texto}</span>}</dd>
      <dt className="text-muted-foreground">NF</dt>
      <dd className="break-words">{linha.nf ? `NF ${numeroDaNf(linha.nf)}` : '—'} · <span className={estaPronto(linha.pronto) ? 'font-semibold text-emerald-700' : 'font-semibold text-destructive'}>{pronto}</span></dd>
      <dt className="text-muted-foreground">Confere</dt>
      <dd className={cn('break-words', confere?.confere ? 'font-semibold text-emerald-700' : 'text-amber-700')} data-testid="v3-confere">{textoConfere}</dd>
      <dt className="text-muted-foreground">Lançado</dt>
      <dd className="break-words">{lancadoPorTexto(linha.lancadoPor ? nomes.get(linha.lancadoPor) ?? null : null, linha.lancadoEm)}</dd>
      {linha.motivo && (<><dt className="text-muted-foreground">Motivo</dt><dd className="break-words">{linha.motivo}</dd></>)}
    </dl>
  );
  const nav = (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" className="h-6 w-6 rounded border text-[13px] disabled:opacity-40" disabled={n <= 0} onClick={() => onIndice(n - 1)} aria-label="Anterior" data-testid="v3-anterior">‹</button>
      <span className="w-[58px] text-center text-[10.5px] tabular-nums">{n + 1} de {linhas.length}</span>
      <button type="button" className="h-6 w-6 rounded border text-[13px] disabled:opacity-40" disabled={n + 1 >= linhas.length} onClick={() => onIndice(n + 1)} aria-label="Próximo" data-testid="v3-proximo">›</button>
    </div>
  );

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !ocupado) onFechar(); }}>
      <DialogContent data-testid="v3-painel"
        className={cn('flex flex-col gap-0 overflow-hidden p-0', celular ? 'h-[100dvh] max-h-[100dvh] w-screen max-w-none rounded-none' : 'h-[min(560px,92vh)] max-w-[900px]')}>
        <div className="flex h-[40px] shrink-0 items-center gap-2 bg-primary px-3 pr-10 text-primary-foreground">
          <DialogTitle className="min-w-0 flex-1 break-words text-[13px]">{linha.fornecedor}</DialogTitle>
          <DialogDescription className="sr-only">decidir este pagamento</DialogDescription>
          <div className="rounded bg-white/95 text-foreground">{nav}</div>
        </div>
        {celular ? (
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2">
            <div className="shrink-0">
              <div className="text-[20px] font-bold tabular-nums text-destructive" data-testid="v3-painel-valor">{saida(linha.valor)}</div>
              <div className="break-words text-[11px] text-muted-foreground">
                {ddmm(linha.vencimento)} · {forma.sigla}{linha.nf ? ` · NF ${numeroDaNf(linha.nf)}` : ''} · {pronto}{linha.conta ? ` · ${linha.conta}` : ''}
              </div>
            </div>
            {abas}
            <div className="min-h-[200px] flex-1 overflow-hidden rounded border bg-muted/40">{documento}</div>
            {ultimos}
            {decisao}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-h-0 min-w-0 flex-col border-r bg-muted/40" data-testid="v3-painel-documento">
              {abas}
              <div className="min-h-0 flex-1">{documento}</div>
            </div>
            <div className="flex min-h-0 flex-col gap-2 overflow-hidden p-3">
              <div className="shrink-0">
                <div className="text-[22px] font-bold leading-[26px] tabular-nums text-destructive" data-testid="v3-painel-valor">{saida(linha.valor)}</div>
                <div className="break-words text-[12.5px] font-semibold">{linha.fornecedor}</div>
                <div className="flex min-w-0 items-center text-[11px] text-muted-foreground">
                  <span className="min-w-0 break-words">{linha.descricao || '—'}</span>
                  {parcela && <span className="ml-1 shrink-0 rounded border px-1 text-[8.5px] font-bold leading-[12px]">{parcela.numero}/{parcela.total}</span>}
                </div>
              </div>
              {ficha}
              {ultimos}
              <div className="flex-1" />
              {decisao}
            </div>
          </div>
        )}
        {itensDe && <ItensDaNotaDialog clienteId={clienteId} chave={itensDe} onClose={() => setItensDe(null)} />}
      </DialogContent>
    </Dialog>
  );
}

