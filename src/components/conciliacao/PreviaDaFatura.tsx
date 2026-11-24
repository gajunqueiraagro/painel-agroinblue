/**
 * CARTAO-FATURA-IMPORT-01 (mock aprovado 23/11 13:38, vista 1) — "Compras da fatura · prévia" no lado direito do painel do CARTÃO.
 * Ocupa os 3 lugares da moldura do painel (cabeçalho 40 · conteúdo · botões 52), como o `Trabalho`. SÓ MOSTRA: os grupos clicáveis
 * (a seleção marcada em navy), a tabela de colunas fixas (Data · Na fatura · Conta sugerida · Valor · O que o sistema vai fazer; texto com
 * "…" e o inteiro no `title`; número e data nunca cortam) e o rodapé do mock. O "Gravar N com prévia" é a PRÓXIMA ENTREGA: desabilitado,
 * com o motivo escrito ao lado.
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { COR_DO_GRUPO, ORDEM_DOS_GRUPOS, ROTULO_DO_GRUPO, type GrupoDaFatura, type GruposDaFatura } from '@/lib/financeiro/cartao/gruposDaFatura';
import type { FaturaLida } from '@/lib/financeiro/cartao/lerFaturaOurocard';
import { usePreviaDaFatura, type EstadoDaPrevia } from '@/hooks/usePreviaDaFatura';
import type { LinhasDoPdf } from '@/lib/oc/leitura/linhasDoPdf';

/** o selo curto (o nome inteiro do grupo no `title`): 8 selos em 2 linhas de altura fixa dentro dos 550 px */
export const SELO_DO_GRUPO: Record<GrupoDaFatura, string> = {
  ja_lancado: 'Já lançado', parcela_casa: 'Parcela k/N casa', diferenca: 'Com diferença', mover: 'Mover', nova_sugestao: 'Nova · sugestão',
  nova_classificar: 'Nova · classificar', encargos: 'Anuidade, IOF, juros', pagamento: 'Pagamento',
};
const COR: Record<(typeof COR_DO_GRUPO)[GrupoDaFatura], string> = {
  verde: 'bg-[#e3f5ea] text-[#1e8449]', ambar: 'bg-[#fff3d6] text-[#9a6b00]', azul: 'bg-[#e6efff] text-[#1f56b8]',
  vermelho: 'bg-[#fde8e8] text-[#c0392b]', cinza: 'bg-[#eceff3] text-[#5A6A80]',
};
export const MOTIVO_SEM_GRAVAR = 'a gravação (lançar · mover · ajustar) vem na próxima entrega';

