// ============================================================================
// ImportLancDeParaPanel — PR-IMPORT-EXCEL-LANC-01, passo 2. DUMB.
//
// Um painel por campo do Excel que mapeia para uma lista do sistema. Os quatro
// usam o MESMO mecanismo: valores distintos da planilha → registro do sistema.
// Cada painel reusa o seletor OFICIAL do respectivo domínio — nenhum seletor novo.
//
// Não resolve, não grava, não decide: recebe o mapa pronto e devolve a escolha.
// ============================================================================
import { useState } from 'react';
import { PlanoSubcentroSelect } from '@/components/shared/PlanoSubcentroSelect';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { NovoFornecedorDialog } from '@/components/financeiro-v2/NovoFornecedorDialog';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ClassificacaoItem, FornecedorV2, ContaBancariaV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import type { DeParaItem, DeParaMap } from '@/v2/lib/importLanc/importLancamentosView';
import type { CampoDePara } from '@/v2/hooks/useImportLancamentosExcel';

const SELO: Record<DeParaItem['origem'], { label: string; cls: string }> = {
  alias:    { label: 'apelido',  cls: 'bg-emerald-100 text-emerald-700' },
  cadastro: { label: 'cadastro', cls: 'bg-blue-100 text-blue-700' },
  manual:   { label: 'você',     cls: 'bg-amber-100 text-amber-800' },
  pendente: { label: 'pendente', cls: 'bg-red-100 text-red-700' },
};

/** Terceira saída: o texto existe na planilha e não corresponde a nada no sistema. */
const SELO_DESCARTADO = { label: 'descartado', cls: 'bg-slate-200 text-slate-600' };

export interface ImportLancDeParaPanelProps {
  titulo: string;
  campo: CampoDePara;
  mapa: DeParaMap;
  pendentes: number;
  /** Tipo de operação por texto — só o painel de subcentro usa (filtra a subárvore). */
  tipoPorTexto?: Readonly<Record<string, string>>;
  classificacoes?: ClassificacaoItem[];
  fazendas?: Fazenda[];
  fornecedores?: FornecedorV2[];
  contas?: ContaBancariaV2[];
  onResolver: (campo: CampoDePara, texto: string, valor: string | null, rotulo: string | null) => void;
  onDescartar: (campo: CampoDePara, texto: string) => void;
  onCriarFornecedor?: (nome: string, fazendaId: string | null, cpfCnpj?: string) => Promise<FornecedorV2 | null>;
}

