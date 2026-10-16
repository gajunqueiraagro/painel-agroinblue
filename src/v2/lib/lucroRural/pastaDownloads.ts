/**
 * FIN-LR-SYNC-01 passo c — a pasta Downloads autorizada no navegador (File System Access API) e guardada no IndexedDB.
 * ⚠ Nada sai do navegador: a pasta só é LIDA aqui, e o arquivo segue pelo leitor de sempre (`lerArquivoLr`).
 * ⚠ TUDO TEM REDE: navegador sem a API (Safari/Firefox), IndexedDB indisponível ou bloqueado, handle torto — vira "sem pasta" e a
 *   tela cai no arrastar. Nunca lança.
 * A interface `FontePastaLr` existe para o teste trocar o navegador por uma fonte de mentira.
 */
import { tipoDoRelatorio } from './pastaLr';

export type PermissaoDaPasta = 'granted' | 'denied' | 'prompt';

export interface PastaLr {
  nome: string;
  /** `pedir` = requestPermission (só num clique); senão queryPermission. */
  permissao: (pedir: boolean) => Promise<PermissaoDaPasta>;
  /** Só os relatórios do LR (o nome é olhado antes de abrir o arquivo). */
  listarRelatorios: () => Promise<File[]>;
  /** O objeto do navegador, para guardar no IndexedDB. */
  bruto: unknown;
}

export interface FontePastaLr {
  disponivel: boolean;
  escolher: () => Promise<PastaLr | null>;
  lerGuardada: () => Promise<PastaLr | null>;
  guardar: (p: PastaLr) => Promise<boolean>;
  esquecer: () => Promise<void>;
}

const BANCO = 'agroinblue-lucro-rural';
const LOJA = 'pasta';
const CHAVE = 'downloads';

const ehObj = (v: unknown): v is object => typeof v === 'object' && v !== null;

/** O handle do navegador como `PastaLr`, ou nulo se não tiver a forma esperada. */
export function comoPasta(h: unknown): PastaLr | null {
  if (!ehObj(h)) return null;
  const q = Reflect.get(h, 'queryPermission');
  const r = Reflect.get(h, 'requestPermission');
  const v = Reflect.get(h, 'values');
  if (typeof q !== 'function' || typeof r !== 'function' || typeof v !== 'function') return null;
  const nome = String(Reflect.get(h, 'name') ?? '');
  return {
    nome, bruto: h,
    permissao: async (pedir) => {
      try {
        const s: unknown = await (pedir ? r : q).call(h, { mode: 'read' });
        return s === 'granted' || s === 'denied' ? s : 'prompt';
      } catch { return 'prompt'; }
    },
    listarRelatorios: async () => {
      const out: File[] = [];
      const iter: unknown = v.call(h);
      if (!ehObj(iter) || typeof Reflect.get(iter, Symbol.asyncIterator) !== 'function') return out;
      const proximo = Reflect.get(iter, 'next');
      if (typeof proximo !== 'function') return out;
      for (;;) {
        const passo: unknown = await proximo.call(iter);
        if (!ehObj(passo) || Reflect.get(passo, 'done') === true) break;
        const e: unknown = Reflect.get(passo, 'value');
        if (!ehObj(e) || Reflect.get(e, 'kind') !== 'file') continue;
        if (!tipoDoRelatorio(String(Reflect.get(e, 'name') ?? ''))) continue;
        const gf = Reflect.get(e, 'getFile');
        if (typeof gf !== 'function') continue;
        const f: unknown = await gf.call(e);
        if (f instanceof File) out.push(f);
      }
      return out;
    },
  };
}

function abrirBanco(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(BANCO, 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore(LOJA); } catch { /* já existe */ } };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

function naLoja<R>(modo: IDBTransactionMode, fazer: (s: IDBObjectStore) => IDBRequest<R> | null): Promise<R | null> {
  return abrirBanco().then(db => new Promise(resolve => {
    if (!db) { resolve(null); return; }
    try {
      const req = fazer(db.transaction(LOJA, modo).objectStore(LOJA));
      if (!req) { resolve(null); return; }
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
    finally { try { db.close(); } catch { /* nada */ } }
  }));
}

/** A fonte do navegador de verdade. */
export function fonteDoNavegador(): FontePastaLr {
  const picker = typeof window !== 'undefined' ? Reflect.get(window, 'showDirectoryPicker') : undefined;
  return {
    disponivel: typeof picker === 'function',
    escolher: async () => {
      if (typeof picker !== 'function') return null;
      try { return comoPasta(await picker.call(window, { id: 'lucro-rural', mode: 'read', startIn: 'downloads' })); }
      catch { return null; } /* o operador cancelou o seletor */
    },
    lerGuardada: async () => comoPasta(await naLoja<unknown>('readonly', s => s.get(CHAVE))),
    guardar: async (p) => (await naLoja('readwrite', s => s.put(p.bruto, CHAVE))) !== null,
    esquecer: async () => { await naLoja('readwrite', s => s.delete(CHAVE)); },
  };
}
