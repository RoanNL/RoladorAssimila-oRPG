require('dotenv').config()

// bibliotecas
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const { pool, criarTabelas } = require('./database');

pool.query('SELECT NOW()', async (err, res) => {
    if (err) {
        console.error('❌ Erro ao conectar no PostgreSQL:', err);
    } else {
        console.log('✅ Conectado ao PostgreSQL com sucesso!');
        criarTabelas();
    }
});

const http = require('http');
const { Server } = require('socket.io');

const app = express();
const PORT = process.env.PORT || 3000;
const SEGREDO_JWT = process.env.SEGREDO_JWT

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// =========================================================================
// 🛡️ MIDDLEWARE ANTI-NAVEGADOR (BLOQUEIA ACESSO DIRETO PELA URL)
// =========================================================================
app.use((req, res, next) => {
    const pediuPeloNavegador = req.headers.accept && req.headers.accept.includes('text/html');

    if (pediuPeloNavegador) {
        return res.status(403).send(`
            <body style="background-color: #121212; color: #ff9800; font-family: 'Courier New', monospace; text-align: center; padding-top: 20vh;">
                <h1 style="font-size: 3rem; color: #8c3a3a;">🛡️ FICHA BLINDADA 🛡️</h1>
                <p style="font-size: 1.2rem; color: #a97b53;">Acesso direto à matriz de dados foi bloqueado pelo Mestre.</p>
                <p style="font-size: 1rem; color: #666;">Por favor, retorne à interface principal do jogo, SEU SAFADO!!!!!</p>
            </body>
        `);
    }
    next();
});

const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase;
if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('☁️ Conectado ao Supabase Storage!');
} else {
    console.log('⚠️ Chaves do Supabase não encontradas no .env. O upload de imagens será ignorado.');
}

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});
app.set('io', io);

const regexUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

io.on('connection', (socket) => {
    console.log('Um jogador conectou! ID:', socket.id);

    socket.on('entrar-obs', (personagemId) => {
        if(personagemId) {
            socket.join(personagemId.toString());
            console.log(`🎥 OBS Conectado na escuta da ficha ${personagemId}`);
        }
    });

    socket.on('entrar-na-campanha', async (dados) => {
        const { campanhaId, token } = dados; 
        if (!token || !campanhaId) return;

        try {
            const segredo = process.env.SEGREDO_JWT || 'segredo_super_secreto_rpg';
            const usuarioVerificado = jwt.verify(token, segredo);
            const usuarioIdSeguro = usuarioVerificado.id; 

            const salaStr = campanhaId.toString(); 

            const checkMestre = await pool.query('SELECT mestre_id FROM campanhas WHERE id = $1', [campanhaId]);
            const isMestre = checkMestre.rows.length > 0 && checkMestre.rows[0].mestre_id === usuarioIdSeguro;

            const sql = `SELECT * FROM membros_campanha WHERE campanha_id = $1 AND usuario_id = $2`;
            const resultado = await pool.query(sql, [campanhaId, usuarioIdSeguro]);

            if (resultado.rows.length > 0 || isMestre) {
                socket.join(salaStr); 
                console.log(`✅ Catraca VIP: Usuário ${usuarioIdSeguro} acessou a mesa ${salaStr}`);

                // 🔥 CORREÇÃO DO BUG 1: Busca em ordem DECRESCENTE (DESC) para puxar os mais recentes! 🔥
                const sqlHist = `SELECT pacote FROM historico_rolagens WHERE campanha_id = $1 ORDER BY id DESC LIMIT 50`;
                const histResult = await pool.query(sqlHist, [campanhaId]);
                
                let rolagensAntigas = histResult.rows.map(row => row.pacote);
                
                if (!isMestre) {
                    rolagensAntigas = rolagensAntigas.filter(r => r.isMestre !== true || r.isRolagemPublica === true);
                }
                
                socket.emit('carregar-historico', rolagensAntigas);
            } else {
                console.log(`🚨 BARRADO: Invasor bloqueado na mesa ${salaStr}!`);
            }
        } catch (err) {
            console.error('❌ Erro na catraca');
        }
    });

    socket.on('rolar-dados', async (pacoteDeDados) => {
        const { token, ...dadosDaRolagem } = pacoteDeDados;
        if (!token) return;

        try {
            const segredo = process.env.SEGREDO_JWT || 'segredo_super_secreto_rpg';
            const usuarioVerificado = jwt.verify(token, segredo);
            const usuarioIdSeguro = usuarioVerificado.id;

            const campanhaId = dadosDaRolagem.campanhaId;
            dadosDaRolagem.usuarioId = usuarioIdSeguro;
            dadosDaRolagem.timestamp = new Date().toISOString(); 
            
            let isMestre = false;

            if (campanhaId) {
                const sqlCheck = `SELECT * FROM membros_campanha WHERE campanha_id = $1 AND usuario_id = $2`;
                const resultCheck = await pool.query(sqlCheck, [campanhaId, usuarioIdSeguro]);

                if (resultCheck.rows.length > 0) {
                    const checkMestre = await pool.query('SELECT mestre_id FROM campanhas WHERE id = $1', [campanhaId]);
                    isMestre = checkMestre.rows.length > 0 && checkMestre.rows[0].mestre_id === usuarioIdSeguro;
                    dadosDaRolagem.isMestre = isMestre; 
                    
                    const salaStr = campanhaId.toString(); 
                    if (!(isMestre && !dadosDaRolagem.isRolagemPublica)) {
                        socket.to(salaStr).emit('nova-rolagem', dadosDaRolagem);
                    }
                    await pool.query(`INSERT INTO historico_rolagens (campanha_id, pacote) VALUES ($1, $2)`, [campanhaId, dadosDaRolagem]);
                }
            }

            if (dadosDaRolagem.personagemId && !(isMestre && !dadosDaRolagem.isRolagemPublica)) {
                socket.to(dadosDaRolagem.personagemId.toString()).emit('nova-rolagem', dadosDaRolagem);
            }

        } catch (err) {
            console.error("❌ Tentativa de forjar rolagem bloqueada.");
        }
    });
});

// =========================================================================
// 🛡️ MIDDLEWARE DE SEGURANÇA: VALIDAÇÃO DE TOKEN 
// =========================================================================
function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ erro: 'Acesso negado. Token não fornecido.' });
    }

    try {
        const segredo = process.env.SEGREDO_JWT || 'segredo_super_secreto_rpg';
        const usuarioVerificado = jwt.verify(token, segredo);
        req.usuario = usuarioVerificado;
        next();
    } catch (err) {
        return res.status(403).json({ erro: 'Token inválido, expirado ou forjado.' });
    }
}

