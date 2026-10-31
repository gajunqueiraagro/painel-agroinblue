/**
 * PATR-01 · PR B — CADASTROS › PATRIMÔNIO (gabarito: mock-patrimonio-v4.html, aprovado 30/10 18h02).
 *
 * ⚠ AS QUATRO ABAS FICAM NO LUGAR DESDE JÁ; só "Bens" tem conteúdo neste PR. "Investimentos sem bem" é o PR C; "Depreciação mês a
 * mês" e "Baixados / vendidos" ficam para depois — as três mostram só o título.
 * ⚠ NENHUM NÚMERO NASCE AQUI: a linha vem da `fn_patrimonio_lista` (aquisição, acumulada, contábil, mercado); o rodapé e os cartões
 * só SOMAM as linhas mostradas (`totaisDaLista`). O cartão "Investimentos sem bem" é o total da `fn_investimentos_sem_bem`.
 * ⚠ A RÉGUA É A DA CASA (Recorrências): cabeçalho navy preso, rodapé navy fora da rolagem com o MESMO `colgroup`, um scrollport,
 * `table-layout: fixed` com larguras em px; texto corta com "…" e o inteiro no `title`; número, valor e data nunca cortam.
 * Fazenda pelo CÓDIGO. Toda coluna ordena, a seta em espaço reservado (`ThOrdenavel`).
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Search, Landmark, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { ThOrdenavel } from '@/components/ui/th-ordenavel';
import { TH_REGUA, TD_REGUA, TD_REGUA_TEXTO, TD_REGUA_NUM, QUADRO_REGUA, RODAPE_REGUA, TextoReservado } from '@/components/ui/regua-tabela';
import { useOrdenacaoTabela } from '@/hooks/useOrdenacaoTabela';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { cn } from '@/lib/utils';
import { useCategoriasPatrimonio, useListaPatrimonio, useSemBemResumo } from '@/hooks/usePatrimonio';
import {
  brl, chipsDeCategoria, COLUNAS_ORDENAVEIS, dataBR, dataDoBem, filtrarBens, n2, nomeCurtoDaCategoria, ROTULO_SITUACAO, rotuloOrigem, rotuloSemDepreciacao,
  rotuloVida, totaisDaLista, type BemDaLista, type ColunaBem,
} from '@/lib/patrimonio/patrimonio';
import { BemDialog } from './BemDialog';

type Visao = 'bens' | 'sem-bem' | 'depreciacao' | 'baixados';

/** OS CHIPS DAS CATEGORIAS numa faixa de 22 px que NUNCA passa da janela (o gate, 31/10: os 10 chips do caso pediam 777 px numa faixa de
 *  640 a 1000 px, e o cadastro tem 13): ficam à vista os que cabem INTEIROS, na ordem do cadastro; o resto vai para o "Mais ▾" (o menu
 *  da casa). O "Mais" tem a largura RESERVADA do maior nome (escolher dentro dele mostra o nome no lugar, navy, sem mover nada). As
 *  larguras se medem numa cópia fora da tela (a mesma fonte); a conta refaz quando a faixa muda de largura ou a fonte chega. */
