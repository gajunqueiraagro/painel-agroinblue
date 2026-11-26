/**
 * FOLHA-01 · PR B (telas) — a Folha na bancada do `check:ui-cortes` / `check:ui-desloca` e nos testes: a API EM MEMÓRIA (a mesma porta
 * injetável da tela, `FolhaApiProvider`). Dado SINTÉTICO — nomes, CPF e valores inventados (dado pessoal nunca entra em teste nem fixture).
 * ⚠ AS FORMAS SÃO AS DO PROTO (21/11): 'nj' = 89 funcionários (27 ativos, 62 desligados, todos "a confirmar"), 99 + 13 + 43 pendências,
 *   uma pessoa com 338 pagamentos ligados; 'vera' = 12 funcionários, 27 + 1 pendências. O pior caso entra de propósito: nome de 41
 *   caracteres, registro de 59, chips demais, valor no teto, desligado com data, documento vencido e a vencer.
 */
import type { ArquivoAberto, FolhaApi, Resultado } from '@/lib/folha/folhaApi';
import type { FolhaMesApi } from '@/lib/folha/folhaMesApi';
import { folhaDoMesDoBanco } from '@/lib/folha/folhaMes';
import { feriasDoBanco } from '@/lib/folha/folhaFerias';
import type {
  Atuacao, DocumentoDoFuncionario, Ficha, FuncionarioDaLista, Historico, ItemDoHistorico, Linha, ListaFuncionarios, Pendencia, Pendencias,
} from '@/lib/folha/folhaTela';

import type { CadastroDoBanco, FichaCadastroApi } from '@/lib/folha/fichaCadastroApi';
import type { ExtrasDoFuncionario, FavorecidoDaFicha } from '@/lib/folha/fichaCadastro';

export type FormaDaFolha = 'nj' | 'vera';

const PRIMEIROS = ['Antônio', 'Bruno', 'Carla', 'Diego', 'Eduardo', 'Fábio', 'Gisele', 'Hugo', 'Ivo', 'Joana', 'Lúcio', 'Marta', 'Nelson', 'Otávio', 'Paula', 'Rui'];
const SOBRENOMES = ['Exemplo Prado', 'Teste Ribeiro', 'Modelo Santos', 'Fictício Alves', 'Amostra Lima', 'Exemplar Rocha', 'Demonstração Melo', 'Simulado Costa', 'Padrão Nunes'];
const FAZENDAS = [{ id: 'fSED', nome: 'Sede' }, { id: 'fRET', nome: 'Retiro' }, { id: 'fBOA', nome: 'Boa Vista' }];
/* FOLHA-REGUA-01: os maiores cargos do proto (Vera e NJ, 23 letras) — a coluna Cargo tem de mostrá-los inteiros a 1126 e a 1280 */
const CARGOS = ['Vaqueiro', 'Trab. Rural Polivalente', 'Capataz', 'Auxiliar Administrativo', 'Operador de Maquinas', 'Cozinheiro(a)'];
/* FOLHA-REGUA-01: o maior nome da Vera no proto tem 36 letras (sintético, do mesmo tamanho) */
const NOME_36 = 'Bruno Exemplo Demonstração de Cunhas';
const NOME_LONGO = 'Maria Aparecida Demonstração dos Santos Lima';   /* 41+ caracteres: o pior caso do NJ */
const REGISTRO_LONGO = 'Produtor Exemplo de Demonstração Sintética · CEI 00.000.00000/00';

const nomeDe = (i: number, forma: FormaDaFolha = 'nj') => (i === 3 ? NOME_LONGO : forma === 'vera' && i === 1 ? NOME_36 : `${PRIMEIROS[i % PRIMEIROS.length]} ${SOBRENOMES[(i * 7) % SOBRENOMES.length]} ${i > 15 ? String(i) : ''}`.trim());
const pad = (n: number) => String(n).padStart(2, '0');

