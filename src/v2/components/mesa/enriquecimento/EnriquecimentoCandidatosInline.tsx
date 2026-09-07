/**
 * Os candidatos do "Você decide", EMBAIXO DA TABELA — [ENRIQUECER-TELA-01] (133b).
 *
 * ⚠ SAIU DO DRAWER. `EnriquecimentoCandidatosDrawer` cobria a tabela justamente quando o
 * operador precisava dela: a pergunta é "qual destes lançamentos é ESTA linha?", e a linha
 * ficava escondida atrás do painel que perguntava. Aqui os dois ficam visíveis ao mesmo
 * tempo, que é a única maneira de comparar.
 *
 * ⚠ SÓ O 1:1. A composição por soma (N lançamentos = 1 linha) era a segunda seção do
 * drawer e continua sendo trabalho da 133c, junto com o agrupamento com ação — trazê-la
 * para cá agora significaria pôr seleção múltipla e conferência de soma dentro de uma
 * faixa que precisa caber sem rolar.
 *
 * ⚠ "DEIXAR SEM PAR" NÃO EXISTE, e isso foi MEDIDO: o banco tem
 * `fn_classificacao_resolver_ambiguo` e `fn_classificacao_desfazer_ambiguo`, e nenhuma RPC
 * que marque `sem_match` à mão. O envelope mandou reportar e deixar o botão fora — um
 * botão que chama função inexistente falha na primeira tentativa do operador.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { fmtBRL, fmtData } from './fmt';
import { useClassificacaoCandidatosProximos } from '@/v2/hooks/useClassificacaoCandidatosProximos';

export interface EnriquecimentoCandidatosInlineProps {
  stagingId: string | null;
  /** O valor e a data da LINHA DA PLANILHA — o cabeçalho da pergunta. */
  excelValor: number | null;
  excelData: string | null;
  /** O escolhido; o pai chama a RPC, trata o guard e avança a seleção. */
  onEscolher: (lancId: string) => void;
  isResolvendo?: boolean;
  /** `lanc_id` → linhas da planilha que já o usaram. Ocultos, com o motivo. */
  lancIdsUsados?: Map<string, number[]>;
  /** Há próxima linha no recorte? Governa só o rótulo do botão. */
  temProxima?: boolean;
}

export function EnriquecimentoCandidatosInline({
  stagingId, excelValor, excelData, onEscolher, isResolvendo, lancIdsUsados, temProxima,
}: EnriquecimentoCandidatosInlineProps) {
  const { data, isFetching } = useClassificacaoCandidatosProximos(stagingId);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  /* Trocar de linha zera a escolha: um radio marcado de outra linha faria o botão prometer
     gravar um vínculo que o operador não escolheu para ESTA. */
  useEffect(() => { setEscolhido(null); }, [stagingId]);

  /* Os já usados por OUTRA linha desta sessão saem da lista — o guard do banco é a trava
     real, e oferecê-los aqui seria oferecer um erro. O contador diz que sumiram. */
  const { visiveis, ocultos } = useMemo(() => {
    const lista = data ?? [];
    if (!lancIdsUsados || lancIdsUsados.size === 0) return { visiveis: lista, ocultos: 0 };
    const vis = lista.filter((c) => !(lancIdsUsados.get(c.lanc_id)?.length));
    return { visiveis: vis, ocultos: lista.length - vis.length };
  }, [data, lancIdsUsados]);

  return (
    <div className="shrink-0 rounded-md border border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20">
      <div className="flex flex-wrap items-baseline gap-x-2 border-b border-amber-300/60 px-2 py-1 dark:border-amber-800/60">
        <span className="text-[11px] font-medium text-amber-900 dark:text-amber-200">
          Qual lançamento do sistema é este?
        </span>
        <span className="text-[10px] text-amber-800/80 dark:text-amber-300/80">
          · {visiveis.length} candidato{visiveis.length === 1 ? '' : 's'} de {fmtBRL(excelValor)} em {fmtData(excelData)}
          {ocultos > 0 && ` · ${ocultos} já usado${ocultos === 1 ? '' : 's'} por outra linha`}
        </span>
      </div>

      {isFetching && visiveis.length === 0 ? (
        <p className="px-2 py-2 text-[10px] text-muted-foreground">Procurando candidatos…</p>
      ) : visiveis.length === 0 ? (
        <p className="px-2 py-2 text-[10px] text-muted-foreground">
          Nenhum candidato disponível — todos os da janela já foram usados por outras linhas.
        </p>
      ) : (
        /* Duas colunas, como o mock: os candidatos são pares do mesmo valor e comparar
           lado a lado custa menos que rolar uma coluna só. */
        <div className="grid max-h-[128px] grid-cols-1 gap-x-3 overflow-y-auto px-2 py-1 sm:grid-cols-2">
          {visiveis.map((c) => (
            <label key={c.lanc_id}
              className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-amber-100/70 dark:hover:bg-amber-900/30">
              {/* ⚠ RADIO, NÃO CHECKBOX: uma linha da planilha é UM lançamento. Escolha
                  múltipla é composição por soma, e ela é da 133c. */}
              <input type="radio" name={`cand-${stagingId ?? 'nenhum'}`} className="h-3 w-3 shrink-0 accent-amber-700"
                checked={escolhido === c.lanc_id}
                disabled={isResolvendo}
                onChange={() => setEscolhido(c.lanc_id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium" title={c.descricao ?? ''}>
                  {c.descricao || c.favorecido_nome || '—'}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  doc {c.documento || '—'} ·{' '}
                  {c.subcentro_atual ? `já tem ${c.subcentro_atual}` : 'cru do banco · sem subcentro'}
                  {c.distancia_dias != null && c.distancia_dias !== 0 && ` · ${c.distancia_dias}d`}
                </span>
              </span>
              <span className="shrink-0 text-[11px] font-medium tabular-nums">{fmtBRL(c.valor)}</span>
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-amber-300/60 px-2 py-1 dark:border-amber-800/60">
        {/* ⚠ O MOTIVO DO DESABILITADO FICA ESCRITO AO LADO, e é a fonte única do `disabled`
            e do `title`: um botão apagado sem explicação faz o operador tentar de novo. */}
        <span className="text-[10px] text-muted-foreground">
          {!escolhido ? 'Marque um candidato para habilitar.' : 'Grava o vínculo desta linha com o lançamento marcado.'}
        </span>
        <div className="flex-1" />
        <Button type="button" size="sm" className="h-6 px-2 text-[11px]"
          disabled={!escolhido || isResolvendo}
          title={!escolhido ? 'Marque um candidato para habilitar.' : undefined}
          onClick={() => { if (escolhido) onEscolher(escolhido); }}>
          {isResolvendo ? 'Gravando…' : temProxima ? 'Usar este e ir para a próxima' : 'Usar este'}
        </Button>
      </div>
    </div>
  );
}
