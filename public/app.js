// painel-ti-servidor/public/app.js - VERSÃO COMPLETA E DEFINITIVA COM JWT

// --- OBJETO AUXILIAR PARA CHAMADAS DE API (ATUALIZADO PARA JWT) ---
const api = {
  async request(endpoint, method = "GET", body = null) {
    const token = localStorage.getItem("authToken");
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const options = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`/api${endpoint}`, options);

      // --- MUDANÇA PRINCIPAL AQUI ---
      // Se a resposta não for 'OK', verificamos o status.
      if (!response.ok) {
        // Se for um erro 404 (Não Encontrado), nós o tratamos como uma falha silenciosa.
        // Em vez de gerar um erro, simplesmente lançamos uma exceção que será capturada
        // pelo `.catch(() => null)` na chamada da função, sem mostrar nada.
        if (response.status === 404) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Recurso não encontrado.");
        }

        // Para QUALQUER OUTRO tipo de erro (500, 403, etc.), mostramos o erro.
        const errorData = await response.json();
        console.error(`API Error (${method} ${endpoint}):`, errorData);
        showToast(errorData.message || "Ocorreu um erro no servidor.", "error");
        throw new Error(errorData.message);
      }

      // Se a resposta for bem-sucedida
      if (response.status === 204) {
        return null;
      } // Resposta de sucesso sem conteúdo (ex: DELETE)
      return await response.json();
    } catch (error) {
      // Este bloco 'catch' agora só será acionado por falhas de rede (servidor offline)
      // ou pelos erros que lançamos intencionalmente acima.

      // Relança o erro para que a lógica da aplicação (como o .catch(()=>null)) possa funcionar.
      throw error;
    }
  },
  get: (endpoint) => api.request(endpoint, "GET"),
  post: (endpoint, body) => api.request(endpoint, "POST", body),
  put: (endpoint, body) => api.request(endpoint, "PUT", body),
  delete: (endpoint) => api.request(endpoint, "DELETE"),
};

// --- ESTADO GLOBAL DO FRONT-END ---
let state = {
  loggedInUser: null,
  currentStore: null,
  allData: { roles: [], stores: [], pdvItems: [], statusTypes: [] },
  activeScreen: "login",
  activeModal: null,
  selectedPdvId: null,
  selectedStoreId: null,
  selectedUserId: null,
  selectedRoleId: null,
  userForPasswordChange: null,
  isFirstLoginForPasswordChange: false,
  actionToConfirm: null,
  activeChecklist: null,
  currentChecklistPdvIndex: -1,
  selectedChecklistId: null,
  dashboardActiveSlide: 0,
  checklistItemToAdd: null,
};

// --- LÓGICA DE PERMISSÕES ---
const can = {
  permission: (perm) => {
    if (!state.loggedInUser || !state.allData.roles.length) return false;
    const role = state.allData.roles.find(
      (r) => r.id === state.loggedInUser.roleId
    );
    return role?.permissions?.[perm];
  },
  editStatus: (pdv) => {
    if (!state.loggedInUser || !pdv || !state.allData.roles.length)
      return false;
    const role = state.allData.roles.find(
      (r) => r.id === state.loggedInUser.roleId
    );
    if (!role?.permissions) return false;
    const perm = role.permissions.editPdvStatus;
    if (perm === "all") return true;
    if (perm === "own" && state.loggedInUser.storeId === pdv.storeId)
      return true;
    return false;
  },
};

