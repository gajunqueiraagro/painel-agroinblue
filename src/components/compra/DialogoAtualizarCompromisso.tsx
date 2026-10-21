/**
 * O diálogo de "Atualizar compromisso" — [OC-EDITAR-LOTE-FECHADA] 128b/128e; casa nova no OC-DESFAZER-PREVISTO-01b (mock do
 * Gabriel, 20/10 19h16: estado 3, 460x344 fixo).
 *
 * ⚠ IRMÃO DO `DialogoExcluirLoteOC`, e de propósito: mesma mecânica (simula ao abrir,
 * lista o rol do banco, pede motivo, executa com a versão da tela), porque o operador
 * aprende UM gesto e o usa nos dois. O que muda é o que ele afirma — aqui há um valor
 * antigo e um novo, e eles são a razão do diálogo existir.
 *
 * ⚠ ENQUANTO A SIMULAÇÃO NÃO CHEGA, O BOTÃO NÃO LIGA: um "Atualizar" clicável sobre uma
 * lista vazia diria "nada acontece" sobre algo que cancela título e cria parcela.
 *
 * ⚠ OC-DESFAZER-PREVISTO-01b:
 *   · o VENCIMENTO da nova parcela é escolhido aqui, no DatePicker da casa; a proposta é o da parcela viva (a simulação o
 *     devolve). Data anterior a hoje: borda e linha âmbar — AVISO, não bloqueio (o caso de 20/10 propunha 15/10, já passado);
 *   · o rol vem do banco com R$ formatado; trocar a data simula de novo (a última linha mostra o vencimento escolhido);
 *   · AGENDADO cai junto só com a confirmação explícita (a faixa âmbar); REALIZADO/CONCILIADO bloqueia com a linha de quem
 *     trava e "Abrir lançamento" (o id vem do banco);
 *   · o motivo é uma linha de 24px e fica guardado por lote enquanto a OC estiver aberta.
 */
import { useEffect, useState } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/lib/utils';
import { ehRecusa, type ReprogramarCompromissoApi, type SimulacaoReprogramacao } from '@/hooks/useReprogramarCompromissoLote';
import type { LancamentoQueTrava } from '@/lib/oc/desfazerCompromisso';
import { chaveDoMotivo, esquecerMotivo, useMotivoGuardado } from '@/lib/oc/motivoGuardado';
import {
  BLOCO_OC, BotaoAcaoOC, BotaoVoltarOC, CampoMotivoOC, CascaDialogoOC, FaixaAgendadoOC, FaixaBloqueioOC, ROTULO_OC, VALOR_OC,
  brlOC, dataBr, ehRecebimento,
} from './CascaDialogoOC';

/** Hoje em aaaa-mm-dd (fuso local) — a régua do aviso de data passada. */
export const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const vencimentoJaPassou = (iso: string | null | undefined, hoje = hojeIso()) => !!iso && iso.slice(0, 10) < hoje;

