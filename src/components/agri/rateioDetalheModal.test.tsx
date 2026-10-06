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
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ModalValorDre, valorDaLavoura, valorDaPecuaria, ratearNoAlvo, COLUNAS_VALOR_DRE,
  subtituloDoRateio, notaDoRateio, type RateioDetalhe, type ValorDre, type LinhaValorDre,
} from '@/components/agri/RateioDetalheModal';
import { ordenarPorColuna } from '@/hooks/useOrdenacaoTabela';
import type { LancamentoPec, RateioAdmPec, RecortePec, DrePecuaria, DrePecLinhas } from '@/hooks/useDrePecuaria';

const BASE: RateioDetalhe = {
  pool: 104675.83,
  direto_cultura: 0,
  fatias: [
    { cultura: 'amendoim', area_ha: 185, peso: 78.8, valor: 82484.55, atual: true },
    { cultura: 'mandioca', area_ha: 49.8, peso: 21.2, valor: 22191.28, atual: false },
  ],
  /* ⚠ DOIS COMPARTILHADOS E UM DIRETO, desde o PR-03: a lista deixou de ser um rolo só e virou
     duas abas separadas por `compartilhado`, então o fixture precisa ter os dois lados para
     provar que cada uma pega o seu. O `id` também entrou — é por ele que a linha abre o
     lançamento, e ele sempre veio da RPC. */
  lancamentos: [
    { id: 'l1', data: '2026-03-14', descricao: 'Energia da sede', favorecido: 'CPFL', valor: 1200, compartilhado: true },
    { id: 'l2', data: '2026-04-02', descricao: 'Contabilidade', favorecido: 'Escritório X', valor: 3400, compartilhado: true },
    { id: 'l3', data: '2026-04-09', descricao: 'Semente de amendoim', favorecido: 'Coop', valor: 10000, compartilhado: false },
  ],
  /* ⚠ `null` NO BASE porque o base é um recorte de NATUREZA: o percentual da atividade só existe
     no ramo admin, e os casos de admin abaixo o sobrescrevem. */
  pct_agricultura: null,
  /* ⚠ SEM fatias_atividade: natureza e investimento não têm primeiro passo, e o modal não deve
     desenhar um donut de etapa que não existe. */
  fatias_atividade: null,
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

/** O modal de valor da lavoura sobre um payload — a mesma chamada da tela. */
function montar(
  dados: RateioDetalhe, tipo: 'natureza' | 'investimento' | 'admin', rateioDentro?: boolean,
  pool?: boolean,
) {
  render(
    <ModalValorDre aberto onFechar={vi.fn()}
      valor={valorDaLavoura(dados, tipo, { rotulo: 'Administração', cultura: 'amendoim', safra: '25/26', area: 185, pool: !!pool })}
      comRateioInicial={tipo === 'admin' || !!pool || !!rateioDentro} />,
  );
}

/**
 * Um recorte administrativo: percentual efetivo + o primeiro passo do rateio.
 *
 * ⚠ OS TRÊS VALORES SÃO OS DO CADASTRO REAL — 70/25/5 de 2024 em diante —, e somam o bruto do
 * período. É a soma que o donut do passo 1 mostra no centro.
 */
const ADMIN = (pct: number | null): RateioDetalhe => ({
  ...BASE,
  pct_agricultura: pct,
  fatias_atividade: [
    { atividade: 'pecuaria', valor: 678290.68 },
    { atividade: 'agricultura', valor: 242246.67 },
    { atividade: 'silvicultura', valor: 48449.34 },
  ],
});

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
  /* ⚠ O SUBTÍTULO PASSOU A DIZER DE ONDE A FATIA SAIU (PR-03): antes ele dava a fatia e o pool
     como dois fatos soltos, e o operador tinha de descobrir sozinho que um é percentual do
     outro. Agora a frase é a conta. */
  it('sem parcela direta, diz a fatia como percentual do pool', () => {
    const t = txt(subtituloDoRateio(BASE, 'natureza'));
    expect(t).toContain('R$ 82.484,55 nesta cultura');
    expect(t).toContain('78,8% de R$ 104.675,83 por área');
    expect(t).toContain('sem custo direto neste centro');
  });

  /* ⚠ COM PARCELA DIRETA O SUBTÍTULO ABRE A CONTA INTEIRA. Um número só, somando direto +
     rateado, mandaria o operador procurar uma nota fiscal de um valor que nunca foi lançado. */
  it('com parcela direta, escreve total = direto + rateio (pct do pool)', () => {
    const t = txt(subtituloDoRateio({ ...BASE, direto_cultura: 10000 }, 'natureza'));
    expect(t).toContain('R$ 92.484,55 nesta cultura = R$ 10.000,00 direto');
    expect(t).toContain('R$ 82.484,55 do rateio (78,8% de R$ 104.675,83 por área)');
  });

  /* ⚠ O ADMIN DIZ A CADEIA, não um número só: é a conta que o operador refaz no papel, e o
     subtítulo a escreve na ordem em que ele a faz. */
  it('no admin, o subtítulo escreve os dois passos em sequência', () => {
    const t = txt(subtituloDoRateio(ADMIN(25), 'admin'));
    expect(t).toContain('R$ 82.484,55 nesta cultura');
    expect(t).toContain('rateio em dois passos');
    /* O bruto é a SOMA das fatias de atividade, nunca um total assumido. */
    expect(t).toContain('R$ 968.986,69 de admin');
    expect(t).toContain('25,0% agricultura');
    expect(t).toContain('78,8% área');
  });

  it('recorte sem cultura marcada nao vira NaN', () => {
    const t = txt(subtituloDoRateio({ ...BASE, fatias: [] }, 'natureza'));
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
  it('admin: avisa que a lista fecha com o donut 1, não com a linha', () => {
    const t = txt(notaDoRateio(ADMIN(34.5), 'admin'));
    expect(t).toContain('34,5% (agricultura) × 78,8% (área) = R$ 82.484,55');
    expect(t).toContain('fecha com o primeiro donut, não com a linha do painel');
  });

  /* ⚠ SEM O PERCENTUAL a nota continua correta — ela só deixa de nomear o primeiro passo. A RPC
     devolve `null` quando o bruto administrativo do período é zero, e inventar um número ali
     seria pior que omiti-lo. */
  it('admin sem o percentual da atividade: explica sem inventar o número', () => {
    const t = txt(notaDoRateio(ADMIN(null), 'admin'));
    expect(t).toContain('fecha com o primeiro donut');
    expect(t).not.toContain('(agricultura) ×');
    expect(t).toContain('78,8% (área)');
  });
});

/* ══════════════ O MODAL DE VALOR — DRE-MODAL-VALOR-01b ══════════════ */

const soma = (ls: readonly { valor: number }[]) => Math.round(ls.reduce((a, l) => a + l.valor, 0) * 100) / 100;

describe('ratearNoAlvo — a soma é o alvo, ao centavo', () => {
  it('três terços de 100 fecham em 100,00, com o resíduo na maior linha', () => {
    const r = ratearNoAlvo([1, 1, 1.0001], 100);
    expect(Math.round(r.reduce((a, x) => a + x, 0) * 100)).toBe(10000);
    expect(r[2]).toBe(33.34);
  });
  it('peso total zero não inventa proporção', () => {
    expect(ratearNoAlvo([0, 0], 50)).toEqual([0, 0]);
  });
});

describe('lavoura: a soma das linhas é a célula', () => {
  it('com rateio: direto + o pool repartido pela fatia = direto + fatia, com o selo nas linhas do pool', () => {
    const v = valorDaLavoura({ ...BASE, direto_cultura: 10000 }, 'natureza',
      { rotulo: 'Administração', cultura: 'amendoim', safra: '25/26', area: 185, pool: false });
    expect(soma(v.linhas)).toBe(92484.55);
    expect(soma(v.linhas.filter(l => l.rateioPct == null))).toBe(10000);
    expect(v.linhas.filter(l => l.rateioPct != null)).toHaveLength(2);
    expect(v.porUnidade(92484.55)).toBe('R$ 499,92/ha');
  });

  it('modo "Custos diretos": o cabeçalho ecoa o direto, a lista é só a direta e o rodapé fecha nele', () => {
    montar({ ...BASE, direto_cultura: 10000 }, 'natureza', false);
    expect(txt(screen.getByRole('heading').textContent ?? '')).toContain('R$ 10.000,00');
    expect(screen.queryByText(/rateio 78,8%/)).toBeNull();
    expect(screen.getByText('1 lançamento')).toBeTruthy();
  });

  it('com rateio: o total no topo e "N lançamentos · M de rateio"', () => {
    montar({ ...BASE, direto_cultura: 10000 }, 'natureza', true);
    expect(txt(screen.getByRole('heading').textContent ?? '')).toContain('R$ 92.484,55');
    expect(screen.getByText('3 lançamentos · 2 de rateio')).toBeTruthy();
    /* o segmentado do modal troca a leitura sem fechar */
    fireEvent.click(screen.getByRole('button', { name: 'Direto da cultura' }));
    expect(txt(screen.getByRole('heading').textContent ?? '')).toContain('R$ 10.000,00');
  });

  it('o pool não tem parte direta: "—" no cartão e o segmentado travado', () => {
    montar(BASE, 'natureza', false, true);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Direto da cultura' }).hasAttribute('disabled')).toBe(true);
    expect(txt(screen.getByRole('heading').textContent ?? '')).toContain('R$ 82.484,55');
  });

  it('sem pool: rateio "—", aba Rateio desligada', () => {
    montar({ ...BASE, pool: 0, direto_cultura: 23737.56,
      fatias: [{ cultura: 'mandioca', area_ha: 49.8, peso: 100, valor: 0, atual: true }],
      lancamentos: [{ id: 'x', data: '2026-02-01', descricao: 'Frete', favorecido: 'Transp', valor: 23737.56, compartilhado: false }],
    }, 'natureza');
    expect(screen.getByRole('button', { name: 'Rateio' }).hasAttribute('disabled')).toBe(true);
  });

  it('a aba Rateio: pool → culturas, a aberta em destaque e as fatias fechando no pool', () => {
    montar(BASE, 'natureza', true);
    fireEvent.click(screen.getByRole('button', { name: 'Rateio' }));
    expect(screen.getByText('Custo compartilhado a ratear')).toBeTruthy();
    expect(screen.getByText('185,00 ha')).toBeTruthy();
    expect(screen.getByText('82.484,55')).toBeTruthy();
    expect(screen.getByText('22.191,28')).toBeTruthy();
  });

  it('admin: tudo é rateio, repartido até a fatia, com o selo "rateio adm."', () => {
    const d = { ...ADMIN(25), lancamentos: BASE.lancamentos.map(l => ({ ...l, parte: l.valor * 0.25 })) };
    const v = valorDaLavoura(d, 'admin', { rotulo: 'Administrativo', cultura: 'amendoim', safra: null, area: 185, pool: false });
    expect(v.direto).toBeNull();
    expect(soma(v.linhas)).toBe(82484.55);
    expect(v.seloRateio).toBe('rateio adm.');
  });
});

/* ── pecuária ── */
const lp = (o: Partial<LancamentoPec>): LancamentoPec => ({
  origem: 'lancamento', id: 'x', data: '2026-01-05', pagamento: '2026-01-05', descricao: 'd', favorecido: 'f',
  valor: 0, status: 'realizado', fazenda: 'Retiro', fazenda_id: 'f1', centro: 'Mão de Obra', subcentro: null,
  bloco: 'fixo', documento: null, ...o,
});
const RATEIO_PEC: RateioAdmPec = {
  grupos: [{ grupo: 'Mão de Obra', bruto: 1000, parte: 700 }, { grupo: 'Financeiro', bruto: 100, parte: 70 }],
  lancamentos: [
    { id: 'a1', data: '2026-01-05', pagamento: '2026-01-05', descricao: 'Folha escritório', favorecido: 'Folha', fazenda: 'Administrativo',
      status: 'realizado', valor: 600, grupo: 'Mão de Obra', pct: 70, parte: 420, origem: 'lancamento' },
    { id: 'a2', data: '2026-02-05', pagamento: null, descricao: 'Folha escritório fev', favorecido: 'Folha', fazenda: 'Administrativo',
      status: 'programado', valor: 400, grupo: 'Mão de Obra', pct: 70, parte: 280, origem: 'lancamento' },
    { id: 'a3', data: '2026-02-05', pagamento: null, descricao: 'IOF', favorecido: 'Banco', fazenda: 'Administrativo',
      status: 'realizado', valor: 100, grupo: 'Financeiro', pct: 70, parte: 70, origem: 'lancamento' },
  ],
};
const linhasPec = (o: Partial<DrePecLinhas>): DrePecLinhas => ({
  vendas: 0, outras_receitas: 0, receita_bruta: 0, deducoes: 0, receita_liquida: 0, vpb_operacional: 0, reposicao: 0,
  vbp: 0, custo_variavel: 0, margem: 0, custo_fixo: 0, rateio_adm: 0, resultado_operacional: 0, juros: null,
  resultado_periodo: 0, efeito_mercado: 0, resultado_com_mercado: 0, investimento: 0, a_pagar: 0,
  lucro_liquido: 0, juros_proprio: 0, juros_rateado: 0,
  patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0, cab_media: 0 },
  producao: { ha_medio: null, at_produzida: null, at_desfrutada: null, cab_desfrutada: null, at_comprada: null, cab_comprada: null },
  p0_fonte: 'fechamento', p1_fonte: 'fechamento', centros: [], centros_juros: [], ...o,
});
const DRE_PEC: DrePecuaria = {
  periodo: { de: '2025-07', ate: '2026-06', p0: '2025-06', meses: 12 },
  rateio_adm: { pool: 770, bruto: 1100, criterio: 'cabecas medias no periodo' },
  fazendas: [
    { fazenda_id: 'f1', nome: 'Retiro', linhas: linhasPec({ rateio_adm: 500.5,
      patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0, cab_media: 3900 },
      rateio_adm_grupos: [{ grupo: 'Mão de Obra', valor: 455 }, { grupo: 'Financeiro', valor: 45.5 }] }) },
    { fazenda_id: 'f2', nome: 'Sta. Luzia', linhas: linhasPec({ rateio_adm: 269.5,
      patrimonio: { v_ini_p0: 0, v_fim_p0: 0, v_fim_p1: 0, cab_ini: 0, cab_fim: 0, cab_media: 2100 },
      rateio_adm_grupos: [{ grupo: 'Mão de Obra', valor: 245 }, { grupo: 'Financeiro', valor: 24.5 }] }) },
  ],
  total: linhasPec({}),
};
const RECORTE_MO: RecortePec = {
  fazendaId: 'f1', fazendaNome: 'Retiro', bloco: 'fixo', centro: 'Mão de Obra', rotulo: 'Mão de Obra',
  de: '2025-07', ate: '2026-06', cenario: 'realizado',
  celula: { direto: 3000, rateio: 455, grupo: 'Mão de Obra', cabMedia: 3900, meses: 12, comRateio: true },
};
const LANC_MO = [lp({ id: 'd1', valor: 1800 }), lp({ id: 'd2', valor: 1200, data: '2026-03-01' })];

