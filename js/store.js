/* ============================================================
   CRM Tom Mittos 6.1 — Camada de dados (Firebase / Firestore)
   Tempo real + offline + login por e-mail/senha
   Grupo JMP — Pneumática · Hidráulica · Eletrônica
   ============================================================ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD-D_4PWT9KLFrxz1K_RsyjNxaSW6sZsfw",
  authDomain: "crm-tom-mittos.firebaseapp.com",
  projectId: "crm-tom-mittos",
  storageBucket: "crm-tom-mittos.firebasestorage.app",
  messagingSenderId: "790452905552",
  appId: "1:790452905552:web:55e990f1c5c3b43ad39355"
};

const DOMINIO_LOGIN = 'crmtommittos.app';

const SEED = {
  version: '6.1.0',
  usuarios: [
    { id: 'tom',      nome: 'Tom',      papel: 'gerente',  cargo: 'Gerente de Vendas Externas' },
    { id: 'phelipe',  nome: 'Phelipe',  papel: 'externo',  cargo: 'Vendedor Externo' },
    { id: 'maicon',   nome: 'Maicon',   papel: 'externo',  cargo: 'Vendedor Externo' },
    { id: 'guilherme',nome: 'Guilherme',papel: 'externo',  cargo: 'Vendedor Externo' },
    { id: 'leticia',  nome: 'Letícia',  papel: 'interno',  cargo: 'Vendedora Interna' },
    { id: 'jeziel',   nome: 'Jeziel',   papel: 'interno',  cargo: 'Vendedor Interno' },
    { id: 'aline',    nome: 'Aline',    papel: 'interno',  cargo: 'Vendedora Interna' },
    { id: 'lia',      nome: 'Lia',      papel: 'interno',  cargo: 'Vendedora Interna' },
    { id: 'wagner',   nome: 'Wagner',   papel: 'diretor',  cargo: 'Diretor' },
    { id: 'eden',     nome: 'Eden',     papel: 'diretor',  cargo: 'Diretor de Vendas' },
    { id: 'julio',    nome: 'Júlio',    papel: 'diretor',  cargo: 'Diretor' },
    { id: 'bruno',    nome: 'Bruno',    papel: 'diretor',  cargo: 'Diretor' }
  ],
  config: {
    etapas: ['Validado', 'Em contato', 'Diagnóstico', 'Visita Virtual', 'Visita Presencial', 'Proposta', 'Fechado'],
    statusCotacao: ['Aberto', 'Pendente', 'Pedido', 'Perdido'],
    fabricantes: [
      'Parker - Pneumática', 'Parker - Hidráulica', 'Parker - Filtragem', 'Balluff - Sensores',
      'Hiwin - Movimento Linear', 'Chesterton - Vedação/Lubrificação', 'Flomax - Abastecimento',
      'Ross - Válvulas de Segurança', 'Legris - Conexões', 'DH-Process', 'Wika - Instrumentação',
      'Painéis e Automação (Fabricação Própria)', 'Serviços de Engenharia', 'Outros'
    ],
    segmentos: ['Mineração', 'Siderurgia', 'Metalurgia', 'Construção Civil', 'Agronegócio',
      'Logística/Transporte', 'Indústria Alimentícia', 'Automotivo', 'Papel e Celulose', 'Energia', 'Outros'],
    setores: ['Compras', 'Engenharia', 'PCM', 'Instrumentação', 'Manutenção', 'Operação', 'Suprimentos', 'Diretoria'],
    regioes: ['Parauapebas - PA', 'Belém - PA', 'São Luís - MA', 'Contagem - MG (Sede)', 'Serra - ES', 'Outras'],
    tiposInteracao: ['Ligação', 'E-mail', 'WhatsApp', 'Reunião', 'Visita Presencial', 'Visita Virtual', 'Visita Técnica'],
    prioridades: ['Alta', 'Média', 'Baixa'],
    metaMensal: 1500000,
    diasFollowUp: 10,
    diasParado: 15
  }
};

const COLECOES = ['clientes', 'oportunidades', 'interacoes', 'cotacoes'];

const Store = {
  db: null,
  fs: null,          // firestore
  auth: null,
  _unsubs: [],
  pronto: false,     // primeiro carregamento concluído

  init() {
    firebase.initializeApp(FIREBASE_CONFIG);
    this.auth = firebase.auth();
    this.fs = firebase.firestore();
    // cache offline: registra na mina sem sinal, sincroniza depois
    this.fs.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    this.db = {
      version: SEED.version,
      usuarios: SEED.usuarios,
      clientes: [], oportunidades: [], interacoes: [], cotacoes: [],
      config: JSON.parse(JSON.stringify(SEED.config))
    };
  },

  emailDe(usuarioId) { return `${usuarioId}@${DOMINIO_LOGIN}`; },

  usuarioPorEmail(email) {
    const id = (email || '').split('@')[0];
    return this.usuario(id);
  },

  async entrar(usuarioId, senha) {
    await this.auth.signInWithEmailAndPassword(this.emailDe(usuarioId), senha);
  },

  async sair() {
    this.pararEscuta();
    await this.auth.signOut();
  },

  // ---------- escuta em tempo real ----------
  escutar(onChange) {
    this.pararEscuta();
    let carregadas = 0;
    COLECOES.forEach(col => {
      const un = this.fs.collection(col).onSnapshot(snap => {
        this.db[col] = snap.docs.map(d => d.data());
        if (carregadas < COLECOES.length) carregadas++;
        if (carregadas >= COLECOES.length) this.pronto = true;
        onChange(col);
      }, err => console.error('snapshot ' + col, err));
      this._unsubs.push(un);
    });
    const unCfg = this.fs.doc('config/main').onSnapshot(snap => {
      if (snap.exists) {
        const cfg = snap.data();
        for (const k of Object.keys(SEED.config)) {
          if (cfg[k] !== undefined) this.db.config[k] = cfg[k];
        }
      } else {
        // primeiro acesso do projeto: semeia a configuração padrão
        this.fs.doc('config/main').set(SEED.config).catch(() => {});
      }
      onChange('config');
    }, err => console.error('snapshot config', err));
    this._unsubs.push(unCfg);
  },

  pararEscuta() {
    this._unsubs.forEach(u => { try { u(); } catch (e) {} });
    this._unsubs = [];
    this.pronto = false;
  },

  // ---------- gravação ----------
  novoId() { return Date.now() * 1000 + Math.floor(Math.random() * 1000); },

  upsert(col, obj) {
    // espelho local imediato (o snapshot confirma em seguida)
    const arr = this.db[col];
    const i = arr.findIndex(x => x.id === obj.id);
    if (i >= 0) arr[i] = obj; else arr.push(obj);
    return this.fs.collection(col).doc(String(obj.id)).set(JSON.parse(JSON.stringify(obj)))
      .catch(e => { console.error('upsert', col, e); App.toast('⚠️ Erro ao salvar na nuvem — verifique a internet'); });
  },

  remove(col, id) {
    this.db[col] = this.db[col].filter(x => x.id !== id);
    return this.fs.collection(col).doc(String(id)).delete()
      .catch(e => console.error('remove', col, e));
  },

  removeOppCascade(oppId) {
    const batch = this.fs.batch();
    batch.delete(this.fs.collection('oportunidades').doc(String(oppId)));
    this.db.interacoes.filter(i => i.oppId === oppId).forEach(i =>
      batch.delete(this.fs.collection('interacoes').doc(String(i.id))));
    this.db.cotacoes.filter(c => c.oppId === oppId).forEach(c =>
      batch.delete(this.fs.collection('cotacoes').doc(String(c.id))));
    this.db.oportunidades = this.db.oportunidades.filter(o => o.id !== oppId);
    this.db.interacoes = this.db.interacoes.filter(i => i.oppId !== oppId);
    this.db.cotacoes = this.db.cotacoes.filter(c => c.oppId !== oppId);
    return batch.commit().catch(e => console.error('cascade', e));
  },

  saveConfig() {
    return this.fs.doc('config/main').set(JSON.parse(JSON.stringify(this.db.config)))
      .catch(e => console.error('config', e));
  },

  async proximoNumeroCotacao() {
    const ano = new Date().getFullYear();
    const ref = this.fs.doc('config/contadores');
    const n = await this.fs.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const atual = (snap.exists && snap.data()['cot' + ano]) || 0;
      tx.set(ref, { ['cot' + ano]: atual + 1 }, { merge: true });
      return atual + 1;
    });
    return `COT-${ano}-${String(n).padStart(4, '0')}`;
  },

  // ---------- helpers de consulta ----------
  usuario(id) { return this.db.usuarios.find(u => u.id === id); },
  cliente(id) { return this.db.clientes.find(c => c.id === id); },
  opp(id)     { return this.db.oportunidades.find(o => o.id === id); },

  // ---------- carteiras e visibilidade por perfil ----------
  podeVerTudo(u) { return u.papel === 'gerente' || u.papel === 'diretor'; },

  clienteVisivel(c, u) {
    if (this.podeVerTudo(u)) return true;
    if (u.papel === 'externo') return !c.extId || c.extId === u.id;
    if (u.papel === 'interno') return !c.intId || c.intId === u.id;
    return true;
  },

  naMinhaCarteira(c, u) {
    if (!c) return false;
    if (u.papel === 'externo') return c.extId === u.id;
    if (u.papel === 'interno') return c.intId === u.id;
    return false;
  },

  oppVisivel(o, u) {
    if (this.podeVerTudo(u)) return true;
    if (o.responsavelId === u.id) return true;
    return this.naMinhaCarteira(this.cliente(o.clienteId), u);
  },

  intVisivel(i, u) {
    if (this.podeVerTudo(u)) return true;
    if (i.responsavelId === u.id) return true;
    return this.naMinhaCarteira(this.cliente(i.clienteId), u);
  },

  cotVisivel(c, u) {
    if (this.podeVerTudo(u)) return true;
    if (c.responsavelId === u.id) return true;
    return this.naMinhaCarteira(this.cliente(c.clienteId), u);
  },

  clientesVisiveis(u) { return this.db.clientes.filter(c => this.clienteVisivel(c, u)); },
  oppsVisiveis(u)     { return this.db.oportunidades.filter(o => this.oppVisivel(o, u)); },

  // ---------- export / import ----------
  exportJSON() {
    const blob = new Blob([JSON.stringify(this.db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `CRM_TomMittos_backup_${hoje()}.json`;
    a.click();
  },

  importJSON(file, cb) {
    const r = new FileReader();
    r.onload = async () => {
      try {
        const data = JSON.parse(r.result);
        if (!data.config || (!data.clientes && !data.oportunidades)) throw new Error('Arquivo inválido');
        let batch = this.fs.batch(), n = 0;
        const commitSePreciso = async () => { if (n >= 400) { await batch.commit(); batch = this.fs.batch(); n = 0; } };
        for (const col of COLECOES) {
          for (const item of (data[col] || [])) {
            batch.set(this.fs.collection(col).doc(String(item.id)), item); n++;
            await commitSePreciso();
          }
        }
        batch.set(this.fs.doc('config/main'), data.config); n++;
        await batch.commit();
        cb(true);
      } catch (e) { cb(false, e.message); }
    };
    r.readAsText(file);
  },

  exportCSV(rows, nome) {
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const escCsv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '﻿' + [cols.join(';'), ...rows.map(r => cols.map(c => escCsv(r[c])).join(';'))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${nome}_${hoje()}.csv`;
    a.click();
  }
};

// ---------- utilidades de data/formato ----------
function hoje() { return new Date().toISOString().slice(0, 10); }

function addDias(dataISO, dias) {
  const d = new Date(dataISO + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diasEntre(a, b) { // b - a em dias
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}

function fmtData(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtMoeda(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function fmtPct(v) { return `${Math.round((v || 0) * 100)}%`; }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
