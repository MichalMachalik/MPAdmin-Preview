import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cashWithBalances, getMachines, initialState, newCashRecord, newSettlement, parseMoney,
  readState, records, rowAmounts, saveRecord, saveSettlementToBook, synchronize, totalsFor, saveMachines, emptyAdjustments, administrativeWrite,
  changeSettlementPeriod, settlementDates,
  deleteRecord, cashAmounts, treasuryBalance, saveMachineReading,
} from '../docs/data.js';

test('individual machine readings preserve other counters and reject duplicate periods atomically',()=>{
  let state=initialState();const first=newSettlement(state,'demo-small',false),second=structuredClone(first);second.id=crypto.randomUUID();
  const firstId=first.rows[0].machine,secondId=second.rows[1].machine,secondStart=second.rows[1].inStart;
  first.rows[0].inEnd+=10000;second.rows[1].inEnd+=5000;
  state=saveMachineReading(state,first,firstId);state=saveMachineReading(state,second,secondId);
  const next=newSettlement(state,'demo-small',false);
  assert.equal(next.rows[0].inStart,first.rows[0].inEnd);assert.equal(next.rows[1].inStart,secondStart+5000);
  const before=JSON.stringify(state),duplicate=structuredClone(first);duplicate.id=crypto.randomUUID();
  assert.throws(()=>saveMachineReading(state,duplicate,firstId),/období/);assert.equal(JSON.stringify(state),before);
});

test('moving a cash record between venues updates the corresponding books and retains revision checks',()=>{
  let state=initialState(),entry=newCashRecord(state,'demo-small',false);entry.amount=12300;entry.description='Smyšlený přesun';state=saveRecord(state,'cash',entry,'web');
  const saved=structuredClone(state.cash.at(-1)),smallBefore=cashWithBalances(state,'demo-small')[0].balance,largeBefore=cashWithBalances(state,'demo-large')[0].balance;
  saved.venue='demo-large';const updated=saveRecord(state,'cash',saved,'web');
  assert.equal(cashWithBalances(updated,'demo-small')[0].balance,smallBefore-12300);assert.equal(cashWithBalances(updated,'demo-large')[0].balance,largeBefore+12300);
  assert.throws(()=>saveRecord(updated,'cash',saved,'web'),/mezitím/);assert.equal(state.cash.at(-1).venue,'demo-small');
});

test('moving one machine reading to another period leaves other machines and daily movements untouched',()=>{
  const state=initialState(),original=records(state,'settlement','demo-small')[0],edit=structuredClone(original),id=edit.rows[0].machine;
  edit.from=edit.to='2026-11-12';edit.rows[0].inEnd+=2000;
  const updated=saveMachineReading(state,edit,id),retained=updated.settlements.find(row=>row.id===original.id),moved=updated.settlements.at(-1);
  assert.equal(retained.to,original.to);assert.deepEqual(retained.rows,original.rows.slice(1));assert.deepEqual(retained.adjustments,original.adjustments);
  assert.equal(moved.to,'2026-11-12');assert.deepEqual(moved.rows,[edit.rows[0]]);assert.deepEqual(moved.adjustments,[]);
  const conflict=structuredClone(edit);conflict.from=conflict.to='2026-11-10';assert.throws(()=>saveMachineReading(state,conflict,id),/období/);assert.equal(state.settlements.find(row=>row.id===original.id).rows.length,6);
});

test('backdated latest confirmed settlement controls the next period and counters',()=>{
  let state=initialState();
  const backdated=newSettlement(state,'demo-small',false);
  changeSettlementPeriod(backdated,'2026-11-07','2026-11-07');
  backdated.rows[0].inEnd=1234567;
  state=saveRecord(state,'settlement',backdated,'web');
  const next=newSettlement(readState(JSON.stringify(state)),'demo-small',false);
  assert.equal(next.from,'2026-11-08');
  assert.equal(next.rows[0].inStart,1234567);
  assert.equal(records(state,'settlement','demo-small')[0].id,backdated.id);
  const historical=structuredClone(state.settlements[0]);historical.rows[0].inEnd+=100;
  state=saveRecord(state,'settlement',historical,'web');
  assert.equal(newSettlement(state,'demo-small',false).from,'2026-11-08');
});

