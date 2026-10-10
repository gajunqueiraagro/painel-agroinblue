/**
 * FORN-SELETOR-PADRAO-01 fatia 2c, commit 1a — o cadastro da casa não duplica fornecedor: a REGRA (pura) e quem a consulta.
 * Dados sintéticos.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  conferirCadastro, decidirCadastro, reativarDoCadastro, fraseDoDocumento, fraseDoInativo,
  FRASE_FALHA_AO_CONFERIR, FRASE_FALHA_AO_REATIVAR, FRASE_JA_EXISTE,
  type FonteDoCadastro, type FornecedorDoCadastro,
} from './cadastroDaCasa';
import { normalizeFornecedorNome } from '@/lib/financeiro/normalizeFornecedorNome';

const f = (id: string, nome: string, o: Partial<FornecedorDoCadastro> = {}): FornecedorDoCadastro =>
  ({ id, nome, cpf_cnpj: null, fazenda_id: null, ativo: true, created_at: '2026-01-01T00:00:00Z', ...o });

describe('normalizeFornecedorNome — o espelho do gatilho do banco (unaccent → só letra, número e espaço → um espaço → maiúsculas)', () => {
  it('tira o acento ANTES de tudo: "João" é "JOAO", como no banco — e não "JO O"', () => {
    expect(normalizeFornecedorNome('João da Silva')).toBe('JOAO DA SILVA');
    expect(normalizeFornecedorNome('  agropecuária   são-josé ltda. ')).toBe('AGROPECUARIA SAO JOSE LTDA');
    expect(normalizeFornecedorNome('Açúcar & Cia')).toBe('ACUCAR CIA');
    expect(normalizeFornecedorNome('BANCO DO BRASIL')).toBe('BANCO DO BRASIL');   // sem acento: o de sempre
    expect(normalizeFornecedorNome('---')).toBe('');
  });
});

describe('decidirCadastro — a regra, na ordem', () => {
  it('(2a) já existe ATIVO com o nome (sem acento, sem caixa, espaços e pontuação): não cria, é ele', () => {
    const base = [f('a', 'João Sêmen Ltda.'), f('b', 'Outro')];
    expect(decidirCadastro({ nome: '  joao   semen ltda ' }, base)).toEqual({ tipo: 'ja_existe', fornecedor: base[0] });
    /* e a decisão sabe dizer "criar": nome parecido NÃO é o mesmo nome */
    expect(decidirCadastro({ nome: 'Joao Semen' }, base)).toEqual({ tipo: 'criar' });
  });

  it('(2a) com ativo E inativo do mesmo nome vale o ATIVO; entre dois ativos, o mais antigo (e, sem data, o menor id)', () => {
    const inativo = f('i', 'Alfa', { ativo: false, created_at: '2020-01-01T00:00:00Z' });
    const novo = f('n', 'ALFA', { created_at: '2026-05-01T00:00:00Z' });
    const velho = f('v', 'alfa', { created_at: '2024-05-01T00:00:00Z' });
    expect(decidirCadastro({ nome: 'Alfa' }, [inativo, novo, velho])).toEqual({ tipo: 'ja_existe', fornecedor: velho });
    const semData = [f('z', 'Alfa', { created_at: null }), f('b', 'Alfa', { created_at: null })];
    expect(decidirCadastro({ nome: 'alfa' }, semData)).toMatchObject({ tipo: 'ja_existe', fornecedor: { id: 'b' } });
  });

  it('(2b) existe SÓ inativo com o nome: oferece reativar — nunca cria nem seleciona sozinho', () => {
    const inativo = f('i', 'Beta Boi', { ativo: false });
    expect(decidirCadastro({ nome: 'beta boi' }, [inativo, f('x', 'Outro')])).toEqual({ tipo: 'inativo', fornecedor: inativo });
  });

  it('(3) documento de OUTRO fornecedor ativo, com nome diferente: não cria, mostra o dono — comparando só os dígitos', () => {
    const dono = f('d', 'Dono do Documento', { cpf_cnpj: '11.222.333/0001-44' });
    expect(decidirCadastro({ nome: 'Nome Novo', cpfCnpj: '11222333000144' }, [dono])).toEqual({ tipo: 'documento_de_outro', fornecedor: dono });
    expect(decidirCadastro({ nome: 'Nome Novo', cpfCnpj: '11.222.333/0001-44' }, [dono])).toEqual({ tipo: 'documento_de_outro', fornecedor: dono });
    /* documento de fornecedor INATIVO não segura; documento diferente não segura; sem documento não segura */
    expect(decidirCadastro({ nome: 'Nome Novo', cpfCnpj: '11222333000144' }, [{ ...dono, ativo: false }])).toEqual({ tipo: 'criar' });
    expect(decidirCadastro({ nome: 'Nome Novo', cpfCnpj: '99999999000199' }, [dono])).toEqual({ tipo: 'criar' });
    expect(decidirCadastro({ nome: 'Nome Novo', cpfCnpj: '' }, [f('s', 'Sem Doc', { cpf_cnpj: '' })])).toEqual({ tipo: 'criar' });
    expect(decidirCadastro({ nome: 'Nome Novo' }, [dono])).toEqual({ tipo: 'criar' });
  });

  it('a ordem: o NOME vem antes do documento (ativo de mesmo nome; depois o inativo de mesmo nome; só então o documento)', () => {
    const dono = f('d', 'Dono', { cpf_cnpj: '123.456.789-09' });
    const mesmoNome = f('m', 'Gama');
    expect(decidirCadastro({ nome: 'gama', cpfCnpj: '12345678909' }, [dono, mesmoNome])).toEqual({ tipo: 'ja_existe', fornecedor: mesmoNome });
    const inativo = f('i', 'Gama', { ativo: false });
    expect(decidirCadastro({ nome: 'gama', cpfCnpj: '12345678909' }, [dono, inativo])).toEqual({ tipo: 'inativo', fornecedor: inativo });
  });

  it('(2c) nada disso: cria; nome que normaliza para vazio também (quem recusa nome vazio é o formulário)', () => {
    expect(decidirCadastro({ nome: 'Novo de Verdade', cpfCnpj: '1' }, [f('a', 'Alfa')])).toEqual({ tipo: 'criar' });
    expect(decidirCadastro({ nome: 'Novo' }, [])).toEqual({ tipo: 'criar' });
    expect(decidirCadastro({ nome: '***' }, [f('a', '---')])).toEqual({ tipo: 'criar' });
  });

  it('as frases: a do repetido é a aprovada; inativo e documento dizem o NOME (e o documento formatado)', () => {
    expect(FRASE_JA_EXISTE).toBe('Já existe um fornecedor com este nome. Ele foi selecionado.');
    expect(fraseDoInativo(f('i', 'Beta Boi'))).toBe('Existe um fornecedor inativo com este nome: Beta Boi.');
    expect(fraseDoDocumento(f('d', 'Dono', { cpf_cnpj: '11222333000144' }))).toBe('Este CPF/CNPJ já é de Dono (11.222.333/0001-44).');
  });
});

