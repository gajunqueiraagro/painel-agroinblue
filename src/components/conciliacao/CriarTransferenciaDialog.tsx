/**
 * CriarTransferenciaDialog — P139: o movimento do banco sem par vira TRANSFERÊNCIA num gesto, direto do "⋯" (Conferência e estação).
 * Valor, data e a conta vêm do movimento; origem e destino pelo SINAL; o operador escolhe a OUTRA conta. Tudo o que a tela mostra
 * (o espelho, a gêmea, a transferência já lançada) vem da SIMULAÇÃO da própria porta (`fn_transferencia_do_extrato`, `p_simular`);
 * a tela não calcula nada disso. A gravação é uma transação no banco: cria pela regra de sempre e liga pelo gravador único.
 * ⚠ GÊMEA (mesma conta, dia e valor, de outra importação, já conciliada): AVISO com confirmação, e o "Ignorar como duplicada" ali
 *   mesmo (o caso Santa Rita 10/09: era duplicata, o saldo provou). ⚠ Erro e recusa ficam DENTRO do modal (nunca toast).
 */
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BlocoFormulario, CorpoFormulario, Rotulo, REGUA_CAMPO } from '@/components/ui/bloco-formulario';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { useContasBancariasLeves } from '@/hooks/useContasBancariasLeves';
import { formatMoeda } from '@/lib/calculos/formatters';
import { cn } from '@/lib/utils';
import {
  simularTransferencia, gravarTransferencia, porqueDaSugestao,
  type SimulacaoDaTransferencia, type SugestaoDeTransferencia,
} from '@/lib/conciliacao/transferenciaDoExtrato';

export interface MovimentoParaTransferencia {
  extrato_id: string;
  data: string;
  historico: string | null;
  valor: number;
  conta_id: string;
}

const dataBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

/** O que o botão principal diz e se ele pode gravar — uma regra só, para o `disabled`, o `title` e o rodapé. */
export function estadoDoBotao(sim: SimulacaoDaTransferencia | null, carregando: boolean, confirmouGemea: boolean):
  { rotulo: string; pode: boolean; motivo: string } {
  if (carregando) return { rotulo: 'Criar e conciliar', pode: false, motivo: 'prevendo…' };
  if (!sim) return { rotulo: 'Criar e conciliar', pode: false, motivo: 'escolha a outra conta' };
  if (sim.acao === 'escolher_conta') return { rotulo: 'Criar e conciliar', pode: false, motivo: 'escolha a outra conta' };
  const rotulo = sim.acao === 'casar_existente' ? 'Casar com a existente' : 'Criar e conciliar';
  if (sim.gemeas.length > 0 && !confirmouGemea) return { rotulo, pode: false, motivo: 'há um movimento igual de outra importação: confirme ou ignore' };
  return { rotulo, pode: true, motivo: '' };
}

