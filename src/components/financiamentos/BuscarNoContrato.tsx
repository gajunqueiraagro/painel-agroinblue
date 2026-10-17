/**
 * FIN-FINANC-28 · PASSO 4b — "Buscar entradas" (liberações, e os encargos do credor perto delas) e "Buscar pagamento" (por parcela),
 * no molde da OC: o banco SUGERE (`fn_financiamento_candidatas`, com pontos e motivos) e o banco DECIDE (o vincular tem
 * simulação: a prévia é a própria gravação desfeita). Esta peça só desenha e confirma.
 *
 * ⚠ DIÁLOGOS DE TAMANHO FIXO, um scrollport (a lista, cabeçalho preso), régua `table-fixed` em px, uma linha por registro (só texto
 *   corta, inteiro no `title`), e um LUGAR RESERVADO para a prévia / recusa — nada muda de altura ao escolher.
 * ⚠ GESTO CONTRÁRIO: liberação se remove no bloco Liberações; o pagamento se desvincula na linha do cronograma; o encargo, pelo
 *   bloco de encargos do contrato.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Segmentado } from '@/components/ui/segmentado';
import { Checkbox } from '@/components/ui/checkbox';
import type { useContratoDeCredito } from '@/hooks/useContratoDeCredito';
import {
  PAPEIS, ROTULO_DO_PAPEL, fraseDoOutro,
  type BuscaNoContrato, type Candidata, type EncargoSugerido, type PapelDoPagamento, type ResultadoDoVinculo,
} from '@/lib/financiamentos/buscaNoContrato';
import type { ParcelaDoContrato } from '@/lib/financiamentos/situacaoDoContrato';

type ApiDoContrato = ReturnType<typeof useContratoDeCredito>;

const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');
const TH = 'sticky top-0 z-10 h-[22px] bg-primary px-2 text-left text-[9.5px] font-semibold text-primary-foreground whitespace-nowrap overflow-hidden text-ellipsis';
const TH_R = `${TH} text-right`;
const TD = 'h-[22px] px-2 text-[10px] whitespace-nowrap overflow-hidden text-ellipsis';
const TD_R = `${TD} text-right tabular-nums`;

/** A régua das duas listas (px). Só a Descrição fica sem largura (o resto) e corta. */
export const REGUA_DA_BUSCA: Readonly<Record<'data' | 'valor' | 'conta' | 'favorecido' | 'extrato' | 'motivo' | 'acao', number>> = {
  data: 64, valor: 92, conta: 110, favorecido: 120, extrato: 44, motivo: 170, acao: 120,
};

function Casca({ titulo, aoFechar, children, testId }: { titulo: string; aoFechar: () => void; children: React.ReactNode; testId: string }) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[520px] w-[1000px] max-w-[1000px] flex-col gap-0 overflow-hidden p-0" data-testid={testId}>
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 text-primary-foreground">
          <DialogTitle className="truncate text-[11px] font-semibold">{titulo}</DialogTitle>
          <DialogDescription className="sr-only">{titulo}</DialogDescription>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function Cols() {
  const r = REGUA_DA_BUSCA;
  return (
    <colgroup>
      <col style={{ width: r.data }} /><col style={{ width: r.valor }} /><col style={{ width: r.conta }} /><col />
      <col style={{ width: r.favorecido }} /><col style={{ width: r.extrato }} /><col style={{ width: r.motivo }} /><col style={{ width: r.acao }} />
    </colgroup>
  );
}

function Cabecalho({ ultima }: { ultima: string }) {
  return (
    <thead><tr>
      <th className={TH}>Data</th><th className={TH_R}>Valor</th><th className={TH}>Conta</th><th className={TH}>Descrição</th>
      <th className={TH}>Favorecido</th><th className={TH}>Extrato</th><th className={TH}>Por quê</th><th className={TH}>{ultima}</th>
    </tr></thead>
  );
}

