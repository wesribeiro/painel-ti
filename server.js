// painel-ti-servidor/server.js
// VERSÃO ATUALIZADA (V2.2)
// - Corrigido nome da coluna 'solutionNotes' para 'resolution_notes' no endpoint de resolve.

const express = require("express");
const path = require("path");
const cors = require("cors");
const dbPromise = require("./database");

// --- NOVAS DEPENDÊNCIAS DE SEGURANÇA ---
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3005;

// --- Chave secreta para assinar os tokens. Em produção, isso deve ser uma variável de ambiente! ---
const JWT_SECRET = "sua-chave-secreta-super-dificil-de-adivinhar-42";
const SALT_ROUNDS = 10; // Custo do processamento do hash do bcrypt

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ######################################################################
// #                          ROTAS DA API                              #
// ######################################################################

// --- ROTAS DE AUTENTICAÇÃO E SESSÃO ---

app.get("/api/auth/session", (req, res) => {
  res.status(401).json({ message: "Nenhuma sessão ativa." });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const db = await dbPromise;
    const user = await db.get("SELECT * FROM users WHERE username = ?", [
      username,
    ]);

    if (!user) {
      return res.status(401).json({ message: "Usuário ou senha inválidos." });
    }

    if (user.password === null) {
      return res.status(403).json({
        message: "Primeiro acesso. Defina uma senha.",
        firstLogin: true,
      });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Usuário ou senha inválidos." });
    }

    await db.run("UPDATE users SET lastLogin = ? WHERE id = ?", [
      new Date().toISOString(),
      user.id,
    ]);

    const { password: _, ...userPayload } = user;

    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: "8h" });

    res.json({
      message: "Login bem-sucedido!",
      user: userPayload,
      token: token,
    });
  } catch (e) {
    res
      .status(500)
      .json({ message: "Erro no servidor durante o login.", error: e.message });
  }
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    return res.status(401).json({ message: "Token não fornecido." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Token inválido ou expirado." });
    }
    req.user = user;
    next();
  });
};

app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/auth/change-password", async (req, res) => {
  const { username, currentPassword, newPassword } = req.body;
  try {
    const db = await dbPromise;
    const user = await db.get(
      "SELECT * FROM users WHERE id = (SELECT id FROM users WHERE username = ?)",
      [username]
    );

    if (!user)
      return res.status(404).json({ message: "Usuário não encontrado." });

    if (user.password !== null) {
      const isPasswordCorrect = await bcrypt.compare(
        currentPassword,
        user.password
      );
      if (!isPasswordCorrect)
        return res.status(403).json({ message: "Senha atual incorreta." });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await db.run("UPDATE users SET password = ? WHERE id = ?", [
      newPasswordHash,
      user.id,
    ]);
    res.status(200).json({ message: "Senha alterada com sucesso." });
  } catch (e) {
    res
      .status(500)
      .json({ message: "Erro ao alterar a senha.", error: e.message });
  }
});

app.post("/api/auth/logout", (req, res) =>
  res.status(200).json({ message: "Logout realizado." })
);

// --- ROTAS GENÉRICAS DE LEITURA (GET) ---
const createGetRoute =
  (tableName, jsonFields = []) =>
  async (req, res) => {
    try {
      const db = await dbPromise;
      const data = await db.all(`SELECT * FROM ${tableName}`);
      if (jsonFields.length > 0) {
        data.forEach((item) => {
          jsonFields.forEach((field) => {
            if (item[field]) item[field] = JSON.parse(item[field]);
          });
        });
      }
      res.json(data);
    } catch (err) {
      res
        .status(500)
        .json({ message: `Erro ao buscar ${tableName}`, error: err.message });
    }
  };

app.get("/api/roles", createGetRoute("roles", ["permissions"]));
app.get("/api/stores", createGetRoute("stores", ["checklistConfig"]));
app.get("/api/pdv-items", createGetRoute("pdvItems"));
app.get("/api/status-types", createGetRoute("statusTypes"));

