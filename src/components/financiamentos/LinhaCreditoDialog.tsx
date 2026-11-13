/**
 * FIN-GUARDA-CHUVA G2 — o modal da LINHA DE CRÉDITO (proposta aprovada pelo Chat 12/11 22:35, patr-20261112-1657 §4).
 *  · Criar / editar: Banco, Nº da cédula, Programa, Descrição, Limite, Vigência. "Revisar" chama a PRÉVIA do banco
 *    (`fn_linha_credito_salvar`, p_simular) e mostra antes × depois e os avisos; só então o "Salvar" grava (o mesmo pedido).
 *    Mexer num campo depois da revisão apaga a revisão (o Salvar volta a pedir "Revisar").
 *  · Editar mostra os CONTRATOS DA LINHA (`fn_linha_credito_tela`): limite × soma dos planos; liberado/pago em verde, a pagar em
 *    vermelho; toda coluna ordena.
 *  · "Cancelar linha": motivo + prévia (o banco recusa se houver contrato vivo e diz quantos) + confirmar. Nada se apaga.
 * ⚠ SÓ DESENHA E JUNTA O PEDIDO: nenhuma soma aqui (os totais vêm do banco). Recusa escrita no rodapé, nunca toast.
 * ⚠ LUGAR FIXO: a área da revisão tem altura reservada (o rodapé não anda quando a prévia chega).
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { BlocoFormulario, CorpoFormulario, GRADE_FORMULARIO, REGUA_CAMPO, Rotulo } from '@/components/ui/bloco-formulario';
import { useLinhaDeCredito } from '@/hooks/useLinhaDeCredito';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import {
  faixaDaLinha, formDaLinha, formDaLinhaVazio, fraseDoAviso, rotuloDaLinha,
  type ContratoDaLinha, type FormDaLinha, type LinhaDoCadastro, type PreviaDaLinha, type TelaDaLinha,
} from '@/lib/financiamentos/linhaDeCredito';

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const VERDE = 'text-[#15803d]';
const VERMELHO = 'text-[#b91c1c]';
const TOM: Record<'verde' | 'vermelho' | 'neutro', string> = { verde: VERDE, vermelho: VERMELHO, neutro: 'text-foreground' };
const TH = 'h-[20px] px-1 text-[10px] font-semibold text-primary-foreground whitespace-nowrap';
const TD = 'h-[20px] px-1 text-[11px] whitespace-nowrap';
/** a Descrição dos contratos QUEBRA (até 2 linhas, como na lista de Financiamentos; Chat 02:10) — nunca "…" */
const TD_DESCRICAO = 'min-h-[20px] px-1 py-[2px] text-[11px] leading-[1.25] whitespace-normal break-words align-middle';

type Coluna = 'numero' | 'descricao' | 'contratado' | 'liberado' | 'saldo' | 'jurosPagos';
/** o aviso de contrato de outro banco DIZ qual (o nº, clicável): Chat 00:40 (3) */
const FRASE_OUTRO_BANCO = 'Contrato de outro banco nesta linha:';

const COLUNAS: { col: Coluna; rotulo: string; direita?: boolean; largura?: number }[] = [
  { col: 'numero', rotulo: 'Nº', largura: 140 }, { col: 'descricao', rotulo: 'Descrição' },
  { col: 'contratado', rotulo: 'Contratado', direita: true, largura: 96 }, { col: 'liberado', rotulo: 'Liberado', direita: true, largura: 96 },
  { col: 'saldo', rotulo: 'Saldo devedor', direita: true, largura: 96 }, { col: 'jurosPagos', rotulo: 'Juros pagos', direita: true, largura: 86 },
];

export function ordenarContratosDaLinha(cs: readonly ContratoDaLinha[], col: Coluna, dir: 'asc' | 'desc'): ContratoDaLinha[] {
  const s = dir === 'asc' ? 1 : -1;
  return [...cs].sort((a, b) => {
    const va = a[col]; const vb = b[col];
    const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR');
    return s * r || a.id.localeCompare(b.id);
  });
}