function ChipsDeCategoria({ chips, valor, onEscolher }: { chips: ReadonlyArray<{ codigo: string; nome: string }>; valor: string; onEscolher: (v: string) => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const medida = useRef<HTMLDivElement>(null);
  const [cabem, setCabem] = useState(chips.length);
  const opcoes = useMemo(() => [{ valor: '', rotulo: 'Todos' }, ...chips.map(c => ({ valor: c.codigo, rotulo: c.nome }))], [chips]);
  const maior = useMemo(() => chips.reduce((m, c) => (c.nome.length > m.length ? c.nome : m), ''), [chips]);
  useLayoutEffect(() => {
    const el = caixa.current; const m = medida.current;
    if (!el || !m) return;
    const contar = () => {
      const larguras = Array.from(m.querySelectorAll('[data-medida="chip"]')).map(b => b.getBoundingClientRect().width);
      const mais = m.querySelector('[data-medida="mais"]')?.getBoundingClientRect().width ?? 0;
      const disponivel = el.clientWidth;
      if (disponivel <= 0) { setCabem(chips.length); return; }   /* ainda sem layout (ou jsdom): nada a esconder */
      const tudo = larguras.reduce((t, x) => t + x, 0) + 2;
      if (tudo <= disponivel) { setCabem(chips.length); return; }
      let soma = 2 + 6 + mais; let n = 0;
      for (let i = 0; i < larguras.length; i++) { if (soma + larguras[i] > disponivel) break; soma += larguras[i]; n = i; }
      setCabem(n);   /* n = quantos chips de categoria ficam à vista ("Todos" é o 0 e fica sempre) */
    };
    contar();
    if (typeof ResizeObserver === 'undefined') return;   /* jsdom (os testes): sem medida, ficam todos */
    const ro = new ResizeObserver(contar); ro.observe(el); ro.observe(m);
    return () => ro.disconnect();
  }, [chips]);
  const vistos = opcoes.slice(0, cabem + 1);
  const escondidos = chips.slice(cabem);
  const escolhidoEscondido = escondidos.find(c => c.codigo === valor) ?? null;
  return (
    <div ref={caixa} className="relative flex min-w-0 flex-1 items-center gap-1.5" data-testid="patrimonio-chips">
      <Segmentado altura={22} fonte={10} valor={escolhidoEscondido ? '__mais' : valor} onEscolher={onEscolher} opcoes={vistos} />
      {escondidos.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={cn('inline-flex h-[22px] shrink-0 items-center gap-1 rounded-md border px-[5px] text-[10px] font-medium',
              escolhidoEscondido ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')} data-testid="patrimonio-chips-mais"
              title={escolhidoEscondido ? escolhidoEscondido.nome : `mais ${escondidos.length} categorias`}>
              <TextoReservado texto={escolhidoEscondido ? escolhidoEscondido.nome : `Mais ${escondidos.length}`} reserva={maior} />
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {escondidos.map(c => (
              <DropdownMenuItem key={c.codigo} onSelect={() => onEscolher(c.codigo)}>
                <Check className={cn('mr-1 h-3 w-3', c.codigo === valor ? 'opacity-100' : 'opacity-0')} />{c.nome}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {/* a cópia que mede (fora da tela, invisível, mesma fonte e mesmo padding do Segmentado com fonte 10) */}
      <div ref={medida} aria-hidden className="pointer-events-none invisible fixed left-[-10000px] top-0 flex whitespace-nowrap">
        {opcoes.map(o => <span key={o.valor} data-medida="chip" className="px-[5px] text-[10px] font-medium">{o.rotulo}</span>)}
        <span data-medida="mais" className="inline-flex items-center gap-1 border px-[5px] text-[10px] font-medium"><span>{maior}</span><span className="w-3" /></span>
      </div>
    </div>
  );
}

/** As colunas, em px (o mock v4: o `colgroup` da lista). "Bem" fica com o resto. Faz. 40 (o mock tinha 36: "Faz." + a seta + o
 *  padding pedem 38). MEDIDO no gate de tela (31/10, a 1000 px a soma antiga de 786 deixava 28 px para "Bem"): valores 84 = o teto do
 *  rodapé "108.235.599,99" em negrito pede 83; Origem 92 = "sem lançamento" pede 90; Situação 74 = o selo "em formação" 62 + 8 + 4;
 *  Categoria 100 = o NOME CURTO (`nomeCurtoDaCategoria`; o maior, "Formação de área"/"Correção de solo", cabe sem corte — a regra do
 *  Gabriel 31/10: a coluna Categoria não corta a 1170), o nome completo no `title`. Soma das fixas 762: a 1000 px "Bem" fica com
 *  ~45 px (corta com o `title`), a 1170 com ~215. */
export const COLUNAS_DA_LISTA: ReadonlyArray<{ coluna: ColunaBem; rotulo: string; largura: number | null; direita?: boolean }> = [
  { coluna: 'data', rotulo: 'Data', largura: 60 },
  { coluna: 'bem', rotulo: 'Bem', largura: null },
  { coluna: 'categoria', rotulo: 'Categoria', largura: 100 },
  { coluna: 'fazenda', rotulo: 'Faz.', largura: 40 },
  { coluna: 'situacao', rotulo: 'Situação', largura: 74 },
  { coluna: 'vida', rotulo: 'Vida', largura: 40, direita: true },
  { coluna: 'aquisicao', rotulo: 'Aquisição', largura: 84, direita: true },
  { coluna: 'depreciado', rotulo: 'Depreciado', largura: 84, direita: true },
  { coluna: 'contabil', rotulo: 'Contábil', largura: 84, direita: true },
  { coluna: 'mercado', rotulo: 'Mercado', largura: 84, direita: true },
  { coluna: 'origem', rotulo: 'Origem', largura: 92 },
];
const LARGURA_ACOES = 20;

function Colunas() {
  return (
    <colgroup>
      {COLUNAS_DA_LISTA.map(c => <col key={c.coluna} style={c.largura ? { width: c.largura } : undefined} />)}
      <col style={{ width: LARGURA_ACOES }} />
    </colgroup>
  );
}

const SITUACAO_COR: Record<BemDaLista['situacao'], string> = {
  em_uso: 'bg-emerald-50 text-emerald-800', em_formacao: 'bg-amber-50 text-amber-800', baixado: 'bg-muted text-muted-foreground',
};

export function PatrimonioTela() {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const { fazendas } = useFazenda();
  const [visao, setVisao] = useState<Visao>('bens');
  const [fazendaId, setFazendaId] = useState<string>('');
  const [posicao, setPosicao] = useState<string>(() => hojeLocal());
  const [categoria, setCategoria] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<{ bemId: string | null } | null>(null);

  const { data: categorias = [] } = useCategoriasPatrimonio();
  const { data: bens = [], isLoading, error } = useListaPatrimonio(clienteId, fazendaId || null, posicao);
  const { data: semBem } = useSemBemResumo(clienteId);

  const fazendasOperacionais = useMemo(() => fazendas.filter(f => f.id !== '__global__'), [fazendas]);
  const codigoDa = useMemo(() => new Map(fazendasOperacionais.map(f => [f.id, f.codigo ?? f.nome])), [fazendasOperacionais]);
  /* os chips: só as categorias que têm bem na lista (o cadastro tem 13; os 13 não cabem a 1170 px) — "Todos" sempre primeiro */
  const chips = useMemo(() => {
    const comBem = new Set(bens.map(b => b.categoria_codigo));
    return chipsDeCategoria(categorias).filter(c => comBem.has(c.codigo));
  }, [categorias, bens]);
  const visiveis = useMemo(() => filtrarBens(bens, categoria, busca), [bens, categoria, busca]);
  const { ordem, alternar, ordenadas } = useOrdenacaoTabela(visiveis, COLUNAS_ORDENAVEIS, { coluna: 'data', direcao: 'asc' });
  const totais = useMemo(() => totaisDaLista(visiveis), [visiveis]);
  const geral = useMemo(() => totaisDaLista(bens), [bens]);
  const anoDaPosicao = posicao.slice(0, 4);

  const cartoes: Array<{ chave: string; rotulo: string; valor: string; cor?: string; alerta?: boolean }> = [
    { chave: 'aquisicao', rotulo: 'Valor de aquisição', valor: brl(geral.aquisicao) },
    { chave: 'contabil', rotulo: posicao === hojeLocal() ? 'Valor contábil hoje' : `Valor contábil em ${dataBR(posicao)}`, valor: brl(geral.contabil) },
    { chave: 'mercado', rotulo: 'Valor de mercado', valor: brl(geral.mercado), cor: 'text-emerald-800' },
    { chave: 'ano', rotulo: `Depreciação em ${anoDaPosicao}`, valor: brl(geral.noAno) },
    { chave: 'sem-bem', rotulo: 'Investimentos sem bem', valor: semBem ? `${semBem.n.toLocaleString('pt-BR')} · ${brl(semBem.valor)}` : '—', alerta: true },
  ];

  const TH = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary hover:bg-primary-foreground/10');

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-background" data-testid="patrimonio-tela">
      <div className="shrink-0 space-y-1.5 px-4 pb-1.5 pt-2">
        {/* O TOPO: o que a tela é · fazenda · posição · novo bem */}
        <div className="flex h-[28px] items-center gap-2">
          {/* a frase não corta (fora de tabela, nada de "…"): curta o bastante para a menor janela do gate (1000 px) */}
          <p className="min-w-0 flex-1 whitespace-nowrap text-[10px] text-muted-foreground">o valor vem dos lançamentos ligados a cada bem</p>
          <span className="shrink-0 text-[10px] text-muted-foreground">Fazenda</span>
          <SearchableSelect value={fazendaId} onValueChange={setFazendaId} allLabel="Todas" allValue=""
            options={fazendasOperacionais.map(f => ({ value: f.id, label: f.codigo ? `${f.codigo} · ${f.nome}` : f.nome }))}
            className="w-[200px] shrink-0" triggerClassName="h-[26px] text-[11px]" />
          <span className="shrink-0 text-[10px] text-muted-foreground">Posição em</span>
          <div className="w-[120px] shrink-0"><DatePicker size="compact" value={posicao} onChange={v => { if (v) setPosicao(v); }} /></div>
          <Button size="sm" className="h-[26px] shrink-0 gap-1 bg-cta px-2.5 text-[11px] font-semibold text-cta-foreground hover:bg-cta-hover"
            disabled={!clienteId} title={clienteId ? undefined : 'Escolha um cliente primeiro'} onClick={() => setAberto({ bemId: null })}
            data-testid="patrimonio-novo">
            <Plus className="size-3.5" /> Novo bem
          </Button>
        </div>

        {/* AS QUATRO ABAS — sempre no mesmo lugar; o contador reserva o lugar do maior número */}
        <Segmentado altura={22} valor={visao} onEscolher={setVisao} opcoes={[
          { valor: 'bens', rotulo: 'Bens' },
          { valor: 'sem-bem', rotulo: <span>Investimentos sem bem <TextoReservado texto={semBem ? semBem.n.toLocaleString('pt-BR') : '—'} reserva="99.999" className="ml-1 font-semibold text-red-600" /></span> },
          { valor: 'depreciacao', rotulo: 'Depreciação mês a mês' },
          { valor: 'baixados', rotulo: 'Baixados / vendidos' },
        ]} />

        {/* OS CINCO CARTÕES — mesma altura; o VALOR nunca corta (`whitespace-nowrap`), só o rótulo corta com o `title` */}
        <div className="grid grid-cols-5 gap-1.5" data-testid="patrimonio-cartoes">
          {cartoes.map(c => (
            <div key={c.chave} className={cn('h-[42px] min-w-0 rounded-md border bg-card px-2 py-1.5', c.alerta && 'border-red-300')} data-testid={`patrimonio-cartao-${c.chave}`}>
              <div className="truncate text-[10px] leading-none text-muted-foreground" title={c.rotulo}>{c.rotulo}</div>
              <div className={cn('mt-1 whitespace-nowrap text-[13px] font-semibold leading-tight tabular-nums', c.cor, c.alerta && 'text-red-700')}>{c.valor}</div>
            </div>
          ))}
        </div>

        {visao === 'bens' && (
          /* OS FILTROS — uma linha fixa de 22px: a busca e os chips das categorias */
          <div className="flex h-[22px] items-center gap-1.5" data-testid="patrimonio-filtros">
            <div className="relative w-[170px] shrink-0">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar bem, placa, série…" className="h-[22px] pl-6 text-[10px]" data-testid="patrimonio-busca" />
            </div>
            <ChipsDeCategoria chips={chips} valor={categoria} onEscolher={setCategoria} />
          </div>
        )}
      </div>

      {visao !== 'bens' ? (
        /* AS TRÊS ABAS QUE CHEGAM DEPOIS: só o título, no lugar certo */
        <div className="mx-4 mb-1 min-h-0 flex-1 rounded-lg border bg-card px-3 py-2" data-testid={`patrimonio-visao-${visao}`}>
          <h2 className="text-[11px] font-semibold">
            {visao === 'sem-bem' ? 'Investimentos sem bem' : visao === 'depreciacao' ? 'Depreciação mês a mês' : 'Baixados / vendidos'}
          </h2>
        </div>
      ) : (
        <div className="min-h-0 flex-1 px-4 pb-1">
          <div className={QUADRO_REGUA}>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-scroll" data-testid="patrimonio-rolagem">
              <table className="w-full table-fixed border-collapse" data-testid="patrimonio-tabela">
                <Colunas />
                <thead className="text-primary-foreground">
                  <tr className="h-[22px]">
                    {COLUNAS_DA_LISTA.map(c => (
                      <ThOrdenavel key={c.coluna} coluna={c.coluna} rotulo={c.rotulo} ordem={ordem} onOrdenar={alternar} alinhaDireita={c.direita} className={TH} />
                    ))}
                    <th className={TH} />
                  </tr>
                </thead>
                <tbody>
                  {ordenadas.map(b => {
                    const semDep = rotuloSemDepreciacao(b);
                    const origem = rotuloOrigem(b);
                    const titulo = [b.descricao, b.marca, b.modelo, b.identificacao].filter(Boolean).join(' · ');
                    return (
                      <tr key={b.bem_id} role="link" tabIndex={0} className="h-[19px] cursor-pointer border-b border-border/40 hover:bg-muted/40"
                        onClick={() => setAberto({ bemId: b.bem_id })}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setAberto({ bemId: b.bem_id }); } }}
                        data-testid="patrimonio-linha">
                        <td className={cn(TD_REGUA_NUM, 'text-left text-[9.5px]')}>{dataBR(dataDoBem(b))}</td>
                        <td className={TD_REGUA_TEXTO} title={titulo}>{b.descricao}</td>
                        <td className={TD_REGUA_TEXTO} title={b.categoria_nome}>{nomeCurtoDaCategoria(b)}</td>
                        <td className={cn(TD_REGUA, 'whitespace-nowrap')} title={b.fazenda_codigo ?? undefined}>{b.fazenda_codigo ?? codigoDa.get(b.fazenda_id) ?? '—'}</td>
                        <td className={cn(TD_REGUA, 'whitespace-nowrap')}>
                          <span className={cn('rounded px-1 text-[9.5px] leading-[14px]', SITUACAO_COR[b.situacao])}>{ROTULO_SITUACAO[b.situacao]}</span>
                        </td>
                        <td className={TD_REGUA_NUM}>{rotuloVida(b.deprecia ? b.vida_util_meses : null)}</td>
                        <td className={TD_REGUA_NUM}>{n2(b.aquisicao)}</td>
                        <td className={TD_REGUA_NUM}>{semDep ? <span className="italic text-muted-foreground">{semDep}</span> : n2(b.depreciacao_acumulada)}</td>
                        <td className={TD_REGUA_NUM}>{n2(b.valor_contabil)}</td>
                        <td className={cn(TD_REGUA_NUM, b.mercado_valor != null ? 'text-emerald-800' : 'text-muted-foreground')}
                          title={b.mercado_data ? `avaliação de ${dataBR(b.mercado_data)}` : undefined}>
                          {b.mercado_valor != null ? n2(b.mercado_valor) : '—'}
                        </td>
                        <td className={cn(TD_REGUA, 'whitespace-nowrap overflow-hidden')}
                          title={b.n_a_conferir + b.n_selo > 0 ? `${origem} · ${b.n_a_conferir + b.n_selo} a conferir` : origem}>
                          <span className={cn('rounded px-1 text-[9.5px] leading-[14px]', b.n_lancamentos > 0 ? 'bg-sky-50 text-sky-800' : 'bg-muted text-muted-foreground')}>{origem}</span>
                          {b.n_a_conferir + b.n_selo > 0 && <span className="ml-1 text-[9.5px] text-amber-700">!</span>}
                        </td>
                        <td className={cn(TD_REGUA, 'px-0 text-center text-muted-foreground')}><Pencil className="mx-auto h-3 w-3" aria-label="Abrir o bem" /></td>
                      </tr>
                    );
                  })}
                  {ordenadas.length === 0 && (
                    <tr className="h-[19px]">
                      <td colSpan={COLUNAS_DA_LISTA.length + 1} className={cn(TD_REGUA, 'py-6 text-center text-muted-foreground')}>
                        {isLoading ? 'Carregando…'
                          : error ? 'Não consegui ler o patrimônio. Tente de novo.'
                          : bens.length === 0 ? (
                            <span className="inline-flex items-center gap-1"><Landmark className="h-3.5 w-3.5" /> Nenhum bem cadastrado — use “Novo bem” para começar.</span>
                          ) : 'Nenhum bem neste filtro.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* O RODAPÉ PRESO — o total do que está na tela, mesma régua de colunas, fora da rolagem */}
            <div className={cn(RODAPE_REGUA, 'overflow-x-hidden overflow-y-scroll')} data-testid="patrimonio-rodape">
              <table className="w-full table-fixed border-collapse">
                <Colunas />
                <tbody>
                  <tr className="h-[22px] font-semibold">
                    <td />
                    <td className="truncate px-1" title={`${totais.n} ${totais.n === 1 ? 'bem' : 'bens'}`}>{totais.n} {totais.n === 1 ? 'bem' : 'bens'}</td>
                    <td colSpan={4} />
                    <td className="whitespace-nowrap px-1 text-right tabular-nums">{n2(totais.aquisicao)}</td>
                    <td className="whitespace-nowrap px-1 text-right tabular-nums">{n2(totais.depreciado)}</td>
                    <td className="whitespace-nowrap px-1 text-right tabular-nums">{n2(totais.contabil)}</td>
                    <td className="whitespace-nowrap px-1 text-right tabular-nums" title="sem avaliação, entra pelo contábil">{n2(totais.mercado)}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {aberto && clienteId && (
        <BemDialog bemId={aberto.bemId} clienteId={clienteId} posicao={posicao} linha={bens.find(b => b.bem_id === aberto.bemId) ?? null}
          aoFechar={() => setAberto(null)} aoCriar={id => setAberto({ bemId: id })} />
      )}
    </div>
  );
}
