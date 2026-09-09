const CFG=window.POINTJOUR_CONFIG||{};
const SCOPES='https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const PAYROLL_SOURCES=[
 ['BOSS','https://boss.gouv.fr/'],['URSSAF','https://www.urssaf.fr/'],['Net-entreprises','https://www.net-entreprises.fr/'],
 ['Légifrance','https://www.legifrance.gouv.fr/'],['Service-Public Pro','https://entreprendre.service-public.fr/'],
 ['Assurance Maladie','https://www.ameli.fr/entreprise'],['France Travail','https://www.francetravail.fr/employeur/'],
 ['Agirc-Arrco','https://www.agirc-arrco.fr/entreprises/'],['Ministère du Travail','https://travail-emploi.gouv.fr/'],
 ['Légisocial','https://www.legisocial.fr/actualites-sociales/'],['RF Paye','https://www.revue-fiduciaire.com/'],
 ['Éditions Tissot','https://www.editions-tissot.fr/actualite/droit-du-travail']
];
const TRUSTED={
 Auto:['service-public.fr','securite-routiere.gouv.fr','economie.gouv.fr','ademe.fr','largus.fr','caradisiac.com','quechoisir.org'],
 Cuisine:['mangerbouger.fr','anses.fr','750g.com','marmiton.org','cuisineaz.com']
};

const DEFAULT_SOURCES=[
 ...PAYROLL_SOURCES.map(([name,url])=>({name,url,active:true,themes:['Paie']})),
 {name:'Service-Public',url:'https://www.service-public.fr/',active:true,themes:['Auto']},
 {name:'Sécurité routière',url:'https://www.securite-routiere.gouv.fr/',active:true,themes:['Auto']},
 {name:'ADEME',url:'https://www.ademe.fr/',active:true,themes:['Auto']},
 {name:'L’Argus',url:'https://www.largus.fr/',active:true,themes:['Auto']},
 {name:'Que Choisir',url:'https://www.quechoisir.org/',active:true,themes:['Auto']},
 {name:'Manger Bouger',url:'https://www.mangerbouger.fr/',active:true,themes:['Cuisine']},
 {name:'ANSES',url:'https://www.anses.fr/',active:true,themes:['Cuisine']},
 {name:'750g',url:'https://www.750g.com/',active:true,themes:['Cuisine']},
 {name:'Marmiton',url:'https://www.marmiton.org/',active:true,themes:['Cuisine']},
 {name:'CuisineAZ',url:'https://www.cuisineaz.com/',active:true,themes:['Cuisine']}
].slice(0,30);
function migrateSources(v){return (Array.isArray(v)&&v.length?v:DEFAULT_SOURCES).slice(0,30).map(x=>({name:String(x.name||'Source'),url:String(x.url||''),active:x.active!==false,themes:Array.isArray(x.themes)?x.themes:[]}))}
function migrateArchive(v){const out=[];(Array.isArray(v)?v:[]).forEach(x=>{if(x&&x.url)out.push(x);else if(Array.isArray(x?.news))x.news.forEach(a=>a?.url&&out.push({date:x.date,title:a.title||'Article',url:a.url,source:a.source||'Source',theme:'Paie',scope:'work'}))});return out.slice(0,500)}

const defaults=[
 {name:'Paie',active:true,spaces:['work'],subs:['DSN','PAS','SMIC','PMSS','IJSS','Cotisations','Congés','Ruptures','Net social','Heures supplémentaires']},
 {name:'Auto',active:true,spaces:['private'],subs:['Achat','Entretien','Réparation','Contrôle technique','Assurance','Pneus','Carburant','Rappels constructeur']},
 {name:'Cuisine',active:true,spaces:['private'],subs:['Asiatique','Desserts','Grillades','Économique','Rapide','Four']}
];
const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
function migrateWatches(ws){
 const raw=Array.isArray(ws)?ws:[];
 const normalized=raw.map(w=>({...w,active:w.active!==false,subs:Array.isArray(w.subs)?w.subs.slice(0,20):[],spaces:Array.isArray(w.spaces)&&w.spaces.length?w.spaces:(String(w.name).toLowerCase()==='paie'?['work']:['private'])}));
 const names=new Set(normalized.map(w=>String(w.name||'').toLowerCase()));
 defaults.forEach(d=>{if(!names.has(d.name.toLowerCase()))normalized.push({...d,subs:[...d.subs],spaces:[...d.spaces]})});
 return normalized;
}
const emptyAccount=()=>({token:null,email:'',messages:[],events:[],expiresAt:0});
const sessionLoad=(k,d)=>{try{return JSON.parse(sessionStorage.getItem(k))??d}catch{return d}};
const sessionSave=(k,v)=>{try{sessionStorage.setItem(k,JSON.stringify(v))}catch{}};
const restored=sessionLoad('pj_session',null);
function validRestoredAccount(a){return a&&a.token&&Number(a.expiresAt)>Date.now()+60000?{...emptyAccount(),...a}:emptyAccount()}
const state={page:restored?.page||'choose',sessionReady:!!restored?.sessionReady,chosen:restored?.chosen||{private:false,work:false},accounts:{private:validRestoredAccount(restored?.accounts?.private),work:validRestoredAccount(restored?.accounts?.work)},news:[],watches:migrateWatches(load('pj_watches',defaults)),archive:migrateArchive(load('pj_archive',[])),sources:migrateSources(load('pj_sources',DEFAULT_SOURCES)),sourceEdit:-1,archiveTheme:'all',selected:Number.isInteger(restored?.selected)?restored.selected:0,tab:restored?.tab||'today',scope:restored?.scope||'all',error:'',loading:false,pendingAccount:'private'};
function persistSession(){sessionSave('pj_session',{page:state.page,sessionReady:state.sessionReady,chosen:state.chosen,accounts:state.accounts,selected:state.selected,tab:state.tab,scope:state.scope})}

