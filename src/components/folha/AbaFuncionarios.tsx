/**
 * FOLHA-01 · PR B (telas) — a aba FUNCIONÁRIOS: o filtro (D2: "A confirmar" é filtro), a busca por nome ou CPF, a lista e a FICHA AO LADO
 * (D1 a). Contrato §3.1 + §6.
 * ⚠ A DIVISÃO É FIXA: `grid-template-columns: minmax(0,1fr) 340px` — a ficha tem SEMPRE 340px, aberta ou não ("Escolha um funcionário" no
 *   mesmo lugar), para nada se deslocar. Igual para todo cliente e toda quantidade de linhas.
 * ⚠ A TABELA É A RÉGUA DA CASA: `table-layout: fixed`, `colgroup` em px (as larguras do §6), cabeçalho navy preso, rodapé navy fora da
 *   rolagem com o MESMO `colgroup`, um scrollport; nome corta com "…" e o inteiro no `title`; data e valor nunca cortam.
 * ⚠ ABAIXO DE 1000px DE TABELA (a janela de 1280 com a ficha aberta), Registro e Atuação SAEM da tabela (ficam na ficha e no `title` do nome):
 *   as 9 colunas do §6 somam 864px de fixas e a 1280 a tabela tem ~756 — o nome ficaria sem lugar. A regra olha só a LARGURA da janela,
 *   nunca o dado (D-F2 do relatório).
 * ⚠ FOLHA-TELAS-03: a coluna ATUAÇÃO virou FAZENDA (o código "SED", "+N" quando divide; o rateio inteiro no `title`, `fazendaDaAtuacao.ts`),
 *   de 64px e SEMPRE à vista; e a RÉGUA DE FONTES NOVA (UI-FONTES-REGUA-01): filtros 11px/26px, cabeçalho 10px, linha 11px/24px, datas 10px.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Segmentado } from '@/components/ui/segmentado';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';
import { QUADRO_REGUA, RODAPE_REGUA, TextoReservado } from '@/components/ui/regua-tabela';
import { CONTROLE, TEXTO_ROTULO, TH_FONTES, LINHA_FONTES, TD_FONTES, TD_FONTES_TEXTO, TD_FONTES_NUM, TD_FONTES_DATA } from '@/components/ui/regua-fontes';
import { useFazenda } from '@/contexts/FazendaContext';
import { useOrdenacaoTabela, type ColunaOrdenavel } from '@/hooks/useOrdenacaoTabela';
import { useFuncionarios } from '@/hooks/useFolha';
import { cn } from '@/lib/utils';
import {
  chipsQueCabem, dataBR, filtrarFuncionarios, n2, rotuloAAtualizar, rotuloSituacao, rotuloVinculo, tituloDaAtuacao,
  type FiltroFuncionarios, type FuncionarioDaLista,
} from '@/lib/folha/folhaTela';
import { codigosDasFazendas, rotuloDaFazenda, tituloDaFazenda, type CodigoDaFazenda } from '@/lib/folha/fazendaDaAtuacao';
import { aAtualizarDe } from '@/lib/folha/admissao';
import { FichaFuncionario } from './FichaFuncionario';
import { FuncionarioDialog } from './FuncionarioDialog';

type Coluna = 'nome' | 'cargo' | 'vinculo' | 'registro' | 'fazenda' | 'admissao' | 'salario' | 'situacao' | 'a_atualizar';
interface DefColuna { coluna: Coluna; rotulo: string; largura: number | null; direita?: boolean; larga?: boolean; media?: boolean }
/** §6: Nome = o resto · Cargo 96 · Vínculo 64 · Registro 150 · Fazenda 64 (FOLHA-TELAS-03; era Atuação 128, larga) · Admissão 72 ·
 *  Salário 76 · Situação 128 · A atualizar 150. `larga` = só entra com a tabela de 1000px ou mais. */