export function DialogoAtualizarCompromisso({
  api, loteId, rotulo, versao, onFechar, onAtualizado, motivoReabertura = null, operacaoId = null, identidade, tipoOperacao,
  onAbrirLancamento = () => {},
}: {
  api: ReprogramarCompromissoApi;
  loteId: string;
  /** "Touros · 2 cab" — a identidade do lote cujo compromisso será refeito. */
  rotulo: string;
  versao: number | null;
  onFechar: () => void;
  onAtualizado: (versaoNova: number) => void;
  /**
   * FIN-V2-CANCEL-MOTIVO-01 (b) — o motivo da reabertura desta sessao da OC (venda/abate).
   * ⚠ VALOR SUGERIDO E' VALOR ACEITO: nasce no campo, EDITAVEL, e marcado em ambar enquanto for
   * a sugestao intocada — o operador ve' que nao foi ele quem escreveu. Nada grava sem o clique.
   * ⚠ NAO FUNDE AS DUAS PERGUNTAS: entre reabrir e atualizar o operador edita o lote; sao duas
   * decisoes, com dois registros. Omitido (compra) = campo vazio, como sempre.
   */
  motivoReabertura?: string | null;
  /** A operação — a chave do motivo guardado. */
  operacaoId?: string | null;
  /** "Abate 036 N · novilhas · 36 cab"; sem ela, o rótulo do lote. */
  identidade?: string;
  tipoOperacao?: string | null;
  onAbrirLancamento?: (lancamentoId: string) => void;
}) {
  const [simulacao, setSimulacao] = useState<SimulacaoReprogramacao | null>(null);
  const chave = chaveDoMotivo(operacaoId, 'atualizar', loteId);
  const [motivo, setMotivo] = useMotivoGuardado(chave, motivoReabertura);
  const motivoESugestao = !!motivoReabertura && motivo === motivoReabertura;
  /** O vencimento escolhido; nulo = o proposto pelo banco. */
  const [vencimento, setVencimento] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [recusa, setRecusa] = useState<{ frase: string; trava: LancamentoQueTrava | null } | null>(null);

  /* ⚠ A SIMULACAO RODA UMA VEZ POR ABERTURA (OC-CC-EXPLICAR-CONGELA-01): o efeito depende da FUNCAO (`useCallback` estavel no
     hook) e do lote — nunca do objeto `api`, que e' recriado a cada render e refazia a simulacao a cada render do pai.
     Trocar a data simula de novo pelo `onChange` do campo, nunca por este efeito. */
  const { simular } = api;
  useEffect(() => {
    let vivo = true;
    void simular(loteId).then(s => { if (vivo) setSimulacao(s); });
    return () => { vivo = false; };
  }, [simular, loteId]);

  const venc = vencimento ?? simulacao?.vencimentoProposto ?? null;
  const passou = vencimentoJaPassou(venc);
  const trocarVencimento = (v: string) => {
    setVencimento(v || null);
    void simular(loteId, v || null).then(s => { if (s) setSimulacao(s); });
  };

  const bloqueio = recusa ?? (simulacao && simulacao.bloqueios.length > 0
    ? { frase: simulacao.bloqueios[0].descricao, trava: simulacao.bloqueios[0].trava } : null);
  const temAgendado = (simulacao?.agendados.length ?? 0) > 0;
  const recebimento = ehRecebimento(bloqueio?.trava?.sinal ?? simulacao?.agendados[0]?.sinal, tipoOperacao);
  const falta = !simulacao ? 'Consultando o que será refeito'
    : bloqueio ? 'Nada foi alterado.'
    : !venc ? 'Informe o vencimento da nova parcela.'
    : temAgendado && !confirmado ? 'Confirme o cancelamento do lançamento agendado.'
    : !motivo.trim() ? 'Informe o motivo.'
    : versao == null ? 'Versão da operação indisponível; reabra a operação.'
    : null;

  const confirmar = async () => {
    if (falta || versao == null) return;
    const r = await api.reprogramar(loteId, versao, motivo.trim(), { vencimento: venc, confirmarAgendado: confirmado });
    if (ehRecusa(r)) { setRecusa({ frase: r.erro, trava: r.trava }); return; }
    if (r) { esquecerMotivo(chave); onAtualizado(r.operacaoVersao); }
  };

  return (
    <CascaDialogoOC testid="dialogo-atualizar-compromisso" titulo="Atualizar compromisso" identidade={identidade ?? rotulo}
      onFechar={onFechar} bloqueado={api.reprogramando}
      dica={falta ?? 'Cancela as parcelas não pagas e refaz pelo valor do lote.'}
      botoes={<>
        <BotaoVoltarOC onClick={onFechar} disabled={api.reprogramando} />
        {!bloqueio && (
          <BotaoAcaoOC testid="confirmar-atualizar" tom="navy" texto={api.reprogramando ? 'Atualizando' : 'Atualizar compromisso'}
            disabled={!!falta || api.reprogramando} onClick={() => { void confirmar(); }}
            title={falta ?? 'Cancelar as parcelas não pagas e reprogramar pelo valor novo'} />
        )}
      </>}>
      {!simulacao ? (
        <div className={BLOCO_OC}><span className={ROTULO_OC}>Consultando o que será refeito</span></div>
      ) : bloqueio ? (
        <FaixaBloqueioOC trava={bloqueio.trava} frase={bloqueio.frase} recebimento={recebimento} onAbrirLancamento={onAbrirLancamento} />
      ) : (
        <>
          <div className={cn(BLOCO_OC, 'grid grid-cols-[1fr_1fr_156px] items-end gap-x-2')} data-testid="topo-atualizar">
            <div className="min-w-0">
              <div className={ROTULO_OC}>compromisso hoje</div>
              <div className="whitespace-nowrap text-[11px] leading-[24px] tabular-nums text-[#6B7280] line-through" data-testid="valor-antigo">
                {brlOC(simulacao.valorAntigo)}
              </div>
            </div>
            <div className="min-w-0">
              <div className={ROTULO_OC}>o lote vale hoje</div>
              <div className="whitespace-nowrap text-[11px] font-semibold leading-[24px] tabular-nums text-[#111827]" data-testid="valor-novo">
                {brlOC(simulacao.valorNovo)}
              </div>
            </div>
            <div className="min-w-0">
              <div className={ROTULO_OC}>vencimento da nova parcela *</div>
              <DatePicker value={venc ?? ''} onChange={trocarVencimento} size="compact" data-testid="vencimento-nova-parcela"
                className={cn('h-6 w-full text-[11px]', passou && 'border-[#EFD08A] bg-[#FFF8E6]')} />
            </div>
            {passou && (
              <div className="col-span-3 pt-1 text-[10px] leading-[13px] text-[#92400E]" data-testid="aviso-vencimento-passado">
                Vence em {dataBr(venc)}, que já passou. Confira a data antes de atualizar.
              </div>
            )}
          </div>
          <div className={BLOCO_OC} data-testid="rol-atualizar">
            <div className={ROTULO_OC}>o que será refeito</div>
            <ul className={VALOR_OC}>
              {simulacao.rol.length === 0
                ? <li className="text-[#4B5563]">Nada a desfazer: só o valor muda.</li>
                : simulacao.rol.map((r, i) => <li key={i}>{r.descricao}</li>)}
            </ul>
          </div>
          {temAgendado && <FaixaAgendadoOC confirmado={confirmado} onConfirmar={setConfirmado} />}
          <CampoMotivoOC testid="motivo-atualizar" motivo={motivo} onMotivo={setMotivo} sugerido={motivoESugestao} disabled={api.reprogramando}
            placeholder="Motivo da atualização" />
        </>
      )}
    </CascaDialogoOC>
  );
}