app.get('/', (req, res) => {
    res.json({ mensagem: 'Servidor online e blindado!' });
});

function gerarCodigoConvite() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

app.post('/registro', async (req, res) => {
    const username = req.body.username || req.body.usuario || req.body.nome || req.body.login;
    const password = req.body.password || req.body.senha;
    const email = req.body.email;

    const usernameLowerCase = username ? username.toLowerCase() : '';

    if (!usernameLowerCase || !password || !email) {
        return res.status(400).json({ erro: 'Usuário, e-mail e senha são obrigatórios.' });
    }

    const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regexEmail.test(email)) {
        console.warn(`🚨 HACKER BARRADO: Tentativa de injeção no E-mail detectada: ${email}`);
        return res.status(400).json({ erro: 'Formato de e-mail inválido ou contendo código malicioso.' });
    }

    const regexUsername = /^[a-zA-Z0-9_.-]+$/;
    if (!regexUsername.test(usernameLowerCase)) {
        console.warn(`🚨 HACKER BARRADO: Tentativa de injeção no Nome detectada: ${usernameLowerCase}`);
        return res.status(400).json({ erro: 'O nome de usuário deve conter apenas letras, números, _ ou -' });
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(password, salt);

        const sql = `INSERT INTO usuarios (username, password, email) VALUES ($1, $2, $3) RETURNING id`;
        const resultado = await pool.query(sql, [usernameLowerCase, senhaHash, email]);

        const novoUsuarioId = resultado.rows[0].id;

        const segredo = process.env.SEGREDO_JWT || 'segredo_super_secreto_rpg';
        const token = jwt.sign({ id: novoUsuarioId, nome: username }, segredo, { expiresIn: '7d' });

        res.status(201).json({
            mensagem: 'Usuário registrado com sucesso!',
            usuario: { id: novoUsuarioId, nome: username },
            token: token
        });
    } catch (erro) {
        if (erro.code === '23505') {
            if (erro.constraint && erro.constraint.includes('email')) {
                return res.status(400).json({ erro: 'Este e-mail já está cadastrado.' });
            }
            return res.status(400).json({ erro: 'Nome de usuário já está em uso.' });
        }
        console.error('❌ Erro no registro:', erro);
        res.status(500).json({ erro: 'Erro interno ao registrar usuário.' });
    }
});

app.post('/login', async (req, res) => {
    const email = req.body.email;
    const password = req.body.password || req.body.senha;

    const emailLowerCase = email ? email.toLowerCase() : '';

    if (!emailLowerCase || !password) {
        return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
    }

    try {
        const sql = `SELECT id, username, password, email, avatar FROM usuarios WHERE email = $1`;
        const resultado = await pool.query(sql, [emailLowerCase]);

        if (resultado.rows.length === 0) {
            return res.status(401).json({ erro: 'Credenciais inválidas.' });
        }

        const usuarioDb = resultado.rows[0];
        const senhaValida = await bcrypt.compare(password, usuarioDb.password);

        if (!senhaValida) {
            return res.status(401).json({ erro: 'Credenciais inválidas.' });
        }

        const segredo = process.env.SEGREDO_JWT || 'segredo_super_secreto_rpg';
        const token = jwt.sign({ id: usuarioDb.id, nome: usuarioDb.username }, segredo, { expiresIn: '7d' });

        res.json({
            mensagem: 'Login realizado com sucesso!',
            usuario: {
                id: usuarioDb.id,
                nome: usuarioDb.username,
                avatar: usuarioDb.avatar,
                email: usuarioDb.email
            },
            token: token
        });
    } catch (erro) {
        console.error('❌ Erro no login:', erro);
        res.status(500).json({ erro: 'Erro interno ao realizar login.' });
    }
});

app.post('/esqueci-senha', async (req, res) => {
    const { email } = req.body;

    if (!email) return res.status(400).json({ erro: 'Forneça o seu e-mail cadastrado.' });

    try {
        const result = await pool.query('SELECT id, username FROM usuarios WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'E-mail não encontrado nos registros da Taverna.' });
        }

        const token = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 15 * 60 * 1000;

        await pool.query('UPDATE usuarios SET reset_token = $1, reset_token_expires = $2 WHERE email = $3', [token, expires, email]);

        const brevoApiKey = process.env.BREVO_API_KEY;
        const remetenteEmail = process.env.EMAIL_USUARIO;

        if (!brevoApiKey) {
            console.error("⚠️ Chave do Brevo não encontrada no .env!");
            return res.status(500).json({ erro: 'Servidor de e-mail não configurado.' });
        }

        const emailData = {
            sender: { name: "Ficha Assimilação RPG", email: remetenteEmail },
            to: [{ email: email }],
            subject: "🔑 Seu Código de Recuperação de Senha",
            htmlContent: `
                <div style="font-family: Arial, sans-serif; background-color: #f4f1ea; padding: 20px; text-align: center; border-radius: 8px;">
                    <h2 style="color: #8c3a3a;">Ficha Assimilação RPG</h2>
                    <p style="font-size: 16px; color: #333;">Olá <strong>${result.rows[0].username}</strong>,</p>
                    <p style="font-size: 16px; color: #333;">Você solicitou a recuperação da sua senha. Use o código abaixo:</p>
                    <div style="background-color: #3a7c8c; color: white; font-size: 24px; font-weight: bold; letter-spacing: 5px; padding: 15px; border-radius: 5px; margin: 20px auto; max-width: 200px;">
                        ${token}
                    </div>
                    <p style="color: #d9534f; font-weight: bold;">⚠️ Este código expira em 15 minutos.</p>
                </div>
            `
        };

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': brevoApiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify(emailData)
        });

        if (!response.ok) {
            const erroBrevo = await response.json();
            console.error("❌ O Brevo recusou a entrega:", erroBrevo);
            throw new Error('Falha na API do Brevo');
        }

        console.log(`🚀 E-mail de recuperação enviado VIA API para: ${email}`);
        res.json({ mensagem: 'Um código de 6 dígitos foi enviado para o seu e-mail!' });

    } catch (err) {
        console.error("❌ Erro na recuperação de senha:", err);
        res.status(500).json({ erro: 'Erro no servidor ao tentar enviar o e-mail.' });
    }
});

