# Dashboard — Organização de Demandas

Base visual da Fase 1 para organizar, acompanhar e apresentar demandas.

## Executar

Abra o terminal nesta pasta e use:

```bash
python -m http.server 5500
```

Depois, acesse `http://localhost:5500`.

Não é necessário instalar dependências nesta fase.

## Estrutura

- `index.html`: estrutura semântica e telas navegáveis;
- `assets/css/theme.css`: variáveis e temas claro/escuro;
- `assets/css/main.css`: estilos globais;
- `assets/css/layout.css`: header, sidebar e organização;
- `assets/css/components.css`: botões, cards, tabelas, modal e toast;
- `assets/css/responsive.css`: desktop, tablet e celular;
- `assets/js/config.js`: nome provisório, subtítulo e versão;
- `assets/js/data.js`: dados fictícios;
- `assets/js/theme.js`: tema e persistência local;
- `assets/js/clock.js`: data e hora;
- `assets/js/ui.js`: navegação, menu, modal, toast e apresentação;
- `assets/js/demands.js`: tabela, filtros e cadastro demonstrativo;
- `assets/js/dashboard.js`: KPIs e períodos;
- `assets/js/charts.js`: gráficos Chart.js;
- `assets/js/main.js`: inicialização.

## Fase 1 funcional

- tema claro e escuro;
- sidebar recolhível e menu mobile;
- Home com botões cápsula em gradiente animado;
- KPIs, gráficos e tabela fictícia;
- busca e filtros;
- cadastro demonstrativo em memória;
- modal e toast personalizados;
- modo apresentação;
- responsividade e suporte a teclado;
- redução de animações quando configurada no dispositivo.

IndexedDB, CRUD definitivo, Excel, PDF, backup, clima por API, login e backend permanecem para as próximas fases.
