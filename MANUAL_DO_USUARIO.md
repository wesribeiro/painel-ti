# MANUAL DO USUÁRIO: Painel T.I. - Rede Nilo

Bem-vindo ao Painel T.I. Esta ferramenta foi criada para centralizar e otimizar a gestão dos PDVs (Pontos de Venda) da Rede Nilo.

---

## 1. Introdução

O Painel T.I. substitui controles manuais (como planilhas ou grupos de WhatsApp) por um sistema centralizado onde o status de cada caixa é monitorado e um histórico de ações é mantido.

### Funcionalidades Principais

- Monitoramento de status de PDVs em tempo real.
- Registro de histórico de manutenção e problemas.
- Sistema de Checklist Diário para verificação obrigatória.
- Gestão de "Pendências" (problemas abertos).
- Administração de lojas, usuários e permissões.

---

## 2. Primeiros Passos

### 2.1. Acesso e Login

A aplicação é acessível pelo navegador do seu celular ou computador.

1.  **Usuário:** Seu nome de usuário (ex: "fulano").
2.  **Senha:** Na primeira vez que você acessar, deixe o campo "Senha" **em branco**.

### 2.2. Definindo sua Senha (1º Acesso)

Se você deixar a senha em branco no primeiro login, o sistema exigirá que você defina uma nova senha.

1.  Insira seu usuário e clique em "Entrar".
2.  Um modal de "Definir sua Senha" aparecerá.
3.  Digite sua nova senha (mínimo 3 caracteres).
4.  Confirme a nova senha.
5.  Clique em "Definir Senha".

Você será enviado de volta à tela de login para entrar com sua nova senha.

### 2.3. Alterando sua Senha (Esqueci a Senha)

Se você já definiu uma senha mas a esqueceu (ou apenas quer alterá-la):

1.  Na tela de login, digite seu **Usuário**.
2.  Clique no link "Esqueci / Alterar minha senha" abaixo do botão "Entrar".
3.  Um modal de "Alterar Senha" aparecerá.
4.  Digite sua **Senha Atual**.
5.  Digite a **Nova Senha** e confirme-a.
6.  Clique em "Definir Senha".

---

## 3. Módulo Principal (Painel PDV)

Esta é a tela principal do sistema.

### 3.1. Visão Geral

- **Menu Lateral:** No canto superior esquerdo (ícone de "hambúrguer"), você pode "Mudar de Loja", acessar a "Administração" (se tiver permissão) ou "Sair".
- **Dashboard (Topo):** Um carrossel que mostra (1) O status geral dos PDVs da loja, (2) O status do checklist do dia, e (3) Problemas recorrentes.
- **Controle de Checklist:** Botão para "Iniciar" ou "Continuar" o checklist diário.
- **Lista de PDVs:** A lista de todos os caixas da loja selecionada.

### 3.2. Entendendo o Status do PDV

Cada PDV na lista possui uma cor e um status:

- **Verde (Ok):** O PDV foi verificado e está operacional.
- **Laranja (Atenção):** O PDV está operacional, mas requer atenção (ex: "Scanner lento").
- **Vermelho (Manutenção):** O PDV está parado ou com um problema crítico (ex: "Não liga").
- **Cinza (Sem status / Reserva):** O PDV ainda não foi verificado ou está em status de reserva.

**IMPORTANTE (V2.1):** O status de um PDV é, na verdade, um reflexo de suas **pendências**. Se um PDV tem uma pendência de "Manutenção" aberta, ele ficará "Vermelho" até que essa pendência seja resolvida, mesmo que outros status "Ok" sejam adicionados.

### 3.3. Registrando um Status (Abrindo uma Pendência)

Quando um PDV apresenta um problema (ex: "Monitor quebrou"), você deve registrar isso.

1.  Clique no card do PDV desejado (ex: "Caixa 101").
2.  O modal "Detalhes do Caixa" abrirá.
3.  Clique no botão "Adicionar Status".
4.  No modal "Adicionar novo status":
    - **Status:** Selecione o status (ex: "Manutenção").
    - **Componente (Obrigatório):** Selecione o item que deu problema (ex: "Monitor"). Esta etapa é obrigatória se o status não for "Ok".
    - **Descrição:** Descreva o problema (ex: "Tela do monitor quebrou após queda.").
5.  Clique em "Salvar".

Ao fazer isso, você **automaticamente cria uma Pendência** para este componente. O PDV ficará com o status "Manutenção" (vermelho) até que esta pendência seja resolvida.

### 3.4. Visualizando e Resolvendo uma Pendência (V2.1)

Quando você abre o modal "Detalhes do Caixa" (clicando em um PDV), você verá duas seções:

1.  **Pendências do Caixa:** Lista os problemas ATUAIS (abertos) daquele PDV.
2.  **Histórico de Status:** Lista todas as ações já feitas (incluindo as resolvidas).

