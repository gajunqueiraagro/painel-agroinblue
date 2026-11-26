/**
 * FOLHA-01 · PR B (telas) — FINANCEIRO › FOLHA DE PAGAMENTO (gabarito: mock-folha-01-v1.html, aprovado 19/11 07:07; contrato do Code 6
 * folha-20261119-0727-…-CONTRATO.md §3 e §6).
 *
 * ⚠ AS ABAS FICAM NO LUGAR DESDE JÁ; o FOLHA-TELAS-03 deu conteúdo à "Folha do mês" (`AbaFolhaMes`, `fn_folha_mes`) e criou "Férias"
 *   (`AbaFerias`, `fn_folha_ferias_lista`), entre ela e o Histórico.
 * ⚠ O CABEÇALHO É O DA CASA (`CabecalhoDaTela`, UI-MESES-PADRAO-01: navy, uma linha, as abas como 2ª linha); o corpo é o `--corpo`
 *   (#D9DFE8) com os cards brancos. As abas do cabeçalho substituem o "Segmentado 4 × 120" do §6: é o padrão aprovado depois (19/11 07:12),
 *   e elas não mudam de largura ao trocar (mesmo peso).
 * ⚠ D5: sem a marca 'folha' no cliente (`folha_ok` falso) a tela diz isso e não lê nada — o item nem aparece no menu (V2ContextDrawer).
 * ⚠ D3: quem chega pelo ↗ do lançamento abre o Histórico daquela pessoa e ganha "‹ Voltar ao lançamento".
 */
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { CabecalhoDaTela, type AbaDoCabecalho } from '@/components/ui/cabecalho-da-tela';
import { useCliente } from '@/contexts/ClienteContext';
import { useFolhaOk, usePendenciasFolha } from '@/hooks/useFolha';
import { useFeriasDaFolha } from '@/hooks/useFolhaMes';
import { feriasAProgramar } from '@/lib/folha/folhaFerias';
import { AbaFolhaMes } from './AbaFolhaMes';
import { AbaFerias } from './AbaFerias';
import { AbaFuncionarios } from './AbaFuncionarios';
import { AbaHistorico } from './AbaHistorico';
import { AbaPendencias } from './AbaPendencias';

export type AbaDaFolha = 'funcionarios' | 'mes' | 'ferias' | 'historico' | 'pendencias';

export interface EntradaDaFolha {
  aba?: AbaDaFolha;
  funcionarioId?: string | null;
  /** D3: o lançamento de onde se veio — o "‹ Voltar ao lançamento" o reabre */
  voltarAoLancamento?: (() => void) | null;
}

export function FolhaTela({ entrada }: { entrada?: EntradaDaFolha | null }) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id ?? null;
  const ok = useFolhaOk(clienteId);
  const [aba, setAba] = useState<AbaDaFolha>(entrada?.aba ?? 'funcionarios');
  const [funcionarioId, setFuncionarioId] = useState<string | null>(entrada?.funcionarioId ?? null);
  const voltar = entrada?.voltarAoLancamento ?? null;
  /* a entrada nova (outro ↗ de lançamento) vale sobre o que estava aberto */
  useEffect(() => {
    if (!entrada) return;
    if (entrada.aba) setAba(entrada.aba);
    if (entrada.funcionarioId !== undefined) setFuncionarioId(entrada.funcionarioId ?? null);
  }, [entrada]);
  /* trocar de cliente: a pessoa escolhida era do outro */
  useEffect(() => { setFuncionarioId(entrada?.funcionarioId ?? null); }, [clienteId]); // eslint-disable-line react-hooks/exhaustive-deps -- só a troca de cliente

  const liberada = ok.data === true;
  const pend = usePendenciasFolha(liberada ? clienteId : null);
  const nPend = pend.data?.itens.length ?? null;
  /* FOLHA-TELAS-03: o número da aba Férias = vencidas + vencendo em 90 dias (o mesmo do topo da aba) */
  const ferias = useFeriasDaFolha(liberada ? clienteId : null);
  const nFerias = ferias.data ? feriasAProgramar(ferias.data.totais) : null;

  const abas: AbaDoCabecalho<AbaDaFolha>[] = [
    { chave: 'funcionarios', rotulo: 'Funcionários' },
    { chave: 'mes', rotulo: 'Folha do mês' },
    { chave: 'ferias', rotulo: nFerias ? `Férias · ${nFerias.toLocaleString('pt-BR')}` : 'Férias' },
    { chave: 'historico', rotulo: 'Histórico' },
    { chave: 'pendencias', rotulo: nPend == null ? 'Pendências' : `Pendências · ${nPend.toLocaleString('pt-BR')}` },
  ];

  const abrirHistorico = (id: string) => { setFuncionarioId(id); setAba('historico'); };
  const abrirFicha = (id: string) => { setFuncionarioId(id); setAba('funcionarios'); };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-corpo" data-testid="folha-tela">
      <CabecalhoDaTela<AbaDaFolha> testId="folha-cabecalho"
        titulo={<span className="flex items-center gap-1.5">
          {voltar && (
            <button type="button" onClick={voltar} data-testid="folha-voltar-lancamento"
              className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border border-white/20 bg-white/[.06] px-2 text-[12px] font-medium text-white hover:bg-white/[.12]">
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao lançamento
            </button>
          )}
          Folha de pagamento
        </span>}
        subtitulo="o cadastro, os pagamentos ligados e o que falta conferir"
        abas={liberada ? abas : []} aba={aba} onAba={setAba} />

      {!clienteId ? (
        <Aviso texto="Escolha um cliente." />
      ) : ok.isLoading ? (
        <Aviso texto="Carregando…" />
      ) : !liberada ? (
        <Aviso texto="A folha deste cliente não está liberada para você. Quem libera é o administrador." testId="folha-sem-acesso" />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-2">
          {aba === 'funcionarios' && <AbaFuncionarios clienteId={clienteId} funcionarioId={funcionarioId} onEscolher={setFuncionarioId} onHistorico={abrirHistorico} />}
          {aba === 'mes' && <AbaFolhaMes clienteId={clienteId} onFicha={abrirFicha} />}
          {aba === 'ferias' && <AbaFerias clienteId={clienteId} onFicha={abrirFicha} />}
          {aba === 'historico' && <AbaHistorico clienteId={clienteId} funcionarioId={funcionarioId} onEscolher={setFuncionarioId} onFicha={abrirFicha} />}
          {aba === 'pendencias' && <AbaPendencias clienteId={clienteId} onFicha={abrirFicha} />}
        </div>
      )}
    </div>
  );
}

function Aviso({ texto, testId }: { texto: string; testId?: string }) {
  return (
    <div className="px-3 pt-2">
      <div className="rounded-lg border bg-card px-3 py-2 text-[11px] text-muted-foreground" data-testid={testId}>{texto}</div>
    </div>
  );
}
