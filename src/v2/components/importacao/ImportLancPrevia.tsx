// ============================================================================
// ImportLancPrevia — PR-IMPORT-EXCEL-LANC-01, passo 3. DUMB.
//
// Mostra exatamente o que vai entrar e o que vai ficar de fora, com os totais.
// É o último ponto antes do caminho sem volta: NADA foi gravado até aqui —
// nem lançamento, nem apelido.
//
// A data exibida é a de COMPETÊNCIA, nunca a de pagamento: é ela que define o
// ano_mes (trigger trg_00_ano_mes_from_competencia) e, portanto, qual mês é
// testado contra financeiro_fechamentos.
// ============================================================================
import { useMemo, useState } from 'react';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  MOTIVO_LABEL, FILTRO_LABEL, DUPLICIDADE_LABEL, aplicarFiltroPrevia, resumirPorFiltro,
  type FiltroPrevia,
  type LinhaPrevia,
  type TotaisPrevia,
} from '@/v2/lib/importLanc/importLancamentosView';

export interface ImportLancPreviaProps {
  linhas: LinhaPrevia[];
  totais: TotaisPrevia;
  /** Manda entrar uma linha barrada por duplicidade. Ausente = sem reinclusão. */
  aoReincluir?: (indice: number) => void;
  /**
   * B-42 — o gate das criações. Ausentes = comportamento antigo (tudo entra).
   *
   * ⚠ CRIAR NÃO TEM O RISCO DE ATUALIZAR. Atualizar mexe no que já existe e se
   * conserta na tela; criar acrescenta dinheiro ao mês, e a criação indevida só
   * aparece no fechamento, já virada duplicata. Por isso nasce DESMARCADA — o
   * mesmo padrão do dedup D1.
   */
  criacoesAprovadas?: ReadonlySet<number>;
  aoAlternarCriacao?: (indice: number) => void;
  aoMarcarTodasCriacoes?: (indices: readonly number[], marcar: boolean) => void;
  /** Contas com extrato importado — dispara o aviso de ordem na linha. */
  contasComExtrato?: ReadonlySet<string>;
}

const LIMITE_LINHAS = 300;

const FILTRO_CLS: Record<FiltroPrevia, { ativo: string; inativo: string }> = {
  entra: { ativo: 'bg-emerald-600 text-white', inativo: 'bg-emerald-50 text-emerald-800' },
  sai:   { ativo: 'bg-red-600 text-white',     inativo: 'bg-red-50 text-red-800' },
  fora:  { ativo: 'bg-slate-600 text-white',   inativo: 'bg-slate-100 text-slate-700' },
};

const FILTROS: FiltroPrevia[] = ['entra', 'sai', 'fora'];

