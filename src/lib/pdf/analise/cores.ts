/**
 * cores — paleta do PDF Executivo, SEM dependência do motor.
 *
 * ⚠ ESTE ARQUIVO EXISTE PARA NÃO ARRASTAR O REACT-PDF. A paleta morava em
 * `estilos.ts`, que importa `@react-pdf/renderer` para montar o StyleSheet.
 * Como o gerador precisa de duas cores (`COR.cinzaMedio`) ANTES de decidir
 * gerar, aquele `import` era estático — e um import estático de `estilos`
 * puxa o motor inteiro para o bundle principal, anulando o `import()`
 * dinâmico logo abaixo. Medido: o marcador do pdfkit aparecia em
 * `index-*.js` (7,4 MB), e o chunk tardio tinha só 17 kB de componente.
 *
 * ⚠ QUEM PRECISA DE COR E NÃO DESENHA importa daqui. Quem desenha continua
 * importando de `estilos`, que reexporta esta mesma constante — uma paleta
 * só, dois caminhos de acesso.
 */
export const COR = {
  azul: '#1e3a5f',
  azulClaro: '#eef6ff',
  cinza: '#505050',
  cinzaMedio: '#787878',
  separador: '#d9e2ec',
  zebra: '#f7fafc',
  verde: '#22784a',
  vermelho: '#b91c1c',
  ambar: '#d77706',
  branco: '#ffffff',
};