export function CriarTransferenciaDialog({ aberto, clienteId, movimento, sugestao, onFechar, onGravado, onIgnorarDuplicada }: {
  aberto: boolean;
  clienteId: string | null;
  movimento: MovimentoParaTransferencia | null;
  sugestao?: SugestaoDeTransferencia | null;
  onFechar: () => void;
  onGravado: () => void;
  /** a gêmea foi reconhecida: o operador ignora ESTE movimento como duplicado (o diálogo de ignorar da casa) */
  onIgnorarDuplicada?: (extratoId: string) => void;
}) {
  const { contas } = useContasBancariasLeves(aberto ? clienteId : null);
  const [outra, setOutra] = useState<string | null>(null);
  const [espelho, setEspelho] = useState<'auto' | 'nenhum' | string>('auto');
  const [confirmouGemea, setConfirmouGemea] = useState(false);
  const [sim, setSim] = useState<SimulacaoDaTransferencia | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /* abrir de novo = começar do zero (com a sugestão, se houver UMA) */
  useEffect(() => {
    if (!aberto) return;
    setOutra(sugestao?.contaSugerida ?? null); setEspelho('auto'); setConfirmouGemea(false); setSim(null); setErro(null);
  }, [aberto, movimento?.extrato_id, sugestao?.contaSugerida]);

  /* a prévia é a própria porta com `p_simular` (a cada troca de conta ou de espelho); leitura que chega tarde não escreve */
  useEffect(() => {
    if (!aberto || !movimento) return;
    let vivo = true;
    setCarregando(true);
    void simularTransferencia(movimento.extrato_id, {
      outraConta: outra, espelhoId: espelho !== 'auto' && espelho !== 'nenhum' ? espelho : null, semEspelho: espelho === 'nenhum',
    }).then((r) => {
      if (!vivo) return;
      setCarregando(false);
      if ('erro' in r) { setSim(null); setErro(r.erro); } else { setSim(r.sim); setErro(null); }
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o movimento conta pelo id (o objeto do pai muda de identidade a cada render)
  }, [aberto, movimento?.extrato_id, outra, espelho]);

  const nomeDa = useMemo(() => new Map(contas.map((c) => [c.id, (c.nome_exibicao || c.nome_conta).trim()])), [contas]);
  const saida = (movimento?.valor ?? 0) < 0;
  const botao = estadoDoBotao(sim, carregando, confirmouGemea);
  const espelhoMarcado = sim?.acao === 'criar' ? (espelho === 'auto' ? sim.espelhoId : espelho === 'nenhum' ? null : espelho) : null;

  const gravar = async () => {
    if (!movimento || !botao.pode) return;
    setGravando(true); setErro(null);
    const r = await gravarTransferencia(movimento.extrato_id, {
      outraConta: outra, espelhoId: espelhoMarcado, semEspelho: espelho === 'nenhum', confirmarGemea: confirmouGemea,
    });
    setGravando(false);
    if ('erro' in r) setErro(r.erro); else onGravado();
  };

  const rodape = erro ?? (sim?.acao === 'criar' && sim.origem && sim.destino
    ? `${nomeDa.get(sim.origem) ?? 'origem'} → ${nomeDa.get(sim.destino) ?? 'destino'} · ${formatMoeda(sim.valor)} · ${dataBr(sim.data)}`
      + (espelhoMarcado ? ' · concilia o espelho junto' : ' · a outra ponta fica realizada, sem espelho')
    : sim?.acao === 'casar_existente' ? 'liga este movimento à transferência que já existe — nenhuma outra é criada'
    : botao.motivo);

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="flex h-[min(430px,calc(100vh-16px))] w-[min(620px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button.absolute]:hidden"
        data-testid="modal-criar-transferencia" onPointerDownOutside={(e) => e.preventDefault()}>
        <div className="flex h-[32px] shrink-0 items-center gap-2.5 bg-primary px-3 text-primary-foreground">
          <DialogTitle className="shrink-0 whitespace-nowrap text-[13px] font-semibold">Criar transferência</DialogTitle>
          <DialogDescription className="uma-linha-que-rola min-w-0 flex-1 text-[11px] text-primary-foreground/80" title={movimento?.historico ?? ''}>
            {movimento ? `${dataBr(movimento.data)} · ${movimento.historico ?? '—'}` : ''}
          </DialogDescription>
          <button type="button" onClick={onFechar} className="shrink-0 rounded p-0.5 hover:bg-white/10" aria-label="Fechar"><X className="h-3.5 w-3.5" /></button>
        </div>

        <CorpoFormulario className="min-h-0 flex-1 overflow-hidden">
          <BlocoFormulario titulo="Movimento do banco" dica="valor, data e conta vêm do extrato">
            <div className="grid grid-cols-[96px_1fr_120px] items-end gap-x-3">
              <div><Rotulo texto="Data" /><div className="text-[11px] tabular-nums">{dataBr(movimento?.data)}</div></div>
              <div className="min-w-0"><Rotulo texto="Conta do movimento" />
                <div className="uma-linha-que-rola text-[11px]" title={movimento ? nomeDa.get(movimento.conta_id) ?? '' : ''}>
                  {movimento ? nomeDa.get(movimento.conta_id) ?? '—' : '—'}</div></div>
              <div className="text-right"><Rotulo texto="Valor" className="text-right" />
                <div className={cn('text-[11px] font-medium tabular-nums', saida ? 'text-destructive' : 'text-emerald-700')}>{formatMoeda(movimento?.valor ?? 0)}</div></div>
            </div>
          </BlocoFormulario>

          <BlocoFormulario titulo={saida ? 'Para a conta' : 'Da conta'} dica={sugestao && sugestao.contaSugerida ? porqueDaSugestao(sugestao) : 'a outra ponta da transferência'}>
            <ContaBancariaSelect value={outra} onValueChange={(id) => { setOutra(id); setEspelho('auto'); setConfirmouGemea(false); }}
              contas={contas} excluirIds={movimento ? [movimento.conta_id] : []} placeholder="Escolha a conta" comBusca nomeInteiro
              showBankDetails="banco" className={REGUA_CAMPO} />
          </BlocoFormulario>

          <BlocoFormulario titulo="Espelho na outra conta" className="min-h-0 flex-1"
            dica="movimento de valor oposto, até 3 dias, ainda sem par — concilia junto">
            <div className="min-h-0 flex-1 overflow-y-auto" data-testid="lista-espelhos">
              {sim?.acao === 'casar_existente' && sim.existente && (
                <div className="rounded border border-primary/30 bg-primary/5 px-2 py-1 text-[11px]" data-testid="aviso-existente">
                  Já existe a transferência lançada <b>{sim.existente.descricao || '—'}</b> ({dataBr(sim.existente.data)}). Este movimento
                  será ligado a ela{sim.existente.meiaPonta ? ' (a outra ponta já está conciliada)' : ''}; nenhuma outra é criada.
                </div>
              )}
              {sim?.acao === 'criar' && sim.espelhos.length === 0 && (
                <div className="text-[11px] text-muted-foreground">Sem espelho até 3 dias nesta conta: a outra ponta fica realizada, sem conciliar.</div>
              )}
              {sim?.acao === 'criar' && sim.espelhos.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  {/* P139 (gate 28/10): a lista é TABELA — o histórico longo termina em "…" com o texto inteiro no `title` da célula */}
                  <table className="w-full table-fixed text-[11px]" data-testid="tabela-espelhos">
                    <colgroup><col style={{ width: '28px' }} /><col style={{ width: '84px' }} /><col /><col style={{ width: '124px' }} /></colgroup>
                    <thead className="bg-primary text-primary-foreground">
                      <tr className="h-[22px] text-[9.5px] font-medium">
                        <th className="px-1" aria-label="Escolha" /><th className="px-1 text-left">Data</th>
                        <th className="px-1 text-left">Histórico</th><th className="px-1 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sim.espelhos.map((e) => (
                        <tr key={e.id} onClick={() => setEspelho(e.id)}
                          className={cn('h-[22px] cursor-pointer', espelhoMarcado === e.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                          <td className="px-1 text-center">
                            <button type="button" aria-pressed={espelhoMarcado === e.id} aria-label={`Espelho de ${dataBr(e.data)}`}
                              onClick={(ev) => { ev.stopPropagation(); setEspelho(e.id); }}>{espelhoMarcado === e.id ? '●' : '○'}</button>
                          </td>
                          <td className="px-1 tabular-nums">{dataBr(e.data)}</td>
                          <td className="truncate px-1" title={e.descricao}>{e.descricao || '—'}</td>
                          <td className="whitespace-nowrap px-1 text-right tabular-nums">{formatMoeda(e.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button type="button" aria-pressed={espelho === 'nenhum'} onClick={() => setEspelho('nenhum')}
                    className={cn('h-[22px] rounded px-1.5 text-left text-[11px]', espelho === 'nenhum' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                    {espelho === 'nenhum' ? '● ' : '○ '}Não conciliar a outra ponta
                  </button>
                  {espelho === 'auto' && !sim.espelhoId && (
                    <div className="text-[10px] text-amber-700" data-testid="aviso-empate">dois espelhos à mesma distância: escolha um (o sistema não adivinha)</div>
                  )}
                </div>
              )}
            </div>
            {sim && sim.gemeas.length > 0 && (
              <div className="mt-1 flex shrink-0 flex-wrap items-center gap-2 rounded border border-amber-400 bg-amber-50 px-2 py-1 text-[11px] text-amber-900" data-testid="aviso-gemea">
                <span className="min-w-0 flex-1">Já existe um movimento igual de outra importação, conciliado
                  ({sim.gemeas.map((g) => `"${g.descricao}"`).join(', ')}): pode ser duplicado.</span>
                <button type="button" aria-pressed={confirmouGemea} onClick={() => setConfirmouGemea((v) => !v)}
                  className={cn('h-[22px] rounded border px-2', confirmouGemea ? 'border-primary bg-primary text-primary-foreground' : 'border-amber-500 bg-white')}>
                  <span className={confirmouGemea ? undefined : 'invisible'}>✓ </span><span>Criar mesmo assim</span>
                </button>
                {onIgnorarDuplicada && movimento && (
                  <button type="button" onClick={() => onIgnorarDuplicada(movimento.extrato_id)} className="h-[22px] rounded border border-amber-500 bg-white px-2">
                    Ignorar como duplicada
                  </button>
                )}
              </div>
            )}
          </BlocoFormulario>
        </CorpoFormulario>

        <div className="flex shrink-0 items-center gap-2 border-t bg-card px-3 py-1.5">
          <span className={cn('uma-linha-que-rola min-w-0 flex-1 text-[11px]', erro ? 'text-destructive' : 'text-muted-foreground')} title={rodape}
            data-testid="rodape-transferencia">{rodape}</span>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onFechar}>Cancelar</Button>
          <Button size="sm" className="h-7 w-[150px] text-[11px]" onClick={() => void gravar()} disabled={!botao.pode || gravando}
            title={botao.pode ? undefined : botao.motivo} data-testid="gravar-transferencia">
            {gravando ? 'Gravando…' : botao.rotulo}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