app.post('/resetar-senha', async (req, res) => {
    const { email, token, novaSenha } = req.body;

    if (!email || !token || !novaSenha) {
        return res.status(400).json({ erro: 'Preencha todos os campos corretamente.' });
    }

    try {
        const result = await pool.query('SELECT id, reset_token_expires FROM usuarios WHERE email = $1 AND reset_token = $2', [email, token]);

        if (result.rows.length === 0) {
            return res.status(400).json({ erro: 'Código de recuperação inválido ou incorreto.' });
        }

        if (Date.now() > result.rows[0].reset_token_expires) {
            return res.status(400).json({ erro: 'Este código já expirou! Solicite um novo.' });
        }

        const salt = await bcrypt.genSalt(10);
        const senhaHash = await bcrypt.hash(novaSenha, salt);

        await pool.query('UPDATE usuarios SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE email = $2', [senhaHash, email]);

        res.json({ mensagem: 'Senha redefinida com sucesso! Você já pode fazer login.' });
    } catch (err) {
        console.error("❌ Erro ao resetar senha:", err);
        res.status(500).json({ erro: 'Erro interno ao redefinir a senha.' });
    }
});

app.post('/auth/google', async (req, res) => {
    const { token } = req.body;
    
    if (!token) return res.status(400).json({ erro: 'Token não fornecido.' });

    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID, 
        });
        
        const payload = ticket.getPayload();
        const email = payload.email;
        const nome = payload.name;
        const avatar = payload.picture;

        let result = await pool.query('SELECT id, username, avatar FROM usuarios WHERE email = $1', [email]);
        let usuarioId, username;

        if (result.rows.length === 0) {
            const usernameLimpo = nome.trim();
            const randomPassword = await bcrypt.hash(Math.random().toString(36).slice(-12), 10);
            
            const insert = await pool.query(
                `INSERT INTO usuarios (username, password, email, avatar) VALUES ($1, $2, $3, $4) RETURNING id`, 
                [usernameLimpo, randomPassword, email, avatar]
            );
            usuarioId = insert.rows[0].id;
            username = usernameLimpo;
        } else {
            usuarioId = result.rows[0].id;
            username = result.rows[0].username;
            
            await pool.query('UPDATE usuarios SET avatar = $1 WHERE id = $2 AND (avatar IS NULL OR avatar LIKE \'%googleusercontent%\')', [avatar, usuarioId]);
        }

        const segredo = process.env.SEGREDO_JWT || 'segredo_super_secreto_rpg';
        const tokenJwt = jwt.sign({ id: usuarioId, nome: username }, segredo, { expiresIn: '7d' });

        res.json({ 
            mensagem: 'Login realizado com sucesso!', 
            usuario: { id: usuarioId, nome: username }, 
            token: tokenJwt 
        });

    } catch (err) {
        console.error("❌ Erro Google Auth:", err);
        res.status(401).json({ erro: 'Falha ao autenticar com o Google.' });
    }
});

app.post('/usuarios/avatar', verificarToken, async (req, res) => {
    let foto = req.body.foto;
    const usuarioId = req.usuario.id;

    if (!foto) return res.status(400).json({ erro: 'Nenhuma foto enviada.' });

    if (supabase && foto.startsWith('data:image')) {
        try {
            const base64Data = foto.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            const extensao = foto.substring(foto.indexOf('/') + 1, foto.indexOf(';base64'));
            const nomeArquivo = `avatar_${usuarioId}_${Date.now()}.${extensao}`;

            const { data, error } = await supabase.storage
                .from('ficha-fotos')
                .upload(nomeArquivo, buffer, {
                    contentType: `image/${extensao}`,
                    upsert: true
                });

            if (error) throw error;
            const { data: publicUrlData } = supabase.storage.from('ficha-fotos').getPublicUrl(nomeArquivo);
            foto = publicUrlData.publicUrl;
        } catch (err) {
            console.error("Erro no Supabase ao subir avatar:", err);
            return res.status(500).json({ erro: 'Erro ao hospedar a imagem.' });
        }
    }

    try {
        await pool.query(`UPDATE usuarios SET avatar = $1 WHERE id = $2`, [foto, usuarioId]);
        res.json({ mensagem: 'Avatar atualizado!', avatar: foto });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao salvar avatar no banco.' });
    }
});

app.get('/usuarios/me', verificarToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT avatar FROM usuarios WHERE id = $1', [req.usuario.id]);
        res.json(result.rows[0]);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar dados do usuário.' });
    }
});

app.post('/personagens', verificarToken, async (req, res) => {
    const usuarioIdSeguro = req.usuario.id;

    const personagemId = req.body.personagemId || req.body.id;
    const nome = req.body.nome || req.body.nome_personagem || 'Desconhecido';
    const ocupacao = req.body.ocupacao || '';
    const dadosFicha = req.body.dadosFicha || req.body.dados_ficha || req.body.dados_personagem || {};
    let foto = req.body.foto || null;
    const isPrivada = req.body.isPrivada || false;

    const regexSeguro = /^[^<>{}\[\]=;]*$/;

    function validarTexto(texto, limite) {
        if (!texto) return true;
        if (typeof texto !== 'string') return false;
        if (texto.length > limite) return false;
        return regexSeguro.test(texto);
    }

    if (!validarTexto(nome, 50) || !validarTexto(ocupacao, 50)) {
        return res.status(400).json({ erro: "Texto inválido ou com caracteres proibidos." });
    }

    if (supabase && foto && foto.startsWith('data:image')) {
        try {
            const base64Data = foto.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            const extensao = foto.substring(foto.indexOf('/') + 1, foto.indexOf(';base64'));
            const nomeArquivo = `ficha_${usuarioIdSeguro}_${Date.now()}.${extensao}`;

            const { data, error } = await supabase.storage.from('ficha-fotos').upload(nomeArquivo, buffer, { contentType: `image/${extensao}`, upsert: true });
            if (error) throw error;

            const { data: publicUrlData } = supabase.storage.from('ficha-fotos').getPublicUrl(nomeArquivo);
            foto = publicUrlData.publicUrl;
        } catch (err) {
            console.error("❌ Erro ao enviar imagem pro Supabase:", err);
        }
    }

    const fichaParaOBanco = JSON.stringify(dadosFicha);
    const isUpdate = personagemId && personagemId !== 'null' && personagemId !== '';

    try {
        if (isUpdate) {
            const authCheckSql = `
                SELECT p.usuario_id as dono_id, c.mestre_id 
                FROM personagens p
                LEFT JOIN membros_campanha m ON m.personagem_id = p.id
                LEFT JOIN campanhas c ON c.id = m.campanha_id
                WHERE p.id = $1
            `;
            const authCheck = await pool.query(authCheckSql, [personagemId]);

            if (authCheck.rows.length === 0) {
                return res.status(404).json({ erro: 'Personagem não encontrado.' });
            }

            const isDono = authCheck.rows.some(row => row.dono_id === usuarioIdSeguro);
            const isMestre = authCheck.rows.some(row => row.mestre_id === usuarioIdSeguro);

            if (!isDono && !isMestre) {
                return res.status(403).json({ erro: 'Acesso negado. Apenas o dono ou o Mestre podem alterar esta ficha.' });
            }

            const sql = `UPDATE personagens SET nome_personagem = $1, ocupacao = $2, dados_ficha = $3, foto = $4, is_privada = $5 WHERE id = $6 RETURNING id`;
            const result = await pool.query(sql, [nome, ocupacao, fichaParaOBanco, foto, isPrivada, personagemId]);

            res.json({ mensagem: 'Ficha atualizada com sucesso!', id: personagemId });
        } else {
            const sql = `INSERT INTO personagens (usuario_id, nome_personagem, ocupacao, dados_ficha, foto, is_privada) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`;
            const resultado = await pool.query(sql, [usuarioIdSeguro, nome, ocupacao, fichaParaOBanco, foto, isPrivada]);
            res.json({ mensagem: 'Nova ficha salva no banco!', id: resultado.rows[0].id });
        }
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro interno do banco de dados.' });
    }
});

