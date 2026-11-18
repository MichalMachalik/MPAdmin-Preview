const schemaVersion = 1;

export const venues = Object.freeze([
  { id: 'demo-small', name: 'DEMO – Malá provozovna', street: 'Ukázková 12', town: 'Modelov', postal: '000 01', count: 6, cash: 150000 },
  { id: 'demo-large', name: 'DEMO – Velká provozovna', street: 'Zkušební 48', town: 'Modelov', postal: '000 02', count: 500, cash: 500000 },
]);

export const categories = Object.freeze(['Bar', 'Kuchyně', 'Ostatní']);
const machineTypes = ['VLT', 'VHP', 'Ruleta', 'Živá hra'];
const machineCache = new Map(venues.map(venue => {
  const machines = Array.from({ length: venue.count }, (_, index) => Object.freeze({
    id: `${venue.id}-${index + 1}`,
    localId: index + 1,
    order: index + 1,
    number: 8100 + ((index * 137 + 42) % 1009),
    type: machineTypes[index % machineTypes.length],
    model: `Demo ${String.fromCharCode(65 + index % machineTypes.length)}`,
    label: `DEMO stroj ${index + 1}`,
  }));
  return [venue.id, Object.freeze(machines)];
}));

const entryLists = { settlement: 'settlements', cash: 'cash' };
const maxValue = 100_000_000_000;

export function getVenue(venueId, state) {
  const venue = (state?.venues ?? venues).find(entry => entry.id === venueId);
  if (!venue) throw new Error('Vyberte platnou provozovnu.');
  return venue;
}

export function getMachines(venueId, state) {
  getVenue(venueId, state);
  return state?.machines?.[venueId] ?? machineCache.get(venueId) ?? [];
}

export function parseMoney(value) {
  const text = String(value).trim().replace(/[\s\u00a0\u202f]/gu, '');
  if (!/^[+-]?\d+(?:[.,]\d{1,2})?$/.test(text)) return NaN;
  const [whole, fraction = ''] = text.replace(/^[+-]/, '').split(/[.,]/);
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= maxValue ? (text.startsWith('-') ? -cents : cents) : NaN;
}

export function dateIsValid(date) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function nextDay(day) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function requireDate(date) {
  if (!dateIsValid(date)) throw new Error('Zadejte platné datum.');
}

function requireAmount(amount, label) {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > maxValue) {
    throw new Error(`${label} musí být nezáporná částka s nejvýše dvěma desetinnými místy.`);
  }
}

export function rowAmounts(row) {
  const input = row.inEnd - row.inStart;
  const output = row.outEnd - row.outStart;
  const money = row.money ?? input;
  return { input, output, money, difference: money - input, yield: money - output };
}

export function totalsFor(settlement) {
  const totals = { input: 0, output: 0, money: 0, difference: 0, yield: 0, income: 0, expense: 0, remittance: 0 };
  for (const row of settlement.rows) {
    const amounts = rowAmounts(row);
    for (const key of Object.keys(amounts)) totals[key] += amounts[key];
  }
  for (const row of [settlement.adjustments, ...Object.values(settlement.additionalAdjustments ?? {})].flat()) {
    totals.income += row.income;
    totals.expense += row.expense;
  }
  totals.remittance = totals.yield + totals.income - totals.expense;
  return totals;
}

export function emptyAdjustments(state, venueId) {
  const items = state?.administration?.adjustments.filter(item => item.venue === venueId).sort((a,b) => a.order-b.order).map(item => item.name) ?? categories;
  return items.map(category => ({ category, income: 0, expense: 0, note: '' }));
}

export function settlementDates(record) {
  requireDate(record.from);
  requireDate(record.to);
  if (record.to < record.from) throw new Error('Datum Do nesmí být před datem Od.');
  const days = [];
  for (let day = record.from; day <= record.to; day = nextDay(day)) days.push(day);
  return days;
}

export function changeSettlementPeriod(record, from, to) {
  const days = settlementDates({from, to});
  const previous = { [record.from]: record.adjustments, ...record.additionalAdjustments };
  for (const [day, rows] of Object.entries(previous)) {
    if (!days.includes(day) && rows.some(row => row.income || row.expense || row.note)) {
      throw new Error(`Den ${day.split('-').reverse().join('.')} obsahuje příjmy nebo výdaje. Nejprve je upravte, aby změna období nesmazala zadané hodnoty.`);
    }
  }
  const blank = () => record.adjustments.map(row => ({category:row.category,income:0,expense:0,note:''}));
  const byDay = Object.fromEntries(days.map(day => [day, previous[day] ?? blank()]));
  record.from = from;
  record.to = to;
  record.adjustments = byDay[from];
  delete byDay[from];
  record.additionalAdjustments = byDay;
  return record;
}