app.get("/api/users", async (req, res) => {
  try {
    const db = await dbPromise;
    const users = await db.all(
      "SELECT id, name, username, lastLogin, roleId, storeId FROM users"
    );
    res.json(users);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Erro ao buscar usuários.", error: error.message });
  }
});

// --- ROTAS DE USUÁRIOS (CRUD COMPLETO) ---
app.post("/api/users", async (req, res) => {
  const { name, username, roleId, storeId } = req.body;
  try {
    const db = await dbPromise;
    const result = await db.run(
      "INSERT INTO users (name, username, roleId, storeId) VALUES (?, ?, ?, ?)",
      [name, username, roleId, storeId || null]
    );
    res
      .status(201)
      .json({ id: result.lastID, name, username, roleId, storeId });
  } catch (e) {
    res
      .status(500)
      .json({ message: "Erro ao criar usuário", error: e.message });
  }
});

app.put("/api/users/:id", async (req, res) => {
  const { name, username, roleId, storeId } = req.body;
  try {
    const db = await dbPromise;
    await db.run(
      "UPDATE users SET name=?, username=?, roleId=?, storeId=? WHERE id=?",
      [name, username, roleId, storeId || null, req.params.id]
    );
    res.status(200).json({ message: "Usuário atualizado" });
  } catch (e) {
    res
      .status(500)
      .json({ message: "Erro ao atualizar usuário", error: e.message });
  }
});
app.delete("/api/users/:id", async (req, res) => {
  try {
    const db = await dbPromise;
    await db.run("DELETE FROM users WHERE id=?", [req.params.id]);
    res.status(204).send();
  } catch (e) {
    res
      .status(500)
      .json({ message: "Erro ao deletar usuário", error: e.message });
  }
});

// --- ROTAS DE LOJAS E PDVS ---
app.post("/api/stores", async (req, res) => {
  const { name, pdvNamingStart } = req.body;
  try {
    const db = await dbPromise;
    const defaultConfig = JSON.stringify({
      items: [],
      noChecklistDaysLimit: 5,
    });
    const result = await db.run(
      "INSERT INTO stores (name, pdvNamingStart, checklistConfig) VALUES (?, ?, ?)",
      [name, pdvNamingStart, defaultConfig]
    );
    const newStore = await db.get("SELECT * FROM stores WHERE id = ?", [
      result.lastID,
    ]);
    res.status(201).json(newStore);
  } catch (e) {
    res.status(500).json({ message: "Erro ao criar loja", error: e.message });
  }
});
app.put("/api/stores/:id", async (req, res) => {
  const { name, pdvNamingStart } = req.body;
  try {
    const db = await dbPromise;
    await db.run("UPDATE stores SET name=?, pdvNamingStart=? WHERE id=?", [
      name,
      pdvNamingStart,
      req.params.id,
    ]);
    res.status(200).json({ message: "Loja atualizada" });
  } catch (e) {
    res
      .status(500)
      .json({ message: "Erro ao atualizar loja", error: e.message });
  }
});
app.delete("/api/stores/:id", async (req, res) => {
  try {
    const db = await dbPromise;
    await db.run("DELETE FROM stores WHERE id=?", [req.params.id]);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ message: "Erro ao remover loja", error: e.message });
  }
});