export function ImportLancDeParaPanel({
  titulo, campo, mapa, pendentes, tipoPorTexto,
  classificacoes, fazendas, fornecedores, contas,
  onResolver, onDescartar, onCriarFornecedor,
}: ImportLancDeParaPanelProps) {
  const [busca, setBusca] = useState<Record<string, string>>({});
  const [novoFornecedorPara, setNovoFornecedorPara] = useState<string | null>(null);

  const itens = Object.values(mapa);
  const setBuscaDe = (texto: string, s: string) => setBusca((p) => ({ ...p, [texto]: s }));

  // PR-IMPORT-EXCEL-LANC-05 — empilhados, os quatro blocos não cabem abertos. Bloco
  // sem pendência nasce recolhido: o que exige ação fica à vista, o que já está
  // resolvido não ocupa tela. O cabeçalho permanece visível e expande em um clique,
  // então nada some — só deixa de competir por espaço.
  const [recolhidoManual, setRecolhidoManual] = useState<boolean | null>(null);
  const recolhido = recolhidoManual ?? (itens.length > 0 && pendentes === 0);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setRecolhidoManual(!recolhido)}
        disabled={itens.length === 0}
        className="w-full px-2 py-0.5 border-b bg-muted/40 flex items-baseline justify-between gap-2
                   hover:bg-muted/60 disabled:hover:bg-muted/40 disabled:cursor-default"
      >
        <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground flex items-baseline gap-1">
          {itens.length > 0 && (
            <span className="text-[8px] text-muted-foreground/70">{recolhido ? '▸' : '▾'}</span>
          )}
          {titulo}
        </span>
        <span className="flex items-baseline gap-2 shrink-0">
          <span className="text-[9px] text-muted-foreground/70 tabular-nums">
            {itens.length} valor{itens.length !== 1 ? 'es' : ''}
          </span>
          <span className={`text-[9px] tabular-nums font-semibold ${pendentes > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
            {pendentes > 0 ? `${pendentes} a resolver` : 'tudo resolvido'}
          </span>
        </span>
      </button>

      {itens.length === 0 ? (
        <div className="px-2 py-2 text-[10px] text-muted-foreground text-center">
          Nenhum valor desta coluna na planilha.
        </div>
      ) : recolhido ? null : (
        /* PR-IMPORT-EXCEL-LANC-06 — rolagem interna REMOVIDA. Com quatro blocos de
           altura limitada, o cursor ficava sempre dentro de uma área rolável e a
           página quase não rolava. O que justificava o limite — caber tudo na tela —
           já é resolvido pelo recolhimento automático dos blocos sem pendência.
           Agora a página rola como um documento só, e o cabeçalho sticky preserva o
           contexto do arquivo. */
        <div className="divide-y divide-border/40">
          {itens.map((it) => {
            const selo = it.descartado ? SELO_DESCARTADO : SELO[it.origem];
            return (
              // Colunas com TETO em vez de fração pura: valor e seletor ficam lado a
              // lado e param de esticar. A 6ª trilha não tem filho — existe só para
              // absorver a folga, que assim sobra à DIREITA e nunca no meio da linha,
              // separando o valor do seu próprio estado.
              <div key={it.texto} className={`px-2 py-0.5 grid gap-2 items-center ${it.descartado ? 'opacity-55' : ''}`}
                   style={{ gridTemplateColumns: 'minmax(0,26rem) minmax(0,17rem) 40px 20px 92px 1fr' }}>
                {/* Valor de origem: QUEBRA em vez de truncar. Com a largura toda, o
                    texto do cliente cabe — e é ele que o operador precisa ler para
                    decidir o mapeamento. */}
                <span className="text-[10px] leading-tight whitespace-normal break-words" title={it.texto}>
                  {it.texto}
                </span>

                <div className="min-w-0">
                  {campo === 'subcentro' && classificacoes && (
                    <PlanoSubcentroSelect
                      value={it.valor ?? ''}
                      onChange={(sub) => onResolver(campo, it.texto, sub || null, sub || null)}
                      classificacoes={classificacoes}
                      tipoOperacao={tipoPorTexto?.[it.texto] ?? ''}
                      search={busca[it.texto] ?? ''}
                      onSearchChange={(s) => setBuscaDe(it.texto, s)}
                      triggerClassName="h-5 text-[9px] px-1.5"
                      contentClassName="w-[22rem]"
                      itemClassName="text-[10px] py-0.5"
                      disabled={it.descartado}
                    />
                  )}

                  {campo === 'fazenda' && fazendas && (
                    <Select
                      value={it.valor ?? ''}
                      disabled={it.descartado}
                      onValueChange={(id) => {
                        const f = fazendas.find((x) => x.id === id);
                        onResolver(campo, it.texto, id || null, f?.nome ?? null);
                      }}
                    >
                      <SelectTrigger className="h-5 text-[9px] px-1.5"><SelectValue placeholder="Escolher fazenda" /></SelectTrigger>
                      <SelectContent>
                        {fazendas
                          .filter((f) => f.id !== '__global__')
                          .map((f) => (
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
                        onResolver(campo, it.texto, id || null, f?.nome ?? null);
                      }}
                      fornecedores={fornecedores}
                      search={busca[it.texto] ?? ''}
                      onSearchChange={(s) => setBuscaDe(it.texto, s)}
                      onCriarNovo={() => setNovoFornecedorPara(it.texto)}
                      triggerClassName="h-5 text-[9px] px-1.5"
                      novoButtonClassName="h-5 w-5"
                      disabled={it.descartado}
                    />
                  )}

                  {campo === 'conta' && contas && (
                    <ContaBancariaSelect
                      value={it.valor ?? ''}
                      onValueChange={(id) => {
                        const c = contas.find((x) => x.id === id);
                        onResolver(campo, it.texto, id || null, c?.nome_exibicao || c?.nome_conta || null);
                      }}
                      contas={contas}
                      placeholder="Escolher conta"
                      className="h-5 text-[9px]"
                      disabled={it.descartado}
                    />
                  )}
                </div>

                <span className="text-[9px] text-muted-foreground tabular-nums text-right">{it.qtd}×</span>

                <button
                  type="button"
                  onClick={() => onDescartar(campo, it.texto)}
                  className="text-[11px] leading-none text-muted-foreground hover:text-foreground"
                  title={it.descartado
                    ? 'Restaurar: volta a exigir mapeamento.'
                    : 'Descartar: este texto não corresponde a nada no sistema. Sai das pendências e não vira apelido.'}
                >
                  {it.descartado ? '↺' : '⊘'}
                </button>

                <div className="flex flex-col items-end gap-px">
                  <span className={`text-[8px] px-1 rounded font-semibold ${selo.cls}`}>
                    {selo.label}
                  </span>
                  {/* Conflito de apelido: mostrar de onde o texto saiu ANTES de confirmar.
                      A troca só governa importações futuras — nada já criado é reclassificado. */}
                  {it.origem === 'manual' && it.anterior && it.anterior !== it.rotulo && (
                    <span className="text-[8px] text-amber-700 whitespace-nowrap"
                          title={`Este apelido apontava para "${it.anterior}". A troca vale para as próximas importações; nada já lançado é reclassificado.`}>
                      antes: {it.anterior}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Criação inline de fornecedor — mesmo diálogo oficial usado pela Mesa.
          fazendaId null: o fornecedor nasce do cliente (fazenda é opcional desde
          o PR-FORNECEDOR-FAZENDA-01), e aqui a fazenda é resolvida por linha. */}
      {campo === 'fornecedor' && onCriarFornecedor && (
        <NovoFornecedorDialog
          open={novoFornecedorPara !== null}
          onClose={() => setNovoFornecedorPara(null)}
          defaultNome={novoFornecedorPara ?? ''}
          onSave={async (nome, cpfCnpj) => {
            const criado = await onCriarFornecedor(nome, null, cpfCnpj);
            if (criado && novoFornecedorPara !== null) {
              onResolver('fornecedor', novoFornecedorPara, criado.id, criado.nome);
            }
            setNovoFornecedorPara(null);
          }}
        />
      )}
    </div>
  );
}
