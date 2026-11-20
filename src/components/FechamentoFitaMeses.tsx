import { SeletorPeriodo, type SeletorPeriodoProps, type TomDoMes } from '@/v2/components/SeletorPeriodo';
import { mesUnico } from '@/v2/lib/periodo';

/**
 * A FITA ANO + DOZE MESES do Fechamento Área — FECH-GLOBAL-RESUMO-01 (12/10/2026).
 *
 * ⚠ CÓDIGO MOVIDO VERBATIM de `FechamentoTab.tsx` (o bloco do FECH-AREA-ANO-01), para a tela por fazenda e o resumo Global usarem
 *   a MESMA fita: nenhuma classe, cor ou largura mudou. Os nomes das props são os das variáveis de lá, de propósito.
 * ⚠ A FITA NÃO SE MEXE — regra A23: o ano tem largura FIXA.
 * ⚠ UI-MESES-PADRAO-01 (Gabriel 18/11): a fita do Fechamento virou o `SeletorPeriodo` da casa (UM componente para todas as telas):
 *   os mesmos props daqui, o mesmo estado (fechado = ponto verde, rascunho = ponto âmbar, vazio = sem ponto, futuro = contorno).
 *   O espelho do outro lado saiu: a linha agora é um bloco só (ano + barra), centrado por `mx-auto`, e não há o que equilibrar.
 */
export type StatusDoMesNaFita = 'fechado' | 'rascunho' | 'vazio';

export interface FechamentoFitaMesesProps {
  anoFiltro: string;
  setAnoFiltro: (ano: string) => void;
  anosDisp: string[];
  mesFiltro: number;
  setMesFiltro: (mes: number) => void;
  statusPorMes: Partial<Record<number, StatusDoMesNaFita>>;
  /** FECH-TOPO-02 (Gabriel 07/11 17:52) — o Fechamento área: o ano colado à esquerda dos meses e os meses ocupando a largura de quem
   *  hospeda (a da tabela de conferência), sem o espelho. Sem a prop: como sempre (fita centrada, com o espelho). */
  alinhadaAEsquerda?: boolean;
}

export function FechamentoFitaMeses({ anoFiltro, setAnoFiltro, anosDisp, mesFiltro, setMesFiltro, statusPorMes, alinhadaAEsquerda }: FechamentoFitaMesesProps) {
  /* o estado do mês (revisão do Gabriel 11:28: "o ponto de cada mês"): fechado = ok; rascunho = pend; mês JÁ PASSADO (ou o corrente)
     sem fechamento = pend "Não fechado" — o mesmo "pendente" que o Fechamento mostra; mês futuro fica sem estado (o contorno). */
  const hoje = new Date();
  const ano = Number(anoFiltro);
  const jaChegou = (m: number) => ano < hoje.getFullYear() || (ano === hoje.getFullYear() && m <= hoje.getMonth() + 1);
  const tomPorMes: Record<number, TomDoMes> = {};
  for (let m = 1; m <= 12; m++) {
    const st = statusPorMes[m];
    if (st === 'fechado') tomPorMes[m] = { estado: 'ok', title: 'Fechado' };
    else if (st === 'rascunho') tomPorMes[m] = { estado: 'pend', title: 'Rascunho' };
    else if (jaChegou(m)) tomPorMes[m] = { estado: 'pend', title: 'Não fechado' };
  }
  return (
    <div className={alinhadaAEsquerda ? 'min-w-0 flex-1' : 'mx-auto w-full'} data-testid="fita-dos-meses">
      <SeletorPeriodo
        modo="ano-mes"
        modoUnico
        anos={anosDisp}
        periodo={mesUnico(Number(anoFiltro), mesFiltro)}
        onPeriodoChange={(p) => {
          if (String(p.de.ano) !== anoFiltro) setAnoFiltro(String(p.de.ano));
          if (p.de.mes !== mesFiltro) setMesFiltro(p.de.mes);
        }}
        tomPorMes={tomPorMes}
        /* a legenda só onde há largura: ao lado da tabela de 530px do Fechamento área ela empurraria os meses */
        legenda={alinhadaAEsquerda ? undefined : LEGENDA_DO_FECHAMENTO}
      />
    </div>
  );
}

const LEGENDA_DO_FECHAMENTO: NonNullable<SeletorPeriodoProps['legenda']> = [
  { estado: 'ok', rotulo: 'Fechado' },
  { estado: 'pend', rotulo: 'Pendente' },
  { estado: 'fut', rotulo: 'Futuro' },
];