export function ImportLancPrevia({
  linhas, totais, aoReincluir,
  criacoesAprovadas, aoAlternarCriacao, aoMarcarTodasCriacoes, contasComExtrato,
}: ImportLancPreviaProps) {
  // null = sem recorte (mostra tudo). Só apresentação: não altera elegibilidade.
  const [filtro, setFiltro] = useState<FiltroPrevia | null>(null);

  const resumo = useMemo(() => resumirPorFiltro(linhas), [linhas]);
  const filtradas = useMemo(
    () => (filtro === null ? linhas : linhas.filter((l) => aplicarFiltroPrevia(l, filtro))),
    [linhas, filtro],
  );
  const visiveis = filtradas.slice(0, LIMITE_LINHAS);
  /* ⚠ DOIS BALDES, CONTADOS SOBRE A MESMA LISTA que a tela desenha — a regra do
     contador e da lista saírem do mesmo campo. */
  const nAtualiza = linhas.filter((l) => l.entra && l.modo === 'atualizar').length;
  const linhasCriam = useMemo(
    () => linhas.filter((l) => l.entra && l.modo === 'criar'), [linhas]);
  const nCria = linhasCriam.length;

  /* B-42 — o gate só existe quando quem monta a prévia o fornece. */
  const comGate = !!criacoesAprovadas && !!aoAlternarCriacao;
  const indicesCriam = useMemo(() => linhasCriam.map((l) => l.indice), [linhasCriam]);
  const nAprovadas = comGate ? indicesCriam.filter((i) => criacoesAprovadas.has(i)).length : nCria;
  const todasMarcadas = nCria > 0 && nAprovadas === nCria;
  /* ⚠ O TOTAL EM R$ É DAS APROVADAS, não das criáveis: é o dinheiro que vai
     entrar no mês se ele confirmar agora. */
  const valorAprovado = comGate
    ? linhasCriam
        .filter((l) => criacoesAprovadas.has(l.indice))
        .reduce((acc, l) => acc + Math.abs(Number(l.row.valor) || 0), 0)
    : 0;

  return (
    <div className="space-y-1.5">
      {/* ── Totais: o contrato do que o operador está prestes a confirmar ── */}
      <div className="rounded-lg border bg-card">
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
          <div className="px-3 py-2 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold text-emerald-700">Entram</span>
            <span className="text-[11px] tabular-nums font-mono">
              <strong>{totais.entram.qtd}</strong> linha{totais.entram.qtd !== 1 ? 's' : ''}
              {' · '}{formatMoeda(totais.entram.valor)}
              {/* ⚠ A QUEBRA ENTRE ATUALIZAR E CRIAR SÓ APARECE QUANDO HÁ AS
                  DUAS: no fluxo de sempre, todas criam, e uma linha dizendo
                  "0 atualizações" seria ruído. Quando há mistura, é a coisa mais
                  importante da tela — o operador precisa saber quantos
                  lançamentos existentes vão mudar. */}
              {nAtualiza > 0 && nCria > 0 && (
                <span className="ml-1 text-muted-foreground">
                  ({nAtualiza} atualiza{nAtualiza !== 1 ? 'm' : ''} · {nCria} cria{nCria !== 1 ? 'm' : ''})
                </span>
              )}
              {nAtualiza > 0 && nCria === 0 && (
                <span className="ml-1 text-sky-700">(todas atualizam)</span>
              )}
            </span>
          </div>
          <div className="px-3 py-2 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold text-red-700">Ficam de fora</span>
            <span className="text-[11px] tabular-nums font-mono">
              <strong>{totais.ficamDeFora.qtd}</strong> linha{totais.ficamDeFora.qtd !== 1 ? 's' : ''}
              {' · '}{formatMoeda(totais.ficamDeFora.valor)}
            </span>
          </div>
        </div>

        {totais.porMotivo.length > 0 && (
          <div className="border-t px-3 py-1.5 space-y-0.5">
            {totais.porMotivo.map((m) => (
              <div key={m.motivo} className="flex items-baseline justify-between text-[10px]">
                <span className="text-red-700">{MOTIVO_LABEL[m.motivo]}</span>
                <span className="tabular-nums font-mono text-muted-foreground">
                  {m.qtd} · {formatMoeda(m.valor)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
          Nada foi gravado ainda — nem lançamento, nem apelido. A gravação só acontece
          quando você confirmar.
        </div>
      </div>

      {/* ── Filtros: recorte da lista. Os totais acima continuam sobre TUDO. ── */}
      <div className="flex items-center gap-1 flex-wrap">
        {FILTROS.map((f) => {
          const ativo = filtro === f;
          const r = resumo[f];
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(ativo ? null : f)}
              disabled={r.qtd === 0}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors
                ${r.qtd === 0 ? 'opacity-40 cursor-not-allowed bg-muted text-muted-foreground'
                              : ativo ? FILTRO_CLS[f].ativo : FILTRO_CLS[f].inativo}`}
            >
              {FILTRO_LABEL[f]} ({r.qtd}) · {formatMoeda(r.valor)}
            </button>
          );
        })}
        {filtro !== null && (
          <button
            type="button"
            onClick={() => setFiltro(null)}
            className="px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground"
          >
            limpar recorte
          </button>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">
          {filtro === null
            ? `${linhas.length} linha(s)`
            : `${filtradas.length} de ${linhas.length} linha(s)`}
        </span>
      </div>

      {/* ── Linhas ── */}
      {/* ⚠ A FAIXA DE APROVAÇÃO DAS CRIAÇÕES — B-42. Fica ACIMA da lista porque é
          um gate, não um detalhe de linha: o operador precisa ver quantas criações
          existem e quanto valem antes de decidir, não descobrir isso rolando. */}
      {comGate && nCria > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-2 text-[10px] leading-snug text-amber-900">
            <label className="flex cursor-pointer items-center gap-1.5 font-semibold">
              <input type="checkbox" className="h-3 w-3 accent-amber-700"
                checked={todasMarcadas}
                ref={(el) => { if (el) el.indeterminate = nAprovadas > 0 && !todasMarcadas; }}
                onChange={() => aoMarcarTodasCriacoes?.(indicesCriam, !todasMarcadas)} />
              Marcar todas
            </label>
            <span>
              <b className="tabular-nums">{nAprovadas}</b> de <b className="tabular-nums">{nCria}</b>{' '}
              criaç{nCria === 1 ? 'ão aprovada' : 'ões aprovadas'} ·{' '}
              <b className="tabular-nums">{formatMoeda(valorAprovado)}</b> entram como lançamento novo
            </span>
          </div>
          {/* ⚠ CRIAR EXIGE APROVAÇÃO E ATUALIZAR NÃO — dito, para não parecer
              arbitrário: atualizar mexe no que existe e se conserta na tela;
              criar acrescenta dinheiro, e a criação indevida só aparece no
              fechamento, já virada duplicata a caçar. */}
          <p className="mt-0.5 text-[9px] leading-snug text-amber-800">
            Criações nascem desmarcadas: elas acrescentam lançamentos ao mês. As atualizações entram
            por padrão — elas mexem no que já existe.
          </p>
        </div>
      )}

      <div className="border rounded-md overflow-auto max-h-[46vh]">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 44 }} />
            <col style={{ width: 74 }} />
            <col style={{ width: 90 }} />
            <col />
            <col style={{ width: 150 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 190 }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-primary">
            <tr>
              {['Linha', 'Competência', 'Fazenda', 'Descrição', 'Subcentro', 'Valor', 'Situação'].map((h) => (
                <th key={h} className="px-1 py-1 text-[9px] uppercase font-semibold text-primary-foreground text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-[11px] text-muted-foreground py-6">
                  {filtro === null
                    ? 'Nenhuma linha lida da planilha.'
                    : `Nenhuma linha em "${FILTRO_LABEL[filtro]}".`}
                </td>
              </tr>
            )}
            {visiveis.map((l) => (
              <tr
                key={l.row.linha}
                className={`border-b ${l.entra ? '' : 'bg-red-50/70 text-red-800'}`}
              >
                <td className="px-1 py-0.5 text-[10px] font-mono text-muted-foreground">{l.row.linha}</td>
                <td className="px-1 py-0.5 text-[10px] font-mono">
                  {l.row.data_competencia ?? '—'}
                </td>
                <td className="px-1 py-0.5 text-[10px] truncate" title={l.fazendaNome ?? ''}>
                  {l.fazendaNome ?? '—'}
                </td>
                <td className="px-1 py-0.5 text-[10px] truncate" title={l.row.descricao ?? ''}>
                  {l.row.descricao ?? '—'}
                </td>
                <td className="px-1 py-0.5 text-[10px] truncate" title={l.subcentro ?? ''}>
                  {l.subcentro ?? '—'}
                </td>
                <td className="px-1 py-0.5 text-[10px] text-right tabular-nums font-mono">
                  {formatMoeda(Math.abs(Number(l.row.valor) || 0))}
                </td>
                <td className="px-1 py-0.5 text-[10px]">
                  {l.entra ? (
                    <span className={l.modo === 'atualizar' ? 'text-sky-700' : 'text-emerald-700'}>
                      {/* A marca por linha: o mesmo gate da faixa, no detalhe. */}
                      {comGate && l.modo === 'criar' && (
                        <input type="checkbox" className="mr-1 h-3 w-3 align-middle accent-emerald-700"
                          checked={criacoesAprovadas.has(l.indice)}
                          onChange={() => aoAlternarCriacao?.(l.indice)}
                          title="Aprovar a criação desta linha. Sem a marca, ela não é gravada." />
                      )}
                      {/* ⚠ AS DUAS PALAVRAS SÃO DIFERENTES PORQUE OS ATOS SÃO:
                          "atualiza" mexe num lançamento que já existe; "entra"
                          cria um novo. Chamar os dois de "entra" esconderia do
                          operador a única coisa que ele precisa conferir antes
                          de confirmar. */}
                      {l.modo === 'atualizar' ? 'atualiza' : 'entra'}
                      {/* ⚠ D2/D3 ENTRAM COM AVISO. Grau de semelhança não é
                          veredito: barrar por parecença faria a importação
                          perder em silêncio a segunda parcela de um pagamento
                          repetido — e o operador é quem sabe qual é qual. */}
                      {l.duplicidade && l.duplicidade !== 'D1' && (
                        <span className="ml-1 text-amber-700" title={DUPLICIDADE_LABEL[l.duplicidade]}>
                          · parecido com um já existente
                        </span>
                      )}
                      {l.reincluida && (
                        <span className="ml-1 text-amber-700" title="Idêntico a um lançamento existente; você mandou entrar assim mesmo.">
                          · duplicata assumida
                        </span>
                      )}
                      {/* ⚠ O AVISO DA ORDEM, na linha que corre o risco. Numa conta
                          que já recebeu OFX o mês virou lançamento cru; criar por
                          planilha antes de vincular produz o segundo lançamento do
                          mesmo fato — e a duplicata só aparece no fechamento. */}
                      {l.modo === 'criar' && l.contaBancariaId && contasComExtrato?.has(l.contaBancariaId) && (
                        <span className="ml-1 text-amber-700"
                          title="Esta conta tem extrato importado — rode Vincular/Lançar em massa antes, ou criações daqui podem duplicar depois.">
                          · conta tem extrato
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="font-medium">
                      ⚠ {l.motivo ? MOTIVO_LABEL[l.motivo] : 'fora'}
                      {/* ⚠ A SAÍDA DA EXCLUSÃO FICA NA PRÓPRIA LINHA: o motivo
                          "já existe" é o único que o operador pode contradizer
                          sabendo mais que o sistema — duas parcelas iguais no
                          mesmo dia. Os demais são estruturais e não têm botão. */}
                      {l.motivo === 'ja_existe' && aoReincluir && (
                        <button type="button"
                          onClick={() => aoReincluir(l.indice)}
                          className="ml-1 underline underline-offset-2 hover:text-red-900"
                          title="Importar assim mesmo — use quando souber que são dois lançamentos diferentes.">
                          importar mesmo assim
                        </button>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtradas.length > LIMITE_LINHAS && (
        <p className="text-[10px] text-center text-muted-foreground">
          Exibindo {LIMITE_LINHAS} de {filtradas.length} linhas do recorte. Os totais acima
          consideram todas.
        </p>
      )}
    </div>
  );
}
