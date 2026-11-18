const months=['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'];
const monthWords=['ledna','února','března','dubna','května','června','července','srpna','září','října','listopadu','prosince'];
const shortMonths=['Led','Úno','Bře','Dub','Kvě','Čer','Čvc','Srp','Zář','Říj','Lis','Pro'];
function weekOf(date){const d=new Date(date);d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));return Math.ceil((((d-new Date(Date.UTC(d.getUTCFullYear(),0,1)))/86400000)+1)/7);}
const longFormat=new Intl.DateTimeFormat('cs-CZ',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const iso=date=>`${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}-${String(date.getUTCDate()).padStart(2,'0')}`;
function parse(value){
 const text=value.trim();if(!text)return '';
 let match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text),year,month,day;
 if(match)[,year,month,day]=match;else{match=/^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})\s*$/.exec(text);if(match)[,day,month,year]=match;else{match=/(\d{1,2})\.\s*([^\s]+)\s+(\d{4})/.exec(text);if(!match)return null;day=match[1];month=monthWords.indexOf(match[2].toLocaleLowerCase('cs-CZ'))+1;year=match[3];}}
 const date=new Date(Date.UTC(Number(year),Number(month)-1,Number(day)));return date.getUTCFullYear()===Number(year)&&date.getUTCMonth()===Number(month)-1&&date.getUTCDate()===Number(day)?iso(date):null;
}
const format=(value,native)=>value?(native?longFormat.format(new Date(value+'T00:00:00Z')):value.split('-').reverse().join('.')):'';