function newRows(venueId, previous, state, history = []) {
  return getMachines(venueId, state).filter(machine => !machine.deleted).slice().sort((a,b) => a.order-b.order).map((machine, index) => {
    const priorRecord=previous?.rows.some(row=>row.machine===machine.id)?previous:history.find(record=>record.rows.some(row=>row.machine===machine.id));
    const prior = priorRecord?.rows.find(row => row.machine === machine.id);
    const override=machine.counterAfter&&machine.counterAfter===priorRecord?.id;
    const inStart = machine.reset ? 0 : override ? machine.initialIn : prior?.inEnd ?? machine.initialIn ?? 900000 + (index * 9170) % 1300000;
    const outStart = machine.reset ? 0 : override ? machine.initialOut : prior?.outEnd ?? machine.initialOut ?? 470000 + (index * 4720) % 600000;
    return { machine: machine.id, inStart, inEnd: inStart, outStart, outEnd: outStart, money: null, note: '' };
  });
}

function seedSettlements(venue) {
  const dates = ['2026-11-09', '2026-11-10', '2026-11-11'];
  const result = [];
  dates.forEach((date, day) => {
    const rows = newRows(venue.id, result.at(-1));
    rows.forEach((row, index) => {
      row.inEnd += 100 * (64 + ((index * 57 + day * 31) % 410));
      row.outEnd += 100 * (12 + ((index * 19 + day * 23) % 67));
      if (index % 17 === 5) row.money = row.inEnd - row.inStart - 500;
    });
    const adjustments = emptyAdjustments();
    adjustments[0].income = (280 + day * 32) * 100;
    adjustments[1].expense = (96 + day * 10) * 100;
    result.push({
      id: `sample-settlement-${venue.id}-${day + 1}`, venue: venue.id,
      from: date, to: date, rows, adjustments, revision: 1, source: day === 1 ? 'windows' : 'web',
    });
  });
  return result;
}

function seedCash(venue) {
  return [
    ['2026-11-09', 'income', 120000, 'Doplnění provozní hotovosti'],
    ['2026-11-10', 'expense', 36050, 'Ukázkový výdaj na provoz'],
    ['2026-11-11', 'income', 114975, 'Příjem do pokladny'],
  ].map(([date, direction, amount, description], index) => ({
    id: `sample-cash-${venue.id}-${index + 1}`, venue: venue.id, date, direction, amount, description, revision: 1, source: 'web',
  }));
}

export function initialState() {
  return {
    version: schemaVersion,
    venues: venues.map(venue=>({...venue,bookOpening:0})),
    machines: Object.fromEntries(venues.map(venue => [venue.id, structuredClone(getMachines(venue.id))])),
    administration: initialAdministration(),
    settlements: venues.flatMap(seedSettlements).map((entry,index)=>({...entry,serverId:index+1})),
    cash: venues.flatMap(seedCash).map((entry,index)=>({...entry,serverId:index+1})),
    queue: [],
  };
}

export function readState(value) {
  const state = JSON.parse(value);
  if (!state || state.version !== schemaVersion || !Array.isArray(state.settlements) ||
      !Array.isArray(state.cash) || !Array.isArray(state.queue)) {
    throw new Error('Uložená data ukázky nelze načíst.');
  }
  state.venues ??= structuredClone(venues);
  state.machines ??= Object.fromEntries(venues.map(venue => [venue.id, structuredClone(getMachines(venue.id))]));
  state.administration ??= initialAdministration();
  const defaults = initialAdministration();
  for (const key of ['catalogs','catalogDetails','messages','cashHistory']) state.administration[key] ??= defaults[key];
  state.administration.assignments ??= state.administration.users.flatMap(user=>user.venues.map(venue=>({id:`${user.id}/${venue}`,user:user.id,venue,group:groupsForUser(user)[0],from:'',to:''})));
  state.administration.bookVenues ??= state.administration.books.flatMap(book=>(book.venues??[]).map(venue=>({id:`${book.id}/${venue}`,book:book.id,venue,cash:true,manager:true,noncash:false})));
  for (const list of ['settlements','cash']) state[list].forEach((entry,index)=>{entry.serverId ??= index+1;});
  for (const type of Object.keys(entryLists)) {
    const entries = state[entryLists[type]];
    if (new Set(entries.map(entry => entry?.id)).size !== entries.length) throw new Error('Uložená data obsahují duplicitní záznam.');
    for (const entry of entries) validate(type, entry, state);
  }
  const queued = new Set();
  for (const item of state.queue) {
    validate(item.type, item.record, state);
    const key = `${item.type}/${item.record.id}`;
    if (queued.has(key) || !Number.isSafeInteger(item.version ?? 0) || (item.version ?? 0) < 0) {
      throw new Error('Uložená fronta obsahuje neplatný nebo duplicitní záznam.');
    }
    queued.add(key);
  }
  return state;
}

