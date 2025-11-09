feat(checklist): Adiciona exportação de checklist para PNG e Texto (GLPI)

Implementa a funcionalidade de exportação de relatórios de checklist no modal de visualização (histórico de checklist).

Esta funcionalidade visa otimizar o fluxo de trabalho dos técnicos, permitindo que o resultado do checklist diário seja facilmente copiado ou anexado aos chamados no GLPI.

Modificações:

- **Frontend (index.html):**

  - Adiciona a biblioteca `html2canvas` via CDN para a geração de imagens a partir do DOM.
  - Inclui os botões "Copiar Texto" e "Baixar PNG" no rodapé do modal `view-checklist-modal`.
  - Adiciona um container `div#export-container` (oculto) para ser usado como palco de renderização para o `html2canvas`.

- **Frontend (app.js):**

  - Atualiza `renderViewChecklistModal` para chamar o novo endpoint de detalhes.
  - Armazena os dados do checklist e das pendências no estado (`state.detailedChecklistData`).
  - Renderiza a lista de "Pendências Atuais da Loja" abaixo dos resultados do checklist no modal.
  - Implementa as funções `generateChecklistReportHTML` e `generateChecklistReportText` para formatar os dados.
  - Implementa os handlers `handleCopyChecklistText` (usando `navigator.clipboard`) e `handleDownloadChecklistPNG` (usando `html2canvas`).

- **Backend (server.js):**
  - Cria o novo endpoint autenticado `GET /api/checklists/:id/details-with-problems`.
  - O endpoint busca os dados do checklist solicitado e, adicionalmente, consulta o banco de dados para encontrar todas as pendências (status != 'Resolvido') associadas aos PDVs daquele checklist, retornando ambos os conjuntos de dados.

Refs: V2.3
