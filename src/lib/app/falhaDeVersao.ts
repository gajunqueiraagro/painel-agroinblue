/**
 * falhaDeVersao — APP-VERSAO-NOVA-01 (Gabriel, 07/10/2026). O DONO da falha de `import()` por página aberta antes de uma publicação.
 *
 * A página ficou aberta, o sistema foi publicado de novo e o pedaço antigo (carregado sob demanda) não existe mais no servidor:
 * o `import()` falha com a mensagem crua do navegador, em inglês, com o endereço do arquivo. Ela nunca aparece crua.
 *
 * ⚠ ESTE MÓDULO É IMPORTADO ESTATICAMENTE E NÃO IMPORTA NADA: se a frase morasse num pedaço dinâmico, falharia junto com ele
 *   (a lei do PARC-LIVRES-01 passo 0, de onde `motivoDaFalhaDoPdf` veio — o do PDF agora delega a pergunta para cá).
 * ⚠ TODO `import()` DINÂMICO DE `src` PASSA POR `importarDoApp` (preso por teste de fonte). Ele NÃO engole a falha: avisa o shell
 *   e relança como `FalhaDeVersao`, cuja mensagem já é a frase — quem tem `catch` próprio escreve a frase, nunca o endereço.
 * ⚠ NUNCA RECARREGAR SOZINHO: perderia o que está digitado. O aviso do shell oferece o botão; quem decide é a pessoa.
 */
export const FRASE_VERSAO_NOVA = 'O sistema foi atualizado depois que esta página abriu. Recarregue a página (Ctrl+R) e repita.';

/** O evento do próprio sistema (o do Vite é `vite:preloadError`); o shell ouve os dois. */
export const EVENTO_VERSAO_NOVA = 'app:versao-nova';
export const EVENTO_DO_VITE = 'vite:preloadError';

/* as três grafias do mesmo erro: Chrome, Safari e Firefox; e a do pré-carregamento do Vite (CSS do pedaço) */
const GRAFIAS = /dynamically imported module|Importing a module script failed|error loading dynamically|Unable to preload CSS/i;

export class FalhaDeVersao extends Error {
  readonly causa: unknown;
  constructor(causa: unknown) {
    super(FRASE_VERSAO_NOVA);
    this.name = 'FalhaDeVersao';
    this.causa = causa;
  }
}

/** A exceção é a de um pedaço que não chegou? (a crua do navegador, ou a já traduzida por `importarDoApp`) */
export function ehFalhaDeVersao(e: unknown): boolean {
  if (e instanceof FalhaDeVersao) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return GRAFIAS.test(msg);
}

/** A frase, ou nulo quando a falha é outra (quem chama segue com a mensagem dele). */
export function fraseDaFalhaDeVersao(e: unknown): string | null {
  return ehFalhaDeVersao(e) ? FRASE_VERSAO_NOVA : null;
}

type Alvo = Pick<Window, 'addEventListener' | 'removeEventListener' | 'dispatchEvent'>;
const janela = (): Alvo | null => (typeof window === 'undefined' ? null : window);

/** Acende o aviso fixo do shell. Repetir não empilha: o aviso é um só. */
export function avisarVersaoNova(alvo: Alvo | null = janela()): void {
  alvo?.dispatchEvent(new Event(EVENTO_VERSAO_NOVA));
}

/** O shell ouve os dois eventos (o do Vite e o do sistema) e devolve quem desliga. NÃO chama `preventDefault`: a falha segue. */
export function ouvirVersaoNova(aoAvisar: () => void, alvo: Alvo | null = janela()): () => void {
  if (!alvo) return () => {};
  const ouvir = () => aoAvisar();
  alvo.addEventListener(EVENTO_DO_VITE, ouvir);
  alvo.addEventListener(EVENTO_VERSAO_NOVA, ouvir);
  return () => {
    alvo.removeEventListener(EVENTO_DO_VITE, ouvir);
    alvo.removeEventListener(EVENTO_VERSAO_NOVA, ouvir);
  };
}

/**
 * O ÚNICO jeito de carregar um pedaço sob demanda: `await importarDoApp(() => import('…'))`.
 * Pedaço que não chega: avisa o shell e relança `FalhaDeVersao` (mensagem = a frase). Qualquer outra falha passa como veio.
 */
export async function importarDoApp<T>(carrega: () => Promise<T>): Promise<T> {
  try {
    return await carrega();
  } catch (e) {
    if (!ehFalhaDeVersao(e)) throw e;
    avisarVersaoNova();
    throw e instanceof FalhaDeVersao ? e : new FalhaDeVersao(e);
  }
}
