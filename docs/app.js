import {
  cashWithBalances, getMachines as baseGetMachines, getVenue as baseGetVenue, initialState, newCashRecord, newSettlement,
  parseMoney, readState, records, rowAmounts, saveRecord, saveSettlementToBook, synchronize, totalsFor, venues as baseVenues, treasuryTotal,
  settlementDates, changeSettlementPeriod,
  deleteRecord, cashAmounts, treasuryBalance,
} from './data.js?v=20261114.6';
import { createManagement } from './management.js?v=20261114.6';
import { createSession } from './session.js?v=20261114.6';
import { createReports } from './reports.js?v=20261114.6';
import { createAdministrationTools } from './administration-tools.js?v=20261114.6';
import { createUserDetail } from './user-detail.js?v=20261114.6';
import { createWebLists } from './web-lists.js?v=20261115.3';
import { installCalendars } from './calendar.js?v=20261115.1';
import { createMachineDetail } from './machine-detail.js?v=20261114.6';
import { createWindowsEditorGrid, createWindowsListControls } from './windows-grid.js?v=20261114.6';

const app = document.querySelector('#app');
const status = document.querySelector('#status');
const editor = document.querySelector('#editor');
const utility = document.querySelector('#utility');
const storageKey = 'mpadmin-preview:data:v1';
const updateKey = 'mpadmin-preview:launcher:v1';
const previewVersion = '2.0.4';
const formatNumber = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 });
const formatCurrency = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' });
const number = value => Number.isFinite(value) ? formatNumber.format(value / 100) : '—';
const money = value => Number.isFinite(value) ? formatCurrency.format(value / 100) : '—';
const decimal = value => Number.isFinite(value) ? String(value / 100).replace('.', ',') : '';
const date = value => value.split('-').reverse().join('.');
const period = record => record.from === record.to ? date(record.from) : `${date(record.from)} – ${date(record.to)}`;
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const e = value => String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
const brandMark = size => `<svg width="${size}" height="${size}" aria-hidden="true" focusable="false"><use href="#preview-mark"/></svg>`;

const webPages = [
  ['venues', 'Provozovny'], ['machines', 'Autom.po dnech'], ['cash', 'Pok. kniha tisk'],
  ['monthly', 'Autom.měsíční'], ['overview', 'Multi přehledy'], ['safes', 'Trezory'], ['exports', 'Exporty'],
];
const venuePages = [
  ['info', 'Detail provozovny'], ['register', 'Autom.po dnech'], ['users', 'Uživatelé'],
  ['settlement', 'Denní vyúčtování'], ['cash', 'Pokladní kniha'], ['movements', 'Příjem Výdej'],
  ['safe', 'Trezor'], ['cashiers', 'Pokladníci'], ['overview', 'Přehled Multi'],
];
const venueColumns = [
  ['id', 'ID'], ['name', 'Název'], ['type', 'Typ'], ['street', 'Ulice'], ['town', 'Město'],
  ['postal', 'PSČ'], ['balance', 'Provozní hotovost'], ['lastDate', 'Poslední vyúčtování'], ['bookBalance', 'Zůstatek'], ['', 'Akce'],
];
const monthName = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const word = text => text.toLocaleLowerCase('cs-CZ').normalize('NFD').replace(/\p{Diacritic}/gu, '');

let state = initialState();
let venues = state.venues;
const getMachines = id => baseGetMachines(id, state);
const getVenue = id => baseGetVenue(id, state);
let persistent = true;
let replaceDamagedState = false;
let demoUpdated = false;
let mode = location.hash === '#windows' ? 'windows' : 'web';
let webVenue = venues[0].id;
let windowsVenue = venues[0].id;
let webView = 'venues';
let webDetail = 'info';
let webReport = '';
let windowsView = 'settlement';
let windowsOpen = false;
let windowsMinimized = false;
let windowsMaximized = true;
let windowsListBounds;
let mainMenuHidden = false;
let registerPage = 1;
let online = true;
let sending = false;
let filterVisible = false;
let venueFilter = '';
let venueAddressFilter='',venueTownFilter='',venueFilterTimer;
let venueSort = { key: 'id', descending: false };
let venuePage=1,venuePageSize=20;
let machineFilter = '';
let machinePeriod = '';
let draft;
let utilityWork;
let toastTimer;
const nativeWindows=new Map();
let activeNativeWindow, nativeWindowNumber=0, ignoredEditorClosures=0;
let nativeCloseContinuation;
let nativeWindowToResume;

function fitNativeEditor() {
  if(!editor.classList.contains('native-dialog')||!editor.open)return;
  const bounds=app.querySelector('.windows-workspace')?.getBoundingClientRect();if(!bounds)return;
  for(const [key,value] of Object.entries({left:bounds.left+1,top:bounds.top+1,width:bounds.width-2,height:bounds.height-2}))editor.style.setProperty(`--native-${key}`,`${value}px`);
}

function layoutWindowsList() {
  const child = app.querySelector('.restored-child > .child-window');
  if (!child || !windowsListBounds) return;
  const workspace = child.parentElement;
  const width = Math.min(windowsListBounds.width, workspace.clientWidth);
  const height = Math.min(windowsListBounds.height, workspace.clientHeight);
  child.style.width = `${width}px`;
  child.style.height = `${height}px`;
  child.style.left = `${Math.max(0,Math.min(windowsListBounds.left,workspace.clientWidth-width))}px`;
  child.style.top = `${Math.max(0,Math.min(windowsListBounds.top,workspace.clientHeight-height))}px`;
}
function parkNativeEditor() {
  if(!activeNativeWindow||!editor.open)return true;
  if(draft?.busy){notify('Počkejte na dokončení uložení.',true);return false;}
  if (!windowsEditorGrid.finish()) return false;
  closeBoundCashCount();
  const saved=nativeWindows.get(activeNativeWindow);
  saved.fragment=document.createDocumentFragment();while(editor.firstChild)saved.fragment.append(editor.firstChild);
  saved.draft=draft;saved.classes=editor.className;saved.styles=editor.style.cssText;
  ignoredEditorClosures++;editor.close();activeNativeWindow=undefined;draft=undefined;return true;
}
function activateNativeWindow(id) {
  if(id===activeNativeWindow){windowsEditorGrid.focusCurrent();return;}
  if(!parkNativeEditor())return;
  const saved=nativeWindows.get(id);if(!saved)return;
  saved.minimized = false;
  activeNativeWindow=id;draft=saved.draft;editor.className=saved.classes;editor.style.cssText=saved.styles;editor.replaceChildren(saved.fragment);editor.show();render();fitNativeEditor();
  windowsEditorGrid.focusCurrent();
}

function requestEditorClose(afterClose) {
  if(draft?.busy || draft?.source==='windows' && !windowsEditorGrid.finish())return;
  nativeCloseContinuation=afterClose;
  const saveButton=editor.querySelector('#editor-form [type="submit"]');
  if(draft?.source==='windows'&&saveButton&&!saveButton.disabled&&
      (hasUnsavedEditor(draft,editor)||draft.type==='settlement'&&draft.isNew)){
    const message=draft.type==='settlement'&&draft.isNew?'Přejete si uložit data do pokladní knihy?':'Přejete si uložit změny?';
    windowsPrompt('Uložit data', message, 'question',
      button('Ano','native-save-close',{kind:'soft'})+button('Ne','native-discard',{kind:'soft'}), 'native-save-close', {closeRequest:true});
  }else closeEditor();
}

function finishEditorClose() {
  draft=undefined;
  if(activeNativeWindow){nativeWindows.delete(activeNativeWindow);activeNativeWindow=undefined;render();}
  const continuation=nativeCloseContinuation;nativeCloseContinuation=undefined;if(continuation)queueMicrotask(continuation);
}
function closeEditor() {
  if(!editor.open)return;
  closeBoundCashCount();
  ignoredEditorClosures++;editor.close();finishEditorClose();
  if (mode === 'windows') windowsListControls.focus();
}

function closeNativeWindows(completed) {
  if(!parkNativeEditor())return;
  const next=()=>{
    if(!nativeWindows.size){windowsView='empty';render();completed?.();return;}
    activateNativeWindow(nativeWindows.keys().next().value);requestEditorClose(next);
  };
  next();
}

try {
  const remembered = localStorage.getItem(storageKey);
  if (remembered) {
    try { state = readState(remembered); }
    catch { replaceDamagedState = true; }
  }
  demoUpdated = localStorage.getItem(updateKey) === '1';
} catch {
  persistent = false;
}

function notify(message, error = false) {
  clearTimeout(toastTimer);
  status.textContent = message;
  status.classList.toggle('is-error', error);
  status.hidden = false;
  toastTimer = setTimeout(() => { status.hidden = true; }, error ? 8000 : 5200);
}

function dismissStatus() {
  clearTimeout(toastTimer);
  status.hidden = true;
}

function performWrite(operation, reset = false) {
  const commit = () => {
    let current = state;
    if (persistent && !reset && !replaceDamagedState) {
      const saved = localStorage.getItem(storageKey);
      if (saved) current = readState(saved);
    }
    const result = operation(current);
    if(result!==current&&result.administration?.archive[0]?.id!==current.administration?.archive[0]?.id&&result.administration?.archive[0])result.administration.archive[0].user=session.user()?.nick??'demo-operátor';
    if (persistent) {
      localStorage.setItem(storageKey, JSON.stringify(result));
      replaceDamagedState = false;
    }
    state = result;
  };
  if (persistent && navigator.locks) return navigator.locks.request(storageKey, commit);
  return Promise.resolve().then(commit);
}

function authorizeRecord(current,type,record,source) {
  const user=current.administration.users.find(user=>user.id===session.user()?.id&&!user.blocked);
  if(!user||user.role==='Náhled'||user.role!=='Admin'&&!session.user().venues.includes(record.venue))throw new Error('Uživatel nemá oprávnění k této provozovně. Zadané hodnoty zůstávají ve formuláři.');
  const settings=current.administration.applications[0];
  if(source==='windows'&&(settings?.blocked||settings?.[type]===false||settings?.venue&&settings.venue!==record.venue||!online&&settings?.offline===false))throw new Error('Aplikace nemá oprávnění k této činnosti. Zadané hodnoty zůstávají ve formuláři.');
}

function button(text, action, options = {}) {
  const { kind = '', data = {}, pressed, disabled = false, icon = '' } = options;
  const iconLabel = kind.includes('icon-only') || kind.startsWith('window-') ? ` aria-label="${e(text)}" title="${e(text)}"` : '';
  const overlay=action==='admin-import'?'<svg class="import-arrow" aria-hidden="true" focusable="false" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5 1.5v6m-2.5-2.5L5 7.5 7.5 5" stroke="#f6fbfc" stroke-width="3"/><path d="M5 1.5v6m-2.5-2.5L5 7.5 7.5 5" stroke="#1199b2" stroke-width="1.4"/></svg>':'';
  return `<button type="button" class="${e(kind)}" data-action="${e(action)}"${iconLabel}${Object.entries(data).map(([key, value]) => ` data-${key}="${e(value)}"`).join('')}${pressed === undefined ? '' : ` aria-pressed="${pressed}"`}${disabled ? ' disabled' : ''}>${icon ? `<span class="button-icon" aria-hidden="true">${e(icon)}</span>` : ''}<span class="button-label">${e(text)}</span>${overlay}</button>`;
}

function venueSelect(selected, id = 'venue-select') {
  return `<label class="venue-select">Provozovna <select id="${id}">${venues.map(venue => `<option value="${venue.id}"${venue.id === selected ? ' selected' : ''}>${e(venue.name)}</option>`).join('')}</select></label>`;
}