function CelulasDaCandidata({ c }: { c: Candidata }) {
  return (
    <>
      <td className={`${TD} tabular-nums`}>{br(c.data)}</td>
      <td className={TD_R}>{num2(c.valor)}</td>
      <td className={TD} title={c.conta ?? undefined}>{c.conta ?? '—'}</td>
      <td className={TD} title={c.descricao ?? undefined}>{c.descricao ?? '—'}</td>
      <td className={TD} title={c.favorecido ?? undefined}>{c.favorecido ?? '—'}</td>
      <td className={TD}>{c.extrato ? <span className="text-[#15803d]" title="casado com o extrato do banco">✓</span> : <span className="text-muted-foreground">—</span>}</td>
      <td className={`${TD} text-muted-foreground`} title={c.motivos.join(' · ')}>{c.motivos.join(' · ') || '—'}</td>
    </>
  );
}

/** o lugar reservado de 30px: a prévia, a recusa ou o recado — sempre presente */
function Lugar({ texto, tom, testId }: { texto: string | null; tom: 'erro' | 'aviso' | 'ok' | 'neutro'; testId: string }) {
  const cor = tom === 'erro' ? 'text-destructive' : tom === 'aviso' ? 'text-amber-700' : tom === 'ok' ? 'text-[#15803d]' : 'text-muted-foreground';
  return <div className={`h-[30px] shrink-0 overflow-hidden px-3 pt-1 text-[10px] leading-[13px] ${cor}`} title={texto ?? undefined} data-testid={testId}>{texto ?? ''}</div>;
}

