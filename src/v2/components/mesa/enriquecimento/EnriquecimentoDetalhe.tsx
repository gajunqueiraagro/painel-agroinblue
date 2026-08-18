// EnriquecimentoDetalhe — dumb. Painel principal (direita): tabela comparativa
// densa Sistema atual | Excel | Resultado. Identidade de coluna por título/borda
// (P0-6, sem fundo). "Resultado" é um badge largo — slot pronto para, no futuro
// (P0-9), receber select/autocomplete/input sem redesenhar a tela.
import { TOM_BADGE } from './fmt';
import type { EnriqRowVM } from './types';
import type { ClassificacaoItem, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import { ResultadoSubcentroEditor } from './ResultadoSubcentroEditor';
import { ResultadoFavorecidoEditor } from './ResultadoFavorecidoEditor';
import { ResultadoFazendaEditor } from './ResultadoFazendaEditor';
import { ResultadoProdutoEditor } from './ResultadoProdutoEditor';
import { ResultadoDocumentoEditor } from './ResultadoDocumentoEditor';

export interface EnriquecimentoDetalheProps {
  row: EnriqRowVM | null;
  // PR-U2c-2A — data layer para os editores inline (consumidos a partir do U2c-2B).
  classificacoes?: ClassificacaoItem[];
  fornecedores?: FornecedorV2[];
  fazendas?: Fazenda[];
  clienteId?: string;
  hideBanco?: boolean;   // U2 — sob filtro por conta, a linha Banco some (redundante)
  onEditar?: (patch: Record<string, unknown>) => Promise<void>;
  onCriarFornecedor?: (nome: string, fazendaId: string | null, cpfCnpj?: string) => Promise<FornecedorV2 | null>;   // PR-FORNECEDOR-FAZENDA-01
  // PR-UX-ENR-MODAL-01 — modo ampliado (modal). SÓ apresentação: colunas mais largas e
  // tipografia maior. Default false = aba intacta (densidade otimizada de propósito).
  amplo?: boolean;
}

// Larguras FIXAS — "Resultado" é a mais larga (coração da tela).
// PR-ENR-01 — ordem visual Excel | Sistema atual | Resultado (cada coluna mantém sua largura).
const COLS = '68px minmax(0,1.05fr) minmax(0,1fr) minmax(0,1.75fr)';
// PR-UX-ENR-MODAL-01 — modal: rótulo 68px→110px (deixa de truncar) e Resultado 1,75fr→2,2fr.
const COLS_AMPLO = '110px minmax(0,1fr) minmax(0,1fr) minmax(0,2.2fr)';

export function EnriquecimentoDetalhe({ row, classificacoes, fornecedores, fazendas, clienteId, hideBanco, onEditar, onCriarFornecedor, amplo = false }: EnriquecimentoDetalheProps) {
  if (!row) {
    return (
      <div className="rounded-lg border bg-card p-4 text-[11px] text-muted-foreground text-center">
        Selecione um lançamento à esquerda para analisar e decidir.
      </div>
    );
  }
  const bloqueado = row.comparativo.some((c) => c.tom === 'bloqueio');
  // PR-UX-ENR-MODAL-01 — apresentação por modo. `amplo=false` reproduz exatamente
  // o que a aba já renderiza (COLS / text-[9px] / text-[10px]).
  const cols = amplo ? COLS_AMPLO : COLS;
  const t9 = amplo ? 'text-[11px]' : 'text-[9px]';
  const t10 = amplo ? 'text-[12px]' : 'text-[10px]';

  return (
    // Limitado à própria área (h-full + overflow-y-auto): NUNCA invade a barra inferior;
    // com a densidade, cabe sem rolar na maioria das telas. Selo de estado removido (está na lista).
    <div className="rounded-lg border bg-card md:h-full md:min-h-0 md:overflow-y-auto">
      <div className="px-2 py-0.5">
        {/* Cabeçalhos fortes + identidade de coluna (P0-4 / P0-6) — compactados (BUG1). */}
        <div className="grid gap-x-2" style={{ gridTemplateColumns: cols }}>
          <span />
          <span className={`${t9} font-bold uppercase tracking-wide text-blue-600 border-t border-blue-300`}>Excel</span>
          <span className={`${t9} font-bold uppercase tracking-wide text-slate-500 border-t border-slate-300`}>Sistema atual</span>
          <span className={`${t9} font-bold uppercase tracking-wide text-emerald-600 border-t border-emerald-400`}>Resultado</span>
        </div>

        {/* Linhas densas, estilo planilha (P0-7) */}
        <div className="divide-y divide-border/50 mt-0.5">
          {/* U2 — sob filtro por conta, a linha Banco some (redundante). */}
          {row.comparativo.filter((c) => !(hideBanco && c.campo === 'Banco')).map((c) => {
            // U6 — Produto/Descrição e Fornecedor NUNCA truncam no detalhe (wrap multi-linha); demais truncam.
            const wrap = c.campo === 'Produto / Descrição' || c.campo === 'Fornecedor';
            return (
            <div key={c.campo} className="grid gap-x-2 items-start" style={{ gridTemplateColumns: cols }}>
              <span className={`${t9} text-muted-foreground truncate pt-0.5`} title={c.campo}>{c.campo}</span>
              <span className={`${t10} text-blue-700/90 pt-0.5 ${wrap ? 'break-words' : 'truncate'}`} title={c.excel}>{c.excel}</span>
              <span className={`${t10} pt-0.5 ${wrap ? 'break-words' : 'truncate'}`} title={c.sistema}>{c.sistema}</span>
              <div className="min-w-0">
                {/* PR-U2d-1 — editor só enquanto !aplicado; aplicada recua para o badge (valor final na coluna Sistema). */}
                {!row.aplicado && c.campo === 'Subcentro' && onEditar && classificacoes ? (
                  <ResultadoSubcentroEditor
                    value={row.edicao.subcentro}
                    tipoOperacao={row.edicao.tipoOperacao}
                    classificacoes={classificacoes}
                    onEditar={onEditar}
                  />
                ) : !row.aplicado && c.campo === 'Fornecedor' && onEditar && fornecedores && onCriarFornecedor ? (
                  <ResultadoFavorecidoEditor
                    value={row.edicao.favorecidoId}
                    fornecedores={fornecedores}
                    fazendaId={row.edicao.fazendaId}
                    onEditar={onEditar}
                    onCriarFornecedor={onCriarFornecedor}
                  />
                ) : !row.aplicado && c.campo === 'Fazenda' && onEditar && fazendas ? (
                  // P0-4 — editor inline da Fazenda (fonte única). Dividendos → força Administrativo
                  // (Select disabled + aviso); nunca grava no mount (só em seleção explícita).
                  <ResultadoFazendaEditor
                    value={row.edicao.fazendaId}
                    fazendaIdAtual={row.edicao.fazendaIdAtual}
                    fazendas={fazendas}
                    forcaAdministrativo={row.edicao.macro === 'Dividendos'}
                    onEditar={onEditar}
                  />
                ) : !row.aplicado && c.campo === 'Produto / Descrição' && onEditar ? (
                  // P0-3 — editor inline "Produto / Descrição" (fonte única, server-side).
                  // Commit só no blur/Enter/seleção; apply grava em lancamentos.descricao.
                  <ResultadoProdutoEditor
                    value={row.edicao.produto}
                    descricaoAtual={row.edicao.descricaoAtual}
                    clienteId={clienteId}
                    onEditar={onEditar}
                  />
                ) : !row.aplicado && c.campo === 'Documento' && onEditar ? (
                  // P0-5 — editor inline do Documento. Commit só no blur/Enter;
                  // apply grava em lancamentos.numero_documento.
                  <ResultadoDocumentoEditor
                    value={row.edicao.numeroDocumento}
                    numeroDocumentoAtual={row.edicao.numeroDocumentoAtual}
                    onEditar={onEditar}
                  />
                ) : (
                  <span
                    className={`inline-flex items-center rounded px-1 py-px ${t9} max-w-full ${wrap ? 'whitespace-normal break-words' : 'truncate'} ${TOM_BADGE[c.tom]}`}
                    title={c.resultado}
                  >
                    {c.resultado}
                  </span>
                )}
              </div>
            </div>
            );
          })}
        </div>

        {/* Resumo do que o Aplicar faria — compactado (BUG1). */}
        <div className={`${t9} leading-tight border-t border-dashed pt-0.5 mt-0.5`}>
          {bloqueado
            ? <span className="text-red-700">Bloqueado no Aplicar: subcentro proposto fora do plano oficial.</span>
            : row.mudaAlgo
              ? <span className="text-emerald-700">Ao Aplicar, os campos “grava” são atualizados no lançamento existente (nunca cria lançamento).</span>
              : <span className="text-muted-foreground">Nada muda: os campos já estão preenchidos/idênticos ao proposto.</span>}
        </div>

        {/* PR-U2b — proveniência da resolução (read-only, rastreabilidade). '—' em linhas sem _meta. */}
        <div className={`${t9} leading-tight text-muted-foreground`} title="Como esta proposta foi resolvida (metadado)">
          Resolução: {row.proveniencia.origem ?? '—'}
          {row.proveniencia.tier && row.proveniencia.tier !== row.proveniencia.origem ? ` (${row.proveniencia.tier})` : ''}
          {row.proveniencia.motorVersion != null ? ` · motor v${row.proveniencia.motorVersion}` : ''}
        </div>
      </div>
    </div>
  );
}