// --- FUNÇÕES DE UTILIDADE E UI ---
function openMenu() {
  document.getElementById("side-menu").classList.remove("-translate-x-full");
  document.getElementById("menu-overlay").classList.remove("hidden");
}
function closeMenu() {
  document.getElementById("side-menu").classList.add("-translate-x-full");
  document.getElementById("menu-overlay").classList.add("hidden");
}
async function handleLogout() {
  localStorage.removeItem("authToken");
  state.loggedInUser = null;
  state.currentStore = null;
  closeMenu();
  await showModal(null);
  await showScreen("login");
}
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  const colors = {
    success: "bg-green-500",
    error: "bg-red-500",
    info: "bg-blue-500",
  };
  toast.className = `px-6 py-3 rounded-lg text-white text-sm font-semibold shadow-lg transition-all duration-300 transform opacity-0 -translate-y-4 ${colors[type]}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.remove("opacity-0", "-translate-y-4"), 10);
  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-4");
    toast.addEventListener("transitionend", () => toast.remove());
  }, 3000);
}
function getTodayDateString() {
  return new Date().toISOString().split("T")[0];
}
async function logAction(description, metadata = {}) {
  if (!state.loggedInUser) return; // Não faz nada se não houver usuário logado

  try {
    await api.post("/logs/admin", {
      description,
      metadata,
      // Estes campos estavam faltando na versão anterior:
      userId: state.loggedInUser.id,
      userName: state.loggedInUser.name,
    });
  } catch (error) {
    console.error("Falha ao registrar a ação no servidor:", error);
  }
}

function groupLogsByMonth(logs) {
  return logs.reduce((acc, log) => {
    const date = new Date(log.timestamp);
    const monthYear = date.toLocaleString("pt-BR", {
      month: "long",
      year: "numeric",
    });
    const capitalizedMonthYear =
      monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
    if (!acc[capitalizedMonthYear]) {
      acc[capitalizedMonthYear] = [];
    }
    acc[capitalizedMonthYear].push(log);
    return acc;
  }, {});
}

// --- FUNÇÕES DE CONTROLE DE TELA E MODAL ---
function applyStatusColors() {
  let styleSheet = document.getElementById("dynamic-styles");
  if (!styleSheet) {
    styleSheet = document.createElement("style");
    styleSheet.id = "dynamic-styles";
    document.head.appendChild(styleSheet);
  }
  const colorMap = {
    blue: "#3b82f6",
    green: "#22c55e",
    yellow: "#eab308",
    orange: "#f97316",
    red: "#ef4444",
    purple: "#8b5cf6",
    gray: "#6b7280",
    black: "#000000",
  };
  if (state.allData.statusTypes?.length > 0) {
    styleSheet.innerHTML = state.allData.statusTypes
      .map(
        (s) =>
          `.status-border-${s.id}{border-left-color:${
            colorMap[s.color] || "#e5e7eb"
          }} .status-text-${s.id}{color:${
            colorMap[s.color] || "#e5e7eb"
          }} .status-bg-${s.id}{background-color:${
            colorMap[s.color] || "#e5e7eb"
          }}`
      )
      .join(" ");
  }
}

async function showScreen(screenName) {
  document.querySelectorAll("main > section").forEach((s) => {
    s.classList.add("hidden");
    s.classList.remove("flex", "flex-col");
  });
  const screen = document.getElementById(`${screenName}-screen`);
  if (screen) {
    screen.classList.remove("hidden");
    screen.classList.add("flex", "flex-col");
  }
  state.activeScreen = screenName;
  const renderMap = {
    pdv: renderPdvScreen,
    "admin-main-menu": renderAdminMainMenu,
    "admin-users": renderAdminUsersScreen,
    "admin-users-list": renderAdminUsersListScreen,
    "admin-stores": renderAdminStoresScreen,
    "admin-status": renderAdminStatusScreen,
    "admin-roles": renderAdminRolesScreen,
    "admin-logs-menu": () => {},
    "admin-administrative-logs": renderAdministrativeLogsScreen,
    "admin-pdv-logs": renderPdvLogsScreen,
    checklist: renderChecklistScreen,
    "checklist-history": renderChecklistHistoryScreen,
    "admin-pdv-items": renderAdminPdvItemsScreen,
  };
  try {
    if (renderMap[screenName]) await renderMap[screenName]();
  } catch (error) {
    console.error(`Falha ao renderizar a tela ${screenName}:`, error);
  }
}

async function showModal(modalName) {
  document
    .querySelectorAll('[id$="-modal"]')
    .forEach((m) => m.classList.add("hidden"));
  state.activeModal = modalName;
  if (modalName) {
    const modal = document.getElementById(`${modalName}-modal`);
    if (modal) {
      const renderMap = {
        "pdv-details": renderPdvDetailsModal,
        "add-status": renderAddStatusModal,
        "select-store": renderSelectStoreModal,
        "manage-store": renderManageStoreModal,
        "edit-user": renderEditUserModal,
        "edit-store": renderEditStoreModal,
        "password-change": renderPasswordChangeModal,
        "edit-role": renderEditRoleModal,
        "checklist-pdv": renderChecklistPdvModal,
        "checklist-config": renderChecklistConfigModal,
        "view-checklist": renderViewChecklistModal,
        "checklist-help": renderChecklistHelpModal,
        "apply-checklist-item": renderApplyChecklistItemModal,
      };
      if (renderMap[modalName]) await renderMap[modalName]();
      modal.classList.remove("hidden");
    }
  }
}

function showConfirmationModal(title, message, callback) {
  const passwordInput = document.getElementById("confirmation-password");
  const passwordLabel = document.querySelector(
    'label[for="confirmation-password"]'
  );
  if (passwordInput && passwordLabel) {
    passwordInput.style.display = "none";
    passwordInput.required = false;
    passwordLabel.style.display = "none";
  }
  document.getElementById("confirmation-modal-title").textContent = title;
  document.getElementById("confirmation-modal-message").textContent = message;
  state.actionToConfirm = callback;
  showModal("confirmation");
}

// --- TODAS AS FUNÇÕES DE RENDERIZAÇÃO ---

async function renderPdvScreen() {
  if (!state.loggedInUser || !state.currentStore) return handleLogout();

  try {
    const [pdvsInStore, todaysChecklist] = await Promise.all([
      api.get(`/stores/${state.currentStore.id}/pdvs-with-status`),
      api
        .get(`/checklists/today?storeId=${state.currentStore.id}`)
        .catch(() => null),
    ]);

    renderDashboard(pdvsInStore, todaysChecklist);

    const role = state.allData.roles.find(
      (r) => r.id === state.loggedInUser.roleId
    );
    document.getElementById("store-name-header").textContent =
      state.currentStore.name;
    document.getElementById(
      "tech-name-header"
    ).textContent = `${role.name}: ${state.loggedInUser.name}`;
    document.getElementById("admin-panel-btn").style.display = can.permission(
      "accessAdminPanel"
    )
      ? "block"
      : "none";
    document.getElementById("side-menu-user-name").textContent =
      state.loggedInUser.name;
    document.getElementById("side-menu-user-role").textContent = role.name;

    const checklistPanel = document.getElementById("checklist-control-panel");
    if (
      can.permission("canStartChecklist") &&
      (!todaysChecklist || todaysChecklist.status !== "completed")
    ) {
      checklistPanel.innerHTML = `<button id="start-checklist-btn" class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 font-semibold">${
        todaysChecklist ? "Continuar" : "Iniciar"
      } Checklist do Dia</button>`;
    } else if (todaysChecklist?.status === "completed") {
      checklistPanel.innerHTML = `<div class="text-center p-2 bg-green-100 text-green-800 rounded-md">Checklist de hoje finalizado!</div>`;
    } else {
      checklistPanel.innerHTML = "";
    }

    const pdvListEl = document.getElementById("pdv-list");
    pdvListEl.innerHTML = "";
    if (pdvsInStore.length === 0) {
      pdvListEl.innerHTML = `<p class="text-gray-500 text-center py-4">Nenhum PDV cadastrado para esta loja.</p>`;
      return;
    }

    pdvsInStore
      .sort((a, b) =>
        a.number.localeCompare(b.number, undefined, { numeric: true })
      )
      .forEach((pdv) => {
        const lastStatusEntry = pdv.lastStatus;
        const statusInfo = lastStatusEntry
          ? state.allData.statusTypes.find(
              (s) => s.id === lastStatusEntry.statusId
            )
          : state.allData.statusTypes.find((s) => s.name === "Sem status");
        const techName = lastStatusEntry?.techName?.split(" ")[0] || "Sistema";
        let obsHtml = lastStatusEntry
          ? `<p class="text-sm text-gray-600 mt-1 truncate">${lastStatusEntry.description} <span class="text-gray-400 font-medium">- ${techName}</span></p>`
          : `<p class="text-sm text-gray-500 mt-1">Nenhuma observação.</p>`;

        const pdvCard = document.createElement("div");
        pdvCard.className = `bg-white p-4 rounded-lg shadow-sm border-l-4 status-border-${statusInfo.id} cursor-pointer hover:shadow-md transition-shadow`;
        pdvCard.dataset.pdvid = pdv.id;
        pdvCard.innerHTML = `<div class="flex justify-between items-center"><p class="font-bold text-lg">Caixa ${pdv.number}</p><span class="text-sm font-medium status-text-${statusInfo.id}">${statusInfo.name}</span></div>${obsHtml}`;
        pdvCard.addEventListener("click", () => {
          state.selectedPdvId = pdv.id;
          showModal("pdv-details");
        });
        pdvListEl.appendChild(pdvCard);
      });
  } catch (error) {
    console.error("Erro ao renderizar a tela de PDVs:", error);
  }
}

function renderAdminMainMenu() {
  const container = document.getElementById("admin-menu-options");
  container.innerHTML = "";
  const menuItems = [
    {
      perm: "manageUsers",
      text: "Gerenciar Usuários",
      screen: "admin-users",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>`,
    },
    {
      perm: "manageStores",
      text: "Gerenciar Lojas",
      screen: "admin-stores",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>`,
    },
    {
      perm: "manageStatusTypes",
      text: "Gerenciar Status",
      screen: "admin-status",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>`,
    },
    {
      perm: "managePermissions",
      text: "Gerenciar Permissões",
      screen: "admin-roles",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>`,
    },
    {
      perm: "viewActionLogs",
      text: "Registros e Logs",
      screen: "admin-logs-menu",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>`,
    },
    {
      perm: "accessAdminPanel",
      text: "Histórico de Checklist",
      screen: "checklist-history",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>`,
    },
  ];
  menuItems.forEach((item) => {
    if (can.permission(item.perm)) {
      const div = document.createElement("div");
      div.className =
        "bg-gray-50 border border-gray-200 rounded-lg p-4 cursor-pointer hover:bg-gray-100 transition-colors flex items-center gap-4";
      div.innerHTML = `<div>${item.icon}</div><h3 class="font-semibold text-gray-700">${item.text}</h3>`;
      div.addEventListener("click", () => showScreen(item.screen));
      container.appendChild(div);
    }
  });
}
async function renderAdminPdvItemsScreen() {
  const items = await api.get("/pdv-items");
  state.allData.pdvItems = items;
  const listEl = document.getElementById("admin-pdv-items-list");
  listEl.innerHTML = items
    .map(
      (item) =>
        `<div class="bg-gray-100 p-2 rounded text-sm flex justify-between items-center"><span>${item.name}</span><button data-itemid="${item.id}" class="remove-pdv-item-btn text-red-600 hover:underline font-bold text-lg">&times;</button></div>`
    )
    .join("");
}
async function renderPdvDetailsModal() {
  const [pdv, history, recurringProblems] = await Promise.all([
    api.get(`/pdvs/${state.selectedPdvId}`),
    api.get(`/pdvs/${state.selectedPdvId}/history`),
    api.get(`/pdvs/${state.selectedPdvId}/recurring-problems`),
  ]);

  const lastStatus = history[0];
  const statusInfo = lastStatus
    ? state.allData.statusTypes.find((s) => s.id === lastStatus.statusId)
    : state.allData.statusTypes.find((s) => s.name === "Sem status");

  document.getElementById(
    "modal-pdv-title"
  ).textContent = `Detalhes do Caixa ${pdv.number}`;
  document.getElementById("modal-pdv-current-status").textContent =
    statusInfo.name;

  document.getElementById("add-status-btn").style.display = can.editStatus(pdv)
    ? "block"
    : "none";

  const historyEl = document.getElementById("modal-pdv-history");
  historyEl.innerHTML =
    history.length === 0
      ? `<p class="text-gray-500">Nenhum histórico.</p>`
      : history
          .map((entry) => {
            const entryStatusInfo = state.allData.statusTypes.find(
              (s) => s.id === entry.statusId
            );
            return `<div class="border-l-4 status-border-${
              entryStatusInfo.id
            } pl-3 py-2 space-y-1 bg-gray-50/50 rounded-r-md"><div class="flex justify-between items-center text-sm"><p class="font-semibold status-text-${
              entryStatusInfo.id
            }">${
              entryStatusInfo.name
            }</p><p class="text-xs text-gray-500">por ${
              entry.techName || "Desconhecido"
            }</p></div><p class="text-sm text-gray-700">${
              entry.description
            }</p><p class="text-xs text-gray-400 text-right">${new Date(
              entry.timestamp
            ).toLocaleString("pt-BR")}</p></div>`;
          })
          .join("");

  const recurringProblemsEl = document.getElementById(
    "modal-pdv-recurring-problems"
  );
  recurringProblemsEl.innerHTML =
    recurringProblems.length === 0
      ? '<p class="text-gray-500">Nenhum problema recorrente registrado.</p>'
      : recurringProblems
          .map(
            (problem) => `
        <div class="flex justify-between items-center bg-gray-50 p-2 rounded">
            <span>${problem.problemText}</span>
            <span class="font-bold text-red-600">${problem.count} ocorrência(s)</span>
        </div>`
          )
          .join("");
}
async function renderAddStatusModal() {
  const pdv = await api.get(`/pdvs/${state.selectedPdvId}`);
  document.getElementById(
    "add-status-modal-title"
  ).textContent = `Novo Status para Caixa ${pdv.number}`;

  document.getElementById("status-select").innerHTML = state.allData.statusTypes
    .filter((s) => s.name !== "Sem status")
    .map((s) => `<option value="${s.id}">${s.name}</option>`)
    .join("");

  // --- CORREÇÃO AQUI ---
  // O ID correto do elemento <select> é 'status-item-select'.
  // A versão anterior poderia estar com um ID diferente ou com erro de digitação.
  const itemSelect = document.getElementById("status-item-select");
  if (itemSelect) {
    itemSelect.innerHTML =
      '<option value="">Nenhum / Outro</option>' +
      state.allData.pdvItems
        .map((item) => `<option value="${item.id}">${item.name}</option>`)
        .join("");
  }

  document.getElementById("add-status-form").reset();
}
function renderSelectStoreModal() {
  document.getElementById("store-selection-list").innerHTML =
    state.allData.stores
      .map(
        (store) =>
          `<div data-storeid="${store.id}" class="store-item p-3 hover:bg-gray-100 cursor-pointer rounded-md">${store.name}</div>`
      )
      .join("");
}
function renderAdminUsersScreen() {
  document.getElementById("new-user-role").innerHTML =
    `<option value="" disabled selected>Selecione o cargo</option>` +
    state.allData.roles
      .map((r) => `<option value="${r.id}">${r.name}</option>`)
      .join("");
  document.getElementById("new-user-store").innerHTML =
    `<option value="">Nenhuma (Padrão)</option>` +
    state.allData.stores
      .map((s) => `<option value="${s.id}">${s.name}</option>`)
      .join("");
}
async function renderAdminUsersListScreen() {
  const users = await api.get("/users");
  document.getElementById("admin-users-list").innerHTML = users
    .map((u) => {
      const roleName = (
        state.allData.roles.find((r) => r.id === u.roleId) || {
          name: "Inválido",
        }
      ).name;
      const storeName = u.storeId
        ? (state.allData.stores.find((s) => s.id === u.storeId) || { name: "" })
            .name
        : "";
      const lastLogin = u.lastLogin
        ? new Date(u.lastLogin).toLocaleString("pt-BR")
        : "Nunca";
      return `<div class="bg-gray-100 p-3 rounded-md text-sm"><div class="flex justify-between items-start"><div><p class="font-semibold">${
        u.name
      } <span class="font-normal text-gray-500">(${
        u.username
      })</span></p><p class="text-xs text-gray-600">${roleName}${
        storeName ? ` - ${storeName}` : ""
      }</p></div><div class="flex items-center gap-3"><button data-userid="${
        u.id
      }" class="edit-user-btn text-blue-600 hover:underline text-xs">Editar</button><button data-userid="${
        u.id
      }" class="remove-user-btn text-red-600 hover:underline font-bold text-lg">&times;</button></div></div><div class="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">Último login: ${lastLogin}</div></div>`;
    })
    .join("");
}
async function renderAdminStoresScreen() {
  document.getElementById("pdv-items-management-container").innerHTML =
    can.permission("managePdvItems")
      ? `<button id="goto-pdv-items-btn" class="w-full bg-gray-200 text-gray-800 px-4 py-3 rounded-md hover:bg-gray-300 flex items-center justify-center gap-3 text-left"><svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg><span class="font-semibold">Gerenciar Itens de PDV Padrão</span></button>`
      : "";
  const stores = await api.get("/stores");
  state.allData.stores = stores;
  document.getElementById("admin-stores-list").innerHTML = stores
    .map(
      (store) =>
        `<div class="bg-gray-100 p-3 rounded-md text-sm"><div class="flex justify-between items-center"><span>${store.name}</span><div><button data-storeid="${store.id}" class="edit-store-btn text-blue-600 hover:underline mr-3">Editar</button><button data-storeid="${store.id}" class="manage-store-btn text-blue-600 hover:underline mr-3">Gerenciar</button><button data-storeid="${store.id}" class="remove-store-btn text-red-600 hover:underline font-bold text-lg">&times;</button></div></div><div class="text-xs text-gray-500 mt-1">Nomenclatura PDV inicia em: ${store.pdvNamingStart}</div></div>`
    )
    .join("");
}
async function renderAdminStatusScreen() {
  const statuses = await api.get("/status-types");
  state.allData.statusTypes = statuses;
  applyStatusColors();
  document.getElementById("admin-status-list").innerHTML = statuses
    .map(
      (s) =>
        `<div class="bg-gray-100 p-2 rounded text-sm flex justify-between items-center"><span class="flex items-center"><div class="w-3 h-3 rounded-full mr-2" style="background-color: ${
          s.color
        };"></div>${s.name}</span> <button data-statusid="${
          s.id
        }" class="remove-status-btn text-red-600 hover:underline font-bold text-lg ${
          s.name === "Sem status" ? "hidden" : ""
        }">&times;</button></div>`
    )
    .join("");
}
async function renderAdministrativeLogsScreen() {
  const listEl = document.getElementById("admin-logs-list");
  listEl.innerHTML =
    '<p class="text-gray-500 text-center py-4">Carregando logs...</p>';

  try {
    const allLogs = await api.get("/logs/admin");

    if (allLogs.length === 0) {
      listEl.innerHTML = `<p class="text-gray-500 text-center py-4">Nenhum registro de ação administrativa.</p>`;
      return;
    }

    // Limpa a lista antes de adicionar os novos itens
    listEl.innerHTML = "";

    // A lógica para mostrar apenas os 20 mais recentes ou todos
    const logsToDisplay = state.showFullAdminLogs
      ? allLogs
      : allLogs.slice(0, 20);

    if (state.showFullAdminLogs) {
      const groupedLogs = groupLogsByMonth(logsToDisplay);
      for (const month in groupedLogs) {
        listEl.innerHTML += `<h3 class="text-lg font-semibold text-gray-700 mt-4 mb-2">${month}</h3>`;
        groupedLogs[month].forEach((log) => {
          const metadata = log.metadata ? JSON.parse(log.metadata) : {};
          const showButtonHtml = metadata.checklistId
            ? `<button data-checklistid="${metadata.checklistId}" class="view-checklist-log-btn text-sm text-blue-600 hover:underline">Mostrar</button>`
            : "";
          listEl.innerHTML += `<div class="bg-gray-100 p-3 rounded-md text-sm"><div class="flex justify-between items-start"><p>${
            log.description
          }</p>${showButtonHtml}</div><p class="text-xs text-gray-500 mt-1">Por: <span class="font-medium">${
            log.userName || "Sistema"
          }</span> em ${new Date(log.timestamp).toLocaleString(
            "pt-BR"
          )}</p></div>`;
        });
      }
    } else {
      logsToDisplay.forEach((log) => {
        const metadata = log.metadata ? JSON.parse(log.metadata) : {};
        const showButtonHtml = metadata.checklistId
          ? `<button data-checklistid="${metadata.checklistId}" class="view-checklist-log-btn text-sm text-blue-600 hover:underline">Mostrar</button>`
          : "";
        listEl.innerHTML += `<div class="bg-gray-100 p-3 rounded-md text-sm"><div class="flex justify-between items-start"><p>${
          log.description
        }</p>${showButtonHtml}</div><p class="text-xs text-gray-500 mt-1">Por: <span class="font-medium">${
          log.userName || "Sistema"
        }</span> em ${new Date(log.timestamp).toLocaleString(
          "pt-BR"
        )}</p></div>`;
      });

      if (allLogs.length > 20) {
        listEl.innerHTML += `<div class="text-center mt-4"><button id="show-full-admin-logs-btn" class="text-blue-600 hover:underline">Histórico Completo</button></div>`;
      }
    }
  } catch (error) {
    listEl.innerHTML = `<p class="text-red-500 text-center py-4">Erro ao carregar os logs.</p>`;
  }
}
async function renderPdvLogsScreen() {
  const filterEl = document.getElementById("pdv-log-store-filter");
  const listEl = document.getElementById("pdv-logs-list");
  const currentStoreId =
    filterEl.value || (state.currentStore ? state.currentStore.id : "");

  filterEl.innerHTML =
    `<option value="">Selecione uma loja</option>` +
    state.allData.stores
      .map(
        (s) =>
          `<option value="${s.id}" ${
            s.id == currentStoreId ? "selected" : ""
          }>${s.name}</option>`
      )
      .join("");

  listEl.innerHTML = "";
  if (!currentStoreId) {
    listEl.innerHTML = `<p class="text-gray-500 text-center py-4">Selecione uma loja para ver os logs.</p>`;
    return;
  }

  try {
    const allLogs = await api.get(`/logs/pdv?storeId=${currentStoreId}`);
    if (allLogs.length === 0) {
      listEl.innerHTML = `<p class="text-gray-500 text-center py-4">Nenhum log de PDV para esta loja.</p>`;
      return;
    }

    const logsToDisplay = state.showFullPdvLogs
      ? allLogs
      : allLogs.slice(0, 20);

    if (state.showFullPdvLogs) {
      const groupedLogs = groupLogsByMonth(logsToDisplay);
      for (const month in groupedLogs) {
        listEl.innerHTML += `<h3 class="text-lg font-semibold text-gray-700 mt-4 mb-2">${month}</h3>`;
        groupedLogs[month].forEach((log) => {
          listEl.innerHTML += `<div class="border-l-4 status-border-${
            log.statusId
          } pl-3 py-2 space-y-1 bg-gray-50/50 rounded-r-md"><div class="flex justify-between items-center text-sm"><p class="font-bold">Caixa ${
            log.pdvNumber
          } &rarr; <span class="font-semibold status-text-${log.statusId}">${
            log.statusName
          }</span></p><p class="text-xs text-gray-500">por ${
            log.techName || "Sistema"
          }</p></div><p class="text-sm text-gray-700">${
            log.description
          }</p><p class="text-xs text-gray-400 text-right">${new Date(
            log.timestamp
          ).toLocaleString("pt-BR")}</p></div>`;
        });
      }
    } else {
      logsToDisplay.forEach((log) => {
        listEl.innerHTML += `<div class="border-l-4 status-border-${
          log.statusId
        } pl-3 py-2 space-y-1 bg-gray-50/50 rounded-r-md"><div class="flex justify-between items-center text-sm"><p class="font-bold">Caixa ${
          log.pdvNumber
        } &rarr; <span class="font-semibold status-text-${log.statusId}">${
          log.statusName
        }</span></p><p class="text-xs text-gray-500">por ${
          log.techName || "Sistema"
        }</p></div><p class="text-sm text-gray-700">${
          log.description
        }</p><p class="text-xs text-gray-400 text-right">${new Date(
          log.timestamp
        ).toLocaleString("pt-BR")}</p></div>`;
      });
      if (allLogs.length > 20) {
        listEl.innerHTML += `<div class="text-center mt-4"><button id="show-full-pdv-logs-btn" class="text-blue-600 hover:underline">Histórico Completo</button></div>`;
      }
    }
  } catch (error) {
    listEl.innerHTML = `<p class="text-red-500 text-center py-4">Erro ao carregar os logs.</p>`;
  }
}
async function renderManageStoreModal() {
  const store = state.allData.stores.find(
    (s) => s.id === state.selectedStoreId
  );
  if (!store) {
    showToast("Loja não encontrada.", "error");
    return;
  }

  document.getElementById(
    "manage-store-modal-title"
  ).textContent = `Gerenciar Loja: ${store.name}`;
  const pdvListEl = document.getElementById("manage-store-pdv-list");
  pdvListEl.innerHTML = `<p class="text-gray-500 text-center text-sm py-2">Carregando PDVs...</p>`;

  try {
    const pdvsInStore = await api.get(`/stores/${store.id}/pdvs-with-status`);

    if (pdvsInStore.length === 0) {
      pdvListEl.innerHTML = `<p class="text-gray-500 text-center text-sm py-2">Nenhum PDV cadastrado.</p>`;
    } else {
      pdvListEl.innerHTML = pdvsInStore
        .sort((a, b) =>
          a.number.localeCompare(b.number, undefined, { numeric: true })
        )
        .map((pdv) => {
          const statusInfo = pdv.lastStatus
            ? state.allData.statusTypes.find(
                (s) => s.id === pdv.lastStatus.statusId
              )
            : state.allData.statusTypes.find((s) => s.name === "Sem status");
          return `
                        <div class="bg-gray-100 p-2 rounded text-sm flex justify-between items-center">
                            <span>Caixa ${pdv.number} (Status: ${statusInfo.name})</span>
                            <button data-pdvid="${pdv.id}" class="remove-pdv-btn text-red-600 hover:underline font-bold text-lg">&times;</button>
                        </div>
                    `;
        })
        .join("");
    }

    // Preenche o campo de criação rápida com o próximo número de PDV sugerido
    const nextPdvNumber =
      pdvsInStore.length > 0
        ? Math.max(
            ...pdvsInStore
              .map((p) => parseInt(p.number, 10))
              .filter((n) => !isNaN(n))
          ) + 1
        : store.pdvNamingStart;

    document.getElementById("new-pdv-start-number").value = isFinite(
      nextPdvNumber
    )
      ? nextPdvNumber
      : store.pdvNamingStart;
    document.getElementById("add-pdv-to-store-form").reset(); // Limpa outros campos se houver
  } catch (error) {
    pdvListEl.innerHTML = `<p class="text-red-500 text-center text-sm py-2">Erro ao carregar PDVs.</p>`;
  }
}
async function renderEditUserModal() {
  try {
    // Busca a lista atualizada de usuários para garantir que temos os dados mais recentes
    const users = await api.get("/users");
    const user = users.find((u) => u.id === state.selectedUserId);

    if (!user) {
      showToast("Usuário não encontrado.", "error");
      showModal(null); // Fecha o modal se o usuário não existir
      return;
    }

    // Preenche os campos do formulário com os dados do usuário
    document.getElementById("edit-user-id").value = user.id;
    document.getElementById("edit-user-name").value = user.name;
    document.getElementById("edit-user-username").value = user.username;

    // Popula e seleciona o cargo (role) do usuário
    const roleSelect = document.getElementById("edit-user-role");
    roleSelect.innerHTML = state.allData.roles
      .map(
        (r) =>
          `<option value="${r.id}" ${user.roleId === r.id ? "selected" : ""}>${
            r.name
          }</option>`
      )
      .join("");

    // Popula e seleciona a loja padrão do usuário
    const storeSelect = document.getElementById("edit-user-store");
    storeSelect.innerHTML =
      '<option value="">Nenhuma</option>' +
      state.allData.stores
        .map(
          (s) =>
            `<option value="${s.id}" ${
              user.storeId === s.id ? "selected" : ""
            }>${s.name}</option>`
        )
        .join("");
  } catch (error) {
    showToast("Erro ao carregar dados do usuário.", "error");
  }
}
async function renderEditStoreModal() {
  // 1. Encontra a loja no estado da aplicação usando o ID que foi selecionado.
  const store = state.allData.stores.find(
    (s) => s.id === state.selectedStoreId
  );

  if (!store) {
    showToast("Loja não encontrada.", "error");
    showModal(null); // Fecha o modal se a loja não for encontrada.
    return;
  }

  // 2. Popula os campos do formulário com os dados da loja encontrada.
  document.getElementById("edit-store-id").value = store.id;
  document.getElementById("edit-store-name").value = store.name;
  document.getElementById("edit-store-pdv-start").value = store.pdvNamingStart;
}
function renderPasswordChangeModal() {
  const form = document.getElementById("password-change-form");
  form.reset(); // Limpa senhas antigas e campos de erro do formulário

  document.getElementById("password-change-error").classList.add("hidden");

  // Preenche o nome de usuário (que é um campo somente leitura no modal)
  document.getElementById("password-change-username").value =
    state.userForPasswordChange;

  const isFirstLogin = state.isFirstLoginForPasswordChange;

  // Adapta o título do modal e a visibilidade do campo "Senha Atual"
  const modalTitle = document.getElementById("password-modal-title");
  const currentPasswordWrapper = document.getElementById(
    "current-password-wrapper"
  );
  const currentPasswordInput = document.getElementById("current-password");

  if (isFirstLogin) {
    // Cenário 1: Primeiro login
    modalTitle.textContent = "Definir sua Senha";
    currentPasswordWrapper.style.display = "none"; // Esconde o campo "Senha Atual"
    currentPasswordInput.required = false; // Garante que o campo não seja obrigatório
  } else {
    // Cenário 2: Alteração de senha
    modalTitle.textContent = "Alterar Senha";
    currentPasswordWrapper.style.display = "block"; // Mostra o campo "Senha Atual"
    currentPasswordInput.required = true; // Torna o campo obrigatório
  }
}
async function renderAdminRolesScreen() {
  const listEl = document.getElementById("admin-roles-list");
  listEl.innerHTML = '<p class="text-gray-500">Carregando cargos...</p>';

  try {
    const roles = await api.get("/roles");
    // Atualiza o estado global com os dados mais recentes
    state.allData.roles = roles;

    if (roles.length === 0) {
      listEl.innerHTML =
        '<p class="text-gray-500">Nenhum cargo encontrado.</p>';
      return;
    }

    listEl.innerHTML = roles
      .map(
        (role) => `
            <div class="bg-gray-100 p-3 rounded-md text-sm">
                <div class="flex justify-between items-center">
                    <span class="font-semibold">${role.name}</span>
                    <div>
                        <button data-roleid="${
                          role.id
                        }" class="edit-role-btn text-blue-600 hover:underline mr-3">
                            Editar Permissões
                        </button>
                        ${
                          role.name !== "Administrador"
                            ? `<button data-roleid="${role.id}" class="remove-role-btn text-red-600 hover:underline font-bold text-lg">&times;</button>`
                            : ""
                        }
                    </div>
                </div>
            </div>
        `
      )
      .join("");
  } catch (error) {
    listEl.innerHTML = '<p class="text-red-500">Erro ao carregar cargos.</p>';
  }
}
async function renderEditRoleModal() {
  const role = state.allData.roles.find((r) => r.id === state.selectedRoleId);
  if (!role) {
    showToast("Cargo não encontrado.", "error");
    return;
  }

  document.getElementById(
    "edit-role-modal-title"
  ).textContent = `Editar Permissões: ${role.name}`;
  document.getElementById("edit-role-id").value = role.id;

  const container = document.getElementById("edit-role-permissions");
  container.innerHTML = ""; // Limpa o conteúdo anterior

  // Mapeamento de chaves de permissão para textos amigáveis
  const permissionLabels = {
    accessAdminPanel: "Acessar Painel Admin",
    manageUsers: "Gerenciar Usuários",
    manageStores: "Gerenciar Lojas",
    managePdvItems: "Gerenciar Itens Padrão",
    manageStatusTypes: "Gerenciar Status",
    managePermissions: "Gerenciar Permissões",
    viewActionLogs: "Ver Registro de Ações",
    viewAllPdvStatus: "Ver Status de Todas Lojas",
    manageChecklistSettings: "Gerenciar Config. Checklist",
    canStartChecklist: "Pode Iniciar Checklist",
  };

  // Cria os checkboxes para cada permissão booleana
  Object.keys(permissionLabels).forEach((key) => {
    const isChecked = role.permissions[key] ? "checked" : "";
    container.innerHTML += `
            <div class="flex items-center">
                <input id="perm-${key}" name="${key}" type="checkbox" ${isChecked} 
                       class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded">
                <label for="perm-${key}" class="ml-3 block text-sm text-gray-900">${permissionLabels[key]}</label>
            </div>
        `;
  });

  // Cria o seletor para a permissão de edição de status (que tem 3 opções)
  const editStatusPerm = role.permissions.editPdvStatus || "none";
  container.innerHTML += `
        <div class="pt-3 border-t">
            <label class="block text-sm font-medium text-gray-700">Editar Status de PDV</label>
            <select id="perm-editPdvStatus" class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                <option value="none" ${
                  editStatusPerm === "none" ? "selected" : ""
                }>Nenhuma</option>
                <option value="own" ${
                  editStatusPerm === "own" ? "selected" : ""
                }>Apenas da Própria Loja</option>
                <option value="all" ${
                  editStatusPerm === "all" ? "selected" : ""
                }>Todas as Lojas</option>
            </select>
        </div>
    `;
}
async function renderChecklistScreen() {
  const listEl = document.getElementById("checklist-pdv-list");
  listEl.innerHTML = "";

  const pdvs = (await api.get(`/stores/${state.currentStore.id}/pdvs`)).sort(
    (a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })
  );

  // --- LINHA A SER ADICIONADA ---
  state.allData.pdvs = pdvs; // Salva a lista de PDVs no estado global

  // Para cada PDV da loja, cria um cartão na tela
  pdvs.forEach((pdv, index) => {
    // Procura no checklist ativo se este PDV já tem um registro
    const checkData =
      state.activeChecklist.pdvChecks.find((c) => c.pdvId === pdv.id) || {};

    let bgColor = "bg-white";
    let textColor = "text-gray-800";
    let statusText = "Pendente";

    switch (checkData.result) {
      case "ok":
        bgColor = "bg-green-100";
        textColor = "text-green-800";
        statusText = "OK";
        break;
      case "problem":
        bgColor = "bg-red-100";
        textColor = "text-red-800";
        statusText = "Problema";
        break;
      case "busy":
        bgColor = "bg-gray-200";
        textColor = "text-gray-600";
        statusText = "Ocupado";
        break;
    }

    const card = document.createElement("div");
    card.dataset.index = index; // Guarda o índice do PDV na lista para fácil acesso
    card.className = `checklist-pdv-card p-4 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow flex justify-between items-center ${bgColor} ${textColor}`;

    card.innerHTML = `
            <p class="font-bold text-lg">Caixa ${pdv.number}</p>
            <span class="text-xs font-medium uppercase">${statusText}</span>
        `;

    listEl.appendChild(card);
  });
}
async function renderChecklistPdvModal() {
  // Busca a lista de PDVs da loja, já ordenada
  const pdvsDaLoja = (
    await api.get(`/stores/${state.currentStore.id}/pdvs-with-status`)
  ).sort((a, b) =>
    a.number.localeCompare(b.number, undefined, { numeric: true })
  );

  // Pega o PDV específico que estamos verificando agora
  const pdv = pdvsDaLoja[state.currentChecklistPdvIndex];
  if (!pdv) {
    showToast("Erro: PDV não encontrado.", "error");
    return;
  }

  // Procura por dados já preenchidos neste checklist
  const checkData =
    state.activeChecklist.pdvChecks.find((c) => c.pdvId === pdv.id) || {};

  document.getElementById(
    "checklist-pdv-modal-title"
  ).textContent = `Verificando Caixa ${pdv.number}`;

  // Mostra o status atual do PDV
  const currentStatusInfoEl = document.getElementById(
    "checklist-current-status-info"
  );
  const lastStatus = pdv.lastStatus;
  if (lastStatus) {
    const statusInfo = state.allData.statusTypes.find(
      (s) => s.id === lastStatus.statusId
    );
    currentStatusInfoEl.innerHTML = `<strong>Status Atual:</strong> <span class="status-text-${statusInfo.id}">${statusInfo.name}</span><p class="text-xs text-gray-500 truncate mt-1">Obs: ${lastStatus.description}</p>`;
  } else {
    currentStatusInfoEl.innerHTML = `<strong>Status Atual:</strong> Sem status`;
  }

  // Cria a lista de itens a serem verificados como checkboxes
  const allItems = getChecklistItemsForStore(state.currentStore.id);
  const itemsContainer = document.getElementById("checklist-pdv-items");
  itemsContainer.innerHTML =
    `<label class="block text-sm font-medium text-gray-700">Itens com problema</label>` +
    allItems
      .map(
        (item) => `
        <div class="flex items-center">
            <input id="checklist-item-${item.id}" 
                   data-itemid="${item.id}" 
                   type="checkbox" 
                   ${
                     (checkData.issues || []).includes(item.id) ? "checked" : ""
                   } 
                   class="checklist-item-checkbox h-4 w-4 text-indigo-600 border-gray-300 rounded">
            <label for="checklist-item-${
              item.id
            }" class="ml-3 text-sm text-gray-700">${item.text}</label>
        </div>
    `
      )
      .join("");

  // Preenche o campo de observação
  document.getElementById("checklist-observation").value =
    checkData.observation || "";

  // Configura o seletor de status
  const statusSelect = document.getElementById("checklist-new-status");
  const okStatus = state.allData.statusTypes.find((s) => s.name === "Ok");
  statusSelect.innerHTML =
    `<option value="${okStatus.id}">Ok</option>` +
    state.allData.statusTypes
      .filter((s) => s.name !== "Sem status" && s.name !== "Ok")
      .map((s) => `<option value="${s.id}">${s.name}</option>`)
      .join("");

  // Seleciona o status salvo ou 'Ok' como padrão
  statusSelect.value = checkData.newStatusId || okStatus.id;

  // Habilita/desabilita os botões de navegação "Anterior" e "Próximo"
  document.getElementById("checklist-prev-pdv-btn").disabled =
    state.currentChecklistPdvIndex === 0;
  document.getElementById("checklist-next-pdv-btn").disabled =
    state.currentChecklistPdvIndex === pdvsDaLoja.length - 1;
}
async function renderChecklistConfigModal() {
  const store = state.allData.stores.find(
    (s) => s.id === state.selectedStoreId
  );
  if (!store) {
    showToast("Loja não encontrada.", "error");
    return;
  }

  // Define o título do modal com o nome da loja
  document.getElementById(
    "checklist-config-title"
  ).textContent = `Configurações de Checklist: ${store.name}`;

  // Preenche o valor do campo de limite de dias
  document.getElementById("checklist-days-limit").value =
    store.checklistConfig.noChecklistDaysLimit;

  // Limpa o formulário de adicionar novo item
  document.getElementById("add-checklist-item-form").reset();

  // Renderiza a lista de itens de checklist que são específicos da loja
  const listEl = document.getElementById("checklist-config-items-list");
  const customItems = store.checklistConfig?.items || [];

  if (customItems.length === 0) {
    listEl.innerHTML =
      '<p class="text-xs text-gray-500 text-center">Nenhum item específico para esta loja.</p>';
  } else {
    listEl.innerHTML = customItems
      .map(
        (item) => `
            <div class="bg-gray-100 p-2 rounded text-sm flex justify-between items-center">
                <span>${item.text}</span>
                <button data-itemid="${item.id}" class="remove-checklist-item-btn text-red-600 hover:underline font-bold text-lg">&times;</button>
            </div>
        `
      )
      .join("");
  }
}
async function renderChecklistHistoryScreen() {
  const filterEl = document.getElementById("checklist-history-store-filter");
  const listEl = document.getElementById("checklist-history-list");

  const currentStoreId = filterEl.value || "";

  // Popula o seletor de lojas
  filterEl.innerHTML =
    `<option value="">Todas as Lojas</option>` +
    state.allData.stores
      .map(
        (s) =>
          `<option value="${s.id}" ${
            s.id == currentStoreId ? "selected" : ""
          }>${s.name}</option>`
      )
      .join("");

  listEl.innerHTML = `<p class="text-center text-gray-500">Carregando histórico...</p>`;

  try {
    // Busca o histórico da API, passando o filtro de loja se houver
    const completedChecklists = await api.get(
      `/checklists/history?storeId=${currentStoreId}`
    );

    if (completedChecklists.length === 0) {
      listEl.innerHTML = `<p class="text-gray-500 text-center py-4">Nenhum checklist finalizado encontrado.</p>`;
      return;
    }

    // Busca todos os usuários para poder exibir o nome de quem finalizou
    const users = await api.get("/users");

    listEl.innerHTML = completedChecklists
      .map((checklist) => {
        const store = state.allData.stores.find(
          (s) => s.id === checklist.storeId
        );
        const user = users.find((u) => u.id === checklist.finalizedByUserId);
        const formattedDate = new Date(
          checklist.date + "T12:00:00Z"
        ).toLocaleDateString("pt-BR", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        return `
                <div class="bg-gray-100 p-3 rounded-md text-sm">
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="font-semibold">${
                              store ? store.name : "Loja desconhecida"
                            }</p>
                            <p class="text-xs text-gray-600">Finalizado em ${formattedDate} por ${
          user ? user.name : "Usuário desconhecido"
        }</p>
                        </div>
                        <button data-checklistid="${
                          checklist.id
                        }" class="view-checklist-history-btn bg-blue-500 text-white px-3 py-1 text-xs rounded hover:bg-blue-600">Visualizar</button>
                    </div>
                </div>
            `;
      })
      .join("");
  } catch (error) {
    listEl.innerHTML = `<p class="text-red-500 text-center py-4">Erro ao carregar o histórico.</p>`;
  }
}
async function renderViewChecklistModal() {
  const contentEl = document.getElementById("view-checklist-modal-content");
  contentEl.innerHTML = `<p class="text-center text-gray-500">Carregando detalhes...</p>`;

  try {
    // Busca os dados completos do checklist selecionado
    const checklist = await api.get(`/checklists/${state.selectedChecklistId}`);
    if (!checklist) {
      contentEl.innerHTML = `<p class="text-center text-red-500">Checklist não encontrado.</p>`;
      return;
    }

    const store = state.allData.stores.find((s) => s.id === checklist.storeId);
    const formattedDate = new Date(
      checklist.date + "T12:00:00Z"
    ).toLocaleDateString("pt-BR", { dateStyle: "full" });
    document.getElementById(
      "view-checklist-modal-title"
    ).textContent = `Checklist de ${store.name} - ${formattedDate}`;

    contentEl.innerHTML = ""; // Limpa o "Carregando..."

    // Pega a lista completa de itens de checklist para a loja (padrão + customizados)
    const allItemsForStore = getChecklistItemsForStore(store.id);
    const allItemsMap = new Map(
      allItemsForStore.map((item) => [item.id, item.text])
    );

    const pdvsDaLoja = (await api.get(`/stores/${store.id}/pdvs`)).sort(
      (a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })
    );

    // Itera sobre cada PDV da loja para mostrar seu status no checklist
    pdvsDaLoja.forEach((pdv) => {
      const checkData = checklist.pdvChecks.find((c) => c.pdvId === pdv.id);
      if (!checkData) return; // Pula PDVs que não foram verificados (caso raro)

      let resultHtml = "";
      let observationHtml = checkData.observation
        ? `<p class="text-xs italic text-gray-600 mt-1">"${checkData.observation}"</p>`
        : "";

      if (checkData.result === "ok") {
        resultHtml =
          '<span class="font-semibold text-green-600">Tudo OK</span>';
      } else if (checkData.result === "busy") {
        resultHtml =
          '<span class="font-semibold text-gray-600">Caixa Ocupado</span>';
      } else if (checkData.result === "problem") {
        const status = state.allData.statusTypes.find(
          (s) => s.id === checkData.newStatusId
        );
        resultHtml = `<span class="font-semibold text-red-600">Problema (${status.name})</span>`;

        if (checkData.issues && checkData.issues.length > 0) {
          observationHtml +=
            `<ul class="list-disc list-inside text-xs text-gray-700 mt-1">` +
            checkData.issues
              .map(
                (itemId) =>
                  `<li>${allItemsMap.get(itemId) || "Item desconhecido"}</li>`
              )
              .join("") +
            `</ul>`;
        }
      }

      contentEl.innerHTML += `
                <div class="bg-gray-50 p-3 rounded-md">
                    <div class="flex justify-between items-center">
                        <p class="font-bold">Caixa ${pdv.number}</p>
                        ${resultHtml}
                    </div>
                    ${observationHtml}
                </div>
            `;
    });
  } catch (error) {
    contentEl.innerHTML = `<p class="text-center text-red-500">Erro ao carregar detalhes do checklist.</p>`;
  }
}
function getChecklistItemsForStore(storeId) {
  const store = state.allData.stores.find((s) => s.id === storeId);
  if (!store) return [];

  // Itens padrão para todos os PDVs
  const standardItems = state.allData.pdvItems.map((item) => ({
    id: `std-${item.id}`,
    text: `Verificar ${item.name}`,
  }));

  // Itens customizados específicos da loja
  const customItems = (store.checklistConfig?.items || []).map((item) => ({
    id: `cst-${item.id}`,
    text: item.text,
  }));

  return [...standardItems, ...customItems];
}
function renderChecklistHelpModal() {
  const listEl = document.getElementById("checklist-help-list");
  listEl.innerHTML = ""; // Limpa a lista anterior

  if (state.currentStore) {
    const allItems = getChecklistItemsForStore(state.currentStore.id);
    if (allItems.length > 0) {
      listEl.innerHTML =
        '<ul class="list-disc list-inside space-y-1">' +
        allItems.map((item) => `<li>${item.text}</li>`).join("") +
        "</ul>";
    } else {
      listEl.innerHTML =
        '<p class="text-gray-500">Nenhum item de checklist configurado.</p>';
    }
  }
}
function renderDashboard(pdvsInStore, todaysChecklist) {
  const container = document.getElementById("dashboard-container");
  if (!state.currentStore) {
    container.innerHTML = "";
    return;
  }

  // --- Card 1: Visão Geral da Loja ---
  const statusCounts = pdvsInStore.reduce((acc, pdv) => {
    const statusId =
      pdv.lastStatus?.statusId ||
      state.allData.statusTypes.find((s) => s.name === "Sem status").id;
    acc[statusId] = (acc[statusId] || 0) + 1;
    return acc;
  }, {});

  let overviewContent = Object.entries(statusCounts)
    .map(([statusId, count]) => {
      const status = state.allData.statusTypes.find((s) => s.id == statusId);
      return `<div class="flex justify-between items-center text-sm">
                    <span class="flex items-center">
                        <div class="w-3 h-3 rounded-full mr-2 status-bg-${status.id}"></div>${status.name}
                    </span>
                    <span class="font-bold">${count} PDV(s)</span>
                </div>`;
    })
    .join("");

  if (pdvsInStore.length === 0) {
    overviewContent = `<p class="text-sm text-gray-300">Nenhum PDV cadastrado nesta loja.</p>`;
  }

  // --- Card 2: Status do Checklist ---
  let checklistContent = "";
  if (todaysChecklist && todaysChecklist.status === "completed") {
    checklistContent = `<p class="text-sm text-green-300">Checklist de hoje finalizado!</p>`;
  } else if (todaysChecklist) {
    checklistContent = `<p class="text-sm text-yellow-300">Checklist de hoje está em progresso.</p>`;
  } else {
    checklistContent = `<p class="text-sm text-gray-300">Checklist de hoje ainda não foi iniciado.</p>`;
  }

  // --- Card 3: Problemas Recorrentes (placeholder, pois requer uma API complexa) ---
  // Esta parte pode ser implementada depois, criando uma rota de API específica
  let topProblemsContent = `<p class="text-sm text-gray-300">Funcionalidade de top problemas a ser implementada.</p>`;

  // --- Montagem do HTML ---
  container.innerHTML = `
        <div class="dashboard-slider-wrapper" style="transform: translateX(-${
          state.dashboardActiveSlide * 100
        }%);">
            <div class="dashboard-card bg-[#0c0d3d] text-white p-6 rounded-lg shadow-lg">
                <h3 class="font-semibold mb-3">Visão Geral da Loja</h3>
                <div class="space-y-2">${overviewContent}</div>
            </div>
            <div class="dashboard-card bg-[#0c0d3d] text-white p-6 rounded-lg shadow-lg">
                <h3 class="font-semibold mb-3">Status do Checklist</h3>
                <div class="space-y-2">${checklistContent}</div>
            </div>
            <div class="dashboard-card bg-[#0c0d3d] text-white p-6 rounded-lg shadow-lg">
                <h3 class="font-semibold mb-3">Top Componentes (Loja)</h3>
                <div class="space-y-2">${topProblemsContent}</div>
            </div>
        </div>
        <div class="dashboard-dots">
            <div class="dashboard-dot ${
              state.dashboardActiveSlide === 0 ? "active" : ""
            }" data-slide="0"></div>
            <div class="dashboard-dot ${
              state.dashboardActiveSlide === 1 ? "active" : ""
            }" data-slide="1"></div>
            <div class="dashboard-dot ${
              state.dashboardActiveSlide === 2 ? "active" : ""
            }" data-slide="2"></div>
        </div>
    `;

  // --- Lógica do Slider ---
  const wrapper = container.querySelector(".dashboard-slider-wrapper");
  const dots = container.querySelectorAll(".dashboard-dot");

  const updateSlider = () => {
    wrapper.style.transition = "transform 0.5s ease-in-out";
    wrapper.style.transform = `translateX(-${
      state.dashboardActiveSlide * 100
    }%)`;
    dots.forEach((dot) => {
      dot.classList.toggle(
        "active",
        parseInt(dot.dataset.slide) === state.dashboardActiveSlide
      );
    });
  };

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      state.dashboardActiveSlide = parseInt(dot.dataset.slide);
      updateSlider();
    });
  });

  // Lógica de Swipe
  let touchStartX = 0;
  let isDragging = false;
  const dragStart = (e) => {
    isDragging = true;
    touchStartX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
    wrapper.style.transition = "none";
  };
  const dragEnd = (e) => {
    if (!isDragging) return;
    isDragging = false;
    const touchEndX =
      e.type === "touchend" ? e.changedTouches[0].clientX : e.clientX;
    const swipeThreshold = 50;
    if (touchStartX - touchEndX > swipeThreshold) {
      state.dashboardActiveSlide = Math.min(
        state.dashboardActiveSlide + 1,
        dots.length - 1
      );
    } else if (touchEndX - touchStartX > swipeThreshold) {
      state.dashboardActiveSlide = Math.max(state.dashboardActiveSlide - 1, 0);
    }
    updateSlider();
  };

  container.addEventListener("mousedown", dragStart);
  container.addEventListener("touchstart", dragStart, { passive: true });
  document.addEventListener("mouseup", dragEnd);
  container.addEventListener("touchend", dragEnd);
}
function saveAndValidateCurrentChecklistPdv() {
  const pdvsDaLoja = state.allData.pdvs
    .filter((p) => p.storeId === state.activeChecklist.storeId)
    .sort((a, b) =>
      a.number.localeCompare(b.number, undefined, { numeric: true })
    );
  const pdv = pdvsDaLoja[state.currentChecklistPdvIndex];

  // Encontra o último status registrado para este PDV antes do checklist
  const lastStatus = pdv.lastStatus;
  const lastStatusId = lastStatus
    ? lastStatus.statusId
    : state.allData.statusTypes.find((s) => s.name === "Sem status").id;

  const selectedStatusId = parseInt(
    document.getElementById("checklist-new-status").value
  );
  const observation = document
    .getElementById("checklist-observation")
    .value.trim();

  // Validação: Se o status foi alterado, a observação é obrigatória.
  if (selectedStatusId !== lastStatusId && observation.length < 4) {
    showToast(
      "Observação de no mínimo 4 caracteres é obrigatória ao alterar o status.",
      "error"
    );
    return false;
  }

  // Encontra ou cria o registro para este PDV no checklist ativo
  let checkData = state.activeChecklist.pdvChecks.find(
    (c) => c.pdvId === pdv.id
  );
  if (!checkData) {
    checkData = { pdvId: pdv.id };
    state.activeChecklist.pdvChecks.push(checkData);
  }

  const okStatusId = state.allData.statusTypes.find((s) => s.name === "Ok").id;

  if (selectedStatusId === okStatusId) {
    checkData.result = "ok";
    checkData.issues = []; // Limpa os problemas se o status for 'Ok'
  } else {
    checkData.result = "problem";
    // Pega os IDs dos itens marcados como problemáticos
    checkData.issues = Array.from(
      document.querySelectorAll(".checklist-item-checkbox:checked")
    ).map((cb) => cb.dataset.itemid);
  }

  // Atualiza os dados do checklist com as informações do modal
  checkData.newStatusId = selectedStatusId;
  checkData.observation = observation;

  return true; // Retorna true se a validação passou
}
function renderApplyChecklistItemModal() {
  const listEl = document.getElementById("apply-item-stores-list");
  const itemTextEl = document.getElementById("apply-item-text");
  const markAllCheckbox = document.getElementById("apply-item-all-stores");

  // Exibe o texto do item que está sendo adicionado
  if (itemTextEl) {
    itemTextEl.textContent = state.checklistItemToAdd;
  }

  // Cria a lista de lojas com checkboxes
  if (listEl) {
    listEl.innerHTML = state.allData.stores
      .map(
        (store) => `
            <div class="flex items-center">
                <input id="store-apply-${store.id}" 
                       data-storeid="${store.id}" 
                       type="checkbox" 
                       ${store.id === state.selectedStoreId ? "checked" : ""} 
                       class="h-4 w-4 text-indigo-600 border-gray-300 rounded store-apply-checkbox">
                <label for="store-apply-${
                  store.id
                }" class="ml-2 block text-sm text-gray-900">
                    ${store.name}
                </label>
            </div>
        `
      )
      .join("");
  }

  // Garante que a caixa "Marcar Todas" comece desmarcada
  if (markAllCheckbox) {
    markAllCheckbox.checked = false;
  }
}

