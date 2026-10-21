/**
 * "DESFAZER COMPROMISSO" — OC-DESFAZER-PREVISTO-01b (mock do Gabriel, 20/10 19h16). Era o diálogo de duas etapas do
 * `AbaCompromissosOC` (rol → motivo), que no caso da OC 1645ba75 recusava com a frase crua do banco mais um "Falta: …" montado
 * pela tela, e pedia o motivo de novo a cada tentativa.
 *
 * ⚠ SIMULA AO ABRIR (o mesmo gesto, sem gravar — `oc_desfazer_compromisso` com `p_simular`), e a simulação decide o miolo:
 *   · PRONTO — o rol do que será desfeito, nesta ordem, e o motivo;
 *   · AGENDADO (estado 2) — o que é cancelado junto (data · Receb. n/N · valor · "Agendado"), a faixa âmbar e a confirmação
 *     explícita; o botão só liga com ela marcada E o motivo; o banco exige `p_confirmar_agendado`;
 *   · BLOQUEIO (estado 1) — realizado ou conciliado: a faixa vermelha com a linha de QUEM TRAVA (o id vem no DETAIL da recusa,
 *     nunca do texto) e "Abrir lançamento"; "Nada foi alterado." e o botão desligado. O "Falta: …" da tela não aparece mais:
 *     quem diz o que trava é o banco.
 * ⚠ A FRASE É DO BANCO (fonte única). A tela só escreve o título da faixa e a linha.
 * ⚠ O MOTIVO É PEDIDO UMA VEZ: fica guardado por compromisso enquanto a OC estiver aberta (`useMotivoGuardado`).
 */
import { useEffect, useState } from 'react';
import {
  executarDesfazerCompromisso, ErroDesfazer, type AgendadoADesfazer, type LancamentoQueTrava, type RpcDesfazer,
} from '@/lib/oc/desfazerCompromisso';
import { chaveDoMotivo, esquecerMotivo, useMotivoGuardado } from '@/lib/oc/motivoGuardado';
import {
  BLOCO_OC, BotaoAcaoOC, BotaoVoltarOC, CampoMotivoOC, CascaDialogoOC, FaixaAgendadoOC, FaixaBloqueioOC, LinhaDoLancamentoOC,
  ROTULO_OC, VALOR_OC, ehRecebimento,
} from './CascaDialogoOC';

type Estado =
  | { tipo: 'simulando' }
  | { tipo: 'pronto'; agendados: AgendadoADesfazer[] }
  | { tipo: 'bloqueio'; frase: string; trava: LancamentoQueTrava | null }
  | { tipo: 'erro'; frase: string; agendados: AgendadoADesfazer[] };