save('pj_watches',state.watches);
let tokenClient=null;

const labels={private:'🏠 Privé',work:'💼 Travail',all:'Tout'};
const toast=m=>{const t=$('#toast');if(!t)return;t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)};
const configured=()=>CFG.GOOGLE_CLIENT_ID&&!CFG.GOOGLE_CLIENT_ID.startsWith('REMPLACEZ_');
const connectedKeys=()=>['private','work'].filter(k=>state.accounts[k].token);
const hasAccount=()=>connectedKeys().length>0;
function setPage(p){state.page=p;persistSession();$('#nav')?.classList.toggle('hidden',!state.sessionReady);document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));render();scrollTo(0,0)}
function scene(title,caption){return `<section class="scene"><div class="scene-copy"><h1>${title}</h1><p>${caption}</p><span>☕ Un bon café, les bonnes infos, une journée bien organisée !</span></div></section>`}
function topItems(title,caption){return scene(title,caption)}

function nextChosenMissing(){return chosenKeys().find(k=>!state.accounts[k].token)||null}
function finishSession(){state.sessionReady=true;state.scope=state.chosen.private&&state.chosen.work?'all':(state.chosen.private?'private':'work');state.page='brief';persistSession();render()}
function initGoogle(){
 if(!configured()||!window.google?.accounts?.oauth2)return false;
 tokenClient=google.accounts.oauth2.initTokenClient({client_id:CFG.GOOGLE_CLIENT_ID,scope:SCOPES,callback:async r=>{
  if(r.error){state.error=r.error;render();return}
  const key=state.pendingAccount||'private';
  state.accounts[key].token=r.access_token;
  state.accounts[key].expiresAt=Date.now()+((Number(r.expires_in)||3600)*1000);
  persistSession();
  state.loading=true;render();
  try{await Promise.all([loadGoogleAccount(key),loadNews()]);snapshot();state.error=''}catch(e){state.error=e.message}
  state.loading=false;
  const next=nextChosenMissing();
  persistSession();
  if(next){state.page='signin';persistSession();render()}
  else finishSession();
 }});return true;
}
function connectAccount(key){
 if(!configured()){state.error='Renseignez votre ID client OAuth Web dans config.js.';render();return}
 if(!tokenClient&&!initGoogle()){state.error='Google Identity Services se charge encore.';render();return}
 state.pendingAccount=key;
 tokenClient.requestAccessToken({prompt:'select_account'});
}
function disconnectAccount(key){state.accounts[key]=emptyAccount();persistSession();render();}
async function apiFor(key,u){const a=state.accounts[key];const r=await fetch(u,{headers:{Authorization:`Bearer ${a.token}`}});if(!r.ok){if(r.status===401){state.accounts[key]=emptyAccount();persistSession();throw Error(`${labels[key]} : votre session Google a expiré. Reconnectez ce compte.`)}throw Error(`${labels[key]} : Google API ${r.status}`)}return r.json()}
function gh(h,n){return(h||[]).find(x=>x.name?.toLowerCase()===n.toLowerCase())?.value||''}
async function loadGoogleAccount(key){
 const a=state.accounts[key];if(!a.token)return;
 const p=await apiFor(key,'https://gmail.googleapis.com/gmail/v1/users/me/profile');a.email=p.emailAddress||'';
 const other=key==='private'?'work':'private';
 if(state.accounts[other].token&&state.accounts[other].email&&state.accounts[other].email.toLowerCase()===a.email.toLowerCase()){a.token=null;a.email='';a.messages=[];a.events=[];throw Error(`${labels[key]} : ce compte Google est déjà utilisé pour ${labels[other]}. Choisissez un autre compte.`)}
 const q=encodeURIComponent('in:inbox -in:spam -category:promotions -category:social -category:forums');
 const refs=await apiFor(key,`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=25`);
 a.messages=(await Promise.all((refs.messages||[]).map(async x=>{try{
  const m=await apiFor(key,`https://gmail.googleapis.com/gmail/v1/users/me/messages/${x.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`),h=m.payload?.headers||[];
  return{id:m.id,sender:gh(h,'From'),subject:gh(h,'Subject')||'(Sans objet)',date:gh(h,'Date'),snippet:m.snippet||'',time:+m.internalDate||0,account:key}
 }catch{return null}}))).filter(Boolean).sort((x,y)=>y.time-x.time);
 const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+8);
 const ev=await apiFor(key,`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=150&timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}`);
 a.events=(ev.items||[]).map(e=>({id:e.id,title:e.summary||'Sans titre',start:e.start?.dateTime||e.start?.date||'',link:e.htmlLink||'',location:e.location||'',account:key}));
 persistSession();
}
async function loadNews(){let j=null;for(const u of [CFG.PAYROLL_NEWS_URL,'data/news.json']){try{const r=await fetch(u+(u.includes('?')?'&':'?')+'t='+Date.now(),{cache:'no-store'});if(r.ok){j=await r.json();break}}catch{}}state.news=(Array.isArray(j?.items)?j.items:[]).sort((a,b)=>new Date(b.publishedAt||b.discoveredAt||0)-new Date(a.publishedAt||a.discoveredAt||0))}
async function refreshAll(){state.loading=true;state.error='';render();try{await Promise.all([...connectedKeys().map(loadGoogleAccount),loadNews()]);snapshot()}catch(e){state.error=e.message}state.loading=false;render()}
function addArchive(item){if(!item?.url)return;const key=item.url+'|'+(item.theme||'');state.archive=[{date:new Date().toISOString(),title:item.title||'Résultat',url:item.url,source:item.source||'Web',theme:item.theme||'Général',scope:item.scope||state.scope},...state.archive.filter(x=>(x.url+'|'+(x.theme||''))!==key)].slice(0,500);save('pj_archive',state.archive)}
function snapshot(){state.news.slice(0,20).forEach(a=>a?.url&&addArchive({title:a.title,url:a.url,source:a.source||'Source',theme:'Paie',scope:'work'}))}
function allMessages(){return connectedKeys().flatMap(k=>state.accounts[k].messages).sort((a,b)=>b.time-a.time)}
function allEvents(){return connectedKeys().flatMap(k=>state.accounts[k].events).sort((a,b)=>new Date(a.start)-new Date(b.start))}
function scopedItems(type){if(state.scope==='all')return type==='messages'?allMessages():allEvents();return state.accounts[state.scope][type]||[]}
function watchVisible(w,scope=state.scope){if(!w.active)return false;if(scope==='all')return w.spaces?.length>0;return w.spaces?.includes(scope)}
function scopeTabs(){return `<div class="scope-tabs"><button class="${state.scope==='all'?'active':''}" data-scope="all">Tout</button><button class="${state.scope==='private'?'active':''}" data-scope="private">🏠 Privé</button><button class="${state.scope==='work'?'active':''}" data-scope="work">💼 Travail</button></div>`}
function accountBadge(k){return `<span class="account-badge ${k}">${labels[k]}</span>`}