function setupAllEventListeners() {
  // --- NAVEGAÇÃO GERAL E MENU LATERAL ---
  document
    .getElementById("login-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = e.target.username.value;
      const password = e.target.password.value;
      const errorEl = document.getElementById("login-error");
      errorEl.classList.add("hidden");

      try {
        const { user, token } = await api.post("/auth/login", {
          username,
          password,
        });
        localStorage.setItem("authToken", token);
        state.loggedInUser = user;

        const [roles, stores, pdvItems, statusTypes] = await Promise.all([
          api.get("/roles"),
          api.get("/stores"),
          api.get("/pdv-items"),
          api.get("/status-types"),
        ]);
        state.allData = { roles, stores, pdvItems, statusTypes };
        applyStatusColors();

        state.currentStore = state.loggedInUser.storeId
          ? stores.find((s) => s.id === state.loggedInUser.storeId)
          : stores[0] || null;

        e.target.reset();
        await showScreen("pdv");
      } catch (error) {
        if (error.message.includes("Primeiro acesso")) {
          state.userForPasswordChange = username;
          state.isFirstLoginForPasswordChange = true;
          await showModal("password-change");
        } else {
          errorEl.textContent = error.message;
          errorEl.classList.remove("hidden");
        }
      }
    });

  // FILTRO HISTÓRICO DE CHECKLISTS POR LOJA
    document
        .getElementById("checklist-history-store-filter")
        .addEventListener("change", renderChecklistHistoryScreen

    );

    // FILTRO DE LOGS DE PDV POR LOJA
    document.getElementById('pdv-log-store-filter').addEventListener('change', () => {
        state.showFullPdvLogs = false; // Reseta a visualização para o modo resumido
        renderPdvLogsScreen();
    });

    // VER HISTORICO COMPLETO DO LOG DE PDV
    document.getElementById('pdv-logs-list').addEventListener('click', (e) => {
        // Verifica se o elemento clicado é o botão de "Histórico Completo"
        if (e.target.id === 'show-full-pdv-logs-btn') {
            state.showFullPdvLogs = true; // Atualiza o estado para indicar que queremos ver tudo
            renderPdvLogsScreen(); // Chama a função de renderização novamente
        }
    });

  //NAVEGAÇÃO DO MODAL DE CAIXA NA FUNÇÃO DE CHECKLIST
  document
    .getElementById("checklist-pdv-modal")
    .addEventListener("click", async (e) => {
      // Verifica se o alvo do clique é o próprio container do modal (o fundo escuro)
      if (e.target === document.getElementById("checklist-pdv-modal")) {
        showModal(null); // Apenas fecha todos os modais
        return; // E para a execução da função aqui
      }
      // Botão de ajuda (?)
      if (e.target.closest("#checklist-help-btn")) {
        await showModal("checklist-help");
        return;
      }

      

      // Busca a lista de PDVs da loja uma única vez para usar em todas as ações
      const pdvsDaLoja = (
        await api.get(`/stores/${state.currentStore.id}/pdvs`)
      ).sort((a, b) =>
        a.number.localeCompare(b.number, undefined, { numeric: true })
      );

      if (!pdvsDaLoja || pdvsDaLoja.length === 0) return;

      const pdv = pdvsDaLoja[state.currentChecklistPdvIndex];
      if (!pdv) return;

      let checkData = state.activeChecklist.pdvChecks.find(
        (c) => c.pdvId === pdv.id
      );
      if (!checkData) {
        checkData = { pdvId: pdv.id };
        state.activeChecklist.pdvChecks.push(checkData);
      }

     

// Botões "Incluir" (antigo "Tudo OK") e "Salvar e Voltar" agora têm a mesma função: salvar e fechar.
    if (e.target.id === 'checklist-ok-btn' || e.target.id === 'checklist-save-and-close-btn') {
        if (saveAndValidateCurrentChecklistPdv()) { // Valida e salva os dados do formulário no 'state'
            await showModal(null); // Fecha o modal
            await renderChecklistScreen(); // Atualiza a tela de checklist para refletir a mudança
        }
        return;
    }

          // Botão "Caixa Ocupado"
      if (e.target.id === "checklist-busy-btn") {
        checkData.result = "busy";
        checkData.issues = [];
        checkData.observation = "Caixa Ocupado";
        checkData.newStatusId = null;
        await showModal(null);
        await renderChecklistScreen();
        return; // Finaliza a execução para este botão
      }

      // Ações que precisam validar e salvar os dados do formulário
      if (
        [
          "checklist-save-and-close-btn",
          "checklist-prev-pdv-btn",
          "checklist-next-pdv-btn",
        ].includes(e.target.id)
      ) {
        // Validação ocorre apenas para estes botões
        if (!saveAndValidateCurrentChecklistPdv()) {
          return;
        }

        if (e.target.id === "checklist-save-and-close-btn") {
          await showModal(null);
          await renderChecklistScreen();
        } else if (
          e.target.id === "checklist-prev-pdv-btn" &&
          state.currentChecklistPdvIndex > 0
        ) {
          state.currentChecklistPdvIndex--;
          await renderChecklistPdvModal();
        } else if (
          e.target.id === "checklist-next-pdv-btn" &&
          state.currentChecklistPdvIndex < pdvsDaLoja.length - 1
        ) {
          state.currentChecklistPdvIndex++;
          await renderChecklistPdvModal();
        }
      }
    });

  document
    .getElementById("admin-stores-screen")
    .addEventListener("click", (e) => {
      // Verifica se o clique foi no botão de gerenciar itens de PDV ou em algo dentro dele
      if (e.target.closest("#goto-pdv-items-btn")) {
        e.preventDefault();
        showScreen("admin-pdv-items");
      }
    });
  document
    .getElementById("add-pdv-item-form")
    .addEventListener("submit", (e) => {
      e.preventDefault(); // Impede o recarregamento da página
      const name = document.getElementById("new-pdv-item-name").value.trim();
      if (!name) return;

      const action = async () => {
        try {
          await api.post("/pdv-items", { name });
          await logAction(`Adicionou o item de PDV padrão "${name}".`);
          showToast("Item padrão adicionado!");
          e.target.reset();
          await showScreen("admin-pdv-items"); // Re-renderiza a tela para mostrar o novo item
        } catch (error) {
          // O erro já é exibido pelo helper da API, não precisa fazer nada aqui.
        }
      };

      // RENDER LISTENERS
      document
        .getElementById("pdv-log-store-filter")
        .addEventListener("change", () => {
          state.showFullPdvLogs = false; // Reseta a visualização ao mudar de loja
          renderPdvLogsScreen();
        });

      document
        .getElementById("pdv-logs-list")
        .addEventListener("click", (e) => {
          if (e.target.id === "show-full-pdv-logs-btn") {
            state.showFullPdvLogs = true;
            renderPdvLogsScreen();
          }
        });

      showConfirmationModal(
        "Adicionar Item Padrão",
        `Adicionar "${name}" à lista de itens padrão?`,
        action
      );
    });

  document
    .getElementById("change-password-link")
    .addEventListener("click", (e) => {
      e.preventDefault();
      const username = document.getElementById("username").value;
      if (!username)
        return showToast("Por favor, informe seu usuário primeiro.", "error");
      const user = state.allData.users.find((u) => u.username === username);
      state.userForPasswordChange = username;
      state.isFirstLoginForPasswordChange = user && user.password === null;
      showModal("password-change");
    });

  document.getElementById("open-menu-btn").addEventListener("click", openMenu);
  document
    .getElementById("close-menu-btn")
    .addEventListener("click", closeMenu);
  document.getElementById("menu-overlay").addEventListener("click", closeMenu);
  document.getElementById("logout-btn").addEventListener("click", (e) => {
    e.preventDefault();
    handleLogout();
  });
  document.getElementById("admin-panel-btn").addEventListener("click", (e) => {
    e.preventDefault();
    closeMenu();
    showScreen("admin-main-menu");
  });
  document.getElementById("main-panel-btn").addEventListener("click", (e) => {
    e.preventDefault();
    closeMenu();
    showScreen("pdv");
  });
  document.getElementById("change-store-btn").addEventListener("click", (e) => {
    e.preventDefault();
    closeMenu();
    showModal("select-store");
  });
  document
    .getElementById("admin-back-to-pdv-btn")
    .addEventListener("click", () => showScreen("pdv"));
  document
    .querySelectorAll(".admin-back-to-main-menu-btn")
    .forEach((btn) =>
      btn.addEventListener("click", () => showScreen("admin-main-menu"))
    );
  document
    .querySelectorAll(".admin-back-to-logs-menu-btn")
    .forEach((btn) =>
      btn.addEventListener("click", () => showScreen("admin-logs-menu"))
    );
  document
    .getElementById("goto-users-list-btn")
    .addEventListener("click", () => showScreen("admin-users-list"));
  document
    .getElementById("back-to-users-menu-btn")
    .addEventListener("click", () => showScreen("admin-users"));
  document
    .getElementById("back-to-pdv-from-checklist-btn")
    .addEventListener("click", () => showScreen("pdv"));
  document
    .getElementById("back-from-pdv-items-btn")
    .addEventListener("click", () => showScreen("admin-stores"));
  document
    .getElementById("goto-admin-logs-btn")
    .addEventListener("click", () => showScreen("admin-administrative-logs"));
  document
    .getElementById("goto-pdv-logs-btn")
    .addEventListener("click", () => showScreen("admin-pdv-logs"));

  // --- MODAIS ---
  [
    "close-details-modal-btn",
    "cancel-add-status-btn",
    "cancel-store-selection-btn",
    "close-manage-store-modal-btn",
    "cancel-edit-user-btn",
    "cancel-edit-store-btn",
    "cancel-password-change-btn",
    "cancel-confirmation-btn",
    "cancel-edit-role-btn",
    "close-view-checklist-modal-btn",
    "close-checklist-help-btn",
    "cancel-apply-item-btn",
    "cancel-checklist-config-btn",
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener("click", async (e) => {
      let newModal = null;
      if (e.target.id === "cancel-add-status-btn") newModal = "pdv-details";
      else if (
        e.target.id === "cancel-checklist-config-btn" ||
        e.target.id === "cancel-apply-item-btn"
      )
        newModal = "manage-store";
      else if (e.target.id === "close-checklist-help-btn")
        newModal = "checklist-pdv";
      await showModal(newModal);
    });
  });

  document
    .getElementById("add-status-btn")
    .addEventListener("click", () => showModal("add-status"));

  document
    .getElementById("store-selection-list")
    .addEventListener("click", (e) => {
      const target = e.target.closest(".store-item");
      if (!target) return;

      const storeId = parseInt(target.dataset.storeid);
      state.currentStore = state.allData.stores.find((s) => s.id === storeId);

      // --- LINHA ADICIONADA ---
      // Salva o ID da loja selecionada no localStorage
      localStorage.setItem("selectedStoreId", storeId);

      showModal(null);
      renderPdvScreen();
    });

  // --- FORMULÁRIOS ---

  document
    .getElementById("password-change-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById("password-change-error");
      const newPassword = document.getElementById("new-password").value;
      const confirmNewPassword = document.getElementById(
        "confirm-new-password"
      ).value;
      const currentPassword = document.getElementById("current-password").value;
      errorEl.classList.add("hidden");
      if (newPassword !== confirmNewPassword) {
        errorEl.textContent = "As novas senhas não coincidem.";
        return errorEl.classList.remove("hidden");
      }
      if (newPassword.length < 3) {
        errorEl.textContent = "A nova senha deve ter no mínimo 3 caracteres.";
        return errorEl.classList.remove("hidden");
      }
      try {
        await api.post("/auth/change-password", {
          username: state.userForPasswordChange,
          currentPassword: state.isFirstLoginForPasswordChange
            ? null
            : currentPassword,
          newPassword,
        });
        await logAction(
          `Usuário "${state.userForPasswordChange}" alterou a própria senha.`
        );
        showModal(null);
        showToast("Senha alterada com sucesso! Faça o login.");
      } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove("hidden");
      }
    });

  document
    .getElementById("confirmation-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      if (typeof state.actionToConfirm === "function") {
        try {
          await state.actionToConfirm();
        } catch (err) {
          /* erro já tratado pelo helper da api */
        }
      }
      await showModal(null);
    });

  document
    .getElementById("add-status-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const statusId = parseInt(document.getElementById("status-select").value);
      const description = document.getElementById("status-description").value;
      const itemId = document.getElementById("status-item-select").value
        ? parseInt(document.getElementById("status-item-select").value)
        : null;
      try {
        await api.post(`/pdvs/${state.selectedPdvId}/status-history`, {
          statusId,
          description,
          itemId,
          techId: state.loggedInUser.id,
        });
        await showModal("pdv-details");
        await renderPdvScreen();
        showToast("Status salvo com sucesso!");
      } catch (error) {
        showToast("Falha ao salvar status.", "error");
      }
    });

  document.getElementById("add-store-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("new-store-name").value.trim();
    const start = parseInt(
      document.getElementById("new-store-pdv-start").value
    );
    if (!name || !start) return;
    const action = async () => {
      await api.post("/stores", { name, pdvNamingStart: start });
      await logAction(`Criou a loja "${name}".`);
      e.target.reset();
      await showScreen("admin-stores");
      showToast("Loja adicionada!");
    };
    showConfirmationModal(
      "Adicionar Loja",
      `Confirmar a criação da loja "${name}"?`,
      action
    );
  });

  document.getElementById("add-user-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("new-user-name").value;
    const username = document.getElementById("new-user-username").value;
    const roleId = parseInt(document.getElementById("new-user-role").value);
    const storeId = document.getElementById("new-user-store").value
      ? parseInt(document.getElementById("new-user-store").value)
      : null;
    const action = async () => {
      await api.post("/users", { name, username, roleId, storeId });
      await logAction(`Criou o usuário "${name}" (${username}).`);
      e.target.reset();
      showToast("Usuário adicionado!");
    };
    showConfirmationModal(
      "Adicionar Usuário",
      `Confirmar a criação de "${name}"? A senha inicial será nula.`,
      action
    );
  });

  document.getElementById("edit-user-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const userId = parseInt(document.getElementById("edit-user-id").value);
    const name = document.getElementById("edit-user-name").value;
    const username = document.getElementById("edit-user-username").value;
    const roleId = parseInt(document.getElementById("edit-user-role").value);
    const storeId = document.getElementById("edit-user-store").value
      ? parseInt(document.getElementById("edit-user-store").value)
      : null;
    const action = async () => {
      await api.put(`/users/${userId}`, { name, username, roleId, storeId });
      await logAction(`Editou o usuário "${name}".`);
      await showScreen("admin-users-list");
      showToast("Usuário atualizado!");
    };
    showConfirmationModal(
      "Editar Usuário",
      `Confirmar as alterações em "${name}"?`,
      action
    );
  });

  document.getElementById("edit-store-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const storeId = parseInt(document.getElementById("edit-store-id").value);
    const name = document.getElementById("edit-store-name").value;
    const start = parseInt(
      document.getElementById("edit-store-pdv-start").value
    );
    const action = async () => {
      await api.put(`/stores/${storeId}`, { name, pdvNamingStart: start });
      await logAction(`Alterou a loja "${name}".`);
      await showScreen("admin-stores");
      showToast("Loja atualizada!");
    };
    showConfirmationModal(
      "Editar Loja",
      `Alterar dados da loja "${name}"?`,
      action
    );
  });

  document
    .getElementById("add-pdv-to-store-form")
    .addEventListener("submit", (e) => {
      e.preventDefault();
      const startNumberStr = document
        .getElementById("new-pdv-start-number")
        .value.trim();
      const quantity = parseInt(
        document.getElementById("new-pdv-quantity").value
      );
      const action = async () => {
        let createdCount = 0;
        const isNumeric = /^\d+$/.test(startNumberStr);
        const startNumber = isNumeric ? parseInt(startNumberStr, 10) : 0;
        for (let i = 0; i < quantity; i++) {
          const newPdvNumber = isNumeric
            ? (startNumber + i).toString()
            : `${startNumberStr}-${i + 1}`;
          await api.post(`/stores/${state.selectedStoreId}/pdvs`, {
            number: newPdvNumber,
          });
          createdCount++;
        }
        await logAction(`Criou ${createdCount} PDV(s) na loja.`);
        await renderManageStoreModal();
        showToast(`${createdCount} PDV(s) criados!`);
        e.target.reset();
      };
      showConfirmationModal(
        "Criação Rápida",
        `Criar ${quantity} PDV(s) a partir de "${startNumberStr}"?`,
        action
      );
    });

  document.getElementById("add-role-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("new-role-name").value.trim();
    if (!name) return;
    const action = async () => {
      await api.post("/roles", { name });
      await logAction(`Criou o cargo "${name}".`);
      await showScreen("admin-roles");
      showToast("Cargo criado!");
      e.target.reset();
    };
    showConfirmationModal(
      "Criar Cargo",
      `Confirmar a criação do cargo "${name}"?`,
      action
    );
  });

  document.getElementById("edit-role-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const roleId = parseInt(document.getElementById("edit-role-id").value);
    const role = state.allData.roles.find((r) => r.id === roleId);
    const action = async () => {
      const newPermissions = {};
      e.target.querySelectorAll('input[type="checkbox"]').forEach((c) => {
        newPermissions[c.name] = c.checked;
      });
      newPermissions.editPdvStatus = e.target.querySelector(
        "#perm-editPdvStatus"
      ).value;
      await api.put(`/roles/${roleId}`, { permissions: newPermissions });
      await logAction(`Alterou as permissões do cargo "${role.name}".`);
      await showScreen("admin-roles");
      showToast("Permissões salvas!");
    };
    showConfirmationModal(
      "Salvar Permissões",
      `Alterar as permissões para "${role.name}"?`,
      action
    );
  });

  // --- EVENTOS DELEGAÇÃO ---
