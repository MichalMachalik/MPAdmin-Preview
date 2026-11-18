import {administrativeWrite,cashAmounts,cashWithBalances,groupsForUser} from './data.js?v=20261114.6';
import {passwordDigest} from './session.js?v=20261114.6';

export function createUserDetail(api) {
  const {e,button,table,number,getState,getUser,canManage,showUtility,write,render,notify}=api;
  let id,tab='detail',passwordEdit,bookId,bookTab='list';
  const tabs=[['detail','Detail uživatele'],['venues','Provozovny'],['cash','Pokladní kniha komplet'],['books','Pokladní knihy'],['multi','Multi knihy']];
  function select(target){id=target??getUser()?.id;tab='detail';bookId=undefined;bookTab='list';}
  function view(){
    const state=getState(),user=state.administration.users.find(item=>item.id===(id??getUser()?.id));
    if(!user||!canManage('users',user.id))return '<p>Uživatel není dostupný.</p>';
    const venues=state.venues.filter(venue=>user.role==='Admin'||user.venues.includes(venue.id));
    const ordinal=state.administration.users.indexOf(user)+1;
    const books=state.administration.books.filter(book=>!book.user||book.user===user.id);
    if(!books.some(book=>book.id===bookId))bookId=books[0]?.id;
    const bookSelector=`<label class="book-selector">Kniha <select id="user-book-select">${books.map(book=>`<option value="${e(book.id)}"${book.id===bookId?' selected':''}>${e(book.name)}</option>`).join('')}</select></label>`;
    let content;
    if(tab==='detail')content=table(['Detail',''],[['ID',ordinal],['Nick',e(user.nick)],['Jméno',e(user.first)],['Příjmení',e(user.last)],['Telefon',e(user.phone)],['E-mail',e(user.email)],['Zakázán',user.blocked?'Ano':''],['Dočasné heslo',user.temporaryPassword?'Ano':''],['Skupina',e(groupsForUser(user).join(', '))]],{label:'Údaje o uživateli',kind:'property-grid'});
    else if(tab==='venues')content=table(['ID','Název','Typ','Ulice','Město','PSČ','Provozní hotovost'],venues.map(venue=>[state.venues.indexOf(venue)+1,button(venue.name,'open-venue',{kind:'text-action',data:{venue:venue.id}}),e(venue.type??'Herna'),e(venue.street),e(venue.town),e(venue.postal),number(venue.cash)]),{label:'Provozovny uživatele'});
    else if(tab==='cash')content=table(['ID','Provozovna','Datum','Popis','Příjmy','Výdaje','Zůstatek'],venues.flatMap(venue=>cashWithBalances(state,venue.id,false).map(row=>[row.serverId,e(venue.name),e(row.date.split('-').reverse().join('.')),e(row.description),number(cashAmounts(row).income),number(cashAmounts(row).expense),number(row.balance)])),{label:'Pokladní kniha komplet',numeric:[0,4,5,6]});
    else if(tab==='books')content=bookTab==='detail'?bookSelector+(bookId?api.listing('bookVenues',bookId):'<p>Knihy nejsou založené.</p>'):table(['ID Kniha','Název','Popis','s_nazev_trezor',''],books.map(book=>[state.administration.books.indexOf(book)+1,button(book.name,'user-book-detail',{kind:'text-action',data:{id:book.id}}),e(book.note),e(book.safe??state.administration.catalogs.Trezor[0]),canManage('all')?button('Upravit záznam','admin-edit',{kind:'row-icon icon-only',icon:'✎',data:{kind:'books',id:book.id}})+button('Smazat záznam','admin-delete',{kind:'row-icon icon-only',icon:'×',data:{kind:'books',id:book.id}}):'']),{label:'Pokladní knihy uživatele'});
    else content=bookSelector+table(['ID','Název','Zůstatek','Man. Zůstatek','Man. Bez. Zůstatek','Celkem'],state.administration.bookVenues.filter(item=>item.book===bookId&&venues.some(venue=>venue.id===item.venue)).map(item=>{
      const venue=venues.find(venue=>venue.id===item.venue),balance=kind=>cashWithBalances(state,venue.id,false,kind)[0]?.balance??(kind==='cash'?venue.bookOpening??0:0);
      const cash=item.cash?balance('cash'):0,manager=item.manager?balance('manager'):0,noncash=item.noncash?balance('noncash'):0;
      return[state.venues.indexOf(venue)+1,e(venue.name),number(cash),number(manager),number(noncash),number(cash+manager+noncash)];
    }),{label:'Multi knihy',numeric:[0,2,3,4,5]});
    return `<div class="venue-commands"><div>${button('Změň heslo','user-password',{data:{id:user.id}})}${button('Pošli SMS','user-sms',{data:{id:user.id}})}${canManage('all')?button('Přihlásit se pod už.','user-sign-in',{data:{id:user.id}}):''}${button('Upravit','admin-edit',{data:{kind:'users',id:user.id}})}${canManage('all')?button('Smazat','admin-delete',{data:{kind:'users',id:user.id}}):''}</div></div>
      <p class="breadcrumb">${button('Úvodní stránka','web-page',{kind:'text-action',data:{view:'venues'}})} &gt; #${ordinal} - ${e(user.nick)}, ${e(user.last)} ${e(user.first)}</p>
      <div class="venue-layout"><aside class="venue-sidebar"><div class="arcade-art original-arcade" aria-hidden="true"></div><nav aria-label="Detail uživatele">${tabs.map(([value,label])=>button(label,'user-tab',{data:{tab:value},pressed:tab===value})).join('')}</nav></aside>
      <div class="venue-main"><div class="venue-heading"><h1>Detail uživatele</h1><aside class="venue-card"><img src="assets/temp_userprofilefoto.png" width="72" height="76" alt=""><div><strong># ${ordinal}<br>${e(user.nick)}</strong><p>${e(user.first)} ${e(user.last)}</p></div></aside></div>
      <div class="section-tools">${tab==='books'?`<div>${button('Pokladní knihy','user-book-tab',{kind:'web-section-tab',data:{tab:'list'},pressed:bookTab==='list'})}${button('Detail knihy','user-book-tab',{kind:'web-section-tab',data:{tab:'detail'},pressed:bookTab==='detail'})}</div>`:`<span class="web-section-tab">${tabs.find(([value])=>value===tab)[1]}</span>`}<div class="list-actions">${tab==='books'&&bookTab==='list'&&canManage('all')?button('Přidat knihu','admin-edit',{kind:'tool-icon icon-only',icon:'+',data:{kind:'books'}}):''}${tab!=='detail'?button('Export XLS','export-table',{kind:'tool-icon icon-only',icon:'XLS'}):''}</div></div>${content}</div></div>`;
  }
  document.addEventListener('click',event=>{
    const control=event.target.closest('[data-action^="user-"]');if(!control)return;
    const {action,id:target}=control.dataset;
    if(action==='user-tab'){tab=control.dataset.tab;render();}
    if(action==='user-book-tab'){bookTab=control.dataset.tab;render();}
    if(action==='user-book-detail'){bookId=target;tab='books';bookTab='detail';render();}
    if(action==='user-sign-in')api.signInAs(target);
    if(action==='user-sms')api.openMessages('sms',target);
    if(action==='user-password'&&canManage('users',target)){
      passwordEdit={id:target,revision:getState().administration.revision};
      showUtility('Zadejte nové heslo','<form id="user-password-form" class="original-form"><label><span>Nové heslo:</span><input type="password" name="password" required autocomplete="new-password"></label><p class="form-error" role="alert" hidden></p><footer class="dialog-actions"><button type="submit" class="soft">Odeslat</button></footer></form>');
    }
  });
  document.addEventListener('change',event=>{if(event.target.id==='user-book-select'){bookId=event.target.value;render();}});
  document.addEventListener('submit',async event=>{
    if(event.target.id!=='user-password-form')return;event.preventDefault();
    const form=event.target,change=passwordEdit;
    try {
      if(!canManage('users',change.id))throw new Error('Chybí oprávnění ke změně hesla.');
      const password=String(new FormData(form).get('password'));if(!password)throw new Error('Zadejte nové heslo.');
      const digest=await passwordDigest(password);
      await write(state=>administrativeWrite(state,change.revision,'Změna hesla',updated=>{updated.administration.users.find(user=>user.id===change.id).passwordHash=digest;}));
      form.closest('dialog').close();notify('Heslo bylo změněno.');
    }catch(problem){const error=form.querySelector('.form-error');error.textContent=problem.message;error.hidden=false;}
  });
  return {select,view};
}
