/**
 * CONC-SUGESTOES-V2 — ajuste (1) do Gabriel 26/11 07:45: o MINI-MODAL de uma sugestão, SÓ LEITURA.
 * Lançamento: descrição inteira, fornecedor, plano, conta, NF. Parcela: contrato, credor, nº da cédula, k/N, vencimento, principal/juros
 * previstos e o saldo devedor (o do dono). Botões: Casar · Fechar. Nada se edita aqui (editar é no lançamento / no contrato).
 * Régua (UI-FONTES-REGUA-01): título 12px, rótulos 10px, valores 11px, botões 26px.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { fmtBRL } from '@/components/conciliacao/TabelaExtratoDoMes';
import { dataBR } from '@/lib/datas/dataBR';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { lerDetalheDoLancamento, lerSaldoDevedor, type ContratoDaParcela, type DetalheDoLancamento } from '@/lib/conciliacao/detalheDaSugestao';

export type AlvoDoDetalhe =
  | { tipo: 'lancamento'; id: string; titulo: string }
  | { tipo: 'parcela'; rotulo: string; valor: number; contrato: ContratoDaParcela | null; prazo: string | null; conta: string | null };

const Linha = ({ rotulo, children, testid }: { rotulo: string; children: React.ReactNode; testid?: string }) => (
  <div className="grid grid-cols-[132px_minmax(0,1fr)] items-baseline gap-2 py-[3px]" data-testid={testid}>
    <span className="text-[10px] text-muted-foreground">{rotulo}</span>
    <span className="min-w-0 break-words text-[11px] tabular-nums">{children ?? '—'}</span>
  </div>
);

export function DetalheDaSugestao({ alvo, clienteId, onCasar, onFechar }: {
  alvo: AlvoDoDetalhe | null; clienteId: string | null | undefined; onCasar?: () => void; onFechar: () => void;
}) {
  const [lanc, setLanc] = useState<DetalheDoLancamento | null | 'lendo'>('lendo');
  const [saldo, setSaldo] = useState<number | null | 'lendo'>('lendo');
  const idDoLancamento = alvo?.tipo === 'lancamento' ? alvo.id : null;
  const idDoContrato = alvo?.tipo === 'parcela' ? alvo.contrato?.financiamentoId ?? null : null;
  useEffect(() => {
    let vivo = true;
    setLanc('lendo');
    if (!idDoLancamento || !clienteId) return;
    void lerDetalheDoLancamento(clienteId, idDoLancamento).then((d) => { if (vivo) setLanc(d); });
    return () => { vivo = false; };
  }, [idDoLancamento, clienteId]);
  useEffect(() => {
    let vivo = true;
    setSaldo('lendo');
    if (!idDoContrato) { setSaldo(null); return; }
    void lerSaldoDevedor(idDoContrato, hojeLocal()).then((s) => { if (vivo) setSaldo(s); });
    return () => { vivo = false; };
  }, [idDoContrato]);

  const titulo = alvo?.tipo === 'lancamento' ? alvo.titulo : alvo?.rotulo ?? '';
  return (
    <Dialog open={!!alvo} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="flex w-[min(520px,95vw)] max-w-none flex-col gap-0 p-0 [&>button.absolute]:hidden" aria-describedby={undefined}
        data-testid="detalhe-sugestao">
        <div className="flex h-7 shrink-0 items-center bg-primary px-3 text-primary-foreground">
          <DialogTitle className="min-w-0 truncate text-[12px] font-medium" title={titulo}>{titulo}</DialogTitle>
        </div>
        <div className="px-3 py-2">
          {alvo?.tipo === 'lancamento' && (lanc === 'lendo'
            ? <p className="text-[11px] italic text-muted-foreground">lendo…</p>
            : lanc === null
              ? <p className="text-[11px] text-amber-700" data-testid="detalhe-falhou">Não consegui ler o lançamento.</p>
              : (<>
                <Linha rotulo="Descrição" testid="detalhe-descricao">{lanc.descricao}</Linha>
                <Linha rotulo="Fornecedor">{lanc.fornecedor}</Linha>
                <Linha rotulo="Plano de contas">{lanc.plano}</Linha>
                <Linha rotulo="Conta">{lanc.conta}</Linha>
                <Linha rotulo="NF / documento">{lanc.documento}</Linha>
                <Linha rotulo="Vencimento">{lanc.vencimento ? dataBR(lanc.vencimento) : null}</Linha>
                <Linha rotulo="Valor">{lanc.valor == null ? null : fmtBRL(lanc.valor)}</Linha>
              </>))}
          {alvo?.tipo === 'parcela' && (<>
            <Linha rotulo="Contrato" testid="detalhe-contrato">{alvo.contrato?.contrato}</Linha>
            <Linha rotulo="Credor">{alvo.contrato?.credor}</Linha>
            <Linha rotulo="Nº da cédula" testid="detalhe-cedula">{alvo.contrato?.numeroContrato}</Linha>
            <Linha rotulo="Parcela">{alvo.contrato?.numero != null ? `${alvo.contrato.numero}/${alvo.contrato.total ?? '?'}` : null}</Linha>
            <Linha rotulo="Vencimento">{alvo.contrato?.vencimento ? dataBR(alvo.contrato.vencimento) : null}</Linha>
            <Linha rotulo="Prazo do pagamento">{alvo.prazo}</Linha>
            <Linha rotulo="Conta prevista">{alvo.conta}</Linha>
            <Linha rotulo="Principal previsto">{alvo.contrato?.principal == null ? null : fmtBRL(alvo.contrato.principal)}</Linha>
            <Linha rotulo="Juros previstos">{alvo.contrato?.juros == null ? null : fmtBRL(alvo.contrato.juros)}</Linha>
            <Linha rotulo="Total previsto">{fmtBRL(alvo.valor)}</Linha>
            <Linha rotulo="Saldo devedor" testid="detalhe-saldo">{saldo === 'lendo' ? 'lendo…' : saldo == null ? null : fmtBRL(saldo)}</Linha>
          </>)}
        </div>
        <div className="flex h-[40px] shrink-0 items-center justify-end gap-2 border-t px-3">
          <button type="button" onClick={onFechar} className="h-[26px] rounded border px-3 text-[11px] hover:bg-muted" data-testid="detalhe-fechar">Fechar</button>
          {onCasar && (
            <button type="button" onClick={onCasar} className="h-[26px] rounded bg-[#E7C873] px-3 text-[11px] font-medium hover:bg-[#D9B95F]"
              data-testid="detalhe-casar">Casar</button>)}
        </div>
      </DialogContent>
    </Dialog>
  );
}