function loadingScreen(){return `<section class="loading-screen"><h1>☀️ PointJour</h1><p>Préparation de votre brief…</p><div class="progress"><span></span></div><small>Analyse de vos comptes Google et de vos veilles.</small></section>`}
function openingChooser(){return `<section class="signin-scene"><div><img class="signin-logo" src="icon-192.png" alt="PointJour"><h1>PointJour</h1><h3>Quels comptes souhaitez-vous utiliser aujourd’hui ?</h3><p>Cochez Privé, Travail ou les deux, puis validez. PointJour enchaînera uniquement les connexions nécessaires avant d’ouvrir le Brief.</p>${state.error?`<div class="notice error">${esc(state.error)}</div>`:''}<div class="account-choice card"><label class="toggle-label"><input id="choosePrivate" type="checkbox" ${state.chosen.private?'checked':''}> 🏠 Compte privé</label><label class="toggle-label"><input id="chooseWork" type="checkbox" ${state.chosen.work?'checked':''}> 💼 Compte travail</label><button class="primary validate-choice" id="chooseContinue">Valider</button></div><button class="secondary" id="continueNoGoogle">Continuer sans compte Google</button><p class="tag">Lecture seule : Gmail + Google Agenda.</p></div></section>`}
function chosenKeys(){return ['private','work'].filter(k=>state.chosen[k])}
function allChosenReady(){const ks=chosenKeys();return ks.length>0&&ks.every(k=>state.accounts[k].token)}
function signin(){const ks=chosenKeys(),next=nextChosenMissing();return `<section class="signin-scene"><div><img class="signin-logo" src="icon-192.png" alt="PointJour"><h1>PointJour</h1><h3>Connexion des comptes sélectionnés</h3><p>PointJour traite les comptes dans l’ordre : Privé, puis Travail. Cliquez sur le compte en attente pour ouvrir la connexion Google.</p>${state.error?`<div class="notice error">${esc(state.error)}</div>`:''}<div class="account-connect">${ks.map(k=>{const a=state.accounts[k],pending=!a.token&&k===next;return `<div class="card account-card ${pending?'account-card-action':''}" ${pending?`data-connect="${k}" role="button" tabindex="0"`:''}><h3>${labels[k]}</h3>${a.token?`<p class="notice ok">✅ ${esc(a.email||'Compte connecté')}</p>`:`<p>${pending?'👉 Cliquez ici pour vous connecter avec Google.':'Connexion en attente.'}</p>${pending?`<button class="secondary skip-account" id="skipAccount" data-skip="${k}" type="button">Continuer sans ce compte</button>`:''}`}</div>`}).join('')}</div><button class="secondary" id="backChoose">← Modifier le choix des comptes</button><p class="tag">Un compte déjà valide est sauté automatiquement. Continuer sans un compte ne le supprime pas et ne le déconnecte pas.</p>${!configured()?'<div class="notice">Renseignez le client OAuth Web dans <b>config.js</b>.</div>':''}</div></section>`}

