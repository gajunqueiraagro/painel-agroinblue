import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatNum } from '@/lib/calculos/formatters';
import { linhasDaEntrega, precoDoContrato, itensEnviarTodos, datasFaltando } from '@/lib/oc/entregasPorLote';
import type { RecebimentoApi, LoteRecebimento, SaidaAdotavel } from '@/hooks/useOperacaoRecebimento';
import type { LadoContaCorrente } from '@/lib/oc/contaCorrente';

/* OC-VENDA-ENTREGAS-01a — a aba Entrega da VENDA, uma linha por saida de cada lote (mock
   docs/mocks/oc_venda_entregas_mock_v2.html). Cada lote ADOTA a saida que ja esta lancada no zootecnico
   ("Adotar saida ja lancada") ou registra uma nova ("Registrar nova saida", o modal de sempre).

   ⚠ SO' NA VENDA: o `AbaRecebimentoLotes` monta esta tabela quando recebe `adocao`, e so' o `VendaModalShell`
     a passa. O abate tambem usa `isCompra={false}` e fica como estava (D4a: abate e compra no OC-ADOTAR-TODOS-01).
   ⚠ NADA TRUNCADO: rotulo, lancamento e contexto quebram linha — reticencia e' proibida (27/09/2026).
   ⚠ RECUSA AO LADO DO BOTAO, nunca em toast (UX-TOAST-01): as funcoes de adocao devolvem a mensagem. */

const fmtBr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const idCurto = (id: string) => id.slice(0, 8);
const TH = 'px-1.5 py-1 text-center text-[10px] font-medium text-muted-foreground';
const TD = 'px-1.5 py-1 align-top text-[11px]';
const VERDE = 'text-emerald-700 dark:text-emerald-400';

/* OC-CONTA-CORRENTE-TODOS-01a — a compra adota ENTRADA ja' lancada (o mesmo `oc_adotar_movimentacao`, que ja' casava o tipo). So' as
   palavras mudam: a venda segue com as frases de antes. */
const TEXTOS: Record<LadoContaCorrente, {
  mov: string; movs: string; Mov: string; valor: string; contraparte: (nome: string) => string;
}> = {
  venda: { mov: 'saída', movs: 'saídas', Mov: 'Saída', valor: 'Valor da entrega', contraparte: nome => ` para ${nome} ou sem comprador gravado` },
  compra: { mov: 'entrada', movs: 'entradas', Mov: 'Entrada', valor: 'Valor da entrada', contraparte: nome => ` de ${nome} ou sem fornecedor gravado` },
};

function origemDoLancamento(s: SaidaAdotavel): string {
  const quando = s.criadoEm ? fmtBr(s.criadoEm.slice(0, 10)).slice(0, 5) : null;
  const como = s.origemRegistro === 'importacao_historica' ? 'importado' : 'lançado';
  return `${idCurto(s.lancamentoId)} · ${como}${quando ? ` ${quando}` : ''}`;
}

interface Props {
  api: RecebimentoApi;
  catLabel: (slug: string | null | undefined) => string;
  readOnly: boolean;
  fazendaNome: string | null;
  contraparteNome: string | null;
  onRegistrarNova: (loteId: string) => void;
  onEstornar: (movimentacaoId: string) => void;
  lado?: LadoContaCorrente;
}

