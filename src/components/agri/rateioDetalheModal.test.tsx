/**
 * O que este teste trava — as DUAS frases que o modal deriva do payload.
 *
 * ⚠ ELAS SÃO A RAZÃO DE O MODAL EXISTIR, e nenhuma das duas é enfeite. O subtítulo diz os dois
 * números que o operador está comparando (o da linha do painel e o da nota fiscal); a nota do
 * rodapé diz por que, no rateio ADMINISTRATIVO, a soma da lista NÃO fecha com a linha. Sem essa
 * segunda frase o operador soma, acha diferença e conclui que o sistema errou — o pior desfecho
 * possível para uma tela cuja função é auditar.
 *
 * ⚠ TESTE DE RENDER PORQUE NÃO HÁ STORYBOOK: a casa não tem runner de story, e a fatia 1 entrega
 * só o componente — sem isto ela iria para homologação sem nenhuma verificação. O idioma
 * (vitest + testing-library, montagem por helper) é o de `modalNegociarLoteUnidades.test.tsx`.
 *
 * ⚠ OS NÚMEROS SÃO OS DA 25/26 do Proto: 185,00 ha de amendoim e 49,80 de mandioca, que dão
 * 78,8% / 21,2% de peso. Testar com números redondos provaria que a função divide; com estes,
 * prova que ela reparte o que a tela vai mostrar.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  RateioDetalheModal, subtituloDoRateio, notaDoRateio, type RateioDetalhe,
} from '@/components/agri/RateioDetalheModal';

const BASE: RateioDetalhe = {
  pool: 104675.83,
  direto_cultura: 0,
  fatias: [
    { cultura: 'amendoim', area_ha: 185, peso: 78.8, valor: 82484.55, atual: true },
    { cultura: 'mandioca', area_ha: 49.8, peso: 21.2, valor: 22191.28, atual: false },
  ],
  lancamentos: [
    { data: '2026-03-14', descricao: 'Energia da sede', favorecido: 'CPFL', valor: 1200, compartilhado: true },
    { data: '2026-04-02', descricao: 'Contabilidade', favorecido: 'Escritório X', valor: 3400, compartilhado: true },
  ],
};

/**
 * ⚠ O ESPAÇO DEPOIS DE "R$" NÃO É ESPAÇO — é U+00A0, o não-quebrável que o `Intl` insere
 * (medido: `formatMoeda(82484.55)` sai com charCode 160 na terceira posição). Comparar com um
 * espaço comum falha mostrando duas strings IDÊNTICAS na tela, que é o pior tipo de falha de
 * teste: parece bug do runner.
 * ⚠ O `getByText` NÃO SOFRE DISSO porque a testing-library normaliza espaço em branco sozinha —
 * e foi por isso que os casos de render passaram enquanto os de string pura falhavam. As duas
 * metades deste arquivo mediam a mesma coisa e discordavam.
 */
const txt = (t: string) => t.replace(/\u00A0/g, ' ');

function montar(dados: RateioDetalhe, tipo: 'natureza' | 'investimento' | 'admin') {
  render(
    <RateioDetalheModal aberto onFechar={vi.fn()} titulo="Administração · Amendoim · Safra 25/26"
      dados={dados} tipo={tipo} />,
  );
}

/**
 * ⚠ AS DUAS FRASES SE TESTAM COMO FUNÇÃO, NÃO PELA TELA, e foi a tela que me obrigou a isso: o
 * Radix não monta os FILHOS da aba inativa, então a nota do rodapé não existe no DOM enquanto o
 * modal abre no "Rateio" — e ativar a aba por `fireEvent.click` não funciona (o trigger do Radix
 * responde a pointer events que o jsdom não sintetiza, e a casa não tem `user-event`).
 * ⚠ BRIGAR COM ISSO SERIA CONTORNAR O TESTE. O que as duas frases são, de fato, é REGRA PURA
 * sobre o payload — e regra pura se testa chamando a função. O que sobrou de render aqui é só o
 * que a aba ABERTA mostra: o subtítulo do cabeçalho e a grade do rateio.
 */
describe('subtituloDoRateio — os dois números que se comparam', () => {
  it('sem parcela direta, diz a fatia da cultura e o pool', () => {
    const t = txt(subtituloDoRateio(BASE));
    expect(t).toContain('R$ 82.484,55 nesta cultura');
    expect(t).toContain('R$ 104.675,83 no total');
  });

  /* ⚠ COM PARCELA DIRETA O SUBTÍTULO ABRE A CONTA. Um número só, somando direto + rateado,
     mandaria o operador procurar uma nota fiscal de um valor que nunca foi lançado. */
  it('com parcela direta, abre direto + compartilhado', () => {
    const t = txt(subtituloDoRateio({ ...BASE, direto_cultura: 10000 }));
    expect(t).toContain('R$ 92.484,55 nesta cultura');
    expect(t).toContain('R$ 10.000,00 direto + R$ 82.484,55 do compartilhado');
  });

  it('recorte sem cultura marcada nao vira NaN', () => {
    const t = txt(subtituloDoRateio({ ...BASE, fatias: [] }));
    expect(t).toContain('R$ 0,00 nesta cultura');
  });
});

describe('notaDoRateio — o que muda entre os tipos', () => {
  it('natureza: a lista soma a linha, e a nota diz qual valor entra', () => {
    expect(txt(notaDoRateio(BASE, 'natureza')))
      .toBe('A fração desta cultura (78,8% por área) é R$ 82.484,55 '
        + '— é esse valor que entra na linha do painel.');
  });

  it('investimento usa a mesma frase da natureza', () => {
    expect(notaDoRateio(BASE, 'investimento')).toBe(notaDoRateio(BASE, 'natureza'));
  });

  /* ⚠ O ADMIN É OUTRO FATO: a lista traz o custo inteiro do período e o pool já vem multiplicado
     pelo percentual da atividade. A nota tem de dizer que a soma NÃO fecha, senão a divergência
     parece defeito. */
  it('admin: avisa que a lista não soma a linha, e nomeia os dois passos', () => {
    const t = txt(notaDoRateio(BASE, 'admin', 34.5));
    expect(t).toContain('34,5% (agricultura) × 78,8% (área) = R$ 82.484,55');
    expect(t).toContain('não soma o valor da linha');
  });

  /* ⚠ SEM O PERCENTUAL DA ATIVIDADE a nota continua correta — ela só deixa de nomear o primeiro
     passo. O percentual não vem no payload da RPC, e inventar um número seria pior que omiti-lo. */
  it('admin sem o percentual da atividade: explica sem inventar o número', () => {
    const t = txt(notaDoRateio(BASE, 'admin'));
    expect(t).toContain('não soma o valor da linha');
    expect(t).not.toContain('(agricultura) ×');
    expect(t).toContain('78,8% (área)');
  });
});

describe('o que a aba aberta mostra', () => {
  it('o subtítulo derivado vai para o cabeçalho', () => {
    montar(BASE, 'natureza');
    expect(screen.getByText(/R\$ 82\.484,55 nesta cultura/)).toBeTruthy();
  });

  /* ⚠ O TOTAL EM 100% É A PROVA de que nenhuma cultura ficou de fora da repartição. */
  it('a grade fecha em 100% e na soma das áreas', () => {
    montar(BASE, 'natureza');
    expect(screen.getByText('100,0%')).toBeTruthy();
    expect(screen.getByText('234,80')).toBeTruthy();
  });

  it('a contagem de lançamentos aparece no rótulo da aba', () => {
    montar(BASE, 'natureza');
    expect(screen.getByText(/Lançamentos · 2/)).toBeTruthy();
  });
});
