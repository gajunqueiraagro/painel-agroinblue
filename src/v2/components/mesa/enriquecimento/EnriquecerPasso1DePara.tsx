/**
 * Passo 1 — Planilha e de-para — [ENRIQUECER-TELA-01] (133b). DUMB.
 *
 * Cinco números no topo, cinco cards, um modal por card.
 *
 * ⚠ CARD NO LUGAR DE PAINEL EMPILHADO. Os cinco painéis abertos ao mesmo tempo faziam a
 * página crescer metros; o card diz em uma linha se aquele campo tem trabalho, e o modal
 * é onde o trabalho acontece. A informação é a mesma; o que mudou é quanto dela ocupa a
 * tela quando não se está usando.
 *
 * ⚠ "ENTRAM SEM CLASSIFICAÇÃO" NÃO É PENDÊNCIA, é resposta. Célula vazia é decisão
 * legítima do operador — a linha entra crua e ele resolve na Revisão. Contá-la como
 * pendente faria o passo 1 nunca terminar.
 */
import { useMemo, useState } from 'react';
import { DeParaCampoModal, type CandidatoConta } from './DeParaCampoModal';
import type { CampoDePara } from '@/v2/hooks/useImportLancamentosExcel';
import type { DeParaCompleto } from '@/v2/lib/importLanc/importLancamentosView';
import type { ClassificacaoItem, FornecedorV2, Safra } from '@/hooks/useFinanceiroV2';
import type { ContaSelecionavel } from '@/components/shared/ContaBancariaSelect';
import type { Fazenda } from '@/contexts/FazendaContext';

/** Os cinco campos, na ordem em que o trabalho acontece. */
export const CAMPOS_DEPARA: ReadonlyArray<{ campo: CampoDePara; rotulo: string }> = [
  { campo: 'subcentro', rotulo: 'Conta do plano' },
  { campo: 'fazenda', rotulo: 'Fazenda' },
  { campo: 'fornecedor', rotulo: 'Fornecedor' },
  { campo: 'conta', rotulo: 'Conta bancária' },
  { campo: 'safra', rotulo: 'Safra' },
];

export interface EnriquecerPasso1DeParaProps {
  dePara: DeParaCompleto;
  pendentes: Record<CampoDePara, number> & { total: number };
  linhasLidas: number;
  /** Catálogos — os MESMOS que o painel da rota do menu recebe; o modal os repassa aos
      seletores da casa em vez de montar listas próprias. */
  classificacoes: ClassificacaoItem[];
  fazendas: Fazenda[];
  fornecedores: FornecedorV2[];
  contas: ContaSelecionavel[];
  safras: Safra[];
  /** Tipo de operação por texto de conta do plano — filtra a subárvore. */
  tipoPorTexto?: Readonly<Record<string, string>>;
  /** Os candidatos por texto, quando o campo os produz (hoje: conta bancária). */
  candidatosPorTexto?: Readonly<Record<string, readonly CandidatoConta[]>>;
  onResolver: (campo: CampoDePara, texto: string, id: string | null, rotulo: string | null) => void;
  onDescartar: (campo: CampoDePara, texto: string) => void;
  onCriarFornecedor?: (nomeSugerido: string) => void;
  /** "Ir para a Revisão" — popula o staging (ou recasa) e troca de passo. */
  onIrParaRevisao: () => void;
  irParaRevisaoOcupado?: boolean;
  irParaRevisaoMotivo?: string | null;
}

