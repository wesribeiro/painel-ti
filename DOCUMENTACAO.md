# DOCUMENTAÇÃO DO PROJETO: Painel T.I. - Rede Nilo

Este documento serve como a fonte central de verdade para o desenvolvimento, manutenção e entendimento do sistema "Painel T.I.".

---

## 1. Visão Geral do Projeto

### 1.1. O Problema (Requisito Não-Técnico)

A equipe de T.I. da Rede Nilo Supermercados necessita de uma ferramenta centralizada para monitorar e gerenciar o status operacional dos Pontos de Venda (PDVs) em todas as lojas. Atualmente, o controle é feito de forma descentralizada (planilhas, grupos de WhatsApp), o que gera ruído, perda de histórico e dificuldade em identificar problemas recorrentes ou o status real de um caixa.

### 1.2. A Solução (O Produto)

O "Painel T.I." é uma aplicação web (PWA) _mobile-first_ que funciona como um _dashboard_ operacional e ferramenta de registro. Técnicos e gestores podem:

1.  Visualizar o status de todos os PDVs de uma loja em tempo real.
2.  Registrar atualizações de status, manutenções e problemas em PDVs específicos.
3.  Consultar o histórico de intervenções de um PDV.
4.  Realizar um "Checklist Diário" obrigatório, garantindo a verificação de todos os caixas.
5.  Administrar usuários, lojas, PDVs e permissões.
6.  Gerenciar um sistema de "Pendências" (Problemas) para rastrear o que está com defeito.

O objetivo é criar um histórico rastreável, identificar gargalos e centralizar a comunicação operacional da equipe de T.I.

---

## 2. Requisitos Técnicos e Arquitetura

O sistema é construído como uma aplicação monolítica servida por Node.js, com uma API RESTful (JSON) e um frontend _vanilla_ (puro).

### 2.1. Estrutura de Pastas

painel-ti-servidor/
├── .gitignore
├── commit_message.md (Novo)
├── DOCUMENTACAO.md (Atualizado)
├── MANUAL_DO_USUARIO.md (Atualizado)
├── database.js
├── fix-checklists.js
├── migration.js
├── old/
│ ├── OLD.JS
│ └── old.html
├── package-lock.json
├── package.json
├── painel-ti.sqbpro
├── public/
│ ├── assets/
│ │ ├── icon-192x192.png
│ │ ├── icon-512x512.png
│ │ └── logo-ti.png
│ ├── app.js
│ ├── index.html
│ ├── manifest.json
│ ├── service-worker.js
│ └── style.css
└── server.js

### 2.2. Tecnologias (Stack)

#### 2.2.1. Backend

- **Node.js:** Ambiente de execução.
- **Express.js:** Framework principal para o servidor e API.
- **sqlite3 / sqlite:** Drivers para o banco de dados SQLite.
- **bcrypt:** Geração e comparação de hashes de senha.
- **jsonwebtoken (JWT):** Autenticação baseada em token.
- **cors:** Habilitação de Cross-Origin Resource Sharing.

#### 2.2.2. Frontend

- **HTML5 / CSS3 / JavaScript (ES6+):** A base (Vanilla JS).
- **Tailwind CSS** (via CDN): Framework de UI utilitário.
- **html2canvas.js** (via CDN): Utilizada para capturar o DOM de um relatório formatado e convertê-lo em uma imagem PNG para download.

#### 2.2.3. Banco de Dados

- **SQLite:** Banco de dados relacional embarcado, escolhido pela simplicidade de implantação e manutenção (arquivo único).

---

## 3. Diário de Bordo (Cronologia das Versões)

### V1.0: Conceito e Estrutura Inicial

- **Data:** (Indefinida)
- **Objetivo:** Criar a estrutura básica do servidor Node.js/Express e o banco de dados SQLite.
- **Alterações:**
  - Criação do `server.js` e `database.js`.
  - Definição do Schema V1 (Users, Roles, Stores, PDVs, StatusTypes, StatusHistory).
  - Criação de um `index.html` e `app.js` (versão simulada, com _mock data_) para validar o conceito.

### V2.0: Lançamento do Backend Real e Migração