function montarFuncionarios(forma: FormaDaFolha): FuncionarioDaLista[] {
  const total = forma === 'nj' ? 89 : 12;
  const ativos = forma === 'nj' ? 27 : 4;
  return Array.from({ length: total }, (_, i) => {
    const ativo = i < ativos;
    const atuacao: Atuacao[] = i % 5 === 1
      ? [{ fazenda_id: 'fSED', fazenda: 'Sede', atividade: 'pecuaria', pct: 60 }, { fazenda_id: 'fRET', fazenda: 'Retiro', atividade: 'agricultura', pct: 40 }]
      : [{ fazenda_id: FAZENDAS[i % 3].id, fazenda: FAZENDAS[i % 3].nome, atividade: i % 4 === 0 ? 'agricultura' : 'pecuaria', pct: 100 }];
    /* o NJ do proto: TODOS "a confirmar" (cargo, salário, admissão vazios); a Vera tem os 4 ativos completos */
    const completo = forma === 'vera' && ativo;
    const aAtualizar = completo ? [] : i === 3 ? ['salario', 'admissao', 'cargo', 'cpf', 'desligamento', 'nome_completo'] : i % 3 === 0 ? ['salario', 'admissao'] : ['cargo', 'cpf'];
    return {
      id: `f${pad(i)}`, nome: nomeDe(i, forma), cpf: completo || i % 2 === 0 ? `0000000${pad(i)}00`.slice(0, 11) : null, cargo: completo ? CARGOS[i % CARGOS.length] : null,
      vinculo: i % 11 === 5 ? 'domestico' : 'clt', empregador_registro: completo || i === 3 ? (i === 3 ? REGISTRO_LONGO : 'Produtor Exemplo · CEI 0000-00') : null,
      codigo_contador: completo ? String(100 + i) : null, admissao: completo ? `2021-${pad((i % 12) + 1)}-03` : null,
      situacao: ativo ? 'ativo' : 'desligado', desligamento: ativo ? null : `2026-${pad((i % 10) + 1)}-30`, a_atualizar: aAtualizar, a_confirmar: !completo,
      favorecido_id: `fav${pad(i)}`, favorecido: nomeDe(i, forma), salario: completo ? 3500 + i * 245 : i === 0 ? 99999.99 : null, salario_desde: completo ? '2026-01-01' : null,
      atuacao, lancamentos: i === 0 ? 338 : 12 + i, ultimo_pagamento: '2026-10-05', documentos: i === 0 ? 4 : 0, documentos_vencendo: i === 0 ? 2 : 0,
    };
  });
}

const DOCUMENTOS_DO_0: DocumentoDoFuncionario[] = [
  { id: 'd1', especie: 'contrato', nome: 'contrato de experiência 45+45 dias assinado.pdf', bucket: 'folha-documentos', storage_path: 'cli/folha/funcionarios/f00/d1.pdf', tipo: 'application/pdf', tamanho_bytes: 81234, data_documento: '2026-09-01', vencimento: '2026-12-01', dias: 10, lancamento_id: null, criado_em: '2026-09-01T10:00:00Z' },
  { id: 'd2', especie: 'aso', nome: 'ASO admissional.pdf', bucket: 'folha-documentos', storage_path: 'cli/folha/funcionarios/f00/d2.pdf', tipo: 'application/pdf', tamanho_bytes: 40211, data_documento: '2025-11-10', vencimento: '2026-11-10', dias: -11, lancamento_id: null, criado_em: '2025-11-10T10:00:00Z' },
  { id: 'd3', especie: 'epi', nome: 'ficha de EPI NR-31.pdf', bucket: 'folha-documentos', storage_path: 'cli/folha/funcionarios/f00/d3.pdf', tipo: 'application/pdf', tamanho_bytes: 20999, data_documento: '2026-03-02', vencimento: null, dias: null, lancamento_id: null, criado_em: '2026-03-02T10:00:00Z' },
  { id: 'd4', especie: 'ctps', nome: 'CTPS digital.png', bucket: 'folha-documentos', storage_path: 'cli/folha/funcionarios/f00/d4.png', tipo: 'image/png', tamanho_bytes: 120000, data_documento: null, vencimento: null, dias: null, lancamento_id: null, criado_em: '2026-03-02T10:00:00Z' },
];