function home(){const active=state.watches.filter(w=>watchVisible(w));const mails=scopedItems('messages'),events=scopedItems('events');return topItems('☀️ PointJour','Bonjour ! Installez-vous : l’émeu a préparé votre point du jour.')+`${scopeTabs()}<div class="welcome card"><b>Bonjour !</b><p>${connectedKeys().map(k=>`${labels[k]} : ${esc(state.accounts[k].email)}`).join('<br>')}</p>${state.error?`<div class="notice error">${esc(state.error)}</div>`:''}</div><div class="grid"><button class="tile" data-go="mail">📧<strong>Gmail</strong><span>${mails.length} messages</span></button><button class="tile" data-go="calendar">📅<strong>Agenda</strong><span>${events.length} événements / 8 jours</span></button>${active.map(w=>`<button class="tile" data-watch="${state.watches.indexOf(w)}">🔎<strong>${esc(w.name)}</strong><span>${w.subs.length} sous-thèmes · ${(w.spaces||[]).map(x=>x==='private'?'🏠':'💼').join(' ')}</span></button>`).join('')}</div><div class="card quick"><button class="primary" id="refresh">↻ Actualiser</button><button class="secondary" data-go="brief">✓ Accéder à mon brief</button></div>`}
function mail(){const msgs=scopedItems('messages');return topItems('📧 Courriels','Les nouveaux messages utiles, sans promotions ni spam.')+scopeTabs()+`<div class="card hint">Promotions, réseaux sociaux, forums et spam sont exclus.</div>${msgs.map(m=>`<div class="item" data-mail="${m.id}" data-account="${m.account}">${accountBadge(m.account)}<h3>${esc(m.subject)}</h3><b>${esc(m.sender)}</b><p>${esc(m.snippet)}</p><span class="meta">${esc(m.date)}</span></div>`).join('')||'<div class="empty">Aucun message pour ce filtre.</div>'}`}
function calendar(){const evs=scopedItems('events');return topItems('📅 Agenda','Aujourd’hui et les sept prochains jours, pour garder le rythme.')+scopeTabs()+`<div class="card"><b>Aujourd’hui + 7 jours</b></div>${evs.map(e=>`<div class="item" data-event="${esc(e.link)}">${accountBadge(e.account)}<h3>${esc(e.title)}</h3><p>${esc(new Date(e.start.length===10?e.start+'T00:00:00':e.start).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:e.start.length===10?undefined:'short'}))}</p>${e.location?`<span class="meta">📍 ${esc(e.location)}</span>`:''}</div>`).join('')||'<div class="empty">Aucun événement pour ce filtre.</div>'}`}
function brief(){const active=state.watches.filter(w=>watchVisible(w)),msgs=scopedItems('messages'),evs=scopedItems('events');return topItems('☀️ PointJour — Brief du jour','Votre point de départ : comptes, messages, agenda et veilles.')+scopeTabs()+`<div class="welcome card"><div><b>Comptes utilisés</b><p>${connectedKeys().length?connectedKeys().map(k=>`${labels[k]} : ${esc(state.accounts[k].email)}`).join('<br>'):'Mode sans compte Google'}</p></div><button class="btn-blue" id="refresh">↻ Actualiser</button>${state.error?`<div class="notice error">${esc(state.error)}</div>`:''}</div><div class="brief-grid"><div class="card accent-blue"><h3>📧 Gmail</h3><p>${msgs.length} message(s) récent(s).</p><button class="btn-blue" data-go="mail">Voir les messages →</button></div><div class="card accent-green"><h3>📅 Agenda</h3><p>${evs.length} événement(s) sur 8 jours.</p><button class="btn-green" data-go="calendar">Voir les événements →</button></div>${active.map((w,i)=>{const idx=state.watches.indexOf(w),cls=['btn-orange','btn-purple','btn-green'][i%3];return `<div class="card"><h3>🔎 ${esc(w.name)}</h3><p>${w.subs.length} sous-thème${w.subs.length>1?'s':''} configuré${w.subs.length>1?'s':''}.</p><p>${(w.spaces||[]).map(accountBadge).join(' ')}</p><button class="${cls}" data-search-watch="${idx}">Lancer la recherche →</button></div>`}).join('')}</div>`}
function filterNews(w){const terms=w.subs.map(x=>x.toLowerCase());return state.news.filter(a=>{const t=[a.title,a.summary,...(a.topics||[])].join(' ').toLowerCase();return !terms.length||terms.some(x=>t.includes(x))})}
function sourceDomainsFor(theme){return state.sources.filter(x=>x.active&&(!x.themes.length||x.themes.includes(theme))).map(x=>{try{return new URL(x.url).hostname.replace(/^www\./,'')}catch{return ''}}).filter(Boolean)}
function webSearchUrl(q,theme){const ds=sourceDomainsFor(theme);const suffix=ds.length?' ('+ds.map(d=>'site:'+d).join(' OR ')+')':'';return 'https://www.google.com/search?q='+encodeURIComponent(q+suffix)}
function watchPage(){const w=state.watches[state.selected],paie=w.name.toLowerCase()==='paie',items=paie?filterNews(w):[],shown=state.tab==='archive'?items.slice(10):items.slice(0,10),domains=sourceDomainsFor(w.name);return topItems(`🔎 ${esc(w.name)}`,`${w.subs.length} sous-thèmes configurés · ${(w.spaces||[]).map(x=>labels[x]).join(' + ')}`)+`<div class="tabs"><button class="${state.tab==='today'?'primary':'secondary'}" data-tab="today">Aujourd’hui</button><button class="${state.tab==='archive'?'primary':'secondary'}" data-tab="archive">Archives</button></div>${paie?(shown.map(article).join('')||'<div class="empty">Aucun résultat dans cette rubrique.</div>'):`<div class="card"><h3>Recherche Web sur vos sources</h3><p>${w.subs.map(x=>`<span class="badge">${esc(x)}</span>`).join(' ')}</p><div class="row">${w.subs.slice(0,20).map(s=>`<button class="secondary" data-search="${esc(s)}">🔎 ${esc(s)}</button>`).join('')}</div>${domains.length?`<p class="meta">Sources actives : ${esc(domains.join(', '))}</p>`:'<p class="meta">Aucune source affectée : recherche Web générale.</p>'}</div>`}`}
function article(a){return `<article class="item"><h3>${esc(a.title)}</h3><p>${esc(a.summary||'')}</p><span class="badge">${esc(a.source||'Source')}</span>${(a.topics||[]).slice(0,3).map(t=>`<span class="badge">${esc(t)}</span>`).join('')}<p class="meta">${esc(String(a.publishedAt||a.discoveredAt||'').slice(0,10))}</p><a class="primary inline" href="${esc(a.url)}" target="_blank" rel="noopener">Ouvrir la source ↗</a></article>`}
function watches(){return topItems('🔎 Mes veilles','Choisissez les sujets à garder à l’œil.')+`<div class="notice ok"><b>Jusqu’à 20 sous-thèmes par veille.</b><br>Chaque veille peut être affichée dans 🏠 Privé, 💼 Travail, ou les deux. Une veille désactivée conserve ses réglages.</div>${state.watches.map((w,i)=>`<div class="card source"><div><h3>${esc(w.name)}</h3><span class="meta">${w.subs.length} sous-thème${w.subs.length>1?'s':''} • ${w.active?'Veille active ✓':'Veille désactivée'} • ${(w.spaces||[]).map(x=>labels[x]).join(' + ')||'Aucun univers'}</span></div><button class="secondary" data-edit="${i}">Modifier</button></div>`).join('')}<div class="card row"><button class="secondary" data-go="search">⌕ Recherche</button><button class="secondary" data-go="sources">☷ Sources</button><button class="secondary" data-go="web">🌐 Recherche Web</button></div>`}
function editWatch(){const w=state.watches[state.selected];return topItems('⚙️ Modifier la veille','Personnalisez votre veille sans perdre vos réglages.')+`<div class="card"><div class="field"><label>Nom du thème</label><input id="wname" maxlength="24" value="${esc(w.name)}"></div><div class="field"><label class="toggle-label"><input id="wactive" type="checkbox" ${w.active?'checked':''}> Veille active</label><p class="field-help">Décochez pour omettre cette veille dans PointJour. Vos sous-thèmes et affectations restent enregistrés.</p></div><div class="field"><label>Afficher les résultats dans</label><div class="universe-choices"><label class="toggle-label"><input id="wprivate" type="checkbox" ${w.spaces?.includes('private')?'checked':''}> 🏠 Privé</label><label class="toggle-label"><input id="wwork" type="checkbox" ${w.spaces?.includes('work')?'checked':''}> 💼 Travail</label></div><p class="field-help">Les deux cases peuvent être cochées simultanément.</p></div><div class="field"><label>Sous-thèmes (maximum 20, un par ligne)</label><textarea id="wsubs" rows="12">${esc(w.subs.join('\n'))}</textarea><p class="counter">${w.subs.length} / 20 sous-thèmes</p></div><div class="row"><button class="primary" id="wsave">Enregistrer</button><button class="secondary" id="wcancel">Annuler</button></div></div>`}
function searchPage(){return webPage()}
function sourcesPage(){const rows=state.sources.map((x,i)=>`<div class="card source"><div><h3>${x.active?'🟢':'⚪'} ${esc(x.name)}</h3><span class="meta">${esc(x.themes.join(' · ')||'Tous thèmes')} · ${esc((()=>{try{return new URL(x.url).hostname}catch{return x.url}})())}</span></div><div class="row"><button class="secondary" data-source-test="${i}">Tester</button><button class="secondary" data-source-toggle="${i}">${x.active?'Désactiver':'Activer'}</button><button class="secondary" data-source-edit="${i}">Modifier</button><button class="danger" data-source-delete="${i}">Supprimer</button></div></div>`).join('');return topItems('☷ Mes sources','Vos sources, vos thèmes : jusqu’à 30 adresses personnalisables.')+`<div class="notice ok"><b>${state.sources.length} / 30 sources.</b> Une source désactivée reste enregistrée mais n’est plus utilisée dans les recherches.</div><div class="row"><button class="primary" id="sourceAdd" ${state.sources.length>=30?'disabled':''}>+ Ajouter une source</button><button class="secondary" id="sourceReset">Restaurer les sources par défaut</button></div>${rows||'<div class="empty">Aucune source configurée.</div>'}`}
function sourceEditPage(){const isNew=state.sourceEdit<0,x=isNew?{name:'',url:'https://',active:true,themes:[]}:state.sources[state.sourceEdit];return topItems(isNew?'＋ Ajouter une source':'✎ Modifier la source','Nom, adresse et thèmes associés.')+`<div class="card"><div class="field"><label>Nom</label><input id="sname" maxlength="50" value="${esc(x.name)}"></div><div class="field"><label>URL</label><input id="surl" value="${esc(x.url)}"></div><div class="field"><label class="toggle-label"><input id="sactive" type="checkbox" ${x.active?'checked':''}> Source active</label></div><div class="field"><label>Associer aux veilles</label>${state.watches.map((w,i)=>`<label class="toggle-label"><input type="checkbox" data-stheme="${i}" ${x.themes.includes(w.name)?'checked':''}> ${esc(w.name)}</label>`).join('')}<p class="field-help">Aucune case cochée = source utilisable pour tous les thèmes.</p></div><div class="row"><button class="primary" id="ssave">Enregistrer</button><button class="secondary" data-go="sources">Annuler</button></div></div>`}
function webPage(){return topItems('🌐 Recherche Web','PointJour combine votre thème, vos sous-thèmes et vos sources actives.')+`<div class="card"><div class="field"><label>Mot-clé complémentaire</label><input id="globalq" placeholder="Ex. nouveautés, guide, barème, recette…"></div><div class="field"><label>Choisir une veille</label><select id="globalwatch"><option value="">Recherche générale</option>${state.watches.filter(w=>w.active).map(w=>`<option>${esc(w.name)}</option>`).join('')}</select></div><button class="btn-blue" id="globalsearch">🔎 Rechercher sur le Web</button></div>${state.watches.filter(w=>w.active).map((w,i)=>{const idx=state.watches.indexOf(w),cls=['btn-orange','btn-purple','btn-green'][i%3];return `<div class="card source"><div><h3>🔎 ${esc(w.name)}</h3><span class="meta">${w.subs.length} sous-thèmes · ${sourceDomainsFor(w.name).length} source(s) active(s)</span></div><div class="row"><button class="secondary" data-edit="${idx}">✏️ Modifier</button><button class="${cls}" data-search-watch="${idx}">Lancer la recherche</button></div></div>`}).join('')}`}
function archives(){const baseThemes=['Paie','Auto','Cuisine'],themes=['all',...new Set([...baseThemes,...state.watches.filter(w=>w.active).map(w=>w.name),...state.archive.map(x=>x.theme).filter(Boolean)])],items=state.archive.filter(x=>(state.scope==='all'||x.scope==='all'||x.scope===state.scope)&&(state.archiveTheme==='all'||x.theme===state.archiveTheme));return topItems('▣ Archives','Un vrai historique : chaque résultat peut être rouvert.')+scopeTabs()+`<div class="tabs archive-themes">${themes.map(t=>`<button class="${state.archiveTheme===t?'primary':'secondary'}" data-archive-theme="${esc(t)}">${esc(t==='all'?'Tous les thèmes':t)}</button>`).join('')}</div>${items.map(x=>`<a class="item archive-item" href="${esc(x.url)}" target="_blank" rel="noopener"><span class="badge">${esc(x.theme||'Général')}</span><h3>${esc(x.title)}</h3><p>${esc(x.source||'Source')}</p><span class="meta">${new Date(x.date).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'})}</span><strong>Ouvrir la source ↗</strong></a>`).join('')||'<div class="empty">Aucun résultat archivé pour ce filtre.</div>'}`}
function accountCard(key){const a=state.accounts[key];return `<div class="card account-card"><h3>${labels[key]}</h3>${a.token?`<p><b>${esc(a.email||'Compte connecté')}</b></p><p>📧 ${a.messages.length} messages · 📅 ${a.events.length} événements</p><div class="row"><button class="secondary" data-connect="${key}">Changer de compte</button><button class="danger" data-disconnect="${key}">Déconnecter</button></div>`:`<p>Aucun compte connecté.</p><button class="primary" data-connect="${key}">Connecter</button>`}</div>`}
function settings(){return topItems('☰ Paramètres','Une application bien réglée pour une journée plus sereine.')+`<div class="settings-grid">${accountCard('private')}${accountCard('work')}<div class="card"><h3>Veilles personnalisées</h3><p>Jusqu’à 20 sous-thèmes, affectés à Privé et/ou Travail.</p><button class="secondary" data-go="watches">Gérer mes veilles</button></div><div class="card"><h3>Sécurité</h3><p>Pour éviter une reconnexion après F5 ou Ctrl+F5, les jetons OAuth sont conservés temporairement dans <b>sessionStorage</b> jusqu’à leur expiration. Ils ne sont pas enregistrés durablement dans localStorage. Vous pouvez déconnecter ou changer chaque compte à tout moment.</p></div></div>`}
function morePage(){return topItems('☰ Plus','Tout le reste à portée de bec.')+`<div class="menu-list"><button data-go="web">🌐 <span><b>Recherche Web</b><small>Thèmes, sous-thèmes et sources actives</small></span>›</button><button data-go="sources">☷ <span><b>Mes sources</b><small>Ajouter, modifier, tester ou désactiver</small></span>›</button><button data-go="settings">⚙️ <span><b>Paramètres</b><small>Comptes Google, veilles et sécurité</small></span>›</button></div>`}

function render(){document.body.dataset.page=state.loading?'loading':(state.page||'home');let h='';if(!state.sessionReady){if(state.loading)h=loadingScreen();else if(state.page==='choose')h=openingChooser();else h=signin();}else if(state.loading)h=loadingScreen();else if(state.page==='home'||state.page==='brief'||state.page==='signin'||state.page==='choose')h=brief();else if(state.page==='mail')h=mail();else if(state.page==='calendar')h=calendar();else if(state.page==='watches')h=watches();else if(state.page==='watch')h=watchPage();else if(state.page==='edit')h=editWatch();else if(state.page==='search'||state.page==='web')h=webPage();else if(state.page==='sources')h=sourcesPage();else if(state.page==='sourceedit')h=sourceEditPage();else if(state.page==='archives')h=archives();else if(state.page==='settings')h=settings();else h=morePage();$('#app').innerHTML=h;$('#nav')?.classList.toggle('hidden',!state.sessionReady);bind();}
function bind(){
 document.querySelectorAll('[data-go]').forEach(x=>x.onclick=()=>setPage(x.dataset.go));
 document.querySelectorAll('[data-connect]').forEach(x=>x.onclick=()=>connectAccount(x.dataset.connect));
 document.querySelectorAll('[data-disconnect]').forEach(x=>x.onclick=()=>disconnectAccount(x.dataset.disconnect));
 document.querySelectorAll('.account-card-action[data-connect]').forEach(x=>{x.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();connectAccount(x.dataset.connect)}}});
 if($('#skipAccount'))$('#skipAccount').onclick=()=>{const k=$('#skipAccount').dataset.skip;state.chosen[k]=false;state.error='';persistSession();const next=nextChosenMissing();if(next){state.page='signin';render()}else finishSession()};
 if($('#chooseContinue'))$('#chooseContinue').onclick=()=>{state.chosen.private=$('#choosePrivate').checked;state.chosen.work=$('#chooseWork').checked;persistSession();if(!state.chosen.private&&!state.chosen.work){state.error='Cochez au moins un compte ou choisissez « Continuer sans compte Google ».';render();return}state.error='';const next=nextChosenMissing();if(next){state.page='signin';render();setTimeout(()=>connectAccount(next),150)}else finishSession()};
 if($('#continueNoGoogle'))$('#continueNoGoogle').onclick=async()=>{state.chosen={private:false,work:false};state.loading=true;persistSession();render();try{await loadNews();state.error=''}catch(e){state.error=e.message}state.loading=false;state.sessionReady=true;state.page='brief';persistSession();render()};
 if($('#backChoose'))$('#backChoose').onclick=()=>{state.page='choose';state.error='';persistSession();render()};
 document.querySelectorAll('[data-scope]').forEach(x=>x.onclick=()=>{state.scope=x.dataset.scope;persistSession();render()});
 $('#refresh')&&($('#refresh').onclick=refreshAll);
 document.querySelectorAll('[data-mail]').forEach(x=>x.onclick=()=>{const email=state.accounts[x.dataset.account]?.email||'';open(`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email)}#inbox/${encodeURIComponent(x.dataset.mail)}`,'_blank')});
 document.querySelectorAll('[data-event]').forEach(x=>x.onclick=()=>x.dataset.event&&open(x.dataset.event,'_blank'));
 document.querySelectorAll('[data-watch]').forEach(x=>x.onclick=()=>{state.selected=+x.dataset.watch;state.tab='today';persistSession();setPage('watch')});
 document.querySelectorAll('[data-edit]').forEach(x=>x.onclick=()=>{state.selected=+x.dataset.edit;persistSession();setPage('edit')});
 document.querySelectorAll('[data-tab]').forEach(x=>x.onclick=()=>{state.tab=x.dataset.tab;persistSession();render()});
 document.querySelectorAll('[data-search]').forEach(x=>x.onclick=()=>{const w=state.watches[state.selected],q=`${w.name} ${x.dataset.search}`,url=webSearchUrl(q,w.name);addArchive({title:`Recherche : ${q}`,url,source:'Recherche Web',theme:w.name,scope:(w.spaces||[]).length===1?w.spaces[0]:'all'});open(url,'_blank')});
 document.querySelectorAll('[data-search-watch]').forEach(x=>x.onclick=()=>{const w=state.watches[+x.dataset.searchWatch];if(!w)return;const q=[w.name,...w.subs.slice(0,20)].join(' '),url=webSearchUrl(q,w.name);addArchive({title:`Recherche ${w.name}`,url,source:'Recherche Web',theme:w.name,scope:(w.spaces||[]).length===1?w.spaces[0]:'all'});open(url,'_blank')});
  if($('#globalsearch'))$('#globalsearch').onclick=()=>{const extra=$('#globalq').value.trim(),name=$('#globalwatch').value.trim(),w=state.watches.find(x=>x.name===name),q=[name,w?.subs?.join(' '),extra].filter(Boolean).join(' ');if(!q){toast('Saisissez un mot-clé ou choisissez une veille');return}const url=webSearchUrl(q,name);addArchive({title:`Recherche : ${[name,extra].filter(Boolean).join(' — ')}`,url,source:'Recherche Web',theme:name||'Général',scope:w?.spaces?.length===1?w.spaces[0]:'all'});open(url,'_blank')};
 document.querySelectorAll('[data-archive-theme]').forEach(x=>x.onclick=()=>{state.archiveTheme=x.dataset.archiveTheme;render()});
 document.querySelectorAll('[data-source-test]').forEach(x=>x.onclick=()=>{const a=state.sources[+x.dataset.sourceTest];if(a?.url)open(a.url,'_blank')});
 document.querySelectorAll('[data-source-toggle]').forEach(x=>x.onclick=()=>{const i=+x.dataset.sourceToggle;state.sources[i].active=!state.sources[i].active;save('pj_sources',state.sources);render()});
 document.querySelectorAll('[data-source-edit]').forEach(x=>x.onclick=()=>{state.sourceEdit=+x.dataset.sourceEdit;setPage('sourceedit')});
 document.querySelectorAll('[data-source-delete]').forEach(x=>x.onclick=()=>{const i=+x.dataset.sourceDelete;if(confirm('Supprimer cette source ?')){state.sources.splice(i,1);save('pj_sources',state.sources);render()}});
 if($('#sourceAdd'))$('#sourceAdd').onclick=()=>{if(state.sources.length>=30)return;state.sourceEdit=-1;setPage('sourceedit')};
 if($('#sourceReset'))$('#sourceReset').onclick=()=>{if(confirm('Restaurer les sources par défaut ?')){state.sources=migrateSources(DEFAULT_SOURCES);save('pj_sources',state.sources);render()}};
 if($('#ssave'))$('#ssave').onclick=()=>{const name=$('#sname').value.trim(),url=$('#surl').value.trim(),themes=[...document.querySelectorAll('[data-stheme]:checked')].map(x=>state.watches[+x.dataset.stheme]?.name).filter(Boolean);if(!name||!/^https?:\/\//i.test(url)){toast('Nom et URL http(s) valides requis');return}const obj={name,url,active:$('#sactive').checked,themes};if(state.sourceEdit<0){if(state.sources.length>=30){toast('Maximum 30 sources');return}state.sources.push(obj)}else state.sources[state.sourceEdit]=obj;save('pj_sources',state.sources);toast('Source enregistrée');setPage('sources')};
 if($('#wsave'))$('#wsave').onclick=()=>{const name=$('#wname').value.trim()||'Veille',subs=$('#wsubs').value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,20),spaces=[];if($('#wprivate').checked)spaces.push('private');if($('#wwork').checked)spaces.push('work');state.watches[state.selected]={name,active:$('#wactive').checked,subs,spaces};save('pj_watches',state.watches);toast('Veille enregistrée');setPage('watches')};
 $('#wcancel')&&($('#wcancel').onclick=()=>setPage('watches'));
}
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
window.addEventListener('load',async()=>{document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>setPage(b.dataset.page));setTimeout(initGoogle,700);
 if(state.sessionReady&&connectedKeys().length){
  state.loading=true;render();
  try{await Promise.all([...connectedKeys().map(loadGoogleAccount),loadNews()]);state.error=''}catch(e){state.error=e.message}
  state.loading=false;persistSession();render();
 }else render();
});
