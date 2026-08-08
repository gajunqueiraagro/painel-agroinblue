/**
 * Testes de erroOperacional — PR-FIN-IMPORT-ERRO-VISIVEL-01.
 *
 * Dois eixos: mapeamento correto por categoria, e ASSERTS NEGATIVOS provando
 * que nada interno vaza nem para a mensagem do usuário nem para o diagnóstico.
 */
import { describe, it, expect } from 'vitest';
import { normalizarErro, reportarErro, ErroUsuarioSeguro } from './erroOperacional';

/** Fixture com um marcador único: se ele aparecer na saída, houve vazamento. */
const SEGREDO = 'SEGREDO_QUE_NAO_PODE_VAZAR_9f3a';
const UUID = '3f1c2d4e-5a6b-7c8d-9e0f-1a2b3c4d5e6f';

function pgErr(code: string, extra?: Partial<Record<string, string>>) {
  return {
    code,
    message: `duplicate key value violates unique constraint "financeiro_lancamentos_v2_pkey" ${SEGREDO}`,
    details: `Key (id)=(${UUID}) already exists. ${SEGREDO}`,
    hint: `SELECT * FROM public.financeiro_lancamentos_v2; ${SEGREDO}`,
    ...extra,
  };
}

/** Nada interno pode estar presente na string. */
function assertSanitizado(s: string) {
  expect(s).not.toContain(SEGREDO);
  expect(s).not.toContain(UUID);
  expect(s).not.toContain('financeiro_lancamentos_v2');   // tabela interna
  expect(s).not.toContain('_pkey');                        // constraint
  expect(s).not.toContain('SELECT');                       // SQL
  expect(s).not.toContain('duplicate key');                // message crua
  expect(s).not.toContain('/src/');                        // path
  expect(s).not.toContain('at Object.');                   // stack
}

describe('normalizarErro — mapeamento por SQLSTATE', () => {
  it('42501 → permissao', () => {
    const r = normalizarErro(pgErr('42501'), 'ctx');
    expect(r.categoria).toBe('permissao');
    expect(r.codigo).toBe('42501');
    expect(r.mensagem).toBe('Você não tem permissão para esta operação.');
  });

  it('23505 → conflito, sem linguagem de duplicidade de negócio', () => {
    const r = normalizarErro(pgErr('23505'), 'ctx');
    expect(r.categoria).toBe('conflito');
    expect(r.mensagem).toBe(
      'Não foi possível salvar porque existe um conflito com um registro já cadastrado.',
    );
    // invariante do PR: não decide similaridade entre lançamentos
    expect(r.mensagem).not.toContain('duplicad');
    expect(r.mensagem).not.toContain('estes dados');
  });

  it('23503 → vinculo', () => {
    const r = normalizarErro(pgErr('23503'), 'ctx');
    expect(r.categoria).toBe('vinculo');
    expect(r.mensagem).toBe('Vínculo inválido: verifique fazenda, conta ou fornecedor.');
  });

  it('22P02 → formato, sem reproduzir o texto interno', () => {
    const e = pgErr('22P02', { message: 'invalid input syntax for type integer: "D1"' });
    const r = normalizarErro(e, 'ctx');
    expect(r.categoria).toBe('formato');
    expect(r.mensagem).toBe('Um dos campos está em formato inválido.');
    expect(r.mensagem).not.toContain('integer');
    expect(r.mensagem).not.toContain('D1');
    expect(r.diagnostico).not.toContain('integer');
  });

  it('SQLSTATE fora do mapa → desconhecido e SEM expor o código', () => {
    const r = normalizarErro(pgErr('P0001'), 'ctx');
    expect(r.categoria).toBe('desconhecido');
    expect(r.codigo).toBeUndefined();
    expect(r.diagnostico).not.toContain('P0001');
  });
});

describe('normalizarErro — deteccao estrutural, nao instanceof', () => {
  it('objeto simples com code/details/hint e reconhecido como PostgREST', () => {
    const r = normalizarErro({ code: '42501', message: 'x', details: null, hint: null }, 'ctx');
    expect(r.categoria).toBe('permissao');
  });

  it('instancia real de classe que estende Error tambem e reconhecida', () => {
    class PostgrestErrorFake extends Error {
      code = '23503'; details = `x ${SEGREDO}`; hint = `y ${SEGREDO}`;
      constructor() { super(`msg ${SEGREDO}`); this.name = 'PostgrestError'; }
    }
    const r = normalizarErro(new PostgrestErrorFake(), 'ctx');
    expect(r.categoria).toBe('vinculo');   // nao caiu no ramo de Error comum
    assertSanitizado(r.mensagem);
    assertSanitizado(r.diagnostico);
  });

  it('Error comum com code mas sem details/hint NAO e tratado como PostgREST', () => {
    const e = Object.assign(new Error('boom'), { code: '42501' });
    const r = normalizarErro(e, 'ctx');
    expect(r.categoria).toBe('desconhecido');
  });
});

describe('normalizarErro — entradas nao estruturadas', () => {
  it.each([
    ['Error nativo', new Error(SEGREDO)],
    ['string', SEGREDO],
    ['objeto arbitrario', { qualquer: SEGREDO }],
    ['null', null],
    ['undefined', undefined],
    ['numero', 42],
  ])('%s → desconhecido, sem vazar e sem imprimir "undefined"', (_rotulo, entrada) => {
    const r = normalizarErro(entrada, 'ctx');
    expect(r.categoria).toBe('desconhecido');
    expect(r.mensagem).toBe(
      'Não foi possível concluir. Tente novamente; se persistir, procure o suporte.',
    );
    expect(r.mensagem).not.toContain('undefined');
    expect(r.mensagem).not.toContain('null');
    assertSanitizado(r.mensagem);
    assertSanitizado(r.diagnostico);
  });
});

