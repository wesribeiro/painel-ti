// migration.js (Versão Definitiva)
// 1. Apaga o 'painel-ti.sqlite' existente.
// 2. Cria um 'painel-ti.sqlite' novo com o schema V2.
// 3. Lê os dados do 'painel-ti-old.sqlite' e migra-os.

const sqlite3 = require("sqlite3").verbose();
const { open } = require("sqlite");
const path = require("path");
const fs = require("fs"); // Módulo File System para apagar o ficheiro antigo

// --- CONFIGURAÇÃO DA MIGRAÇÃO ---
const PROBLEM_STATUS_IDS = [2, 3]; // IDs para 'Atenção' e 'Manutenção'
// ---------------------------------

const oldDbPath = path.join(__dirname, "painel-ti-old.sqlite");
const newDbPath = path.join(__dirname, "painel-ti.sqlite"); // <-- ATENDENDO AO SEU PEDIDO

let oldDb;
let newDb;

async function runMigration() {
  try {
    console.log("Iniciando migração...");

    // 1. Verificar se o BD antigo existe
    if (!fs.existsSync(oldDbPath)) {
      console.error(
        `ERRO: O arquivo 'painel-ti-old.sqlite' não foi encontrado.`
      );
      console.error(
        "Por favor, renomeie seu banco de dados atual ('painel-ti.sqlite') para 'painel-ti-old.sqlite' e tente novamente."
      );
      return;
    }

    // 2. Apagar o BD principal antigo (painel-ti.sqlite), se existir
    if (fs.existsSync(newDbPath)) {
      console.log("Apagando banco de dados 'painel-ti.sqlite' antigo...");
      fs.unlinkSync(newDbPath);
      console.log("'painel-ti.sqlite' apagado.");
    }

    // 3. Abrir conexões
    console.log("Abrindo bancos de dados...");
    oldDb = await open({
      filename: oldDbPath,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READONLY,
    });
    console.log("Conectado ao 'painel-ti-old.sqlite' (leitura).");

    newDb = await open({
      filename: newDbPath, // Cria o ficheiro final
      driver: sqlite3.Database,
    });
    console.log("Novo 'painel-ti.sqlite' (escrita) criado.");

    // 4. Correr a migração
    await createNewSchema();
    await migrateDirectData();
    await transformStatusToProblems();

    console.log("--- MIGRAÇÃO CONCLUÍDA COM SUCESSO ---");
    console.log("O novo 'painel-ti.sqlite' está pronto para ser usado.");
  } catch (err) {
    console.error("!!! ERRO FATAL DURANTE A MIGRAÇÃO !!!", err);
  } finally {
    if (oldDb) await oldDb.close();
    if (newDb) await newDb.close();
    console.log("Conexões com os bancos de dados fechadas.");
  }
}

