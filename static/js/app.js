// ===================== Oficina Suspensul - Frontend Integration =====================
(function() {
    'use strict';

    // ---------- Helpers ----------
    async function api(method, url, data) {
        const opts = { method, headers: {} };
        if (data instanceof FormData) {
            opts.body = data;
        } else if (data) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(data);
        }
        const res = await fetch(url, opts);
        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Erro ${res.status}: ${txt}`);
        }
        const ct = res.headers.get('content-type') || '';
        return ct.includes('application/json') ? res.json() : res.text();
    }

    function fmtBRL(v) {
        const n = Number(v || 0);
        return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function fmtDataBR(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) {
            // pode vir já em YYYY-MM-DD
            const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) return `${m[3]}/${m[2]}/${m[1]}`;
            return iso;
        }
        return d.toLocaleDateString('pt-BR');
    }
    function fmtNumPt(n) { return Number(n || 0).toLocaleString('pt-BR'); }
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }
    function refreshIcons() { try { lucide.createIcons(); } catch(e){} }

    function showToast(msg, isError) {
        let el = document.getElementById('toast-msg');
        if (!el) {
            el = document.createElement('div');
            el.id = 'toast-msg';
            el.style.cssText = 'position:fixed;bottom:30px;right:30px;padding:14px 20px;background:#ffe54c;color:#000;border-radius:8px;font-weight:500;z-index:9999;transition:opacity 0.3s;box-shadow:0 4px 12px rgba(0,0,0,0.4);';
            document.body.appendChild(el);
        }
        el.style.background = isError ? '#e74c3c' : '#ffe54c';
        el.style.color = isError ? '#fff' : '#000';
        el.innerText = msg;
        el.style.opacity = '1';
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.style.opacity = '0'; }, 3000);
    }

    // ---------- Estado global ----------
    const state = {
        clientes: [],
        fornecedores: [],
        veiculos: [],
        agendamentos: [],
        os: [],
        despesas: [],
        config: {},
        editandoCliente: null,
        editandoFornecedor: null,
        editandoVeiculo: null,
        editandoAgendamento: null,
        novaOSCliente: null,
        novaOSVeiculo: null,
        novaOSPecas: [],
        orcamentoVeiculo: null,
        orcamentoPecas: [],
        novoAgClienteId: null,
        novoAgVeiculoId: null,
        agendamentoFiltroAno: new Date().getFullYear(),
        agendamentoFiltroMes: new Date().getMonth() + 1,
        despesasFiltroAno: new Date().getFullYear(),
        despesasFiltroMes: new Date().getMonth() + 1,
        financeiroFiltroAno: new Date().getFullYear(),
        financeiroFiltroMes: new Date().getMonth() + 1,
        osFiltroStatus: 'Todos',
        osFiltroBusca: '',
        mostrarInativosClientes: true,
        mostrarInativosFornecedores: true,
        mostrarInativosVeiculos: true,
        mostrarInativosOS: true,
        mostrarInativosDespesas: true,
    };
    window.suspensulState = state;

    // ---------- Render do calendário (substitui o do template) ----------
    window.renderCalendar = async function(year, month) {
        // month: 0-indexed
        const grid = document.getElementById('calendar-grid');
        if (!grid) return;
        if (typeof year !== 'number' || typeof month !== 'number') {
            year = state.agendamentoFiltroAno;
            month = state.agendamentoFiltroMes - 1;
        }
        state.agendamentoFiltroAno = year;
        state.agendamentoFiltroMes = month + 1;

        let ags = [];
        try {
            ags = await api('GET', `/api/agendamentos?ano=${year}&mes=${month + 1}`);
        } catch (e) {
            console.error('Erro carregando agendamentos:', e);
        }
        const mapa = {};
        ags.forEach(a => {
            const key = String(a.data_agendamento).slice(0, 10);
            if (!mapa[key]) mapa[key] = [];
            mapa[key].push({
                id: a.id,
                hora: String(a.horario).slice(0, 5),
                placa: a.placa,
                cliente_nome: a.nome_completo,
                veiculo: `${a.marca || ''} ${a.modelo || ''}`.trim(),
                cpf: a.cpf,
                status: a.status,
                observacoes: a.observacoes,
                data: key,
            });
        });
        window.agendamentosExemplo = mapa;
        state.agendamentos = ags;

        const hoje = new Date();
        const isCurrentMonth = (year === hoje.getFullYear() && month === hoje.getMonth());
        const todayDate = hoje.getDate();
        const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const firstDay = new Date(year, month, 1).getDay();
        const totalDays = new Date(year, month + 1, 0).getDate();

        let html = '';
        diasSemana.forEach(dia => { html += `<div class="calendar-day-head">${dia}</div>`; });
        for (let i = 0; i < firstDay; i++) html += `<div class="calendar-day empty"></div>`;
        for (let d = 1; d <= totalDays; d++) {
            const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isToday = isCurrentMonth && d === todayDate;
            const tem = (mapa[key] || []).length > 0;
            const cls = 'calendar-day' + (isToday ? ' today' : '');
            const carHtml = tem ? `<div class="calendar-day-car" style="display:flex;align-items:center;justify-content:center;flex:1;margin-top:6px;color:#888;"><i data-lucide="car" style="width:30px;height:30px;color:#888;"></i></div>` : '';
            html += `<div class="${cls}" style="display:flex;flex-direction:column;cursor:pointer;" data-key="${key}"><span class="day-number">${d}</span>${carHtml}</div>`;
        }
        grid.innerHTML = html;
        grid.querySelectorAll('.calendar-day:not(.empty)').forEach(el => {
            el.onclick = () => abrirAgendamentosDoDia(el.dataset.key);
        });

        if (typeof window.calendarioAnoSelecionado !== 'undefined') window.calendarioAnoSelecionado = year;
        if (typeof window.calendarioMesSelecionado !== 'undefined') window.calendarioMesSelecionado = month;
        const lbl = document.getElementById('calendar-period-label');
        const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        if (lbl) lbl.innerText = `${meses[month]} - ${year}`;
        refreshIcons();
    };

    // Bridge das variáveis de escopo do template para window
    const _origApplyApptDate = window.applyAppointmentDate;
    if (_origApplyApptDate) {
        window.applyAppointmentDate = function() {
            _origApplyApptDate.apply(this, arguments);
            const lbl = document.getElementById('appointment-date-label')?.innerText || '';
            const m = lbl.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            if (m) window.agendamentoDataSelecionada = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
        };
    }
    const _origApplyApptTime = window.applyAppointmentTime;
    if (_origApplyApptTime) {
        window.applyAppointmentTime = function() {
            _origApplyApptTime.apply(this, arguments);
            window.agendamentoHorarioSelecionado = document.getElementById('appointment-time-label')?.innerText || '';
        };
    }

    function fmtDataBRFromIso(iso) {
        const [y, m, d] = (iso || '').split('-');
        return (y && m && d) ? `${d}/${m}/${y}` : iso;
    }

    window.abrirAgendamentosDoDia = function(dataIso) {
        const ags = (window.agendamentosExemplo || {})[dataIso] || [];
        document.getElementById('modal-agendamentos-dia-titulo').innerText = 'Agendamentos do Dia ' + fmtDataBRFromIso(dataIso);
        const lista = document.getElementById('lista-agendamentos-dia');
        if (!lista) return;
        if (!ags.length) {
            lista.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;">Nenhum agendamento neste dia.</div>';
        } else {
            const ordenados = ags.slice().sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
            lista.innerHTML = ordenados.map(ag => {
                const veicTxt = `${ag.veiculo || ''}${ag.placa ? ' - ' + ag.placa : ''}`.trim();
                return `
                    <div style="display:flex;align-items:center;gap:14px;background:var(--bg-input);padding:12px 14px;border-radius:var(--border-radius);">
                        <div style="min-width:60px;font-weight:600;color:var(--primary);">${ag.hora || ''}</div>
                        <div style="flex:1;display:flex;flex-direction:column;gap:2px;min-width:0;">
                            <strong style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(ag.cliente_nome || '')}</strong>
                            <small style="color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(veicTxt)}</small>
                        </div>
                        <button class="btn-icon no-hover" title="Visualizar" onclick="visualizarAgendamento(${ag.id})" style="background:transparent;color:var(--text-muted);cursor:pointer;"><i data-lucide="eye"></i></button>
                    </div>`;
            }).join('');
        }
        refreshIcons();
        window.openModal('modal-agendamentos-dia');
    };

    window.visualizarAgendamento = async function(id) {
        // Busca dados antes de fechar/abrir para evitar flicker
        try {
            const ag = await api('GET', `/api/agendamentos/${id}`);
            state.editandoAgendamento = ag;
            const veicTxt = `${ag.marca || ''} ${ag.modelo || ''} - ${ag.placa}`.trim();
            const modal = document.getElementById('modal-detalhe-agendamento');
            if (modal) {
                modal.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = true; });
                const btnEditar = document.getElementById('btn-editar-agendamento');
                const btnSalvar = document.getElementById('btn-salvar-agendamento');
                const btnReagendar = modal.querySelector('.modal-footer .btn-secondary[onclick*="modal-reagendar"]');
                if (btnEditar) btnEditar.style.display = 'none';
                if (btnSalvar) btnSalvar.style.display = 'none';
                if (btnReagendar) btnReagendar.style.display = 'none';
            }
            document.getElementById('detalhe-cliente').value = ag.nome_completo;
            const veicInput = document.querySelector('#modal-detalhe-agendamento .form-group:nth-child(2) input');
            if (veicInput) veicInput.value = veicTxt;
            document.getElementById('detalhe-data').value = String(ag.data_agendamento).slice(0, 10);
            document.getElementById('detalhe-hora').value = String(ag.horario).slice(0, 5);
            const obs = document.querySelector('#modal-detalhe-agendamento textarea');
            if (obs) obs.value = ag.observacoes || '';
            // Troca os modais no mesmo tick para evitar flicker
            window.closeModal('modal-agendamentos-dia');
            window.openModal('modal-detalhe-agendamento');
            refreshIcons();
        } catch (e) { showToast('Erro: ' + e.message, true); }
    };

    async function abrirDetalheAgendamento(id) {
        try {
            const ag = await api('GET', `/api/agendamentos/${id}`);
            state.editandoAgendamento = ag;
            const veicTxt = `${ag.marca || ''} ${ag.modelo || ''} - ${ag.placa}`.trim();
            const modal = document.getElementById('modal-detalhe-agendamento');
            // Reset modo edição/visualização para padrão (somente cliente/veículo desabilitados, demais campos editáveis ao clicar Editar)
            if (modal) {
                modal.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = true; });
                const btnEditar = document.getElementById('btn-editar-agendamento');
                const btnSalvar = document.getElementById('btn-salvar-agendamento');
                const btnReagendar = modal.querySelector('.modal-footer .btn-secondary[onclick*="modal-reagendar"]');
                if (btnEditar) btnEditar.style.display = '';
                if (btnSalvar) btnSalvar.style.display = 'none';
                if (btnReagendar) btnReagendar.style.display = '';
            }
            document.getElementById('detalhe-cliente').value = ag.nome_completo;
            const veicInput = document.querySelector('#modal-detalhe-agendamento .form-group:nth-child(2) input');
            if (veicInput) veicInput.value = veicTxt;
            document.getElementById('detalhe-data').value = String(ag.data_agendamento).slice(0, 10);
            document.getElementById('detalhe-hora').value = String(ag.horario).slice(0, 5);
            const select = document.querySelector('#modal-detalhe-agendamento select');
            if (select) select.value = ag.status === 'Nao_Trouxe' ? 'NaoTrouxe' : ag.status;
            const obs = document.querySelector('#modal-detalhe-agendamento textarea');
            if (obs) obs.value = ag.observacoes || '';
            window.openModal('modal-detalhe-agendamento');
        } catch (e) { showToast('Erro: ' + e.message, true); }
    }
    window.abrirDetalheAgendamento = abrirDetalheAgendamento;

    // ---------- Override showPage para carregar dados ----------
    const originalShowPage = window.showPage;
    window.showPage = function(pageId) {
        originalShowPage(pageId);
        carregarPagina(pageId);
    };

    async function carregarPagina(pageId) {
        try {
            switch (pageId) {
                case 'clientes': await carregarClientes(); break;
                case 'fornecedores': await carregarFornecedores(); break;
                case 'veiculos': await carregarVeiculos(); break;
                case 'os': await carregarOS(); break;
                case 'orcamento': await carregarOrcamento(); break;
                case 'despesas': await carregarDespesas(); break;
                case 'financeiro': await carregarFinanceiro(); break;
                case 'configuracoes': await carregarConfig(); break;
                case 'agendamentos':
                    window.renderCalendar(state.agendamentoFiltroAno, state.agendamentoFiltroMes - 1);
                    break;
            }
        } catch (e) { showToast('Erro: ' + e.message, true); }
    }

    // ===================== CLIENTES =====================
    async function carregarClientes(busca) {
        const params = new URLSearchParams();
        if (busca) params.set('q', busca);
        if (state.mostrarInativosClientes) params.set('incluir_inativos', 'true');
        const url = '/api/clientes' + (params.toString() ? '?' + params.toString() : '');
        const rows = await api('GET', url);
        state.clientes = rows;
        const tbody = document.querySelector('.clients-table tbody');
        if (!tbody) return;
        tbody.innerHTML = rows.length ? rows.map(c => {
            const inativo = !c.ativo;
            return `
            <tr style="${inativo ? 'opacity:0.45;' : ''}">
                <td>${escapeHtml(c.nome_completo)}</td>
                <td>${escapeHtml(c.cpf)}</td>
                <td>${escapeHtml(c.whatsapp || '')}</td>
                <td><span class="badge badge-${inativo ? 'cancelado' : 'paga'}">${inativo ? 'Inativo' : 'Ativo'}</span></td>
                <td class="actions-cell">
                    <button class="btn-icon" onclick="editarCliente(${c.id})" title="Editar"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon" onclick="toggleCliente(${c.id})" title="${inativo ? 'Ativar' : 'Desativar'}" style="color:${inativo ? '#2ecc71' : '#e67e22'}"><i data-lucide="${inativo ? 'circle-check' : 'circle-off'}"></i></button>
                </td>
            </tr>`;
        }).join('') : `<tr><td colspan="5" style="text-align:center;color:#777">Nenhum cliente cadastrado.</td></tr>`;
        refreshIcons();
    }

    window.editarCliente = function(id) {
        const c = state.clientes.find(x => x.id === id);
        if (!c) return;
        state.editandoCliente = c;
        const m = document.getElementById('modal-cliente');
        m.querySelector('.modal-title').innerText = 'Editar Cliente';
        const inputs = m.querySelectorAll('input');
        inputs[0].value = c.nome_completo;
        inputs[1].value = c.cpf;
        inputs[2].value = c.whatsapp || '';
        m.querySelector('.btn-primary').innerText = 'Salvar';
        window.openModal('modal-cliente');
    };

    window.toggleCliente = async function(id) {
        const c = state.clientes.find(x => x.id === id);
        const acao = c && c.ativo ? 'desativar' : 'ativar';
        if (!confirm(`Deseja ${acao} este cliente?`)) return;
        try {
            const r = await api('PATCH', `/api/clientes/${id}/toggle-ativo`);
            await carregarClientes(document.querySelector('#page-clientes input[type="text"]')?.value.trim());
            showToast(`Cliente ${r.ativo ? 'ativado' : 'desativado'}`);
        } catch (e) { showToast('Erro: ' + e.message, true); }
    };

    function resetarModalCliente() {
        const m = document.getElementById('modal-cliente');
        if (!m) return;
        state.editandoCliente = null;
        m.querySelector('.modal-title').innerText = 'Cadastro de Cliente';
        m.querySelectorAll('input').forEach(i => i.value = '');
        m.querySelector('.btn-primary').innerText = 'Cadastrar';
    }

    async function salvarCliente() {
        const m = document.getElementById('modal-cliente');
        const inputs = m.querySelectorAll('input');
        const data = {
            nome_completo: inputs[0].value.trim(),
            cpf: inputs[1].value.trim(),
            whatsapp: inputs[2].value.trim(),
        };
        if (!data.nome_completo || !data.cpf) return showToast('Preencha nome e CPF', true);
        try {
            if (state.editandoCliente) {
                await api('PUT', `/api/clientes/${state.editandoCliente.id}`, data);
                showToast('Cliente atualizado');
            } else {
                await api('POST', '/api/clientes', data);
                showToast('Cliente cadastrado');
            }
            window.closeModal('modal-cliente');
            resetarModalCliente();
            await carregarClientes();
        } catch (e) { showToast('Erro: ' + e.message, true); }
    }

    // ===================== FORNECEDORES =====================
    async function carregarFornecedores(busca) {
        const params = new URLSearchParams();
        if (busca) params.set('q', busca);
        if (state.mostrarInativosFornecedores) params.set('incluir_inativos', 'true');
        const url = '/api/fornecedores' + (params.toString() ? '?' + params.toString() : '');
        const rows = await api('GET', url);
        state.fornecedores = rows;
        const tbody = document.querySelector('.suppliers-table tbody');
        if (!tbody) return;
        tbody.innerHTML = rows.length ? rows.map(f => {
            const inativo = !f.ativo;
            return `
            <tr style="${inativo ? 'opacity:0.45;' : ''}">
                <td>${escapeHtml(f.nome)}</td>
                <td>${escapeHtml(f.cnpj)}</td>
                <td>${escapeHtml(f.whatsapp || '')}</td>
                <td><span class="badge badge-${inativo ? 'cancelado' : 'paga'}">${inativo ? 'Inativo' : 'Ativo'}</span></td>
                <td class="actions-cell">
                    <button class="btn-icon" onclick="editarFornecedor(${f.id})" title="Editar"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon" onclick="toggleFornecedor(${f.id})" title="${inativo ? 'Ativar' : 'Desativar'}" style="color:${inativo ? '#2ecc71' : '#e67e22'}"><i data-lucide="${inativo ? 'circle-check' : 'circle-off'}"></i></button>
                </td>
            </tr>`;
        }).join('') : `<tr><td colspan="5" style="text-align:center;color:#777">Nenhum fornecedor cadastrado.</td></tr>`;
        refreshIcons();
    }

    window.editarFornecedor = function(id) {
        const f = state.fornecedores.find(x => x.id === id);
        if (!f) return;
        state.editandoFornecedor = f;
        const m = document.getElementById('modal-fornecedor');
        m.querySelector('.modal-title').innerText = 'Editar Fornecedor';
        const inputs = m.querySelectorAll('input');
        inputs[0].value = f.nome;
        inputs[1].value = f.cnpj;
        inputs[2].value = f.whatsapp || '';
        m.querySelector('.btn-primary').innerText = 'Salvar';
        window.openModal('modal-fornecedor');
    };
    window.toggleFornecedor = async function(id) {
        const f = state.fornecedores.find(x => x.id === id);
        const acao = f && f.ativo ? 'desativar' : 'ativar';
        if (!confirm(`Deseja ${acao} este fornecedor?`)) return;
        try {
            const r = await api('PATCH', `/api/fornecedores/${id}/toggle-ativo`);
            await carregarFornecedores(document.querySelector('#page-fornecedores input[type="text"]')?.value.trim());
            showToast(`Fornecedor ${r.ativo ? 'ativado' : 'desativado'}`);
        } catch (e) { showToast('Erro: ' + e.message, true); }
    };

    function resetarModalFornecedor() {
        const m = document.getElementById('modal-fornecedor');
        if (!m) return;
        state.editandoFornecedor = null;
        m.querySelector('.modal-title').innerText = 'Cadastro de Fornecedor';
        m.querySelectorAll('input').forEach(i => i.value = '');
        m.querySelector('.btn-primary').innerText = 'Cadastrar';
    }

    async function salvarFornecedor() {
        const m = document.getElementById('modal-fornecedor');
        const inputs = m.querySelectorAll('input');
        const data = {
            nome: inputs[0].value.trim(),
            cnpj: inputs[1].value.trim(),
            whatsapp: inputs[2].value.trim(),
        };
        if (!data.nome || !data.cnpj) return showToast('Preencha nome e CNPJ', true);
        try {
            if (state.editandoFornecedor) {
                await api('PUT', `/api/fornecedores/${state.editandoFornecedor.id}`, data);
                showToast('Fornecedor atualizado');
            } else {
                await api('POST', '/api/fornecedores', data);
                showToast('Fornecedor cadastrado');
            }
            window.closeModal('modal-fornecedor');
            resetarModalFornecedor();
            await carregarFornecedores();
        } catch (e) { showToast('Erro: ' + e.message, true); }
    }

    // ===================== VEÍCULOS =====================
    async function carregarVeiculos(busca) {
        const params = new URLSearchParams();
        if (busca) params.set('q', busca);
        if (state.mostrarInativosVeiculos) params.set('incluir_inativos', 'true');
        const url = '/api/veiculos' + (params.toString() ? '?' + params.toString() : '');
        const rows = await api('GET', url);
        state.veiculos = rows;
        const tbody = document.querySelector('.vehicles-table tbody');
        if (!tbody) return;
        tbody.innerHTML = rows.length ? rows.map(v => {
            const inativo = !v.ativo;
            return `
            <tr style="${inativo ? 'opacity:0.45;' : ''}">
                <td>${v.imagem
                    ? `<img class="vehicle-img-table" src="/static/uploads/${escapeHtml(v.imagem)}" alt="">`
                    : `<div class="vehicle-no-img"><i data-lucide="image-off"></i></div>`}</td>
                <td><strong>${escapeHtml(v.placa)}</strong></td>
                <td>${escapeHtml((v.marca || '') + ' ' + (v.modelo || ''))}</td>
                <td>${escapeHtml(v.ano || '')}</td>
                <td>${fmtNumPt(v.km)}</td>
                <td>${escapeHtml(v.motorizacao || '')}</td>
                <td><span class="badge badge-${inativo ? 'cancelado' : 'paga'}">${inativo ? 'Inativo' : 'Ativo'}</span></td>
                <td class="actions-cell">
                    <button class="btn-icon" onclick="visualizarVeiculoImagens(${v.id})" title="Visualizar imagens" style="color:#3498db"><i data-lucide="eye"></i></button>
                    <button class="btn-icon" onclick="editarVeiculo(${v.id})" title="Editar"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon" onclick="toggleVeiculo(${v.id})" title="${inativo ? 'Ativar' : 'Desativar'}" style="color:${inativo ? '#2ecc71' : '#e67e22'}"><i data-lucide="${inativo ? 'circle-check' : 'circle-off'}"></i></button>
                </td>
            </tr>`;
        }).join('') : `<tr><td colspan="8" style="text-align:center;color:#777">Nenhum veículo cadastrado.</td></tr>`;
        refreshIcons();
    }

    window.editarVeiculo = function(id) {
        const v = state.veiculos.find(x => x.id === id);
        if (!v) return;
        state.editandoVeiculo = v;
        const m = document.getElementById('modal-veiculo');
        m.querySelector('.modal-title').innerText = 'Editar Veículo';
        const inputs = m.querySelectorAll('input[type="text"], input[type="number"]');
        // ordem: placa, marca, modelo, ano, km, motorização
        inputs[0].value = v.placa || '';
        inputs[1].value = v.marca || '';
        inputs[2].value = v.modelo || '';
        inputs[3].value = v.ano || '';
        inputs[4].value = v.km || 0;
        inputs[5].value = v.motorizacao || '';
        // Pré-popula previews das imagens existentes
        ['imagem','imagem2','imagem3'].forEach((col, idx) => {
            const slot = m.querySelector(`.vehicle-img-slot[data-slot="${idx+1}"]`);
            if (!slot) return;
            if (v[col]) {
                _setSlotPreview(slot, `/static/uploads/${v[col]}`);
            } else {
                _resetSlot(slot);
            }
        });
        m.querySelector('.btn-primary').innerText = 'Salvar';
        window.openModal('modal-veiculo');
    };
    let _carrosselImgs = [];
    let _carrosselIdx = 0;
    function _atualizarCarrossel() {
        const img = document.getElementById('veiculo-carrossel-img');
        const counter = document.getElementById('veiculo-carrossel-counter');
        if (!img || !counter) return;
        if (!_carrosselImgs.length) {
            img.src = '';
            img.alt = 'Sem imagens';
            counter.innerText = 'Sem imagens';
            return;
        }
        img.src = _carrosselImgs[_carrosselIdx];
        counter.innerText = `${_carrosselIdx + 1} / ${_carrosselImgs.length}`;
    }
    window.carrosselVeiculoNav = function(dir) {
        if (!_carrosselImgs.length) return;
        _carrosselIdx = (_carrosselIdx + dir + _carrosselImgs.length) % _carrosselImgs.length;
        _atualizarCarrossel();
    };
    window.visualizarVeiculoImagens = function(id) {
        const v = state.veiculos.find(x => x.id === id);
        if (!v) return;
        _carrosselImgs = ['imagem','imagem2','imagem3']
            .map(c => v[c])
            .filter(Boolean)
            .map(f => `/static/uploads/${f}`);
        _carrosselIdx = 0;
        _atualizarCarrossel();
        window.openModal('modal-veiculo-imagens');
    };

    window.toggleVeiculo = async function(id) {
        const v = state.veiculos.find(x => x.id === id);
        const acao = v && v.ativo ? 'desativar' : 'ativar';
        if (!confirm(`Deseja ${acao} este veículo?`)) return;
        try {
            const r = await api('PATCH', `/api/veiculos/${id}/toggle-ativo`);
            await carregarVeiculos(document.querySelector('#page-veiculos input[type="text"]')?.value.trim());
            showToast(`Veículo ${r.ativo ? 'ativado' : 'desativado'}`);
        } catch (e) { showToast('Erro: ' + e.message, true); }
    };

    function _setSlotPreview(slot, src) {
        const file = slot.querySelector('input[type="file"]');
        slot.innerHTML = '';
        const img = document.createElement('img');
        img.src = src;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        slot.appendChild(img);
        if (file) slot.appendChild(file);
    }
    function _resetSlot(slot) {
        const file = slot.querySelector('input[type="file"]');
        if (file) file.value = '';
        slot.innerHTML = '<i data-lucide="image-plus" style="color:#666;width:28px;height:28px;"></i>';
        if (file) slot.appendChild(file);
        refreshIcons();
    }
    function setupModalVeiculo() {
        const m = document.getElementById('modal-veiculo');
        if (!m) return;
        m.querySelectorAll('.vehicle-img-slot').forEach(slot => {
            const file = slot.querySelector('input[type="file"]');
            slot.onclick = (e) => { if (e.target.tagName !== 'INPUT') file.click(); };
            file.onchange = () => {
                if (file.files && file.files[0]) {
                    const reader = new FileReader();
                    reader.onload = (ev) => _setSlotPreview(slot, ev.target.result);
                    reader.readAsDataURL(file.files[0]);
                }
            };
        });
    }

    function resetarModalVeiculo() {
        const m = document.getElementById('modal-veiculo');
        if (!m) return;
        state.editandoVeiculo = null;
        m.querySelector('.modal-title').innerText = 'Cadastro de Veículo';
        m.querySelectorAll('input[type="text"], input[type="number"]').forEach(i => { i.value = ''; });
        m.querySelectorAll('.vehicle-img-slot').forEach(slot => _resetSlot(slot));
        m.querySelector('.btn-primary').innerText = 'Cadastrar';
    }

    async function salvarVeiculo() {
        const m = document.getElementById('modal-veiculo');
        const inputs = m.querySelectorAll('input[type="text"], input[type="number"]');
        const fd = new FormData();
        fd.append('placa', inputs[0].value.trim());
        fd.append('marca', inputs[1].value.trim());
        fd.append('modelo', inputs[2].value.trim());
        fd.append('ano', inputs[3].value || '');
        fd.append('km', inputs[4].value || '0');
        fd.append('motorizacao', inputs[5].value.trim());
        // Imagens: imagem, imagem2, imagem3
        ['imagem','imagem2','imagem3'].forEach((col, idx) => {
            const slot = m.querySelector(`.vehicle-img-slot[data-slot="${idx+1}"]`);
            const f = slot?.querySelector('input[type="file"]');
            if (f && f.files && f.files[0]) fd.append(col, f.files[0]);
        });
        if (!inputs[0].value.trim()) return showToast('Placa é obrigatória', true);
        try {
            if (state.editandoVeiculo) {
                await api('PUT', `/api/veiculos/${state.editandoVeiculo.id}`, fd);
                showToast('Veículo atualizado');
            } else {
                await api('POST', '/api/veiculos', fd);
                showToast('Veículo cadastrado');
            }
            window.closeModal('modal-veiculo');
            resetarModalVeiculo();
            await carregarVeiculos();
        } catch (e) { showToast('Erro: ' + e.message, true); }
    }

    // ===================== ORDENS DE SERVIÇO =====================
    async function carregarOS() {
        const params = [];
        if (state.osFiltroStatus && state.osFiltroStatus !== 'Todos Status' && state.osFiltroStatus !== 'Todos') {
            params.push('status=' + encodeURIComponent(state.osFiltroStatus));
        }
        if (state.osFiltroBusca) params.push('q=' + encodeURIComponent(state.osFiltroBusca));
        if (state.mostrarInativosOS) params.push('incluir_inativos=true');
        const url = '/api/os' + (params.length ? '?' + params.join('&') : '');
        const rows = await api('GET', url);
        state.os = rows;
        const tbody = document.querySelector('.os-table tbody');
        if (!tbody) return;
        tbody.innerHTML = rows.length ? rows.map(o => `
            <tr>
                <td><strong>${String(o.numero).padStart(6,'0')}</strong></td>
                <td>${escapeHtml(o.nome_completo)}</td>
                <td>${escapeHtml((o.marca||'') + ' ' + (o.modelo||''))}</td>
                <td>${escapeHtml(o.placa)}</td>
                <td>${fmtDataBR(o.data_emissao)}</td>
                <td><span class="badge badge-${o.status === 'Paga' ? 'paga' : 'pendente'}">${o.status}</span></td>
                <td class="actions-cell">
                    <button class="btn-icon" title="Visualizar A4" onclick="window.visualizarOS(${o.id})" style="color:#3498db"><i data-lucide="eye"></i></button>
                    <button class="btn-icon" title="Imprimir A4" onclick="window.printOS(${o.id})"><i data-lucide="printer"></i></button>
                    <button class="btn-icon" title="Imprimir Cupom" onclick="window.imprimirCupom(${o.id})"><i data-lucide="file-text"></i></button>
                    <button class="btn-icon" title="Enviar WhatsApp" onclick="enviarWhatsapp(${o.id})" style="color:#25d366"><i data-lucide="message-circle"></i></button>
                    <button class="btn-icon" title="${o.status === 'Paga' ? 'Marcar Pendente' : 'Marcar Paga'}" onclick="alternarStatusOS(${o.id}, '${o.status}')" style="color:${o.status === 'Paga' ? '#f39c12' : '#2ecc71'}"><i data-lucide="${o.status === 'Paga' ? 'rotate-ccw' : 'check'}"></i></button>
                </td>
            </tr>`).join('') : `<tr><td colspan="7" style="text-align:center;color:#777">Nenhum comprovante.</td></tr>`;
        refreshIcons();
    }

    window.alternarStatusOS = async function(id, statusAtual) {
        const novo = statusAtual === 'Paga' ? 'Pendente' : 'Paga';
        try {
            await api('PUT', `/api/os/${id}/status`, { status: novo });
            await carregarOS();
            showToast('Status atualizado para ' + novo);
        } catch (e) { showToast('Erro: ' + e.message, true); }
    };

    window.toggleOS = async function(id) {
        const o = state.os.find(x => x.id === id);
        const acao = o && o.ativo ? 'desativar' : 'ativar';
        if (!confirm(`Deseja ${acao} este comprovante?`)) return;
        try {
            const r = await api('PATCH', `/api/os/${id}/toggle-ativo`);
            await carregarOS();
            showToast(`OS ${r.ativo ? 'ativada' : 'desativada'}`);
        } catch (e) { showToast('Erro: ' + e.message, true); }
    };

    window.enviarWhatsapp = async function(id) {
        const o = state.os.find(x => x.id === id);
        if (!o) return;
        // tenta carregar whatsapp do cliente
        let cliente = state.clientes.find(c => c.id === o.cliente_id);
        if (!cliente) {
            cliente = await api('GET', `/api/clientes`).then(arr => arr.find(c => c.id === o.cliente_id));
        }
        const fone = (cliente && cliente.whatsapp || '').replace(/\D/g, '');
        const url = `${window.location.origin}/os/${id}/imprimir`;
        const msg = encodeURIComponent(`Olá ${o.nome_completo}, segue seu Comprovante Nº ${String(o.numero).padStart(6,'0')}: ${url}`);
        const wpp = fone ? `https://wa.me/55${fone}?text=${msg}` : `https://wa.me/?text=${msg}`;
        window.open(wpp, '_blank');
    };

    // ----- Modal Nova OS -----
    let _fornecedorPickerTarget = null;

    async function carregarFornecedoresCache() {
        if (!state.fornecedores || !state.fornecedores.length) {
            try { state.fornecedores = await api('GET', '/api/fornecedores'); } catch(e) { state.fornecedores = []; }
        }
        return state.fornecedores;
    }

    function renderListaSeletorFornecedor(filtro) {
        const lista = document.getElementById('seletor-fornecedor-lista');
        if (!lista) return;
        const arr = (state.fornecedores || []).filter(f => f.ativo);
        const f = (filtro || '').toLowerCase().trim();
        const itens = f ? arr.filter(x => (x.nome || '').toLowerCase().includes(f) || (x.cnpj || '').includes(f)) : arr;
        lista.innerHTML = itens.length
            ? itens.map(x => `
                <button type="button" class="btn btn-secondary" data-id="${x.id}" data-nome="${escapeHtml(x.nome)}" style="justify-content:space-between;text-align:left;width:100%;">
                    <span>${escapeHtml(x.nome)}</span>
                    <span style="color:var(--text-muted);font-size:12px;">${escapeHtml(x.cnpj || '')}</span>
                </button>`).join('')
            : '<div style="color:var(--text-muted);text-align:center;padding:20px;">Nenhum fornecedor encontrado</div>';
        lista.querySelectorAll('button[data-id]').forEach(btn => {
            btn.onclick = () => selecionarFornecedor(btn.dataset.id, btn.dataset.nome);
        });
    }

    window.abrirSeletorFornecedor = async function(btnEl) {
        _fornecedorPickerTarget = btnEl.closest('.peca-row');
        await carregarFornecedoresCache();
        const busca = document.getElementById('seletor-fornecedor-busca');
        if (busca) { busca.value = ''; busca.oninput = () => renderListaSeletorFornecedor(busca.value); }
        renderListaSeletorFornecedor('');
        document.getElementById('modal-seletor-fornecedor').classList.add('active');
    };

    function selecionarFornecedor(id, nome) {
        if (!_fornecedorPickerTarget) return;
        const hidden = _fornecedorPickerTarget.querySelector('.peca-fornecedor-id');
        const label = _fornecedorPickerTarget.querySelector('.peca-fornecedor-label');
        if (hidden) hidden.value = id;
        if (label) {
            label.textContent = nome;
            label.title = nome;
            label.style.whiteSpace = 'nowrap';
            label.style.overflow = 'hidden';
            label.style.textOverflow = 'ellipsis';
        }
        document.getElementById('modal-seletor-fornecedor').classList.remove('active');
    }

    window.limparFornecedorSelecionado = function() {
        if (!_fornecedorPickerTarget) return;
        const hidden = _fornecedorPickerTarget.querySelector('.peca-fornecedor-id');
        const label = _fornecedorPickerTarget.querySelector('.peca-fornecedor-label');
        if (hidden) hidden.value = '';
        if (label) { label.textContent = 'Selecione...'; label.style.color = 'var(--text-muted)'; }
        document.getElementById('modal-seletor-fornecedor').classList.remove('active');
    };

    function setupModalNovaOS() {
        const m = document.getElementById('modal-nova-os');
        if (!m) return;

        // Botão "Adicionar Peça"
        const btnAddPeca = m.querySelector('.btn-secondary');
        if (btnAddPeca) {
            btnAddPeca.onclick = adicionarLinhaPeca;
        }

        // Pré-carrega fornecedores quando o modal abre
        const observer = new MutationObserver(() => {
            if (m.classList.contains('active')) carregarFornecedoresCache();
        });
        observer.observe(m, { attributes: true, attributeFilter: ['class'] });

        // Salva a peca-row inicial como template e remove do DOM
        const linhaInicial = m.querySelector('.peca-row');
        if (linhaInicial && !window._pecaRowTemplate) {
            window._pecaRowTemplate = linhaInicial.cloneNode(true);
        }
        if (linhaInicial) {
            window._pecaRowAnchor = document.createComment('peca-rows-anchor');
            linhaInicial.parentElement.insertBefore(window._pecaRowAnchor, linhaInicial);
            linhaInicial.remove();
        }

        // Busca cliente
        const inputs = m.querySelectorAll('input[type="text"]');
        const inputCliente = inputs[0];
        const inputVeiculo = inputs[1];

        let dropdown1 = criarDropdown(inputCliente, async (q) => {
            const arr = await api('GET', '/api/clientes?q=' + encodeURIComponent(q));
            return arr.map(c => ({ label: `${c.nome_completo} - ${c.cpf}`, value: c.id, raw: c }));
        }, (item) => {
            state.novaOSCliente = item.raw;
            inputCliente.value = `${item.raw.nome_completo} - ${item.raw.cpf}`;
        });
        let dropdown2 = criarDropdown(inputVeiculo, async (q) => {
            const arr = await api('GET', '/api/veiculos?q=' + encodeURIComponent(q));
            return arr.map(v => ({ label: `${v.placa} - ${v.marca||''} ${v.modelo||''}`, value: v.id, raw: v }));
        }, (item) => {
            state.novaOSVeiculo = item.raw;
            inputVeiculo.value = `${item.raw.placa} - ${item.raw.marca||''} ${item.raw.modelo||''}`;
        });
    }

    function criarDropdown(inputEl, fetcher, onPick) {
        const wrap = inputEl.parentElement;
        wrap.style.position = 'relative';
        const list = document.createElement('div');
        list.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:#1a1a1a;border-radius:8px;margin-top:4px;max-height:200px;overflow-y:auto;z-index:100;display:none;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
        wrap.appendChild(list);
        let timer;
        inputEl.addEventListener('input', () => {
            clearTimeout(timer);
            const q = inputEl.value.trim();
            if (q.length < 1) { list.style.display = 'none'; return; }
            timer = setTimeout(async () => {
                try {
                    const items = await fetcher(q);
                    list.innerHTML = items.length ? items.map((it, i) => `
                        <div data-i="${i}" style="padding:10px 14px;cursor:pointer;color:#fff;font-size:14px;">${escapeHtml(it.label)}</div>
                    `).join('') : '<div style="padding:10px;color:#777;">Nenhum resultado</div>';
                    list.style.display = 'block';
                    list.querySelectorAll('div[data-i]').forEach(el => {
                        el.onmouseover = () => el.style.background = '#252525';
                        el.onmouseout = () => el.style.background = '';
                        el.onclick = () => {
                            onPick(items[parseInt(el.dataset.i)]);
                            list.style.display = 'none';
                        };
                    });
                } catch(e) { console.error(e); }
            }, 200);
        });
        document.addEventListener('click', (e) => {
            if (!wrap.contains(e.target)) list.style.display = 'none';
        });
        return list;
    }

    // ===================== FAZER ORÇAMENTO =====================
    async function carregarOrcamento() {
        await carregarFornecedoresCache();
        renderFornecedoresOrcamento();
        if (!document.querySelector('#orcamento-pecas .orcamento-peca-row')) adicionarPecaOrcamento();
    }

    function renderFornecedoresOrcamento() {
        const wrap = document.getElementById('orcamento-fornecedores');
        if (!wrap) return;
        const arr = (state.fornecedores || []).filter(f => f.ativo);
        wrap.innerHTML = arr.length ? arr.map(f => `
            <label style="display:flex;align-items:center;gap:10px;background:var(--bg-input);padding:12px 14px;border-radius:var(--border-radius);cursor:pointer;color:var(--text-main);">
                <input type="checkbox" value="${f.id}" style="width:16px;height:16px;accent-color:#ffe54c;">
                <span style="display:flex;flex-direction:column;gap:2px;min-width:0;">
                    <strong style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(f.nome)}</strong>
                    <small style="color:var(--text-muted);">${escapeHtml(f.whatsapp || '')}</small>
                </span>
            </label>`).join('') : '<div style="color:var(--text-muted);">Nenhum fornecedor ativo cadastrado.</div>';
        refreshIcons();
    }

    window.adicionarPecaOrcamento = function() {
        const wrap = document.getElementById('orcamento-pecas');
        if (!wrap) return;
        const row = document.createElement('div');
        row.className = 'form-row orcamento-peca-row';
        row.style.cssText = 'align-items:flex-end;margin-bottom:10px;';
        row.innerHTML = `
            <div class="form-group" style="flex:1;margin-bottom:0;">
                <input type="text" class="orcamento-peca-nome" placeholder="Nome da peça/produto">
            </div>
            <div class="form-group" style="flex:0 0 120px;margin-bottom:0;">
                <input type="number" class="orcamento-peca-qtd" placeholder="Qtd" min="1">
            </div>
            <button type="button" class="btn-icon" title="Excluir linha" style="color:#e74c3c;height:46px;width:42px;display:flex;align-items:center;justify-content:center;"><i data-lucide="trash-2"></i></button>`;
        row.querySelector('button').onclick = () => row.remove();
        wrap.appendChild(row);
        refreshIcons();
    };

    function coletarPecasOrcamento() {
        return Array.from(document.querySelectorAll('#orcamento-pecas .orcamento-peca-row')).map(row => ({
            nome: row.querySelector('.orcamento-peca-nome')?.value.trim(),
            quantidade: parseInt(row.querySelector('.orcamento-peca-qtd')?.value || 0, 10),
        })).filter(p => p.nome && p.quantidade > 0);
    }

    function coletarFornecedoresOrcamento() {
        const ids = Array.from(document.querySelectorAll('#orcamento-fornecedores input[type="checkbox"]:checked')).map(i => parseInt(i.value, 10));
        return (state.fornecedores || []).filter(f => ids.includes(f.id));
    }

    async function criarAnexoOrcamento() {
        if (!state.orcamentoVeiculo) {
            const txt = (document.getElementById('orcamento-veiculo-busca')?.value || '').trim();
            const placa = txt.split('-')[0].trim().toUpperCase();
            if (placa) {
                try {
                    const arr = await api('GET', '/api/veiculos?q=' + encodeURIComponent(placa));
                    const v = (arr || []).find(x => String(x.placa || '').toUpperCase() === placa) || arr[0];
                    if (v) state.orcamentoVeiculo = v;
                } catch(_){}
            }
        }
        if (!state.orcamentoVeiculo) throw new Error('Selecione um veículo');
        const pecas = coletarPecasOrcamento();
        if (!pecas.length) throw new Error('Adicione pelo menos uma peça/produto');
        const r = await api('POST', '/api/orcamentos/anexo', {
            veiculo_id: state.orcamentoVeiculo.id,
            pecas,
        });
        return r.url;
    }

    window.gerarAnexoOrcamento = async function() {
        try {
            const url = await criarAnexoOrcamento();
            window.open(url, '_blank');
        } catch(e) { showToast('Erro: ' + e.message, true); }
    };

    window.enviarOrcamentoWhatsapp = async function() {
        const fornecedores = coletarFornecedoresOrcamento();
        if (!fornecedores.length) return showToast('Selecione ao menos um fornecedor', true);
        // Abre janelas em branco sincronamente (preserva gesto do usuário)
        const janelas = fornecedores.map(f => {
            const fone = String(f.whatsapp || '').replace(/\D/g, '');
            if (!fone) return null;
            return { fone, win: window.open('about:blank', '_blank') };
        });
        if (janelas.some(j => j && !j.win)) {
            showToast('Permita pop-ups para abrir todas as abas', true);
        }
        try {
            const anexoUrl = window.location.origin + await criarAnexoOrcamento();
            const mensagemBase = document.getElementById('orcamento-mensagem')?.value.trim() || '';
            const msg = `${mensagemBase}\n\n${anexoUrl}`;
            janelas.forEach(j => {
                if (!j || !j.win) return;
                j.win.location = `https://wa.me/55${j.fone}?text=${encodeURIComponent(msg)}`;
            });
        } catch(e) {
            janelas.forEach(j => j && j.win && j.win.close());
            showToast('Erro: ' + e.message, true);
        }
    };

    function setupOrcamentoPage() {
        const input = document.getElementById('orcamento-veiculo-busca');
        if (!input) return;
        criarDropdown(input, async (q) => {
            const arr = await api('GET', '/api/veiculos?q=' + encodeURIComponent(q));
            return arr.map(v => ({ label: `${v.placa} - ${v.marca||''} ${v.modelo||''}`, value: v.id, raw: v }));
        }, (item) => {
            state.orcamentoVeiculo = item.raw;
            input.value = `${item.raw.placa} - ${item.raw.marca||''} ${item.raw.modelo||''}`;
        });
    }

    function adicionarBotaoLixeira(linha) {
        if (linha.querySelector('[data-trash]')) return;
        const wrap = document.createElement('div');
        wrap.className = 'form-group';
        wrap.style.cssText = 'flex:0 0 42px;margin-bottom:18px;';
        const btnRm = document.createElement('button');
        btnRm.type = 'button';
        btnRm.dataset.trash = '1';
        btnRm.className = 'btn-icon';
        btnRm.title = 'Remover peça';
        btnRm.style.cssText = 'color:#e74c3c;height:46px;width:42px;display:flex;align-items:center;justify-content:center;';
        btnRm.innerHTML = '<i data-lucide="trash-2"></i>';
        btnRm.onclick = () => {
            const totalLinhas = linha.parentElement.querySelectorAll('.peca-row').length;
            if (totalLinhas > 1) {
                linha.remove();
            } else {
                // Apenas limpa a linha (mantém ao menos uma)
                linha.querySelectorAll('input').forEach(i => i.value = '');
                const hiddenFor = linha.querySelector('.peca-fornecedor-id');
                const labelFor = linha.querySelector('.peca-fornecedor-label');
                if (hiddenFor) hiddenFor.value = '';
                if (labelFor) { labelFor.textContent = 'Selecione...'; labelFor.style.color = 'var(--text-muted)'; }
            }
        };
        wrap.appendChild(btnRm);
        linha.appendChild(wrap);
    }

    function adicionarLinhaPeca() {
        const m = document.getElementById('modal-nova-os');
        if (!window._pecaRowTemplate || !window._pecaRowAnchor) return;
        const existentes = m.querySelectorAll('.peca-row');
        const ehPrimeira = existentes.length === 0;

        const nova = window._pecaRowTemplate.cloneNode(true);
        nova.querySelectorAll('input').forEach(i => {
            i.value = '';
            if (!ehPrimeira) i.removeAttribute('id');
        });
        if (!ehPrimeira) {
            nova.querySelectorAll('label').forEach(l => l.remove());
        }
        const hiddenFor = nova.querySelector('.peca-fornecedor-id');
        const labelFor = nova.querySelector('.peca-fornecedor-label');
        if (hiddenFor) hiddenFor.value = '';
        if (labelFor) { labelFor.textContent = 'Selecione...'; labelFor.style.color = 'var(--text-muted)'; }

        const custoIn = nova.querySelector('.peca-custo');
        const lucroIn = nova.querySelector('.peca-lucro');
        const descontoIn = nova.querySelector('.peca-desconto');
        const vendaIn = nova.querySelector('.peca-venda');
        const recalc = () => {
            const c = parseFloat(custoIn.value) || 0;
            const l = parseFloat(lucroIn.value) || 0;
            const d = parseFloat(descontoIn.value) || 0;
            const valorComLucro = c * (1 + l/100);
            vendaIn.value = c > 0 ? (valorComLucro * (1 - d/100)).toFixed(2) : '';
        };
        custoIn.addEventListener('input', recalc);
        lucroIn.addEventListener('input', recalc);
        descontoIn.addEventListener('input', recalc);

        adicionarBotaoLixeira(nova);

        // Insere antes da âncora (que fica no lugar da peca-row original) ou após a última linha existente
        const ultimaExistente = existentes[existentes.length - 1];
        if (ultimaExistente) {
            ultimaExistente.parentElement.insertBefore(nova, ultimaExistente.nextSibling);
        } else {
            window._pecaRowAnchor.parentElement.insertBefore(nova, window._pecaRowAnchor);
        }
        refreshIcons();
    }

    function coletarPecasOS() {
        const m = document.getElementById('modal-nova-os');
        const linhas = m.querySelectorAll('.peca-row');
        const pecas = [];
        linhas.forEach(linha => {
            const desc = linha.querySelector('.peca-descricao')?.value?.trim();
            const fornecedor_id = linha.querySelector('.peca-fornecedor-id')?.value || null;
            const qtd = parseInt(linha.querySelector('.peca-qtd')?.value || 0, 10);
            const custo = parseFloat(linha.querySelector('.peca-custo')?.value || 0);
            const lucro = parseFloat(linha.querySelector('.peca-lucro')?.value || 0);
            const desconto = parseFloat(linha.querySelector('.peca-desconto')?.value || 0);
            const venda = parseFloat(linha.querySelector('.peca-venda')?.value || 0);
            const valorComLucro = custo * (1 + lucro/100);
            if (desc && qtd > 0) {
                pecas.push({
                    descricao: desc, fornecedor_id: fornecedor_id || null, quantidade: qtd,
                    valor_custo: custo, lucro_percentual: lucro, desconto_percentual: desconto, valor_venda: venda || (valorComLucro * (1 - desconto/100)),
                });
            }
        });
        return pecas;
    }

    async function salvarNovaOS() {
        if (!state.novaOSCliente) return showToast('Selecione um cliente', true);
        if (!state.novaOSVeiculo) return showToast('Selecione um veículo', true);
        const m = document.getElementById('modal-nova-os');
        const maoObra = parseFloat(document.getElementById('os-mao-obra')?.value || 0);
        const pecas = coletarPecasOS();
        try {
            const r = await api('POST', '/api/os', {
                cliente_id: state.novaOSCliente.id,
                veiculo_id: state.novaOSVeiculo.id,
                valor_mao_obra: maoObra,
                pecas: pecas,
            });
            showToast('Comprovante Nº ' + String(r.numero).padStart(6,'0') + ' criado');
            window.closeModal('modal-nova-os');
            resetarModalNovaOS();
            await carregarOS();
        } catch (e) { showToast('Erro: ' + e.message, true); }
    }

    function resetarModalNovaOS() {
        state.novaOSCliente = null;
        state.novaOSVeiculo = null;
        const m = document.getElementById('modal-nova-os');
        if (!m) return;
        m.querySelectorAll('input').forEach(i => i.value = '');
        // Remove linhas extras de peças
        const linhas = m.querySelectorAll('.form-row[style*="margin-bottom: 5px"]');
        linhas.forEach((l, i) => { if (i > 0) l.remove(); });
    }

    // ===================== AGENDAMENTOS =====================
    function setupModalNovoAgendamento() {
        const m = document.getElementById('modal-novo-agendamento');
        if (!m) return;
        const inputs = m.querySelectorAll('input');
        criarDropdown(inputs[0], async (q) => {
            const arr = await api('GET', '/api/clientes?q=' + encodeURIComponent(q));
            return arr.map(c => ({ label: `${c.nome_completo} - ${c.cpf}`, value: c.id, raw: c }));
        }, (item) => {
            state.novoAgClienteId = item.raw.id;
            inputs[0].value = `${item.raw.nome_completo} - ${item.raw.cpf}`;
        });
        criarDropdown(inputs[1], async (q) => {
            const arr = await api('GET', '/api/veiculos?q=' + encodeURIComponent(q));
            return arr.map(v => ({ label: `${v.placa} - ${v.marca||''} ${v.modelo||''}`, value: v.id, raw: v }));
        }, (item) => {
            state.novoAgVeiculoId = item.raw.id;
            inputs[1].value = `${item.raw.placa} - ${item.raw.marca||''} ${item.raw.modelo||''}`;
        });
    }

    async function salvarNovoAgendamento() {
        if (!state.novoAgClienteId) return showToast('Selecione um cliente', true);
        if (!state.novoAgVeiculoId) return showToast('Selecione um veículo', true);
        if (!window.agendamentoDataSelecionada) return showToast('Selecione a data', true);
        if (!window.agendamentoHorarioSelecionado) return showToast('Selecione o horário', true);

        const d = window.agendamentoDataSelecionada;
        const dataIso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const obs = document.querySelector('#modal-novo-agendamento textarea').value;
        try {
            await api('POST', '/api/agendamentos', {
                cliente_id: state.novoAgClienteId,
                veiculo_id: state.novoAgVeiculoId,
                data_agendamento: dataIso,
                horario: window.agendamentoHorarioSelecionado,
                observacoes: obs,
            });
            showToast('Agendamento criado');
            window.closeModal('modal-novo-agendamento');
            resetarModalNovoAgendamento();
            // Navega o calendário para o mês/ano da data agendada
            state.agendamentoFiltroAno = d.getFullYear();
            state.agendamentoFiltroMes = d.getMonth() + 1;
            if (typeof window.calendarioAnoSelecionado !== 'undefined') window.calendarioAnoSelecionado = d.getFullYear();
            if (typeof window.calendarioMesSelecionado !== 'undefined') window.calendarioMesSelecionado = d.getMonth();
            await window.renderCalendar(d.getFullYear(), d.getMonth());
        } catch (e) { showToast('Erro: ' + e.message, true); }
    }

    function resetarModalNovoAgendamento() {
        state.novoAgClienteId = null;
        state.novoAgVeiculoId = null;
        window.agendamentoDataSelecionada = null;
        window.agendamentoHorarioSelecionado = '';
        const m = document.getElementById('modal-novo-agendamento');
        if (!m) return;
        m.querySelectorAll('input,textarea').forEach(i => i.value = '');
        document.getElementById('appointment-date-label').innerText = 'Selecionar data';
        document.getElementById('appointment-time-label').innerText = 'Selecionar horário';
    }

    async function salvarEdicaoAgendamento() {
        if (!state.editandoAgendamento) return;
        const m = document.getElementById('modal-detalhe-agendamento');
        const data = document.getElementById('detalhe-data').value;
        const hora = document.getElementById('detalhe-hora').value;
        const status = state.editandoAgendamento.status || 'Agendado';
        const obs = m.querySelector('textarea').value;
        try {
            await api('PUT', `/api/agendamentos/${state.editandoAgendamento.id}`, {
                data_agendamento: data, horario: hora, status, observacoes: obs,
            });
            showToast('Agendamento atualizado');
            window.closeModal('modal-detalhe-agendamento');
            window.renderCalendar(state.agendamentoFiltroAno, state.agendamentoFiltroMes - 1);
        } catch (e) { showToast('Erro: ' + e.message, true); }
    }

    async function alterarStatusAgendamento(novoStatus) {
        // chamado quando o select muda
        if (!state.editandoAgendamento) return;
        try {
            const data = document.getElementById('detalhe-data').value;
            const hora = document.getElementById('detalhe-hora').value;
            await api('PUT', `/api/agendamentos/${state.editandoAgendamento.id}`, {
                data_agendamento: data, horario: hora, status: novoStatus,
                observacoes: document.querySelector('#modal-detalhe-agendamento textarea').value,
            });
            showToast('Status atualizado');
        } catch (e) { showToast('Erro: ' + e.message, true); }
    }

    async function reagendar() {
        if (!state.editandoAgendamento) return;
        const m = document.getElementById('modal-reagendar');
        const inputs = m.querySelectorAll('input');
        const novaData = inputs[0].value;
        const novoHora = inputs[1].value;
        if (!novaData || !novoHora) return showToast('Preencha data e horário', true);
        try {
            await api('POST', `/api/agendamentos/${state.editandoAgendamento.id}/reagendar`, {
                data_agendamento: novaData, horario: novoHora,
            });
            showToast('Reagendamento feito');
            window.closeModal('modal-reagendar');
            window.closeModal('modal-detalhe-agendamento');
            window.renderCalendar(state.agendamentoFiltroAno, state.agendamentoFiltroMes - 1);
        } catch (e) { showToast('Erro: ' + e.message, true); }
    }

    // ===================== DESPESAS =====================
    async function carregarDespesas() {
        const params = new URLSearchParams();
        params.set('ano', state.despesasFiltroAno);
        params.set('mes', state.despesasFiltroMes);
        if (state.mostrarInativosDespesas) params.set('incluir_inativos', 'true');
        const url = '/api/despesas?' + params.toString();
        const rows = await api('GET', url);
        state.despesas = rows;
        const tbody = document.querySelector('.expenses-table tbody');
        if (!tbody) return;
        // Adiciona coluna de ações se ainda não existir
        const thead = document.querySelector('.expenses-table thead tr');
        if (thead && thead.children.length === 3) {
            const th = document.createElement('th');
            th.innerHTML = '<span class="table-header-icon"><i data-lucide="settings"></i> Ações</span>';
            thead.appendChild(th);
        }
        tbody.innerHTML = rows.length ? rows.map(d => {
            const inativo = !d.ativo;
            return `
            <tr style="${inativo ? 'opacity:0.45;' : ''}">
                <td>${escapeHtml(d.descricao)} ${inativo ? '<span style="color:#e67e22;font-size:11px;">(inativa)</span>' : ''}</td>
                <td>${fmtDataBR(d.data_despesa)}</td>
                <td>${fmtBRL(d.valor)}</td>
                <td class="actions-cell">
                    <button class="btn-icon" onclick="toggleDespesa(${d.id})" title="${inativo ? 'Ativar' : 'Desativar'}" style="color:${inativo ? '#2ecc71' : '#e67e22'}"><i data-lucide="${inativo ? 'circle-check' : 'circle-off'}"></i></button>
                </td>
            </tr>`;
        }).join('') : `<tr><td colspan="4" style="text-align:center;color:#777">Nenhuma despesa no período.</td></tr>`;
        refreshIcons();
    }

    window.toggleDespesa = async function(id) {
        const d = state.despesas.find(x => x.id === id);
        const acao = d && d.ativo ? 'desativar' : 'ativar';
        if (!confirm(`Deseja ${acao} esta despesa?`)) return;
        try {
            const r = await api('PATCH', `/api/despesas/${id}/toggle-ativo`);
            await carregarDespesas();
            showToast(`Despesa ${r.ativo ? 'ativada' : 'desativada'}`);
        } catch (e) { showToast('Erro: ' + e.message, true); }
    };

    async function salvarDespesa() {
        const m = document.getElementById('modal-despesa');
        const inputs = m.querySelectorAll('input');
        const data = {
            descricao: inputs[0].value.trim(),
            valor: parseFloat(inputs[1].value || 0),
        };
        if (!data.descricao || data.valor <= 0) return showToast('Preencha descrição e valor', true);
        try {
            await api('POST', '/api/despesas', data);
            showToast('Despesa cadastrada');
            window.closeModal('modal-despesa');
            inputs.forEach(i => i.value = '');
            await carregarDespesas();
        } catch (e) { showToast('Erro: ' + e.message, true); }
    }

    // ===================== FINANCEIRO =====================
    async function carregarFinanceiro() {
        const url = `/api/financeiro?ano=${state.financeiroFiltroAno}&mes=${state.financeiroFiltroMes}`;
        const data = await api('GET', url);
        const cardsRoot = document.querySelector('#page-financeiro .financeiro-cards');
        if (cardsRoot) {
            const c = data.cards;
            cardsRoot.children[0].querySelector('.fin-card-value').innerText = c.veiculos;
            cardsRoot.children[1].querySelector('.fin-card-value').innerText = fmtBRL(c.valor_gasto);
            cardsRoot.children[2].querySelector('.fin-card-value').innerText = fmtBRL(c.valor_recebido);
            cardsRoot.children[3].querySelector('.fin-card-value').innerText = fmtBRL(c.despesas);
            cardsRoot.children[4].querySelector('.fin-card-value').innerText = fmtBRL(c.lucro);
        }
        const tbody = document.querySelector('.financial-table tbody');
        if (tbody) {
            tbody.innerHTML = data.detalhes.length ? data.detalhes.map(d => `
                <tr>
                    <td>${String(d.numero).padStart(6,'0')}</td>
                    <td>${fmtBRL(d.valor_pecas_custo)}</td>
                    <td>${fmtBRL(d.valor_pecas_venda)}</td>
                    <td>${fmtBRL(d.valor_mao_obra)}</td>
                    <td>${fmtBRL(d.total)}</td>
                    <td class="${Number(d.lucro)>=0?'positvo':'negativo'}">${fmtBRL(d.lucro)}</td>
                </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;color:#777">Nenhuma OS paga no período.</td></tr>`;
        }
    }

    // ===================== CONFIGURAÇÕES =====================
    async function carregarConfig() {
        const c = await api('GET', '/api/configuracoes');
        state.config = c || {};
        const m = document.getElementById('page-configuracoes');
        if (!m) return;
        const inputs = Array.from(m.querySelectorAll('input')).filter(i => i.type !== 'file');
        // ordem: nome, cnpj, endereco, email, whatsapp
        if (inputs[0]) inputs[0].value = c?.nome_oficina || '';
        if (inputs[1]) inputs[1].value = c?.cnpj || '';
        if (inputs[2]) inputs[2].value = c?.endereco || '';
        if (inputs[3]) inputs[3].value = c?.email || '';
        if (inputs[4]) inputs[4].value = c?.whatsapp || '';
        // Logo preview
        const logoArea = m.querySelector('.logo-upload-area');
        if (logoArea && c?.logo) {
            logoArea.innerHTML = `<img src="/static/uploads/${escapeHtml(c.logo)}" style="max-width:100%;max-height:100%;object-fit:contain">`;
        }
    }

    async function salvarConfig() {
        const m = document.getElementById('page-configuracoes');
        const inputs = Array.from(m.querySelectorAll('input')).filter(i => i.type !== 'file');
        const fd = new FormData();
        fd.append('nome_oficina', inputs[0]?.value || '');
        fd.append('cnpj', inputs[1]?.value || '');
        fd.append('endereco', inputs[2]?.value || '');
        fd.append('email', inputs[3]?.value || '');
        fd.append('whatsapp', inputs[4]?.value || '');
        // logo file (criamos input file dinâmico)
        const logoFile = m.querySelector('input[type="file"][name="logo-upload"]');
        if (logoFile && logoFile.files && logoFile.files[0]) {
            fd.append('logo', logoFile.files[0]);
        }
        try {
            await api('PUT', '/api/configuracoes', fd);
            showToast('Configurações salvas');
            await carregarConfig();
        } catch (e) { showToast('Erro: ' + e.message, true); }
    }

    function setupConfigPage() {
        const m = document.getElementById('page-configuracoes');
        if (!m) return;
        const logoArea = m.querySelector('.logo-upload-area');
        if (logoArea) {
            // cria input file oculto
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.name = 'logo-upload';
            fileInput.accept = 'image/*';
            fileInput.style.display = 'none';
            logoArea.parentElement.appendChild(fileInput);
            logoArea.style.cursor = 'pointer';
            logoArea.onclick = () => fileInput.click();
            fileInput.onchange = () => {
                if (fileInput.files[0]) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        logoArea.innerHTML = `<img src="${e.target.result}" style="max-width:100%;max-height:100%;object-fit:contain">`;
                    };
                    reader.readAsDataURL(fileInput.files[0]);
                }
            };
        }
        const btnSalvar = m.querySelector('.btn-primary');
        if (btnSalvar) btnSalvar.onclick = salvarConfig;
    }

    // ===================== Hook nos botões dos modais =====================
    function hookarModais() {
        // Cliente
        const btnCli = document.querySelector('#modal-cliente .modal-footer .btn-primary');
        if (btnCli) btnCli.onclick = salvarCliente;
        // Fornecedor
        const btnFor = document.querySelector('#modal-fornecedor .modal-footer .btn-primary');
        if (btnFor) btnFor.onclick = salvarFornecedor;
        // Veículo
        const btnVei = document.querySelector('#modal-veiculo .modal-footer .btn-primary');
        if (btnVei) btnVei.onclick = salvarVeiculo;
        // Nova OS
        const btnOS = document.querySelector('#modal-nova-os .modal-footer .btn-primary');
        if (btnOS) btnOS.onclick = salvarNovaOS;
        // Despesa
        const btnDesp = document.querySelector('#modal-despesa .modal-footer .btn-primary');
        if (btnDesp) btnDesp.onclick = salvarDespesa;
        // Novo Agendamento
        const btnAg = document.querySelector('#modal-novo-agendamento .modal-footer .btn-primary');
        if (btnAg) btnAg.onclick = salvarNovoAgendamento;
        // Salvar edição agendamento
        const btnSalvarAg = document.getElementById('btn-salvar-agendamento');
        if (btnSalvarAg) btnSalvarAg.onclick = salvarEdicaoAgendamento;
        // Reagendar
        const btnReag = document.querySelector('#modal-reagendar .modal-footer .btn-primary');
        if (btnReag) btnReag.onclick = reagendar;
        // Status select agendamento
        const selectStatus = document.querySelector('#modal-detalhe-agendamento select');
        if (selectStatus) selectStatus.onchange = (e) => {
            let v = e.target.value;
            if (v === 'NaoTrouxe') v = 'Nao_Trouxe';
            alterarStatusAgendamento(v);
        };

        // Reset on open via openModal hook
        const origOpen = window.openModal;
        window.openModal = function(id) {
            origOpen(id);
            if (id === 'modal-cliente' && !state.editandoCliente) resetarModalCliente();
            if (id === 'modal-fornecedor' && !state.editandoFornecedor) resetarModalFornecedor();
            if (id === 'modal-veiculo' && !state.editandoVeiculo) resetarModalVeiculo();
            if (id === 'modal-novo-agendamento') resetarModalNovoAgendamento();
            if (id === 'modal-nova-os') resetarModalNovaOS();
        };

        // Hook close para resetar estados editáveis
        const origClose = window.closeModal;
        window.closeModal = function(id) {
            origClose(id);
            if (id === 'modal-cliente') state.editandoCliente = null;
            if (id === 'modal-fornecedor') state.editandoFornecedor = null;
            if (id === 'modal-veiculo') state.editandoVeiculo = null;
        };
    }

    // ===================== Hook filtros (período/status) =====================
    function hookarFiltros() {
        // applyCalendarPeriod do template já chama renderCalendar(year, month);
        // o override de renderCalendar atualiza state.agendamentoFiltro* e busca via API.
        const origApplyDesp = window.applyDespesasPeriod;
        window.applyDespesasPeriod = function() {
            origApplyDesp();
            state.despesasFiltroAno = window.despesasAnoSelecionado;
            state.despesasFiltroMes = window.despesasMesSelecionado + 1;
            carregarDespesas();
        };
        const origApplyFin = window.applyFinancialPeriod;
        window.applyFinancialPeriod = function() {
            origApplyFin();
            state.financeiroFiltroAno = window.financeiroAnoSelecionado;
            state.financeiroFiltroMes = window.financeiroMesSelecionado + 1;
            carregarFinanceiro();
        };
        const origApplyOSStatus = window.applyOSStatus;
        window.applyOSStatus = function() {
            origApplyOSStatus();
            state.osFiltroStatus = window.osStatusSelecionado || 'Todos';
            carregarOS();
        };

        // Busca clientes
        const inputBuscaClientes = document.querySelector('#page-clientes input[type="text"]');
        if (inputBuscaClientes) {
            let t;
            inputBuscaClientes.oninput = () => {
                clearTimeout(t);
                t = setTimeout(() => carregarClientes(inputBuscaClientes.value.trim()), 300);
            };
        }
        const inputBuscaForn = document.querySelector('#page-fornecedores input[type="text"]');
        if (inputBuscaForn) {
            let t;
            inputBuscaForn.oninput = () => {
                clearTimeout(t);
                t = setTimeout(() => carregarFornecedores(inputBuscaForn.value.trim()), 300);
            };
        }
        const inputBuscaVei = document.querySelector('#page-veiculos input[type="text"]');
        if (inputBuscaVei) {
            let t;
            inputBuscaVei.oninput = () => {
                clearTimeout(t);
                t = setTimeout(() => carregarVeiculos(inputBuscaVei.value.trim()), 300);
            };
        }
        const inputBuscaOS = document.querySelector('#page-os input[type="text"]');
        if (inputBuscaOS) {
            let t;
            inputBuscaOS.oninput = () => {
                clearTimeout(t);
                state.osFiltroBusca = inputBuscaOS.value.trim();
                t = setTimeout(() => carregarOS(), 300);
            };
        }

        // OS - calculo de venda na primeira linha (já existe via oninput="calcularVendaOS()")
        // Adicionar listener no campo de custo também
        const custoEl = document.getElementById('os-custo-peca');
        if (custoEl) custoEl.addEventListener('input', () => window.calcularVendaOS());
    }

    // ===================== Toggle "Mostrar inativos" =====================
    function criarToggleInativos(rotulo, onChange) {
        const wrap = document.createElement('label');
        wrap.style.cssText = 'display:inline-flex;align-items:center;gap:8px;color:var(--text-muted);font-size:14px;cursor:pointer;user-select:none;background-color:var(--bg-input);padding:10px 16px;border-radius:var(--border-radius);height:42px;box-sizing:border-box;';
        wrap.innerHTML = `
            <input type="checkbox" checked style="accent-color:#ffe54c;width:16px;height:16px;cursor:pointer;">
            <span>${rotulo}</span>`;
        const cb = wrap.querySelector('input');
        cb.onchange = () => onChange(cb.checked);
        return wrap;
    }

    function agruparEsquerda(hdr, toggle) {
        // Container à esquerda com [input de busca][toggle] — toggle à direita da barra de pesquisa
        const input = hdr.querySelector('input[type="text"]');
        let group = hdr.querySelector('[data-left-group]');
        if (!group) {
            group = document.createElement('div');
            group.dataset.leftGroup = '1';
            group.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:nowrap;white-space:nowrap;';
            hdr.insertBefore(group, hdr.firstChild);
            if (input) group.appendChild(input);
        }
        group.appendChild(toggle);
    }

    function injetarTogglesInativos() {
        // Clientes
        const hdrCli = document.querySelector('#page-clientes .page-header');
        if (hdrCli && !hdrCli.querySelector('[data-toggle-inativos]')) {
            const t = criarToggleInativos('Mostrar inativos', (v) => { state.mostrarInativosClientes = v; carregarClientes(document.querySelector('#page-clientes input[type="text"]')?.value.trim()); });
            t.dataset.toggleInativos = 'clientes';
            agruparEsquerda(hdrCli, t);
        }
        // Fornecedores
        const hdrFor = document.querySelector('#page-fornecedores .page-header');
        if (hdrFor && !hdrFor.querySelector('[data-toggle-inativos]')) {
            const t = criarToggleInativos('Mostrar inativos', (v) => { state.mostrarInativosFornecedores = v; carregarFornecedores(document.querySelector('#page-fornecedores input[type="text"]')?.value.trim()); });
            t.dataset.toggleInativos = 'fornecedores';
            agruparEsquerda(hdrFor, t);
        }
        // Veículos
        const hdrVei = document.querySelector('#page-veiculos .page-header');
        if (hdrVei && !hdrVei.querySelector('[data-toggle-inativos]')) {
            const t = criarToggleInativos('Mostrar inativos', (v) => { state.mostrarInativosVeiculos = v; carregarVeiculos(document.querySelector('#page-veiculos input[type="text"]')?.value.trim()); });
            t.dataset.toggleInativos = 'veiculos';
            agruparEsquerda(hdrVei, t);
        }
        // OS e Despesas: não devem ter toggle (sempre ativos)
    }

    // ===================== Inicialização =====================
    document.addEventListener('DOMContentLoaded', () => {
        hookarModais();
        hookarFiltros();
        injetarTogglesInativos();
        setupModalNovaOS();
        setupModalNovoAgendamento();
        setupModalVeiculo();
        setupOrcamentoPage();
        setupConfigPage();
        // Carrega dados iniciais (página de agendamentos é a default)
        window.renderCalendar(state.agendamentoFiltroAno, state.agendamentoFiltroMes - 1);
    });
})();
