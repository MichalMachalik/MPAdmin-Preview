import {records,rowAmounts,newSettlement,parseMoney,saveMachineReading} from './data.js?v=20261114.6';

export function createMachineDetail(api) {
  const {e,button,table,number,getState,getVenues,getMachines,render,showUtility,write,notify}=api;
  let selection,tab='detail',page=1,limit=20,editing,exportRows=[];
  const date=value=>value.slice(0,10).split('-').reverse().join('.');
  const decimal=value=>String(value/100).replace('.',',');
  const monthName=new Intl.DateTimeFormat('cs-CZ',{month:'long',timeZone:'UTC'});
  function open(id,venue){selection={id,venue};tab='detail';page=1;api.navigate();}
  function entries(){return records(getState(),'settlement',selection.venue).flatMap(record=>record.rows.filter(row=>row.machine===selection.id).map(row=>({record,row,...rowAmounts(row)})));}
  function view(){
    const state=getState(),machine=getMachines(selection.venue).find(row=>row.id===selection.id),venue=getVenues().find(row=>row.id===selection.venue);
    if(!machine||!venue)return '<p>Zařízení již není dostupné.</p>';
    const all=getVenues().flatMap(v=>getMachines(v.id)),id=all.findIndex(m=>m.id===machine.id)+1,items=entries(),latest=items[0]?.row;
    const buttons=api.canManage('machine')?button('Vyúčtování','machine-reading',{icon:'✚'})+button('Upravit','admin-edit',{icon:'✎',data:{kind:'machine',id:machine.id,venue:venue.id}})+button('Smazat','admin-delete',{icon:'×',data:{kind:'machine',id:machine.id,venue:venue.id}}):'';
    let content;
    if(tab==='detail')content=`<div class="section-tools"><span class="web-section-tab">Detail</span></div>${table(['Detail',''],[['ID',id],['Provozovna',e(venue.name)],['Provozovatel',e(machine.operator??'Demo provozovatel')],['Pořadí',machine.order],['Číslo',machine.number],['Název',e(machine.label)],['Výrobce',e(machine.manufacturer??'')],['Model',e(machine.model)],['Typ',e(machine.type)],['IN',number(latest?.inEnd??machine.initialIn)],['OUT',number(latest?.outEnd??machine.initialOut)],['Poznámka',e(machine.note)],['ID provozovna',getVenues().indexOf(venue)+1],['ID Typ',state.administration.catalogs['Typ automatu'].indexOf(machine.type)+1],['ID model',state.administration.catalogs['Automat model'].indexOf(machine.model)+1],['Nulovat',machine.reset?'Ano':'']],{label:'Údaje o automatu',kind:'property-grid'})}`;
    else{
      let headers,rows,numeric;
      if(tab==='daily'){
        headers=['ID','s_cis__automat_typ','s_cis__automat_model','Automat','IN počátek','IN konec','Peníze','OUT počátek','OUT konec','Vyplaceno','Výnos','Do',''];numeric=[0,4,5,6,7,8,9,10];
        rows=items.map(({record,row,money,output,yield:profit},i)=>[items.length-i,e(machine.type),e(machine.model),e(machine.label),...[row.inStart,row.inEnd,money,row.outStart,row.outEnd,output,profit].map(number),date(record.to),api.canManage('machine')?button('Upravit vyúčtování','machine-reading',{kind:'row-icon icon-only',icon:'✎',data:{record:record.id}}):'']);
      }else{
        headers=['Rok','Měsíc č.','Měsíc','Ozn.','IN','IN konec','OUT','OUT konec','Výnos',''];numeric=[0,1,4,5,6,7,8];
        const groups=new Map();for(const entry of items.slice().reverse()){const key=entry.record.to.slice(0,7),g=groups.get(key)??{money:0,output:0,profit:0};g.money+=entry.money;g.output+=entry.output;g.profit+=entry.yield;g.inEnd=entry.row.inEnd;g.outEnd=entry.row.outEnd;groups.set(key,g);}
        rows=[...groups].sort(([a],[b])=>b.localeCompare(a)).map(([key,g])=>[key.slice(0,4),Number(key.slice(5)),e(monthName.format(new Date(key+'-01T00:00:00Z'))),e(machine.label),...[g.money,g.inEnd,g.output,g.outEnd,g.profit].map(number),'']);
      }
      const pages=Math.max(1,Math.ceil(rows.length/limit));page=Math.min(page,pages);
      exportRows=[headers.slice(0,-1),...rows.map(row=>row.slice(0,-1).map(value=>{const element=document.createElement('span');element.innerHTML=String(value);return element.textContent;}))];
      content=`<div class="section-tools"><span class="web-section-tab">${tab==='daily'?'Vyúčtování':'Měsíční přehled'}</span><div class="list-actions">${api.canManage('machine')?button('Přidání nového záznamu','machine-reading',{kind:'tool-icon icon-only add-icon',icon:'+'}):''}${button('Export XLS','machine-detail-export',{kind:'tool-icon icon-only',icon:'XLS'})}</div></div>${table(headers,rows.slice((page-1)*limit,page*limit),{label:tab==='daily'?'Historie automatu':'Měsíční přehled automatu',numeric})}<div class="table-foot"><select id="machine-detail-limit" class="venue-limit" aria-label="Řádků na stránku">${[20,50,100,500].map(n=>`<option${limit===n?' selected':''}>${n}</option>`).join('')}</select> Řádků na stránku | Celkem nalezeno ${rows.length} položek<nav class="venue-pagination">${button('‹ Předchozí','machine-detail-page',{kind:'text-action',disabled:page===1,data:{page:page-1}})} | ${page} | ${button('Další ›','machine-detail-page',{kind:'text-action',disabled:page===pages,data:{page:page+1}})}</nav></div>`;
    }
    return `<div class="venue-commands"><div>${buttons}</div></div><p class="breadcrumb">${button('Úvodní stránka','web-page',{kind:'text-action',data:{view:'venues'}})} &gt; #${id} - ${e(machine.label)}, ${e(machine.manufacturer??'')} - ${e(machine.model)}</p><div class="venue-layout"><aside class="venue-sidebar"><div class="arcade-art original-arcade" aria-hidden="true"></div><nav aria-label="Detail automatu">${[['detail','Detail'],['daily','Vyúčtování'],['monthly','Měsíční přehled']].map(([key,label])=>button(label,'machine-detail-tab',{data:{tab:key},pressed:tab===key})).join('')}</nav></aside><div class="venue-main"><div class="venue-heading"><h1>Detail zařízení</h1><aside class="venue-card"><div><img src="assets/temp_userprofilefoto.png" width="72" height="76" alt=""></div><div><strong># ${id}<br>${e(machine.label)}</strong><p>${e(machine.type)} - ${e(machine.manufacturer??'')}<br>${e(machine.model)}</p></div></aside></div>${content}</div></div>`;
  }
  function reading(recordId){
    if(!api.canManage('machine'))return;
    const state=getState(),existing=recordId&&records(state,'settlement',selection.venue).find(row=>row.id===recordId),record=structuredClone(existing??newSettlement(state,selection.venue,false)),row=record.rows.find(row=>row.machine===selection.id);
    if(!row)return;
    editing={record,id:selection.id,existing:!!existing};
    const input=(name,label,value,type='text')=>`<label><span>${label}:</span><input name="${name}" type="${type}" value="${e(value)}"${name==='note'?' maxlength="100"':' required'}></label>`;
    showUtility(existing?'Uprav vyúčtování':'Přidej vyúčtování',`<form id="machine-reading-form" class="original-form"><label><span>Automat:</span><select name="machine"${existing?' disabled':''}>${getVenues().flatMap(venue=>getMachines(venue.id).map(m=>`<option value="${e(m.id)}"${m.id===selection.id?' selected':''}>${e(m.label)} - ${e(venue.name)}</option>`)).join('')}</select></label>${input('from','Od',record.from,'date')}${input('to','Do',record.to,'date')}${[['inStart','IN počátek'],['inEnd','IN konec'],['outStart','OUT počátek'],['outEnd','OUT konec']].map(([key,label])=>input(key,label,decimal(row[key]))).join('')}${input('missing','Chybějící peníze',decimal(rowAmounts(row).input-rowAmounts(row).money))}${input('note','Poznámka',row.note??'')}<p class="form-error" hidden role="alert"></p><footer class="dialog-actions"><button class="soft" type="submit">Uložit</button></footer></form>`);
    document.querySelector('#utility').classList.add('management-dialog');
  }
  document.addEventListener('click',event=>{const node=event.target.closest('[data-action]');if(!node)return;switch(node.dataset.action){case'machine-history':open(node.dataset.id,node.dataset.venue);break;case'machine-detail-tab':tab=node.dataset.tab;page=1;render();break;case'machine-detail-page':page=Number(node.dataset.page);render();break;case'machine-reading':reading(node.dataset.record);break;case'machine-detail-export':{api.exportWorkbook(tab==='daily'?'Vyúčtování':'Měsíční přehled',exportRows);break;}}});
  document.addEventListener('change',event=>{if(event.target.id==='machine-detail-limit'){limit=Number(event.target.value);page=1;render();}if(event.target.matches('#machine-reading-form [name=machine]')){const venue=getVenues().find(v=>getMachines(v.id).some(m=>m.id===event.target.value));selection={id:event.target.value,venue:venue.id};reading();}});
  document.addEventListener('submit',async event=>{
    if(event.target.id!=='machine-reading-form')return;event.preventDefault();const form=event.target,values=new FormData(form),error=form.querySelector('.form-error'),submit=form.querySelector('[type=submit]');submit.disabled=true;
    try{
      const record=structuredClone(editing.record),row=record.rows.find(r=>r.machine===editing.id);for(const key of ['inStart','inEnd','outStart','outEnd']){row[key]=parseMoney(values.get(key));if(!Number.isFinite(row[key]))throw Error('Zadejte platné číselné hodnoty.');}
      const missing=parseMoney(values.get('missing'));if(!Number.isFinite(missing))throw Error('Zadejte platnou částku chybějících peněz.');row.money=row.inEnd-row.inStart-missing;row.note=String(values.get('note'));
      record.from=String(values.get('from'));record.to=String(values.get('to'));
      if(!editing.existing){record.rows=[row];record.machineIds=[row.machine];record.adjustments=[];record.adjustmentCategories=[];}
      await write(state=>{api.authorize(state,record);return saveMachineReading(state,record,editing.id);});document.querySelector('#utility').close();tab='daily';render();notify('Vyúčtování bylo uloženo.');
    }catch(problem){error.textContent=problem.message;error.hidden=false;}finally{submit.disabled=false;}
  });
  return {open,view};
}
