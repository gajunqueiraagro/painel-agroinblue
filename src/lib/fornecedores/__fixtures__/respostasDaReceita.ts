/* P31 — respostas GRAVADAS da consulta pública do CNPJ (BrasilAPI), no formato medido em 23/10/2026, com empresas SINTÉTICAS. */
/* uma com fantasia; e uma sem (a API manda "") */
export const RESPOSTA_COM_FANTASIA = { cnpj: '11222333000181', razao_social: 'OMEGA COMERCIO DE MATERIAIS DE CONSTRUCAO LTDA',
  nome_fantasia: 'OMEGA COMERCIO DE MATERIAIS', descricao_identificador_matriz_filial: 'FILIAL', descricao_tipo_de_logradouro: 'RUA',
  logradouro: 'DAS PEDRAS', numero: '500', complemento: '', bairro: 'CENTRO', municipio: 'CAMPO GRANDE', codigo_municipio_ibge: 5002704, uf: 'MS', cep: '79000000' };
export const RESPOSTA_SEM_FANTASIA = { ...RESPOSTA_COM_FANTASIA, cnpj: '11444777000161', razao_social: 'SIGMA ALIMENTOS S.A.', nome_fantasia: '' };
