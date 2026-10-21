/**
 * FORN-SEM-CADASTRO-01 — a aba "Sem cadastro" de Cadastros › Fornecedores (mock "Fornecedores sem cadastro", 19/10/2026). Uma linha
 * por texto de fornecedor nos lançamentos sem cadastro; ligar a um cadastro que existe (o banco liga TODOS os lançamentos do texto,
 * com a operação e o antes de cada um) ou criar um novo PELO MODAL de cadastro (nada é criado sem ele; os lançamentos só são ligados
 * depois de salvo). Tudo se desfaz. A tela não soma nem decide: textos, sugestões e o total vêm de `fn_fornecedor_sem_cadastro`.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { FornecedorFormDialog } from '@/components/financeiro-v2/FornecedorFormDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Segmentado } from '@/components/ui/segmentado';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda } from '@/lib/calculos/formatters';
import { ehRateio } from '@/lib/fornecedores/fornecedorTexto';
import { notificarFornecedoresMudaram } from '@/hooks/useFornecedoresDoCliente';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { STATUS_FINANCEIRO_LABEL } from '@/lib/financeiro/statusFinanceiro';
import { useLarguraDaJanela } from '@/hooks/useLarguraDaJanela';
import {
  EXPLICACAO_SEM_CADASTRO, TITULO_DO_MOTIVO, desfazerLigacao, filtrarSemCadastro, ligarTexto, lerRecentesDoBanco, lerSemCadastroDoBanco,
  mesDoUltimo, lancamentosLigados, type FiltroSemCadastro, type LigacaoRecente, type SemCadastro, type TextoSemCadastro,
} from '@/lib/fornecedores/semCadastro';

interface Props {
  clienteId: string;
  fazendas: { id: string; nome: string }[];
  /** quantos textos ainda sem cadastro (o contador da aba); nulo = ainda lendo ou falhou */
  aoContar?: (n: number | null) => void;
  /** fora da aba a leitura segue (o contador da aba) e nada e' desenhado */
  visivel?: boolean;
  /** a altura da área que rola (a do hospedeiro) */
  alturaDaLista?: string;
}
interface Ligado { operacaoId: string; nome: string; qtd: number; criado: boolean }

/* abaixo de 900px de janela a coluna "Último" sai e "Ligar a" encolhe (medido: a 814 o texto ficava com 6px) */
const COLS = { abrir: 22, qtd: 50, valor: 112, ultimo: 74, destino: 250, destinoEstreito: 172, acao: 84 };
const TH = 'sticky top-0 z-10 h-[26px] bg-[#1f3554] px-2 text-left text-[10.5px] font-semibold text-white whitespace-nowrap';
/* FORN-01b — texto em célula: UMA linha, "…" quando não cabe, o inteiro no `title` (regra de corte do Gabriel, 21/10 07h25) */
const TD = 'h-[26px] border-b border-border/60 px-2 align-middle text-[11px]';
const TF = 'sticky bottom-0 z-10 h-[26px] border-t border-border bg-[#e3e8ef] px-2 text-[11px] font-semibold';
const dma = (iso: string | null) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const ROTULO_DO_STATUS = new Map<string, string>(Object.entries(STATUS_FINANCEIRO_LABEL));
const rotuloDoStatus = (s: string | null): string => ROTULO_DO_STATUS.get((s ?? '').toLowerCase()) ?? (s ?? '—');

