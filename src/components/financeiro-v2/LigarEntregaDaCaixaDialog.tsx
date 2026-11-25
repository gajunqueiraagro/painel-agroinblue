/**
 * NOTA-ENTREGA-FUTURA-01 (B) — "+ Ligar entrega da Caixa" (mock aprovado pelo Gabriel 25/11 07:44). As remessas de entrega futura do mesmo
 * emitente que estão na caixa da Receita e ainda não estão em documento nenhum (`remessasNaCaixa`): a que cita esta compra vem marcada; sem
 * referência, o operador confirma. "Ligar" = o gravador de sempre (`ligarRemessasACompra`): cada remessa entra como documento (XML + DANFE)
 * nos lançamentos da compra, sem lançamento novo e sem mudar valor. Régua nova de tela nova: tabela 11px, datas 10px, título 13px, botões 11px/26px.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { reais } from '@/lib/financeiro/nfe/formatos';
import { lancamentosDaCompra, remessasNaCaixa, type RemessaNaCaixa } from '@/lib/fiscal/entregasDaCaixa';
import { ligarRemessasACompra, type ResultadoDoLigar } from '@/lib/fiscal/ligarACompra';
import type { Consulta } from '@/lib/financeiro/nfeConsultas';

const TH = 'h-[24px] px-1.5 py-0 text-left text-[10px] font-medium text-primary-foreground whitespace-nowrap';
const TD = 'h-[24px] px-1.5 py-0 text-[11px] leading-none';
const dataBr = (x: string | null) => (x && /^\d{4}-\d{2}-\d{2}/.test(x) ? `${x.slice(8, 10)}/${x.slice(5, 7)}/${x.slice(0, 4)}` : '—');
const nfFalada = (n: string) => n.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function LigarEntregaDaCaixaDialog({ clienteId, lancamentoId, compra, emitenteDocumento, emitenteNome, aoFechar, aoLigar,
  carregar = remessasNaCaixa, ligar = ligarRemessasACompra, idsDaCompra = lancamentosDaCompra }: {
  clienteId: string;
  lancamentoId: string;
  /** a NF da compra deste lançamento (o documento e a chave); sem ela, as remessas sem referência ainda podem ser ligadas */
  compra: { documentoId: string; chave: string; nf: string } | null;
  emitenteDocumento: string;
  emitenteNome: string;
  aoFechar: () => void;
  /** ligou ao menos uma: o dono relê os documentos e as entregas */
  aoLigar: () => void;
  carregar?: typeof remessasNaCaixa;
  ligar?: typeof ligarRemessasACompra;
  idsDaCompra?: typeof lancamentosDaCompra;
}) {
  const [lista, setLista] = useState<Consulta<RemessaNaCaixa[]> | null>(null);
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set());
  const [gravando, setGravando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDoLigar | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setLista(null);
    void carregar(clienteId, emitenteDocumento, compra?.chave ?? null).then((r) => {
      if (!vivo) return;
      setLista(r);
      if (r.ok) setMarcadas(new Set(r.valor.filter((x) => x.citaACompra).map((x) => x.chave)));
    });
    return () => { vivo = false; };
  }, [carregar, clienteId, emitenteDocumento, compra?.chave, tentativa]);

  const remessas = lista?.ok ? lista.valor : [];
  const escolhidas = remessas.filter((r) => marcadas.has(r.chave));
  const alternar = (chave: string) => setMarcadas((m) => { const n = new Set(m); if (n.has(chave)) n.delete(chave); else n.add(chave); return n; });
  const gravar = async () => {
    setGravando(true);
    try {
      const ids = compra ? await idsDaCompra(clienteId, compra.documentoId, lancamentoId) : [lancamentoId];
      const r = await ligar(clienteId, escolhidas.map((x) => ({ numero: x.numero, chave: x.chave, xml: x.xml })), ids);
      setResultado(r);
      if (r.ligadas > 0) aoLigar();
    } finally { setGravando(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !gravando) aoFechar(); }}>
      <DialogContent className="flex h-[min(520px,calc(100vh-24px))] w-[min(760px,calc(100vw-24px))] max-w-none flex-col gap-2 p-4" data-testid="ligar-entrega-caixa">
        <DialogTitle className="text-[13px] font-semibold">Ligar entrega da Caixa · {emitenteNome || '—'}</DialogTitle>
        <DialogDescription className="text-[11px] text-muted-foreground">
          Remessas de entrega futura deste fornecedor que estão na Caixa e ainda não estão em nenhum lançamento.
          {compra ? ` A que cita a compra (NF ${nfFalada(compra.nf)}) vem marcada; as sem referência, confira.` : ' Sem a NF da compra aqui: confira cada uma.'}
          {' '}Ligar não cria lançamento nem muda valor.
        </DialogDescription>
        <div className="min-h-0 flex-1 overflow-auto rounded border" data-testid="ligar-entrega-rolagem">
          {lista === null ? (
            <p className="p-3 text-[11px] text-muted-foreground" data-testid="ligar-entrega-procurando">Procurando na Caixa…</p>
          ) : lista.ok === false ? (
            <div className="flex items-center gap-2 p-3 text-[11px] text-destructive" data-testid="ligar-entrega-falhou">
              Não consegui ler a Caixa agora.
              <Button type="button" size="sm" variant="outline" className="h-[26px] px-2.5 text-[11px]" onClick={() => setTentativa((t) => t + 1)}>Tentar de novo</Button>
            </div>
          ) : remessas.length === 0 ? (
            <p className="p-3 text-[11px] text-muted-foreground" data-testid="ligar-entrega-vazia">Nenhuma remessa deste fornecedor esperando na Caixa.</p>
          ) : (
            <table className="w-full table-fixed border-collapse">
              <colgroup><col style={{ width: 30 }} /><col style={{ width: 92 }} /><col style={{ width: 84 }} /><col style={{ width: 104 }} /><col /></colgroup>
              <thead className="sticky top-0 z-[1] bg-primary"><tr>
                <th className={TH} /><th className={TH}>NF</th><th className={TH}>Emissão</th><th className={cn(TH, 'text-right')}>Valor</th><th className={TH}>Referência</th>
              </tr></thead>
              <tbody>
                {remessas.map((r) => (
                  <tr key={r.chave} className="border-b border-border/50" data-testid="ligar-entrega-linha" data-cita={r.citaACompra ? '' : undefined}>
                    <td className={TD}><Checkbox checked={marcadas.has(r.chave)} onCheckedChange={() => alternar(r.chave)} aria-label={`Ligar a NF ${nfFalada(r.numero)}`} className="h-3.5 w-3.5" /></td>
                    <td className={cn(TD, 'tabular-nums font-medium')}>{nfFalada(r.numero)}</td>
                    <td className={cn(TD, 'text-[10px] tabular-nums')}>{dataBr(r.emissao)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{reais(r.valorCent)}</td>
                    <td className={cn(TD, 'truncate', r.citaACompra ? 'text-emerald-700' : 'text-amber-700')}
                      title={r.citaACompra ? 'A remessa cita esta compra (a referência dentro da nota)' : 'A remessa não cita nenhuma nota: confira se é desta compra'}>
                      {r.citaACompra ? 'cita esta compra' : 'sem referência · confira'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex h-[26px] shrink-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[11px]" data-testid="ligar-entrega-resultado"
            title={resultado?.falhas.map((f) => `NF ${f.numero}: ${f.frase}`).join(' · ') || undefined}>
            {resultado ? `${resultado.ligadas} ${resultado.ligadas === 1 ? 'entrega ligada' : 'entregas ligadas'}${resultado.falhas.length ? ` · ${resultado.falhas.length} não ligou (veja o motivo)` : ''}` : ''}
          </span>
          <Button type="button" size="sm" variant="outline" className="h-[26px] px-3 text-[11px]" disabled={gravando} onClick={aoFechar}>{resultado ? 'Fechar' : 'Cancelar'}</Button>
          <Button type="button" size="sm" className="h-[26px] w-[170px] px-3 text-[11px]" disabled={gravando || escolhidas.length === 0 || !!resultado}
            onClick={() => { void gravar(); }} data-testid="ligar-entrega-gravar">
            {gravando ? 'Ligando…' : `Ligar ${escolhidas.length} ${escolhidas.length === 1 ? 'entrega' : 'entregas'}`}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
