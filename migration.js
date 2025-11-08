// Script de Migração de Dados (v1.5 -> v2.0)
// ATENÇÃO: Execute este script UMA VEZ, após fazer backup do seu banco de dados.
//
// COMO USAR (Conforme Seção 7 da Documentação):
// 1. Pare a aplicação v1.5.
// 2. Faça uma cópia de segurança de `painel-ti.sqlite` (ex: `painel-ti-backup.sqlite`).
// 3. Faça outra cópia e renomeie para `painel-ti-old.sqlite`.
// 4. Execute este script: `npm run migrate`
// 5. Se tudo correr bem, um arquivo `painel-ti-new.sqlite` será gerado.
// 6. Renomeie `painel-ti.sqlite` para `painel-ti-v1.5-ARCHIVED.sqlite`.
// 7. Renomeie `painel-ti-new.sqlite` para `painel-ti.sqlite`.
// 8. Inicie a nova aplicação (v2.0).

const sqlite3 = require("sqlite3").verbose();

// IDs dos status que devem ser considerados "problemas"
// !! AJUSTE ESSES IDS PARA CORresponder AOS SEUS DADOS EM `status_types` !!
const PROBLEM_STATUS_IDS = [2, 3]; // Ex: 2 = Manutenção, 3 = Atenção

const oldDb = new sqlite3.Database(
  "./painel-ti-old.sqlite",
  sqlite3.OPEN_READONLY,
  (err) => {
    if (err) {
      console.error(
        "Erro ao abrir o banco de dados antigo (painel-ti-old.sqlite):",
        err.message
      );
      console.error(
        "Certifique-se de que o arquivo existe e foi nomeado corretamente."
      );
    } else {
      console.log("Conectado ao banco de dados antigo (leitura).");
      createNewDatabase();
    }
  }
);

const newDb = new sqlite3.Database("./painel-ti-new.sqlite", (err) => {
  if (err) {
    console.error(
      "Erro ao criar o novo banco de dados (painel-ti-new.sqlite):",
      err.message
    );
  } else {
    console.log("Novo banco de dados (escrita) criado.");
  }
});