test('cashbook retains separate income and expense and balances the net movement',()=>{
  const initial=initialState();
  const before=cashWithBalances(initial,'demo-small',false)[0].balance;
  const record={...newCashRecord(initial,'demo-small',false),date:'2026-11-14',income:10000,expense:2500,amount:7500,direction:'income',kind:'Demo bar',description:'Smíšený ukázkový pohyb'};
  const queued=saveRecord(initial,'cash',record,'windows');
  assert.equal(queued.cash.length,initial.cash.length);
  const saved=readState(JSON.stringify(synchronize(queued)));
  const row=cashWithBalances(saved,'demo-small',false)[0];
  assert.deepEqual(cashAmounts(row),{income:10000,expense:2500});
  assert.equal(row.balance,before+7500);
  assert.equal(row.kind,'Demo bar');
  assert.throws(()=>saveRecord(saved,'cash',{...row,expense:-1},'web'),/částk|Výdej/);
});

test('sample data is rebuilt deterministically with separate machine order and numbers', () => {
  const state = initialState();
  assert.equal(getMachines('demo-small').length, 6);
  const machines = getMachines('demo-large');
  assert.equal(machines.length, 500);
  assert.equal(new Set(machines.map(machine => machine.number)).size, 500);
  assert.notEqual(machines[0].number, machines[0].order);
  assert.deepEqual(readState(JSON.stringify(state)), initialState());
  assert.throws(() => readState('{}'), /nelze načíst/);
});

test('catalog counter corrections affect the next period without rewriting history',()=>{
  let state=initialState();
  const history=structuredClone(state.settlements);
  const machine={...getMachines('demo-small',state)[0],initialIn:50_00,initialOut:20_00,note:''};
  state=saveMachines(state,'demo-small',[machine],state.administration.revision);
  let draft=newSettlement(state,'demo-small',false);
  assert.equal(draft.rows[0].inStart,50_00);
  assert.deepEqual(state.settlements,history);
  draft.rows[0].inEnd=80_00;
  state=saveRecord(state,'settlement',draft,'web');
  draft=newSettlement(state,'demo-small',false);
  assert.equal(draft.rows[0].inStart,80_00);
});

test('record deletion checks revisions and pending data, and removes linked cash atomically',()=>{
  const initial=initialState();
  const draft=newSettlement(initial,'demo-small',true);draft.rows[0].inEnd+=500;
  let state=saveSettlementToBook(initial,draft);
  const pending=structuredClone(state);
  const existing=state.cash[0];
  assert.throws(()=>deleteRecord(state,'cash',existing.id,existing.revision+1),/mezitím/);
  assert.deepEqual(state,pending);
  state=synchronize(state);
  const record=records(state,'settlement','demo-small')[0];
  const queued=saveRecord(state,'settlement',record,'windows');
  assert.throws(()=>deleteRecord(queued,'settlement',record.id,record.revision),/neodeslané/);
  state=deleteRecord(state,'settlement',record.id,record.revision);
  assert.equal(state.settlements.some(item=>item.id===record.id),false);
  assert.equal(state.cash.some(item=>item.settlementId===record.id),false);
  assert.deepEqual(state.settlements,initial.settlements);
});

test('multi-day settlements preserve individual daily amounts across save and reload', () => {
  let state=initialState();
  const draft=newSettlement(state,'demo-small',false);
  changeSettlementPeriod(draft,'2026-11-12','2026-11-14');
  assert.deepEqual(settlementDates(draft),['2026-11-12','2026-11-13','2026-11-14']);
  draft.adjustments[0].income=10025;
  draft.additionalAdjustments['2026-11-13'][1].expense=755;
  draft.additionalAdjustments['2026-11-14'][2].income=200;
  draft.rows[0].note='Mechanický čítač 123';
  draft.rows[0].mechanicalOut='Výměna počítadla';
  const before=structuredClone(draft);
  assert.throws(()=>changeSettlementPeriod(draft,'2026-11-12','2026-11-13'),/obsahuje příjmy/);
  assert.deepEqual(draft,before);
  assert.equal(totalsFor(draft).remittance,9470);
  state=readState(JSON.stringify(saveRecord(state,'settlement',draft,'windows')));
  state=synchronize(state);
  const reopened=records(state,'settlement','demo-small')[0];
  assert.equal(reopened.additionalAdjustments['2026-11-13'][1].expense,755);
  assert.equal(reopened.rows[0].mechanicalOut,'Výměna počítadla');
  assert.equal(totalsFor(reopened).remittance,9470);
  assert.equal(newSettlement(state,'demo-small',false).from,'2026-11-15');
});