function historicoDe(f: FuncionarioDaLista, forma: FormaDaFolha): ItemDoHistorico[] {
  const n = f.id === 'f00' ? (forma === 'nj' ? 338 : 60) : 14;
  const tipos = ['Salário', 'Salário', 'Salário', 'Adiantamento', 'Benefício', '13º', 'Férias', 'Rescisão', 'Multa rescisória', 'Outro'];
  return Array.from({ length: n }, (_, i) => {
    const mes = 10 - (i % 12); const ano = 2026 - Math.floor(i / 12);
    const m = ((mes + 11) % 12) + 1;
    const tipo = tipos[i % tipos.length];
    const aOutro = tipo === 'Rescisão' || tipo === 'Multa rescisória';
    return {
      lancamento_id: `${f.id}-l${i}`, competencia: `${ano}-${pad(m)}`, data: `${ano}-${pad(m)}-05`, data_pagamento: i % 9 === 4 ? null : `${ano}-${pad(m)}-05`, tipo,
      descricao: tipo === 'Salário' ? 'Folha de Pagamento' : `${tipo} ${f.nome}`, favorecido_id: aOutro ? 'favCont' : f.favorecido_id,
      favorecido: aOutro ? (tipo === 'Multa rescisória' ? 'Caixa Econômica Federal' : 'Contabilidade Exemplo Sintética Ltda') : f.favorecido,
      pago_a_outro: aOutro, valor: i === 0 ? 20413.48 : 1850 + (i % 7) * 133.33, status: 'realizado', conciliado: i % 3 !== 2,
      documentos: i % 4 === 0 ? [{ origem: 'folha', id: `doc${i}`, nome: 'recibo pág. 9.pdf', especie: 'holerite', bucket: 'folha-documentos', storage_path: `x/${i}.pdf` },
        { origem: 'lancamento', id: `docl${i}`, nome: 'comprovante.pdf', especie: null, bucket: 'fin-documentos', storage_path: `y/${i}.pdf` },
        ...(i % 8 === 0 ? [{ origem: 'lancamento' as const, id: `docm${i}`, nome: 'aviso.pdf', especie: null, bucket: 'fin-documentos', storage_path: `z/${i}.pdf` }] : [])] : [],
    };
  });
}