app.get("/api/stores/:id/pdvs-with-status", async (req, res) => {
  try {
    const db = await dbPromise;
    const pdvs = await db.all(
      "SELECT * FROM pdvs WHERE storeId = ? ORDER BY CAST(number AS INTEGER)",
      [req.params.id]
    );

    // Precisamos do ID do status "Ok" para a lógica
    const okStatus = await db.get(
      "SELECT id FROM statusTypes WHERE name = 'Ok'"
    );
    if (!okStatus)
      throw new Error("Status 'Ok' não encontrado no banco de dados.");

    for (const pdv of pdvs) {
      // 1. Verificar se existe algum problema aberto para este PDV
      const openProblem = await db.get(
        `
        SELECT p.title, p.created_at, p.originStatusId, u.name as techName, st.name as statusName, st.color as statusColor
        FROM problems p
        LEFT JOIN users u ON p.reported_by_user_id = u.id
        LEFT JOIN statusTypes st ON p.originStatusId = st.id
        WHERE p.pdv_id = ? AND p.status != 'Resolvido'
        ORDER BY p.created_at DESC
        LIMIT 1
      `,
        [pdv.id]
      );

      if (openProblem) {
        // 2. Se existir um problema, o status do PDV é o status desse problema
        pdv.lastStatus = {
          description: openProblem.title,
          timestamp: openProblem.created_at,
          statusId: openProblem.originStatusId,
          techName: openProblem.techName || "Sistema",
        };
      } else {
        // 3. Se não houver problemas, pega o último status do histórico (comportamento antigo)
        const lastHistory = await db.get(
          `SELECT sh.*, u.name as techName 
           FROM statusHistory sh 
           LEFT JOIN users u ON u.id = sh.techId 
           WHERE sh.pdvId = ? 
           ORDER BY sh.timestamp DESC 
           LIMIT 1`,
          [pdv.id]
        );
        pdv.lastStatus = lastHistory || null;
      }
    }
    res.json(pdvs);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Erro ao buscar PDVs com status.", error: err.message });
  }
});

app.post("/api/stores/:id/pdvs", async (req, res) => {
  const { number } = req.body;
  try {
    const db = await dbPromise;
    const result = await db.run(
      "INSERT INTO pdvs (number, storeId) VALUES (?, ?)",
      [number, req.params.id]
    );
    res.status(201).json({ id: result.lastID, number, storeId: req.params.id });
  } catch (e) {
    res.status(500).json({ message: "Erro ao criar PDV", error: e.message });
  }
});
app.delete("/api/pdvs/:id", async (req, res) => {
  try {
    const db = await dbPromise;
    await db.run("DELETE FROM pdvs WHERE id=?", [req.params.id]);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ message: "Erro ao remover PDV", error: e.message });
  }
});

app.post(
  "/api/pdvs/:id/status-history",
  authenticateToken,
  async (req, res) => {
    const pdvId = req.params.id;
    const { statusId, description, itemId } = req.body;
    const techId = req.user.id; // Pega o ID do usuário logado a partir do token

    if (!statusId || !description) {
      return res
        .status(400)
        .json({ message: "Status e descrição são obrigatórios." });
    }

    try {
      const db = await dbPromise;
      await db.run("BEGIN TRANSACTION");

      // 1. Insere no histórico (como sempre fez)
      const result = await db.run(
        "INSERT INTO statusHistory (pdvId, statusId, description, techId, itemId, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
        [
          pdvId,
          statusId,
          description,
          techId,
          itemId || null,
          new Date().toISOString(),
        ]
      );

      // 2. Verifica se o status é 'Ok'
      const okStatus = await db.get(
        "SELECT id FROM statusTypes WHERE name = 'Ok'"
      );
      if (!okStatus) throw new Error("Status 'Ok' não encontrado.");

      // 3. Se o status NÃO for 'Ok', cria um novo problema
      if (statusId !== okStatus.id) {
        await db.run(
          `INSERT INTO problems 
         (pdv_id, item_id, reported_by_user_id, title, description, status, created_at, originStatusId) 
         VALUES (?, ?, ?, ?, ?, 'Aberto', ?, ?)`,
          [
            pdvId,
            itemId || null,
            techId,
            description.substring(0, 100), // Usa a descrição como título
            description,
            new Date().toISOString(),
            statusId,
          ]
        );
      }

      await db.run("COMMIT");

      const newEntry = await db.get(
        "SELECT * FROM statusHistory WHERE id = ?",
        [result.lastID]
      );
      res.status(201).json(newEntry);
    } catch (error) {
      const db = await dbPromise;
      await db.run("ROLLBACK").catch(() => {});
      res.status(500).json({
        message: "Erro ao salvar novo status.",
        error: error.message,
      });
    }
  }
);

