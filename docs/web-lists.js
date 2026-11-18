import {cashWithBalances,cashAmounts,records,rowAmounts,treasuryBalance} from './data.js?v=20261114.6';

export function createWebLists(api){
 const {e,button,table,number,getState,getVenues,getMachines,showUtility,render,exportWorkbook}=api;
 const configurations={machines:{filters:[['venue','Provozovna'],['model','Model'],['type','Typ']],sort:3},monthly:{filters:[['venue','Provozovna'],['type','Typ'],['month','Měsíc'],['year','Rok']],sort:0},cash:{filters:[['venue','Provozovna'],['from','Od','date'],['to','Do','date'],['kind','Typ']],sort:0,descending:true},overview:{filters:[['book','Kniha']],sort:0,descending:true}};
 const views={};let active='machines',exportRows=[];
 const item=key=>views[key]??=( {filter:{},open:false,page:1,limit:20,column:configurations[key].sort,descending:!!configurations[key].descending} );
 const date=value=>value?.slice(0,10).split('-').reverse().join('.')??'';
 function options(key){const state=getState();return key==='venue'?getVenues().map(v=>[v.id,v.name]):key==='model'?state.administration.catalogs['Automat model'].map(v=>[v,v]):key==='type'?state.administration.catalogs['Typ automatu'].map(v=>[v,v]):key==='kind'?[...new Set([...state.administration.catalogs['Kniha pohyb'],...state.cash.map(row=>row.kind??(row.direction==='income'?'Příjem':'Výdaj'))])].map(v=>[v,v]):key==='book'?state.administration.books.map(v=>[v.id,v.name]):key==='month'?Array.from({length:12},(_,i)=>[String(i+1),String(i+1)]):[...new Set(state.settlements.map(row=>row.to.slice(0,4)))].sort().map(v=>[v,v]);}
 function filter(key){const view=item(key);return `${view.open?`<form class="original-grid-filter" id="original-grid-filter">${configurations[key].filters.map(([name,label,type])=>`<label><span>${label}:</span>${type==='date'?`<input type="date" name="${name}" value="${e(view.filter[name]??'')}">`:`<select name="${name}"><option value="">---</option>${options(name).map(([value,text])=>`<option value="${e(value)}"${value===view.filter[name]?' selected':''}>${e(text)}</option>`).join('')}</select>`}</label>`).join('')}<button type="submit" class="sr-only">Vyhledat</button></form>`:''}<div class="toolbar venue-toolbar">${button('Vynulovat filtr','original-clear',{kind:'soft'})}${button(view.open?'Skrýt filtr':'Zobrazit filtr','original-filter',{kind:'soft'})}</div>`;}
 const row=(raw,cells=raw)=>({raw,cells:cells.map(value=>typeof value==='object'?value.html:e(value))});
 const html=value=>({html:value});
 const actions=(kind,id,venue,history=false)=>html((history?button('Historie automatu','machine-history',{kind:'row-icon icon-only',icon:'⌕',data:{id,venue}}):'')+(api.canManage(kind)?button('Upravit záznam','admin-edit',{kind:'row-icon icon-only',icon:'✎',data:{kind,id,venue}})+button('Smazat záznam','admin-delete',{kind:'row-icon icon-only',icon:'×',data:{kind,id,venue}}):''));
 function dataset(key){
  const state=getState(),f=item(key).filter,venues=getVenues().filter(v=>!f.venue||v.id===f.venue),rows=[];
  if(key==='machines'){
   let id=0;for(const venue of getVenues())for(const machine of getMachines(venue.id)){
    id++;if(!venues.includes(venue)||machine.deleted||f.model&&machine.model!==f.model||f.type&&machine.type!==f.type)continue;
    const latest=records(state,'settlement',venue.id)[0]?.rows.find(row=>row.machine===machine.id),input=machine.counterAfter?machine.initialIn:latest?.inEnd??machine.initialIn,output=machine.counterAfter?machine.initialOut:latest?.outEnd??machine.initialOut;
    const raw=[id,venue.name,machine.operator??'Demo provozovatel',machine.order,machine.number,machine.label,machine.manufacturer??'',machine.model,machine.type,input,output,machine.note??'',''];
    rows.push(row(raw,[...raw.slice(0,5),html(button(machine.label,'machine-history',{kind:'text-action',data:{id:machine.id,venue:venue.id}})),...raw.slice(6,9),number(input),number(output),raw[11],actions('machine',machine.id,venue.id,true)]));
   }
   return{headers:['ID','Provozovna','Provozovatel','Pořadí','Číslo','Název','Výrobce','Model','Typ','IN','OUT','Poznámka','Akce'],rows,numeric:[0,3,4,9,10],sortable:true,add:['machine',f.venue||venues[0]?.id]};
  }
  if(key==='monthly'){
   for(const venue of venues){const groups=new Map();for(const record of records(state,'settlement',venue.id).slice().reverse()){
    if(f.month&&Number(record.to.slice(5,7))!==Number(f.month)||f.year&&record.to.slice(0,4)!==f.year)continue;
    for(const entry of record.rows){const machine=getMachines(venue.id).find(m=>m.id===entry.machine);if(!machine||f.type&&machine.type!==f.type)continue;const id=`${machine.id}/${record.to.slice(0,7)}`,group=groups.get(id)??{machine,inStart:entry.inStart,outStart:entry.outStart,input:0,output:0,money:0,yield:0};const sums=rowAmounts(entry);for(const name of ['input','output','money','yield'])group[name]+=sums[name];Object.assign(group,{inEnd:entry.inEnd,outEnd:entry.outEnd,note:entry.note});groups.set(id,group);}}
    for(const g of groups.values()){const raw=[venue.name,g.machine.label,g.machine.type,g.machine.operator??'Demo provozovatel',g.inStart,g.inEnd,g.input,g.money,g.outStart,g.outEnd,g.output,g.yield,g.note??'',''];rows.push(row(raw,raw.map((v,i)=>i===13?html(''):i>=4&&i<=11?number(v):v)));}}
   return{headers:['Provozovna','Název','Typ','s_provozovatel','IN počátek','IN konec','Vhozeno','Peníze','OUT počátek','OUT konec','Vyplaceno','Výnos','Poznámka','Akce'],rows,numeric:[4,5,6,7,8,9,10,11],sortable:true,add:null};
  }
  if(key==='cash'){
   for(const venue of venues)for(const entry of cashWithBalances(state,venue.id,false)){const amounts=cashAmounts(entry),kind=entry.kind??(entry.direction==='income'?'Příjem':'Výdaj');if(f.from&&entry.date<f.from||f.to&&entry.date>f.to||f.kind&&kind!==f.kind)continue;
    const raw=[entry.serverId,entry.date,kind,entry.description,amounts.income,amounts.expense,entry.balance,entry.modifiedAt??entry.date,entry.modifiedBy??'demo-operátor',entry.revision,''];rows.push(row(raw,[raw[0],date(raw[1]),...raw.slice(2,4),...raw.slice(4,7).map(number),date(raw[7]),raw[8],raw[9],html(button('Upravit záznam','original-edit-cash',{kind:'row-icon icon-only',icon:'✎',data:{id:entry.id,venue:venue.id}})+button('Smazat záznam','delete-record',{kind:'row-icon icon-only',icon:'×',data:{id:entry.id,type:'cash',revision:entry.revision}}))]));}
   return{headers:['ID','Datum','Typ','Popis','Příjem','Výdej','Zůstatek','Poslední změna','Naposledy změnil','E','Akce'],rows,numeric:[0,4,5,6],sortable:false,add:['cash',f.venue||venues[0]?.id]};
  }
  for(const venue of venues){const assignment=state.administration.bookVenues.find(v=>v.book===f.book&&v.venue===venue.id);if(f.book&&!assignment)continue;const balance=kind=>cashWithBalances(state,venue.id,false,kind)[0]?.balance??(kind==='cash'?venue.bookOpening??0:0),cash=assignment&&!assignment.cash?0:balance('cash'),manager=assignment&&!assignment.manager?0:balance('manager'),safe=treasuryBalance(state,venue.id),last=records(state,'settlement',venue.id)[0]?.to??'';
   const raw=[getVenues().indexOf(venue)+1,venue.name,venue.type??'Herna',venue.cash,last,cash,manager,cash+manager,safe,safe-cash-manager,''];rows.push(row(raw,[raw[0],html(button(venue.name,'open-venue',{kind:'text-action',data:{venue:venue.id}})),raw[2],number(raw[3]),date(last),...raw.slice(5,10).map(number),html(button('Detail provozovny','open-venue',{kind:'row-icon icon-only',icon:'⌕',data:{venue:venue.id}}))]));}
  return{headers:['ID','Provozovna','Typ','Provozní hotovost','Posl. Vyúčt.','Zůstatek','Man. Zůstatek','Celkem','Trezor','Tr. Rozdíl','Akce'],rows,numeric:[0,3,5,6,7,8,9],sortable:false,add:['cash',venues[0]?.id],totals:[3,5,6,7,8,9]};
 }
 function results(key){const v=item(key),data=dataset(key);data.rows.sort((a,b)=>{const x=a.raw[v.column],y=b.raw[v.column];return(typeof x==='number'?x-y:String(x??'').localeCompare(String(y??''),'cs',{numeric:true}))*(v.descending?-1:1);});const pages=Math.max(1,Math.ceil(data.rows.length/v.limit));v.page=Math.min(v.page,pages);exportRows=[data.headers.slice(0,-1),...data.rows.map(r=>r.raw.slice(0,-1).map((cell,i)=>(key==='machines'?[9,10]:key==='monthly'?[4,5,6,7,8,9,10,11]:key==='cash'?[4,5,6]:[3,5,6,7,8,9]).includes(i)?cell/100:cell))];
  return `<div class="section-tools venue-list-tab"><span class="web-section-tab">Výpis</span><div class="list-actions">${api.canManage('all')?button('Přidání nového záznamu','original-add',{kind:'tool-icon icon-only add-icon',icon:'+',disabled:!data.add,data:{kind:data.add?.[0]??'',venue:data.add?.[1]??''}}):''}${button('Export XLS','original-export',{kind:'tool-icon icon-only',icon:'XLS'})}</div></div>`+table(data.headers,data.rows.slice((v.page-1)*v.limit,v.page*v.limit).map(r=>r.cells),{label:({machines:'Seznam automatů',monthly:'Automaty měsíční přehled',cash:'Pokladní kniha',overview:'Multi přehledy'})[key],kind:'original-list',numeric:data.numeric,totals:data.totals?data.headers.map((_,i)=>data.totals.includes(i)?number(data.rows.reduce((sum,r)=>sum+r.raw[i],0)):''):[],columnHeading:(label,i)=>data.sortable&&i<data.headers.length-1?`<div class="original-sort"><span>${button('Vzestupně','original-sort',{kind:'sort-arrow icon-only',icon:'↑',data:{column:i,direction:'asc'}})}${button('Sestupně','original-sort',{kind:'sort-arrow icon-only',icon:'↓',data:{column:i,direction:'desc'}})}</span>${button(label,'original-sort',{kind:'sort-label',data:{column:i,direction:v.column===i&&!v.descending?'desc':'asc'}})}</div>`:e(label)})+`<div class="table-foot venue-foot"><select id="original-page-size" class="venue-limit" aria-label="Řádků na stránku">${[20,50,100,500].map(size=>`<option${v.limit===size?' selected':''}>${size}</option>`).join('')}</select>Řádků na stránku | Celkem nalezeno ${data.rows.length} položek<nav class="venue-pagination">${button('‹ Předchozí','original-page',{kind:'text-action',data:{page:v.page-1},disabled:v.page===1})} | ${v.page} | ${button('Další ›','original-page',{kind:'text-action',data:{page:v.page+1},disabled:v.page===pages})}</nav></div>`;
 }
 function view(key) {
  active = key;
  return filter(key) + '<div id="original-grid-results">' + results(key) + '</div>';
 }
 function applyFilter(form) {
  const v = item(active);
  v.filter = Object.fromEntries(new FormData(form));
  v.page = 1;
  document.getElementById('original-grid-results').innerHTML = results(active);
 }
 document.addEventListener('click',event=>{const control=event.target.closest('[data-action]');if(!control)return;const d=control.dataset,v=item(active);switch(d.action){case'original-filter':v.open=!v.open;render();break;case'original-clear':v.filter={};v.page=1;render();document.querySelector('[data-action=original-clear]')?.focus();break;case'original-sort':v.column=Number(d.column);v.descending=d.direction==='desc';render();break;case'original-page':v.page=Number(d.page);render();break;case'original-export':exportWorkbook('Výpis',exportRows);break;case'original-add':d.kind==='cash'?api.openCash(d.venue):api.openMachine(d.venue);break;case'original-edit-cash':api.openCash(d.venue,d.id);break;}});
 document.addEventListener('change', event => {
  const form = event.target.closest('#original-grid-filter');
  if (form) applyFilter(form);
  if (event.target.id === 'original-page-size') {
   const v = item(active);
   v.limit = Number(event.target.value);
   v.page = 1;
   render();
   document.getElementById('original-page-size')?.focus();
  }
 });
 document.addEventListener('submit', event => {
  if (event.target.id !== 'original-grid-filter') return;
  event.preventDefault();
  applyFilter(event.target);
 });
 return{view,reset:()=>{for(const key of Object.keys(views))delete views[key];}};
}
