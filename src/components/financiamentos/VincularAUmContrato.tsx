/**
 * FINANC-VINCULO-OBRIGATORIO-01 FASE 1 (Gabriel 27/11, mock `financ-vinculo-obrigatorio-01.html` aprovado com ajuste) — "Vincular a um contrato":
 * a lista dos contratos do cliente (busca nº/credor/descrição · credor · Ativos/Todos), NENHUM escolhido ao abrir; o contrato que tem a parcela
 * EM ABERTO de valor exatamente igual ganha o selo (só realça). Vincular = o gravador que já existe (`comoVincular`: parcela, encargo de juros
 * ou liberação), sempre com a PRÉVIA do banco antes quando é parcela. "Agora não" só fecha: a pendência fica (V3).
 * ⚠ TAMANHO FIXO (920 × 520), um scrollport (a lista), régua da casa, a prévia num lugar reservado.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { useFornecedoresDoCliente } from '@/hooks/useFornecedoresDoCliente';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { QUADRO_REGUA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { useLancamentoNoFinanciamento } from '@/hooks/useLancamentoNoFinanciamento';
import { useSituacaoEmLote } from '@/hooks/useSituacaoDoContrato';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { ROTULO_DO_PAPEL } from '@/lib/financiamentos/buscaNoContrato';
import {
  comoVincular, consultarContratosParaVincular, filtrarContratos, proximaParcelaAberta, ROTULO_DO_TIPO,
  type ContratoParaVincular, type ParcelaExata, type TipoDoVinculo,
} from '@/lib/financiamentos/vinculoPendente';
import { cn } from '@/lib/utils';

const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

export function VincularAUmContrato({ lancamentoId, clienteId, tipo, subcentro, valor, data, exata, aoFechar, aoVincular, onCriarContrato }: {
  lancamentoId: string; clienteId: string; tipo: TipoDoVinculo; subcentro: string | null; valor: number; data: string | null;
  exata: ParcelaExata | null; aoFechar: () => void;
  /** depois de gravar: o modal relê a pendência (some) */
  aoVincular: () => void;
  onCriarContrato?: () => void;
}) {
  const api = useLancamentoNoFinanciamento(lancamentoId, clienteId);
  const situacoes = useSituacaoEmLote(clienteId, hojeLocal());
  const [lidos, setLidos] = useState<Omit<ContratoParaVincular, 'credor'>[] | string | null>(null);
  /* FORN-BUSCA-UNICA-01 — o nome do credor e o filtro Credor pelo leitor e pelo seletor ÚNICOS de fornecedor */
  const { fornecedores } = useFornecedoresDoCliente(clienteId);
  const [busca, setBusca] = useState('');
  const [credorId, setCredorId] = useState('');
  const [soAtivos, setSoAtivos] = useState<'ativos' | 'todos'>('ativos');
  /* V1 ajustado (Gabriel 27/11): NENHUM contrato nasce escolhido */
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void consultarContratosParaVincular(clienteId).then((r) => { if (vivo) setLidos(r); });
    return () => { vivo = false; };
  }, [clienteId]);

  const contratos: ContratoParaVincular[] | string | null = useMemo(() => (Array.isArray(lidos)
    ? lidos.map((c) => ({ ...c, credor: fornecedores.find((f) => f.id === c.credorId)?.nome ?? null })) : lidos), [lidos, fornecedores]);
  const lista = Array.isArray(contratos) ? contratos : [];
  const visiveis = useMemo(() => filtrarContratos(lista, { busca, credorId: credorId || null, soAtivos: soAtivos === 'ativos' }), [lista, busca, credorId, soAtivos]);
  const credores = useMemo(() => fornecedores.filter((f) => lista.some((c) => c.credorId === f.id)), [fornecedores, lista]);
  const situacaoDe = (id: string) => situacoes.data?.get(id);
  const contrato = lista.find((c) => c.id === escolhido) ?? null;
  const como = contrato ? comoVincular({ tipo, contratoId: contrato.id, exata, proxima: proximaParcelaAberta(situacaoDe(contrato.id)?.parcelas ?? []) }) : null;

  /* a prévia do banco quando o vínculo é numa parcela (o que muda nela); encargo e liberação dizem a frase pronta */
  const chaveDaPrevia = como?.via === 'parcela' ? `${como.parcelaId}:${como.papel}` : null;
  useEffect(() => {
    setRecusa(null);
    if (!como || como.via !== 'parcela') { setPrevia(null); return; }
    let vivo = true;
    setPrevia('Simulando…');
    void api.vincularParcela(como.parcelaId, como.papel, false, true).then((r) => {
      if (!vivo) return;
      if (typeof r === 'string' || r.recusa) { setPrevia(null); setRecusa(typeof r === 'string' ? r : r.recusa ?? null); return; }
      setPrevia([r.paga ? 'a parcela fica paga' : 'a parcela segue em aberto', r.cancelados ? `${r.cancelados} programado(s) saem` : null, ...r.avisos].filter(Boolean).join(' · '));
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a prévia muda só quando muda a parcela/papel
  }, [chaveDaPrevia, api.vincularParcela]);

  const nomeDoContrato = contrato ? contrato.numero || contrato.descricao || 'contrato' : '';
  const frase = recusa ?? (!contrato ? 'Escolha o contrato na lista.'
    : como?.via === 'nenhum' ? como.frase
    : como?.via === 'liberacao' ? `Liberação "em conta" de ${br(data)} · R$ ${num2(valor)} no contrato ${nomeDoContrato}`
    : como?.via === 'encargo' ? `Juros do contrato ${nomeDoContrato} (encargo)`
    : como?.via === 'parcela' ? `${ROTULO_DO_PAPEL[como.papel]} da parcela ${exata?.parcelaId === como.parcelaId ? exata.numeroParcela ?? '?' : situacaoDe(contrato.id)?.parcelas.find((p) => p.id === como.parcelaId)?.numero ?? '?'} · ${previa ?? ''}`
    : '');

  const gravar = async () => {
    if (!contrato || !como || como.via === 'nenhum') return;
    setGravando(true);
    let erro: string | null = null;
    if (como.via === 'parcela') {
      const r = await api.vincularParcela(como.parcelaId, como.papel, false, false);
      erro = typeof r === 'string' ? r : r.recusa ?? null;
    } else if (como.via === 'encargo') erro = await api.vincularEncargo(contrato.id, como.papel);
    else if (data) erro = await api.vincularLiberacao(contrato.id, data, valor);
    else erro = 'O lançamento não tem data: sem ela a liberação não grava.';
    setGravando(false);
    if (erro) { setRecusa(erro); return; }
    aoVincular();
    aoFechar();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(520px,calc(100vh-16px))] w-[min(920px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button.absolute]:hidden" data-testid="vincular-a-um-contrato">
        <div className="flex h-[34px] shrink-0 items-center gap-2 bg-primary px-3 text-primary-foreground">
          <DialogTitle className="shrink-0 text-[11px] font-semibold">Vincular a um contrato</DialogTitle>
          <DialogDescription className="min-w-0 flex-1 whitespace-nowrap text-[10px] text-primary-foreground/80">
            {subcentro ?? ROTULO_DO_TIPO[tipo]} · R$ {num2(valor)} · {br(data)}
          </DialogDescription>
        </div>
        <div className="flex h-[40px] shrink-0 items-center gap-2 px-3 text-[10px]">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="nº do contrato ou banco…" className="h-[24px] w-[220px] text-[10px]"
            aria-label="Buscar (nº, credor, descrição)" data-testid="vinculo-busca" />
          <span className="text-muted-foreground">Credor</span>
          <div className="w-[200px]" data-testid="vinculo-credor">
            <FavorecidoSelect value={credorId} onChange={(id) => setCredorId(id || '')} fornecedores={credores} situacao="todos" limpavel
              rotuloDoVazio="Todos" placeholder="Todos" linhaDoDocumento={false} size="compact" />
          </div>
          <span className="text-muted-foreground">Situação</span>
          <Segmentado altura={22} valor={soAtivos} onEscolher={setSoAtivos} opcoes={[{ valor: 'ativos', rotulo: 'Ativos' }, { valor: 'todos', rotulo: 'Todos' }]} />
          <span className="ml-auto whitespace-nowrap tabular-nums text-muted-foreground" data-testid="vinculo-contagem">{visiveis.length} {visiveis.length === 1 ? 'contrato' : 'contratos'}</span>
        </div>
        <div className="min-h-0 flex-1 px-3">
          <div className={QUADRO_REGUA}>
            <table className="w-full shrink-0 table-fixed border-collapse bg-primary">
              <colgroup><col style={{ width: 26 }} /><col style={{ width: 170 }} /><col /><col style={{ width: 84 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 150 }} /></colgroup>
              <thead><tr>
                <th className={TH_REGUA} /><th className={cn(TH_REGUA, 'text-left')}>Nº do contrato</th><th className={cn(TH_REGUA, 'text-left')}>Credor</th>
                <th className={cn(TH_REGUA, 'text-left')}>Contrato</th><th className={cn(TH_REGUA, 'text-right')}>Contratado</th>
                <th className={cn(TH_REGUA, 'text-right')}>Saldo</th><th className={cn(TH_REGUA, 'text-left')}>Próxima parcela</th>
              </tr></thead>
            </table>
            <div className="min-h-0 flex-1 overflow-y-auto" data-testid="vinculo-lista">
              <table className="w-full table-fixed border-collapse">
                <colgroup><col style={{ width: 26 }} /><col style={{ width: 170 }} /><col /><col style={{ width: 84 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 150 }} /></colgroup>
                <tbody>
                  {contratos === null && <tr><td colSpan={7} className={cn(TD_REGUA, 'text-muted-foreground')}>Lendo os contratos…</td></tr>}
                  {typeof contratos === 'string' && <tr><td colSpan={7} className={cn(TD_REGUA, 'text-destructive')}>{contratos}</td></tr>}
                  {Array.isArray(contratos) && visiveis.length === 0 && <tr><td colSpan={7} className={cn(TD_REGUA, 'text-muted-foreground')}>Nenhum contrato com este filtro.</td></tr>}
                  {visiveis.map((c) => {
                    const s = situacaoDe(c.id);
                    const prox = proximaParcelaAberta(s?.parcelas ?? []);
                    const igual = exata?.financiamentoId === c.id;
                    return (
                      <tr key={c.id} onClick={() => setEscolhido(c.id)} data-testid="vinculo-contrato" aria-selected={escolhido === c.id}
                        className={cn('cursor-pointer border-b border-border/50 hover:bg-muted/40', escolhido === c.id && 'bg-primary/10', igual && 'outline outline-1 -outline-offset-1 outline-emerald-500')}>
                        <td className={cn(TD_REGUA, 'text-center')}>{escolhido === c.id ? '◉' : '○'}</td>
                        <td className={TD_REGUA_TEXTO} title={c.descricao ? `${c.numero ?? 'sem nº'} · ${c.descricao}` : c.numero ?? undefined}>{c.numero || 'sem nº'}</td>
                        <td className={TD_REGUA_TEXTO} title={igual ? `valor igual · parc. ${exata?.numeroParcela ?? '?'} ${c.credor ?? '—'}` : c.credor ?? undefined}>
                          {igual && <span className="mr-1 rounded-sm bg-emerald-100 px-1 text-[9.5px] text-emerald-800" data-testid="vinculo-parcela-igual"
                            title={`Parcela ${exata?.numeroParcela ?? '?'} em aberto com o valor exatamente igual (${br(exata?.vencimento ?? null)})`}>valor igual · parc. {exata?.numeroParcela ?? '?'}</span>}
                          {igual && ' '}
                          {c.credor ?? '—'}
                        </td>
                        <td className={cn(TD_REGUA, 'tabular-nums')}>{br(c.dataContrato)}</td>
                        <td className={TD_REGUA_NUM}>{c.valorContratado === null ? '—' : num2(c.valorContratado)}</td>
                        <td className={TD_REGUA_NUM}>{s?.saldo?.saldo == null ? '—' : num2(s.saldo.saldo)}</td>
                        <td className={cn(TD_REGUA, 'tabular-nums')}>{prox ? `${prox.numero ?? '?'} · ${br(prox.vencimento)}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className={cn('h-[30px] shrink-0 overflow-hidden whitespace-nowrap px-3 pt-2 text-[10px]', recusa ? 'text-destructive' : 'text-muted-foreground')} title={frase} data-testid="vinculo-previa">{frase}</div>
        <div className="flex h-[40px] shrink-0 items-center gap-2 border-t px-3">
          {onCriarContrato && <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={() => { aoFechar(); onCriarContrato(); }} data-testid="vinculo-criar-contrato">+ Criar contrato novo</Button>}
          <span className="flex-1" />
          {/* V3 — "Agora não" só fecha: a pendência fica até vincular */}
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar} data-testid="vinculo-agora-nao">Agora não</Button>
          <Button size="sm" className="h-[24px] w-[220px] text-[10px]" disabled={!contrato || gravando || !!recusa || como?.via === 'nenhum' || (como?.via === 'parcela' && (!previa || previa === 'Simulando…'))}
            onClick={() => void gravar()} data-testid="vinculo-gravar">
            {gravando ? 'Vinculando…' : contrato ? `Vincular ao ${contrato.numero || 'contrato'}` : 'Vincular'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
