import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

/* FORN-FILIAL-01 — nenhum teste sai para a rede: a consulta pública do CNPJ (BrasilAPI) e a de municípios (IBGE) respondem "indisponível"
   aqui (o cadastro segue à mão, como no app sem rede). Quem testa a consulta injeta o `buscar` dela (`consultarCnpj(…, { buscar })`). */
const fetchDeVerdade = globalThis.fetch;
globalThis.fetch = async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
  if (/brasilapi\.com\.br|servicodados\.ibge\.gov\.br/.test(url)) return new Response('{}', { status: 503 });
  return fetchDeVerdade(entrada, init);
};
