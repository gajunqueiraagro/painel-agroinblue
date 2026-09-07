/**
 * O de-para de UM campo, num modal — [ENRIQUECER-TELA-01] (133b).
 *
 * ⚠ ESTA É A ÚNICA LISTA DE DE-PARA DA ABA ENRIQUECER. Os cinco painéis empilhados de
 * `V2ImportLancamentosExcel` faziam a página crescer metros e o contador de pendências —
 * a única informação que diz se falta trabalho — saía da vista no primeiro rolar. Na rota
 * do menu (Importação de lançamentos) eles continuam; aqui, o card abre este modal.
 *
 * ⚠ OS SELETORES SÃO OS MESMOS DA CASA, e não versões locais: `PlanoSubcentroSelect`,
 * `FavorecidoSelect` e `ContaBancariaSelect` são os que o painel da rota do menu e o
 * Lançamento oficial usam. Um seletor próprio aqui divergiria deles na primeira regra
 * nova — e é exatamente o que este envelope veio consertar em outro lugar.
 *
 * ⚠ O CARD RESPONDE UMA PERGUNTA POR VALOR, NÃO POR LINHA. "Cartão Sicredi Lavoura Ag.
 * 0903…" aparece uma vez, com quantas linhas o usam; responder ali resolve as N. E a
 * resposta fica memorizada: o selo "apelido" diz que aquele texto já foi ensinado.
 */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { ContaBancariaSelect, type ContaSelecionavel } from '@/components/shared/ContaBancariaSelect';
import type { ClassificacaoItem, FornecedorV2, Safra } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import type { CampoDePara } from '@/v2/hooks/useImportLancamentosExcel';
import type { DeParaItem, DeParaMap } from '@/v2/lib/importLanc/importLancamentosView';

/** Um candidato de conta, já ordenado pela sugestão (mais longo primeiro). */
export interface CandidatoConta { id: string; rotulo: string }

/** O recorte que os chips fazem. */
type Chip = 'a_resolver' | 'apelido' | 'cadastro' | 'descartados' | 'todos';

const CHIPS: ReadonlyArray<{ key: Chip; rotulo: string }> = [
  { key: 'a_resolver', rotulo: 'A resolver' },
  { key: 'apelido', rotulo: 'Apelido' },
  { key: 'cadastro', rotulo: 'Cadastro' },
  { key: 'descartados', rotulo: 'Descartados' },
  { key: 'todos', rotulo: 'Todos' },
];

function recorteDe(it: DeParaItem): Chip {
  if (it.descartado || it.semClassificacao) return 'descartados';
  if (!it.valor) return 'a_resolver';
  return it.origem === 'alias' || it.origem === 'manual' ? 'apelido' : 'cadastro';
}

/** A mesma normalização do de-para: lower, sem acento, espaços colapsados. */
const norm = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export interface DeParaCampoModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campo: CampoDePara;
  /** O rótulo do campo, como o operador o chama ("Fazenda", "Conta bancária"). */
  titulo: string;
  mapa: DeParaMap;
  onResolver: (texto: string, id: string | null, rotulo: string | null) => void;
  /** Marca/desmarca "não é nada". Ausente = o campo não oferece a saída. */
  onDescartar?: (texto: string) => void;
  onCriarFornecedor?: () => void;
  // Catálogos — os mesmos que o painel da rota do menu recebe.
  classificacoes?: ClassificacaoItem[];
  fazendas?: Fazenda[];
  fornecedores?: FornecedorV2[];
  contas?: ContaSelecionavel[];
  safras?: Safra[];
  /** Tipo de operação por texto — filtra a subárvore do plano. */
  tipoPorTexto?: Readonly<Record<string, string>>;
  /** Um exemplo de linha por texto, para o contexto de 10px. */
  exemploPorTexto?: Readonly<Record<string, string>>;
  /** Candidatos de conta por texto (a sugestão do `classificarConta`). */
  candidatosPorTexto?: Readonly<Record<string, readonly CandidatoConta[]>>;
  /** A frase do rodapé: qual é o próximo campo com trabalho. */
  proximoCampo?: { rotulo: string; pendentes: number } | null;
  onIrParaProximo?: () => void;
}

