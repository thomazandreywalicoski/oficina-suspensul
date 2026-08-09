// ============================================================================
// Módulo de Devolução de Produtos / Peças — Focus NFe Integration
// ============================================================================

(function() {
    'use strict';

    let devolucoesLista = [];
    let itensNotaOriginal = [];
    let dadosNotaOriginal = {};

    // Helper de Formatação de Moeda
    function fmtBRL(v) {
        const n = Number(v || 0);
        return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtDataBR(iso) {
        if (!iso) return '-';
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    // Carregar Lista de Devoluções
    window.carregarDevolucoes = async function() {
        const tbody = document.getElementById('devolucao-tabela-body');
        if (!tbody) return;
        
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 25px; color: #64748b;">Carregando devoluções...</td></tr>`;

        try {
            const res = await fetch('/api/devolucao/listar');
            const data = await res.json();

            if (!data.sucesso) {
                throw new Error(data.erro || 'Erro ao carregar devoluções');
            }

            devolucoesLista = data.devolucoes || [];
            renderizarTabelaDevolucoes(devolucoesLista);
            atualizarKpisDevolucao(devolucoesLista);
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #dc2626;">${err.message}</td></tr>`;
        }
    };

    function atualizarKpisDevolucao(lista) {
        let autorizadas = 0, processando = 0, rejeitadas = 0, rascunhos = 0;
        
        lista.forEach(item => {
            if (item.status === 'AUTORIZADA') autorizadas++;
            else if (item.status === 'PROCESSANDO' || item.status === 'ENVIANDO') processando++;
            else if (item.status === 'REJEITADA' || item.status === 'ERRO') rejeitadas++;
            else if (item.status === 'RASCUNHO') rascunhos++;
        });

        if (document.getElementById('kpi-autorizadas')) document.getElementById('kpi-autorizadas').innerText = autorizadas;
        if (document.getElementById('kpi-processando')) document.getElementById('kpi-processando').innerText = processando;
        if (document.getElementById('kpi-rejeitadas')) document.getElementById('kpi-rejeitadas').innerText = rejeitadas;
        if (document.getElementById('kpi-rascunhos')) document.getElementById('kpi-rascunhos').innerText = rascunhos;
    }

    function renderizarTabelaDevolucoes(lista) {
        const tbody = document.getElementById('devolucao-tabela-body');
        if (!tbody) return;

        if (!lista || lista.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted, #888888);">Nenhuma nota encontrada</td></tr>`;
            return;
        }

        let html = '';
        lista.forEach(item => {
            let statusBadge = '';
            if (item.status === 'AUTORIZADA') {
                statusBadge = `<span class="badge" style="background: #dcfce7; color: #15803d; padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 0.75rem;">AUTORIZADA</span>`;
            } else if (item.status === 'PROCESSANDO' || item.status === 'ENVIANDO') {
                statusBadge = `<span class="badge" style="background: #fef3c7; color: #b45309; padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 0.75rem;">PROCESSANDO</span>`;
            } else if (item.status === 'REJEITADA' || item.status === 'ERRO') {
                statusBadge = `<span class="badge" style="background: #fee2e2; color: #b91c1c; padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 0.75rem;">REJEITADA</span>`;
            } else if (item.status === 'CANCELADA') {
                statusBadge = `<span class="badge" style="background: #f1f5f9; color: #475569; padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 0.75rem;">CANCELADA</span>`;
            } else {
                statusBadge = `<span class="badge" style="background: #e2e8f0; color: #334155; padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 0.75rem;">RASCUNHO</span>`;
            }

            // Botões de Ações (Somente Ícones em containers separados)
            let acoesHtml = '';
            if (item.status === 'AUTORIZADA') {
                acoesHtml = `
                    <div style="display: flex; gap: 8px; justify-content: center; align-items: center;" class="actions-cell">
                        ${item.danfe_url ? `<a href="${item.danfe_url}" target="_blank" class="btn-icon btn-action-blue" title="DANFE"><i data-lucide="file-text"></i></a>` : ''}
                        ${item.xml_url ? `<a href="${item.xml_url}" target="_blank" class="btn-icon btn-action-purple" title="XML"><i data-lucide="download"></i></a>` : ''}
                        <button class="btn-icon btn-action-red" onclick="abrirModalCancelamentoDevolucao(${item.id})" title="Cancelar NF-e"><i data-lucide="x-circle"></i></button>
                    </div>
                `;
            } else if (item.status === 'PROCESSANDO' || item.status === 'ENVIANDO') {
                acoesHtml = `
                    <div style="display: flex; gap: 8px; justify-content: center; align-items: center;" class="actions-cell">
                        <button class="btn-icon btn-action-blue" onclick="consultarStatusDevolucao(${item.id})" title="Atualizar Status"><i data-lucide="refresh-cw"></i></button>
                    </div>
                `;
            } else {
                // Rascunho / Rejeitada / Erro: Botão de Editar (amarelo), Emitir (verde), Excluir (vermelho)
                acoesHtml = `
                    <div style="display: flex; gap: 8px; justify-content: center; align-items: center;" class="actions-cell">
                        <button class="btn-icon btn-action-yellow" onclick="editarDevolucao(${item.id})" title="Editar Devolução"><i data-lucide="edit-3"></i></button>
                        <button class="btn-icon btn-action-green" onclick="emitirDevolucaoDireta(${item.id})" title="Emitir NF-e"><i data-lucide="send"></i></button>
                        <button class="btn-icon btn-action-red" onclick="excluirDevolucao(${item.id})" title="Excluir Rascunho"><i data-lucide="trash-2"></i></button>
                    </div>
                `;
            }

            html += `
                <tr style="border-bottom: 1px solid #1f1f1f;">
                    <td style="padding: 12px 16px; text-align: center;">
                        <div style="font-weight: 600; color: var(--text-muted, #888888); font-size: 13px;">${item.ref}</div>
                        <div style="font-size: 11px; color: var(--text-muted, #888888);">${fmtDataBR(item.criado_em)}</div>
                    </td>
                    <td style="padding: 12px 16px; text-align: center;">
                        <div style="font-weight: 600; color: var(--text-muted, #888888); font-size: 13px;">${item.nome_fornecedor || 'Não informado'}</div>
                        <div style="font-size: 11px; color: var(--text-muted, #888888);">${item.cnpj_fornecedor || '-'}</div>
                    </td>
                    <td style="padding: 12px 16px; text-align: center;">
                        <div style="font-size: 12px; color: var(--text-muted, #888888);" title="${item.chave_nfe_original || ''}">
                            ${item.chave_nfe_original ? item.chave_nfe_original.substring(0, 20) + '...' : '-'}
                        </div>
                    </td>
                    <td style="padding: 12px 16px; text-align: center;">
                        <span style="font-weight: 700; color: #22c55e; font-size: 14px;">${fmtBRL(item.valor_total)}</span>
                    </td>
                    <td style="padding: 12px 16px; text-align: center;">${statusBadge}</td>
                    <td style="padding: 12px 16px; text-align: center;">
                        ${acoesHtml}
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) lucide.createIcons();
    }

    window.filtrarDevolucoes = function() {
        const buscaEl = document.getElementById('devolucao-busca');
        const busca = buscaEl ? (buscaEl.value || '').toLowerCase() : '';
        const filterStEl = document.getElementById('devolucao-filtro-status');
        const st = filterStEl ? filterStEl.value : '';

        const filtrados = devolucoesLista.filter(item => {
            const matchSt = !st || item.status === st;
            const matchBusca = !busca || 
                (item.ref && item.ref.toLowerCase().includes(busca)) ||
                (item.nome_fornecedor && item.nome_fornecedor.toLowerCase().includes(busca)) ||
                (item.cnpj_fornecedor && item.cnpj_fornecedor.includes(busca)) ||
                (item.chave_nfe_original && item.chave_nfe_original.includes(busca));
            return matchSt && matchBusca;
        });

        renderizarTabelaDevolucoes(filtrados);
    };


    // --- Navegação Multi-Passos (Wizard) ---
    let currentStep = 1;

    window.irParaPassoDevolucao = function(step) {
        // Validação ao avançar do passo 1
        if (step >= 2) {
            const chave = (document.getElementById('dev-chave-original').value || '').trim();
            const temItens = document.querySelectorAll('#dev-itens-body tr input.item-cprod').length > 0;
            if ((!chave || chave.length !== 44) && !temItens) {
                alert('Por favor, informe uma chave de acesso válida (44 dígitos) ou busque a NF-e original antes de avançar.');
                return;
            }
        }

        // Validação ao avançar do passo 2
        if (step >= 3) {
            const checked = document.querySelectorAll('#dev-itens-body tr input.item-select:checked');
            if (checked.length === 0) {
                alert('Selecione pelo menos um item para devolução antes de avançar.');
                return;
            }
        }

        currentStep = step;

        // Ocultar/Exibir conteúdos dos passos
        const step1 = document.getElementById('dev-step-1');
        const step2 = document.getElementById('dev-step-2');
        const step3 = document.getElementById('dev-step-3');

        if (step1) step1.style.display = (step === 1) ? 'block' : 'none';
        if (step2) step2.style.display = (step === 2) ? 'block' : 'none';
        if (step3) step3.style.display = (step === 3) ? 'block' : 'none';

        // Atualizar Stepper Pills Header
        for (let i = 1; i <= 3; i++) {
            const pill = document.getElementById(`step-indicator-${i}`);
            if (!pill) continue;
            const badge = pill.querySelector('span:first-child');
            const label = pill.querySelector('span:last-child');
            if (i === step) {
                pill.style.background = 'var(--primary, #ffe54c)';
                pill.style.color = '#000000';
                pill.style.fontWeight = '800';
                if (label) label.style.color = '#000000';
                if (badge) {
                    badge.style.background = '#000000';
                    badge.style.color = 'var(--primary, #ffe54c)';
                }
            } else {
                pill.style.background = '#222222';
                pill.style.color = '#888888';
                pill.style.fontWeight = '600';
                if (label) label.style.color = '#888888';
                if (badge) {
                    badge.style.background = '#333333';
                    badge.style.color = '#ffffff';
                }
            }
        }

        // Botões no Footer
        const btnPrev = document.getElementById('btn-step-prev');
        const btnNext = document.getElementById('btn-step-next');
        const btnRascunho = document.getElementById('btn-salvar-rascunho');
        const btnEmitir = document.getElementById('btn-emitir-nfe');
        const footerLeft = document.getElementById('dev-footer-left');
        const footerCenter = document.getElementById('dev-footer-center');

        if (step === 1) {
            if (btnPrev) btnPrev.style.display = 'none';
            if (btnNext) {
                btnNext.style.display = 'inline-flex';
                btnNext.innerHTML = `<i data-lucide="chevron-right" style="width: 20px; height: 20px;"></i>`;
                if (footerCenter && btnNext.parentNode !== footerCenter) footerCenter.appendChild(btnNext);
            }
            if (btnRascunho) btnRascunho.style.display = 'none';
            if (btnEmitir) btnEmitir.style.display = 'none';
        } else if (step === 2) {
            if (btnPrev) {
                btnPrev.style.display = 'inline-flex';
                if (footerCenter && btnPrev.parentNode !== footerCenter) footerCenter.insertBefore(btnPrev, btnNext);
            }
            if (btnNext) {
                btnNext.style.display = 'inline-flex';
                btnNext.innerHTML = `<i data-lucide="chevron-right" style="width: 20px; height: 20px;"></i>`;
            }
            if (btnRascunho) btnRascunho.style.display = 'none';
            if (btnEmitir) btnEmitir.style.display = 'none';
        } else if (step === 3) {
            if (btnPrev) {
                btnPrev.style.display = 'inline-flex';
                if (footerLeft && btnPrev.parentNode !== footerLeft) footerLeft.appendChild(btnPrev);
            }
            if (btnNext) btnNext.style.display = 'none';
            if (btnRascunho) btnRascunho.style.display = 'inline-flex';
            if (btnEmitir) btnEmitir.style.display = 'inline-flex';
        }

        if (window.lucide) lucide.createIcons();
    };

    window.stepProximoDevolucao = function() {
        if (currentStep < 3) {
            window.irParaPassoDevolucao(currentStep + 1);
        }
    };

    window.stepAnteriorDevolucao = function() {
        if (currentStep > 1) {
            window.irParaPassoDevolucao(currentStep - 1);
        }
    };

    // Modal Nova Devolução
    window.abrirModalNovaDevolucao = function() {
        document.getElementById('dev-id').value = '';
        document.getElementById('dev-chave-original').value = '';
        document.getElementById('dev-xml-file').value = '';
        if (document.getElementById('label-xml-file')) document.getElementById('label-xml-file').innerText = 'Fazer upload do arquivo';
        
        const blocoF = document.getElementById('dev-bloco-fornecedor');
        if (blocoF) blocoF.style.display = 'none';

        document.getElementById('dev-natureza-operacao').value = 'Devolução de Mercadoria';
        document.getElementById('dev-cfop-padrao').value = '5202';
        document.getElementById('dev-modalidade-frete').value = '9';
        document.getElementById('dev-observacoes').value = 'Devolução referente à NF-e de compra';
        document.getElementById('dev-val-frete').value = '0.00';
        document.getElementById('dev-val-desconto').value = '0.00';
        document.getElementById('dev-val-outras').value = '0.00';
        
        itensNotaOriginal = [];
        dadosNotaOriginal = {};
        renderizarTabelaItens([]);

        document.getElementById('modal-devolucao-titulo').innerText = 'Nova Devolução de Produtos';
        window.irParaPassoDevolucao(1);

        if (typeof openModal === 'function') openModal('modal-devolucao');
        else if (window.openModal) window.openModal('modal-devolucao');
    };

    window.editarDevolucao = async function(id) {
        try {
            const res = await fetch(`/api/devolucao/${id}`);
            const data = await res.json();
            if (!data.sucesso) throw new Error(data.erro);

            const dev = data.devolucao;
            document.getElementById('dev-id').value = dev.id;
            document.getElementById('dev-chave-original').value = dev.chave_nfe_original || '';
            document.getElementById('dev-natureza-operacao').value = dev.natureza_operacao || 'Devolução de Mercadoria';
            document.getElementById('dev-cfop-padrao').value = dev.cfop_padrao || '5202';
            document.getElementById('dev-modalidade-frete').value = dev.modalidade_frete || '9';
            document.getElementById('dev-observacoes').value = dev.observacoes || `Devolução referente à NF-e de compra nº ${dev.numero_nfe_original || ''}`;
            document.getElementById('dev-val-frete').value = dev.valor_frete || '0.00';
            document.getElementById('dev-val-desconto').value = dev.valor_desconto || '0.00';
            document.getElementById('dev-val-outras').value = dev.valor_outras_despesas || '0.00';

            const savedItems = dev.items || [];
            let allItems = savedItems;
            if (dev.dados_original && (dev.dados_original.items || dev.dados_original.produtos)) {
                allItems = dev.dados_original.items || dev.dados_original.produtos;
            }

            renderizarTabelaItens(allItems, savedItems);
            document.getElementById('modal-devolucao-titulo').innerText = `Editar Devolução (${dev.ref || 'Ref ' + dev.id})`;
            window.irParaPassoDevolucao(1);
            if (typeof openModal === 'function') openModal('modal-devolucao');
        } catch (err) {
            alert('Erro ao carregar devolução: ' + err.message);
        }
    };


    window.consultarNfeOriginal = async function() {
        const chave = (document.getElementById('dev-chave-original').value || '').trim();
        if (!chave || chave.length !== 44) {
            alert('Por favor, informe uma chave de acesso com 44 dígitos numéricos.');
            return;
        }

        const btn = document.getElementById('btn-consultar-nfe');
        if (btn) btn.disabled = true;

        if (typeof openModal === 'function') openModal('modal-loading-devolucao');

        const delayPromise = new Promise(resolve => setTimeout(resolve, 5000));
        const fetchPromise = fetch('/api/devolucao/consultar-original', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chave })
        }).then(r => r.json());

        try {
            const [_, data] = await Promise.all([delayPromise, fetchPromise]);
            if (typeof closeModal === 'function') closeModal('modal-loading-devolucao');

            if (!data || !data.sucesso) {
                alert(data?.erro || 'NF-e não encontrada. Verifique a chave digitada ou tente importar o arquivo XML.');
                return;
            }

            preencherDadosNotaOriginal(data.dados);
        } catch (err) {
            if (typeof closeModal === 'function') closeModal('modal-loading-devolucao');
            alert('Não foi possível consultar a NF-e. Nota não encontrada.');
        } finally {
            if (btn) btn.disabled = false;
            if (window.lucide) lucide.createIcons();
        }
    };

    window.importarXmlOriginal = async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];

        if (document.getElementById('label-xml-file')) {
            document.getElementById('label-xml-file').innerText = file.name;
        }

        if (typeof openModal === 'function') openModal('modal-loading-devolucao');

        const formData = new FormData();
        formData.append('xml_file', file);

        const delayPromise = new Promise(resolve => setTimeout(resolve, 5000));
        const fetchPromise = fetch('/api/devolucao/importar-xml', {
            method: 'POST',
            body: formData
        }).then(r => r.json());

        try {
            const [_, data] = await Promise.all([delayPromise, fetchPromise]);
            if (typeof closeModal === 'function') closeModal('modal-loading-devolucao');

            if (!data || !data.sucesso) {
                alert(data?.erro || 'Não foi possível importar o arquivo XML. Nota não encontrada.');
                return;
            }

            preencherDadosNotaOriginal(data.dados);
        } catch (err) {
            if (typeof closeModal === 'function') closeModal('modal-loading-devolucao');
            alert('Erro ao importar XML: Nota não encontrada.');
        }
    };

    function preencherDadosNotaOriginal(dados) {
        dadosNotaOriginal = dados || {};
        if (dados.chave_acesso) {
            document.getElementById('dev-chave-original').value = dados.chave_acesso;
        }

        const numNota = dados.numero_nota || dados.nNF || dados.numero || '';
        const obsEl = document.getElementById('dev-observacoes');
        if (obsEl) {
            obsEl.value = numNota ? `Devolução referente à NF-e de compra nº ${numNota}` : `Devolução referente à NF-e de compra`;
        }

        const itens = dados.items || dados.produtos || [];
        renderizarTabelaItens(itens);

        // Avançar automaticamente para a etapa de seleção das peças (Passo 2)
        window.irParaPassoDevolucao(2);
    }


    function renderizarTabelaItens(itens, savedItems = null) {
        const tbody = document.getElementById('dev-itens-body');
        if (!tbody) return;

        if (!itens || itens.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 25px; color: #888888;">Nenhum item na nota.</td></tr>`;
            recalcularTotaisDevolucao();
            return;
        }

        let html = '';
        itens.forEach((it, idx) => {
            const qtdOrig = Number(it.quantidade_original || it.qCom || 1);
            const vUnit = Number(it.valor_unitario || it.vUnCom || 0);
            const cfop = it.cfop || (document.getElementById('dev-cfop-padrao') ? document.getElementById('dev-cfop-padrao').value : '5202') || '5202';
            const ncm = it.ncm || it.codigo_ncm || '';
            const desc = it.descricao || it.xProd || '';
            const cProd = it.codigo_produto || it.cProd || `ITEM${idx+1}`;

            let isChecked = false;
            let qtdDev = qtdOrig;

            if (savedItems && savedItems.length > 0) {
                const match = savedItems.find(s => 
                    (s.codigo_produto && s.codigo_produto === cProd) || 
                    (s.cProd && s.cProd === cProd) || 
                    (s.descricao && s.descricao === desc)
                );
                if (match) {
                    isChecked = true;
                    qtdDev = Number(match.quantidade_devolvida || match.qtdDev || qtdOrig);
                }
            }

            html += `
                <tr id="row-item-${idx}" style="border-bottom: 1px solid #262626;">
                    <td style="text-align: center; padding: 8px;">
                        <input type="checkbox" class="item-select" data-idx="${idx}" ${isChecked ? 'checked' : ''} onchange="recalcularTotaisDevolucao()" style="accent-color: var(--primary, #ffe54c); width: 18px; height: 18px; cursor: pointer;">
                    </td>
                    <td style="padding: 8px;">
                        <input type="text" class="form-input item-cprod" data-idx="${idx}" value="${cProd}" style="font-size: 0.85rem; text-align: center; background: #202020; color: #ffffff; border: none; border-radius: 6px; padding: 6px 8px; width: 100%; box-sizing: border-box;">
                    </td>
                    <td style="padding: 8px;">
                        <input type="text" class="form-input item-desc" data-idx="${idx}" value="${desc}" placeholder="Descrição do produto" style="font-size: 0.85rem; text-align: left; background: #202020; color: #ffffff; border: none; border-radius: 6px; padding: 6px 8px; width: 100%; box-sizing: border-box;">
                    </td>
                    <td style="padding: 8px;">
                        <input type="text" class="form-input item-ncm" data-idx="${idx}" value="${ncm}" placeholder="NCM" style="font-size: 0.85rem; text-align: center; background: #202020; color: #ffffff; border: none; border-radius: 6px; padding: 6px 8px; width: 100%; box-sizing: border-box;">
                    </td>
                    <td style="padding: 8px;">
                        <input type="text" class="form-input item-cfop" data-idx="${idx}" value="${cfop}" style="font-size: 0.85rem; text-align: center; background: #202020; color: #ffffff; border: none; border-radius: 6px; padding: 6px 8px; width: 100%; box-sizing: border-box;">
                    </td>
                    <td style="text-align: center; padding: 8px; font-weight: 600; color: #ffffff;">
                        <span class="item-qtd-orig" data-idx="${idx}">${qtdOrig}</span>
                    </td>
                    <td style="padding: 8px;">
                        <input type="number" step="0.01" max="${qtdOrig}" class="form-input item-qtd-dev" data-idx="${idx}" value="${qtdDev}" onchange="recalcularTotaisDevolucao()" style="text-align: center; font-weight: 700; font-size: 0.9rem; background: var(--primary, #ffe54c); color: #000000; border: none; border-radius: 6px; padding: 6px 4px; width: 100%; box-sizing: border-box;">
                    </td>
                    <td style="padding: 8px;">
                        <input type="number" step="0.01" class="form-input item-vunit" data-idx="${idx}" value="${vUnit.toFixed(2)}" onchange="recalcularTotaisDevolucao()" style="text-align: center; font-size: 0.85rem; background: #202020; color: #ffffff; border: none; border-radius: 6px; padding: 6px 8px; width: 100%; box-sizing: border-box;">
                    </td>
                    <td style="padding: 8px; text-align: center; font-weight: 700;">
                        <span class="item-subtotal" id="subtotal-${idx}" style="color: #22c55e; font-weight: 700; font-size: 0.9rem;">${fmtBRL((isChecked ? qtdDev : 0) * vUnit)}</span>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        recalcularTotaisDevolucao();
    }

        tbody.innerHTML = html;
        recalcularTotaisDevolucao();
    }

    window.adicionarItemManual = function() {
        const tbody = document.getElementById('dev-itens-body');
        const idx = tbody.querySelectorAll('tr').length;
        
        const tr = document.createElement('tr');
        tr.id = `row-item-${idx}`;
        tr.style.borderBottom = '1px solid #f1f5f9';
        tr.innerHTML = `
            <td style="text-align: center; padding: 6px;">
                <input type="checkbox" class="item-select" data-idx="${idx}" checked onchange="recalcularTotaisDevolucao()">
            </td>
            <td style="padding: 6px;">
                <input type="text" class="form-input item-cprod" data-idx="${idx}" value="PECA${idx+1}" style="font-size: 0.75rem; width: 80px; display: inline-block;">
                <input type="text" class="form-input item-desc" data-idx="${idx}" value="PEÇA DEVOLVIDA" placeholder="Descrição do produto" style="font-size: 0.8rem; width: calc(100% - 90px); display: inline-block;">
            </td>
            <td style="padding: 6px;">
                <input type="text" class="form-input item-ncm" data-idx="${idx}" value="87083090" placeholder="NCM" style="font-size: 0.8rem;">
            </td>
            <td style="padding: 6px;">
                <input type="text" class="form-input item-cfop" data-idx="${idx}" value="5202" style="font-size: 0.8rem;">
            </td>
            <td style="text-align: center; padding: 6px; font-weight: 600;">
                <span class="item-qtd-orig" data-idx="${idx}">1</span>
            </td>
            <td style="padding: 6px;">
                <input type="number" step="0.01" class="form-input item-qtd-dev" data-idx="${idx}" value="1" onchange="recalcularTotaisDevolucao()" style="text-align: center; font-weight: 600; font-size: 0.8rem;">
            </td>
            <td style="padding: 6px;">
                <input type="number" step="0.01" class="form-input item-vunit" data-idx="${idx}" value="100.00" onchange="recalcularTotaisDevolucao()" style="text-align: right; font-size: 0.8rem;">
            </td>
            <td style="padding: 6px; text-align: right; font-weight: 700; color: #0f172a;">
                <span class="item-subtotal" id="subtotal-${idx}">${fmtBRL(100)}</span>
            </td>
        `;
        tbody.appendChild(tr);
        recalcularTotaisDevolucao();
    };

    window.recalcularTotaisDevolucao = function() {
        let totalProd = 0;
        const rows = document.querySelectorAll('#dev-itens-body tr');

        rows.forEach(tr => {
            const chk = tr.querySelector('.item-select');
            const idx = chk ? chk.getAttribute('data-idx') : null;
            const subtotalSpan = document.getElementById(`subtotal-${idx}`);
            if (chk && chk.checked) {
                const qtdInput = tr.querySelector('.item-qtd-dev');
                const vunitInput = tr.querySelector('.item-vunit');

                const qtd = Number(qtdInput ? qtdInput.value : 0);
                const vunit = Number(vunitInput ? vunitInput.value : 0);
                const subtotal = qtd * vunit;

                if (subtotalSpan) subtotalSpan.innerText = fmtBRL(subtotal);
                totalProd += subtotal;
            } else if (subtotalSpan) {
                subtotalSpan.innerText = fmtBRL(0);
            }
        });

        const frete = Number(document.getElementById('dev-val-frete').value || 0);
        const desconto = Number(document.getElementById('dev-val-desconto').value || 0);
        const outras = Number(document.getElementById('dev-val-outras').value || 0);
        const totalNfe = Math.max(0, totalProd + frete + outras - desconto);

        document.getElementById('res-val-produtos').innerText = fmtBRL(totalProd);
        document.getElementById('res-val-total').innerText = fmtBRL(totalNfe);
    };

    function extrairPayloadFormulario() {
        const id = document.getElementById('dev-id').value;
        const chaveOrig = (document.getElementById('dev-chave-original').value || '').trim();
        
        const elNome = document.getElementById('dev-fornecedor-nome');
        const elCnpj = document.getElementById('dev-fornecedor-cnpj');
        const elNota = document.getElementById('dev-nota-numero');

        const fornNome = elNome ? elNome.innerText : (dadosNotaOriginal.nome_emitente || dadosNotaOriginal.nome_fornecedor || '');
        const fornCnpj = elCnpj ? elCnpj.innerText : (dadosNotaOriginal.cnpj_emitente || dadosNotaOriginal.cnpj_fornecedor || '');
        const notaStr = elNota ? elNota.innerText : `${dadosNotaOriginal.numero || ''}/${dadosNotaOriginal.serie || ''}`;
        const notaNumSerie = notaStr.split('/');

        const items = [];
        document.querySelectorAll('#dev-itens-body tr').forEach(tr => {
            const chk = tr.querySelector('.item-select');
            if (chk && chk.checked) {
                items.push({
                    codigo_produto: tr.querySelector('.item-cprod').value,
                    descricao: tr.querySelector('.item-desc').value,
                    ncm: tr.querySelector('.item-ncm').value,
                    cfop: tr.querySelector('.item-cfop').value,
                    unidade: 'UN',
                    quantidade_original: Number(tr.querySelector('.item-qtd-orig')?.innerText || 1),
                    quantidade_devolvida: Number(tr.querySelector('.item-qtd-dev').value),
                    valor_unitario: Number(tr.querySelector('.item-vunit').value)
                });
            }
        });

        return {
            id: id ? Number(id) : null,
            chave_nfe_original: chaveOrig,
            nome_fornecedor: fornNome !== '-' ? fornNome : '',
            cnpj_fornecedor: fornCnpj !== '-' ? fornCnpj : '',
            numero_nfe_original: notaNumSerie[0] ? notaNumSerie[0].trim() : '',
            serie_nfe_original: notaNumSerie[1] ? notaNumSerie[1].trim() : '',
            natureza_operacao: document.getElementById('dev-natureza-operacao').value,
            cfop_padrao: document.getElementById('dev-cfop-padrao').value,
            modalidade_frete: document.getElementById('dev-modalidade-frete').value,
            observacoes: document.getElementById('dev-observacoes').value,
            valor_frete: Number(document.getElementById('dev-val-frete').value || 0),
            valor_desconto: Number(document.getElementById('dev-val-desconto').value || 0),
            valor_outras_despesas: Number(document.getElementById('dev-val-outras').value || 0),
            items: items
        };
    }

    window.salvarRascunhoDevolucao = async function() {
        const payload = extrairPayloadFormulario();
        if (!payload.chave_nfe_original || payload.chave_nfe_original.length !== 44) {
            alert('A chave de acesso da NF-e original é obrigatória (44 dígitos).');
            return null;
        }
        if (payload.items.length === 0) {
            alert('Selecione pelo menos um item para devolução.');
            return null;
        }

        const btn = document.getElementById('btn-salvar-rascunho');
        btn.disabled = true;

        try {
            const res = await fetch('/api/devolucao/salvar-rascunho', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!data.sucesso) throw new Error(data.erro);

            document.getElementById('dev-id').value = data.id;
            window.carregarDevolucoes();
            return data.id;
        } catch (err) {
            alert('Erro ao salvar rascunho: ' + err.message);
            return null;
        } finally {
            btn.disabled = false;
        }
    };

    window.emitirNfeDevolucao = async function() {
        let devId = document.getElementById('dev-id').value;
        
        // Se ainda não salvou rascunho, salva primeiro
        if (!devId) {
            devId = await window.salvarRascunhoDevolucao();
            if (!devId) return;
        }

        if (!confirm('Deseja realmente transmitir esta NF-e de devolução para a Focus NFe / SEFAZ?')) {
            return;
        }

        const btnEmitir = document.getElementById('btn-emitir-nfe');
        btnEmitir.disabled = true;
        btnEmitir.innerHTML = `<i data-lucide="loader"></i> Transmitindo...`;

        try {
            const res = await fetch(`/api/devolucao/${devId}/emitir`, {
                method: 'POST'
            });
            const data = await res.json();

            if (data.sucesso) {
                alert(`NF-e enviada com sucesso! Status: ${data.status}`);
                if (typeof closeModal === 'function') closeModal('modal-devolucao');
                window.carregarDevolucoes();
            } else {
                alert(`Erro na emissão: ${data.erro || 'Rejeitada pela SEFAZ'}`);
                window.carregarDevolucoes();
            }
        } catch (err) {
            alert('Falha ao comunicar com o servidor: ' + err.message);
        } finally {
            btnEmitir.disabled = false;
            btnEmitir.innerHTML = `<i data-lucide="send"></i> Emitir NF-e de Devolução`;
            if (window.lucide) lucide.createIcons();
        }
    };

    window.consultarStatusDevolucao = async function(id) {
        try {
            const res = await fetch(`/api/devolucao/${id}/status`);
            const data = await res.json();
            if (!data.sucesso) throw new Error(data.erro);
            
            alert(`Status atualizado: ${data.status}`);
            window.carregarDevolucoes();
        } catch (err) {
            alert('Erro ao consultar status: ' + err.message);
        }
    };

    window.abrirModalCancelamentoDevolucao = function(id) {
        document.getElementById('cancelar-dev-id').value = id;
        document.getElementById('cancelar-justificativa').value = '';
        if (typeof openModal === 'function') openModal('modal-cancelamento-devolucao');
    };

    window.confirmarCancelamentoDevolucao = async function() {
        const id = document.getElementById('cancelar-dev-id').value;
        const justificativa = document.getElementById('cancelar-justificativa').value.trim();

        if (justificativa.length < 15) {
            alert('A justificativa deve ter no mínimo 15 caracteres.');
            return;
        }

        const btn = document.getElementById('btn-confirmar-cancelamento');
        btn.disabled = true;

        try {
            const res = await fetch(`/api/devolucao/${id}/cancelar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ justificativa })
            });
            const data = await res.json();
            if (!data.sucesso) throw new Error(data.erro);

            alert('NF-e de devolução cancelada com sucesso!');
            if (typeof closeModal === 'function') closeModal('modal-cancelamento-devolucao');
            window.carregarDevolucoes();
        } catch (err) {
            alert('Erro ao cancelar: ' + err.message);
        } finally {
            btn.disabled = false;
        }
    };

    window.emitirDevolucaoDireta = async function(id) {
        if (!confirm('Deseja realmente transmitir esta NF-e de devolução para a Focus NFe / SEFAZ?')) {
            return;
        }
        if (typeof openModal === 'function') openModal('modal-loading-devolucao');
        try {
            const res = await fetch(`/api/devolucao/${id}/emitir`, { method: 'POST' });
            const data = await res.json();
            if (typeof closeModal === 'function') closeModal('modal-loading-devolucao');

            if (data.sucesso) {
                alert(`NF-e enviada com sucesso! Status: ${data.status}`);
            } else {
                alert(`Erro na emissão: ${data.erro || 'Rejeitada pela SEFAZ'}`);
            }
            window.carregarDevolucoes();
        } catch (err) {
            if (typeof closeModal === 'function') closeModal('modal-loading-devolucao');
            alert('Erro ao emitir NF-e: ' + err.message);
        }
    };

    window.excluirDevolucao = async function(id) {
        if (!confirm('Deseja realmente excluir este rascunho de devolução?')) {
            return;
        }
        try {
            const res = await fetch(`/api/devolucao/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!data.sucesso) throw new Error(data.erro);

            window.carregarDevolucoes();
        } catch (err) {
            alert('Erro ao excluir devolução: ' + err.message);
        }
    };

    // Auto-carregar devoluções se a página estiver visível
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('page-devolucao')) {
            window.carregarDevolucoes();
        }
    });

})();
