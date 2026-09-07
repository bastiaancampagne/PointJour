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
const defaults=[
 {name:'Paie',active:true,spaces:['work'],subs:['DSN','PAS','SMIC','PMSS','IJSS','Cotisations','Congés','Ruptures','Net social','Heures supplémentaires']},
 {name:'Auto',active:true,spaces:['private'],subs:['Achat','Entretien','Réparation','Contrôle technique','Assurance','Pneus','Carburant','Rappels constructeur']},
 {name:'Cuisine',active:true,spaces:['private'],subs:['Asiatique','Desserts','Grillades','Économique','Rapide','Four']}
];
const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
function migrateWatches(ws){return (Array.isArray(ws)?ws:defaults).map(w=>({...w,active:w.active!==false,subs:Array.isArray(w.subs)?w.subs.slice(0,20):[],spaces:Array.isArray(w.spaces)&&w.spaces.length?w.spaces:(String(w.name).toLowerCase()==='paie'?['work']:['private'])}))}
const emptyAccount=()=>({token:null,email:'',messages:[],events:[]});
const state={page:'signin',accounts:{private:emptyAccount(),work:emptyAccount()},news:[],watches:migrateWatches(load('pj_watches',defaults)),archive:load('pj_archive',[]),selected:0,tab:'today',scope:'all',error:'',loading:false,pendingAccount:'private'};
save('pj_watches',state.watches);
let tokenClient=null;

const labels={private:'🏠 Privé',work:'💼 Travail',all:'Tout'};
const toast=m=>{const t=$('#toast');if(!t)return;t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)};
const configured=()=>CFG.GOOGLE_CLIENT_ID&&!CFG.GOOGLE_CLIENT_ID.startsWith('REMPLACEZ_');
const connectedKeys=()=>['private','work'].filter(k=>state.accounts[k].token);
const hasAccount=()=>connectedKeys().length>0;
function setPage(p){state.page=p;$('#nav')?.classList.toggle('hidden',!hasAccount());document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));render();scrollTo(0,0)}
function scene(title,caption,img='assets/emu-breakfast.png'){return `<section class="scene"><img src="${img}" alt="Émeu PointJour"><div class="scene-copy"><h1>${title}</h1><p>${caption}</p><span>☕ Un bon café, les bonnes infos, une journée bien organisée !</span></div></section>`}
function topItems(title,caption,img='assets/emu-breakfast.png'){return scene(title,caption,img)}

