// fix-checklist.js

const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

const dbFilePath = path.join(__dirname, 'painel-ti.sqlite');

async function runFix() {
    console.log('Iniciando script de correção de checklists antigos...');

    const db = await open({
        filename: dbFilePath,
        driver: sqlite3.Database
    });

    try {
        // 1. Encontra todos os checklists que já foram completados
        const completedChecklists = await db.all("SELECT * FROM checklists WHERE status = 'completed'");

        if (completedChecklists.length === 0) {
            console.log('Nenhum checklist completado para corrigir.');
            return;
        }

        console.log(`Encontrados ${completedChecklists.length} checklist(s) para processar.`);

        await db.run('BEGIN TRANSACTION');

        const stmt = await db.prepare('INSERT INTO statusHistory (pdvId, statusId, description, techId, timestamp) VALUES (?, ?, ?, ?, ?)');

        for (const checklist of completedChecklists) {
            console.log(`\nProcessando checklist #${checklist.id} do dia ${checklist.date}...`);
            const pdvChecks = JSON.parse(checklist.pdvChecks);
            
            for (const check of pdvChecks) {
                // 2. Para cada PDV verificado, checa se um novo status foi definido
                if (check.newStatusId) {
                    // 3. Verifica se um log IDENTICO já não foi criado para evitar duplicatas
                    const existingLog = await db.get(
                        `SELECT id FROM statusHistory WHERE pdvId = ? AND statusId = ? AND techId = ? AND description LIKE '[CHECKLIST]%'`,
                        [check.pdvId, check.newStatusId, checklist.finalizedByUserId]
                    );

                    if (!existingLog) {
                        const description = `[CHECKLIST RETROATIVO] ${check.observation || (check.result === 'ok' ? 'Tudo OK.' : 'Problema reportado.')}`;
                        const timestamp = new Date(checklist.date).toISOString(); // Usa a data do checklist
                        
                        // 4. Insere o novo registro no histórico de status
                        await stmt.run(check.pdvId, check.newStatusId, description, checklist.finalizedByUserId, timestamp);
                        console.log(`  -> Status do PDV #${check.pdvId} atualizado para o status #${check.newStatusId}.`);
                    } else {
                        console.log(`  -> Log para o PDV #${check.pdvId} já existe. Pulando.`);
                    }
                }
            }
        }
        
        await stmt.finalize();
        await db.run('COMMIT');

        console.log('\nCorreção finalizada com sucesso!');

    } catch (error) {
        await db.run('ROLLBACK').catch(()=>{});
        console.error('Ocorreu um erro durante a correção:', error);
    } finally {
        await db.close();
    }
}

runFix();