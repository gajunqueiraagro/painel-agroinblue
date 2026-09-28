import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import { CATEGORIAS } from '@/types/cattle';
import {
  cartoesDaContaCorrente, colunasDoSaldo, rotuloRecebimento, saldoFinalAExplicar, ROTULO_STATUS,
  type LinhaContaCorrente,
} from '@/lib/oc/contaCorrente';
import type { OcContaCorrenteApi, RecebimentoVinculavel } from '@/hooks/useOcContaCorrente';

/* OC-VENDA-ENTREGAS-01b — a aba Financeiro da venda no modelo CONTA CORRENTE (mock docs/mocks/oc_conta_corrente_mock_v4.html,
   ADR-2026-21). A entrega e' a receita (vai para o DRE); o recebimento e' o caixa (Adiantamento de Clientes, fora do DRE); o
   saldo do comprador e' o do banco (`oc_conta_corrente`) — esta tela nao soma nada.
   ⚠ D6: STATUS E' O QUE O DADO DIZ. O mock mostrava os recebimentos "Banco do Brasil · conciliado"; os quatro da 232c05aa nao tem
     conta bancaria nem conciliacao, e aparecem "sem conta bancária". Nada e' inventado para ficar parecido com o mock.
   ⚠ UMA INFORMACAO POR COLUNA, cabecalho centralizado, entrada verde, negativo vermelho, NADA TRUNCADO (27/09/2026).
   ⚠ RECUSA AO LADO DO BOTAO, nunca em toast (UX-TOAST-01). */

const fmtBr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const TH = 'px-1.5 py-1 text-center text-[10px] font-medium text-muted-foreground';
const TD = 'px-1.5 py-1 align-top text-[11px]';
const NUM = `${TD} text-right tabular-nums whitespace-nowrap`;
const VERDE = 'text-emerald-700 dark:text-emerald-400';
const VERMELHO = 'text-destructive';
const BOTAO = 'h-[22px] px-[9px] text-[10px] font-medium';

const rotuloCategoria = (slug: string | null) => (slug ? (CATEGORIAS.find(c => c.value === slug)?.label ?? slug) : '—');
const moedaOuTraco = (v: number | null) => (v === null ? '' : formatMoeda(v));

interface Props {
  api: OcContaCorrenteApi;
  somenteLeitura: boolean;
}