export function records(state, type, venueId, includePending = false) {
  const entries = new Map(state[entryLists[type]].filter(entry => !venueId || entry.venue === venueId).map(entry => [entry.id, entry]));
  if (includePending) {
    for (const item of state.queue) {
      if (item.type === type && (!venueId || item.record.venue === venueId)) {
        entries.set(item.record.id, { ...item.record, pending: true, pendingVersion: item.version ?? 0 });
      }
    }
  }
  const order = new Map(state[entryLists[type]].map((entry,index)=>[entry.id,entry.serverId??index+1]));
  return [...entries.values()].reverse().sort((a,b)=>(order.get(b.id)??Number.MAX_SAFE_INTEGER)-(order.get(a.id)??Number.MAX_SAFE_INTEGER));
}

export function newSettlement(state, venueId, includePending) {
  const previous = records(state, 'settlement', venueId, includePending)[0];
  const date = previous ? nextDay(previous.to) : '2026-11-09';
  const rows = newRows(venueId, previous, state,records(state,'settlement',venueId,includePending));
  const adjustments = emptyAdjustments(state, venueId);
  return {
    id: crypto.randomUUID(), venue: venueId, from: date, to: date, revision: 0,
    rows, machineIds: rows.map(row => row.machine), adjustments,
    adjustmentCategories: adjustments.map(row => row.category),
  };
}

export function newCashRecord(state, venueId, includePending) {
  const date = records(state, 'settlement', venueId, includePending)[0]?.to ?? '2026-11-09';
  return { id: crypto.randomUUID(), venue: venueId, date, direction: 'income', description: '', amount: 0, revision: 0 };
}

export function cashAmounts(record) {
  return {income:record.income??(record.direction==='income'?record.amount:0),expense:record.expense??(record.direction==='expense'?record.amount:0)};
}

