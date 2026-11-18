import { dateIsValid, cashAmounts } from './data.js?v=20261114.6';

export function createReports({getState,getVenues,getUser,e,button,table,number,render,exportWorkbook}) {
  const recordKind=row=>row.settlementId?'settlement':row.kind&&!['Příjem','Výdaj','Výdej'].includes(row.kind)?row.kind:row.direction;
  let selection={venues:[],kinds:[],from:'2026-11-01',to:'2026-11-30'};
  let generated=false;
  let workbookRows=[];
  function view() {
    const kinds=[['income','Příjem'],['expense','Výdaj'],['settlement','Odvod z denního vyúčtování'],...[...new Set([...getState().administration.catalogs['Příjem výdej'],...getState().administration.catalogs['Kniha pohyb'],'Odvod tržby','Příjmy provozovny','Tržba AMR','Tržba Black Jack','Tržba Poker','Tržba Ruleta','Tržba VHP','Tržba VLT','Výdaje provozovny',...getState().cash.map(row=>recordKind(row))])].filter(kind=>!['income','expense','settlement','Příjem','Výdaj','Výdej'].includes(kind)).map(kind=>[kind,kind])];
    const checks=(items,key)=>items.map(([id,name])=>`<label><input type="checkbox" name="${key}" value="${e(id)}"${selection[key].includes(id)?' checked':''}> ${e(name)}</label>`).join('');
    const form=`<form id="report-selection" class="report-selection"><div class="report-choices"><fieldset><legend>Provozovny</legend>${checks(getVenues().map(venue=>[venue.id,venue.name]),'venues')}</fieldset><fieldset><legend>Záznamy</legend>${checks(kinds,'kinds')}</fieldset></div><div class="report-period"><label>Datum Od <input name="from" type="date" value="${selection.from}" required></label><label>Datum Do <input name="to" type="date" value="${selection.to}" required></label><button type="submit" class="soft">Vygeneruj Sestavu</button>${button('Nová Sestava','report-reset',{kind:'soft'})}</div><p id="report-error" role="alert" class="form-error" hidden></p></form>`;
    let report='';
    if(generated){
      const months=[];let month=selection.from.slice(0,7);
      while(month<=selection.to.slice(0,7)){months.push(month);const [year,part]=month.split('-').map(Number);month=part===12?`${year+1}-01`:`${year}-${String(part+1).padStart(2,'0')}`;}
      const headers=['',...months.map(month=>`${month.slice(5)}.${month.slice(0,4)}`),'CELKEM'];
      const rows=[];const total=months.map(()=>0);
      for(const venue of getVenues().filter(venue=>selection.venues.includes(venue.id))){
        const sum=months.map(()=>0);
        for(const [kind,label] of kinds.filter(([kind])=>selection.kinds.includes(kind))){
          const entries=getState().cash.filter(row=>row.venue===venue.id&&recordKind(row)===kind&&row.date>=selection.from&&row.date<=selection.to);
          if(!entries.length)continue;
          const values=months.map((month,index)=>{
            const amount=entries.filter(row=>row.date.startsWith(month)).reduce((sum,row)=>sum+cashAmounts(row).income-cashAmounts(row).expense,0);sum[index]+=amount;total[index]+=amount;return amount;
          });
          rows.push([`${venue.name} - ${label}`,...values,values.reduce((a,b)=>a+b,0)]);
        }
        if(selection.kinds.length>1)rows.push([`${venue.name} - celkem`,...sum,sum.reduce((a,b)=>a+b,0)]);
      }
      rows.push(['Celkem',...total,total.reduce((a,b)=>a+b,0)]);
      workbookRows=[headers,...rows.map(row=>row.map((value,index)=>index?value/100:value))];
      const user=getUser();
      report=`<div class="section-tools"><span class="web-section-tab">Sestava</span><div class="list-actions">${button('Export sestavy XLS','report-xls',{kind:'soft'})}${button('PDF','pdf-export',{kind:'soft'})}${button('Tisk','print',{kind:'soft'})}</div></div><p class="report-author">Sestavil: ${e(`${user.first} ${user.last}`)}</p>${table(headers,rows.map(row=>row.map((value,index)=>index?number(value):e(value))),{label:'Exportní sestava',numeric:headers.map((_,index)=>index).slice(1)})}`;
    }
    return `${form}${report}<details class="additional-exports"><summary>Další exporty CSV</summary><div class="exports">${button('Denní vyúčtování · CSV','export',{kind:'soft',data:{type:'settlement'}})}${button('Pokladní kniha · CSV','export',{kind:'soft',data:{type:'cash'}})}${button('Měsíční součty · CSV','export',{kind:'soft',data:{type:'monthly'}})}</div></details>`;
  }
  document.addEventListener('submit',event=>{
    if(event.target.id!=='report-selection')return;
    event.preventDefault();const values=new FormData(event.target);
    const next={venues:values.getAll('venues'),kinds:values.getAll('kinds'),from:String(values.get('from')),to:String(values.get('to'))};
    const error=event.target.querySelector('#report-error');
    if(!next.venues.length||!next.kinds.length||!dateIsValid(next.from)||!dateIsValid(next.to)||next.to<next.from){error.textContent='Vyberte provozovnu, druh záznamu a platné období.';error.hidden=false;return;}
    selection=next;generated=true;render();
  });
  document.addEventListener('click',event=>{
    const action=event.target.closest('[data-action]')?.dataset.action;
    if(action==='report-reset'){generated=false;selection={...selection,venues:[],kinds:[]};render();}
    if(action==='report-xls')exportWorkbook('Sestava',workbookRows);
  });
  return {view};
}
