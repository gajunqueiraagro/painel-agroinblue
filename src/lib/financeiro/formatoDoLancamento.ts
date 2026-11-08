/**
 * NOTA-NFSE-LEITURA-02 (Gabriel 08/11, NF 402; regra de 06/11: "nunca toast genérico") — o formato de cada campo do lançamento conferido
 * ANTES de gravar. O banco recusa texto que não converte (22P02 em uuid/número; 22007 em data) e o `normalizarErro` só sabe dizer "Um dos
 * campos está em formato inválido" — sem qual. Aqui o campo e a frase saem prontos: a tela acende o campo em vermelho e escreve a frase
 * na faixa do rodapé, e nada vai ao banco. PURO.
 * ⚠ Vazio não é formato inválido: o que é obrigatório tem a sua própria trava (fazenda, vencimento…). Aqui só o PREENCHIDO errado.
 * ⚠ Os cadastros (fazenda, conta, fornecedor) já são conferidos contra as listas no Salvar; o que ainda chegar ao banco e voltar como
 *   22P02 é traduzido para o CAMPO por `campoDoErroDeFormato` (a coluna cujo valor o Postgres citou).
 */
export type CampoDoFormato = 'competencia' | 'vencimento' | 'pagamento' | 'valor' | 'fazenda' | 'conta' | 'conta_destino' | 'fornecedor'
  | 'classificacao' | 'safra';

export interface ErroDeFormato { campo: CampoDoFormato; frase: string }

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'AAAA-MM-DD' de um dia que existe (31/02 não). */
export function dataValida(iso: string): boolean {
  const m = RE_DATA.exec(iso);
  if (!m) return false;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(a, mes - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === mes - 1 && t.getUTCDate() === d && a >= 1900 && a <= 2200;
}

const preenchido = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** O primeiro campo preenchido em formato que o banco recusaria, na ordem da tela. `null` = tudo em formato. */
export function campoEmFormatoInvalido(form: {
  data_competencia?: string | null; data_vencimento?: string | null; data_pagamento?: string | null; valor?: number | null;
}): ErroDeFormato | null {
  const datas: [CampoDoFormato, string, string | null | undefined][] = [
    ['competencia', 'Competência', form.data_competencia], ['vencimento', 'Vencimento', form.data_vencimento],
    ['pagamento', 'Pagamento', form.data_pagamento],
  ];
  for (const [campo, rotulo, v] of datas) if (preenchido(v) && !dataValida(v)) return { campo, frase: `${rotulo}: data inválida. Use dd/mm/aaaa.` };
  if (form.valor != null && !Number.isFinite(form.valor)) return { campo: 'valor', frase: 'Valor: número inválido.' };
  return null;
}

/** A coluna do lançamento -> o campo da tela e o rótulo dele (o que a frase do 22P02 nomeia). */
const CAMPO_DA_COLUNA: Readonly<Record<string, [CampoDoFormato, string]>> = {
  data_competencia: ['competencia', 'Competência'], data_vencimento: ['vencimento', 'Vencimento'], data_pagamento: ['pagamento', 'Pagamento'],
  valor: ['valor', 'Valor'], fazenda_id: ['fazenda', 'Fazenda'], conta_bancaria_id: ['conta', 'Conta'], conta_destino_id: ['conta_destino', 'Conta de destino'],
  favorecido_id: ['fornecedor', 'Fornecedor'], plano_conta_id: ['classificacao', 'Classificação'], safra_id: ['safra', 'Safra'],
};

/**
 * O 22P02 do banco ("invalid input syntax for type uuid: \"abc\"") -> o campo da tela: a coluna do que foi enviado cujo valor é o citado.
 * O texto do Postgres NUNCA vai à tela (pode trazer dado): só serve para achar a coluna; a frase é a nossa. `null` = não deu para saber.
 */
export function campoDoErroDeFormato(e: unknown, enviado: Readonly<Record<string, unknown>>): ErroDeFormato | null {
  if (typeof e !== 'object' || e === null || !('code' in e) || e.code !== '22P02' || !('message' in e) || typeof e.message !== 'string') return null;
  const m = /invalid input syntax for type [\w ]+: "(.*)"$/.exec(e.message);
  if (!m) return null;
  const coluna = Object.keys(enviado).find((k) => enviado[k] != null && String(enviado[k]) === m[1]);
  const c = coluna ? CAMPO_DA_COLUNA[coluna] : undefined;
  return c ? { campo: c[0], frase: `${c[1]}: formato inválido. Corrija o campo e salve de novo.` } : null;
}