describe('conferirCadastro / reativarDoCadastro — leem pela fonte, nunca gravam para decidir', () => {
  const fonteCom = (porNome: FornecedorDoCadastro[], ativos: FornecedorDoCadastro[]): FonteDoCadastro & { reativar: ReturnType<typeof vi.fn> } => ({
    lerPorNome: vi.fn(async () => porNome), lerAtivos: vi.fn(async () => ativos), reativar: vi.fn(async () => {}),
  });

  it('pergunta pelo nome JÁ normalizado e pelo cliente; junta os de mesmo nome (com inativos) aos ativos', async () => {
    const inativo = f('i', 'Delta', { ativo: false });
    const fonte = fonteCom([inativo], [f('a', 'Alfa')]);
    expect(await conferirCadastro(fonte, 'cli', { nome: ' délta ' })).toEqual({ tipo: 'inativo', fornecedor: inativo });
    expect(fonte.lerPorNome).toHaveBeenCalledWith('cli', 'DELTA');
    expect(fonte.lerAtivos).toHaveBeenCalledWith('cli');
    expect(fonte.reativar).not.toHaveBeenCalled();
  });

  it('o lido AGORA pelo nome vence o do cache dos ativos: fornecedor inativado há pouco não é tratado como ativo', async () => {
    const noCache = f('x', 'Épsilon');                       // o cache ainda o tem como ativo
    const agora = { ...noCache, ativo: false };
    expect(await conferirCadastro(fonteCom([agora], [noCache]), 'cli', { nome: 'epsilon' })).toEqual({ tipo: 'inativo', fornecedor: agora });
  });

  it('falha de leitura vira frase — e NUNCA vira "pode criar"', async () => {
    const fonte: FonteDoCadastro = { lerPorNome: async () => { throw new Error('rede'); }, lerAtivos: async () => [], reativar: async () => {} };
    expect(await conferirCadastro(fonte, 'cli', { nome: 'x' })).toEqual({ tipo: 'erro', frase: FRASE_FALHA_AO_CONFERIR });
    const fonte2: FonteDoCadastro = { lerPorNome: async () => [], lerAtivos: async () => { throw new Error('rede'); }, reativar: async () => {} };
    expect(await conferirCadastro(fonte2, 'cli', { nome: 'x' })).toEqual({ tipo: 'erro', frase: FRASE_FALHA_AO_CONFERIR });
  });

  it('reativar: pela fonte, com o cliente; devolve o fornecedor ATIVO; falha vira frase', async () => {
    const inativo = f('i', 'Zeta', { ativo: false });
    const fonte = fonteCom([], []);
    expect(await reativarDoCadastro(fonte, 'cli', inativo)).toEqual({ ok: true, fornecedor: { ...inativo, ativo: true } });
    expect(fonte.reativar).toHaveBeenCalledWith('cli', 'i');
    const falha: FonteDoCadastro = { ...fonte, reativar: async () => { throw new Error('rls'); } };
    expect(await reativarDoCadastro(falha, 'cli', inativo)).toEqual({ ok: false, frase: FRASE_FALHA_AO_REATIVAR });
  });
});