- **Data:** (Indefinida)
- **Objetivo:** Substituir o `app.js` simulado pelo `app.js` real (V2.0), implementar a API RESTful completa no `server.js` e introduzir o novo sistema de "Problems" (Pendências).
- **Alterações:**
  - **Backend (server.js):** Implementação de todos os endpoints CRUD para a V1 (login, usuários, lojas, pdvs, status, logs).
  - **Backend (database.js):** Adição das novas tabelas V2.0 (`problems`, `assets`, `asset_movements`) e correções no _seeding_ inicial.
  - **Frontend (app.js):** Refatoração completa para consumir a API real (`/api/...`) em vez de dados mocados.
  - **Autenticação:** Introdução de `bcrypt` e `jsonwebtoken (JWT)`. O login agora gera um token que é usado para autenticar requisições.
  - **Migração (migration.js):** Criação de um script dedicado para migrar dados de um banco `painel-ti-old.sqlite` (Schema V1) para o novo `painel-ti.sqlite` (Schema V2), transformando `statusHistory` antigos em `problems`.

### V2.1: Refatoração do Sistema de Status e Problemas

- **Data:** (Indefinida)
- **Objetivo:** Corrigir a lógica de negócios onde o status de um PDV ("Ok", "Atenção", "Manutenção") era dissociado da existência de uma pendência (problema).
- **Alterações:**
  - **Regra de Negócio:** O status visual de um PDV passa a ser derivado da existência (ou não) de um `problem` aberto. Se houver um problema aberto, o status é o do problema; se não houver, o status é o último registrado no `statusHistory` (geralmente "Ok").
  - **Backend (server.js):** Endpoint `GET /stores/:id/pdvs-with-status` foi reescrito para implementar essa nova regra de negócio, consultando a tabela `problems` antes do `statusHistory`.
  - **Backend (server.js):** Endpoint `POST /pdvs/:id/status-history` (ao adicionar um status) foi modificado:
    - Se o status for "Ok", ele _não_ cria um problema.
    - Se o status for "Atenção" ou "Manutenção", ele _automaticamente cria_ um novo registro na tabela `problems` associado ao PDV.
  - **Frontend (app.js):** O modal `pdv-details` foi atualizado para mostrar a nova lista de "Pendências" (vinda da tabela `problems`) separadamente do "Histórico de Status".
  - **Frontend (app.js):** Adicionado o modal `resolve-problem-modal` e a lógica para permitir que um técnico "Resolva" (feche) uma pendência.
  - **Backend (server.js):** Criação do endpoint `PUT /api/problems/:id/resolve` para marcar um problema como "Resolvido" e, se for a última pendência, registrar "Ok" no `statusHistory`.

### V2.2: Correção de Bugs (API e Validação)

- **Data:** (Indefinida)
- **Objetivo:** Corrigir um bug na chamada de API e melhorar a validação de entrada do usuário.
- **Alterações:**
  - **Frontend (app.js):** Corrigido um bug em `renderResolveProblemModal` onde a chamada de API estava duplicando o prefixo (`/api/api/...`).
  - **Frontend (app.js):** Adicionada validação no modal "Adicionar Status" (`add-status-modal`) para obrigar o usuário a selecionar um "Componente com Problema" caso o status selecionado não seja "Ok".
  - **Backend (server.js):** Corrigido o nome da coluna no endpoint `PUT /api/problems/:id/resolve` (de `solutionNotes` para `resolution_notes`) para corresponder ao schema do banco de dados (definido no `migration.js`).

### V2.3: Exportação de Checklist para GLPI (Texto e PNG)

- **Data:** 09/11/2025
- **Objetivo:** Adicionar funcionalidade para exportar o relatório de um checklist (visualizado no histórico) como texto formatado (para copiar/colar no GLPI) ou como imagem PNG (para anexar).
- **Alterações:**
  - **Backend (server.js):** Criação do novo endpoint `GET /api/checklists/:id/details-with-problems`, que busca os dados do checklist e todas as pendências (problemas) abertas dos PDVs associados.
  - **Frontend (index.html):** Adição da biblioteca `html2canvas` via CDN. Adição de botões ("Copiar Texto", "Baixar PNG") e um container de renderização (`#export-container`) ao modal de visualização de checklist.
  - **Frontend (app.js):** `renderViewChecklistModal` atualizado para usar o novo endpoint e exibir as pendências. Implementação da lógica de formatação de texto e geração de imagem (`html2canvas`) nos novos botões.

