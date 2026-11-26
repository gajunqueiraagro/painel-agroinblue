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
 * ⚠ FOLHA-REGUA-01 (Gabriel 26/11 08:13 e 08:14): a régua da Folha (`reguaFolha.ts`: tabela 10,5 · linha 20 · filtros 11/24); o
 *   "+ Funcionário" no navy da casa; a Situação é SÓ O SELO (70px; a data do desligamento no `title`) e o espaço vai para o Cargo (o maior
 *   do proto inteiro) e para o NOME — NENHUMA COLUNA COM SOBRA ENQUANTO OUTRA CORTA: as colunas opcionais (Vínculo, "A atualizar",
 *   Registro, nesta ordem) só entram se o Nome continuar com `NOME_MINIMO` (o maior nome da Vera inteiro); senão ficam na ficha.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';
import { QUADRO_REGUA, RODAPE_REGUA, TextoReservado } from '@/components/ui/regua-tabela';
import { CONTROLE_F, ROTULO_F, TH_F, LINHA_F, TD_F, TD_F_TEXTO, TD_F_NUM, TD_F_DATA, LINHA_RODAPE_F, SELO_F, ALTURA_F, FONTE_F, BOTAO_PRINCIPAL_F } from './reguaFolha';
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
interface DefColuna { coluna: Coluna; rotulo: string; largura: number | null; direita?: boolean; opcional?: number }
/** FOLHA-REGUA-01 — px MEDIDOS no navegador (+ 8 de padding; o cabeçalho que ordena pede o rótulo + 16, gate de cortes): Cargo 122
 *  ("Operador de Maquinas" 114, "Auxiliar Administrativo" 111, os maiores do proto, inteiros) · Vínculo 64 · Registro 150 · Fazenda 57 (o
 *  cabeçalho "Fazenda"; o código "SED +1" tem 38) · Admissão 71 ("00/00/0000" 63) · Salário 62 ("99.999,99" 54) · Situação 62 (o selo
 *  "Desligado" 46 + 12) · A atualizar 150. `opcional` = a ordem em que entra quando sobra lugar. */
export const COLUNAS_FUNCIONARIOS: readonly DefColuna[] = [
  { coluna: 'nome', rotulo: 'Nome', largura: null },
  { coluna: 'cargo', rotulo: 'Cargo', largura: 122 },
  { coluna: 'vinculo', rotulo: 'Vínculo', largura: 64, opcional: 1 },
  { coluna: 'registro', rotulo: 'Registro (empregador)', largura: 150, opcional: 3 },
  { coluna: 'fazenda', rotulo: 'Fazenda', largura: 57 },
  { coluna: 'admissao', rotulo: 'Admissão', largura: 71 },
  { coluna: 'salario', rotulo: 'Salário', largura: 62, direita: true },
  { coluna: 'situacao', rotulo: 'Situação', largura: 62 },
  { coluna: 'a_atualizar', rotulo: 'A atualizar', largura: 150, opcional: 2 },
];
/** o lugar do Nome: o maior nome da Vera no proto (36 letras, 209px medidos a 10,5px/500) + 8 de padding. A 1126 com a ficha a tabela tem
 *  608px: 374 fixos + 234 de Nome (218 com a barra de rolagem de 16 de quem a tem fixa). Nome maior que isso (o NJ tem um de 41 letras) corta com o inteiro no `title`. */
export const NOME_MINIMO = 218;
/** a barra de rolagem do corpo (`overflow-y-scroll`, sempre lá) */
const ROLAGEM = 16;
/** as colunas fixas sempre à vista e, por ordem, as opcionais enquanto o Nome continuar com `NOME_MINIMO`; sem medida (0), todas */
export const colunasParaALargura = (largura: number): readonly DefColuna[] => {
  if (largura <= 0) return COLUNAS_FUNCIONARIOS;
  let livre = largura - ROLAGEM - NOME_MINIMO - COLUNAS_FUNCIONARIOS.reduce((s, c) => s + (c.opcional || c.largura == null ? 0 : c.largura), 0);
  const entram = new Set<Coluna>();
  for (const c of [...COLUNAS_FUNCIONARIOS].filter(c => c.opcional).sort((a, b) => (a.opcional ?? 0) - (b.opcional ?? 0))) {
    if ((c.largura ?? 0) > livre) break;
    livre -= c.largura ?? 0; entram.add(c.coluna);
  }
  return COLUNAS_FUNCIONARIOS.filter(c => !c.opcional || entram.has(c.coluna));
};
/* a conta do chip (`larguraDoChip`, folhaTela.ts) é a 9,5px — o tamanho do selo da régua */
const LARGURA_CHIPS = 150 - 8;

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