app.get('/personagens/usuario/:usuarioId', verificarToken, async (req, res) => {
    const { usuarioId } = req.params;
    const usuarioSeguroId = req.usuario.id;

    if (usuarioSeguroId !== usuarioId) {
        return res.status(403).json({ erro: 'Tentativa de ler personagens de outro jogador bloqueada.' });
    }

    try {
        const sql = `SELECT id, nome_personagem, ocupacao, foto FROM personagens WHERE usuario_id = $1 ORDER BY created_at DESC`;
        const resultado = await pool.query(sql, [usuarioSeguroId]);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar personagens.' });
    }
});

app.get('/personagem/:id', verificarToken, async (req, res) => {
    const { id } = req.params;

    if (!regexUUID.test(id)) {
        return res.status(400).json({ erro: 'Formato de ID de personagem inválido.' });
    }

    try {
        const sql = `SELECT * FROM personagens WHERE id = $1`;
        const resultado = await pool.query(sql, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({ erro: 'Personagem não encontrado.' });
        }

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error('❌ Erro ao carregar ficha:', erro);
        res.status(500).json({ erro: 'Erro ao buscar dados do personagem.' });
    }
});

app.delete('/personagens/:id', verificarToken, async (req, res) => {
    const id = req.params.id;

    if (!regexUUID.test(id)) {
        return res.status(400).json({ erro: 'Formato de ID de personagem inválido.' });
    }

    try {
        const result = await pool.query('DELETE FROM personagens WHERE id = $1 AND usuario_id = $2 RETURNING id', [id, req.usuario.id]);

        if (result.rowCount === 0) {
            return res.status(403).json({ erro: 'Acesso negado. Ficha não pertence a você.' });
        }
        res.status(200).json({ mensagem: 'Personagem excluído.' });
    } catch (erro) {
        console.error('❌ Erro ao deletar ficha:', erro);
        res.status(500).json({ erro: 'Erro ao deletar ficha.' });
    }
});

app.post('/campanhas', verificarToken, async (req, res) => {
    const { nome } = req.body;
    const mestre_id = req.usuario.id;
    const codigo = gerarCodigoConvite();

    try {
        const sqlCampanha = `INSERT INTO campanhas (nome, codigo_convite, mestre_id) VALUES ($1, $2, $3) RETURNING id`;
        const resultCampanha = await pool.query(sqlCampanha, [nome, codigo, mestre_id]);

        const campanha_id = resultCampanha.rows[0].id;

        const sqlMembro = `INSERT INTO membros_campanha (campanha_id, usuario_id) VALUES ($1, $2)`;
        await pool.query(sqlMembro, [campanha_id, mestre_id]);

        res.json({ mensagem: 'Campanha criada!', id: campanha_id, codigo: codigo });
    } catch (erro) {
        console.error("Erro ao criar campanha:", erro);
        res.status(500).json({ erro: 'Erro ao criar campanha.' });
    }
});

app.post('/campanhas/entrar', verificarToken, async (req, res) => {
    const { codigo_convite, personagem_id } = req.body;
    const usuarioIdSeguro = req.usuario.id;

    try {
        const sqlBusca = `SELECT id FROM campanhas WHERE codigo_convite = $1`;
        const resultBusca = await pool.query(sqlBusca, [codigo_convite]);

        if (resultBusca.rows.length === 0) {
            return res.status(404).json({ erro: 'Código de convite inválido ou não encontrado.' });
        }

        const campanhaId = resultBusca.rows[0].id;

        const checkMembro = await pool.query('SELECT * FROM membros_campanha WHERE campanha_id = $1 AND usuario_id = $2', [campanhaId, usuarioIdSeguro]);
        if (checkMembro.rows.length > 0) return res.status(400).json({ erro: 'Você já está nesta mesa!' });

        const checkPedido = await pool.query('SELECT * FROM pedidos_campanha WHERE campanha_id = $1 AND usuario_id = $2', [campanhaId, usuarioIdSeguro]);
        if (checkPedido.rows.length > 0) return res.status(400).json({ erro: 'Você já enviou um pedido! Aguarde o Mestre aprovar.' });

        await pool.query(`INSERT INTO pedidos_campanha (campanha_id, usuario_id, personagem_id) VALUES ($1, $2, $3)`, [campanhaId, usuarioIdSeguro, personagem_id]);

        const io = req.app.get('io');
        if (io) io.to(campanhaId.toString()).emit('novo-pedido-entrada');

        res.json({ pendente: true, mensagem: 'Pedido enviado! Aguarde o Mestre permitir sua entrada.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao processar convite.' });
    }
});