function pendenciasDe(forma: FormaDaFolha, lista: FuncionarioDaLista[]): Pendencia[] {
  const vazio: Omit<Pendencia, 'tipo' | 'chave'> = {
    favorecido_id: null, favorecido: null, n: 0, total: 0, desde: null, ate: null, ids: [], tem_rescisao: false, lancamento_id: null, descricao: null,
    valor: null, data: null, funcionario_id: null, funcionario: null, documento_id: null, especie: null, nome: null, vencimento: null, dias: null, sugestao: null,
  };
  const [nFav, nRes, nSug] = forma === 'nj' ? [99, 13, 43] : [27, 1, 0];
  const uuid = (k: string, i: number) => `${k}:00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
  const out: Pendencia[] = [];
  for (let i = 0; i < nFav; i++) out.push({ ...vazio, tipo: 'favorecido_sem_funcionario', chave: uuid('fav', i), favorecido_id: `favX${i}`,
    favorecido: i === 0 ? 'Juca do Retiro Exemplo Sintético de Demonstração' : `Favorecido Exemplo ${i}`, n: i === 0 ? 999 : 3 + (i % 20), total: 1234.56 * (1 + (i % 9)),
    desde: '2024-01-05', ate: '2026-10-05', ids: [`lx${i}a`, `lx${i}b`], sugestao: i % 4 === 0 ? { funcionario_id: lista[i % lista.length].id, funcionario: lista[i % lista.length].nome } : null });
  for (let i = 0; i < nRes; i++) out.push({ ...vazio, tipo: 'rescisao_a_conferir', chave: uuid('fav', 500 + i), favorecido_id: `favR${i}`, favorecido: `Ex-funcionário Exemplo ${i}`,
    n: 8 + i, total: 9876.54, desde: '2023-03-05', ate: `2026-${pad((i % 9) + 1)}-30`, ids: [`lr${i}`], tem_rescisao: true });
  for (let i = 0; i < nSug; i++) out.push({ ...vazio, tipo: 'sugestao_descricao', chave: uuid('desc', i), lancamento_id: `ls${i}`, favorecido: 'Contabilidade Exemplo Sintética Ltda',
    descricao: `Rescisão ${lista[i % lista.length].nome.split(' ')[0]}`, valor: 3912.4, data: '2026-10-30', sugestao: { funcionario_id: lista[i % lista.length].id, funcionario: lista[i % lista.length].nome } });
  if (forma === 'nj') {
    out.push({ ...vazio, tipo: 'sem_recibo', chave: uuid('recibo', 1), lancamento_id: 'lrec1', funcionario_id: 'f07', funcionario: lista[7].nome, descricao: '13º 1ª parcela 2026', valor: 1215, data: '2026-11-18' });
    out.push({ ...vazio, tipo: 'documento_vence', chave: uuid('doc', 2), documento_id: 'd2', funcionario_id: 'f00', funcionario: lista[0].nome, especie: 'aso', nome: 'ASO admissional.pdf', vencimento: '2026-11-10', dias: -11 });
  }
  return out;
}

/** A API da bancada: lê da memória; escreve fingindo (a prévia diz o que faria; gravar devolve ok). `folhaOk=false` = cliente sem a folha. */
export function apiDaFolha(forma: FormaDaFolha = 'nj', opcoes: { folhaOk?: boolean } = {}): FolhaApi & { chamadas: Array<{ fn: string; args: unknown[] }> } {
  const lista = montarFuncionarios(forma);
  const pend = pendenciasDe(forma, lista);
  const chamadas: Array<{ fn: string; args: unknown[] }> = [];
  const ok = <T,>(dados: T): Resultado<T> => ({ ok: true, dados });
  const anotar = (fn: string, args: unknown[]) => { chamadas.push({ fn, args }); };
  const contagem = () => ({
    ativos: lista.filter(f => f.situacao !== 'desligado').length, desligados: lista.filter(f => f.situacao === 'desligado').length,
    a_confirmar: lista.filter(f => f.a_confirmar).length, todos: lista.length,
  });
  return {
    chamadas,
    async folhaOk() { return opcoes.folhaOk ?? true; },
    async lista() { return ok<ListaFuncionarios>({ funcionarios: lista, contagem: contagem() }); },
    async ficha(id) {
      const f = lista.find(x => x.id === id);
      if (!f) return { ok: false, erro: 'Sem acesso à folha deste cliente.' };
      const ficha: Ficha = {
        funcionario: { id: f.id, nome: f.nome, cpf: f.cpf, favorecido_id: f.favorecido_id, codigo_contador: f.codigo_contador, cargo: f.cargo, cbo: null, vinculo: f.vinculo,
          empregador_registro: f.empregador_registro, admissao: f.admissao, a_atualizar: f.a_atualizar, observacao: null, nascimento: f.cpf ? '1985-04-12' : null,
          pis: f.cpf ? '12345678901' : null, ctps: null, situacao: f.situacao, desligamento: f.desligamento, desligamento_motivo: f.desligamento ? 'rescisão (provisório)' : null,
          recorrencia_origem_id: f.id === 'f00' ? 'rec-bancada' : null },
        pagamento: { favorecido_id: f.favorecido_id, favorecido: f.favorecido, tipo_recebimento: 'pix', pix_tipo_chave: 'cpf', pix_chave: f.cpf ?? null, banco: f.cpf ? 'Banco Exemplo 000' : null,
          agencia: f.cpf ? '0001' : null, conta: f.cpf ? '12345-6' : null, tipo_conta: null, telefone: null, celular: f.cpf ? '(00) 90000-0000' : null, email: null },
        salarios: f.salario != null ? [{ desde: f.salario_desde ?? '2026-01-01', salario: f.salario, parte_pct: 100, motivo: 'pelo holerite' }] : [],
        /* FOLHA-REGUA-01: o f00 tem uma vigência REPETIDA (o caso do proto: a mesma atuação regravada pela tela depois da carga) */
        atuacoes: f.id === 'f00' ? [...f.atuacao.map(a => ({ ...a, desde: '2026-07-28' })), ...f.atuacao.map(a => ({ ...a, desde: '2025-11-01' }))]
          : f.atuacao.map(a => ({ ...a, desde: '2025-11-01' })),
        documentos: f.id === 'f00' ? DOCUMENTOS_DO_0 : [],
        /* FOLHA-REGUA-01: como o banco devolve depois do lote 118750 — os 5 REALIZADOS mais recentes e os 3 PREVISTOS de hoje em diante */
        ultimos_pagamentos: historicoDe(f, forma).filter(i => i.status === 'realizado').slice(0, 5)
          .map(i => ({ lancamento_id: i.lancamento_id, descricao: i.descricao, valor: i.valor, status: i.status, data: i.data_pagamento ?? i.data, competencia: i.competencia })),
        proximos_pagamentos: ['2026-12', '2027-01', '2027-02'].map(m => ({ lancamento_id: `${f.id}-p${m}`, descricao: 'Folha de Pagamento', valor: 3500 + f.lancamentos,
          status: 'previsto', data: `${m}-05`, competencia: m })),
      };
      return ok(ficha);
    },
    async historico(id, de, ate) {
      const f = lista.find(x => x.id === id);
      if (!f) return { ok: false, erro: 'Sem acesso à folha deste cliente.' };
      const itens = historicoDe(f, forma).filter(i => { const d = i.data_pagamento ?? i.data ?? ''; return (!de || d >= de) && (!ate || d <= ate); });
      const por_tipo: Record<string, number> = {};
      for (const i of itens) por_tipo[i.tipo] = (por_tipo[i.tipo] ?? 0) + 1;
      const h: Historico = { funcionario: { id: f.id, nome: f.nome, situacao: f.situacao, admissao: f.admissao, desligamento: f.desligamento, favorecido_id: f.favorecido_id },
        itens, n: itens.length, total: itens.reduce((s, i) => s + i.valor, 0), pagos_a_outro: itens.filter(i => i.pago_a_outro).length, por_tipo };
      return ok(h);
    },
    async pendencias() { return ok<Pendencias>({ itens: pend, descartadas: forma === 'nj' ? 3 : 0 }); },
    async gravarFuncionario(cli, pedido, simular) { anotar('gravarFuncionario', [cli, pedido, simular]); return ok<Linha>(simular ? { ok: true, simulado: true } : { ok: true, id: 'novo-1' }); },
    async gravarSalario(...a) { anotar('gravarSalario', a); return ok<Linha>({ ok: true }); },
    async gravarAtuacao(...a) { anotar('gravarAtuacao', a); return ok<Linha>({ ok: true }); },
    async desligar(...a) { anotar('desligar', a); return ok<Linha>({ ok: true }); },
    async reativar(...a) { anotar('reativar', a); return ok<Linha>({ ok: true }); },
    async ligar(ids, func, motivo, simular) {
      anotar('ligar', [ids, func, motivo, simular]);
      const quem = lista.find(f => f.id === func)?.nome ?? null;
      return ok<Linha>({ ok: true, simulado: simular, funcionario: quem, lancamentos: ids.length, mudam: ids.length });
    },
    async descartar(...a) { anotar('descartar', a); return ok<Linha>({ ok: true, id: 'desc-1' }); },
    async enviarDocumento(...a) { anotar('enviarDocumento', a); return null; },
    async detalharDocumento(...a) { anotar('detalharDocumento', a); return ok<Linha>({ ok: true }); },
    async removerDocumento(...a) { anotar('removerDocumento', a); return ok<Linha>({ ok: true }); },
    async abrirArquivo(_b, _c, nome): Promise<ArquivoAberto | null> { return { nome, ehPdf: false, bytes: null, url: null }; },
    async funcionarioDoLancamento(id) { return id === 'lanc-ligado' ? { id: 'f00', nome: lista[0].nome } : null; },
  };
}

export const FAZENDAS_DA_FOLHA = FAZENDAS.map(f => ({ ...f, codigo: f.nome.slice(0, 3).toUpperCase(), cliente_id: 'cli' }));

/* ── FOLHA-TELAS-03: a "Folha do mês" em memória (`FolhaMesApiProvider`), na forma do `fn_folha_mes` ───────────────────────────────
   Os ativos da forma (NJ 27, Vera 4), com TODAS as situações de propósito: confere pago e a pagar, diferença, sem recibo, a conferir,
   sem previsto, criado pelo recibo, "ligar" (entrou pelo favorecido) e o valor no teto. `tudo_confere` = a folha que libera o Confirmar;
   `confirmada` = a mesma já confirmada (o Reabrir). As FÉRIAS: todas as situações (vencida, vence em 90 dias, a tirar pela escala e pela
   admissão, ganhando, sem admissão) e as provisões. */
export function apiDaFolhaMes(forma: FormaDaFolha = 'nj', caso: 'normal' | 'tudo_confere' | 'confirmada' = 'normal'): FolhaMesApi & { chamadas: Array<{ fn: string; args: unknown[] }> } {
  const ativos = montarFuncionarios(forma).filter(f => f.situacao !== 'desligado');
  const chamadas: Array<{ fn: string; args: unknown[] }> = [];
  const SIT = ['confere', 'confere', 'diferenca', 'sem_recibo', 'a_conferir', 'sem_previsto', 'criado_pelo_recibo', 'confere'] as const;
  return {
    chamadas,
    async mes(cliente, competencia, tipo) {
      chamadas.push({ fn: 'mes', args: [cliente, competencia, tipo] });
      const linhas = ativos.map((f, i) => {
        const tudoBate = caso !== 'normal';
        const sit = tudoBate ? 'confere' : SIT[i % SIT.length];
        const base = i === 0 ? 99999.99 : 2900 + i * 137.5;
        const previsto = sit === 'sem_previsto' ? null : tipo === 'mensal' ? base : Math.round(base * 50) / 100;
        const recibo = sit === 'confere' || sit === 'criado_pelo_recibo' ? previsto : sit === 'diferenca' && previsto != null ? previsto + 180 : null;
        const pago = sit === 'confere' && i % 2 === 0;
        const ligado = tudoBate || i % 9 !== 4;
        const lancamentos = previsto == null ? [] : [{ id: `lm${pad(i)}`, valor: previsto, status: pago ? 'realizado' : 'previsto', vencimento: `${competencia}-28`,
          pagamento: pago ? '2026-12-05' : null, conciliado: pago, ligado }];
        const falta = [sit === 'sem_previsto' ? 'lancamento' : null, !ligado && previsto != null ? 'ligar' : null,
          sit === 'sem_recibo' || sit === 'sem_previsto' ? 'recibo' : null, previsto != null && !pago ? 'pagamento' : null].filter((x): x is string => x !== null);
        const frase: Record<string, string> = { lancamento: 'lançamento previsto', ligar: 'ligar o lançamento', recibo: 'recibo do contador', pagamento: 'pagamento' };
        return {
          funcionario_id: f.id, nome: f.nome, situacao: f.situacao, vinculo: f.vinculo, vinculo_a_confirmar: i === 3,
          previsto, recibo, diferenca: recibo != null && previsto != null ? Math.round((recibo - previsto) * 100) / 100 : null,
          recibos: recibo != null ? [{ id: `rd${pad(i)}`, nome: `${100 + i}-${f.nome}.pdf`, bucket: 'folha-documentos', storage_path: `cli/rd${pad(i)}.pdf`, lancamento_id: `lm${pad(i)}` }] : [],
          lancamentos, lancamento_status: lancamentos[0]?.status ?? null, situacao_folha: sit, falta, falta_frase: falta.map(c => frase[c]).join(' · ') || null,
        };
      });
      const soma = (k: 'previsto' | 'recibo' | 'diferenca') => Math.round(linhas.reduce((s, l) => s + (l[k] ?? 0), 0) * 100) / 100;
      const conta = (s: string) => linhas.filter(l => l.situacao_folha === s).length;
      const comRecibo = linhas.filter(l => l.recibos.length > 0).length;
      const v = {
        competencia, tipo, linhas,
        totais: { pessoas: linhas.length, previsto: soma('previsto'), recibo: soma('recibo'), diferenca: soma('diferenca'), confere: conta('confere'),
          diferencas: conta('diferenca'), sem_recibo: conta('sem_recibo'), a_conferir: conta('a_conferir'), sem_previsto: conta('sem_previsto'),
          criados_pelo_recibo: conta('criado_pelo_recibo'), a_ligar: linhas.filter(l => l.falta.includes('ligar')).length },
        documentos: { recibos: { chegou: comRecibo > 0, n: comRecibo, de: linhas.length }, espelho: { chegou: false },
          guia_inss: tipo === 'mensal' ? { chegou: true, valor: 4321.09, vencimento: '2026-12-19' } : { chegou: false }, guia_fgts: { chegou: false } },
        calendario: [{ chave: 'salario', rotulo: 'Pagamento do salário', origem: 'regra', data: '2026-12-05', dias: 10 },
          { chave: 'decimo_terceiro', rotulo: '13º · 1ª parcela', origem: 'regra', data: '2026-11-30', dias: 5 }],
        folha: caso === 'confirmada' ? { id: 'fo-1', situacao: 'confirmada', confirmada_em: '2026-12-04T10:00:00Z' } : null,
      };
      const f = folhaDoMesDoBanco(v);
      return f ? { ok: true, dados: f } : { ok: false, erro: 'bancada: folha do mês inválida' };
    },
    async confirmar(cliente, competencia, tipo, simular) {
      chamadas.push({ fn: 'confirmar', args: [cliente, competencia, tipo, simular] });
      return { ok: true, dados: simular ? { ok: true, simulado: true, pessoas: ativos.length } : { ok: true, folha_id: 'fo-1' } };
    },
    async reabrir(folhaId, motivo, simular) {
      chamadas.push({ fn: 'reabrir', args: [folhaId, motivo, simular] });
      return { ok: true, dados: { ok: true, simulado: simular } };
    },
    async ferias(cliente) {
      chamadas.push({ fn: 'ferias', args: [cliente] });
      const SITF = ['vencida', 'vence', 'a_tirar', 'ganhando', 'a_tirar', 'sem_admissao'] as const;
      const linhas = ativos.map((f, i) => {
        const sit = SITF[i % SITF.length];
        const escala = sit === 'vencida' || (sit === 'a_tirar' && i % 2 === 0);
        const sal = i === 0 ? 99999.99 : sit === 'sem_admissao' ? null : 2900 + i * 137.5;
        const ano = 2024 - (i % 3);
        const ini = sit === 'ganhando' ? '2026-06-10' : `${ano}-0${(i % 9) + 1}-10`;
        const fim = sit === 'ganhando' ? '2027-06-09' : `${ano + 1}-0${(i % 9) + 1}-09`;
        const ate = sit === 'vencida' ? '2026-10-30' : sit === 'vence' ? '2026-12-19' : sit === 'ganhando' || sit === 'sem_admissao' ? null : '2027-04-09';
        return {
          funcionario_id: f.id, nome: f.nome, admissao: sit === 'sem_admissao' ? null : `${ano - 1}-0${(i % 9) + 1}-10`, situacao: f.situacao,
          origem: sit === 'sem_admissao' ? null : escala ? 'escala' : 'admissao',
          aquisitivo_inicio: sit === 'sem_admissao' ? null : ini, aquisitivo_fim: sit === 'sem_admissao' ? null : fim, tirar_ate: ate,
          dias: sit === 'vencida' ? -26 : sit === 'vence' ? 24 : ate ? 135 : null, direito: sit === 'sem_admissao' ? null : 30,
          tirou: escala ? (sit === 'vencida' ? 0 : 10) : null, saldo: escala ? (sit === 'vencida' ? 30 : 20) : null, situacao_ferias: sit, avos_em_curso: sit === 'ganhando' ? 5 : 8,
          salario: sal, provisao_ferias: sal == null || sit === 'sem_admissao' ? null : Math.round(sal * 4 / 3 * (8 / 12 + 1) * 100) / 100,
          provisao_13: sal == null || sit === 'sem_admissao' ? null : Math.round(sal * 11 / 12 * 100) / 100,
        };
      });
      const soma = (k: 'provisao_ferias' | 'provisao_13') => Math.round(linhas.reduce((t, l) => t + (l[k] ?? 0), 0) * 100) / 100;
      const conta = (sit: string) => linhas.filter(l => l.situacao_ferias === sit).length;
      const v = { linhas, totais: { pessoas: linhas.length, vencidas: conta('vencida'), vence_90: conta('vence'), pela_admissao: linhas.filter(l => l.origem === 'admissao').length,
        pela_escala: linhas.filter(l => l.origem === 'escala').length, sem_admissao: conta('sem_admissao'), sem_salario: linhas.filter(l => l.salario == null).length,
        provisao_ferias: soma('provisao_ferias'), provisao_13: soma('provisao_13') } };
      const r = feriasDoBanco(v);
      return r ? { ok: true, dados: r } : { ok: false, erro: 'bancada: férias inválidas' };
    },
  };
}

/* ── FOLHA-FUNC-CADASTRO-01 — a aba Cadastro completa: os campos novos e o favorecido (pagamento e contato), SINTÉTICOS ──────────────── */
/** f00: a ficha CHEIA (Pix, conta, endereço, todos os campos) com o titular = o próprio; os outros: vazios (o NJ do proto: nada de pagamento) */
export function fichaCadastroDaFolha(): FichaCadastroApi & { chamadas: Array<{ fn: string; args: unknown[] }> } {
  const chamadas: Array<{ fn: string; args: unknown[] }> = [];
  return {
    chamadas,
    async ler(funcionarioId, favorecidoId): Promise<Resultado<CadastroDoBanco>> {
      const cheio = funcionarioId === 'f00';
      const extras: ExtrasDoFuncionario = cheio
        ? { sexo: 'M', estado_civil: 'uniao_estavel', dependentes: 2, jornada: '44h', fazenda_registro_id: 'fSED', experiencia_ate: null, rg: '0.000.000 SSP/XX',
            cnh_categoria: 'D', cnh_validade: '2029-03-31', contato_emergencia: 'Fulana Exemplo · (00) 9 0000-0000', dia_pagamento: 5, dia_pagamento_util: true }
        : { sexo: null, estado_civil: null, dependentes: null, jornada: null, fazenda_registro_id: null, experiencia_ate: null, rg: null, cnh_categoria: null,
            cnh_validade: null, contato_emergencia: null, dia_pagamento: null, dia_pagamento_util: false };
      const favorecido: FavorecidoDaFicha | null = !favorecidoId ? null : cheio
        ? { id: favorecidoId, nome: 'Antônio Exemplo Prado', tipo_recebimento: 'PIX', pix_tipo_chave: 'CPF', pix_chave: '000.000.000-00', banco: '000 Banco Exemplo Sintético S.A.',
            agencia: '0001', conta: '123456-7', tipo_conta: 'Salário', cpf_cnpj_pagamento: '00000000000', celular: '(00) 9 0000-0001', email: 'exemplo@exemplo.invalid',
            logradouro: 'Fazenda Exemplo, sede · Município Sintético/XX', cep: '00000-000' }
        : { id: favorecidoId, nome: 'Favorecido Sintético', tipo_recebimento: null, pix_tipo_chave: null, pix_chave: null, banco: null, agencia: null, conta: null,
            tipo_conta: null, cpf_cnpj_pagamento: null, celular: null, email: null, logradouro: null, cep: null };
      return { ok: true, dados: { extras, favorecido } };
    },
    async gravarFavorecido(...a) { chamadas.push({ fn: 'gravarFavorecido', args: a }); return { ok: true, dados: { ok: true } }; },
  };
}