function validate(type, record, state) {
  if (!Object.hasOwn(entryLists, type) || typeof record?.id !== 'string' || !record.id ||
      !Number.isSafeInteger(record.revision) || record.revision < 0) {
    throw new Error('Záznam má neplatnou identitu.');
  }
  const venue = getVenue(record.venue, state);
  if (type === 'cash') {
    requireDate(record.date);
    requireAmount(record.amount, 'Částka');
    const linked = typeof record.settlementId === 'string' && (record.id === `book-${record.settlementId}` || record.id.startsWith(`book-${record.settlementId}-`));
    const amounts=cashAmounts(record);requireAmount(amounts.income,'Příjem');requireAmount(amounts.expense,'Výdej');
    if(amounts.income<0||amounts.expense<0||(!amounts.income&&!amounts.expense&&!linked)||!['income','expense'].includes(record.direction))throw new Error('Zadejte nezáporné částky a alespoň jeden pohyb větší než nula.');
    if (typeof record.description !== 'string' || (record.source!=='web'&&!record.description.trim()) || record.description.length > 100) throw new Error('Zadejte text záznamu (nejvýše 100 znaků).');
    if (!['cash','manager','noncash'].includes(record.book ?? 'cash')) throw new Error('Vyberte platnou pokladní knihu.');
    return;
  }
  requireDate(record.from);
  requireDate(record.to);
  if (record.to < record.from) throw new Error('Datum Do nesmí být před datem Od.');
  const expectedMachines = record.machineIds ?? getMachines(record.venue).map(machine => machine.id);
  if (!Array.isArray(record.rows) || record.rows.length !== expectedMachines.length || new Set(expectedMachines).size !== expectedMachines.length) throw new Error('Ve vyúčtování chybí některý ze strojů.');
  const machines = getMachines(record.venue, state);
  record.rows.forEach((row, index) => {
    const machine = machines.find(item => item.id === row.machine);
    if (!machine || row.machine !== expectedMachines[index]) throw new Error('Nesouhlasí seznam strojů provozovny.');
    const label = `Stroj ${machine.number}`;
    for (const key of ['inStart', 'inEnd', 'outStart', 'outEnd']) requireAmount(row[key], label);
    if (row.money !== null) requireAmount(row.money, `${label}, Peníze`);
    for (const key of ['mechanicalIn','mechanicalOut']) {
      if (row[key] != null && (typeof row[key] !== 'string' || row[key].length > 100)) {
        if (typeof row[key] === 'number') requireAmount(row[key], `${label}, Mechanika ${key==='mechanicalIn'?'IN':'OUT'}`);
        else throw new Error(`${label}: Mechanika může mít nejvýše 100 znaků.`);
      }
    }
    if (row.inEnd < row.inStart || row.outEnd < row.outStart) throw new Error(`${label}: Konec čítače nesmí být nižší než Počátek.`);
    if (typeof row.note !== 'string' || row.note.length > 100) throw new Error(`${label}: Poznámka může mít nejvýše 100 znaků.`);
  });
  const expectedCategories = record.adjustmentCategories ?? categories;
  if (!Array.isArray(record.adjustments) || record.adjustments.length !== expectedCategories.length) {
    throw new Error('Chybí položky příjmů a výdajů.');
  }
  const additional = Object.entries(record.additionalAdjustments ?? {});
  if (additional.some(([day]) => !dateIsValid(day) || day <= record.from || day > record.to)) throw new Error('Příjmy a výdaje jsou mimo zvolené období.');
  for (const rows of [record.adjustments, ...additional.map(([,rows])=>rows)]) {
    if (!Array.isArray(rows) || rows.length !== expectedCategories.length) throw new Error('Chybí denní položky příjmů a výdajů.');
    rows.forEach((row, index) => {
    if (row.category !== expectedCategories[index]) throw new Error('Neplatná položka příjmů a výdajů.');
    requireAmount(row.income, `${row.category}, příjem`);
    requireAmount(row.expense, `${row.category}, výdaj`);
    if (typeof row.note !== 'string' || row.note.length > 100) throw new Error('Poznámka může mít nejvýše 100 znaků.');
    });
  }
}

function requireFreePeriod(entries, record) {
  if (entries.some(entry => entry.id !== record.id && entry.venue === record.venue &&
       entry.from <= record.to && record.from <= entry.to &&
       (entry.rows.some(row=>record.rows.some(candidate=>candidate.machine===row.machine)) || entry.adjustments.some(row=>record.adjustments.some(candidate=>candidate.category===row.category))))) {
    throw new Error('Pro zvolené období už tato provozovna má vyúčtování.');
  }
}

function applyToServer(state, type, record) {
  const entries = state[entryLists[type]];
  const index = entries.findIndex(entry => entry.id === record.id);
  const existing = entries[index];
  if ((existing?.revision ?? 0) !== record.revision || (existing && existing.venue !== record.venue && !(type==='cash'&&record.source==='web'))) {
    throw new Error('Záznam se mezitím změnil. Otevřete jej znovu a porovnejte hodnoty.');
  }
  if (type === 'settlement') requireFreePeriod(entries, record);
  const serverId = existing?.serverId ?? (index>=0 ? index+1 : Math.max(0,...entries.map((entry,i)=>entry.serverId??i+1))+1);
  const updated = { ...record, serverId, revision: record.revision + 1 };
  if (index === -1) entries.push(updated);
  else entries[index] = updated;
  if(type==='settlement'&&records(state,type,record.venue)[0]?.id===record.id)for(const machine of getMachines(record.venue,state))if(record.rows.some(row=>row.machine===machine.id))delete machine.counterAfter;
  state.administration.revision++;
  state.administration.archive.unshift({id:crypto.randomUUID(),date:new Date().toISOString(),event:type==='settlement'?'Uložení vyúčtování':'Uložení záznamu pokladní knihy',user:record.modifiedBy??'demo-operátor'});
}