function table(headings, rows, options = {}) {
  const { label, numeric = [], empty = 'Žádné záznamy.', kind = '', totals = [], columnHeading = e } = options;
  const rowHtml = row => `<tr>${row.map((cell, i) => `<td${numeric.includes(i) ? ' class="numeric"' : ''}>${cell}</td>`).join('')}</tr>`;
  return `<div class="table-scroll ${kind}" tabindex="0" role="region" aria-label="${e(label)}"><table class="grid" aria-label="${e(label)}">
    <thead><tr>${headings.map((heading, i) => `<th scope="col"${numeric.includes(i) ? ' class="numeric"' : ''}>${columnHeading(heading, i)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map(rowHtml).join('') : `<tr><td class="empty" colspan="${headings.length}">${e(empty)}</td></tr>`}</tbody>${totals.length ? `<tfoot>${rowHtml(totals)}</tfoot>` : ''}</table></div>`;
}

function webNav() {
  const applications = session.canManage('all') ? [['users','Uživatelé'],['catalogs','Číselníky'],['archive','Archív činností'],['sms','SMS Brána'],['email','E-mail brána'],['applications','Instance aplikací']] : [];
  return `<div class="web-top"><div class="web-inner"><div class="web-account"><button type="button" data-action="logout" aria-label="Odhlásit"><span class="button-label">${e(session.user().nick)} (odhlásit)</span><span class="button-icon" aria-hidden="true">×</span></button></div><nav aria-label="Rychlé volby">
      ${button('Výčetka', 'calculator', { icon: '✥', data: { tool: 'cash' } })}<div class="menu-dropdown">${button('Aplikace','toggle-dropdown',{icon:'✥',data:{target:'applications-menu'}})}<div id="applications-menu" class="dropdown-items" hidden>${applications.map(([view,title])=>button(title,'web-page',{data:{view}})).join('')}</div></div>${button('Upozornění', 'web-page', { icon: '⚑',data:{view:'notifications'} })}${button('Můj účet', 'web-account', { icon: '♟' })}${button('Nápověda', 'help', { icon: '?' })}${button(mainMenuHidden ? 'Zobrazit menu' : 'Skrýt menu', 'toggle-menu', { icon: '↕', pressed: mainMenuHidden })}
    </nav></div></div>
    <div class="web-navigation"${mainMenuHidden ? ' hidden' : ''}><div class="web-inner"><nav aria-label="Menu MPAdminu">${webPages.map(([id, title]) => button(title, 'web-page', { data: { view: id }, pressed: webView === id || id === 'venues' && webView === 'detail' })).join('')}</nav><span class="web-wordmark" aria-hidden="true"></span></div></div>`;
}

function renderVenueResults() {
  const visibleVenues = venues.map((venue, i) => ({
    ...venue, ordinal: i + 1, balance: venue.cash, lastDate:records(state,'settlement',venue.id)[0]?.to??'',bookBalance:cashWithBalances(state,venue.id,false)[0]?.balance??venue.bookOpening??0,
  })).filter(venue => word(venue.name).includes(word(venueFilter.trim()))&&word(venue.street??'').includes(word(venueAddressFilter.trim()))&&word(venue.town??'').includes(word(venueTownFilter.trim())));
  const { key, descending } = venueSort;
  const sortKey = key === 'id' ? 'ordinal' : key;
  visibleVenues.sort((left, right) => {
    const a = left[sortKey];
    const b = right[sortKey];
    const order = typeof a === 'number' ? a - b : String(a??'').localeCompare(String(b??''), 'cs');
    return descending ? -order : order;
  });
  const pages=Math.max(1,Math.ceil(visibleVenues.length/venuePageSize));venuePage=Math.min(venuePage,pages);
  const rows = visibleVenues.slice((venuePage-1)*venuePageSize,venuePage*venuePageSize).map(venue => [
    venue.ordinal, button(venue.name, 'open-venue', { kind: 'text-action', data: { venue: venue.id } }),
    e(venue.type??'Herna'), e(venue.street), e(venue.town), e(venue.postal), button(number(venue.cash),'cash-history',{kind:'text-action underlined',data:{venue:venue.id}}),venue.lastDate?date(venue.lastDate):'',number(venue.bookBalance),
    button(`Otevřít ${venue.name}`, 'open-venue', { kind: 'row-icon icon-only', icon: '⌕', data: { venue: venue.id } })+(session.canManage('venue')?button('Upravit provozovnu','admin-edit',{kind:'row-icon icon-only',icon:'✎',data:{kind:'venue',id:venue.id,venue:venue.id}})+button('Smazat provozovnu','admin-delete',{kind:'row-icon icon-only',icon:'×',data:{kind:'venue',id:venue.id,venue:venue.id}}):''),
  ]);
  return `${table(venueColumns.map(([, label]) => label), rows, {
      label: 'Seznam provozoven', kind: 'venue-grid', numeric: [0,6,8], empty: 'Filtru neodpovídá žádná provozovna.',
      totals: ['', '', '', '', '', '', number(visibleVenues.reduce((sum, venue) => sum + venue.balance, 0)), '', number(visibleVenues.reduce((sum, venue) => sum + venue.bookBalance, 0)), ''],
      columnHeading: (label, i) => {
        const column = venueColumns[i][0];
        return column ? `<div class="original-sort"><span>${button('Vzestupně','sort-venues',{kind:'sort-arrow icon-only',icon:'↑',data:{view:column,direction:'asc'}})}${button('Sestupně','sort-venues',{kind:'sort-arrow icon-only',icon:'↓',data:{view:column,direction:'desc'}})}</span>${button(label,'sort-venues',{kind:'sort-label',data:{view:column,direction:column===key&&!descending?'desc':'asc'},pressed:column===key})}</div>` : e(label);
      },
    })}
    <div class="table-foot venue-foot"><select class="venue-limit" id="venue-page-size" aria-label="Řádků na stránku">${[20,50,100,500].map(size=>`<option${size===venuePageSize?' selected':''}>${size}</option>`).join('')}</select> Řádků na stránku &nbsp;|&nbsp; Celkem nalezeno ${visibleVenues.length} položek <nav class="venue-pagination" aria-label="Stránky provozoven">${button('‹ Předchozí','venue-page',{kind:'text-action',data:{page:venuePage-1},disabled:venuePage===1})} | ${venuePage} | ${button('Další ›','venue-page',{kind:'text-action',data:{page:venuePage+1},disabled:venuePage===pages})}</nav></div>`;
}

function renderVenues() {
  return `<h1 class="sr-only">Provozovny</h1>
    ${filterVisible ? `<form id="venue-filter" class="original-grid-filter"><label><span>Název:</span><input id="venue-term" name="name" type="search" value="${e(venueFilter)}"></label><label><span>Adresa:</span><input id="venue-address" name="address" value="${e(venueAddressFilter)}"></label><label><span>Město:</span><input id="venue-town" name="town" value="${e(venueTownFilter)}"></label><button class="sr-only" type="submit">Vyhledat</button></form>` : ''}
    <div class="toolbar venue-toolbar">${button('Vynulovat filtr', 'clear-venues', { kind: 'soft', icon: '×' })}${button(filterVisible ? 'Skrýt filtr' : 'Zobrazit filtr', 'toggle-filter', { kind: 'soft', icon: '☰', pressed: filterVisible })}</div>
    <div class="section-tools venue-list-tab"><span class="web-section-tab">Výpis</span><div class="list-actions">${session.canManage('venue')?button('Přidat provozovnu','admin-edit',{kind:'tool-icon icon-only add-icon',icon:'+',data:{kind:'venue'}}):''}${button('Export XLS','export-table',{kind:'tool-icon icon-only',icon:'XLS'})}</div></div>
    <div id="venue-results">${renderVenueResults()}</div>`;
}

function updateVenueResults() {
  clearTimeout(venueFilterTimer);
  venuePage = 1;
  app.querySelector('#venue-results').innerHTML = renderVenueResults();
}

function settlementList(venueId, windows) {
  if (windows) return nativeSettlementList(venueId);
  const entries = records(state, 'settlement', venueId, windows);
  const rows = entries.map((record, i) => {
    const sum = totalsFor(record);
    const devices=deviceTotals(record);
    return [record.revision ? entries.length - i : '–', e(getVenue(venueId).name),button(date(record.from), 'settlement-report', { kind: 'text-action', data: { id: record.id } }),date(record.to),
      ...['VLT','VHP','Ruleta'].map(type=>number(devices[type].yield)),number(sum.remittance),date((record.modifiedAt??record.to).slice(0,10)),e(record.modifiedBy??'demo-operátor'),
      editIcon('settlement', record.id)+deleteIcon('settlement',record)];
  });
  return `${listTools('Denní vyúčtování', 'settlement', windows,button('Měsíční přehled','detail-tab',{kind:'section-tab',data:{type:'settlement-monthly'}}))}
    ${table(['ID','Provozovna','Od','Do','VLT Tržba','VHP Tržba','Rul. Tržba','Tržba','Posl. změna','Změnil',''], rows, { label: 'Denní vyúčtování', numeric: [0,4,5,6,7] })}
    ${listFoot(entries.length)}`;
}

function settlementMonthly() {
  const rows=aggregate(false).map(group=>[button(monthName.format(new Date(`${group.month}-01T00:00:00Z`)),'settlement-report',{kind:'text-action',data:{id:`month:${group.month}`}}),number(group.money),number(group.output),number(group.yield),number(group.remittance)]);
  return `<div class="section-tools">${button('Denní vyúčtování','detail-tab',{kind:'section-tab',data:{type:'settlement'}})}<span class="web-section-tab">Měsíční přehled</span>${button('Export XLS','export-table',{kind:'tool-icon icon-only',icon:'XLS'})}</div>${table(['Měsíc','Peníze','Vyplaceno','Tržba','Celkem k odvodu'],rows,{label:'Měsíční vyúčtování',numeric:[1,2,3,4]})}`;
}

function renderSettlementReport() {
  const monthly=webReport.startsWith('month:');
  const entries=records(state,'settlement',webVenue).filter(record=>monthly?record.to.startsWith(webReport.slice(6)):record.id===webReport).reverse();
  if(!entries.length)return '<p>Vyúčtování není k dispozici.</p>';
  const sums={money:0,output:0,yield:0,income:0,expense:0,remittance:0};
  const device=Object.fromEntries(summaryTypes.map(type=>[type,{money:0,output:0,yield:0}]));
  const movements=new Map();const machines=new Map();
  for(const record of entries){
    const total=totalsFor(record);for(const key in sums)sums[key]+=total[key];
    const part=deviceTotals(record);for(const type of summaryTypes)for(const key of summaryAmounts)device[type][key]+=part[type][key];
    for(const row of [record.adjustments,...Object.values(record.additionalAdjustments??{})].flat()){
      const sum=movements.get(row.category)??{income:0,expense:0};sum.income+=row.income;sum.expense+=row.expense;movements.set(row.category,sum);
    }
    for(const row of record.rows){
      const machine=getMachines(webVenue).find(item=>item.id===row.machine);
      const group=machines.get(row.machine)??{machine,inStart:row.inStart,outStart:row.outStart,input:0,money:0,output:0,yield:0};
      const result=rowAmounts(row);for(const key of ['input','money','output','yield'])group[key]+=result[key];
      Object.assign(group,{inEnd:row.inEnd,outEnd:row.outEnd,note:row.note,note2:row.mechanicalOut??''});machines.set(row.machine,group);
    }
  }
  const title=monthly?monthName.format(new Date(`${webReport.slice(6)}-01T00:00:00Z`)):period(entries[0]);
  const deviceRows=summaryTypes.map(type=>[type,...summaryAmounts.map(key=>number(device[type][key]))]);
  const movementRows=[...movements].map(([name,row])=>[e(name),number(row.income),number(row.expense),number(row.income-row.expense)]);
  const machineRows=[...machines.values()].map(row=>[row.machine.order,e(row.machine.operator??'Demo provozovatel'),e(row.machine.type),row.machine.number,e(`${row.machine.model} ${row.machine.label}`),...['inStart','inEnd','input','money','outStart','outEnd','output','yield'].map(key=>number(row[key])),e(row.note),e(row.note2)]);
  return `<div class="section-tools">${button(monthly?'Měsíční přehled':'Denní vyúčtování','detail-tab',{kind:'section-tab',data:{type:monthly?'settlement-monthly':'settlement'}})}<span class="web-section-tab">Detail vyúčtování</span><div class="list-actions">${monthly?'':button('Upravit','edit-settlement',{kind:'soft',data:{id:webReport}})}${button('Export XLS','export-report',{kind:'tool-icon icon-only',icon:'XLS'})}${button('Tisk','print',{kind:'tool-icon icon-only',icon:'▤'})}</div></div><div class="settlement-report"><h2>Příjmy a výdaje za ${e(title)}</h2>
    ${table(['Zařízení','Příjmy','Výdaje','Tržba'],deviceRows,{label:'Vyúčtování podle zařízení',numeric:[1,2,3],totals:['Součet:',number(sums.money),number(sums.output),number(sums.yield)]})}
    ${table(['','Příjmy','Výdaje','Součet'],movementRows,{label:'Vyúčtování příjmů a výdajů',numeric:[1,2,3],totals:['Součet:',number(sums.income),number(sums.expense),number(sums.income-sums.expense)]})}
    <dl class="report-remittance"><dt>Příjmy provozovny:</dt><dd>${number(sums.money+sums.income-sums.expense)}</dd><dt>Výdaje provozovny:</dt><dd>${number(sums.output-sums.income+sums.expense)}</dd><dt>Celkem k odvodu:</dt><dd>${number(sums.remittance)}</dd></dl>
    <h2>Přehled</h2>${table(['ID','Provozovatel','Typ','Č.','Název','IN - Po.','IN - Ko.','Vhozeno','Peníze','OUT - Po.','OUT - Ko.','Vyplaceno','Výnos','Poznámka','Poznámka2'],machineRows,{label:'Přehled automatů vyúčtování',numeric:[0,3,5,6,7,8,9,10,11,12]})}</div>`;
}

function editIcon(type, id) {
  return button('Upravit záznam', `edit-${type}`, { kind: 'row-icon icon-only', icon: '✎', data: { id } });
}

function deleteIcon(type,record) {
  return session.canManage('all')?button('Smazat záznam','delete-record',{kind:'row-icon icon-only',icon:'×',data:{type,id:record.id,revision:record.revision}}):'';
}

function nativeSettlementList(venueId) {
  const entries = records(state, 'settlement', venueId, true);
  const types = ['VLT', 'VHP', 'Ruleta', 'Živá hra'];
  const rows = entries.map((record, index) => {
    const devices = deviceTotals(record);
    return ['', entries.length-index, e(getVenue(venueId).name),
      button(date(record.from), 'edit-settlement', {kind:'text-action',data:{id:record.id}}), date(record.to),
      ...types.flatMap(type=>['money','output','yield'].map(key=>`<span class="${devices[type][key]<0?'negative':''}">${number(devices[type][key])}</span>`))];
  });
  return nativeList('settlement', venueId, 'Denní vyúčtování', 'Přidat denní vyúčtování', entries, rows,
    ['', 'Local ID', 'Provozovna', 'OD', 'DO', ...types.flatMap(type=>['IN','OUT','Tržba'].map(key=>`${key} ${type==='Živá hra'?'Živá':type}`))]);
}

function nativeCashList(venueId) {
  const entries = cashWithBalances(state,venueId,true);
  const rows = entries.map((record,index)=>['',entries.length-index,
    button(date(record.date),'edit-cash',{kind:'text-action',data:{id:record.id}}),
    e(record.kind ?? (record.settlementId?'Odvod tržby':record.direction==='income'?'Příjem':'Výdaj')),
    e(record.description),number(cashAmounts(record).income),number(cashAmounts(record).expense),
    `<span class="${record.balance<0?'negative':''}">${number(record.balance)}</span>`]);
  return nativeList('cash', venueId, 'Pokladní kniha', 'Přidat záznam do pokladní knihy', entries, rows,
    ['', 'LocalId', 'Datum', 'Typ', 'Popis', 'Příjem', 'Výdej', 'Zůstatek']);
}

function nativeList(type, venueId, title, add, entries, rows, headings) {
  return `<div class="native-list-toolbar">${button(add,`new-${type}`,{kind:'soft'})}</div>
    <div class="table-scroll native-list native-${type==='cash'?'cash':'settlements'}" data-list-key="${type}/${e(venueId)}"><table class="grid" aria-label="${e(title)}">
    <thead><tr>${headings.map((heading,index)=>`<th scope="col"${index===0?' class="row-pointer" aria-hidden="true"':''}>${e(heading)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((row,index)=>`<tr data-record="${e(entries[index].id)}" data-type="${type}">${row.map((cell,i)=>`<td${i===0?' class="row-pointer" aria-hidden="true"':''}>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function listFoot(count) {
  return `<p class="table-foot">Celkem nalezeno ${count} položek</p>`;
}

function listTools(label, type, windows, extra = '') {
  const target = type === 'cash' ? 'Přidat záznam do pokladní knihy' : 'Přidat denní vyúčtování';
  return `<div class="section-tools"><span class="web-section-tab">${e(label)}</span>${extra}<div class="list-actions">
    ${button(target, `new-${type}`, windows ? { kind: 'soft' } : { kind: 'tool-icon icon-only add-icon', icon: '+' })}
    ${button('Export XLS', 'export', windows ? { kind: 'soft', data: { type,format:'xls' } } : { kind: 'tool-icon icon-only', icon: 'XLS', data: { type,format:'xls' } })}
    ${type === 'cash' ? button('Tisk', 'print', { kind: windows ? 'soft' : 'tool-icon icon-only', icon: windows ? '' : '▤' }) : ''}
    ${button('PDF','pdf-export',{kind:'tool-icon icon-only',icon:'PDF'})}
    </div></div>`;
}

function cashList(venueId, windows, movements = false, book = 'cash') {
  if (windows) return nativeCashList(venueId);
  const entries = cashWithBalances(state, venueId, windows, book);
  const rows = entries.map((record, i) => [entries.length - i, button(date(record.date), 'edit-cash', { kind: 'text-action', data: { id: record.id } }),
    e(record.kind??(record.direction === 'income' ? 'Příjem' : 'Výdaj')), e(record.description),
    number(cashAmounts(record).income),number(cashAmounts(record).expense),
    `<strong>${number(record.balance)}</strong>`,
    ...(windows ? [record.pending ? '<span class="pending">Čeká na odeslání</span>' : 'Přeneseno']
      : [date(record.date), 'demo-operátor', record.revision]),
    editIcon('cash', record.id)+deleteIcon('cash',record)]);
  const extras = !windows && webView === 'detail' ? button('Měsíční přehled', 'detail-tab', { kind: 'section-tab', data: { type: 'cash-monthly' } })+button('Manažerská kniha','detail-tab',{kind:'section-tab',data:{type:'cash-manager'}})+button('Manažerská kniha bezh.','detail-tab',{kind:'section-tab',data:{type:'cash-noncash'}})+button('Pokladní kniha','detail-tab',{kind:'section-tab',data:{type:'cash'}}) : '';
  const label = book==='manager'?'Manažerská kniha':book==='noncash'?'Manažerská kniha bezh.':'Pokladní kniha';
  return `${listTools(label, 'cash', windows, extras)}
    ${table(['ID', 'Datum', 'Typ', 'Popis', 'Příjem', 'Výdej', 'Zůstatek', ...(windows ? ['Stav'] : ['Poslední změna', 'Naposledy změnil', 'E']), ''], rows, { label, kind: 'cash-grid', numeric: [0, 4, 5, 6] })}
    <p class="table-foot">Stav pokladní knihy <strong>${money(entries[0]?.balance ?? getVenue(venueId).cash)}</strong></p>`;
}

function cashMonthly() {
  const groups = new Map();
  for (const entry of cashWithBalances(state, webVenue, false)) {
    const month = entry.date.slice(0, 7);
    if (!groups.has(month)) groups.set(month, { income: 0, expense: 0, balance: entry.balance });
    for(const key of ['income','expense'])groups.get(month)[key]+=cashAmounts(entry)[key];
  }
  const rows = [...groups].map(([month, group]) => [
    e(monthName.format(new Date(`${month}-01T00:00:00Z`))), number(group.income), number(group.expense), number(group.balance),
  ]);
  return `<div class="section-tools">${button('Pokladní kniha', 'detail-tab', { kind: 'section-tab', data: { type: 'cash' } })}<span class="web-section-tab">Měsíční přehled</span></div>
    ${table(['Měsíc', 'Příjmy', 'Výdaje', 'Zůstatek'], rows, { label: 'Měsíční přehled pokladní knihy', numeric: [1, 2, 3] })}`;
}

function machineRegister() {
  const venue = getVenue(webVenue);
  const machines = getMachines(webVenue).filter(machine=>!machine.deleted).slice().sort((a,b)=>a.order-b.order);
  const latest = records(state, 'settlement', webVenue)[0];
  const start = (registerPage - 1) * 20;
  const pages = Math.ceil(machines.length / 20);
  const rows = machines.slice(start, start + 20).map((machine, i) => {
    const row = latest?.rows.find(row=>row.machine===machine.id);
    return [machine.localId??getMachines(webVenue).indexOf(machine)+1, e(venue.name), e(machine.operator??'Demo provozovatel'), machine.order, machine.number, e(machine.label), e(machine.manufacturer??''),
      e(machine.model), e(machine.type), number(machine.counterAfter?machine.initialIn:row?.inEnd??machine.initialIn), number(machine.counterAfter?machine.initialOut:row?.outEnd??machine.initialOut), e(machine.note??row?.note ?? ''), machine.reset?'Ano':'Ne',
      button('Historie automatu','machine-history',{kind:'row-icon icon-only',icon:'⌕',data:{id:machine.id,venue:webVenue}})+button('Upravit automat','admin-edit',{kind:'row-icon icon-only',icon:'✎',data:{kind:'machine',id:machine.id,venue:webVenue}})+button('Smazat automat','admin-delete',{kind:'row-icon icon-only',icon:'×',data:{kind:'machine',id:machine.id,venue:webVenue}})];
  });
  return `<div class="section-tools"><span class="web-section-tab">Autom.po dnech</span><div class="list-actions">
    ${button('Přidání nového záznamu','admin-edit',{kind:'tool-icon icon-only add-icon',icon:'+',data:{kind:'machine',venue:webVenue}})}
    ${button('Hromadný import automatů','admin-import',{kind:'tool-icon icon-only',icon:'▦',data:{venue:webVenue}})}
    ${button('Export XLS', 'export', { kind: 'tool-icon icon-only', icon: 'XLS', data: { type: 'register',format:'xls' } })}
    </div></div>
    ${table(['ID', 'Provozovna', 'Provozovatel', 'Pořadí', 'Číslo', 'Název', 'Výrobce', 'Model', 'Typ', 'IN', 'OUT', 'Poznámka', 'Nulovat',''], rows, { label: 'Seznam automatů', kind: 'machine-register', numeric: [0, 3, 4, 9, 10] })}
    <nav class="table-foot pagination" aria-label="Stránky seznamu automatů">
      ${button('‹ Předchozí', 'register-page', { kind: 'text-action', data: { view: registerPage - 1 }, disabled: registerPage <= 1 })} |
      <span aria-current="page" tabindex="-1">${registerPage} / ${pages}</span> |
      ${button('Další ›', 'register-page', { kind: 'text-action', data: { view: registerPage + 1 }, disabled: registerPage >= pages })}
    </nav>`;
}

function safeTabs(){return `<div class="section-tools"><nav class="web-section-tabs">${button('Trezor','detail-tab',{data:{type:'safe'},pressed:webDetail==='safe'})}${button('Stav hotovosti','detail-tab',{data:{type:'safe-state'},pressed:webDetail==='safe-state'})}</nav></div>`;}
function renderSafes(venueId = null, stateView=false) {
  const rows = venues.filter(venue => !venueId || venueId === venue.id).map(venue => {
    const safe=treasuryBalance(state,venue.id),cash=cashWithBalances(state,venue.id,false)[0]?.balance??venue.bookOpening??0;
    return stateView?[button(venue.name,'safe-detail',{kind:'text-action',data:{venue:venue.id}}),number(cash),number(safe),number(safe-cash)]:[button(venue.name,'safe-detail',{kind:'text-action',data:{venue:venue.id}}),number(safe),number(cash)];
  });
  return `<div class="section-tools"><span class="web-section-tab">${stateView?'Stav hotovosti':'Trezory'}</span><div class="list-actions">${button('Export XLS','export-table',{kind:'tool-icon icon-only',icon:'XLS'})}</div></div>${table(stateView?['Provozovna','Kniha zůstatek','Trezor','nl_rozdil']:['Provozovna','Trezor','Kniha zůstatek'],rows,{label:stateView?'Stav hotovosti':'Trezory',numeric:[1,2,3]})}`;
}

function venueContent(venue) {
  switch (webDetail) {
    case 'register': return machineRegister();
    case 'settlement': return settlementList(webVenue, false);
    case 'settlement-monthly': return settlementMonthly();
    case 'settlement-report': return renderSettlementReport();
    case 'cash': return cashList(webVenue, false);
    case 'cash-manager': return cashList(webVenue,false,false,'manager');
    case 'cash-noncash': return cashList(webVenue,false,false,'noncash');
    case 'cash-monthly': return cashMonthly();
    case 'movements': return management.listing('adjustments',webVenue);
    case 'overview':case 'overview-cash':case 'overview-venues': return renderReport(false, true);
    case 'safe': return safeTabs()+management.listing('treasury',webVenue);
    case 'safe-state': return safeTabs()+renderSafes(null,true);
    case 'users':return management.listing('assignments',webVenue);
    case 'cashiers': {
      return management.listing(webDetail,webVenue);
    }
    default:
      return `<div class="section-tools"><span class="web-section-tab">Detail provozovny</span></div>${table(['Detail',''],[
        ['ID',venues.indexOf(venue)+1],['Název',e(venue.name)],['SMS Název',e(venue.smsName??'DEMO')],['Typ',e(venue.type??'Herna')],['Ulice',e(venue.street)],['Město',e(venue.town)],['PSČ',e(venue.postal)],['Provozní hotovost',button(number(venue.cash),'cash-history',{kind:'text-action',data:{venue:venue.id}})],['Poslední vyúčtování',records(state,'settlement',venue.id)[0]?.to?date(records(state,'settlement',venue.id)[0].to):''],['Zůstatek',number(cashWithBalances(state,venue.id,false)[0]?.balance??venue.bookOpening??0)],['Blokována',venue.blocked?'Ano':''],
      ],{label:'Údaje o provozovně',kind:'property-grid'})}`;
  }
}

function renderDetail() {
  const venue = getVenue(webVenue);
  const index = venues.indexOf(venue) + 1;
  return `<div class="venue-commands"><div>
    ${button('Přidej záznam do pokladní knihy', 'new-cash', { icon: '✚' })}
    ${button('Přidej denní vyúčtování', 'new-settlement', { kind: 'command-primary', icon: '✚' })}
    ${session.canManage('venue')?button('Upravit','admin-edit',{icon:'✎',data:{kind:'venue',id:venue.id,venue:venue.id}})+button('Smazat','admin-delete',{icon:'×',data:{kind:'venue',id:venue.id,venue:venue.id}}):''}
    </div></div>
    <p class="breadcrumb">${button('Úvodní stránka', 'web-page', { kind: 'text-action', data: { view: 'venues' } })} &gt; #${index} – ${e(venue.name)}</p>
    <div class="venue-layout"><aside class="venue-sidebar">
      <div class="arcade-art original-arcade" aria-hidden="true"></div>
      <nav aria-label="Detail provozovny">${venuePages.map(([type, title]) => button(title, 'detail-tab', { data: { type }, pressed: webDetail === type || ['cash','settlement'].includes(type) && webDetail.startsWith(type+'-') })).join('')}</nav>
    </aside><div class="venue-main">
    <div class="venue-heading"><h1>${webDetail==='settlement-report'?'Detail vyúčtování':'Detail provozovny'}</h1><aside class="venue-card"><div><img src="assets/temp_userprofilefoto.png" width="72" height="76" alt=""></div>
        <div><strong># ${index}<br>${e(venue.name)}</strong><p>${e(venue.street)}, ${e(venue.town)}</p></div>
      </aside></div>${venueContent(venue)}
    </div></div>`;
}

function machineReportData() {
  const entries = records(state, 'settlement', webVenue);
  const record = entries.find(item => item.id === machinePeriod) ?? entries[0];
  const term = word(machineFilter.trim());
  const machines = getMachines(webVenue).map(machine => ({ machine, row: record?.rows.find(row=>row.machine===machine.id) }))
    .filter(({ machine }) => word(`${machine.number} ${machine.label} ${machine.model} ${machine.type}`).includes(term));
  return { entries, record, machines };
}

function renderMachines() {
  const { entries, record, machines } = machineReportData();
  const rows = machines.map(({ machine, row }) => {
    const values = row && rowAmounts(row);
    return [machine.order, machine.number, e(machine.type), e(machine.model), e(machine.label), number(values?.input), number(values?.money), number(values?.output), number(values?.yield)];
  });
  return `<div class="page-title"><h1>Autom.po dnech</h1>${venueSelect(webVenue)}</div>
    <form class="filter-form" id="machine-filter"><label>Vyúčtování <select id="machine-period">${entries.map(item => `<option value="${e(item.id)}"${item.id === record?.id ? ' selected' : ''}>${period(item)}</option>`).join('')}</select></label><label>Stroj <input id="machine-term" type="search" maxlength="50" placeholder="Číslo nebo označení" value="${e(machineFilter)}"></label><button class="soft accent" type="submit">Vyhledat</button>${button('Export CSV', 'export', { kind: 'soft', data: { type: 'machines' } })}</form>
    ${table(['Pořadí', 'Číslo', 'Typ', 'Model', 'Označení', 'Vhozeno', 'Peníze', 'Vyplaceno', 'Výnos'], rows, { label: 'Automaty po dnech', numeric: [0, 1, 5, 6, 7, 8] })}
    <p class="table-foot">Počet strojů: ${machines.length}</p>`;
}

function aggregate(byVenue) {
  const groups = new Map();
  for (const record of records(state, 'settlement', byVenue ? null : webVenue)) {
    const month = record.to.slice(0, 7);
    const key = `${month}/${record.venue}`;
    const group = groups.get(key) ?? { month, venue: record.venue, count: 0, money: 0, output: 0, yield: 0, remittance: 0 };
    const total = totalsFor(record);
    group.count++;
    for (const field of ['money', 'output', 'yield', 'remittance']) group[field] += total[field];
    groups.set(key, group);
  }
  return [...groups.values()];
}

function renderReport(byVenue, insideDetail = false) {
  return byVenue || insideDetail ? renderMulti(insideDetail) : renderMachineMonthly();
}

function monthlyMachines() {
  const grouped=new Map();
  const machines=getMachines(webVenue);
  for(const record of records(state,'settlement',webVenue).slice().reverse())for(const row of record.rows){
    const machine=machines.find(item=>item.id===row.machine);
    if(!machine)continue;
    const month=record.to.slice(0,7);const key=`${month}/${machine.id}`;
    const group=grouped.get(key)??{month,machine,inStart:row.inStart,outStart:row.outStart,input:0,money:0,output:0,yield:0};
    const amounts=rowAmounts(row);for(const field of ['input','money','output','yield'])group[field]+=amounts[field];
    group.inEnd=row.inEnd;group.outEnd=row.outEnd;group.note=row.note;grouped.set(key,group);
  }
  return [...grouped.values()].filter(row=>word(`${row.machine.number} ${row.machine.label} ${row.machine.model} ${row.machine.type}`).includes(word(machineFilter)));
}

function renderMachineMonthly() {
  const rows=monthlyMachines().map(row=>[e(getVenue(webVenue).name),e(row.machine.label),e(row.machine.type),row.month,
    number(row.inStart),number(row.inEnd),number(row.outStart),number(row.outEnd),number(row.input),number(row.money),number(row.output),number(row.yield),e(row.note)]);
  return `<div class="page-title"><h1>Autom.měsíční</h1>${venueSelect(webVenue)}</div><form id="machine-filter" class="filter-form"><label>Automat <input type="search" id="machine-term" value="${e(machineFilter)}"></label><button class="soft" type="submit">Vyhledat</button>${button('Export XLS','export',{kind:'soft',data:{type:'monthly',format:'xls'}})}</form>${table(['Provozovna','Název','Typ','Měsíc','IN počátek','IN konec','OUT počátek','OUT konec','Vhozeno','Peníze','Vyplaceno','Výnos','Poznámka'],rows,{label:'Automaty měsíční přehled',numeric:[4,5,6,7,8,9,10,11]})}`;
}

function renderMulti(insideDetail=false) {
  const selected=venues.filter(venue=>!insideDetail||webDetail==='overview'||(webDetail==='overview-cash'?venue.type==='Pokladna':venue.type!=='Pokladna'));
  const rows=selected.map((venue,index)=>{
    const balance=book=>cashWithBalances(state,venue.id,false,book)[0]?.balance??(book==='cash'?venue.bookOpening??venue.cash:0);
    const cash=balance('cash'),manager=balance('manager'),noncash=balance('noncash');
    const safeAmount=treasuryBalance(state,venue.id);
    const last=records(state,'settlement',venue.id)[0]?.to;
    return insideDetail?[index+1,button(venue.name,'open-venue',{kind:'text-action',data:{venue:venue.id}}),e(venue.type??'Herna'),last?date(last):'',number(venue.cash),number(cash),number(manager)]:[index+1,button(venue.name,'open-venue',{kind:'text-action',data:{venue:venue.id}}),e(venue.type??'Herna'),number(venue.cash),last?date(last):'',number(cash),number(manager),number(cash+manager),number(safeAmount),number(safeAmount-cash-manager)];
  });
  const tabs=insideDetail?`<nav class="web-section-tabs">${[['overview','Přehled Multi'],['overview-cash','Pokladna'],['overview-venues','Provozovny']].map(([type,label])=>button(label,'detail-tab',{data:{type},pressed:webDetail===type})).join('')}</nav>`:'<span class="web-section-tab">Výpis</span>';
  return `<div class="section-tools">${tabs}<div class="list-actions">${button('Export XLS','export-table',{kind:'tool-icon icon-only',icon:'XLS'})}</div></div>${table(insideDetail?['ID','Název','Typ','Poslední vyúčtování','Provozní hotovost','Zůstatek','Man. Zůstatek']:['ID','Provozovna','Typ','Provozní hotovost','Posl. Vyúčt.','Zůstatek','Man. Zůstatek','Celkem','Trezor','Tr. Rozdíl'],rows,{label:'Multi přehledy',numeric:insideDetail?[0,4,5,6]:[0,3,5,6,7,8,9]})}`;
}

function renderWebContent() {
  switch (webView) {
    case 'detail': return renderDetail();
    case 'machine-detail': return machineDetail.view();
    case 'machines':case 'cash':case 'monthly':case 'overview':return webLists.view(webView);
    case 'safes': return management.listing('treasury');
    case 'user-detail': return userDetail.view();
    case 'users': case 'applications': case 'archive': case 'books': case 'notifications': return `<h1 class="sr-only">${({users:'Uživatelé',applications:'Instance aplikací',archive:'Archív činností',books:'Účetní knihy',notifications:'Upozornění'})[webView]}</h1>${management.listing(webView)}`;
    case 'exports': return reports.view();
    case 'catalogs': return administrationTools.catalogView();
    default: return renderVenues();
  }
}

function renderWindows() {
  if (!windowsOpen) return `<section class="launcher" aria-label="Spouštěč aplikace">
    <div class="window-caption">${brandMark(16)}<span>Vyúčtování a pokladna ${previewVersion}</span>${button('Zavřít spouštěč', 'mode', { kind: 'window-close', data: { mode: 'web' } })}</div>
    <div class="launcher-body">${brandMark(56)}<h1>Vyúčtování a pokladna</h1><p class="launcher-version">Verze ${previewVersion}</p>
      <p role="status" class="launcher-status">${demoUpdated ? 'Ukázková aktualizace je dokončena.' : 'Připraveno ke spuštění.'}</p>
      ${button('Spustit', 'start-windows', { kind: 'launcher-start' })}
      ${demoUpdated ? '' : `<p class="launcher-update">Je připravena aktualizace</p>${button('Aktualizace', 'demo-update', { kind: 'launcher-install' })}`}
      <div class="launcher-bottom">${button('Zavřít', 'mode', { kind: 'launcher-close', data: { mode: 'web' } })}</div>
    </div></section>`;

  const settings=state.administration.applications[0];
  if(settings?.blocked)return `<section class="windows-shell application-blocked"><div class="window-caption">Vyúčtování a pokladna</div><p>Tato instance aplikace je zakázaná.</p>${button('Zavřít','close-windows',{kind:'soft'})}</section>`;
  if(settings?.venue&&!venues.some(venue=>venue.id===settings.venue))return `<section class="windows-shell application-blocked"><div class="window-caption">Vyúčtování a pokladna</div><p>Aplikace je vázána na provozovnu, ke které uživatel nemá přístup.</p>${button('Změna uživatele','logout',{kind:'soft'})}</section>`;
  if(settings?.venue&&venues.some(venue=>venue.id===settings.venue))windowsVenue=settings.venue;
  const venue = getVenue(windowsVenue);
  const cash = venue.cash;
  const title = windowsView === 'cash' ? 'Pokladní kniha' : 'Výpis vyúčtování';
  const minimized = [...nativeWindows].filter(([,entry]) => entry.minimized);
  return `<section class="windows-shell" aria-label="Okno Vyúčtování a pokladna">
    <div class="window-caption">${brandMark(16)}<span>Vyúčtování a pokladna - ${e(venue.name)} - Provozní hotovost: ${money(cash)} - [${title}]</span>${button('Zavřít aplikaci', 'close-windows', { kind: 'window-close' })}</div>
    <nav class="windows-menu" aria-label="Menu Windows aplikace">
      ${brandMark(34)}
      ${button('Denní vyúčtování', 'windows-page', { data: { type: 'settlement' }, pressed: windowsView === 'settlement',disabled:settings?.settlement===false })}${button('Pokladní kniha', 'windows-page', { data: { type: 'cash' }, pressed: windowsView === 'cash',disabled:settings?.cash===false })}
      <div class="menu-dropdown">${button('Okno','toggle-dropdown',{data:{target:'native-windows-menu'}})}<div class="dropdown-items native-dropdown" id="native-windows-menu" hidden>${button('Zavřít okna','native-close-all')}${button('Výpis vyúčtování','windows-page',{data:{type:'settlement'},disabled:settings?.settlement===false})}${button('Pokladní kniha','windows-page',{data:{type:'cash'},disabled:settings?.cash===false})}${[...nativeWindows].map(([id,entry])=>button(entry.title,'native-activate',{data:{id},pressed:activeNativeWindow===id})).join('')}${button('Změna provozovny','windows-options',{disabled:!!settings?.venue})}${button('Změna uživatele','logout')}</div></div>${button('Výčetka', 'calculator', { data: { tool: 'cash' } })}${button('Kalkulačka', 'calculator', { data: { tool: 'basic' } })}
      ${button('Odeslat data na Server', 'synchronize', { kind: 'send' })}
    </nav>
    <div class="windows-workspace${windowsMaximized?'':' restored-child'}">${windowsView==='empty'||windowsMinimized?'':`<div class="child-window"><div class="window-caption child-caption">${brandMark(14)}<span>${title}</span>${button('Minimalizovat výpis','minimize-child',{kind:'window-minimize'})}${button(windowsMaximized?'Obnovit velikost výpisu':'Zvětšit výpis','maximize-child',{kind:'window-resize'})}${button('Zavřít výpis','windows-page',{kind:'window-close',data:{type:'empty'}})}</div>
      <div class="windows-document">${settings?.[windowsView]===false?'<p>Tato funkce je pro aplikaci zakázaná.</p>':windowsView === 'cash' ? cashList(windowsVenue, true) : settlementList(windowsVenue, true)}</div></div>`}
      ${windowsMinimized||minimized.length?`<div class="minimized-windows">${windowsMinimized&&windowsView!=='empty'?`<div class="window-caption">${brandMark(14)}${button(title,'restore-child',{kind:'minimized-title'})}${button('Zavřít výpis','windows-page',{kind:'window-close',data:{type:'empty'}})}</div>`:''}
      ${minimized.map(([id,entry])=>`<div class="window-caption">${brandMark(14)}${button(entry.title,'native-activate',{kind:'minimized-title',data:{id}})}${button('Zavřít minimalizované okno','native-close-minimized',{kind:'window-close',data:{id}})}</div>`).join('')}</div>`:''}
    </div>
    <footer class="windows-status"><span class="connection ${online ? 'online' : ''}">${online ? 'Připojeno v ukázce' : 'Bez připojení'}</span><span>Neodeslané záznamy: <strong>${state.queue.length}</strong></span>
      ${button(online ? 'Pracovat offline' : 'Obnovit připojení', 'toggle-online', { kind: 'soft', pressed: !online,disabled:online&&settings?.offline===false })}</footer>
    </section>`;
}

function render() {
  const user=session.user();
  venues = (state.venues ?? baseVenues).filter(venue=>user?.role==='Admin'||user?.venues.includes(venue.id));
  document.body.classList.toggle('windows-mode', mode === 'windows');
  for (const item of document.querySelectorAll('.mode-switch button')) item.setAttribute('aria-pressed', String(item.dataset.mode === mode));
  if(!user){app.innerHTML=session.loginForm(mode==='windows');return;}
  if(!session.canManage('all')&&['users','applications','archive','books','catalogs'].includes(webView))webView='venues';
  if(!venues.some(venue=>venue.id===webVenue)){webVenue=venues[0]?.id;webView='venues';}
  if(!venues.some(venue=>venue.id===windowsVenue))windowsVenue=venues[0]?.id;
  if(!venues.length){app.innerHTML=`<p class="storage-warning">Uživatel nemá přiřazenou provozovnu.</p>${button('Odhlásit','logout',{kind:'soft'})}`;return;}
  const renderWarning = !persistent
    ? '<p class="storage-warning">Úložiště není dostupné. Změny se uchovají jen do obnovení stránky.</p>'
    : replaceDamagedState ? '<p class="storage-warning">Uložená data ukázky se nepodařilo načíst. Zobrazují se výchozí ukázková data.</p>' : '';
  app.innerHTML = `${renderWarning}${mode === 'web' ? `<div class="web-viewport"><div class="web-desktop">${webNav()}<section class="web-content">${renderWebContent()}</section>${user.role==='Admin'?`<div class="server-status">Aktuální server: demo-lokální<br>${button('Zkouška druhého serveru','server-check')}</div>`:''}</div></div>` : renderWindows()}`;
  windowsListControls.initialize();
  const restoredList = app.querySelector('.restored-child > .child-window');
  if (restoredList) {
    addResizeHandles(restoredList);
    layoutWindowsList();
  }
  administrationTools.syncCatalogScroll();
  if(user.role==='Náhled')for(const button of app.querySelectorAll('[data-action="new-cash"],[data-action="new-settlement"]'))button.disabled=true;
  fitNativeEditor();
}

function modeHash(value) {
  return value === 'windows' ? '#windows' : '#web';
}

function editorValues(container) {
  return Array.from(container.querySelectorAll('#editor-form input, #editor-form select, #editor-form textarea'), field => field.value);
}

function hasUnsavedEditor(work, container) {
  if (!work) return false;
  if (work.busy) return true;
  const values = editorValues(container);
  return values.length !== work.originalValues.length || values.some((value, index) => value !== work.originalValues[index]);
}

function setMode(next, push = true) {
  if (next === mode) return true;
  if (draft?.busy) return false;
  const leavingWindow = mode === 'windows' ? activeNativeWindow : undefined;
  if (!parkNativeEditor()) return false;
  if (editor.open && hasUnsavedEditor(draft, editor)) {
    showEditorError('Před změnou rozhraní uložte nebo zavřete rozpracovaný záznam.');
    return false;
  }
  if (utility.open) utility.close();
  if (editor.open) closeEditor();
  dismissStatus();
  if (mode === 'windows') nativeWindowToResume = leavingWindow;
  mode = next;
  if (push && location.hash !== modeHash(next)) history.pushState(null, '', modeHash(next));
  if (mode === 'windows') {
    const savedWindow = nativeWindowToResume;
    nativeWindowToResume = undefined;
    if (windowsOpen && savedWindow && nativeWindows.has(savedWindow)) {
      activateNativeWindow(savedWindow);
      return true;
    }
  }
  render();
  return true;
}

function field(row, key, { label, column, kind = '', protect = false, value = row[key] } = {}) {
  const note = ['note','mechanicalOut'].includes(key);
  return `<input type="text" aria-label="${e(label)}" data-entry="${key}" data-column="${column}" class="${kind}" value="${e(note ? value : decimal(value))}" autocomplete="off" maxlength="${note ? 100 : 24}"${note ? '' : ' inputmode="decimal"'}${protect ? ' readonly' : ''}>`;
}

function output(key, value, extra = '') {
  return `<output class="cell-result${extra ? ` ${extra}` : ''}" data-output="${key}">${number(value)}</output>`;
}

function machineEditor(record) {
  const windows = mode === 'windows';
  const machines = getMachines(record.venue);
  const rows = record.rows.map((row, i) => {
    const machine = machines.find(item => item.id === row.machine);
    const label = `Stroj ${machine.number}`;
    const amounts = rowAmounts(row);
    return `<tr data-row="${i}" data-group="machine">
      ${windows ? '<td class="row-pointer" aria-hidden="true"></td>' : ''}<td class="machine-number machine-id">${machine.number??''}</td><td class="machine-id">${e(windows?machine.type:({VLT:'vlt',VHP:'vhp',Ruleta:'rul',Poker:'pok',AMR:'amr','B.Jack':'b.j','Živá hra':'živá'})[machine.type])}</td><td class="machine-id">${e(machine.model)}</td><th scope="row" class="machine-id">${e(machine.label)}</th>
      <td>${field(row, 'inStart', { label: `${label}, Počátek IN`, column: 0, protect: true, kind: 'start' })}</td>
      <td>${field(row, 'inEnd', { label: `${label}, Konec IN`, column: 1, kind: 'end' })}</td><td>${output('input', amounts.input)}</td>
      <td>${field(row, 'money', { label: `${label}, Peníze`, column: 2, value: amounts.money })}</td><td>${output('difference', amounts.difference, amounts.difference < 0 ? 'negative' : '')}</td>
      <td>${field(row, 'outStart', { label: `${label}, Počátek OUT`, column: 3, protect: true, kind: 'start' })}</td>
      <td>${field(row, 'outEnd', { label: `${label}, Konec OUT`, column: 4, kind: 'end' })}</td><td>${output('output', amounts.output)}</td><td>${output('yield', amounts.yield)}</td>
      <td>${field(row, 'note', { label: `${label}, ${windows?'Mechanika IN':'Poznámka'}`, column: 5, kind: 'note' })}</td>
      ${windows ? `<td>${field(row, 'mechanicalOut', { label: `${label}, Mechanika OUT`, column: 6, kind: 'note', value:typeof row.mechanicalOut==='number'?decimal(row.mechanicalOut):row.mechanicalOut??'' })}</td>` : ''}</tr>`;
  }).join('');

  const names = windows
    ? ['', 'Číslo', 'Typ', 'Model', 'Označení', 'IN Poč.', 'IN Kon.', 'Vhozeno', 'Peníze', 'Rozdíl', 'OUT Poč.', 'OUT Kon.', 'Vyplaceno', 'Výnos', 'Mechanika IN', 'Mechanika OUT']
    : ['č.', 'typ', 'Model', 'Označení', 'Počátek', 'Konec', 'Vhozeno', 'Peníze', 'Rozdíl', 'Počátek', 'Konec', 'Vyplaceno'];
  const widths = windows
    ? [[41, 52, 50, 100, 100, 80, 80, 60, 60, 60, 80, 80, 60, 60, 100, 100]]
    : [[66, 66, 138, 134], [98, 98, 98, 98, 98], [98, 98, 98], [98], [168]];
  const groups = windows ? '' : '<tr class="grid-groups"><th scope="colgroup" colspan="4">Označení</th><th scope="colgroup" colspan="5">Vhozeno - IN</th><th scope="colgroup" colspan="3">Vyplaceno - OUT</th><th scope="col" rowspan="2">Výnos</th><th scope="col" rowspan="2">Poznámka</th></tr>';
  return `<div class="table-scroll edit-scroll"${windows?'':' tabindex="0"'} role="region" aria-label="Čítače automatů"><table class="edit-grid machine-editor${windows?' native-edit-grid':''}" aria-label="Čítače automatů"${windows?' role="grid"':''}>
    ${widths.map(group => `<colgroup>${group.map(width => `<col width="${width}">`).join('')}</colgroup>`).join('')}
    <thead>${groups}<tr>${names.map((name,index) => `<th scope="col"${windows&&index===0?' class="row-pointer" aria-hidden="true"':''}>${name}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function adjustmentEditor(record) {
  const days = settlementDates(record);
  const windows = mode === 'windows';
  const rows = record.adjustments.map((category, i) => `<tr data-row="${i}" data-group="adjustment">${windows?'<td class="row-pointer" aria-hidden="true"></td>':''}<th scope="row"${windows?' class="frozen-column"':''}>${e(category.category)}</th>${days.map((day,offset)=>{
    const row = offset === 0 ? record.adjustments[i] : record.additionalAdjustments?.[day]?.[i] ?? {category:category.category,income:0,expense:0,note:''};
    const label = days.length>1 ? `${row.category}, ${date(day)}` : row.category;
    return `<td data-day="${day}">${field(row,'income',{label:`${label}, Příjem`,column:offset*3})}</td><td data-day="${day}">${field(row,'expense',{label:`${label}, Výdaj`,column:offset*3+1})}</td><td data-day="${day}">${output('total',row.income-row.expense)}</td><td data-day="${day}">${field(row,'note',{label:`${label}, Poznámka`,column:offset*3+2,kind:'note'})}</td>`;
  }).join('')}</tr>`).join('');
  const headings = ['Název',...days.flatMap(day=>['Příjem','Výdej','Součet','Poznámka'].map(label=>`${label}${mode==='windows'||days.length>1?' '+Number(day.slice(8))+'.'+Number(day.slice(5,7)):''}`))];
  return `<div class="table-scroll edit-scroll"${windows?'':' tabindex="0"'} role="region" aria-label="Příjmy a výdaje provozovny"><table class="edit-grid adjustments${windows?' native-edit-grid':''}" aria-label="Příjmy a výdaje provozovny"${windows?' role="grid"':''}>
    ${windows?`<colgroup><col width="41"><col width="160">${days.map(()=>'<col width="60"><col width="60"><col width="60"><col width="100">').join('')}</colgroup>`:''}<thead><tr>
    ${windows?'<th scope="col" class="row-pointer" aria-hidden="true"></th>':''}${headings.map((text,index) => `<th scope="col"${windows&&index===0?' class="frozen-column"':''}>${text}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function editorHeading(title) {
  return `<header class="dialog-title">${mode === 'windows' ? brandMark(16) : ''}<h2 id="editor-title">${e(title)}</h2><div>${button(mode==='windows'?'Obnovit velikost':'Zvětšit okno', 'maximize-editor', { kind: 'window-resize' })}${button('Zavřít', 'close-editor', { kind: 'window-close' })}</div></header>`;
}

const summaryTypes = ['VHP', 'VLT', 'Ruleta', 'Živá hra'];
const summaryAmounts = ['money', 'output', 'yield'];

function deviceTotals(record) {
  const sums = Object.fromEntries(summaryTypes.map(type => [type, { money: 0, output: 0, yield: 0 }]));
  const machines = getMachines(record.venue);
  record.rows.forEach((row, index) => {
    const result = rowAmounts(row);
    const type = machines.find(machine => machine.id === row.machine).type;
    const sum = sums[type] ?? sums['Živá hra'];
    for (const key of summaryAmounts) sum[key] += result[key];
  });
  return sums;
}

function editorSummary(record, windows) {
  const totals = totalsFor(record);
  const devices = deviceTotals(record);
  const columns = '<th>Příjmy</th><th>Výdaje</th><th>Tržba</th>';
  const windowsColumns = windows ? '<colgroup><col class="summary-label"><col span="3" class="summary-value"></colgroup>' : '';
  return `<div class="summary-panel">
      <table class="summary" id="machine-summary" aria-label="Souhrn podle zařízení">${windowsColumns}<thead><tr><th>${windows ? '' : 'Zařízení'}</th>${columns}</tr></thead><tbody>
        ${summaryTypes.map(type => `<tr><th scope="row">${windows&&type==='Živá hra'?'Živá':type}</th>${summaryAmounts.map(key => `<td data-device="${type}" data-total="${key}">${number(devices[type][key])}</td>`).join('')}</tr>`).join('')}
        <tr class="summary-total"><th scope="row">Součet</th>${summaryAmounts.map(key => `<td data-total="${key}">${number(totals[key])}</td>`).join('')}</tr>
      </tbody></table>
      <table class="summary" id="adjustment-summary" aria-label="Souhrn příjmů a výdajů" hidden>${windowsColumns}<thead><tr><th>${windows?'':'Položka'}</th>${columns}</tr></thead><tbody>
        <tr class="summary-total"><th scope="row">Součet</th>${summaryAmounts.map(key => `<td data-total="${key}">${number(totals[key])}</td>`).join('')}</tr>
        <tr class="summary-expense"><th scope="row" colspan="3">Výdaje provozovny</th><td data-total="expense">${number(totals.expense)}</td></tr>
        <tr class="summary-income"><th scope="row" colspan="3">Příjmy provozovny</th><td data-total="income">${number(totals.income)}</td></tr>
        <tr class="summary-remit"><th scope="row" colspan="3">Celkem k odvodu</th><td data-total="remittance" data-testid="remittance">${number(totals.remittance)}</td></tr>
      </tbody></table></div>`;
}

function cashForm(record, venue, windows) {
  const amount = direction => cashAmounts(record)[direction] ? decimal(cashAmounts(record)[direction]) : '';
  const kinds=[...new Set(['Příjem','Výdaj',...state.administration.catalogs['Kniha pohyb'],...state.administration.catalogs['Příjem výdej'],'Odvod tržby','Příjmy provozovny','Tržba AMR','Tržba Black Jack','Tržba Poker','Tržba Ruleta','Tržba VHP','Tržba VLT','Výdaje provozovny',record.kind].filter(Boolean))];
  const title = record.revision || record.pending ? 'Uprav záznam v pokladní knize' : 'Přidej záznam do pokladní knihy';
  const save = '<footer class="dialog-actions"><button type="submit" class="soft">Uložit</button></footer>';
  if(!windows&&webView==='overview')return `${editorHeading('Přidej záznam do knihy')}<form id="editor-form" class="original-form"><label><span>Provozovna:</span><select id="cash-venue">${venues.map(v=>`<option value="${e(v.id)}"${v.id===venue.id?' selected':''}>${e(v.name)}</option>`).join('')}</select></label><label><span>Kniha:</span><select id="cash-book">${[['cash','Pokladní kniha'],['manager','Man. kniha'],['noncash','Man. BezHot. kniha']].map(([id,name])=>`<option value="${id}"${record.book===id?' selected':''}>${name}</option>`).join('')}</select></label><label><span>Typ:</span><select id="cash-direction">${kinds.map(kind=>`<option>${e(kind)}</option>`).join('')}</select></label><label><span>Datum:</span><input id="cash-date" type="date" value="${e(record.date)}" required></label><label><span>Příjem:</span><input id="cash-income" inputmode="decimal" value="${amount('income')}"></label><label><span>Výdej:</span><input id="cash-expense" inputmode="decimal" value="${amount('expense')}"></label><label><span>Text:</span><input id="cash-description" maxlength="100" value="${e(record.description)}"></label><p id="editor-error" class="form-error" hidden role="alert"></p><footer class="dialog-actions"><button type="submit" class="soft">Ulož</button></footer></form>`;
  return `${editorHeading(windows ? 'Kniha záznam' : title)}
    <form id="editor-form" class="dialog-form"><div class="cash-content">
      <fieldset class="cash-fields" aria-label="Údaje záznamu">${windows ? '' : `<label class="cash-venue"><span>Provozovna</span><select id="cash-venue">${venues.map(v=>`<option value="${e(v.id)}"${v.id===venue.id?' selected':''}>${e(v.name)}</option>`).join('')}</select></label>`}
        <label>Datum <input type="date" id="cash-date" required value="${e(record.date)}"></label>
        <label><span id="cash-type-label">Typ</span><select id="cash-direction" aria-labelledby="cash-type-label">${kinds.map(kind=>`<option value="${kind==='Příjem'?'income':kind==='Výdaj'?'expense':e(kind)}"${kind===(record.kind??(record.direction==='income'?'Příjem':'Výdaj'))?' selected':''}>${e(kind)}</option>`).join('')}</select></label>
        <label>Popis <input type="text" id="cash-description" required maxlength="100" autocomplete="off" value="${e(record.description)}"></label>
        <label>Příjmy <input type="text" id="cash-income" inputmode="decimal" maxlength="24" autocomplete="off" value="${amount('income')}"></label>
        <label>Výdaje <input type="text" id="cash-expense" inputmode="decimal" maxlength="24" autocomplete="off" value="${amount('expense')}"></label>
        ${windows ? save : ''}
      </fieldset>
      <p id="editor-error" class="form-error" role="alert" hidden></p>
      ${windows ? '' : save}
    </div></form>`;
}

function settlementForm(record, venue, windows) {
  const dates = `<label><span>Od:</span><input aria-label="Datum Od" id="date-from" type="date" lang="cs" required value="${e(record.from)}"></label>
    <label><span>Do:</span><input aria-label="Datum Do" id="date-to" type="date" lang="cs" required value="${e(record.to)}"></label>`;
  const tabs = `<nav class="editor-tabs" aria-label="Část vyúčtování">${button('Automaty', 'settlement-tab', { data: { view: 'machines' }, pressed: true })}${button(windows?'Příjmy a Výdaje':'Příjmy a výdaje', 'settlement-tab', { data: { view: 'adjustments' }, pressed: false })}</nav>`;
  const error = '<p id="editor-error" class="form-error" role="alert" hidden></p>';
  const save = `<button type="submit" class="soft accent">${windows ? 'Uložit změny' : 'Uložit'}</button>`;

  return `${editorHeading(windows ? 'Denní vyúčtování' : `Vyúčtování - ${venue.name}`)}
    <form id="editor-form" class="dialog-form">${windows ? '' : tabs}
      <div class="dialog-scroll settlement-scroll">
        <div class="settlement-header">
          <div class="settlement-controls">
            ${windows ? `<fieldset class="settlement-dates"><legend>Datum Od - Do</legend>${dates}</fieldset>
              <div class="native-save">${record.revision||record.pending?save:'<button type="submit" value="book" class="soft">Uložit do pokladní knihy</button>'}</div>`
              : `<div class="settlement-dates">${dates}${button('Výčetka', 'calculator', { kind: 'tool-icon icon-only', icon: '▦', data: { tool: 'cash' } })}</div>`}
          </div>${editorSummary(record, windows)}
          ${windows ? tabs+`<div class="native-form-tools">${button('Výčetka','calculator',{kind:'soft',data:{tool:'cash'}})}${button('Kalkulačka','calculator',{kind:'soft',data:{tool:'basic'}})}</div>` : ''}
        </div>
        ${windows ? error : ''}
        <section id="edit-machines">${machineEditor(record)}</section><section id="edit-adjustments" hidden>${adjustmentEditor(record)}</section>
        ${windows ? '' : `${error}<footer class="dialog-actions">${button('Další', 'settlement-tab', { kind: 'soft', data: { view: 'adjustments', step: 'true' } })}${save}</footer>`}
      </div>
    </form>`;
}

function openEditor(type, id) {
  const windows = mode === 'windows';
  if(!id&&session.user()?.role==='Náhled')return notify('Účet má oprávnění pouze k náhledu.',true);
  if(windows&&!parkNativeEditor())return;
  const settings=state.administration.applications[0];
  if(windows&&(settings?.blocked||settings?.[type]===false||!online&&settings?.offline===false))return notify('Pro tuto činnost nemá aplikace povolení.',true);
  const venueId = windows ? windowsVenue : webVenue;
  const existing = id && records(state, type, venueId, windows).find(record => record.id === id);
  if (id && !existing) return notify('Záznam už není dostupný.', true);
  dismissStatus();
  const record = existing ? structuredClone(existing) : type === 'cash' ? newCashRecord(state, venueId, windows) : newSettlement(state, venueId, windows);
  if (windows && type === 'cash' && !existing) record.date = new Date().toLocaleDateString('sv-SE');
  if(type==='cash'&&!existing&&!windows)record.book=webDetail==='cash-manager'?'manager':webDetail==='cash-noncash'?'noncash':'cash';
  draft = { type, record, source: mode, busy: false, isNew: !existing };
  editor.className = `dialog ${windows ? `native-dialog${type==='settlement'?' maximized':''}` : 'web-dialog'} ${type === 'cash' ? 'cash-dialog' : 'settlement-dialog'}`;
  editor.style.removeProperty('--shift-x');
  editor.style.removeProperty('--shift-y');
  editor.style.removeProperty('width');
  editor.style.removeProperty('height');
  const venue = getVenue(venueId);

  editor.innerHTML = type === 'cash' ? cashForm(record, venue, windows) : settlementForm(record, venue, windows);
  addResizeHandles(editor);
  if(session.user()?.role==='Náhled')for(const field of editor.querySelectorAll('input,select,[type="submit"]'))field.disabled=true;
  if(windows&&type==='settlement'&&existing&&(existing.revision>0||existing.id!==records(state,type,venueId,true)[0]?.id)){
    for(const field of editor.querySelectorAll('input,select,[type="submit"]'))field.disabled=true;
  }
  if(windows&&type==='settlement'&&existing)for(const field of editor.querySelectorAll('.settlement-dates input'))field.disabled=true;
  if(windows&&type==='settlement'){
    activeNativeWindow=`native-${++nativeWindowNumber}`;
    nativeWindows.set(activeNativeWindow,{title:`${type==='cash'?'Kniha záznam':'Denní vyúčtování'} [${nativeWindowNumber}]`});
    editor.querySelector('.dialog-title>div').insertAdjacentHTML('afterbegin',button('Minimalizovat okno','native-minimize',{kind:'window-minimize'}));
    windowsEditorGrid.initialize();
    editor.show();render();fitNativeEditor();
    windowsEditorGrid.focusCurrent();
  }else {
    if(windows){editor.querySelector('[data-action="maximize-editor"]').remove();if(existing?.settlementId)editor.querySelector('[type="submit"]').disabled=true;}
    editor.showModal();
    if (windows) queueMicrotask(() => editor.querySelector('#cash-date-display')?.focus());
  }
  calendars.upgrade();
  draft.originalValues = editorValues(editor);
}

function settlementTab(view) {
  if (draft?.type !== 'settlement') return;
  if (draft.source === 'windows' && !windowsEditorGrid.finish()) return;
  const adjustments = view === 'adjustments';
  if (draft.source === 'windows') {
    editor.classList.toggle('show-adjustments', adjustments);
    editor.querySelector('.settlement-dates').hidden = adjustments;
  }
  editor.querySelector('#edit-machines').hidden = view !== 'machines';
  editor.querySelector('#edit-adjustments').hidden = view !== 'adjustments';
  editor.querySelector('#machine-summary').hidden = view !== 'machines';
  editor.querySelector('#adjustment-summary').hidden = view !== 'adjustments';
  for (const tab of editor.querySelectorAll('.editor-tabs button')) tab.setAttribute('aria-pressed', String(tab.dataset.view === view));
  const step = editor.querySelector('[data-step]');
  if (step) {
    step.querySelector('.button-label').textContent = view === 'machines' ? 'Další' : 'Předchozí';
    step.dataset.view = view === 'machines' ? 'adjustments' : 'machines';
  }
  editor.querySelector('.dialog-scroll').scrollTop = 0;
  if (draft.source === 'windows') windowsEditorGrid.refreshCurrent();
}

function settlementValue(input) {
  const key = input.dataset.entry;
  if (['note','mechanicalOut'].includes(key)) return input.value;
  if (key === 'money' && !input.value.trim()) return null;
  if (draft.source === 'windows' && ['income','expense'].includes(key) && !input.value.trim()) return 0;
  return parseMoney(input.value);
}

function changeEditorField(input, value = settlementValue(input)) {
  const tr = input.closest('tr[data-row]');
  const machine = tr.dataset.group === 'machine';
  const key = input.dataset.entry;
  const day = input.closest('[data-day]')?.dataset.day;
  const adjustments = day && day !== draft.record.from ? draft.record.additionalAdjustments[day] : draft.record.adjustments;
  const row = (machine ? draft.record.rows : adjustments)[Number(tr.dataset.row)];
  row[key] = value;
  if (machine) {
    const amounts = rowAmounts(row);
    for (const cell of tr.querySelectorAll('[data-output]')) {
      const value = amounts[cell.dataset.output];
      cell.textContent = number(value);
      cell.classList.toggle('negative', cell.dataset.output === 'difference' && value < 0);
    }
    if (key !== 'money' && row.money === null) tr.querySelector('[data-entry="money"]').value = decimal(amounts.money);
  } else {
    tr.querySelector(`[data-day="${day}"] [data-output="total"]`).textContent = number(row.income - row.expense);
  }
  const sum = totalsFor(draft.record);
  const devices = deviceTotals(draft.record);
  for (const cell of editor.querySelectorAll('[data-total]')) {
    cell.textContent = number((devices[cell.dataset.device] ?? sum)[cell.dataset.total]);
  }
}

function commitWindowsCell(input) {
  const value = settlementValue(input);
  if (Number.isNaN(value)) return false;
  changeEditorField(input, value);
  if (value === null) {
    const row = draft.record.rows[Number(input.closest('tr').dataset.row)];
    input.value = decimal(rowAmounts(row).money);
  }
  return true;
}

function showEditorError(message) {
  const error = editor.querySelector('#editor-error');
  if (!error) return;
  if (message) error.textContent = message;
  error.hidden = !message;
}

let ignoredUtilityClosures=0;
function showUtility(title, content, work) {
  if(utility.open){ignoredUtilityClosures++;utility.close();}
  utilityWork = work;
  utility.className = `dialog utility ${mode === 'windows' ? 'native-dialog' : 'web-dialog'}`;
  utility.style.removeProperty('--shift-x');
  utility.style.removeProperty('--shift-y');
  utility.style.removeProperty('width');
  utility.style.removeProperty('height');
  utility.innerHTML = `<header class="dialog-title">${mode==='windows'&&work?.tool?brandMark(16):''}<h2 id="utility-title">${e(title)}</h2>${button('Zavřít', 'close-utility', { kind: 'window-close' })}</header><div class="utility-content">${content}</div>`;
  addResizeHandles(utility);
  if(work?.modeless)utility.show();else utility.showModal();
}

function windowsPrompt(title, message, symbol, actions, defaultAction, work) {
  showUtility(title, `<div class="native-prompt-text"><span class="native-prompt-symbol" aria-hidden="true">${symbol==='question'?'?':'i'}</span><p>${e(message)}</p></div>
    <footer class="dialog-actions native-prompt-actions">${actions}</footer>`, work);
  utility.classList.add('native-prompt');
  utility.querySelector(`.native-prompt-actions [data-action="${defaultAction}"]`).focus();
}

function setDropdown(trigger, open) {
  const menu = app.querySelector(`#${trigger.dataset.target}`);
  if (!menu) return;
  menu.hidden = !open;
  trigger.setAttribute('aria-expanded', String(open));
}

function closeDropdowns() {
  for (const trigger of app.querySelectorAll('[data-action=toggle-dropdown][aria-expanded=true]')) setDropdown(trigger, false);
}

document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.menu-dropdown')) closeDropdowns();
});

document.addEventListener('keydown', event => {
  if (mode !== 'windows' || !windowsOpen || utility.open || draft?.type === 'cash') return;
  const menu = app.querySelector('.windows-menu');
  if (!menu) return;
  const top = [...menu.querySelectorAll('button:not(.native-dropdown button):enabled')];
  const dropdown = menu.querySelector('.native-dropdown');
  const trigger = menu.querySelector('[data-action=toggle-dropdown]');
  if (event.key === 'F10') {
    if (event.repeat) return;
    event.preventDefault();
    if (menu.contains(document.activeElement)) {
      closeDropdowns();
      if (activeNativeWindow) windowsEditorGrid.focusCurrent();
      else windowsListControls.focus();
    } else top[0]?.focus();
    return;
  }
  if (!menu.contains(event.target)) return;
  const items = [...dropdown.querySelectorAll('button:enabled')];
  const inDropdown = dropdown.contains(event.target);
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!dropdown.hidden) { setDropdown(trigger, false); trigger.focus(); }
    else if (activeNativeWindow) windowsEditorGrid.focusCurrent();
    else windowsListControls.focus();
    return;
  }
  if (['ArrowLeft','ArrowRight'].includes(event.key)) {
    event.preventDefault();
    const index = top.indexOf(inDropdown ? trigger : event.target);
    const next = (index + (event.key === 'ArrowLeft' ? -1 : 1) + top.length) % top.length;
    setDropdown(trigger, false);
    top[next]?.focus();
  }
  if (['ArrowDown','ArrowUp','Home','End'].includes(event.key) && (event.target === trigger || inDropdown)) {
    event.preventDefault();
    const index = items.indexOf(event.target);
    let next = event.key === 'ArrowDown' ? index + 1 : index < 0 ? items.length - 1 : index - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = items.length - 1;
    setDropdown(trigger, true);
    items[(next + items.length) % items.length]?.focus();
  }
});

function confirm(message, title, acceptLabel, callback) {
  showUtility(title, `<p>${e(message)}</p><footer class="dialog-actions">${button('Ne', 'close-utility', { kind: 'soft' })}${button(acceptLabel, 'confirm-utility', { kind: 'soft accent' })}</footer>`, { callback });
  utility.querySelector('[data-action="close-utility"].soft').focus();
}

const denominations = [5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
let moneyCell;
function selectNativeMoneyCell(input, activateCashCount = true) {
  moneyCell = input?.dataset.entry === 'money' ? input : null;
  const insert=utility.querySelector('[data-action="cash-insert"]');
  if (insert) {
    insert.disabled = !moneyCell || moneyCell.disabled;
    if (activateCashCount && !insert.disabled && utility.open && utilityWork?.owner === activeNativeWindow) {
      utility.querySelector('[data-denomination]').focus({ preventScroll: true });
    }
  }
}

function closeBoundCashCount() {
  if (utility.open && utilityWork?.owner && utilityWork.owner === activeNativeWindow) utility.close();
}

function openCalculator(tool) {
  if(utility.open)return;
  const windows = mode === 'windows';
  if (windows && !windowsEditorGrid.finish()) return;
  if (tool === 'basic') {
    showUtility('Kalkulačka', `<div class="standard-calculator"><p id="calc-expression"></p><output id="calculator-total" aria-live="polite">0</output><div class="calculator-keys">${['%','CE','C','⌫','1/x','x²','√','÷','7','8','9','×','4','5','6','−','1','2','3','+','±','0',',','='].map(key=>button(key,'calc-key',{kind:'soft',data:{key}})).join('')}</div></div>`, { tool,modeless:mode==='windows',value:'0',left:null,operator:null,fresh:true });
    utility.classList.add('standard-calculator-dialog');
  } else {
    const owner = windows && activeNativeWindow && editor.open ? activeNativeWindow : undefined;
    const fields = denominations.map(value => `<label><span>${windows?value:formatNumber.format(value)}</span><input type="number" min="0" max="99999" step="1" value="${windows?'':'0'}" data-denomination="${value}" aria-label="Počet kusů ${value} Kč"><output data-denomination-total="${value}">${windows?'':'0,00'}</output></label>`).join('');
    const insert = windows
      ? owner ? button('Vložit do buňky','cash-insert',{kind:'soft',disabled:!moneyCell?.isConnected||moneyCell.disabled}) : ''
      : button('Zavřít','close-utility',{kind:'soft'});
    showUtility('Výčetka', `<div class="denominations">${fields}</div>
      <p class="calc-total">${windows?'∑':'Celkem'} <output id="calculator-total" aria-live="polite">${windows?'':money(0)}</output></p>
      <footer class="dialog-actions">${button('Vynulovat','cash-reset',{kind:'soft'})}${insert}</footer>`, { tool,modeless:windows,owner });
    utility.classList.add('denomination-dialog');
    if (windows) {
      if (owner && innerWidth >= 800) {
        const bounds = utility.getBoundingClientRect();
        utility.style.setProperty('--shift-x', `${innerWidth - bounds.right - 22}px`);
      }
      utility.querySelector('[data-denomination]').focus({ preventScroll: true });
    }
  }
}

function calculatorKey(key) {
  const calc=utilityWork;if(calc?.tool!=='basic')return;
  const value=Number(calc.value);
  const calculate=(a,b,op)=>({'+':()=>a+b,'−':()=>a-b,'×':()=>a*b,'÷':()=>a/b})[op]();
  if(/^\d$/.test(key)){calc.value=calc.fresh||calc.value==='0'?key:calc.value+key;calc.fresh=false;}
  else if(key===','){if(calc.fresh){calc.value='0';calc.fresh=false;}if(!calc.value.includes('.'))calc.value+='.';}
  else if(key==='C')Object.assign(calc,{value:'0',left:null,operator:null,fresh:true,last:null});
  else if(key==='CE'){calc.value='0';calc.fresh=true;}
  else if(key==='⌫'){calc.value=calc.value.slice(0,-1)||'0';}
  else if(['±','%','1/x','x²','√'].includes(key)){calc.value=String(key==='±'?-value:key==='%'?(calc.left!==null&&['+','−'].includes(calc.operator)?calc.left*value/100:value/100):key==='1/x'?1/value:key==='x²'?value*value:Math.sqrt(value));calc.fresh=true;}
  else if(['+','−','×','÷'].includes(key)){
    if(calc.operator&&!calc.fresh)calc.value=String(calculate(calc.left,value,calc.operator));
    calc.left=Number(calc.value);calc.operator=key;calc.fresh=true;
  }else if(key==='='){
    if(calc.operator){calc.last={operator:calc.operator,value};calc.value=String(calculate(calc.left,value,calc.operator));}
    else if(calc.last)calc.value=String(calculate(value,calc.last.value,calc.last.operator));
    calc.left=null;calc.operator=null;calc.fresh=true;
  }
  if(!Number.isFinite(Number(calc.value))) {calc.value='0';calc.left=null;calc.operator=null;calc.fresh=true;utility.querySelector('#calculator-total').textContent='Chyba';}
  else utility.querySelector('#calculator-total').textContent=calc.value.replace('.',',');
  utility.querySelector('#calc-expression').textContent=calc.operator?`${calc.left} ${calc.operator}`:'';
}

function refreshCalculator() {
  const result = utility.querySelector('#calculator-total');
  if (utilityWork?.tool === 'cash') {
    let sum = 0;
    for (const field of utility.querySelectorAll('[data-denomination]')) {
      const amount=field.validity.valid ? Number(field.value) * Number(field.dataset.denomination) * 100 : NaN;
      sum += amount;
      utility.querySelector(`[data-denomination-total="${field.dataset.denomination}"]`).textContent=mode==='windows'&&!field.value?'':number(amount);
    }
    result.textContent = mode==='windows'?number(sum):money(sum);
  }
}

function csvCell(value) {
  let text = typeof value === 'number' ? String(value).replace('.', ',') : String(value ?? '');
  if (typeof value === 'string' && /^[\s\uFEFF]*[+=@\-\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function exportCsv(type, excel = false) {
  const windows = mode === 'windows';
  const venueId = windows ? windowsVenue : webVenue;
  const amount = value => value / 100;
  let headings;
  let data;
  switch (type) {
    case 'cash':
      headings = ['Datum', 'Typ', 'Text', 'Příjem', 'Výdej', 'Zůstatek', 'Stav'];
      data = cashWithBalances(state, venueId, windows,webDetail==='cash-manager'?'manager':webDetail==='cash-noncash'?'noncash':'cash').map(row => [row.date, row.direction === 'income' ? 'Příjem' : 'Výdej', row.description,
        amount(cashAmounts(row).income),amount(cashAmounts(row).expense), amount(row.balance), row.pending ? 'Neodesláno' : 'Potvrzeno']);
      break;
    case 'register': {
      const latest = records(state, 'settlement', venueId)[0];
      headings = ['ID','Provozovna','Provozovatel','Pořadí','Číslo','Název','Výrobce','Model','Typ','IN','OUT','Poznámka','Nulovat'];
      data = getMachines(venueId).filter(machine=>!machine.deleted).slice().sort((a,b)=>a.order-b.order).map(machine => {
        const row = latest?.rows.find(row=>row.machine===machine.id);
        return [machine.localId??getMachines(venueId).indexOf(machine)+1,getVenue(venueId).name,machine.operator??'Demo provozovatel',machine.order,machine.number,machine.label,'Demo výrobce',machine.model,machine.type,
          amount(machine.counterAfter?machine.initialIn:row?.inEnd??machine.initialIn??0),amount(machine.counterAfter?machine.initialOut:row?.outEnd??machine.initialOut??0),machine.note??row?.note??'',machine.reset?'Ano':'Ne'];
      });
      break;
    }
    case 'machines':
      headings = ['Pořadí', 'Číslo', 'Typ', 'Označení', 'Vhozeno', 'Peníze', 'Vyplaceno', 'Výnos'];
      data = machineReportData().machines.map(({ machine, row }) => {
        const sum = row && rowAmounts(row);
        return [machine.order, machine.number, machine.type, machine.label, ...['input', 'money', 'output', 'yield'].map(key => sum ? amount(sum[key]) : '')];
      });
      break;
    case 'monthly':
      headings=['Provozovna','Název','Typ','Měsíc','IN počátek','IN konec','OUT počátek','OUT konec','Vhozeno','Peníze','Vyplaceno','Výnos','Poznámka'];
      data=monthlyMachines().map(row=>[getVenue(webVenue).name,row.machine.label,row.machine.type,row.month,...['inStart','inEnd','outStart','outEnd','input','money','output','yield'].map(key=>amount(row[key])),row.note]);
      break;
    case 'overview':
      headings = ['Měsíc', 'Provozovna', 'Vyúčtování', 'Peníze', 'Vyplaceno', 'Tržba', 'Celkem k odvodu'];
      data = aggregate(type === 'overview').map(row => [row.month, getVenue(row.venue).name, row.count, amount(row.money), amount(row.output), amount(row.yield), amount(row.remittance)]);
      break;
    default:
      headings = ['Od', 'Do', 'Peníze', 'Vyplaceno', 'Tržba', 'Příjmy', 'Výdaje', 'Celkem k odvodu', 'Stav'];
      data = records(state, 'settlement', venueId, windows).map(record => {
        const sum = totalsFor(record);
        return [record.from, record.to, ...['money', 'output', 'yield', 'income', 'expense', 'remittance'].map(key => amount(sum[key])), record.pending ? 'Neodesláno' : 'Potvrzeno'];
      });
  }
  if(excel) {
    exportWorkbook(`mpadmin-demo-${type}`,[headings,...data]);
    return;
  }
  const csv = '\uFEFF' + [headings, ...data].map(row => row.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `mpadmin-demo-${type}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Export ukázkových dat je připravený.');
}

async function sendQueue() {
  if (sending) return;
  if(state.administration.applications[0]?.blocked)return notify('Tato instance aplikace je zakázaná.',true);
  const settings=state.administration.applications[0];
  if(state.queue.some(item=>!venues.some(venue=>venue.id===item.record.venue)||settings?.[item.type]===false||settings?.venue&&settings.venue!==item.record.venue))return notify('Některý záznam nelze odeslat s aktuálním oprávněním uživatele nebo aplikace. Záznamy zůstávají uložené.',true);
  if (!online) return notify('Aplikace je offline. Rozpracované záznamy zůstávají uložené.', true);
  if (!state.queue.length) return notify('Žádné záznamy nečekají na odeslání.');
  sending = true;
  try {
    await performWrite(current=>{
      for(const item of current.queue)authorizeRecord(current,item.type,item.record,'windows');
      return synchronize(current);
    });
    render();
    notify('Data byla odeslána na ukázkový server. Záznamy jsou vidět také ve webu.');
  } finally {
    sending = false;
  }
}

async function resetDemo() {
  if(!parkNativeEditor())return;
  nativeWindows.clear();
  await performWrite(initialState, true);
  if (persistent) localStorage.removeItem(updateKey);
  demoUpdated = false;
  windowsListControls.reset();
  online = true;
  windowsOpen = false;
  windowsView = 'settlement';
  webView = 'venues';
  webDetail = 'register';
  mainMenuHidden = false;
  registerPage = 1;
  webVenue = windowsVenue = venues[0].id;
  filterVisible = false;
  venueFilter = venueAddressFilter = venueTownFilter = machineFilter = machinePeriod = '';
  webLists.reset();
  venueSort = { key: 'id', descending: false };
  render();
  notify('Výchozí ukázková data byla obnovena.');
}

document.addEventListener('click', async event => {
  const control = event.target.closest('button[data-action]');
  if (!control) return;
  const { action, mode: newMode, view, venue, type, tool, id } = control.dataset;
  if(action!=='toggle-dropdown')closeDropdowns();
  try {
    switch (action) {
      case 'toggle-dropdown': setDropdown(control, control.getAttribute('aria-expanded')!=='true');break;
      case 'mode': setMode(newMode); break;
      case 'logout':if(nativeWindows.size){event.stopImmediatePropagation();closeNativeWindows(()=>{webView='venues';webDetail='info';windowsOpen=false;windowsView='settlement';session.logout();});break;}webView='venues';webDetail='info';windowsOpen=false;windowsView='settlement';break;
      case 'user-sign-in':if(session.canManage('all')){webView='venues';webDetail='info';windowsOpen=false;}break;
      case 'web-page': if(['sms','email'].includes(view))administrationTools.openMessages(view);else {webView = view; render();} break;
      case 'open-venue': webVenue = venue; webView = 'detail'; webDetail = 'info'; registerPage = 1; machinePeriod = ''; render(); break;
      case 'safe-detail': webVenue=venue;webView='detail';webDetail='safe';render();break;
      case 'cash-history': administrationTools.cashHistory(venue);break;
      case 'server-check':showUtility('Zkouška druhého serveru','<p>Server je online.</p><p class="local-message-note">Ukázkové spojení v tomto prohlížeči.</p>');break;
      case 'detail-tab': webDetail = type; render(); break;
      case 'settlement-report': webReport=id;webDetail='settlement-report';render();break;
      case 'register-page': registerPage = Number(view); render(); app.querySelector('.pagination [aria-current]').focus(); break;
      case 'toggle-menu': mainMenuHidden = !mainMenuHidden; render(); app.querySelector('[data-action="toggle-menu"]').focus(); break;
      case 'web-notices': {
        const count = state.queue.length;
        showUtility('Upozornění', `<p>${count ? `Neodeslané záznamy z Windows aplikace: ${count}` : 'Žádná nová upozornění.'}</p>`);
        break;
      }
      case 'web-account':case 'user-detail':userDetail.select(id??session.user().id);webView='user-detail';render();break;
      case 'toggle-filter': filterVisible = !filterVisible; render(); if (filterVisible) app.querySelector('#venue-term').focus(); break;
      case 'clear-venues':
        venueFilter = venueAddressFilter = venueTownFilter = '';
        for (const input of app.querySelectorAll('#venue-filter input')) input.value = '';
        updateVenueResults();
        break;
      case 'venue-page':venuePage=Number(control.dataset.page);render();break;
      case 'sort-venues':
        venueSort = { key: view, descending: control.dataset.direction==='desc' };
        render();
        app.querySelector('.sort-label[aria-pressed="true"]').focus();
        break;
      case 'start-windows': windowsOpen = true; windowsView='settlement'; windowsMinimized=false; windowsMaximized=true; windowsListBounds=undefined; render(); windowsListControls.focus(); break;
      case 'close-windows':closeNativeWindows(()=>{windowsOpen=false;render();});break;
      case 'windows-page': if(parkNativeEditor()){windowsView = type;windowsMinimized=false; render(); windowsListControls.focus();} break;
      case 'native-activate':activateNativeWindow(id);break;
      case 'native-minimize': {
        const entry = nativeWindows.get(activeNativeWindow);
        if(entry && parkNativeEditor()){
          entry.minimized = true;
          render();
          app.querySelector('.minimized-title[data-action=native-activate]')?.focus();
        }
        break;
      }
      case 'native-close-minimized':
        activateNativeWindow(id);
        if (activeNativeWindow === id) requestEditorClose();
        break;
      case 'native-close-all':closeNativeWindows();break;
      case 'native-discard':utility.close();closeEditor();break;
      case 'native-save-close':utility.close();editor.querySelector('#editor-form').requestSubmit();break;
      case 'minimize-child': windowsMinimized=true;render();break;
      case 'restore-child': windowsMinimized=false;render();windowsListControls.focus();break;
      case 'maximize-child': windowsMaximized=!windowsMaximized;render();windowsListControls.focus();break;
      case 'windows-options': showUtility('Výběr provozovny', `${venueSelect(windowsVenue, 'windows-venue')}<footer class="dialog-actions">${button('Pokračovat', 'windows-select', { kind: 'soft' })}</footer>`); break;
      case 'windows-select': if(parkNativeEditor()){windowsVenue = utility.querySelector('#windows-venue').value; utility.close(); render();} break;
      case 'toggle-online': online = !online; render(); notify(online ? 'Připojení v ukázce je obnovené.' : 'Režim offline. Záznamy můžete ukládat místně.'); break;
      case 'synchronize': await sendQueue(); break;
      case 'new-settlement':
        if(mode==='windows'&&state.queue.some(item=>item.type==='settlement'&&item.record.venue===windowsVenue))notify('Pro vytvoření nového vyúčtování musíte nejprve odeslat data na server.',true);
        else openEditor('settlement');break;
      case 'edit-settlement': openEditor('settlement', id); break;
      case 'new-cash': openEditor('cash'); break;
      case 'edit-cash': openEditor('cash', id); break;
      case 'delete-record': if(session.canManage('all'))confirm('Opravdu smazat vybraný záznam?','Smazání záznamu','Smazat',async()=>{await performWrite(current=>deleteRecord(current,type,id,Number(control.dataset.revision)));render();notify('Záznam byl smazán.');});break;
      case 'close-editor': requestEditorClose(); break;
      case 'maximize-editor': {
        const maximized = editor.classList.toggle('maximized');
        const label = maximized ? 'Obnovit velikost' : 'Zvětšit okno';
        control.querySelector('.button-label').textContent = label;
        control.setAttribute('aria-label', label);
        control.title = label;
        break;
      }
      case 'settlement-tab': settlementTab(view); break;
      case 'calculator': openCalculator(tool); break;
      case 'calc-key':calculatorKey(control.dataset.key);break;
      case 'cash-reset':for(const field of utility.querySelectorAll('[data-denomination]'))field.value=mode==='windows'?'':'0';refreshCalculator();break;
      case 'cash-insert':{
        if(!moneyCell?.isConnected||moneyCell.disabled||!draft||utilityWork?.owner!==activeNativeWindow)return;
        let total=0;for(const field of utility.querySelectorAll('[data-denomination]')){if(!field.validity.valid)return field.reportValidity();total+=Number(field.value)*Number(field.dataset.denomination)*100;}
        moneyCell.value=decimal(total);commitWindowsCell(moneyCell);break;
      }
      case 'print': window.print(); break;
      case 'pdf-export':{
        const tables=[...app.querySelectorAll('table')].filter(table=>table.getBoundingClientRect().height>0).map(table=>{
          const excluded=[...table.rows[0]?.cells??[]].flatMap((cell,index)=>!cell.textContent.trim()||cell.textContent.trim()==='Akce'?[index]:[]);
          return [...table.rows].map(row=>[...row.cells].filter((cell,index)=>!excluded.includes(index)).map(cell=>cell.innerText.trim()));
        });
        if(!tables.length)return notify('Nejprve zobrazte sestavu.',true);
        const {exportPdf}=await import('./pdf-export.js?v=20261114.6');
        await exportPdf(app.querySelector('table[aria-label]')?.getAttribute('aria-label')??'MPAdmin',tables);break;
      }
      case 'export': exportCsv(type,control.dataset.format==='xls'); break;
      case 'export-table': exportVisibleTable('MPAdmin přehled'); break;
      case 'export-report': {
        const rows=[...app.querySelectorAll('.settlement-report table')].flatMap(table=>[...table.rows].map(row=>[...row.cells].map(cell=>cell.innerText.trim())).concat([[]]));
        rows.push(['Celkem k odvodu',app.querySelector('.report-remittance dd:last-child').textContent]);
        exportWorkbook('Vyúčtování',rows);break;
      }
      case 'help': showUtility('Nápověda k ukázce', '<p>Otevřete provozovnu, přidejte denní vyúčtování a upravte žluté pole Konec. Po uložení najdete záznam v přehledu.</p><p>V aplikaci pro Windows lze přepnout na práci offline. Místně uložené záznamy se ve webu objeví až po obnovení připojení a odeslání na ukázkový server.</p><p>Všechny provozovny, stroje a částky jsou smyšlené.</p>'); break;
      case 'reset': confirm('Obnovit původní smyšlené záznamy? Vaše změny v této ukázce se smažou.', 'Obnovit demo', 'Obnovit', resetDemo); break;
      case 'demo-update': confirm('Nainstalovat ukázkovou aktualizaci spouštěče? Uložené záznamy i neodeslané změny zůstanou k dispozici.', 'Ukázková aktualizace', 'Aktualizovat', () => {
        if (persistent) localStorage.setItem(updateKey, '1');
        demoUpdated = true;
        render();
        notify('Ukázková aktualizace je dokončena.');
      }); break;
      case 'close-utility':
        if (utility.classList.contains('native-prompt') && utilityWork?.closeRequest) nativeCloseContinuation=undefined;
        utility.close(); break;
      case 'confirm-utility': {
        const callback = utilityWork?.callback;
        utility.close();
        await callback?.();
        break;
      }
    }
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Změnu se nepodařilo dokončit.', true);
  }
});

document.addEventListener('change', event => {
  const control = event.target;
  if(control.id==='venue-page-size'){venuePageSize=Number(control.value);venuePage=1;render();}
  else if (control.id === 'venue-select') {
    webVenue = control.value;
    machinePeriod = '';
    render();
    app.querySelector('#venue-select')?.focus();
  } else if (control.id === 'machine-period') {
    machinePeriod = control.value;
    render();
    app.querySelector('#machine-period')?.focus();
  } else if (control.id === 'calc-op') refreshCalculator();
});

document.addEventListener('submit', async event => {
  event.preventDefault();
  if (event.target.id === 'venue-filter') {
    const fields = event.target.elements;
    venueFilter = fields.namedItem('name').value;
    venueAddressFilter = fields.namedItem('address').value;
    venueTownFilter = fields.namedItem('town').value;
    updateVenueResults();
  } else if (event.target.id === 'machine-filter') {
    machineFilter = app.querySelector('#machine-term').value;
    render();
    app.querySelector('#machine-term').focus();
  } else if (event.target.id === 'editor-form' && draft && !draft.busy) {
    const { record, type, source } = draft;
    if (source === 'windows' && type === 'settlement' && !windowsEditorGrid.finish()) return;
    const toBook = type==='settlement';
    const submits = editor.querySelectorAll('[type="submit"]');
    const errorLabel = editor.querySelector('#editor-error');
    draft.busy = true;
    for (const submit of submits) submit.disabled = true;
    errorLabel.hidden = true;
    try {
      if (type === 'cash') {
        if(source==='windows'&&record.settlementId)throw new Error('Záznam je navázaný na vyúčtování. Upravte příslušné vyúčtování.');
        const values = ['income', 'expense'].map(direction => {
          const input = editor.querySelector(`#cash-${direction}`).value.trim();
          return input ? parseMoney(input) : 0;
        });
        if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Zadejte platnou nezápornou částku.');
        const [income, expense] = values;
        const selection = editor.querySelector('#cash-direction');
        const direction = income>=expense?'income':'expense';
        record.date = editor.querySelector('#cash-date').value;
        if(editor.querySelector('#cash-venue'))record.venue=editor.querySelector('#cash-venue').value;
        if(editor.querySelector('#cash-book'))record.book=editor.querySelector('#cash-book').value;
        record.direction = direction;
        record.description = editor.querySelector('#cash-description').value.trim();
        record.amount = Math.abs(income-expense);
        record.income=income;record.expense=expense;record.kind=selection.selectedOptions[0].text;
      } else {
        changeSettlementPeriod(record,editor.querySelector('#date-from').value,editor.querySelector('#date-to').value);
      }
      await performWrite(current => {
        if(type==='cash'&&source==='web'){const original=current.cash.find(entry=>entry.id===record.id);if(original&&original.venue!==record.venue)authorizeRecord(current,type,original,source);}
        authorizeRecord(current,type,record,source);
        if(toBook)authorizeRecord(current,'cash',record,source);
        record.modifiedAt=new Date().toISOString();record.modifiedBy=session.user().nick;
        return toBook ? saveSettlementToBook(current, record, source) : saveRecord(current, type, record, source);
      });
      closeEditor();
      if (source === 'web' && webView === 'detail' && (type==='settlement'||!['cash-manager','cash-noncash'].includes(webDetail))) webDetail = type;
      render();
      if (source === 'windows') windowsListControls.focus();
      notify(toBook&&source==='windows' ? 'Vyúčtování i záznamy pokladní knihy jsou uložené v aplikaci a čekají na odeslání.' : source === 'windows' ? 'Uloženo v aplikaci. Záznam čeká na odeslání.' : 'Změny byly uloženy do ukázky.');
    } catch (error) {
      errorLabel.textContent = error instanceof Error ? error.message : 'Záznam se nepodařilo uložit.';
      errorLabel.hidden = false;
    } finally {
      if (draft) draft.busy = false;
      for (const submit of submits) submit.disabled = false;
    }
  }
});

document.addEventListener('input',event=>{const form=event.target.closest('#venue-filter');if(!form)return;clearTimeout(venueFilterTimer);venueFilterTimer=setTimeout(()=>{if(form.isConnected)form.requestSubmit();},250);});

editor.addEventListener('input', event => {
  const error = editor.querySelector('#editor-error');
  if (error) error.hidden = true;
  if (draft?.type === 'settlement' && draft.source === 'web' && event.target.matches('[data-entry]')) changeEditorField(event.target);
  if (draft?.type === 'cash' && ['cash-income', 'cash-expense'].includes(event.target.id)) {
    const direction = event.target.id.slice(5);
    const opposite = direction === 'income' ? 'expense' : 'income';
    const otherAmount = editor.querySelector(`#cash-${opposite}`).value.trim();
    const select=editor.querySelector('#cash-direction');
    if (event.target.value.trim() && (!otherAmount || parseMoney(otherAmount) === 0)&&['income','expense'].includes(select.value)) select.value = direction;
  }
});
utility.addEventListener('input', () => { if (utilityWork?.tool) refreshCalculator(); });
editor.addEventListener('change', event => {
  if(draft?.type!=='settlement'||!['date-from','date-to'].includes(event.target.id))return;
  try {
    changeSettlementPeriod(draft.record,editor.querySelector('#date-from').value,editor.querySelector('#date-to').value);
    editor.querySelector('#edit-adjustments').innerHTML=adjustmentEditor(draft.record);
    if (draft.source === 'windows') windowsEditorGrid.initialize();
  }catch(error){
    const message=editor.querySelector('#editor-error');message.textContent=error.message;message.hidden=false;
    editor.querySelector('#date-from').value=draft.record.from;editor.querySelector('#date-to').value=draft.record.to;
  }
});
utility.addEventListener('close', () => { if(ignoredUtilityClosures){ignoredUtilityClosures--;return;}utilityWork = undefined; });
utility.addEventListener('keydown',event=>{
  if(utilityWork?.tool==='basic'){
    const key=({'Enter':'=','Escape':'C','Backspace':'⌫','.':',','*':'×','/':'÷','-':'−'})[event.key]??event.key;
    if(/^[0-9,+%=]$/.test(key)||['×','÷','−','C','⌫'].includes(key)){event.preventDefault();calculatorKey(key);}
  }else if(utilityWork?.tool==='cash'&&['ArrowUp','ArrowDown'].includes(event.key)&&event.target.matches('[data-denomination]')){
    event.preventDefault();const fields=[...utility.querySelectorAll('[data-denomination]')];fields[(fields.indexOf(event.target)+(event.key==='ArrowDown'?1:fields.length-1))%fields.length].focus();
  }else if(utilityWork?.modeless&&event.key==='Escape'){
    event.preventDefault();utility.close();
  }
});
editor.addEventListener('close', () => { if(ignoredEditorClosures){ignoredEditorClosures--;return;}finishEditorClose(); });
window.addEventListener('resize',fitNativeEditor);
document.addEventListener('keydown',event=>{
  if(event.defaultPrevented || mode!=='windows' || utility.open) return;
  if(event.key==='Escape'&&activeNativeWindow&&editor.open&&!draft?.busy){event.preventDefault();requestEditorClose();}
  else if (event.key === 'F5' && windowsOpen && !editor.open && event.target.closest('.native-list')) {
    event.preventDefault();
    render();
    windowsListControls.focus();
  }
});
utility.addEventListener('cancel', () => { if (utilityWork?.closeRequest) nativeCloseContinuation=undefined; });
editor.addEventListener('cancel', event => { event.preventDefault();requestEditorClose(); });

function unlockStart(input) {
  const accept=() => {
    input.readOnly = false;
    input.focus();
    input.select();
    input.addEventListener('blur', () => { input.readOnly = true; }, { once: true });
  };
  if(mode==='web'){
    const machine=input.closest('tr').querySelector('.machine-number')?.textContent??'';
    showUtility('Změna počátečního stavu',`<h2>Změna počátečního stavu</h2><p>Opravdu chcete změnit počáteční stav ${input.dataset.entry==='inStart'?'IN':'OUT'}?</p><p class="start-confirm-context">Automat č. ${e(machine)} · Počátek: ${e(input.value)}</p><div class="start-confirm-actions">${button('Ano','confirm-utility',{kind:'start-confirm-yes'})}${button('Ne','close-utility')}</div>`,{callback:accept});
    utility.classList.add('start-confirm-dialog');utility.querySelector('.start-confirm-actions [data-action=close-utility]').focus();
  }
}

editor.addEventListener('click', event => {
  if (draft?.source==='web' && event.target.matches('input.start[readonly]:enabled')) unlockStart(event.target);
});
editor.addEventListener('paste', event => {
  if (draft?.source==='web' && event.target.matches('input.start[readonly]:enabled')) {
    event.preventDefault();
    unlockStart(event.target);
  }
});
editor.addEventListener('blur', event => {
  const input = event.target;
  if (input.dataset.entry === 'money' && draft?.source==='web' && !input.value.trim()) {
    input.value = decimal(rowAmounts(draft.record.rows[Number(input.closest('tr').dataset.row)]).money);
  }
}, true);

editor.addEventListener('keydown', event => {
  const input = event.target;
  if (draft?.source !== 'web' || !input.matches('input[data-entry]')) return;
  if (input.classList.contains('start') && input.readOnly && !event.ctrlKey && !event.metaKey && !event.altKey &&
      (event.key.length === 1 || ['Enter', 'Delete', 'Backspace'].includes(event.key))) {
    event.preventDefault();
    unlockStart(input);
    return;
  }
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const row = input.closest('tr');
  let rowIndex = Number(row.dataset.row);
  let column = Number(input.dataset.column);
  switch (event.key) {
    case 'ArrowUp': rowIndex--; break;
    case 'ArrowDown': rowIndex++; break;
    case 'ArrowLeft': if (input.selectionStart !== 0 || input.selectionEnd !== 0) return; column--; break;
    case 'ArrowRight': if (input.selectionStart !== input.value.length || input.selectionEnd !== input.value.length) return; column++; break;
    default: return;
  }
  const target = row.closest('tbody').querySelector(`[data-row="${rowIndex}"] [data-column="${column}"]`);
  if (target) {
    event.preventDefault();
    target.focus();
    target.select();
  }
});

function addResizeHandles(dialog) {
  dialog.insertAdjacentHTML('beforeend',['n','ne','e','se','s','sw','w','nw'].map(edge=>`<span class="resize-handle resize-${edge}" data-resize="${edge}" aria-hidden="true"></span>`).join(''));
}

const windowsListControls = createWindowsListControls(app, openEditor);
const windowsEditorGrid = createWindowsEditorGrid(editor, {
  commitValue: commitWindowsCell,
  selectCell: selectNativeMoneyCell,
  reportError: showEditorError,
  clearError: () => showEditorError(),
  confirmStart(accept) {
    windowsPrompt('Změna počátečního stavu', 'Opravdu chcete změnit počáteční stav?', 'info',
      button('Ano','confirm-utility',{kind:'soft'})+button('Ne','close-utility',{kind:'soft'}), 'confirm-utility', { callback: accept });
  },
});
app.addEventListener('dblclick', event => {
  const caption = event.target.closest('.child-caption');
  if(caption && !event.target.closest('button')) caption.querySelector('[data-action=maximize-child]').click();
});
let listDrag;
app.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest('button')) return;
  const child = event.target.closest('.restored-child > .child-window');
  const grip = event.target.closest('[data-resize]');
  if (!child || (!grip && !event.target.closest('.child-caption'))) return;
  listDrag = {
    id: event.pointerId, x: event.clientX, y: event.clientY, edge: grip?.dataset.resize,
    frame: { left:child.offsetLeft, top:child.offsetTop, width:child.offsetWidth, height:child.offsetHeight },
    area: { width:child.parentElement.clientWidth, height:child.parentElement.clientHeight },
  };
  (grip ?? child.querySelector('.child-caption')).setPointerCapture(event.pointerId);
  event.preventDefault();
});
app.addEventListener('pointermove', event => {
  if (listDrag?.id !== event.pointerId) return;
  const { frame, area, edge, x, y } = listDrag;
  const dx = event.clientX-x, dy = event.clientY-y;
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  let { left, top, width, height } = frame;
  if (!edge) {
    left = clamp(left+dx,0,area.width-width);
    top = clamp(top+dy,0,area.height-height);
  } else {
    const minWidth = Math.min(340,width), minHeight = Math.min(200,height);
    const right = edge.includes('e') ? clamp(left+width+dx,left+minWidth,area.width) : left+width;
    const bottom = edge.includes('s') ? clamp(top+height+dy,top+minHeight,area.height) : top+height;
    if (edge.includes('w')) left = clamp(left+dx,0,right-minWidth);
    if (edge.includes('n')) top = clamp(top+dy,0,bottom-minHeight);
    width = right-left;
    height = bottom-top;
  }
  windowsListBounds = { left, top, width, height };
  layoutWindowsList();
});
app.addEventListener('lostpointercapture', event => {
  if (listDrag?.id === event.pointerId) listDrag = undefined;
});
window.addEventListener('resize', layoutWindowsList);