async function createNewSchema() {
  console.log("Criando novo schema v2.0...");
  await newDb.exec("PRAGMA foreign_keys = OFF;");
  await newDb.exec("BEGIN TRANSACTION;");

  // Schema V1 (copiado do seu database.js)
  await newDb.exec(`
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
        status TEXT NOT NULL,
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

  // Schema V2 (copiado do seu database.js, com as colunas corrigidas)
  await newDb.exec(`
    CREATE TABLE IF NOT EXISTS problems (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pdv_id INTEGER NOT NULL,
        item_id INTEGER,
        reported_by_user_id INTEGER NOT NULL,
        assigned_to_user_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'Aberto',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        resolution_notes TEXT,
        resolved_by_user_id INTEGER,
        originStatusId INTEGER NOT NULL, 
        FOREIGN KEY(pdv_id) REFERENCES pdvs(id) ON DELETE CASCADE,
        FOREIGN KEY(item_id) REFERENCES pdvItems(id) ON DELETE SET NULL,
        FOREIGN KEY(reported_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(originStatusId) REFERENCES statusTypes(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patrimony_code TEXT UNIQUE,
        serial_number TEXT UNIQUE,
        type TEXT NOT NULL,
        brand TEXT,
        model TEXT,
        status TEXT NOT NULL DEFAULT 'Em Operação',
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
        status TEXT NOT NULL DEFAULT 'Em Trânsito',
        FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE,
        FOREIGN KEY(origin_store_id) REFERENCES stores(id) ON DELETE SET NULL,
        FOREIGN KEY(destination_store_id) REFERENCES stores(id) ON DELETE SET NULL,
        FOREIGN KEY(sent_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(received_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  await newDb.exec("COMMIT;");
  await newDb.exec("PRAGMA foreign_keys = ON;");
  console.log("Schema v2.0 criado com sucesso.");
}

async function migrateDirectData() {
  console.log("Iniciando migração de dados 1-para-1...");

  const tablesToMigrate = [
    "roles",
    "stores",
    "users",
    "pdvs",
    "pdvItems",
    "statusTypes",
    "statusHistory",
    "checklists",
    "actionLogs",
  ];

  await newDb.exec("BEGIN TRANSACTION;");
  for (const table of tablesToMigrate) {
    try {
      console.log(`Migrando tabela: ${table}...`);
      // Lê do BD antigo
      const rows = await oldDb.all(`SELECT * FROM ${table}`);

      if (rows.length === 0) {
        console.log(`Tabela ${table} está vazia, pulando.`);
        continue;
      }

      const keys = Object.keys(rows[0]);
      const placeholders = keys.map(() => "?").join(",");
      // Prepara a inserção no BD novo
      const stmt = await newDb.prepare(
        `INSERT INTO ${table} (${keys.join(",")}) VALUES (${placeholders})`
      );

      for (const row of rows) {
        await stmt.run(Object.values(row));
      }
      await stmt.finalize();
      console.log(
        `Tabela ${table} migrada com sucesso (${rows.length} linhas).`
      );
    } catch (err) {
      if (
        err.code === "SQLITE_ERROR" &&
        err.message.includes("no such table")
      ) {
        console.warn(
          `Aviso: Tabela ${table} não encontrada no BD antigo. Pulando.`
        );
      } else {
        throw new Error(`Erro ao migrar tabela ${table}: ${err.message}`);
      }
    }
  }
  await newDb.exec("COMMIT;");
  console.log("Migração de dados 1-para-1 concluída.");
}

async function transformStatusToProblems() {
  console.log("Iniciando transformação: statusHistory -> problems...");

  const problemStatuses = await oldDb.all(
    `SELECT id FROM statusTypes WHERE id IN (${PROBLEM_STATUS_IDS.join(",")})`
  );
  const problemIdList = problemStatuses.map((s) => s.id);

  if (problemIdList.length === 0) {
    console.warn(
      "Aviso: Nenhum ID de status de problema (Atenção, Manutenção) encontrado. Pulando transformação."
    );
    return;
  }
  console.log(`IDs de problema identificados: ${problemIdList.join(", ")}`);

  const problemHistory = await oldDb.all(
    `SELECT * FROM statusHistory 
     WHERE statusId IN (${problemIdList.join(",")}) 
     ORDER BY timestamp ASC`
  );

  if (problemHistory.length === 0) {
    console.log(
      "Nenhum registro de status antigo para transformar em 'Problems'."
    );
    return;
  }

  console.log(
    `Transformando ${problemHistory.length} registros de status em 'Problems'...`
  );

  const stmt = await newDb.prepare(`
    INSERT INTO problems 
    (pdv_id, item_id, reported_by_user_id, title, description, status, created_at, originStatusId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  await newDb.exec("BEGIN TRANSACTION;");
  for (const entry of problemHistory) {
    const title = entry.description.substring(0, 100);

    await stmt.run(
      entry.pdvId,
      entry.itemId,
      entry.techId || 1, // Usa 1 (Admin) se techId for NULL
      title,
      entry.description,
      "Aberto", // Assume que todos os problemas migrados estão abertos
      entry.timestamp,
      entry.statusId
    );
  }
  await stmt.finalize();
  await newDb.exec("COMMIT;");

  console.log("Transformação para 'Problems' concluída.");
}

// Inicia o processo
runMigration();