test('ordinary, managerial and noncash books do not change operational cash or each other',()=>{
  let state=initialState();
  const before=cashWithBalances(state,'demo-small',false)[0].balance;
  const entry={...newCashRecord(state,'demo-small',false),book:'manager',amount:20000,description:'Ukázkový manažerský příjem'};
  state=saveRecord(state,'cash',entry,'web');
  assert.equal(cashWithBalances(state,'demo-small',false,'manager')[0].balance,20000);
  assert.equal(cashWithBalances(state,'demo-small',false,'noncash').length,0);
  assert.equal(cashWithBalances(state,'demo-small',false)[0].balance,before);
  assert.equal(state.venues[0].cash,150000);
});

test('meter changes, explicit zero and corresponding remittance are independent', () => {
  const state = initialState();
  const settlement = newSettlement(state, 'demo-small', false);
  assert.equal(settlement.from, '2026-11-12');
  const row = settlement.rows[0];
  row.inEnd += parseMoney('123,45');
  row.outEnd += parseMoney('10,05');
  assert.deepEqual(rowAmounts(row), { input: 12345, output: 1005, money: 12345, difference: 0, yield: 11340 });
  row.money = 0;
  settlement.adjustments[0].income = parseMoney('1 023,40');
  settlement.adjustments[1].expense = parseMoney('20,40');
  const saved = saveRecord(state, 'settlement', settlement, 'web');
  const reopened = records(readState(JSON.stringify(saved)), 'settlement', 'demo-small')[0];
  assert.equal(reopened.rows[0].money, 0);
  assert.equal(rowAmounts(reopened.rows[0]).difference, -12345);
  assert.equal(totalsFor(reopened).remittance, 99295);
  assert.ok(Number.isNaN(parseMoney('0.001')));
});

test('invalid and incomplete settlements leave all confirmed and queued data untouched', () => {
  const state = initialState();
  const settlement = newSettlement(state, 'demo-large', false);
  const before = JSON.stringify(state);
  const partial = structuredClone(settlement);
  partial.rows.pop();
  assert.throws(() => saveRecord(state, 'settlement', partial, 'web'), /chybí/);
  settlement.rows.at(-1).outEnd = settlement.rows.at(-1).outStart - 100;
  assert.throws(() => saveRecord(state, 'settlement', settlement, 'windows'), /Konec čítače/);
  settlement.rows.at(-1).outEnd += 100;
  settlement.from = settlement.to = '2026-11-11';
  assert.throws(() => saveRecord(state, 'settlement', settlement, 'web'), /už.*vyúčtování/);
  assert.equal(JSON.stringify(state), before);
});

test('offline entries are local until explicitly synchronized and repeated sends do not duplicate them', () => {
  const state = initialState();
  const draft = newSettlement(state, 'demo-small', true);
  draft.rows[0].inEnd += 100;
  draft.rows[0].mechanicalIn = parseMoney('42,50');
  draft.rows[0].mechanicalOut = null;
  let pending = saveRecord(state, 'settlement', draft, 'windows');
  const edited = records(pending, 'settlement', 'demo-small', true)[0];
  edited.rows[0].inEnd += 250;
  pending = saveRecord(pending, 'settlement', edited, 'windows');
  assert.equal(pending.queue.length, 1);
  assert.equal(records(pending, 'settlement', 'demo-small').length, 3);
  assert.equal(records(pending, 'settlement', 'demo-small', true)[0].pending, true);
  assert.equal(records(pending, 'settlement', 'demo-large', true).length, 3);
  const posted = synchronize(readState(JSON.stringify(pending)));
  assert.equal(posted.queue.length, 0);
  const confirmed = records(posted, 'settlement', 'demo-small')[0];
  assert.equal(confirmed.revision, 1);
  assert.equal(confirmed.rows[0].mechanicalIn, 4250);
  assert.equal(confirmed.rows[0].mechanicalOut, null);
  assert.equal(rowAmounts(confirmed.rows[0]).input, 350);
  assert.deepEqual(synchronize(posted), posted);
  edited.rows[0].mechanicalOut = -100;
  assert.throws(() => saveRecord(pending, 'settlement', edited, 'windows'), /Mechanika OUT/);
});