export function EnriquecerPasso1DePara({
  dePara, pendentes, linhasLidas, classificacoes, fazendas, fornecedores, contas, safras,
  tipoPorTexto, candidatosPorTexto,
  onResolver, onDescartar, onCriarFornecedor,
  onIrParaRevisao, irParaRevisaoOcupado, irParaRevisaoMotivo,
}: EnriquecerPasso1DeParaProps) {
  const [aberto, setAberto] = useState<CampoDePara | null>(null);

  const porCampo = useMemo(() => CAMPOS_DEPARA.map(({ campo, rotulo }) => {
    const itens = Object.values(dePara[campo]);
    const resolvidosPelaMemoria = itens.filter((i) => i.valor && (i.origem === 'alias' || i.origem === 'cadastro')).length;
    const semClassificacao = itens.filter((i) => i.semClassificacao || i.descartado).length;
    return { campo, rotulo, total: itens.length, pendentes: pendentes[campo], resolvidosPelaMemoria, semClassificacao };
  }), [dePara, pendentes]);

  const totais = useMemo(() => porCampo.reduce((acc, c) => ({
    valores: acc.valores + c.total,
    memoria: acc.memoria + c.resolvidosPelaMemoria,
    aResolver: acc.aResolver + c.pendentes,
    semClassificacao: acc.semClassificacao + c.semClassificacao,
  }), { valores: 0, memoria: 0, aResolver: 0, semClassificacao: 0 }), [porCampo]);

  /** O próximo campo com trabalho depois do que está aberto — a frase do rodapé do modal. */
  const proximoComTrabalho = (atual: CampoDePara) => {
    const i = CAMPOS_DEPARA.findIndex((c) => c.campo === atual);
    for (let k = 1; k <= CAMPOS_DEPARA.length; k++) {
      const c = CAMPOS_DEPARA[(i + k) % CAMPOS_DEPARA.length];
      if (c.campo !== atual && pendentes[c.campo] > 0) {
        return { campo: c.campo, rotulo: c.rotulo, pendentes: pendentes[c.campo] };
      }
    }
    return null;
  };

  const abertoMeta = aberto ? CAMPOS_DEPARA.find((c) => c.campo === aberto) ?? null : null;
  const proximo = aberto ? proximoComTrabalho(aberto) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      {/* ═══ CINCO NÚMEROS ══════════════════════════════════════════════════════ */}
      <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-1 rounded-lg border bg-card px-2 py-1.5 sm:grid-cols-5">
        <Numero rotulo="Linhas lidas" valor={linhasLidas} />
        <Numero rotulo="Valores distintos no de-para" valor={totais.valores} />
        <Numero rotulo="Resolvidos pela memória" valor={totais.memoria} cls="text-emerald-700 dark:text-emerald-400" />
        <Numero rotulo="A resolver" valor={totais.aResolver}
          cls={totais.aResolver > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'} />
        <Numero rotulo="Entram sem classificação" valor={totais.semClassificacao} />
      </div>

      {/* ═══ CINCO CARDS ════════════════════════════════════════════════════════ */}
      <div className="grid min-h-0 grid-cols-2 gap-1.5 sm:grid-cols-5">
        {porCampo.map((c) => {
          const pend = c.pendentes > 0;
          return (
            <button key={c.campo} type="button" onClick={() => setAberto(c.campo)}
              className="rounded-lg border bg-card px-2 py-1.5 text-left transition-colors hover:bg-muted/40">
              <div className="truncate text-[12px] font-medium" title={c.rotulo}>{c.rotulo}</div>
              <div className="text-[11px] text-muted-foreground">{c.total} valores</div>
              <div className={`text-[20px] font-medium leading-tight tabular-nums ${
                pend ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                {c.pendentes}
              </div>
              <div className={`text-[10px] leading-tight ${pend ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                {pend ? 'a resolver' : 'tudo resolvido'}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* ═══ RODAPÉ ═════════════════════════════════════════════════════════════ */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-2 py-1">
        <span className="min-w-0 flex-1 text-[10px] leading-tight text-muted-foreground">
          {/* ⚠ PENDÊNCIA NÃO É BLOQUEIO — B-40 item 1b, e continua valendo aqui: as linhas
              dos valores sem de-para ENTRAM, cruas, e o operador as resolve na Revisão. */}
          <b className="tabular-nums">{totais.aResolver}</b> valores sem de-para. As linhas deles entram
          assim mesmo e você resolve na Revisão.
        </span>
        <button type="button" onClick={onIrParaRevisao}
          disabled={irParaRevisaoOcupado || !!irParaRevisaoMotivo}
          title={irParaRevisaoMotivo ?? undefined}
          className="rounded-md bg-cta px-3 py-1 text-[11px] font-semibold text-cta-foreground transition-colors hover:bg-cta-hover disabled:opacity-50">
          {irParaRevisaoOcupado ? 'Preparando a Revisão…' : 'Ir para a Revisão'}
        </button>
      </div>

      {abertoMeta && (
        <DeParaCampoModal
          open
          onOpenChange={(v) => { if (!v) setAberto(null); }}
          campo={abertoMeta.campo}
          titulo={abertoMeta.rotulo}
          mapa={dePara[abertoMeta.campo]}
          classificacoes={classificacoes}
          fazendas={fazendas}
          fornecedores={fornecedores}
          contas={contas}
          safras={safras}
          tipoPorTexto={tipoPorTexto}
          candidatosPorTexto={candidatosPorTexto}
          onResolver={(texto, id, rotulo) => onResolver(abertoMeta.campo, texto, id, rotulo)}
          onDescartar={(texto) => onDescartar(abertoMeta.campo, texto)}
          onCriarFornecedor={onCriarFornecedor}
          proximoCampo={proximo ? { rotulo: proximo.rotulo, pendentes: proximo.pendentes } : null}
          onIrParaProximo={proximo ? () => setAberto(proximo.campo) : undefined}
        />
      )}
    </div>
  );
}

function Numero({ rotulo, valor, cls }: { rotulo: string; valor: number; cls?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] leading-tight text-muted-foreground" title={rotulo}>{rotulo}</div>
      <div className={`text-[16px] font-medium leading-tight tabular-nums ${cls ?? ''}`}>{valor}</div>
    </div>
  );
}