describe('fonte — a regra mora num lugar só, e todo "+" passa por ela', () => {
  const RAIZ = resolve(process.cwd(), 'src');
  const ler = (c: string) => readFileSync(resolve(process.cwd(), c), 'utf8');
  function arquivos(dir: string, achados: string[] = []): string[] {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) { arquivos(caminho, achados); continue; }
      if (/\.tsx$/.test(nome) && !/\.test\.tsx$/.test(nome)) achados.push(caminho);
    }
    return achados;
  }
  /** cada uso do diálogo: do `<NovoFornecedorDialog` até o `/>` que o fecha */
  const usos = (fonte: string): string[] => fonte.match(/<NovoFornecedorDialog\b[\s\S]*?\n\s*\/>/g) ?? [];

  it('AUTO-TESTE: o leitor de usos acha o uso e vê quando falta `clienteId` ou `onSelecionar`', () => {
    const bom = '<NovoFornecedorDialog\n  open={a}\n  clienteId={c}\n  onSelecionar={(f) => x(f)}\n  onSave={async () => {}}\n/>';
    const ruim = '<NovoFornecedorDialog\n  open={a}\n  onSave={async () => {}}\n/>';
    expect(usos(bom + '\n' + ruim)).toHaveLength(2);
    const completo = (u: string) => /\bclienteId=\{/.test(u) && /\bonSelecionar=\{/.test(u);
    expect([completo(usos(bom)[0]), completo(usos(ruim)[0])]).toEqual([true, false]);
  });

  it('todo hospedeiro entrega o cliente e diz o que fazer com o fornecedor que já existia', () => {
    const porArquivo: Record<string, number> = {};
    for (const caminho of arquivos(RAIZ)) {
      const fonte = readFileSync(caminho, 'utf8');
      const us = usos(fonte);
      if (us.length === 0) continue;
      const rel = relative(process.cwd(), caminho).split('\\').join('/');
      porArquivo[rel] = us.length;
      for (const u of us) {
        expect(/\bclienteId=\{/.test(u), `${rel}: falta clienteId`).toBe(true);
        expect(/\bonSelecionar=\{/.test(u), `${rel}: falta onSelecionar`).toBe(true);
      }
    }
    expect(porArquivo).toEqual({
      'src/components/financeiro-v2/LancamentoV2Dialog.tsx': 1,
      'src/components/recorrencias/RecorrenciaDialog.tsx': 1,
      'src/components/shared/CampoDeFornecedor.tsx': 1,   /* fatia 2d — o "+" dos quatro modais da Lavoura */
      'src/components/financiamentos/ObrigacaoDialog.tsx': 1,   /* fatia 2c, 1b — o "+" do credor do contrato */
      'src/components/compra/AbaCompromissosOC.tsx': 1,
      'src/components/compra/DocumentoFormOC.tsx': 1,
      'src/pages/LancamentosTab.tsx': 3,
      'src/v2/components/mesa/enriquecimento/ResultadoFavorecidoEditor.tsx': 1,
      'src/v2/components/mesa/enriquecimento/EnriquecerTresPassos.tsx': 1,
      'src/v2/components/importacao/ImportLancDeParaPanel.tsx': 1,
    });
  });

  it('o diálogo confere ANTES de chamar o criar do hospedeiro, e a decisão não tem segundo endereço', () => {
    const dlg = ler('src/components/financeiro-v2/NovoFornecedorDialog.tsx');
    expect(dlg.indexOf('await conferirCadastro(')).toBeGreaterThan(0);
    expect(dlg.indexOf('await conferirCadastro(')).toBeLessThan(dlg.indexOf('await onSave('));
    expect(dlg.match(/await onSave\(/g)).toHaveLength(1);
    expect(dlg).not.toContain("from 'sonner'");               // aviso e recusa ao lado do botão, nunca em aviso flutuante
    expect(dlg).not.toMatch(/\btoast\.\w+\(/);
    expect(dlg).not.toContain('normalizeFornecedorNome');     // quem normaliza é a regra
    /* a fonte do banco: por nome normalizado e por cliente, sem filtrar `ativo` (o inativo tem de vir); reativa com o cliente */
    const banco = ler('src/lib/fornecedores/cadastroDaCasaBanco.ts');
    const porNome = banco.slice(banco.indexOf('lerPorNome:'), banco.indexOf('lerAtivos:'));
    expect(porNome).toContain(".eq('cliente_id', clienteId)");
    expect(porNome).toContain(".eq('nome_normalizado', nomeNormalizado)");
    expect(porNome).not.toContain(".eq('ativo'");
    const reativar = banco.slice(banco.indexOf('reativar:'));
    expect(reativar).toContain(".eq('cliente_id', clienteId)");
    expect(reativar).toContain('notificarFornecedoresMudaram(clienteId)');
    expect(banco).toContain('leitorDeFornecedores.ler(clienteId)');
  });
});