app.post("/api/pdv-items", async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ message: "O nome do item é obrigatório." });
  }
  try {
    const db = await dbPromise;
    const result = await db.run("INSERT INTO pdvItems (name) VALUES (?)", [
      name,
    ]);
    const newItem = await db.get("SELECT * FROM pdvItems WHERE id = ?", [
      result.lastID,
    ]);
    res.status(201).json(newItem);
  } catch (e) {
    if (e.code === "SQLITE_CONSTRAINT") {
      return res.status(409).json({ message: "Este item de PDV já existe." });
    }
    res
      .status(500)
      .json({ message: "Erro ao criar item de PDV.", error: e.message });
  }
});
app.delete("/api/pdv-items/:id", async (req, res) => {
  try {
    const db = await dbPromise;
    const result = await db.run("DELETE FROM pdvItems WHERE id = ?", [
      req.params.id,
    ]);

    if (result.changes === 0) {
      return res.status(404).json({ message: "Item de PDV não encontrado." });
    }
    res.status(204).send();
  } catch (e) {
    res
      .status(500)
      .json({ message: "Erro ao remover o item de PDV.", error: e.message });
  }
});

// --- ROTAS DE DETALHES DE UM PDV ESPECÍFICO ---

app.get("/api/pdvs/:id", async (req, res) => {
  try {
    const db = await dbPromise;
    const pdv = await db.get("SELECT * FROM pdvs WHERE id = ?", [
      req.params.id,
    ]);
    if (pdv) {
      res.json(pdv);
    } else {
      res.status(404).json({ message: "PDV não encontrado." });
    }
  } catch (err) {
    res
      .status(500)
      .json({ message: "Erro ao buscar dados do PDV", error: err.message });
  }
});

app.get("/api/pdvs/:id/history", async (req, res) => {
  try {
    const db = await dbPromise;
    const history = await db.all(
      `
            SELECT sh.*, u.name as techName
            FROM statusHistory sh
            LEFT JOIN users u ON u.id = sh.techId
            WHERE sh.pdvId = ?
            ORDER BY sh.timestamp DESC
            LIMIT 20`,
      [req.params.id]
    );
    res.json(history);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Erro ao buscar histórico do PDV", error: err.message });
  }
});

app.get("/api/pdvs/:id/recurring-problems", async (req, res) => {
  try {
    const db = await dbPromise;
    const problems = await db.all(
      `
            SELECT pi.name as problemText, COUNT(sh.id) as count
            FROM statusHistory sh
            JOIN pdvItems pi ON pi.id = sh.itemId
            WHERE sh.pdvId = ? AND sh.itemId IS NOT NULL
            GROUP BY pi.name
            ORDER BY count DESC
        `,
      [req.params.id]
    );
    res.json(problems);
  } catch (err) {
    res.status(500).json({
      message: "Erro ao buscar problemas recorrentes",
      error: err.message,
    });
  }
});

// --- NOVAS ROTAS DE PROBLEMAS (Início) ---

app.get("/api/pdvs/:id/problems", authenticateToken, async (req, res) => {
  try {
    const db = await dbPromise;
    // Busca os 5 problemas mais recentes (abertos ou resolvidos)
    const problems = await db.all(
      `
      SELECT 
        p.id, p.status, p.title, p.created_at, p.resolved_at,
        u_reported.name as reportedByTechName, 
        u_resolved.name as resolvedByTechName, 
        st.name as statusName, 
        st.color as statusColor,
        pi.name as itemName
      FROM problems p
      LEFT JOIN users u_reported ON p.reported_by_user_id = u_reported.id
      LEFT JOIN users u_resolved ON p.resolved_by_user_id = u_resolved.id
      LEFT JOIN statusTypes st ON p.originStatusId = st.id
      LEFT JOIN pdvItems pi ON p.item_id = pi.id
      WHERE p.pdv_id = ?
      ORDER BY p.created_at DESC
      LIMIT 5
    `,
      [req.params.id]
    );
    res.json(problems);
  } catch (e) {
    res
      .status(500)
      .json({ message: "Erro ao buscar problemas do PDV.", error: e.message });
  }
});

