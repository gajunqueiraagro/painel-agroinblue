/**
 * CONC-SUGESTOES-V2 ESCOPO (Gabriel 26/11 06:56) — MODAL ÚNICO: toda entrada que oferece "casar/procurar" um movimento do extrato abre o
 * MESMO "Sugestões para casar" (`SugestoesCasarModal`) e dele o MESMO "Casar com o banco" (`CasarComBancoModal`) da Conferência. A estação
 * ("Lançamentos candidatos") como 3º modal é PROIBIDA. Aqui não há a lista da Conferência: o motor ampliado do banco é a lista (`soMotor`).
 * Os levados saem pelas MESMAS regras da Conferência (`levadoDoMotor`, `levadosDosMarcados`, `levadosDaSugestao`).
 */
import { useState } from 'react';
import { SugestoesCasarModal } from '@/components/financeiro-v2/SugestoesCasarModal';
import { CasarComBancoModal, type ExtratoAlvo, type LevadoInicial } from '@/components/financeiro-v2/CasarComBancoModal';
import { levadoDoAchado, levadoDoMotor, levadosDosMarcados, levadosDaSugestao } from '@/components/financeiro-v2/EspelhoConciliacaoTab';
import type { ModeloDoHistorico } from '@/lib/conciliacao/procurarNoHistorico';

export function SugestoesDoMovimento({ movimento, clienteId, contaId, nomeConta, aoFechar, aoMudar }: {
  movimento: { id: string; data: string; historico: string | null; valor: number };
  clienteId: string; contaId: string; nomeConta?: string;
  aoFechar: () => void; aoMudar: () => void | Promise<void>;
}) {
  const alvo: ExtratoAlvo = { extrato_id: movimento.id, data: movimento.data, historico: movimento.historico, valor: movimento.valor };
  const [sugerindo, setSugerindo] = useState(true);
  const [casar, setCasar] = useState<{ iniciais: LevadoInicial[]; modelo?: ModeloDoHistorico } | null>(null);
  const irParaCasar = (iniciais: LevadoInicial[], modelo?: ModeloDoHistorico) => { setCasar({ iniciais, modelo }); setSugerindo(false); };
  return (<>
    <SugestoesCasarModal open={sugerindo} onClose={aoFechar} extrato={alvo} nomeConta={nomeConta} sugestoes={[]} soMotor
      onCasar={(s) => irParaCasar(levadosDaSugestao(s))}
      clienteId={clienteId} contaBancariaId={contaId}
      onCriarIgual={(m) => irParaCasar([], m)}
      onCasarDoHistorico={(a, trocar) => irParaCasar([levadoDoAchado(a, alvo, trocar, nomeConta)])}
      onCasarSelecionados={(ms) => irParaCasar(levadosDosMarcados(ms, alvo, nomeConta))}
      extratoId={movimento.id}
      onCasarDoMotor={(c) => irParaCasar([levadoDoMotor(c, alvo, nomeConta)])} />
    <CasarComBancoModal open={!!casar} onClose={aoFechar} extrato={casar ? alvo : null} iniciais={casar?.iniciais ?? []}
      modelo={casar?.modelo ?? null} nomeConta={nomeConta} contaBancariaId={contaId} clienteId={clienteId}
      onConciliado={() => { void aoMudar(); }} />
  </>);
}