export function AbaContaCorrenteOC({ api, somenteLeitura }: Props) {
  const cc = api.contaCorrente;
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState(false);

  if (!cc) {
    return (
      <div className="py-10 text-center text-[11px] text-muted-foreground">
        {api.erro ? <span className={VERMELHO} role="alert">{api.erro}</span> : 'Carregando…'}
      </div>
    );
  }

  const cartoes = cartoesDaContaCorrente(cc);
  const final = saldoFinalAExplicar(cc);
  const totalColunas = colunasDoSaldo(cc.saldo);

  const atualizarEntregas = async () => {
    setErroAcao(null);
    const erro = await api.sincronizarEntregas();
    if (erro) setErroAcao(erro);
  };

  return (
    <div className="space-y-3 min-w-0" data-testid="conta-corrente-oc">
      <div className="grid grid-cols-4 gap-2">
        <Cartao rotulo="Entregue (vai para o DRE)" valor={cartoes.entregue} cor={VERDE} />
        <Cartao rotulo="Recebido (caixa)" valor={cartoes.recebido} cor={VERDE} />
        <Cartao rotulo="Ele deve" valor={cartoes.eleDeve} />
        <Cartao rotulo="Adiantado por ele" valor={cartoes.adiantado} />
      </div>

      {cc.saidasSemEntrega > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <span>{cc.saidasSemEntrega === 1 ? '1 saída ainda não virou entrega no financeiro.' : `${cc.saidasSemEntrega} saídas ainda não viraram entrega no financeiro.`}</span>
          <Button type="button" size="sm" className={BOTAO} disabled={somenteLeitura || api.ocupado} onClick={atualizarEntregas}>
            Atualizar entregas
          </Button>
        </div>
      )}

      <div>
        <div className="mb-1 text-[12px] font-medium">Conta corrente · em ordem de data</div>
        <table className="w-full border-collapse" data-testid="conta-corrente-tabela">
          <thead>
            <tr className="border-b">
              <th className={TH} colSpan={5}>Evento</th>
              <th className={TH} colSpan={2}>Movimento</th>
              <th className={TH} colSpan={2}>Saldo do comprador</th>
            </tr>
            <tr className="border-b">
              <th className={TH}>Data</th><th className={TH}>Lote</th><th className={TH}>Cab</th><th className={TH}>Evento</th>
              <th className={TH}>Descrição</th><th className={TH}>Entrega (DRE)</th><th className={TH}>Recebido (caixa)</th>
              <th className={TH}>Ele deve</th><th className={TH}>Adiantado por ele</th>
            </tr>
          </thead>
          <tbody>
            {cc.linhas.map(l => <LinhaCC key={l.lancamentoId} l={l} linhas={cc.linhas} />)}
            {cc.linhas.length === 0 && (
              <tr><td colSpan={9} className={`${TD} py-4 text-center text-muted-foreground`}>Nenhuma entrega nem recebimento ainda.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td className={TD}>Total</td><td className={TD} />
              <td className={`${NUM}`}>{cc.cabEntregue}</td><td className={TD} /><td className={TD} />
              <td className={`${NUM} ${VERDE}`}>{formatMoeda(cc.entregue)}</td>
              <td className={`${NUM} ${VERDE}`}>{formatMoeda(cc.recebido)}</td>
              <td className={NUM}>{moedaOuTraco(totalColunas.eleDeve)}</td>
              <td className={NUM}>{moedaOuTraco(totalColunas.adiantado)}</td>
            </tr>
          </tfoot>
        </table>
        {cc.programado > 0 && (
          <div className="mt-1 text-[10px] text-muted-foreground">Programado, fora do saldo até ser recebido: {formatMoeda(cc.programado)}</div>
        )}
      </div>

      {final && (
        <div>
          <div className="mb-1 text-[12px] font-medium">Saldo final a explicar</div>
          <table className="w-full border-collapse">
            <thead><tr className="border-b"><th className={TH}>Situação</th><th className={TH}>Valor</th><th className={TH} /></tr></thead>
            <tbody>
              <tr>
                <td className={TD}>{final.frase}</td>
                <td className={`${NUM} ${final.valor < 0 ? VERMELHO : VERDE}`}>{formatMoeda(final.valor)}</td>
                <td className={`${TD} text-right`}>
                  <span className="text-[10px] text-muted-foreground" title="A explicação da diferença chega no OC-VENDA-ENTREGAS-01c.">
                    Explicar diferença · chega no 01c
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div>
        <div className="mb-1 text-[12px] font-medium">Recebimentos · vincular ou lançar</div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className={BOTAO} disabled={somenteLeitura || api.ocupado}
            onClick={() => { setErroAcao(null); setVinculando(true); }}>
            + Vincular recebimento já lançado
          </Button>
          <Button type="button" variant="outline" size="sm" className={BOTAO} disabled
            title="Programar recebimento pela OC ainda não tem gravador; lance-o no Financeiro e vincule aqui.">
            + Programar recebimento
          </Button>
          <span className="text-[10px] text-muted-foreground">Programar: lance no Financeiro e vincule aqui (gravador próprio fica para depois).</span>
        </div>
      </div>

      {erroAcao && <div className={`text-[10px] ${VERMELHO}`} role="alert">{erroAcao}</div>}

      {vinculando && <DialogoVincularRecebimento api={api} onFechar={() => setVinculando(false)} />}
    </div>
  );
}

function Cartao({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div className="rounded-md border px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{rotulo}</div>
      <div className={`text-[20px] font-medium tabular-nums ${valor < 0 ? VERMELHO : (valor > 0 ? (cor ?? '') : '')}`}>{formatMoeda(valor)}</div>
    </div>
  );
}

function LinhaCC({ l, linhas }: { l: LinhaContaCorrente; linhas: readonly LinhaContaCorrente[] }) {
  const s = colunasDoSaldo(l.saldo);
  const ehEntrega = l.tipo === 'entrega';
  return (
    <tr className="border-b last:border-0" data-tipo={l.tipo}>
      <td className={`${TD} whitespace-nowrap`}>{fmtBr(l.data)}</td>
      <td className={`${TD} text-center`}>{l.loteOrdem ?? ''}</td>
      <td className={`${NUM}`}>{l.cab ?? ''}</td>
      <td className={TD}>{ehEntrega ? 'Entrega' : 'Recebimento'}</td>
      <td className={`${TD} break-words`}>
        {ehEntrega ? `Venda ${rotuloCategoria(l.categoria)}` : rotuloRecebimento(linhas, l.lancamentoId)}
        <div className="text-[10px] text-muted-foreground" data-status={l.status}>
          {ehEntrega ? l.conta : `${l.conta ?? ''} · ${ROTULO_STATUS[l.status]}`}
        </div>
      </td>
      <td className={`${NUM} ${VERDE}`}>{ehEntrega ? formatMoeda(l.valor) : ''}</td>
      <td className={`${NUM} ${l.noSaldo ? VERDE : 'text-muted-foreground'}`}>{ehEntrega ? '' : formatMoeda(l.valor)}</td>
      <td className={NUM}>{moedaOuTraco(s.eleDeve)}</td>
      <td className={NUM}>{moedaOuTraco(s.adiantado)}</td>
    </tr>
  );
}

function DialogoVincularRecebimento({ api, onFechar }: { api: OcContaCorrenteApi; onFechar: () => void }) {
  const [itens, setItens] = useState<RecebimentoVinculavel[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [tentou, setTentou] = useState(false);
  const { listarVinculaveis } = api;

  useEffect(() => {
    let vivo = true;
    void listarVinculaveis().then(r => { if (vivo) { setItens(r.itens); setErro(r.erro); } });
    return () => { vivo = false; };
  }, [listarVinculaveis]);

  const faltaMotivo = tentou && !motivo.trim();
  const faltaEscolha = tentou && !escolhido;
  const vincular = async () => {
    setTentou(true);
    if (!escolhido || !motivo.trim()) return;
    const e = await api.vincularRecebimento(escolhido, motivo);
    if (e) { setErro(e); return; }
    onFechar();
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="text-[12px]">Vincular recebimento já lançado</DialogTitle></DialogHeader>
        <div className="text-[10px] text-muted-foreground">
          O lançamento passa para Adiantamento de Clientes (sai do DRE). Valor, datas, conta bancária e conciliação não mudam.
        </div>
        <div className="max-h-[50vh] overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b">
                <th className={TH} /><th className={TH}>Pagamento</th><th className={TH}>Descrição</th><th className={TH}>Conta atual</th>
                <th className={TH}>Caixa</th><th className={TH}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {itens === null && <tr><td colSpan={6} className={`${TD} py-3 text-center text-muted-foreground`}>Carregando…</td></tr>}
              {itens?.length === 0 && <tr><td colSpan={6} className={`${TD} py-3 text-center text-muted-foreground`}>Nenhuma entrada do cliente disponível para vincular.</td></tr>}
              {itens?.map(r => (
                <tr key={r.lancamentoId} className={`border-b last:border-0 cursor-pointer ${escolhido === r.lancamentoId ? 'bg-primary/10' : ''}`}
                  onClick={() => setEscolhido(r.lancamentoId)} data-lancamento={r.lancamentoId}>
                  <td className={`${TD} text-center`}>
                    <input type="radio" aria-label={`Escolher ${r.descricao ?? r.lancamentoId}`} checked={escolhido === r.lancamentoId}
                      onChange={() => setEscolhido(r.lancamentoId)} />
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{fmtBr(r.data)}</td>
                  <td className={`${TD} break-words`}>
                    {r.descricao ?? '—'}
                    {!r.mesmoFavorecido && <div className="text-[10px] text-amber-700">outro favorecido</div>}
                  </td>
                  <td className={`${TD} break-words`}>{r.subcentro ?? '—'}</td>
                  <td className={TD}>{r.conciliado ? 'conciliado' : (r.semContaBancaria ? 'sem conta bancária' : (r.status ?? '—'))}</td>
                  <td className={`${NUM} ${VERDE}`}>{formatMoeda(r.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {faltaEscolha && <div className={`text-[10px] ${VERMELHO}`}>Escolha o recebimento.</div>}
        <div>
          <label className="text-[10px] font-medium" htmlFor="motivo-vinculo-recebimento">Motivo *</label>
          <Textarea id="motivo-vinculo-recebimento" value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
            className={`text-[11px] ${faltaMotivo ? 'border-destructive' : ''}`} />
          {faltaMotivo && <div className={`text-[10px] ${VERMELHO}`}>Informe o motivo.</div>}
        </div>
        <DialogFooter className="items-center">
          {erro && <span className={`mr-auto text-[10px] ${VERMELHO}`} role="alert">{erro}</span>}
          <Button type="button" variant="ghost" size="sm" className={BOTAO} onClick={onFechar}>Cancelar</Button>
          <Button type="button" size="sm" className={BOTAO} disabled={api.ocupado} onClick={vincular}>Vincular</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