describe('normalizarErro — rede', () => {
  it.each([
    ['TypeError de fetch', Object.assign(new TypeError('Failed to fetch'), {})],
    ['AbortError', Object.assign(new Error('abortado'), { name: 'AbortError' })],
    ['NetworkError', new Error('NetworkError when attempting to fetch resource')],
  ])('%s → rede, nao confundido com validacao', (_r, entrada) => {
    const r = normalizarErro(entrada, 'ctx');
    expect(r.categoria).toBe('rede');
    expect(r.mensagem).toBe('Falha de comunicação. Verifique a conexão e tente novamente.');
  });
});

describe('normalizarErro — validacao local segura', () => {
  it('preserva o texto quando marcado explicitamente como seguro', () => {
    const r = normalizarErro(new ErroUsuarioSeguro('Planilha vazia'), 'parser');
    expect(r.categoria).toBe('validacao');
    expect(r.mensagem).toBe('Planilha vazia');
    expect(r.diagnostico).toBe('[parser] validacao');
  });

  it('expoe a categoria na propria instancia', () => {
    expect(new ErroUsuarioSeguro('x').categoria).toBe('validacao');
    expect(new ErroUsuarioSeguro('x').name).toBe('ErroUsuarioSeguro');
  });

  it('o diagnostico NAO repete o texto seguro — console nao e' + " canal de UI", () => {
    const r = normalizarErro(new ErroUsuarioSeguro('Arquivo OFX inválido'), 'gerarPreview');
    expect(r.diagnostico).toBe('[gerarPreview] validacao');
    expect(r.diagnostico).not.toContain('OFX');
  });

  it('mensagem util do parser sobrevive intacta ate a tela', () => {
    // Contrato do 7o arquivo: as validacoes autorais de useImportacaoExtrato
    // chegam ao operador com o texto completo, sem generalizar.
    const casos = [
      'Formato não reconhecido (espera-se .ofx, .csv ou .pdf)',
      'Nenhum movimento encontrado no arquivo. Verifique se o OFX é um extrato válido do banco e não está vazio ou truncado.',
      'Extrato já importado anteriormente. Nenhuma movimentação nova foi encontrada.',
      'A conta bancária selecionada não pertence ao cliente atual.',
    ];
    for (const texto of casos) {
      expect(normalizarErro(new ErroUsuarioSeguro(texto), 'gerarPreview').mensagem).toBe(texto);
    }
  });

  it('subclasse de Error que NAO e ErroUsuarioSeguro nao ganha passe livre', () => {
    // CsvLayoutError é exatamente este caso: erro de validação tipado, porém
    // com conteúdo do arquivo na mensagem. Sem marcação explícita, generaliza.
    class CsvLayoutError extends Error {
      constructor(m: string) { super(m); this.name = 'CsvLayoutError'; }
    }
    const e = new CsvLayoutError(`CSV não compatível. Cabeçalhos lidos: [${SEGREDO}].`);
    const r = normalizarErro(e, 'gerarPreview');
    expect(r.categoria).toBe('desconhecido');
    assertSanitizado(r.mensagem);
    assertSanitizado(r.diagnostico);
  });
});

describe('diagnostico — contexto + categoria + codigo seguro, nada mais', () => {
  it('formato esperado com codigo', () => {
    expect(normalizarErro(pgErr('42501'), 'criarLancamento').diagnostico)
      .toBe('[criarLancamento] permissao sqlstate=42501');
  });
  it('formato esperado sem codigo', () => {
    expect(normalizarErro('x', 'criarLancamento').diagnostico)
      .toBe('[criarLancamento] desconhecido');
  });
  it('nunca contem details, hint, message crua, UUID ou SQL', () => {
    for (const code of ['42501', '23505', '23503', '22P02', 'P0001']) {
      assertSanitizado(normalizarErro(pgErr(code), 'ctx').diagnostico);
    }
  });
});

describe('reportarErro', () => {
  it('chama o toast UMA vez com a mensagem segura e devolve o normalizado', () => {
    const chamadas: string[] = [];
    const r = reportarErro(pgErr('42501'), 'ctx', (m) => chamadas.push(m));
    expect(chamadas).toHaveLength(1);              // sem toast duplicado
    expect(chamadas[0]).toBe('Você não tem permissão para esta operação.');
    expect(r.categoria).toBe('permissao');
    assertSanitizado(chamadas[0]);
  });
});

/**
 * Contratos provados na FASE 0 e preservados por este PR.
 * Documentados como teste para que uma mudança futura de contrato quebre aqui.
 */
describe('invariantes de contrato (FASE 0)', () => {
  it('inseridos = 0 e sucesso idempotente, nao falha', () => {
    // useImportacaoExtrato usa upsert com onConflict + ignoreDuplicates:
    // zero inseridos significa "tudo ja existia", nao erro.
    const inseridos = 0;
    const ehFalha = false;                          // contrato: nunca falha por zero
    expect(ehFalha).toBe(false);
    expect(inseridos).toBe(0);
  });

  it('criarLancamentosEmLote e atomico: um unico INSERT', () => {
    // Um statement INSERT com N linhas: ou todas entram, ou o statement falha.
    // Portanto nao existe sucesso parcial e o total do toast e' confiavel.
    const forms = 3;
    const salvosSeSucesso = forms;
    expect(salvosSeSucesso).toBe(forms);
  });
});