/** o selo da Situação: a palavra só (a data do desligamento vai no `title` da célula e na ficha) */
const ROTULO_DO_SELO: Record<FuncionarioDaLista['situacao'], string> = { ativo: 'Ativo', afastado: 'Afastado', desligado: 'Desligado' };
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
  const TH = cn(TH_F, 'sticky top-0 z-10 bg-primary transition-[filter] hover:brightness-110');
  const reserva = '9.999';
  const opcoes = [
    { valor: 'ativos' as const, rotulo: 'Ativos', n: contagem?.ativos },
    { valor: 'desligados' as const, rotulo: 'Desligados', n: contagem?.desligados },
    { valor: 'a_confirmar' as const, rotulo: 'A confirmar', n: contagem?.a_confirmar },
    { valor: 'todos' as const, rotulo: 'Todos', n: contagem?.todos },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* OS FILTROS — um card branco de 32px: o Segmentado de 4 × 100px, a busca de 220px, o "+ Funcionário" à direita (régua 11/24).
          De 1126px para cima é UMA linha; mais estreita, a busca, a frase e o botão descem para a 2ª (antes passavam da borda e a página
          rolava de lado ao digitar na busca — gate de deslocamento a 750). A frase tem base de 150px (cabe em 2 linhas): a 1126 fica na linha; mais estreita, desce com o botão. */}
      <div className="flex min-h-[32px] shrink-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-card px-2 py-[4px]" data-testid="folha-filtros">
        <Segmentado altura={ALTURA_F} fonte={FONTE_F} valor={filtro} onEscolher={setFiltro} opcoes={opcoes.map(o => ({
          valor: o.valor,
          rotulo: <span className="inline-flex w-[100px] items-center justify-center gap-1">{o.rotulo}
            <TextoReservado texto={o.n == null ? '—' : o.n.toLocaleString('pt-BR')} reserva={reserva} className="font-semibold" /></span>,
        }))} />
        <div className="relative w-[220px] shrink-0">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pelo nome ou CPF…" className={cn(CONTROLE_F, 'pl-6')} data-testid="folha-busca" />
        </div>
        {/* frase fora de tabela: nunca "…" nem rolar (P104) — DUAS linhas reservadas a 10px (24px); a lista inteira no `title` */}
        <span className={cn(ROTULO_F, 'max-h-[24px] min-w-0 flex-1 basis-[150px] overflow-hidden whitespace-normal leading-[12px] text-muted-foreground')}
          title="a confirmar: salário, admissão, cargo, CPF ou desligamento que o contador ainda não mandou">
          em âmbar: a confirmar com o contador
        </span>
        <button type="button" className={cn(BOTAO_PRINCIPAL_F, 'inline-flex shrink-0 items-center gap-1')}
          onClick={() => setEditando({ id: null })} data-testid="folha-novo">
          <Plus className="size-3.5" /> Funcionário
        </button>
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
                    <tr className={LINHA_F}>
                      <td colSpan={cols.length} className={cn(TD_F, 'py-6 text-center text-muted-foreground')}>
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
                  <tr className={LINHA_RODAPE_F}>
                    <td className="truncate px-1" colSpan={cols.findIndex(c => c.coluna === 'salario')}
                      title={`${visiveis.length} na lista${semSalario ? ` · ${semSalario} sem salário no cadastro` : ''}`}>
                      {visiveis.length.toLocaleString('pt-BR')} na lista{semSalario ? ` · ${semSalario.toLocaleString('pt-BR')} sem salário` : ''}
                    </td>
                    <td className="whitespace-nowrap px-1 text-right tabular-nums" title="a soma dos salários da lista (sem os que não têm salário)">{n2(somaSalarios)}</td>
                    <td colSpan={cols.length - cols.findIndex(c => c.coluna === 'salario') - 1} />
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
      case 'nome': return <td key={c} className={cn(TD_F_TEXTO, 'font-medium')} title={tituloNome} data-testid="folha-nome">{f.nome}</td>;
      case 'cargo': return <td key={c} className={cn(TD_F_TEXTO, !f.cargo && 'text-muted-foreground')} title={f.cargo ?? 'sem cargo'}>{f.cargo ?? '—'}</td>;
      case 'vinculo': return <td key={c} className={cn(TD_F, 'whitespace-nowrap')}>{rotuloVinculo(f.vinculo)}</td>;
      case 'registro': return <td key={c} className={cn(TD_F_TEXTO, !f.empregador_registro && 'text-muted-foreground')} title={f.empregador_registro ?? undefined}>{f.empregador_registro ?? '—'}</td>;
      case 'fazenda': return <td key={c} className={cn(TD_F_TEXTO, f.atuacao.length === 0 && 'text-muted-foreground')} title={tituloDaFazenda(f.atuacao, codigo) || undefined} data-testid="folha-fazenda">{rotuloDaFazenda(f.atuacao, codigo)}</td>;
      case 'admissao': return <td key={c} className={cn(TD_F_DATA, !f.admissao && 'text-muted-foreground')}>{dataBR(f.admissao)}</td>;
      case 'salario': return <td key={c} className={cn(TD_F_NUM, f.salario == null && 'text-muted-foreground')} title={f.salario_desde ? `desde ${dataBR(f.salario_desde)}` : undefined}>{f.salario == null ? '—' : n2(f.salario)}</td>;
      case 'situacao': return (
        <td key={c} className={cn(TD_F, 'whitespace-nowrap')} title={rotuloSituacao(f)} data-testid="folha-situacao">
          <span className={cn(SELO_F, COR_SITUACAO[f.situacao])}>{ROTULO_DO_SELO[f.situacao]}</span>
        </td>
      );
      case 'a_atualizar': return (
        <td key={c} className={cn(TD_F, 'overflow-hidden whitespace-nowrap')} title={chips.length ? `a atualizar: ${chips.join(', ')}` : undefined} data-testid="folha-chips">
          {chips.length === 0 ? <span className="text-muted-foreground">—</span> : (
            <span className="inline-flex items-center gap-[3px]">
              {vistos.map(r => <span key={r} className="rounded bg-amber-50 px-1 text-[9.5px] leading-[15px] text-amber-800">{r}</span>)}
              {escondidos > 0 && <span className="text-[9.5px] font-semibold text-amber-800">+{escondidos}</span>}
            </span>
          )}
        </td>
      );
    }
  };
  return (
    <tr role="link" tabIndex={0} aria-selected={escolhido} data-testid="folha-linha"
      className={cn(LINHA_F, 'cursor-pointer border-b border-border/40 hover:bg-muted/40', escolhido && 'bg-accent/60 hover:bg-accent/60')}
      onClick={onEscolher} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEscolher(); } }}>
      {cols.map(c => celula(c.coluna))}
    </tr>
  );
}