describe('pecuária: a soma das linhas é a célula', () => {
  it('direto + o rateio do grupo repartido até a fazenda = o valor da célula, ao centavo', () => {
    const v = valorDaPecuaria({ recorte: RECORTE_MO, lancamentos: LANC_MO, rateio: RATEIO_PEC, dre: DRE_PEC, periodoRotulo: 'Safra 25/26' });
    expect(soma(v.linhas)).toBe(3455);
    /* só o grupo da linha: o IOF (Financeiro) não entra na Mão de Obra */
    expect(v.linhas.filter(l => l.rateioPct != null)).toHaveLength(2);
    expect(soma(v.linhas.filter(l => l.rateioPct != null))).toBe(455);
    /* R$/cab/mês é o `porCabeca` da grade: 3.455 / 3.900 / 12 */
    expect(v.porUnidade(3455)).toBe('R$ 0,07/cab/mês');
    expect(v.contexto).toContain('3.900 cab médias × 12 meses');
  });

  /* DRE-RATEIO-MODAL-01: a pecuária não tem mais ETAPAS — a aba Rateio dela é o encontro de contas do banco
     (`rateioEncontro.test.tsx`). Sem o encontro no payload (fixture antigo), não há o que desenhar. */
  it('a pecuária não monta etapas; sem o encontro do banco, a aba Rateio não tem conteúdo', () => {
    const v = valorDaPecuaria({ recorte: RECORTE_MO, lancamentos: LANC_MO, rateio: RATEIO_PEC, dre: DRE_PEC, periodoRotulo: 'Safra 25/26' });
    expect(v.etapas).toHaveLength(0);
    expect(v.encontro).toBeNull();
  });

  it('só rateio (Financeiro): direto "—", nenhuma lista direta, tudo do grupo', () => {
    const v = valorDaPecuaria({
      recorte: { ...RECORTE_MO, centro: 'Financeiro', rotulo: 'Financeiro', soRateio: true,
        celula: { direto: null, rateio: 45.5, grupo: 'Financeiro', cabMedia: 3900, meses: 12, comRateio: true } },
      lancamentos: LANC_MO, rateio: RATEIO_PEC, dre: DRE_PEC, periodoRotulo: 'Safra 25/26' });
    expect(v.direto).toBeNull();
    expect(soma(v.linhas)).toBe(45.5);
    expect(v.linhas.every(l => l.rateioPct != null)).toBe(true);
  });

  it('bloco sem rateio (variável): rateio "—" e só as linhas diretas', () => {
    const v = valorDaPecuaria({
      recorte: { ...RECORTE_MO, bloco: 'variavel', centro: 'Nutrição',
        celula: { direto: 3000, rateio: null, grupo: 'Nutrição', cabMedia: 3900, meses: 12, comRateio: false } },
      lancamentos: LANC_MO, rateio: RATEIO_PEC, dre: DRE_PEC, periodoRotulo: 'Safra 25/26' });
    expect(v.rateio).toBeNull();
    expect(v.etapas).toHaveLength(0);
    expect(soma(v.linhas)).toBe(3000);
  });

  it('o modal: rodapé "N lançamentos · M de rateio adm." com o total da célula, e o selo na linha', () => {
    render(<ModalValorDre aberto onFechar={vi.fn()} comRateioInicial
      valor={valorDaPecuaria({ recorte: RECORTE_MO, lancamentos: LANC_MO, rateio: RATEIO_PEC, dre: DRE_PEC, periodoRotulo: 'Safra 25/26' })} />);
    expect(screen.getByText('4 lançamentos · 2 de rateio adm.')).toBeTruthy();
    expect(screen.getByText('R$ 3.455,00', { selector: 'b' })).toBeTruthy();
    expect(screen.getAllByText(/rateio adm\. \d/).length).toBe(2);
  });
});

