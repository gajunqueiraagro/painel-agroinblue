import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  brl, escolhaInicial, fraseDoRodape, lerSimulacao, pedidoDeExecucao, rotuloLancamento, verboDoBotao,
  type CodigoOpcao, type Escolha, type ItemLevado, type OpcaoConciliar, type SimulacaoConciliar,
} from '@/lib/conciliacao/conciliarDiferenca';

/* CONC-SEM-TRAVA-01 (tela, mock aprovado pelo Gabriel em 22/10 07h32) — o modal "Conciliar", o MESMO nos quatro modos (1:1, grupo,
   bloco, Casar com o banco): diferenca de valor nunca vira recusa, vira este modal. O banco simula (`fn_conc_simular_diferenca`) e
   devolve as opcoes; a tela mostra os dois lados, a caixa da diferenca (ambar = sobra, azul = falta), a frase pronta, tres cartoes com
   a previa, o motivo e o rodape com a conta e o verbo exato. TAMANHO FIXO, sem rolagem: as listas mostram ate' 3 linhas e dizem "+N". */

export interface ExtratoLevado { id: string; data: string | null; descricao: string; valor: number }
export interface LancamentoLevado { id: string; data: string | null; descricao: string; valor: number; parcela?: string | null }

export interface ConciliarDiferencaApi {
  simular: (extratos: string[], lancamentos: string[]) => Promise<{ sim: SimulacaoConciliar | null; erro: string | null }>;
  executar: (extratos: string[], lancamentos: string[], opcao: CodigoOpcao, motivo: string) => Promise<string | null>;
  buscar: (extratoId: string, texto: string) => Promise<OpcaoConciliar['sugestoesLancamento']>;
}

const msg = (e: unknown) => (typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : 'Falha ao falar com o banco.');
/** "codigo: frase" do banco -> so' a frase */
const semCodigo = (m: string) => m.replace(/^[a-z]+(_[a-z]+)+:\s*/, '');

export const apiConciliarDiferenca: ConciliarDiferencaApi = {
  simular: async (extratos, lancamentos) => {
    const { data, error } = await (supabase as any).rpc('fn_conc_simular_diferenca', { p_extratos: extratos, p_lancamentos: lancamentos });
    if (error) return { sim: null, erro: semCodigo(msg(error)) };
    return lerSimulacao(data);
  },
  executar: async (extratos, lancamentos, opcao, motivo) => {
    const { error } = await (supabase as any).rpc('fn_conc_ligar_com_diferenca', {
      p_extratos: extratos, p_lancamentos: lancamentos, p_opcao: opcao, p_motivo: motivo, p_simular: false });
    return error ? semCodigo(msg(error)) : null;
  },
  buscar: async (extratoId, texto) => {
    const { data, error } = await (supabase as any).rpc('fn_conc_buscar_para_ligar', { p_extrato_id: extratoId, p_texto: texto, p_limite: 8 });
    if (error) return [];
    const itens: unknown[] = Array.isArray(data?.itens) ? data.itens : Array.isArray(data) ? data : [];
    return itens.map(x => x as Record<string, unknown>).map(x => ({
      id: String(x.id), descricao: String(x.descricao ?? '—'), data: (x.data_vencimento as string) ?? null,
      valor: Number(x.livre ?? x.valor ?? 0), parcela: null, fechaExato: Math.abs(Number(x.diferenca ?? 1)) <= 0.005 }));
  },
};

const dataCurta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const TITULO: Partial<Record<CodigoOpcao, string>> = {
  acrescentar_lancamento: 'Acrescentar lançamento', sobra_na_oc: 'Lançar na conta corrente da OC', criar_diferenca: 'Criar lançamento da diferença',
  juntar_extrato: 'Juntar outro extrato', ligar_com_falta: 'Deixar a falta em aberto', desconto_na_oc: 'Desconto ou abatimento na OC',
};

