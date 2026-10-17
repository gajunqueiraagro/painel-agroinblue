/**
 * FIN-FINANC-28 · PASSO 4b — "Buscar entradas" (liberações, e os encargos do credor perto delas) e "Buscar pagamento" (por parcela),
 * no molde da OC: o banco SUGERE (`fn_financiamento_candidatas`, com pontos e motivos) e o banco DECIDE (o vincular tem
 * simulação: a prévia é a própria gravação desfeita). Esta peça só desenha e confirma.
 *
 * ⚠ DIÁLOGOS DE TAMANHO FIXO, um scrollport (a lista, cabeçalho preso), régua `table-fixed` em px, uma linha por registro (só texto
 *   corta, inteiro no `title`), e um LUGAR RESERVADO para a prévia / recusa — nada muda de altura ao escolher.
 * ⚠ GESTO CONTRÁRIO: liberação se remove no bloco Liberações; o pagamento se desvincula na linha do cronograma; o encargo, pelo
 *   bloco de encargos do contrato.
 * ⚠ FIX 4b — A BUSCA NUNCA É BECO SEM SAÍDA: faixa de valor, janela e texto livre são OPÇÕES que o banco aplica (`p_opcoes`); a
 *   tela não filtra nada. Vazio diz o que foi procurado e oferece ampliar. Parcela zerada pergunta se o pagamento vira o valor
 *   dela (o banco grava, com o SIM; desvincular devolve o zero).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Segmentado } from '@/components/ui/segmentado';
import { Checkbox } from '@/components/ui/checkbox';
import type { useContratoDeCredito } from '@/hooks/useContratoDeCredito';
import {
  PAPEIS, ROTULO_DO_PAPEL, datasDaJanela, fraseDoOutro, fraseDoVazio,
  type BuscaNoContrato, type Candidata, type EncargoSugerido, type Janela, type OpcoesDaBusca, type PapelDoPagamento, type ResultadoDoVinculo,
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

/* ═══ FIX 4b — o que se procura: faixa, janela, texto livre, todas ═══════════════════════════════════════════════════════════ */
interface EstadoDaBusca { faixa: 'pct10' | 'qualquer' | null; janela: Janela; de: string; ate: string; texto: string; todas: boolean }
const BUSCA_PADRAO: EstadoDaBusca = { faixa: null, janela: 'padrao', de: '', ate: '', texto: '', todas: false };

/** O estado da busca e as opções que vão ao banco (nada = o padrão do banco). O texto espera 400 ms. */
function useOpcoesDaBusca(base: string | null) {
  const [estado, setEstado] = useState<EstadoDaBusca>(BUSCA_PADRAO);
  const [textoFirme, setTextoFirme] = useState('');
  useEffect(() => { const t = setTimeout(() => setTextoFirme(estado.texto), 400); return () => clearTimeout(t); }, [estado.texto]);
  const opcoes = useMemo<OpcoesDaBusca | undefined>(() => {
    const datas = datasDaJanela(base, estado.janela, { de: estado.de || null, ate: estado.ate || null });
    const o: OpcoesDaBusca = { ...(estado.faixa ? { faixa: estado.faixa } : {}), ...datas,
      ...(textoFirme.trim() ? { busca: textoFirme.trim() } : {}), ...(estado.todas ? { todas: true } : {}) };
    return Object.keys(o).length ? o : undefined;
  }, [base, estado.faixa, estado.janela, estado.de, estado.ate, estado.todas, textoFirme]);
  return { estado, setEstado, opcoes };
}

const ROTULO_JANELA = (alvo: 'parcela' | 'liberacao'): Record<Janela, string> => ({
  padrao: alvo === 'parcela' ? '±45 dias' : 'padrão', d90: '±90', d180: '±180',
  ano: alvo === 'parcela' ? 'ano do vencimento' : 'ano do contrato', intervalo: 'de/até',
});