test('a collision in a queued batch preserves even earlier changes in that batch', () => {
  const state = initialState();
  const latest = records(state, 'settlement', 'demo-small')[0];
  const cash = newCashRecord(state, 'demo-small', true);
  cash.description = 'Smyšlený výdaj v ukázce';
  cash.amount = 125;
  let queued = saveRecord(state, 'cash', cash, 'windows');
  queued = saveRecord(queued, 'settlement', latest, 'windows');
  const changed = saveRecord(queued, 'settlement', latest, 'web');
  const before = JSON.stringify(changed);
  assert.throws(() => synchronize(changed), /mezitím změnil/);
  assert.equal(JSON.stringify(changed), before);
  assert.equal(records(changed, 'cash', 'demo-small').length, 3);
});

test('editing an unsent settlement replaces its linked books without duplicate or obsolete rows', () => {
  let state = initialState();
  const draft = newSettlement(state, 'demo-small', true);
  draft.rows[0].inEnd += 3400;
  state = saveSettlementToBook(state, draft);
  const staged = cashWithBalances(state, 'demo-small', true);
  assert.equal(staged[0].amount, 3400);
  assert.equal(staged[0].balance - cashWithBalances(state, 'demo-small', false)[0].balance, 3400);
  const revised = records(state, 'settlement', 'demo-small', true)[0];
  revised.rows[0].inEnd = revised.rows[0].inStart;
  state = synchronize(saveSettlementToBook(state, revised));
  const confirmed = cashWithBalances(state, 'demo-small', false);
  assert.equal(confirmed.length, 3);
  assert.equal(confirmed[0].balance,cashWithBalances(initialState(),'demo-small',false)[0].balance);
  assert.throws(()=>saveSettlementToBook(state,records(state,'settlement','demo-small')[0]),/pouze ke čtení/);
});

test('settlements post machine types and daily movements separately, preserving both amounts',()=>{
  let state=initialState();const before=cashWithBalances(state,'demo-small',false)[0].balance;
  const draft=newSettlement(state,'demo-small',true);changeSettlementPeriod(draft,'2026-11-12','2026-11-13');
  draft.rows[0].inEnd+=10000;draft.rows[1].outEnd+=3000;
  draft.adjustments[0].income=2000;draft.adjustments[0].expense=500;
  draft.additionalAdjustments['2026-11-13'][1].expense=700;
  state=readState(JSON.stringify(synchronize(saveSettlementToBook(state,draft))));
  const lines=state.cash.filter(row=>row.settlementId===draft.id);
  assert.equal(lines.length,4);
  assert.deepEqual(cashAmounts(lines.find(row=>row.kind==='Bar')),{income:2000,expense:500});
  assert.equal(lines.find(row=>row.kind==='Kuchyně').date,'2026-11-13');
  assert.equal(lines.find(row=>row.kind==='Tržba VHP').expense,3000);
  assert.equal(cashWithBalances(state,'demo-small',false)[0].balance-before,7800);
  const edit=structuredClone(records(state,'settlement','demo-small')[0]);edit.rows[0].inEnd=edit.rows[0].inStart;
  state=saveSettlementToBook(state,edit,'web');
  assert.equal(state.cash.filter(row=>row.settlementId===draft.id).length,4);
  assert.equal(state.cash.find(row=>row.settlementId===draft.id&&row.kind==='Tržba VLT').amount,0);
});

test('backdated cash changes the latest balance by insertion order and shared safes sum movements',()=>{
  let state=initialState();const before=cashWithBalances(state,'demo-small',false)[0].balance;
  const cash={...newCashRecord(state,'demo-small',false),date:'2026-11-01',amount:10000,description:'Zpětný zápis'};
  state=saveRecord(state,'cash',cash,'web');
  assert.equal(cashWithBalances(state,'demo-small',false)[0].id,cash.id);
  assert.equal(cashWithBalances(state,'demo-small',false)[0].balance,before+10000);
  const safe=treasuryBalance(state,'demo-small');
  state.administration.treasury.push({venue:'demo-large',counts:[0,0,-1,0,0,0,0,0,0,0,0,0]});
  assert.equal(treasuryBalance(state,'demo-small'),safe-100000);
  assert.equal(treasuryBalance(state,'demo-large'),safe-100000);
});

test('an older offline form cannot overwrite a newer pending edit', () => {
  const state = initialState();
  let pending = saveRecord(state, 'settlement', newSettlement(state, 'demo-small', true), 'windows');
  const first = structuredClone(records(pending, 'settlement', 'demo-small', true)[0]);
  const second = structuredClone(first);
  first.rows[0].note = 'První uložená úprava';
  pending = saveRecord(pending, 'settlement', first, 'windows');
  const before = JSON.stringify(pending);
  second.rows[1].note = 'Starší otevřený formulář';
  assert.throws(() => saveRecord(pending, 'settlement', second, 'windows'), /mezitím změnil/);
  assert.equal(JSON.stringify(pending), before);
  assert.equal(records(pending, 'settlement', 'demo-small', true)[0].rows[0].note, 'První uložená úprava');
});

