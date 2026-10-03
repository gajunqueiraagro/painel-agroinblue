/**
 * O RESULTADO DA IMPORTAÇÃO DE EXTRATO — PR-CONC-IMPORT-BANCO-01B.
 *
 * Quem grava é o banco (`fn_extrato_importar_arquivo`, uma transação: cabeçalho + movimentos). Aqui só se LÊ o que ele
 * devolveu e se escreve a frase que a tela mostra ao lado do botão — sem segunda regra de dedupe.
 */

export interface ResultadoImportacao {
  inseridos: number;
  importacaoId: string | null;
  /** Movimentos do arquivo que já estavam no extrato (a prévia já sabia + o que o banco pulou). */
  jaExistiam: number;
  /** A frase do resultado, para o slot ao lado do botão. */
  mensagem: string;
}

/** O retorno da RPC, lido sem cast: o que não tem a forma esperada vira o valor neutro. */
export interface RetornoImportacaoBanco {
  ok: boolean;
  frase: string | null;
  importacaoId: string | null;
  inseridos: number;
  pulados: number;
  ids: { hash: string; id: string }[];
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function lerRetornoImportacao(dado: unknown): RetornoImportacaoBanco {
  if (!ehObjeto(dado)) return { ok: false, frase: null, importacaoId: null, inseridos: 0, pulados: 0, ids: [] };
  const ids: { hash: string; id: string }[] = [];
  if (Array.isArray(dado.ids)) {
    for (const x of dado.ids) {
      if (ehObjeto(x) && typeof x.hash === 'string' && typeof x.id === 'string') ids.push({ hash: x.hash, id: x.id });
    }
  }
  return {
    ok: dado.ok === true,
    frase: texto(dado.frase),
    importacaoId: texto(dado.importacao_id),
    inseridos: numero(dado.inseridos),
    pulados: Array.isArray(dado.pulados) ? dado.pulados.length : 0,
    ids,
  };
}

/** Plural de "movimento" com o verbo junto: 1 importado / 2 importados. */
const mov = (n: number, singular: string, plural: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : plural}`;

/**
 * A frase do resultado (D3): "já importado" SÓ quando nada entrou; parcial diz os dois números; inteiro diz quantos.
 */
export function textoDoResultadoDaImportacao(inseridos: number, jaExistiam: number): string {
  if (inseridos === 0) return 'Extrato já importado anteriormente. Nenhuma movimentação nova foi encontrada.';
  const importados = mov(inseridos, 'importado', 'importados');
  return jaExistiam > 0 ? `${importados} · ${mov(jaExistiam, 'já existia', 'já existiam')}` : importados;
}