/** linha fixa de 26px: valor · janela · intervalo (lugar reservado de 212px, vazio fora do "de/até") */
function ControlesDaBusca({ alvo, estado, setEstado, faixaDoBanco, semPrevisto }: {
  alvo: 'parcela' | 'liberacao'; estado: EstadoDaBusca; setEstado: (f: (e: EstadoDaBusca) => EstadoDaBusca) => void;
  faixaDoBanco: 'pct10' | 'qualquer'; semPrevisto: boolean;
}) {
  const rot = ROTULO_JANELA(alvo);
  const comTexto = estado.texto.trim() !== '';
  return (
    <div className="flex h-[26px] shrink-0 items-center gap-2 px-3 text-[10px]" data-testid="controles-da-busca">
      <span className="text-muted-foreground">valor</span>
      <Segmentado altura={22} valor={estado.faixa ?? faixaDoBanco} onEscolher={(v) => setEstado((e) => ({ ...e, faixa: v }))}
        opcoes={[
          { valor: 'pct10', rotulo: alvo === 'parcela' ? '±10% do previsto' : '±10% do a liberar', desabilitada: semPrevisto,
            title: semPrevisto ? (alvo === 'parcela' ? 'parcela sem valor' : 'contrato sem valor') : undefined },
          { valor: 'qualquer', rotulo: 'qualquer' },
        ]} />
      <span className="ml-2 text-muted-foreground">janela</span>
      <Segmentado altura={22} valor={estado.janela} onEscolher={(v) => setEstado((e) => ({ ...e, janela: v }))}
        opcoes={(['padrao', 'd90', 'd180', 'ano', 'intervalo'] as Janela[]).map((j) => ({ valor: j, rotulo: rot[j],
          desabilitada: comTexto, title: comTexto ? 'a busca livre olha todas as datas' : undefined }))} />
      <div className="flex w-[212px] shrink-0 items-center gap-1" data-testid="lugar-do-intervalo">
        {estado.janela === 'intervalo' && !comTexto && (
          <>
            <DatePicker size="compact" className="h-[22px] w-[100px]" value={estado.de} onChange={(v) => setEstado((e) => ({ ...e, de: v }))} placeholder="de" />
            <DatePicker size="compact" className="h-[22px] w-[100px]" value={estado.ate} onChange={(v) => setEstado((e) => ({ ...e, ate: v }))} placeholder="até" />
          </>
        )}
      </div>
    </div>
  );
}

/** o campo livre e "todas", no topo — busca em TODAS as saídas/entradas do cliente (descrição, favorecido, valor, nº) */
function CampoDeBusca({ oQue, estado, setEstado }: { oQue: 'saídas' | 'entradas'; estado: EstadoDaBusca; setEstado: (f: (e: EstadoDaBusca) => EstadoDaBusca) => void }) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <Input className="h-[20px] w-[260px] px-1.5 text-[10px]" placeholder={`buscar em todas as ${oQue}: descrição, favorecido, valor, nº`}
        value={estado.texto} onChange={(e) => { const v = e.target.value; setEstado((s) => ({ ...s, texto: v })); }} data-testid="busca-livre" />
      <label className="flex items-center gap-1" title={`sem exigir credor, plano ou nº do contrato`}>
        <Checkbox className="size-3" checked={estado.todas} onCheckedChange={(v) => setEstado((s) => ({ ...s, todas: v === true }))}
          data-testid="todas-as" /> todas as {oQue}
      </label>
    </div>
  );
}

/** a linha do vazio: o que foi procurado + os dois gestos de ampliar */
function LinhaDoVazio({ b, oQue, setEstado, testId }: { b: BuscaNoContrato; oQue: 'pagamento' | 'entrada'; setEstado: (f: (e: EstadoDaBusca) => EstadoDaBusca) => void; testId: string }) {
  const frase = fraseDoVazio(b.buscado, oQue);
  return (
    <tr><td colSpan={8} className={`${TD} text-muted-foreground`} data-testid={testId}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate" title={frase}>{frase}</span>
        <Button size="sm" variant="outline" className="h-[18px] shrink-0 px-1.5 text-[9.5px]" data-testid="ampliar-180"
          onClick={() => setEstado((e) => ({ ...e, janela: 'd180', texto: '' }))}>Ampliar para ±180 dias</Button>
        <Button size="sm" variant="outline" className="h-[18px] shrink-0 px-1.5 text-[9.5px]" data-testid="buscar-em-todas"
          onClick={() => setEstado((e) => ({ ...e, todas: true, faixa: 'qualquer' }))}>Buscar em todas as {oQue === 'entrada' ? 'entradas' : 'saídas'}</Button>
      </div>
    </td></tr>
  );
}