export function saveRecord(state, type, record, source) {
  const updated = structuredClone(state);
  const { pending, pendingVersion = 0, ...entry } = structuredClone(record);
  entry.source = source;
  validate(type, entry, updated);
  if (source === 'windows') {
    const index = updated.queue.findIndex(candidate => candidate.type === type && candidate.record.id === entry.id);
    const queued = updated.queue[index];
    const existing = queued?.record ?? updated[entryLists[type]].find(candidate => candidate.id === entry.id);
    if ((existing?.revision ?? 0) !== entry.revision ||
        (existing && existing.venue !== entry.venue) || pendingVersion !== (queued?.version ?? 0)) {
      throw new Error('Záznam se mezitím změnil. Otevřete jej znovu a porovnejte hodnoty.');
    }
    if (type === 'settlement') requireFreePeriod(records(updated, type, entry.venue, true), entry);
    const item = { type, record: entry, version: (queued?.version ?? 0) + 1 };
    if (index === -1) updated.queue.push(item);
    else updated.queue[index] = item;
  } else {
    applyToServer(updated, type, entry);
  }
  return updated;
}

export function saveMachineReading(state, record, machineId) {
  const original=state.settlements.find(item=>item.id===record.id),row=record.rows.find(item=>item.machine===machineId);
  if(!row)throw new Error('Vyberte platný automat.');
  let current=state,entry=structuredClone(record);
  if(original&&(original.from!==record.from||original.to!==record.to)){
    if(original.revision!==record.revision)throw new Error('Záznam se mezitím změnil. Otevřete jej znovu a porovnejte hodnoty.');
    const retained=structuredClone(original);retained.rows=retained.rows.filter(item=>item.machine!==machineId);retained.machineIds=retained.rows.map(item=>item.machine);
    current=saveSettlementToBook(current,retained,'web');
    entry.id=crypto.randomUUID();entry.revision=0;delete entry.serverId;
  }
  if(!original||entry.id!==original.id){entry.rows=[structuredClone(row)];entry.machineIds=[machineId];entry.adjustments=[];entry.adjustmentCategories=[];entry.additionalAdjustments={};}
  return saveSettlementToBook(current,entry,'web');
}

export function synchronize(state) {
  const updated = structuredClone(state);
  for (const item of updated.queue) {
    validate(item.type, item.record, updated);
    applyToServer(updated, item.type, item.record);
  }
  updated.queue = [];
  return updated;
}

export function saveSettlementToBook(state, record, source='windows') {
  if(source==='windows'&&record.revision>0)throw new Error('Odeslané vyúčtování je v aplikaci pouze ke čtení.');
  let updated = saveRecord(state, 'settlement', record, source);
  const prior=records(state,'cash',record.venue,true).filter(entry=>entry.settlementId===record.id);
  const generated=[];
  for(const day of settlementDates(record))for(const row of day===record.from?record.adjustments:record.additionalAdjustments[day]){
    const id=`book-${record.id}-adjustment-${day}-${encodeURIComponent(row.category)}`;
    if(row.income||row.expense||source==='web'&&prior.some(entry=>entry.id===id))generated.push({id,date:day,income:row.income,expense:row.expense,kind:row.category,description:row.note||row.category});
  }
  const types=new Map(),machines=getMachines(record.venue,state);
  for(const row of record.rows){const type=machines.find(machine=>machine.id===row.machine).type;types.set(type,(types.get(type)??0)+rowAmounts(row).yield);}
  const shortDate=value=>`${Number(value.slice(8))}.${Number(value.slice(5,7))}`;
  const period=record.from===record.to?shortDate(record.to):`${shortDate(record.from)} - ${shortDate(record.to)}`;
  for(const [type,amount]of types){
    const id=`book-${record.id}-machine-${encodeURIComponent(type)}`;
    if(amount||source==='web'&&prior.some(entry=>entry.id===id))generated.push({id,date:record.to,income:Math.max(0,amount),expense:Math.max(0,-amount),kind:`Tržba ${type}`,description:source==='web'?`Tržba ${period}`:`${['VLT','VHP','Ruleta'].includes(type)?'Vyúčtování':'Tržba'} ${type} ${period}`});
  }
  const ids=new Set(generated.map(entry=>entry.id));
  updated.queue=updated.queue.filter(item=>item.type!=='cash'||item.record.settlementId!==record.id||ids.has(item.record.id));
  if(source==='web')updated.cash=updated.cash.filter(entry=>entry.settlementId!==record.id||ids.has(entry.id));
  for(const entry of generated){
    const previous=records(updated,'cash',record.venue,true).find(row=>row.id===entry.id);
    updated=saveRecord(updated,'cash',{...entry,settlementId:record.id,venue:record.venue,revision:previous?.revision??0,pendingVersion:previous?.pendingVersion??0,direction:entry.income>=entry.expense?'income':'expense',amount:Math.abs(entry.income-entry.expense),modifiedBy:record.modifiedBy},source);
  }
  return updated;
}

