/**
 * LOTES-03 F1 — Produção › Lotes (mock lotes-03-assistente.html, Gabriel 06/11 15:45): a lista dos lotes da fazenda.
 * Filtros (atividade do cadastro, Ativos/Encerrados, busca que acha também os códigos antigos), todas as colunas ordenáveis, uma
 * linha por lote, linha de total (cab. somada; peso e GMD ponderados). Cab., peso, GMD e pasto LIDOS do fechamento (`fn_lotes_da_fazenda`):
 * lote sem lançamento = "—". "+ Novo lote" abre o assistente; a linha abre a ficha.
 */
import { useMemo, useState } from 'react';
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
import { colunasDosLotes, filtrarLotes, mapaDoCadastro, nomeDe, textoDosPastos, totalDosLotes, type ColunaDosLotes, type FiltroDeSituacao } from '@/lib/lotes/lista';
import { FichaDoLote } from '@/components/lotes/FichaDoLote';
import { AssistenteDoLote } from '@/components/lotes/AssistenteDoLote';
import type { LoteDaLista } from '@/lib/lotes/tipos';

const n0 = (v: number | null) => (v == null ? '—' : formatNum(v, 0));
const n3 = (v: number | null) => (v == null ? '—' : formatNum(v, 3));
/** a cor do selo da atividade, pela sigla (as do mock); sigla nova = cinza */
const COR_DA_ATIVIDADE: Readonly<Record<string, string>> = {
  CR: 'bg-[#e8f5ec] text-[#22693f]', RC: 'bg-[#e3edfb] text-[#24508f]', EG: 'bg-[#fdf1e3] text-[#8a5212]', RP: 'bg-[#f0e9f8] text-[#5b3c8a]',
};

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
  const atividades = useMemo(() => cadastros.filter(c => c.tipo === 'atividade' && c.ativo), [cadastros]);

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
        <Ajuda titulo="Lotes" oQueE="O lote é o grupo de animais que você maneja junto. O código segue sempre o padrão categoria · raça · atividade · número."
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
            <Input className="h-[24px] w-[200px] px-2 text-[11px]" placeholder="Buscar código, nome ou pasto" value={busca}
              onChange={e => setBusca(e.target.value)} data-testid="lotes-busca" />
            <span className="w-[72px] text-right text-[11px] tabular-nums text-muted-foreground" data-testid="lotes-contagem">{ordenadas.length} de {naSituacao}</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full table-fixed border-collapse" data-testid="tabela-lotes">
            <colgroup>
              <col style={{ width: 96 }} /><col /><col style={{ width: 80 }} /><col style={{ width: 80 }} /><col style={{ width: 78 }} />
              <col style={{ width: 84 }} /><col style={{ width: 58 }} /><col style={{ width: 50 }} /><col style={{ width: 50 }} /><col style={{ width: 52 }} /><col style={{ width: 72 }} />
            </colgroup>
            <thead><tr>
              {th('codigo', 'Código')}{th('nome', 'Nome')}{th('atividade', 'Atividade')}{th('sistema', 'Sistema')}
              {th('programa', 'Programa')}{th('destino', 'Destino')}{th('carimbo', 'Carimbo')}{th('cab', 'Cab.', true)}
              {th('peso', 'Peso', true)}{th('gmd', 'GMD', true)}{th('pasto', 'Pasto')}
            </tr></thead>
            <tbody>
              {ordenadas.map(l => {
                const ativ = nomes.get(l.atividadeId);
                return (
                  <tr key={l.id} onClick={() => setFichaId(l.id)} data-testid="linha-lote"
                    className={cn('cursor-pointer border-b border-border/60 hover:bg-[#f5f8fc]', l.id === novoId && 'bg-[#eaf6ee]', l.situacao === 'encerrado' && 'text-muted-foreground')}>
                    <td className={cn(TD_REGUA, 'whitespace-nowrap font-bold')} title={l.codigosAntigos.length ? `antes: ${l.codigosAntigos.join(' · ')}` : undefined}>{l.codigo}
                      {l.conferir && <span data-testid="lote-conferir" title={`Conferir: ${l.conferir}`} className="ml-1 inline-block h-[6px] w-[6px] rounded-full bg-[#d97706] align-middle" />}</td>
                    <td className={TD_REGUA_TEXTO} title={l.nomeCampeiro ?? undefined}>{l.nomeCampeiro ?? '—'}</td>
                    <td className={TD_REGUA}>
                      <span className={cn('inline-block w-[70px] truncate rounded text-center text-[9.5px] font-semibold', COR_DA_ATIVIDADE[ativ?.sigla ?? ''] ?? 'bg-[#f3f4f6] text-[#4b5563]')}
                        title={ativ?.nome}>{ativ?.nome ?? '—'}</span>
                    </td>
                    <td className={TD_REGUA_TEXTO} title={nomeDe(nomes, l.sistemaId) ?? undefined}>{nomeDe(nomes, l.sistemaId) ?? '—'}</td>
                    <td className={TD_REGUA_TEXTO} title={nomeDe(nomes, l.programaId) ?? undefined}>{nomeDe(nomes, l.programaId) ?? '—'}</td>
                    <td className={TD_REGUA_TEXTO} title={nomeDe(nomes, l.destinoId) ?? undefined}>{nomeDe(nomes, l.destinoId) ?? '—'}</td>
                    <td className={cn(TD_REGUA, 'text-center tabular-nums')}>{l.carimbo ?? '—'}</td>
                    <td className={TD_REGUA_NUM}>{n0(l.cabecas)}</td>
                    <td className={TD_REGUA_NUM}>{n0(l.pesoMedioKg)}</td>
                    <td className={TD_REGUA_NUM}>{n3(l.gmdKg)}</td>
                    <td className={TD_REGUA_TEXTO} title={l.pastos.join(' · ') || undefined}>{textoDosPastos(l.pastos) ?? '—'}</td>
                  </tr>
                );
              })}
              {ordenadas.length === 0 && (
                <tr><td colSpan={11} className="h-[60px] text-center text-[11px] text-muted-foreground" data-testid="lotes-vazio">
                  {!fazendaId ? 'Escolha uma fazenda para ver os lotes.' : erro ?? (carregando ? 'Lendo os lotes…' : 'Nenhum lote neste filtro.')}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <table className={cn(RODAPE_REGUA, 'w-full table-fixed border-collapse')} data-testid="lotes-total">
          <colgroup>
            <col style={{ width: 96 }} /><col /><col style={{ width: 80 }} /><col style={{ width: 80 }} /><col style={{ width: 78 }} />
            <col style={{ width: 84 }} /><col style={{ width: 58 }} /><col style={{ width: 50 }} /><col style={{ width: 50 }} /><col style={{ width: 52 }} /><col style={{ width: 72 }} />
          </colgroup>
          <tbody><tr className="h-[23px] font-semibold">
            <td className={TD_REGUA}>Total</td><td className={TD_REGUA}>{total.lotes} {total.lotes === 1 ? 'lote' : 'lotes'}</td>
            <td /><td /><td /><td /><td />
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
