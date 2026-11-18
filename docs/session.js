export async function passwordDigest(value) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

export function createSession({getState,e,button,render,notify}) {
  const key='mpadmin-preview:user';
  let id='demo-operator';
  try { id=sessionStorage.getItem(key)??id; } catch {}
  const user=()=>{
    const state=getState(),entry=state.administration.users.find(user=>user.id===id&&!user.blocked);
    if(!entry)return;
    const today=new Date().toISOString().slice(0,10);
    return {...entry,venues:state.administration.assignments?state.administration.assignments.filter(item=>item.user===id&&(!item.from||item.from<=today)&&(!item.to||item.to>=today)).map(item=>item.venue):entry.venues};
  };
  const remember=value=>{id=value;try{sessionStorage.setItem(key,id);}catch{}};
  const canManage=(kind,target)=>user()?.role==='Admin'||user()?.role==='Správce'||kind==='users'&&target===id;
  function loginForm(windows) {
    return `<section class="${windows?'native-login windows-shell':'web-login'}" aria-label="Přihlášení do systému">
      ${windows?'<div class="window-caption">Vyúčtování a pokladna - Přihlášení</div>':'<img src="assets/temp_userprofilefoto.png" width="72" height="76" alt="">'}
      <form id="login-form"><fieldset><legend>Přihlášení do systému</legend><label>Nick <input name="nick" value="demo-operátor" autocomplete="off" required></label><label>Heslo <span class="password-field"><input name="password" value="demo" type="password" autocomplete="off" required>${button('Zobrazit heslo','password-visibility',{kind:'soft'})}</span></label><button type="submit" class="soft">Přihlásit</button><p class="form-error" id="login-error" hidden role="alert"></p></fieldset><p class="login-demo-note">Smyšlený účet: demo-operátor · heslo: demo</p></form></section>`;
  }
  document.addEventListener('click',event=>{
    const control=event.target.closest('[data-action]');
    if(control?.dataset.action==='logout'){remember('');render();}
    if(control?.dataset.action==='password-visibility'){
      const input=control.parentElement.querySelector('input');input.type=input.type==='password'?'text':'password';
      control.querySelector('.button-label').textContent=input.type==='password'?'Zobrazit heslo':'Skrýt heslo';
    }
  });
  document.addEventListener('submit',async event=>{
    if(event.target.id!=='login-form')return;
    event.preventDefault();const form=event.target;
    const values=new FormData(form);const nick=String(values.get('nick')).trim();
    const candidate=getState().administration.users.find(user=>user.nick===nick);
    const error=form.querySelector('#login-error');
    try {
      if(!candidate||candidate.blocked||await passwordDigest(String(values.get('password')))!==(candidate.passwordHash??await passwordDigest('demo')))throw new Error('Neplatné přihlašovací údaje nebo zakázaný účet.');
      if(!candidate.venues.length&&candidate.role!=='Admin')throw new Error('Uživatel nemá přiřazenou provozovnu.');
      remember(candidate.id);render();notify('Přihlášení do ukázky bylo úspěšné.');
    }catch(problem){error.textContent=problem.message;error.hidden=false;}
  });
  const signInAs=target=>{
    if(!canManage('all'))return;
    const candidate=getState().administration.users.find(user=>user.id===target&&!user.blocked);
    if(!candidate)return notify('Uživatel je zakázaný nebo neexistuje.',true);
    remember(target);render();
  };
  return {user,canManage,loginForm,signInAs,logout:()=>{remember('');render();}};
}
