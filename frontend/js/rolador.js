document.addEventListener('DOMContentLoaded', () => {

    window.escaparHTML = window.escaparHTML || function(text) {
        if (text == null) return '';
        return text.toString().replace(/[&<>"']/g, function(m) {
            return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'}[m];
        });
    };

    const iconesTemaClaro = {
        sucesso: 'assets/sucesso.png',
        pressao: 'assets/pressao.png',
        adaptacao: 'assets/adaptacao.png',
        nada: 'assets/nada.png'
    };

    const iconesTemaEscuro = {
        sucesso: 'assets/sucesso-branco.png',
        pressao: 'assets/pressao-branco.png',
        adaptacao: 'assets/adaptacao-branco.png',
        nada: 'assets/nada-branco.png'
    };

    function obterIconesAtuais() {
        return document.body.classList.contains('dark') ? iconesTemaEscuro : iconesTemaClaro;
    }

    const inputDados = document.getElementById('rolador-input');
    const rollButton = document.getElementById('rolador-btn-rolar');
    const clearButton = document.getElementById('rolador-btn-limpar');
    const resultsDiv = document.getElementById('rolador-resultados-atuais');
    const historicoDiv = document.getElementById('rolador-historico');

    window.rolagemPendente = null;

    const diceTable = {
        d6: { 1: ['nada'], 2: ['nada'], 3: ['pressao'], 4: ['pressao'], 5: ['adaptacao', 'pressao'], 6: ['sucesso'] },
        d10: { 1: ['nada'], 2: ['nada'], 3: ['pressao'], 4: ['pressao'], 5: ['adaptacao', 'pressao'], 6: ['sucesso'], 7: ['sucesso', 'sucesso'], 8: ['sucesso', 'adaptacao'], 9: ['sucesso', 'adaptacao', 'pressao'], 10: ['sucesso', 'sucesso', 'pressao'] },
        d12: { 1: ['nada'], 2: ['nada'], 3: ['pressao'], 4: ['pressao'], 5: ['adaptacao', 'pressao'], 6: ['sucesso'], 7: ['sucesso', 'sucesso'], 8: ['sucesso', 'adaptacao'], 9: ['sucesso', 'adaptacao', 'pressao'], 10: ['sucesso', 'sucesso', 'pressao'], 11: ['sucesso', 'adaptacao', 'adaptacao', 'pressao'], 12: ['pressao', 'pressao'] }
    };

    function rollDie(max) { return Math.floor(Math.random() * max) + 1; }

    function parseInput(inputString) {
        const diceRequests = [];
        const parts = inputString.trim().toLowerCase().split(/\s+/);
        for (const part of parts) {
            if (!part) continue;
            const match = part.match(/^(\d*)d(\d+)$/);
            if (!match) {
                if (typeof window.mostrarNotificacao === 'function') window.mostrarNotificacao(`Formato inválido: "${part}"`, 'erro');
                return null;
            }
            const quantity = parseInt(match[1] || '1', 10);
            const size = parseInt(match[2], 10);
            if (![6, 10, 12].includes(size)) {
                if (typeof window.mostrarNotificacao === 'function') window.mostrarNotificacao(`Dado inválido: d${size}. Use d6, d10 ou d12.`, 'aviso');
                return null;
            }
            diceRequests.push({ quantity, size });
        }
        return diceRequests;
    }

    function handleRoll() {
        const inputString = inputDados.value;
        const parsedDice = parseInput(inputString);
        if (!parsedDice || parsedDice.length === 0) return;

        let dieCounter = { d6: 0, d10: 0, d12: 0 };
        window.rolagemPendente = { input: inputString, dados: [] };

        const telaAtual = sessionStorage.getItem('telaAtual');
        const isNaTelaCampanha = telaAtual === 'campanha';

        const autoSelecionarTudo = isNaTelaCampanha || window.isTesteAssimilacaoReal === true;

        parsedDice.forEach(die => {
            const dieType = 'd' + die.size;
            for (let i = 0; i < die.quantity; i++) {
                dieCounter[dieType]++;
                const rollNumber = rollDie(die.size);
                const icons = diceTable[dieType][rollNumber];
                
                window.rolagemPendente.dados.push({
                    id: Math.random().toString(36).substr(2, 9),
                    tipo: dieType,
                    numero: dieCounter[dieType],
                    faceMecanica: rollNumber,
                    icones: icons,
                    selecionado: autoSelecionarTudo 
                });
            }
        });

        if (autoSelecionarTudo) {
            window.confirmarRolagem();
        } else {
            window.renderizarRolagemPendente();
        }
    }

    window.renderizarRolagemPendente = function() {
        if (!window.rolagemPendente) return;
        resultsDiv.innerHTML = '';
        const iconFilesAtuais = obterIconesAtuais();

        const container = document.createElement('div');
        container.className = 'bg-gray-100 dark:bg-[#1a1a1a] border-2 border-rpg-red rounded-lg p-4 shadow-lg flex flex-col items-center animate-fade-in my-4 mx-2';

        container.innerHTML = `<h3 class="text-rpg-red dark:text-red-500 font-black font-rpg uppercase text-sm mb-3 text-center border-b border-red-300 dark:border-red-900 pb-1 w-full">Selecione os Dados</h3>`;

        const diceContainer = document.createElement('div');
        diceContainer.className = 'flex flex-wrap gap-2 justify-center mb-4';

        window.rolagemPendente.dados.forEach(dado => {
            const isSelected = dado.selecionado 
                ? 'border-rpg-green bg-green-100 dark:bg-green-900/30 scale-110 shadow-md ring-2 ring-rpg-green' 
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-[#242424] opacity-60 hover:opacity-100';
            
            const dieDiv = document.createElement('div');
            dieDiv.className = `cursor-pointer transition-all duration-200 border-2 rounded p-2 text-center min-w-[45px] flex flex-col items-center justify-center ${isSelected}`;
            dieDiv.onclick = () => window.toggleDadoPendente(dado.id);
            
            dieDiv.innerHTML += `<span class="text-[8px] font-bold text-gray-500 uppercase mb-1">${dado.tipo}</span>`;

            const iconsDiv = document.createElement('div');
            iconsDiv.className = 'flex flex-wrap gap-0.5 justify-center';
            
            if (dado.icones.includes('nada')) {
                const img = document.createElement('img');
                img.src = iconFilesAtuais['nada'];
                img.className = 'w-[20px] h-[20px] object-contain';
                iconsDiv.appendChild(img);
            } else {
                dado.icones.forEach(iconName => {
                    const img = document.createElement('img');
                    img.src = iconFilesAtuais[iconName];
                    img.className = 'w-[20px] h-[20px] object-contain';
                    iconsDiv.appendChild(img);
                });
            }
            
            dieDiv.appendChild(iconsDiv);
            diceContainer.appendChild(dieDiv);
        });

        container.appendChild(diceContainer);

        const btnConfirmar = document.createElement('button');
        btnConfirmar.className = 'w-full bg-rpg-green hover:bg-green-700 text-white font-bold py-2 rounded uppercase font-rpg text-xs shadow-md transition-colors';
        btnConfirmar.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4 inline align-text-bottom"></i> Confirmar Mantidos';
        btnConfirmar.onclick = window.confirmarRolagem;

        container.appendChild(btnConfirmar);
        resultsDiv.appendChild(container);
        if(window.lucide) lucide.createIcons();
    };

    window.toggleDadoPendente = function(id) {
        const dado = window.rolagemPendente.dados.find(d => d.id === id);
        if(dado) dado.selecionado = !dado.selecionado;
        window.renderizarRolagemPendente();
    };

    window.confirmarRolagem = function() {
        const mantidos = window.rolagemPendente.dados.filter(d => d.selecionado);
        if (mantidos.length === 0) {
            return window.mostrarNotificacao("Você deve selecionar pelo menos 1 dado!", "aviso");
        }

        const campanhaAtiva = sessionStorage.getItem('campanhaAtiva') || sessionStorage.getItem('campanhaAtivaFallback');
        const telaAtual = sessionStorage.getItem('telaAtual');
        const isMestre = sessionStorage.getItem('isMestreAtivo') === 'true';
        
        let nomeRolador = sessionStorage.getItem('usuarioNome') || 'Operador Misterioso';
        let fotoAvatar = './assets/icon.jpg';
        let idDaFicha = null; 

        if (telaAtual === 'ficha') {
            const urlParams = new URLSearchParams(window.location.search);
            idDaFicha = window.idPersonagemAtual || sessionStorage.getItem('personagemAtivoId') || urlParams.get('id') || null;

            const inputNome = document.getElementById('nome');
            if (inputNome && inputNome.value.trim() !== '') nomeRolador = inputNome.value.trim();

            const imgPersonagem = document.getElementById('char-photo-preview');
            if (imgPersonagem && imgPersonagem.src && !imgPersonagem.src.includes('R0lGOD')) {
                fotoAvatar = imgPersonagem.src;
            }
        } else {
            if (isMestre) {
                idDaFicha = null; 
            } else {
                idDaFicha = sessionStorage.getItem('personagemAtivoId') || null;
            }

            const imgPerfil = document.getElementById('nav-avatar-img');
            if (imgPerfil && imgPerfil.src && !imgPerfil.src.includes('R0lGOD')) {
                fotoAvatar = imgPerfil.src;
            }
        }

        const pacoteDeDados = {
            nome: nomeRolador,
            usuarioId: sessionStorage.getItem('usuarioId'),
            personagemId: idDaFicha, 
            avatar: fotoAvatar,
            timestamp: new Date().toISOString(),
            input: window.rolagemPendente.input,
            campanhaId: campanhaAtiva, 
            isRolagemPublica: (isMestre && document.getElementById('toggle-rolagem-mestre')) ? !document.getElementById('toggle-rolagem-mestre').checked : true,
            resultados: mantidos, 
            rolagemCompleta: window.rolagemPendente.dados, 
            totais: { sucesso: 0, pressao: 0, adaptacao: 0, nada: 0 }
        };

        mantidos.forEach(dado => {
            dado.icones.forEach(iconName => pacoteDeDados.totais[iconName]++);
        });

        renderizarChat(pacoteDeDados);

        if (telaAtual === 'ficha' && pacoteDeDados.totais.pressao > 0 && window.isTesteAssimilacaoReal === true) {
            if (typeof window.aplicarPressaoAutomatica === 'function') {
                window.aplicarPressaoAutomatica(pacoteDeDados.totais.pressao);
            }
        }
        window.isTesteAssimilacaoReal = false;

        if (window.socket) {
            pacoteDeDados.token = sessionStorage.getItem('token'); 
            window.socket.emit('rolar-dados', pacoteDeDados);
        }

        window.limparRoladorLocal(); 
    };

    function criarCard(pacote, animar = false) {
        const avatar = (pacote.avatar && !pacote.avatar.includes('R0lGODlhAQAB')) ? pacote.avatar : './assets/icon.jpg';
        const nomePersonagem = pacote.nome || 'Desconhecido';
        const timestamp = pacote.timestamp || new Date().toISOString();
        const dataFormatada = new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' - ' + new Date(timestamp).toLocaleDateString('pt-BR');

        let numerosRolados = "";
        const dadosParaDesenhar = pacote.rolagemCompleta || pacote.resultados; 
        
        if (dadosParaDesenhar && dadosParaDesenhar.length > 0) {
            const faces = dadosParaDesenhar.map(dado => dado.faceMecanica).join(', ');
            numerosRolados = ` - ROLOU: (${faces})`;
        }

        const rollGroup = document.createElement('div');
        rollGroup.className = 'flex flex-col w-full ' + (animar ? 'animate-fade-in py-4' : 'mb-1');

        let corBorda = 'border-gray-300 dark:border-gray-700';
        let corHover = 'group-hover:border-gray-400 dark:group-hover:border-gray-500';

        const meuNomeLocal = sessionStorage.getItem('usuarioNome');
        const meuPersonagemLocal = document.getElementById('nome') ? document.getElementById('nome').value.trim() : '';
        if (pacote.nome === meuNomeLocal || pacote.nome === meuPersonagemLocal) {
            corBorda = 'border-rpg-green/50 dark:border-green-800/50';
            corHover = 'group-hover:border-rpg-green dark:group-hover:border-green-600';
        }

        rollGroup.innerHTML = `
            <div class="flex items-start gap-2 w-full">
                <img src="${avatar}" class="w-10 h-10 rounded-full border border-gray-300 dark:border-gray-600 shadow-sm mt-1 bg-black object-cover flex-shrink-0">
                <div class="flex flex-col w-full overflow-hidden">
                    <span class="text-[15px] font-bold text-gray-500 dark:text-gray-400 mb-0.5 pl-1 truncate">${window.escaparHTML(nomePersonagem)}</span>

                    <div class="bg-white dark:bg-[#1a1a1a] border ${corBorda} rounded-lg p-3 shadow-sm flex flex-col group relative overflow-hidden transition-colors">
                        
                        <span class="text-[12px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest truncate mb-2" title="Rolagem: ${window.escaparHTML(pacote.input)}${numerosRolados}">
                            Rolagem: ${window.escaparHTML(pacote.input)} <span class="text-gray-500 dark:text-gray-600">${numerosRolados}</span>
                        </span>

                        <div class="sub-rolls-container flex flex-wrap gap-2 justify-center min-h-[45px]"></div>

                        <div class="bg-gray-50 dark:bg-[#0f172a] rounded p-1.5 text-center mt-3 border border-gray-100 dark:border-gray-800">
                            <span class="text-[10px] font-bold uppercase tracking-wide flex justify-center gap-2">
                                <span class="text-green-600 dark:text-green-500">${pacote.totais?.sucesso || 0} SUC</span>
                                <span class="text-gray-300 dark:text-gray-600">|</span>
                                <span class="text-rpg-red dark:text-red-500">${pacote.totais?.pressao || 0} PRE</span>
                                <span class="text-gray-300 dark:text-gray-600">|</span>
                                <span class="text-blue-600 dark:text-blue-500">${pacote.totais?.adaptacao || 0} ADA</span>
                            </span>
                        </div>

                        <div class="absolute inset-0 border-2 border-transparent ${corHover} rounded-lg pointer-events-none transition-colors duration-300"></div>
                    </div>

                    <span class="text-[13px] font-bold text-white dark:text-gray-600 text-right mt-1 mr-1">${dataFormatada}</span>
                </div>
            </div>
        `;

        const subRollsContainer = rollGroup.querySelector('.sub-rolls-container');
        const iconFilesAtuais = obterIconesAtuais();
        
        if (dadosParaDesenhar) {
            dadosParaDesenhar.forEach(dado => {
                const foiMantido = pacote.rolagemCompleta ? dado.selecionado : true;
                const subRollDiv = document.createElement('div');
                
                let estiloBase = 'relative rounded p-1 text-center min-w-[35px] flex flex-col items-center justify-center transition-all duration-300 ';
                
                if (foiMantido) {
                    estiloBase += 'bg-white dark:bg-[#242424] border-2 border-rpg-blue dark:border-rpg-red shadow-md scale-105 opacity-100 z-10';
                } else {
                    estiloBase += 'bg-gray-100 dark:bg-[#111111] border border-gray-300 dark:border-gray-700 opacity-50 scale-95 grayscale hover:grayscale-0 hover:opacity-100';
                }

                subRollDiv.className = estiloBase;
                subRollDiv.title = `${dado.tipo} rolou ${dado.faceMecanica} ${foiMantido ? '(Mantido)' : '(Descartado)'}`;

                const subRollIcons = document.createElement('div');
                subRollIcons.className = 'icons-container flex flex-wrap gap-0.5 justify-center items-center';

                if (dado.icones.includes('nada')) {
                    const img = document.createElement('img');
                    img.src = iconFilesAtuais['nada'];
                    img.className = 'w-[20px] h-[20px] object-contain opacity-100 visible';
                    subRollIcons.appendChild(img);
                } else {
                    dado.icones.forEach(iconName => {
                        const img = document.createElement('img');
                        img.src = iconFilesAtuais[iconName];
                        img.className = 'w-[20px] h-[20px] object-contain opacity-100 visible';
                        subRollIcons.appendChild(img);
                    });
                }

                subRollDiv.appendChild(subRollIcons);
                subRollsContainer.appendChild(subRollDiv);
            });
        }

        return { card: rollGroup };
    }

    function renderizarChat(pacote) {
        if (!resultsDiv || !historicoDiv) return;

        const emptyMsg = historicoDiv.querySelector('p.italic');
        if (emptyMsg) emptyMsg.remove();

        try {
            const { card } = criarCard(pacote, true);
            historicoDiv.prepend(card);
        } catch (e) {
            console.error("Falha ao renderizar card na tela:", e);
        }
        
        // 🔥 A CORREÇÃO DO BUG 2: Removido o resultsDiv.innerHTML = ''
        // Agora, se alguém rolar no meio da sua escolha, a sua bandeja fica lá, firme e forte!
    }

    async function verificarVinculoCampanha() {
        const telaAtual = sessionStorage.getItem('telaAtual');
        const charId = window.idPersonagemAtual || sessionStorage.getItem('personagemAtivoId') || new URLSearchParams(window.location.search).get('id');
        
        if (telaAtual !== 'ficha' || !charId) return;

        try {
            const isLocalhost = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
            const API = isLocalhost ? 'http://localhost:3000' : 'https://fichaassimilacaorpg.onrender.com';
            
            const res = await fetch(`${API}/personagens/obs/${charId}`);
            if (res.ok) {
                const char = await res.json();
                if (char.campanha_id) {
                    sessionStorage.setItem('campanhaAtivaFallback', char.campanha_id);
                    if (window.socket) {
                        window.socket.emit('entrar-na-campanha', {
                            campanhaId: char.campanha_id,
                            token: sessionStorage.getItem('token')
                        });
                    }
                } else {
                    sessionStorage.removeItem('campanhaAtivaFallback');
                }
            }
        } catch (e) {
            console.error("Erro no radar de vínculo de campanha:", e);
        }
    }

    function iniciarMultiplayer() {
        if (!window.socket) { setTimeout(iniciarMultiplayer, 50); return; }

        window.socket.off('nova-rolagem'); 
        window.socket.on('nova-rolagem', (pacoteDeDados) => {
            const campanhaAtiva = sessionStorage.getItem('campanhaAtiva') || sessionStorage.getItem('campanhaAtivaFallback');
            if (!campanhaAtiva || pacoteDeDados.campanhaId !== campanhaAtiva) return; 

            renderizarChat(pacoteDeDados);

            const panel = document.getElementById('game-log-sidebar');
            if (panel && panel.classList.contains('translate-x-full')) {
                if (typeof window.mostrarNotificacao === 'function') {
                    window.mostrarNotificacao(`Rolagem de ${pacoteDeDados.nome || 'alguém'}!`, 'aviso');
                }
            }
        });

        window.socket.off('carregar-historico'); 
        window.socket.on('carregar-historico', (historico) => {
            if (!historicoDiv) return;
            
            const campanhaAtiva = sessionStorage.getItem('campanhaAtiva') || sessionStorage.getItem('campanhaAtivaFallback');
            
            if (!campanhaAtiva) {
                historicoDiv.innerHTML = '<p class="text-center text-gray-500 text-xs italic font-bold mt-4">Terminal Local Ativo.<br>Acesse por uma campanha para ativar a rede multiplayer.</p>';
                return;
            }

            historicoDiv.innerHTML = '';
            
            if (!historico || historico.length === 0) {
                historicoDiv.innerHTML = '<p class="text-center text-gray-400 text-xs italic font-bold mt-4">O destino aguarda os dados...</p>';
                return;
            }

            historico.forEach(pacoteBruto => {
                try {
                    const pacote = typeof pacoteBruto === 'string' ? JSON.parse(pacoteBruto) : pacoteBruto;
                    const meuNomeLocal = sessionStorage.getItem('usuarioNome');
                    const meuPersonagemLocal = document.getElementById('nome') ? document.getElementById('nome').value.trim() : '';
                    
                    const souMestre = sessionStorage.getItem('isMestreAtivo') === 'true';
                    const meuId = sessionStorage.getItem('usuarioId');
                    const fuiEuQuemRolou = (pacote.usuarioId === meuId) || (!pacote.usuarioId && (pacote.nome === meuNomeLocal || pacote.nome === meuPersonagemLocal));

                    if (!souMestre && !fuiEuQuemRolou && pacote.isMestre && !pacote.isRolagemPublica) return; 

                    const { card } = criarCard(pacote, false);
                    
                    // 🔥 CORREÇÃO DO BUG 1: Usando append para renderizar de cima pra baixo (mais novos embaixo/em cima conforme a consulta DESC)
                    historicoDiv.append(card); 
                } catch (err) {
                    console.error("Erro ao desenhar bloco antigo:", err);
                }
            });
        });
    }
    
    iniciarMultiplayer();

    if (rollButton) rollButton.addEventListener('click', handleRoll);
    if (inputDados) inputDados.addEventListener('keypress', (event) => { if (event.key === 'Enter') handleRoll(); });
   
    const labelsAptidoes = document.querySelectorAll('.aptidao-box label');
    let avisoAssimilada = document.getElementById('aviso-assimilada');
    const containerAviso = document.getElementById('aviso-assimilada-container');
    
    if (!avisoAssimilada && containerAviso) {
        avisoAssimilada = document.createElement('div');
        avisoAssimilada.id = 'aviso-assimilada';
        avisoAssimilada.className = 'hidden w-full text-center text-rpg-red dark:text-red-500 font-black font-rpg text-sm mb-2 animate-pulse uppercase tracking-widest bg-red-100 dark:bg-red-900/30 p-1 rounded border border-red-500 shadow-sm';
        avisoAssimilada.innerHTML = '<i data-lucide="flame" class="w-4 h-4 inline-block align-text-bottom"></i> Rolagem Assimilada <i data-lucide="flame" class="w-4 h-4 inline-block align-text-bottom"></i>';
        containerAviso.appendChild(avisoAssimilada);
        if (window.lucide) lucide.createIcons();
    }

    window.limparRoladorLocal = function() {
        if (inputDados) inputDados.value = '';
        labelsAptidoes.forEach(lbl => {
            lbl.classList.remove('label-selecionado', 'ring-2', 'ring-rpg-red', 'ring-offset-2', 'dark:ring-offset-[#1a1a1a]');
            lbl.removeAttribute('data-clicks');
        });
        if (avisoAssimilada) avisoAssimilada.classList.add('hidden');
        window.rolagemPendente = null;
        if(resultsDiv) resultsDiv.innerHTML = '';
    }

    const sidebarLog = document.getElementById('game-log-sidebar');
    if (sidebarLog) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    const isFechado = sidebarLog.classList.contains('translate-x-full');
                    if (isFechado) {
                        window.limparRoladorLocal(); 
                        document.body.classList.remove('terminal-open'); 
                    } else {
                        document.body.classList.add('terminal-open'); 
                        if (typeof verificarVinculoCampanha === 'function') verificarVinculoCampanha(); 
                    }
                }
            });
        });
        observer.observe(sidebarLog, { attributes: true });
    }

    function recalcularRolagemInput() {
        if (!inputDados) return;

        const selecionados = document.querySelectorAll('.aptidao-box label.label-selecionado');
        let instintos = [];
        let outrasAptidoes = [];
        let contadorDeMarcacoes = 0; 

        selecionados.forEach(lbl => {
            const box = lbl.closest('.aptidao-box');
            const dots = box.querySelectorAll('input[type="checkbox"]:checked').length;
            
            if (box.closest('#secao-instintos')) {
                let clicks = parseInt(lbl.getAttribute('data-clicks') || '1');
                contadorDeMarcacoes += clicks; 
                for(let i = 0; i < clicks; i++) {
                    instintos.push(dots);
                }
            } else {
                contadorDeMarcacoes += 1; 
                outrasAptidoes.push(dots);
            }
        });

        let isAssimilada = false;
        
        if (instintos.length >= 2) {
            isAssimilada = true;
            document.querySelectorAll('.aptidao-box label.label-selecionado').forEach(lbl => {
                if (!lbl.closest('#secao-instintos')) {
                    lbl.classList.remove('label-selecionado');
                }
            });
            outrasAptidoes = []; 
        }

        let partes = [];
        if (isAssimilada) {
            if (avisoAssimilada) avisoAssimilada.classList.remove('hidden');
            instintos.forEach(dots => partes.push(`${dots}d12`));
        } else {
            if (avisoAssimilada) avisoAssimilada.classList.add('hidden');
            instintos.forEach(dots => partes.push(`${dots}d6`));
            outrasAptidoes.forEach(dots => partes.push(`${dots}d10`));
        }

        inputDados.value = partes.join(' '); 

        if (partes.length > 0) {
            inputDados.classList.add('ring-2', 'ring-rpg-red');
            setTimeout(() => inputDados.classList.remove('ring-2', 'ring-rpg-red'), 200);
        }

        if (contadorDeMarcacoes >= 2 && sidebarLog) {
            if (sidebarLog.classList.contains('translate-x-full')) {
                sidebarLog.classList.remove('translate-x-full');
            }
        }
    }

    labelsAptidoes.forEach(label => {
        label.addEventListener('click', function() {
            const box = this.closest('.aptidao-box');
            const checkedCount = box.querySelectorAll('input[type="checkbox"]:checked').length;
            if (checkedCount === 0) return; 

            const isInstinto = box.closest('#secao-instintos') !== null;

            if (isInstinto) {
                if (!this.classList.contains('label-selecionado')) {
                    this.classList.add('label-selecionado');
                    this.setAttribute('data-clicks', '1');
                } else {
                    let clicks = parseInt(this.getAttribute('data-clicks') || '1');
                    if (clicks === 1) {
                        this.setAttribute('data-clicks', '2');
                        this.classList.add('ring-2', 'ring-rpg-red', 'ring-offset-2', 'dark:ring-offset-[#1a1a1a]');
                    } else {
                        this.classList.remove('label-selecionado', 'ring-2', 'ring-rpg-red', 'ring-offset-2', 'dark:ring-offset-[#1a1a1a]');
                        this.removeAttribute('data-clicks');
                    }
                }
            } else {
                if (!this.classList.contains('label-selecionado')) {
                    document.querySelectorAll('.aptidao-box label.label-selecionado').forEach(lbl => {
                        if (!lbl.closest('#secao-instintos')) {
                            lbl.classList.remove('label-selecionado');
                        }
                    });
                    this.classList.add('label-selecionado');
                } else {
                    this.classList.remove('label-selecionado');
                }
            }
            
            recalcularRolagemInput();
        });
    });

    if (clearButton) {
        clearButton.addEventListener('click', () => {
            if (resultsDiv) resultsDiv.innerHTML = '';
            if (historicoDiv) historicoDiv.innerHTML = '<p class="text-center text-gray-400 text-xs italic font-bold">O destino aguarda os dados...</p>';
            
            const inputFiltroHistorico = document.getElementById('filtro-historico');
            if (inputFiltroHistorico) inputFiltroHistorico.value = '';
            
            window.limparRoladorLocal(); 
        });
    }

    const inputFiltroHistorico = document.getElementById('filtro-historico');
    if (inputFiltroHistorico) {
        inputFiltroHistorico.addEventListener('input', (e) => {
            const termoBusca = e.target.value.toLowerCase().trim();
            const rolagensSalvas = historicoDiv.children;

            Array.from(rolagensSalvas).forEach(caixaDeRolagem => {
                if (caixaDeRolagem.tagName.toLowerCase() === 'p') return; 

                const nomeSpan = caixaDeRolagem.querySelector('span.truncate');
                const rolagemSpan = caixaDeRolagem.querySelector('.tracking-widest');
                
                let texto = '';
                if (nomeSpan) texto += nomeSpan.textContent.toLowerCase() + ' ';
                if (rolagemSpan) texto += rolagemSpan.textContent.toLowerCase();

                if (texto.includes(termoBusca)) {
                    caixaDeRolagem.style.display = 'flex';
                } else {
                    caixaDeRolagem.style.display = 'none';
                }
            });
        });
    }
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes logoGiraEntra {
            0% { transform: translate(-50%, -50%) rotate(0deg) scale(0); opacity: 0; }
            50% { transform: translate(-50%, -50%) rotate(720deg) scale(1.2); opacity: 1; }
            100% { transform: translate(-50%, -50%) rotate(1080deg) scale(1); opacity: 1; }
        }
        @keyframes fadeSumi {
            to { opacity: 0; visibility: hidden; }
        }
        .logo-animado {
            animation: logoGiraEntra 1s cubic-bezier(0.17, 0.89, 0.32, 1.28) forwards, fadeSumi 0.3s ease-out forwards;
            animation-delay: 0s, 1s;
        }
        @keyframes rolarAnimado {
            0% { transform: rotate(-540deg) scale(0.1); opacity: 0; }
            50% { transform: rotate(20deg) scale(1.2); opacity: 1; }
            100% { transform: rotate(0deg) scale(1); visibility: visible; }
        }
        .dado-animado {
            animation: rolarAnimado 0.6s cubic-bezier(0.17, 0.89, 0.32, 1.28) forwards;
            opacity: 0;
        }
        .label-selecionado {
            transform: scale(0.95) !important;
            filter: brightness(1.3) !important;
            box-shadow: inset 0 0 0 2px #ffffff, 0 0 10px rgba(255, 255, 255, 0.5) !important;
        }
        .dark .label-selecionado {
            box-shadow: inset 0 0 0 2px #f97316, 0 0 10px rgba(249, 115, 22, 0.5) !important;
        }

        #main-content, .modal-content {
            transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important; 
        }
        
        @media (min-width: 1400px) {
            body.terminal-open #main-content {
                transform: translateX(-190px) !important;
            }
            body.terminal-open .modal.show .modal-content {
                transform: translateX(-190px) scale(1) !important;
            }
        }

        @media (min-width: 1024px) and (max-width: 1399px) {
            body.terminal-open #main-content {
                transform: translateX(-100px) !important;
            }
            body.terminal-open .modal.show .modal-content {
                transform: translateX(-100px) scale(1) !important;
            }
        }
    `;
    document.head.appendChild(style);
});