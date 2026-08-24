// ==========================================
// 🛡️ FEITIÇO DE INTIMIDAÇÃO NO CONSOLE
// ==========================================
console.log(
    "%cALERTA CRÍTICO DE SEGURANÇA!", 
    "color: red; font-size: 40px; font-weight: bold; text-shadow: 2px 2px 0 #000;"
);
console.log(
    "%cEste é um recurso de navegador voltado para desenvolvedores. Se alguém te disse para copiar e colar algo aqui para 'ganhar itens', 'hackear dados' ou 'virar mestre', é um GOLPE (Scam). Colar códigos aqui dará aos invasores acesso à sua conta e suas fichas.", 
    "color: white; font-size: 16px; background-color: #121212; padding: 10px; border: 2px solid red; border-radius: 5px;"
);

// ==========================================
// VARIÁVEIS GLOBAIS (Acessíveis por outros scripts)
// ==========================================
window.API_URL = 'https://fichaassimilacaorpg.onrender.com';

window.mostrarNotificacao = function (mensagem, tipo = 'sucesso') {
    let container = document.getElementById('toast-container');
    if (!container) return; // Segurança caso o container suma

    const card = document.createElement('div');
    const corBorda = tipo === 'erro' ? '#f44336' : (tipo === 'aviso' ? '#ff9800' : '#4caf50');

    Object.assign(card.style, {
        backgroundColor: '#1a1a1a',
        color: '#f0f0f0',
        padding: '15px 20px',
        borderRadius: '5px',
        borderLeft: `5px solid ${corBorda}`,
        boxShadow: '0 4px 8px rgba(0,0,0,0.6)',
        fontFamily: "'Special Elite', monospace",
        fontSize: '1rem',
        opacity: '0',
        transform: 'translateX(100%)',
        transition: 'all 0.3s ease-out'
    });

    card.innerHTML = `<strong>${mensagem}</strong>`;
    container.appendChild(card);

    requestAnimationFrame(() => {
        card.style.opacity = '1';
        card.style.transform = 'translateX(0)';
    });

    setTimeout(() => {
        card.style.opacity = '0';
        card.style.transform = 'translateX(100%)';
        setTimeout(() => card.remove(), 300);
    }, 2500);
};

