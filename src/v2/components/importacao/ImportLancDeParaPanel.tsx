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
  onCriarFornecedor?: (nome: string, fazendaId: string | null, cpfCnpj?: string) => Promise<FornecedorV2 | null>;
}

export function ImportLancDeParaPanel({
  titulo, campo, mapa, pendentes, tipoPorTexto,
  classificacoes, fazendas, fornecedores, contas,
  onResolver, onCriarFornecedor,
}: ImportLancDeParaPanelProps) {
  const [busca, setBusca] = useState<Record<string, string>>({});
  const [novoFornecedorPara, setNovoFornecedorPara] = useState<string | null>(null);

  const itens = Object.values(mapa);
  const setBuscaDe = (texto: string, s: string) => setBusca((p) => ({ ...p, [texto]: s }));

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-2 py-0.5 border-b bg-muted/40 flex items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">{titulo}</span>
        <span className={`text-[9px] tabular-nums font-semibold ${pendentes > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
          {pendentes > 0 ? `${pendentes} a resolver` : 'tudo resolvido'}
        </span>
      </div>

      {itens.length === 0 ? (
        <div className="px-2 py-2 text-[10px] text-muted-foreground text-center">
          Nenhum valor desta coluna na planilha.
        </div>
      ) : (
        <div className="divide-y divide-border/40 max-h-[38vh] overflow-y-auto">
          {itens.map((it) => {
            const selo = SELO[it.origem];
            return (
              <div key={it.texto} className="px-1.5 py-px grid gap-1.5 items-center"
                   style={{ gridTemplateColumns: 'minmax(0,1fr) 44px minmax(0,1.3fr) 96px' }}>
                <span className="text-[10px] truncate leading-tight" title={it.texto}>{it.texto}</span>
                <span className="text-[9px] text-muted-foreground tabular-nums text-right">{it.qtd}×</span>

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
                    />
                  )}

                  {campo === 'fazenda' && fazendas && (
                    <Select
                      value={it.valor ?? ''}
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
                    />
                  )}
                </div>

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