export function cashWithBalances(state, venueId, includePending, book = 'cash') {
  const entries = records(state, 'cash', venueId, includePending).filter(entry=>(entry.book??'cash')===book).reverse();
  const venue = getVenue(venueId, state);
  let balance = book==='cash' ? venue.bookOpening ?? venue.cash : 0;
  return entries.map(entry => {
    const amounts=cashAmounts(entry);balance += amounts.income-amounts.expense;
    return { ...entry, balance };
  }).reverse();
}

export function deleteRecord(state,type,id,revision) {
  const list=entryLists[type];
  if(!list)throw new Error('Neplatný typ záznamu.');
  const record=state[list].find(item=>item.id===id);
  if(!record||record.revision!==revision)throw new Error('Záznam se mezitím změnil. Obnovte přehled.');
  if(state.queue.some(item=>item.record.id===id||item.record.settlementId===id))throw new Error('Záznam má neodeslané změny v aplikaci. Nejprve je odešlete.');
  const updated=structuredClone(state);
  updated[list]=updated[list].filter(item=>item.id!==id);
  if(type==='settlement')updated.cash=updated.cash.filter(item=>item.settlementId!==id);
  updated.administration.archive.unshift({id:crypto.randomUUID(),date:new Date().toISOString(),event:type==='cash'?'Smazání záznamu pokladní knihy':'Smazání vyúčtování',user:'demo-operátor'});
  updated.administration.revision++;
  return updated;
}

export const denominations = Object.freeze([5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1]);

export const userGroups=['Admins','Provozní','Manažer','Pokladní','Majitel','Man. Ruleta','Man. Zařízení','Provozní plus','Manažer plus','Náhled','Recepční kasino'];
export const groupsForUser=user=>user.groups??[({'Admin':'Admins','Správce':'Provozní','Pokladník':'Pokladní'})[user.role]??user.role];
export const roleForGroups=groups=>groups.includes('Admins')?'Admin':groups.some(group=>['Provozní','Provozní plus','Manažer','Manažer plus'].includes(group))?'Správce':groups.includes('Náhled')&&!groups.includes('Pokladní')?'Náhled':'Pokladník';
function initialAdministration() {
  return {
    revision: 0,
    users: [
      { id: 'demo-operator', nick: 'demo-operátor', first: 'Ukázkový', last: 'Správce', email: '', phone: '', role: 'Admin', blocked: false, note: '', venues: venues.map(item=>item.id) },
      { id: 'demo-cashier', nick: 'demo-pokladník', first: 'Ukázková', last: 'Obsluha', email: '', phone: '', role: 'Pokladník', blocked: false, note: '', venues: ['demo-small'] },
    ],
    adjustments: venues.flatMap(venue => categories.map((name,index)=>({ id:`${venue.id}-adjustment-${index}`, venue:venue.id, name, order:index+1 }))),
    assignments: [...venues.map(venue=>({id:`demo-operator/${venue.id}`,user:'demo-operator',venue:venue.id,group:'Provozní',from:'',to:''})),{id:'demo-cashier/demo-small',user:'demo-cashier',venue:'demo-small',group:'Pokladní',from:'',to:''}],
    treasury: venues.map(venue=>({ id:`${venue.id}-treasury`, venue:venue.id, date:'2026-11-11', note:'Ukázkový stav trezoru', counts:denominations.map(value=>value===1000?2:value===100?5:0) })),
    movements: [],
    cashHistory: [],
    messages: [],
    catalogDetails: {},
    catalogs: {
      'Automat barva': ['Bez barvy','Červená','Modrá'],
      'Typ automatu': ['VLT','VHP','Ruleta','Poker','AMR','B.Jack','Živá hra'],
      'Automat výrobce': ['Demo výrobce'],
      'Automat model': ['Demo A','Demo B','Demo C','Demo D'],
      'Kniha pohyb': ['Příjem','Výdej','Odvod vyúčtování'],
      'Typ provozovny': ['Casino','Herna','Pokladna'],
      'Provozovatel': ['Demo provozovatel'],
      'Příjem výdej': [...categories],
      'Trezor': ['Demo trezor'],
      'Typ pokrmu': ['Demo pokrm'],
      'Okruh Provozoven': ['Demo okruh'],
    },
    archive: [],
    notifications: [],
    applications: [{id:'demo-application', name:'Ukázkové PC', hardware:'DEMO-0000-0000', venue:'', blocked:false, cash:true, settlement:true, offline:true, version:'2.0.4'}],
    books: [{id:'demo-book', name:'Ukázková účetní kniha', note:'Smyšlená data', venues:venues.map(venue=>venue.id)}],
    bookVenues: venues.map(venue=>({id:`demo-book/${venue.id}`,book:'demo-book',venue:venue.id,cash:true,manager:true,noncash:false})),
  };
}