/* ═══ BUSCAR ENTRADAS (liberações) + encargos perto delas ═════════════════════════════════════════════════════════════════ */
export function BuscarEntradasDialog({ api, aoFechar }: { api: ApiDoContrato; aoFechar: () => void }) {
  const [busca, setBusca] = useState<BuscaNoContrato | string | null>(null);
  const [encargos, setEncargos] = useState<EncargoSugerido[] | string | null>(null);
  const [recado, setRecado] = useState<{ texto: string; tom: 'erro' | 'ok' } | null>(null);
  const [gravando, setGravando] = useState<string | null>(null);
  /* a data-base da janela é a do contrato: o banco a usa no padrão (−30 a +365), e a tela a lê da primeira resposta */
  const [baseDoContrato, setBaseDoContrato] = useState<string | null>(null);
  const { estado, setEstado, opcoes } = useOpcoesDaBusca(baseDoContrato);
  const datas = (api.liberacoes ?? []).map((l) => l.data);
  const chaveDasDatas = datas.join('|');
  const lerBusca = useCallback(() => {
    void (opcoes ? api.buscar('liberacao', null, opcoes) : api.buscar('liberacao', null)).then((r) => {
      setBusca(r);
      if (!opcoes && typeof r === 'object' && r.de) setBaseDoContrato(new Date(Date.parse(`${r.de}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10));
    });
  }, [api.buscar, opcoes]);
  const lerEncargos = useCallback(() => {
    void api.lerEncargosPerto(chaveDasDatas ? chaveDasDatas.split('|') : []).then(setEncargos);
  }, [api.lerEncargosPerto, chaveDasDatas]);
  const ler = useCallback(() => { lerBusca(); lerEncargos(); }, [lerBusca, lerEncargos]);
  useEffect(() => { lerBusca(); }, [lerBusca]);
  useEffect(() => { lerEncargos(); }, [lerEncargos]);

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
        <span className="min-w-0 truncate" title="entradas do cliente sem contrato · plano de entrada de financiamento, credor ou nº do contrato na descrição">entradas sem contrato · plano, credor ou nº do contrato</span>
        {b && <span className="shrink-0 tabular-nums">falta liberar <b className="text-foreground">R$ {num2(b.saldoALiberar ?? 0)}</b>{b.buscado?.texto ? '' : ` · ${br(b.de)} a ${br(b.ate)}`}</span>}
        <CampoDeBusca oQue="entradas" estado={estado} setEstado={setEstado} />
      </div>
      <ControlesDaBusca alvo="liberacao" estado={estado} setEstado={setEstado} faixaDoBanco={b?.buscado?.faixa ?? 'qualquer'}
        semPrevisto={b?.buscado?.semPrevisto ?? false} />
      <div className="min-h-0 flex-1 overflow-y-auto px-3" data-testid="lista-entradas">
        <table className="w-full table-fixed border-collapse">
          <Cols /><Cabecalho ultima="" />
          <tbody>
            {busca === null && <tr><td colSpan={8} className={`${TD} text-muted-foreground`}>Buscando…</td></tr>}
            {typeof busca === 'string' && <tr><td colSpan={8} className={`${TD} text-destructive`}>{busca}</td></tr>}
            {b && b.linhas.length === 0 && <LinhaDoVazio b={b} oQue="entrada" setEstado={setEstado} testId="entradas-vazio" />}
            {b?.linhas.map((c) => (
              <tr key={c.lancamentoId} className="border-b" data-testid="candidata-entrada" title={c.outro ? fraseDoOutro(c.outro) : undefined}>
                <CelulasDaCandidata c={c} />
                <td className={TD}>
                  {c.outro
                    ? <span className="text-muted-foreground" title={fraseDoOutro(c.outro)}>{c.outro.tipo === 'encargo' ? 'é encargo' : 'em outro contrato'}</span>
                    : <Button size="sm" variant="outline" className="h-[18px] px-1.5 text-[9.5px]" disabled={gravando !== null || !c.data}
                        onClick={() => void vincular(c)} data-testid="vincular-como-liberacao">Vincular como liberação</Button>}
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
  /* parcela zerada: o operador responde se o pagamento vira o valor dela (nulo = ainda não respondeu) */
  const [atualizar, setAtualizar] = useState<boolean | null>(null);
  const [versao, setVersao] = useState(0);
  const { estado, setEstado, opcoes } = useOpcoesDaBusca(parcela.dataVencimento);

  useEffect(() => {
    void (opcoes ? api.buscar('parcela', parcela.id, opcoes) : api.buscar('parcela', parcela.id)).then(setBusca);
  }, [api.buscar, parcela.id, opcoes, versao]);
  /* a lista mudou de recorte: a escolha anterior pode não estar mais nela */
  useEffect(() => { setEscolhida(null); setAtualizar(null); }, [opcoes]);

  /* a prévia é a própria gravação desfeita: refaz só quando muda o que muda a resposta */
  const lancId = escolhida?.lancamentoId ?? null;
  useEffect(() => {
    if (!lancId) { setPrevia(null); return; }
    let vivo = true;
    setPrevia(null);
    const simular = atualizar === null
      ? api.vincularPagamento(parcela.id, lancId, papel, mover, true)
      : api.vincularPagamento(parcela.id, lancId, papel, mover, true, atualizar);
    void simular.then((r) => { if (vivo) setPrevia(r); });
    return () => { vivo = false; };
  }, [api.vincularPagamento, parcela.id, lancId, papel, mover, atualizar]);

  const escolher = (c: Candidata) => {
    if (c.outro && !c.outro.movivel) return;
    setEscolhida(c); setMover(false); setFeito(null); setAtualizar(null);
    if (c.papelSugerido) setPapel(c.papelSugerido);
  };
  const zerada = previa !== null && typeof previa === 'object' && previa.parcelaZerada;
  const gravar = async () => {
    if (!escolhida) return;
    setGravando(true);
    const r = atualizar === null
      ? await api.vincularPagamento(parcela.id, escolhida.lancamentoId, papel, mover, false)
      : await api.vincularPagamento(parcela.id, escolhida.lancamentoId, papel, mover, false, atualizar);
    setGravando(false);
    if (typeof r === 'string') { setPrevia(r); return; }
    setFeito(`Pagamento de ${br(escolhida.data)} vinculado à parcela ${parcela.numero ?? '?'} como ${ROTULO_DO_PAPEL[papel]}`
      + `${r.valorAtualizado ? ` · a parcela passou a valer R$ ${num2(escolhida.valor)}` : ''}${r.paga ? ' · parcela paga' : ''}. Desvincule na linha do cronograma para desfazer.`);
    setEscolhida(null); setAtualizar(null);
    setVersao((v) => v + 1);
  };

  const b = typeof busca === 'object' ? busca : null;
  const recusa = typeof previa === 'string' ? previa : previa?.recusa ?? null;
  const precisaMover = !!escolhida?.outro?.movivel && !mover;
  const textoDaPrevia = feito ?? (recusa
    ? recusa
    : escolhida && previa && typeof previa === 'object'
      ? [`Vincular ${br(escolhida.data)} · R$ ${num2(escolhida.valor)} como ${ROTULO_DO_PAPEL[papel]}`,
         previa.cancelados ? `${previa.cancelados} lançamento(s) programado(s) da parcela saem (cancelados)` : null,
         previa.parcelaZerada ? (atualizar === true ? `a parcela passa a valer R$ ${num2(escolhida.valor)} (${papel === 'juros' ? 'juros' : 'principal'})`
           : atualizar === false ? 'a parcela fica sem valor' : 'parcela sem valor: responda ao lado') : null,
         previa.paga ? 'a parcela fica paga' : 'a parcela segue em aberto', ...previa.avisos].filter(Boolean).join(' · ')
      : escolhida ? 'Simulando…' : 'Escolha um lançamento na lista.');
  const tom: 'erro' | 'aviso' | 'ok' | 'neutro' = feito ? 'ok' : recusa ? 'erro' : previa && typeof previa === 'object' && previa.avisos.length ? 'aviso' : 'neutro';

  return (
    <Casca titulo={`Buscar pagamento · parcela ${parcela.numero ?? '?'} · vence ${br(parcela.dataVencimento)}`} aoFechar={aoFechar} testId="buscar-pagamento">
      <div className="flex h-[24px] shrink-0 items-center gap-3 px-3 text-[10px] text-muted-foreground" data-testid="buscar-pagamento-topo">
        <span className="tabular-nums">principal <b className="text-foreground">{num2(parcela.valorPrincipal)}</b> · juros <b className="text-foreground">{num2(parcela.valorJuros)}</b> · total <b className="text-foreground">{num2(parcela.valorTotal)}</b></span>
        {b?.buscado && !b.buscado.texto && <span className="shrink-0 tabular-nums">{br(b.buscado.de)} a {br(b.buscado.ate)}</span>}
        <CampoDeBusca oQue="saídas" estado={estado} setEstado={setEstado} />
      </div>
      <ControlesDaBusca alvo="parcela" estado={estado} setEstado={setEstado} faixaDoBanco={b?.buscado?.faixa ?? 'pct10'}
        semPrevisto={b?.buscado?.semPrevisto ?? parcela.valorTotal <= 0} />
      <div className="min-h-0 flex-1 overflow-y-auto px-3" data-testid="lista-pagamentos">
        <table className="w-full table-fixed border-collapse">
          <Cols /><Cabecalho ultima="Paga" />
          <tbody>
            {busca === null && <tr><td colSpan={8} className={`${TD} text-muted-foreground`}>Buscando…</td></tr>}
            {typeof busca === 'string' && <tr><td colSpan={8} className={`${TD} text-destructive`}>{busca}</td></tr>}
            {b && b.linhas.length === 0 && <LinhaDoVazio b={b} oQue="pagamento" setEstado={setEstado} testId="pagamentos-vazio" />}
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
          opcoes={PAPEIS.map((p) => ({ valor: p, rotulo: ROTULO_DO_PAPEL[p] }))} />
        <span className="min-w-0 flex-1 truncate text-amber-700" title={escolhida?.outro ? fraseDoOutro(escolhida.outro) : undefined} data-testid="mover-aviso">
          {escolhida?.outro?.movivel ? `Este lançamento ${fraseDoOutro(escolhida.outro)}.` : ''}
        </span>
        {escolhida?.outro?.movivel && (
          <label className="flex shrink-0 items-center gap-1" data-testid="confirmar-mover">
            <Checkbox className="size-3" checked={mover} onCheckedChange={(v) => setMover(v === true)} /> mover para esta parcela
          </label>
        )}
        {/* lugar reservado de 300px: a pergunta da parcela zerada (vazio fora dela) */}
        <div className="flex w-[300px] shrink-0 items-center justify-end gap-1.5" data-testid="lugar-da-pergunta">
          {zerada && (
            <>
              <span className="truncate text-amber-700" title="A parcela está sem valor. O valor dela passa a ser o deste pagamento (principal, ou juros se o papel for juros).">Atualizar o valor da parcela com o pagamento?</span>
              <Segmentado altura={20} valor={atualizar === null ? '' : atualizar ? 'sim' : 'nao'}
                onEscolher={(v) => setAtualizar(v === 'sim')}
                opcoes={[{ valor: 'sim', rotulo: 'Sim' }, { valor: 'nao', rotulo: 'Não' }]} />
            </>
          )}
        </div>
      </div>
      <Lugar texto={textoDaPrevia} tom={tom} testId="previa-do-pagamento" />
      <div className="flex h-[36px] shrink-0 items-center justify-end gap-2 border-t px-3">
        <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>Fechar</Button>
        <Button size="sm" className="h-[24px] text-[10px]" data-testid="vincular-a-parcela"
          disabled={!escolhida || gravando || !previa || !!recusa || precisaMover || (zerada && atualizar === null)}
          title={precisaMover ? 'Marque "mover para esta parcela" para confirmar' : zerada && atualizar === null ? 'Responda se o valor da parcela muda' : undefined}
          onClick={() => void gravar()}>{gravando ? 'Gravando…' : 'Vincular a esta parcela'}</Button>
      </div>
    </Casca>
  );
}
