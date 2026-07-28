/* ============================================================
   CRM Tom Mittos 6.1 — Aplicação
   ============================================================ */

const App = {
  user: null,
  rota: 'painel',
  filtros: { resp: '', fab: '', seg: '', reg: '', etapa: '' },

  init() {
    Store.init();
    // sessão persistente: se já logou antes, entra direto
    Store.auth.onAuthStateChanged(u => {
      if (u) {
        const usuario = Store.usuarioPorEmail(u.email);
        if (usuario) {
          this.user = usuario;
          this.iniciarTempoReal();
          this.entrar();
          return;
        }
      }
      this.user = null;
      this.renderLogin();
    });
  },

  iniciarTempoReal() {
    Store.escutar(() => this.refresh());
  },

  refresh() {
    // dados chegaram da nuvem: re-renderiza, sem atropelar quem está digitando
    if (!this.user) return;
    if (document.querySelector('.modal-bg')) return;
    this.go(this.rota);
  },

  // ================= LOGIN =================
  renderLogin() {
    const grid = document.getElementById('loginGrid');
    const ordem = { gerente: 0, diretor: 1, externo: 2, interno: 3 };
    const us = [...Store.db.usuarios].sort((a, b) => ordem[a.papel] - ordem[b.papel]);
    grid.innerHTML = us.map(u => `
      <div class="login-user" onclick="App.login('${u.id}')">
        <div class="avatar ${u.papel}">${u.nome[0]}</div>
        <div><div class="nome">${esc(u.nome)}</div><div class="cargo">${esc(u.cargo)}</div></div>
      </div>`).join('');
    document.getElementById('login').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  },

  login(id) {
    const u = Store.usuario(id);
    this.modal(`
      <h3>🔐 Entrar como ${esc(u.nome)}</h3>
      <p class="muted">${esc(u.cargo)}</p>
      <div class="fg" style="margin-top:14px"><label>Senha</label>
        <input id="l_senha" type="password" placeholder="Digite sua senha"
          onkeydown="if(event.key==='Enter')App.confirmarLogin('${id}')"></div>
      <p id="l_erro" class="muted" style="color:var(--vermelho);margin-top:8px"></p>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="App.fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.confirmarLogin('${id}')">Entrar</button>
      </div>`);
    setTimeout(() => document.getElementById('l_senha')?.focus(), 100);
  },

  async confirmarLogin(id) {
    const senha = document.getElementById('l_senha').value;
    const erro = document.getElementById('l_erro');
    if (!senha) { erro.textContent = 'Digite a senha.'; return; }
    erro.textContent = 'Entrando...';
    try {
      await Store.entrar(id, senha);
      this.fecharModal();
      this.toast(`Bem-vindo(a), ${Store.usuario(id).nome}! 💚`);
      // onAuthStateChanged cuida do resto
    } catch (e) {
      erro.textContent = (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential')
        ? 'Senha incorreta. Tente novamente.'
        : 'Não foi possível entrar: ' + (e.message || e.code);
    }
  },

  async logout() {
    await Store.sair();
    location.reload();
  },

  entrar() {
    document.getElementById('login').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('userName').textContent = this.user.nome;
    document.getElementById('userRole').textContent = this.user.cargo;
    const av = document.getElementById('userAvatar');
    av.textContent = this.user.nome[0];
    av.className = `avatar ${this.user.papel}`;
    this.renderNav();
    this.go(this.user.papel === 'diretor' ? 'executivo' : 'painel');
  },

  // ================= NAVEGAÇÃO =================
  renderNav() {
    const itens = [
      { sec: 'Operacional' },
      { id: 'painel',     ico: '🧭', t: 'Painel de Reunião' },
      { id: 'clientes',   ico: '🏭', t: 'Clientes & Contatos' },
      { id: 'pipeline',   ico: '📈', t: 'Funil de Oportunidades' },
      { id: 'interacoes', ico: '📚', t: 'Interações & Visitas' },
      { id: 'cotacoes',   ico: '📄', t: 'Cotações' },
      { id: 'agenda',     ico: '📅', t: 'Agenda Inteligente' },
      { sec: 'Gestão' },
      { id: 'comercial',  ico: '📊', t: 'Dashboard Comercial' },
      { id: 'executivo',  ico: '🏆', t: 'Dashboard Executivo' },
      { id: 'relatorios', ico: '🗂', t: 'Relatórios' },
      { sec: 'Sistema' },
      { id: 'config',     ico: '⚙️', t: 'Configurações' }
    ];
    document.getElementById('nav').innerHTML = itens.map(i =>
      i.sec ? `<div class="nav-sec">${i.sec}</div>` :
      `<button class="nav-item" data-r="${i.id}" onclick="App.go('${i.id}')"><span>${i.ico}</span>${i.t}</button>`
    ).join('');
  },

  go(rota) {
    this.rota = rota;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.r === rota));
    document.getElementById('sidebar').classList.remove('open');
    const views = {
      painel: this.vPainel, clientes: this.vClientes, pipeline: this.vPipeline,
      interacoes: this.vInteracoes, cotacoes: this.vCotacoes, agenda: this.vAgenda,
      comercial: this.vComercial, executivo: this.vExecutivo, relatorios: this.vRelatorios,
      config: this.vConfig
    };
    document.getElementById('view').innerHTML = (views[rota] || this.vPainel).call(this);
    this.updateAlertas();
    window.scrollTo(0, 0);
  },

  toggleMenu() { document.getElementById('sidebar').classList.toggle('open'); },

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.add('hidden'), 2600);
  },

  // ================= CÁLCULOS =================
  oppsAtivas() {
    return Store.oppsVisiveis(this.user).filter(o => !o.resultado);
  },

  agendaDe(o) {
    if (o.resultado || !o.proximoContato) return null;
    const d = diasEntre(hoje(), o.proximoContato);
    if (d < 0) return 'vencido';
    if (d === 0) return 'hoje';
    if (d <= 7) return 'prox';
    return 'futuro';
  },

  diasSemAtualizacao(o) {
    return o.ultimoContato ? diasEntre(o.ultimoContato, hoje()) : diasEntre(o.dataCadastro, hoje());
  },

  updateAlertas() {
    const venc = this.oppsAtivas().filter(o => this.agendaDe(o) === 'vencido').length;
    const hj = this.oppsAtivas().filter(o => this.agendaDe(o) === 'hoje').length;
    const badge = document.getElementById('alertBadge');
    const n = venc + hj;
    badge.classList.toggle('hidden', n === 0);
    document.getElementById('alertCount').textContent = `${n} follow-up${n > 1 ? 's' : ''}`;
  },

  aplicaFiltros(lista) {
    const f = this.filtros;
    return lista.filter(o => {
      const c = Store.cliente(o.clienteId) || {};
      return (!f.resp || o.responsavelId === f.resp)
        && (!f.fab || o.fabricante === f.fab)
        && (!f.seg || c.segmento === f.seg)
        && (!f.reg || c.regiao === f.reg)
        && (!f.etapa || o.etapa === f.etapa);
    });
  },

  setFiltro(k, v) { this.filtros[k] = v; this.go(this.rota); },

  filtrosHTML(opts = {}) {
    const cfg = Store.db.config, f = this.filtros;
    const sel = (id, lista, val, lbl) => `
      <select onchange="App.setFiltro('${id}', this.value)">
        <option value="">${lbl}</option>
        ${lista.map(x => `<option ${val === (x.id ?? x) ? 'selected' : ''} value="${esc(x.id ?? x)}">${esc(x.nome ?? x)}</option>`).join('')}
      </select>`;
    return `<div class="filtros">
      ${sel('resp', Store.db.usuarios.filter(u => u.papel === 'externo' || u.papel === 'interno' || u.papel === 'gerente'), f.resp, 'Todos os vendedores')}
      ${sel('fab', cfg.fabricantes, f.fab, 'Todos os fabricantes')}
      ${sel('seg', cfg.segmentos, f.seg, 'Todos os segmentos')}
      ${sel('reg', cfg.regioes, f.reg, 'Todas as regiões')}
      ${opts.etapa ? sel('etapa', cfg.etapas, f.etapa, 'Todas as etapas') : ''}
      ${(f.resp || f.fab || f.seg || f.reg || f.etapa) ? `<button class="btn btn-sm btn-ghost" onclick="App.filtros={resp:'',fab:'',seg:'',reg:'',etapa:''};App.go(App.rota)">✕ Limpar</button>` : ''}
    </div>`;
  },

  etapaChip(o) {
    if (o.resultado === 'ganho') return `<span class="chip ganho">✓ Ganho</span>`;
    if (o.resultado === 'perdido') return `<span class="chip perdido">✕ Perdido</span>`;
    const i = Store.db.config.etapas.indexOf(o.etapa);
    return `<span class="chip et${Math.max(i, 0)}">${esc(o.etapa)}</span>`;
  },

  // ================= PAINEL DE REUNIÃO =================
  vPainel() {
    const ativas = this.aplicaFiltros(this.oppsAtivas());
    const todas = this.aplicaFiltros(Store.db.oportunidades);
    const venc = ativas.filter(o => this.agendaDe(o) === 'vencido');
    const parados = ativas.filter(o => this.diasSemAtualizacao(o) > Store.db.config.diasParado);
    const cotAbertas = Store.db.cotacoes.filter(c => (c.status === 'Aberto' || c.status === 'Pendente') && Store.cotVisivel(c, this.user));
    const pipeTotal = ativas.reduce((s, o) => s + (o.valor || 0), 0);

    const porEtapa = Store.db.config.etapas.map(e => {
      const l = ativas.filter(o => o.etapa === e);
      return { e, n: l.length, v: l.reduce((s, o) => s + (o.valor || 0), 0) };
    });
    const maxV = Math.max(...porEtapa.map(x => x.v), 1);

    const porFab = {};
    ativas.forEach(o => {
      porFab[o.fabricante] = porFab[o.fabricante] || { n: 0, v: 0 };
      porFab[o.fabricante].n++; porFab[o.fabricante].v += o.valor || 0;
    });
    const fabs = Object.entries(porFab).sort((a, b) => b[1].v - a[1].v);
    const maxF = Math.max(...fabs.map(f => f[1].v), 1);

    return `
    <div class="page-head"><h2>🧭 Painel de Reunião Comercial</h2>
      <div class="sub">Visão consolidada para a pauta de alinhamento com a equipe — ${fmtData(hoje())}</div></div>
    ${this.filtrosHTML()}
    <div class="cards">
      <div class="kpi"><div class="label">Oportunidades ativas</div><div class="valor">${ativas.length}</div><div class="extra">${fmtMoeda(pipeTotal)} em funil</div></div>
      <div class="kpi ${venc.length ? 'alerta' : ''}"><div class="label">Follow-ups vencidos</div><div class="valor">${venc.length}</div><div class="extra">contatos em atraso</div></div>
      <div class="kpi ${parados.length ? 'aviso' : ''}"><div class="label">Paradas +${Store.db.config.diasParado} dias</div><div class="valor">${parados.length}</div><div class="extra">sem atualização</div></div>
      <div class="kpi"><div class="label">Cotações em aberto</div><div class="valor">${cotAbertas.length}</div><div class="extra">${fmtMoeda(cotAbertas.reduce((s, c) => s + (c.valor || 0), 0))}</div></div>
    </div>
    <div class="grid-2">
      <div class="panel"><h3>📊 Funil por etapa</h3>
        ${porEtapa.map(x => `<div class="bar-row"><div class="lbl">${esc(x.e)} (${x.n})</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round(x.v / maxV * 100)}%"></div></div>
          <div class="bar-val">${fmtMoeda(x.v)}</div></div>`).join('')}
      </div>
      <div class="panel"><h3>🏭 Pipeline por fabricante</h3>
        ${fabs.length ? fabs.map(([f, d]) => `<div class="bar-row"><div class="lbl">${esc(f)} (${d.n})</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round(d.v / maxF * 100)}%"></div></div>
          <div class="bar-val">${fmtMoeda(d.v)}</div></div>`).join('') : '<p class="muted">Sem oportunidades ativas ainda.</p>'}
      </div>
    </div>
    <div class="panel"><h3>⏰ Sem atualização há mais de ${Store.db.config.diasParado} dias</h3>
      ${parados.length ? `<div class="table-wrap"><table><tr><th>Oportunidade</th><th>Cliente</th><th>Responsável</th><th>Etapa</th><th>Dias</th></tr>
        ${parados.map(o => `<tr><td><span class="link" onclick="App.abrirOpp(${o.id})">${esc(o.titulo)}</span></td>
          <td>${esc(Store.cliente(o.clienteId)?.empresa || '—')}</td>
          <td>${esc(Store.usuario(o.responsavelId)?.nome || '—')}</td>
          <td>${this.etapaChip(o)}</td><td><b>${this.diasSemAtualizacao(o)}</b></td></tr>`).join('')}</table></div>`
        : '<p class="muted">✅ Nenhuma oportunidade parada. Funil vivo!</p>'}
    </div>`;
  },

  // ================= CLIENTES =================
  vClientes() {
    const f = this.filtros;
    let cls = Store.clientesVisiveis(this.user).filter(c =>
      (!f.seg || c.segmento === f.seg) && (!f.reg || c.regiao === f.reg));
    return `
    <div class="page-head"><h2>🏭 Clientes & Mapeamento de Contatos</h2><span class="spacer"></span>
      <button class="btn btn-accent" onclick="App.modalCliente()">＋ Novo Cliente</button></div>
    ${this.filtrosHTML()}
    ${cls.length ? `<div class="panel"><div class="table-wrap"><table>
      <tr><th>Empresa</th><th>Cidade</th><th>Região</th><th>Segmento</th><th>Vend. Externo</th><th>Vend. Interno</th><th>Contatos</th><th>Oportunidades</th><th></th></tr>
      ${cls.map(c => {
        const opps = Store.db.oportunidades.filter(o => o.clienteId === c.id);
        return `<tr>
          <td><span class="link" onclick="App.abrirCliente(${c.id})">${esc(c.empresa)}</span></td>
          <td>${esc(c.cidade || '—')}</td><td>${esc(c.regiao || '—')}</td>
          <td>${esc(c.segmento || '—')}</td>
          <td>${c.extId ? esc(Store.usuario(c.extId)?.nome || '') : '<span class="muted">livre</span>'}</td>
          <td>${c.intId ? esc(Store.usuario(c.intId)?.nome || '') : '<span class="muted">livre</span>'}</td>
          <td>${(c.contatos || []).length}</td>
          <td>${opps.filter(o => !o.resultado).length} ativas / ${opps.length}</td>
          <td><button class="btn btn-sm btn-ghost" onclick="App.modalCliente(${c.id})">✎</button></td></tr>`;
      }).join('')}</table></div></div>`
      : `<div class="panel"><p class="muted">Nenhum cliente cadastrado ainda. Clique em <b>＋ Novo Cliente</b> para começar o mapeamento.</p></div>`}`;
  },

  abrirCliente(id) {
    const c = Store.cliente(id);
    if (!c) return;
    const opps = Store.db.oportunidades.filter(o => o.clienteId === id && Store.oppVisivel(o, this.user));
    const ints = Store.db.interacoes.filter(i => i.clienteId === id && Store.intVisivel(i, this.user)).sort((a, b) => b.data.localeCompare(a.data));
    this.modal(`
      <h3>🏭 ${esc(c.empresa)}</h3>
      <p class="muted">${esc(c.cidade || '')} · ${esc(c.regiao || '')} · ${esc(c.segmento || '')}</p>
      <p class="muted">Carteira — Externo: <b>${c.extId ? esc(Store.usuario(c.extId)?.nome || '') : 'livre'}</b> · Interno: <b>${c.intId ? esc(Store.usuario(c.intId)?.nome || '') : 'livre'}</b></p>
      ${c.obs ? `<p style="margin:8px 0">${esc(c.obs)}</p>` : ''}
      <div class="panel" style="margin-top:12px"><h3>👥 Contatos mapeados</h3>
        ${(c.contatos || []).length ? `<div class="table-wrap"><table><tr><th>Nome</th><th>Setor</th><th>Telefone</th><th>E-mail</th></tr>
          ${c.contatos.map(ct => `<tr><td>${esc(ct.nome)}</td><td>${esc(ct.setor || '—')}</td><td>${esc(ct.telefone || '—')}</td><td>${esc(ct.email || '—')}</td></tr>`).join('')}</table></div>`
          : '<p class="muted">Nenhum contato mapeado.</p>'}
      </div>
      <div class="panel"><h3>📈 Oportunidades</h3>
        ${opps.length ? opps.map(o => `<p style="margin-bottom:6px"><span class="link" onclick="App.fecharModal();App.abrirOpp(${o.id})">${esc(o.titulo)}</span> ${this.etapaChip(o)} <b>${fmtMoeda(o.valor)}</b></p>`).join('') : '<p class="muted">Nenhuma.</p>'}
      </div>
      <div class="panel"><h3>📚 Últimas interações</h3>
        ${ints.length ? `<ul class="timeline">${ints.slice(0, 6).map(i => `<li><div class="quando">${fmtData(i.data)} · ${esc(i.tipo)} · ${esc(Store.usuario(i.responsavelId)?.nome || '')}</div>${esc(i.descricao)}${i.relatorio ? ` <span class="link" onclick="App.fecharModal();App.verInteracao(${i.id})">📝 ver relatório</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Nenhuma.</p>'}
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="App.fecharModal()">Fechar</button>
        <button class="btn btn-primary" onclick="App.fecharModal();App.modalCliente(${c.id})">✎ Editar</button>
      </div>`);
  },

  modalCliente(id) {
    const c = id ? Store.cliente(id) : { contatos: [] };
    const cfg = Store.db.config;
    const opts = (lista, sel) => lista.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
    this.modal(`
      <h3>${id ? '✎ Editar' : '＋ Novo'} Cliente</h3>
      <div class="form-grid">
        <div class="fg full"><label>Empresa *</label><input id="f_empresa" value="${esc(c.empresa || '')}"></div>
        <div class="fg"><label>Cidade</label><input id="f_cidade" value="${esc(c.cidade || '')}"></div>
        <div class="fg"><label>Região</label><select id="f_regiao"><option value=""></option>${opts(cfg.regioes, c.regiao)}</select></div>
        <div class="fg"><label>Segmento</label><select id="f_segmento"><option value=""></option>${opts(cfg.segmentos, c.segmento)}</select></div>
        <div class="fg"><label>&nbsp;</label><span class="muted">Segmentação p/ filtros e relatórios</span></div>
        <div class="fg"><label>Carteira — Vend. Externo</label><select id="f_ext" ${this.user.papel === 'externo' || this.user.papel === 'interno' ? 'disabled' : ''}><option value="">— livre —</option>
          ${Store.db.usuarios.filter(u => u.papel === 'externo').map(u => `<option value="${u.id}" ${u.id === c.extId ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></div>
        <div class="fg"><label>Carteira — Vend. Interno</label><select id="f_int" ${this.user.papel === 'externo' || this.user.papel === 'interno' ? 'disabled' : ''}><option value="">— livre —</option>
          ${Store.db.usuarios.filter(u => u.papel === 'interno').map(u => `<option value="${u.id}" ${u.id === c.intId ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></div>
        <div class="fg full"><label>Observações</label><textarea id="f_obs" rows="2">${esc(c.obs || '')}</textarea></div>
      </div>
      <h3 style="margin-top:16px">👥 Contatos</h3>
      <div id="contatosBox">${(c.contatos || []).map((ct, i) => this.contatoRow(ct, i)).join('')}</div>
      <button class="btn btn-sm btn-ghost" onclick="App.addContatoRow()">＋ Adicionar contato</button>
      <div class="modal-actions">
        ${id ? `<button class="btn btn-danger" onclick="App.excluirCliente(${id})">Excluir</button>` : ''}
        <span class="spacer"></span>
        <button class="btn btn-ghost" onclick="App.fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.salvarCliente(${id || 'null'})">💾 Salvar</button>
      </div>`);
    if (!(c.contatos || []).length) this.addContatoRow();
  },

  contatoRow(ct = {}, i = 0) {
    const setores = Store.db.config.setores.map(s => `<option ${s === ct.setor ? 'selected' : ''}>${esc(s)}</option>`).join('');
    return `<div class="contato-row" data-ct>
      <input placeholder="Nome" class="ct-nome" value="${esc(ct.nome || '')}">
      <select class="ct-setor"><option value=""></option>${setores}</select>
      <input placeholder="Telefone" class="ct-tel" value="${esc(ct.telefone || '')}">
      <input placeholder="E-mail" class="ct-email" value="${esc(ct.email || '')}">
      <button class="btn-icon" title="Remover" onclick="this.parentElement.remove()">🗑</button>
    </div>`;
  },

  addContatoRow() {
    document.getElementById('contatosBox').insertAdjacentHTML('beforeend', this.contatoRow());
  },

  salvarCliente(id) {
    const empresa = document.getElementById('f_empresa').value.trim();
    if (!empresa) return this.toast('⚠️ Informe o nome da empresa');
    const contatos = [...document.querySelectorAll('[data-ct]')].map(r => ({
      nome: r.querySelector('.ct-nome').value.trim(),
      setor: r.querySelector('.ct-setor').value,
      telefone: r.querySelector('.ct-tel').value.trim(),
      email: r.querySelector('.ct-email').value.trim()
    })).filter(ct => ct.nome);
    const dados = {
      empresa, cidade: document.getElementById('f_cidade').value.trim(),
      regiao: document.getElementById('f_regiao').value,
      segmento: document.getElementById('f_segmento').value,
      obs: document.getElementById('f_obs').value.trim(), contatos
    };
    // carteiras: só gerência/diretoria altera (campos desabilitados p/ vendedores)
    const selExt = document.getElementById('f_ext'), selInt = document.getElementById('f_int');
    if (!selExt.disabled) { dados.extId = selExt.value || null; dados.intId = selInt.value || null; }
    else if (!id && this.user.papel === 'externo') { dados.extId = this.user.id; dados.intId = null; }
    else if (!id && this.user.papel === 'interno') { dados.intId = this.user.id; dados.extId = null; }
    let cli;
    if (id) {
      cli = Object.assign({}, Store.cliente(id), dados);
    } else {
      cli = { id: Store.novoId(), criadoEm: hoje(), ...dados };
    }
    Store.upsert('clientes', cli);
    this.fecharModal();
    this.go('clientes');
    this.toast('💾 Cliente salvo!');
  },

  excluirCliente(id) {
    const nOpps = Store.db.oportunidades.filter(o => o.clienteId === id).length;
    if (nOpps) return this.toast(`⚠️ Cliente tem ${nOpps} oportunidade(s). Exclua-as antes.`);
    if (!confirm('Excluir este cliente?')) return;
    Store.remove('clientes', id);
    this.fecharModal(); this.go('clientes');
  },

  // ================= PIPELINE / OPORTUNIDADES =================
  vPipeline() {
    const cfg = Store.db.config;
    const ativas = this.aplicaFiltros(this.oppsAtivas());
    const fechadas = this.aplicaFiltros(Store.oppsVisiveis(this.user).filter(o => o.resultado));
    return `
    <div class="page-head"><h2>📈 Funil de Oportunidades</h2><span class="spacer"></span>
      <button class="btn btn-accent" onclick="App.novaOportunidade()">＋ Nova Oportunidade</button></div>
    ${this.filtrosHTML()}
    <div class="kanban">
      ${cfg.etapas.map(et => {
        const lista = ativas.filter(o => o.etapa === et);
        const total = lista.reduce((s, o) => s + (o.valor || 0), 0);
        return `<div class="kcol">
          <div class="kcol-head"><span class="t">${esc(et)}</span><span class="n">${lista.length}</span></div>
          <div class="kcol-total">${fmtMoeda(total)}</div>
          ${lista.map(o => {
            const ag = this.agendaDe(o);
            return `<div class="kcard ${ag === 'vencido' ? 'atrasado' : ''}" onclick="App.abrirOpp(${o.id})">
              <div class="t">${esc(o.titulo)}</div>
              <div class="m">${esc(Store.cliente(o.clienteId)?.empresa || '')}</div>
              <div class="v">${fmtMoeda(o.valor)}</div>
              <div class="m">${esc(Store.usuario(o.responsavelId)?.nome || '')} · ${esc(o.fabricante || '')}</div>
              ${ag === 'vencido' ? '<div class="m" style="color:var(--vermelho)">⚠ follow-up vencido</div>' : ''}
              <div class="kmove" onclick="event.stopPropagation()">
                <button title="Etapa anterior" onclick="App.moverOpp(${o.id},-1)">◀</button>
                <button title="Próxima etapa" onclick="App.moverOpp(${o.id},1)">▶</button>
              </div>
            </div>`;
          }).join('')}
        </div>`;
      }).join('')}
    </div>
    <div class="panel"><h3>🏁 Encerradas (${fechadas.length})</h3>
      ${fechadas.length ? `<div class="table-wrap"><table><tr><th>Oportunidade</th><th>Cliente</th><th>Responsável</th><th>Resultado</th><th>Valor</th></tr>
        ${fechadas.slice().reverse().slice(0, 15).map(o => `<tr>
          <td><span class="link" onclick="App.abrirOpp(${o.id})">${esc(o.titulo)}</span></td>
          <td>${esc(Store.cliente(o.clienteId)?.empresa || '—')}</td>
          <td>${esc(Store.usuario(o.responsavelId)?.nome || '—')}</td>
          <td>${this.etapaChip(o)}</td><td><b>${fmtMoeda(o.valor)}</b></td></tr>`).join('')}</table></div>`
        : '<p class="muted">Nenhuma oportunidade encerrada ainda.</p>'}
    </div>`;
  },

  moverOpp(id, dir) {
    const o = Store.opp(id);
    const ets = Store.db.config.etapas;
    const i = ets.indexOf(o.etapa) + dir;
    if (i < 0 || i >= ets.length) return;
    o.etapa = ets[i];
    o.ultimoContato = hoje();
    Store.upsert('oportunidades', o);
    this.go('pipeline');
    this.toast(`➡️ "${o.titulo}" agora em ${o.etapa}`);
  },

  novaOportunidade() { this.modalOpp(); },

  modalOpp(id) {
    if (!Store.db.clientes.length && !id) {
      this.toast('⚠️ Cadastre um cliente primeiro');
      this.go('clientes');
      return this.modalCliente();
    }
    const o = id ? Store.opp(id) : {};
    const cfg = Store.db.config;
    const opts = (lista, sel) => lista.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const vendedores = Store.db.usuarios.filter(u => u.papel !== 'diretor');
    this.modal(`
      <h3>${id ? '✎ Editar' : '＋ Nova'} Oportunidade</h3>
      <div class="form-grid">
        <div class="fg full"><label>Título / Descrição *</label><input id="o_titulo" value="${esc(o.titulo || '')}" placeholder="Ex.: Reforma de cilindros — frota CAT"></div>
        <div class="fg"><label>Cliente *</label><select id="o_cliente">${Store.clientesVisiveis(this.user).map(c => `<option value="${c.id}" ${c.id === o.clienteId ? 'selected' : ''}>${esc(c.empresa)}</option>`).join('')}</select></div>
        <div class="fg"><label>Fabricante / Linha</label><select id="o_fab"><option value=""></option>${opts(cfg.fabricantes, o.fabricante)}</select></div>
        <div class="fg"><label>Responsável</label><select id="o_resp">${vendedores.map(u => `<option value="${u.id}" ${u.id === (o.responsavelId || this.user.id) ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></div>
        <div class="fg"><label>Etapa</label><select id="o_etapa">${opts(cfg.etapas, o.etapa || cfg.etapas[0])}</select></div>
        <div class="fg"><label>Prioridade</label><select id="o_prio">${opts(cfg.prioridades, o.prioridade || 'Média')}</select></div>
        <div class="fg"><label>Valor estimado (R$)</label><input id="o_valor" type="number" min="0" step="100" value="${o.valor || ''}"></div>
        <div class="fg"><label>Último contato</label><input id="o_ult" type="date" value="${o.ultimoContato || hoje()}"></div>
        <div class="fg"><label>Próximo contato</label><input id="o_prox" type="date" value="${o.proximoContato || addDias(hoje(), cfg.diasFollowUp)}"></div>
        <div class="fg full"><label>Observações</label><textarea id="o_obs" rows="2">${esc(o.obs || '')}</textarea></div>
      </div>
      <div class="modal-actions">
        ${id ? `<button class="btn btn-danger" onclick="App.excluirOpp(${id})">Excluir</button>` : ''}
        <span class="spacer"></span>
        <button class="btn btn-ghost" onclick="App.fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.salvarOpp(${id || 'null'})">💾 Salvar</button>
      </div>`);
  },

  salvarOpp(id) {
    const titulo = document.getElementById('o_titulo').value.trim();
    if (!titulo) return this.toast('⚠️ Informe o título');
    const dados = {
      titulo,
      clienteId: +document.getElementById('o_cliente').value,
      fabricante: document.getElementById('o_fab').value,
      responsavelId: document.getElementById('o_resp').value,
      etapa: document.getElementById('o_etapa').value,
      prioridade: document.getElementById('o_prio').value,
      valor: +document.getElementById('o_valor').value || 0,
      ultimoContato: document.getElementById('o_ult').value,
      proximoContato: document.getElementById('o_prox').value,
      obs: document.getElementById('o_obs').value.trim()
    };
    let opp;
    if (id) opp = Object.assign({}, Store.opp(id), dados);
    else opp = { id: Store.novoId(), dataCadastro: hoje(), resultado: null, ...dados };
    Store.upsert('oportunidades', opp);
    this.fecharModal();
    this.go('pipeline');
    this.toast('💾 Oportunidade salva!');
  },

  excluirOpp(id) {
    if (!confirm('Excluir esta oportunidade e suas interações/cotações?')) return;
    Store.removeOppCascade(id);
    this.fecharModal(); this.go('pipeline');
  },

  abrirOpp(id) {
    const o = Store.opp(id);
    if (!o) return;
    const c = Store.cliente(o.clienteId);
    const ints = Store.db.interacoes.filter(i => i.oppId === id).sort((a, b) => b.data.localeCompare(a.data));
    const cots = Store.db.cotacoes.filter(ct => ct.oppId === id);
    this.modal(`
      <h3>📈 ${esc(o.titulo)}</h3>
      <p>${this.etapaChip(o)} <span class="chip ${(o.prioridade || '').toLowerCase().replace('é', 'e')}">${esc(o.prioridade || '')}</span> · <b>${fmtMoeda(o.valor)}</b></p>
      <p class="muted" style="margin:6px 0">🏭 ${esc(c?.empresa || '—')} · ${esc(o.fabricante || 'sem linha')} · Resp.: <b>${esc(Store.usuario(o.responsavelId)?.nome || '—')}</b></p>
      <p class="muted">Cadastro ${fmtData(o.dataCadastro)} · Último contato ${fmtData(o.ultimoContato)} · Próximo ${fmtData(o.proximoContato)} (${this.diasSemAtualizacao(o)} dias sem atualização)</p>
      ${o.obs ? `<p style="margin:8px 0">${esc(o.obs)}</p>` : ''}
      ${o.motivoPerda ? `<p style="margin:8px 0;color:var(--vermelho)">Motivo da perda: ${esc(o.motivoPerda)}</p>` : ''}
      <div class="panel" style="margin-top:12px"><h3>📚 Interações (${ints.length})</h3>
        ${ints.length ? `<ul class="timeline">${ints.slice(0, 8).map(i => `<li><div class="quando">${fmtData(i.data)} · ${esc(i.tipo)} · ${esc(Store.usuario(i.responsavelId)?.nome || '')}</div>${esc(i.descricao)}${i.proximaAcao ? ` <b>→ ${esc(i.proximaAcao)}</b>` : ''}${i.relatorio ? ` <span class="link" onclick="App.fecharModal();App.verInteracao(${i.id})">📝 ver relatório</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Nenhuma interação registrada.</p>'}
        <button class="btn btn-sm btn-accent" onclick="App.fecharModal();App.modalInteracao(null,${id})">＋ Registrar interação</button>
      </div>
      <div class="panel"><h3>📄 Cotações (${cots.length})</h3>
        ${cots.length ? cots.map(ct => `<p style="margin-bottom:6px"><b>${esc(ct.numero)}</b> · ${fmtMoeda(ct.valor)} · <span class="chip ${ct.status.toLowerCase()}">${esc(ct.status)}</span> · validade ${fmtData(ct.validade)}</p>`).join('') : '<p class="muted">Nenhuma cotação.</p>'}
        <button class="btn btn-sm btn-accent" onclick="App.fecharModal();App.modalCotacao(null,${id})">＋ Nova cotação</button>
      </div>
      <div class="modal-actions">
        ${!o.resultado ? `
          <button class="btn btn-accent" onclick="App.fecharOpp(${id},'ganho')">✓ Ganho</button>
          <button class="btn btn-danger" onclick="App.fecharOpp(${id},'perdido')">✕ Perdido</button>` :
          `<button class="btn btn-ghost" onclick="App.reabrirOpp(${id})">↩ Reabrir</button>`}
        <span class="spacer"></span>
        <button class="btn btn-ghost" onclick="App.fecharModal()">Fechar</button>
        <button class="btn btn-primary" onclick="App.fecharModal();App.modalOpp(${id})">✎ Editar</button>
      </div>`);
  },

  fecharOpp(id, resultado) {
    const o = Store.opp(id);
    if (resultado === 'perdido') {
      const m = prompt('Motivo da perda (preço, prazo, concorrência...)') || '';
      o.motivoPerda = m;
    } else if (o.etapa !== 'Fechado') {
      o.etapa = 'Fechado';
    }
    o.resultado = resultado;
    o.dataFechamento = hoje();
    o.ultimoContato = hoje();
    Store.upsert('oportunidades', o);
    this.fecharModal();
    this.go('pipeline');
    this.toast(resultado === 'ganho' ? '🏆 Cliente GANHO! É do Cruzeiro! 💙' : 'Registrado como perdido.');
  },

  reabrirOpp(id) {
    const o = Store.opp(id);
    o.resultado = null; o.motivoPerda = ''; o.dataFechamento = null;
    if (o.etapa === 'Fechado') o.etapa = 'Proposta';
    Store.upsert('oportunidades', o);
    this.fecharModal(); this.go('pipeline');
  },

  // ================= INTERAÇÕES =================
  vInteracoes() {
    const f = this.filtros;
    let ints = Store.db.interacoes.filter(i => Store.intVisivel(i, this.user)).sort((a, b) => b.data.localeCompare(a.data));
    if (f.resp) ints = ints.filter(i => i.responsavelId === f.resp);
    return `
    <div class="page-head"><h2>📚 Interações, Prospecções & Visitas</h2><span class="spacer"></span>
      <button class="btn btn-accent" onclick="App.modalInteracao()">＋ Registrar</button></div>
    ${this.filtrosHTML()}
    ${ints.length ? `<div class="panel"><div class="table-wrap"><table>
      <tr><th>Data</th><th>Tipo</th><th>Cliente</th><th>Oportunidade</th><th>Descrição</th><th>Responsável</th><th>Próxima ação</th></tr>
      ${ints.slice(0, 60).map(i => `<tr>
        <td>${fmtData(i.data)}</td><td>${esc(i.tipo)}</td>
        <td>${esc(Store.cliente(i.clienteId)?.empresa || '—')}</td>
        <td>${i.oppId ? `<span class="link" onclick="App.abrirOpp(${i.oppId})">${esc(Store.opp(i.oppId)?.titulo || '—')}</span>` : '—'}</td>
        <td><span class="link" onclick="App.verInteracao(${i.id})">${esc(i.descricao.slice(0, 60))}${i.descricao.length > 60 ? '…' : ''}</span>${i.relatorio ? ' 📝' : ''}</td>
        <td>${esc(Store.usuario(i.responsavelId)?.nome || '—')}</td>
        <td>${esc(i.proximaAcao || '—')}</td></tr>`).join('')}</table></div></div>`
      : `<div class="panel"><p class="muted">Nenhuma interação. Registre ligações, visitas presenciais/virtuais, e-mails e WhatsApps aqui.</p></div>`}`;
  },

  modalInteracao(_, oppId) {
    if (!Store.db.clientes.length) { this.toast('⚠️ Cadastre um cliente primeiro'); return; }
    const cfg = Store.db.config;
    const opp = oppId ? Store.opp(oppId) : null;
    const vendedores = Store.db.usuarios.filter(u => u.papel !== 'diretor');
    this.modal(`
      <h3>＋ Registrar Interação</h3>
      <div class="form-grid">
        <div class="fg"><label>Data</label><input id="i_data" type="date" value="${hoje()}"></div>
        <div class="fg"><label>Tipo *</label><select id="i_tipo">${cfg.tiposInteracao.map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
        <div class="fg"><label>Cliente *</label><select id="i_cliente" onchange="App.syncOppsDoCliente()">${Store.clientesVisiveis(this.user).map(c => `<option value="${c.id}" ${opp && c.id === opp.clienteId ? 'selected' : ''}>${esc(c.empresa)}</option>`).join('')}</select></div>
        <div class="fg"><label>Oportunidade (opcional)</label><select id="i_opp"></select></div>
        <div class="fg full"><label>Descrição * <button type="button" class="btn-mic" title="Ditar por voz" onclick="App.ditar('i_desc', this)">🎤</button></label><textarea id="i_desc" rows="3" placeholder="O que foi tratado? (ou toque no microfone e fale)"></textarea></div>
        <div class="fg full"><label>Relatório de visita / comentários <button type="button" class="btn-mic" title="Ditar por voz" onclick="App.ditar('i_rel', this)">🎤</button> <button type="button" class="btn-mic" title="Limpar ruídos e organizar em tópicos" onclick="App.organizarTexto('i_rel')">✨ Organizar</button></label><textarea id="i_rel" rows="5" placeholder="Detalhe a visita: quem recebeu, necessidades levantadas, equipamentos vistos, próximos passos... (ou dite por voz e toque em ✨ Organizar)"></textarea></div>
        <div class="fg"><label>Responsável</label><select id="i_resp">${vendedores.map(u => `<option value="${u.id}" ${u.id === this.user.id ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></div>
        <div class="fg"><label>Próxima ação</label><input id="i_prox" placeholder="Ex.: Enviar proposta"></div>
        <div class="fg full"><label><input type="checkbox" id="i_atualiza" checked style="width:auto;margin-right:6px">Atualizar "último contato" e reagendar follow-up (+${cfg.diasFollowUp} dias)</label></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="App.fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.salvarInteracao()">💾 Salvar</button>
      </div>`);
    this.syncOppsDoCliente(oppId);
  },

  syncOppsDoCliente(selId) {
    const cid = +document.getElementById('i_cliente').value;
    const sel = document.getElementById('i_opp');
    const opps = Store.db.oportunidades.filter(o => o.clienteId === cid && !o.resultado && Store.oppVisivel(o, this.user));
    sel.innerHTML = `<option value="">— nenhuma —</option>` +
      opps.map(o => `<option value="${o.id}" ${o.id === selId ? 'selected' : ''}>${esc(o.titulo)}</option>`).join('');
  },

  salvarInteracao() {
    const desc = document.getElementById('i_desc').value.trim();
    if (!desc) return this.toast('⚠️ Descreva a interação');
    const data = document.getElementById('i_data').value;
    const oppId = +document.getElementById('i_opp').value || null;
    const int = {
      id: Store.novoId(), data,
      tipo: document.getElementById('i_tipo').value,
      clienteId: +document.getElementById('i_cliente').value,
      oppId, descricao: desc,
      relatorio: document.getElementById('i_rel').value.trim(),
      responsavelId: document.getElementById('i_resp').value,
      proximaAcao: document.getElementById('i_prox').value.trim()
    };
    Store.upsert('interacoes', int);
    if (oppId && document.getElementById('i_atualiza').checked) {
      const o = Store.opp(oppId);
      o.ultimoContato = data;
      o.proximoContato = addDias(data, Store.db.config.diasFollowUp);
      Store.upsert('oportunidades', o);
    }
    this.fecharModal();
    this.go('interacoes');
    this.toast('💾 Interação registrada!');
  },

  // ================= COTAÇÕES =================
  vCotacoes() {
    const f = this.filtros;
    let cots = Store.db.cotacoes.filter(c => Store.cotVisivel(c, this.user)).sort((a, b) => b.id - a.id);
    if (f.resp) cots = cots.filter(c => c.responsavelId === f.resp);
    if (f.fab) cots = cots.filter(c => c.fabricante === f.fab);
    const abertas = cots.filter(c => c.status === 'Aberto' || c.status === 'Pendente');
    const totAb = abertas.reduce((s, c) => s + (c.valor || 0), 0);
    const pedidos = cots.filter(c => c.status === 'Pedido');
    return `
    <div class="page-head"><h2>📄 Controle de Cotações</h2><span class="spacer"></span>
      <button class="btn btn-accent" onclick="App.modalCotacao()">＋ Nova Cotação</button></div>
    ${this.filtrosHTML()}
    <div class="cards">
      <div class="kpi"><div class="label">Em aberto / pendentes</div><div class="valor">${abertas.length}</div><div class="extra">${fmtMoeda(totAb)}</div></div>
      <div class="kpi"><div class="label">Pedidos convertidos</div><div class="valor">${pedidos.length}</div><div class="extra">${fmtMoeda(pedidos.reduce((s, c) => s + (c.valor || 0), 0))}</div></div>
      <div class="kpi ${abertas.filter(c => c.validade && c.validade < hoje()).length ? 'alerta' : ''}"><div class="label">Vencidas s/ resposta</div><div class="valor">${abertas.filter(c => c.validade && c.validade < hoje()).length}</div><div class="extra">renegociar validade</div></div>
    </div>
    ${cots.length ? `<div class="panel"><div class="table-wrap"><table>
      <tr><th>Número</th><th>Cliente</th><th>Fabricante</th><th>Responsável</th><th>Valor</th><th>Envio</th><th>Validade</th><th>Status</th><th></th></tr>
      ${cots.map(ct => {
        const vencida = (ct.status === 'Aberto' || ct.status === 'Pendente') && ct.validade && ct.validade < hoje();
        return `<tr>
        <td><b>${esc(ct.numero)}</b></td>
        <td>${esc(Store.cliente(ct.clienteId)?.empresa || '—')}</td>
        <td>${esc(ct.fabricante || '—')}</td>
        <td>${esc(Store.usuario(ct.responsavelId)?.nome || '—')}</td>
        <td><b>${fmtMoeda(ct.valor)}</b></td>
        <td>${fmtData(ct.dataEnvio)}</td>
        <td>${vencida ? `<span class="chip vencido">${fmtData(ct.validade)}</span>` : fmtData(ct.validade)}</td>
        <td><select class="chip-select" onchange="App.mudarStatusCot(${ct.id}, this.value)" style="padding:4px 8px;border-radius:8px;border:1px solid var(--borda)">
          ${Store.db.config.statusCotacao.map(s => `<option ${s === ct.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></td>
        <td><button class="btn btn-sm btn-ghost" onclick="App.modalCotacao(${ct.id})">✎</button></td></tr>`;
      }).join('')}</table></div></div>`
      : `<div class="panel"><p class="muted">Nenhuma cotação. As cotações seguem numeração automática COT-${new Date().getFullYear()}-0001.</p></div>`}`;
  },

  mudarStatusCot(id, status) {
    const ct = Store.db.cotacoes.find(c => c.id === id);
    ct.status = status;
    Store.upsert('cotacoes', ct);
    this.toast(`📄 ${ct.numero} → ${status}${status === 'Pedido' ? ' 🏆' : ''}`);
    this.go('cotacoes');
  },

  modalCotacao(id, oppId) {
    if (!Store.db.clientes.length) { this.toast('⚠️ Cadastre um cliente primeiro'); return; }
    const ct = id ? Store.db.cotacoes.find(c => c.id === id) : {};
    const opp = oppId ? Store.opp(oppId) : (ct.oppId ? Store.opp(ct.oppId) : null);
    const cfg = Store.db.config;
    const vendedores = Store.db.usuarios.filter(u => u.papel !== 'diretor');
    this.modal(`
      <h3>${id ? '✎ Editar' : '＋ Nova'} Cotação ${ct.numero ? `<span class="muted">${esc(ct.numero)}</span>` : ''}</h3>
      <div class="form-grid">
        <div class="fg"><label>Cliente *</label><select id="c_cliente">${Store.clientesVisiveis(this.user).map(c => `<option value="${c.id}" ${(opp ? c.id === opp.clienteId : c.id === ct.clienteId) ? 'selected' : ''}>${esc(c.empresa)}</option>`).join('')}</select></div>
        <div class="fg"><label>Oportunidade vinculada</label><select id="c_opp"><option value="">— nenhuma —</option>
          ${Store.oppsVisiveis(this.user).filter(o => !o.resultado).map(o => `<option value="${o.id}" ${o.id === (oppId || ct.oppId) ? 'selected' : ''}>${esc(o.titulo)}</option>`).join('')}</select></div>
        <div class="fg"><label>Fabricante / Linha</label><select id="c_fab"><option value=""></option>${cfg.fabricantes.map(x => `<option ${x === (ct.fabricante || opp?.fabricante) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="fg"><label>Responsável</label><select id="c_resp">${vendedores.map(u => `<option value="${u.id}" ${u.id === (ct.responsavelId || this.user.id) ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></div>
        <div class="fg"><label>Valor (R$) *</label><input id="c_valor" type="number" min="0" step="100" value="${ct.valor || opp?.valor || ''}"></div>
        <div class="fg"><label>Status</label><select id="c_status">${cfg.statusCotacao.map(s => `<option ${s === (ct.status || 'Aberto') ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="fg"><label>Data de envio</label><input id="c_envio" type="date" value="${ct.dataEnvio || hoje()}"></div>
        <div class="fg"><label>Validade</label><input id="c_val" type="date" value="${ct.validade || addDias(hoje(), 30)}"></div>
      </div>
      <div class="modal-actions">
        ${id ? `<button class="btn btn-danger" onclick="if(confirm('Excluir cotação?')){Store.remove('cotacoes',${id});App.fecharModal();App.go('cotacoes')}">Excluir</button>` : ''}
        <span class="spacer"></span>
        <button class="btn btn-ghost" onclick="App.fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.salvarCotacao(${id || 'null'})">💾 Salvar</button>
      </div>`);
  },

  async salvarCotacao(id) {
    const valor = +document.getElementById('c_valor').value;
    if (!valor) return this.toast('⚠️ Informe o valor');
    const dados = {
      clienteId: +document.getElementById('c_cliente').value,
      oppId: +document.getElementById('c_opp').value || null,
      fabricante: document.getElementById('c_fab').value,
      responsavelId: document.getElementById('c_resp').value,
      valor,
      status: document.getElementById('c_status').value,
      dataEnvio: document.getElementById('c_envio').value,
      validade: document.getElementById('c_val').value
    };
    if (id) {
      Store.upsert('cotacoes', Object.assign({}, Store.db.cotacoes.find(c => c.id === id), dados));
    } else {
      this.toast('Gerando número da cotação...');
      try {
        const numero = await Store.proximoNumeroCotacao();
        Store.upsert('cotacoes', { id: Store.novoId(), numero, ...dados });
      } catch (e) {
        return this.toast('⚠️ Sem conexão — tente novamente para numerar a cotação');
      }
    }
    this.fecharModal();
    this.go('cotacoes');
    this.toast('💾 Cotação salva!');
  },

  // ================= AGENDA =================
  vAgenda() {
    const ativas = this.aplicaFiltros(this.oppsAtivas());
    const secs = [
      { k: 'vencido', t: '🔴 Vencidos', chip: 'vencido' },
      { k: 'hoje', t: '🟠 Vence hoje', chip: 'hoje' },
      { k: 'prox', t: '🔵 Próximos 7 dias', chip: 'prox' }
    ];
    const parados = ativas.filter(o => this.diasSemAtualizacao(o) > Store.db.config.diasParado);
    return `
    <div class="page-head"><h2>📅 Agenda Inteligente & Alertas</h2>
      <div class="sub">Follow-ups calculados automaticamente a partir do "próximo contato" de cada oportunidade</div></div>
    ${this.filtrosHTML()}
    ${secs.map(s => {
      const lista = ativas.filter(o => this.agendaDe(o) === s.k)
        .sort((a, b) => (a.proximoContato || '').localeCompare(b.proximoContato || ''));
      return `<div class="panel agenda-sec"><h3>${s.t} <span class="chip ${s.chip}">${lista.length}</span></h3>
        ${lista.length ? `<div class="table-wrap"><table><tr><th>Oportunidade</th><th>Cliente</th><th>Responsável</th><th>Próximo contato</th><th></th></tr>
          ${lista.map(o => `<tr>
            <td><span class="link" onclick="App.abrirOpp(${o.id})">${esc(o.titulo)}</span></td>
            <td>${esc(Store.cliente(o.clienteId)?.empresa || '—')}</td>
            <td>${esc(Store.usuario(o.responsavelId)?.nome || '—')}</td>
            <td><b>${fmtData(o.proximoContato)}</b></td>
            <td><button class="btn btn-sm btn-accent" onclick="App.modalInteracao(null,${o.id})">Registrar contato</button></td></tr>`).join('')}</table></div>`
          : '<p class="muted">Nada por aqui. ✅</p>'}
      </div>`;
    }).join('')}
    <div class="panel agenda-sec"><h3>⏰ Sem atualização +${Store.db.config.diasParado} dias <span class="chip pendente">${parados.length}</span></h3>
      ${parados.length ? `<div class="table-wrap"><table><tr><th>Oportunidade</th><th>Responsável</th><th>Dias parada</th><th></th></tr>
        ${parados.map(o => `<tr><td><span class="link" onclick="App.abrirOpp(${o.id})">${esc(o.titulo)}</span></td>
          <td>${esc(Store.usuario(o.responsavelId)?.nome || '—')}</td><td><b>${this.diasSemAtualizacao(o)}</b></td>
          <td><button class="btn btn-sm btn-accent" onclick="App.modalInteracao(null,${o.id})">Registrar contato</button></td></tr>`).join('')}</table></div>`
        : '<p class="muted">Funil todo atualizado. 💚</p>'}
    </div>`;
  },

  // ================= DASHBOARD COMERCIAL =================
  vComercial() {
    const opps = this.aplicaFiltros(Store.oppsVisiveis(this.user));
    const vendedores = Store.podeVerTudo(this.user)
      ? Store.db.usuarios.filter(u => u.papel !== 'diretor')
      : [this.user];
    const linhas = vendedores.map(u => {
      const minhas = opps.filter(o => o.responsavelId === u.id);
      const ativas = minhas.filter(o => !o.resultado);
      const ganhas = minhas.filter(o => o.resultado === 'ganho');
      const perdidas = minhas.filter(o => o.resultado === 'perdido');
      const fechadas = ganhas.length + perdidas.length;
      const ints = Store.db.interacoes.filter(i => i.responsavelId === u.id);
      const visitas = ints.filter(i => i.tipo.startsWith('Visita'));
      return {
        u, ativas: ativas.length, valorAtivo: ativas.reduce((s, o) => s + (o.valor || 0), 0),
        interacoes: ints.length, visitas: visitas.length,
        ganhas: ganhas.length, perdidas: perdidas.length,
        conv: fechadas ? ganhas.length / fechadas : 0,
        valorGanho: ganhas.reduce((s, o) => s + (o.valor || 0), 0)
      };
    }).sort((a, b) => b.valorGanho - a.valorGanho || b.valorAtivo - a.valorAtivo);
    const maxG = Math.max(...linhas.map(l => l.valorGanho), 1);
    return `
    <div class="page-head"><h2>📊 Dashboard Comercial — Performance da Equipe</h2></div>
    ${this.filtrosHTML()}
    <div class="panel"><h3>🏅 Ranking de colaboradores</h3>
      <div class="table-wrap"><table>
        <tr><th>#</th><th>Vendedor</th><th>Perfil</th><th>Ativas</th><th>Pipeline (R$)</th><th>Interações</th><th>Visitas</th><th>Ganhas</th><th>Perdidas</th><th>Conversão</th><th>Valor ganho</th></tr>
        ${linhas.map((l, i) => `<tr>
          <td><b>${i + 1}º</b></td><td><b>${esc(l.u.nome)}</b></td><td class="muted">${esc(l.u.cargo)}</td>
          <td>${l.ativas}</td><td>${fmtMoeda(l.valorAtivo)}</td>
          <td>${l.interacoes}</td><td>${l.visitas}</td>
          <td>${l.ganhas}</td><td>${l.perdidas}</td>
          <td>${fmtPct(l.conv)}</td><td><b>${fmtMoeda(l.valorGanho)}</b></td></tr>`).join('')}
      </table></div>
    </div>
    <div class="panel"><h3>💰 Valor ganho por vendedor</h3>
      ${linhas.filter(l => l.valorGanho > 0).map(l => `<div class="bar-row"><div class="lbl">${esc(l.u.nome)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round(l.valorGanho / maxG * 100)}%"></div></div>
        <div class="bar-val">${fmtMoeda(l.valorGanho)}</div></div>`).join('') || '<p class="muted">Nenhum fechamento ainda — bora pra cima! ⚽</p>'}
    </div>`;
  },

  // ================= DASHBOARD EXECUTIVO =================
  vExecutivo() {
    const opps = this.aplicaFiltros(Store.oppsVisiveis(this.user));
    const ativas = opps.filter(o => !o.resultado);
    const pipeTotal = ativas.reduce((s, o) => s + (o.valor || 0), 0);
    const mesAtual = hoje().slice(0, 7);
    const ganhasMes = opps.filter(o => o.resultado === 'ganho' && (o.dataFechamento || '').startsWith(mesAtual));
    const realizadoMes = ganhasMes.reduce((s, o) => s + (o.valor || 0), 0);
    const meta = Store.db.config.metaMensal;
    const ganhas = opps.filter(o => o.resultado === 'ganho');
    const fechadas = ganhas.length + opps.filter(o => o.resultado === 'perdido').length;
    const ticket = ganhas.length ? ganhas.reduce((s, o) => s + (o.valor || 0), 0) / ganhas.length : 0;

    // evolução 6 meses
    const meses = [];
    for (let k = 5; k >= 0; k--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k);
      const ym = d.toISOString().slice(0, 7);
      meses.push({
        ym, label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
        novos: opps.filter(o => (o.dataCadastro || '').startsWith(ym)).length,
        ganho: opps.filter(o => o.resultado === 'ganho' && (o.dataFechamento || '').startsWith(ym))
          .reduce((s, o) => s + (o.valor || 0), 0)
      });
    }
    const maxM = Math.max(...meses.map(m => m.ganho), 1);

    const porSeg = {};
    ativas.forEach(o => {
      const seg = Store.cliente(o.clienteId)?.segmento || 'Sem segmento';
      porSeg[seg] = porSeg[seg] || { n: 0, v: 0 };
      porSeg[seg].n++; porSeg[seg].v += o.valor || 0;
    });
    const segs = Object.entries(porSeg).sort((a, b) => b[1].v - a[1].v);
    const maxS = Math.max(...segs.map(s => s[1].v), 1);

    return `
    <div class="page-head"><h2>🏆 Dashboard Executivo</h2>
      <div class="sub">Visão de diretoria — pipeline financeiro, meta e evolução</div></div>
    ${this.filtrosHTML()}
    <div class="cards">
      <div class="kpi"><div class="label">Pipeline financeiro</div><div class="valor">${fmtMoeda(pipeTotal)}</div><div class="extra">${ativas.length} oportunidades ativas</div></div>
      <div class="kpi ${realizadoMes >= meta ? '' : 'aviso'}"><div class="label">Meta × realizado (mês)</div><div class="valor">${fmtPct(meta ? realizadoMes / meta : 0)}</div><div class="extra">${fmtMoeda(realizadoMes)} de ${fmtMoeda(meta)}</div></div>
      <div class="kpi"><div class="label">Conversão geral</div><div class="valor">${fmtPct(fechadas ? ganhas.length / fechadas : 0)}</div><div class="extra">${ganhas.length} ganhas / ${fechadas} fechadas</div></div>
      <div class="kpi"><div class="label">Ticket médio</div><div class="valor">${fmtMoeda(ticket)}</div><div class="extra">por oportunidade ganha</div></div>
    </div>
    <div class="grid-2">
      <div class="panel"><h3>📅 Evolução mensal (valor ganho)</h3>
        ${meses.map(m => `<div class="bar-row"><div class="lbl">${m.label} (${m.novos} novos)</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round(m.ganho / maxM * 100)}%"></div></div>
          <div class="bar-val">${fmtMoeda(m.ganho)}</div></div>`).join('')}
      </div>
      <div class="panel"><h3>🧩 Pipeline por segmento</h3>
        ${segs.length ? segs.map(([s, d]) => `<div class="bar-row"><div class="lbl">${esc(s)} (${d.n})</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round(d.v / maxS * 100)}%"></div></div>
          <div class="bar-val">${fmtMoeda(d.v)}</div></div>`).join('') : '<p class="muted">Sem dados ainda.</p>'}
      </div>
    </div>`;
  },

  // ================= RELATÓRIOS =================
  vRelatorios() {
    return `
    <div class="page-head"><h2>🗂 Relatórios & Exportações</h2>
      <div class="sub">Exporte para Excel/CSV ou faça backup completo dos dados</div></div>
    <div class="cards">
      <div class="panel"><h3>📋 Clientes & contatos</h3><p class="muted" style="margin-bottom:10px">Mapeamento completo com segmentação.</p>
        <button class="btn btn-primary" onclick="App.expClientes()">⬇ Exportar CSV</button></div>
      <div class="panel"><h3>📈 Oportunidades</h3><p class="muted" style="margin-bottom:10px">Funil completo com etapas, valores e responsáveis.</p>
        <button class="btn btn-primary" onclick="App.expOpps()">⬇ Exportar CSV</button></div>
      <div class="panel"><h3>📚 Interações</h3><p class="muted" style="margin-bottom:10px">Histórico de prospecções e visitas.</p>
        <button class="btn btn-primary" onclick="App.expInts()">⬇ Exportar CSV</button></div>
      <div class="panel"><h3>📄 Cotações</h3><p class="muted" style="margin-bottom:10px">Controle com status e validades.</p>
        <button class="btn btn-primary" onclick="App.expCots()">⬇ Exportar CSV</button></div>
    </div>
    <div class="panel"><h3>💾 Backup completo</h3>
      <p class="muted" style="margin-bottom:10px">Salve o arquivo de backup no OneDrive regularmente. Para restaurar ou trocar de computador, importe o arquivo.</p>
      <button class="btn btn-accent" onclick="Store.exportJSON()">⬇ Baixar backup (.json)</button>
      <label class="btn btn-ghost" style="display:inline-block;cursor:pointer">⬆ Restaurar backup<input type="file" accept=".json" hidden onchange="App.importar(this.files[0])"></label>
    </div>`;
  },

  expClientes() {
    const rows = [];
    Store.db.clientes.forEach(c => {
      if ((c.contatos || []).length) c.contatos.forEach(ct => rows.push({
        Empresa: c.empresa, Cidade: c.cidade, Regiao: c.regiao, Segmento: c.segmento,
        Contato: ct.nome, Setor: ct.setor, Telefone: ct.telefone, Email: ct.email
      }));
      else rows.push({ Empresa: c.empresa, Cidade: c.cidade, Regiao: c.regiao, Segmento: c.segmento, Contato: '', Setor: '', Telefone: '', Email: '' });
    });
    rows.length ? Store.exportCSV(rows, 'Clientes') : this.toast('Nada para exportar');
  },

  expOpps() {
    const rows = Store.db.oportunidades.map(o => ({
      ID: o.id, Titulo: o.titulo, Empresa: Store.cliente(o.clienteId)?.empresa || '',
      Fabricante: o.fabricante, Responsavel: Store.usuario(o.responsavelId)?.nome || '',
      Etapa: o.etapa, Resultado: o.resultado || 'ativa', Prioridade: o.prioridade,
      Valor: o.valor, Cadastro: o.dataCadastro, UltimoContato: o.ultimoContato,
      ProximoContato: o.proximoContato, Obs: o.obs
    }));
    rows.length ? Store.exportCSV(rows, 'Oportunidades') : this.toast('Nada para exportar');
  },

  expInts() {
    const rows = Store.db.interacoes.map(i => ({
      Data: i.data, Tipo: i.tipo, Empresa: Store.cliente(i.clienteId)?.empresa || '',
      Oportunidade: i.oppId ? (Store.opp(i.oppId)?.titulo || '') : '',
      Descricao: i.descricao, Responsavel: Store.usuario(i.responsavelId)?.nome || '', ProximaAcao: i.proximaAcao
    }));
    rows.length ? Store.exportCSV(rows, 'Interacoes') : this.toast('Nada para exportar');
  },

  expCots() {
    const rows = Store.db.cotacoes.map(c => ({
      Numero: c.numero, Empresa: Store.cliente(c.clienteId)?.empresa || '',
      Fabricante: c.fabricante, Responsavel: Store.usuario(c.responsavelId)?.nome || '',
      Valor: c.valor, Envio: c.dataEnvio, Validade: c.validade, Status: c.status
    }));
    rows.length ? Store.exportCSV(rows, 'Cotacoes') : this.toast('Nada para exportar');
  },

  importar(file) {
    if (!file) return;
    if (!confirm('Restaurar backup? Os dados atuais serão substituídos.')) return;
    Store.importJSON(file, ok => {
      if (ok) { this.toast('✅ Backup restaurado!'); this.go('painel'); }
      else this.toast('⚠️ Arquivo inválido');
    });
  },

  // ================= CONFIGURAÇÕES =================
  vConfig() {
    const cfg = Store.db.config;
    const lista = (key, titulo) => `
      <div class="panel"><h3>${titulo}</h3>
        ${cfg[key].map((x, i) => `<p style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--borda)">
          <span>${esc(x)}</span>
          <button class="btn-icon" onclick="App.rmLista('${key}',${i})">🗑</button></p>`).join('')}
        <div style="display:flex;gap:8px;margin-top:10px">
          <input id="add_${key}" placeholder="Novo item" style="flex:1;padding:8px;border:1px solid var(--borda);border-radius:8px">
          <button class="btn btn-sm btn-accent" onclick="App.addLista('${key}')">＋</button>
        </div>
      </div>`;
    return `
    <div class="page-head"><h2>⚙️ Configurações</h2>
      <div class="sub">Listas do sistema — os novos itens aparecem automaticamente nos formulários e filtros</div></div>
    <div class="panel"><h3>🎯 Meta mensal da equipe</h3>
      <div style="display:flex;gap:8px;align-items:center">
        <input id="cfg_meta" type="number" value="${cfg.metaMensal}" style="padding:9px;border:1px solid var(--borda);border-radius:9px;width:200px">
        <button class="btn btn-primary" onclick="App.salvarMeta()">💾 Salvar</button>
      </div>
      <p class="muted" style="margin-top:8px">Prazo padrão de follow-up: ${cfg.diasFollowUp} dias · Alerta de oportunidade parada: ${cfg.diasParado} dias</p>
    </div>
    <div class="grid-2">
      ${lista('fabricantes', '🏭 Fabricantes / Linhas de Produto')}
      ${lista('segmentos', '🧩 Segmentos de Cliente')}
      ${lista('regioes', '📍 Regiões')}
      ${lista('setores', '👥 Setores de Contato')}
      ${lista('tiposInteracao', '📚 Tipos de Interação')}
    </div>
    <div class="panel"><h3>💙 Sobre</h3>
      <p><b>CRM Tom Mittos 6.1</b> — Gestão Comercial do Grupo JMP (Pneumática · Hidráulica · Eletrônica).</p>
      <p class="muted" style="margin-top:6px">A versão 6.1 é uma homenagem eterna à goleada do Cruzeiro por 6 a 1 sobre o Galo. Nós somos o Cruzeiro! ⚽💙</p>
      <p class="muted" style="margin-top:6px">"Fazer Certo a Coisa Certa" — José Martins Pereira, fundador · "Juntos, somos mais fortes"</p>
    </div>`;
  },

  addLista(key) {
    const inp = document.getElementById('add_' + key);
    const v = inp.value.trim();
    if (!v) return;
    Store.db.config[key].push(v);
    Store.saveConfig(); this.go('config'); this.toast('＋ Item adicionado');
  },

  rmLista(key, i) {
    Store.db.config[key].splice(i, 1);
    Store.saveConfig(); this.go('config');
  },

  salvarMeta() {
    Store.db.config.metaMensal = +document.getElementById('cfg_meta').value || 0;
    Store.saveConfig(); this.toast('🎯 Meta atualizada!');
  },

  // ================= BUSCA GLOBAL =================
  globalSearch(q) {
    q = q.trim().toLowerCase();
    if (q.length < 2) return;
    clearTimeout(this._st);
    this._st = setTimeout(() => {
      const cls = Store.clientesVisiveis(this.user).filter(c =>
        c.empresa.toLowerCase().includes(q) ||
        (c.contatos || []).some(ct => ct.nome.toLowerCase().includes(q)));
      const opps = Store.oppsVisiveis(this.user).filter(o => o.titulo.toLowerCase().includes(q));
      const cots = Store.db.cotacoes.filter(c => Store.cotVisivel(c, this.user) && c.numero.toLowerCase().includes(q));
      document.getElementById('view').innerHTML = `
        <div class="page-head"><h2>🔍 Resultados para "${esc(q)}"</h2></div>
        <div class="panel"><h3>🏭 Clientes (${cls.length})</h3>
          ${cls.map(c => `<p style="margin-bottom:6px"><span class="link" onclick="App.abrirCliente(${c.id})">${esc(c.empresa)}</span> <span class="muted">${esc(c.regiao || '')}</span></p>`).join('') || '<p class="muted">Nenhum.</p>'}</div>
        <div class="panel"><h3>📈 Oportunidades (${opps.length})</h3>
          ${opps.map(o => `<p style="margin-bottom:6px"><span class="link" onclick="App.abrirOpp(${o.id})">${esc(o.titulo)}</span> ${this.etapaChip(o)}</p>`).join('') || '<p class="muted">Nenhuma.</p>'}</div>
        <div class="panel"><h3>📄 Cotações (${cots.length})</h3>
          ${cots.map(c => `<p style="margin-bottom:6px"><b>${esc(c.numero)}</b> · ${esc(Store.cliente(c.clienteId)?.empresa || '')} · ${fmtMoeda(c.valor)}</p>`).join('') || '<p class="muted">Nenhuma.</p>'}</div>`;
    }, 250);
  },

  // ================= DITADO POR VOZ =================
  ditar(targetId, btn) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return this.toast('⚠️ Ditado não suportado neste navegador. No celular, use o 🎤 do próprio teclado.');
    if (this._rec) { this._rec.stop(); return; }
    const ta = document.getElementById(targetId);
    const rec = new SR();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const t = e.results[i][0].transcript.trim();
          ta.value = (ta.value ? ta.value.trim() + ' ' : '') + t;
        }
      }
    };
    rec.onend = () => { this._rec = null; document.querySelectorAll('.btn-mic.rec').forEach(b => b.classList.remove('rec')); this.toast('🎤 Ditado encerrado'); };
    rec.onerror = ev => {
      this._rec = null;
      document.querySelectorAll('.btn-mic.rec').forEach(b => b.classList.remove('rec'));
      if (ev.error === 'not-allowed') this.toast('⚠️ Permita o acesso ao microfone no navegador');
      else if (ev.error !== 'aborted') this.toast('⚠️ Não entendi — tente de novo');
    };
    this._rec = rec;
    btn.classList.add('rec');
    rec.start();
    this.toast('🎤 Pode falar! Toque no microfone de novo para encerrar.');
  },

  // Limpa vícios de fala do ditado e organiza em tópicos + próximas ações
  organizarTexto(targetId) {
    const ta = document.getElementById(targetId);
    let t = (ta.value || '').trim();
    if (!t) return this.toast('⚠️ Dite ou escreva o relatório primeiro');
    if (t.startsWith('📋')) return this.toast('Já está organizado 😉');

    // remove muletas de fala (conservador; \b não funciona com acento, usa \p{L})
    const muletas = ['né\\??', 'é{2,}h*', 'ã+h*n?', 'hu+m+', 'uhm+', 'tipo assim',
      'então tá', 'tá bom\\??', 'tá\\?', 'beleza\\??', 'enfim', 'ok então'];
    muletas.forEach(w => {
      t = t.replace(new RegExp(`(?<!\\p{L})(?:${w})(?!\\p{L})`, 'giu'), ' ');
    });
    t = t.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();

    // quebra em frases (pontuação ou conectivos comuns do ditado)
    const frases = t.split(/(?<=[.!?])\s+|\s+(?=aí depois\b)|\s+(?=depois disso\b)/i)
      .flatMap(f => f.split(/[.!?]+/)).map(f => f.trim()).filter(f => f.length > 2);

    const acaoRx = /^(vou|vamos|preciso|precisamos|tenho que|temos que|agendar|enviar|mandar|retornar|ligar|levar|cotar|orçar|combinamos|combinei|ficou de|ele vai|ela vai|eles vão)\b|(\bficou de\b|\bpróxima semana\b|\bsemana que vem\b|\baté (o dia|dia|sexta|segunda|terça|quarta|quinta)\b)/i;
    const acoes = [], pontos = [];
    frases.forEach(f => {
      const frase = f[0].toUpperCase() + f.slice(1);
      (acaoRx.test(f) ? acoes : pontos).push(frase);
    });

    let out = `📋 RELATÓRIO — ${fmtData(document.getElementById('i_data')?.value || hoje())}\n`;
    out += pontos.map(p => `• ${p}` + (/[.!?]$/.test(p) ? '' : '.')).join('\n');
    if (acoes.length) {
      out += `\n\n➡️ PRÓXIMAS AÇÕES:\n` + acoes.map(a => `• ${a}` + (/[.!?]$/.test(a) ? '' : '.')).join('\n');
      const proxCampo = document.getElementById('i_prox');
      if (proxCampo && !proxCampo.value) {
        let a = acoes[0];
        if (a.length > 80) a = a.slice(0, 80).slice(0, a.slice(0, 80).lastIndexOf(' ')) + '…';
        proxCampo.value = a;
      }
    }
    ta.value = out;
    this.toast('✨ Relatório organizado! Revise antes de salvar.');
  },

  verInteracao(id) {
    const i = Store.db.interacoes.find(x => x.id === id);
    if (!i) return;
    this.modal(`
      <h3>📚 ${esc(i.tipo)} — ${fmtData(i.data)}</h3>
      <p class="muted">🏭 ${esc(Store.cliente(i.clienteId)?.empresa || '—')} · Resp.: <b>${esc(Store.usuario(i.responsavelId)?.nome || '—')}</b>${i.oppId ? ` · Oportunidade: ${esc(Store.opp(i.oppId)?.titulo || '')}` : ''}</p>
      <div class="panel" style="margin-top:12px"><h3>Descrição</h3><p>${esc(i.descricao)}</p></div>
      ${i.relatorio ? `<div class="panel"><h3>📝 Relatório de visita</h3><p style="white-space:pre-wrap">${esc(i.relatorio)}</p></div>` : ''}
      ${i.proximaAcao ? `<p><b>→ Próxima ação:</b> ${esc(i.proximaAcao)}</p>` : ''}
      <div class="modal-actions"><button class="btn btn-ghost" onclick="App.fecharModal()">Fechar</button></div>`);
  },

  // ================= MODAL BASE =================
  modal(html) {
    document.getElementById('modalRoot').innerHTML =
      `<div class="modal-bg" onclick="if(event.target===this)App.fecharModal()"><div class="modal">${html}</div></div>`;
  },
  fecharModal() { document.getElementById('modalRoot').innerHTML = ''; }
};

document.addEventListener('DOMContentLoaded', () => App.init());