export function DialogoDesfazerCompromisso({
  operacaoId, compromissoId, versao, identidade, rol, tipoOperacao, onFechar, onDesfeito, onAbrirLancamento, rpc,
}: {
  operacaoId: string;
  compromissoId: string;
  versao: number;
  /** "Abate 036 N · novilhas · 36 cab" */
  identidade: string;
  /** O que a tela sabe que será desfeito, nesta ordem (`rolDoEstado`). */
  rol: string[];
  tipoOperacao?: string | null;
  onFechar: () => void;
  onDesfeito: (feito: string[]) => void;
  /** A ida e volta da casa (`paramsAbrirLancamentoDaOC`), pelo id do DETAIL. */
  onAbrirLancamento: (lancamentoId: string) => void;
  /** Injetável (teste e bancada); o padrão é o banco. */
  rpc?: RpcDesfazer;
}) {
  const chave = chaveDoMotivo(operacaoId, 'desfazer', compromissoId);
  const [motivo, setMotivo] = useMotivoGuardado(chave);
  const [estado, setEstado] = useState<Estado>({ tipo: 'simulando' });
  const [confirmado, setConfirmado] = useState(false);
  const [gravando, setGravando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void executarDesfazerCompromisso({ operacaoId, versao, compromissoId, motivo: '', simular: true, rpc })
      .then(({ retorno }) => { if (vivo) setEstado({ tipo: 'pronto', agendados: retorno.agendados }); })
      .catch((e: unknown) => {
        if (!vivo) return;
        const frase = e instanceof Error ? e.message : 'Não foi possível consultar agora. Tente de novo.';
        setEstado(e instanceof ErroDesfazer && e.trava ? { tipo: 'bloqueio', frase, trava: e.trava } : { tipo: 'erro', frase, agendados: [] });
      });
    return () => { vivo = false; };
  }, [operacaoId, versao, compromissoId, rpc]);

  const agendados = estado.tipo === 'pronto' || estado.tipo === 'erro' ? estado.agendados : [];
  const temAgendado = agendados.length > 0;
  const recebimento = ehRecebimento(estado.tipo === 'bloqueio' ? estado.trava?.sinal : agendados[0]?.sinal, tipoOperacao);
  const falta = estado.tipo === 'simulando' ? 'Consultando o que será desfeito'
    : estado.tipo === 'bloqueio' ? 'Nada foi alterado.'
    : temAgendado && !confirmado ? 'Confirme o cancelamento do lançamento agendado.'
    : !motivo.trim() ? 'Informe o motivo.'
    : null;

  const desfazer = async () => {
    if (falta || gravando) return;
    setGravando(true);
    try {
      const { feito } = await executarDesfazerCompromisso({ operacaoId, versao, compromissoId, motivo, confirmarAgendado: confirmado, rpc });
      esquecerMotivo(chave);
      onDesfeito(feito);
    } catch (e) {
      const frase = e instanceof Error ? e.message : 'Não foi possível desfazer agora. Tente de novo.';
      setEstado(e instanceof ErroDesfazer && e.trava && e.trava.status !== 'agendado'
        ? { tipo: 'bloqueio', frase, trava: e.trava } : { tipo: 'erro', frase, agendados });
    } finally {
      setGravando(false);
    }
  };

  return (
    <CascaDialogoOC testid="dialogo-desfazer-compromisso" titulo="Desfazer compromisso" identidade={identidade} onFechar={onFechar}
      bloqueado={gravando}
      dica={falta ?? 'Um motivo só, registrado em cada passo.'}
      botoes={<>
        <BotaoVoltarOC onClick={onFechar} disabled={gravando} />
        <BotaoAcaoOC testid="confirmar-desfazer" tom="destrutivo" texto={gravando ? 'Desfazendo' : 'Desfazer compromisso'}
          disabled={!!falta || gravando} onClick={() => { void desfazer(); }} />
      </>}>
      {estado.tipo === 'simulando' && <div className={BLOCO_OC}><span className={ROTULO_OC}>Consultando o que será desfeito</span></div>}

      {estado.tipo === 'bloqueio' && (
        <FaixaBloqueioOC trava={estado.trava} frase={estado.frase} recebimento={recebimento} onAbrirLancamento={onAbrirLancamento} />
      )}

      {estado.tipo === 'erro' && (
        <div className="break-words rounded-[6px] border border-[#F0B9B9] bg-[#FDF2F2] px-2 py-1.5 text-[11px] leading-[14px] text-[#991B1B]"
          data-testid="frase-do-banco">{estado.frase}</div>
      )}

      {(estado.tipo === 'pronto' || estado.tipo === 'erro') && !temAgendado && (
        <div className={BLOCO_OC} data-testid="rol-desfazer">
          <div className={ROTULO_OC}>será desfeito, nesta ordem</div>
          <ol className={`${VALOR_OC} list-decimal pl-4`}>{rol.map(item => <li key={item}>{item}</li>)}</ol>
        </div>
      )}

      {temAgendado && (
        <>
          <div className={`${BLOCO_OC} flex flex-col gap-1`} data-testid="cancelado-junto">
            <div className={ROTULO_OC}>será cancelado junto</div>
            {agendados.map(a => (
              <LinhaDoLancamentoOC key={a.lancamentoId} testid="linha-agendada" data={a.data} sequencia={a.sequencia} total={a.total}
                valor={a.valor} recebimento={recebimento} selo="agendado" />
            ))}
          </div>
          <FaixaAgendadoOC confirmado={confirmado} onConfirmar={setConfirmado} />
        </>
      )}

      {estado.tipo !== 'bloqueio' && estado.tipo !== 'simulando' && (
        <CampoMotivoOC testid="motivo-desfazer" motivo={motivo} onMotivo={setMotivo} disabled={gravando} placeholder="Por que desfazer este compromisso" />
      )}
    </CascaDialogoOC>
  );
}
