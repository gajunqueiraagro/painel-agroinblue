/**
 * BPO-FUNCIONAR-01 (mock aprovado, tela 2) — clicar na linha "Para aprovar" abre o LANÇAMENTO COM O DOCUMENTO AO LADO, para decidir sem sair:
 *   · à esquerda, a NF / o boleto do lançamento (o MESMO `VisualizadorDeDocumento`, embutido; abas por documento);
 *   · à direita, o valor grande, vencimento, o que é (subcentro · fazenda), a forma, "Confere" (o confronto do banco: `useLancamentoDocumentos`),
 *     quem lançou, as últimas compras do mesmo fornecedor e o comentário (obrigatório para recusar);
 *   · ‹ › passa ao próximo sem fechar; Aprovar / Recusar pelo `fn_aprovacao_decidir` (prévia antes, o banco confere de novo).
 * O aprovador NÃO edita valor, fornecedor nem forma aqui: aprova, recusa ou comenta. ALTURA FIXA; erro fica no painel (UX-TOAST-01).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { VisualizadorDeDocumento } from '@/components/financeiro-v2/VisualizadorDeDocumento';
import { useLancamentoDocumentos } from '@/hooks/useLancamentoDocumentos';
import { decidirAprovacao } from '@/hooks/useAprovacaoDaCpr';
import { formatMoeda } from '@/lib/calculos/formatters';
import { lancadoPorTexto, type AprovacaoDaLinha } from '@/lib/financeiro/aprovacaoNaCpr';
import { cn } from '@/lib/utils';

export interface LinhaDaDecisao {
  id: string; vencimento: string | null; descricao: string; fornecedor: string; favorecidoId: string | null;
  subcentro: string; fazenda: string; valor: number;
}

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export function vencimentoComDia(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} · ${SEMANA[d.getDay()]}`;
}

const ROTULO_ESPECIE: Record<string, string> = { nf: 'NF', boleto: 'Boleto', recibo: 'Recibo', comprovante: 'Comprovante', outro: 'Doc.' };

export function PainelDeDecisao({ clienteId, linhas, indice, onIndice, estados, nomes, onFechar, onDecidido }: {
  clienteId: string; linhas: readonly LinhaDaDecisao[]; indice: number | null; onIndice: (i: number) => void;
  estados: ReadonlyMap<string, AprovacaoDaLinha>; nomes: ReadonlyMap<string, string>; onFechar: () => void; onDecidido: () => void;
}) {
  const linha = indice != null ? linhas[indice] ?? null : null;
  const a = linha ? estados.get(linha.id) : undefined;
  const docs = useLancamentoDocumentos(linha?.id ?? null, clienteId);
  const vivos = docs.documentos.filter((d) => !d.cancelado && d.url);
  const [docSel, setDocSel] = useState(0);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [lendoDoc, setLendoDoc] = useState(false);
  const [comentario, setComentario] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [anteriores, setAnteriores] = useState<{ data: string; valor: number }[] | null>(null);

  useEffect(() => { setDocSel(0); setComentario(''); setAviso(null); }, [linha?.id]);

  const doc = vivos[docSel] ?? null;
  useEffect(() => {
    setBytes(null);
    if (!doc?.url) return;
    let vivo = true;
    setLendoDoc(true);
    void (async () => {
      try {
        const url = await docs.urlAssinada(doc.url ?? '', doc.origem);
        if (!url) return;
        const r = await fetch(url);
        const b = await r.arrayBuffer();
        if (vivo) setBytes(b);
      } catch (e) { console.warn('[bpo] documento:', e); } finally { if (vivo) setLendoDoc(false); }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o documento escolhido decide; a função do hook é estável por lançamento
  }, [doc?.id]);

  useEffect(() => {
    setAnteriores(null);
    if (!linha?.favorecidoId) return;
    let vivo = true;
    void (async () => {
      const { data } = await (supabase as any).from('financeiro_lancamentos_v2').select('data_pagamento, valor')
        .eq('cliente_id', clienteId).eq('favorecido_id', linha.favorecidoId).eq('status_transacao', 'realizado').eq('cancelado', false)
        .neq('id', linha.id).order('data_pagamento', { ascending: false }).limit(2);
      if (vivo) setAnteriores((Array.isArray(data) ? data : []).filter((x: { data_pagamento: string | null }) => !!x.data_pagamento)
        .map((x: { data_pagamento: string; valor: number }) => ({ data: x.data_pagamento, valor: Math.abs(Number(x.valor)) })));
    })();
    return () => { vivo = false; };
  }, [linha?.id, linha?.favorecidoId, clienteId]);

  const decidir = async (aprovar: boolean) => {
    if (!linha) return;
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

  const confere = docs.confronto;
  const textoConfere = !confere || confere.docsAtivos === 0 ? 'sem documento anexado'
    : confere.confere ? 'valor dos documentos = lançamento' : `diferença de ${formatMoeda(Math.abs(confere.diferenca))}`;
  const pode = a?.possoDecidir === true;

  return (
    <Dialog open={linha !== null} onOpenChange={(v) => { if (!v && !ocupado) onFechar(); }}>
      <DialogContent className="flex h-[min(560px,92vh)] max-w-[860px] flex-col gap-0 overflow-hidden p-0" data-testid="bpo-painel-decisao">
        <DialogHeader className="flex h-[40px] shrink-0 flex-row items-center gap-2 space-y-0 bg-primary px-4 text-primary-foreground">
          <DialogTitle className="shrink-0 text-[13.5px]">{linha?.fornecedor ?? ''}</DialogTitle>
          <DialogDescription className="shrink-0 text-[11.5px] text-primary-foreground/70">decidir este pagamento</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_330px]">
          <div className="flex min-h-[220px] min-w-0 flex-col border-b bg-muted/40 sm:border-b-0 sm:border-r" data-testid="bpo-painel-documento">
            <div className="flex h-[30px] shrink-0 items-center gap-1 px-2">
              {vivos.length === 0 ? <span className="text-[11px] text-muted-foreground">sem NF nem boleto anexado</span>
                : vivos.map((d, i) => (
                  <button key={d.id} type="button" onClick={() => setDocSel(i)} aria-pressed={i === docSel}
                    className={cn('h-[22px] shrink-0 rounded-full border px-2 text-[11px]', i === docSel ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                    {ROTULO_ESPECIE[d.especie] ?? 'Doc.'}{d.numero ? ` ${d.numero}` : ''}
                  </button>
                ))}
            </div>
            <div className="min-h-0 flex-1">
              {doc && bytes && (doc.tipo ?? '').includes('pdf')
                ? <VisualizadorDeDocumento embutido open bytes={bytes} nome={doc.nome} onFechar={() => {}} onNovaAba={() => {}} />
                : <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
                    {lendoDoc ? 'Abrindo o documento…' : doc ? 'Documento sem visualização aqui (não é PDF).' : '—'}
                  </div>}
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-2 overflow-hidden p-3 text-[12px]">
            <div className="text-[22px] font-bold tabular-nums text-destructive" data-testid="bpo-painel-valor">−{formatMoeda(linha?.valor ?? 0)}</div>
            <dl className="grid grid-cols-[86px_minmax(0,1fr)] gap-x-2 gap-y-1">
              <dt className="text-muted-foreground">Descrição</dt><dd className="break-words">{linha?.descricao || '—'}</dd>
              <dt className="text-muted-foreground">Vencimento</dt><dd className="tabular-nums">{vencimentoComDia(linha?.vencimento ?? null)}</dd>
              <dt className="text-muted-foreground">O que é</dt><dd className="break-words">{[linha?.subcentro, linha?.fazenda].filter(Boolean).join(' · ') || '—'}</dd>
              <dt className="text-muted-foreground">Forma</dt><dd className="break-words">{a?.forma ?? '—'}{a?.prontoPagar ? ` · ${a.prontoPagar}` : ''}</dd>
              <dt className="text-muted-foreground">Confere</dt>
              <dd className={cn('break-words', confere?.confere ? 'font-semibold text-emerald-700' : 'text-amber-700')} data-testid="bpo-painel-confere">
                {confere?.confere ? '✓ ' : ''}{textoConfere}
              </dd>
              <dt className="text-muted-foreground">Lançado por</dt>
              <dd>{lancadoPorTexto(a?.lancadoPor ? nomes.get(a.lancadoPor) ?? null : null, a?.lancadoEm ?? null)}</dd>
            </dl>
            <div className="text-[11px] text-muted-foreground" data-testid="bpo-painel-anteriores">
              {anteriores === null ? ' ' : anteriores.length === 0 ? 'Sem compras anteriores pagas deste fornecedor.'
                : `Compras anteriores: ${anteriores.map((x) => `${x.data.slice(8, 10)}/${x.data.slice(5, 7)} ${formatMoeda(x.valor)}`).join(' · ')}`}
            </div>
            <Textarea value={comentario} onChange={(e) => { setComentario(e.target.value); setAviso(null); }} disabled={ocupado || !pode}
              placeholder="Comentário (obrigatório para recusar)" className="h-[56px] min-h-[56px] resize-none text-[11.5px]" data-testid="bpo-painel-comentario" />
            <p className="min-h-[16px] text-[11px] text-destructive" data-testid="bpo-painel-aviso">
              {aviso ?? (pode ? '' : a?.estado === 'aguardando' ? 'Quem lançou não aprova; só o aprovador decide.' : '')}
            </p>
          </div>
        </div>
        <div className="flex h-[48px] shrink-0 items-center gap-2 border-t px-4">
          <span className="mr-auto flex items-center gap-1 text-[11.5px] tabular-nums text-muted-foreground">
            {indice != null ? `${indice + 1} de ${linhas.length}` : ''}
            <Button size="sm" variant="ghost" className="h-6 px-2" disabled={ocupado || indice == null || indice === 0}
              onClick={() => indice != null && onIndice(indice - 1)} aria-label="Anterior" data-testid="bpo-painel-anterior">‹</Button>
            <Button size="sm" variant="ghost" className="h-6 px-2" disabled={ocupado || indice == null || indice + 1 >= linhas.length}
              onClick={() => indice != null && onIndice(indice + 1)} aria-label="Próximo" data-testid="bpo-painel-proximo">›</Button>
          </span>
          <Button size="sm" variant="outline" className="h-8 text-destructive" disabled={ocupado || !pode} onClick={() => void decidir(false)} data-testid="bpo-painel-recusar">Recusar</Button>
          <Button size="sm" className="h-8 bg-emerald-700 text-white hover:bg-emerald-800" disabled={ocupado || !pode} onClick={() => void decidir(true)} data-testid="bpo-painel-aprovar">Aprovar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
