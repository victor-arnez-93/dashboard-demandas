# FLUUX — Organização de Demandas

Versão reestruturada **v1.2.0**, mantendo a identidade visual aprovada e separando cada página em seu próprio HTML, CSS e JavaScript.

## Execução local

Na pasta do projeto:

```powershell
python -m http.server 5500
```

Acesse:

```text
http://localhost:5500
```

A entrada do sistema é `index.html`. O arquivo `dashboard.html` foi mantido somente como redirecionamento de compatibilidade para `inicio.html`.

## Estrutura

### Globais

- `assets/css/theme.css`: variáveis dos temas claro e escuro;
- `assets/css/main.css`: reset, estrutura comum, sidebar, topbar, clima, botões, formulários, tabelas-base, modais, toasts e responsividade global;
- `assets/js/shell.js`: estrutura compartilhada, navegação, sessão, tema, perfil e inicialização;
- `assets/js/store.js`: acesso e estado dos dados reais do Supabase;
- `assets/js/ui.js`: utilidades visuais compartilhadas;
- `assets/js/weather.js`: clima compacto no padrão solicitado;
- `assets/js/form-utils.js`: capitalização e validações reutilizáveis.

### Páginas

Cada página possui seu próprio trio de arquivos:

- `inicio.html` + `assets/css/inicio.css` + `assets/js/inicio.js`;
- `nova_demanda.html` + `assets/css/nova_demanda.css` + `assets/js/nova_demanda.js`;
- `demandas.html` + `assets/css/demandas.css` + `assets/js/demandas.js`;
- `analises.html` + `assets/css/analises.css` + `assets/js/analises.js`;
- `relatorios.html` + `assets/css/relatorios.css` + `assets/js/relatorios.js`;
- `cadastros.html` + `assets/css/cadastros.css` + `assets/js/cadastros.js`;
- `conversores.html` + `assets/css/conversores.css` + `assets/js/conversores.js`;
- `configuracoes.html` + `assets/css/configuracoes.css` + `assets/js/configuracoes.js`;
- `apresentar.html` + `assets/css/apresentar.css` + `assets/js/apresentar.js`.

## Banco de dados

A migração v1.2.0 já foi executada no Supabase. **Não execute novamente o SQL** durante a substituição dos arquivos.

A aplicação usa:

- Supabase Auth;
- RLS;
- `profiles` e `app_settings`;
- `demands` com gestor separado de responsável;
- cadastros de gestores, responsáveis, departamentos, categorias e locais;
- registros de sustentação de conversores de mídia;
- Storage `avatars`.

## Substituição do projeto

O ZIP completo não contém `.git` nem `.idea`. Preserve essas pastas na pasta oficial, remova os demais arquivos antigos e copie o conteúdo novo.

O arquivo `assets/js/env.js` incluído é uma cópia exata do projeto recebido e deve permanecer protegido. Nunca coloque nele `service_role`, `sb_secret`, senha do banco ou outro segredo privado.
