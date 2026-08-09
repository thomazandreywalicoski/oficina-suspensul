// ============================================================================
// Módulo de Devolução de Produtos / Peças — Focus NFe Integration
// ============================================================================

(function() {
    'use strict';

    let devolucoesLista = [];
    let itensNotaOriginal = [];

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
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: #888888;">Nenhuma nota encontrada</td></tr>`;
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

            // Ações disponíveis
            let acoes = [];
            if (item.status === 'AUTORIZADA') {
                if (item.danfe_url) {
                    acoes.push(`<a href="${item.danfe_url}" target="_blank" class="btn btn-secondary btn-sm" title="Visualizar DANFE"><i data-lucide="file-text"></i> DANFE</a>`);
                }
                if (item.xml_url) {
                    acoes.push(`<a href="${item.xml_url}" target="_blank" class="btn btn-secondary btn-sm" title="Baixar XML"><i data-lucide="download"></i> XML</a>`);
                }
                acoes.push(`<button class="btn btn-danger btn-sm" onclick="abrirModalCancelamentoDevolucao(${item.id})" title="Cancelar NF-e"><i data-lucide="x-circle"></i> Cancelar</button>`);
            } else if (item.status === 'PROCESSANDO' || item.status === 'ENVIANDO') {
                acoes.push(`<button class="btn btn-secondary btn-sm" onclick="consultarStatusDevolucao(${item.id})"><i data-lucide="refresh-cw"></i> Atualizar Status</button>`);
            } else if (item.status === 'REJEITADA' || item.status === 'RASCUNHO' || item.status === 'ERRO') {
                acoes.push(`<button class="btn btn-primary btn-sm" onclick="editarDevolucao(${item.id})"><i data-lucide="edit"></i> Editar / Emitir</button>`);
            }

            html += `
                <tr style="border-bottom: 1px solid #1f1f1f;">
                    <td style="padding: 12px 16px;">
                        <strong style="color: #ffffff; font-family: monospace;">${item.ref}</strong>
                        <div style="font-size: 0.75rem; color: #888888;">${fmtDataBR(item.criado_em)}</div>
                    </td>
                    <td style="padding: 12px 16px;">
                        <div style="font-weight: 600; color: #ffffff;">${item.nome_fornecedor || 'Não informado'}</div>
                        <div style="font-size: 0.75rem; color: #888888;">${item.cnpj_fornecedor || '-'}</div>
                    </td>
                    <td style="padding: 12px 16px;">
                        <div style="font-family: monospace; font-size: 0.8rem; color: #a1a1aa;" title="${item.chave_nfe_original}">
                            ${item.chave_nfe_original ? item.chave_nfe_original.substring(0, 20) + '...' : '-'}
                        </div>
                    </td>
                    <td style="padding: 12px 16px; font-weight: 700; color: #ffffff;">
                        ${fmtBRL(item.valor_total)}
                    </td>
                    <td style="padding: 12px 16px;">${statusBadge}</td>
                    <td style="padding: 12px 16px; text-align: right;">
                        <div style="display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap;">
                            ${acoes.join('')}
                        </div>
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
            if (i === step) {
                pill.style.background = '#222222';
                pill.style.color = 'var(--primary, #ffe54c)';
                pill.style.fontWeight = '700';
                if (badge) {
                    badge.style.background = 'var(--primary, #ffe54c)';
                    badge.style.color = '#000000';
                }
            } else if (i < step) {
                pill.style.background = '#181818';
                pill.style.color = '#22c55e';
                pill.style.fontWeight = '600';
                if (badge) {
                    badge.style.background = '#22c55e';
                    badge.style.color = '#ffffff';
                }
            } else {
                pill.style.background = '#161616';
                pill.style.color = '#888888';
                pill.style.fontWeight = '600';
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

        if (btnPrev) btnPrev.style.display = (step > 1) ? 'inline-flex' : 'none';

        if (step === 1) {
            if (btnNext) {
                btnNext.style.display = 'inline-flex';
                btnNext.innerHTML = 'Avançar para Peças &rarr;';
            }
            if (btnRascunho) btnRascunho.style.display = 'none';
            if (btnEmitir) btnEmitir.style.display = 'none';
        } else if (step === 2) {
            if (btnNext) {
                btnNext.style.display = 'inline-flex';
                btnNext.innerHTML = 'Avançar para Dados Fiscais &rarr;';
            }
            if (btnRascunho) btnRascunho.style.display = 'none';
            if (btnEmitir) btnEmitir.style.display = 'none';
        } else if (step === 3) {
            if (btnNext) btnNext.style.display = 'none';
            if (btnRascunho) btnRascunho.style.display = 'inline-flex';
            if (btnEmitir) btnEmitir.style.display = 'inline-flex';
        }
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
        document.getElementById('dev-bloco-fornecedor').style.display = 'none';
        document.getElementById('dev-natureza-operacao').value = 'DEVOLUCAO DE MERCADORIA';
        document.getElementById('dev-cfop-padrao').value = '5202';
        document.getElementById('dev-modalidade-frete').value = '9';
        document.getElementById('dev-observacoes').value = '';
        document.getElementById('dev-val-frete').value = '0.00';
        document.getElementById('dev-val-desconto').value = '0.00';
        document.getElementById('dev-val-outras').value = '0.00';
        
        itensNotaOriginal = [];
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
            document.getElementById('dev-natureza-operacao').value = dev.natureza_operacao || 'DEVOLUCAO DE MERCADORIA';
            document.getElementById('dev-cfop-padrao').value = dev.cfop_padrao || '5202';
            document.getElementById('dev-modalidade-frete').value = dev.modalidade_frete || '9';
            document.getElementById('dev-observacoes').value = dev.observacoes || '';
            document.getElementById('dev-val-frete').value = dev.valor_frete || '0.00';
            document.getElementById('dev-val-desconto').value = dev.valor_desconto || '0.00';
            document.getElementById('dev-val-outras').value = dev.valor_outras_despesas || '0.00';

            if (dev.nome_fornecedor) {
                document.getElementById('dev-bloco-fornecedor').style.display = 'block';
                document.getElementById('dev-fornecedor-nome').innerText = dev.nome_fornecedor;
                document.getElementById('dev-fornecedor-cnpj').innerText = dev.cnpj_fornecedor || '-';
                document.getElementById('dev-nota-numero').innerText = (dev.numero_nfe_original || '-') + ' / ' + (dev.serie_nfe_original || '-');
                document.getElementById('dev-nota-data').innerText = fmtDataBR(dev.criado_em);
            }

            renderizarTabelaItens(dev.items || []);
            document.getElementById('modal-devolucao-titulo').innerText = `Editar Devolução (${dev.ref})`;
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
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader"></i> Buscando...`;

        try {
            const res = await fetch('/api/devolucao/consultar-original', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chave })
            });
            const data = await res.json();
            if (!data.sucesso) throw new Error(data.erro);

            preencherDadosNotaOriginal(data.dados);
        } catch (err) {
            alert(err.message || 'Não foi possível consultar a NF-e. Tente importar o arquivo XML da nota.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i data-lucide="search"></i> Buscar NF-e`;
            if (window.lucide) lucide.createIcons();
        }
    };

    window.importarXmlOriginal = async function(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        
        const formData = new FormData();
        formData.append('xml_file', file);

        try {
            const res = await fetch('/api/devolucao/importar-xml', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (!data.sucesso) throw new Error(data.erro);

            preencherDadosNotaOriginal(data.dados);
            alert('XML importado com sucesso!');
        } catch (err) {
            alert('Erro ao importar XML: ' + err.message);
        }
    };

    function preencherDadosNotaOriginal(dados) {
        if (dados.chave_acesso) {
            document.getElementById('dev-chave-original').value = dados.chave_acesso;
        }

        const emitNome = dados.nome_emitente || dados.emitente?.nome || dados.fornecedor_nome || '';
        const emitCnpj = dados.cnpj_emitente || dados.emitente?.cnpj || dados.fornecedor_cnpj || '';
        const nNF = dados.numero || dados.nNF || '';
        const serie = dados.serie || '';
        const dhEmi = dados.data_emissao || '';

        document.getElementById('dev-bloco-fornecedor').style.display = 'block';
        document.getElementById('dev-fornecedor-nome').innerText = emitNome || 'Não informado';
        document.getElementById('dev-fornecedor-cnpj').innerText = emitCnpj || '-';
        document.getElementById('dev-nota-numero').innerText = (nNF || '-') + ' / ' + (serie || '-');
        document.getElementById('dev-nota-data').innerText = fmtDataBR(dhEmi);

        const itens = dados.items || dados.produtos || [];
        renderizarTabelaItens(itens);
    }

    function renderizarTabelaItens(itens) {
        const tbody = document.getElementById('dev-itens-body');
        if (!tbody) return;

        if (!itens || itens.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px; color: #64748b;">Nenhum item na nota.</td></tr>`;
            recalcularTotaisDevolucao();
            return;
        }

        let html = '';
        itens.forEach((it, idx) => {
            const qtdOrig = Number(it.quantidade_original || it.qCom || 1);
            const qtdDev = Number(it.quantidade_devolvida || qtdOrig);
            const vUnit = Number(it.valor_unitario || it.vUnCom || 0);
            const cfop = it.cfop || document.getElementById('dev-cfop-padrao').value || '5202';
            const ncm = it.ncm || it.codigo_ncm || '';
            const desc = it.descricao || it.xProd || '';
            const cProd = it.codigo_produto || it.cProd || `ITEM${idx+1}`;

            html += `
                <tr id="row-item-${idx}" style="border-bottom: 1px solid #f1f5f9;">
                    <td style="text-align: center; padding: 6px;">
                        <input type="checkbox" class="item-select" data-idx="${idx}" checked onchange="recalcularTotaisDevolucao()">
                    </td>
                    <td style="padding: 6px;">
                        <input type="text" class="form-input item-cprod" data-idx="${idx}" value="${cProd}" style="font-size: 0.75rem; width: 80px; display: inline-block;">
                        <input type="text" class="form-input item-desc" data-idx="${idx}" value="${desc}" placeholder="Descrição do produto" style="font-size: 0.8rem; width: calc(100% - 90px); display: inline-block;">
                    </td>
                    <td style="padding: 6px;">
                        <input type="text" class="form-input item-ncm" data-idx="${idx}" value="${ncm}" placeholder="NCM" style="font-size: 0.8rem;">
                    </td>
                    <td style="padding: 6px;">
                        <input type="text" class="form-input item-cfop" data-idx="${idx}" value="${cfop}" style="font-size: 0.8rem;">
                    </td>
                    <td style="text-align: center; padding: 6px; font-weight: 600;">
                        <span class="item-qtd-orig" data-idx="${idx}">${qtdOrig}</span>
                    </td>
                    <td style="padding: 6px;">
                        <input type="number" step="0.01" max="${qtdOrig}" class="form-input item-qtd-dev" data-idx="${idx}" value="${qtdDev}" onchange="recalcularTotaisDevolucao()" style="text-align: center; font-weight: 600; font-size: 0.8rem;">
                    </td>
                    <td style="padding: 6px;">
                        <input type="number" step="0.01" class="form-input item-vunit" data-idx="${idx}" value="${vUnit.toFixed(2)}" onchange="recalcularTotaisDevolucao()" style="text-align: right; font-size: 0.8rem;">
                    </td>
                    <td style="padding: 6px; text-align: right; font-weight: 700; color: #0f172a;">
                        <span class="item-subtotal" id="subtotal-${idx}">${fmtBRL(qtdDev * vUnit)}</span>
                    </td>
                </tr>
            `;
        });

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
            if (chk && chk.checked) {
                const idx = chk.getAttribute('data-idx');
                const qtdInput = tr.querySelector('.item-qtd-dev');
                const vunitInput = tr.querySelector('.item-vunit');
                const subtotalSpan = document.getElementById(`subtotal-${idx}`);

                const qtd = Number(qtdInput ? qtdInput.value : 0);
                const vunit = Number(vunitInput ? vunitInput.value : 0);
                const subtotal = qtd * vunit;

                if (subtotalSpan) subtotalSpan.innerText = fmtBRL(subtotal);
                totalProd += subtotal;
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
        const fornNome = document.getElementById('dev-fornecedor-nome').innerText;
        const fornCnpj = document.getElementById('dev-fornecedor-cnpj').innerText;
        const notaNumSerie = document.getElementById('dev-nota-numero').innerText.split('/');

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

    // Auto-carregar devoluções se a página estiver visível
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('page-devolucao')) {
            window.carregarDevolucoes();
        }
    });

})();