describe('a ordenação da tabela é estável', () => {
  const L = (chave: string, competencia: string, valor: number): LinhaValorDre => ({
    chave, idEditavel: null, competencia, pagamento: null, descricao: chave, favorecido: null, fazenda: null,
    subcentro: null, valor, status: null, rateioPct: null,
  });
  const linhas = [L('a', '2026-01-01', 10), L('b', '2026-01-01', 20), L('c', '2026-02-01', 10), L('d', '2026-01-01', 10)];
  it('empates guardam a ordem de origem, nos dois sentidos e em qualquer coluna', () => {
    const col = (c: string) => COLUNAS_VALOR_DRE.find(x => x.coluna === c);
    expect(ordenarPorColuna(linhas, col('comp'), 'asc').map(l => l.chave)).toEqual(['a', 'b', 'd', 'c']);
    expect(ordenarPorColuna(linhas, col('comp'), 'desc').map(l => l.chave)).toEqual(['c', 'a', 'b', 'd']);
    expect(ordenarPorColuna(linhas, col('valor'), 'asc').map(l => l.chave)).toEqual(['a', 'c', 'd', 'b']);
    /* reordenar duas vezes dá o mesmo — a lista não "pisca" */
    const v1 = ordenarPorColuna(linhas, col('valor'), 'desc').map(l => l.chave);
    expect(ordenarPorColuna(linhas, col('valor'), 'desc').map(l => l.chave)).toEqual(v1);
  });
  /* DRE-MODAL-SUBCENTRO-01: entrou a coluna Subcentro, logo depois da Descricao (de onde sai a largura). */
  it('todas as oito colunas de dado são ordenáveis', () => {
    expect(COLUNAS_VALOR_DRE.map(c => c.coluna)).toEqual(['comp', 'pgto', 'descricao', 'subcentro', 'favorecido', 'fazenda', 'valor', 'status']);
  });
});

/* O tipo `ValorDre` é o contrato das duas atividades — este uso garante que ele segue exportado. */
export type { ValorDre };