app.get("/api/problems/:id", authenticateToken, async (req, res) => {
  try {
    const db = await dbPromise;
    const problem = await db.get(
      `
      SELECT 
        p.id, p.title, p.description, p.created_at, p.status,
        u_reported.name as reportedByTechName, 
        pi.name as itemName
      FROM problems p
      LEFT JOIN users u_reported ON p.reported_by_user_id = u_reported.id
      LEFT JOIN pdvItems pi ON p.item_id = pi.id
      WHERE p.id = ?
    `,
      [req.params.id]
    );

    if (problem) {
      res.json(problem);
    } else {
      res.status(404).json({ message: "Problema não encontrado." });
    }
  } catch (e) {
    res
      .status(500)
      .json({ message: "Erro ao buscar dados do problema.", error: e.message });
  }
});

// ########### ALTERAÇÃO V2.2 AQUI ###########
app.put("/api/problems/:id/resolve", authenticateToken, async (req, res) => {
  const { solutionNotes } = req.body;
  const techId = req.user.id; // Pega o ID do usuário do token

  if (!solutionNotes || solutionNotes.length < 10) {
    return res
      .status(400)
      .json({ message: "A solução deve ter pelo menos 10 caracteres." });
  }

  try {
    const db = await dbPromise;
    await db.run("BEGIN TRANSACTION");

    // 1. Atualiza o problema para "Resolvido"
    // CORREÇÃO: 'solutionNotes' alterado para 'resolution_notes'
    const result = await db.run(
      "UPDATE problems SET status = 'Resolvido', resolution_notes = ?, resolved_at = ?, resolved_by_user_id = ? WHERE id = ?",
      [solutionNotes, new Date().toISOString(), techId, req.params.id]
    );
    // ########### FIM DA ALTERAÇÃO V2.2 ###########

    if (result.changes === 0) {
      throw new Error("Problema não encontrado para resolver.");
    }

    // 2. Pega os dados do problema que acabamos de fechar
    const problem = await db.get("SELECT * FROM problems WHERE id = ?", [
      req.params.id,
    ]);

    // 3. Verifica se ainda existem *outros* problemas abertos para este PDV
    const otherOpenProblems = await db.get(
      "SELECT COUNT(id) as count FROM problems WHERE pdv_id = ? AND status != 'Resolvido'",
      [problem.pdv_id]
    );

    // 4. Se não houver outros problemas, adiciona um log "Ok" no histórico
    if (otherOpenProblems.count === 0) {
      const okStatus = await db.get(
        "SELECT id FROM statusTypes WHERE name = 'Ok'"
      );
      if (!okStatus) throw new Error("Status 'Ok' não encontrado.");

      await db.run(
        "INSERT INTO statusHistory (pdvId, statusId, description, techId, timestamp) VALUES (?, ?, ?, ?, ?)",
        [
          problem.pdv_id,
          okStatus.id,
          `[SOLUÇÃO] ${solutionNotes}`,
          techId,
          new Date().toISOString(),
        ]
      );
    }

    await db.run("COMMIT");
    res.status(200).json({ message: "Problema resolvido com sucesso." });
  } catch (e) {
    const db = await dbPromise;
    await db.run("ROLLBACK").catch(() => {});
    res
      .status(500)
      .json({ message: "Erro ao resolver o problema.", error: e.message });
  }
});
// --- NOVAS ROTAS DE PROBLEMAS (Fim) ---