app.post('/campanhas/:id/pedidos/responder', verificarToken, async (req, res) => {
    const { pedido_id, aprovado, usuario_id, personagem_id } = req.body;
    const campanhaId = req.params.id;

    try {
        const campQuery = await pool.query('SELECT nome, codigo_convite FROM campanhas WHERE id = $1', [campanhaId]);
        const nomeCampanha = campQuery.rows[0]?.nome || 'Campanha';
        const codigoCampanha = campQuery.rows[0]?.codigo_convite || '---';

        if (aprovado) {
            await pool.query(`INSERT INTO membros_campanha (campanha_id, usuario_id, personagem_id) VALUES ($1, $2, $3)`, [campanhaId, usuario_id, personagem_id]);
        }

        await pool.query(`DELETE FROM pedidos_campanha WHERE id = $1`, [pedido_id]);

        const io = req.app.get('io');
        if (io) {
            io.to(campanhaId.toString()).emit('atualizar-jogadores');
            io.emit('pedido-respondido', { 
                usuarioId: usuario_id, 
                aprovado: aprovado, 
                campanhaId: campanhaId,
                nomeCampanha: nomeCampanha,
                codigoCampanha: codigoCampanha
            });
        }

        res.json({ mensagem: aprovado ? 'Jogador aprovado na mesa!' : 'Jogador barrado com sucesso.' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao responder pedido.' });
    }
});

app.get('/campanhas/:id/pedidos', verificarToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.id as pedido_id, u.username, u.avatar, char.nome_personagem, p.personagem_id, p.usuario_id
            FROM pedidos_campanha p
            JOIN usuarios u ON p.usuario_id = u.id
            LEFT JOIN personagens char ON p.personagem_id = char.id
            WHERE p.campanha_id = $1
        `, [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar pedidos.' });
    }
});

app.delete('/campanhas/:id/membros/:usuarioId', verificarToken, async (req, res) => {
    const campanhaId = req.params.id;
    const usuarioAlvoId = req.params.usuarioId;
    const mestreRequisitanteId = req.usuario.id; 

    if (!regexUUID.test(campanhaId) || !regexUUID.test(usuarioAlvoId)) {
        return res.status(400).json({ erro: 'ID com formato inválido.' });
    }

    try {
        const sqlCheck = `SELECT mestre_id FROM campanhas WHERE id = $1`;
        const resultCheck = await pool.query(sqlCheck, [campanhaId]);

        if (resultCheck.rows.length === 0) return res.status(404).json({ erro: 'Campanha não encontrada.' });

        if (resultCheck.rows[0].mestre_id !== mestreRequisitanteId) {
            return res.status(403).json({ erro: 'ALERTA: Somente o Mestre pode remover jogadores!' });
        }

        await pool.query('DELETE FROM membros_campanha WHERE campanha_id = $1 AND usuario_id = $2', [campanhaId, usuarioAlvoId]);
        
        const io = req.app.get('io');
        if (io) {
            io.to(campanhaId.toString()).emit('jogador-expulso', { usuarioId: usuarioAlvoId });
            io.to(campanhaId.toString()).emit('atualizar-jogadores');
        }

        res.status(200).json({ mensagem: 'Membro removido com sucesso.' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao deletar membro.' });
    }
});

app.get('/campanhas/:id/jogadores', verificarToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT ON (m.usuario_id) m.usuario_id, u.username, u.avatar, p.nome_personagem, c.mestre_id 
            FROM membros_campanha m
            JOIN usuarios u ON m.usuario_id = u.id
            JOIN campanhas c ON c.id = m.campanha_id
            LEFT JOIN personagens p ON p.id = m.personagem_id
            WHERE m.campanha_id = $1
        `, [req.params.id]);
        res.json(result.rows);
    } catch (erro) {
        console.error("❌ Erro na Rota Jogadores:", erro);
        res.status(500).json({ erro: 'Erro ao buscar jogadores.' });
    }
});

app.post('/campanhas/:id/adicionar-personagem', verificarToken, async (req, res) => {
    const campanhaId = req.params.id;
    const { personagem_id } = req.body;
    const usuarioIdSeguro = req.usuario.id;

    try {
        const campCheck = await pool.query('SELECT mestre_id FROM campanhas WHERE id = $1', [campanhaId]);
        if (campCheck.rows.length === 0) return res.status(404).json({ erro: 'Campanha não encontrada.' });

        const isMestre = campCheck.rows[0].mestre_id === usuarioIdSeguro;

        const membroCheck = await pool.query('SELECT id, personagem_id FROM membros_campanha WHERE campanha_id = $1 AND usuario_id = $2', [campanhaId, usuarioIdSeguro]);
        if (membroCheck.rows.length === 0 && !isMestre) return res.status(403).json({ erro: 'Você não tem permissão nesta mesa.' });

        const charCheck = await pool.query('SELECT id FROM personagens WHERE id = $1 AND usuario_id = $2', [personagem_id, usuarioIdSeguro]);
        if (charCheck.rows.length === 0) return res.status(403).json({ erro: 'Personagem inválido ou não te pertence.' });

        const dupCheck = await pool.query('SELECT id FROM membros_campanha WHERE campanha_id = $1 AND personagem_id = $2', [campanhaId, personagem_id]);
        if (dupCheck.rows.length > 0) return res.status(400).json({ erro: 'Este personagem já está na mesa.' });

        if (!isMestre) {
            const charAtivo = membroCheck.rows.find(r => r.personagem_id !== null);
            if (charAtivo) {
                return res.status(400).json({ erro: 'Você já tem um personagem na mesa! Recolha-o antes de puxar outro.' });
            }

            const vagaVazia = membroCheck.rows.find(r => r.personagem_id === null);
            if (vagaVazia) {
                await pool.query('UPDATE membros_campanha SET personagem_id = $1 WHERE id = $2', [personagem_id, vagaVazia.id]);
            } else {
                await pool.query(`INSERT INTO membros_campanha (campanha_id, usuario_id, personagem_id) VALUES ($1, $2, $3)`, [campanhaId, usuarioIdSeguro, personagem_id]);
            }
        } else {
            await pool.query(`INSERT INTO membros_campanha (campanha_id, usuario_id, personagem_id) VALUES ($1, $2, $3)`, [campanhaId, usuarioIdSeguro, personagem_id]);
        }

        const io = req.app.get('io');
        if (io) io.to(campanhaId.toString()).emit('atualizar-jogadores');

        res.json({ mensagem: 'Ficha inserida na mesa!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao conectar com o servidor.' });
    }
});

app.delete('/campanhas/:id/remover-personagem/:personagemId', verificarToken, async (req, res) => {
    const campanhaId = req.params.id;
    const personagemId = req.params.personagemId;
    const usuarioIdSeguro = req.usuario.id;

    try {
        const charCheck = await pool.query('SELECT usuario_id FROM personagens WHERE id = $1', [personagemId]);
        if (charCheck.rows.length === 0) return res.status(404).json({ erro: 'Ficha não encontrada.' });

        const isDono = charCheck.rows[0].usuario_id === usuarioIdSeguro;

        if (!isDono) return res.status(403).json({ erro: 'Acesso Negado: Você não pode retirar a ficha de outro jogador!' });

        const userRows = await pool.query('SELECT id, personagem_id FROM membros_campanha WHERE campanha_id = $1 AND usuario_id = $2', [campanhaId, usuarioIdSeguro]);
        const targetRow = userRows.rows.find(r => r.personagem_id === personagemId);

        if (!targetRow) return res.status(404).json({ erro: 'A ficha não está na mesa.' });

        const campCheck = await pool.query('SELECT mestre_id FROM campanhas WHERE id = $1', [campanhaId]);
        const isMestre = campCheck.rows[0].mestre_id === usuarioIdSeguro;

        if (!isMestre && userRows.rows.length === 1) {
            await pool.query('UPDATE membros_campanha SET personagem_id = NULL WHERE id = $1', [targetRow.id]);
        } else {
            await pool.query('DELETE FROM membros_campanha WHERE id = $1', [targetRow.id]);
        }

        const io = req.app.get('io');
        if (io) io.to(campanhaId.toString()).emit('atualizar-jogadores');

        res.json({ mensagem: 'Ficha recolhida para o seu acervo.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ erro: 'Erro ao recolher ficha.' });
    }
});

app.get('/campanhas/:id/info', verificarToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT banner, banner_pos_y FROM campanhas WHERE id = $1', [req.params.id]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar info.' });
    }
});

