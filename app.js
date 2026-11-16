/*
 * GESTÃO DA GRÁFICA — aplicação principal v3
 * Organização: estado e persistência; PDV/vendas; orçamentos e documentos;
 * pedidos/produção; cadastros e catálogo; kits; relatórios e configurações.
 * A chave localStorage foi mantida para preservar os dados das versões anteriores.
 */
const $ = s => document.querySelector(s), K = 'gestao_grafica_v1';
const ET = ['Confirmação de arte', 'Fila de produção', 'Em produção', 'Em acabamento', 'Finalizado', 'Pronto para retirada', 'Em rota de entrega', 'Entregue/Retirado'];
const ST = { aberto: 'Aberto', aprovado: 'Aprovado', executado: 'Executado', pago: 'Pago', recusado: 'Recusado', arquivado: 'Arquivado' };
const FP = ['Pix', 'Cartão de débito', 'Cartão de crédito', 'Dinheiro (na loja)', 'Outra forma'];
const MSG0 = ET.map(e => `Olá, {nome}! Seu pedido nº {n} está na etapa: ${e}. Previsão de entrega: {prev}.`);
MSG0[4] = 'Olá, {nome}! Seu pedido nº {n} foi finalizado. Você vai retirar na loja ou prefere entrega?';
let productTab = 'prod', prodCat = '', prodSub = '', prodSearch = '', clientSearch = '', supplierSearch = '', supplierType = 'todos', prodFilter = '', prodColumnValue = '', supplierFilterColumn = '', supplierFilterValue = '', productLotsDraft = [];
let db, tab = 'ven', flt = 'todos', edit = null, its = [], pgq = false, pgv = false, vsd = null, vdm = 'r', hc = null, ec = null, ei = null, ek = null, est = 'mes', po = null, pf = 'and', di = {}, dl = [], dk = [];
function fresh() { return { emp: {}, msg: MSG0, cli: [], it: [], kits: [], par: [], tx: [], orc: [], id: 1, seq: 1, cfg: { dig: 4, markup: 30 } }; }
function norm(data) {
    data = Object.assign(fresh(), data);
    data.cfg = Object.assign({ dig: 4, markup: 30 }, data.cfg || {});
    data.cli = data.cli || [];
    data.it = data.it || [];
    data.par = data.par || [];
    data.it.forEach(product => {
        product.estoque = Number(product.estoque) || 0;
        // Migração segura: produtos antigos sem um estado explícito de estoque
        // não passam a controlar saldo automaticamente.
        if (product.stockModeVersion !== 1) {
            if (typeof product.semEstoque !== 'boolean')
                product.semEstoque = !(product.estoque > 0);
            else if (product.estoque === 0 && product.semEstoque === false)
                product.semEstoque = true;
            product.stockModeVersion = 1;
        }
        product.semEstoque = !!product.semEstoque;
        product.marca = product.marca || '';
        product.categoria = product.categoria || '';
        product.subcategoria = product.subcategoria || '';
        product.un = product.un || 'un';
        product.tipoVenda = product.tipoVenda || product.tipo || 'un';
    });
    data.par.forEach(partner => partner.tipoEmpresa = partner.tipoEmpresa || 'Parceira');
    data.orc.forEach(order => {
        order.it = order.it || [];
        order.it.forEach((row, index) => {
            row.rid = row.rid || `r${order.id}_${index}`;
            row.cu = row.cu || 0;
            row.cpu = row.cpu || 0;
        });
        order.pays = order.pays || [];
        order.hp = order.hp || [];
        if (order.dp) {
            order.aj = rnd((+order.aj || 0) - sub(order) * order.dp / 100);
            delete order.dp;
        }
        if (!order.ln) {
            order.ln = [];
            sync(order);
            if (order.tl && order.ln[0])
                order.ln[0].tl = order.tl;
            delete order.tl;
        }
    });
    return data;
}
function load() {
    try {
        return norm(JSON.parse(localStorage.getItem(K)) || {});
    }
    catch (e) {
        return fresh();
    }
}
function save() {
    try {
        localStorage.setItem(K, JSON.stringify(db));
    }
    catch (e) {
        alert('Não foi possível salvar. O armazenamento do navegador pode estar cheio.');
    }
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), fm = n => (+n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const dt = d => d ? d.split('-').reverse().join('/') : '', hoje = () => new Date().toLocaleDateString('sv'), agora = () => new Date().toLocaleString('pt-BR');
const cli = id => db.cli.find(c => c.id == id), get = id => db.orc.find(o => o.id == id), par = id => db.par.find(p => p.id == id), txx = id => db.tx.find(x => x.id == id) || { valor: 0, custo: 0 };
const phone = p => { let d = (p || '').replace(/\D/g, ''); return d.length <= 11 ? '55' + d : d; };
const addD = (d, n) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv'); };
const addDU = (d, n) => {
    const x = new Date(d + 'T12:00');
    while (n > 0) {
        x.setDate(x.getDate() + 1);
        if (x.getDay() % 6)
            n--;
    }
    return x.toLocaleDateString('sv');
};
const rnd = v => Math.round(v * 100) / 100, dv = o => o.dv != null ? o.dv : 5, gdv = () => $('#q-dv').value == 'x' ? (+$('#q-dv2').value || 0) : +$('#q-dv').value;
const later = f => setTimeout(f, 0);
const sub = o => o.it.reduce((a, r) => a + r.t, 0), entV = o => o.gr ? 0 : txx(o.tx).valor, extra = o => (o.ln || []).reduce((a, l) => a + (l.ex ? txx(l.ex).valor : 0), 0);
const dsc = o => (o.pays || []).reduce((a, p) => a + (p.ds || 0), 0), tot = o => sub(o) + (+o.aj || 0) + entV(o) + extra(o) - dsc(o), paid = o => (o.pays || []).reduce((a, p) => a + p.v, 0);
const cost = o => o.it.reduce((a, r) => a + (r.cu || 0), 0) + (o.tx ? txx(o.tx).custo || 0 : 0) + (o.ln || []).reduce((a, l) => a + (l.ex ? txx(l.ex).custo || 0 : 0), 0), lucro = o => tot(o) - cost(o);
const prevD = o => o.conf ? dt(addDU(o.conf, o.prev || 0)) : (o.prev || 0) + ' dias úteis';
const unl = o => tot(o) > 0 && paid(o) >= tot(o) / 2 - .005, done = o => o.ln.length > 0 && o.ln.every(l => l.tl.length >= 7);
const labs = l => [...ET.slice(0, 5), l.modo == 'entrega' ? 'Em rota de entrega' : 'Pronto para retirada', 'Entregue/Retirado'];
function conf(o) {
    if (!o.conf) {
        o.conf = hoje();
        o.po = o.prev;
    }
}
function stat(o) {
    if (o.est)
        return;
    if (o.venda) {
        o.st = o.pays.length && paid(o) >= tot(o) - .005 ? 'pago' : (o.pays.length ? 'aprovado' : 'aberto');
        return;
    }
    if (['recusado', 'arquivado'].includes(o.st) || (o.st == 'aberto' && !o.pays.length))
        return;
    o.st = paid(o) >= tot(o) - .005 && o.pays.length ? 'pago' : (done(o) ? 'executado' : 'aprovado');
}
function sync(o) {
    o.ln = o.ln || [];
    const ks = [];
    o.it.forEach(r => (r.kc || [{ iid: r.iid, nome: r.d, dd: r.dd }]).forEach(c => {
        const k = r.rid + ':' + (c.iid || 0);
        ks.push(k);
        let l = o.ln.find(x => x.k == k);
        if (!l) {
            l = { k, d: '', iid: c.iid, dd: 0, prio: 0, tl: [], oc: [], log: [], modo: '', ex: null, arte: null };
            o.ln.push(l);
        }
        l.iid = c.iid;
        l.d = r.kc ? c.nome + ' (kit ' + r.d.replace(/^Kit /, '') + ')' : r.d;
        l.dd = r.kc ? c.dd : r.dd;
    }));
    o.ln = o.ln.filter(l => ks.includes(l.k) || l.tl.length);
}
db = load();
const idb = () => new Promise((s, j) => { const r = indexedDB.open('gg_files', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => s(r.result); r.onerror = j; });
async function fput(k, v) { const d = await idb(); return new Promise(s => { const t = d.transaction('f', 'readwrite'); t.objectStore('f').put(v, k); t.oncomplete = s; }); }
async function fget(k) { const d = await idb(); return new Promise(s => { const r = d.transaction('f').objectStore('f').get(k); r.onsuccess = () => s(r.result); }); }
async function fall() {
    const d = await idb(), o = {};
    return new Promise(s => {
        const r = d.transaction('f').objectStore('f').openCursor();
        r.onsuccess = () => {
            const c = r.result;
            if (c) {
                o[c.key] = c.value;
                c.continue();
            }
            else
                s(o);
        };
    });
}
async function fclr() { const d = await idb(); return new Promise(s => { const t = d.transaction('f', 'readwrite'); t.objectStore('f').clear(); t.oncomplete = s; }); }
function render() {
    $('#tabs').innerHTML = [['ven', '🛒', 'Venda'], ['ped', '📋', 'Pedidos'], ['cli', '👥', 'Clientes'], ['it', '📦', 'Produtos'], ['est', '📊', 'Estatísticas'], ['cfg', '⚙️', 'Configurações']].map(([k, i, l]) => `<button class="${tab == k ? 'on' : ''}" onclick="goTab('${k}')" title="${l}" aria-label="${l}"><span class="ic">${i}</span><span class="lb">${l}</span></button>`).join('');
    $('#main').innerHTML = pgv ? vPDV() : { ven: vVen, orc: vOrc, ped: vPed, cli: vCli, it: vIt, kit: vKit, est: vEst, cfg: vCfg }[tab]();
    if (pgv)
        vpInit();
}
function setNav(sm) {
    $('#tabs').classList.toggle('sm', sm);
    try {
        localStorage.setItem('gg_nav', sm ? '1' : '0');
    }
    catch (e) { }
}
function toggleNav() { setNav(!$('#tabs').classList.contains('sm')); }
function goTab(k) {
    if (pgv) {
        if (vsd && !vsd.ro && its.length && !confirm('Fechar a venda? Os produtos lançados serão descartados.'))
            return;
        pgv = false;
        vsd = null;
        its = [];
    }
    if (pgq) {
        pgq = false;
        $('#dq').hidden = true;
        $('#main').hidden = false;
    }
    tab = k;
    po = null;
    if (innerWidth <= 720)
        setNav(true);
    render();
}
/* VENDA (PDV) */
let vf = 'hoje';
function estornarBase(id) {
    if (confirm('Estornar esta venda ou pedido? O registro fica guardado, mas ela sai das estatísticas.')) {
        const o = get(id);
        o.est = 1;
        o.st = 'arquivado';
        save();
        render();
    }
}
/* CÓDIGO DO PRODUTO */
const dig = () => Math.max(0, Math.min(12, parseInt((db.cfg || {}).dig) || 0));
function nextCod() {
    const u = new Set(db.it.filter(x => /^\d+$/.test(x.cod || '')).map(x => parseInt(x.cod, 10)));
    let n = 1;
    while (u.has(n))
        n++;
    return String(n).padStart(dig(), '0');
}
function codDup(c, id) { c = (c || '').trim().toLowerCase(); return c ? db.it.find(x => x.id != id && (x.cod || '').toLowerCase() == c) : null; }
function icaSel() {
    const a = $('#i-ca').checked, c = $('#i-cod');
    c.readOnly = a;
    if (a)
        c.value = nextCod();
}
/* ORÇAMENTO COMO PÁGINA */
function qOpen() { pgq = true; $('#main').hidden = true; $('#dq').hidden = false; window.scrollTo(0, 0); }
function qClose() { pgq = false; $('#dq').hidden = true; $('#main').hidden = false; render(); }
/* VENDA COMO PÁGINA (PDV) */
const nz = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const FPV = [['Dinheiro', 'Dinheiro (na loja)', 0], ['Crédito', 'Cartão de crédito', 1], ['Débito', 'Cartão de débito', 0], ['Pix', 'Pix', 0], ['Outra forma', 'Outra forma', 1]];
const vcliOpts = sel => '<option value="">Consumidor</option>' + db.cli.map(c => `<option value="${c.id}" ${sel == c.id ? 'selected' : ''}>${esc(fullName(c))}</option>`).join('');
const pinfo = x => x.isk ? fmt(x.promoOn && x.promo ? x.promo : x.preco) + ' (kit)' : x.tipo == 'm2' ? fmt(x.mp) + '/m²' : x.tipo == 'lote' ? (x.lotes || []).length + ' lote(s)' : fmt(x.preco) + '/' + esc(x.un || 'un');
function openV(id) {
    const o = id ? get(id) : null;
    vsd = { id: o ? o.id : null, cid: o ? o.cid : null, tx: o ? o.tx : null, obs: o ? o.obs || '' : '', aj: o ? +o.aj || 0 : 0, gr: o ? o.gr : 0, data: o ? o.data : hoje(), ro: !!(o && o.pays.length) };
    its = o ? o.it.map(x => JSON.parse(JSON.stringify(x))) : [];
    vdm = 'r';
    pgv = true;
    window.scrollTo(0, 0);
    render();
}
function vpClose() {
    if (vsd && !vsd.ro && its.length && !confirm('Fechar a venda? Os produtos lançados serão descartados.'))
        return;
    pgv = false;
    vsd = null;
    its = [];
    render();
}
function vPDV() {
    const ro = vsd.ro, o = vsd.id ? get(vsd.id) : null, dis = ro ? 'disabled' : '';
    return `<div class="form" style="margin-top:0"><div class="pagehd"><h3>Venda${o ? ' nº ' + o.n : ''}</h3><button type="button" onclick="vpClose()" title="Fechar" aria-label="Fechar">✕</button></div>
  <div class="acts" style="align-items:flex-end;gap:8px"><label style="flex:1 1 180px;margin:0">Cliente<select id="vp-c" style="width:100%" ${dis}>${vcliOpts(vsd.cid)}</select></label>${ro ? '' : '<button type="button" onclick="ncOpen(\'v\')" style="flex:0 0 auto;margin:0 0 2px">+ Novo Cliente</button>'}<label style="flex:0 0 150px;margin:0">Entrega<select id="vp-x" style="width:100%" onchange="vpT()" ${dis}><option value="">Sem entrega</option>${db.tx.map(x => `<option value="${x.id}" ${vsd.tx == x.id ? 'selected' : ''}>${esc(x.nome)} - ${fmt(x.valor)}</option>`).join('')}</select></label></div>
  ${ro ? '' : `<div class="acts" style="margin-top:8px;flex-wrap:nowrap"><input id="vp-s" placeholder="Buscar produto (nome ou código)" autocomplete="off" oninput="vpS()" onkeydown="vpK(event)" style="flex:1;min-width:0"><label style="margin:0;display:flex;align-items:center;gap:6px">Quant.<input id="vp-q" type="number" step="any" min="0" value="1" style="width:90px"></label><button type="button" class="pri" onclick="vpNP()" title="Novo produto" aria-label="Novo produto" style="flex:0 0 auto">+</button></div><div id="vp-r" class="list" hidden></div>`}
  <div id="vp-l" style="margin-top:10px"></div>
  <label style="margin-top:8px">Observação<textarea id="vp-o" rows="2" ${dis}>${esc(vsd.obs)}</textarea></label>
  <div class="acts" style="margin-top:8px"><button type="button" id="vp-db" onclick="vpDesc()" ${dis}>Desconto</button></div>
  <div class="mut" id="vp-sm"></div>
  ${ro ? `<div class="form"><b>Venda concluída</b>${o.pays.map(p => `<div class="mut">${dt(p.d)} · ${fmt(p.v)} · ${esc(p.f)}${p.pc > 1 ? ' em ' + p.pc + 'x' : ''}</div>`).join('')}</div>` : ''}
  <div class="row" style="margin-top:8px"><b style="font-size:20px">Total: <span id="vp-t"></span></b>${ro ? `<button class="pri" onclick="recibo(get(${o.id}),${o.pays.length - 1})">Recibo</button>` : '<button class="pri" onclick="vpGo()" style="padding:12px 22px;font-size:16px">CONCLUIR VENDA</button>'}</div></div>`;
}
function vpInit() {
    vsd.dr = vsd.aj ? rnd(-vsd.aj) : 0;
    vsd.dp = '';
    vdm = 'r';
    vpR();
    if (!vsd.ro)
        $('#vp-s').focus();
}
function vpFind(q) {
    q = nz(q.trim());
    if (!q)
        return [];
    const a = db.it.filter(x => nz(x.nome).includes(q) || nz(x.cod).includes(q)), k = db.kits.filter(x => nz('kit ' + x.nome).includes(q)).map(x => ({ isk: 1, ...x }));
    return [...a, ...k].slice(0, 8);
}
function vpK(e) {
    if (e.key == 'Escape') {
        e.target.value = '';
        vpS();
        return;
    }
    if (e.key != 'Enter')
        return;
    e.preventDefault();
    const q = e.target.value.trim();
    if (!q)
        return;
    const ex = db.it.find(x => x.cod && x.cod.toLowerCase() == q.toLowerCase());
    if (ex)
        return vpAdd('i', ex.id);
    const l = vpFind(q);
    if (l.length == 1)
        vpAdd(l[0].isk ? 'k' : 'i', l[0].id);
}
function vpAdd(t, id) {
    const q = +$('#vp-q').value || 1;
    let novo = true;
    if (t == 'i') {
        const it = db.it.find(x => x.id == id);
        if (!it)
            return;
        if ((it.tipo || 'un') == 'un') {
            const ix = its.findIndex(r => r.iid == id && !r.kid);
            if (ix >= 0) {
                vrc(ix, 'q', (+its[ix].q || 0) + q);
                novo = false;
            }
        }
        if (novo) {
            const r = newRow();
            r.iid = id;
            r.q = q;
            calc(its.push(r) - 1);
        }
    }
    else {
        const k = db.kits.find(x => x.id == id);
        if (!k)
            return;
        const r = newRow();
        r.kid = id;
        r.q = q;
        calc(its.push(r) - 1);
    }
    $('#vp-s').value = '';
    $('#vp-q').value = 1;
    $('#vp-r').hidden = true;
    vpR();
    $('#vp-s').focus();
}
function vpR() { const ro = vsd.ro; $('#vp-l').innerHTML = its.length ? `<div style="overflow-x:auto"><table class="tb"><tr><th>COD</th><th>Produto</th><th>Quant.</th><th>Valor Unit.</th><th class="n">Valor Total</th><th></th></tr>${its.map((r, i) => vpRow(r, i, ro)).join('')}</table></div>` : '<div class="item mut">Nenhum produto na venda. Busque pelo nome ou código.</div>'; vpT(); }
function vpRow(r, i, ro) {
    const it = db.it.find(x => x.id == r.iid), cod = it && it.cod ? it.cod : (r.kid ? 'KIT' : ''), dis = ro ? 'disabled' : '';
    let h = `<tr><td>${esc(cod)}</td><td id="vd${i}">${esc(r.d)}${it && !it.semEstoque && it.estoque < 0 ? ' <b style="color:#a3281f">(estoque negativo)</b>' : ''}</td><td><input type="number" step="any" min="0" id="vq${i}" value="${r.q}" ${dis} oninput="vrc(${i},'q',this.value)" style="width:80px"></td><td><input type="number" step="any" min="0" id="vu${i}" value="${+(+r.p).toFixed(4)}" ${dis} oninput="vrc(${i},'p',this.value)" style="width:100px"></td><td class="n"><b id="vt${i}">${fmt(r.t)}</b></td><td>${ro ? '' : `<button class="del" onclick="its.splice(${i},1);vpR()" title="Remover" aria-label="Remover">✕</button>`}</td></tr>`;
    if (it && it.tipo == 'm2')
        h += `<tr><td></td><td colspan="5"><div class="ex"><label>Largura (m)<input type="number" step="any" value="${r.w || ''}" ${dis} oninput="its[${i}].w=this.value;calc(${i});vrefr(${i})"></label><label>Altura (m)<input type="number" step="any" value="${r.h || ''}" ${dis} oninput="its[${i}].h=this.value;calc(${i});vrefr(${i})"></label><label>Área cobrada<br><b id="vra${i}">${fm(r.ar)} m²</b></label>${it.mm ? `<span class="mut">mínimo cobrado: ${fm(it.mm)} m²</span>` : ''}</div></td></tr>`;
    if (it && it.tipo == 'lote')
        h += `<tr><td></td><td colspan="5"><div class="ex"><label>Lote (quantidade)<select ${dis} onchange="its[${i}].lq=+this.value;calc(${i});vpR()">${it.lotes.map((l, j) => `<option value="${j}" ${(r.lq || 0) == j ? 'selected' : ''}>${fm(l.q)} unid. - ${fmt(l.t)}</option>`).join('')}</select></label></div></td></tr>`;
    return h;
}
function vrc(i, k, v) {
    const r = its[i], it = db.it.find(x => x.id == r.iid);
    v = +v;
    r[k] = v;
    if (it && it.tipo == 'm2' && k == 'q')
        calc(i);
    else {
        if (k == 'q' && r.p)
            r.t = rnd(v * r.p);
        if (k == 'p')
            r.t = rnd(r.q * v);
        r.cu = rnd(r.q * (r.cpu || 0));
    }
    vrefr(i);
}
function vrefr(i) {
    const r = its[i], g = x => $('#' + x + i), u = g('vu'), q = g('vq'), t = g('vt'), d = g('vd'), a = g('vra');
    if (u && document.activeElement !== u)
        u.value = +(+r.p).toFixed(4);
    if (q && document.activeElement !== q)
        q.value = r.q;
    if (t)
        t.textContent = fmt(r.t);
    if (d)
        d.textContent = r.d;
    if (a)
        a.textContent = fm(r.ar) + ' m²';
    vpT();
}
function vpDesc() {
    if (vsd.ro)
        return;
    $('#dd').innerHTML = `<h3 style="margin:0 0 8px">Desconto</h3><div class="g2"><label>Valor (R$)<input id="dd-r" type="number" step="any" min="0" value="${vsd.dr || ''}" oninput="ddI('r')"></label><label>Porcentagem (%)<input id="dd-p" type="number" step="any" min="0" value="${vsd.dp || ''}" oninput="ddI('p')"></label></div><div class="mut">Preencha um dos campos: o outro é calculado sobre o valor dos produtos.</div><div class="acts" style="margin-top:10px;justify-content:flex-end"><button onclick="ddI('x')">Remover desconto</button><button class="pri" onclick="$('#dd').close()">OK</button></div>`;
    $('#dd').showModal();
    $('#dd-r').focus();
}
function ddI(m) {
    if (m == 'x') {
        vsd.dr = 0;
        vsd.dp = '';
        vdm = 'r';
    }
    else if (m == 'r') {
        vsd.dr = +$('#dd-r').value || 0;
        vdm = 'r';
    }
    else {
        vsd.dp = +$('#dd-p').value || 0;
        vdm = 'p';
    }
    vpT();
}
const vcur = () => ({ it: its, aj: -(+vsd.dr || 0), tx: +($('#vp-x') || {}).value || null, gr: vsd.gr, ln: [], pays: [] });
function vpT() {
    const sb = sub({ it: its });
    if (vdm == 'p')
        vsd.dr = rnd(sb * (+vsd.dp || 0) / 100);
    else
        vsd.dp = sb && vsd.dr ? +((+vsd.dr || 0) / sb * 100).toFixed(2) : '';
    const c = vcur(), T = tot(c), a = $('#dd-r'), b = $('#dd-p');
    if (a && document.activeElement !== a)
        a.value = vsd.dr || '';
    if (b && document.activeElement !== b)
        b.value = vsd.dp || '';
    $('#vp-t').textContent = fmt(T);
    $('#vp-db').textContent = vsd.dr ? 'Desconto: − ' + fmt(vsd.dr) + (vsd.dp ? ' (' + vsd.dp + '%)' : '') : 'Desconto';
    $('#vp-sm').textContent = 'Produtos ' + fmt(sb) + (c.tx ? ' · Entrega ' + fmt(entV(c)) : '') + (c.aj ? ' · Desconto − ' + fmt(-c.aj) : '');
}
function vpGoBase() {
    if (vsd.ro)
        return;
    if (!its.length)
        return alert('Adicione pelo menos um produto à venda.');
    if (its.some(r => !(+r.q > 0)))
        return alert('Confira as quantidades: há produto com quantidade zerada.');
    if (!(tot(vcur()) > 0))
        return alert('O total da venda precisa ser maior que zero.');
    vpPay();
}
function vpNP() { ['c', 'n', 'v'].forEach(x => $('#np-' + x).value = ''); $('#np-a').checked = false; $('#np-c').readOnly = false; $('#dnp').showModal(); $('#np-c').focus(); }
function npA() {
    const a = $('#np-a').checked, c = $('#np-c');
    c.readOnly = a;
    if (a)
        c.value = nextCod();
}
function npSBase() {
    const n = $('#np-n').value.trim();
    if (!n)
        return $('#np-n').focus();
    if ($('#np-v').value === '' || !(+$('#np-v').value >= 0))
        return $('#np-v').focus();
    let c = $('#np-c').value.trim();
    if ($('#np-a').checked && !c)
        c = nextCod();
    const du = codDup(c, null);
    if (du) {
        alert('O código "' + c + '" já é usado pelo produto "' + du.nome + '".');
        return $('#np-c').focus();
    }
    const p = { id: db.id++, nome: n, tipo: 'un', un: 'un', q: 0, preco: +$('#np-v').value, cp: 0, prod: 'local', par: null, dias: 0, promoOn: false, cod: c, semEstoque: true, estoque: 0 };
    db.it.push(p);
    save();
    $('#dnp').close();
    vpAdd('i', p.id);
}
const ppV = i => Math.max(0, +$('#pp' + i).value || 0);
function vpPay() {
    const T = tot(vcur());
    $('#dp').innerHTML = `<h3 style="margin:0 0 8px">Forma de pagamento</h3><div class="mut">Total da venda: <b>${fmt(T)}</b>. O valor pode ser dividido entre as formas.</div>${FPV.map(([l, f, pc], i) => `<div class="row" style="margin-top:6px"><b style="min-width:110px">${l}</b><span class="acts">${pc ? `<input type="number" min="1" step="1" id="ppc${i}" placeholder="Parcelas" title="Número de parcelas" value="1" style="width:90px">` : ''}<input type="number" step="any" min="0" id="pp${i}" placeholder="Valor (R$)" oninput="ppT()" style="width:130px"></span></div>`).join('')}
  <div class="form" style="margin-top:10px"><div class="row"><span>Total informado</span><b id="pp-s"></b></div><div class="row"><span id="pp-lb">Troco</span><b id="pp-tr"></b></div></div>
  <div class="acts" style="margin-top:10px;justify-content:flex-end"><button onclick="$('#dp').close()">Voltar</button><button class="pri" onclick="ppOk()">CONCLUIR VENDA</button></div>`;
    ppT();
    $('#dp').showModal();
}
function ppT() { const T = rnd(tot(vcur())), s = rnd(FPV.reduce((a, _, i) => a + ppV(i), 0)), d = rnd(s - T); $('#pp-s').textContent = fmt(s); $('#pp-lb').textContent = d < -.004 ? 'Falta' : 'Troco'; $('#pp-tr').textContent = fmt(Math.abs(d) < .005 ? 0 : Math.abs(d)); $('#pp-tr').style.color = d < -.004 ? '#a3281f' : ''; }
function ppOkBase() {
    const T = rnd(tot(vcur())), vals = FPV.map((_, i) => ppV(i)), s = rnd(vals.reduce((a, b) => a + b, 0));
    if (!(s > 0))
        return alert('Informe o valor recebido em pelo menos uma forma de pagamento.');
    if (s < T - .005)
        return alert('Faltam ' + fmt(T - s) + ' para completar o valor da venda.');
    const tr = rnd(Math.max(0, s - T));
    if (tr > vals[0] + .005)
        return alert('O troco (' + fmt(tr) + ') é maior que o valor pago em dinheiro. O troco só pode ser devolvido em dinheiro.');
    const dia = hoje(), pays = [];
    FPV.forEach(([l, f, pc], i) => {
        let v = vals[i];
        if (i == 0)
            v = rnd(v - tr);
        if (v > 0) {
            const p = { v, f, d: dia, ds: 0 }, n = pc ? Math.max(1, parseInt($('#ppc' + i).value) || 1) : 1;
            if (n > 1)
                p.pc = n;
            pays.push(p);
        }
    });
    const d = { cid: +$('#vp-c').value || null, data: vsd.data, it: its, obs: $('#vp-o').value, aj: rnd(-(+vsd.dr || 0)) || 0, tx: +$('#vp-x').value || null, gr: vsd.gr, val: 6, prev: 0 };
    let o;
    if (vsd.id) {
        o = get(vsd.id);
        Object.assign(o, d);
    }
    else {
        o = { id: db.id++, n: db.seq++, st: 'aberto', pays: [], ln: [], hp: [], venda: 1, ...d };
        db.orc.push(o);
    }
    pays.forEach(p => o.pays.push(p));
    conf(o);
    stat(o);
    save();
    $('#dp').close();
    pgv = false;
    vsd = null;
    its = [];
    tab = 'ven';
    render();
    if (confirm('Venda concluída. Emitir o recibo?'))
        recibo(o, o.pays.length - 1);
}
let ef = 'hoje';
function vEstV() {
    const h = hoje(), dd = o => o.pays.length ? o.pays[o.pays.length - 1].d : o.data, l = db.orc.filter(o => o.venda && !o.est && o.st == 'pago' && (ef == 'todas' || dd(o) == h || o.data == h)), mf = {}, mp = {}, qp = {};
    l.forEach(o => { o.pays.forEach(p => mf[p.f] = (mf[p.f] || 0) + p.v); o.it.forEach(r => { mp[r.d] = (mp[r.d] || 0) + r.t; qp[r.d] = (qp[r.d] || 0) + (+r.q || 0); }); });
    const mq = {};
    Object.keys(mp).forEach(k => mq[k + ' (' + fm(qp[k]) + ')'] = mp[k]);
    return `<div class="form"><div class="row"><b>Vendas (PDV)</b><div class="acts"><button class="chip ${ef == 'hoje' ? 'on' : ''}" onclick="ef='hoje';render()">Hoje</button><button class="chip ${ef == 'todas' ? 'on' : ''}" onclick="ef='todas';render()">Todas</button></div></div>
  <div class="g2"><div class="form"><b>Resumo ${ef == 'hoje' ? 'do dia' : 'geral'}</b><br>${l.length} venda(s) · ${fmt(l.reduce((a, o) => a + tot(o), 0))}<br>Lucro: ${fmt(l.reduce((a, o) => a + lucro(o), 0))}</div><div class="form"><b>Por forma de pagamento</b>${bars(mf)}</div></div>
  <div class="form"><b>Produtos vendidos nas vendas (quantidade)</b>${bars(mq)}</div></div>`;
}
function reciboV(o) {
    const c = cli(o.cid), T = tot(o), ul = o.pays[o.pays.length - 1];
    pr(`${hdr(`<b>RECIBO Nº ${o.n}</b><br>${dt(ul.d)}`)}${cbox(c)}<p>Recebemos a quantia de <b>${fmt(paid(o))}</b>, referente à venda nº ${o.n}, nas formas de pagamento abaixo:</p><table><tr><th>Forma de pagamento</th><th>Valor</th></tr>${o.pays.map(p => `<tr><td>${esc(p.f)}${p.pc > 1 ? ' em ' + p.pc + 'x' : ''}</td><td>${fmt(p.v)}</td></tr>`).join('')}</table><p>Total da venda: ${fmt(T)}<br>Total pago: ${fmt(paid(o))}<br>Saldo em aberto: ${fmt(T - paid(o))}</p>`, 'Recibo-' + o.n, 'Olá! Segue o recibo da venda nº ' + o.n + ' em PDF.', o, 'A5');
}
/* ORÇAMENTOS */
function vOrc() {
    const l = db.orc.filter(o => !o.venda && (flt == 'todos' ? o.st != 'arquivado' : o.st == flt)).sort((a, b) => b.n - a.n);
    return `<h3 style="margin:0 0 8px;font-size:16px">Orçamentos</h3><div class="row"><div class="acts">${['todos', ...Object.keys(ST)].map(s => `<button class="chip ${flt == s ? 'on' : ''}" onclick="flt='${s}';render()">${s == 'todos' ? 'Ativos' : ST[s]}</button>`).join('')}</div></div>
 <div class="list">${l.map(o => {
        const c = cli(o.cid);
        return `<div class="item s-${o.st}"><div class="row"><b>Nº ${o.n} · ${esc(c ? fullName(c) : '(sem cliente)')}</b><b>${fmt(tot(o))}</b></div><div class="mut">${dt(o.data)} · <span class="tag">${ST[o.st]}</span> · pago ${fmt(paid(o))} · saldo ${fmt(tot(o) - paid(o))}</div>
 <div class="acts" style="margin-top:6px"><button onclick="openQ(${o.id})">Editar / Pagamentos</button><button onclick="wpp(${o.id})">WhatsApp (texto)</button><button onclick="pdf(${o.id})">WhatsApp + PDF</button>${o.stockDone && !o.est ? `<button class="del" onclick="estornar(${o.id})">Estornar</button>` : ''}
 ${o.st == 'aberto' ? `<button onclick="setM(${o.id},'recusado')">Recusar</button>` : ''}${['recusado', 'arquivado'].includes(o.st) ? `<button onclick="setM(${o.id},'aberto')">Reabrir</button>` : `<button onclick="setM(${o.id},'arquivado')">Arquivar</button>`}<button class="del" onclick="delQ(${o.id})">Excluir</button></div></div>`;
    }).join('') || '<div class="item mut">Nenhum orçamento nesta lista.</div>'}</div>`;
}
function setM(id, s) { const o = get(id); o.st = s; stat(o); save(); render(); }
function delQ(id) {
    const order = get(id);
    if (!order)
        return;
    if (order.stockDone || (order.pays || []).length) {
        alert('Este registro possui pagamento ou movimentação de estoque. Estorne e mantenha-o no histórico; não é seguro excluí-lo.');
        return;
    }
    if (confirm('Excluir este orçamento sem pagamentos?')) {
        db.orc = db.orc.filter(o => o.id != id);
        save();
        render();
    }
}
/* DIÁLOGO DO ORÇAMENTO */
const newRow = () => ({ rid: 'r' + (db.id++), d: '', u: 'un', q: 1, p: 0, t: 0, cu: 0, cpu: 0, dd: 0 });
function addRow() { its.push(newRow()); rowsI(); }
const cliOpts = sel => '<option value="">— escolher cliente —</option>' + db.cli.map(c => `<option value="${c.id}" ${sel == c.id ? 'selected' : ''}>${esc(fullName(c))}</option>`).join('');
let ncT = 'q';
let vm = false;
function dvSel() { $('#q-dv2').hidden = $('#q-dv').value != 'x'; }
function openQ(id, v) {
    const o = id ? get(id) : null;
    if ((o && o.venda) || (!o && v))
        return openV(id);
    vm = o ? !!o.venda : !!v;
    edit = o ? o.id : null;
    document.querySelectorAll('.nv').forEach(e => e.hidden = vm);
    $('#dqt').textContent = o ? (vm ? 'Venda' : 'Orçamento') + ' nº ' + o.n : (vm ? 'Nova venda' : 'Novo orçamento');
    $('#q-c').innerHTML = cliOpts(o ? o.cid : null);
    {
        const d = dv(o || {});
        $('#q-dv').value = [5, 10].includes(d) ? d : 'x';
        $('#q-dv2').value = [5, 10].includes(d) ? '' : d;
        $('#q-dv2').hidden = [5, 10].includes(d);
    }
    $('#q-x').innerHTML = '<option value="">Sem entrega</option>' + db.tx.map(x => `<option value="${x.id}" ${o && o.tx == x.id ? 'selected' : ''}>${esc(x.nome)} - ${fmt(x.valor)}</option>`).join('');
    $('#q-d').value = o ? o.data : hoje();
    $('#q-a').value = o ? o.aj || '' : '';
    $('#q-v').value = o ? o.val : 6;
    $('#q-g').checked = !!(o && o.gr);
    its = o ? o.it.map(x => JSON.parse(JSON.stringify(x))) : [newRow()];
    $('#q-o').value = o ? o.obs : '';
    $('#dsrv').innerHTML = db.it.map(s => `<option value="${esc(s.nome)}">`).join('') + db.kits.map(k => `<option value="Kit: ${esc(k.nome)}">`).join('');
    rowsI();
    $('#q-pv').value = o ? o.prev : Math.max(0, ...its.map(r => r.dd || 0));
    pgs();
    qOpen();
}
function rowsI() {
    $('#q-i').innerHTML = its.map((r, i) => {
        const it = db.it.find(x => x.id == r.iid);
        return `<div class="rw"><div class="it">
 <label class="c1">Produto / descrição<input id="rn${i}" list="dsrv" placeholder="Digite ou escolha um produto" value="${esc(r.d)}" onchange="pick(${i},this.value)"></label>
 <label>Unidade de medida<input value="${esc(r.u)}" oninput="its[${i}].u=this.value"></label>
 <label>Quantidade<input type="number" step="any" id="rq${i}" value="${r.q}" oninput="rc(${i},'q',this.value)"></label>
 <label>Valor unitário (R$)<input type="number" step="any" id="rp${i}" value="${+(+r.p).toFixed(4)}" oninput="rc(${i},'p',this.value)"></label>
 <label>Valor total (R$)<input type="number" step="any" id="rt${i}" value="${+(+r.t).toFixed(2)}" oninput="rc(${i},'t',this.value)"></label>
 <label>Prazo (dias úteis)<input type="number" id="rd${i}" value="${r.dd || 0}" oninput="its[${i}].dd=+this.value;pv()"></label>
 <button class="rm del" onclick="its.splice(${i},1);rowsI()">Remover produto</button></div>
 ${it && it.tipo == 'm2' ? `<div class="ex"><label>Largura (m)<input type="number" step="any" value="${r.w || ''}" oninput="its[${i}].w=this.value;calc(${i});upd(${i})"></label><label>Altura (m)<input type="number" step="any" value="${r.h || ''}" oninput="its[${i}].h=this.value;calc(${i});upd(${i})"></label><label>Área cobrada<br><b id="ra${i}">${fm(r.ar)} m²</b></label>${it.mm ? `<span class="mut">mínimo cobrado: ${fm(it.mm)} m²</span>` : ''}</div>` : ''}
 ${it && it.tipo == 'lote' ? `<div class="ex"><label>Lote (quantidade)<select onchange="its[${i}].lq=+this.value;calc(${i});later(()=>{rowsI();pv()})">${it.lotes.map((l, j) => `<option value="${j}" ${(r.lq || 0) == j ? 'selected' : ''}>${fm(l.q)} unid. - ${fmt(l.t)}</option>`).join('')}</select></label></div>` : ''}</div>`;
    }).join('');
    qt();
}
function calc(i) {
    const r = its[i], it = db.it.find(x => x.id == r.iid), k = db.kits.find(x => x.id == r.kid);
    r.cod = it ? (it.cod || '') : '';
    if (k) {
        r.d = 'Kit ' + k.nome;
        r.u = 'kit';
        const pr = k.promoOn && k.promo;
        r.pn = pr ? k.preco : 0;
        r.p = pr ? k.promo : k.preco;
        r.kc = k.itens.map(c => { const x = db.it.find(y => y.id == c.iid) || {}; return { iid: c.iid, nome: (c.q > 1 ? c.q + 'x ' : '') + (x.nome || '?'), dd: x.dias || 0 }; });
        r.cpu = k.itens.reduce((a, c) => a + ((db.it.find(y => y.id == c.iid) || {}).cp || 0) * c.q, 0);
        r.dd = Math.max(0, ...r.kc.map(c => c.dd));
    }
    else if (it && it.tipo == 'm2') {
        const w = +r.w || 0, h = +r.h || 0, a = Math.max(w * h, +it.mm || 0), pr = it.promoOn && it.pr;
        r.u = 'un';
        r.ar = a;
        r.pn = pr ? it.mp : 0;
        r.p = a * (pr ? it.pr : it.mp);
        r.cpu = a * (+it.cm || 0);
        r.dd = it.dias || 0;
        r.d = `${it.nome} ${fm(w)} x ${fm(h)} m (${fm(a)} m²${a > w * h ? ', mínimo' : ''})`;
    }
    else if (it && it.tipo == 'lote') {
        const l = it.lotes[r.lq || 0];
        if (!l)
            return;
        const pr = it.promoOn && l.pr;
        r.q = 1;
        r.u = 'unidades';
        r.d = `${fm(l.q)} unid. ${it.nome}`;
        r.pn = pr ? l.t : 0;
        r.p = pr ? l.pr : l.t;
        r.cpu = +l.c || 0;
        r.dd = +l.d || 0;
    }
    else if (it) {
        r.d = it.nome;
        r.u = it.un || 'un';
        const pr = it.promoOn && it.pr;
        r.pn = pr ? it.preco : 0;
        r.p = pr ? it.pr : it.preco;
        r.cpu = it.cp || 0;
        r.dd = it.dias || 0;
    }
    r.p = rnd(r.p * 1e4) / 1e4;
    r.t = rnd(r.q * r.p);
    r.cu = rnd(r.q * r.cpu);
}
function pick(i, v) {
    const r = its[i], k = db.kits.find(x => 'Kit: ' + x.nome == v), it = db.it.find(x => x.nome.toLowerCase() == v.toLowerCase());
    r.d = v;
    r.iid = it ? it.id : null;
    r.kid = k ? k.id : null;
    delete r.kc;
    r.lq = 0;
    r.w = r.h = '';
    if (it || k) {
        r.q = it && it.tipo == 'un' && it.q ? +it.q : 1;
        calc(i);
    }
    later(() => { rowsI(); pv(); });
}
function rc(i, k, v) {
    const r = its[i], it = db.it.find(x => x.id == r.iid);
    v = +v;
    r[k] = v;
    if (it && it.tipo == 'm2' && k == 'q')
        calc(i);
    else {
        if (k == 'q') {
            if (r.p)
                r.t = rnd(v * r.p);
            else if (r.t && v)
                r.p = r.t / v;
        }
        if (k == 'p')
            r.t = rnd(r.q * v);
        if (k == 't' && r.q)
            r.p = v / r.q;
        r.cu = rnd(r.q * (r.cpu || 0));
    }
    upd(i);
    qt();
}
function upd(i) {
    const r = its[i];
    $('#rp' + i).value = +(+r.p).toFixed(4);
    $('#rt' + i).value = +(+r.t).toFixed(2);
    $('#rd' + i).value = r.dd || 0;
    $('#rn' + i).value = r.d;
    const ra = $('#ra' + i);
    if (ra)
        ra.textContent = fm(r.ar) + ' m²';
    pv();
    qt();
}
function pv() { $('#q-pv').value = Math.max(0, ...its.map(r => r.dd || 0)); }
function qt() {
    const o = { it: its, aj: $('#q-a').value, tx: +$('#q-x').value || null, gr: $('#q-g').checked, ln: [] }, T = tot(o), L = lucro(o);
    $('#q-t').textContent = fmt(T);
    const bad = its.some(r => r.t < r.cu);
    $('#q-l').innerHTML = `Lucro estimado (interno): ${fmt(L)} (${T ? Math.round(L / T * 100) : 0}%)${bad ? ' <b style="color:#a3281f">· atenção: produto com preço abaixo do custo</b>' : ''}`;
}
function saveQ() {
    const data = {
        cid: +$('#q-c').value || null,
        data: $('#q-d').value,
        it: its.filter(x => x.d.trim()).map(row => JSON.parse(JSON.stringify(row))),
        obs: $('#q-o').value,
        aj: +$('#q-a').value || 0,
        dv: gdv(),
        tx: +$('#q-x').value || null,
        gr: $('#q-g').checked,
        val: +$('#q-v').value || 6,
        prev: +$('#q-pv').value || 0
    };
    data.it.forEach(row => {
        if (!row.iid && !row.kid) {
            const product = {
                id: db.id++, nome: row.d, tipo: 'un', un: row.u, q: 0,
                preco: row.q ? row.t / row.q : row.p, cp: row.cpu || 0,
                prod: 'local', par: null, dias: row.dd || 0,
                semEstoque: true, estoque: 0
            };
            db.it.push(product);
            row.iid = product.id;
            row.cod = '';
        }
        else if (row.iid) {
            row.cod = (db.it.find(x => x.id == row.iid) || {}).cod || '';
        }
        else
            row.cod = '';
    });
    let order;
    if (edit) {
        order = get(edit);
        if (!order)
            return alert('Não foi possível localizar o registro para edição.');
        const oldNeeds = order.stockDone ? stockNeeds(order.it) : new Map();
        const newNeeds = order.stockDone ? stockNeeds(data.it) : new Map();
        Object.assign(order, data);
        if (order.stockDone) {
            const ids = new Set([...oldNeeds.keys(), ...newNeeds.keys()]);
            for (const id of ids) {
                const product = db.it.find(x => x.id == id);
                if (product && !product.semEstoque) {
                    const delta = (oldNeeds.get(id) || 0) - (newNeeds.get(id) || 0);
                    product.estoque = (+product.estoque || 0) + delta;
                }
            }
        }
    }
    else {
        order = { id: db.id++, n: db.seq++, st: 'aberto', pays: [], ln: [], hp: [], venda: vm ? 1 : 0, ...data };
        db.orc.push(order);
        edit = order.id;
    }
    if (!order.venda)
        sync(order);
    stat(order);
    save();
    render();
    pgs();
    qt();
}
function pgs() {
    const o = edit ? get(edit) : null;
    $('#q-pg').innerHTML = !o ? '<p class="mut">Salve o orçamento para registrar pagamentos.</p>' : `<div class="form"><b>Pagamentos</b> <span class="tag">${ST[o.st]}</span> <span class="mut">(total ${fmt(tot(o))} · pago ${fmt(paid(o))} · saldo ${fmt(tot(o) - paid(o))})</span><div class="mut">A produção é liberada com pelo menos 50% pago.</div>
 ${o.pays.map((p, i) => `<div class="row">${dt(p.d)} · ${fmt(p.v)} · ${esc(p.f)}${p.pc > 1 ? ' em ' + p.pc + 'x' : ''}<button onclick="recibo(get(${o.id}),${i})">Recibo</button></div>`).join('')}
 <div class="acts" style="margin-top:6px"><select id="pf" style="width:auto">${FP.map(f => `<option>${f}</option>`).join('')}</select><button onclick="pay('50')">Entrada 50%</button><button onclick="pay('tot')">Total / saldo</button><button onclick="pay('out')">Outro valor</button><button onclick="pay('av')">À vista (−${fm(dv(o))}%)</button></div></div>`;
}
function payBase(k) {
    const o = get(edit), f = $('#pf').value, t = tot(o), r = t - paid(o);
    let v, ds = 0;
    if (k == 'av') {
        o.dv = gdv();
        v = rnd(r * (1 - o.dv / 100));
        ds = rnd(r - v);
    }
    else
        v = rnd(k == '50' ? t / 2 : k == 'tot' ? r : +(prompt('Valor recebido (R$):', r.toFixed(2)) || 0));
    if (!(v > 0))
        return;
    if (!ds && v > r + .005 && !confirm('Valor maior que o saldo (' + fmt(r) + '). Confirmar mesmo assim?'))
        return;
    if (!confirm('Confirmar ' + fmt(v) + ' em ' + f + (ds ? ' (com desconto à vista de ' + fmt(ds) + ')' : '') + '?'))
        return;
    o.pays.push({ v, f, d: hoje(), ds });
    conf(o);
    if (!o.venda)
        sync(o);
    stat(o);
    save();
    render();
    pgs();
    $('#q-t').textContent = fmt(tot(o));
    if (confirm('Emitir o recibo deste pagamento?'))
        recibo(o, o.pays.length - 1);
}
/* DOCUMENTOS */
function hdr(box) { const e = db.emp; return `<div class="ph">${e.logo ? `<img src="${e.logo}">` : ''}<div style="flex:1"><h1>${esc(e.nome || 'Minha loja')}</h1>${[e.end, e.tel && 'Tel/WhatsApp: ' + e.tel, e.ig && 'Instagram: ' + e.ig, e.cnpj && 'CNPJ: ' + e.cnpj].filter(Boolean).map(esc).join('<br>')}</div><div class="ob">${box}</div></div>`; }
const cbox = c => c ? `<p>Cliente: <b>${esc(fullName(c))}</b>${c.tel ? ' · Contato: ' + esc(c.tel) : ''}<br>${c.end ? 'Endereço: ' + esc(c.end) : ''}</p>` : '';
function pr(html, title, msg, o, size) {
    $('#pg').textContent = '@page{size:' + size + ';margin:10mm}';
    $('#print').innerHTML = html;
    const t = document.title;
    document.title = title.replace(/\s+/g, '_');
    window.onafterprint = () => { document.title = t; $('#bar').hidden = false; $('#bar-b').onclick = () => { wa(o, msg); $('#bar').hidden = true; }; };
    print();
}
const prazo = o => Math.max(0, ...o.it.map(r => r.dd || 0), o.prev || 0);
function pdf(id) {
    const o = get(id), c = cli(o.cid), T = tot(o), e = db.emp;
    pr(`${hdr(`<b>ORÇAMENTO Nº ${o.n}</b><br>Criado em ${dt(o.data)}<br>Válido até ${dt(addD(o.data, o.val || 6))}`)}${cbox(c)}
 <table><tr><th>Cod.</th><th>Descrição do produto</th><th>Unidade de Medida</th><th>Quant.</th><th>Valor Unit. / Valor Promocional</th><th>Valor Total</th></tr>${o.it.map(r => `<tr><td>${esc(r.cod || (r.iid ? (db.it.find(x => x.id == r.iid) || {}).cod : '') || '')}</td><td>${esc(r.d)}</td><td>${esc(r.u)}</td><td>${fm(r.q)}</td><td>${r.pn ? '<s>' + fmt(r.pn) + '</s> ' : ''}${fmt(r.p)}</td><td>${fmt(r.t)}</td></tr>`).join('')}
 ${o.tx || o.gr ? `<tr><td colspan="5">Entrega${o.gr ? ' (grátis)' : ''}</td><td>${fmt(entV(o))}</td></tr>` : ''}${dsc(o) ? `<tr><td colspan="5">Desconto à vista</td><td>- ${fmt(dsc(o))}</td></tr>` : ''}${o.aj ? `<tr><td colspan="5">${o.aj < 0 ? 'Desconto' : 'Acréscimo'}</td><td>${fmt(o.aj)}</td></tr>` : ''}</table>
 <p class="big">Total: ${fmt(T)}</p><div class="bx"><b>Forma de pagamento</b><br>À vista no Pix com ${fm(dv(o))}% de desconto: ${fmt(T * (1 - dv(o) / 100))}<br>Entrada de 50% (${fmt(T / 2)}) no Pix e restante na entrega (${fmt(T / 2)})<br>Parcelado em 2x de ${fmt(T / 2)} no cartão, sem juros<br>Acima de 3x: consultar o vendedor${e.pix ? `<br>Chave Pix: <b>${esc(e.pix)}</b>${e.titular ? ' (' + esc(e.titular) + ')' : ''}` : ''}</div>
 <p>Previsão de produção: ${prazo(o)} dias úteis após a aprovação da arte, sujeita à demanda.</p>${o.obs ? '<p>' + esc(o.obs).replace(/\n/g, '<br>') + '</p>' : ''}`, 'Orcamento-' + o.n + '-' + (c ? fullName(c) : ''), 'Olá! Segue o orçamento nº ' + o.n + ' em PDF.', o, 'A4');
}
function recibo(o, i) {
    if (o.venda)
        return reciboV(o);
    const c = cli(o.cid), p = o.pays[i];
    pr(`${hdr(`<b>RECIBO Nº ${o.n}-${i + 1}</b><br>${dt(p.d)}`)}${cbox(c)}<p>Recebemos a quantia de <b>${fmt(p.v)}</b>, forma de pagamento: <b>${esc(p.f)}${p.pc > 1 ? ' em ' + p.pc + 'x' : ''}</b>, referente ${o.venda ? 'à venda' : 'ao pedido'} nº ${o.n}.</p><p>Total do pedido: ${fmt(tot(o))}<br>Total pago: ${fmt(paid(o))}<br>${dsc(o) ? 'Desconto à vista concedido: ' + fmt(dsc(o)) + '<br>' : ''}Saldo em aberto: ${fmt(tot(o) - paid(o))}</p>`, 'Recibo-' + o.n + '-' + (i + 1), 'Olá! Segue o recibo do pedido nº ' + o.n + ' em PDF.', o, 'A5');
}
function txt(o) { const c = cli(o.cid), T = tot(o); return `*Orçamento nº ${o.n}*${db.emp.nome ? ' - ' + db.emp.nome : ''}\nCliente: ${c ? fullName(c) : ''}\n\n` + o.it.map(r => `${r.d} - ${fmt(r.t)}`).join('\n') + (o.tx || o.gr ? `\nEntrega${o.gr ? ' (grátis)' : ''}: ${fmt(entV(o))}` : '') + `\n\n*Total: ${fmt(T)}*\nÀ vista no Pix (${fm(dv(o))}% de desconto): ${fmt(T * (1 - dv(o) / 100))}\nEntrada de 50%: ${fmt(T / 2)}\n2x no cartão sem juros: ${fmt(T / 2)} cada\nPrevisão de produção: ${prazo(o)} dias úteis`; }
function wa(o, t) { const c = cli(o.cid); window.open('https://wa.me/' + (c && (c.whatsapp || c.tel) ? phone(c.whatsapp || c.tel) : '') + '?text=' + encodeURIComponent(t), '_blank'); }
function wpp(id) { const o = get(id); wa(o, txt(o)); }
const fill = (t, o) => t.replace('{nome}', (cli(o.cid) || {}).nome || '').replace('{n}', o.n).replace('{prev}', prevD(o));
function mapa(i) {
    const c = cli(i);
    if (c && c.end)
        window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.end), '_blank');
}
/* PEDIDOS */
function ginfo(o) {
    let m = null;
    o.ln.forEach(l => {
        if (!m || l.tl.length < m.tl.length)
            m = l;
    });
    return m;
}
function glab(o) { const l = ginfo(o); return !l ? '—' : l.tl.length ? labs(l)[l.tl.length - 1] : 'Aguardando início'; }
function tpl(l) { const m = l.tl.length - 1; return m < 0 ? 0 : m <= 4 ? m : m == 5 ? (l.modo == 'entrega' ? 6 : 5) : 7; }
function vPed() {
    if (po && get(po))
        return vDet(get(po));
    po = null;
    const l = db.orc.filter(o => !o.venda && ['aprovado', 'executado', 'pago'].includes(o.st) && (pf == 'fim' ? done(o) : !done(o))).sort((a, b) => a.n - b.n);
    return vOrc() + `<h3 style="margin:18px 0 6px;font-size:16px">Pedidos em produção</h3><div class="acts"><button class="chip ${pf == 'and' ? 'on' : ''}" onclick="pf='and';render()">Em andamento</button><button class="chip ${pf == 'fim' ? 'on' : ''}" onclick="pf='fim';render()">Entregues</button></div>
 <div class="list">${l.map(o => { const c = cli(o.cid), oc = o.ln.some(x => x.oc.some(y => !y.r)); return `<div class="item click s-${o.st}" onclick="po=${o.id};render()"><div class="row"><b>Nº ${o.n} · ${esc(c ? fullName(c) : '')}</b><span class="tag">${done(o) ? 'Entregue' : glab(o)}</span></div><div class="mut">${o.ln.length} produto(s) · previsão ${prevD(o)} · ${ST[o.st]}${unl(o) ? '' : ' · <b style="color:#a3281f">aguardando 50% para liberar a produção</b>'}${oc ? ' · <b style="color:#c98a00">⚠ ocorrência</b>' : ''}</div></div>`; }).join('') || `<div class="item mut">${pf == 'fim' ? 'Nenhum pedido entregue.' : 'Nenhum pedido em andamento. Os pedidos aparecem aqui depois do primeiro pagamento.'}</div>`}</div>`;
}
function vDet(o) {
    const c = cli(o.cid), f = Math.max(0, tot(o) / 2 - paid(o)), ln = o.ln.map((l, i) => [l, i]).sort((a, b) => b[0].prio - a[0].prio);
    return `<button onclick="po=null;render()">← Voltar aos pedidos</button>
 <div class="form s-${o.st}"><div class="row"><b>Nº ${o.n} · ${esc(c ? fullName(c) : '')}</b><span class="tag">${done(o) ? 'Entregue' : glab(o)}</span></div><div class="mut">${ST[o.st]} · total ${fmt(tot(o))} · pago ${fmt(paid(o))} · previsão ${prevD(o)}${o.po && o.po != o.prev ? ' (original: ' + o.po + ' dias úteis)' : ''}</div>
 <div class="acts" style="margin-top:6px"><button class="pri" onclick="sendS(${o.id})">Enviar status geral ao cliente</button><input type="number" id="pv" value="${o.prev || 0}" style="width:70px" title="Previsão em dias úteis"><button onclick="setPrevUI(${o.id})">Atualizar previsão</button>${c && c.end ? `<button onclick="mapa(${c.id})">Ver no mapa</button>` : ''}</div>
 ${o.hp.map(h => `<div class="mut">Previsão ${h.de} → ${h.para} dias (${dt(h.d)})${h.m ? ' · ' + esc(h.m) : ''}</div>`).join('')}</div>` + ln.map(([l, i]) => vLn(o, l, i, f)).join('');
}
function vLn(o, l, i, f) {
    const L = labs(l), n = l.tl.length, it = db.it.find(x => x.id == l.iid), p = it && it.prod == 'terc' ? par(it.par) : null, k = o.id + ',' + i;
    return `<div class="form ${l.prio ? 'pl' : ''}"><div class="row"><b>${l.prio ? '★ ' : ''}${esc(l.d)}</b><span class="acts"><button onclick="prio(${k})">${l.prio ? 'Tirar prioridade' : 'Prioridade'}</button>${p ? `<button onclick="mail(${k})">E-mail p/ ${esc(p.nome)}</button>` : ''}</span></div>
 <div class="mut">${p ? 'Terceirizado: ' + esc(p.nome) : 'Produção local'} · prazo ${l.dd || 0} dias · <select style="width:auto;margin:0" onchange="setEx(${k},this.value)"><option value="">entrega junto com o pedido</option>${db.tx.map(x => `<option value="${x.id}" ${l.ex == x.id ? 'selected' : ''}>entrega separada: ${esc(x.nome)} (${fmt(x.valor)})</option>`).join('')}</select></div>
 <div class="acts" style="margin:4px 0">${l.arte ? `<a href="#" onclick="bx('${esc(l.arte.k)}');return false">📎 ${esc(l.arte.name)}</a>` : '<span class="mut">Sem arte anexada</span>'}<label class="mut">Anexar PDF da arte <input type="file" accept="application/pdf" onchange="arte(${k},this.files[0])"></label></div>
 ${l.oc.map((x, j) => x.r ? '' : `<div class="warn">⚠ ${esc(x.t)}: ${esc(x.o)} <span class="mut">(${x.d})</span> <button onclick="resolv(${k},${j})">Resolver</button></div>`).join('')}
 ${l.tl.map(t => `<div class="stp">✔ <b>${esc(t.e)}</b> · ${t.d}${t.o ? ' · ' + esc(t.o) : ''}${t.s ? ' · status enviado' : ''}</div>`).join('')}
 ${n >= 7 ? '<div class="stp"><b>Linha entregue</b></div>' : !unl(o) ? `<div class="lock">Produção bloqueada: faltam ${fmt(f)} para chegar a 50% do pedido. Registre o pagamento no orçamento.</div>` : `<div class="cur"><b>Próxima etapa: ${L[n]}</b>
 ${n == 5 ? `<div class="acts"><span>Cliente vai:</span><select onchange="setModo(${k},this.value)"><option value="retirada">Retirar na loja</option><option value="entrega" ${l.modo == 'entrega' ? 'selected' : ''}>Receber em casa</option></select></div>` : ''}
 <input id="eo${o.id}_${i}" placeholder="Observação (opcional)"><div class="acts"><button class="pri" onclick="regE(${k})">Registrar: ${L[n]}</button>${n > 0 ? `<button onclick="undoE(${k})">Voltar etapa</button>` : ''}${n == 2 || n == 3 ? `<button onclick="occ(${k},'Aguardando chegada de material')">Aguardando material</button><button onclick="occ(${k},'Correção / erro na produção')">Correção / erro</button>` : ''}</div></div>`}
 ${n >= 7 ? `<div class="acts" style="margin-top:6px"><button onclick="undoE(${k})">Voltar etapa (desfazer entrega)</button></div>` : ''}</div>`;
}
function regE(oid, i) {
    const o = get(oid), l = o.ln[i], n = l.tl.length, L = labs(l);
    if (n >= 7 || !unl(o))
        return;
    if (n == 6 && !confirm('Confirmar que "' + l.d + '" foi entregue/retirado?'))
        return;
    l.tl.push({ e: L[n], d: agora(), ts: hoje(), o: $('#eo' + oid + '_' + i).value, s: 0 });
    stat(o);
    save();
    render();
}
function undoE(oid, i) {
    const o = get(oid), l = o.ln[i];
    if (!l.tl.length || !confirm('Voltar a etapa "' + l.tl[l.tl.length - 1].e + '"?'))
        return;
    l.log.push('Etapa "' + l.tl[l.tl.length - 1].e + '" desfeita em ' + agora());
    l.tl.pop();
    stat(o);
    save();
    render();
}
function prio(oid, i) { const l = get(oid).ln[i]; l.prio = l.prio ? 0 : 1; save(); render(); }
function setModo(oid, i, v) { get(oid).ln[i].modo = v; save(); render(); }
function setEx(oid, i, v) { get(oid).ln[i].ex = +v || null; save(); render(); }
function resolv(oid, i, j) { get(oid).ln[i].oc[j].r = 1; save(); render(); }
function sendS(oid) {
    const o = get(oid), l = ginfo(o);
    if (!l)
        return;
    wa(o, fill(db.msg[tpl(l)] || MSG0[tpl(l)], o));
    if (l.tl.length) {
        l.tl[l.tl.length - 1].s = 1;
        save();
        render();
    }
}
function setPrevUI(oid) {
    const o = get(oid), n = +$('#pv').value || 0;
    if (n == o.prev)
        return;
    const m = prompt('Motivo da mudança de previsão (vai na mensagem ao cliente):', '');
    if (m === null)
        return;
    setPrev(o, n, m, 0);
}
function setPrev(o, n, m, sk) {
    o.hp.push({ de: o.prev, para: n, d: hoje(), m });
    o.prev = n;
    save();
    render();
    if (sk || confirm('Avisar o cliente da nova previsão pelo WhatsApp?'))
        wa(o, fill('Olá, {nome}! A previsão do pedido nº {n} foi atualizada para {prev}.' + (m ? ' Motivo: ' + m : ''), o));
}
function occ(oid, i, t) {
    const o = get(oid), l = o.ln[i], m = prompt(t + ' — descreva o motivo:', '');
    if (m === null)
        return;
    l.oc.push({ t, o: m, d: agora() });
    save();
    render();
    if (confirm('Atualizar a previsão e avisar o cliente?')) {
        const n = prompt('Nova previsão em dias úteis (a partir da confirmação):', o.prev);
        if (n !== null)
            setPrev(o, +n || o.prev, t + ': ' + m, 1);
    }
}
function mail(oid, i) {
    const o = get(oid), l = o.ln[i], it = db.it.find(x => x.id == l.iid), p = it ? par(it.par) : null;
    if (!p)
        return;
    const c = cli(o.cid);
    location.href = 'mailto:' + (p.email || '') + '?subject=' + encodeURIComponent('Pedido nº ' + o.n + (c ? ' - ' + c.nome : '')) + '&body=' + encodeURIComponent('Olá! Segue pedido para produção:\n\n' + l.d + '\nPrazo previsto: ' + (l.dd || 0) + ' dias úteis\n\n(Anexe o arquivo da arte' + (l.arte ? ': ' + l.arte.name : '') + '.)');
}
function arte(oid, i, f) {
    if (!f)
        return;
    const r = new FileReader();
    r.onload = async () => { const k = 'a' + oid + '_' + i + '_' + Date.now(); await fput(k, { name: f.name, data: r.result }); get(oid).ln[i].arte = { k, name: f.name }; save(); render(); };
    r.readAsDataURL(f);
}
async function bx(k) {
    const f = await fget(k);
    if (!f)
        return alert('Arquivo não encontrado neste navegador.');
    const a = document.createElement('a');
    a.href = f.data;
    a.download = f.name;
    a.click();
}
function saveC() {
    const d = { nome: $('#c-n').value.trim(), tel: $('#c-t').value.trim(), end: $('#c-e').value.trim() };
    if (!d.nome)
        return $('#c-n').focus();
    if (ec)
        Object.assign(cli(ec), d);
    else
        db.cli.push({ id: db.id++, ...d });
    ec = null;
    save();
    render();
}
function tpSel(v) { ['un', 'm2', 'lote'].forEach(t => $('#s-' + t).style.display = t == v ? '' : 'none'); }
function fi(k) {
    const g = x => +$('#i-' + x).value || 0, s = (x, v) => $('#i-' + x).value = +(+v).toFixed(4);
    if (k == 't' && g('q'))
        s('p', g('t') / g('q'));
    if (k == 'p')
        s('t', g('p') * g('q'));
    if (k == 'q') {
        if (g('p'))
            s('t', g('p') * g('q'));
        else if (g('t'))
            s('p', g('t') / g('q'));
        if (g('cp'))
            s('ct', g('cp') * g('q'));
        else if (g('ct'))
            s('cp', g('ct') / g('q'));
    }
    if (k == 'ct' && g('q'))
        s('cp', g('ct') / g('q'));
    if (k == 'cp')
        s('ct', g('cp') * g('q'));
}
const lotesH = () => dl.map((l, j) => `<div class="row">${fm(l.q)} unid. · ${fmt(l.t)} · custo ${fmt(l.c)} · ${l.d || 0} dias${l.pr ? ' · promo ' + fmt(l.pr) : ''}<button class="del" onclick="dl.splice(${j},1);$('#l-list').innerHTML=lotesH()">✕</button></div>`).join('');
function addL() {
    const q = +$('#l-q').value, t = +$('#l-t').value;
    if (!q || !t)
        return;
    dl.push({ q, t, c: +$('#l-c').value || 0, d: +$('#l-d').value || 0, pr: +$('#l-p').value || 0 });
    dl.sort((a, b) => a.q - b.q);
    ['q', 't', 'c', 'd', 'p'].forEach(x => $('#l-' + x).value = '');
    $('#l-list').innerHTML = lotesH();
}
function saveI() {
    const tp = $('#i-tp').value, d = { nome: $('#i-n').value.trim(), tipo: tp, prod: $('#i-pd').value, par: +$('#i-pa').value || null, dias: +$('#i-d').value || 0, promoOn: $('#i-po').checked };
    if (!d.nome)
        return $('#i-n').focus();
    d.cod = $('#i-cod').value.trim();
    if ($('#i-ca').checked && !d.cod)
        d.cod = nextCod();
    {
        const du = codDup(d.cod, ei);
        if (du) {
            alert('O código "' + d.cod + '" já é usado pelo produto "' + du.nome + '".');
            return $('#i-cod').focus();
        }
    }
    if (tp == 'un')
        Object.assign(d, { un: $('#i-u').value.trim() || 'un', q: +$('#i-q').value || 0, preco: +$('#i-p').value || 0, cp: +$('#i-cp').value || 0, pr: +$('#i-pr').value || 0 });
    if (tp == 'm2')
        Object.assign(d, { mp: +$('#i-mp').value || 0, cm: +$('#i-cm').value || 0, mm: +$('#i-mm').value || 0, pr: +$('#i-pm').value || 0 });
    if (tp == 'lote') {
        if (!dl.length)
            return alert('Adicione pelo menos um lote.');
        d.lotes = dl;
    }
    if (ei)
        Object.assign(db.it.find(x => x.id == ei), d);
    else
        db.it.push({ id: db.id++, ...d });
    ei = null;
    di = {};
    save();
    render();
}
/* KITS */
function vKit() {
    const k = ek ? db.kits.find(x => x.id == ek) : {};
    if (!di.k) {
        dk = (k.itens || []).map(x => ({ ...x }));
        di.k = 1;
    }
    const un = db.it.filter(i => (i.tipo || 'un') == 'un'), cs = dk.reduce((a, c) => a + ((db.it.find(y => y.id == c.iid) || {}).cp || 0) * c.q, 0), vs = dk.reduce((a, c) => a + ((db.it.find(y => y.id == c.iid) || {}).preco || 0) * c.q, 0);
    return `<div class="form"><b>${ek ? 'Editar kit' : 'Novo kit'}</b><div class="g2"><label>Nome do kit<input id="k-n" value="${esc(k.nome)}"></label><label><input type="checkbox" id="k-po" ${k.promoOn ? 'checked' : ''}> Promoção ativa</label>
 <label>Produto do kit<select id="k-i"><option value="">Escolher produto</option>${un.map(i => `<option value="${i.id}">${esc(i.nome)}</option>`).join('')}</select></label><div class="acts"><label>Quantidade<input id="k-q" type="number" value="1" style="width:80px"></label><button onclick="addK()">Adicionar ao kit</button></div></div>
 ${dk.map((c, j) => `<div class="row">${c.q}x ${esc((db.it.find(y => y.id == c.iid) || {}).nome)}<button class="del" onclick="dk.splice(${j},1);render()">✕</button></div>`).join('')}
 <div class="mut">Soma dos produtos: ${fmt(vs)} · custo: ${fmt(cs)} (kits só aceitam produtos por unidade)</div>
 <div class="g2"><label>Valor do kit (R$)<input id="k-p" type="number" step="any" value="${esc(k.preco ?? '')}"></label><label>Valor promocional do kit (R$)<input id="k-pr" type="number" step="any" value="${esc(k.promo ?? '')}"></label></div>
 <div class="acts"><button class="pri" onclick="saveK()">Salvar kit</button>${ek ? '<button onclick="ek=null;di={};render()">Cancelar</button>' : ''}</div></div>
 <div class="list">${db.kits.map(k => `<div class="item row"><div><b>${esc(k.nome)}</b> <span class="mut">${k.itens.length} produto(s) · ${fmt(k.preco)}${k.promoOn ? ' · promo ' + fmt(k.promo) : ''}</span></div><span class="acts"><button onclick="ek=${k.id};di={};render()">Editar</button><button class="del" onclick="if(confirm('Excluir kit?')){db.kits=db.kits.filter(x=>x.id!=${k.id});save();render()}">Excluir</button></span></div>`).join('') || '<div class="item mut">Nenhum kit cadastrado.</div>'}</div>`;
}
function addK() {
    const i = +$('#k-i').value, q = +$('#k-q').value || 1;
    if (!i)
        return;
    const n = $('#k-n').value, p = $('#k-p').value, pr = $('#k-pr').value, po = $('#k-po').checked;
    dk.push({ iid: i, q });
    render();
    $('#k-n').value = n;
    $('#k-p').value = p;
    $('#k-pr').value = pr;
    $('#k-po').checked = po;
}
function saveK() {
    const d = { nome: $('#k-n').value.trim(), itens: dk, preco: +$('#k-p').value || 0, promo: +$('#k-pr').value || 0, promoOn: $('#k-po').checked };
    if (!d.nome || !dk.length)
        return alert('Informe o nome e adicione produtos ao kit.');
    if (ek)
        Object.assign(db.kits.find(x => x.id == ek), d);
    else
        db.kits.push({ id: db.id++, ...d });
    ek = null;
    di = {};
    save();
    render();
}
/* ESTATÍSTICAS */
const wk = d => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return 'Sem. ' + dt(x.toLocaleDateString('sv')); };
function bars(m, sort) { const e = Object.entries(m).sort(sort ? (a, b) => b[0].localeCompare(a[0]) : (a, b) => b[1] - a[1]).slice(0, 12), mx = Math.max(1, ...e.map(x => Math.abs(x[1]))); return e.map(([k, x]) => `<div class="br"><span>${esc(est == 'mes' && sort ? k.split('-').reverse().join('/') : k)}</span><i style="width:${Math.abs(x) / mx * 100}%"></i><b>${fmt(x)}</b></div>`).join('') || '<div class="mut">Sem dados.</div>'; }
function vEst() {
    const v = db.orc.filter(o => !o.venda && (o.st == 'pago' || (o.st == 'executado' && paid(o) >= tot(o) - .005))), ds = o => o.pays.length ? o.pays[o.pays.length - 1].d : o.data, m = {}, ml = {}, mc = {}, mi = {}, mil = {}, mf = {};
    v.forEach(o => { const k = est == 'mes' ? ds(o).slice(0, 7) : est == 'dia' ? ds(o) : wk(ds(o)), L = lucro(o); m[k] = (m[k] || 0) + tot(o); ml[k] = (ml[k] || 0) + L; const n = (cli(o.cid) || { nome: '(sem cliente)' }).nome; mc[n] = (mc[n] || 0) + tot(o); o.it.forEach(r => { mi[r.d] = (mi[r.d] || 0) + r.t; mil[r.d] = (mil[r.d] || 0) + r.t - r.cu; }); });
    db.orc.filter(o => !o.est && !o.venda).forEach(o => o.pays.forEach(p => mf[p.f] = (mf[p.f] || 0) + p.v));
    const bd = (a, b) => {
        let n = 0, x = new Date(a + 'T12:00');
        const y = new Date(b + 'T12:00');
        while (x < y) {
            x.setDate(x.getDate() + 1);
            if (x.getDay() % 6)
                n++;
        }
        return n;
    }, pz = {};
    db.orc.forEach(o => {
        if (!o.conf)
            return;
        o.ln.forEach(l => {
            const t = l.tl[6];
            if (l.tl.length >= 7 && t && t.ts)
                (pz[l.d] = pz[l.d] || []).push([l.dd || 0, bd(o.conf, t.ts)]);
        });
    });
    const avg = (a, i) => a.reduce((x, y) => x + y[i], 0) / a.length;
    const T = v.reduce((a, o) => a + tot(o), 0), LT = v.reduce((a, o) => a + lucro(o), 0), ar = db.orc.filter(o => ['aprovado', 'executado'].includes(o.st)).reduce((a, o) => a + tot(o) - paid(o), 0), Q = db.orc.filter(o => !o.venda), ap = Q.filter(o => ['aprovado', 'executado', 'pago'].includes(o.st)).length;
    return vEstV() + `<div class="form"><div class="row"><b>Pedidos pagos</b><select style="width:auto" onchange="est=this.value;render()">${[['dia', 'Por dia'], ['sem', 'Por semana'], ['mes', 'Por mês']].map(([k, l]) => `<option value="${k}" ${est == k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${bars(m, 1)}<b>Lucro no período</b>${bars(ml, 1)}</div>
 <div class="g2"><div class="form"><b>Total vendido</b><br>${fmt(T)}<br><br><b>Lucro</b><br>${fmt(LT)} (${T ? Math.round(LT / T * 100) : 0}% de margem)<br><br><b>Ticket médio</b><br>${fmt(v.length ? T / v.length : 0)}</div><div class="form"><b>A receber</b><br>${fmt(ar)}<br><br><b>Taxa de aprovação</b><br>${ap} de ${Q.length} orçamentos (${Q.length ? Math.round(ap / Q.length * 100) : 0}%)</div></div>
 <div class="g2"><div class="form"><b>Vendas por cliente</b>${bars(mc)}</div><div class="form"><b>Vendas por produto</b>${bars(mi)}</div></div><div class="g2"><div class="form"><b>Lucro por produto</b>${bars(mil)}</div><div class="form"><b>Recebido por forma de pagamento</b>${bars(mf)}</div></div><div class="form"><b>Prazo previsto x real (dias úteis)</b>${Object.entries(pz).map(([k, a]) => `<div class="row"><span>${esc(k)}</span><span>previsto ${fm(avg(a, 0))} · real ${fm(avg(a, 1))} (${a.length} entrega(s))</span></div>`).join('') || '<div class="mut">Aparece depois das primeiras entregas registradas.</div>'}</div>`;
}
/* CONFIGURAÇÕES */
function vCfg() {
    const e = db.emp, F = [['nome', 'Nome da loja'], ['end', 'Endereço'], ['tel', 'Telefone / WhatsApp'], ['ig', 'Instagram'], ['cnpj', 'CNPJ (opcional)'], ['pix', 'Chave Pix'], ['titular', 'Titular do Pix']];
    return `<div class="form"><b>Dados da loja (aparecem no PDF)</b><div class="g2">${F.map(([k, l]) => `<label>${l}<input value="${esc(e[k])}" onchange="db.emp.${k}=this.value;save()"></label>`).join('')}</div>
 <label>Logo<input type="file" accept="image/*" onchange="logo(this.files[0])"></label>${e.logo ? `<img src="${e.logo}" style="max-height:60px"> <button onclick="delete db.emp.logo;save();render()">Remover logo</button>` : ''}</div>
 <div class="form" hidden><b>Parceiros de produção</b><div class="g2"><label>Nome<input id="pn"></label><label>E-mail<input id="pe"></label><label>Telefone<input id="pt"></label><label>Endereço<input id="pa"></label></div><button class="pri" onclick="addP()">Adicionar parceiro</button>
 ${db.par.map(p => `<div class="row">${esc(p.nome)} <span class="mut">${esc(p.email)} ${esc(p.tel)}</span><button class="del" onclick="db.par=db.par.filter(x=>x.id!=${p.id});save();render()">Excluir</button></div>`).join('')}</div>
 <div class="form"><b>Taxas de entrega</b><div class="g2"><label>Nome da taxa (ex.: Área 1)<input id="xn"></label><label>Valor cobrado do cliente (R$)<input id="xv" type="number" step="any"></label><label>Custo da entrega, o que você paga (R$)<input id="xc" type="number" step="any"></label></div><button class="pri" onclick="addX()">Adicionar taxa</button>
 ${db.tx.map(x => `<div class="row">${esc(x.nome)} · ${fmt(x.valor)} <span class="mut">custo ${fmt(x.custo)}</span><button class="del" onclick="db.tx=db.tx.filter(y=>y.id!=${x.id});save();render()">Excluir</button></div>`).join('')}</div>
 <div class="form"><b>Mensagens de status (use {nome}, {n}, {prev})</b>${ET.map((t, i) => `<label>${t}<textarea rows="2" onchange="db.msg[${i}]=this.value;save()">${esc(db.msg[i])}</textarea></label>`).join('')}</div>
 <div class="form"><b>Código dos produtos</b><label>Quantidade de dígitos do código automático (completa com zeros à esquerda; ex.: 4 gera 0001, 0002, 0003)<input type="number" min="0" max="12" value="${db.cfg.dig}" onchange="db.cfg.dig=Math.max(0,Math.min(12,parseInt(this.value)||0));save();render()"></label><div class="mut">Próximo código automático: <b>${esc(nextCod())}</b></div></div>
  <div class="form"><b>Markup padrão</b><label>Percentual de markup usado no cálculo automático do preço de venda (%)<input type="number" step="any" value="${db.cfg.markup || 0}" onchange="db.cfg.markup=Math.max(0,+this.value||0);save()"></label></div><div class="form"><b>Backup</b><p class="mut">Os dados ficam neste navegador (os PDFs das artes também). Baixe um backup com frequência.</p><div class="acts"><button class="pri" onclick="exp()">Baixar backup</button><button onclick="$('#imp').click()">Restaurar backup</button><input id="imp" type="file" accept=".json" hidden onchange="imp(this.files[0])"><button class="del" onclick="zerar()">Zerar tudo</button></div></div>`;
}
function addP() {
    if (!$('#pn').value.trim())
        return;
    db.par.push({ id: db.id++, nome: $('#pn').value, email: $('#pe').value, tel: $('#pt').value, end: $('#pa').value });
    save();
    render();
}
function addX() {
    if (!$('#xn').value.trim())
        return;
    db.tx.push({ id: db.id++, nome: $('#xn').value, valor: +$('#xv').value || 0, custo: +$('#xc').value || 0 });
    save();
    render();
}
function logo(f) {
    if (!f)
        return;
    const r = new FileReader();
    r.onload = () => { const i = new Image(); i.onload = () => { const s = Math.min(1, 400 / i.width), c = document.createElement('canvas'); c.width = i.width * s; c.height = i.height * s; c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); db.emp.logo = c.toDataURL('image/png'); save(); render(); }; i.src = r.result; };
    r.readAsDataURL(f);
}
async function exp() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...db, _files: await fall() })], { type: 'application/json' })); a.download = 'gestao-grafica-backup-' + hoje() + '.json'; a.click(); }
function imp(f) {
    if (!f)
        return;
    const r = new FileReader();
    r.onload = async () => {
        try {
            const d = JSON.parse(r.result);
            if (!d.orc || !d.cli)
                throw 0;
            if (!confirm('Substituir os dados atuais pelo backup?'))
                return;
            const fl = d._files || {};
            delete d._files;
            db = norm(d);
            save();
            await fclr();
            for (const k in fl)
                await fput(k, fl[k]);
            render();
        }
        catch (e) {
            alert('Arquivo de backup inválido.');
        }
    };
    r.readAsText(f);
}
async function zerar() {
    if (!confirm('Isso apaga TODOS os dados (clientes, produtos, pedidos, artes e configurações). Um backup será baixado antes. Continuar?'))
        return;
    if (prompt('Para confirmar, digite ZERAR:') !== 'ZERAR')
        return;
    await exp();
    localStorage.removeItem(K);
    await fclr();
    db = fresh();
    tab = 'ped';
    po = null;
    render();
}
/* CAMADA V3 — cadastros, catálogo, interface e regras de estoque revisadas */
function fullName(c) { return [c.empresa, c.nome, c.sobrenome].filter(Boolean).join(' ').trim() || c.nome || '(sem nome)'; }
function vVen() { const h = hoje(), dd = o => o.pays.length ? o.pays[o.pays.length - 1].d : o.data, l = db.orc.filter(o => o.venda && (vf == 'todas' || dd(o) == h || o.data == h)).sort((a, b) => b.n - a.n); return `<div class="row"><span class="acts"><button class="pri" onclick="openQ(null,true)">+ Nova venda</button><button onclick="openQ()">+ Novo orçamento</button></span><div class="acts"><button class="chip ${vf == 'hoje' ? 'on' : ''}" onclick="vf='hoje';render()">Hoje</button><button class="chip ${vf == 'todas' ? 'on' : ''}" onclick="vf='todas';render()">Todas</button></div></div><div class="list">${l.map(o => { const c = cli(o.cid); return `<div class="item s-${o.est ? 'arquivado' : o.st}"><div class="row"><b>Venda nº ${o.n} · ${esc(c ? fullName(c) : 'Consumidor')}</b><b>${fmt(tot(o))}</b></div><div class="mut">${dt(o.data)} · <span class="tag">${o.est ? 'Estornada' : ST[o.st]}</span> · ${o.it.map(r => { const x = db.it.find(z => z.id == r.iid); return esc(r.d) + (x && !x.semEstoque && x.estoque < 0 ? ' <span style="color:#a3281f;font-weight:bold">(estoque negativo)</span>' : ''); }).join(', ')}</div><div class="acts" style="margin-top:6px"><button onclick="openQ(${o.id})">${o.pays.length ? 'Abrir' : 'Abrir / Receber'}</button>${o.pays.length ? `<button onclick="recibo(get(${o.id}),${o.pays.length - 1})">Recibo</button>` : ''}${o.pays.length && !o.est ? `<button class="del" onclick="estornar(${o.id})">Estornar</button>` : ''}${!o.pays.length ? `<button class="del" onclick="delQ(${o.id})">Excluir</button>` : ''}</div></div>`; }).join('') || '<div class="item mut">Nenhuma venda neste período.</div>'}</div>`; }
function vCli() { const l = db.cli.filter(c => nz(fullName(c) + ' ' + (c.doc || '') + ' ' + (c.tel || '') + ' ' + (c.email || '')).includes(nz(clientSearch))).sort((a, b) => fullName(a).localeCompare(fullName(b))); return `<div class="pagehd"><h3>Clientes</h3><button class="pri" onclick="clientModal()">+ Novo cliente</button></div><div class="toolbar"><input placeholder="Buscar cliente..." value="${esc(clientSearch)}" oninput="clientSearch=this.value;render()"></div><div class="list">${l.map(c => `<div class="item"><div class="row"><div><b>${esc(fullName(c))}</b><div class="mut">${esc(c.doc || '')} · ${esc(c.tel || '')} ${c.whatsapp ? '· WhatsApp ' + esc(c.whatsapp) : ''} ${esc(c.email || '')}<br>${esc(c.end || '')}</div></div><span class="acts"><button onclick="hc=hc==${c.id}?null:${c.id};render()">Histórico</button>${c.end ? `<button onclick="mapa(${c.id})">Ver no mapa</button>` : ''}<button onclick="clientModal(${c.id})">Editar</button><button class="del" onclick="if(confirm('Excluir cliente?')){db.cli=db.cli.filter(x=>x.id!=${c.id});save();render()}">Excluir</button></span></div>${c.obs ? `<div class="mut">${esc(c.obs)}</div>` : ''}${hc == c.id ? db.orc.filter(o => o.cid == c.id).map(o => `<div class="mut">Nº ${o.n} · ${dt(o.data)} · ${ST[o.st]} · ${fmt(tot(o))}</div>`).join('') || '<div class="mut">Sem orçamentos.</div>' : ''}</div>`).join('') || '<div class="item mut">Nenhum cliente cadastrado.</div>'}</div>`; }
function clientModal(id) { const c = id ? cli(id) : {}; $('#dp').innerHTML = `<h3>${id ? 'Editar cliente' : 'Novo cliente'}</h3><div class="g2"><label>CPF/CNPJ<input id="cm-doc" value="${esc(c.doc || '')}"></label><label>Nome da Empresa (para CNPJ)<input id="cm-company" value="${esc(c.empresa || '')}"></label><label>Nome<input id="cm-name" value="${esc(c.nome || '')}"></label><label>Sobrenome<input id="cm-last" value="${esc(c.sobrenome || '')}"></label><label>Telefone<input id="cm-tel" value="${esc(c.tel || '')}"></label><label>WhatsApp<input id="cm-wa" value="${esc(c.whatsapp || '')}"></label><label>E-mail<input id="cm-email" value="${esc(c.email || '')}"></label><label>Endereço<input id="cm-end" value="${esc(c.end || '')}"></label></div><label>Observação<textarea id="cm-obs">${esc(c.obs || '')}</textarea></label><div class="acts" style="justify-content:flex-end"><button onclick="$('#dp').close()">Voltar</button><button onclick="$('#dp').close()">Fechar</button><button class="pri" onclick="saveClient(${id || 'null'})">Salvar</button></div>`; $('#dp').showModal(); }
function saveClient(id) {
    const d = { doc: $('#cm-doc').value.trim(), empresa: $('#cm-company').value.trim(), nome: $('#cm-name').value.trim(), sobrenome: $('#cm-last').value.trim(), tel: $('#cm-tel').value.trim(), whatsapp: $('#cm-wa').value.trim(), email: $('#cm-email').value.trim(), end: $('#cm-end').value.trim(), obs: $('#cm-obs').value.trim() };
    if (!d.nome && !d.empresa)
        return alert('Informe o nome ou a empresa.');
    if (id)
        Object.assign(cli(id), d);
    else
        db.cli.push({ id: db.id++, ...d });
    save();
    $('#dp').close();
    render();
}
function vIt() {
    if (productTab === 'kits')
        return `<div class="pagehd"><h3>Produtos</h3>${productTabs()}</div>` + vKit();
    if (productTab === 'forn')
        return vSuppliers();
    const categories = [...new Set(db.it.map(p => p.categoria).filter(Boolean))].sort();
    const subcategories = [...new Set(db.it.filter(p => !prodCat || p.categoria === prodCat).map(p => p.subcategoria).filter(Boolean))].sort();
    let products = db.it.filter(p => {
        const all = [p.cod, p.nome, p.categoria, p.subcategoria, p.marca, p.un, p.tipo, p.estoque, p.preco, p.pr].join(' ');
        const globalMatch = !prodSearch || nz(all).includes(nz(prodSearch));
        const columnMatch = !prodFilter || nz(p[prodFilter] ?? '').includes(nz(prodColumnValue));
        return (!prodCat || p.categoria === prodCat) && (!prodSub || p.subcategoria === prodSub) && globalMatch && columnMatch;
    });
    return `<div class="pagehd"><h3>Produtos</h3>${productTabs()}</div>
    <div class="toolbar"><button class="pri" onclick="productModal()">＋ Adicionar produto</button><input placeholder="Buscar por código, nome, marca ou categoria..." value="${esc(prodSearch)}" oninput="prodSearch=this.value;render()"><button onclick="productFilterPopup()">⏷ Filtros</button></div>
    <div class="catalog"><aside class="catnav"><b>Categorias</b><button class="${!prodCat ? 'on' : ''}" onclick="prodCat='';prodSub='';render()">Todas as categorias</button>${categories.map(c => `<button class="${prodCat === c && !prodSub ? 'on' : ''}" onclick="prodCat=${esc(JSON.stringify(c))};prodSub='';render()">▸ ${esc(c)}</button>${prodCat === c ? subcategories.map(s => `<button style="padding-left:20px" class="${prodSub === s ? 'on' : ''}" onclick="prodSub=${esc(JSON.stringify(s))};render()">↳ ${esc(s)}</button>`).join('') : ''}`).join('')}</aside>
    <div><div class="mut">${products.length} produto(s) encontrado(s)${prodFilter ? ` · filtro: ${esc(prodFilter)} = ${esc(prodColumnValue)}` : ''}</div><div class="gridlist"><table class="tb"><thead><tr><th>Código</th><th>Produto</th><th>Categoria</th><th>Subcategoria</th><th>Marca</th><th>Estoque</th><th>Unidade / venda</th><th>Preço</th><th>Ações</th></tr></thead><tbody>
    ${products.map(p => `<tr><td>${esc(p.cod || '')}</td><td><b>${esc(p.nome)}</b>${p.estoque < 0 && !p.semEstoque ? '<div class="tag negative">Estoque negativo</div>' : ''}</td><td>${esc(p.categoria || '')}</td><td>${esc(p.subcategoria || '')}</td><td>${esc(p.marca || '')}</td><td>${p.semEstoque ? 'Não usa estoque' : fm(p.estoque || 0)}</td><td>${esc(p.un || 'un')} / ${esc(p.tipoVenda || p.tipo || 'un')}</td><td>${fmt(p.preco || p.mp || p.lotes?.[0]?.t || 0)}${p.pr ? `<div class="mut">Promo: ${fmt(p.pr)}</div>` : ''}</td><td><span class="acts"><button onclick="productModal(${p.id})">Editar</button><button onclick="productModal(${p.id},true)">Duplicar</button><button class="del" onclick="if(confirm('Excluir produto?')){db.it=db.it.filter(x=>x.id!=${p.id});save();render()}">Excluir</button></span></td></tr>`).join('') || '<tr><td colspan="9">Nenhum produto encontrado.</td></tr>'}
    </tbody></table></div></div></div>`;
}
function productTabs() {
    return `<div class="tabs-inline"><button class="${productTab === 'prod' ? 'active' : ''}" onclick="productTab='prod';render()">Produtos</button><button class="${productTab === 'kits' ? 'active' : ''}" onclick="productTab='kits';render()">Kits</button><button class="${productTab === 'forn' ? 'active' : ''}" onclick="productTab='forn';render()">Fornecedores</button></div>`;
}
function productModal(id, duplicate) {
    const product = id ? JSON.parse(JSON.stringify(db.it.find(x => x.id == id) || {})) : {};
    if (duplicate) {
        product.id = null;
        product.cod = '';
    }
    productLotsDraft = (product.lotes || []).map(x => ({ ...x }));
    const categories = [...new Set(db.it.map(x => x.categoria).filter(Boolean))];
    const brands = [...new Set(db.it.map(x => x.marca).filter(Boolean))];
    $('#dp').innerHTML = `<h3>${id ? (duplicate ? 'Duplicar produto' : 'Editar produto') : 'Adicionar produto'}</h3>
    <div class="g2">
    <label>Código do produto<input id="pm-c" value="${esc(product.cod || '')}"></label>
    <label>Nome do produto<input id="pm-n" value="${esc(product.nome || '')}"></label>
    <label>Categoria<input id="pm-cat" list="pm-cats" value="${esc(product.categoria || '')}"><datalist id="pm-cats">${categories.map(x => `<option>${esc(x)}</option>`).join('')}</datalist></label>
    <label>Subcategoria<input id="pm-sub" value="${esc(product.subcategoria || '')}"></label>
    <label>Marca<input id="pm-brand" list="pm-brands" value="${esc(product.marca || '')}"><datalist id="pm-brands">${brands.map(x => `<option>${esc(x)}</option>`).join('')}</datalist></label>
    <label>Preço de venda (R$)<input id="pm-price" type="number" step="any" value="${product.tipo === 'm2' ? product.mp || '' : product.tipo === 'lote' ? product.lotes?.[0]?.t || '' : product.preco || ''}"></label>
    <label class="checkline"><input type="checkbox" id="pm-mark" ${product.markupOn ? 'checked' : ''} onchange="pmMarkup()"> Calcular pelo markup de Configurações (${db.cfg.markup || 0}%)</label>
    <label>Preço promocional (R$)<input id="pm-promo" type="number" step="any" value="${product.tipo === 'lote' ? product.lotes?.[0]?.pr || '' : product.pr || ''}"></label>
    <label>Preço de custo (R$)<input id="pm-cost" type="number" step="any" value="${product.tipo === 'm2' ? product.cm || '' : product.tipo === 'lote' ? product.lotes?.[0]?.c || '' : product.cp || ''}" oninput="pmMarkup()"></label>
    <label>Estoque<input id="pm-stock" type="number" step="any" value="${product.estoque || 0}"></label>
    <label class="checkline"><input type="checkbox" id="pm-nostock" ${product.semEstoque ? 'checked' : ''}> Não usa estoque</label>
    <label>Unidade de medida<input id="pm-unit" value="${esc(product.un || 'un')}"></label>
    <label>Tipo de venda<select id="pm-sale" onchange="pmSaleToggle()"><option value="un">Por unidade / quantidade</option><option value="m2" ${product.tipo === 'm2' ? 'selected' : ''}>Por m²</option><option value="lote" ${product.tipo === 'lote' ? 'selected' : ''}>Por lotes</option></select></label>
    <label>Tipo de produção<select id="pm-prod"><option value="local">Própria</option><option value="terc" ${product.prod === 'terc' ? 'selected' : ''}>Terceirizada</option></select></label>
    <label>Fornecedor<select id="pm-sup"><option value="">—</option>${db.par.map(p => `<option value="${p.id}" ${product.par == p.id ? 'selected' : ''}>${esc(p.empresa || p.nome)}</option>`).join('')}</select></label>
    <label>Prazo de produção (dias úteis)<input id="pm-days" type="number" min="0" value="${product.dias || 0}"></label>
    <label id="pm-mm-wrap">Metragem mínima (m²)<input id="pm-mm" type="number" step="any" value="${product.mm || 0}"></label>
    </div>
    <section id="pm-lot-section"><div class="row"><b>Faixas de lotes</b><button type="button" onclick="addProductLot()">＋ Adicionar faixa</button></div><div id="pm-lots"></div></section>
    <label>Observação<textarea id="pm-obs">${esc(product.obs || '')}</textarea></label>
    <div class="acts" style="justify-content:flex-end"><button onclick="$('#dp').close()">Voltar</button><button onclick="$('#dp').close()">Fechar</button><button class="pri" onclick="saveProduct(${id && !duplicate ? id : 'null'})">Salvar</button></div>`;
    pmSaleToggle();
    renderProductLots();
    $('#dp').showModal();
}
function pmSaleToggle() {
    const type = $('#pm-sale').value;
    $('#pm-lot-section').hidden = type !== 'lote';
    $('#pm-mm-wrap').hidden = type !== 'm2';
}
function renderProductLots() {
    const host = $('#pm-lots');
    if (!host)
        return;
    host.innerHTML = productLotsDraft.map((lot, index) => `<div class="lot-row">
      <label>Quantidade por lote<input type="number" min="1" value="${lot.q || ''}" onchange="productLotsDraft[${index}].q=+this.value"></label>
      <label>Preço de venda<input type="number" step="any" value="${lot.t || ''}" onchange="productLotsDraft[${index}].t=+this.value"></label>
      <label>Preço promocional<input type="number" step="any" value="${lot.pr || ''}" onchange="productLotsDraft[${index}].pr=+this.value"></label>
      <label>Preço de custo<input type="number" step="any" value="${lot.c || ''}" onchange="productLotsDraft[${index}].c=+this.value"></label>
      <label>Prazo (dias úteis)<input type="number" min="0" value="${lot.d || 0}" onchange="productLotsDraft[${index}].d=+this.value"></label>
      <button class="del" onclick="productLotsDraft.splice(${index},1);renderProductLots()">Remover</button>
    </div>`).join('') || '<p class="mut">Nenhuma faixa cadastrada. Adicione pelo menos uma faixa para vender por lotes.</p>';
}
function addProductLot() {
    productLotsDraft.push({ q: 1000, t: 0, pr: 0, c: 0, d: 0 });
    renderProductLots();
}
function pmMarkup() {
    if ($('#pm-mark').checked)
        $('#pm-price').value = ((+$('#pm-cost').value || 0) * (1 + (+db.cfg.markup || 0) / 100)).toFixed(2);
}
function saveProduct(id) {
    let code = $('#pm-c').value.trim();
    if (!code && id === null)
        code = nextCod();
    const duplicateCode = codDup(code, id);
    if (duplicateCode)
        return alert(`O código já está cadastrado no produto ${duplicateCode.nome}.`);
    const type = $('#pm-sale').value;
    const costPrice = +$('#pm-cost').value || 0;
    let salePrice = +$('#pm-price').value || 0;
    const markupOn = $('#pm-mark').checked;
    if (markupOn)
        salePrice = rnd(costPrice * (1 + (+db.cfg.markup || 0) / 100));
    const data = {
        cod: code, nome: $('#pm-n').value.trim(), categoria: $('#pm-cat').value.trim(),
        subcategoria: $('#pm-sub').value.trim(), marca: $('#pm-brand').value.trim(),
        preco: salePrice, pr: +$('#pm-promo').value || 0, cp: costPrice,
        estoque: +$('#pm-stock').value || 0, semEstoque: $('#pm-nostock').checked, stockModeVersion: 1,
        un: $('#pm-unit').value.trim() || 'un', tipo: type, tipoVenda: type,
        prod: $('#pm-prod').value, par: +$('#pm-sup').value || null,
        dias: +$('#pm-days').value || 0, obs: $('#pm-obs').value.trim(),
        promoOn: +$('#pm-promo').value > 0, markupOn
    };
    if (!data.nome)
        return $('#pm-n').focus();
    if (type === 'm2') {
        data.mp = salePrice;
        data.cm = costPrice;
        data.mm = +$('#pm-mm').value || 0;
    }
    else if (type === 'lote') {
        data.lotes = productLotsDraft.map(lot => {
            const c = +lot.c || 0;
            return { ...lot, q: +lot.q || 0, t: markupOn ? rnd(c * (1 + (+db.cfg.markup || 0) / 100)) : +lot.t || 0 };
        }).filter(lot => lot.q > 0);
        if (!data.lotes.length)
            return alert('Adicione pelo menos uma faixa de lote com quantidade válida.');
        data.preco = data.lotes[0].t;
        data.pr = data.lotes[0].pr || 0;
        data.cp = data.lotes[0].c || 0;
    }
    if (id) {
        const existing = db.it.find(x => x.id == id);
        Object.assign(existing, data);
        if (type !== 'lote')
            delete existing.lotes;
        if (type !== 'm2') {
            delete existing.mp;
            delete existing.cm;
            delete existing.mm;
        }
    }
    else
        db.it.push({ id: db.id++, ...data });
    save();
    $('#dp').close();
    render();
}
function productFilterPopup() {
    $('#dp').innerHTML = `<h3>Filtros de produtos</h3><label>Coluna<select id="pfc">${[['cod', 'Código'], ['nome', 'Nome'], ['categoria', 'Categoria'], ['subcategoria', 'Subcategoria'], ['marca', 'Marca'], ['estoque', 'Estoque'], ['un', 'Unidade'], ['tipo', 'Tipo de venda']].map(([v, l]) => `<option value="${v}" ${prodFilter === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Contém<input id="pfv" value="${esc(prodColumnValue)}" placeholder="Digite o valor do filtro"></label><div class="acts" style="justify-content:flex-end"><button onclick="prodFilter='';prodColumnValue='';$('#dp').close();render()">Limpar</button><button onclick="$('#dp').close()">Voltar</button><button class="pri" onclick="prodFilter=$('#pfc').value;prodColumnValue=$('#pfv').value;$('#dp').close();render()">Aplicar</button></div>`;
    $('#dp').showModal();
}
function vSuppliers() {
    const cols = [['tipoEmpresa', 'Tipo'], ['empresa', 'Empresa'], ['nomePessoa', 'Nome'], ['doc', 'CPF/CNPJ'], ['tel', 'Telefone'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['end', 'Endereço']];
    const list = db.par.filter(p => {
        const global = [p.tipoEmpresa, p.nome, p.empresa, p.nomePessoa, p.sobrenome, p.doc, p.email, p.tel, p.whatsapp, p.end].join(' ');
        const column = supplierFilterColumn ? (p[supplierFilterColumn] || '') : '';
        return (supplierType === 'todos' || (p.tipoEmpresa || 'Parceira') === supplierType) &&
            (!supplierSearch || nz(global).includes(nz(supplierSearch))) &&
            (!supplierFilterColumn || nz(column).includes(nz(supplierFilterValue)));
    });
    return `<div class="pagehd"><h3>Fornecedores</h3>${productTabs()}</div>
    <div class="toolbar"><button class="pri" onclick="supplierModal()">＋ Adicionar empresa</button><input placeholder="Buscar empresa, documento ou contato..." value="${esc(supplierSearch)}" oninput="supplierSearch=this.value;render()"><button onclick="supplierFilterPopup()">⏷ Filtros</button></div>
    <div class="acts supplier-types">${['todos', 'Fornecedor', 'Parceira', 'Transportadora', 'Entregadora'].map(t => `<button class="chip ${supplierType === t ? 'on' : ''}" onclick="supplierType='${t}';render()">${t === 'todos' ? 'Todos' : t}</button>`).join('')}</div>
    <div class="mut">${list.length} empresa(s) cadastrada(s)</div><div class="gridlist"><table class="tb"><thead><tr><th>Tipo</th><th>Empresa / Nome</th><th>CPF/CNPJ</th><th>Telefone / WhatsApp</th><th>E-mail</th><th>Endereço</th><th>Ações</th></tr></thead><tbody>
    ${list.map(p => `<tr><td>${esc(p.tipoEmpresa || 'Parceira')}</td><td><b>${esc(p.empresa || [p.nomePessoa || p.nome, p.sobrenome].filter(Boolean).join(' '))}</b></td><td>${esc(p.doc || '')}</td><td>${esc(p.tel || '')}${p.whatsapp ? `<div class="mut">${esc(p.whatsapp)}</div>` : ''}</td><td>${esc(p.email || '')}</td><td>${esc(p.end || '')}</td><td><span class="acts"><button onclick="supplierModal(${p.id})">Editar</button><button class="del" onclick="if(confirm('Excluir empresa?')){db.par=db.par.filter(x=>x.id!=${p.id});save();render()}">Excluir</button></span></td></tr>`).join('') || '<tr><td colspan="7">Nenhuma empresa encontrada.</td></tr>'}
    </tbody></table></div>`;
}
function supplierFilterPopup() {
    $('#dp').innerHTML = `<h3>Filtros de fornecedores</h3><label>Coluna<select id="sfc">${[['tipoEmpresa', 'Tipo'], ['empresa', 'Empresa'], ['nomePessoa', 'Nome'], ['doc', 'CPF/CNPJ'], ['tel', 'Telefone'], ['whatsapp', 'WhatsApp'], ['email', 'E-mail'], ['end', 'Endereço']].map(([v, l]) => `<option value="${v}" ${supplierFilterColumn === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Contém<input id="sfv" value="${esc(supplierFilterValue)}"></label><div class="acts" style="justify-content:flex-end"><button onclick="supplierFilterColumn='';supplierFilterValue='';$('#dp').close();render()">Limpar</button><button onclick="$('#dp').close()">Voltar</button><button class="pri" onclick="supplierFilterColumn=$('#sfc').value;supplierFilterValue=$('#sfv').value;$('#dp').close();render()">Aplicar</button></div>`;
    $('#dp').showModal();
}
function supplierModal(id) { const p = id ? db.par.find(x => x.id == id) : {}; $('#dp').innerHTML = `<h3>${id ? 'Editar empresa' : 'Nova empresa'}</h3><div class="g2"><label>Tipo de empresa<select id="sm-type">${['Fornecedor', 'Parceira', 'Transportadora', 'Entregadora'].map(x => `<option ${p.tipoEmpresa === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label>CPF/CNPJ<input id="sm-doc" value="${esc(p.doc || '')}"></label><label>Nome da Empresa (para CNPJ)<input id="sm-company" value="${esc(p.empresa || p.nome || '')}"></label><label>Nome<input id="sm-name" value="${esc(p.nomePessoa || '')}"></label><label>Sobrenome<input id="sm-last" value="${esc(p.sobrenome || '')}"></label><label>Telefone<input id="sm-tel" value="${esc(p.tel || '')}"></label><label>WhatsApp<input id="sm-wa" value="${esc(p.whatsapp || '')}"></label><label>E-mail<input id="sm-email" value="${esc(p.email || '')}"></label><label>Endereço<input id="sm-end" value="${esc(p.end || '')}"></label></div><label>Observação<textarea id="sm-obs">${esc(p.obs || '')}</textarea></label><div class="acts" style="justify-content:flex-end"><button onclick="$('#dp').close()">Voltar</button><button onclick="$('#dp').close()">Fechar</button><button class="pri" onclick="saveSupplier(${id || 'null'})">Salvar</button></div>`; $('#dp').showModal(); }
function saveSupplier(id) {
    const d = { tipoEmpresa: $('#sm-type').value, doc: $('#sm-doc').value.trim(), empresa: $('#sm-company').value.trim(), nome: $('#sm-company').value.trim() || $('#sm-name').value.trim(), nomePessoa: $('#sm-name').value.trim(), sobrenome: $('#sm-last').value.trim(), tel: $('#sm-tel').value.trim(), whatsapp: $('#sm-wa').value.trim(), email: $('#sm-email').value.trim(), end: $('#sm-end').value.trim(), obs: $('#sm-obs').value.trim() };
    if (!d.nome)
        return alert('Informe o nome da empresa ou pessoa.');
    if (id)
        Object.assign(db.par.find(x => x.id == id), d);
    else
        db.par.push({ id: db.id++, ...d });
    save();
    $('#dp').close();
    render();
}
// Cadastro rápido de cliente também passa a usar todos os campos e preserva seleção no orçamento/PDV.
function ncOpen(type) {
    ncT = type;
    ['doc', 'company', 'n', 'last', 't', 'wa', 'email', 'e', 'obs'].forEach(key => {
        const field = $('#nc-' + key);
        if (field)
            field.value = '';
    });
    $('#nc-dup').innerHTML = '';
    $('#dnc').dataset.mode = 'quick';
    $('#dnc').showModal();
    $('#nc-n').focus();
}
function fcq() { $('#dnc').close(); }
function useC(id) {
    if (ncT === 'v')
        $('#vp-c').innerHTML = vcliOpts(id);
    else
        $('#q-c').innerHTML = cliOpts(id);
    $('#dnc').close();
}
function dupCq() {
    const name = $('#nc-n').value.trim().toLowerCase();
    const phoneDigits = $('#nc-t').value.replace(/\\D/g, '');
    const matches = db.cli.filter(c => (name.length >= 2 && fullName(c).toLowerCase().includes(name)) ||
        (phoneDigits.length >= 6 && (c.tel || '').replace(/\\D/g, '').includes(phoneDigits))).slice(0, 4);
    $('#nc-dup').innerHTML = matches.length
        ? 'Já cadastrado? ' + matches.map(c => `<button type="button" onclick="useC(${c.id})">${esc(fullName(c))} · ${esc(c.tel || '')}</button>`).join(' ')
        : '';
}
function addCq() {
    const data = {
        doc: $('#nc-doc').value.trim(), empresa: $('#nc-company').value.trim(),
        nome: $('#nc-n').value.trim(), sobrenome: $('#nc-last').value.trim(),
        tel: $('#nc-t').value.trim(), whatsapp: $('#nc-wa').value.trim(),
        email: $('#nc-email').value.trim(), end: $('#nc-e').value.trim(),
        obs: $('#nc-obs').value.trim()
    };
    if (!data.nome && !data.empresa)
        return $('#nc-n').focus();
    const digits = data.tel.replace(/\\D/g, '');
    const duplicate = db.cli.find(c => (data.doc && c.doc && c.doc.replace(/\\D/g, '') === data.doc.replace(/\\D/g, '')) ||
        (digits.length >= 8 && (c.tel || '').replace(/\\D/g, '') === digits));
    if (duplicate && confirm(`Já existe ${fullName(duplicate)}. Deseja usar esse cadastro?`))
        return useC(duplicate.id);
    const client = { id: db.id++, ...data };
    db.cli.push(client);
    save();
    useC(client.id);
}
// Estoque: desconta uma única vez no primeiro pagamento/fechamento da venda; kits descontam seus componentes.
// Verifica falta de estoque considerando itens avulsos, m², lotes e componentes de kits.
function stockNeeds(items) {
    const needs = new Map();
    const add = (productId, amount) => {
        const product = db.it.find(p => p.id == productId);
        if (!product || product.semEstoque)
            return;
        const quantity = Math.max(0, +amount || 0);
        if (quantity)
            needs.set(product.id, (needs.get(product.id) || 0) + quantity);
    };
    for (const row of items || []) {
        const qty = Math.max(0, +row.q || 0);
        if (row.kid) {
            const kit = db.kits.find(k => k.id == row.kid);
            for (const component of kit?.itens || [])
                add(component.iid, qty * (+component.q || 0));
            continue;
        }
        const product = db.it.find(p => p.id == row.iid);
        if (!product)
            continue;
        let amount = qty;
        if (product.tipo === 'm2')
            amount = +row.ar || qty;
        else if (product.tipo === 'lote') {
            const lot = product.lotes?.[+row.lq || 0];
            amount = (+lot?.q || 0) * qty;
        }
        add(product.id, amount);
    }
    return needs;
}
function stockShortages(order) {
    const shortages = [];
    for (const [id, required] of stockNeeds(order.it)) {
        const product = db.it.find(p => p.id == id);
        const available = +product?.estoque || 0;
        if (available < required)
            shortages.push(`${product.nome} (saldo ${fm(available)}, necessário ${fm(required)})`);
    }
    return shortages;
}
function stockMoves(order, direction) {
    const needs = stockNeeds(order.it);
    for (const [id, amount] of needs) {
        const product = db.it.find(p => p.id == id);
        if (product)
            product.estoque = (+product.estoque || 0) + direction * amount;
    }
}
function vpGo() { vpGoBase(); }
function ppOk() {
    const shortages = stockShortages({ it: its });
    if (shortages.length && !confirm('Atenção: estoque insuficiente para:\n' + shortages.join('\n') + '\nA venda continuará e o estoque ficará negativo. Deseja concluir?'))
        return;
    const currentId = vsd && vsd.id;
    const previousIds = new Set(db.orc.map(order => order.id));
    const previousPayments = currentId ? (get(currentId)?.pays.length || 0) : 0;
    ppOkBase();
    const order = currentId ? get(currentId) : db.orc.find(item => !previousIds.has(item.id) && item.venda);
    if (order && order.pays?.length > previousPayments && !order.stockDone) {
        stockMoves(order, -1);
        order.stockDone = true;
        save();
        render();
    }
}
function pay(k) {
    const before = edit ? get(edit) : null, oldCount = before ? before.pays.length : 0;
    if (before && !before.venda && !before.stockDone && oldCount === 0) {
        const shortages = stockShortages(before);
        if (shortages.length && !confirm('Atenção: estoque insuficiente para:\n' + shortages.join('\n') + '\nDeseja confirmar o pedido mesmo assim?'))
            return;
    }
    payBase(k);
    if (before && !before.venda && !before.stockDone && before.pays.length > oldCount) {
        stockMoves(before, -1);
        before.stockDone = true;
        save();
        render();
    }
}
function estornar(id) {
    const order = get(id);
    if (!order || order.est)
        return;
    if (!confirm('Estornar esta venda ou pedido? O registro será mantido no histórico e o estoque será devolvido.'))
        return;
    if (order.stockDone) {
        stockMoves(order, 1);
        order.stockDone = false;
    }
    order.est = 1;
    order.st = 'arquivado';
    save();
    render();
}
// Produto cadastrado no PDV continua simples, mas recebe os campos novos e estoque sob demanda.
function npS() { npSBase(); save(); }
function vpS() {
    const q = $('#vp-s').value.trim(), b = $('#vp-r');
    if (!q) {
        b.hidden = true;
        return;
    }
    const l = vpFind(q);
    b.hidden = false;
    b.innerHTML = l.length ? l.map(x => { const warning = !x.isk && !x.semEstoque && (+x.estoque || 0) <= 0; return `<div class="item click" onclick="vpAdd('${x.isk ? 'k' : 'i'}',${x.id})"><div class="row"><b>${x.isk ? 'Kit: ' : (x.cod ? esc(x.cod) + ' · ' : '')}${esc(x.nome)}</b><span class="mut">${pinfo(x)}${warning ? ' · ⚠ sem estoque' : ''}</span></div></div>`; }).join('') : '<div class="item mut">Nenhum produto encontrado. Use o botão + para cadastrar.</div>';
}
{
    let g = null;
    try {
        g = localStorage.getItem('gg_nav');
    }
    catch (e) { }
    $('#tabs').classList.toggle('sm', g == null ? innerWidth <= 720 : g == '1');
}
render();