for (const dialog of [editor, utility]) {
  let drag;
  dialog.addEventListener('dblclick',event=>{if(event.target.closest('.dialog-title')&&!event.target.closest('button'))dialog.querySelector('[data-action=maximize-editor]')?.click();});
  dialog.addEventListener('pointerdown', event => {
    const title = event.target.closest('.dialog-title');
    const grip=event.target.closest('[data-resize]');
    if ((!title&&!grip) || event.target.closest('button') || event.button !== 0 || dialog.classList.contains('maximized')) return;
    const rect = dialog.getBoundingClientRect();
    const shiftX = parseFloat(dialog.style.getPropertyValue('--shift-x')) || 0;
    const shiftY = parseFloat(dialog.style.getPropertyValue('--shift-y')) || 0;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, rect, shiftX, shiftY, edge:grip?.dataset.resize };
    (grip??title).setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  dialog.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    const { x, y, rect, shiftX, shiftY,edge } = drag;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    if(edge){
      const dx=event.clientX-x,dy=event.clientY-y;
      const area=dialog===editor&&activeNativeWindow?app.querySelector('.windows-workspace').getBoundingClientRect():{left:4,top:4,right:innerWidth-4,bottom:innerHeight-4};
      const left=edge.includes('w')?clamp(rect.left+dx,area.left,rect.right-Math.min(340,rect.width)):rect.left;
      const right=edge.includes('e')?clamp(rect.right+dx,rect.left+Math.min(340,rect.width),area.right):rect.right;
      const top=edge.includes('n')?clamp(rect.top+dy,area.top,rect.bottom-Math.min(240,rect.height)):rect.top;
      const bottom=edge.includes('s')?clamp(rect.bottom+dy,rect.top+Math.min(240,rect.height),area.bottom):rect.bottom;
      dialog.style.width=`${right-left}px`;dialog.style.height=`${bottom-top}px`;
      const changed=dialog.getBoundingClientRect();
      dialog.style.setProperty('--shift-x',`${(parseFloat(dialog.style.getPropertyValue('--shift-x'))||0)+left-changed.left}px`);
      dialog.style.setProperty('--shift-y',`${(parseFloat(dialog.style.getPropertyValue('--shift-y'))||0)+top-changed.top}px`);
      return;
    }
    const area=dialog===editor&&activeNativeWindow?app.querySelector('.windows-workspace').getBoundingClientRect():{left:0,top:0,right:document.documentElement.clientWidth,bottom:innerHeight};
    const dx = clamp(event.clientX - x, area.left - rect.left, Math.max(area.left-rect.left,area.right-rect.right));
    const dy = clamp(event.clientY - y, area.top - rect.top, Math.max(area.top-rect.top,area.bottom-rect.bottom));
    dialog.style.setProperty('--shift-x', `${shiftX + dx}px`);
    dialog.style.setProperty('--shift-y', `${shiftY + dy}px`);
  });
  dialog.addEventListener('lostpointercapture', () => { drag = undefined; });
}