export function LinhaCreditoDialog({ aberto, aoFechar, clienteId, linha, aoGravar, aoAbrirContrato }: {
  aberto: boolean;
  aoFechar: () => void;
  clienteId: string | null;
  /** a linha a editar (null = nova) */
  linha: LinhaDoCadastro | null;
  /** depois de gravar (criar, editar ou cancelar): a tela relê */
  aoGravar: () => void;
  /** abre um contrato-filho (o nº no aviso "contrato de outro banco"); ausente = o nº aparece sem link */
  aoAbrirContrato?: (id: string) => void;
}) {
  const { salvar, cancelar, lerTela } = useLinhaDeCredito(clienteId);
  const [form, setForm] = useState<FormDaLinha>(() => (linha ? formDaLinha(linha) : formDaLinhaVazio()));
  const [nomeCredor, setNomeCredor] = useState<string | null>(linha?.credorNome ?? null);
  const [previa, setPrevia] = useState<PreviaDaLinha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tela, setTela] = useState<TelaDaLinha | null>(null);
  const [erroTela, setErroTela] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<{ col: Coluna; dir: 'asc' | 'desc' }>({ col: 'numero', dir: 'asc' });
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [previaCancelar, setPreviaCancelar] = useState<{ ok: boolean; recusa: string | null } | null>(null);

  useEffect(() => {
    if (!aberto || !linha) return;
    let vivo = true;
    void lerTela(linha.id, hojeLocal()).then((r) => {
      if (!vivo) return;
      if (r.ok) { setTela(r.valor); setErroTela(null); } else setErroTela(r.erro);
    });
    return () => { vivo = false; };
  }, [aberto, linha, lerTela]);

  const set = <K extends keyof FormDaLinha>(k: K, v: FormDaLinha[K]) => { setForm((f) => ({ ...f, [k]: v })); setPrevia(null); setErro(null); };
  const nomeDoCredor = (id: string) => (id === form.credorId ? nomeCredor : null);

  const revisar = async () => {
    setOcupado(true); setErro(null);
    const r = await salvar(linha?.id ?? null, form, true, null, nomeDoCredor);
    setOcupado(false);
    if (r.ok) setPrevia(r.valor); else { setPrevia(null); setErro(r.erro); }
  };
  const gravar = async () => {
    setOcupado(true); setErro(null);
    const r = await salvar(linha?.id ?? null, form, false, null, nomeDoCredor);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoGravar(); aoFechar();
  };
  const revisarCancelamento = async () => {
    if (!linha) return;
    setOcupado(true); setErro(null);
    const r = await cancelar(linha.id, motivo, true);
    setOcupado(false);
    if (r.ok) setPreviaCancelar(r.valor); else setErro(r.erro);
  };
  const confirmarCancelamento = async () => {
    if (!linha) return;
    setOcupado(true); setErro(null);
    const r = await cancelar(linha.id, motivo, false);
    setOcupado(false);
    if (!r.ok) { setErro(r.erro); return; }
    aoGravar(); aoFechar();
  };

  const contratos = useMemo(() => (tela ? ordenarContratosDaLinha(tela.contratos, ordem.col, ordem.dir) : []), [tela, ordem]);
  const aoOrdenar = (col: Coluna) => setOrdem((o) => (o.col === col ? { col, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }));
  const podeSalvar = !!previa && previa.ok && !previa.semMudanca && !ocupado;
  const titulo = linha ? `Linha de crédito · ${rotuloDaLinha(linha)}` : 'Nova linha de crédito';

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[560px] w-[820px] max-w-[95vw] flex-col gap-0 p-0" data-testid="linha-credito-dialog">
        <div className="flex h-[36px] shrink-0 items-center border-b px-3">
          <DialogTitle className="min-w-0 flex-1 truncate text-[13px] font-semibold" title={titulo}>{titulo}</DialogTitle>
          <DialogDescription className="sr-only">Cadastro da linha de crédito (cédula) e os contratos-filhos dela.</DialogDescription>
        </div>
        {/* UM scrollport: o corpo não rola; só o corpo da tabela dos contratos (cabeçalho preso), que fica com o que sobra da altura */}
        <CorpoFormulario className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <BlocoFormulario titulo="Cédula" dica="a linha guarda os contratos (planos) do mesmo banco" className="shrink-0" testId="bloco-cedula">
            {/* Chat 00:40 (1): nome nunca corta — o Banco tem a 1ª linha inteira (o seletor corta com "…" o que não cabe); Programa · Nº · Descrição na 2ª; Limite (cabe o maior valor) e datas na 3ª */}
            <fieldset disabled={cancelando} className={`${GRADE_FORMULARIO} grid-cols-12`}>
              <div className="col-span-12"><Rotulo texto="Banco (credor)" obrig />
                <FavorecidoSelect value={form.credorId ?? ''} clienteId={clienteId} triggerClassName={REGUA_CAMPO}
                  onChange={(id) => set('credorId', id || null)} onSelected={(f) => setNomeCredor(f.nome ?? null)} /></div>
              <div className="col-span-5"><Rotulo texto="Programa" /><Input className={REGUA_CAMPO} value={form.programa} onChange={(e) => set('programa', e.target.value)} placeholder="FCO, Pronaf…" /></div>
              <div className="col-span-2"><Rotulo texto="Nº da cédula" /><Input className={REGUA_CAMPO} value={form.numero} onChange={(e) => set('numero', e.target.value)} placeholder="PR-00.000" /></div>
              <div className="col-span-5"><Rotulo texto="Descrição" /><Input className={REGUA_CAMPO} value={form.descricao} onChange={(e) => set('descricao', e.target.value)} /></div>
              <div className="col-span-4"><Rotulo texto="Limite" /><CampoMoeda className={REGUA_CAMPO} valor={form.limite} onChange={(v) => set('limite', v ?? null)} /></div>
              <div className="col-span-4"><Rotulo texto="Início da vigência" /><DatePicker size="compact" className={REGUA_CAMPO} value={form.vigenciaInicio ?? ''} onChange={(v) => set('vigenciaInicio', v || null)} /></div>
              <div className="col-span-4"><Rotulo texto="Fim da vigência" /><DatePicker size="compact" className={REGUA_CAMPO} value={form.vigenciaFim ?? ''} onChange={(v) => set('vigenciaFim', v || null)} /></div>
            </fieldset>
          </BlocoFormulario>

          {linha && (
            <BlocoFormulario titulo="Contratos da linha" dica="liquidação de um plano por outro da mesma linha não soma duas vezes" className="flex min-h-0 flex-1 flex-col" testId="bloco-contratos-da-linha">
              {erroTela ? <p className="text-[11px] text-amber-700">{erroTela}</p> : !tela ? <p className="text-[11px] text-muted-foreground">Carregando…</p> : (
                <>
                  <div className="mb-1 flex shrink-0 flex-wrap gap-x-4 text-[11px]" data-testid="faixa-da-linha">
                    {faixaDaLinha(tela.totais, tela.linha.limite).map((i) => (
                      <span key={i.rotulo} className="whitespace-nowrap"><span className="text-muted-foreground">{i.rotulo} </span>
                        <span className={`font-semibold tabular-nums ${TOM[i.tom]}`}>{i.valor}</span></span>
                    ))}
                  </div>
                  {/* o aviso fica ACIMA da tabela: quando a Revisão entra, a tabela encolhe por baixo e nada se desloca */}
                  {tela.avisos.length > 0 && (
                    <p className="mb-1 shrink-0 text-[10px] text-amber-700" data-testid="avisos-da-linha">
                      {tela.avisos.map((a, i) => (
                        <span key={a}>{i > 0 ? ' · ' : ''}{a === 'contrato_de_outro_credor' ? (
                          <>{FRASE_OUTRO_BANCO}{' '}{tela.contratos.filter((c) => c.credorDiferente).map((c, k) => (
                            <span key={c.id}>{k > 0 ? ', ' : ''}{aoAbrirContrato
                              ? <button type="button" className="font-semibold underline hover:text-amber-900" onClick={() => { aoFechar(); aoAbrirContrato(c.id); }}
                                  title={`Abrir o contrato ${c.numero ?? ''}`} data-testid="abrir-contrato-de-outro-banco">{c.numero ?? 'sem nº'}</button>
                              : <span className="font-semibold">{c.numero ?? 'sem nº'}</span>}</span>
                          ))}</>
                        ) : fraseDoAviso(a)}</span>
                      ))}
                    </p>
                  )}
                  <div className="min-h-0 flex-1 overflow-y-auto rounded border" data-testid="rolagem-contratos-da-linha">
                    <table className="w-full table-fixed border-collapse" data-testid="tabela-contratos-da-linha">
                      <colgroup>{COLUNAS.map((c) => <col key={c.col} style={c.largura ? { width: c.largura } : undefined} />)}</colgroup>
                      <thead className="sticky top-0 bg-primary"><tr>
                        {COLUNAS.map((c) => (
                          <th key={c.col} className={`${TH} ${c.direita ? 'text-right' : 'text-left'}`}>
                            <button type="button" className="inline-flex items-center gap-0.5" onClick={() => aoOrdenar(c.col)}>
                              {c.rotulo}{ordem.col !== c.col ? <ChevronsUpDown className="size-2.5 opacity-60" /> : ordem.dir === 'asc' ? <ChevronUp className="size-2.5" /> : <ChevronDown className="size-2.5" />}
                            </button>
                          </th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {contratos.length === 0 ? (
                          <tr><td colSpan={COLUNAS.length} className={`${TD} text-muted-foreground`}>Nenhum contrato nesta linha. Ligue os contratos pelo cadastro de cada um.</td></tr>
                        ) : contratos.map((c) => (
                          <tr key={c.id} className="border-b border-[#eef0f3]">
                            <td className={`${TD} tabular-nums`}>{c.numero ?? '—'}</td>
                            <td className={TD_DESCRICAO} title={c.descricao ?? ''}>{c.descricao ?? '—'}{c.credorDiferente ? <span className="ml-1 text-amber-700">· outro banco</span> : null}</td>
                            <td className={`${TD} text-right tabular-nums`}>{fmt(c.contratado)}</td>
                            <td className={`${TD} text-right tabular-nums ${VERDE}`} title={c.liberadoPorLiquidacao ? `+ ${fmt(c.liberadoPorLiquidacao)} por liquidação de outro plano da linha (fora da soma)` : undefined}>{fmt(c.liberado)}</td>
                            <td className={`${TD} text-right tabular-nums ${c.saldo > 0 ? VERMELHO : ''}`}>{fmt(c.saldo)}</td>
                            <td className={`${TD} text-right tabular-nums ${VERDE}`}>{fmt(c.jurosPagos)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </BlocoFormulario>
          )}

          {/* Chat 00:40 (2): a Revisão só ocupa lugar depois do "Revisar" (ou do "Cancelar linha"): antes, a tabela dos contratos fica com a altura */}
          {(cancelando || previa) && <BlocoFormulario titulo="Revisão" dica={cancelando ? 'cancelar a linha: nada se apaga, a linha fica cancelada, com o motivo' : 'o que o banco vai gravar, antes × depois'} className="shrink-0" testId="bloco-revisao">
            <div className="h-[96px] overflow-y-auto text-[11px]" data-testid="area-da-revisao">
              {cancelando ? (
                <div className="flex flex-col gap-1">
                  <div><Rotulo texto="Motivo" obrig /><Input className={REGUA_CAMPO} value={motivo} onChange={(e) => { setMotivo(e.target.value); setPreviaCancelar(null); }} /></div>
                  {previaCancelar && (previaCancelar.ok
                    ? <p className="text-[11px]">Pode cancelar: a linha não tem contrato vivo.</p>
                    : <p className={`text-[11px] ${VERMELHO}`}>{previaCancelar.recusa}</p>)}
                </div>
              ) : !previa ? null : previa.recusa ? (
                <p className={VERMELHO}>{previa.recusa}</p>
              ) : previa.semMudanca ? (
                <p className="text-muted-foreground">Nada mudou.</p>
              ) : (
                <>
                  <table className="w-full table-fixed border-collapse">
                    <colgroup><col style={{ width: 130 }} /><col /><col /></colgroup>
                    <tbody>
                      {previa.mudancas.map((m) => (
                        <tr key={m.campo}>
                          <td className={`${TD} text-muted-foreground`}>{m.campo}</td>
                          <td className={`${TD} truncate`} title={m.antes ?? ''}>{m.antes ?? '—'}</td>
                          <td className={`${TD} truncate font-semibold`} title={m.depois ?? ''}>{m.depois ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previa.avisos.length > 0 && <p className="mt-1 text-amber-700">{previa.avisos.join(' · ')}</p>}
                </>
              )}
            </div>
          </BlocoFormulario>}
        </CorpoFormulario>

        <div className="flex h-[44px] shrink-0 items-center gap-2 border-t px-3">
          {linha && !cancelando && (
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => { setCancelando(true); setErro(null); }} data-testid="cancelar-linha">Cancelar linha</Button>
          )}
          <span className={`min-w-0 flex-1 truncate text-[11px] ${VERMELHO}`} title={erro ?? ''} data-testid="erro-da-linha">{erro ?? ''}</span>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => { if (cancelando) { setCancelando(false); setPreviaCancelar(null); } else aoFechar(); }}>
            {cancelando ? 'Voltar' : 'Fechar'}
          </Button>
          {cancelando ? (
            previaCancelar?.ok
              ? <Button size="sm" className="h-7 w-[150px] text-[11px]" disabled={ocupado || !motivo.trim()} onClick={() => void confirmarCancelamento()} data-testid="confirmar-cancelamento">Confirmar cancelamento</Button>
              : <Button size="sm" className="h-7 w-[150px] text-[11px]" disabled={ocupado} onClick={() => void revisarCancelamento()} data-testid="revisar-cancelamento">Revisar cancelamento</Button>
          ) : podeSalvar
            ? <Button size="sm" className="h-7 w-[150px] bg-cta text-[11px] text-cta-foreground hover:bg-cta-hover" onClick={() => void gravar()} data-testid="salvar-linha">Salvar</Button>
            : <Button size="sm" className="h-7 w-[150px] text-[11px]" disabled={ocupado} onClick={() => void revisar()} data-testid="revisar-linha">Revisar</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
