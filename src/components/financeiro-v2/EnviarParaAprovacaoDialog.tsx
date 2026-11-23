/**
 * BPO-APROVACAO-01 P2 (piloto Vera) — "Enviar para aprovação" dos lançamentos MARCADOS na lista: a prévia é a própria RPC com
 * `p_simular` (`fn_aprovacao_enviar`: quantos entram na fila, quantos nascem aprovados — D10, o aprovador que envia o próprio — e o que o
 * banco recusa, com o motivo de cada um) → "Enviar" grava. Nada se decide na tela: as regras (só saída não paga; já na fila; já aprovado)
 * são do banco. A recusa e o erro ficam ESCRITOS no diálogo (UX-TOAST-01), nunca em toast.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface Resultado { enviados: number; aprovadosPeloMesmo: number; recusas: { id: string; motivo: string }[] }

const ehRegistro = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** a resposta da `fn_aprovacao_enviar` → tipada (fora do contrato = zeros, nunca inventa) */
export function lerResultadoDoEnvio(d: unknown): Resultado {
  if (!ehRegistro(d)) return { enviados: 0, aprovadosPeloMesmo: 0, recusas: [] };
  const recusas = (Array.isArray(d.recusados) ? d.recusados : []).flatMap((r) =>
    ehRegistro(r) && typeof r.id === 'string' ? [{ id: r.id, motivo: typeof r.motivo === 'string' ? r.motivo : 'recusado' }] : []);
  return { enviados: Number(d.enviados) || 0, aprovadosPeloMesmo: Number(d.aprovados_pelo_mesmo) || 0, recusas };
}

/** "3 vão para a fila · 1 nasce aprovado (você aprova) · 2 ficam de fora: já pago, já na fila" */
export function fraseDoEnvio(r: Resultado): string {
  const partes: string[] = [];
  if (r.enviados) partes.push(`${r.enviados} ${r.enviados === 1 ? 'vai' : 'vão'} para a fila`);
  if (r.aprovadosPeloMesmo) partes.push(`${r.aprovadosPeloMesmo} ${r.aprovadosPeloMesmo === 1 ? 'nasce aprovado' : 'nascem aprovados'} (você aprova)`);
  if (r.recusas.length) {
    const motivos = [...new Set(r.recusas.map((x) => x.motivo))].join(', ');
    partes.push(`${r.recusas.length} ${r.recusas.length === 1 ? 'fica' : 'ficam'} de fora: ${motivos}`);
  }
  return partes.length ? partes.join(' · ') : 'Nada a enviar.';
}

export function EnviarParaAprovacaoDialog({ aberto, onFechar, clienteId, ids, onEnviou }: {
  aberto: boolean; onFechar: () => void; clienteId: string; ids: string[]; onEnviou: (frase: string) => void;
}) {
  const [previa, setPrevia] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const chamar = async (simular: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: a RPC da 118160 não está no types.ts
    const { data, error } = await (supabase as any).rpc('fn_aprovacao_enviar', { p_cliente: clienteId, p_ids: ids, p_simular: simular });
    if (error) return { erro: typeof error.message === 'string' && error.message.startsWith('BPO: ') ? error.message.slice(5) : 'Não consegui enviar agora. Nada foi gravado; tente de novo.' };
    return { r: lerResultadoDoEnvio(data) };
  };

  useEffect(() => {
    if (!aberto) return;
    setPrevia(null); setErro(null);
    let vivo = true;
    void chamar(true).then((x) => { if (!vivo) return; if ('erro' in x) setErro(x.erro ?? null); else setPrevia(x.r); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, clienteId, ids.join(',')]);

  const enviar = async () => {
    setOcupado(true); setErro(null);
    try {
      const x = await chamar(false);
      if ('erro' in x) { setErro(x.erro ?? null); return; }
      onEnviou(`Enviado para aprovação: ${fraseDoEnvio(x.r)}`);
      onFechar();
    } catch { setErro('Não consegui enviar agora. Nada foi gravado; tente de novo.'); } finally { setOcupado(false); }
  };

  const nadaAEnviar = !!previa && previa.enviados + previa.aprovadosPeloMesmo === 0;
  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-[520px] gap-3" data-testid="enviar-aprovacao">
        <DialogTitle className="text-[14px]">Enviar para aprovação</DialogTitle>
        <p className="text-[12px] text-muted-foreground">{ids.length} {ids.length === 1 ? 'lançamento marcado' : 'lançamentos marcados'}. Só saídas ainda não pagas entram na fila.</p>
        <div className="min-h-[36px] rounded-md border bg-muted/40 px-3 py-2 text-[12px]" data-testid="enviar-aprovacao-previa">
          {erro ? <span className="text-destructive">{erro}</span> : previa ? fraseDoEnvio(previa) : 'Conferindo com o banco…'}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" className="h-8 w-[92px]" onClick={onFechar}>Cancelar</Button>
          <Button size="sm" className="h-8 w-[92px]" disabled={!previa || nadaAEnviar || ocupado} onClick={() => void enviar()} data-testid="enviar-aprovacao-confirmar">
            {ocupado ? 'Enviando…' : 'Enviar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