function Lado({ titulo, total, linhas, testid }: { titulo: string; total: number; testid: string;
  linhas: { id: string; data: string | null; texto: string; valor: number }[] }) {
  /* sem reticencia (regra da casa): a descricao QUEBRA; para o tamanho fixo caber, aparecem ate' 2 itens (1, com mais de 2) e o resto vira "+N" */
  const vis = linhas.slice(0, linhas.length > 2 ? 1 : 2);
  return (
    <div className="min-w-0 rounded border px-2 py-1.5" data-testid={testid}>
      <div className="flex items-baseline justify-between text-[10.5px] font-semibold">
        <span>{titulo}</span><span className="tabular-nums">{brl(total)}</span>
      </div>
      {vis.map(l => (
        <div key={l.id} className="py-px text-[10.5px] leading-[13px]">
          <div className="flex items-baseline gap-1.5">
            <span className="tabular-nums text-muted-foreground">{dataCurta(l.data)}</span>
            <span className="ml-auto whitespace-nowrap tabular-nums">{brl(l.valor)}</span>
          </div>
          <div className="break-words">{l.texto}</div>
        </div>
      ))}
      {linhas.length > vis.length && <div className="text-[10px] leading-[13px] text-muted-foreground">+{linhas.length - vis.length}</div>}
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  extratos: ExtratoLevado[];
  lancamentos: LancamentoLevado[];
  onConciliado: () => void;
  api?: ConciliarDiferencaApi;
}

export function ConciliarDiferencaModal({ open, onClose, extratos, lancamentos, onConciliado, api = apiConciliarDiferenca }: Props) {
  const [sim, setSim] = useState<SimulacaoConciliar | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolha, setEscolha] = useState<Escolha>({ codigo: null, itemId: null });
  const [motivo, setMotivo] = useState('');
  const [tentou, setTentou] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<OpcaoConciliar['sugestoesLancamento']>([]);
  const idsExt = useMemo(() => extratos.map(e => e.id), [extratos]);
  const idsLan = useMemo(() => lancamentos.map(l => l.id), [lancamentos]);

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setSim(null); setErro(null); setMotivo(''); setTentou(false); setBusca(''); setAchados([]);
    void api.simular(idsExt, idsLan).then(r => { if (vivo) { setSim(r.sim); setErro(r.erro); setEscolha(escolhaInicial(r.sim)); } });
    return () => { vivo = false; };
  }, [open, api, idsExt, idsLan]);

  const buscar = useCallback(async (t: string) => {
    setBusca(t);
    if (t.trim().length < 2 || !idsExt[0]) { setAchados([]); return; }
    setAchados(await api.buscar(idsExt[0], t));
  }, [api, idsExt]);

  const levados: ItemLevado[] = lancamentos.map(l => ({ id: l.id, descricao: l.descricao, parcela: l.parcela ?? null, valor: l.valor }));
  const verbo = verboDoBotao(sim, escolha);
  const faltaMotivo = tentou && motivo.trim() === '';
  const sobra = sim?.sentido === 'a_mais';
  const falta = sim?.sentido === 'a_menos';

  const confirmar = async () => {
    setTentou(true);
    const p = pedidoDeExecucao(escolha, idsExt, idsLan);
    if (!p || motivo.trim() === '') return;
    setGravando(true); setErro(null);
    const e = await api.executar(p.extratos, p.lancamentos, p.opcao, motivo.trim());
    setGravando(false);
    if (e) { setErro(e); return; }
    onConciliado();
    onClose();
  };

  const marcar = (codigo: CodigoOpcao, itemId: string | null = null) => setEscolha({ codigo, itemId });
  const cartoes = sim && sim.sentido !== 'igual' ? sim.opcoes.filter(o => TITULO[o.codigo]) : [];

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !gravando) onClose(); }}>
      <DialogContent className="flex h-[500px] max-h-[94vh] w-[920px] max-w-[96vw] flex-col gap-2 p-3" data-testid="modal-conciliar">
        <DialogHeader className="shrink-0"><DialogTitle className="text-[12px]">Conciliar</DialogTitle></DialogHeader>

        <div className={cn('grid shrink-0 gap-2', sim && sim.sentido !== 'igual' ? 'grid-cols-[1fr_1fr_150px]' : 'grid-cols-2')}>
          <Lado titulo="Extrato do banco" total={sim?.somaExtratos ?? extratos.reduce((s, e) => s + Math.abs(e.valor), 0)} testid="lado-extrato"
            linhas={extratos.map(e => ({ id: e.id, data: e.data, texto: e.descricao, valor: Math.abs(e.valor) }))} />
          <Lado titulo="Lançamentos levados" total={sim?.somaLancamentos ?? lancamentos.reduce((s, l) => s + Math.abs(l.valor), 0)} testid="lado-lancamentos"
            linhas={lancamentos.map(l => ({ id: l.id, data: l.data, texto: l.parcela ? `${l.descricao} · Receb. ${l.parcela}` : l.descricao, valor: Math.abs(l.valor) }))} />
          {sim && sim.sentido !== 'igual' && (
            <div className={cn('flex flex-col items-center justify-center rounded border px-2', sobra ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-sky-300 bg-sky-50 text-sky-900')}
              data-testid="caixa-diferenca">
              <span className="text-[10.5px]">{sobra ? 'Sobram' : 'Falta'}</span>
              <span className="text-[13px] font-semibold tabular-nums">{brl(sim.diferenca)}</span>
            </div>
          )}
        </div>

        <div className="min-h-[16px] shrink-0 break-words text-[11px] leading-[15px]" data-testid="frase-conciliar">
          {sim ? sim.frase : erro ? '' : 'Simulando…'}
        </div>

        <div className={cn('grid min-h-0 flex-1 gap-2', cartoes.length === 3 ? 'grid-cols-3' : cartoes.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
          {cartoes.map(o => {
            const ativo = escolha.codigo === o.codigo;
            const itens = o.codigo === 'acrescentar_lancamento'
              ? [...o.sugestoesLancamento, ...achados.filter(a => !o.sugestoesLancamento.some(s => s.id === a.id))]
              : o.codigo === 'juntar_extrato' ? o.sugestoesExtrato : [];
            return (
              <div key={o.codigo} className={cn('flex min-h-0 flex-col overflow-hidden rounded border p-2', ativo && 'border-primary ring-1 ring-primary')}
                data-testid={`cartao-${o.codigo}`}>
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold">
                  <input type="radio" name="opcao-conciliar" checked={ativo} onChange={() => marcar(o.codigo, itens.find(i => i.fechaExato)?.id ?? null)} />
                  {TITULO[o.codigo]}
                </label>
                <div className="mt-0.5 shrink-0 break-words text-[10px] leading-[13px] text-muted-foreground">{o.frase}</div>
                {o.codigo === 'acrescentar_lancamento' && (
                  <Input value={busca} onChange={e => { void buscar(e.target.value); }} placeholder="Buscar por descrição, favorecido ou valor"
                    className="mt-1 h-[22px] shrink-0 text-[10.5px]" data-testid="busca-acrescentar" />
                )}
                {(o.codigo === 'acrescentar_lancamento' || o.codigo === 'juntar_extrato') && (
                  <div className="mt-1 min-h-0 flex-1 overflow-hidden" data-testid={`lista-${o.codigo}`}>
                    {/* cada item em DUAS linhas: data, selo e valor em cima; a descricao inteira embaixo (quebra, sem reticencia) */}
                    {itens.slice(0, 2).map(i => (
                      <label key={i.id} className={cn('block cursor-pointer rounded px-0.5 py-px text-[10.5px] leading-[13px]', escolha.itemId === i.id && 'bg-primary/10')}>
                        <span className="flex items-center gap-1.5">
                          <input type="radio" name={`item-${o.codigo}`} checked={escolha.itemId === i.id} onChange={() => marcar(o.codigo, i.id)} />
                          <span className="shrink-0 tabular-nums text-muted-foreground">{dataCurta(i.data)}</span>
                          <span className="ml-auto shrink-0 whitespace-nowrap tabular-nums">{brl(i.valor)}</span>
                        </span>
                        <span className="block break-words pl-[18px]">
                          {i.fechaExato && <span className="mr-1 rounded bg-emerald-100 px-1 text-[9.5px] text-emerald-800" data-testid="selo-fecha-exato">fecha exato</span>}
                          {'parcela' in i && i.parcela ? `${i.descricao} · Receb. ${i.parcela}` : i.descricao}
                        </span>
                      </label>
                    ))}
                    {itens.length > 2 && <div className="pl-[18px] text-[10px] leading-[13px] text-muted-foreground">+{itens.length - 2} · refine a busca</div>}
                    {itens.length === 0 && <div className="text-[10px] text-muted-foreground">Nenhum em aberto que sirva. Busque acima.</div>}
                  </div>
                )}
                {o.codigo !== 'acrescentar_lancamento' && o.codigo !== 'juntar_extrato' && (
                  <div className="mt-1 space-y-0.5 text-[10.5px]" data-testid={`previa-${o.codigo}`}>
                    {o.codigo === 'sobra_na_oc' && <>
                      <div>Recebimento a mais · <b className="tabular-nums">{brl(Number(o.previa.valor ?? 0))}</b></div>
                      <div className="text-muted-foreground">Saldo da OC depois: <span className="tabular-nums">{brl(Number(o.previa.saldo_depois ?? 0))}</span></div>
                    </>}
                    {o.codigo === 'criar_diferenca' && <>
                      <div className="tabular-nums">{dataCurta(String(o.previa.data ?? ''))} · <b>{brl(Number(o.previa.valor ?? 0))}</b></div>
                      <div className="break-words text-muted-foreground">{String(o.previa.subcentro ?? 'sem classificação')}</div>
                      <div className="text-muted-foreground">{o.previa.favorecido_origem === 'extrato' ? 'Favorecido do Pix' : 'Favorecido do lançamento original'}</div>
                    </>}
                    {o.codigo === 'ligar_com_falta' && <>
                      <div>Recebido <b className="tabular-nums">{brl(Number(o.previa.recebido ?? 0))}</b></div>
                      <div>Em aberto <b className="tabular-nums">{brl(Number(o.previa.em_aberto ?? 0))}</b>
                        {o.previa.vencimento ? <span className="text-muted-foreground"> · vence {dataCurta(String(o.previa.vencimento))}</span> : null}</div>
                    </>}
                    {o.codigo === 'desconto_na_oc' && <>
                      <div>Desconto na OC <b className="tabular-nums">{brl(Number(o.previa.desconto ?? 0))}</b></div>
                      <div className="break-words text-muted-foreground">quita "{String(o.previa.lancamento ?? '')}"</div>
                    </>}
                  </div>
                )}
              </div>
            );
          })}
          {sim?.sentido === 'igual' && <div className="text-[11px] text-emerald-700" data-testid="confere">Confere com o banco ✓</div>}
        </div>

        <div className="shrink-0">
          <label className={cn('text-[10px] font-medium', faltaMotivo && 'text-destructive')} htmlFor="motivo-conciliar">Motivo *</label>
          <Input id="motivo-conciliar" value={motivo} onChange={e => setMotivo(e.target.value)} disabled={gravando}
            className={cn('h-[24px] text-[11px]', faltaMotivo && 'border-destructive')} />
          <div className="h-[13px] text-[10px] text-destructive">{faltaMotivo ? 'Informe o motivo.' : ''}</div>
        </div>

        {/* rodape de ALTURA FIXA (a conta cabe em ate' duas linhas): trocar de opcao nao sobe o motivo nem o botao */}
        <div className="flex h-[34px] shrink-0 items-center gap-2 border-t pt-1.5">
          <span className="flex h-[26px] min-w-0 flex-1 items-center break-words text-[10.5px] leading-[13px] tabular-nums" data-testid="rodape-conciliar">
            {erro ? <span className="text-destructive" role="alert">{erro}</span> : fraseDoRodape(sim, escolha, levados)}
          </span>
          <Button type="button" variant="ghost" size="sm" className="h-[22px] px-2 text-[10.5px]" disabled={gravando} onClick={onClose}>Voltar</Button>
          {/* LARGURA FIXA (o verbo mais longo: "Conciliar e juntar o movimento de R$ 99.999.999,99"): trocar de opcao muda o verbo,
              nunca a posicao do Voltar nem do botao */}
          <Button type="button" size="sm" className="h-[22px] w-[290px] shrink-0 whitespace-nowrap px-2 text-[10.5px]" disabled={!verbo || gravando} onClick={confirmar} data-testid="botao-conciliar">
            {gravando ? 'Conciliando…' : verbo ?? 'Escolha uma opção'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