window.addEventListener('resize', () => {
  for (const dialog of [editor, utility]) {
    dialog.style.removeProperty('--shift-x');
    dialog.style.removeProperty('--shift-y');
  }
});
window.addEventListener('popstate', () => {
  const next = location.hash === '#windows' ? 'windows' : 'web';
  if (!setMode(next, false)) history.replaceState(null, '', modeHash(mode));
});
window.addEventListener('beforeunload', event => {
  if (hasUnsavedEditor(draft, editor) || [...nativeWindows.values()].some(saved => hasUnsavedEditor(saved.draft, saved.fragment))) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('storage', event => {
  if (event.key === storageKey && event.newValue) {
    try {
      state = readState(event.newValue);
      replaceDamagedState = false;
      render();
    } catch {
      replaceDamagedState = true;
      render();
    }
  }
});

function exportVisibleTable(title) {
  const visible = [...app.querySelectorAll('table')].find(table=>table.getBoundingClientRect().width>0);
  if(!visible)return;
  const rows = [...visible.rows].map(row=>[...row.cells].map(cell=>cell.innerText.trim())).map(row=>row.at(-1)===''?row.slice(0,-1):row);
  exportWorkbook(title,rows);
}

function exportWorkbook(title,rows) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook,worksheet,'Přehled');
  XLSX.writeFile(workbook,`${title.replace(/[^\p{L}\p{N} -]/gu,'')}.xls`,{bookType:'biff8'});
  notify('Export ukázkových dat je připravený.');
}