// --- ROTAS DE CHECKLIST ---
app.get("/api/checklists/today", async (req, res) => {
  try {
    const { storeId } = req.query;
    if (!storeId) {
      return res.status(400).json({ message: "O ID da loja é obrigatório." });
    }
    const db = await dbPromise;
    const today = new Date().toISOString().split("T")[0];
    const checklist = await db.get(
      "SELECT * FROM checklists WHERE storeId = ? AND date = ?",
      [storeId, today]
    );
    if (checklist) {
      checklist.pdvChecks = JSON.parse(checklist.pdvChecks);
      res.json(checklist);
    } else {
      res.status(404).json({ message: "Nenhum checklist para hoje." });
    }
  } catch (e) {
    res
      .status(500)
      .json({ message: "Erro ao buscar checklist do dia", error: e.message });
  }
});

app.post("/api/checklists", authenticateToken, async (req, res) => {
  const { id, storeId, date, status, pdvChecks, finalizedByUserId } = req.body;
  const userFromToken = req.user;

  try {
    const db = await dbPromise;
    const pdvChecksJson = JSON.stringify(pdvChecks);

    let checklistId = id;
    if (checklistId) {
      await db.run(
        "UPDATE checklists SET status=?, pdvChecks=?, finalizedByUserId=? WHERE id=?",
        [status, pdvChecksJson, finalizedByUserId, checklistId]
      );
    } else {
      const result = await db.run(
        "INSERT INTO checklists (storeId, date, status, pdvChecks, finalizedByUserId) VALUES (?, ?, ?, ?, ?)",
        [storeId, date, status, pdvChecksJson, finalizedByUserId]
      );
      checklistId = result.lastID;
    }

    // Se o checklist está sendo finalizado, processa os status e problemas
    if (status === "completed" && pdvChecks) {
      console.log(
        "Finalizando checklist. Atualizando histórico e problemas..."
      );

      const okStatus = await db.get(
        "SELECT id FROM statusTypes WHERE name = 'Ok'"
      );
      if (!okStatus) throw new Error("Status 'Ok' não encontrado.");

      await db.run("BEGIN TRANSACTION");

      const historyStmt = await db.prepare(
        "INSERT INTO statusHistory (pdvId, statusId, description, techId, timestamp) VALUES (?, ?, ?, ?, ?)"
      );
      const problemStmt = await db.prepare(
        `INSERT INTO problems (pdv_id, item_id, reported_by_user_id, title, description, status, created_at, originStatusId) 
         VALUES (?, ?, ?, ?, ?, 'Aberto', ?, ?)`
      );

      for (const check of pdvChecks) {
        if (check.newStatusId) {
          const description = `[CHECKLIST] ${
            check.observation ||
            (check.result === "ok" ? "Tudo OK." : "Problema reportado.")
          }`;

          // 1. Adiciona ao histórico de status (sempre)
          await historyStmt.run(
            check.pdvId,
            check.newStatusId,
            description,
            userFromToken.id,
            new Date().toISOString()
          );

          // 2. Se o status não for 'Ok', cria um problema
          if (check.newStatusId !== okStatus.id) {
            const problemTitle = description.substring(0, 100);

            // Tenta extrair o item_id do checklist (se houver)
            const itemId =
              check.issues && check.issues.length > 0
                ? parseInt(check.issues[0].replace("std-", ""))
                : null;

            await problemStmt.run(
              check.pdvId,
              itemId || null,
              userFromToken.id,
              problemTitle,
              description,
              new Date().toISOString(),
              check.newStatusId
            );
          }
        }
      }

      await historyStmt.finalize();
      await problemStmt.finalize();
      await db.run("COMMIT");
      console.log("Histórico e problemas atualizados com sucesso.");
    }

    res
      .status(id ? 200 : 201)
      .json({ id: checklistId, message: "Checklist salvo com sucesso." });
  } catch (e) {
    const db = await dbPromise;
    await db.run("ROLLBACK").catch(() => {});
    console.error("ERRO AO SALVAR CHECKLIST:", e);
    res
      .status(500)
      .json({ message: "Erro ao salvar checklist", error: e.message });
  }
});