test('offline edits opened before a web update or a send must be reopened', () => {
  let state = initialState();
  const openForm = structuredClone(records(state, 'settlement', 'demo-small', true)[0]);
  const webChange = structuredClone(openForm);
  webChange.rows[0].note = 'Novější webový záznam';
  state = saveRecord(state, 'settlement', webChange, 'web');
  assert.throws(() => saveRecord(state, 'settlement', openForm, 'windows'), /mezitím změnil/);
  state = saveRecord(state, 'settlement', newSettlement(state, 'demo-small', true), 'windows');
  const pendingForm = structuredClone(records(state, 'settlement', 'demo-small', true)[0]);
  const confirmed = synchronize(state);
  assert.throws(() => saveRecord(confirmed, 'settlement', pendingForm, 'windows'), /mezitím změnil/);
});

test('previously stored pending records can still be edited and sent without losing data', () => {
  const state = initialState();
  const legacy = saveRecord(state, 'settlement', newSettlement(state, 'demo-small', true), 'windows');
  for (const item of legacy.queue) delete item.version;
  const loaded = readState(JSON.stringify(legacy));
  const reopened = structuredClone(records(loaded, 'settlement', 'demo-small', true)[0]);
  reopened.rows[0].note = 'Úprava původního uloženého záznamu';
  const confirmed = synchronize(saveRecord(loaded, 'settlement', reopened, 'windows'));
  assert.equal(records(confirmed, 'settlement', 'demo-small')[0].rows[0].note, reopened.rows[0].note);
});

test('machine import preserves historical rows and includes new machines in the next settlement', () => {
  const initial=initialState();
  const history=structuredClone(initial.settlements);
  const machine={id:'demo-import-1',order:7,number:9701,label:'Doplněný ukázkový stroj',type:'VLT',model:'Demo A',initialIn:123400,initialOut:56700,note:'',reset:false};
  const imported=saveMachines(initial,'demo-small',[machine],0,'sample-batch');
  const loaded=readState(JSON.stringify(imported));
  assert.deepEqual(loaded.settlements,history);
  assert.equal(getMachines('demo-small',loaded).length,7);
  const next=newSettlement(loaded,'demo-small',true);
  assert.equal(next.rows.length,7);
  assert.equal(next.rows[6].inStart,123400);
  const saved=saveRecord(loaded,'settlement',next,'windows');
  assert.equal(records(synchronize(saved),'settlement','demo-small')[0].rows.length,7);
  assert.deepEqual(saveMachines(imported,'demo-small',[machine],0,'sample-batch'),imported);
  assert.equal(initial.venues[0].count,6);
});

test('invalid imports and stale administration forms never partly modify the catalog', () => {
  const initial=initialState();
  const good={id:'demo-import-valid',order:7,number:9701,label:'Demo',type:'VLT',model:'Demo A',initialIn:0,initialOut:0,note:'',reset:false};
  const before=JSON.stringify(initial);
  assert.throws(()=>saveMachines(initial,'demo-small',[good,{...good,id:'invalid',order:-1}],0),/platná celá čísla/);
  assert.equal(JSON.stringify(initial),before);
  const updated=saveMachines(initial,'demo-small',[good],0);
  assert.throws(()=>saveMachines(updated,'demo-small',[good],0),/mezitím změnily/);
  const partial=newSettlement(updated,'demo-small',false);partial.rows.pop();
  assert.throws(()=>saveRecord(updated,'settlement',partial,'web'),/chybí/);
});

test('new adjustment definitions change future forms while keeping earlier settlements readable', () => {
  const initial=initialState();
  const updated=administrativeWrite(initial,0,'Přidání položky',state=>state.administration.adjustments.push({id:'new-demo-category',venue:'demo-small',name:'Ukázková nová položka',order:4}));
  assert.equal(emptyAdjustments(updated,'demo-small').length,4);
  assert.deepEqual(readState(JSON.stringify(updated)).settlements,initial.settlements);
  const draft=newSettlement(updated,'demo-small',false);
  draft.adjustments[3].income=4567;
  const saved=saveRecord(updated,'settlement',draft,'web');
  assert.equal(totalsFor(records(saved,'settlement','demo-small')[0]).remittance,4567);
});