document.addEventListener('DOMContentLoaded', () => {
    
    // ==========================================
    // SISTEMA DE REVELAR SENHAS (OLHO MÁGICO BLINDADO)
    // ==========================================
    document.addEventListener('click', (e) => {
        // Dicionário mapeando qual Ícone controla qual Input
        const paresSenhas = {
            'toggle-auth-password': 'auth-password',
            'toggle-auth-confirm': 'auth-confirm-password',
            'toggle-recuperar-senha': 'recuperar-nova-senha',
            'toggle-recuperar-confirmar': 'recuperar-confirmar-senha'
        };

        // Verifica se o clique atingiu algum dos nossos ícones de olho
        for (const [iconId, inputId] of Object.entries(paresSenhas)) {
            const clickedIcon = e.target.closest(`#${iconId}`);
            if (clickedIcon) {
                const inputEl = document.getElementById(inputId);
                if (inputEl) {
                    const isPassword = inputEl.type === 'password';
                    
                    // Alterna o tipo do input
                    inputEl.type = isPassword ? 'text' : 'password';
                    
                    // Cria uma tag limpa para o Lucide não quebrar
                    const newIcon = document.createElement('i');
                    newIcon.id = iconId;
                    newIcon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
                    newIcon.className = "absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white transition-colors";
                    
                    // Substitui o velho pelo novo e manda o Lucide renderizar
                    clickedIcon.replaceWith(newIcon);
                    if (window.lucide) lucide.createIcons();
                }
                break; // Para o loop pois já achamos quem foi clicado
            }
        }
    });

    let isLoginMode = true;

    // Elementos de Autenticação
    const viewAuth = document.getElementById('view-auth');
    const viewApp = document.getElementById('view-app');
    
    const authForm = document.getElementById('auth-form');
    const authTitle = document.getElementById('auth-title');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authToggleLink = document.getElementById('auth-toggle-link');
    const authToggleText = document.getElementById('auth-toggle-text');
    const authMensagem = document.getElementById('auth-mensagem');
    
    const usernameInput = document.getElementById('auth-username');
    const passwordInput = document.getElementById('auth-password');
    const authEmailInput = document.getElementById('auth-email');
    const confirmPasswordInput = document.getElementById('auth-confirm-password');
    
    const authUsernameContainer = document.getElementById('auth-username-container');
    const authConfirmContainer = document.getElementById('auth-confirm-container');
    const esqueciSenhaWrapper = document.getElementById('esqueci-senha-wrapper');
    const subtitleTexto = document.querySelector('.auth-subtitle');

    const btnSair = document.getElementById('btn-sair');
    

    // ==========================================
    // VERIFICAÇÃO DE SESSÃO ATIVA
    // ==========================================
    function verificarSessao() {
        const usuarioLogadoId = sessionStorage.getItem('usuarioId');
        
        if (usuarioLogadoId && usuarioLogadoId !== 'undefined') {
            // Esconde Login, Mostra o App
            viewAuth.classList.add('hidden');
            viewApp.classList.remove('hidden');

            // Atualiza nomes pela interface se existirem
            const nomeOperador = sessionStorage.getItem('usuarioNome');
            const spanNomeFicha = document.getElementById('nome-usuario-logado-ficha');
            if (spanNomeFicha) spanNomeFicha.textContent = `Bem-vindo, ${nomeOperador}`;
            
            // Renderiza ícones se necessário
            if (window.lucide) lucide.createIcons();

            // 🔥 MÁGICA DA RESTAURAÇÃO DE ESTADO (AGORA COM ATRASO SEGURO) 🔥
            if (typeof Router !== 'undefined') {
                const telaSalva = sessionStorage.getItem('telaAtual') || 'dashboard';
                
                // O setTimeout dá tempo para as funções do dashboard.js nascerem na memória!
                setTimeout(() => {
                    Router.navigate(telaSalva);

                    if (telaSalva === 'ficha' && typeof window.carregarPersonagem === 'function') {
                        const personagemId = sessionStorage.getItem('personagemAtivoId');
                        if (personagemId) window.carregarPersonagem(personagemId);
                    }
                }, 150); 
            }
            
            return true;
        }
        return false;
    }
    
    // Roda a verificação assim que a página carrega
    verificarSessao();

    

    // ==========================================
    // ALTERNAR ENTRE LOGIN E REGISTRO
    // ==========================================
    if (authToggleLink) {
        authToggleLink.addEventListener('click', () => {
            isLoginMode = !isLoginMode;
            authMensagem.textContent = '';

            if (isLoginMode) {
                authTitle.textContent = 'Acesso Restrito';
                authSubmitBtn.textContent = 'Entrar no Sistema';
                authToggleText.innerHTML = 'Não possui conta? <span id="auth-toggle-link" class="text-rpg-red hover:text-rpg-red-hover dark:text-orange-500 dark:hover:text-orange-400 cursor-pointer underline font-bold transition-colors">Criar nova conta</span>';
                
                authConfirmContainer.style.display = 'none';
                authUsernameContainer.style.display = 'none';
                esqueciSenhaWrapper.style.display = 'block';
            } else {
                authTitle.textContent = 'Novo Registro';
                authSubmitBtn.textContent = 'Registrar Conta';
                authToggleText.innerHTML = 'Já possui Conta? <span id="auth-toggle-link" class="text-rpg-red hover:text-rpg-red-hover dark:text-orange-500 dark:hover:text-orange-400 cursor-pointer underline font-bold transition-colors">Fazer Login</span>';

                authConfirmContainer.style.display = 'block';
                authUsernameContainer.style.display = 'block';
                esqueciSenhaWrapper.style.display = 'none';
            }
            
            // Readiciona o evento no novo link gerado
            document.getElementById('auth-toggle-link').addEventListener('click', () => authToggleLink.click());
        });
    }

    // ==========================================
    // SUBMIT DO FORMULÁRIO (LOGIN / API)
    // ==========================================
    if (authForm) {
        authForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const username = usernameInput.value.trim();
            const password = passwordInput.value.trim();
            const confirmPassword = confirmPasswordInput.value.trim();
            const email = authEmailInput.value.trim();
            const endpoint = isLoginMode ? '/login' : '/registro';

            if (!isLoginMode) {
                if (!username) {
                    authMensagem.textContent = 'Nome do Infectado é obrigatório!';
                    return;
                }
                if (password !== confirmPassword) {
                    authMensagem.textContent = 'As senhas não coincidem!';
                    return; 
                }
            }

            const bodyData = { email: email, password: password };
            if (!isLoginMode) bodyData.username = username;

            try {
                authSubmitBtn.disabled = true;
                authSubmitBtn.textContent = 'Aguarde...';

                const resposta = await fetch(`${window.API_URL}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyData)
                });

                const dados = await resposta.json();

                if (!resposta.ok) {
                    authMensagem.textContent = dados.erro;
                } else {
                    if (isLoginMode) {
                        const nomeParaSalvar = dados.usuario?.nome || dados.usuario?.username || dados.nome || dados.username || 'Operador';
                        const idParaSalvar = dados.usuario?.id || dados.id;

                        // Salva os dados na Sessão
                        sessionStorage.setItem('usuarioId', idParaSalvar);
                        sessionStorage.setItem('usuarioNome', nomeParaSalvar);
                        sessionStorage.setItem('token', dados.token); 

                        // Limpa inputs
                        usernameInput.value = '';
                        passwordInput.value = '';
                        authEmailInput.value = '';

                        mostrarNotificacao(dados.mensagem, 'sucesso');
                        if (typeof window.carregarAvatarGlobal === 'function') {
                            window.carregarAvatarGlobal();
                        }
                        verificarSessao(); // Dispara a entrada no sistema!
                    } else {
                        authMensagem.textContent = 'Conta criada com sucesso! Faça login.';
                        authMensagem.className = "font-bold mt-4 min-h-[20px] text-green-600 dark:text-green-400";
                        authToggleLink.click();
                    }
                }
            } catch (erro) {
                authMensagem.textContent = 'Erro de conexão com o servidor SQL.';
            } finally {
                authSubmitBtn.disabled = false;
                authSubmitBtn.textContent = isLoginMode ? 'Entrar no Sistema' : 'Registrar Conta';
            }
        });
    }

    // ==========================================
    // SISTEMA DE RECUPERAÇÃO DE SENHA 
    // ==========================================
    const btnEsqueciSenha = document.getElementById('btn-esqueci-senha');
    const btnVoltarLogin = document.getElementById('btn-voltar-login');
    const recuperarForm = document.getElementById('recuperar-form');
    const recuperarEmailStep = document.getElementById('recuperar-email-step');
    const recuperarCodigoStep = document.getElementById('recuperar-codigo-step');
    const btnEnviarCodigo = document.getElementById('btn-enviar-codigo');
    const btnSalvarNovaSenha = document.getElementById('btn-salvar-nova-senha');

    if (btnEsqueciSenha) {
        btnEsqueciSenha.addEventListener('click', () => {
            authForm.style.display = 'none';
            authToggleText.style.display = 'none';
            recuperarForm.style.display = 'block';
            authTitle.textContent = 'Recuperar Senha';
            subtitleTexto.textContent = 'Enviaremos um código para o seu e-mail.';
            authMensagem.textContent = '';
        });
    }

    if (btnVoltarLogin) {
        btnVoltarLogin.addEventListener('click', () => {
            recuperarForm.style.display = 'none';
            authForm.style.display = 'block';
            authToggleText.style.display = 'block';
            authTitle.textContent = 'Acesso Restrito';
            subtitleTexto.textContent = 'Identifique-se para acessar o VTT.';
            authMensagem.textContent = '';
            recuperarEmailStep.style.display = 'block';
            recuperarCodigoStep.style.display = 'none';
        });
    }

    if (btnEnviarCodigo) {
        btnEnviarCodigo.addEventListener('click', async () => {
            const emailRec = document.getElementById('recuperar-email').value.trim();
            if (!emailRec) return mostrarNotificacao('Por favor, digite o seu e-mail.', 'aviso');

            btnEnviarCodigo.textContent = 'Enviando...';
            try {
                const res = await fetch(`${window.API_URL}/esqueci-senha`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: emailRec })
                });
                const data = await res.json();

                if (res.ok) {
                    mostrarNotificacao(data.mensagem, 'sucesso');
                    recuperarEmailStep.style.display = 'none';
                    recuperarCodigoStep.style.display = 'block';
                    subtitleTexto.textContent = 'Verifique sua caixa de entrada (e o Spam).';
                    authMensagem.textContent = '';
                } else {
                    authMensagem.textContent = data.erro;
                }
            } catch (err) {
                authMensagem.textContent = 'Erro de comunicação com o servidor.';
            } finally {
                btnEnviarCodigo.textContent = 'Receber Código';
            }
        });
    }

    if (btnSalvarNovaSenha) {
        btnSalvarNovaSenha.addEventListener('click', async () => {
            const emailRec = document.getElementById('recuperar-email').value.trim();
            const token = document.getElementById('recuperar-token').value.trim();
            const novaSenha = document.getElementById('recuperar-nova-senha').value.trim();
            const confirmNovaSenha = document.getElementById('recuperar-confirmar-senha').value.trim(); 

            if (!token || !novaSenha || !confirmNovaSenha) return mostrarNotificacao('Preencha todos os campos!!', 'aviso');
            if (novaSenha !== confirmNovaSenha) return mostrarNotificacao('As senhas não coincidem!', 'erro');

            btnSalvarNovaSenha.textContent = 'Validando...';
            try {
                const res = await fetch(`${window.API_URL}/resetar-senha`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: emailRec, token, novaSenha })
                });
                const data = await res.json();

                if (res.ok) {
                    mostrarNotificacao(data.mensagem, 'sucesso');
                    btnVoltarLogin.click();
                } else {
                    authMensagem.textContent = data.erro;
                }
            } catch (err) {
                authMensagem.textContent = 'Erro de comunicação com o servidor.';
            } finally {
                btnSalvarNovaSenha.textContent = 'Redefinir Senha';
            }
        });
    }

    // ==========================================
    // SISTEMA DE LOGOUT (DESCONECTAR)
    // ==========================================
    if (btnSair) {
        btnSair.addEventListener('click', (e) => {
            e.preventDefault();

            // Limpa a Sessão
            sessionStorage.clear();

            // Reseta todos os formulários da página
            document.querySelectorAll('form').forEach(f => {
                if (f.id !== 'auth-form' && f.id !== 'recuperar-form') f.reset();
            });

            // Reseta as fotos de perfil e ficha
            const photoPreview = document.getElementById('char-photo-preview');
            if (photoPreview) photoPreview.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

            // Esconde o App, Mostra o Login
            viewApp.classList.add('hidden');
            viewAuth.classList.remove('hidden');

            mostrarNotificacao('Você foi desconectado com segurança.', 'aviso');
        });
    }

    // ==========================================
    // SISTEMA DE LOGIN COM GOOGLE
    // ==========================================
    window.onload = function () {
        if (typeof google !== 'undefined') {
            google.accounts.id.initialize({
                client_id: "522356534352-l2fm34cfha2n1fjtcg8iho879vqk44dk.apps.googleusercontent.com",
                callback: handleGoogleLogin
            });
            google.accounts.id.renderButton(
                document.getElementById("google-btn-container"),
                { theme: "outline", size: "large", width: 330, text: "continue_with" }
            );
        }
    };

    async function handleGoogleLogin(response) {
        try {
            authSubmitBtn.disabled = true;
            authSubmitBtn.textContent = 'Autenticando Google...';

            const res = await fetch(`${window.API_URL}/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: response.credential })
            });

            const dados = await res.json();
            
            if (res.ok) {
                sessionStorage.setItem('usuarioId', dados.usuario.id);
                sessionStorage.setItem('usuarioNome', dados.usuario.nome);
                sessionStorage.setItem('token', dados.token); 
                
                mostrarNotificacao(dados.mensagem, 'sucesso');
                if (typeof window.carregarAvatarGlobal === 'function') window.carregarAvatarGlobal();
                verificarSessao(); // Entra no sistema!
            } else {
                authMensagem.textContent = dados.erro;
            }
        } catch (err) {
            authMensagem.textContent = 'Erro ao comunicar com servidor Google.';
        } finally {
            authSubmitBtn.disabled = false;
            authSubmitBtn.textContent = 'Entrar no Sistema';
        }
    }
});