export const COLUNAS_FUNCIONARIOS: readonly DefColuna[] = [
  { coluna: 'nome', rotulo: 'Nome', largura: null },
  { coluna: 'cargo', rotulo: 'Cargo', largura: 96 },
  /* FOLHA-TELAS-03: abaixo de 760px (1126 com a ficha aberta) o Vínculo sai junto com o "A atualizar" — está na ficha — para a Fazenda entrar */
  { coluna: 'vinculo', rotulo: 'Vínculo', largura: 64, media: true },
  { coluna: 'registro', rotulo: 'Registro (empregador)', largura: 150, larga: true },
  { coluna: 'fazenda', rotulo: 'Fazenda', largura: 64 },
  { coluna: 'admissao', rotulo: 'Admissão', largura: 72 },
  { coluna: 'salario', rotulo: 'Salário', largura: 76, direita: true },
  { coluna: 'situacao', rotulo: 'Situação', largura: 128 },
  { coluna: 'a_atualizar', rotulo: 'A atualizar', largura: 150, media: true },
];
export const LARGURA_MINIMA_DAS_COLUNAS_LARGAS = 1000;
/** FOLHA-01 PR B (gate 23/11 e 24/11: a 1126, com a ficha de 340, o Nome ficava com 22px) — abaixo disto sai também o "A atualizar"
 *  (150px; o mesmo aviso está na ficha, em âmbar). Sem as largas e sem ele sobram 436px fixos: o Nome fica com ~170px a 1126. */
export const LARGURA_MINIMA_DO_A_ATUALIZAR = 760;
export const colunasParaALargura = (largura: number): readonly DefColuna[] => {
  if (largura <= 0 || largura >= LARGURA_MINIMA_DAS_COLUNAS_LARGAS) return COLUNAS_FUNCIONARIOS;
  return COLUNAS_FUNCIONARIOS.filter(c => !c.larga && !(c.media && largura < LARGURA_MINIMA_DO_A_ATUALIZAR));
};
/* a conta do chip (`larguraDoChip`, folhaTela.ts) é a 9,5px; o chip agora tem 10px (régua nova): o orçamento encolhe na mesma razão */
const LARGURA_CHIPS = Math.floor(((150 - 8) * 9.5) / 10);

const ordenaveis = (codigo: CodigoDaFazenda): readonly ColunaOrdenavel<FuncionarioDaLista, Coluna>[] => [
  { coluna: 'nome', tipo: 'texto', valor: f => f.nome },
  { coluna: 'cargo', tipo: 'texto', valor: f => f.cargo },
  { coluna: 'vinculo', tipo: 'texto', valor: f => f.vinculo },
  { coluna: 'registro', tipo: 'texto', valor: f => f.empregador_registro },
  { coluna: 'fazenda', tipo: 'texto', valor: f => rotuloDaFazenda(f.atuacao, codigo) },
  { coluna: 'admissao', tipo: 'data', valor: f => f.admissao },
  { coluna: 'salario', tipo: 'numero', valor: f => f.salario },
  { coluna: 'situacao', tipo: 'texto', valor: f => `${f.situacao}${f.desligamento ?? ''}` },
  { coluna: 'a_atualizar', tipo: 'numero', valor: f => aAtualizarDe(f, f.salario != null).length || null },
];

function Colunas({ cols }: { cols: readonly DefColuna[] }) {
  return <colgroup>{cols.map(c => <col key={c.coluna} style={c.largura ? { width: c.largura } : undefined} />)}</colgroup>;
}

const COR_SITUACAO: Record<FuncionarioDaLista['situacao'], string> = {
  ativo: 'bg-emerald-50 text-emerald-800', afastado: 'bg-amber-50 text-amber-800', desligado: 'bg-muted text-muted-foreground',
};