function initGoogle(){
 if(!configured()||!window.google?.accounts?.oauth2)return false;
 tokenClient=google.accounts.oauth2.initTokenClient({client_id:CFG.GOOGLE_CLIENT_ID,scope:SCOPES,callback:async r=>{
  if(r.error){state.error=r.error;render();return}
  const key=state.pendingAccount||'private';
  state.accounts[key].token=r.access_token;
  state.loading=true;render();
  try{await Promise.all([loadGoogleAccount(key),loadNews()]);snapshot();state.error=''}catch(e){state.error=e.message}
  state.loading=false;setPage('home');
 }});return true;
}
function connectAccount(key){
 if(!configured()){state.error='Renseignez votre ID client OAuth Web dans config.js.';render();return}
 if(!tokenClient&&!initGoogle()){state.error='Google Identity Services se charge encore.';render();return}
 state.pendingAccount=key;
 tokenClient.requestAccessToken({prompt:'select_account'});
}
function disconnectAccount(key){state.accounts[key]=emptyAccount();if(!hasAccount())state.page='signin';render();}
async function apiFor(key,u){const a=state.accounts[key];const r=await fetch(u,{headers:{Authorization:`Bearer ${a.token}`}});if(!r.ok)throw Error(`${labels[key]} : Google API ${r.status}`);return r.json()}
function gh(h,n){return(h||[]).find(x=>x.name?.toLowerCase()===n.toLowerCase())?.value||''}
async function loadGoogleAccount(key){
 const a=state.accounts[key];if(!a.token)return;
 const p=await apiFor(key,'https://gmail.googleapis.com/gmail/v1/users/me/profile');a.email=p.emailAddress||'';
 const q=encodeURIComponent('in:inbox -in:spam -category:promotions -category:social -category:forums');
 const refs=await apiFor(key,`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=25`);
 a.messages=(await Promise.all((refs.messages||[]).map(async x=>{try{
  const m=await apiFor(key,`https://gmail.googleapis.com/gmail/v1/users/me/messages/${x.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`),h=m.payload?.headers||[];
  return{id:m.id,sender:gh(h,'From'),subject:gh(h,'Subject')||'(Sans objet)',date:gh(h,'Date'),snippet:m.snippet||'',time:+m.internalDate||0,account:key}
 }catch{return null}}))).filter(Boolean).sort((x,y)=>y.time-x.time);
 const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+8);
 const ev=await apiFor(key,`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=150&timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}`);
 a.events=(ev.items||[]).map(e=>({id:e.id,title:e.summary||'Sans titre',start:e.start?.dateTime||e.start?.date||'',link:e.htmlLink||'',location:e.location||'',account:key}));
}
async function loadNews(){let j=null;for(const u of [CFG.PAYROLL_NEWS_URL,'data/news.json']){try{const r=await fetch(u+(u.includes('?')?'&':'?')+'t='+Date.now(),{cache:'no-store'});if(r.ok){j=await r.json();break}}catch{}}state.news=(Array.isArray(j?.items)?j.items:[]).sort((a,b)=>new Date(b.publishedAt||b.discoveredAt||0)-new Date(a.publishedAt||a.discoveredAt||0))}
async function refreshAll(){state.loading=true;state.error='';render();try{await Promise.all([...connectedKeys().map(loadGoogleAccount),loadNews()]);snapshot()}catch(e){state.error=e.message}state.loading=false;render()}
function snapshot(){const d=new Date().toISOString().slice(0,10),entry={date:d,mails:allMessages().length,events:allEvents().length,news:state.news.slice(0,20)};state.archive=[entry,...state.archive.filter(x=>x.date!==d)].slice(0,60);save('pj_archive',state.archive)}
function allMessages(){return connectedKeys().flatMap(k=>state.accounts[k].messages).sort((a,b)=>b.time-a.time)}
function allEvents(){return connectedKeys().flatMap(k=>state.accounts[k].events).sort((a,b)=>new Date(a.start)-new Date(b.start))}
function scopedItems(type){if(state.scope==='all')return type==='messages'?allMessages():allEvents();return state.accounts[state.scope][type]||[]}
function watchVisible(w,scope=state.scope){if(!w.active)return false;if(scope==='all')return w.spaces?.length>0;return w.spaces?.includes(scope)}
function scopeTabs(){return `<div class="scope-tabs"><button class="${state.scope==='all'?'active':''}" data-scope="all">Tout</button><button class="${state.scope==='private'?'active':''}" data-scope="private">🏠 Privé</button><button class="${state.scope==='work'?'active':''}" data-scope="work">💼 Travail</button></div>`}
function accountBadge(k){return `<span class="account-badge ${k}">${labels[k]}</span>`}