const reais = (cent: number | null) => (cent == null ? '—' : (cent / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dma = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

export function cabecalhoDaFatura(f: FaturaLida): string {
  return [f.finalCartao ? `final ${f.finalCartao}` : null, `fechou ${dma(f.fechamento)}`, `vence ${dma(f.vencimento)}`, `total R$ ${reais(f.totalCent)}`]
    .filter(Boolean).join(' · ');
}
export const aGravar = (g: GruposDaFatura) => g.linhas.filter((x) => x.gesto !== 'nada' && x.gesto !== 'transferencia').length;
export const grupoInicial = (g: GruposDaFatura): GrupoDaFatura => ORDEM_DOS_GRUPOS.find((k) => g.contagem[k] > 0) ?? 'ja_lancado';

const BOTAO = 'h-[24px] whitespace-nowrap rounded border px-2 text-[10.5px] disabled:cursor-not-allowed disabled:opacity-50';

/** a vista (sem leitura): a bancada e o teste a montam com o estado pronto */
export function PreviaDaFaturaVista({ estado, aoVoltar, aoTentarDeNovo }: { estado: EstadoDaPrevia; aoVoltar: () => void; aoTentarDeNovo: () => void }) {
  const pronta = estado.fase === 'pronta' ? estado : null;
  const [escolhido, setEscolhido] = useState<GrupoDaFatura | null>(null);
  const grupo = pronta ? escolhido ?? grupoInicial(pronta.grupos) : null;
  const linhas = pronta && grupo ? pronta.grupos.linhas.filter((x) => x.grupo === grupo) : [];
  const n = pronta ? aGravar(pronta.grupos) : 0;
  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-[#e3e8ef] px-4" data-testid="fatura-previa">
        <span className="min-w-0 whitespace-nowrap text-[12px] font-semibold">Compras da fatura · prévia
          <small className="ml-1.5 font-normal text-[#6b7a8f]">nada é gravado sem o seu OK</small></span>
        <button type="button" className="whitespace-nowrap text-[11px] text-[#1f5fbf] hover:underline" onClick={aoVoltar} data-testid="fatura-voltar">cancelar</button>
      </div>

      <div className="flex min-h-0 flex-col px-3 pt-2 text-[11px]">
        {estado.fase === 'lendo' && <p className="pt-2 text-muted-foreground" data-testid="fatura-lendo">Lendo a fatura e o que já está no sistema…</p>}
        {estado.fase === 'nao_li' && <p className="pt-2" data-testid="fatura-nao-li">{estado.motivo}</p>}
        {estado.fase === 'erro' && (
          <p className="pt-2 text-destructive" role="alert" data-testid="fatura-erro">{estado.frase}{' '}
            <button type="button" className="text-[#1f5fbf] underline" onClick={aoTentarDeNovo} data-testid="fatura-tentar">Tentar de novo</button></p>
        )}
        {pronta && grupo && (
          <>
            <p className="h-[16px] shrink-0 whitespace-nowrap text-[10.5px] text-[#55657a] tabular-nums" data-testid="fatura-cabecalho">{cabecalhoDaFatura(pronta.fatura)}</p>
            <p className="h-[14px] shrink-0 whitespace-nowrap text-[10px] text-amber-700" data-testid="fatura-avisos"
              title={pronta.avisos.join(' ')}>{pronta.avisos[0] ?? ''}</p>
            {/* os grupos: altura FIXA de 2 linhas (nada se desloca ao escolher) */}
            <div className="flex h-[46px] shrink-0 flex-wrap content-start gap-1" data-testid="fatura-grupos">
              {ORDEM_DOS_GRUPOS.map((k) => (
                <button key={k} type="button" onClick={() => setEscolhido(k)} title={`${ROTULO_DO_GRUPO[k]} · ${pronta.grupos.contagem[k]}`}
                  className={cn('h-[20px] whitespace-nowrap rounded-[10px] px-2 text-[10px] font-semibold tabular-nums',
                    k === grupo ? 'bg-[#1E3A5F] text-white' : COR[COR_DO_GRUPO[k]])}
                  data-testid={`fatura-grupo-${k}`} data-ligado={k === grupo ? 'sim' : 'nao'}>
                  {SELO_DO_GRUPO[k]} {pronta.grupos.contagem[k]}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded border border-[#e3e8ef]" data-testid="fatura-quadro">
              <table className="w-full table-fixed border-collapse" data-testid="fatura-tabela">
                <colgroup><col style={{ width: 64 }} /><col /><col style={{ width: 108 }} /><col style={{ width: 72 }} /><col style={{ width: 150 }} /></colgroup>
                <thead className="sticky top-0 z-[1] bg-primary">
                  <tr><th className={TH_REGUA}>Data</th><th className={TH_REGUA}>Na fatura</th><th className={TH_REGUA}>Conta sugerida</th>
                    <th className={cn(TH_REGUA, 'text-right')}>Valor</th><th className={TH_REGUA}>O que o sistema vai fazer</th></tr>
                </thead>
                <tbody>
                  {linhas.map((x) => (
                    <tr key={x.linha.ordem} className="border-b border-[#f0f2f6]" data-testid="fatura-linha" data-gesto={x.gesto}>
                      <td className={cn(TD_REGUA, 'whitespace-nowrap tabular-nums')}>{dma(x.linha.dataCompra)}</td>
                      <td className={TD_REGUA_TEXTO} title={x.linha.descricao}>{x.linha.descricao}</td>
                      <td className={TD_REGUA_TEXTO} title={x.contaSugerida}>{x.contaSugerida}</td>
                      <td className={cn(TD_REGUA_NUM, x.linha.valorCent < 0 ? 'text-[#1e8449]' : 'text-[#c0392b]')}>{reais(x.linha.valorCent)}</td>
                      <td className={TD_REGUA_TEXTO} title={x.oQueFaz} data-testid="fatura-linha-faz">{x.oQueFaz}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="grid items-center gap-2 border-t border-[#e3e8ef] px-4" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
        <span className="min-w-0 leading-[13px]">
          <span className="block overflow-hidden whitespace-nowrap text-[10.5px] text-[#6b7a8f] tabular-nums" data-testid="fatura-rodape">{pronta ? pronta.grupos.rodape : ''}</span>
          <span className="block whitespace-nowrap text-[10px] text-[#9aa7b8]" data-testid="fatura-motivo">{pronta ? MOTIVO_SEM_GRAVAR : ''}</span>
        </span>
        <button type="button" className={cn(BOTAO, 'border-[#1f56b8] bg-[#1f56b8] text-white')} disabled title={MOTIVO_SEM_GRAVAR} style={{ minWidth: 132 }} data-testid="fatura-gravar">
          Gravar {n} com prévia</button>
      </div>
    </>
  );
}

/** o painel: lê a fatura solta e mostra a vista */
export function PreviaDaFatura(p: {
  clienteId: string; contaId: string; arquivo: File; nomeDaConta: (id: string) => string; aoVoltar: () => void; lerLinhas?: (f: File) => Promise<LinhasDoPdf>;
}) {
  const { estado, tentarDeNovo } = usePreviaDaFatura(p);
  return <PreviaDaFaturaVista estado={estado} aoVoltar={p.aoVoltar} aoTentarDeNovo={tentarDeNovo} />;
}