const session=createSession({getState:()=>state,e,button,render,notify});
const reports=createReports({getState:()=>state,getVenues:()=>venues,getUser:session.user,e,button,table,number,render,exportWorkbook});
const management = createManagement({e,button,table,number,getState:()=>state,getUser:session.user,write:performWrite,render,notify,showUtility,confirm,exportTable:exportWorkbook,canManage:session.canManage});
const webLists=createWebLists({e,button,table,number,getState:()=>state,getVenues:()=>venues,getMachines,showUtility,render,exportWorkbook,canManage:session.canManage,openMachine:venue=>management.open('machine',undefined,venue),openCash:(venue,id)=>{webVenue=venue;openEditor('cash',id);}});
const machineDetail=createMachineDetail({e,button,table,number,getState:()=>state,getVenues:()=>venues,getMachines,render,showUtility,write:performWrite,notify,exportWorkbook,canManage:session.canManage,navigate:()=>{webView='machine-detail';render();},authorize:(current,record)=>{authorizeRecord(current,'settlement',record,'web');authorizeRecord(current,'cash',record,'web');}});
const administrationTools = createAdministrationTools({e,button,table,number,getState:()=>state,write:performWrite,render,notify,showUtility,confirm,canManage:session.canManage,getUser:session.user,exportTable:exportWorkbook});
const userDetail=createUserDetail({e,button,table,number,getState:()=>state,getUser:session.user,canManage:session.canManage,showUtility,write:performWrite,render,notify,signInAs:session.signInAs,openMessages:administrationTools.openMessages,listing:management.listing});
const calendars = installCalendars();
render();