app.get("/api/stores/:id/pdvs", async (req, res) => {
  try {
    const db = await dbPromise;
    const pdvs = await db.all("SELECT * FROM pdvs WHERE storeId = ?", [
      req.params.id,
    ]);
    res.json(pdvs);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Erro ao buscar PDVs da loja", error: err.message });
  }
});
app.get("/api/checklists/history", async (req, res) => {
  const { storeId } = req.query;

  try {
    const db = await dbPromise;
    let query = `SELECT * FROM checklists WHERE status = 'completed'`;
    const params = [];

    if (storeId && storeId !== "") {
      query += ` AND storeId = ?`;
      params.push(storeId);
    }

    query += ` ORDER BY date DESC`;

    const checklists = await db.all(query, params);

    checklists.forEach((c) => {
      if (c.pdvChecks) {
        c.pdvChecks = JSON.parse(c.pdvChecks);
      }
    });

    res.json(checklists);
  } catch (e) {
    res.status(500).json({
      message: "Erro ao buscar histórico de checklists.",
      error: e.message,
    });
  }
});

app.get("/api/checklists/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const db = await dbPromise;

    const checklist = await db.get("SELECT * FROM checklists WHERE id = ?", [
      id,
    ]);

    if (checklist) {
      if (checklist.pdvChecks) {
        checklist.pdvChecks = JSON.parse(checklist.pdvChecks);
      }
      res.json(checklist);
    } else {
      res.status(404).json({ message: "Checklist não encontrado." });
    }
  } catch (e) {
    res.status(500).json({
      message: "Erro ao buscar detalhes do checklist.",
      error: e.message,
    });
  }
});

// --- ROTAS DE LOGS ---
app.post("/api/logs/admin", async (req, res) => {
  const { description, metadata, userId, userName } = req.body;
  try {
    const db = await dbPromise;
    await db.run(
      "INSERT INTO actionLogs (description, metadata, timestamp, userId, userName) VALUES (?, ?, ?, ?, ?)",
      [
        description,
        JSON.stringify(metadata),
        new Date().toISOString(),
        userId,
        userName,
      ]
    );
    res.status(201).json({ success: true });
  } catch (e) {
    res.status(500).json({ message: "Erro ao gravar log", error: e.message });
  }
});
app.get("/api/logs/admin", async (req, res) => {
  try {
    const db = await dbPromise;
    const logs = await db.all(
      "SELECT * FROM actionLogs ORDER BY timestamp DESC"
    );
    res.json(logs);
  } catch (e) {
    res.status(500).json({ message: "Erro ao buscar logs", error: e.message });
  }
});
app.get("/api/logs/pdv", async (req, res) => {
  const { storeId } = req.query;
  if (!storeId) {
    return res.status(400).json({ message: "O ID da loja é obrigatório." });
  }
  try {
    const db = await dbPromise;
    const logs = await db.all(
      `
            SELECT 
                sh.*, 
                u.name as techName, 
                st.name as statusName, 
                st.color as statusColor,
                p.number as pdvNumber
            FROM statusHistory sh
            JOIN pdvs p ON p.id = sh.pdvId
            LEFT JOIN users u ON u.id = sh.techId
            JOIN statusTypes st ON st.id = sh.statusId
            WHERE p.storeId = ?
            ORDER BY sh.timestamp DESC
        `,
      [storeId]
    );
    res.json(logs);
  } catch (e) {
    res
      .status(500)
      .json({ message: "Erro ao buscar logs de PDV.", error: e.message });
  }
});

// --- ROTA "Catch-all" (DEVE SER A ÚLTIMA ROTA) ---
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- Inicia o Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