export function treasuryTotal(entry) {
  return denominations.reduce((sum, value, index)=>sum + value * 100 * entry.counts[index], 0);
}

export function treasuryBalance(state,venueId) {
  const safe=getVenue(venueId,state).safe??state.administration.catalogs.Trezor[0];
  return state.administration.treasury.filter(entry=>(entry.safe??getVenue(entry.venue,state).safe??state.administration.catalogs.Trezor[0])===safe).reduce((sum,entry)=>sum+treasuryTotal(entry),0);
}

export function administrativeWrite(state, expectedRevision, event, change) {
  if (state.administration.revision !== expectedRevision) throw new Error('Údaje se mezitím změnily. Otevřete formulář znovu.');
  const updated = structuredClone(state);
  change(updated);
  updated.administration.revision++;
  updated.administration.archive.unshift({ id:crypto.randomUUID(), date:new Date().toISOString(), event, user:'demo-operátor' });
  return updated;
}

export function saveMachines(state, venueId, entries, expectedRevision, batchId) {
  if (batchId && state.administration.imports?.includes(batchId)) return state;
  if (!entries.length || entries.length > 1000) throw new Error('Zadejte 1 až 1 000 automatů.');
  return administrativeWrite(state, expectedRevision, entries.length > 1 ? 'Hromadný import automatů' : 'Úprava automatu', updated => {
    const venue = getVenue(venueId, updated);
    const machines = getMachines(venueId, updated);
    const validTypes = updated.administration.catalogs['Typ automatu'];
    const ids = new Set();
    for (const entry of entries) {
      if (!entry.id || ids.has(entry.id)) throw new Error('Nesouhlasí identita automatů.');
      ids.add(entry.id);
      if (!Number.isInteger(entry.order) || entry.order < 1 || entry.order > 2147483647 ||
          entry.number !== null && (!Number.isInteger(entry.number) || entry.number < 0 || entry.number > 2147483647)) throw new Error('Pořadí a číslo musí být platná celá čísla.');
      if (!validTypes.includes(entry.type)) throw new Error('Vyberte typ automatu.');
      for (const value of [entry.initialIn, entry.initialOut]) requireAmount(value, 'Čítač');
      if (typeof entry.label !== 'string' || entry.label.length > 255 || typeof entry.note !== 'string' || entry.note.length > 65535) throw new Error('Označení nebo poznámka je příliš dlouhá.');
      const index = machines.findIndex(machine=>machine.id === entry.id);
      if (index < 0) machines.push({...entry,localId:Math.max(0,...machines.map((machine,index)=>machine.localId??index+1))+1}); else {
        const previous=records(updated,'settlement',venueId)[0];
        const prior=previous?.rows.find(row=>row.machine===entry.id);
        const counterAfter=prior&&(prior.inEnd!==entry.initialIn||prior.outEnd!==entry.initialOut)?previous.id:undefined;
        machines[index] = {...machines[index],...entry,counterAfter};
        if(!counterAfter)delete machines[index].counterAfter;
      }
      const dependency=updated.administration.catalogDetails['Automat model']?.[entry.model]?.dependency;
      if(dependency?.[0]==='Automat výrobce')machines.find(machine=>machine.id===entry.id).manufacturer=dependency[1];
    }
    venue.count = machines.filter(machine=>!machine.deleted).length;
    if (batchId) (updated.administration.imports ??= []).push(batchId);
  });
}