export function AbaFuncionarios({ clienteId, funcionarioId, onEscolher, onHistorico }: {
  clienteId: string; funcionarioId: string | null; onEscolher: (id: string | null) => void; onHistorico: (id: string) => void;
}) {
  const { data, isLoading, error } = useFuncionarios(clienteId);
  const [filtro, setFiltro] = useState<FiltroFuncionarios>('ativos');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<{ id: string | null } | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setLargura(el.clientWidth);
    medir();
    if (typeof ResizeObserver === 'undefined') return;   /* jsdom: sem medida, todas as colunas */
    const ro = new ResizeObserver(medir); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cols = colunasParaALargura(largura);

  const lista = useMemo(() => data?.funcionarios ?? [], [data]);
  const contagem = data?.contagem ?? null;
  const visiveis = useMemo(() => filtrarFuncionarios(lista, filtro, busca), [lista, filtro, busca]);
  const { fazendas } = useFazenda();
  const codigo = useMemo(() => codigosDasFazendas(fazendas), [fazendas]);
  const ORDENAVEIS = useMemo(() => ordenaveis(codigo), [codigo]);
  const { ordem, alternar, ordenadas } = useOrdenacaoTabela(visiveis, ORDENAVEIS, { coluna: 'nome', direcao: 'asc' });
  const somaSalarios = visiveis.reduce((s, f) => s + (f.salario ?? 0), 0);
  const semSalario = visiveis.filter(f => f.salario == null).length;
  const TH = cn(TH_FONTES, 'sticky top-0 z-10 bg-primary transition-[filter] hover:brightness-110');
  const reserva = '9.999';
  const opcoes = [
    { valor: 'ativos' as const, rotulo: 'Ativos', n: contagem?.ativos },
    { valor: 'desligados' as const, rotulo: 'Desligados', n: contagem?.desligados },
    { valor: 'a_confirmar' as const, rotulo: 'A confirmar', n: contagem?.a_confirmar },
    { valor: 'todos' as const, rotulo: 'Todos', n: contagem?.todos },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* OS FILTROS — um card branco de 36px: o Segmentado de 4 × 108px, a busca de 220px, o "+ Funcionário" à direita (régua 11/26).
          De 1126px para cima é UMA linha; mais estreita, a busca, a frase e o botão descem para a 2ª (antes passavam da borda e a página
          rolava de lado ao digitar na busca — gate de deslocamento a 750). A frase tem base 0: nunca é ela que faz quebrar. */}
      <div className="flex min-h-[36px] shrink-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-card px-2 py-[4px]" data-testid="folha-filtros">
        <Segmentado altura={26} fonte={11} valor={filtro} onEscolher={setFiltro} opcoes={opcoes.map(o => ({
          valor: o.valor,
          rotulo: <span className="inline-flex w-[108px] items-center justify-center gap-1">{o.rotulo}
            <TextoReservado texto={o.n == null ? '—' : o.n.toLocaleString('pt-BR')} reserva={reserva} className="font-semibold" /></span>,
        }))} />
        <div className="relative w-[220px] shrink-0">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pelo nome ou CPF…" className={cn(CONTROLE, 'pl-6')} data-testid="folha-busca" />
        </div>
        {/* frase fora de tabela: nunca "…" nem rolar (P104) — DUAS linhas reservadas a 10px na altura da barra; a lista inteira no `title` */}
        <span className={cn('max-h-[26px] min-w-0 flex-1 basis-0 overflow-hidden whitespace-normal leading-[13px] text-muted-foreground', TEXTO_ROTULO)}
          title="a confirmar: salário, admissão, cargo, CPF ou desligamento que o contador ainda não mandou">
          em âmbar: a confirmar com o contador
        </span>
        <Button size="sm" className={cn(CONTROLE, 'shrink-0 gap-1 bg-cta px-2.5 font-semibold text-cta-foreground hover:bg-cta-hover')}
          onClick={() => setEditando({ id: null })} data-testid="folha-novo">
          <Plus className="size-3.5" /> Funcionário
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }} data-testid="folha-divisao">
        <div ref={caixa} className="min-h-0 min-w-0">
          <div className={QUADRO_REGUA}>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-scroll" data-testid="folha-rolagem">
              <table className="w-full table-fixed border-collapse" data-testid="folha-tabela">
                <Colunas cols={cols} />
                <thead className="text-primary-foreground">
                  <tr className="h-[22px]">
                    {cols.map(c => <ThOrdenavel key={c.coluna} coluna={c.coluna} rotulo={c.rotulo} ordem={ordem} onOrdenar={alternar} alinhaDireita={c.direita} className={TH} />)}
                  </tr>
                </thead>
                <tbody>
                  {ordenadas.map(f => (
                    <LinhaFuncionario key={f.id} f={f} cols={cols} codigo={codigo} escolhido={f.id === funcionarioId} onEscolher={() => onEscolher(f.id)} />
                  ))}
                  {ordenadas.length === 0 && (
                    <tr className={LINHA_FONTES}>
                      <td colSpan={cols.length} className={cn(TD_FONTES, 'py-6 text-center text-muted-foreground')}>
                        {isLoading ? 'Carregando…' : error ? 'Não consegui ler o cadastro da folha. Tente de novo.'
                          : lista.length === 0 ? 'Nenhum funcionário cadastrado — use "+ Funcionário".' : 'Ninguém neste filtro.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className={cn(RODAPE_REGUA, 'overflow-x-hidden overflow-y-scroll')} data-testid="folha-rodape">
              <table className="w-full table-fixed border-collapse">
                <Colunas cols={cols} />
                <tbody>
                  <tr className="h-[24px] text-[11px] font-semibold">
                    <td className="truncate px-1" colSpan={cols.findIndex(c => c.coluna === 'salario')}
                      title={`${visiveis.length} na lista${semSalario ? ` · ${semSalario} sem salário no cadastro` : ''}`}>
                      {visiveis.length.toLocaleString('pt-BR')} na lista{semSalario ? ` · ${semSalario.toLocaleString('pt-BR')} sem salário` : ''}
                    </td>
                    <td className="whitespace-nowrap px-1 text-right tabular-nums" title="a soma dos salários da lista (sem os que não têm salário)">{n2(somaSalarios)}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <FichaFuncionario clienteId={clienteId} funcionarioId={funcionarioId} linha={lista.find(f => f.id === funcionarioId) ?? null}
          onFechar={() => onEscolher(null)} onEditar={id => setEditando({ id })} onHistorico={onHistorico} />
      </div>

      {editando && (
        <FuncionarioDialog clienteId={clienteId} funcionarioId={editando.id} aoFechar={() => setEditando(null)}
          aoCriar={id => { setEditando(null); onEscolher(id); }} />
      )}
    </div>
  );
}

function LinhaFuncionario({ f, cols, codigo, escolhido, onEscolher }: {
  f: FuncionarioDaLista; cols: readonly DefColuna[]; codigo: CodigoDaFazenda; escolhido: boolean; onEscolher: () => void;
}) {
  const chips = aAtualizarDe(f, f.salario != null).map(rotuloAAtualizar);
  const { vistos, escondidos } = chipsQueCabem(chips, LARGURA_CHIPS);
  const tituloNome = [f.nome, f.empregador_registro, f.atuacao.length ? tituloDaAtuacao(f.atuacao) : null].filter(Boolean).join(' · ');
  const celula = (c: Coluna) => {
    switch (c) {
      case 'nome': return <td key={c} className={cn(TD_FONTES_TEXTO, 'font-medium')} title={tituloNome} data-testid="folha-nome">{f.nome}</td>;
      case 'cargo': return <td key={c} className={cn(TD_FONTES_TEXTO, !f.cargo && 'text-muted-foreground')} title={f.cargo ?? 'sem cargo'}>{f.cargo ?? '—'}</td>;
      case 'vinculo': return <td key={c} className={cn(TD_FONTES, 'whitespace-nowrap')}>{rotuloVinculo(f.vinculo)}</td>;
      case 'registro': return <td key={c} className={cn(TD_FONTES_TEXTO, !f.empregador_registro && 'text-muted-foreground')} title={f.empregador_registro ?? undefined}>{f.empregador_registro ?? '—'}</td>;
      case 'fazenda': return <td key={c} className={cn(TD_FONTES_TEXTO, f.atuacao.length === 0 && 'text-muted-foreground')} title={tituloDaFazenda(f.atuacao, codigo) || undefined} data-testid="folha-fazenda">{rotuloDaFazenda(f.atuacao, codigo)}</td>;
      case 'admissao': return <td key={c} className={cn(TD_FONTES_DATA, !f.admissao && 'text-muted-foreground')}>{dataBR(f.admissao)}</td>;
      case 'salario': return <td key={c} className={cn(TD_FONTES_NUM, f.salario == null && 'text-muted-foreground')} title={f.salario_desde ? `desde ${dataBR(f.salario_desde)}` : undefined}>{f.salario == null ? '—' : n2(f.salario)}</td>;
      case 'situacao': return (
        <td key={c} className={cn(TD_FONTES, 'whitespace-nowrap')}>
          <span className={cn('rounded px-1 text-[10px] leading-[15px] tabular-nums', COR_SITUACAO[f.situacao])}>{rotuloSituacao(f)}</span>
        </td>
      );
      case 'a_atualizar': return (
        <td key={c} className={cn(TD_FONTES, 'overflow-hidden whitespace-nowrap')} title={chips.length ? `a atualizar: ${chips.join(', ')}` : undefined} data-testid="folha-chips">
          {chips.length === 0 ? <span className="text-muted-foreground">—</span> : (
            <span className="inline-flex items-center gap-[3px]">
              {vistos.map(r => <span key={r} className="rounded bg-amber-50 px-1 text-[10px] leading-[15px] text-amber-800">{r}</span>)}
              {escondidos > 0 && <span className="text-[10px] font-semibold text-amber-800">+{escondidos}</span>}
            </span>
          )}
        </td>
      );
    }
  };
  return (
    <tr role="link" tabIndex={0} aria-selected={escolhido} data-testid="folha-linha"
      className={cn(LINHA_FONTES, 'cursor-pointer border-b border-border/40 hover:bg-muted/40', escolhido && 'bg-accent/60 hover:bg-accent/60')}
      onClick={onEscolher} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEscolher(); } }}>
      {cols.map(c => celula(c.coluna))}
    </tr>
  );
}