document.getElementById('app-container').addEventListener('click', async (e) => {
    const { target } = e;
    const el = target.closest('[data-userid], [data-storeid], [data-pdvid], [data-statusid], [data-roleid], [data-itemid], [data-checklistid]');

    // Botão 'Visualizar' do Histórico de Checklist
    if (target.matches('.view-checklist-log-btn, .view-checklist-history-btn')) {
        const checklistId = parseInt(target.dataset.checklistid);
        if (checklistId) {
            state.selectedChecklistId = checklistId;
            await showModal('view-checklist');
        }
        return;
    }

    if (!el) return;
    const { userid, storeid, pdvid, statusid, roleid, itemid } = el.dataset;

    // Ações de Usuários
    if (target.matches('.remove-user-btn')) {
        const userId = parseInt(userid);
        const user = state.allData.users.find(u => u.id === userId);
        if (!user) return;
        
        // Validações de segurança no front-end
        if (user.username === 'admin') return showToast('O usuário "admin" não pode ser removido.', 'error');
        if (user.id === state.loggedInUser.id) return showToast('Você não pode remover a si mesmo.', 'error');
        
        const action = async () => {
            await api.delete(`/users/${userId}`);
            await logAction(`Removeu o usuário "${user.name}".`);
            await showScreen('admin-users-list');
            showToast('Usuário removido!');
        };
        showConfirmationModal('Remover Usuário', `Remover "${user.name}"? Esta ação não pode ser desfeita.`, action);

    } else if (target.matches('.edit-user-btn')) {
        state.selectedUserId = parseInt(userid);
        await showModal('edit-user');
    }
    
    // Ações de Lojas
    else if (target.matches('.remove-store-btn')) {
        const storeId = parseInt(storeid);
        const store = state.allData.stores.find(s => s.id === storeId);
        const action = async () => {
            await api.delete(`/stores/${storeId}`);
            await logAction(`Removeu a loja "${store.name}".`);
            await showScreen('admin-stores');
            showToast('Loja removida!');
        };
        showConfirmationModal('Remover Loja', `Remover "${store.name}" e todos os seus PDVs?`, action);
    } else if (target.matches('.edit-store-btn')) {
        state.selectedStoreId = parseInt(storeid);
        await showModal('edit-store');
    } else if (target.matches('.manage-store-btn'))
         {
        state.selectedStoreId = parseInt(storeid);
        await showModal('manage-store');
        
    } else if (target.id === 'goto-checklist-config-btn') {
        console.log('clicado')
        e.preventDefault();
        await showModal('checklist-config');
    } 
    
    // Ações de PDVs
    else if (target.matches('.remove-pdv-btn')) {
        const pdvId = parseInt(pdvid);
        const action = async () => {
            await api.delete(`/pdvs/${pdvId}`);
            await logAction(`Removeu um PDV.`);
            await renderManageStoreModal(); // Re-renderiza o modal atual
            showToast('PDV removido!');
        };
        showConfirmationModal('Remover PDV', `Remover este PDV?`, action);
    }
    
    // Ações de Status
    else if (target.matches('.remove-status-btn')) {
        const statusId = parseInt(statusid);
        const status = state.allData.statusTypes.find(s => s.id === statusId);
        const action = async () => {
            await api.delete(`/status-types/${statusId}`);
            await logAction(`Removeu o status "${status.name}".`);
            await showScreen('admin-status');
            showToast('Status removido!');
        };
        showConfirmationModal('Remover Status', `Remover o status "${status.name}"?`, action);
    }

    // Ações de Cargos (Roles)
    else if (target.matches('.edit-role-btn')) {
        state.selectedRoleId = parseInt(roleid);
        await showModal('edit-role');
    } else if (target.matches('.remove-role-btn')) {
        const roleId = parseInt(roleid);
        const role = state.allData.roles.find(r => r.id === roleId);
        const action = async () => {
            await api.delete(`/roles/${roleId}`);
            await logAction(`Removeu o cargo "${role.name}".`);
            await showScreen('admin-roles');
            showToast('Cargo removido!');
        };
        showConfirmationModal('Remover Cargo', `Remover o cargo "${role.name}"?`, action);
    }

    // Ações de Itens de PDV
    else if (target.matches('.remove-pdv-item-btn')) {
        const itemId = parseInt(itemid);
        const item = state.allData.pdvItems.find(i => i.id === itemId);
        const action = async () => {
            await api.delete(`/pdv-items/${itemId}`);
            await logAction(`Removeu o item de PDV "${item.name}".`);
            await showScreen('admin-pdv-items');
            showToast('Item removido!');
        };
        showConfirmationModal('Remover Item', `Remover o item padrão "${item.name}"?`, action);
    }
});

  // --- CHECKLIST LISTENERS ---
  document.getElementById("pdv-screen").addEventListener("click", async (e) => {
    if (e.target.id === "start-checklist-btn") {
      try {
        const checklist = await api.get(
          `/checklists/today?storeId=${state.currentStore.id}`
        );
        state.activeChecklist = checklist;
      } catch (error) {
        // Se der 404 (não encontrado), cria um novo checklist no estado local
        state.activeChecklist = {
          storeId: state.currentStore.id,
          date: getTodayDateString(),
          status: "in-progress",
          pdvChecks: [],
        };
      }
      await showScreen("checklist");
    }
  });

  document
    .getElementById("checklist-pdv-list")
    .addEventListener("click", (e) => {
      const card = e.target.closest(".checklist-pdv-card");
      if (card) {
        state.currentChecklistPdvIndex = parseInt(card.dataset.index);
        showModal("checklist-pdv");
      }
    });

  document
    .getElementById("save-checklist-btn")
    .addEventListener("click", async () => {
      try {
        const savedChecklist = await api.post(
          "/checklists",
          state.activeChecklist
        );
        if (!state.activeChecklist.id && savedChecklist.id) {
          state.activeChecklist.id = savedChecklist.id;
        }
        await logAction(
          `Salvou o progresso do checklist da loja ${state.currentStore.name}.`
        );
        showToast("Progresso salvo!", "info");
      } catch (e) {
        showToast("Erro ao salvar progresso.", "error");
      }
    });

  document
    .getElementById("finalize-checklist-btn")
    .addEventListener("click", () => {
      const action = async () => {
        state.activeChecklist.status = "completed";
        state.activeChecklist.finalizedByUserId = state.loggedInUser.id;
        await api.post("/checklists", state.activeChecklist);
        await logAction(
          `Finalizou o checklist da loja ${state.currentStore.name}.`
        );
        showToast("Checklist finalizado!");
        await showScreen("pdv");
      };
      showConfirmationModal(
        "Finalizar Checklist",
        "Deseja finalizar e aplicar todas as alterações de status?",
        action
      );
    });
}

