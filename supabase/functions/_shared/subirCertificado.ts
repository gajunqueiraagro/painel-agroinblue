/**
 * NOTAS-RECEITA-A1-01 · F2 — O SUBIR DO CERTIFICADO, a ordem dos passos da função de borda `fiscal-certificado-subir`, PURA (as peças que
 * falam com o banco, o bucket e a cifra entram por `Pecas`): o vitest prova a ordem e as recusas com peças falsas; o `index.ts` liga as reais.
 *
 *  1. quem chama tem de estar logado (o token vira o autor; o cliente NUNCA vem do front: sai do titular, no banco);
 *  2. o titular existe e quem chama pode (admin AgroinBlue ou gestor DAQUELE cliente — D2) → senão 403, e nada se lê;
 *  3. o certificado abre com a senha, é A1, é do titular e está valendo (`lerCertificadoA1`) → senão a frase, a trilha da recusa, nada gravado;
 *  4. o .pfx é cifrado (AES-GCM) e vai ao bucket privado; o banco registra (metadados + cofre + senha no Vault + trilha) numa transação;
 *     se o registro falhar, o objeto do bucket é apagado (nada fica pela metade).
 *  ⚠ A senha e os bytes nunca saem daqui na resposta nem no log; a resposta leva só os metadados.
 */
import { FRASES_DA_RECUSA, lerCertificadoA1, type CertificadoLido } from './certificadoA1.ts';
import { cadeiaDaSubida, type CadeiaConferida } from './dfe/credencialA1.ts';

export interface TitularDoBanco { id: string; cliente_id: string; documento: string | null }
export interface Pecas {
  autorDoToken(token: string): Promise<string | null>;
  lerTitular(id: string): Promise<TitularDoBanco | null>;
  podeSubir(autor: string, clienteId: string): Promise<boolean>;
  cifrar(bytes: Uint8Array): Promise<Uint8Array>;
  gravarObjeto(caminho: string, bytes: Uint8Array): Promise<void>;
  apagarObjeto(caminho: string): Promise<void>;
  registrar(o: { titularId: string; autor: string; meta: Record<string, string>; objeto: string; senha: string }): Promise<{ certificadoId: string; acao: string }>;
  registrarRecusa(titularId: string, autor: string, recusa: string): Promise<void>;
  /** só o teste troca: a cadeia do .pfx (padrão: `cadeiaDaSubida`, com as ACs da ICP-Brasil) */
  conferirCadeia?: (arquivo: Uint8Array, senha: string, impressaoDigital: string, agora: Date) => CadeiaConferida | null;
  novoId(): string;
  agora(): Date;
}
export interface Pedido { token: string | null; titularId: string | null; senha: string | null; arquivo: Uint8Array | null }
export type Resposta =
  | { status: 200; corpo: { ok: true; certificado_id: string; acao: string; certificado: Omit<CertificadoLido, 'validoDe' | 'validoAte'> & { validoDe: string; validoAte: string }; avisos: string[]; cadeia?: CadeiaConferida } }
  | { status: 400 | 401 | 403 | 404 | 422 | 500; corpo: { ok: false; recusa: string; frase: string } };

const nao = (status: 400 | 401 | 403 | 404 | 422 | 500, recusa: string, frase: string): Resposta => ({ status, corpo: { ok: false, recusa, frase } });
/** o limite do arquivo: um .pfx real tem poucos KB; acima disso não é certificado */
export const TAMANHO_MAXIMO = 64 * 1024;

export async function subirCertificado(p: Pedido, pecas: Pecas): Promise<Resposta> {
  const autor = p.token ? await pecas.autorDoToken(p.token) : null;
  if (!autor) return nao(401, 'nao_logado', 'Entre de novo no sistema para subir o certificado.');
  if (!p.titularId) return nao(400, 'sem_titular', 'Escolha o produtor do certificado.');
  const titular = await pecas.lerTitular(p.titularId);
  if (!titular) return nao(404, 'sem_titular', 'Produtor não encontrado.');
  if (!(await pecas.podeSubir(autor, titular.cliente_id))) return nao(403, 'sem_permissao', 'Só o administrador do cliente sobe o certificado.');
  if (!p.arquivo || p.arquivo.length === 0) return nao(400, 'sem_arquivo', 'Escolha o arquivo do certificado (.pfx ou .p12).');
  if (p.arquivo.length > TAMANHO_MAXIMO) {
    await pecas.registrarRecusa(titular.id, autor, 'arquivo_grande');
    return nao(422, 'nao_a1', FRASES_DA_RECUSA.nao_a1);
  }
  if (!p.senha) return nao(400, 'sem_senha', 'Digite a senha do certificado.');

  const lido = lerCertificadoA1(p.arquivo, p.senha, { documentoDoTitular: titular.documento, agora: pecas.agora() });
  if (lido.ok === false) {
    await pecas.registrarRecusa(titular.id, autor, lido.recusa);
    return nao(422, lido.recusa, lido.frase);
  }

  const c = lido.certificado;
  /* AGENDA-01 F3 (Gabriel 27/11): a cadeia na HORA de subir — o mesmo conferidor da busca, completando com as ACs públicas da ICP-Brasil.
     Não fecha = recusa com a frase, nada gravado (antes, o .pfx sem a AC entrava "ativo" e nunca buscava). */
  const cadeia = (pecas.conferirCadeia ?? cadeiaDaSubida)(p.arquivo, p.senha, c.impressaoDigital, pecas.agora());
  if (!cadeia || cadeia.ok === false) {
    await pecas.registrarRecusa(titular.id, autor, 'cadeia');
    return nao(422, 'cadeia', cadeia && cadeia.ok === false ? cadeia.frase : 'Não consegui conferir a cadeia do certificado. Nada foi gravado.');
  }
  const caminho = `${titular.cliente_id}/${titular.id}/${pecas.novoId()}.pfx.enc`;
  await pecas.gravarObjeto(caminho, await pecas.cifrar(p.arquivo));
  try {
    const r = await pecas.registrar({
      titularId: titular.id, autor, objeto: caminho, senha: p.senha,
      meta: { documento: c.documento, emissor: c.emissor ?? '', numero_serie: c.numeroSerie, impressao_digital: c.impressaoDigital,
        valido_de: c.validoDe.toISOString(), valido_ate: c.validoAte.toISOString() },
    });
    return { status: 200, corpo: { ok: true, certificado_id: r.certificadoId, acao: r.acao, avisos: lido.avisos, cadeia,
      certificado: { ...c, validoDe: c.validoDe.toISOString(), validoAte: c.validoAte.toISOString() } } };
  } catch (e) {
    await pecas.apagarObjeto(caminho);
    const msg = e instanceof Error ? e.message : '';
    /* as recusas do banco já vêm com a frase pronta ("… Nada foi gravado."); o resto não vai cru à tela */
    return /Nada foi gravado|Só o administrador/.test(msg) ? nao(422, 'banco', msg) : nao(500, 'banco', 'Não consegui gravar o certificado. Nada foi gravado; tente de novo.');
  }
}