export function EntregasVendaTabela({ api, catLabel, readOnly, fazendaNome, contraparteNome, onRegistrarNova, onEstornar, lado = 'venda' }: Props) {
  const t = TEXTOS[lado];
  const [loteAdotando, setLoteAdotando] = useState<LoteRecebimento | null>(null);
  const [saidas, setSaidas] = useState<SaidaAdotavel[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [erroSeletor, setErroSeletor] = useState<string | null>(null);
  const [erroTabela, setErroTabela] = useState<string | null>(null);

  const linhas = linhasDaEntrega(api.lotes, api.movimentacoes);

  const abrirSeletor = async (lote: LoteRecebimento) => {
    setLoteAdotando(lote); setMarcadas(new Set()); setErroSeletor(null); setSaidas([]); setCarregando(true);
    const r = await api.listarAdotaveis(lote.loteId);
    setSaidas(r.saidas); setErroSeletor(r.erro); setCarregando(false);
  };
  const fecharSeletor = () => { setLoteAdotando(null); setMarcadas(new Set()); setErroSeletor(null); setSaidas([]); };
  const alternar = (id: string) => setMarcadas(prev => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const confirmarAdocao = async () => {
    if (!loteAdotando) return;
    if (marcadas.size === 0) { setErroSeletor(`Selecione ao menos uma ${t.mov}.`); return; }
    // na ordem da lista, para a trilha sair na mesma ordem que o operador viu
    const ids = saidas.filter(s => marcadas.has(s.lancamentoId)).map(s => s.lancamentoId);
    const erro = await api.adotar(loteAdotando.loteId, ids);
    if (erro) { setErroSeletor(erro); return; }
    fecharSeletor();
  };
  const desvincular = async (movimentacaoId: string) => {
    setErroTabela(null);
    const erro = await api.desvincular(movimentacaoId);
    if (erro) setErroTabela(erro);
  };

  return (
    <div className="space-y-1.5">
      <table className="w-full border-collapse" data-testid="entregas-venda">
        <thead>
          <tr className="border-b">
            <th className={TH}>Lote</th><th className={TH}>Contratado</th><th className={TH}>Data da {t.mov}</th>
            <th className={TH}>Cab</th><th className={TH}>Peso</th><th className={TH}>{t.valor}</th>
            <th className={TH}>Origem da {t.mov}</th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 && (
            <tr><td colSpan={7} className={`${TD} text-center text-muted-foreground`}>{api.loading ? 'Carregando…' : 'Nenhum lote negociado.'}</td></tr>
          )}
          {linhas.map(ln => {
            const l = ln.lote;
            const rotuloLote = `${catLabel(l.categoria)} · ${precoDoContrato(l)}`;
            const chave = ln.tipo === 'saida' ? ln.mov.id : `pend-${l.loteId}`;
            return (
              <tr key={chave} className="border-b border-border/60" data-linha={ln.tipo}>
                <td className={`${TD} break-words`}>{rotuloLote}</td>
                <td className={`${TD} text-center tabular-nums`}>{l.qtdNegociada != null ? `${l.qtdNegociada} cab` : '—'}</td>
                {ln.tipo === 'saida' ? (
                  <>
                    <td className={`${TD} text-center tabular-nums`}>{fmtBr(ln.mov.data || null)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{ln.mov.quantidade}</td>
                    <td className={`${TD} text-right tabular-nums`}>{ln.mov.pesoMedio != null ? `${formatNum(ln.mov.pesoMedio, 2)} kg` : '—'}</td>
                    <td className={`${TD} text-right tabular-nums ${VERDE}`}>{ln.mov.valorTotal != null ? formatNum(ln.mov.valorTotal, 2) : '—'}</td>
                    <td className={`${TD} text-center`}>
                      <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
                        {ln.mov.origem === 'adotada' ? (
                          <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[10px] text-emerald-700" data-selo="adotada">
                            adotada · {idCurto(ln.mov.lancamentoId)}
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-1.5 py-px text-[10px] text-slate-600" data-selo="registrada">registrada</span>
                        )}
                        {!readOnly && ln.mov.origem === 'adotada' && (
                          <button type="button" disabled={api.saving} onClick={() => void desvincular(ln.mov.id)}
                            className="text-[10px] text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground">
                            desvincular
                          </button>
                        )}
                        {!readOnly && ln.mov.origem === 'registrada' && (
                          <button type="button" disabled={api.saving} onClick={() => onEstornar(ln.mov.id)}
                            className="text-[10px] text-muted-foreground hover:text-destructive disabled:cursor-not-allowed">
                            estornar
                          </button>
                        )}
                      </span>
                    </td>
                  </>
                ) : (
                  <>
                    <td className={`${TD} text-center text-muted-foreground`}>—</td>
                    <td className={`${TD} text-right text-muted-foreground`}>{ln.falta != null ? `falta ${ln.falta}` : '—'}</td>
                    <td className={`${TD} text-right text-muted-foreground`}>—</td>
                    <td className={`${TD} text-right text-muted-foreground`}>—</td>
                    <td className={`${TD} text-center`}>
                      <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
                        <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] text-amber-700" data-selo="pendente">pendente</span>
                        {!readOnly && (
                          <>
                            <button type="button" disabled={api.saving} onClick={() => void abrirSeletor(l)}
                              className="text-[10px] text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground">
                              Adotar {t.mov} já lançada
                            </button>
                            <button type="button" disabled={api.saving} onClick={() => onRegistrarNova(l.loteId)}
                              className="text-[10px] text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground">
                              Registrar nova {t.mov}
                            </button>
                          </>
                        )}
                      </span>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {erroTabela && <div className="text-[10px] text-destructive" role="alert">{erroTabela}</div>}

      {loteAdotando && (
        <div className="rounded-md border bg-muted/10 p-1.5 space-y-1" data-testid="seletor-adocao">
          <div className="text-[11px] font-medium text-foreground break-words">
            Adotar {t.mov} já lançada · {catLabel(loteAdotando.categoria)}
            {loteAdotando.qtdNegociada != null ? `, ${Math.max(loteAdotando.qtdNegociada - loteAdotando.qtdRecebida, 0)} cab` : ''}
            <span className="font-normal text-muted-foreground">
              {' '}· mostrando {t.movs} da {fazendaNome ?? 'fazenda da operação'} de {catLabel(loteAdotando.categoria)}
              {contraparteNome ? t.contraparte(contraparteNome) : ''} ainda sem OC, as mais perto da data da operação primeiro
            </span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className={TH}><span className="sr-only">Selecionar</span></th>
                <th className={TH}>Data</th><th className={TH}>Categoria</th><th className={TH}>Cab</th>
                <th className={TH}>Peso</th><th className={TH}>Valor</th><th className={TH}>Lançamento</th>
              </tr>
            </thead>
            <tbody>
              {carregando && (<tr><td colSpan={7} className={`${TD} text-center text-muted-foreground`}>Carregando…</td></tr>)}
              {!carregando && saidas.length === 0 && !erroSeletor && (
                <tr><td colSpan={7} className={`${TD} text-center text-muted-foreground`}>Nenhuma {t.mov} desta categoria disponível para adotar.</td></tr>
              )}
              {saidas.map(s => (
                <tr key={s.lancamentoId} className="border-b border-border/60" data-adotavel={s.lancamentoId}>
                  <td className={`${TD} text-center`}>
                    <Checkbox checked={marcadas.has(s.lancamentoId)} onCheckedChange={() => alternar(s.lancamentoId)}
                      aria-label={`Selecionar ${t.mov} de ${fmtBr(s.data)}`} className="h-3.5 w-3.5" />
                  </td>
                  <td className={`${TD} text-center tabular-nums`}>{fmtBr(s.data)}</td>
                  <td className={`${TD} text-center`}>{catLabel(s.categoria)}</td>
                  <td className={`${TD} text-right tabular-nums`}>{s.quantidade}</td>
                  <td className={`${TD} text-right tabular-nums`}>{s.pesoMedio != null ? `${formatNum(s.pesoMedio, 2)} kg` : '—'}</td>
                  <td className={`${TD} text-right tabular-nums ${VERDE}`}>{s.valorTotal != null ? formatNum(s.valorTotal, 2) : '—'}</td>
                  <td className={`${TD} text-center break-words`}>{origemDoLancamento(s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {erroSeletor && <span className="text-[10px] text-destructive" role="alert">{erroSeletor}</span>}
            <Button type="button" variant="ghost" size="sm" className="h-[22px] px-[9px] text-[10px] font-medium" onClick={fecharSeletor}>Cancelar</Button>
            <Button type="button" size="sm" className="h-[22px] px-[9px] text-[10px] font-medium" disabled={api.saving}
              onClick={() => void confirmarAdocao()}>
              {api.saving ? 'Adotando…' : `Adotar ${marcadas.size} ${marcadas.size === 1 ? t.mov : t.movs}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* "Enviar todos" da venda (D3): uma data POR LINHA, editavel, sem gravar no lote. Vazia fica vermelha com a
   frase embaixo e nada grava (UX-OBRIGATORIOS-01). */
export function EnviarTodosDialog({ lotes, dataPadrao, catLabel, saving, onConfirmar, onFechar, lado = 'venda' }: {
  lotes: LoteRecebimento[]; dataPadrao: string; catLabel: (slug: string | null | undefined) => string;
  saving: boolean; onConfirmar: (datas: Record<string, string>) => void; onFechar: () => void; lado?: LadoContaCorrente;
}) {
  const t = TEXTOS[lado];
  const [itens, setItens] = useState(() => itensEnviarTodos(lotes, dataPadrao));
  const [cobrar, setCobrar] = useState(false);
  const faltando = datasFaltando(itens);
  const loteDe = (id: string) => lotes.find(l => l.loteId === id);
  const enviar = () => {
    if (faltando.size > 0) { setCobrar(true); return; }
    onConfirmar(Object.fromEntries(itens.map(i => [i.loteId, i.data])));
  };
  return (
    <Dialog open onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-[12px]">Enviar todos conforme negociado</DialogTitle></DialogHeader>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b"><th className={TH}>Lote</th><th className={TH}>Cab</th><th className={TH}>Data da {t.mov} *</th></tr>
          </thead>
          <tbody>
            {itens.map(i => {
              const lote = loteDe(i.loteId);
              const vermelho = cobrar && faltando.has(i.loteId);
              return (
                <tr key={i.loteId} className="border-b border-border/60" data-enviar={i.loteId}>
                  <td className={`${TD} break-words`}>{catLabel(lote?.categoria)}{lote ? ` · ${precoDoContrato(lote)}` : ''}</td>
                  <td className={`${TD} text-right tabular-nums`}>{i.falta}</td>
                  <td className={TD}>
                    <DatePicker value={i.data} size="compact"
                      onChange={v => setItens(prev => prev.map(x => (x.loteId === i.loteId ? { ...x, data: v } : x)))}
                      className={vermelho ? 'border-destructive' : undefined} />
                    {vermelho && <div className="mt-0.5 text-[10px] text-destructive">Informe a data da {t.mov}.</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" className="h-[22px] px-[9px] text-[10px] font-medium" onClick={onFechar}>Cancelar</Button>
          <Button type="button" size="sm" className="h-[22px] px-[9px] text-[10px] font-medium" disabled={saving} onClick={enviar}>
            {`Enviar ${itens.length} lote${itens.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
