import { administrativeWrite, getVenue, groupsForUser } from './data.js?v=20261114.6';

export function createAdministrationTools(api) {
  const {e,button,table,number,getState,write,render,notify,showUtility,confirm,canManage}=api;
  const dialog=document.querySelector('#utility');
  let catalog='',selected='',editing,messageKind;
  const catalogScroll={categories:0,values:0};
  const groups=['Admins','Provozní','Manažer','Pokladní','Majitel','Man. Ruleta','Man. Zařízení','Provozní plus','Manažer plus','Náhled','Recepční kasino'];
  const catalogs=()=>getState().administration.catalogs;
  function catalogView() {
    const values=Object.entries(catalogs()).filter(([category])=>!catalog||category===catalog).flatMap(([category,items])=>items.map(name=>({category,name}))).sort((a,b)=>a.name.localeCompare(b.name,'cs'));
    const tool=(label,action,icon,enabled=false)=>`<button type="button" data-action="${action}" class="catalog-tool catalog-${icon}"${enabled?'':' disabled'}><span aria-hidden="true"></span>${label}</button>`;
    const tools=right=>`<div class="catalog-toolbar"><strong>${right?'Obsah menu':'Administrace'}</strong><div>${tool(right?'Přidat':'Uložit',right?'catalog-new':'','save',right&&!!catalog)}${tool('Upravit',right?'catalog-edit':'','edit',right&&!!selected)}${tool('Smazat','','delete')}${tool('Smazat vše','','delete')}</div></div>`;
    return `<p class="breadcrumb">Hlavní stránka &gt; Číselníky</p><section class="catalog-editor" aria-label="Číselníky">
      <aside>${catalog?'<div class="catalog-toolbar"></div>':tools(false)}<div class="catalog-content"><nav aria-label="Seznam číselníků">${Object.keys(catalogs()).map(name=>button(name,'catalog-select',{data:{name},pressed:catalog===name})).join('')}</nav></div></aside>
      <div>${tools(true)}<div class="catalog-content"><div class="catalog-values" role="listbox" aria-label="${e(catalog||'Obsah menu')}">${values.map(({category,name})=>`<button type="button" role="option" aria-selected="${selected===name&&catalog===category}" data-action="catalog-value" data-name="${e(name)}" data-category="${e(category)}">${e(name)}</button>`).join('')}</div></div></div>
    </section>`;
  }
  function references(state,category,value) {
    const field=({'Typ automatu':'type','Automat model':'model','Provozovatel':'operator','Automat výrobce':'manufacturer'})[category];
    if(field&&Object.values(state.machines).flat().some(row=>row[field]===value))return true;
    if(category==='Typ provozovny'&&state.venues.some(row=>(row.type??'Herna')===value))return true;
    if(category==='Příjem výdej'&&state.administration.adjustments.some(row=>row.name===value))return true;
    if(category==='Kniha pohyb'&&state.cash.some(row=>row.kind===value))return true;
    if(category==='Trezor'&&(state.venues.some(row=>(row.safe??catalogs().Trezor[0])===value)||state.administration.books.some(row=>(row.safe??catalogs().Trezor[0])===value)))return true;
    if(category==='Okruh Provozoven'&&state.venues.some(row=>row.circuit===value))return true;
    if(Object.values(state.administration.catalogDetails).some(items=>Object.values(items).some(item=>item.dependency?.[0]===category&&item.dependency[1]===value)))return true;
    return false;
  }
  function syncCatalogScroll(){
    for(const [key,selector]of [['categories','.catalog-editor nav'],['values','.catalog-values']]){
      const content=document.querySelector(selector);if(!content)continue;
      const max=Math.max(0,content.scrollHeight-content.clientHeight);content.scrollTop=Math.min(catalogScroll[key],max);if(!max)continue;
      const rail=document.createElement('div');rail.className='catalog-scrollbar';rail.innerHTML='<button type="button" class="scroll-up" aria-label="Posunout nahoru"></button><div class="scroll-track"><button type="button" class="scroll-thumb" role="scrollbar" aria-label="Posun seznamu" aria-orientation="vertical" aria-valuemin="0"></button></div><button type="button" class="scroll-down" aria-label="Posunout dolů"></button>';content.parentNode.append(rail);
      const thumb=rail.querySelector('.scroll-thumb'),track=rail.querySelector('.scroll-track'),update=()=>{catalogScroll[key]=content.scrollTop;thumb.style.top=`${205*content.scrollTop/max}px`;thumb.setAttribute('aria-valuemax',String(max));thumb.setAttribute('aria-valuenow',String(Math.round(content.scrollTop)));rail.querySelector('.scroll-up').disabled=content.scrollTop<=0;rail.querySelector('.scroll-down').disabled=content.scrollTop>=max-1;};
      content.addEventListener('scroll',update);rail.querySelector('.scroll-up').addEventListener('click',()=>content.scrollTop-=44);rail.querySelector('.scroll-down').addEventListener('click',()=>content.scrollTop+=44);let drag;
      thumb.addEventListener('pointerdown',event=>{drag={y:event.clientY,scroll:content.scrollTop};thumb.setPointerCapture(event.pointerId);event.preventDefault();});thumb.addEventListener('pointermove',event=>{if(drag)content.scrollTop=drag.scroll+(event.clientY-drag.y)*max/205;});thumb.addEventListener('lostpointercapture',()=>drag=undefined);
      track.addEventListener('pointerdown',event=>{if(event.target===track)content.scrollTop+=(event.clientY<thumb.getBoundingClientRect().top?-1:1)*content.clientHeight;});thumb.addEventListener('keydown',event=>{const changes={ArrowUp:-22,ArrowDown:22,PageUp:-260,PageDown:260,Home:-max,End:max};if(event.key in changes){event.preventDefault();content.scrollTop+=changes[event.key];}});update();
    }
  }
  function editCatalog(name) {
    editing={category:catalog,name,revision:getState().administration.revision};
    const state=getState(),detail=state.administration.catalogDetails[catalog]?.[name]??{},dependency=JSON.stringify(detail.dependency??null);
    showUtility(name?'Upravení položky číselníku':'Přidej položku do číselníku',`<form class="original-form" id="catalog-form"><label><span>Hodnota:</span><input name="name" required maxlength="100" value="${e(name??'')}"></label><label><span>Popis:</span><input name="note" maxlength="255" value="${e(detail.note??'')}"></label><label><span>Závislost(např. Výrobce):</span><select name="dependency"><option value="null">Bez závislosti</option>${Object.entries(catalogs()).flatMap(([category,items])=>items.filter(value=>category!==catalog||value!==name).map(value=>{const key=JSON.stringify([category,value]);return `<option value="${e(key)}"${key===dependency?' selected':''}>${e(category)} – ${e(value)}</option>`;})).join('')}</select></label><label><span>Číselník:</span><select name="catalog">${Object.keys(catalogs()).map(value=>`<option${value===catalog?' selected':''}>${e(value)}</option>`).join('')}</select></label><label><span>Vlastník:</span><select name="owner"><option value="">Bez vlastníka</option>${state.administration.users.map(user=>`<option value="${e(user.id)}"${user.id===(detail.owner??api.getUser()?.id)?' selected':''}>${e(user.nick)}</option>`).join('')}</select></label><p class="form-error" hidden role="alert"></p><footer class="dialog-actions"><button class="soft" type="submit">Uložit</button></footer></form>`);
    dialog.classList.add('management-dialog');
  }
  async function removeCatalog(all) {
    const category=catalog,values=all?[...catalogs()[catalog]]:[selected],revision=getState().administration.revision;
    confirm(all?'Opravdu smazat všechny položky vybraného číselníku?':'Opravdu smazat vybranou položku?','Smazání položky','Smazat',async()=>{
      await write(state=>administrativeWrite(state,revision,'Smazání položky číselníku',updated=>{
        if(values.some(value=>references(updated,category,value)))throw new Error('Používanou položku nelze smazat. Nejprve změňte její přiřazení.');
        updated.administration.catalogs[category]=updated.administration.catalogs[category].filter(value=>!values.includes(value));
        for(const value of values)delete updated.administration.catalogDetails[category]?.[value];
      }));selected='';render();notify('Položka byla smazána.');
    });
  }
  function openMessages(kind,target) {
    if(!canManage('all'))return notify('Pro tuto činnost nemáte oprávnění.',true);
    messageKind=kind;
    const users=getState().administration.users;
    showUtility(kind==='sms'?'SMS brána':'E-mail brána',`<form id="message-form" class="message-form"><button type="button" class="text-action" data-action="message-all">Vybrat vše</button>
      <div class="message-recipients">${groups.map(group=>`<fieldset><legend><label><input type="checkbox" data-group="${e(group)}"> ${e(group)}</label></legend>${users.filter(user=>groupsForUser(user).includes(group)).map(user=>`<label><input type="checkbox" name="recipients" data-member="${e(group)}" value="${e(user.id)}"${user.id===target?' checked':''}> ${e(user.nick)} (${e(user.first)} ${e(user.last)})</label>`).join('')}</fieldset>`).join('')}</div>
      ${kind==='email'?'<label class="message-subject">Předmět: <input name="subject" required maxlength="200"></label>':''}
      <label class="message-body">Text: <textarea name="text" rows="7" required maxlength="10000"></textarea></label>
      ${kind==='sms'?'<p>Počet znaků včetně mezer: <output id="message-count">0</output></p>':''}<p class="form-error" role="alert" hidden></p><footer class="dialog-actions"><button type="submit" class="soft">Odešli</button>${button('Historie zpráv','message-history',{kind:'soft'})}</footer><p class="local-message-note">Smyšlená ukázka: zprávy se ukládají pouze v tomto prohlížeči.</p></form>`);
    dialog.classList.add('message-dialog');
  }
  function messageHistory() {
    const rows=getState().administration.messages.map(row=>[e(new Date(row.date).toLocaleString('cs-CZ')),row.kind==='sms'?'SMS':'E-mail',e(row.recipients.map(id=>getState().administration.users.find(u=>u.id===id)?.nick??id).join(', ')),e(row.subject),e(row.text),'Uloženo v ukázce']);
    showUtility('Historie zpráv',table(['Datum','Typ','Příjemci','Předmět','Text','Stav'],rows,{label:'Historie zpráv'}));dialog.classList.add('message-dialog');
  }
  function cashHistory(venue) {
    const current=getVenue(venue,getState());const entries=getState().administration.cashHistory.filter(row=>row.venue===venue).slice().sort((a,b)=>b.sequence-a.sequence);
    showUtility('Historie provozní hotovosti',`<p class="history-venue">${e(current.name)}</p>${table(['Datum','Popis','Příjem','Výdej','Zůstatek','Změnil'],entries.map(row=>[e(new Date(row.date).toLocaleString('cs-CZ')),e(row.note),number(Math.max(0,row.delta)),number(Math.max(0,-row.delta)),number(row.balance),e(row.user)]),{label:'Historie provozní hotovosti',numeric:[2,3,4],totals:['','Aktuální provozní hotovost','','',number(current.cash),'']})}`);dialog.classList.add('history-dialog');
  }
  document.addEventListener('click',async event=>{
    const node=event.target.closest('[data-action]');if(!node)return;
    try {
      switch(node.dataset.action){
        case 'catalog-select':catalog=node.dataset.name;selected='';catalogScroll.values=0;render();break;
        case 'catalog-value':selected=node.dataset.name;catalog=node.dataset.category;render();break;
        case 'catalog-new':if(canManage('all'))editCatalog();break;
        case 'catalog-edit':if(canManage('all')&&selected)editCatalog(selected);break;
        case 'catalog-delete':if(canManage('all'))await removeCatalog(false);break;
        case 'catalog-clear':if(canManage('all'))await removeCatalog(true);break;
        case 'message-all':{const nodes=dialog.querySelectorAll('[type="checkbox"]'),checked=[...nodes].some(n=>!n.checked);for(const input of nodes)input.checked=checked;break;}
        case 'message-history':messageHistory();break;
      }
    }catch(error){notify(error.message,true);}
  });
  document.addEventListener('change',event=>{if(event.target.matches('#message-form [data-group]'))for(const input of dialog.querySelectorAll('[data-member]'))if(input.dataset.member===event.target.dataset.group)input.checked=event.target.checked;});
  document.addEventListener('input',event=>{if(event.target.matches('#message-form textarea')&&dialog.querySelector('#message-count'))dialog.querySelector('#message-count').value=String(Array.from(event.target.value).length);});
  document.addEventListener('submit',async event=>{
    if(!['catalog-form','message-form'].includes(event.target.id))return;event.preventDefault();
    const form=event.target,values=new FormData(form),error=form.querySelector('.form-error');
    try {
      if(!canManage('all'))throw new Error('Pro tuto činnost nemáte oprávnění.');
      if(form.id==='catalog-form') {
        const change=editing,name=String(values.get('name')).trim(),category=String(values.get('catalog')),dependency=JSON.parse(values.get('dependency'));if(!name)throw new Error('Vyplňte hodnotu.');
        await write(state=>administrativeWrite(state,change.revision,'Úprava číselníku',updated=>{
          if(category!==change.category&&references(updated,change.category,change.name))throw new Error('Používanou položku nelze přesunout do jiného číselníku.');
          const items=updated.administration.catalogs[category];
          if(items.some(value=>(category!==change.category||value!==change.name)&&value.toLocaleLowerCase('cs-CZ')===name.toLocaleLowerCase('cs-CZ')))throw new Error('Položka s tímto názvem již existuje.');
          const index=category===change.category?items.indexOf(change.name):-1;if(index<0)items.push(name);else items[index]=name;
          if(category!==change.category)updated.administration.catalogs[change.category]=updated.administration.catalogs[change.category].filter(value=>value!==change.name);
          delete updated.administration.catalogDetails[change.category]?.[change.name];
          (updated.administration.catalogDetails[category]??={})[name]={note:String(values.get('note')).trim(),owner:String(values.get('owner')),dependency};
          for(const entries of Object.values(updated.administration.catalogDetails))for(const entry of Object.values(entries))if(entry.dependency?.[0]===change.category&&entry.dependency[1]===change.name)entry.dependency=[category,name];
          const field=({'Typ automatu':'type','Automat model':'model','Provozovatel':'operator','Automat výrobce':'manufacturer'})[change.category];
          if(field)for(const row of Object.values(updated.machines).flat())if(row[field]===change.name)row[field]=name;
          if(category==='Automat model'&&dependency?.[0]==='Automat výrobce')for(const row of Object.values(updated.machines).flat())if(row.model===name)row.manufacturer=dependency[1];
          if(change.category==='Typ provozovny')for(const row of updated.venues)if((row.type??'Herna')===change.name)row.type=name;
          if(change.category==='Příjem výdej')for(const row of updated.administration.adjustments)if(row.name===change.name)row.name=name;
          if(change.category==='Trezor'){for(const row of [...updated.venues,...updated.administration.books])if((row.safe??catalogs().Trezor[0])===change.name)row.safe=name;for(const row of updated.administration.treasury)if(row.safe===change.name)row.safe=name;}
          if(change.category==='Okruh Provozoven')for(const row of updated.venues)if(row.circuit===change.name)row.circuit=name;
          if(change.category==='Kniha pohyb')for(const row of [...updated.cash,...updated.queue.filter(item=>item.type==='cash').map(item=>item.record)])if(row.kind===change.name)row.kind=name;
        }));selected=name;catalog=category;dialog.close();render();notify('Číselník byl uložen.');
      }else{
        const recipients=[...new Set(values.getAll('recipients'))],text=String(values.get('text')).trim(),subject=String(values.get('subject')??'').trim();
        if(!recipients.length)throw new Error('Vyberte alespoň jednoho příjemce.');if(!text)throw new Error('Vyplňte text zprávy.');
        await write(state=>administrativeWrite(state,state.administration.revision,'Uložení zprávy do ukázky',updated=>{updated.administration.messages.unshift({id:crypto.randomUUID(),date:new Date().toISOString(),kind:messageKind,recipients,subject,text});}));
        messageHistory();notify('Zpráva je uložená v místní historii ukázky.');
      }
    }catch(problem){error.textContent=problem.message;error.hidden=false;}
  });
  return {catalogView,syncCatalogScroll,openMessages,cashHistory};
}