---

## 4. Documentação da API (Endpoints Principais)

Todos os endpoints são prefixados com `/api`. Endpoints que modificam dados (POST, PUT, DELETE) ou acessam dados sensíveis (GET /users, /logs) requerem um Token JWT no header `Authorization: Bearer <token>`.

### Autenticação

- `POST /auth/login`
- `POST /auth/change-password`
- `GET /auth/me` (Valida o token atual e retorna o payload do usuário)

### Usuários e Cargos

- `GET /users` (Retorna lista de usuários sem a senha)
- `POST /users` (Cria novo usuário)
- `PUT /users/:id` (Atualiza usuário)
- `DELETE /users/:id` (Remove usuário)
- `GET /roles` (Lista de cargos e permissões JSON)
- `POST /roles` (Cria novo cargo)
- `PUT /roles/:id` (Atualiza permissões do cargo)

### Lojas, PDVs e Itens

- `GET /stores` (Lista de lojas)
- `POST /stores` (Cria nova loja)
- `PUT /stores/:id` (Atualiza dados da loja)
- `DELETE /stores/:id` (Remove loja e PDVs associados)
- `GET /stores/:id/pdvs` (Lista de PDVs de uma loja)
- `GET /stores/:id/pdvs-with-status` (Principal endpoint da tela de PDV. Retorna PDVs com seu status atual calculado)
- `POST /stores/:id/pdvs` (Cria novo PDV na loja)
- `DELETE /pdvs/:id` (Remove um PDV)
- `GET /pdv-items` (Lista de componentes padrão, ex: Monitor)
- `POST /pdv-items` (Adiciona novo componente)
- `DELETE /pdv-items/:id` (Remove componente)

### Status e Problemas (Pendências)

- `GET /status-types` (Lista os status e suas cores, ex: Ok, Atenção)
- `GET /pdvs/:id` (Dados básicos de um PDV)
- `GET /pdvs/:id/history` (Retorna os últimos 20 eventos de status)
- `POST /pdvs/:id/status-history` (Registra um novo evento de status. **Gatilho:** Se o status não for "Ok", cria um `problem`.)
- `GET /pdvs/:id/problems` (Retorna as 5 últimas pendências, abertas ou fechadas, de um PDV)
- `GET /problems/:id` (Detalhes de um problema/pendência específica)
- `PUT /problems/:id/resolve` (Fecha uma pendência, marca como "Resolvido")

### Checklists

- `GET /checklists/today?storeId=:id` (Busca o checklist de hoje para a loja)
- `POST /checklists` (Cria ou atualiza (salva) um checklist. **Gatilho:** Se `status: 'completed'`, processa os resultados, atualiza o `statusHistory` e cria `problems`.)
- `GET /checklists/history?storeId=:id` (Lista checklists finalizados)
- `GET /checklists/:id` (Detalhes de um checklist específico)
- `GET /checklists/:id/details-with-problems`
  - **Descrição:** Obtém os dados completos de um checklist específico (para fins de relatório/visualização) E inclui uma lista de todos os problemas (pendências) que estão atualmente abertos (`status != 'Resolvido'`) para os PDVs que fazem parte desse checklist.
  - **Autenticação:** Requerida (Token JWT).
  - **Resposta (Sucesso 200 OK):**
    ```json
    {
      "checklist": {
        "id": 1,
        "date": "2025-11-09",
        "status": "completed",
        "pdvChecks": "[...]",
        "storeId": 1,
        "finalizedByUserId": 2
      },
      "openProblems": [
        {
          "id": 5,
          "pdv_id": 102,
          "title": "[CHECKLIST] Scanner não bipa",
          "created_at": "2025-11-09T10:30:00.000Z",
          "status": "Aberto",
          "itemName": "Scanner de Mão",
          "pdvNumber": "102"
        }
      ]
    }
    ```

### Logs

- `GET /logs/admin` (Lista de logs de ações administrativas)
- `POST /logs/admin` (Registra uma ação administrativa)
- `GET /logs/pdv?storeId=:id` (Lista de `statusHistory` de uma loja inteira)