function loadingScreen(){return `<section class="loading-screen"><img src="assets/emu-loading.png" alt="Émeu avec café"><h1>☀️ PointJour</h1><p>Préparation de votre brief…</p><div class="progress"><span></span></div><small>Analyse de vos comptes Google et de vos veilles.</small></section>`}
function signin(){return `<section class="signin-scene"><img src="assets/emu-breakfast.png" alt="Émeu au petit déjeuner"><div><img class="signin-logo" src="icon-192.png" alt="PointJour"><h1>PointJour</h1><h3>Votre journée, l’essentiel en un coup d’œil</h3><p>Connectez un ou deux comptes Google. Le second reste facultatif.</p>${state.error?`<div class="notice error">${esc(state.error)}</div>`:''}<div class="account-connect"><button class="primary" data-connect="private">🏠 Connecter le compte privé</button><button class="secondary" data-connect="work">💼 Connecter le compte travail</button></div><p class="tag">Lecture seule : Gmail + Google Agenda.</p>${!configured()?'<div class="notice">Renseignez le client OAuth Web dans <b>config.js</b>.</div>':''}</div></section>`}
function home(){const active=state.watches.filter(w=>watchVisible(w));const mails=allMessages(),events=allEvents();return topItems('☀️ PointJour','Bonjour ! Installez-vous : l’émeu a préparé votre point du jour.')+`${scopeTabs()}<div class="welcome card"><b>Bonjour !</b><p>${connectedKeys().map(k=>`${labels[k]} : ${esc(state.accounts[k].email)}`).join('<br>')}</p>${state.error?`<div class="notice error">${esc(state.error)}</div>`:''}</div><div class="grid"><button class="tile" data-go="mail">📧<strong>Gmail</strong><span>${mails.length} messages</span></button><button class="tile" data-go="calendar">📅<strong>Agenda</strong><span>${events.length} événements / 8 jours</span></button>${active.map(w=>`<button class="tile" data-watch="${state.watches.indexOf(w)}">🔎<strong>${esc(w.name)}</strong><span>${w.subs.length} sous-thèmes · ${(w.spaces||[]).map(x=>x==='private'?'🏠':'💼').join(' ')}</span></button>`).join('')}</div><div class="card quick"><button class="primary" id="refresh">↻ Actualiser</button><button class="secondary" data-go="brief">✓ Accéder à mon brief</button></div>`}
function mail(){const msgs=scopedItems('messages');return topItems('📧 Courriels','Les nouveaux messages utiles, sans promotions ni spam.','assets/emu-brief.png')+scopeTabs()+`<div class="card hint">Promotions, réseaux sociaux, forums et spam sont exclus.</div>${msgs.map(m=>`<div class="item" data-mail="${m.id}" data-account="${m.account}">${accountBadge(m.account)}<h3>${esc(m.subject)}</h3><b>${esc(m.sender)}</b><p>${esc(m.snippet)}</p><span class="meta">${esc(m.date)}</span></div>`).join('')||'<div class="empty">Aucun message pour ce filtre.</div>'}`}
function calendar(){const evs=scopedItems('events');return topItems('📅 Agenda','Aujourd’hui et les sept prochains jours, pour garder le rythme.','assets/emu-brief.png')+scopeTabs()+`<div class="card"><b>Aujourd’hui + 7 jours</b></div>${evs.map(e=>`<div class="item" data-event="${esc(e.link)}">${accountBadge(e.account)}<h3>${esc(e.title)}</h3><p>${esc(new Date(e.start.length===10?e.start+'T00:00:00':e.start).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:e.start.length===10?undefined:'short'}))}</p>${e.location?`<span class="meta">📍 ${esc(e.location)}</span>`:''}</div>`).join('')||'<div class="empty">Aucun événement pour ce filtre.</div>'}`}
function brief(){const active=state.watches.filter(w=>watchVisible(w)),msgs=scopedItems('messages'),evs=scopedItems('events');return topItems('✓ Brief du jour','L’essentiel d’abord, les détails ensuite.','assets/emu-brief.png')+scopeTabs()+`<div class="brief-grid"><div class="card"><h3>📧 Gmail</h3><p>${msgs.length} message(s) récent(s).</p><button class="linkbtn" data-go="mail">Voir les messages →</button></div><div class="card"><h3>📅 Agenda</h3><p>${evs.length} événement(s) sur 8 jours.</p><button class="linkbtn" data-go="calendar">Voir l’agenda →</button></div>${active.map(w=>{const paie=w.name.toLowerCase()==='paie',n=paie?filterNews(w).length:null;return `<div class="card"><h3>🔎 ${esc(w.name)}</h3><p>${paie?n+' résultat(s) collecté(s), les plus récents en premier.':'Recherche ciblée prête sur '+w.subs.length+' sous-thème'+(w.subs.length>1?'s':'')+'.'}</p><p>${(w.spaces||[]).map(accountBadge).join(' ')}</p>${paie?`<button class="linkbtn" data-watch="${state.watches.indexOf(w)}">Voir les résultats →</button>`:`<button class="linkbtn" data-search-watch="${state.watches.indexOf(w)}">Lancer la recherche →</button>`}</div>`}).join('')}</div>`}
function filterNews(w){const terms=w.subs.map(x=>x.toLowerCase());return state.news.filter(a=>{const t=[a.title,a.summary,...(a.topics||[])].join(' ').toLowerCase();return !terms.length||terms.some(x=>t.includes(x))})}
function watchPage(){const w=state.watches[state.selected],paie=w.name.toLowerCase()==='paie',domains=TRUSTED[w.name]||[],items=paie?filterNews(w):[],shown=state.tab==='archive'?items.slice(10):items.slice(0,10);return topItems(`🔎 ${esc(w.name)}`,`${w.subs.length} sous-thèmes configurés · ${(w.spaces||[]).map(x=>labels[x]).join(' + ')}`,'assets/emu-watches.png')+`<div class="tabs"><button class="${state.tab==='today'?'primary':'secondary'}" data-tab="today">Aujourd’hui</button><button class="${state.tab==='archive'?'primary':'secondary'}" data-tab="archive">Archives</button></div>${paie?(shown.map(article).join('')||'<div class="empty">Aucun résultat dans cette rubrique.</div>'):`<div class="card"><h3>Recherche sur sources fiables</h3><p>${w.subs.map(x=>`<span class="badge">${esc(x)}</span>`).join(' ')}</p><div class="row">${w.subs.slice(0,20).map(s=>`<button class="secondary" data-search="${esc(s)}">🔎 ${esc(s)}</button>`).join('')}</div>${domains.length?`<p class="meta">Domaines privilégiés : ${esc(domains.join(', '))}</p>`:''}</div>`}`}
function article(a){return `<article class="item"><h3>${esc(a.title)}</h3><p>${esc(a.summary||'')}</p><span class="badge">${esc(a.source||'Source')}</span>${(a.topics||[]).slice(0,3).map(t=>`<span class="badge">${esc(t)}</span>`).join('')}<p class="meta">${esc(String(a.publishedAt||a.discoveredAt||'').slice(0,10))}</p><a class="primary inline" href="${esc(a.url)}" target="_blank" rel="noopener">Ouvrir la source ↗</a></article>`}
function watches(){return topItems('🔎 Mes veilles','Choisissez les sujets à garder à l’œil.','assets/emu-watches.png')+`<div class="notice ok"><b>Jusqu’à 20 sous-thèmes par veille.</b><br>Chaque veille peut être affichée dans 🏠 Privé, 💼 Travail, ou les deux. Une veille désactivée conserve ses réglages.</div>${state.watches.map((w,i)=>`<div class="card source"><div><h3>${esc(w.name)}</h3><span class="meta">${w.subs.length} sous-thème${w.subs.length>1?'s':''} • ${w.active?'Veille active ✓':'Veille désactivée'} • ${(w.spaces||[]).map(x=>labels[x]).join(' + ')||'Aucun univers'}</span></div><button class="secondary" data-edit="${i}">Modifier</button></div>`).join('')}<div class="card row"><button class="secondary" data-go="search">⌕ Recherche</button><button class="secondary" data-go="sources">☷ Sources officielles</button><button class="secondary" data-go="experts">👥 Experts / Web</button></div>`}
function editWatch(){const w=state.watches[state.selected];return topItems('⚙️ Modifier la veille','Personnalisez votre veille sans perdre vos réglages.','assets/emu-breakfast.png')+`<div class="card"><div class="field"><label>Nom du thème</label><input id="wname" maxlength="24" value="${esc(w.name)}"></div><div class="field"><label class="toggle-label"><input id="wactive" type="checkbox" ${w.active?'checked':''}> Veille active</label><p class="field-help">Décochez pour omettre cette veille dans PointJour. Vos sous-thèmes et affectations restent enregistrés.</p></div><div class="field"><label>Afficher les résultats dans</label><div class="universe-choices"><label class="toggle-label"><input id="wprivate" type="checkbox" ${w.spaces?.includes('private')?'checked':''}> 🏠 Privé</label><label class="toggle-label"><input id="wwork" type="checkbox" ${w.spaces?.includes('work')?'checked':''}> 💼 Travail</label></div><p class="field-help">Les deux cases peuvent être cochées simultanément.</p></div><div class="field"><label>Sous-thèmes (maximum 20, un par ligne)</label><textarea id="wsubs" rows="12">${esc(w.subs.join('\n'))}</textarea><p class="counter">${w.subs.length} / 20 sous-thèmes</p></div><div class="row"><button class="primary" id="wsave">Enregistrer</button><button class="secondary" id="wcancel">Annuler</button></div></div>`}
function searchPage(){return topItems('⌕ Recherche','Une recherche bien ciblée pour des réponses plus claires.','assets/emu-search.png')+`<div class="card"><div class="field"><label>Mot-clé, thème ou référence</label><input id="globalq" placeholder="Ex. recettes de saison, pneus hiver, PMSS…"></div><div class="field"><label>Choisir une veille</label><select id="globalwatch"><option value="">Toutes les veilles actives</option>${state.watches.filter(w=>w.active).map(w=>`<option>${esc(w.name)}</option>`).join('')}</select></div><button class="primary" id="globalsearch">Rechercher sur le Web</button></div>`}
function sourcesPage(){const extras=[['Service-Public','https://www.service-public.fr/'],['ADEME','https://www.ademe.fr/'],['ANSES','https://www.anses.fr/'],['Manger Bouger','https://www.mangerbouger.fr/']];return topItems('☷ Sources officielles','Accès direct aux principaux sites fiables.','assets/emu-breakfast.png')+`<div class="source-list">${[...PAYROLL_SOURCES,...extras].map(([n,u])=>`<a class="source-link" href="${u}" target="_blank" rel="noopener"><span>🌐</span><div><b>${esc(n)}</b><small>${esc(new URL(u).hostname)}</small></div><strong>›</strong></a>`).join('')}</div>`}
function expertsPage(){return topItems('👥 Experts / Web','Des publications utiles pour aller plus loin.','assets/emu-experts.png')+`<div class="card"><p>PointJour n’accède pas à votre compte LinkedIn. Cette page lance des recherches publiques ciblées selon vos veilles.</p></div>${state.watches.filter(w=>w.active).map(w=>`<div class="card source"><div><h3>${esc(w.name)}</h3><span class="meta">Recherche d’experts, publications et actualités</span></div><button class="secondary" data-expert="${esc(w.name)}">Rechercher</button></div>`).join('')}`}
function archives(){return topItems('▣ Archives','Retrouvez les points du jour déjà mémorisés.','assets/emu-breakfast.png')+(state.archive.map(x=>`<div class="item"><h3>${esc(new Date(x.date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}</h3><p>📧 ${x.mails} · 📅 ${x.events} · 🔎 ${x.news?.length||0} éléments de veille</p></div>`).join('')||'<div class="empty">Les archives apparaîtront après la première actualisation.</div>')}
function accountCard(key){const a=state.accounts[key];return `<div class="card account-card"><h3>${labels[key]}</h3>${a.token?`<p><b>${esc(a.email||'Compte connecté')}</b></p><p>📧 ${a.messages.length} messages · 📅 ${a.events.length} événements</p><div class="row"><button class="secondary" data-connect="${key}">Changer de compte</button><button class="danger" data-disconnect="${key}">Déconnecter</button></div>`:`<p>Aucun compte connecté.</p><button class="primary" data-connect="${key}">Connecter</button>`}</div>`}
function settings(){return topItems('☰ Paramètres','Une application bien réglée pour une journée plus sereine.','assets/emu-breakfast.png')+`<div class="settings-grid">${accountCard('private')}${accountCard('work')}<div class="card"><h3>Veilles personnalisées</h3><p>Jusqu’à 20 sous-thèmes, affectés à Privé et/ou Travail.</p><button class="secondary" data-go="watches">Gérer mes veilles</button></div><div class="card"><h3>Sécurité</h3><p>Les jetons OAuth restent en mémoire pendant la session et ne sont pas enregistrés dans localStorage.</p></div></div>`}
function morePage(){return topItems('☰ Plus','Tout le reste à portée de bec.','assets/emu-breakfast.png')+`<div class="menu-list"><button data-go="search">⌕ <span><b>Recherche</b><small>Trouver rapidement une information</small></span>›</button><button data-go="sources">☷ <span><b>Sources officielles</b><small>Accéder aux sites fiables</small></span>›</button><button data-go="experts">👥 <span><b>Experts / Web</b><small>Recherches publiques ciblées</small></span>›</button><button data-go="settings">⚙️ <span><b>Paramètres</b><small>Comptes Google, veilles et sécurité</small></span>›</button></div>`}