/* ═══ BUSCAR ENTRADAS (liberações) + encargos perto delas ═════════════════════════════════════════════════════════════════ */
export function BuscarEntradasDialog({ api, aoFechar }: { api: ApiDoContrato; aoFechar: () => void }) {
  const [busca, setBusca] = useState<BuscaNoContrato | string | null>(null);
  const [encargos, setEncargos] = useState<EncargoSugerido[] | string | null>(null);
  const [recado, setRecado] = useState<{ texto: string; tom: 'erro' | 'ok' } | null>(null);
  const [gravando, setGravando] = useState<string | null>(null);
  const datas = (api.liberacoes ?? []).map((l) => l.data);
  const chaveDasDatas = datas.join('|');
  const ler = useCallback(() => {
    void api.buscar('liberacao', null).then(setBusca);
    void api.lerEncargosPerto(chaveDasDatas ? chaveDasDatas.split('|') : []).then(setEncargos);
  }, [api.buscar, api.lerEncargosPerto, chaveDasDatas]);
  useEffect(() => { ler(); }, [ler]);

  const vincular = async (c: Candidata) => {
    if (!c.data) return;
    setGravando(c.lancamentoId); setRecado(null);
    const erro = await api.salvarLiberacao({ id: null, data: c.data, valor: c.valor, forma: 'conta', lancamentoId: c.lancamentoId,
      fornecedorId: null, contratoLiquidadoId: null, destinacaoId: null, observacao: null });
    setGravando(null);
    setRecado(erro ? { texto: erro, tom: 'erro' } : { texto: `Liberação de ${br(c.data)} · R$ ${num2(c.valor)} gravada, ligada ao lançamento. Remova no bloco Liberações para desfazer.`, tom: 'ok' });
    if (!erro) ler();
  };
  const vincularEncargo = async (e: EncargoSugerido) => {
    setGravando(e.lancamentoId); setRecado(null);
    const erro = await api.vincularEncargo(e);
    setGravando(null);
    setRecado(erro ? { texto: erro, tom: 'erro' } : { texto: `Encargo (${e.papel}) de R$ ${num2(e.valor)} ligado ao contrato.`, tom: 'ok' });
    if (!erro) ler();
  };

  const b = typeof busca === 'object' ? busca : null;
  return (
    <Casca titulo="Buscar entradas de captação" aoFechar={aoFechar} testId="buscar-entradas">
      <div className="flex h-[24px] shrink-0 items-center gap-3 px-3 text-[10px] text-muted-foreground" data-testid="buscar-entradas-topo">
        <span>entradas do cliente sem contrato · plano de entrada de financiamento, credor ou nº do contrato na descrição</span>
        {b && <span className="ml-auto shrink-0 tabular-nums">falta liberar <b className="text-foreground">R$ {num2(b.saldoALiberar ?? 0)}</b> · {br(b.de)} a {br(b.ate)}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3" data-testid="lista-entradas">
        <table className="w-full table-fixed border-collapse">
          <Cols /><Cabecalho ultima="" />
          <tbody>
            {busca === null && <tr><td colSpan={8} className={`${TD} text-muted-foreground`}>Buscando…</td></tr>}
            {typeof busca === 'string' && <tr><td colSpan={8} className={`${TD} text-destructive`}>{busca}</td></tr>}
            {b && b.linhas.length === 0 && <tr><td colSpan={8} className={`${TD} text-muted-foreground`} data-testid="entradas-vazio">Nenhuma entrada candidata na janela do contrato.</td></tr>}
            {b?.linhas.map((c) => (
              <tr key={c.lancamentoId} className="border-b" data-testid="candidata-entrada">
                <CelulasDaCandidata c={c} />
                <td className={TD}>
                  <Button size="sm" variant="outline" className="h-[18px] px-1.5 text-[9.5px]" disabled={gravando !== null || !c.data}
                    onClick={() => void vincular(c)} data-testid="vincular-como-liberacao">Vincular como liberação</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* os encargos do credor perto das liberações: lugar fixo de 92px, a lista rola por dentro */}
      <div className="h-[92px] shrink-0 border-t px-3 pt-1" data-testid="encargos-perto">
        <div className="mb-0.5 flex h-[16px] items-center gap-2 text-[10px]">
          <span className="font-semibold">Encargos do credor perto das liberações</span>
          <span className="text-muted-foreground">IOF, tarifa/TAC e seguro a até 15 dias de uma liberação</span>
        </div>
        <div className="h-[70px] overflow-y-auto">
          {datas.length === 0 && <div className="text-[10px] text-muted-foreground">Sem liberação gravada: grave a liberação primeiro.</div>}
          {datas.length > 0 && encargos === null && <div className="text-[10px] text-muted-foreground">Buscando…</div>}
          {typeof encargos === 'string' && <div className="text-[10px] text-destructive">{encargos}</div>}
          {Array.isArray(encargos) && datas.length > 0 && encargos.length === 0 && <div className="text-[10px] text-muted-foreground">Nenhum encargo solto do credor nessa janela.</div>}
          {Array.isArray(encargos) && encargos.map((e) => (
            <div key={e.lancamentoId} className="flex h-[20px] items-center gap-2 text-[10px]" data-testid="encargo-sugerido">
              <span className="w-[56px] shrink-0 tabular-nums">{br(e.data)}</span>
              <span className="w-[48px] shrink-0 uppercase text-muted-foreground">{e.papel}</span>
              <span className="min-w-0 flex-1 truncate" title={e.descricao ?? undefined}>{e.descricao ?? '—'}</span>
              <span className="w-[84px] shrink-0 text-right tabular-nums">{num2(e.valor)}</span>
              <Button size="sm" variant="outline" className="h-[18px] shrink-0 px-1.5 text-[9.5px]" disabled={gravando !== null}
                onClick={() => void vincularEncargo(e)} data-testid="vincular-encargo">Vincular como encargo</Button>
            </div>
          ))}
        </div>
      </div>
      <Lugar texto={recado?.texto ?? null} tom={recado?.tom ?? 'neutro'} testId="recado-entradas" />
      <div className="flex h-[36px] shrink-0 items-center justify-end border-t px-3">
        <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>Fechar</Button>
      </div>
    </Casca>
  );
}

/* ═══ BUSCAR PAGAMENTO (uma parcela) ═════════════════════════════════════════════════════════════════════════════════════ */
export function BuscarPagamentoDialog({ api, parcela, aoFechar }: { api: ApiDoContrato; parcela: ParcelaDoContrato; aoFechar: () => void }) {
  const [busca, setBusca] = useState<BuscaNoContrato | string | null>(null);
  const [escolhida, setEscolhida] = useState<Candidata | null>(null);
  const [papel, setPapel] = useState<PapelDoPagamento>('principal');
  const [mover, setMover] = useState(false);
  const [previa, setPrevia] = useState<ResultadoDoVinculo | string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);

  useEffect(() => { void api.buscar('parcela', parcela.id).then(setBusca); }, [api.buscar, parcela.id]);

  /* a prévia é a própria gravação desfeita: refaz só quando muda o que muda a resposta */
  const lancId = escolhida?.lancamentoId ?? null;
  useEffect(() => {
    if (!lancId) { setPrevia(null); return; }
    let vivo = true;
    setPrevia(null);
    void api.vincularPagamento(parcela.id, lancId, papel, mover, true).then((r) => { if (vivo) setPrevia(r); });
    return () => { vivo = false; };
  }, [api.vincularPagamento, parcela.id, lancId, papel, mover]);

  const escolher = (c: Candidata) => {
    if (c.outro && !c.outro.movivel) return;
    setEscolhida(c); setMover(false); setFeito(null);
    if (c.papelSugerido) setPapel(c.papelSugerido);
  };
  const gravar = async () => {
    if (!escolhida) return;
    setGravando(true);
    const r = await api.vincularPagamento(parcela.id, escolhida.lancamentoId, papel, mover, false);
    setGravando(false);
    if (typeof r === 'string') { setPrevia(r); return; }
    setFeito(`Pagamento de ${br(escolhida.data)} vinculado à parcela ${parcela.numero ?? '?'} como ${ROTULO_DO_PAPEL[papel]}${r.paga ? ' · parcela paga' : ''}. Desvincule na linha do cronograma para desfazer.`);
    setEscolhida(null);
    void api.buscar('parcela', parcela.id).then(setBusca);
  };

  const b = typeof busca === 'object' ? busca : null;
  const recusa = typeof previa === 'string' ? previa : previa?.recusa ?? null;
  const precisaMover = !!escolhida?.outro?.movivel && !mover;
  const textoDaPrevia = feito ?? (recusa
    ? recusa
    : escolhida && previa && typeof previa === 'object'
      ? [`Vincular ${br(escolhida.data)} · R$ ${num2(escolhida.valor)} como ${ROTULO_DO_PAPEL[papel]}`,
         previa.cancelados ? `${previa.cancelados} lançamento(s) programado(s) da parcela saem (cancelados)` : null,
         previa.paga ? 'a parcela fica paga' : 'a parcela segue em aberto', ...previa.avisos].filter(Boolean).join(' · ')
      : escolhida ? 'Simulando…' : 'Escolha um lançamento na lista.');
  const tom: 'erro' | 'aviso' | 'ok' | 'neutro' = feito ? 'ok' : recusa ? 'erro' : previa && typeof previa === 'object' && previa.avisos.length ? 'aviso' : 'neutro';

  return (
    <Casca titulo={`Buscar pagamento · parcela ${parcela.numero ?? '?'} · vence ${br(parcela.dataVencimento)}`} aoFechar={aoFechar} testId="buscar-pagamento">
      <div className="flex h-[24px] shrink-0 items-center gap-3 px-3 text-[10px] text-muted-foreground" data-testid="buscar-pagamento-topo">
        <span className="tabular-nums">principal <b className="text-foreground">{num2(parcela.valorPrincipal)}</b> · juros <b className="text-foreground">{num2(parcela.valorJuros)}</b> · total <b className="text-foreground">{num2(parcela.valorTotal)}</b></span>
        <span className="min-w-0 truncate">saídas de amortização / juros / despesas financeiras, credor ou nº do contrato · valor até 10% do previsto · ±45 dias</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3" data-testid="lista-pagamentos">
        <table className="w-full table-fixed border-collapse">
          <Cols /><Cabecalho ultima="Paga" />
          <tbody>
            {busca === null && <tr><td colSpan={8} className={`${TD} text-muted-foreground`}>Buscando…</td></tr>}
            {typeof busca === 'string' && <tr><td colSpan={8} className={`${TD} text-destructive`}>{busca}</td></tr>}
            {b && b.linhas.length === 0 && <tr><td colSpan={8} className={`${TD} text-muted-foreground`} data-testid="pagamentos-vazio">Nenhum pagamento candidato a ±45 dias do vencimento.</td></tr>}
            {b?.linhas.map((c) => {
              const bloqueada = !!c.outro && !c.outro.movivel;
              const sel = escolhida?.lancamentoId === c.lancamentoId;
              return (
                <tr key={c.lancamentoId} onClick={() => escolher(c)} data-testid="candidata-pagamento"
                  className={`border-b ${bloqueada ? 'opacity-50' : 'cursor-pointer hover:bg-muted/40'} ${sel ? 'bg-primary/10' : ''}`}
                  title={c.outro ? fraseDoOutro(c.outro) + (bloqueada ? ' · ajuste por aquele contrato' : ' · escolha para mover') : undefined}>
                  <CelulasDaCandidata c={c} />
                  <td className={TD} title={c.outro ? fraseDoOutro(c.outro) : undefined}>
                    {c.outro ? <span className={bloqueada ? 'text-muted-foreground' : 'text-amber-700'}>{c.outro.tipo === 'encargo' ? 'encargo' : 'outro contrato'}</span>
                      : <span>{c.papelSugerido ? ROTULO_DO_PAPEL[c.papelSugerido] : '—'}{c.diferenca ? <span className="text-muted-foreground"> {c.diferenca > 0 ? '+' : '−'}{num2(Math.abs(c.diferenca))}</span> : ''}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* a escolha: o papel e, quando o lançamento está em outro lugar, a confirmação de mover — linha fixa de 28px */}
      <div className="flex h-[28px] shrink-0 items-center gap-2 border-t px-3 text-[10px]" data-testid="escolha-do-pagamento">
        <span className="text-muted-foreground">como</span>
        <Segmentado altura={22} valor={papel} onEscolher={setPapel}
          opcoes={PAPEIS.map((p) => ({ valor: p, rotulo: ROTULO_DO_PAPEL[p], desabilitada: p === 'juros' && parcela.valorJuros <= 0 }))} />
        <span className="min-w-0 flex-1 truncate text-amber-700" title={escolhida?.outro ? fraseDoOutro(escolhida.outro) : undefined} data-testid="mover-aviso">
          {escolhida?.outro?.movivel ? `Este lançamento ${fraseDoOutro(escolhida.outro)}.` : ''}
        </span>
        {escolhida?.outro?.movivel && (
          <label className="flex shrink-0 items-center gap-1" data-testid="confirmar-mover">
            <Checkbox className="size-3" checked={mover} onCheckedChange={(v) => setMover(v === true)} /> mover para esta parcela
          </label>
        )}
      </div>
      <Lugar texto={textoDaPrevia} tom={tom} testId="previa-do-pagamento" />
      <div className="flex h-[36px] shrink-0 items-center justify-end gap-2 border-t px-3">
        <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>Fechar</Button>
        <Button size="sm" className="h-[24px] text-[10px]" data-testid="vincular-a-parcela"
          disabled={!escolhida || gravando || !previa || !!recusa || precisaMover}
          title={precisaMover ? 'Marque "mover para esta parcela" para confirmar' : undefined}
          onClick={() => void gravar()}>{gravando ? 'Gravando…' : 'Vincular a esta parcela'}</Button>
      </div>
    </Casca>
  );
}
