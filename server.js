// painel-ti-servidor/server.js
// VERSÃO ATUALIZADA COM BCRYPT E JSON WEB TOKEN (JWT)

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

// --- ROTAS DE AUTENTICAÇÃO E SESSÃO (ATUALIZADAS) ---

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
      return res
        .status(403)
        .json({
          message: "Primeiro acesso. Defina uma senha.",
          firstLogin: true,
        });
    }

    // --- MUDANÇA: Comparar a senha com o hash usando bcrypt ---
    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Usuário ou senha inválidos." });
    }

    await db.run("UPDATE users SET lastLogin = ? WHERE id = ?", [
      new Date().toISOString(),
      user.id,
    ]);

    const { password: _, ...userPayload } = user;

    // --- MUDANÇA: Gerar e enviar um JSON Web Token ---
    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: "8h" });

    res.json({
      message: "Login bem-sucedido!",
      user: userPayload,
      token: token, // Envia o token para o cliente
    });
  } catch (e) {
    res
      .status(500)
      .json({ message: "Erro no servidor durante o login.", error: e.message });
  }
});

// --- NOVO MIDDLEWARE DE AUTENTICAÇÃO ---
// Esta função irá interceptar requisições para rotas protegidas
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Formato "Bearer TOKEN"

  if (token == null) {
    return res.status(401).json({ message: "Token não fornecido." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Token inválido ou expirado." });
    }
    req.user = user;
    next(); // Se o token for válido, continua para a rota solicitada
  });
};

// Rota para verificar um token e retornar os dados do usuário
app.get("/api/auth/me", authenticateToken, (req, res) => {
  // Se chegou até aqui, o middleware 'authenticateToken' já validou o token.
  // As informações do usuário estão em req.user.
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

    // Se a senha já existir, verifica a senha atual com bcrypt
    if (user.password !== null) {
      const isPasswordCorrect = await bcrypt.compare(
        currentPassword,
        user.password
      );
      if (!isPasswordCorrect)
        return res.status(403).json({ message: "Senha atual incorreta." });
    }

    // --- MUDANÇA: Gerar o hash da nova senha ---
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
// Rota de usuários não devolve mais a senha
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
// (Nenhuma mudança aqui, a senha já é inserida como NULL, o que está correto para o 1º acesso)
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
// (Demais rotas de usuários não mexem com senha, então permanecem iguais)
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

// --- ROTAS DE LOJAS E PDVS (SEM ALTERAÇÕES) ---
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
    for (const pdv of pdvs) {
      const lastStatus = await db.get(
        `SELECT sh.*, u.name as techName FROM statusHistory sh LEFT JOIN users u ON u.id = sh.techId WHERE sh.pdvId = ? ORDER BY sh.timestamp DESC LIMIT 1`,
        [pdv.id]
      );
      pdv.lastStatus = lastStatus || null;
    }
    res.json(pdvs);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Erro ao buscar PDVs", error: err.message });
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
app.post("/api/pdvs/:id/status-history", async (req, res) => {
  const pdvId = req.params.id;
  const { statusId, description, techId, itemId } = req.body;

  if (!statusId || !description || !techId) {
    return res
      .status(400)
      .json({ message: "Status, descrição e ID do técnico são obrigatórios." });
  }

  try {
    const db = await dbPromise;
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

    const newEntry = await db.get("SELECT * FROM statusHistory WHERE id = ?", [
      result.lastID,
    ]);
    res.status(201).json(newEntry);
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Erro ao salvar novo status no histórico.",
        error: error.message,
      });
  }
});
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

    // 204 No Content é a resposta padrão para um DELETE bem-sucedido
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
    // Esta query busca problemas registrados no histórico de status que estão associados a um item de PDV.
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
    res
      .status(500)
      .json({
        message: "Erro ao buscar problemas recorrentes",
        error: err.message,
      });
  }
});

// --- ROTAS DE CHECKLIST (SEM ALTERAÇÕES) ---
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
// --- ROTA DE CHECKLISTS (CORRIGIDA) ---
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

    if (status === "completed" && pdvChecks) {
      console.log("Finalizando checklist. Atualizando histórico de status...");
      await db.run("BEGIN TRANSACTION");
      const stmt = await db.prepare(
        "INSERT INTO statusHistory (pdvId, statusId, description, techId, timestamp) VALUES (?, ?, ?, ?, ?)"
      );

      for (const check of pdvChecks) {
        if (check.newStatusId) {
          const description = `[CHECKLIST] ${
            check.observation ||
            (check.result === "ok" ? "Tudo OK." : "Problema reportado.")
          }`;
          console.log(
            `Inserindo log para PDV ${check.pdvId}: Status ${check.newStatusId}`
          );
          await stmt.run(
            check.pdvId,
            check.newStatusId,
            description,
            userFromToken.id,
            new Date().toISOString()
          );
        }
      }

      await stmt.finalize();
      await db.run("COMMIT");
      console.log("Histórico de status atualizado com sucesso.");
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
  const { storeId } = req.query; // Pega o ID da loja do filtro, se houver

  try {
    const db = await dbPromise;
    let query = `SELECT * FROM checklists WHERE status = 'completed'`;
    const params = [];

    // Se um ID de loja foi fornecido no filtro, adiciona à consulta
    if (storeId && storeId !== "") {
      query += ` AND storeId = ?`;
      params.push(storeId);
    }

    query += ` ORDER BY date DESC`;

    const checklists = await db.all(query, params);

    // O campo 'pdvChecks' está como texto JSON no banco, precisamos converter
    checklists.forEach((c) => {
      if (c.pdvChecks) {
        c.pdvChecks = JSON.parse(c.pdvChecks);
      }
    });

    res.json(checklists);
  } catch (e) {
    res
      .status(500)
      .json({
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
      // Converte o campo de texto JSON para um objeto antes de enviar
      if (checklist.pdvChecks) {
        checklist.pdvChecks = JSON.parse(checklist.pdvChecks);
      }
      res.json(checklist);
    } else {
      res.status(404).json({ message: "Checklist não encontrado." });
    }
  } catch (e) {
    res
      .status(500)
      .json({
        message: "Erro ao buscar detalhes do checklist.",
        error: e.message,
      });
  }
});

// --- ROTAS DE LOGS (SEM ALTERAÇÕES) ---
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