function render(){let h='';if(state.loading&&hasAccount())h=loadingScreen();else if(!hasAccount())h=signin();else if(state.page==='home'||state.page==='signin')h=home();else if(state.page==='mail')h=mail();else if(state.page==='calendar')h=calendar();else if(state.page==='brief')h=brief();else if(state.page==='watches')h=watches();else if(state.page==='watch')h=watchPage();else if(state.page==='edit')h=editWatch();else if(state.page==='search')h=searchPage();else if(state.page==='sources')h=sourcesPage();else if(state.page==='experts')h=expertsPage();else if(state.page==='archives')h=archives();else if(state.page==='settings')h=settings();else h=morePage();$('#app').innerHTML=h;$('#nav')?.classList.toggle('hidden',!hasAccount());bind();}
function bind(){
 document.querySelectorAll('[data-go]').forEach(x=>x.onclick=()=>setPage(x.dataset.go));
 document.querySelectorAll('[data-connect]').forEach(x=>x.onclick=()=>connectAccount(x.dataset.connect));
 document.querySelectorAll('[data-disconnect]').forEach(x=>x.onclick=()=>disconnectAccount(x.dataset.disconnect));
 document.querySelectorAll('[data-scope]').forEach(x=>x.onclick=()=>{state.scope=x.dataset.scope;render()});
 $('#refresh')&&($('#refresh').onclick=refreshAll);
 document.querySelectorAll('[data-mail]').forEach(x=>x.onclick=()=>{const email=state.accounts[x.dataset.account]?.email||'';open(`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(email)}#inbox/${encodeURIComponent(x.dataset.mail)}`,'_blank')});
 document.querySelectorAll('[data-event]').forEach(x=>x.onclick=()=>x.dataset.event&&open(x.dataset.event,'_blank'));
 document.querySelectorAll('[data-watch]').forEach(x=>x.onclick=()=>{state.selected=+x.dataset.watch;state.tab='today';setPage('watch')});
 document.querySelectorAll('[data-edit]').forEach(x=>x.onclick=()=>{state.selected=+x.dataset.edit;setPage('edit')});
 document.querySelectorAll('[data-tab]').forEach(x=>x.onclick=()=>{state.tab=x.dataset.tab;render()});
 document.querySelectorAll('[data-search]').forEach(x=>x.onclick=()=>{const w=state.watches[state.selected],q=`${w.name} ${x.dataset.search}`,ds=TRUSTED[w.name]||[],suffix=ds.length?' '+ds.map(d=>'site:'+d).join(' OR '):'';open('https://www.google.com/search?q='+encodeURIComponent(q+suffix),'_blank')});
 document.querySelectorAll('[data-search-watch]').forEach(x=>x.onclick=()=>{const w=state.watches[+x.dataset.searchWatch];if(!w)return;const q=[w.name,...w.subs.slice(0,20)].join(' '),ds=TRUSTED[w.name]||[],suffix=ds.length?' '+ds.map(d=>'site:'+d).join(' OR '):'';open('https://www.google.com/search?q='+encodeURIComponent(q+suffix),'_blank')});
 document.querySelectorAll('[data-expert]').forEach(x=>x.onclick=()=>open('https://www.google.com/search?q='+encodeURIComponent(`site:linkedin.com ${x.dataset.expert} expert actualité`),'_blank'));
 if($('#globalsearch'))$('#globalsearch').onclick=()=>{const q=$('#globalq').value.trim(),w=$('#globalwatch').value.trim();if(!q&&!w){toast('Saisissez un mot-clé ou choisissez une veille');return}open('https://www.google.com/search?q='+encodeURIComponent([w,q].filter(Boolean).join(' ')),'_blank')};
 if($('#wsave'))$('#wsave').onclick=()=>{const name=$('#wname').value.trim()||'Veille',subs=$('#wsubs').value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,20),spaces=[];if($('#wprivate').checked)spaces.push('private');if($('#wwork').checked)spaces.push('work');state.watches[state.selected]={name,active:$('#wactive').checked,subs,spaces};save('pj_watches',state.watches);toast('Veille enregistrée');setPage('watches')};
 $('#wcancel')&&($('#wcancel').onclick=()=>setPage('watches'));
}
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
window.addEventListener('load',()=>{document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>setPage(b.dataset.page));setTimeout(initGoogle,700);render()});
