# ADR — App-shell operacional para telas ERP

**Data:** 04/07/2026 · **Status:** Aceito (padrão normativo).
Componente reutilizável OperationalShell.tsx: DEFERIDO para PR de
código próprio quando houver necessidade real (decisão 04/07/2026 —
não misturar documentação e código).

## Problema
Telas operacionais crescem verticalmente e escondem ações
importantes abaixo da dobra.

## Decisão — padrão obrigatório para telas operacionais
- página não rola no desktop; shell ocupa o viewport;
- header/toolbar sempre visíveis;
- conteúdo central usa flex-1 min-h-0;
- apenas listas/tabelas rolam;
- barra operacional sempre visível;
- sem scroll duplo.

Estrutura de referência (slots): header · toolbar · content ·
actionBar. Shell h-full flex flex-col min-h-0 overflow-hidden;
toolbar/actionBar flex-none; content flex-1 min-h-0; listas internas
controlam o próprio overflow.

## Anti-patterns proibidos
- page overflow-auto como scroll principal;
- empilhar cards com space-y até a página crescer;
- barra de ação abaixo da dobra;
- ausência de min-h-0 em qualquer nível da cadeia flex;
- max-h "mágico" para resolver layout.

## Checklist obrigatório (PR report de tela operacional)
[ ] página não rola no desktop · [ ] só lista/tabela rola ·
[ ] barra de ação visível · [ ] toolbar visível ·
[ ] sem scroll duplo · [ ] min-h-0 em todos os níveis flex

## Escopo de aplicação
Telas NOVAS nascem no padrão. Telas existentes migram sob demanda,
nunca em refactor amplo.