export function installCalendars(){
 const controls=new Map();let active,popup,month,year,serial=0;
 function refresh(original,force=false){const item=controls.get(original);if(!item)return;if(item.display.disabled!==original.disabled)item.display.disabled=original.disabled;if(item.display.readOnly!==original.readOnly)item.display.readOnly=original.readOnly;const disabled=original.disabled||original.readOnly;if(item.toggle.disabled!==disabled)item.toggle.disabled=disabled;if(force||document.activeElement!==item.display)item.display.value=format(original.value,item.native);}
 function close(focus=false){popup?.remove();popup=undefined;const item=active;active=undefined;if(item){item.display.setAttribute('aria-expanded','false');if(focus&&item.display.isConnected){item.skipFocus=true;item.display.focus();item.skipFocus=false;}}}
 function commit(item,value,emit=true){const result=parse(value);if(result===null){item.display.setCustomValidity('Zadejte platné datum ve tvaru dd.mm.rrrr.');return false;}item.display.setCustomValidity('');item.original.value=result;if(emit){item.original.dispatchEvent(new Event('input',{bubbles:true}));item.original.dispatchEvent(new Event('change',{bubbles:true}));}refresh(item.original,true);return true;}
 function segments(item){const value=item.display.value,match=item.native?/(\d{1,2})\.\s*([^\s]+)\s+(\d{4})/.exec(value):/(\d{2})\.(\d{2})\.(\d{4})/.exec(value);if(!match)return[];const day=match.index,month=value.indexOf(match[2],day+match[1].length),year=value.lastIndexOf(match[3]);return[[day,day+match[1].length],[month,month+match[2].length],[year,year+4]];}
 function selectSegment(item,index){const ranges=segments(item);item.segment=Math.max(0,Math.min(2,index));if(ranges[item.segment])item.display.setSelectionRange(...ranges[item.segment]);}
 function stepNative(item,amount){if(item.original.disabled||item.original.readOnly)return;const value=item.original.value;if(!value)return;const date=new Date(value+'T00:00:00Z'),part=item.segment??0,day=date.getUTCDate();if(part===0)date.setUTCDate(day+amount);else{date.setUTCDate(1);if(part===1)date.setUTCMonth(date.getUTCMonth()+amount);else date.setUTCFullYear(date.getUTCFullYear()+amount);date.setUTCDate(Math.min(day,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()));}commit(item,iso(date));selectSegment(item,part);}
 function typeNative(item,key){if(item.original.disabled||item.original.readOnly||!item.original.value)return;const part=item.segment??0,now=Date.now(),length=part===2?4:2;let digits=item.typed?.part===part&&now-item.typed.time<1000&&item.typed.digits.length<length?item.typed.digits+key:key;const value=Number(digits),date=new Date(item.original.value+'T00:00:00Z'),max=part===0?new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate():part===1?12:9999;if(value>max)digits=key;item.typed={part,digits,time:now};const number=Number(digits);if(!number||part===2&&digits.length<4)return;const day=date.getUTCDate();if(part===0)date.setUTCDate(number);else{date.setUTCDate(1);if(part===1)date.setUTCMonth(number-1);else date.setUTCFullYear(number);date.setUTCDate(Math.min(day,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()));}commit(item,iso(date));selectSegment(item,part);}
 function nativeMonth(current,today) {
  const first = new Date(Date.UTC(year,month,1));
  const offset = (first.getUTCDay()+6)%7;
  const weeks = [];
  const activeDay = active.calendarDay ?? (current.startsWith(iso(first).slice(0,7)) ? current : iso(first));
  for(let row=0;row<6;row++) {
   const days = [];
   for(let column=0;column<7;column++) {
    const day = new Date(Date.UTC(year,month,1+row*7+column-offset));
    const value = iso(day);
    const classes = [day.getUTCMonth()!==month?'adjacent-day':'',value===today?'today':''].filter(Boolean).join(' ');
    days.push(`<td><button type="button" class="${classes}" data-calendar-day="${value}" tabindex="${value===activeDay?0:-1}"${value===current?' aria-current="date"':''}>${day.getUTCDate()}</button></td>`);
   }
   weeks.push(`<tr>${days.join('')}</tr>`);
  }
  const label = months[month].toLocaleLowerCase('cs-CZ');
  const headings = ['po','út','st','čt','pá','so','ne'].map(day=>`<th scope="col">${day}</th>`).join('');
  return `<header>
    <button type="button" data-calendar-step="-1" aria-label="Předchozí měsíc">◀</button>
    <span>${label} ${year}</span>
    <button type="button" data-calendar-step="1" aria-label="Další měsíc">▶</button>
   </header>
   <table aria-label="Dny v měsíci"><thead><tr>${headings}</tr></thead><tbody>${weeks.join('')}</tbody></table>
   <footer><button type="button" data-calendar-day="${today}"><span aria-hidden="true"></span>Dnes: ${format(today,false)}</button></footer>`;
 }
 function draw(){
  if(!active)return;const item=active,current=item.original.value,today=iso(new Date()),count=item.nativeTheme||item.original.closest('.settlement-dates')?1:3;
  if(!popup){popup=document.createElement('div');popup.className=`date-popup${item.nativeTheme?' native-calendar':' web-calendar'}`;popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Kalendář');(item.original.closest('dialog')??document.body).append(popup);}
  if(item.nativeTheme) {
   popup.innerHTML = nativeMonth(current,today);
   positionPopup(item);
   return;
  }
  const blocks=[];
  for(let index=0;index<count;index++){
   const first=new Date(Date.UTC(year,month+index,1)),y=first.getUTCFullYear(),m=first.getUTCMonth(),offset=(first.getUTCDay()+6)%7,days=new Date(Date.UTC(y,m+1,0)).getUTCDate(),weeks=[];
   for(let r=0;r<(count>1?6:Math.ceil((offset+days)/7));r++){
    let cells=`<td class="week-number">${weekOf(new Date(Date.UTC(y,m,r*7-offset+1)))}</td>`;
    for(let c=0;c<7;c++){const day=r*7+c-offset+1,date=`${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;cells+=day<1||day>days?'<td></td>':`<td><button type="button" data-calendar-day="${date}"${date===current?' aria-current="date"':''}${date===today?' class="today"':''}>${day}</button></td>`;}weeks.push(`<tr>${cells}</tr>`);
   }
   const title=index===0?`<select aria-label="Měsíc">${shortMonths.map((name,i)=>`<option value="${i}"${i===m?' selected':''}>${name}</option>`).join('')}</select><select aria-label="Rok">${Array.from({length:21},(_,i)=>year-10+i).map(value=>`<option${value===y?' selected':''}>${value}</option>`).join('')}</select>`:`<strong>${months[m]} ${y}</strong>`;
   blocks.push(`<section class="date-month"><header>${index===0?'<button type="button" data-calendar-step="-1" aria-label="Předchozí měsíc">◀</button>':'<span></span>'}${title}${index===count-1?'<button type="button" data-calendar-step="1" aria-label="Další měsíc">▶</button>':'<span></span>'}</header><table aria-label="Dny v měsíci"><thead><tr>${['Týd','Po','Út','St','Čt','Pá','So','Ne'].map(day=>`<th>${day}</th>`).join('')}</tr></thead><tbody>${weeks.join('')}</tbody></table></section>`);
  }
  popup.classList.toggle('calendar-multiple',count>1);popup.innerHTML=`<div class="date-months">${blocks.join('')}</div>${count>1?`<footer><button type="button" data-calendar-today>Dnes</button><button type="button" data-calendar-close>Zavřít</button></footer>`:''}`;
  positionPopup(item);
 }
 function positionPopup(item) {
  const rect=item.display.getBoundingClientRect(),bounds=popup.getBoundingClientRect(),parent=popup.closest('dialog'),style=parent&&getComputedStyle(parent),anchor=parent&&style.transform!=='none'?parent.getBoundingClientRect():{left:0,top:0};
  popup.style.left=`${Math.max(4,Math.min(rect.left,innerWidth-bounds.width-4))-anchor.left-(anchor.left?parseFloat(style.borderLeftWidth):0)}px`;popup.style.top=`${(rect.bottom+bounds.height>innerHeight-4?Math.max(4,rect.top-bounds.height):rect.bottom)-anchor.top-(anchor.top?parseFloat(style.borderTopWidth):0)}px`;
 }
 function open(item){
  if(item.original.disabled||item.original.readOnly||active===item)return;
  close();active=item;const date=new Date((item.original.value||iso(new Date()))+'T00:00:00Z');
  year=date.getUTCFullYear();month=date.getUTCMonth();item.calendarDay=iso(date);
  item.display.setAttribute('aria-expanded','true');draw();
  if(item.nativeTheme)popup.querySelector('td button[tabindex="0"]')?.focus({preventScroll:true});
 }
 function upgrade(){
  for(const [original]of controls){if(!original.isConnected){if(active?.original===original)close();controls.delete(original);}else refresh(original);}
  for(const original of document.querySelectorAll('input[type="date"]')){
   if(original.dataset.calendarBound)continue;original.dataset.calendarBound='1';
   const native=!!original.closest('.native-dialog'),long=native;
   const id=original.id||`date-${++serial}`;original.id=id;
   const display=document.createElement('input');display.type='text';display.id=id+'-display';display.className='date-display';display.autocomplete='off';display.inputMode='numeric';display.required=original.required;display.setAttribute('aria-label',original.getAttribute('aria-label')||original.labels?.[0]?.textContent.trim()||original.name||'Datum');display.setAttribute('aria-haspopup','dialog');display.setAttribute('aria-expanded','false');display.dataset.dateField=original.name||id;
   const wrapper=document.createElement('span');wrapper.className=`date-control${native?' native-date-control':''}`;
   const toggle=document.createElement('button');toggle.type='button';toggle.className='calendar-toggle';toggle.setAttribute('aria-label','Otevřít kalendář');toggle.textContent=native?'⌄':'';toggle.tabIndex=-1;
   original.type='hidden';original.after(wrapper);wrapper.append(display,toggle);
   const item={original,display,toggle,native:long,nativeTheme:native,skipFocus:false};controls.set(original,item);refresh(original,true);
   display.addEventListener('focus',()=>{if(!native&&!item.skipFocus)open(item);if(native)selectSegment(item,item.segment??0);});toggle.addEventListener('click',()=>active===item?close(true):open(item));display.addEventListener('click',()=>{if(!native)open(item);else{const position=display.selectionStart,ranges=segments(item),index=ranges.findIndex(range=>position<=range[1]);selectSegment(item,index<0?2:index);}});
   display.addEventListener('input',()=>display.setCustomValidity(''));
   display.addEventListener('change',()=>commit(item,display.value));
   display.addEventListener('keydown',event=>{if(event.key==='Escape'&&active===item){event.preventDefault();event.stopPropagation();close(true);return;}if(event.key==='Enter'){event.preventDefault();event.stopPropagation();if(commit(item,display.value))close(true);return;}if(event.altKey&&event.key==='ArrowDown'||native&&event.key==='F4'){event.preventDefault();active===item?close(true):open(item);return;}if(native&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&/^\d$/.test(event.key)){event.preventDefault();typeNative(item,event.key);return;}if(native&&event.key.startsWith('Arrow')){event.preventDefault();event.stopPropagation();if(event.key==='ArrowLeft'||event.key==='ArrowRight')selectSegment(item,(item.segment??0)+(event.key==='ArrowLeft'?-1:1));else stepNative(item,event.key==='ArrowUp'?1:-1);return;}if(event.key==='Tab')close();});
  }
 }
 document.addEventListener('pointerdown',event=>{if(active&&!popup?.contains(event.target)&&!event.target.closest('.date-control'))close();},true);
 document.addEventListener('click',event=>{if(!popup?.contains(event.target))return;const day=event.target.closest('[data-calendar-day]'),step=event.target.closest('[data-calendar-step]');if(day){const item=active;commit(item,day.dataset.calendarDay);close(true);}if(step){const d=new Date(Date.UTC(year,month+Number(step.dataset.calendarStep),1));year=d.getUTCFullYear();month=d.getUTCMonth();active.calendarDay=iso(d);draw();if(active.nativeTheme)popup.querySelector('td button[tabindex="0"]')?.focus({preventScroll:true});}if(event.target.closest('[data-calendar-close]'))close(true);if(event.target.closest('[data-calendar-today]')){const today=new Date();year=today.getFullYear();month=today.getMonth();draw();}});
 document.addEventListener('change',event=>{if(!popup?.contains(event.target))return;if(event.target.getAttribute('aria-label')==='Měsíc')month=Number(event.target.value);else if(event.target.getAttribute('aria-label')==='Rok')year=Number(event.target.value);draw();});
 document.addEventListener('keydown',event=>{
  if(!active||!popup?.contains(event.target))return;
  if(event.key==='Escape'||active.nativeTheme&&(event.key==='F4'||event.altKey&&event.key==='ArrowUp')){
   event.preventDefault();event.stopImmediatePropagation();close(true);return;
  }
  if(event.key==='Tab'&&active.nativeTheme){close(true);return;}
  const day=event.target.closest('[data-calendar-day]');
  if(!day)return;
  const delta=({'ArrowLeft':-1,'ArrowRight':1,'ArrowUp':-7,'ArrowDown':7})[event.key];
  const page=active.nativeTheme?({'PageUp':-1,'PageDown':1})[event.key]:undefined;
  if(delta===undefined&&page===undefined)return;
  event.preventDefault();event.stopImmediatePropagation();
  const d=new Date(day.dataset.calendarDay+'T00:00:00Z');
  if(page!==undefined){
   const originalDay=d.getUTCDate();
   d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+page);
   d.setUTCDate(Math.min(originalDay,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));
  } else d.setUTCDate(d.getUTCDate()+delta);
  year=d.getUTCFullYear();month=d.getUTCMonth();active.calendarDay=iso(d);
  draw();popup.querySelector(`td [data-calendar-day="${iso(d)}"]`)?.focus({preventScroll:true});
 },true);
 new MutationObserver(upgrade).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','readonly']});
 window.addEventListener('resize',close);document.addEventListener('close',()=>{if(active&&!active.original.closest('dialog')?.open)close();},true);upgrade();return{upgrade,refresh:()=>{for(const [original]of controls)refresh(original,true);}};
}
