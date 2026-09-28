import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import { CATEGORIAS } from '@/types/cattle';
import { dataCurta, ROTULO_EXPLICACAO } from '@/lib/oc/contaCorrente';
import { rotuloDaConta } from '@/lib/financeiro/rotuloConta';
import type { OcContaCorrenteApi, RolCancelamento } from '@/hooks/useOcContaCorrente';

/* OC-VENDA-ENTREGAS-01c, decisao 2 — CANCELAR A VENDA EM CONTA CORRENTE LISTA TUDO ANTES DE CONFIRMAR. O rol e' o do banco
   (`oc_cancelar_rol`): entregas e explicacoes canceladas, recebimentos devolvidos a' conta ORIGINAL (a do evento
   `vincular_recebimento`), saidas adotadas desvinculadas, compromissos cancelados. Titulo nunca se apaga; o recebimento nao
   perde valor, data, conta bancaria nem conciliacao. Motivo obrigatorio, recusa ao lado do botao (UX-TOAST-01). */

const rotuloCategoria = (slug: string | null) => (slug ? (CATEGORIAS.find(c => c.value === slug)?.label ?? slug) : '—');
const rotuloExplicacao = (t: string) => Object.entries(ROTULO_EXPLICACAO).find(([k]) => k === t)?.[1] ?? t;

/* No nivel do modulo: declarado dentro do componente, cada render criaria um tipo novo e remontaria a lista
   (a licao do `NegociacaoOC`, OC-VENDA-ENTREGAS-01a). */
function Bloco({ titulo, n, children }: { titulo: string; n: number; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold">{titulo} <span className="font-normal text-muted-foreground">({n})</span></div>
      {n === 0 ? <div className="pl-2 text-[10px] text-muted-foreground">nenhum</div> : <ul className="pl-2 text-[10px]">{children}</ul>}
    </div>
  );
}

interface Props {
  api: OcContaCorrenteApi;
  onCancelar: (motivo: string) => Promise<string | null>;
  onFechar: () => void;
}

export function CancelarContaCorrenteDialog({ api, onCancelar, onFechar }: Props) {
  const [rol, setRol] = useState<RolCancelamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [tentou, setTentou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const { lerRolCancelamento } = api;

  useEffect(() => {
    let vivo = true;
    void lerRolCancelamento().then(r => { if (vivo) { setRol(r.rol); setErro(r.erro); } });
    return () => { vivo = false; };
  }, [lerRolCancelamento]);

  const faltaMotivo = tentou && !motivo.trim();
  const bloqueado = !!rol && rol.bloqueios.length > 0;
  const confirmar = async () => {
    setTentou(true);
    if (!motivo.trim() || !rol || bloqueado) return;
    setEnviando(true);
    const e = await onCancelar(motivo.trim());
    setEnviando(false);
    if (e) { setErro(e); return; }
    await api.recarregar();
    onFechar();
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-xl" data-testid="dialogo-cancelar-cc">
        <DialogHeader><DialogTitle className="text-[12px]">Cancelar a operação</DialogTitle></DialogHeader>
        {!rol && !erro && <div className="text-[10.5px] text-muted-foreground">Carregando o que será desfeito…</div>}
        {rol && (
          <div className="max-h-[50vh] space-y-1.5 overflow-auto">
            <Bloco titulo="Entregas canceladas (saem do DRE)" n={rol.entregas.length}>
              {rol.entregas.map((e, i) => <li key={i}>{dataCurta(e.data)} · lote {e.loteOrdem ?? '—'} · {formatMoeda(e.valor)}</li>)}
            </Bloco>
            <Bloco titulo="Explicações canceladas" n={rol.explicacoes.length}>
              {rol.explicacoes.map((e, i) => <li key={i}>{rotuloExplicacao(e.tipo)} · {rotuloDaConta(e.conta) ?? '—'} · {formatMoeda(e.valor)}</li>)}
            </Bloco>
            <Bloco titulo="Recebimentos que voltam à conta original" n={rol.recebimentos.length}>
              {rol.recebimentos.map((r, i) => (
                <li key={i}>{dataCurta(r.data)} · {formatMoeda(r.valor)} · {rotuloDaConta(r.contaAtual) ?? '—'} → <b>{rotuloDaConta(r.contaOriginal) ?? '—'}</b></li>
              ))}
            </Bloco>
            <Bloco titulo="Saídas adotadas desvinculadas (o gado continua no zootécnico)" n={rol.saidas.length}>
              {rol.saidas.map((s, i) => <li key={i}>{dataCurta(s.data)} · {s.cab} cab · {rotuloCategoria(s.categoria)}</li>)}
            </Bloco>
            {rol.compromissos.length > 0 && (
              <Bloco titulo="Compromissos cancelados" n={rol.compromissos.length}>
                {rol.compromissos.map((c, i) => <li key={i}>{c.componente} · {formatMoeda(c.valor)}</li>)}
              </Bloco>
            )}
            <div className="text-[10px] text-muted-foreground">Nenhum título é apagado; valor, datas, conta bancária e conciliação dos recebimentos não mudam.</div>
            {bloqueado && (
              <div className="rounded border border-destructive/40 p-1.5 text-[10px] text-destructive" role="alert">
                {rol.bloqueios.map((b, i) => <div key={i}>{b}</div>)}
              </div>
            )}
          </div>
        )}
        <div>
          <label className="text-[10px] font-medium" htmlFor="motivo-cancelar-cc">Motivo *</label>
          <Textarea id="motivo-cancelar-cc" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)}
            className={`text-[11px] ${faltaMotivo ? 'border-destructive' : ''}`} />
          {faltaMotivo && <div className="text-[10px] text-destructive">Informe o motivo.</div>}
        </div>
        <DialogFooter className="items-center">
          {erro && <span className="mr-auto text-[10px] text-destructive" role="alert">{erro}</span>}
          <Button type="button" variant="ghost" size="sm" className="h-[22px] px-[9px] text-[10px]" onClick={onFechar}>Voltar</Button>
          <Button type="button" variant="destructive" size="sm" className="h-[22px] px-[9px] text-[10px]"
            disabled={enviando || !rol || bloqueado} onClick={confirmar}>
            Cancelar operação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
