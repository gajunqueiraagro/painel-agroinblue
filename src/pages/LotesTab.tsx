/**
 * LOTES-03 F1 + LOTES-04 (mock lotes-codigo-lista.html, Gabriel 07/11 17:26) — Produção › Lotes: a lista dos lotes da fazenda,
 * AGRUPADA POR ATIVIDADE (cria, recria, engorda; subtotal lotes · cab). Colunas Código, Categoria, Raça, Programa, Cab, Peso kg, GMD,
 * Pasto (Nome, Sistema, Destino e Carimbo ficam na ficha). Filtros: atividade do cadastro + Ativos/Encerrados + busca que acha também
 * os códigos antigos. Ordenável (dentro de cada grupo); linha de total (cab. somada; peso e GMD ponderados). Cab., peso, GMD e pasto
 * LIDOS do fechamento (`fn_lotes_da_fazenda`): lote sem lançamento = "—". "+ Novo lote" abre o assistente; a linha abre a ficha.
 */
import { Fragment, useMemo, useState } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { Ajuda } from '@/components/ui/ajuda';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';
import { QUADRO_REGUA, RODAPE_REGUA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { useAlturaAteOFim } from '@/hooks/useAlturaAteOFim';
import { useOrdenacaoTabela } from '@/hooks/useOrdenacaoTabela';
import { useLotesDaFazenda } from '@/hooks/useLotesDaFazenda';
import { useCadastrosDoLote } from '@/hooks/useCadastrosDoLote';
import {
  colunasDosLotes, faseDaAtividade, filtrarLotes, fraseDoGrupo, gruposPorAtividade, mapaDoCadastro, nomeDe, textoDosPastos, totalDosLotes, type ColunaDosLotes,
  type FiltroDeSituacao,
} from '@/lib/lotes/lista';
import { FichaDoLote } from '@/components/lotes/FichaDoLote';
import { AssistenteDoLote } from '@/components/lotes/AssistenteDoLote';
import type { LoteDaLista } from '@/lib/lotes/tipos';

const n0 = (v: number | null) => (v == null ? '—' : formatNum(v, 0));
const n3 = (v: number | null) => (v == null ? '—' : formatNum(v, 3));
/** as larguras do mock (a coluna Programa leva o resto) — a mesma régua no corpo e no total */
const COLUNAS = [150, 120, 90, null, 64, 70, 60, 96];
const Colunas = () => <colgroup>{COLUNAS.map((w, i) => <col key={i} style={w == null ? undefined : { width: w }} />)}</colgroup>;

export function LotesTab() {
  const { clienteAtual } = useCliente();
  const { fazendaAtual, isGlobal } = useFazenda();
  const fazendaId = !isGlobal && fazendaAtual ? fazendaAtual.id : null;
  const fazendaCodigo = fazendaAtual?.codigo || fazendaAtual?.nome || '';
  const anoMes = hojeLocal().slice(0, 7);
  const clienteId = clienteAtual?.id ?? null;
  const { lotes, carregando, erro } = useLotesDaFazenda(fazendaId, anoMes);
  const { cadastros } = useCadastrosDoLote(clienteId);
  const nomes = useMemo(() => mapaDoCadastro(cadastros), [cadastros]);
  /* o filtro na ordem da fase (Cria · Recria · Engorda · as outras), do cadastro do cliente */
  const atividades = useMemo(() => cadastros.filter(c => c.tipo === 'atividade' && c.ativo)
    .sort((a, b) => faseDaAtividade(a.sigla) - faseDaAtividade(b.sigla) || a.nome.localeCompare(b.nome, 'pt-BR')), [cadastros]);

  const [atividade, setAtividade] = useState<string>('');
  const [situacao, setSituacao] = useState<FiltroDeSituacao>('ativo');
  const [busca, setBusca] = useState('');
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [assistente, setAssistente] = useState<{ editar: LoteDaLista | null } | null>(null);
  const [novoId, setNovoId] = useState<string | null>(null);

  const filtrados = useMemo(() => filtrarLotes(lotes, { situacao, atividadeId: atividade || null, busca }), [lotes, situacao, atividade, busca]);
  const colunas = useMemo(() => colunasDosLotes(nomes), [nomes]);
  const { ordem, alternar, ordenadas } = useOrdenacaoTabela<LoteDaLista, ColunaDosLotes>(filtrados, colunas, { coluna: 'codigo', direcao: 'asc' });
  const total = totalDosLotes(ordenadas);
  const grupos = useMemo(() => gruposPorAtividade(ordenadas, nomes), [ordenadas, nomes]);
  const naSituacao = lotes.filter(l => l.situacao === situacao).length;
  const { ref: refQuadro, altura } = useAlturaAteOFim();
  const ficha = fichaId ? lotes.find(l => l.id === fichaId) ?? null : null;

  const TH = cn(TH_REGUA, 'sticky top-0 z-[1] bg-primary');
  const th = (c: ColunaDosLotes, rotulo: string, direita = false) => (
    <ThOrdenavel coluna={c} rotulo={rotulo} ordem={ordem} onOrdenar={alternar} className={TH} alinhaDireita={direita} />
  );

  return (
    <div className="flex min-h-0 flex-col gap-2 p-3" data-testid="tela-lotes">
      <div className="flex h-[28px] flex-none items-center gap-2.5 whitespace-nowrap">
        <h1 className="text-[15px] font-semibold text-primary">Lotes</h1>
        <span className="text-[11px] text-muted-foreground">{fazendaId ? `${fazendaAtual?.nome ?? ''} · ${fazendaCodigo}` : 'escolha uma fazenda'}</span>
        <Ajuda titulo="Lotes" oQueE="O lote é o grupo de animais que você maneja junto. O código segue sempre o padrão atividade · categoria · raça · número."
          porQue="Cabeças, peso, GMD e pasto vêm do fechamento — não se digitam aqui." comoFazer="Crie em + Novo lote; ao lançar o pasto no fechamento, escolha o lote." />
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" className="h-[27px] px-3 text-[11.5px]" disabled={!fazendaId} onClick={() => setAssistente({ editar: null })} data-testid="lotes-novo">+ Novo lote</Button>
        </div>
      </div>

      <div ref={refQuadro} className={QUADRO_REGUA} style={{ height: altura }} data-testid="quadro-lotes">
        <div className="flex h-[36px] flex-none items-center gap-1.5 whitespace-nowrap border-b px-2.5">
          <Segmentado valor={atividade} onEscolher={setAtividade} altura={22}
            opcoes={[{ valor: '', rotulo: 'Todas' }, ...atividades.map(a => ({ valor: a.id, rotulo: a.nome }))]} />
          <span className="mx-1 h-4 w-px bg-border" />
          <Segmentado valor={situacao} onEscolher={setSituacao} altura={22}
            opcoes={[{ valor: 'ativo', rotulo: 'Ativos' }, { valor: 'encerrado', rotulo: 'Encerrados' }]} />
          <div className="ml-auto flex items-center gap-1.5">
            <Input className="h-[24px] w-[200px] px-2 text-[11px]" placeholder="Buscar código ou pasto" value={busca}
              onChange={e => setBusca(e.target.value)} data-testid="lotes-busca" />
            <span className="w-[72px] text-right text-[11px] tabular-nums text-muted-foreground" data-testid="lotes-contagem">{ordenadas.length} de {naSituacao}</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full table-fixed border-collapse" data-testid="tabela-lotes">
            <Colunas />
            <thead><tr>
              {th('codigo', 'Código')}{th('categoria', 'Categoria')}{th('raca', 'Raça')}{th('programa', 'Programa')}
              {th('cab', 'Cab', true)}{th('peso', 'Peso kg', true)}{th('gmd', 'GMD', true)}{th('pasto', 'Pasto')}
            </tr></thead>
            <tbody>
              {grupos.map(g => (
                <Fragment key={g.atividadeId}>
                  <tr className="border-b border-border bg-[#eef2f7]" data-testid="grupo-lotes">
                    <td colSpan={COLUNAS.length} className={cn(TD_REGUA, 'h-[21px] whitespace-nowrap font-semibold text-[#1f2937]')}>
                      {g.nome}<span className="ml-1.5 font-normal text-muted-foreground" data-testid="grupo-lotes-subtotal">{fraseDoGrupo(g.total)}</span>
                    </td>
                  </tr>
                  {g.lotes.map(l => (
                    <tr key={l.id} onClick={() => setFichaId(l.id)} data-testid="linha-lote"
                      className={cn('cursor-pointer border-b border-border/60 hover:bg-[#f5f8fc]', l.id === novoId && 'bg-[#eaf6ee]', l.situacao === 'encerrado' && 'text-muted-foreground')}>
                      <td className={cn(TD_REGUA, 'whitespace-nowrap font-bold text-[#0b1f3a]')} title={l.codigosAntigos.length ? `antes: ${l.codigosAntigos.join(' · ')}` : undefined}>{l.codigo}
                        {l.conferir && <span data-testid="lote-conferir" title={`Conferir: ${l.conferir}`} className="ml-1 inline-block h-[6px] w-[6px] rounded-full bg-[#d97706] align-middle" />}</td>
                      <td className={TD_REGUA_TEXTO} title={nomeDe(nomes, l.categoriaId) ?? undefined}>{nomeDe(nomes, l.categoriaId) ?? '—'}</td>
                      <td className={TD_REGUA_TEXTO} title={nomeDe(nomes, l.racaId) ?? undefined}>{nomeDe(nomes, l.racaId) ?? '—'}</td>
                      <td className={TD_REGUA_TEXTO} title={nomeDe(nomes, l.programaId) ?? undefined}>{nomeDe(nomes, l.programaId) ?? '—'}</td>
                      <td className={TD_REGUA_NUM}>{n0(l.cabecas)}</td>
                      <td className={TD_REGUA_NUM}>{n0(l.pesoMedioKg)}</td>
                      <td className={TD_REGUA_NUM}>{n3(l.gmdKg)}</td>
                      <td className={TD_REGUA_TEXTO} title={l.pastos.join(' · ') || undefined}>{textoDosPastos(l.pastos) ?? '—'}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {ordenadas.length === 0 && (
                <tr><td colSpan={COLUNAS.length} className="h-[60px] text-center text-[11px] text-muted-foreground" data-testid="lotes-vazio">
                  {!fazendaId ? 'Escolha uma fazenda para ver os lotes.' : erro ?? (carregando ? 'Lendo os lotes…' : 'Nenhum lote neste filtro.')}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <table className={cn(RODAPE_REGUA, 'w-full table-fixed border-collapse')} data-testid="lotes-total">
          <Colunas />
          <tbody><tr className="h-[23px] font-semibold">
            <td className={TD_REGUA}>Total</td><td className={TD_REGUA}>{total.lotes} {total.lotes === 1 ? 'lote' : 'lotes'}</td>
            <td /><td />
            <td className={TD_REGUA_NUM}>{n0(total.cabecas)}</td><td className={TD_REGUA_NUM}>{n0(total.pesoMedioKg)}</td>
            <td className={TD_REGUA_NUM}>{n3(total.gmdKg)}</td><td />
          </tr></tbody>
        </table>
      </div>

      {fazendaId && (
        <FichaDoLote open={ficha !== null} lote={ficha} clienteId={clienteId} fazendaId={fazendaId} fazendaCodigo={fazendaCodigo}
          cadastros={cadastros} onFechar={() => setFichaId(null)} onEditarIdentidade={l => setAssistente({ editar: l })} />
      )}
      {fazendaId && assistente && (
        <AssistenteDoLote open clienteId={clienteId} fazendaId={fazendaId} fazendaRotulo={`${fazendaCodigo} · ${fazendaAtual?.nome ?? ''}`}
          lotesDaFazenda={lotes} editar={assistente.editar} onFechar={() => setAssistente(null)}
          onPronto={r => { setAssistente(null); setNovoId(r.id); if (assistente.editar) setFichaId(r.id); }} />
      )}
    </div>
  );
}

export default LotesTab;