Para resolver um problema:

1.  Na lista de "Pendências do Caixa", clique na pendência que você deseja resolver (o card vermelho).
2.  O modal "Solucionar Pendência" aparecerá, mostrando os detalhes do problema.
3.  No campo "Descrição da Solução", descreva o que foi feito (ex: "Monitor substituído pelo do patrimônio X.").
4.  Clique em "Marcar como Resolvido".

**O que acontece?**

- A pendência é fechada e movida para o histórico.
- Se não houverem **outras** pendências abertas para aquele PDV, o sistema automaticamente registra um status "Ok" para ele, e o PDV volta a ficar verde no painel.

---

## 4. Módulo de Checklist

O checklist é uma verificação diária obrigatória.

### 4.1. Iniciando ou Continuando

No painel principal, clique no botão "Iniciar Checklist do Dia" (ou "Continuar Checklist"). Você será levado à tela de checklist, que lista todos os PDVs da loja.

- PDVs em branco: Pendentes.
- PDVs em verde/vermelho/cinza: Já verificados hoje.

### 4.2. Preenchendo o Checklist de um PDV

1.  Clique em um PDV pendente (branco).
2.  O modal "Verificando Caixa" abrirá.
3.  **Status do PDV:** Selecione o status atual ("Ok", "Atenção" ou "Manutenção").
4.  **Se "Problema":** Se o status não for "Ok", a lista de "Itens com problema" aparecerá. Marque os componentes que falharam (ex: "Verificar Teclado").
5.  **Observações:** Descreva o que foi encontrado. (Obrigatório se o status mudar).
6.  Clique em "Incluir" (para salvar e voltar à lista) ou use os botões "Anterior" / "Próximo" para navegar entre os PDVs sem fechar o modal.
7.  **Caixa Ocupado:** Se não puder verificar o caixa, use o botão "Caixa Ocupado".

### 4.3. Salvando e Finalizando

- **Salvar:** A qualquer momento, clique em "Salvar" (botão amarelo) no topo da tela para salvar seu progresso sem finalizar.
- **Finalizar:** Quando todos os PDVs da lista forem verificados (não estiverem mais "Pendentes"), clique em "Finalizar" (botão verde).
  - Uma confirmação será pedida.
  - Ao confirmar, o sistema irá "commitar" todas as suas ações: todos os status "Ok", "Atenção" e "Manutenção" serão registrados no histórico, e todos os "Problemas" se tornarão **Pendências** abertas, exatamente como se tivessem sido criados manualmente (item 3.3).

### 4.4. Exportando um Relatório (para GLPI)

Ao visualizar um checklist antigo (seja pelo "Histórico de Checklist" no menu Admin, ou pelo Log de Ações), você verá novos botões no rodapé do modal de visualização:

- **Copiar Texto:** Clica neste botão para copiar um relatório completo (dados do checklist + pendências atuais da loja) como texto puro. Ideal para colar diretamente no corpo de um chamado no GLPI.
- **Baixar PNG:** Clica neste botão para gerar e baixar uma imagem (PNG) do relatório completo. Ideal para anexar a um chamado no GLPI como evidência visual.

---

## 5. Módulo de Administração

Acessível pelo menu lateral (apenas para usuários com permissão).

### 5.1. Gerenciar Usuários

- Permite criar novos usuários (a senha inicial é nula, exigindo que o usuário a defina no 1º acesso).
- Permite visualizar, editar (nome, usuário, cargo, loja padrão) ou remover usuários existentes.

### 5.2. Gerenciar Lojas

- Permite criar novas lojas.
- Permite editar o nome da loja.
- **Gerenciar (Botão):** Abre um modal para adicionar ou remover PDVs de uma loja.
- **Config. Checklist (Botão):** Permite definir o "Nº de dias para alerta" (V2.1) e adicionar itens de verificação específicos para aquela loja.
- **Gerenciar Itens Padrão:** Permite adicionar ou remover componentes da lista padrão de checklist (ex: "Balança", "Pinpad").

### 5.3. Gerenciar Status

- Permite criar novos tipos de status (ex: "Em Análise", "Aguardando Peça") e definir suas cores.

### 5.4. Gerenciar Permissões

- Permite criar novos cargos (ex: "Suporte N1", "Técnico Local").
- Permite editar as permissões de cada cargo (ex: quem pode ver logs, quem pode gerenciar usuários).

### 5.5. Registros e Logs

- **Ações Administrativas:** Um log de auditoria. Registra quem criou/editou/removeu um usuário, loja, cargo, etc.
- **Log de PDVs:** Um filtro mestre que permite ver o `statusHistory` completo de todos os PDVs de uma loja selecionada.

### 5.6. Histórico de Checklist

- Permite visualizar todos os checklists já finalizados, com filtros por loja.
- Clicar em "Visualizar" abre o modal de relatório (o mesmo usado na seção 4.4).
