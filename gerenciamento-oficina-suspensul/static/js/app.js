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
            let friendlyMsg = null;
            try { const j = JSON.parse(txt); friendlyMsg = j.erro || j.error || j.message || null; } catch(_){}
            throw new Error(friendlyMsg || `Erro ${res.status}: ${txt}`);
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
        const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        const d = new Date(iso);
        if (isNaN(d)) {
            // pode vir já em YYYY-MM-DD
            const m2 = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m2) return `${m2[3]}/${m2[2]}/${m2[1]}`;
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
    function formatLocalDateISO(date) {
        if (!(date instanceof Date) || isNaN(date)) return null;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    function getValidYearMonth(year, month) {
        const now = new Date();
        const validYear = Number.isInteger(Number(year)) ? Number(year) : now.getFullYear();
        const parsedMonth = Number(month);
        const validMonth = Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : (now.getMonth() + 1);
        return { year: validYear, month: validMonth };
    }
    function refreshIcons() { try { lucide.createIcons(); } catch(e){} }

    // ---------- Paginação ----------
    const ROWS_PER_PAGE = 8;
    const _pageState = {};
    function _getPage(key) { return _pageState[key] || 1; }
    function _setPage(key, p) { _pageState[key] = p; }

    function paginateRows(rows, key) {
        const page = _getPage(key);
        const total = Math.ceil(rows.length / ROWS_PER_PAGE) || 1;
        const safePage = Math.min(page, total);
        if (safePage !== page) _setPage(key, safePage);
        const start = (safePage - 1) * ROWS_PER_PAGE;
        return { paged: rows.slice(start, start + ROWS_PER_PAGE), current: safePage, total };
    }

    function renderPagination(key, current, total, onChange) {
        const containerId = `pagination-${key}`;
        let container = document.getElementById(containerId);
        if (!container) {
            const table = document.querySelector(`.${key}-table`);
            if (!table) return;
            const wrapper = table.closest('.table-container') || table.parentNode;
            container = document.createElement('div');
            container.id = containerId;
            wrapper.parentNode.insertBefore(container, wrapper.nextSibling);
        }
        container.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;padding-top:25px;';
        if (total <= 1) { container.innerHTML = ''; return; }
        const sz = 'width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--border-radius);font-size:14px;font-weight:600;border:1px solid var(--border-color);';
        const icoFirst = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform:scaleX(-1)"><path d="m7 18 6-6-6-6"/><path d="M17 6v12"/></svg>';
        const icoLast = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 18 6-6-6-6"/><path d="M17 6v12"/></svg>';
        const icoPrev = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform:scaleX(-1)"><path d="m9 18 6-6-6-6"/></svg>';
        const icoNext = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
        const btn = (label, page, disabled) => {
            const bg = disabled ? 'background:var(--bg-input);color:#555;cursor:default;opacity:0.4;' : 'background:var(--bg-input);color:var(--text-main);cursor:pointer;';
            return `<button style="${sz}${bg}" ${disabled ? 'disabled' : ''} data-p="${page}">${label}</button>`;
        };
        const activeBtn = (label) => `<button style="${sz}background:var(--primary);color:#000;cursor:default;border-color:var(--primary);" disabled>${label}</button>`;
        const prevPage = current - 1;
        const nextPage = current + 1;
        container.innerHTML =
            btn(icoFirst, 1, current <= 1) +
            btn(icoPrev, prevPage, current <= 1) +
            (prevPage >= 1 ? btn(prevPage, prevPage, false) : btn(prevPage, prevPage, true)) +
            activeBtn(current) +
            (nextPage <= total ? btn(nextPage, nextPage, false) : btn(nextPage, nextPage, true)) +
            btn(icoNext, nextPage, current >= total) +
            btn(icoLast, total, current >= total);
        container.querySelectorAll('button:not([disabled])').forEach(b => {
            b.onclick = () => { _setPage(key, parseInt(b.dataset.p)); onChange(); };
        });
    }

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
        estoque: [],
        config: {},
        editandoCliente: null,
        editandoFornecedor: null,
        editandoVeiculo: null,
        editandoAgendamento: null,
        novaOSCliente: null,
        novaOSVeiculo: null,
        novaOSPecas: [],
        orcamentosPropostas: [],
        propostaCliente: null,
        propostaVeiculo: null,
        editandoProposta: null,
        editandoPecaIdx: null,
        orcamentoVeiculo: null,
        orcamentoPecas: [],
        cotacoes: [],
        editandoCotacao: null,
        novoAgClienteId: null,
        novoAgVeiculoId: null,
        agendamentoFiltroAno: new Date().getFullYear(),
        agendamentoFiltroMes: new Date().getMonth() + 1,
        despesasFiltroAno: new Date().getFullYear(),
        despesasFiltroMes: new Date().getMonth() + 1,
        dividas: [],
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
        } catch (e) { window.showAlert(e.message, 'Erro'); }
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
        } catch (e) { window.showAlert(e.message, 'Erro'); }
    }
    window.abrirDetalheAgendamento = abrirDetalheAgendamento;

    // ---------- Override showPage para carregar dados ----------
    const originalShowPage = window.showPage;
    window.showPage = function(pageId) {
        originalShowPage(pageId);
        try { localStorage.setItem('activePage', pageId); } catch (_) {}
        carregarPagina(pageId);
    };

    async function carregarPagina(pageId) {
        try {
            switch (pageId) {
                case 'clientes': await carregarClientes(); break;
                case 'fornecedores': await carregarFornecedores(); break;
                case 'veiculos': await carregarVeiculos(); break;
                case 'mandar-orcamento': await carregarPropostas(); break;
                case 'os': await carregarOS(); break;
                case 'orcamento': await carregarOrcamento(); break;
                case 'financeiro': await carregarFinanceiro(); break;
                case 'dividas': await carregarDividas(); break;
                case 'estoque': await carregarEstoque(); break;
                case 'configuracoes': await carregarConfig(); break;
                case 'agendamentos':
                    window.renderCalendar(state.agendamentoFiltroAno, state.agendamentoFiltroMes - 1);
                    break;
            }
        } catch (e) { window.showAlert(e.message, 'Erro'); }
    }

    // ===================== CLIENTES =====================
    async function carregarClientes(busca) {
        const params = new URLSearchParams();
        if (busca) params.set('q', busca);
        if (state.mostrarInativosClientes) params.set('incluir_inativos', 'true');
        const url = '/api/clientes' + (params.toString() ? '?' + params.toString() : '');
        const rows = await api('GET', url);
        rows.sort((a, b) => b.id - a.id);
        state.clientes = rows;
        _setPage('clients', 1);
        renderClientesTabela();
    }
    function renderClientesTabela() {
        const rows = state.clientes;
        const tbody = document.querySelector('.clients-table tbody');
        if (!tbody) return;
        const { paged, current, total } = paginateRows(rows, 'clients');
        tbody.innerHTML = paged.length ? paged.map(c => {
            const inativo = !c.ativo;
            return `
            <tr style="${inativo ? 'opacity:0.45;' : ''}">
                <td>${escapeHtml(c.nome_completo)}</td>
                <td>${escapeHtml(c.cpf)}</td>
                <td>${escapeHtml(c.whatsapp || '')}</td>
                <td><span class="badge badge-${inativo ? 'cancelado' : 'paga'}">${inativo ? 'Inativo' : 'Ativo'}</span></td>
                <td class="actions-cell">
                    <button class="btn-icon btn-action-blue" onclick="editarCliente(${c.id})" title="Editar"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon ${inativo ? 'btn-action-green' : 'btn-action-orange'}" onclick="toggleCliente(${c.id})" title="${inativo ? 'Ativar' : 'Desativar'}"><i data-lucide="${inativo ? 'circle-check' : 'shield-off'}"></i></button>
                </td>
            </tr>`;
        }).join('') : `<tr><td colspan="5" style="text-align:center;color:#777">Nenhum cliente cadastrado.</td></tr>`;
        renderPagination('clients', current, total, renderClientesTabela);
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
        window.showConfirm(`Deseja ${acao} este cliente?`, async () => {
        try {
            const r = await api('PATCH', `/api/clientes/${id}/toggle-ativo`);
            await carregarClientes(document.querySelector('#page-clientes input[type="text"]')?.value.trim());
            showToast(`Cliente ${r.ativo ? 'ativado' : 'desativado'}`);
        } catch (e) { window.showAlert(e.message, 'Erro'); }
        });
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
        if (!data.nome_completo) return showToast('Preencha o nome do cliente', true);
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
        } catch (e) { window.showAlert(e.message, 'Erro'); }
    }

    // ===================== FORNECEDORES =====================
    async function carregarFornecedores(busca) {
        const params = new URLSearchParams();
        if (busca) params.set('q', busca);
        if (state.mostrarInativosFornecedores) params.set('incluir_inativos', 'true');
        const url = '/api/fornecedores' + (params.toString() ? '?' + params.toString() : '');
        const rows = await api('GET', url);
        rows.sort((a, b) => b.id - a.id);
        state.fornecedores = rows;
        _setPage('suppliers', 1);
        renderFornecedoresTabela();
    }
    function renderFornecedoresTabela() {
        const rows = state.fornecedores;
        const tbody = document.querySelector('.suppliers-table tbody');
        if (!tbody) return;
        const { paged, current, total } = paginateRows(rows, 'suppliers');
        tbody.innerHTML = paged.length ? paged.map(f => {
            const inativo = !f.ativo;
            return `
            <tr style="${inativo ? 'opacity:0.45;' : ''}">
                <td>${escapeHtml(f.nome)}</td>
                <td>${escapeHtml(f.cnpj)}</td>
                <td>${escapeHtml(f.whatsapp || '')}</td>
                <td><span class="badge badge-${inativo ? 'cancelado' : 'paga'}">${inativo ? 'Inativo' : 'Ativo'}</span></td>
                <td class="actions-cell">
                    <button class="btn-icon btn-action-blue" onclick="editarFornecedor(${f.id})" title="Editar"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon ${inativo ? 'btn-action-green' : 'btn-action-orange'}" onclick="toggleFornecedor(${f.id})" title="${inativo ? 'Ativar' : 'Desativar'}"><i data-lucide="${inativo ? 'circle-check' : 'shield-off'}"></i></button>
                </td>
            </tr>`;
        }).join('') : `<tr><td colspan="5" style="text-align:center;color:#777">Nenhum fornecedor cadastrado.</td></tr>`;
        renderPagination('suppliers', current, total, renderFornecedoresTabela);
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
        window.showConfirm(`Deseja ${acao} este fornecedor?`, async () => {
        try {
            const r = await api('PATCH', `/api/fornecedores/${id}/toggle-ativo`);
            await carregarFornecedores(document.querySelector('#page-fornecedores input[type="text"]')?.value.trim());
            showToast(`Fornecedor ${r.ativo ? 'ativado' : 'desativado'}`);
        } catch (e) { window.showAlert(e.message, 'Erro'); }
        });
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
        } catch (e) { window.showAlert(e.message, 'Erro'); }
    }

    // ===================== VEÍCULOS =====================
    async function carregarVeiculos(busca) {
        const params = new URLSearchParams();
        if (busca) params.set('q', busca);
        if (state.mostrarInativosVeiculos) params.set('incluir_inativos', 'true');
        const url = '/api/veiculos' + (params.toString() ? '?' + params.toString() : '');
        const rows = await api('GET', url);
        rows.sort((a, b) => b.id - a.id);
        state.veiculos = rows;
        _setPage('vehicles', 1);
        renderVeiculosTabela();
    }
    function renderVeiculosTabela() {
        const rows = state.veiculos;
        const tbody = document.querySelector('.vehicles-table tbody');
        if (!tbody) return;
        const { paged, current, total } = paginateRows(rows, 'vehicles');
        tbody.innerHTML = paged.length ? paged.map(v => {
            const inativo = !v.ativo;
            return `
            <tr style="${inativo ? 'opacity:0.45;' : ''}">
                <td>${v.imagem
                    ? `<img class="vehicle-img-table" src="/static/uploads/${escapeHtml(v.imagem)}" alt="">`
                    : `<div class="vehicle-no-img"><i data-lucide="image-off"></i></div>`}</td>
                <td><strong>${escapeHtml(v.placa || 'Sem placa')}</strong></td>
                <td>${escapeHtml((v.marca || '') + ' ' + (v.modelo || ''))}</td>
                <td>${escapeHtml(v.ano || '')}</td>
                <td>${fmtNumPt(v.km)}</td>
                <td>${escapeHtml(v.motorizacao || '')}</td>
                <td><span class="badge badge-${inativo ? 'cancelado' : 'paga'}">${inativo ? 'Inativo' : 'Ativo'}</span></td>
                <td class="actions-cell">
                    <button class="btn-icon btn-action-purple" onclick="visualizarVeiculoImagens(${v.id})" title="Visualizar imagens"><i data-lucide="eye"></i></button>
                    <button class="btn-icon btn-action-blue" onclick="editarVeiculo(${v.id})" title="Editar"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon ${inativo ? 'btn-action-green' : 'btn-action-orange'}" onclick="toggleVeiculo(${v.id})" title="${inativo ? 'Ativar' : 'Desativar'}"><i data-lucide="${inativo ? 'circle-check' : 'shield-off'}"></i></button>
                </td>
            </tr>`;
        }).join('') : `<tr><td colspan="8" style="text-align:center;color:#777">Nenhum veículo cadastrado.</td></tr>`;
        renderPagination('vehicles', current, total, renderVeiculosTabela);
        refreshIcons();
    }

    window.editarVeiculo = function(id) {
        const v = state.veiculos.find(x => x.id === id);
        if (!v) return;
        state.editandoVeiculo = v;
        const m = document.getElementById('modal-veiculo');
        m.querySelector('.modal-title').innerText = 'Editar Veículo';
        
        m.querySelector('#veiculo-placa').value = v.placa || '';
        m.querySelector('#veiculo-marca').value = v.marca || '';
        m.querySelector('#veiculo-modelo').value = v.modelo || '';
        m.querySelector('#veiculo-ano').value = v.ano || '';
        m.querySelector('#veiculo-km').value = v.km || 0;
        m.querySelector('#veiculo-motorizacao').value = v.motorizacao || '';
        m.querySelector('#veiculo-cor').value = v.cor || '';
        m.querySelector('#veiculo-combustivel').value = v.combustivel || '';

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
    let carrosselImagens = [];
    let carrosselIndex = 0;

    function atualizarCarrosselVisualizacao() {
        const imgEl = document.getElementById('veiculo-carrossel-img');
        const semImg = document.getElementById('veiculo-carrossel-vazio');
        const infoEl = document.getElementById('veiculo-carrossel-info');
        const btnPrev = document.getElementById('veiculo-carrossel-prev');
        const btnNext = document.getElementById('veiculo-carrossel-next');

        if (!imgEl || !semImg || !infoEl || !btnPrev || !btnNext) return;

        if (!carrosselImagens.length) {
            imgEl.style.display = 'none';
            semImg.style.display = 'flex';
            infoEl.style.display = 'none';
            btnPrev.style.display = 'none';
            btnNext.style.display = 'none';
        } else {
            semImg.style.display = 'none';
            imgEl.style.display = 'block';
            imgEl.src = carrosselImagens[carrosselIndex];
            
            infoEl.style.display = 'block';
            infoEl.textContent = `Imagem ${carrosselIndex + 1} de ${carrosselImagens.length}`;

            if (carrosselImagens.length > 1) {
                btnPrev.style.display = 'flex';
                btnNext.style.display = 'flex';
            } else {
                btnPrev.style.display = 'none';
                btnNext.style.display = 'none';
            }
        }
    }

    window.carrosselVisualizacaoMudar = function(direcao) {
        if (!carrosselImagens.length) return;
        carrosselIndex += direcao;
        if (carrosselIndex < 0) {
            carrosselIndex = carrosselImagens.length - 1;
        } else if (carrosselIndex >= carrosselImagens.length) {
            carrosselIndex = 0;
        }
        atualizarCarrosselVisualizacao();
    };

    window.visualizarVeiculoImagens = function(id) {
        const v = state.veiculos.find(x => x.id === id);
        if (!v) return;
        
        carrosselImagens = ['imagem', 'imagem2', 'imagem3']
            .map(col => v[col])
            .filter(img => !!img)
            .map(img => `/static/uploads/${img}`);
            
        carrosselIndex = 0;
        atualizarCarrosselVisualizacao();
        window.openModal('modal-veiculo-imagens');
    };

    window.toggleVeiculo = async function(id) {
        const v = state.veiculos.find(x => x.id === id);
        const acao = v && v.ativo ? 'desativar' : 'ativar';
        window.showConfirm(`Deseja ${acao} este veículo?`, async () => {
        try {
            const r = await api('PATCH', `/api/veiculos/${id}/toggle-ativo`);
            await carregarVeiculos(document.querySelector('#page-veiculos input[type="text"]')?.value.trim());
            showToast(`Veículo ${r.ativo ? 'ativado' : 'desativado'}`);
        } catch (e) { window.showAlert(e.message, 'Erro'); }
        });
    };

    function _setSlotPreview(slot, src) {
        const file = slot.querySelector('input[type="file"]');
        slot.innerHTML = '';
        const img = document.createElement('img');
        img.src = src;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        slot.appendChild(img);
        // Delete button overlay
        const del = document.createElement('button');
        del.type = 'button';
        del.title = 'Remover imagem';
        del.style.cssText = 'position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;background:rgba(239,68,68,0.9);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none;font-size:14px;line-height:1;z-index:2;';
        del.innerHTML = '×';
        const slotIdx = slot.dataset.slot;
        const col = ['imagem','imagem2','imagem3'][parseInt(slotIdx) - 1];
        del.onclick = (e) => { e.stopPropagation(); deleteImageFromSlot(slot, col); };
        slot.appendChild(del);
        if (file) slot.appendChild(file);
    }
    async function deleteImageFromSlot(slot, col) {
        if (!state.editandoVeiculo) {
            _resetSlot(slot);
            return;
        }
        try {
            await api('DELETE', `/api/veiculos/${state.editandoVeiculo.id}/imagem/${col}`);
            _resetSlot(slot);
            showToast('Imagem removida');
        } catch(e) { showToast('Erro ao remover imagem', true); }
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
        const fd = new FormData();
        
        const placa = m.querySelector('#veiculo-placa').value.trim();
        const marca = m.querySelector('#veiculo-marca').value.trim();
        const modelo = m.querySelector('#veiculo-modelo').value.trim();
        const ano = m.querySelector('#veiculo-ano').value || '';
        const km = m.querySelector('#veiculo-km').value || '0';
        const motorizacao = m.querySelector('#veiculo-motorizacao').value.trim();
        const cor = m.querySelector('#veiculo-cor').value.trim();
        const combustivel = m.querySelector('#veiculo-combustivel').value.trim();

        fd.append('placa', placa);
        fd.append('marca', marca);
        fd.append('modelo', modelo);
        fd.append('ano', ano);
        fd.append('km', km);
        fd.append('motorizacao', motorizacao);
        fd.append('cor', cor);
        fd.append('combustivel', combustivel);

        // Imagens: imagem, imagem2, imagem3
        ['imagem','imagem2','imagem3'].forEach((col, idx) => {
            const slot = m.querySelector(`.vehicle-img-slot[data-slot="${idx+1}"]`);
            const f = slot?.querySelector('input[type="file"]');
            if (f && f.files && f.files[0]) fd.append(col, f.files[0]);
        });
        
        if (!marca && !modelo) return showToast('Informe pelo menos a marca ou modelo', true);
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
        } catch (e) { window.showAlert(e.message, 'Erro'); }
    }

    // ===================== INTEGRACAO API PLACAS =====================
    function formatarPlacaInput(input) {
        if (!input) return;
        input.addEventListener('input', (e) => {
            let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (val.length > 7) val = val.substring(0, 7);
            e.target.value = val;
        });
    }

    async function buscarDadosPlaca(placa) {
        if (placa.length !== 7) {
            showToast('A placa deve conter 7 caracteres alfanuméricos!', true);
            return null;
        }
        try {
            showToast('Buscando dados da placa...');
            const res = await api('GET', `/api/consulta-placa/${placa}`);
            console.log("DADOS DO VEICULO RETORNADOS PELA API:", res);
            return res;
        } catch (e) {
            console.error("ERRO AO CONSULTAR PLACA:", e);
            window.showAlert(e.message || 'Erro ao buscar dados da placa. Verifique o formato e tente novamente.', 'Erro');
            return null;
        }
    }

    function preencherModalVeiculoComDados(dados) {
        resetarModalVeiculo();
        const m = document.getElementById('modal-veiculo');
        if (!m) return;
        
        m.querySelector('#veiculo-placa').value = dados.placa || '';
        m.querySelector('#veiculo-marca').value = dados.marca || '';
        m.querySelector('#veiculo-modelo').value = dados.modelo || '';
        m.querySelector('#veiculo-ano').value = dados.ano || '';
        m.querySelector('#veiculo-cor').value = dados.cor || '';
        m.querySelector('#veiculo-combustivel').value = dados.combustivel || '';
        m.querySelector('#veiculo-motorizacao').value = dados.motorizacao || '';
        m.querySelector('#veiculo-km').value = '';
    }

    function initPlacaBusca() {
        const buscaInput = document.getElementById('placa-busca-input');
        const buscaBtn = document.getElementById('btn-placa-busca-enviar');
        const buscaPular = document.getElementById('btn-placa-busca-pular');
        
        const modalPlaca = document.getElementById('veiculo-placa');
        const modalPlacaBtn = document.getElementById('btn-veiculo-buscar-placa');

        formatarPlacaInput(buscaInput);
        formatarPlacaInput(modalPlaca);

        // Click search in lookup modal
        if (buscaBtn) {
            buscaBtn.onclick = async () => {
                const placaVal = (buscaInput.value || '').trim();
                if (placaVal.length !== 7) {
                    return showToast('Preencha os 7 caracteres da placa!', true);
                }
                buscaBtn.disabled = true;
                const originalText = buscaBtn.innerHTML;
                buscaBtn.innerHTML = 'Buscando...';
                
                const dados = await buscarDadosPlaca(placaVal);
                
                buscaBtn.disabled = false;
                buscaBtn.innerHTML = originalText;
                
                if (dados) {
                    window.closeModal('modal-placa-busca');
                    state.pularPlacaBusca = true;
                    window.openModal('modal-veiculo');
                    state.pularPlacaBusca = false;
                    preencherModalVeiculoComDados(dados);
                }
            };
        }

        // Search trigger inside lookup modal on Enter
        if (buscaInput) {
            buscaInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (buscaBtn) buscaBtn.click();
                }
            });
        }

        // Click skip link
        if (buscaPular) {
            buscaPular.onclick = (e) => {
                e.preventDefault();
                window.closeModal('modal-placa-busca');
                state.pularPlacaBusca = true;
                window.openModal('modal-veiculo');
                state.pularPlacaBusca = false;
                resetarModalVeiculo();
            };
        }

        // Yellow magnifying glass button trigger in registration modal
        if (modalPlacaBtn) {
            modalPlacaBtn.onclick = async () => {
                const placaVal = (modalPlaca.value || '').trim();
                if (placaVal.length !== 7) {
                    return showToast('Digite os 7 caracteres da placa para buscar!', true);
                }
                modalPlacaBtn.disabled = true;
                modalPlacaBtn.style.opacity = '0.5';
                
                const dados = await buscarDadosPlaca(placaVal);
                
                modalPlacaBtn.disabled = false;
                modalPlacaBtn.style.opacity = '1';
                
                if (dados) {
                    const kmVal = document.getElementById('veiculo-km').value;
                    preencherModalVeiculoComDados(dados);
                    document.getElementById('veiculo-km').value = kmVal;
                }
            };
        }
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
        rows.sort((a, b) => b.id - a.id);
        state.os = rows;
        _setPage('os', 1);
        renderOSTabela();
    }
    function renderOSTabela() {
        const rows = state.os;
        const tbody = document.querySelector('.os-table tbody');
        if (tbody) {
            const { paged, current, total } = paginateRows(rows, 'os');
            tbody.innerHTML = paged.length ? paged.map(o => `
            <tr>
                <td><strong>${String(o.numero).padStart(6,'0')}</strong></td>
                <td>${escapeHtml(o.nome_completo)}</td>
                <td>${escapeHtml((o.marca||'') + ' ' + (o.modelo||''))}</td>
                <td>${escapeHtml(o.placa || 'Não informado')}</td>
                <td>${fmtDataBR(o.data_emissao)}</td>
                <td style="color: #e74c3c; font-weight: 500;">${fmtBRL(o.gastos_pecas || 0)}</td>
                <td style="color: #3498db; font-weight: 500;">${fmtBRL((Number(o.cobrado_pecas) || 0) + (Number(o.valor_mao_obra) || 0))}</td>
                <td style="color: #2ecc71; font-weight: 500;">${fmtBRL(((Number(o.cobrado_pecas) || 0) + (Number(o.valor_mao_obra) || 0)) - (Number(o.gastos_pecas) || 0))}</td>
                <td><span class="badge ${o.status === 'Paga' ? 'badge-paga' : 'badge-pendente'}">${o.status}</span></td>
                <td class="actions-cell">
                    <button class="btn-icon btn-action-blue" title="Visualizar" onclick="window.visualizarOS('${o.slug || o.id}')"><i data-lucide="eye"></i></button>
                    <button class="btn-icon btn-action-gray" title="Imprimir A4" onclick="window.printOS('${o.slug || o.id}')"><i data-lucide="printer"></i></button>
                    <button class="btn-icon btn-action-purple" title="Imprimir Cupom" onclick="window.imprimirCupom('${o.slug || o.id}')"><i data-lucide="file-text"></i></button>
                    <button class="btn-icon btn-action-orange" title="Baixar PDF" onclick="window.baixarOSPDF('${o.slug || o.id}')"><i data-lucide="download"></i></button>
                    <button class="btn-icon btn-action-green" title="Compartilhar" onclick="enviarWhatsapp(${o.id})"><i data-lucide="share-2"></i></button>
                    <button class="btn-icon ${o.status === 'Paga' ? 'btn-action-yellow' : 'btn-action-green'}" title="${o.status === 'Paga' ? 'Marcar Pendente' : 'Marcar Paga'}" onclick="alternarStatusOS(${o.id}, '${o.status}')"><i data-lucide="${o.status === 'Paga' ? 'rotate-ccw' : 'check'}"></i></button>
                    ${o.status === 'Paga' ? '' : `<button class="btn-icon btn-action-red" title="Excluir" onclick="excluirOS(${o.id})"><i data-lucide="trash-2"></i></button>`}
                </td>
            </tr>`).join('') : `<tr><td colspan="10" style="text-align:center;color:#777">Nenhum comprovante.</td></tr>`;
            renderPagination('os', current, total, renderOSTabela);
            refreshIcons();
        }
    }

    function atualizarBotoesFiltroFinanceiro() {
        const periodBtn = document.querySelector('#page-financeiro .calendar-period-trigger');
        const allBtn = document.querySelector('#page-financeiro .financial-all-period-btn');
        const allSelected = Number(state.financeiroFiltroMes) === 0;
        if (periodBtn) periodBtn.classList.toggle('active', !allSelected);
        if (allBtn) allBtn.classList.toggle('active', allSelected);
    }

    window.alternarStatusOS = async function(id, statusAtual) {
        const novo = statusAtual === 'Paga' ? 'Pendente' : 'Paga';
        try {
            await api('PUT', `/api/os/${id}/status`, { status: novo });
            await carregarOS();
            showToast(`Status atualizado para ${novo}`);
        } catch (e) { window.showAlert(e.message, 'Erro'); }
    };

    window.toggleOS = async function(id) {
        const o = state.os.find(x => x.id === id);
        const acao = o && o.ativo ? 'desativar' : 'ativar';
        window.showConfirm(`Deseja ${acao} este comprovante?`, async () => {
        try {
            const r = await api('PATCH', `/api/os/${id}/toggle-ativo`);
            await carregarOS();
            showToast(`OS ${r.ativo ? 'ativada' : 'desativada'}`);
        } catch (e) { window.showAlert(e.message, 'Erro'); }
        });
    };

    window.excluirOS = async function(id) {
        window.showConfirm('Deseja realmente excluir este comprovante? Esta ação não pode ser desfeita.', async () => {
        try {
            await api('DELETE', `/api/os/${id}`);
            await carregarOS();
            showToast('Comprovante excluído com sucesso');
        } catch (e) { window.showAlert(e.message, 'Erro'); }
        });
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
        const slug = o.slug || id;
        const baseUrl = window.PUBLIC_BASE_URL || window.location.origin;
        const url = `${baseUrl}/comprovante-pagamento/${slug}?preview=1`;
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
        window.openModal('modal-seletor-fornecedor');
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
        window.closeModal('modal-seletor-fornecedor');
    }

    window.limparFornecedorSelecionado = function() {
        if (!_fornecedorPickerTarget) return;
        const hidden = _fornecedorPickerTarget.querySelector('.peca-fornecedor-id');
        const label = _fornecedorPickerTarget.querySelector('.peca-fornecedor-label');
        if (hidden) hidden.value = '';
        if (label) { label.textContent = 'Selecione...'; label.style.color = 'var(--text-muted)'; }
        window.closeModal('modal-seletor-fornecedor');
    };

    function setupModalNovaOS() {
        const m = document.getElementById('modal-nova-os');
        if (!m) return;

        // Botão "Adicionar Peça" - abre modal de peça
        const btnAddPeca = m.querySelector('.btn-secondary');
        if (btnAddPeca) {
            btnAddPeca.onclick = () => window.openPecaOSModal();
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
        const inputCliente = m.querySelector('input[placeholder="Nome ou CPF..."]');
        const inputVeiculo = m.querySelector('input[placeholder="ABC1D23"]');
        if (!inputCliente || !inputVeiculo) return;

        let dropdown1 = criarDropdown(inputCliente, async (q) => {
            const arr = await api('GET', '/api/clientes?q=' + encodeURIComponent(q));
            return arr.map(c => ({ label: `${c.nome_completo} - ${c.cpf || 'CPF não informado'}`, value: c.id, raw: c }));
        }, (item) => {
            state.novaOSCliente = item.raw;
            inputCliente.value = `${item.raw.nome_completo} - ${item.raw.cpf || 'CPF não informado'}`;
        });
        let dropdown2 = criarDropdown(inputVeiculo, async (q) => {
            const arr = await api('GET', '/api/veiculos?q=' + encodeURIComponent(q));
            return arr.map(v => ({ label: `${v.placa||'Sem placa'} - ${v.marca||''} ${v.modelo||''}`, value: v.id, raw: v }));
        }, (item) => {
            state.novaOSVeiculo = item.raw;
            inputVeiculo.value = `${item.raw.placa||'Sem placa'} - ${item.raw.marca||''} ${item.raw.modelo||''}`;
        });
    }

    function criarDropdown(inputEl, fetcher, onPick) {
        const wrap = inputEl.parentElement;
        wrap.style.position = 'relative';
        const list = document.createElement('div');
        list.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:#1a1a1a;border-radius:8px;margin-top:4px;max-height:200px;overflow-y:auto;z-index:100;display:none;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
        wrap.appendChild(list);
        let timer;
        
        const updateList = async () => {
            const q = inputEl.value.trim();
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
        };

        inputEl.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(updateList, 200);
        });

        inputEl.addEventListener('focus', () => {
            clearTimeout(timer);
            updateList();
        });

        inputEl.addEventListener('click', (e) => {
            e.stopPropagation();
            clearTimeout(timer);
            updateList();
        });

        document.addEventListener('click', (e) => {
            if (!wrap.contains(e.target)) list.style.display = 'none';
        });
        return list;
    }

    // ===================== COTAÇÃO AUTOPEÇAS =====================
    async function carregarOrcamento() {
        await carregarFornecedoresCache();
        await carregarCotacoes();
    }

    // --- Tabela de Cotações ---
    async function carregarCotacoes() {
        try {
            const rows = await api('GET', '/api/orcamentos');
            rows.sort((a, b) => b.id - a.id);
            state.cotacoes = rows;
        } catch(_) { state.cotacoes = []; }
        renderCotacoesTabela();
    }

    function renderCotacoesTabela() {
        const tbody = document.getElementById('cotacoes-tbody');
        if (!tbody) return;
        const search = (document.getElementById('cotacao-search')?.value || '').toLowerCase();
        const arr = (state.cotacoes || []).filter(c => {
            if (!search) return true;
            return (c.placa || '').toLowerCase().includes(search) ||
                   (c.marca || '').toLowerCase().includes(search) ||
                   (c.modelo || '').toLowerCase().includes(search) ||
                   String(c.id).includes(search);
        });
        if (!arr.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#777">Nenhuma cotação cadastrada.</td></tr>';
            refreshIcons();
            return;
        }
        tbody.innerHTML = arr.map(c => `
            <tr>
                <td><strong>${String(c.id).padStart(6, '0')}</strong></td>
                <td>${escapeHtml((c.marca || '') + ' ' + (c.modelo || ''))}</td>
                <td>${escapeHtml(c.placa || '-')}</td>
                <td>${fmtDataBR(c.criado_em)}</td>
                <td class="actions-cell">
                    <button class="btn-icon btn-action-blue" title="Visualizar" onclick="window.visualizarCotacao('${c.slug || c.id}')"><i data-lucide="eye"></i></button>
                    <button class="btn-icon btn-action-orange" title="Baixar PDF" onclick="window.baixarCotacaoPDF('${c.slug || c.id}')"><i data-lucide="download"></i></button>
                    <button class="btn-icon btn-action-green" title="Compartilhar" onclick="window.compartilharCotacao(${c.id})"><i data-lucide="share-2"></i></button>
                    <button class="btn-icon btn-action-purple" title="Editar" onclick="window.editarCotacao(${c.id})"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon btn-action-red" title="Excluir" onclick="window.excluirCotacao(${c.id})"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>`).join('');
        refreshIcons();
    }

    window.filtrarCotacoes = function() { renderCotacoesTabela(); };

    window.visualizarCotacao = function(slug) {
        window.open('/solicitacao-orcamento/' + slug + '?preview=1', '_blank');
    };
    window.baixarCotacaoPDF = function(slug) {
        window.open('/solicitacao-orcamento/' + slug + '?baixar=1', '_blank');
    };

    // --- Modal Nova Cotação ---
    window.abrirModalNovaCotacao = function() {
        state.orcamentoVeiculo = null;
        state.editandoCotacao = null;
        document.getElementById('cotacao-edit-id').value = '';
        document.getElementById('cotacao-veiculo-busca').value = '';
        document.getElementById('orcamento-mensagem').value = 'Opa, bom dia!\n\nGostaría de solicitar um orçamento para as peças/produtos do veículo abaixo';
        document.getElementById('modal-nova-cotacao-titulo').innerText = 'Nova Cotação';
        // Reset pecas
        const pecasBody = document.getElementById('orcamento-pecas');
        if (pecasBody) pecasBody.innerHTML = '<tr class="orcamento-empty-row"><td colspan="3">Nenhuma peça/produto adicionado</td></tr>';
        openModal('modal-nova-cotacao');
    };

    window.editarCotacao = async function(id) {
        try {
            const c = (state.cotacoes || []).find(x => x.id === id);
            if (!c) return;
            document.getElementById('cotacao-edit-id').value = id;
            document.getElementById('modal-nova-cotacao-titulo').innerText = 'Editar Cotação #' + String(id).padStart(6, '0');
            // Set vehicle
            if (c.veiculo_id) {
                const arr = await api('GET', '/api/veiculos?q=' + (c.placa || ''));
                const v = (arr || []).find(x => x.id === c.veiculo_id);
                if (v) {
                    state.orcamentoVeiculo = v;
                    document.getElementById('cotacao-veiculo-busca').value = `${v.placa||'Sem placa'} - ${v.marca||''} ${v.modelo||''}`;
                }
            }
            // Set pecas
            const pecasBody = document.getElementById('orcamento-pecas');
            if (pecasBody) pecasBody.innerHTML = '<tr class="orcamento-empty-row"><td colspan="3">Nenhuma peça/produto adicionado</td></tr>';
            const pecas = (typeof c.pecas === 'string') ? JSON.parse(c.pecas) : (c.pecas || []);
            pecas.forEach(p => {
                window.adicionarPecaOrcamento();
                const rows = document.querySelectorAll('#orcamento-pecas .orcamento-peca-row');
                const lastRow = rows[rows.length - 1];
                if (lastRow) {
                    lastRow.querySelector('.orcamento-peca-nome').value = p.nome || '';
                    lastRow.querySelector('.orcamento-peca-qtd').value = p.quantidade || 1;
                }
            });
            // Set mensagem
            document.getElementById('orcamento-mensagem').value = c.mensagem || 'Opa, bom dia!\n\nGostaría de solicitar um orçamento para as peças/produtos do veículo abaixo';
            openModal('modal-nova-cotacao');
        } catch(e) { window.showAlert(e.message, 'Erro'); }
    };

    window.excluirCotacao = async function(id) {
        window.showConfirm('Tem certeza que deseja excluir esta cotação?', async () => {
            try {
                await api('DELETE', `/api/orcamentos/${id}`);
                showToast('Cotação excluída');
                await carregarCotacoes();
            } catch(e) { window.showAlert(e.message, 'Erro'); }
        }, 'Excluir Cotação');
    };

    async function salvarCotacaoDados() {
        if (!state.orcamentoVeiculo) {
            const txt = (document.getElementById('cotacao-veiculo-busca')?.value || '').trim();
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
        const mensagem = document.getElementById('orcamento-mensagem')?.value.trim() || '';
        const editId = document.getElementById('cotacao-edit-id')?.value;
        const payload = {
            veiculo_id: state.orcamentoVeiculo.id,
            pecas,
            mensagem,
        };
        let slug = null;
        if (editId) {
            await api('PUT', `/api/orcamentos/${editId}`, payload);
            const c = (state.cotacoes || []).find(x => x.id === parseInt(editId));
            slug = c?.slug || null;
        } else {
            const r = await api('POST', '/api/orcamentos/anexo', payload);
            slug = r.slug || null;
        }
        return { editId, slug };
    }

    window.salvarCotacao = async function() {
        try {
            await salvarCotacaoDados();
            showToast('Cotação salva');
            closeModal('modal-nova-cotacao');
            await carregarCotacoes();
        } catch(e) { window.showAlert(e.message, 'Erro'); }
    };

    // --- Compartilhar Cotação (modal de fornecedores) ---
    window.compartilharCotacao = async function(id) {
        const c = (state.cotacoes || []).find(x => x.id === id);
        if (!c) return;
        document.getElementById('compartilhar-cotacao-id').value = id;
        renderFornecedoresCompartilhar();
        openModal('modal-compartilhar-cotacao');
    };

    function renderFornecedoresCompartilhar() {
        const wrap = document.getElementById('compartilhar-fornecedores');
        if (!wrap) return;
        const arr = (state.fornecedores || []).filter(f => f.ativo);
        wrap.innerHTML = arr.length ? arr.map(f => `
            <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--bg-input);padding:12px 14px;border-radius:var(--border-radius);cursor:pointer;color:var(--text-main);">
                <span style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;">
                    <strong style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(f.nome)}</strong>
                    <small style="color:var(--text-muted);">${escapeHtml(f.whatsapp || '')}</small>
                </span>
                <input type="checkbox" value="${f.id}" style="width:16px;height:16px;accent-color:#ffe54c;flex:0 0 auto;">
            </label>`).join('') : '<div style="color:var(--text-muted);">Nenhum fornecedor ativo cadastrado.</div>';
        refreshIcons();
    }

    window.toggleSelecionarTodosFornecedoresCompartilhar = function() {
        const checkboxes = Array.from(document.querySelectorAll('#compartilhar-fornecedores input[type="checkbox"]'));
        if (!checkboxes.length) return;
        const todosMarcados = checkboxes.every(input => input.checked);
        checkboxes.forEach(input => {
            input.checked = !todosMarcados;
        });
    };

    window.enviarCotacaoFornecedores = async function() {
        const fornIds = Array.from(document.querySelectorAll('#compartilhar-fornecedores input[type="checkbox"]:checked')).map(i => parseInt(i.value, 10));
        const fornecedores = (state.fornecedores || []).filter(f => fornIds.includes(f.id));
        if (!fornecedores.length) return showToast('Selecione ao menos um fornecedor', true);
        const cotacaoId = parseInt(document.getElementById('compartilhar-cotacao-id')?.value);
        const c = (state.cotacoes || []).find(x => x.id === cotacaoId);
        if (!c || !c.slug) return showToast('Cotação não encontrada', true);
        const janelas = fornecedores.map(f => {
            const fone = String(f.whatsapp || '').replace(/\D/g, '');
            if (!fone) return null;
            return { fone, win: window.open('about:blank', '_blank') };
        });
        if (janelas.some(j => j && !j.win)) {
            showToast('Permita pop-ups para abrir todas as abas', true);
        }
        try {
            const baseUrl = window.PUBLIC_BASE_URL || window.location.origin;
            const anexoUrl = baseUrl + '/solicitacao-orcamento/' + c.slug;
            const mensagemBase = c.mensagem || 'Opa, bom dia!\n\nGostaría de solicitar um orçamento para as peças/produtos do veículo abaixo';
            const msg = `${mensagemBase}\n\n${anexoUrl}`;
            janelas.forEach(j => {
                if (!j || !j.win) return;
                j.win.location = `https://wa.me/55${j.fone}?text=${encodeURIComponent(msg)}`;
            });
            closeModal('modal-compartilhar-cotacao');
        } catch(e) {
            janelas.forEach(j => j && j.win && j.win.close());
            window.showAlert(e.message, 'Erro');
        }
    };

    function renderFornecedoresOrcamento() {
        // kept for compatibility but no longer used in modal-nova-cotacao
    }

    window.toggleSelecionarTodosFornecedoresOrcamento = function() {
        // kept for compatibility
    };

    window.adicionarPecaOrcamento = function() {
        const wrap = document.getElementById('orcamento-pecas');
        if (!wrap) return;
        const empty = wrap.querySelector('.orcamento-empty-row');
        if (empty) empty.remove();
        const row = document.createElement('tr');
        row.className = 'orcamento-peca-row';
        row.innerHTML = `
            <td><input type="text" class="orcamento-peca-nome" placeholder="Nome da peça/produto"></td>
            <td><input type="number" class="orcamento-peca-qtd" placeholder="Qtd" min="1"></td>
            <td><button type="button" class="btn-icon" title="Excluir linha" style="color:#e74c3c;height:42px;width:42px;display:inline-flex;align-items:center;justify-content:center;"><i data-lucide="trash-2"></i></button></td>`;
        row.querySelector('button').onclick = () => {
            row.remove();
            renderEstadoVazioOrcamento();
        };
        wrap.appendChild(row);
        refreshIcons();
    };

    function renderEstadoVazioOrcamento() {
        const wrap = document.getElementById('orcamento-pecas');
        if (!wrap) return;
        if (wrap.querySelector('.orcamento-peca-row')) return;
        wrap.innerHTML = '<tr class="orcamento-empty-row"><td colspan="3">Nenhuma peça/produto adicionado</td></tr>';
    }

    function coletarPecasOrcamento() {
        return Array.from(document.querySelectorAll('#orcamento-pecas .orcamento-peca-row')).map(row => ({
            nome: row.querySelector('.orcamento-peca-nome')?.value.trim(),
            quantidade: parseInt(row.querySelector('.orcamento-peca-qtd')?.value || 0, 10),
        })).filter(p => p.nome && p.quantidade > 0);
    }

    function setupOrcamentoPage() {
        const input = document.getElementById('cotacao-veiculo-busca');
        if (!input) return;
        criarDropdown(input, async (q) => {
            const arr = await api('GET', '/api/veiculos?q=' + encodeURIComponent(q));
            return arr.map(v => ({ label: `${v.placa||'Sem placa'} - ${v.marca||''} ${v.modelo||''}`, value: v.id, raw: v }));
        }, (item) => {
            state.orcamentoVeiculo = item.raw;
            input.value = `${item.raw.placa||'Sem placa'} - ${item.raw.marca||''} ${item.raw.modelo||''}`;
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
        const arr = window.pecasOS || [];
        return arr.map(p => ({
            descricao: p.nome,
            fornecedor_id: p.fornecedor_id || null,
            quantidade: p.qtd,
            valor_custo: p.custo,
            lucro_percentual: p.lucro,
            desconto_percentual: p.desconto,
            valor_venda_sem_desconto: p.vendaSemDesconto,
            valor_desconto: p.valorDesconto,
            valor_venda: p.venda,
        }));
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
        } catch (e) { window.showAlert(e.message, 'Erro'); }
    }

    function resetarModalNovaOS() {
        state.novaOSCliente = null;
        state.novaOSVeiculo = null;
        const m = document.getElementById('modal-nova-os');
        if (!m) return;
        m.querySelectorAll('input').forEach(i => i.value = '');
        // Limpa lista de peças
        if (window.pecasOS) { window.pecasOS.length = 0; }
        if (window.renderPecasOSLista) window.renderPecasOSLista();
    }

    // ===================== PROPOSTAS DE ORÇAMENTO =====================

    window.pecasOrcamentoProposta = [];

    function renderPecasOrcamentoPropostaLista() {
        const cont = document.getElementById('orcamento-proposta-pecas-lista');
        if (!cont) return;
        const pecas = window.pecasOrcamentoProposta;
        if (!pecas.length) {
            cont.innerHTML = '<div style="background:var(--bg-input);border-radius:8px;padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Nenhum produto adicionado</div>';
        } else {
            cont.innerHTML = `
                <div style="background:var(--bg-input);border-radius:8px;">
                    <div style="display:grid;grid-template-columns:minmax(180px,2fr) 56px 110px 130px 110px 110px 90px;gap:10px;align-items:center;padding:12px;background:var(--primary);color:#000;font-size:12px;font-weight:700;text-transform:uppercase;text-align:center;position:sticky;top:0;z-index:1;border-radius:8px 8px 0 0;">
                        <div>Produto</div><div>Qtd</div><div>Compra</div><div>Sem desconto</div><div>Desconto</div><div>Venda</div><div>Ações</div>
                    </div>
                    ${pecas.map((p, i) => `
                        <div style="display:grid;grid-template-columns:minmax(180px,2fr) 56px 110px 130px 110px 110px 90px;gap:10px;align-items:center;padding:12px;border-top:1px solid rgba(255,255,255,0.04);">
                            <div style="text-align:center;font-weight:500;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p.nome}">${p.nome.length > 25 ? p.nome.slice(0, 25) + '...' : p.nome}</div>
                            <div style="text-align:center;font-weight:600;">${p.qtd}</div>
                            <div style="text-align:center;font-weight:600;">${fmtBRL(p.custo)}</div>
                            <div style="text-align:center;font-weight:600;">${fmtBRL(p.vendaSemDesconto)}</div>
                            <div style="text-align:center;font-weight:600;">${fmtBRL(p.valorDesconto)}</div>
                            <div style="text-align:center;color:#22c55e;font-weight:700;">${fmtBRL(p.venda)}</div>
                            <div style="display:flex;gap:8px;justify-content:center;">
                                <button type="button" class="btn-icon" onclick="window.editarPecaOrcamentoProposta(${i})" title="Editar" style="color:#f1c40f;"><i data-lucide="pencil" style="width:16px;height:16px;"></i></button>
                                <button type="button" class="btn-icon" onclick="window.removerPecaOrcamentoProposta(${i})" title="Remover" style="color:#e74c3c;"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>
                            </div>
                        </div>
                    `).join('')}
                </div>`;
        }
        refreshIcons();
    }

    window.removerPecaOrcamentoProposta = function(idx) {
        window.pecasOrcamentoProposta.splice(idx, 1);
        renderPecasOrcamentoPropostaLista();
    };

    window.editarPecaOrcamentoProposta = function(idx) {
        const p = window.pecasOrcamentoProposta[idx];
        if (!p) return;
        state.editandoPecaIdx = idx;
        
        document.getElementById('peca-proposta-nome').value = p.nome;
        document.getElementById('peca-proposta-qtd').value = p.qtd;
        document.getElementById('peca-proposta-custo').value = p.custo;
        document.getElementById('peca-proposta-lucro').value = p.lucro;
        document.getElementById('peca-proposta-desconto').value = p.desconto;
        
        document.getElementById('peca-proposta-venda-sem-desconto').value = 'R$ ' + p.vendaSemDesconto.toFixed(2).replace('.', ',');
        document.getElementById('peca-proposta-venda').value = p.venda.toFixed(2);
        
        document.getElementById('peca-proposta-fornecedor-id').value = p.fornecedor_id || '';
        const lbl = document.querySelector('#peca-proposta-fornecedor-btn .peca-fornecedor-label');
        if (lbl) {
            lbl.textContent = p.fornecedor_nome || 'Selecione...';
            lbl.style.color = p.fornecedor_nome ? 'var(--text-main)' : 'var(--text-muted)';
        }
        
        const modal = document.getElementById('modal-peca-orcamento-proposta');
        if (modal) {
            modal.querySelector('.modal-title').textContent = 'Editar Peça/Produto';
            modal.querySelector('.modal-footer .btn-primary').textContent = 'Salvar';
        }
        window.openModal('modal-peca-orcamento-proposta');
    };

    window.openPecaOrcamentoProposta = function() {
        state.editandoPecaIdx = null;
        document.getElementById('peca-proposta-nome').value = '';
        document.getElementById('peca-proposta-qtd').value = '';
        document.getElementById('peca-proposta-custo').value = '';
        document.getElementById('peca-proposta-lucro').value = '20';
        document.getElementById('peca-proposta-desconto').value = '5';
        document.getElementById('peca-proposta-venda-sem-desconto').value = '';
        document.getElementById('peca-proposta-venda').value = '';
        document.getElementById('peca-proposta-fornecedor-id').value = '';
        const lbl = document.querySelector('#peca-proposta-fornecedor-btn .peca-fornecedor-label');
        if (lbl) { lbl.textContent = 'Selecione...'; lbl.style.color = 'var(--text-muted)'; }
        
        const modal = document.getElementById('modal-peca-orcamento-proposta');
        if (modal) {
            modal.querySelector('.modal-title').textContent = 'Adicionar Peça/Produto';
            modal.querySelector('.modal-footer .btn-primary').textContent = 'Adicionar';
        }
        window.openModal('modal-peca-orcamento-proposta');
    };

    window.calcularVendaPecaOrcamentoProposta = function() {
        const custo = parseFloat(document.getElementById('peca-proposta-custo').value) || 0;
        const lucro = parseFloat(document.getElementById('peca-proposta-lucro').value) || 0;
        const desconto = parseFloat(document.getElementById('peca-proposta-desconto').value) || 0;
        const lucroFrac = lucro / 100;
        const descontoFrac = desconto / 100;
        if (custo > 0 && descontoFrac < 1) {
            const precoSemDesconto = custo * (1 + lucroFrac) / (1 - descontoFrac);
            const valorDesconto = precoSemDesconto * descontoFrac;
            const precoComDesconto = precoSemDesconto - valorDesconto;
            document.getElementById('peca-proposta-venda-sem-desconto').value = 'R$ ' + precoSemDesconto.toFixed(2).replace('.', ',');
            document.getElementById('peca-proposta-venda').value = precoComDesconto.toFixed(2);
        } else {
            document.getElementById('peca-proposta-venda-sem-desconto').value = '';
            document.getElementById('peca-proposta-venda').value = '';
        }
    };

    window.calcularLucroPecaOrcamentoProposta = function() {
        const custo = parseFloat(document.getElementById('peca-proposta-custo').value) || 0;
        const vendaFinal = parseFloat(document.getElementById('peca-proposta-venda').value) || 0;
        const desconto = parseFloat(document.getElementById('peca-proposta-desconto').value) || 0;
        const descontoFrac = desconto / 100;
        if (custo > 0 && vendaFinal >= 0) {
            const lucro = ((vendaFinal / custo) - 1) * 100;
            document.getElementById('peca-proposta-lucro').value = lucro.toFixed(2);
            if (descontoFrac < 1) {
                const precoSemDesconto = vendaFinal / (1 - descontoFrac);
                document.getElementById('peca-proposta-venda-sem-desconto').value = 'R$ ' + precoSemDesconto.toFixed(2).replace('.', ',');
            } else {
                document.getElementById('peca-proposta-venda-sem-desconto').value = '';
            }
        }
    };

    window.adicionarPecaOrcamentoProposta = function() {
        const nome = document.getElementById('peca-proposta-nome').value.trim();
        const qtd = parseInt(document.getElementById('peca-proposta-qtd').value, 10) || 0;
        const custo = parseFloat(document.getElementById('peca-proposta-custo').value) || 0;
        const lucro = parseFloat(document.getElementById('peca-proposta-lucro').value) || 0;
        const desconto = parseFloat(document.getElementById('peca-proposta-desconto').value) || 0;
        const fornecedorId = document.getElementById('peca-proposta-fornecedor-id').value || null;
        const fornecedorLabel = document.querySelector('#peca-proposta-fornecedor-btn .peca-fornecedor-label')?.textContent || '';
        if (!nome) { showToast('Informe o nome da peça/produto', true); return; }
        if (qtd <= 0) { showToast('Informe a quantidade', true); return; }
        if (custo <= 0) { showToast('Informe o valor de compra', true); return; }
        const lucroFrac = lucro / 100;
        const descontoFrac = desconto / 100;
        let precoSemDesconto = 0, valorDesconto = 0, precoComDesconto = 0;
        if (descontoFrac < 1) {
            precoSemDesconto = custo * (1 + lucroFrac) / (1 - descontoFrac);
            valorDesconto = precoSemDesconto * descontoFrac;
            precoComDesconto = precoSemDesconto - valorDesconto;
        }
        
        const peca = {
            nome, qtd, custo, lucro, desconto,
            vendaSemDesconto: precoSemDesconto,
            valorDesconto,
            venda: precoComDesconto,
            fornecedor_id: fornecedorId,
            fornecedor_nome: fornecedorLabel === 'Selecione...' ? '' : fornecedorLabel
        };

        if (state.editandoPecaIdx !== null && state.editandoPecaIdx !== undefined) {
            window.pecasOrcamentoProposta[state.editandoPecaIdx] = peca;
            state.editandoPecaIdx = null;
        } else {
            window.pecasOrcamentoProposta.push(peca);
        }

        renderPecasOrcamentoPropostaLista();
        window.closeModal('modal-peca-orcamento-proposta');
    };

    async function carregarPropostas(busca) {
        const params = new URLSearchParams();
        if (busca) params.set('q', busca);
        const url = '/api/propostas' + (params.toString() ? '?' + params.toString() : '');
        const rows = await api('GET', url);
        rows.sort((a, b) => b.id - a.id);
        state.orcamentosPropostas = rows;
        _setPage('propostas', 1);
        renderPropostasTabela();
    }
    function renderPropostasTabela() {
        const rows = state.orcamentosPropostas;
        const tbody = document.querySelector('.propostas-table tbody');
        if (!tbody) return;
        const { paged, current, total } = paginateRows(rows, 'propostas');
        tbody.innerHTML = paged.length ? paged.map(p => {
            const isAprovado = p.status === 'Aprovado';
            const statusClass = isAprovado ? 'badge-paga' : 'badge-pendente';
            return `
            <tr>
                <td><strong>${String(p.numero).padStart(6, '0')}</strong></td>
                <td>${escapeHtml(p.nome_completo)}</td>
                <td>${escapeHtml((p.marca || '') + ' ' + (p.modelo || ''))}</td>
                <td>${escapeHtml(p.placa || 'Não informado')}</td>
                <td>${fmtDataBR(p.criado_em)}</td>
                <td style="color: #e74c3c; font-weight: 500;">${fmtBRL(p.gastos_pecas || 0)}</td>
                <td style="color: #3498db; font-weight: 500;">${fmtBRL((Number(p.cobrado_pecas) || 0) + (Number(p.valor_mao_obra) || 0))}</td>
                <td style="color: #2ecc71; font-weight: 500;">${fmtBRL(((Number(p.cobrado_pecas) || 0) + (Number(p.valor_mao_obra) || 0)) - (Number(p.gastos_pecas) || 0))}</td>
                <td><span class="badge ${statusClass}">${p.status}</span></td>
                <td class="actions-cell">
                    <button class="btn-icon btn-action-blue" title="Visualizar" onclick="window.visualizarProposta(${p.id})"><i data-lucide="eye"></i></button>
                    <button class="btn-icon btn-action-orange" title="Baixar PDF" onclick="window.baixarPropostaPDF(${p.id})"><i data-lucide="download"></i></button>
                    <button class="btn-icon btn-action-green" title="Compartilhar" onclick="window.compartilharProposta(${p.id})"><i data-lucide="share-2"></i></button>
                    ${!isAprovado ? `<button class="btn-icon btn-action-purple" title="Editar" onclick="window.editarProposta(${p.id})"><i data-lucide="pencil"></i></button>` : ''}
                    ${!isAprovado ? `<button class="btn-icon btn-action-green" title="Aprovar" onclick="window.aprovarProposta(${p.id})"><i data-lucide="check-circle"></i></button>` : ''}
                    ${isAprovado ? `<button class="btn-icon btn-action-red" title="Desaprovar" onclick="window.desaprovarProposta(${p.id})"><i data-lucide="x-circle"></i></button>` : ''}
                    ${!isAprovado ? `<button class="btn-icon btn-action-red" title="Excluir" onclick="window.excluirProposta(${p.id})"><i data-lucide="trash-2"></i></button>` : ''}
                </td>
            </tr>`;
        }).join('') : `<tr><td colspan="10" style="text-align:center;color:#777">Nenhum orçamento cadastrado.</td></tr>`;
        renderPagination('propostas', current, total, renderPropostasTabela);
        refreshIcons();
    }

    function coletarPecasPropostasParaSalvar() {
        return (window.pecasOrcamentoProposta || []).map(p => ({
            descricao: p.nome,
            fornecedor_id: p.fornecedor_id || null,
            quantidade: p.qtd,
            valor_custo: p.custo,
            lucro_percentual: p.lucro,
            desconto_percentual: p.desconto,
            valor_venda_sem_desconto: p.vendaSemDesconto,
            valor_desconto: p.valorDesconto,
            valor_venda: p.venda,
        }));
    }

    async function salvarOrcamentoProposta() {
        if (!state.propostaCliente) return showToast('Selecione um cliente', true);
        if (!state.propostaVeiculo) return showToast('Selecione um veículo', true);
        const maoObra = parseFloat(document.getElementById('orcamento-proposta-mao-obra')?.value || 0);
        const pecas = coletarPecasPropostasParaSalvar();
        const propostaId = document.getElementById('orcamento-proposta-id')?.value;
        try {
            if (propostaId) {
                await api('PUT', `/api/propostas/${propostaId}`, {
                    cliente_id: state.propostaCliente.id,
                    veiculo_id: state.propostaVeiculo.id,
                    valor_mao_obra: maoObra,
                    pecas,
                });
                showToast('Orçamento atualizado');
            } else {
                const r = await api('POST', '/api/propostas', {
                    cliente_id: state.propostaCliente.id,
                    veiculo_id: state.propostaVeiculo.id,
                    valor_mao_obra: maoObra,
                    pecas,
                });
                showToast('Orçamento Nº ' + String(r.numero).padStart(6, '0') + ' criado');
            }
            window.closeModal('modal-novo-orcamento');
            resetarModalNovaProposta();
            await carregarPropostas();
        } catch (e) { window.showAlert(e.message, 'Erro'); }
    }

    function resetarModalNovaProposta() {
        state.propostaCliente = null;
        state.propostaVeiculo = null;
        state.editandoProposta = null;
        window.pecasOrcamentoProposta = [];
        const m = document.getElementById('modal-novo-orcamento');
        if (!m) return;
        const titulo = document.getElementById('modal-novo-orcamento-titulo');
        if (titulo) titulo.innerText = 'Novo Orçamento';
        const idInput = document.getElementById('orcamento-proposta-id');
        if (idInput) idInput.value = '';
        m.querySelectorAll('input[type="text"], input[type="number"]').forEach(i => { i.value = ''; });
        const btnSalvar = document.getElementById('btn-salvar-orcamento-proposta');
        if (btnSalvar) btnSalvar.innerText = 'Criar Orçamento';
        renderPecasOrcamentoPropostaLista();
    }

    window.visualizarProposta = async function(id) {
        const p = state.orcamentosPropostas.find(x => x.id === id);
        const slug = p && p.slug ? p.slug : id;
        window.open('/orcamento/' + slug + '?preview=1', '_blank');
    };

    window.baixarPropostaPDF = async function(id) {
        const p = state.orcamentosPropostas.find(x => x.id === id);
        const slug = p && p.slug ? p.slug : id;
        window.open('/orcamento/' + slug + '?baixar=1', '_blank');
    };

    window.compartilharProposta = async function(id) {
        const p = state.orcamentosPropostas.find(x => x.id === id);
        if (!p) return;
        let cliente = state.clientes.find(c => c.id === p.cliente_id);
        if (!cliente) {
            const arr = await api('GET', '/api/clientes');
            cliente = arr.find(c => c.id === p.cliente_id);
        }
        const fone = (cliente && cliente.whatsapp || '').replace(/\D/g, '');
        const slug = p.slug || id;
        const baseUrl = window.PUBLIC_BASE_URL || window.location.origin;
        const url = `${baseUrl}/orcamento/${slug}?preview=1`;
        const msg = encodeURIComponent(`Olá ${p.nome_completo}, segue seu Orçamento Nº ${String(p.numero).padStart(6,'0')}: ${url}`);
        const wpp = fone ? `https://wa.me/55${fone}?text=${msg}` : `https://wa.me/?text=${msg}`;
        window.open(wpp, '_blank');
    };

    window.editarProposta = async function(id) {
        try {
            const data = await api('GET', `/api/propostas/${id}`);
            const p = data.proposta;
            const pecas = data.pecas || [];
            state.editandoProposta = p;
            state.propostaCliente = { id: p.cliente_id, nome_completo: p.nome_completo, cpf: p.cpf };
            state.propostaVeiculo = { id: p.veiculo_id, placa: p.placa, marca: p.marca, modelo: p.modelo };
            window.pecasOrcamentoProposta = pecas.map(pc => ({
                nome: pc.descricao,
                qtd: pc.quantidade,
                custo: Number(pc.valor_custo),
                lucro: Number(pc.lucro_percentual),
                desconto: Number(pc.desconto_percentual),
                vendaSemDesconto: Number(pc.valor_venda_sem_desconto),
                valorDesconto: Number(pc.valor_desconto),
                venda: Number(pc.valor_venda),
                fornecedor_id: pc.fornecedor_id,
                fornecedor_nome: ''
            }));
            const titulo = document.getElementById('modal-novo-orcamento-titulo');
            if (titulo) titulo.innerText = 'Editar Orçamento';
            const idInput = document.getElementById('orcamento-proposta-id');
            if (idInput) idInput.value = p.id;
            const clienteInput = document.getElementById('orcamento-proposta-cliente-input');
            if (clienteInput) clienteInput.value = `${p.nome_completo} - ${p.cpf || 'CPF não informado'}`;
            const veiculoInput = document.getElementById('orcamento-proposta-veiculo-input');
            if (veiculoInput) veiculoInput.value = `${p.placa} - ${p.marca || ''} ${p.modelo || ''}`;
            const maoObraInput = document.getElementById('orcamento-proposta-mao-obra');
            if (maoObraInput) maoObraInput.value = p.valor_mao_obra;
            const btnSalvar = document.getElementById('btn-salvar-orcamento-proposta');
            if (btnSalvar) btnSalvar.innerText = 'Salvar Alterações';
            renderPecasOrcamentoPropostaLista();
            window.openModal('modal-novo-orcamento');
            refreshIcons();
        } catch (e) { window.showAlert(e.message, 'Erro'); }
    };

    window.excluirProposta = async function(id) {
        window.showConfirm('Deseja realmente excluir este orçamento?', async () => {
        try {
            await api('DELETE', `/api/propostas/${id}`);
            await carregarPropostas();
            showToast('Orçamento excluído');
        } catch (e) { window.showAlert(e.message, 'Erro'); }
        });
    };

    window.aprovarProposta = async function(id) {
        window.showConfirm('Ao aprovar, um comprovante será criado automaticamente. Confirma?', async () => {
        try {
            const r = await api('POST', `/api/propostas/${id}/aprovar`);
            showToast('Orçamento aprovado! Comprovante Nº ' + String(r.numero).padStart(6, '0') + ' criado');
            await carregarPropostas();
        } catch (e) { window.showAlert(e.message, 'Erro'); }
        });
    };

    window.desaprovarProposta = async function(id) {
        window.showConfirm('Deseja realmente desaprovar este orçamento? O comprovante associado será apagado.', async () => {
        try {
            await api('POST', `/api/propostas/${id}/desaprovar`);
            showToast('Orçamento desaprovado. Comprovante excluído.');
            await carregarPropostas();
            if (window.carregarOS) {
                await window.carregarOS();
            }
        } catch (e) { window.showAlert(e.message, 'Erro'); }
        });
    };

    function setupModalNovaProposta() {
        const m = document.getElementById('modal-novo-orcamento');
        if (!m) return;
        const inputCliente = document.getElementById('orcamento-proposta-cliente-input');
        const inputVeiculo = document.getElementById('orcamento-proposta-veiculo-input');
        if (!inputCliente || !inputVeiculo) return;
        criarDropdown(inputCliente, async (q) => {
            const arr = await api('GET', '/api/clientes?q=' + encodeURIComponent(q));
            return arr.map(c => ({ label: `${c.nome_completo} - ${c.cpf || 'CPF não informado'}`, value: c.id, raw: c }));
        }, (item) => {
            state.propostaCliente = item.raw;
            inputCliente.value = `${item.raw.nome_completo} - ${item.raw.cpf || 'CPF não informado'}`;
        });
        criarDropdown(inputVeiculo, async (q) => {
            const arr = await api('GET', '/api/veiculos?q=' + encodeURIComponent(q));
            return arr.map(v => ({ label: `${v.placa||'Sem placa'} - ${v.marca || ''} ${v.modelo || ''}`, value: v.id, raw: v }));
        }, (item) => {
            state.propostaVeiculo = item.raw;
            inputVeiculo.value = `${item.raw.placa||'Sem placa'} - ${item.raw.marca || ''} ${item.raw.modelo || ''}`;
        });
    }

    // ===================== AGENDAMENTOS =====================
    function setupModalNovoAgendamento() {
        const m = document.getElementById('modal-novo-agendamento');
        if (!m) return;
        const inputs = m.querySelectorAll('input');
        criarDropdown(inputs[0], async (q) => {
            const arr = await api('GET', '/api/clientes?q=' + encodeURIComponent(q));
            return arr.map(c => ({ label: `${c.nome_completo} - ${c.cpf || 'CPF não informado'}`, value: c.id, raw: c }));
        }, (item) => {
            state.novoAgClienteId = item.raw.id;
            inputs[0].value = `${item.raw.nome_completo} - ${item.raw.cpf || 'CPF não informado'}`;
        });
        criarDropdown(inputs[1], async (q) => {
            const arr = await api('GET', '/api/veiculos?q=' + encodeURIComponent(q));
            return arr.map(v => ({ label: `${v.placa||'Sem placa'} - ${v.marca||''} ${v.modelo||''}`, value: v.id, raw: v }));
        }, (item) => {
            state.novoAgVeiculoId = item.raw.id;
            inputs[1].value = `${item.raw.placa||'Sem placa'} - ${item.raw.marca||''} ${item.raw.modelo||''}`;
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
        } catch (e) { window.showAlert(e.message, 'Erro'); }
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
        } catch (e) { window.showAlert(e.message, 'Erro'); }
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
        } catch (e) { window.showAlert(e.message, 'Erro'); }
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
        } catch (e) { window.showAlert(e.message, 'Erro'); }
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
        _setPage('expenses', 1);
        renderDespesasTabela();
    }
    function renderDespesasTabela() {
        const rows = state.despesas;
        const tbody = document.querySelector('.expenses-table tbody');
        if (!tbody) return;
        // Adiciona coluna de ações se ainda não existir
        const thead = document.querySelector('.expenses-table thead tr');
        if (thead && thead.children.length === 3) {
            const th = document.createElement('th');
            th.innerHTML = '<span class="table-header-icon"><i data-lucide="settings"></i> Ações</span>';
            thead.appendChild(th);
        }
        const { paged, current, total } = paginateRows(rows, 'expenses');
        tbody.innerHTML = paged.length ? paged.map(d => {
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
        renderPagination('expenses', current, total, renderDespesasTabela);
        refreshIcons();
    }

    window.toggleDespesa = async function(id) {
        const d = state.despesas.find(x => x.id === id);
        const acao = d && d.ativo ? 'desativar' : 'ativar';
        window.showConfirm(`Deseja ${acao} esta despesa?`, async () => {
        try {
            const r = await api('PATCH', `/api/despesas/${id}/toggle-ativo`);
            await carregarDespesas();
            showToast(`Despesa ${r.ativo ? 'ativada' : 'desativada'}`);
        } catch (e) { window.showAlert(e.message, 'Erro'); }
        });
    };

    async function salvarEntrada() {
        const m = document.getElementById('modal-entrada');
        const inputs = m.querySelectorAll('input');
        const data = {
            descricao: inputs[0].value.trim(),
            valor: parseFloat(inputs[1].value || 0),
            data_despesa: formatLocalDateISO(window.entradaDataSelecionada),
            tipo: 'entrada',
        };
        if (!data.descricao || data.valor <= 0) return showToast('Preencha descrição e valor', true);
        try {
            await api('POST', '/api/despesas', data);
            showToast('Entrada cadastrada');
            window.closeModal('modal-entrada');
            inputs.forEach(i => i.value = '');
            window.entradaDataSelecionada = null;
            const lbl = document.getElementById('entrada-date-label');
            if (lbl) lbl.innerText = 'Selecionar data';
            await carregarFinanceiro();
        } catch (e) { window.showAlert(e.message, 'Erro'); }
    }

    async function salvarSaida() {
        const m = document.getElementById('modal-saida');
        const inputs = m.querySelectorAll('input');
        const data = {
            descricao: inputs[0].value.trim(),
            valor: parseFloat(inputs[1].value || 0),
            data_despesa: formatLocalDateISO(window.saidaDataSelecionada),
            tipo: 'saida',
        };
        if (!data.descricao || data.valor <= 0) return showToast('Preencha descrição e valor', true);
        try {
            await api('POST', '/api/despesas', data);
            showToast('Saída cadastrada');
            window.closeModal('modal-saida');
            inputs.forEach(i => i.value = '');
            window.saidaDataSelecionada = null;
            const lbl = document.getElementById('saida-date-label');
            if (lbl) lbl.innerText = 'Selecionar data';
            await carregarFinanceiro();
        } catch (e) { window.showAlert(e.message, 'Erro'); }
    }

    // ===================== ESTOQUE =====================
    async function carregarEstoque() {
        const rows = await api('GET', '/api/estoque/produtos');
        rows.sort((a, b) => b.id - a.id);
        state.estoque = rows;
        renderEstoqueTabela();
        renderEstoqueSaidaProdutos();
    }

    function renderEstoqueTabela() {
        const tbody = document.querySelector('.estoque-table tbody');
        if (!tbody) return;
        const termo = (document.getElementById('estoque-search')?.value || '').trim().toLowerCase();
        const rows = state.estoque.filter(p => !termo || String(p.descricao || '').toLowerCase().includes(termo));
        const { paged, current, total } = paginateRows(rows, 'estoque');
        tbody.innerHTML = paged.length ? paged.map(p => `
            <tr>
                <td>${escapeHtml(p.descricao)}</td>
                <td>${fmtNumPt(p.quantidade)}</td>
                <td>${fmtBRL(p.valor_compra)}</td>
                <td>${Number(p.lucro_percentual || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</td>
                <td>${fmtBRL(p.valor_venda)}</td>
                <td>${fmtDataBR(p.ultima_movimentacao)}</td>
                <td class="actions-cell">
                    <button class="btn-icon btn-action-green" title="Adicionar estoque" onclick="abrirEstoqueEntradaProduto(${p.id})"><i data-lucide="package-plus"></i></button>
                    <button class="btn-icon btn-action-blue" title="Editar produto" onclick="abrirEstoqueEditarProduto(${p.id})"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon btn-action-red" title="Desativar produto" onclick="toggleEstoqueProduto(${p.id})"><i data-lucide="trash-2"></i></button>
                </td>
            </tr>`).join('') : `<tr><td colspan="7" style="text-align:center;color:#777">Nenhum produto em estoque.</td></tr>`;
        renderPagination('estoque', current, total, renderEstoqueTabela);
        refreshIcons();
    }

    function renderEstoqueSaidaProdutos() {
        const input = document.getElementById('estoque-saida-produto-busca');
        const hidden = document.getElementById('estoque-saida-produto');
        if (!input || !hidden) return;
        if (input._dropdownReady) return;
        input._dropdownReady = true;
        criarDropdown(input, async (q) => {
            const produtos = state.estoque.filter(p => Number(p.quantidade || 0) > 0 && String(p.descricao || '').toLowerCase().includes(q.toLowerCase()));
            return produtos.map(p => ({ label: `${p.descricao} - ${fmtNumPt(p.quantidade)} un. - ${fmtBRL(p.valor_venda)}`, value: p.id, raw: p }));
        }, (item) => {
            hidden.value = item.raw.id;
            input.value = `${item.raw.descricao} - ${fmtNumPt(item.raw.quantidade)} un. - ${fmtBRL(item.raw.valor_venda)}`;
            calcularEstoqueSaidaTotal();
        });
    }

    function calcularEstoqueEntradaVenda() {
        const compra = parseFloat(document.getElementById('estoque-entrada-compra')?.value || 0);
        const lucro = parseFloat(document.getElementById('estoque-entrada-lucro')?.value || 0);
        const venda = compra + (compra * lucro / 100);
        const input = document.getElementById('estoque-entrada-venda');
        if (input) input.value = compra > 0 ? venda.toFixed(2) : '';
    }

    function calcularEstoqueSaidaTotal() {
        const hidden = document.getElementById('estoque-saida-produto');
        const produtoId = Number(hidden?.value || 0);
        const quantidade = Number(document.getElementById('estoque-saida-quantidade')?.value || 0);
        const produto = state.estoque.find(p => Number(p.id) === produtoId);
        const total = produto ? Number(produto.valor_venda || 0) * quantidade : 0;
        const input = document.getElementById('estoque-saida-total');
        if (input) input.value = total > 0 ? total.toFixed(2) : '';
    }

    async function salvarEstoqueEntrada() {
        const data = {
            descricao: document.getElementById('estoque-entrada-descricao')?.value.trim(),
            quantidade: Number(document.getElementById('estoque-entrada-quantidade')?.value || 0),
            valor_compra: Number(document.getElementById('estoque-entrada-compra')?.value || 0),
            lucro_percentual: Number(document.getElementById('estoque-entrada-lucro')?.value || 0),
        };
        if (!data.descricao || data.quantidade <= 0 || data.valor_compra < 0) return showToast('Preencha os dados da entrada', true);
        try {
            await api('POST', '/api/estoque/entrada', data);
            showToast('Entrada de estoque cadastrada');
            window.closeModal('modal-estoque-entrada');
            ['estoque-entrada-descricao', 'estoque-entrada-quantidade', 'estoque-entrada-compra', 'estoque-entrada-lucro', 'estoque-entrada-venda'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            await carregarEstoque();
        } catch (e) { window.showAlert(e.message, 'Erro'); }
    }

    function abrirEstoqueEntradaProduto(id) {
        const p = state.estoque.find(x => Number(x.id) === Number(id));
        if (!p) return;
        document.getElementById('estoque-entrada-descricao').value = p.descricao;
        document.getElementById('estoque-entrada-compra').value = p.valor_compra;
        document.getElementById('estoque-entrada-lucro').value = p.lucro_percentual;
        calcularEstoqueEntradaVenda();
        document.getElementById('estoque-entrada-quantidade').value = '';
        document.getElementById('estoque-entrada-quantidade').focus();
        window.openModal('modal-estoque-entrada');
    }

    function abrirEstoqueEditarProduto(id) {
        const p = state.estoque.find(x => Number(x.id) === Number(id));
        if (!p) return;
        document.getElementById('estoque-editar-id').value = p.id;
        document.getElementById('estoque-editar-descricao').value = p.descricao;
        document.getElementById('estoque-editar-compra').value = p.valor_compra;
        document.getElementById('estoque-editar-lucro').value = p.lucro_percentual;
        const venda = Number(p.valor_compra || 0) + (Number(p.valor_compra || 0) * Number(p.lucro_percentual || 0) / 100);
        document.getElementById('estoque-editar-venda').value = venda > 0 ? venda.toFixed(2) : '';
        window.openModal('modal-estoque-editar');
    }

    function calcularEstoqueEditarVenda() {
        const compra = parseFloat(document.getElementById('estoque-editar-compra')?.value || 0);
        const lucro = parseFloat(document.getElementById('estoque-editar-lucro')?.value || 0);
        const venda = compra + (compra * lucro / 100);
        const input = document.getElementById('estoque-editar-venda');
        if (input) input.value = compra > 0 ? venda.toFixed(2) : '';
    }

    async function salvarEstoqueEditar() {
        const id = Number(document.getElementById('estoque-editar-id')?.value || 0);
        const data = {
            descricao: document.getElementById('estoque-editar-descricao')?.value.trim(),
            valor_compra: Number(document.getElementById('estoque-editar-compra')?.value || 0),
            lucro_percentual: Number(document.getElementById('estoque-editar-lucro')?.value || 0),
        };
        if (!id || !data.descricao || data.valor_compra < 0) return showToast('Preencha os dados do produto', true);
        try {
            await api('PUT', `/api/estoque/produtos/${id}`, data);
            showToast('Produto atualizado');
            window.closeModal('modal-estoque-editar');
            await carregarEstoque();
        } catch (e) { window.showAlert(e.message, 'Erro'); }
    }

    async function toggleEstoqueProduto(id) {
        const p = state.estoque.find(x => Number(x.id) === Number(id));
        if (!p) return;
        const acao = p.ativo ? 'desativar' : 'ativar';
        window.showConfirm(`Deseja ${acao} este produto?`, async () => {
        try {
            await api('PATCH', `/api/estoque/produtos/${id}/toggle`);
            showToast(`Produto ${acao === 'desativar' ? 'desativado' : 'ativado'}`);
        } catch (e) { window.showAlert(e.message, 'Erro'); }
        });
    }

    async function salvarEstoqueSaida() {
        const data = {
            produto_id: Number(document.getElementById('estoque-saida-produto')?.value || 0),
            quantidade: Number(document.getElementById('estoque-saida-quantidade')?.value || 0),
            motivo: document.getElementById('estoque-saida-motivo')?.value.trim(),
        };
        const produto = state.estoque.find(p => Number(p.id) === data.produto_id);
        if (!produto || data.quantidade <= 0 || data.quantidade > Number(produto.quantidade || 0) || !data.motivo) return showToast('Preencha a saída com saldo disponível', true);
        try {
            const result = await api('POST', '/api/estoque/saida', data);
            showToast(`Saída cadastrada e entrada financeira adicionada: ${fmtBRL(result.valor_total)}`);
            window.closeModal('modal-estoque-saida');
            ['estoque-saida-produto', 'estoque-saida-quantidade', 'estoque-saida-total', 'estoque-saida-motivo'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const buscaEl = document.getElementById('estoque-saida-produto-busca');
            if (buscaEl) buscaEl.value = '';
            await carregarEstoque();
            await carregarFinanceiro();
        } catch (e) { window.showAlert(e.message, 'Erro'); }
    }

    // ===================== FINANCEIRO =====================
    async function carregarFinanceiro() {
        const now = new Date();
        const year = Number.isInteger(Number(state.financeiroFiltroAno)) ? Number(state.financeiroFiltroAno) : now.getFullYear();
        const month = Number(state.financeiroFiltroMes) === 0 ? 0 : getValidYearMonth(year, state.financeiroFiltroMes).month;
        state.financeiroFiltroAno = year;
        state.financeiroFiltroMes = month;
        const url = `/api/financeiro?ano=${year}&mes=${month}`;
        const data = await api('GET', url);
        atualizarBotoesFiltroFinanceiro();
        const cardsRoot = document.querySelector('#page-financeiro .financeiro-cards');
        if (cardsRoot) {
            const c = data.cards;
            cardsRoot.children[0].querySelector('.fin-card-value').innerText = c.veiculos;
            cardsRoot.children[1].querySelector('.fin-card-value').innerText = fmtBRL(c.despesas);
            cardsRoot.children[2].querySelector('.fin-card-value').innerText = fmtBRL(c.valor_gasto);
            cardsRoot.children[3].querySelector('.fin-card-value').innerText = fmtBRL(c.valor_recebido);
            cardsRoot.children[4].querySelector('.fin-card-value').innerText = fmtBRL(c.lucro);
        }
        // Comprovantes pagos (cards)
        const compContainer = document.getElementById('financeiro-comprovantes-cards');
        if (compContainer) {
            const termoComp = (document.getElementById('financeiro-comprovantes-search')?.value || '').trim().toLowerCase();
            const detalhesFiltrados = data.detalhes.filter(d => {
                if (!termoComp) return true;
                return String(d.numero || '').toLowerCase().includes(termoComp)
                    || String(d.veiculo || '').toLowerCase().includes(termoComp)
                    || fmtDataBR(d.data_pagamento || '').toLowerCase().includes(termoComp)
                    || fmtBRL(d.lucro).toLowerCase().includes(termoComp);
            });
            compContainer.innerHTML = detalhesFiltrados.length ? detalhesFiltrados.map(d => `
                <div class="fin-comp-card">
                    <div class="fin-comp-card-info">
                        <div class="fin-comp-card-num">Nº ${String(d.numero).padStart(6,'0')}</div>
                        <div class="fin-comp-card-veiculo">${escapeHtml([d.veiculo, d.placa].filter(Boolean).join(' - '))}</div>
                        <div class="fin-comp-card-data">${d.data_pagamento ? fmtDataBR(d.data_pagamento) : ''}</div>
                        <div class="fin-comp-card-lucro ${Number(d.lucro)>=0?'positvo':'negativo'}">${Number(d.lucro)>=0?'+':''}${fmtBRL(d.lucro)}</div>
                    </div>
                </div>`).join('') : `<div style="text-align:center;color:var(--text-muted);padding:20px;">Nenhum comprovante encontrado.</div>`;
        }
        // Caixa movements (cards)
        const caixaContainer = document.getElementById('financeiro-caixa-cards');
        if (caixaContainer) {
            const params = new URLSearchParams();
            params.set('ano', year);
            params.set('mes', month);
            const movimentos = await api('GET', '/api/despesas?' + params.toString());
            movimentos.sort((a, b) => {
                const dataA = `${a.data_despesa || ''} ${String(a.id || 0).padStart(10, '0')}`;
                const dataB = `${b.data_despesa || ''} ${String(b.id || 0).padStart(10, '0')}`;
                return dataB.localeCompare(dataA);
            });
            const termoCaixa = (document.getElementById('financeiro-caixa-search')?.value || '').trim().toLowerCase();
            const movimentosFiltrados = movimentos.filter(m => {
                if (!termoCaixa) return true;
                return String(m.tipo || '').toLowerCase().includes(termoCaixa)
                    || String(m.descricao || '').toLowerCase().includes(termoCaixa)
                    || fmtDataBR(m.data_despesa || '').toLowerCase().includes(termoCaixa)
                    || fmtBRL(m.valor).toLowerCase().includes(termoCaixa);
            });
            caixaContainer.innerHTML = movimentosFiltrados.length ? movimentosFiltrados.map(m => {
                const isEntrada = m.tipo === 'entrada';
                const tagClass = isEntrada ? 'tag-entrada' : 'tag-saida';
                const tagText = isEntrada ? 'Entrada' : 'Saída';
                const valorClass = isEntrada ? 'entrada' : 'saida';
                const descricaoCurta = String(m.descricao || '').length > 30 ? `${String(m.descricao || '').slice(0, 30)}...` : String(m.descricao || '');
                return `
                <div class="fin-caixa-card">
                    <div class="fin-caixa-card-info">
                        <span class="${tagClass}">${tagText}</span>
                        <span class="fin-caixa-card-desc" title="${escapeHtml(m.descricao)}">${escapeHtml(descricaoCurta)}</span>
                        <div class="fin-caixa-card-data">${fmtDataBR(m.data_despesa)}</div>
                    </div>
                    <div class="fin-caixa-valor ${valorClass}">${isEntrada ? '+' : '-'}${fmtBRL(m.valor)}</div>
                </div>`;
            }).join('') : `<div style="text-align:center;color:var(--text-muted);padding:20px;">Nenhuma movimentação encontrada.</div>`;
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
        } else if (logoArea && !c?.logo) {
            logoArea.innerHTML = `<i data-lucide="image-off" style="width: 40px; height: 40px;"></i><span>Sem imagem</span>`;
        }
        refreshIcons();
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
        } catch (e) { window.showAlert(e.message, 'Erro'); }
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
        // Novo Orçamento (Proposta)
        const btnOrcProposta = document.getElementById('btn-salvar-orcamento-proposta');
        if (btnOrcProposta) btnOrcProposta.onclick = salvarOrcamentoProposta;
        // Entrada
        const btnEnt = document.querySelector('#modal-entrada .modal-footer .btn-primary');
        if (btnEnt) btnEnt.onclick = salvarEntrada;
        // Saída
        const btnSai = document.querySelector('#modal-saida .modal-footer .btn-primary');
        if (btnSai) btnSai.onclick = salvarSaida;
        const estoqueBusca = document.getElementById('estoque-search');
        if (estoqueBusca) estoqueBusca.addEventListener('input', () => { _setPage('estoque', 1); renderEstoqueTabela(); });
        const estoqueCompra = document.getElementById('estoque-entrada-compra');
        const estoqueLucro = document.getElementById('estoque-entrada-lucro');
        if (estoqueCompra) estoqueCompra.addEventListener('input', calcularEstoqueEntradaVenda);
        if (estoqueLucro) estoqueLucro.addEventListener('input', calcularEstoqueEntradaVenda);
        const estoqueSaidaQuantidade = document.getElementById('estoque-saida-quantidade');
        if (estoqueSaidaQuantidade) estoqueSaidaQuantidade.addEventListener('input', calcularEstoqueSaidaTotal);
        const estoqueEditarCompra = document.getElementById('estoque-editar-compra');
        const estoqueEditarLucro = document.getElementById('estoque-editar-lucro');
        if (estoqueEditarCompra) estoqueEditarCompra.addEventListener('input', calcularEstoqueEditarVenda);
        if (estoqueEditarLucro) estoqueEditarLucro.addEventListener('input', calcularEstoqueEditarVenda);
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
            if (id === 'modal-veiculo' && !state.editandoVeiculo && !state.pularPlacaBusca) {
                const buscaInput = document.getElementById('placa-busca-input');
                if (buscaInput) {
                    buscaInput.value = '';
                    setTimeout(() => buscaInput.focus(), 150);
                }
                origOpen('modal-placa-busca');
                return;
            }
            origOpen(id);
            if (id === 'modal-cliente' && !state.editandoCliente) resetarModalCliente();
            if (id === 'modal-fornecedor' && !state.editandoFornecedor) resetarModalFornecedor();
            if (id === 'modal-veiculo' && !state.editandoVeiculo) resetarModalVeiculo();
            if (id === 'modal-novo-agendamento') resetarModalNovoAgendamento();
            if (id === 'modal-nova-os') resetarModalNovaOS();
            if (id === 'modal-novo-orcamento' && !state.editandoProposta) resetarModalNovaProposta();
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
        const origApplyFin = window.applyFinancialPeriod;
        window.applyFinancialPeriod = function() {
            origApplyFin();
            const anoSelecionado = Number(window.financeiroAnoSelecionado);
            const mesSelecionado = Number(window.financeiroMesSelecionado);
            state.financeiroFiltroAno = Number.isInteger(anoSelecionado) ? anoSelecionado : new Date().getFullYear();
            state.financeiroFiltroMes = Number.isInteger(mesSelecionado) ? (mesSelecionado + 1) : (new Date().getMonth() + 1);
            carregarFinanceiro();
        };
        window.aplicarTodoPeriodo = function() {
            state.financeiroFiltroAno = new Date().getFullYear();
            state.financeiroFiltroMes = 0;
            const label = document.getElementById('financial-period-label');
            if (label) label.innerText = 'Todo o período';
            atualizarBotoesFiltroFinanceiro();
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
        const inputBuscaPropostas = document.getElementById('proposta-search');
        if (inputBuscaPropostas) {
            let t;
            inputBuscaPropostas.oninput = () => {
                clearTimeout(t);
                t = setTimeout(() => carregarPropostas(inputBuscaPropostas.value.trim()), 300);
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
        const inputBuscaComp = document.getElementById('financeiro-comprovantes-search');
        if (inputBuscaComp) inputBuscaComp.oninput = () => carregarFinanceiro();
        const inputBuscaCaixa = document.getElementById('financeiro-caixa-search');
        if (inputBuscaCaixa) inputBuscaCaixa.oninput = () => carregarFinanceiro();

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
        const searchWrap = hdr.querySelector('.search-input-wrap');
        let group = hdr.querySelector('[data-left-group]');
        if (!group) {
            group = document.createElement('div');
            group.dataset.leftGroup = '1';
            group.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:nowrap;white-space:nowrap;';
            hdr.insertBefore(group, hdr.firstChild);
            if (searchWrap) group.appendChild(searchWrap);
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
        setupModalNovaProposta();
        setupModalNovoAgendamento();
        setupModalVeiculo();
        initPlacaBusca();
        setupOrcamentoPage();
        setupConfigPage();
        const activePage = (() => {
            try { return localStorage.getItem('activePage') || 'agendamentos'; } catch (_) { return 'agendamentos'; }
        })();
        window.showPage(activePage);
    });
    window.salvarEstoqueEntrada = salvarEstoqueEntrada;
    window.salvarEstoqueSaida = salvarEstoqueSaida;
    window.salvarEstoqueEditar = salvarEstoqueEditar;
    window.calcularEstoqueEntradaVenda = calcularEstoqueEntradaVenda;
    window.calcularEstoqueSaidaTotal = calcularEstoqueSaidaTotal;
    window.calcularEstoqueEditarVenda = calcularEstoqueEditarVenda;
    window.abrirEstoqueEntradaProduto = abrirEstoqueEntradaProduto;
    window.abrirEstoqueEditarProduto = abrirEstoqueEditarProduto;
    window.toggleEstoqueProduto = toggleEstoqueProduto;

    // ===================== DÍVIDAS =====================
    const PESSOAS_DIVIDA = ['Oficina','Thomaz','Cassiano','Paulo','Jonas','Ari'];


    async function carregarDividas() {
        try {
            const rows = await api('GET', '/api/dividas');
            rows.sort((a, b) => b.id - a.id);
            state.dividas = rows;
        } catch(_) { state.dividas = []; }
        renderDividasCards();
    }

    function renderDividasCards() {
        PESSOAS_DIVIDA.forEach(p => {
            const el = document.getElementById('divida-total-' + p);
            if (!el) return;
            const divs = state.dividas.filter(d => d.pessoa === p && d.status === 'Pendente');
            const total = divs.reduce((s, d) => s + (Number(d.valor) - Number(d.valor_pago || 0)), 0);
            el.textContent = fmtBRL(total);
            el.classList.toggle('negativo', total > 0);
        });
    }

    let _dividasPessoaList = [];

    window.abrirDividasPessoa = async function(pessoa) {
        document.getElementById('modal-dividas-pessoa-title').textContent = 'Dívidas - ' + pessoa;
        const buscaInput = document.getElementById('dividas-pessoa-busca');
        if (buscaInput) buscaInput.value = '';
        try {
            const dividas = await api('GET', '/api/dividas?pessoa=' + encodeURIComponent(pessoa));
            dividas.sort((a, b) => b.id - a.id);
            _dividasPessoaList = dividas;
            // Atualiza state.dividas para que abrirPagarDivida encontre os dados
            dividas.forEach(d => {
                const idx = state.dividas.findIndex(s => s.id === d.id);
                if (idx >= 0) state.dividas[idx] = d; else state.dividas.push(d);
            });
            const listEl = document.getElementById('dividas-pessoa-list');
            const totalEl = document.getElementById('dividas-pessoa-total');
            if (!listEl) return;
            _renderDividasPessoaCards(dividas);
            openModal('modal-dividas-pessoa');
        } catch(e) { window.showAlert(e.message, 'Erro'); }
    };

    function _renderDividasPessoaCards(dividas) {
        const listEl = document.getElementById('dividas-pessoa-list');
        if (!listEl) return;
        if (!dividas.length) {
            listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">Nenhuma dívida encontrada.</div>';
        } else {
            listEl.innerHTML = dividas.map(d => {
                const valorRestante = Number(d.valor) - Number(d.valor_pago || 0);
                const isPaga = d.status === 'Paga';
                const nomeTrunc = String(d.nome || '').length > 25 ? String(d.nome).slice(0, 25) + '...' : d.nome;
                const statusBg = isPaga ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
                const statusColor = isPaga ? '#22c55e' : '#ef4444';
                return `<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 100px auto;gap:8px;align-items:center;padding:12px 16px;background:rgba(128,128,128,0.08);border-radius:8px;font-size:13px;">
                    <div style="font-weight:600;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;" title="${escapeHtml(d.nome)}">${escapeHtml(nomeTrunc)}</div>
                    <div style="color:var(--text-muted);text-align:center;">${fmtDataBR(d.data_divida)}</div>
                    <div style="color:var(--text-main);font-weight:600;text-align:center;">${fmtBRL(d.valor)}</div>
                    <div style="color:#22c55e;font-weight:600;text-align:center;">${fmtBRL(d.valor_pago || 0)}</div>
                    <div style="color:${statusColor};font-weight:600;text-align:center;">${fmtBRL(valorRestante)}</div>
                    <div style="text-align:center;"><span style="display:inline-block;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:700;background:${statusBg};color:${statusColor};">${isPaga ? 'Paga' : 'Pendente'}</span></div>
                    <div style="display:flex;gap:6px;align-items:center;justify-content:center;">
                        ${!isPaga ? `<button class="btn-icon btn-action-green no-hover" title="Pagar" onclick="abrirPagarDivida(${d.id})" style="width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--border-radius);padding:0;cursor:pointer;"><i data-lucide="banknote" style="width:18px;height:18px;color:#fff;"></i></button>` : ''}
                        <button class="btn-icon btn-action-blue no-hover" title="Editar" onclick="editarDivida(${d.id})" style="width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--border-radius);padding:0;cursor:pointer;"><i data-lucide="pencil" style="width:18px;height:18px;color:#fff;"></i></button>
                        <button class="btn-icon btn-action-red no-hover" title="Excluir" onclick="excluirDivida(${d.id})" style="width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--border-radius);padding:0;cursor:pointer;"><i data-lucide="trash-2" style="width:18px;height:18px;color:#fff;"></i></button>
                    </div>
                </div>`;
            }).join('');
        }
        refreshIcons();
    }

    window.filtrarDividasPessoa = function(termo) {
        const q = (termo || '').toLowerCase().trim();
        if (!q) return _renderDividasPessoaCards(_dividasPessoaList);
        const filtered = _dividasPessoaList.filter(d =>
            (d.nome || '').toLowerCase().includes(q) ||
            (d.status || '').toLowerCase().includes(q) ||
            fmtDataBR(d.data_divida).includes(q) ||
            fmtBRL(d.valor).includes(q)
        );
        _renderDividasPessoaCards(filtered);
    };

    window.selecionarPessoaDivida = function(nome) {
        document.getElementById('divida-pessoa').value = nome;
        closeModal('modal-selecionar-pessoa');
    };

    window.abrirModalNovaDivida = function() {
        state.editandoDividaId = null;
        document.getElementById('divida-nome').value = '';
        document.getElementById('divida-pessoa').value = '';
        document.getElementById('divida-data').value = new Date().toISOString().split('T')[0];
        document.getElementById('divida-valor').value = '';
        document.querySelector('#modal-nova-divida .modal-title').textContent = 'Nova Dívida';
        document.querySelector('#modal-nova-divida .btn-primary').textContent = 'Cadastrar';
        const grid = document.getElementById('pessoa-picker-grid');
        if (grid) {
            grid.innerHTML = PESSOAS_DIVIDA.map(p => `
                <div onclick="selecionarPessoaDivida('${p}')" style="background:var(--bg-card);border:1px solid #2a2a2a;border-radius:8px;padding:20px 12px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;transition:var(--transition);">
                    <div style="width:40px;height:40px;border-radius:50%;background:var(--primary);color:#000;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;">${p[0]}</div>
                    <span style="font-size:13px;font-weight:600;color:var(--text-main);text-align:center;">${p}</span>
                </div>
            `).join('');
        }
        openModal('modal-nova-divida');
    };

    window.salvarNovaDivida = async function() {
        const nome = document.getElementById('divida-nome').value.trim();
        const pessoa = document.getElementById('divida-pessoa').value;
        const data_divida = document.getElementById('divida-data').value;
        const valor = parseFloat(document.getElementById('divida-valor').value);
        if (!nome) return showToast('Informe o nome da dívida', true);
        if (!pessoa) return showToast('Selecione a pessoa', true);
        if (!data_divida) return showToast('Informe a data', true);
        if (!valor || valor <= 0) return showToast('Informe o valor', true);
        try {
            if (state.editandoDividaId) {
                await api('PUT', `/api/dividas/${state.editandoDividaId}`, { nome, pessoa, data_divida, valor });
                showToast('Dívida atualizada');
                state.editandoDividaId = null;
            } else {
                await api('POST', '/api/dividas', { nome, pessoa, data_divida, valor });
                showToast('Dívida cadastrada com sucesso');
            }
            closeModal('modal-nova-divida');
            await carregarDividas();
        } catch(e) { window.showAlert(e.message, 'Erro'); }
    };

    window.abrirPagarDivida = function(id) {
        const d = state.dividas.find(x => x.id === id);
        if (!d) {
            // buscar da lista aberta - refetch
            return;
        }
        document.getElementById('pagar-divida-nome').value = d.nome;
        const valorTotal = Number(d.valor);
        const jaPago = Number(d.valor_pago || 0);
        const restante = valorTotal - jaPago;
        document.getElementById('pagar-divida-total').value = fmtBRL(valorTotal);
        document.getElementById('pagar-divida-ja-pago').value = fmtBRL(jaPago);
        document.getElementById('pagar-divida-restante').value = fmtBRL(restante);
        document.getElementById('pagar-divida-valor').value = '';
        document.getElementById('pagar-divida-valor').max = restante;
        document.getElementById('pagar-divida-id').value = id;
        openModal('modal-pagar-divida');
    };

    window.confirmarPagamentoDivida = async function() {
        const id = parseInt(document.getElementById('pagar-divida-id').value);
        const valorPagamento = parseFloat(document.getElementById('pagar-divida-valor').value);
        if (!valorPagamento || valorPagamento <= 0) return showToast('Informe o valor do pagamento', true);
        try {
            const result = await api('POST', `/api/dividas/${id}/pagar`, { valor_pagamento: valorPagamento });
            showToast(result.status === 'Paga' ? 'Dívida quitada!' : 'Pagamento parcial registrado');
            closeModal('modal-pagar-divida');
            await carregarDividas();
            await carregarFinanceiro();
        } catch(e) { window.showAlert(e.message, 'Erro'); }
    };

    window.editarDivida = async function(id) {
        const d = state.dividas.find(x => x.id === id);
        if (!d) return;
        document.getElementById('divida-nome').value = d.nome;
        document.getElementById('divida-pessoa').value = d.pessoa;
        document.getElementById('divida-data').value = d.data_divida ? d.data_divida.slice(0,10) : '';
        document.getElementById('divida-valor').value = d.valor;
        state.editandoDividaId = id;
        closeModal('modal-dividas-pessoa');
        openModal('modal-nova-divida');
        document.querySelector('#modal-nova-divida .modal-title').textContent = 'Editar Dívida';
        document.querySelector('#modal-nova-divida .btn-primary').textContent = 'Salvar';
    };

    window.excluirDivida = async function(id) {
        window.showConfirm('Deseja excluir esta dívida?', async () => {
            try {
                await api('DELETE', `/api/dividas/${id}`);
                showToast('Dívida excluída');
                await carregarDividas();
                await carregarFinanceiro();
                // Reabrir modal da pessoa se estava aberto
                const title = document.getElementById('modal-dividas-pessoa-title')?.textContent;
                if (title) {
                    const pessoa = title.replace('Dívidas - ', '');
                    abrirDividasPessoa(pessoa);
                }
            } catch(e) { window.showAlert(e.message, 'Erro'); }
        });
    };
})();