document.addEventListener("DOMContentLoaded", async () => {
  setTimeout(() => {
    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
      loadingScreen.classList.add("hidden");
    }
  }, 1250);

  setupAllEventListeners(); // Configura todos os cliques e formulários

  const token = localStorage.getItem("authToken");
  if (token) {
    try {
      // Tenta validar o token existente no servidor
      const { user } = await api.get("/auth/me");
      state.loggedInUser = user;

      // Se o token for válido, carrega todos os dados essenciais da aplicação
      const [roles, stores, pdvItems, statusTypes, users] = await Promise.all([
        api.get("/roles"),
        api.get("/stores"),
        api.get("/pdv-items"),
        api.get("/status-types"),
        api.get("/users"), // Busca os usuários também
      ]);
      state.allData = { roles, stores, pdvItems, statusTypes, users };
      applyStatusColors();

      // Define a loja atual e exibe a tela principal
      // 1. Tenta pegar a loja salva no localStorage
      const savedStoreId = localStorage.getItem("selectedStoreId");
      let selectedStore = null;
      if (savedStoreId) {
        selectedStore = stores.find((s) => s.id == savedStoreId);
      }

      // 2. Se não encontrou no localStorage, usa a loja padrão do usuário
      if (!selectedStore && state.loggedInUser.storeId) {
        selectedStore = stores.find((s) => s.id === state.loggedInUser.storeId);
      }

      // 3. Se ainda não encontrou, usa a primeira loja da lista como último recurso
      if (!selectedStore) {
        selectedStore = stores[0] || null;
      }

      state.currentStore = selectedStore;
      await showScreen("pdv");
    } catch (error) {
      // Se o token for inválido ou expirado, limpa e vai para a tela de login
      localStorage.removeItem("authToken");
      window.location.reload(); // Recarrega a página para o estado de "deslogado"
    }
  } else {
    // Se não houver token, carrega os dados básicos para a tela de login
    try {
      // --- MUDANÇA PRINCIPAL AQUI ---
      const [roles, stores, pdvItems, statusTypes, users] = await Promise.all([
        api.get("/roles"),
        api.get("/stores"),
        api.get("/pdv-items"),
        api.get("/status-types"),
        api.get("/users"), // ADICIONADO: Busca a lista de usuários
      ]);
      // ADICIONADO: 'users' ao estado global
      state.allData = { roles, stores, pdvItems, statusTypes, users };
      applyStatusColors();
    } catch (e) {
      console.error("Erro ao carregar dados básicos para tela de login", e);
    }
    await showScreen("login");
  }
});


// Adicionar ao final do app.js APP EXTERNO
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('Service Worker registrado com sucesso:', registration);
            })
            .catch(error => {
                console.log('Falha ao registrar o Service Worker:', error);
            });
    });
}