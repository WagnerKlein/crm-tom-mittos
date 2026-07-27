/* ============================================================
   CRM Tom Mittos 6.1 — Camada de dados (localStorage)
   Grupo JMP — Pneumática · Hidráulica · Eletrônica
   ============================================================ */

const DB_KEY = 'crm_tom_mittos_61';

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
  clientes: [],       // {id, empresa, cidade, regiao, segmento, obs, contatos:[{nome,setor,telefone,email}], criadoEm}
  oportunidades: [],  // {id, titulo, clienteId, fabricante, responsavelId, etapa, prioridade, valor, dataCadastro, ultimoContato, proximoContato, obs, resultado, motivoPerda}
  interacoes: [],     // {id, oppId, clienteId, data, tipo, descricao, responsavelId, proximaAcao}
  cotacoes: [],       // {id, numero, oppId, clienteId, fabricante, responsavelId, valor, dataEnvio, validade, status}
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
  },
  seq: { cliente: 0, opp: 0, int: 0, cot: 0 }
};

const Store = {
  db: null,

  load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        this.db = JSON.parse(raw);
        // migração leve: garante chaves novas do seed
        for (const k of Object.keys(SEED.config)) {
          if (this.db.config[k] === undefined) this.db.config[k] = SEED.config[k];
        }
      } else {
        this.db = JSON.parse(JSON.stringify(SEED));
        this.save();
      }
    } catch (e) {
      console.error('Erro ao carregar dados', e);
      this.db = JSON.parse(JSON.stringify(SEED));
    }
    return this.db;
  },

  save() {
    localStorage.setItem(DB_KEY, JSON.stringify(this.db));
  },

  nextId(tipo) {
    this.db.seq[tipo] = (this.db.seq[tipo] || 0) + 1;
    return this.db.seq[tipo];
  },

  nextNumeroCotacao() {
    const ano = new Date().getFullYear();
    const n = this.nextId('cot');
    return `COT-${ano}-${String(n).padStart(4, '0')}`;
  },

  // ---------- helpers de consulta ----------
  usuario(id) { return this.db.usuarios.find(u => u.id === id); },
  cliente(id) { return this.db.clientes.find(c => c.id === id); },
  opp(id)     { return this.db.oportunidades.find(o => o.id === id); },

  oppsVisiveis(user) {
    // gerente e diretores veem tudo; vendedores veem tudo (transparência), filtros fazem o recorte
    return this.db.oportunidades;
  },

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
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data.usuarios || !data.config) throw new Error('Arquivo inválido');
        this.db = data;
        this.save();
        cb(true);
      } catch (e) { cb(false, e.message); }
    };
    r.readAsText(file);
  },

  exportCSV(rows, nome) {
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '﻿' + [cols.join(';'), ...rows.map(r => cols.map(c => esc(r[c])).join(';'))].join('\r\n');
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