export function DeParaCampoModal({
  open, onOpenChange, campo, titulo, mapa, onResolver, onDescartar, onCriarFornecedor,
  classificacoes, fazendas, fornecedores, contas, safras,
  tipoPorTexto, exemploPorTexto, candidatosPorTexto, proximoCampo, onIrParaProximo,
}: DeParaCampoModalProps) {
  const [chip, setChip] = useState<Chip>('a_resolver');
  const [busca, setBusca] = useState('');
  /** Busca por LINHA dos seletores com combobox (o caller é dono, por contrato deles). */
  const [buscaPorTexto, setBuscaPorTexto] = useState<Record<string, string>>({});
  const setBuscaDe = (t: string, s: string) => setBuscaPorTexto((p) => ({ ...p, [t]: s }));

  const itens = useMemo(() => Object.values(mapa), [mapa]);
  const contagens = useMemo(() => {
    const c: Record<Chip, number> = { a_resolver: 0, apelido: 0, cadastro: 0, descartados: 0, todos: itens.length };
    for (const it of itens) c[recorteDe(it)] += 1;
    return c;
  }, [itens]);

  /**
   * Cadastros de fornecedor com o MESMO nome normalizado — medido: 107 no NJ, "Meta" 8×,
   * "Rabobank" 5×.
   *
   * ⚠ NÃO SE ESCOLHE POR ELE, e por isso a linha fica "a resolver" mesmo tendo casado: com
   * oito "Meta" no cadastro, gravar o primeiro é gravar um sorteio. A fusão dos duplicados
   * é frente própria; aqui a tela apenas para de fingir que sabe.
   */
  const duplicadosPorNome = useMemo(() => {
    const m = new Map<string, number>();
    if (campo !== 'fornecedor') return m;
    for (const f of fornecedores ?? []) {
      if (f.ativo === false) continue;
      const k = norm(f.nome);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [campo, fornecedores]);

  const duplicadosDe = (texto: string): number =>
    campo === 'fornecedor' ? (duplicadosPorNome.get(norm(texto)) ?? 0) : 0;

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens
      .filter((it) => (chip === 'todos' ? true : recorteDe(it) === chip))
      .filter((it) => (q ? it.texto.toLowerCase().includes(q) : true))
      /* Mais linhas primeiro: resolver o texto de 57 linhas vale mais que o de uma. */
      .sort((a, b) => b.qtd - a.qtd);
  }, [itens, chip, busca]);

  const pendentes = contagens.a_resolver;
  const memorizados = contagens.apelido;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[96vw] max-w-[860px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-0.5 bg-primary px-3 py-2">
          <DialogTitle className="text-[13px] font-medium text-primary-foreground">
            De-para · {titulo}
          </DialogTitle>
          <p className="text-[10px] text-primary-foreground/85">
            {itens.length} valores · {pendentes} a resolver · {memorizados} pela memória
          </p>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-1.5">
          {CHIPS.map((c) => (
            <button key={c.key} type="button" onClick={() => setChip(c.key)}
              className={`rounded-md border px-1.5 py-0.5 text-[10px] transition-colors ${
                chip === c.key ? 'border-primary bg-primary/10 text-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted/60'
              } ${contagens[c.key] === 0 && chip !== c.key ? 'opacity-45' : ''}`}>
              {c.rotulo} <span className="tabular-nums font-medium">{contagens[c.key]}</span>
            </button>
          ))}
          <div className="flex-1" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar valor da planilha…"
            className="h-6 w-[200px] text-[10px]" />
        </div>

        {/* ⚠ UM SCROLLPORT SÓ, e é este: cabeçalho, chips e rodapé são irmãos `shrink-0`
            da mesma coluna flex — a rolagem mora no nível certo, não num `max-h` interno. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visiveis.length === 0 ? (
            <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
              {busca ? 'Nenhum valor com este texto.' : 'Nada neste recorte.'}
            </p>
          ) : visiveis.map((it) => {
            const cands = campo === 'conta' ? candidatosPorTexto?.[it.texto] : undefined;
            const nDup = duplicadosDe(it.texto);
            const inerte = !!it.descartado || !!it.semClassificacao;
            const recorte = recorteDe(it);
            /* ⚠ "CONFIRMAR" É UM ESTADO PRÓPRIO — 133b: um candidato só, sugerido por
               semelhança, que ainda NÃO foi visto pelo operador. Chamá-lo de resolvido foi
               o que mandou 57 lançamentos de cartão para conta corrente. */
            const pilula = inerte ? 'descartado'
              : recorte === 'apelido' ? 'apelido'
              : recorte === 'cadastro' ? 'cadastro'
              : nDup > 1 ? 'a resolver'
              : cands && cands.length === 1 ? 'confirmar'
              : 'a resolver';

            return (
              <div key={it.texto}
                className={`flex items-center gap-2 border-b border-border/50 px-3 py-1 ${inerte ? 'opacity-55' : ''}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium" title={it.texto}>{it.texto}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {it.qtd} linha{it.qtd === 1 ? '' : 's'}
                    {exemploPorTexto?.[it.texto] ? ` · ${exemploPorTexto[it.texto]}` : ''}
                    {nDup > 1 && (
                      <span className="text-amber-700 dark:text-amber-400">
                        {' '}· {nDup} cadastros com este nome — escolha um
                      </span>
                    )}
                  </span>
                </span>

                <div className="w-[250px] shrink-0">
                  {campo === 'subcentro' && classificacoes && (
                    <PlanoSubcentroSelect
                      value={it.valor ?? ''}
                      onChange={(sub) => onResolver(it.texto, sub || null, sub || null)}
                      classificacoes={classificacoes}
                      tipoOperacao={tipoPorTexto?.[it.texto] ?? ''}
                      search={buscaPorTexto[it.texto] ?? ''}
                      onSearchChange={(s) => setBuscaDe(it.texto, s)}
                      triggerClassName="h-6 px-1.5 text-[10px]"
                      contentClassName="w-[22rem]"
                      itemClassName="text-[10px] py-0.5"
                      disabled={inerte}
                    />
                  )}

                  {campo === 'fazenda' && fazendas && (
                    <Select value={it.valor ?? ''} disabled={inerte}
                      onValueChange={(id) => {
                        const f = fazendas.find((x) => x.id === id);
                        onResolver(it.texto, id || null, f?.nome ?? null);
                      }}>
                      <SelectTrigger className="h-6 text-[10px]"><SelectValue placeholder="Escolher fazenda" /></SelectTrigger>
                      <SelectContent>
                        {fazendas.filter((f) => f.id !== '__global__').map((f) => (
                          <SelectItem key={f.id} value={f.id} className="text-[10px]">{f.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {campo === 'fornecedor' && fornecedores && (
                    <FavorecidoSelect
                      value={it.valor ?? ''}
                      onChange={(id) => {
                        const f = fornecedores.find((x) => x.id === id);
                        onResolver(it.texto, id || null, f?.nome ?? null);
                      }}
                      fornecedores={fornecedores}
                      search={buscaPorTexto[it.texto] ?? ''}
                      onSearchChange={(s) => setBuscaDe(it.texto, s)}
                      /* ⚠ SEM "+" AQUI — 133b-a correção 4. O diálogo de cadastro de
                         fornecedor mora em `ImportLancDeParaPanel` e ainda não foi trazido
                         para este modal; o botão existia e não abria nada. Ele volta junto
                         com o diálogo, e aí com a regra do 133b: só depois de buscar e não
                         achar, porque sempre visível ele convida a duplicar — são 107
                         cadastros de nome repetido no NJ, e cada um começou assim. */
                      onCriarNovo={onCriarFornecedor}
                      triggerClassName="h-6 px-1.5 text-[10px]"
                      novoButtonClassName="h-6 w-6"
                      showCpfCnpj
                      disabled={inerte}
                    />
                  )}

                  {campo === 'conta' && contas && (
                    <ContaBancariaSelect
                      value={it.valor ?? ''}
                      onValueChange={(id) => {
                        const c = contas.find((x) => x.id === id);
                        onResolver(it.texto, id || null, c?.nome_exibicao || c?.nome_conta || null);
                      }}
                      contas={contas}
                      placeholder={cands?.length ? `Confirmar: ${cands[0].rotulo}` : 'Escolher conta'}
                      className="h-6 text-[10px]"
                      disabled={inerte}
                    />
                  )}

                  {campo === 'safra' && safras && (
                    <Select value={it.valor ?? ''} disabled={inerte}
                      onValueChange={(id) => {
                        const sf = safras.find((x) => x.id === id);
                        onResolver(it.texto, id || null, sf?.nome ?? null);
                      }}>
                      <SelectTrigger className="h-6 text-[10px]"><SelectValue placeholder="Escolher safra" /></SelectTrigger>
                      <SelectContent>
                        {safras.map((sf) => (
                          <SelectItem key={sf.id} value={sf.id} className="text-[10px]">
                            {sf.nome}{sf.codigo ? ` · ${sf.codigo}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Os candidatos ficam VISÍVEIS quando há mais de um: é a diferença entre
                    "escolha entre estes dois" e "abra o menu para descobrir quais". */}
                {cands && cands.length > 1 && (
                  <span className="w-[150px] shrink-0 truncate text-[10px] text-muted-foreground"
                    title={cands.map((c) => c.rotulo).join(' · ')}>
                    {cands.length} candidatos: {cands[0].rotulo}…
                  </span>
                )}

                <span className="w-[74px] shrink-0 text-right">
                  <span className={`rounded px-1 text-[10px] leading-[16px] ${
                    pilula === 'a resolver' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                    : pilula === 'confirmar' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                    : pilula === 'descartado' ? 'bg-muted text-muted-foreground'
                    : pilula === 'apelido' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                    : 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'}`}>
                    {pilula}
                  </span>
                </span>

                {onDescartar && (
                  <button type="button" onClick={() => onDescartar(it.texto)}
                    className="w-[62px] shrink-0 text-right text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    title="O texto existe na planilha mas não é um cadastro — as linhas entram sem este campo.">
                    {it.descartado ? 'reincluir' : 'não é nada'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t px-3 py-1.5">
          <span className="min-w-0 flex-1 text-[10px] text-muted-foreground">
            {proximoCampo
              ? `Próximo campo: ${proximoCampo.rotulo} (${proximoCampo.pendentes})`
              : 'Nenhum outro campo com valores a resolver.'}
          </span>
          {proximoCampo && onIrParaProximo && (
            <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]"
              onClick={onIrParaProximo}>
              Ir para {proximoCampo.rotulo}
            </Button>
          )}
          <Button type="button" size="sm" className="h-6 px-3 text-[10px]" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