export function FornecedoresSemCadastro({ clienteId, fazendas, aoContar, visivel = true, alturaDaLista = 'flex-1' }: Props) {
  const [dados, setDados] = useState<SemCadastro | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroSemCadastro>('todos');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [todas, setTodas] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState<Record<string, { id: string; nome: string } | null>>({});
  const [ligados, setLigados] = useState<Record<string, Ligado>>({});
  const [gravando, setGravando] = useState<string | null>(null);
  const [recado, setRecado] = useState<{ texto: string; tom: 'erro' | 'ok' | 'aviso' } | null>(null);
  const [perguntaInativar, setPerguntaInativar] = useState<{ chave: string | null; operacaoId: string; nome: string } | null>(null);
  const [criarPara, setCriarPara] = useState<TextoSemCadastro | null>(null);
  const [recentes, setRecentes] = useState<LigacaoRecente[] | null>(null);
  const [recentesAberto, setRecentesAberto] = useState(false);
  const estreita = useLarguraDaJanela() < 900;
  const nCols = estreita ? 6 : 7;

  const ler = useCallback(async () => {
    setErro(null);
    try { const v = await lerSemCadastroDoBanco(clienteId); setDados(v); }
    catch (e) { setDados(null); setErro(e instanceof Error ? e.message : String(e)); }
  }, [clienteId]);
  useEffect(() => { setDados(null); setLigados({}); setDestino({}); void ler(); }, [ler]);

  const nLigados = Object.keys(ligados).length;
  useEffect(() => { aoContar?.(dados ? Math.max(0, dados.total.textos - nLigados) : null); }, [dados, nLigados, aoContar]);

  const linhas = useMemo(() => (dados ? filtrarSemCadastro(dados.textos, filtro, busca) : []), [dados, filtro, busca]);
  const fazendaNome = (id: string | null) => fazendas.find((f) => f.id === id)?.nome ?? '—';
  const destinoDe = (t: TextoSemCadastro) => (t.chave in destino ? destino[t.chave] : t.sugestao ? { id: t.sugestao.fornecedorId, nome: t.sugestao.nome } : null);
  /* o lado do rateio ("Pec.3M-") se confere antes de gravar; o banco recusa do mesmo jeito */
  const motivoDoRateio = (t: TextoSemCadastro, d: { nome: string } | null) =>
    (d && ehRateio(d.nome) !== t.rateio
      ? `"${t.texto}" e "${d.nome}" não se ligam: "Pec.3M-" marca o pagamento por rateio; os dois lados ficam separados.` : null);

  const ligar = async (t: TextoSemCadastro, d: { id: string; nome: string }, criado: boolean) => {
    setGravando(t.chave); setRecado(null);
    const r = await ligarTexto(clienteId, t, d.id, criado);
    setGravando(null);
    if (r.ok === false) { setRecado({ texto: `${t.texto}: ${r.frase}`, tom: 'erro' }); return; }
    setLigados((m) => ({ ...m, [t.chave]: { operacaoId: r.operacaoId, nome: d.nome, qtd: r.lancamentos, criado } }));
    setRecado({ texto: `${r.lancamentos} ${r.lancamentos === 1 ? 'lançamento ligado' : 'lançamentos ligados'} a ${d.nome}.`, tom: 'ok' });
    notificarLancamentosMudaram(clienteId);
    notificarFornecedoresMudaram(clienteId);
  };

  const desfazer = async (chave: string | null, operacaoId: string, nome: string, criado: boolean) => {
    setRecado(null); setPerguntaInativar(null);
    if (criado) {
      const sim = await desfazerLigacao(operacaoId, { simular: true });
      if (sim.ok === false) { setRecado({ texto: sim.frase, tom: 'erro' }); return; }
      if (sim.podeInativar) { setPerguntaInativar({ chave, operacaoId, nome }); return; }
    }
    await gravarDesfazer(chave, operacaoId, false);
  };
  const gravarDesfazer = async (chave: string | null, operacaoId: string, inativar: boolean) => {
    setPerguntaInativar(null);
    const r = await desfazerLigacao(operacaoId, { simular: false, inativarCriado: inativar });
    if (r.ok === false) { setRecado({ texto: r.frase, tom: 'erro' }); return; }
    if (chave) setLigados((m) => { const n = { ...m }; delete n[chave]; return n; });
    setRecado({ texto: `Desfeito: ${r.voltaram} ${r.voltaram === 1 ? 'lançamento voltou' : 'lançamentos voltaram'} para sem cadastro${r.ficaram > 0 ? ` · ${r.ficaram} já tinham outro fornecedor e ficaram` : ''}${r.inativou ? ' · o cadastro criado saiu de uso' : ''}.`, tom: 'ok' });
    notificarLancamentosMudaram(clienteId);
    notificarFornecedoresMudaram(clienteId);
    if (recentesAberto) void abrirRecentes();
    if (!chave) void ler();
  };
  const abrirRecentes = async () => {
    setRecentesAberto(true);
    try { setRecentes(await lerRecentesDoBanco(clienteId)); } catch (e) { setRecentes([]); setRecado({ texto: e instanceof Error ? e.message : String(e), tom: 'erro' }); }
  };

  const qtdLigados = lancamentosLigados(Object.values(ligados));

  if (!visivel) return null;
  return (
    /* FORN-01b — a aba ocupa a altura que a tela dá: a lista estica (`flex-1`) e o recado e o rodapé ficam no pé — filtrar não os move */
    <div className="flex h-full min-h-0 flex-col gap-2" data-testid="fornecedores-sem-cadastro">
      <p className="shrink-0 text-[11px] leading-[1.4] text-muted-foreground" data-testid="sem-cadastro-explicacao">{EXPLICACAO_SEM_CADASTRO}</p>
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo texto…" data-testid="sem-cadastro-busca"
            className="h-[26px] w-full rounded-md border border-border bg-card pl-7 pr-2 text-[11px] outline-none focus:border-primary" />
        </div>
        <Segmentado<FiltroSemCadastro> valor={filtro} onEscolher={setFiltro} altura={26} opcoes={[
          { valor: 'todos', rotulo: `Todos ${dados ? dados.total.textos : '…'}` },
          { valor: 'com', rotulo: `Com sugestão ${dados ? dados.comSugestao : '…'}` },
          { valor: 'sem', rotulo: `Sem sugestão ${dados ? dados.semSugestao : '…'}` },
        ]} />
      </div>
      <div className={cn('min-h-[120px] overflow-auto rounded-lg border border-border bg-card', alturaDaLista)} data-testid="sem-cadastro-lista">
        <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums">
          <colgroup>
            <col style={{ width: COLS.abrir }} /><col /><col style={{ width: COLS.qtd }} /><col style={{ width: COLS.valor }} />
            {!estreita && <col style={{ width: COLS.ultimo }} />}<col style={{ width: estreita ? COLS.destinoEstreito : COLS.destino }} /><col style={{ width: COLS.acao }} />
          </colgroup>
          <thead>
            <tr>
              <th className={TH} /><th className={cn(TH, 'whitespace-normal leading-[12px]')}>Fornecedor escrito no lançamento</th><th className={cn(TH, 'text-right')}>Lanç.</th>
              <th className={cn(TH, 'text-right')}>Valor total</th>{!estreita && <th className={TH}>Último</th>}<th className={TH}>Ligar a</th><th className={TH} />
            </tr>
          </thead>
          <tbody>
            {!dados && !erro && <tr><td colSpan={nCols} className={cn(TD, 'text-center text-muted-foreground')}>Lendo…</td></tr>}
            {erro && <tr><td colSpan={nCols} className={cn(TD, 'text-center text-destructive')}>Não foi possível ler: {erro}</td></tr>}
            {dados && linhas.length === 0 && <tr><td colSpan={nCols} className={cn(TD, 'text-center text-muted-foreground')}>Nenhum lançamento sem cadastro neste filtro.</td></tr>}
            {linhas.map((t) => {
              const lig = ligados[t.chave];
              const d = destinoDe(t);
              const ehSugestao = !!(d && t.sugestao && d.id === t.sugestao.fornecedorId);
              const rateioRecusa = motivoDoRateio(t, d);
              const abertaEsta = aberta === t.chave;
              const lista = todas.has(t.chave) ? t.lancamentos : t.lancamentos.slice(0, 3);
              if (lig) {
                return (
                  <tr key={t.chave} className="bg-[#e6f4ea]" data-testid="sem-cadastro-ligado">
                    <td className={TD} /><td className={TD}><span className="block truncate font-medium" title={t.texto}>{t.texto}</span></td>
                    <td className={cn(TD, 'text-right')}>{t.qtd}</td><td className={cn(TD, 'text-right')}>{formatMoeda(t.valor)}</td>
                    {!estreita && <td className={TD}>{mesDoUltimo(t.ultimo)}</td>}
                    <td className={cn(TD, 'font-semibold text-[#1e7a44]')}><span className="block truncate" title={`Ligado a ${lig.nome}`}>✓ Ligado a {lig.nome}</span></td>
                    <td className={TD}>
                      <button type="button" className="text-[11px] font-semibold text-[#24406a] underline" data-testid="sem-cadastro-desfazer"
                        onClick={() => void desfazer(t.chave, lig.operacaoId, lig.nome, lig.criado)}>Desfazer</button>
                    </td>
                  </tr>
                );
              }
              return (
                <Fragment key={t.chave}>
                  <tr className={cn(abertaEsta && 'bg-[#e8f0fb]')} data-testid="sem-cadastro-linha">
                    <td className={cn(TD, 'cursor-pointer text-muted-foreground')} onClick={() => setAberta(abertaEsta ? null : t.chave)}
                      aria-label={abertaEsta ? 'Fechar' : 'Ver os lançamentos'}>{abertaEsta ? '▾' : '▸'}</td>
                    <td className={TD} title={t.origem === 'planilha' ? 'texto da planilha do Enriquecer' : 'descrição do lançamento'}>
                      <span className="block truncate font-medium" title={t.texto}>{t.texto}</span>
                    </td>
                    <td className={cn(TD, 'text-right')}>{t.qtd}</td>
                    <td className={cn(TD, 'text-right')}>{formatMoeda(t.valor)}</td>
                    {!estreita && <td className={cn(TD, 'text-muted-foreground')}>{mesDoUltimo(t.ultimo)}</td>}
                    <td className={TD}>
                      <div className="flex min-w-0 items-center gap-1">
                        <div className="min-w-0 flex-1">
                          <FavorecidoSelect clienteId={clienteId} value={d?.id ?? ''} size="compact" linhaDoDocumento={false} nomeInteiro
                            placeholder="Buscar cadastro…"
                            onChange={(id) => { if (!id) setDestino((m) => ({ ...m, [t.chave]: null })); }}
                            onSelected={(f) => setDestino((m) => ({ ...m, [t.chave]: { id: f.id, nome: f.nome } }))}
                            acaoFinal={{ label: `+ Criar cadastro "${t.texto}"…`, onSelect: () => setCriarPara(t) }} />
                        </div>
                        <span className={cn('w-[52px] shrink-0 rounded-full px-1 text-center text-[9.5px] font-semibold leading-[14px]',
                          ehSugestao ? 'bg-[#e8f0fb] text-[#24406a]' : 'invisible')}
                          title={ehSugestao && t.sugestao ? TITULO_DO_MOTIVO[t.sugestao.motivo] : undefined} data-testid="sem-cadastro-tag-sugestao">sugestão</span>
                      </div>
                    </td>
                    <td className={TD}>
                      <button type="button" data-testid="sem-cadastro-ligar" disabled={!d || !!rateioRecusa || gravando === t.chave}
                        title={rateioRecusa ?? (!d ? 'Escolha o cadastro para ligar' : undefined)}
                        onClick={() => { if (d && !rateioRecusa) void ligar(t, d, false); }}
                        className="h-[22px] w-full rounded-md bg-[#24406a] text-[11px] font-medium text-white disabled:opacity-45">
                        {gravando === t.chave ? 'Ligando' : 'Ligar'}
                      </button>
                    </td>
                  </tr>
                  {abertaEsta && lista.map((l) => (
                    <tr key={l.id} className="bg-[#fafbfc]" data-testid="sem-cadastro-lancamento">
                      <td className={cn(TD, 'h-[22px]')} />
                      <td className={cn(TD, 'h-[22px] pl-[30px] text-muted-foreground')}><span className="block truncate" title={l.descricao ?? undefined}>{l.descricao ?? '—'}</span></td>
                      <td className={cn(TD, 'h-[22px]')} />
                      <td className={cn(TD, 'h-[22px] text-right')}>{formatMoeda(l.valor)}</td>
                      {estreita ? (
                        <td className={cn(TD, 'h-[22px] text-muted-foreground')}><span className="block truncate" title={`${dma(l.data)} · ${fazendaNome(l.fazendaId)}`}>{dma(l.data)} · {fazendaNome(l.fazendaId)}</span></td>
                      ) : (<>
                        <td className={cn(TD, 'h-[22px] text-muted-foreground')}>{dma(l.data)}</td>
                        <td className={cn(TD, 'h-[22px] text-muted-foreground')}><span className="block truncate" title={fazendaNome(l.fazendaId)}>{fazendaNome(l.fazendaId)}</span></td>
                      </>)}
                      <td className={cn(TD, 'h-[22px] text-muted-foreground')}>{rotuloDoStatus(l.status)}</td>
                    </tr>
                  ))}
                  {abertaEsta && t.lancamentos.length > 3 && !todas.has(t.chave) && (
                    <tr className="bg-[#fafbfc]">
                      <td className={cn(TD, 'h-[22px]')} />
                      <td className={cn(TD, 'h-[22px] pl-[30px]')} colSpan={nCols - 1}>
                        <button type="button" className="text-[11px] font-semibold text-[#24406a]" data-testid="sem-cadastro-ver-todos"
                          onClick={() => setTodas((s) => new Set(s).add(t.chave))}>Ver os {t.lancamentos.length} lançamentos</button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr data-testid="sem-cadastro-total">
              <td className={TF} /><td className={TF}>Total · {dados ? `${dados.total.textos} ${dados.total.textos === 1 ? 'texto' : 'textos'}` : '…'}</td>
              <td className={cn(TF, 'text-right')}>{dados ? dados.total.lancamentos.toLocaleString('pt-BR') : '…'}</td>
              <td className={cn(TF, 'text-right')}>{dados ? formatMoeda(dados.total.valor) : '…'}</td>
              {!estreita && <td className={TF} />}<td className={TF} colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      {/* recado e pergunta: lugar fixo de 18px, sempre presente */}
      <div className="flex h-[18px] min-w-0 shrink-0 items-center gap-2 text-[11px]" data-testid="sem-cadastro-recado">
        {perguntaInativar ? (
          <>
            <span className="uma-linha-que-rola min-w-0 text-amber-800">O cadastro "{perguntaInativar.nome}" foi criado nesta ligação e fica sem uso: tirar de uso também?</span>
            <button type="button" className="shrink-0 font-semibold text-[#24406a] underline" data-testid="sem-cadastro-inativar-sim"
              onClick={() => void gravarDesfazer(perguntaInativar.chave, perguntaInativar.operacaoId, true)}>Sim, tirar de uso</button>
            <button type="button" className="shrink-0 font-semibold text-[#24406a] underline"
              onClick={() => void gravarDesfazer(perguntaInativar.chave, perguntaInativar.operacaoId, false)}>Não, só desfazer</button>
          </>
        ) : recado ? (
          <span className={cn('uma-linha-que-rola min-w-0', recado.tom === 'erro' ? 'text-destructive' : recado.tom === 'ok' ? 'text-[#1e7a44]' : 'text-amber-800')}>{recado.texto}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground" data-testid="sem-cadastro-rodape">
        <span>Ligados nesta sessão: <b className="font-semibold text-foreground">{nLigados} {nLigados === 1 ? 'texto' : 'textos'} · {qtdLigados} {qtdLigados === 1 ? 'lançamento' : 'lançamentos'}</b></span>
        <button type="button" className="ml-auto font-semibold text-[#24406a] underline" onClick={() => void abrirRecentes()}
          data-testid="sem-cadastro-ver-recentes">Ver ligações recentes (desfazer)</button>
      </div>

      {criarPara && (
        <FornecedorFormDialog open onClose={() => setCriarPara(null)} editing={null} allFornecedores={[]} fazendas={fazendas}
          clienteId={clienteId} nomeInicial={criarPara.texto} onSaved={() => undefined}
          onCriado={(id) => { const t = criarPara; setCriarPara(null); void ligar(t, { id, nome: t.texto }, true); }} />
      )}
      <Dialog open={recentesAberto} onOpenChange={(o) => { if (!o) setRecentesAberto(false); }}>
        <DialogContent className="flex h-[min(420px,calc(100dvh-32px))] w-[min(720px,calc(100vw-32px))] max-w-none flex-col gap-2 p-3">
          <DialogHeader><DialogTitle className="text-[13px]">Ligações recentes</DialogTitle></DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto rounded border border-border" data-testid="sem-cadastro-recentes">
            <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums">
              <colgroup><col style={{ width: 84 }} /><col /><col /><col style={{ width: 56 }} /><col style={{ width: 92 }} /></colgroup>
              <thead><tr><th className={TH}>Data</th><th className={TH}>Texto</th><th className={TH}>Ligado a</th><th className={cn(TH, 'text-right')}>Lanç.</th><th className={TH} /></tr></thead>
              <tbody>
                {recentes === null && <tr><td colSpan={5} className={cn(TD, 'text-center text-muted-foreground')}>Lendo…</td></tr>}
                {recentes?.length === 0 && <tr><td colSpan={5} className={cn(TD, 'text-center text-muted-foreground')}>Nenhuma ligação ainda.</td></tr>}
                {recentes?.map((o) => (
                  <tr key={o.id}>
                    <td className={TD}>{dma(o.feitaEm.slice(0, 10))}</td>
                    <td className={TD}><span className="block truncate" title={o.texto}>{o.texto}</span></td>
                    <td className={TD}><span className="block truncate" title={`${o.fornecedorNome}${o.fornecedorCriado ? ' · criado aqui' : ''}`}>{o.fornecedorNome}{o.fornecedorCriado ? ' · criado aqui' : ''}</span></td>
                    <td className={cn(TD, 'text-right')}>{o.lancamentos}</td>
                    <td className={TD}>
                      {o.desfeitaEm ? <span className="text-muted-foreground">desfeita</span> : (
                        <button type="button" className="text-[11px] font-semibold text-[#24406a] underline"
                          onClick={() => { const chave = Object.keys(ligados).find((k) => ligados[k].operacaoId === o.id) ?? null; void desfazer(chave, o.id, o.fornecedorNome, o.fornecedorCriado); }}>Desfazer</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