function createNewDatabase() {
  newDb.serialize(() => {
    console.log("Criando novo schema v2.0...");

    // --- Criar todas as tabelas no novo banco ---
    // (Copie todas as declarações CREATE TABLE do `database.js` v2.0 aqui)

    newDb.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role_id INTEGER NOT NULL,
            FOREIGN KEY(role_id) REFERENCES roles(id)
        )`);

    newDb.run(`CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )`);

    newDb.run(`CREATE TABLE IF NOT EXISTS role_permissions (
            role_id INTEGER NOT NULL,
            permission TEXT NOT NULL,
            PRIMARY KEY (role_id, permission),
            FOREIGN KEY(role_id) REFERENCES roles(id)
        )`);

    newDb.run(`CREATE TABLE IF NOT EXISTS stores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            city TEXT
        )`);

    newDb.run(`CREATE TABLE IF NOT EXISTS pdvs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            number TEXT NOT NULL,
            store_id INTEGER NOT NULL,
            FOREIGN KEY(store_id) REFERENCES stores(id)
        )`);

    newDb.run(`CREATE TABLE IF NOT EXISTS status_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT NOT NULL
        )`);

    newDb.run(`CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL
        )`);

    newDb.run(`CREATE TABLE IF NOT EXISTS status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pdv_id INTEGER NOT NULL,
            status_type_id INTEGER NOT NULL,
            item_id INTEGER,
            description TEXT,
            user_id INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(pdv_id) REFERENCES pdvs(id),
            FOREIGN KEY(status_type_id) REFERENCES status_types(id),
            FOREIGN KEY(item_id) REFERENCES items(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

    newDb.run(`CREATE TABLE IF NOT EXISTS checklists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            store_id INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(store_id) REFERENCES stores(id)
        )`);

    newDb.run(`CREATE TABLE IF NOT EXISTS checklist_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            checklist_id INTEGER NOT NULL,
            pdv_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            notes TEXT,
            FOREIGN KEY(checklist_id) REFERENCES checklists(id),
            FOREIGN KEY(pdv_id) REFERENCES pdvs(id)
        )`);

    newDb.run(`CREATE TABLE IF NOT EXISTS admin_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

    newDb.run(`CREATE TABLE IF NOT EXISTS problems (
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
            FOREIGN KEY(pdv_id) REFERENCES pdvs(id),
            FOREIGN KEY(item_id) REFERENCES items(id),
            FOREIGN KEY(reported_by_user_id) REFERENCES users(id),
            FOREIGN KEY(assigned_to_user_id) REFERENCES users(id)
        )`);

    newDb.run(`CREATE TABLE IF NOT EXISTS assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patrimony_code TEXT UNIQUE,
            serial_number TEXT UNIQUE,
            type TEXT NOT NULL,
            brand TEXT,
            model TEXT,
            status TEXT NOT NULL DEFAULT 'Em Operação',
            current_store_id INTEGER,
            FOREIGN KEY(current_store_id) REFERENCES stores(id)
        )`);

    newDb.run(
      `CREATE TABLE IF NOT EXISTS asset_movements (
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
            FOREIGN KEY(asset_id) REFERENCES assets(id),
            FOREIGN KEY(origin_store_id) REFERENCES stores(id),
            FOREIGN KEY(destination_store_id) REFERENCES stores(id),
            FOREIGN KEY(sent_by_user_id) REFERENCES users(id),
            FOREIGN KEY(received_by_user_id) REFERENCES users(id)
        )`,
      (err) => {
        if (err) {
          console.error("Erro ao criar tabelas:", err.message);
        } else {
          console.log("Schema v2.0 criado com sucesso.");
          startDataMigration();
        }
      }
    );
  });
}

function startDataMigration() {
  console.log("Iniciando migração de dados...");

  // Tabelas de migração direta (1-para-1)
  const directMigrationTables = [
    "users",
    "roles",
    "role_permissions",
    "stores",
    "pdvs",
    "status_types",
    "items",
    "checklists",
    "checklist_items",
    "admin_logs",
    "status_history", // Migramos TUDO, a v2.0 ainda usa para observações
  ];

  let tablesMigrated = 0;

  directMigrationTables.forEach((table) => {
    console.log(`Migrando tabela: ${table}...`);
    oldDb.all(`SELECT * FROM ${table}`, (err, rows) => {
      if (err) {
        console.error(`Erro ao ler dados da tabela ${table}:`, err.message);
        return;
      }

      if (rows.length === 0) {
        console.log(`Tabela ${table} está vazia, pulando.`);
        checkCompletion(++tablesMigrated, directMigrationTables.length);
        return;
      }

      const keys = Object.keys(rows[0]);
      const placeholders = keys.map(() => "?").join(",");
      const stmt = newDb.prepare(
        `INSERT INTO ${table} (${keys.join(",")}) VALUES (${placeholders})`
      );

      newDb.parallelize(() => {
        rows.forEach((row) => {
          stmt.run(Object.values(row));
        });
      });

      stmt.finalize((err) => {
        if (err) {
          console.error(
            `Erro ao inserir dados na tabela ${table}:`,
            err.message
          );
        } else {
          console.log(
            `Tabela ${table} migrada com sucesso (${rows.length} linhas).`
          );
        }
        checkCompletion(++tablesMigrated, directMigrationTables.length);
      });
    });
  });
}

function checkCompletion(completed, total) {
  if (completed === total) {
    console.log("Migração 1-para-1 concluída.");
    transformStatusToProblems();
  }
}

function transformStatusToProblems() {
  console.log("Iniciando transformação: StatusHistory -> Problems...");

  const sql = `
        SELECT sh.pdv_id, sh.item_id, sh.user_id, sh.description, sh.timestamp, st.name as status_name
        FROM status_history sh
        JOIN status_types st ON sh.status_type_id = st.id
        WHERE sh.status_type_id IN (${PROBLEM_STATUS_IDS.join(",")})
    `;

  oldDb.all(sql, (err, rows) => {
    if (err) {
      console.error(
        "Erro ao selecionar dados para transformação:",
        err.message
      );
      return;
    }

    if (rows.length === 0) {
      console.log(
        "Nenhum registro de status antigo para transformar em 'Problems'."
      );
      finishMigration();
      return;
    }

    console.log(
      `Transformando ${rows.length} registros de status em 'Problems'...`
    );

    const stmt = newDb.prepare(`
            INSERT INTO problems 
            (pdv_id, item_id, reported_by_user_id, title, description, status, created_at, resolved_at, resolution_notes)
            VALUES (?, ?, ?, ?, ?, 'Resolvido', ?, ?, ?)
        `);

    newDb.parallelize(() => {
      rows.forEach((row) => {
        const title = row.description
          ? row.description.substring(0, 50) +
            (row.description.length > 50 ? "..." : "")
          : "Problema migrado";
        const resolutionNotes = `Incidente migrado do sistema antigo. Status original: '${row.status_name}'.`;

        stmt.run(
          row.pdv_id,
          row.item_id,
          row.user_id,
          title,
          row.description,
          row.timestamp,
          row.timestamp, // Assumindo que foi resolvido no mesmo dia
          resolutionNotes
        );
      });
    });

    stmt.finalize((err) => {
      if (err) {
        console.error("Erro ao inserir 'Problems' transformados:", err.message);
      } else {
        console.log(`Transformação para 'Problems' concluída com sucesso.`);
      }
      finishMigration();
    });
  });
}

function finishMigration() {
  console.log("Migração de dados v2.0 concluída.");
  oldDb.close((err) => {
    if (err) console.error("Erro ao fechar DB antigo:", err.message);
    else console.log("Conexão com DB antigo fechada.");
  });
  newDb.close((err) => {
    if (err) console.error("Erro ao fechar DB novo:", err.message);
    else console.log("Conexão com DB novo fechada.");
  });
}
