import { administrativeWrite, denominations, getMachines, getVenue, parseMoney, saveMachines, treasuryTotal, records, userGroups, groupsForUser, roleForGroups } from './data.js?v=20261114.6';
import { passwordDigest } from './session.js?v=20261114.6';

export function createManagement(api) {
  const { e, button, table, number, getState, write, render, notify, showUtility, confirm } = api;
  const dialog = document.querySelector('#utility');
  let editing;
  let filter = '';
  let filterFields={},filterTimer,limit=20;
  let page = 1;
  let filterOpen=false;
  let currentKey = '';
  let exportRows = [];
  let sort = { column:0, descending:false };
  const names = {users:'Uživatelé',assignments:'Uživatelé',cashiers:'Pokladníci',adjustments:'Příjem Výdej',treasury:'Trezor',applications:'Instance aplikací',archive:'Archív činností',books:'Účetní knihy',bookVenues:'Detail knihy',notifications:'Upozornění'};
  const safeDenominations=denominations.filter(value=>value>=100||value===1);
  const yesno = value => value ? 'Ano' : 'Ne';
  const date = value => value?.slice(0,10).split('-').reverse().join('.') ?? '';
  const rowAction = (kind, id, venue, action='edit') => api.canManage(kind,id) ? button(action==='delete'?'Smazat záznam':'Upravit záznam',`admin-${action}`,{kind:'row-icon icon-only',icon:action==='delete'?'×':'✎',data:{kind,id,venue:venue??''}}) : '';
  const options = (values, value) => values.map(option => {
    const [key,label] = Array.isArray(option) ? option : [option,option];
    return `<option value="${e(key)}"${String(key)===String(value)?' selected':''}>${e(label)}</option>`;
  }).join('');
  const input = (key,label,value='',type='text',required=false) => `<label><span>${e(label)}</span><input name="${e(key)}" type="${type}" value="${e(value)}"${required?' required':''}${type==='text'?' maxlength="255"':''}></label>`;
  const select = (key,label,values,value) => `<label><span>${e(label)}</span><select name="${e(key)}">${options(values,value)}</select></label>`;
  const flag = (key,label,value=false) => select(key,label,[['0','Ne'],['1','Ano']],value?'1':'0');
  const venueOptions = () => getState().venues.map(venue=>[venue.id,venue.name]);
  const form = (content,caption='Uložit') => `<form id="administration-form" class="original-form">${content}<p id="administration-error" class="form-error" role="alert" hidden></p><footer class="dialog-actions"><button class="soft" type="submit">${caption}</button></footer></form>`;

  function dataset(kind,venue) {
    const state = getState();
    const admin = state.administration;
    let headers;
    let rows;
    if(kind==='assignments') {
      headers=['ID','Nick','Jméno','Příjmení','Skupina','Telefon','E-mail','Datum od','Platnost Do',''];
      rows=admin.assignments.filter(item=>item.venue===venue).map((item,index)=>{const user=admin.users.find(user=>user.id===item.user);return [index+1,user?.nick??'',user?.first??'',user?.last??'',item.group,user?.phone??'',user?.email??'',date(item.from),date(item.to),rowAction(kind,item.id,venue)+rowAction(kind,item.id,venue,'delete')];});
    } else if (kind==='users'||kind==='cashiers') {
      headers = kind==='cashiers'?['nl_id_uzivatel','Nick','Jméno','Příjmení','Skupina','Telefon','E-mail','']:['ID','Nick','Jméno','Příjmení','Telefon','E-mail','Zakázán','Dočasné heslo','Skupina','s_poznamka',''];
      rows = admin.users.filter(user=>(!venue||user.venues.includes(venue))&&(kind!=='cashiers'||user.role==='Pokladník')).map((user,index)=>[
        admin.users.indexOf(user)+1,user.nick,user.first,user.last,...(kind==='cashiers'?[groupsForUser(user).join(', '),user.phone,user.email]:[user.phone,user.email,user.blocked?'Ano':'',user.temporaryPassword?'Ano':'',groupsForUser(user).join(', '),user.note]),button('Detail uživatele','user-detail',{kind:'row-icon icon-only',icon:'⌕',data:{id:user.id}})+rowAction('users',user.id,venue)+rowAction('users',user.id,venue,'delete')]);
    } else if (kind==='adjustments') {
      headers=['ID Příjem Výdej','Příjem/Výdej','Pořadí',''];
      rows=admin.adjustments.filter(item=>item.venue===venue).map((item,index)=>[index+1,item.name,item.order,rowAction(kind,item.id,venue)+rowAction(kind,item.id,venue,'delete')]);
    } else if(kind==='treasury') {
      headers=['ID','Datum vložení',...safeDenominations.map(String),'Celkem','Zůstatek','Poznámka',''];
      let balance=0;const balances=new Map();
      const entries=admin.treasury.filter(item=>!venue||item.venue===venue);
      entries.forEach(item=>{balance+=treasuryTotal(item);balances.set(item.id,balance);});
      rows=entries.slice().reverse().map((item,index)=>[
        entries.length-index,date(item.date),...safeDenominations.map(value=>item.counts[denominations.indexOf(value)]),number(treasuryTotal(item)),number(balances.get(item.id)),item.note,rowAction(kind,item.id,item.venue)+rowAction(kind,item.id,item.venue,'delete')]);
    } else if(kind==='applications') {
      headers=['ID App','Hardware ID','Verze','Zakázána','Poslední přihlášení','Vázáno jen na','Poslední uživatel','Název','Kniha','Vyúč.','b_offline',''];
      rows=admin.applications.map((item,index)=>[index+1,item.hardware,item.version,yesno(item.blocked),item.lastLogin?date(item.lastLogin):'',item.venue?getVenue(item.venue,state).name:'', 'demo-operátor',item.name,yesno(item.cash),yesno(item.settlement),yesno(item.offline),rowAction(kind,item.id)]);
    } else if(kind==='bookVenues') {
      headers=['ID','Provozovna','Kniha Název','Kniha','Man. Kniha','Man. Kniha Bez.',''];
      rows=admin.bookVenues.filter(item=>!venue||item.book===venue).map((item,index)=>[index+1,getVenue(item.venue,state).name,admin.books.find(book=>book.id===item.book)?.name??'',yesno(item.cash),yesno(item.manager),yesno(item.noncash),rowAction(kind,item.id,venue)+rowAction(kind,item.id,venue,'delete')]);
    } else if(kind==='books') {
      headers=['ID Kniha','Název','Popis',''];
      rows=admin.books.map((item,index)=>[index+1,item.name,item.note,rowAction(kind,item.id)+rowAction(kind,item.id,null,'delete')]);
    } else if(kind==='archive') {
      headers=['ID','Datum','Událost','Uživatel'];
      rows=admin.archive.map((item,index)=>[admin.archive.length-index,`${date(item.date)} ${item.date.slice(11,19)}`,item.event,item.user]);
    } else {
      headers=['ID','Datum','Typ','Text'];
      rows=admin.notifications.map((item,index)=>[index+1,date(item.date),item.kind,item.text]);
    }
    return {headers,rows};
  }

  function listing(kind,venue) {
    const key=`${kind}/${venue??''}`;
    if(currentKey!==key){filter='';filterFields={};filterOpen=false;page=1;limit=20;sort={column:0,descending:!venue};currentKey=key;}
    const data=dataset(kind,venue);
    const searchable = value => String(value).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
    const all=data.rows.filter(row=>searchable(row.slice(0,-1).join(' ')).includes(searchable(filter))&&(kind!=='users'||Object.entries({nick:1,email:5,first:2,last:3}).every(([key,index])=>searchable(row[index]).includes(searchable(filterFields[key]??'')))));
    all.sort((a,b)=>String(a[sort.column]).localeCompare(String(b[sort.column]),'cs',{numeric:true})*(sort.descending?-1:1));
    const hasActions=data.headers.at(-1)==='';
    exportRows=[data.headers,...all].map(row=>hasActions?row.slice(0,-1):row);
    const pages=Math.max(1,Math.ceil(all.length/limit));page=Math.min(page,pages);
    const visible=all.slice((page-1)*limit,page*limit).map(row=>row.map((value,index)=>index===row.length-1&&String(value).startsWith('<button')?value:e(value)));
    const add=['users','assignments','cashiers','adjustments','treasury','books','bookVenues'].includes(kind)&&api.canManage(kind);
    return `${filterOpen?`<form class="original-grid-filter management-filter" id="management-filter">${(kind==='users'?[['nick','Nick'],['email','E-mail'],['first','Jméno'],['last','Příjmení']]:[['term','Vyhledat']]).map(([name,label])=>`<label><span>${label}:</span><input name="${name}" type="search" value="${e(name==='term'?filter:filterFields[name]??'')}"></label>`).join('')}<button type="submit" class="sr-only">Vyhledat</button></form>`:''}${!venue?`<div class="toolbar venue-toolbar">${button('Vynulovat filtr','admin-clear',{kind:'soft'})}${button(filterOpen?'Skrýt filtr':'Zobrazit filtr','admin-toggle-filter',{kind:'soft'})}</div>`:''}
      <div class="section-tools"><span class="web-section-tab">${venue?names[kind]:'Výpis'}</span><div class="list-actions">${venue?button(filterOpen?'Skrýt filtr':'Zobrazit filtr','admin-toggle-filter',{kind:'tool-icon icon-only',icon:'⌕'}):''}${add?button('Přidání nového záznamu','admin-edit',{kind:'tool-icon icon-only add-icon',icon:'+',data:{kind:kind==='cashiers'?'users':kind,venue:venue??'',role:kind==='cashiers'?'Pokladník':''}}):''}${button('Export tabulky','admin-export',{kind:'tool-icon icon-only',icon:'XLS'})}</div></div>
      ${table(data.headers,visible,{label:names[kind],kind:`management-grid management-${kind}`,columnHeading:(label,index)=>label?`<div class="original-sort"><span>${button('Vzestupně','admin-sort',{kind:'sort-arrow icon-only',icon:'↑',data:{column:index,direction:'asc'}})}${button('Sestupně','admin-sort',{kind:'sort-arrow icon-only',icon:'↓',data:{column:index,direction:'desc'}})}</span>${button(label,'admin-sort',{kind:'sort-label',data:{column:index,direction:sort.column===index&&!sort.descending?'desc':'asc'}})}</div>`:''})}
      <div class="table-foot${venue?'':' venue-foot'}"><select id="admin-page-size" class="venue-limit" aria-label="Řádků na stránku">${[20,50,100,500].map(size=>`<option${size===limit?' selected':''}>${size}</option>`).join('')}</select>Řádků na stránku | Celkem nalezeno ${all.length} položek<nav class="venue-pagination" aria-label="Stránky přehledu">${button('‹ Předchozí','admin-page',{kind:'text-action',data:{page:page-1},disabled:page===1})} | ${page} | ${button('Další ›','admin-page',{kind:'text-action',data:{page:page+1},disabled:page===pages})}</nav></div>`;
  }

  function open(kind,id,venue,role) {
    if(!api.canManage(kind,id))return notify('Pro tuto změnu nemáte v ukázce oprávnění.',true);
    const state=getState();
    let record;
    if(kind==='machine')record=getMachines(venue,state).find(item=>item.id===id);
    else if(kind==='venue')record=state.venues.find(item=>item.id===id);
    else record=state.administration[kind]?.find(item=>item.id===id);
    editing={kind,id,venue,role,revision:state.administration.revision,record:structuredClone(record??{})};
    const item=editing.record;
    let fields='';let title='';
    if(kind==='machine') {
      const machines=getMachines(venue,state);
      const latest=records(state,'settlement',venue)[0]?.rows.find(row=>row.machine===id);
      title=id?'Uprav automat':'Přidej automat';
      fields=select('venue','Provozovna',venueOptions(),venue)+input('order','Pořadí',item.order??Math.max(0,...machines.map(machine=>machine.order))+1,'number',true)+input('number','Číslo',item.number??'','number')+
        input('label','Označení',item.label??'')+select('operator','Provozovatel',state.administration.catalogs['Provozovatel'],item.operator)+select('model','Model',state.administration.catalogs['Automat model'],item.model??'Demo A')+
        select('type','Typ',state.administration.catalogs['Typ automatu'],item.type??'VLT')+input('initialIn','IN',number(item.counterAfter?item.initialIn:latest?.inEnd??item.initialIn??0),'text',true)+input('initialOut','OUT',number(item.counterAfter?item.initialOut:latest?.outEnd??item.initialOut??0),'text',true)+flag('reset','Nulovat počátky',item.reset)+input('note','Poznámka',item.note??'');
    } else if(kind==='assignments') {
      title=id?'Uprav přiřazení uživatele':'Přidej uživatele';
      fields=select('user','Uživatel',state.administration.users.map(user=>[user.id,`${user.nick} (${user.first} ${user.last})`]),item.user)+select('group','Skupina',userGroups.filter(group=>group!=='Admins'),item.group??'Provozní')+select('venue','Provozovna',venueOptions(),item.venue??venue)+input('from','Od',item.from??'','date')+input('to','Do',item.to??'','date');
    } else if(kind==='users') {
      title=id?'Uprav uživatele':role==='Pokladník'?'Přidej pokladníka':'Přidej uživatele';
      fields=input('nick','Nick',item.nick??'','text',true)+input('password',id?'Nové heslo':'Heslo',id?'':'demo','password',!id)+input('first','Jméno',item.first??'','text',true)+input('last','Příjmení',item.last??'','text',true)+input('email','E-mail',item.email??'','email')+input('phone','Telefon',item.phone??'')+(role==='Pokladník'?'':`<fieldset class="user-groups"><legend>Skupina</legend>${userGroups.map(group=>`<label class="checkbox-field"><input type="checkbox" name="groups" value="${e(group)}"${groupsForUser(item).includes(group)?' checked':''}><span>${e(group)}</span></label>`).join('')}</fieldset>`)+flag('blocked','Zakázat',item.blocked)+(role==='Pokladník'?'':input('note','Poznámka',item.note??''));
    } else if(kind==='adjustments') {
      title='Přiřaď příjem/výdej provozovně';fields=select('name','Příjem/Výdej',state.administration.catalogs['Příjem výdej'],item.name)+select('venue','Provozovna',venueOptions(),item.venue??venue)+(id?input('order','Pořadí',item.order,'number',true):'');
    } else if(kind==='treasury') {
      title=id?'Uprav stav trezoru':'Přidej do trezoru';
      fields=`<div class="denomination-grid">${safeDenominations.map(value=>input(`count${denominations.indexOf(value)}`,String(value),item.counts?.[denominations.indexOf(value)]??0,'number')).join('')}</div><p class="treasury-sum">Součet <strong id="treasury-sum">${number(item.counts?treasuryTotal(item):0)}</strong> Kč</p>`+select('venue','Trezor',venueOptions(),item.venue??venue??state.venues[0].id)+input('note','Poznámka',item.note??'');
    } else if(kind==='applications') {
      title='Uprav aplikaci';fields=input('name','Název',item.name??'')+select('venue','Aplikace jen pro provozovnu',[['','Všechny povolené provozovny'],...venueOptions()],item.venue)+flag('blocked','Zakázat aplikaci',item.blocked)+flag('cash','Pokladní kniha',item.cash)+flag('settlement','Denní vyúčtování',item.settlement)+flag('offline','Offline vyúčtování',item.offline);
    } else if(kind==='venue') {
      title=id?'Uprav provozovnu':'Přidej provozovnu';fields=input('name','Název',item.name??'','text',true)+select('type','Typ',state.administration.catalogs['Typ provozovny'],item.type??'Herna')+input('smsName','Název pro SMS',item.smsName??'DEMO','text',true)+input('cash','Kasáč',number(item.cash??0),'text',true)+input('street','Ulice',item.street??'')+input('town','Město',item.town??'')+input('postal','PSČ',item.postal??'')+select('safe','Trezor',state.administration.catalogs['Trezor'],item.safe??'Demo trezor')+flag('blocked','Blokovat SMS',item.blocked)+(id?select('circuit','Okruh provozoven',['',...state.administration.catalogs['Okruh Provozoven']],item.circuit??''):'');
    } else if(kind==='books') {
      title=id?'Uprav knihu':'Přidej knihu';fields=input('name','Název',item.name??'','text',true)+input('note','Popis',item.note??'')+select('user','Uživatel',state.administration.users.map(user=>[user.id,user.nick]),item.user??api.getUser().id)+select('safe','Trezor',state.administration.catalogs.Trezor,item.safe??state.administration.catalogs.Trezor[0]);
    } else if(kind==='bookVenues') {
      title=id?'Uprav přiřazení provozovny':'Přiřaď provozovnu ke knize';fields=select('venue','Provozovna',venueOptions(),item.venue)+select('book','Kniha název',state.administration.books.map(book=>[book.id,book.name]),item.book??venue)+flag('cash','Kniha',item.cash??true)+flag('manager','Man. Kniha',item.manager??false)+flag('noncash','Man. Kniha Bez.',item.noncash??false);
    }
    showUtility(title,form(fields));dialog.classList.add('management-dialog');
    if(kind==='users'&&!api.canManage('all'))for(const control of dialog.querySelectorAll('[name="groups"],[name="blocked"]'))control.disabled=true;
  }

  async function save(formNode) {
    if(!editing)return;
    const draft=editing;
    const values=new FormData(formNode);
    const text=key=>String(values.get(key)??'').trim();
    const truth=key=>text(key)==='1';
    const id=draft.id??crypto.randomUUID();
    const error=formNode.querySelector('#administration-error');
    try {
      if(!api.canManage(draft.kind,draft.id))throw new Error('Pro tuto změnu nemáte v ukázce oprávnění.');
      const passwordHash=draft.kind==='users'&&text('password')?await passwordDigest(text('password')):draft.record.passwordHash;
      if(draft.kind==='machine') {
        const entry={id,order:Number(text('order')),number:text('number')?Number(text('number')):null,label:text('label'),model:text('model'),type:text('type'),operator:text('operator'),note:text('note'),initialIn:parseMoney(text('initialIn')),initialOut:parseMoney(text('initialOut')),reset:truth('reset')};
        if(draft.id&&text('venue')!==draft.venue)throw new Error('Automat s historií ponechte v původní provozovně.');
        await write(state=>saveMachines(state,text('venue'),[entry],draft.revision));
      } else {
        await write(state=>administrativeWrite(state,draft.revision,`${draft.id?'Úprava':'Přidání'}: ${names[draft.kind]??'Provozovna'}`,updated=>{
          let entry={...draft.record,id};
          const rows=draft.kind==='venue'?updated.venues:updated.administration[draft.kind];
          if(draft.kind==='users') {
            const phone=text('phone');
            if(phone&&!/^(?:\+\d{1,3}\s?)?(?:\d\s?){9,12}$/.test(phone))throw new Error('Zadejte platné telefonní číslo.');
            if(rows.some(row=>row.id!==id&&row.nick.toLowerCase()===text('nick').toLowerCase()))throw new Error('Tento nick již existuje.');
            const groups=draft.role==='Pokladník'?['Pokladní']:values.getAll('groups');
            if(api.canManage('all')&&!groups.length)throw new Error('Vyberte alespoň jednu skupinu uživatele.');
            entry={...entry,nick:text('nick'),first:text('first'),last:text('last'),email:text('email'),phone,groups,role:roleForGroups(groups),blocked:truth('blocked'),note:text('note'),venues:draft.record.venues??(draft.venue?[draft.venue]:[])};
            if(!api.canManage('all'))Object.assign(entry,{role:draft.record.role,groups:groupsForUser(draft.record),blocked:draft.record.blocked,venues:draft.record.venues});
            if(!draft.id&&draft.venue)updated.administration.assignments.push({id:crypto.randomUUID(),user:id,venue:draft.venue,group:'Pokladní',from:'',to:''});
            if(passwordHash)entry.passwordHash=passwordHash;
          }else if(draft.kind==='assignments') {
            if(text('from')&&text('to')&&text('from')>text('to'))throw new Error('Datum Do nesmí být před datem Od.');
            if(rows.some(row=>row.id!==id&&row.user===text('user')&&row.venue===text('venue')&&row.group===text('group')))throw new Error('Toto přiřazení už existuje.');
            entry={...entry,user:text('user'),venue:text('venue'),group:text('group'),from:text('from'),to:text('to')};
            const user=updated.administration.users.find(user=>user.id===entry.user);
            if(!user)throw new Error('Uživatel neexistuje.');
            user.venues=[...new Set([...user.venues,entry.venue])];
          }else if(draft.kind==='adjustments') {
            const order=draft.id?Number(text('order')):Math.max(0,...rows.filter(row=>row.venue===text('venue')).map(row=>row.order))+1;
            if(!Number.isInteger(order)||order<1)throw new Error('Zadejte platné pořadí.');
            if(rows.some(row=>row.id!==id&&row.venue===text('venue')&&row.name===text('name')))throw new Error('Tento příjem/výdej už je provozovně přiřazen.');
            entry={...entry,venue:text('venue'),name:text('name'),order};
          }else if(draft.kind==='treasury') {
            const counts=denominations.map((_,index)=>Number(text(`count${index}`)||0));
            if(counts.some(value=>!Number.isSafeInteger(value)||Math.abs(value)>1000000))throw new Error('Počty bankovek a mincí musí být celá čísla v povoleném rozsahu.');
            entry={...entry,venue:text('venue'),date:draft.record.date??new Date().toISOString().slice(0,10),counts,note:text('note')};
          }else if(draft.kind==='applications')entry={...entry,name:text('name'),venue:text('venue'),blocked:truth('blocked'),cash:truth('cash'),settlement:truth('settlement'),offline:truth('offline')};
          else if(draft.kind==='venue') {
            const cash=parseMoney(text('cash'));if(!Number.isSafeInteger(cash)||cash<0)throw new Error('Zadejte platnou provozní hotovost.');
            entry={...entry,name:text('name'),type:text('type'),street:text('street'),town:text('town'),postal:text('postal'),cash,smsName:text('smsName'),blocked:truth('blocked'),safe:text('safe'),circuit:text('circuit'),count:draft.record.count??0,bookOpening:draft.record.bookOpening??0};
            if(cash!==(draft.record.cash??0))updated.administration.cashHistory.push({id:crypto.randomUUID(),sequence:Math.max(0,...updated.administration.cashHistory.map(row=>row.sequence))+1,venue:id,date:new Date().toISOString(),delta:cash-(draft.record.cash??0),balance:cash,note:'Změna provozní hotovosti',user:'demo-operátor'});
            updated.machines[id]??=[];
          }else if(draft.kind==='bookVenues'){
            if(rows.some(row=>row.id!==id&&row.book===text('book')&&row.venue===text('venue')))throw new Error('Provozovna už je ke knize přiřazená.');
            entry={...entry,book:text('book'),venue:text('venue'),cash:truth('cash'),manager:truth('manager'),noncash:truth('noncash')};
          }else entry={...entry,name:text('name'),note:text('note'),user:text('user'),safe:text('safe'),venues:entry.venues??[]};
          const index=rows.findIndex(row=>row.id===id);if(index<0)rows.push(entry);else rows[index]=entry;
          if(draft.kind==='assignments')for(const user of updated.administration.users)user.venues=[...new Set(updated.administration.assignments.filter(item=>item.user===user.id).map(item=>item.venue))];
          if(draft.kind==='bookVenues')for(const book of updated.administration.books)book.venues=updated.administration.bookVenues.filter(item=>item.book===book.id).map(item=>item.venue);
        }));
      }
      dialog.close();render();notify('Změny byly uloženy.');
    }catch(problem){error.textContent=problem.message;error.hidden=false;}
  }

  function openImport(venue) {
    if(!api.canManage('machine'))return notify('Pro import nemáte v ukázce oprávnění.',true);
    editing={kind:'import',venue,revision:getState().administration.revision,batchId:crypto.randomUUID()};
    showUtility('Hromadný import automatů',`<form id="import-count" class="import-count"><label>Počet automatů <input name="count" type="number" min="2" max="1000" required></label><span>2 až 1 000</span><button type="submit" class="soft">Připravit tabulku</button></form>`);
    dialog.classList.add('machine-import-dialog');
  }

  function prepareImport(count) {
    if(!Number.isInteger(count)||count<2||count>1000)return;
    const venue=editing.venue;
    const catalogs=getState().administration.catalogs;
    const start=Math.max(0,...getMachines(venue,getState()).map(machine=>machine.order))+1;
    editing.ids=Array.from({length:count},()=>crypto.randomUUID());
    const cell=(key,index,value,type='text',choices)=>`<td>${choices?`<select data-key="${key}" data-index="${index}">${options(choices,value)}</select>`:`<input data-key="${key}" data-index="${index}" type="${type}" value="${e(value)}" aria-label="Řádek ${index+1}, ${key}">`}</td>`;
    const rows=Array.from({length:count},(_,index)=>`<tr><th>${index+1}</th>${cell('venue',index,venue,'text',venueOptions())}${cell('order',index,start+index,'number')}${cell('number',index,'','number')}${cell('label',index,'')}${cell('operator',index,catalogs['Provozovatel'][0],'text',catalogs['Provozovatel'])}${cell('model',index,catalogs['Automat model'][0],'text',catalogs['Automat model'])}${cell('type',index,'VLT','text',catalogs['Typ automatu'])}${cell('initialIn',index,0)}${cell('initialOut',index,0)}${cell('reset',index,'0','text',[['0','Ne'],['1','Ano']])}${cell('note',index,'')}</tr>`).join('');
    dialog.querySelector('.utility-content').innerHTML=`<form id="import-batch"><div class="import-paste"><label>Vložit z Excelu <input id="import-clipboard" placeholder="Ctrl+V" autocomplete="off"></label><p>Vkládat můžete i přímo od vybrané buňky. Změna výběru se propíše do řádků pod ním.</p></div><div class="table-scroll import-table" tabindex="0"><table><thead><tr>${['Řádek','Provozovna','Pořadí','Číslo','Označení','Provozovatel','Model','Typ','IN','OUT','Nulovat počátky','Poznámka'].map(label=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><p id="import-error" class="form-error" role="alert" hidden></p><footer class="dialog-actions"><button type="submit" class="soft">Uložit automaty</button></footer></form>`;
  }

  async function importBatch() {
    const draft=editing;const groups=new Map();
    try {
      for(const [index,row] of [...dialog.querySelectorAll('.import-table tbody tr')].entries()) {
        const values=Object.fromEntries([...row.querySelectorAll('[data-key]')].map(node=>[node.dataset.key,node.value.trim()]));
        const entry={...values,id:draft.ids[index],order:Number(values.order),number:values.number?Number(values.number):null,initialIn:parseMoney(values.initialIn),initialOut:parseMoney(values.initialOut),reset:values.reset==='1'};
        if(!groups.has(values.venue))groups.set(values.venue,[]);groups.get(values.venue).push(entry);
      }
      await write(state=>{
        if(state.administration.revision!==draft.revision)throw new Error('Údaje se mezitím změnily. Otevřete import znovu.');
        let result=state;
        for(const [venue,entries] of groups)result=saveMachines(result,venue,entries,result.administration.revision,`${draft.batchId}/${venue}`);
        return result;
      });
      dialog.querySelector('.utility-content').innerHTML=`<p>Uloženo ${draft.ids.length} automatů.</p><footer class="dialog-actions">${button('Hotovo','close-utility',{kind:'soft'})}</footer>`;
      editing=undefined;render();
    }catch(problem){const error=dialog.querySelector('#import-error');error.textContent=problem.message;error.hidden=false;}
  }

  document.addEventListener('click',event=>{
    const control=event.target.closest('[data-action^="admin-"]');if(!control)return;
    const {action,kind,id,venue,role}=control.dataset;
    if(action==='admin-edit')open(kind,id||undefined,venue||undefined,role);
    if(action==='admin-import')openImport(venue);
    if(action==='admin-clear'){filter='';filterFields={};page=1;render();}
    if(action==='admin-toggle-filter'){filterOpen=!filterOpen;render();}
    if(action==='admin-page'){page=Number(control.dataset.page);render();}
    if(action==='admin-sort'){sort={column:Number(control.dataset.column),descending:control.dataset.direction==='desc'};render();}
    if(action==='admin-export')api.exportTable(names[currentKey.split('/')[0]],exportRows);
    if(action==='admin-delete'){
      if(!api.canManage(kind,id))return notify('Pro tuto změnu nemáte v ukázce oprávnění.',true);
      const revision=getState().administration.revision;
      confirm('Opravdu smazat vybraný záznam?','Smazání záznamu','Smazat',async()=>{
        await write(state=>administrativeWrite(state,revision,`Smazání: ${names[kind]??'Automat'}`,updated=>{
          if(kind==='machine') {
            if(updated.settlements.some(record=>record.rows.some(row=>row.machine===id))||updated.queue.some(item=>item.record.rows?.some(row=>row.machine===id)))throw new Error('Automat má historii vyúčtování a nelze jej smazat.');
            const list=updated.machines[venue];updated.machines[venue]=list.filter(item=>item.id!==id);getVenue(venue,updated).count--;
          }else if(kind==='venue') {
            if(updated.settlements.some(row=>row.venue===id)||updated.cash.some(row=>row.venue===id)||updated.queue.some(row=>row.record.venue===id))throw new Error('Provozovna má účetní historii. Nejprve odstraňte navázané záznamy.');
            updated.venues=updated.venues.filter(row=>row.id!==id);delete updated.machines[id];
            for(const user of updated.administration.users)user.venues=user.venues.filter(venue=>venue!==id);
            updated.administration.adjustments=updated.administration.adjustments.filter(row=>row.venue!==id);
            updated.administration.assignments=updated.administration.assignments.filter(row=>row.venue!==id);
            updated.administration.bookVenues=updated.administration.bookVenues.filter(row=>row.venue!==id);
            for(const book of updated.administration.books)book.venues=book.venues.filter(venue=>venue!==id);
          }else {
            if(kind==='users'&&id==='demo-operator')throw new Error('Přihlášeného správce ukázky nelze smazat.');
            if(kind==='users'&&venue){
              const user=updated.administration.users.find(item=>item.id===id);user.venues=user.venues.filter(item=>item!==venue);
              updated.administration.assignments=updated.administration.assignments.filter(item=>item.user!==id||item.venue!==venue);
            }else {
              updated.administration[kind]=updated.administration[kind].filter(item=>item.id!==id);
              if(kind==='users')updated.administration.assignments=updated.administration.assignments.filter(item=>item.user!==id);
              if(kind==='books')updated.administration.bookVenues=updated.administration.bookVenues.filter(item=>item.book!==id);
              if(kind==='bookVenues')for(const book of updated.administration.books)book.venues=updated.administration.bookVenues.filter(item=>item.book===book.id).map(item=>item.venue);
              if(kind==='assignments')for(const user of updated.administration.users)user.venues=[...new Set(updated.administration.assignments.filter(item=>item.user===user.id).map(item=>item.venue))];
            }
          }
        }));render();notify('Záznam byl smazán.');
      });
    }
  });
  document.addEventListener('submit',event=>{
    if(event.target.id==='administration-form'){event.preventDefault();void save(event.target);}
    if(event.target.id==='management-filter'){event.preventDefault();const focused=document.activeElement.name,caret=document.activeElement.selectionStart;filterFields=Object.fromEntries(new FormData(event.target));filter=filterFields.term??'';page=1;render();const input=document.querySelector(`#management-filter [name="${focused}"]`);input?.focus();if(input&&caret!==null)input.setSelectionRange(caret,caret);}
    if(event.target.id==='import-count'){event.preventDefault();prepareImport(Number(new FormData(event.target).get('count')));}
    if(event.target.id==='import-batch'){event.preventDefault();void importBatch();}
  });
  document.addEventListener('input',event=>{const form=event.target.closest('#management-filter');if(!form)return;clearTimeout(filterTimer);filterTimer=setTimeout(()=>{if(form.isConnected)form.requestSubmit();},250);});
  document.addEventListener('change',event=>{if(event.target.id==='admin-page-size'){limit=Number(event.target.value);page=1;render();}});
  dialog.addEventListener('input',()=>{
    if(editing?.kind!=='treasury')return;
    const counts=denominations.map((_,index)=>Number(dialog.querySelector(`[name="count${index}"]`)?.value)||0);
    dialog.querySelector('#treasury-sum').textContent=number(treasuryTotal({counts}));
  });
  dialog.addEventListener('change',event=>{
    if(editing?.kind!=='import'||event.target.tagName!=='SELECT')return;
    const {key,index}=event.target.dataset;
    for(const control of dialog.querySelectorAll(`[data-key="${key}"]`))if(Number(control.dataset.index)>Number(index))control.value=event.target.value;
  });
  dialog.addEventListener('paste',event=>{
    if(editing?.kind!=='import')return;
    const target=event.target;
    if(target.id!=='import-clipboard'&&!target.hasAttribute('data-key'))return;
    const text=event.clipboardData?.getData('text/plain');if(!text)return;event.preventDefault();
    const columns=['venue','order','number','label','operator','model','type','initialIn','initialOut','reset','note'];
    const first=target.id==='import-clipboard'?0:Number(target.dataset.index);
    const column=target.id==='import-clipboard'?0:columns.indexOf(target.dataset.key);
    const rows=text.replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n').map(row=>row.split('\t'));
    const error=dialog.querySelector('#import-error');
    if(rows.length+first>editing.ids.length||rows.some(row=>row.length+column>columns.length)){error.textContent='Vkládaná data přesahují připravenou tabulku.';error.hidden=false;return;}
    const changes=[];
    try {
      rows.forEach((row,index)=>row.forEach((value,offset)=>{
        const control=dialog.querySelector(`[data-index="${first+index}"][data-key="${columns[column+offset]}"]`);
        let result=value.trim();
        if(control.tagName==='SELECT'){
          const option=[...control.options].find(item=>item.value===result||item.textContent.toLowerCase()===result.toLowerCase());
          if(!option)throw new Error(`Řádek ${first+index+1}: neplatná volba ${result}.`);result=option.value;
        }
        changes.push([control,result]);
      }));
      for(const [control,value]of changes)control.value=value;error.hidden=true;
    }catch(problem){error.textContent=problem.message;error.hidden=false;}
  });
  dialog.addEventListener('close',()=>{if(!dialog.open)editing=undefined;});
  return {listing,open,openImport};
}