app.put('/campanhas/:id/posicao-banner', verificarToken, async (req, res) => {
    const { posicao_y } = req.body;
    const campanhaId = req.params.id;
    const mestreIdSeguro = req.usuario.id;

    try {
        const resultCheck = await pool.query('SELECT mestre_id FROM campanhas WHERE id = $1', [campanhaId]);
        if (resultCheck.rows.length === 0 || resultCheck.rows[0].mestre_id !== mestreIdSeguro) {
            return res.status(403).json({ erro: 'Apenas o Mestre pode alterar o banner.' });
        }
        await pool.query('UPDATE campanhas SET banner_pos_y = $1 WHERE id = $2', [posicao_y, campanhaId]);
        res.json({ mensagem: 'Posição salva!' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao salvar posição.' });
    }
});

app.post('/campanhas/:id/criar-npc', verificarToken, async (req, res) => {
    const campanhaId = req.params.id;
    const mestreIdSeguro = req.usuario.id;

    try {
        const check = await pool.query('SELECT mestre_id FROM campanhas WHERE id = $1', [campanhaId]);
        if (check.rows.length === 0 || check.rows[0].mestre_id !== mestreIdSeguro) {
            return res.status(403).json({ erro: 'Apenas o Mestre pode criar NPCs aqui.' });
        }

        const sqlChar = `INSERT INTO personagens (usuario_id, nome_personagem, ocupacao, dados_ficha, foto, is_privada) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`;
        const resChar = await pool.query(sqlChar, [mestreIdSeguro, 'Novo NPC', 'Coadjuvante', JSON.stringify({}), null, true]);
        const npcId = resChar.rows[0].id;

        try {
            await pool.query(`INSERT INTO membros_campanha (campanha_id, usuario_id, personagem_id) VALUES ($1, $2, $3)`, [campanhaId, mestreIdSeguro, npcId]);
        } catch (errDb) {
            console.log("Aviso: Trava de duplicata acionada no banco, mas o NPC foi salvo.");
        }

        res.json({ mensagem: 'NPC forjado nas sombras!', id: npcId });
    } catch (err) {
        console.error("Erro fatal ao criar NPC:", err);
        res.status(500).json({ erro: 'Erro BD: ' + err.message });
    }
});

app.post('/campanhas/:id/banner', verificarToken, async (req, res) => {
    let foto = req.body.foto;
    const campanhaId = req.params.id;
    const mestreIdSeguro = req.usuario.id;

    try {
        const resultCheck = await pool.query('SELECT mestre_id FROM campanhas WHERE id = $1', [campanhaId]);
        if (resultCheck.rows.length === 0 || resultCheck.rows[0].mestre_id !== mestreIdSeguro) {
            return res.status(403).json({ erro: 'Apenas o Mestre pode alterar o banner.' });
        }

        if (supabase && foto && foto.startsWith('data:image')) {
            const base64Data = foto.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            const extensao = foto.substring(foto.indexOf('/') + 1, foto.indexOf(';base64'));
            const nomeArquivo = `banner_${campanhaId}_${Date.now()}.${extensao}`;

            const { error } = await supabase.storage.from('ficha-fotos').upload(nomeArquivo, buffer, { contentType: `image/${extensao}`, upsert: true });
            if (error) throw error;

            const { data: publicUrlData } = supabase.storage.from('ficha-fotos').getPublicUrl(nomeArquivo);
            foto = publicUrlData.publicUrl;
        }

        await pool.query('UPDATE campanhas SET banner = $1 WHERE id = $2', [foto, campanhaId]);
        res.json({ mensagem: 'Banner épico atualizado!', banner: foto });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao atualizar banner.' });
    }
});

app.put('/campanhas/:id/nome', verificarToken, async (req, res) => {
    const { nome } = req.body;
    const campanhaId = req.params.id;
    const mestreIdSeguro = req.usuario.id;

    if (!nome || nome.trim() === '') return res.status(400).json({ erro: 'O nome não pode ser vazio.' });

    try {
        const resultCheck = await pool.query('SELECT mestre_id FROM campanhas WHERE id = $1', [campanhaId]);
        if (resultCheck.rows.length === 0 || resultCheck.rows[0].mestre_id !== mestreIdSeguro) {
            return res.status(403).json({ erro: 'Apenas o Mestre pode renomear a campanha.' });
        }
        await pool.query('UPDATE campanhas SET nome = $1 WHERE id = $2', [nome.trim(), campanhaId]);
        res.json({ mensagem: 'Nome da campanha atualizado com sucesso!' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao atualizar o nome.' });
    }
});

app.get('/campanhas/usuario/:usuarioId', verificarToken, async (req, res) => {
    const { usuarioId } = req.params;

    if (req.usuario.id !== usuarioId) {
        return res.status(403).json({ erro: 'Tentativa de bisbilhotar campanhas alheias bloqueada!' });
    }

    try {
        const sql = `
            SELECT DISTINCT c.id, c.nome, c.codigo_convite, c.mestre_id, 
            (c.mestre_id::text = $1::text) as is_mestre
            FROM campanhas c
            JOIN membros_campanha m ON c.id = m.campanha_id
            WHERE m.usuario_id = $2
        `;
        const result = await pool.query(sql, [usuarioId, usuarioId]);
        res.json(result.rows);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar campanhas.' });
    }
});

app.get('/campanhas/:id/fichas-mesa', verificarToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT ON (p.id) p.*, u.username as nome_conta, u.avatar 
            FROM personagens p
            JOIN membros_campanha m ON p.id = m.personagem_id
            JOIN usuarios u ON u.id = m.usuario_id
            WHERE m.campanha_id = $1
            ORDER BY p.id
        `, [req.params.id]);
        res.json(result.rows);
    } catch (erro) {
        console.error("❌ Erro na Rota Fichas Mesa:", erro);
        res.status(500).json({ erro: 'Erro ao buscar fichas da mesa.' });
    }
});

app.delete('/campanhas/:id', verificarToken, async (req, res) => {
    const campanhaId = req.params.id;
    const mestreIdSeguro = req.usuario.id;

    if (!regexUUID.test(campanhaId)) {
        return res.status(400).json({ erro: 'Formato de ID inválido.' });
    }

    try {
        const sqlCheck = `SELECT mestre_id FROM campanhas WHERE id = $1`;
        const resultCheck = await pool.query(sqlCheck, [campanhaId]);

        if (resultCheck.rows.length === 0) return res.status(404).json({ erro: 'Campanha não encontrada.' });

        if (resultCheck.rows[0].mestre_id !== mestreIdSeguro) {
            return res.status(403).json({ erro: 'ALERTA DE SEGURANÇA: Apenas o Mestre pode apagar esta mesa!' });
        }

        await pool.query(`DELETE FROM membros_campanha WHERE campanha_id = $1`, [campanhaId]);
        await pool.query(`DELETE FROM campanhas WHERE id = $1`, [campanhaId]);

        const io = req.app.get('io');
        if (io) io.to(campanhaId.toString()).emit('mesa-encerrada');

        res.json({ mensagem: 'A mesa foi destruída permanentemente!' });
    } catch (erro) {
        console.error('❌ Erro ao excluir campanha:', erro);
        res.status(500).json({ erro: 'Erro interno ao destruir a mesa.' });
    }
});

app.get('/api/refugios', verificarToken, async (req, res) => {
    const usuarioIdSeguro = req.usuario.id;

    try {
        const sql = `SELECT * FROM refugios WHERE usuario_id = $1 ORDER BY criado_em DESC`;
        const result = await pool.query(sql, [usuarioIdSeguro]);

        const refugios = result.rows.map(row => ({
            id: row.id,
            nome: row.nome,
            popAtual: row.pop_atual,
            popMax: row.pop_max,
            defesa: row.defesa,
            moral: row.moral,
            mobilidade: row.mobilidade,
            beligerancia: row.beligerancia,
            agua: row.agua,
            temFonteAgua: row.tem_fonte_agua,
            alimento: row.alimento,
            madeira: row.madeira
        }));

        res.json(refugios);
    } catch (erro) {
        console.error('❌ Erro ao buscar refúgios:', erro);
        res.status(500).json({ erro: 'Erro ao buscar refúgios na base de dados.' });
    }
});

app.post('/api/refugios/salvar', verificarToken, async (req, res) => {
    const usuarioIdSeguro = req.usuario.id;
    const ref = req.body;

    const isUpdate = ref.id && regexUUID.test(ref.id);

    try {
        if (isUpdate) {
            const sql = `
                UPDATE refugios 
                SET nome = $1, pop_atual = $2, pop_max = $3, defesa = $4, moral = $5, mobilidade = $6, beligerancia = $7, agua = $8, tem_fonte_agua = $9, alimento = $10, madeira = $11, atualizado_em = now()
                WHERE id = $12 AND usuario_id = $13 RETURNING id
            `;
            const result = await pool.query(sql, [
                ref.nome, ref.popAtual, ref.popMax, ref.defesa, ref.moral, ref.mobilidade, ref.beligerancia, ref.agua, ref.temFonteAgua, ref.alimento, ref.madeira,
                ref.id, usuarioIdSeguro
            ]);

            if (result.rowCount === 0) {
                return res.status(403).json({ erro: 'Tentativa de invasão. Você não é dono deste refúgio.' });
            }
            res.json({ mensagem: 'Refúgio atualizado com sucesso!', id: ref.id });

        } else {
            const sql = `
                INSERT INTO refugios (usuario_id, nome, pop_atual, pop_max, defesa, moral, mobilidade, beligerancia, agua, tem_fonte_agua, alimento, madeira)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id
            `;
            const result = await pool.query(sql, [
                usuarioIdSeguro, ref.nome, ref.popAtual, ref.popMax, ref.defesa, ref.moral, ref.mobilidade, ref.beligerancia, ref.agua, ref.temFonteAgua, ref.alimento, ref.madeira
            ]);

            res.json({ mensagem: 'Refúgio criado no banco com sucesso!', id: result.rows[0].id });
        }
    } catch (erro) {
        console.error('❌ Erro ao salvar refúgio:', erro);
        res.status(500).json({ erro: 'Erro interno ao salvar refúgio.' });
    }
});

app.delete('/api/refugios/deletar/:id', verificarToken, async (req, res) => {
    const id = req.params.id;
    const usuarioIdSeguro = req.usuario.id;

    if (!regexUUID.test(id)) {
        return res.status(400).json({ erro: 'ID de refúgio inválido.' });
    }

    try {
        const result = await pool.query('DELETE FROM refugios WHERE id = $1 AND usuario_id = $2 RETURNING id', [id, usuarioIdSeguro]);

        if (result.rowCount === 0) {
            return res.status(403).json({ erro: 'Acesso negado. Refúgio não pertence a você.' });
        }
        res.status(200).json({ mensagem: 'Refúgio dizimado.' });
    } catch (erro) {
        console.error('❌ Erro ao deletar refúgio:', erro);
        res.status(500).json({ erro: 'Erro ao deletar refúgio.' });
    }
});

app.get('/campanhas/:id/partitura', verificarToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT dados_partitura FROM campanhas WHERE id = $1', [req.params.id]);
        res.json(result.rows[0] ? result.rows[0].dados_partitura : null);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar partitura da mesa.' });
    }
});

app.post('/campanhas/:id/partitura', verificarToken, async (req, res) => {
    try {
        const dados = req.body.dados;
        await pool.query('UPDATE campanhas SET dados_partitura = $1 WHERE id = $2', [dados, req.params.id]);
        res.json({ mensagem: 'Partitura salva em segurança!' });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao salvar a partitura.' });
    }
});

app.post('/amizades/enviar', verificarToken, async (req, res) => {
    const { alvo } = req.body; 
    const meuId = req.usuario.id;

    try {
        const resBusca = await pool.query('SELECT id FROM usuarios WHERE username = $1 OR email = $1', [alvo.toLowerCase()]);
        if (resBusca.rows.length === 0) return res.status(404).json({ erro: 'Sobrevivente não encontrado na base de dados!' });

        const amigoId = resBusca.rows[0].id;
        if (meuId === amigoId) return res.status(400).json({ erro: 'Você não pode adicionar a si mesmo, louco!' });

        const check = await pool.query('SELECT * FROM amizades WHERE (usuario_id_1 = $1 AND usuario_id_2 = $2) OR (usuario_id_1 = $2 AND usuario_id_2 = $1)', [meuId, amigoId]);
        if (check.rows.length > 0) return res.status(400).json({ erro: 'Vocês já possuem uma conexão ou solicitação pendente!' });

        await pool.query('INSERT INTO amizades (usuario_id_1, usuario_id_2, status) VALUES ($1, $2, $3)', [meuId, amigoId, 'pendente']);

        const io = req.app.get('io');
        if (io) io.emit('notificacao-pessoal', { usuarioId: amigoId, msg: 'Você recebeu um pedido de amizade!' });

        res.json({ mensagem: 'Pedido de amizade enviado pelos ermos!' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao enviar pedido.' });
    }
});

app.get('/amizades', verificarToken, async (req, res) => {
    const meuId = req.usuario.id;
    try {
        const sql = `
            SELECT a.id as amizade_id, a.status,
                   u.id as amigo_id, u.username, u.avatar,
                   (a.usuario_id_1 = $1) as fui_eu_que_enviei
            FROM amizades a
            JOIN usuarios u ON (u.id = a.usuario_id_1 OR u.id = a.usuario_id_2) AND u.id != $1
            WHERE a.usuario_id_1 = $1 OR a.usuario_id_2 = $1
        `;
        const result = await pool.query(sql, [meuId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao varrer lista de contatos.' });
    }
});

app.post('/amizades/responder', verificarToken, async (req, res) => {
    const { amizade_id, aceito } = req.body;
    const meuId = req.usuario.id;

    try {
        if (aceito) {
            await pool.query('UPDATE amizades SET status = $1 WHERE id = $2 AND usuario_id_2 = $3', ['aceito', amizade_id, meuId]);
            res.json({ mensagem: 'Amizade forjada com sucesso!' });
        } else {
            await pool.query('DELETE FROM amizades WHERE id = $1 AND (usuario_id_1 = $2 OR usuario_id_2 = $2)', [amizade_id, meuId]);
            res.json({ mensagem: 'Vínculo recusado e cortado.' });
        }
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao responder à solicitação.' });
    }
});

app.post('/campanhas/:id/convidar-amigo', verificarToken, async (req, res) => {
    const campanhaId = req.params.id;
    const { amigo_id } = req.body;
    const mestreId = req.usuario.id;

    try {
        const checkMestre = await pool.query('SELECT mestre_id FROM campanhas WHERE id = $1', [campanhaId]);
        if (checkMestre.rows[0].mestre_id !== mestreId) return res.status(403).json({ erro: 'Apenas o Mestre tem as chaves dos portões!' });

        const checkMembro = await pool.query('SELECT * FROM membros_campanha WHERE campanha_id = $1 AND usuario_id = $2', [campanhaId, amigo_id]);
        if (checkMembro.rows.length > 0) return res.status(400).json({ erro: 'O jogador já está nas trincheiras dessa mesa!' });

        await pool.query('INSERT INTO convites_mesa (campanha_id, remetente_id, destinatario_id) VALUES ($1, $2, $3)', [campanhaId, mestreId, amigo_id]);

        const io = req.app.get('io');
        if (io) io.emit('notificacao-pessoal', { usuarioId: amigo_id, msg: 'Uma nova mesa requisita a sua presença!' });

        res.json({ mensagem: 'Sinalizador enviado ao seu amigo!' });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ erro: 'O convite já foi disparado.' });
        res.status(500).json({ erro: 'Erro ao enviar convite.' });
    }
});

app.get('/convites', verificarToken, async (req, res) => {
    const meuId = req.usuario.id;
    try {
        const sql = `
            SELECT cv.id as convite_id, c.id as campanha_id, c.nome as nome_campanha, u.username as nome_mestre
            FROM convites_mesa cv
            JOIN campanhas c ON c.id = cv.campanha_id
            JOIN usuarios u ON u.id = cv.remetente_id
            WHERE cv.destinatario_id = $1 AND cv.status = 'pendente'
        `;
        const result = await pool.query(sql, [meuId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro de comunicação.' });
    }
});

app.post('/convites/responder', verificarToken, async (req, res) => {
    const { convite_id, aceito } = req.body;
    const meuId = req.usuario.id;

    try {
        const resConvite = await pool.query('SELECT campanha_id FROM convites_mesa WHERE id = $1 AND destinatario_id = $2', [convite_id, meuId]);
        if (resConvite.rows.length === 0) return res.status(404).json({ erro: 'Convite extraviado.' });

        const campanhaId = resConvite.rows[0].campanha_id;

        if (aceito) {
            await pool.query('INSERT INTO membros_campanha (campanha_id, usuario_id) VALUES ($1, $2)', [campanhaId, meuId]);
        }

        await pool.query('DELETE FROM convites_mesa WHERE id = $1', [convite_id]);

        const io = req.app.get('io');
        if (io) io.to(campanhaId.toString()).emit('atualizar-jogadores'); 

        res.json({ mensagem: aceito ? 'Você se juntou à campanha!' : 'Convite rasgado.' });
    } catch (err) {
        if (err.code === '23505') {
            await pool.query('DELETE FROM convites_mesa WHERE id = $1', [convite_id]);
            return res.status(400).json({ erro: 'Você já tinha entrado nessa mesa de outra forma!' });
        }
        res.status(500).json({ erro: 'Erro interno.' });
    }
});

app.get('/personagens/obs/:id', async (req, res) => {
    const { id } = req.params;
    if (!regexUUID.test(id)) return res.status(400).json({ erro: 'ID inválido.' });

    try {
        const sql = `
            SELECT p.nome_personagem, p.foto, p.dados_ficha, p.obs_pos_x, p.obs_pos_y, m.campanha_id 
            FROM personagens p
            LEFT JOIN membros_campanha m ON p.id = m.personagem_id
            WHERE p.id = $1
        `;
        const resultado = await pool.query(sql, [id]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({ erro: 'Personagem não encontrado.' });
        }
        res.json(resultado.rows[0]);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao buscar dados para o OBS.' });
    }
});

app.put('/personagens/:id/posicao-foto-obs', verificarToken, async (req, res) => {
    const { posX, posY } = req.body;
    const personagemId = req.params.id;
    const usuarioIdSeguro = req.usuario.id;

    try {
        const sql = 'UPDATE personagens SET obs_pos_x = $1, obs_pos_y = $2 WHERE id = $3 AND usuario_id = $4 RETURNING id';
        const result = await pool.query(sql, [posX, posY, personagemId, usuarioIdSeguro]);
        
        if (result.rowCount === 0) return res.status(403).json({ erro: 'Apenas o dono da ficha pode alterar o enquadramento.' });

        res.json({ mensagem: 'Enquadramento salvo nas estrelas!' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao salvar enquadramento.' });
    }
});

server.listen(PORT, () => {
    console.log(`Servidor a correr na porta http://localhost:${PORT}`);
});