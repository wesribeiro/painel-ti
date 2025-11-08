// painel-ti-servidor/database.js

const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");
const path = require("path");
const bcrypt = require("bcrypt");

const dbFilePath = path.join(__dirname, "painel-ti.sqlite");
const SALT_ROUNDS = 10;

// A conexão com o banco de dados é uma promessa que será resolvida
// quando o banco estiver aberto e pronto para ser usado.
const dbPromise = open({
  filename: dbFilePath,
  driver: sqlite3.Database,
});

async function initializeDatabase() {
  const db = await dbPromise;
  console.log("Conectado ao banco de dados SQLite.");
  await db.exec("PRAGMA foreign_keys = ON;");

  // SERIALIZE garante que os comandos sejam executados em sequência
  await db.exec(`
        CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            permissions TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            pdvNamingStart INTEGER NOT NULL,
            checklistConfig TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            username TEXT NOT NULL UNIQUE,
            password TEXT,
            lastLogin TEXT,
            roleId INTEGER NOT NULL,
            storeId INTEGER,
            FOREIGN KEY (roleId) REFERENCES roles(id),
            FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS pdvs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            number TEXT NOT NULL,
            storeId INTEGER NOT NULL,
            FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS pdvItems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS statusTypes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS statusHistory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            pdvId INTEGER NOT NULL,
            statusId INTEGER NOT NULL,
            techId INTEGER,
            itemId INTEGER,
            FOREIGN KEY (pdvId) REFERENCES pdvs(id) ON DELETE CASCADE,
            FOREIGN KEY (statusId) REFERENCES statusTypes(id),
            FOREIGN KEY (techId) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (itemId) REFERENCES pdvItems(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS checklists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            status TEXT NOT NULL, -- 'in-progress', 'completed'
            pdvChecks TEXT NOT NULL,
            storeId INTEGER NOT NULL,
            finalizedByUserId INTEGER,
            FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE,
            FOREIGN KEY (finalizedByUserId) REFERENCES users(id) ON DELETE SET NULL,
            UNIQUE(date, storeId)
        );

        CREATE TABLE IF NOT EXISTS actionLogs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            userId INTEGER,
            userName TEXT,
            metadata TEXT,
            FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
        );
    `);

  // --- ADIÇÃO DAS NOVAS TABELAS (V2.0) ---
  console.log("Verificando tabelas da v2.0...");
  await db.exec(`
        CREATE TABLE IF NOT EXISTS problems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pdv_id INTEGER NOT NULL,
            item_id INTEGER,
            reported_by_user_id INTEGER NOT NULL,
            assigned_to_user_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'Aberto', -- Aberto, Em Andamento, Resolvido
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            resolved_at DATETIME,
            resolution_notes TEXT,
            resolved_by_user_id INTEGER, -- <-- CORREÇÃO: Coluna estava em falta
            originStatusId INTEGER NOT NULL, 
            FOREIGN KEY(pdv_id) REFERENCES pdvs(id) ON DELETE CASCADE,
            FOREIGN KEY(item_id) REFERENCES pdvItems(id) ON DELETE SET NULL, 
            FOREIGN KEY(reported_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY(assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY(resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL, -- <-- CORREÇÃO: Chave estava em falta
            FOREIGN KEY(originStatusId) REFERENCES statusTypes(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patrimony_code TEXT UNIQUE,
            serial_number TEXT UNIQUE,
            type TEXT NOT NULL,
            brand TEXT,
            model TEXT,
            status TEXT NOT NULL DEFAULT 'Em Operação', -- Em Operação, Em Trânsito, Em Manutenção, Baixado
            current_store_id INTEGER,
            FOREIGN KEY(current_store_id) REFERENCES stores(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS asset_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            asset_id INTEGER NOT NULL,
            origin_store_id INTEGER,
            destination_store_id INTEGER,
            shipping_invoice_number TEXT,
            sent_by_user_id INTEGER NOT NULL,
            received_by_user_id INTEGER,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            received_at DATETIME,
            status TEXT NOT NULL DEFAULT 'Em Trânsito', -- Em Trânsito, Concluído
            FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE,
            FOREIGN KEY(origin_store_id) REFERENCES stores(id) ON DELETE SET NULL,
            FOREIGN KEY(destination_store_id) REFERENCES stores(id) ON DELETE SET NULL,
            FOREIGN KEY(sent_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY(received_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        );
    `);

  // --- SEEDING (Popular o banco com dados iniciais se estiver vazio) ---
  const usersCount = await db.get("SELECT COUNT(id) as count FROM users");

  if (usersCount.count === 0) {
    console.log("Banco de dados vazio. Populando com dados iniciais...");
    try {
      await db.run("BEGIN TRANSACTION");

      // Roles
      const roles = [
        {
          id: 1,
          name: "Administrador",
          permissions: {
            accessAdminPanel: true,
            manageUsers: true,
            manageStores: true,
            manageStatusTypes: true,
            managePermissions: true,
            viewActionLogs: true,
            manageChecklistSettings: true,
            managePdvItems: true,
            canStartChecklist: true,
            editPdvStatus: "all",
            viewAllPdvStatus: true,
          },
        },
        {
          id: 2,
          name: "Técnico",
          permissions: {
            accessAdminPanel: true,
            manageUsers: false,
            manageStores: false,
            manageStatusTypes: false,
            managePermissions: false,
            viewActionLogs: false,
            manageChecklistSettings: false,
            managePdvItems: false,
            canStartChecklist: true,
            editPdvStatus: "own",
            viewAllPdvStatus: true,
          },
        },
        {
          id: 3,
          name: "Supervisor",
          permissions: {
            accessAdminPanel: true,
            manageUsers: false,
            manageStores: false,
            manageStatusTypes: false,
            managePermissions: false,
            viewActionLogs: false,
            manageChecklistSettings: false,
            managePdvItems: false,
            canStartChecklist: false,
            editPdvStatus: "none",
            viewAllPdvStatus: true,
          },
        },
      ];
      const roleStmt = await db.prepare(
        "INSERT INTO roles (id, name, permissions) VALUES (?, ?, ?)"
      );
      for (const role of roles) {
        await roleStmt.run(
          role.id,
          role.name,
          JSON.stringify(role.permissions)
        );
      }
      await roleStmt.finalize();

      // Stores
      const stores = [
        {
          id: 1,
          name: "Nilo - Loja 01 (Centro)",
          pdvNamingStart: 101,
          checklistConfig: {
            items: [{ id: 1, text: "Verificar Ar Condicionado" }],
            noChecklistDaysLimit: 5,
          },
        },
        {
          id: 2,
          name: "Nilo - Loja 02 (Bairro)",
          pdvNamingStart: 201,
          checklistConfig: { items: [], noChecklistDaysLimit: 3 },
        },
      ];
      const storeStmt = await db.prepare(
        "INSERT INTO stores (id, name, pdvNamingStart, checklistConfig) VALUES (?, ?, ?, ?)"
      );
      for (const store of stores) {
        await storeStmt.run(
          store.id,
          store.name,
          store.pdvNamingStart,
          JSON.stringify(store.checklistConfig)
        );
      }
      await storeStmt.finalize();

      // Users
      const users = [
        {
          id: 1,
          name: "Administrador",
          username: "admin",
          password: "Nilo@@1254",
          roleId: 1,
          storeId: null,
        },
        {
          id: 2,
          name: "Fulano de Tal",
          username: "fulano",
          password: "123",
          roleId: 2,
          storeId: 1,
        },
        {
          id: 3,
          name: "Ciclano Supervisor",
          username: "supervisor",
          password: null,
          roleId: 3,
          storeId: null,
        },
      ];
      const userStmt = await db.prepare(
        "INSERT INTO users (id, name, username, password, roleId, storeId) VALUES (?, ?, ?, ?, ?, ?)"
      );
      for (const user of users) {
        const passwordHash = user.password
          ? await bcrypt.hash(user.password, SALT_ROUNDS)
          : null;
        await userStmt.run(
          user.id,
          user.name,
          user.username,
          passwordHash,
          user.roleId,
          user.storeId
        );
      }
      await userStmt.finalize();

      // PDVs
      const pdvs = [
        { id: 101, storeId: 1, number: "101" },
        { id: 102, storeId: 1, number: "102" },
        { id: 103, storeId: 1, number: "103" },
        { id: 104, storeId: 2, number: "201" },
      ];
      const pdvStmt = await db.prepare(
        "INSERT INTO pdvs (id, storeId, number) VALUES (?, ?, ?)"
      );
      for (const pdv of pdvs) {
        await pdvStmt.run(pdv.id, pdv.storeId, pdv.number);
      }
      await pdvStmt.finalize();

      // PDV Items
      const pdvItems = [
        { name: "Monitor" },
        { name: "Teclado" },
        { name: "Mouse" },
        { name: "Scanner de Mão" },
        { name: "Impressora Fiscal" },
      ];
      const pdvItemStmt = await db.prepare(
        "INSERT INTO pdvItems (name) VALUES (?)"
      );
      for (const item of pdvItems) {
        await pdvItemStmt.run(item.name);
      }
      await pdvItemStmt.finalize();

      // Status Types
      const statusTypes = [
        { name: "Ok", color: "green" },
        { name: "Atenção", color: "orange" },
        { name: "Manutenção", color: "red" },
        { name: "Reserva", color: "gray" },
        { name: "Sem status", color: "gray" },
      ];
      const statusTypeStmt = await db.prepare(
        "INSERT INTO statusTypes (name, color) VALUES (?, ?)"
      );
      for (const status of statusTypes) {
        await statusTypeStmt.run(status.name, status.color);
      }
      await statusTypeStmt.finalize();

      // Status History
      const statusHistory = [
        {
          pdvId: 101,
          statusId: 3,
          description: "PDV não liga, fonte.",
          techId: 2,
          timestamp: "2025-09-25T10:00:00.000Z",
          itemId: null,
        },
        {
          pdvId: 101,
          statusId: 1,
          description: "Fonte trocada",
          techId: 2,
          timestamp: "2025-09-26T11:30:00.000Z",
          itemId: null,
        },
        {
          pdvId: 102,
          statusId: 2,
          description: 'Tecla "5" não funciona',
          techId: 2,
          timestamp: "2025-09-27T09:00:00.000Z",
          itemId: 2,
        },
      ];
      const historyStmt = await db.prepare(
        "INSERT INTO statusHistory (pdvId, statusId, description, techId, timestamp, itemId) VALUES (?, ?, ?, ?, ?, ?)"
      );
      for (const entry of statusHistory) {
        await historyStmt.run(
          entry.pdvId,
          entry.statusId,
          entry.description,
          entry.techId,
          entry.timestamp,
          entry.itemId
        );
      }
      await historyStmt.finalize();

      await db.run("COMMIT");
      console.log("Dados iniciais inseridos com sucesso.");
    } catch (err) {
      await db.run("ROLLBACK");
      console.error("Erro ao inserir dados iniciais:", err.message);
    }
  }
}

// Inicializa o banco de dados e exporta a promessa de conexão
initializeDatabase().catch((err) => {
  console.error("Falha ao inicializar o banco de dados:", err);
  process.exit(1);
});

module.exports = dbPromise;
