const CFG=window.POINTJOUR_CONFIG||{};const SCOPES='https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly';const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const PAYROLL_SOURCES=[['BOSS','https://boss.gouv.fr/'],['URSSAF','https://www.urssaf.fr/'],['Net-entreprises','https://www.net-entreprises.fr/'],['Légifrance','https://www.legifrance.gouv.fr/'],['Service-Public Pro','https://entreprendre.service-public.fr/'],['Assurance Maladie','https://www.ameli.fr/entreprise'],['France Travail','https://www.francetravail.fr/employeur/'],['Agirc-Arrco','https://www.agirc-arrco.fr/entreprises/'],['Ministère du Travail','https://travail-emploi.gouv.fr/'],['Légisocial','https://www.legisocial.fr/actualites-sociales/'],['RF Paye','https://www.revue-fiduciaire.com/'],['Éditions Tissot','https://www.editions-tissot.fr/actualite/droit-du-travail']];

const TRUSTED={Auto:['service-public.fr','securite-routiere.gouv.fr','economie.gouv.fr','ademe.fr','largus.fr','caradisiac.com','quechoisir.org'],Cuisine:['mangerbouger.fr','anses.fr','750g.com','marmiton.org','cuisineaz.com']};

const defaults=[
{name:'Paie',active:true,subs:['DSN','PAS','SMIC','PMSS','IJSS','Cotisations','Congés','Ruptures','Net social','Heures supplémentaires']},
{name:'Auto',active:true,subs:['Achat','Entretien','Réparation','Contrôle technique','Assurance','Pneus','Carburant','Rappels constructeur']},
{name:'Cuisine',active:true,subs:['Asiatique','Desserts','Grillades','Économique','Rapide','Four']}
];

const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));

const state={
page:'signin',
token:null,
email:'',
messages:[],
events:[],
news:[],
watches:load('pj_watches',defaults),
archive:load('pj_archive',[]),
selected:0,
tab:'today',
error:'',
loading:false
};

let tokenClient=null;

const toast=m=>{
const t=$('#toast');
t.textContent=m;
t.classList.add('show');
setTimeout(()=>t.classList.remove('show'),2200)
};

const configured=()=>CFG.GOOGLE_CLIENT_ID&&!CFG.GOOGLE_CLIENT_ID.startsWith('REMPLACEZ_');

function setPage(p){
state.page=p;
$('#nav').classList.toggle('hidden',!state.token);
document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));
render();
scrollTo(0,0)
}

document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>setPage(b.dataset.page));

function topItems(t){
return `<div class="top"><h1>${t}</h1><img class="logo" src="icon-192.png" alt="PointJour"></div>`
}

function initGoogle(){
if(!configured()||!window.google?.accounts?.oauth2)return false;

tokenClient=google.accounts.oauth2.initTokenClient({
client_id:CFG.GOOGLE_CLIENT_ID,
scope:SCOPES,
callback:async r=>{
if(r.error){
state.error=r.error;
render();
return
}
state.token=r.access_token;
await refreshAll();
setPage('home')
}
});
return true
}

function connect(){
if(!configured()){
state.error='Renseignez votre ID client OAuth Web dans config.js.';
render();
return
}

if(!tokenClient&&!initGoogle()){
state.error='Google Identity Services se charge encore.';
render();
return
}

tokenClient.requestAccessToken({prompt:'consent'})
}

async function api(u){
const r=await fetch(u,{headers:{Authorization:`Bearer ${state.token}`}});
if(!r.ok)throw Error('Google API '+r.status);
return r.json()
}

function gh(h,n){
return(h||[]).find(x=>x.name?.toLowerCase()===n.toLowerCase())?.value||''
}

async function loadGoogle(){
const p=await api('https://gmail.googleapis.com/gmail/v1/users/me/profile');
state.email=p.emailAddress||'';

const q=encodeURIComponent('in:inbox -in:spam -category:promotions -category:social -category:forums');

const refs=await api(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=25`);

state.messages=(await Promise.all((refs.messages||[]).map(async x=>{
try{
const m=await api(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${x.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
const h=m.payload?.headers||[];

return{
id:m.id,
sender:gh(h,'From'),
subject:gh(h,'Subject')||'(Sans objet)',
date:gh(h,'Date'),
snippet:m.snippet||'',
time:+m.internalDate||0
}
}catch{
return null
}
}))).filter(Boolean).sort((a,b)=>b.time-a.time);

const start=new Date();
start.setHours(0,0,0,0);

const end=new Date(start);
end.setDate(end.getDate()+8);

const ev=await api(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=150&timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}`);

state.events=(ev.items||[]).map(e=>({
id:e.id,
title:e.summary||'Sans titre',
start:e.start?.dateTime||e.start?.date||'',
link:e.htmlLink||'',
location:e.location||''
}))
}

async function loadNews(){
let j=null;

for(const u of [CFG.PAYROLL_NEWS_URL,'data/news.json']){
try{
const r=await fetch(u+(u.includes('?')?'&':'?')+'t='+Date.now(),{cache:'no-store'});
if(r.ok){
j=await r.json();
break
}
}catch{}
}

state.news=(Array.isArray(j?.items)?j.items:[])
.sort((a,b)=>new Date(b.publishedAt||b.discoveredAt||0)-new Date(a.publishedAt||a.discoveredAt||0))
}

async function refreshAll(){
state.loading=true;
state.error='';
render();

try{
await Promise.all([loadGoogle(),loadNews()]);
snapshot()
}catch(e){
state.error=e.message
}

state.loading=false;
render()
}

function snapshot(){
const d=new Date().toISOString().slice(0,10);

const entry={
date:d,
mails:state.messages.length,
events:state.events.length,
news:state.news.slice(0,20)
};

state.archive=[entry,...state.archive.filter(x=>x.date!==d)].slice(0,60);
save('pj_archive',state.archive)
}

function signin(){
return `<section class="hero"><img class="logo" src="icon-512.png"><h1>PointJour</h1><h3>Votre journée, l’essentiel en un coup d’œil</h3><p class="tag">Gmail et Google Agenda restent vos deux services fixes. Vos veilles Web sont personnalisables.</p>${state.error?`<div class="notice error">${esc(state.error)}</div>`:''}<button class="primary" id="connect">Se connecter avec Google</button><p class="tag">Lecture seule : Gmail + Google Agenda.</p>${!configured()?'<div class="notice">Avant publication, renseignez le client OAuth Web dans <b>config.js</b>.</div>':''}</section>`
}

function home(){
const active=state.watches.filter(w=>w.active);

return topItems('☀️ PointJour')+
`<div class="card"><b>Bonjour${state.email?', '+esc(state.email.split('@')[0]):''} !</b><p>Voici votre point du jour.</p>${state.loading?'Actualisation en cours…':''}${state.error?`<div class="notice error">${esc(state.error)}</div>`:''}</div>
<div class="grid">
<button class="tile" data-go="mail">📧<strong>Gmail</strong>${state.messages.length} messages</button>
<button class="tile" data-go="calendar">📅<strong>Agenda</strong>${state.events.length} événements / 8 jours</button>
${active.map((w,i)=>`<button class="tile" data-watch="${state.watches.indexOf(w)}">🔎<strong>${esc(w.name)}</strong>${w.subs.length} sous-thèmes</button>`).join('')}
</div>
<div class="card row"><button class="primary" id="refresh">↻ Actualiser</button><button class="secondary" data-go="brief">✓ Brief du jour</button></div>`
}

function mail(){
return topItems('📧 Gmail')+
`<div class="card">Promotions, réseaux sociaux, forums et spam sont exclus.</div>
${state.messages.map(m=>`<div class="item" data-mail="${m.id}"><h3>${esc(m.subject)}</h3><b>${esc(m.sender)}</b><p>${esc(m.snippet)}</p><span class="meta">${esc(m.date)}</span></div>`).join('')||'<div class="empty">Aucun message.</div>'}`
}

function calendar(){
return topItems('📅 Google Agenda')+
`<div class="card"><b>Aujourd’hui + 7 jours</b></div>
${state.events.map(e=>`<div class="item" data-event="${esc(e.link)}"><h3>${esc(e.title)}</h3><p>${esc(new Date(e.start.length===10?e.start+'T00:00:00':e.start).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:e.start.length===10?undefined:'short'}))}</p>${e.location?`<span class="meta">📍 ${esc(e.location)}</span>`:''}</div>`).join('')||'<div class="empty">Aucun événement.</div>'}`
}

function brief(){
const active=state.watches.filter(w=>w.active);

return topItems('✓ Brief du jour')+
`<div class="card"><h3>📧 Gmail</h3><p>${state.messages.length} message(s) récent(s) hors catégories exclues.</p></div>
<div class="card"><h3>📅 Agenda</h3><p>${state.events.length} événement(s) sur aujourd’hui + 7 jours.</p></div>
${active.map(w=>{
const n=w.name.toLowerCase()==='paie'?filterNews(w).length:'recherche Web à lancer';
return `<div class="card"><h3>🔎 ${esc(w.name)}</h3><p>${typeof n==='number'?n+' résultat(s) collecté(s)':n}</p></div>`
}).join('')}
<div class="notice">Cette V1 ne prétend pas “comprendre” automatiquement vos mails : elle rassemble les données et les veilles sans doublon. L’analyse avancée pourra être ajoutée après votre test de navigation.</div>`
}

function filterNews(w){
const terms=w.subs.map(x=>x.toLowerCase());

return state.news.filter(a=>{
const t=((a.title||'')+' '+(a.summary||'')+' '+(a.topics||[]).join(' ')).toLowerCase();
return !terms.length||terms.some(x=>t.includes(x.toLowerCase()))
})
}

function watchPage(){
const w=state.watches[state.selected];
if(!w)return watches();

const paie=w.name.toLowerCase()==='paie';
const list=paie?filterNews(w):[];
const today=new Date().toISOString().slice(0,10);

const shown=state.tab==='today'
?list.filter(a=>String(a.publishedAt||a.discoveredAt||'').slice(0,10)===today)
:list.filter(a=>String(a.publishedAt||a.discoveredAt||'').slice(0,10)!==today);

const domains=TRUSTED[w.name]||[];

return topItems('🔎 Veille — '+esc(w.name))+
`<div class="tabs">
<button class="${state.tab==='today'?'primary':'secondary'}" data-tab="today">Aujourd’hui</button>
<button class="${state.tab==='archive'?'primary':'secondary'}" data-tab="archive">Archives</button>
</div>
${paie
?(shown.map(article).join('')||'<div class="empty">Aucun résultat dans cette rubrique.</div>')
:`<div class="card">
<h3>Recherche sur sources fiables</h3>
<p>Sous-thèmes : ${w.subs.map(x=>`<span class="badge">${esc(x)}</span>`).join(' ')}</p>
<p class="tag">Pour cette première version navigateur, les thèmes libres utilisent des recherches Web ciblées. Aucun secret d’API de recherche n’est stocké dans la PWA.</p>
<div class="row">${w.subs.slice(0,10).map(s=>`<button class="secondary" data-search="${esc(s)}">🔎 ${esc(s)}</button>`).join('')}</div>
${domains.length?`<p class="meta">Domaines privilégiés : ${esc(domains.join(', '))}</p>`:''}
</div>`}`
}

function article(a){
return `<div class="item">
<h3>${esc(a.title)}</h3>
<p>${esc(a.summary||'')}</p>
<span class="badge">${esc(a.source||'Source')}</span>
${(a.topics||[]).slice(0,3).map(t=>`<span class="badge">${esc(t)}</span>`).join('')}
<p class="meta">${esc(String(a.publishedAt||a.discoveredAt||'').slice(0,10))}</p>
<a class="primary" style="display:inline-block;text-decoration:none" href="${esc(a.url)}" target="_blank" rel="noopener">Ouvrir la source ↗</a>
</div>`
}

function watches(){
return topItems('🔎 Mes veilles')+
`<div class="card"><b>1 à 3 thèmes</b><p>Jusqu’à 10 sous-thèmes par veille. Désactivez un thème pour le masquer de l’accueil.</p></div>
${state.watches.map((w,i)=>`<div class="card source">
<div><h3>${esc(w.name)}</h3><span class="meta">${w.subs.length} sous-thèmes · ${w.active?'actif':'inactif'}</span></div>
<button class="secondary" data-edit="${i}">Modifier</button>
</div>`).join('')}`
}

function editWatch(){
const w=state.watches[state.selected];

return topItems('⚙️ Modifier la veille')+
`<div class="card">
<div class="field"><label>Nom du thème</label><input id="wname" maxlength="24" value="${esc(w.name)}"></div>
<div class="field"><label><input id="wactive" type="checkbox" ${w.active?'checked':''}> Afficher ce thème</label></div>
<div class="field"><label>Sous-thèmes (maximum 10, un par ligne)</label><textarea id="wsubs" rows="11">${esc(w.subs.join('\n'))}</textarea></div>
<div class="row"><button class="primary" id="wsave">Enregistrer</button><button class="secondary" id="wcancel">Annuler</button></div>
</div>`
}

function archives(){
return topItems('▣ Archives')+
(state.archive.map(x=>`<div class="item">
<h3>${esc(new Date(x.date+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'}))}</h3>
<p>📧 ${x.mails} · 📅 ${x.events} · 🔎 ${x.news?.length||0} éléments de veille mémorisés</p>
</div>`).join('')||'<div class="empty">Les archives apparaîtront après la première actualisation.</div>')
}

function settings(){
return topItems('☰ Paramètres')+
`<div class="card">
<h3>Compte Google</h3>
<p>${esc(state.email)}</p>
<p class="tag">Gmail et Google Agenda sont fixes et en lecture seule.</p>
</div>
<div class="card">
<h3>Veilles personnalisées</h3>
<p>1 à 3 thèmes, jusqu’à 10 sous-thèmes chacun.</p>
<button class="secondary" data-go="watches">Gérer mes veilles</button>
</div>
<div class="card">
<h3>Principe de sécurité</h3>
<p>La PWA n’embarque aucune clé secrète de moteur de recherche. La veille Paie utilise le collecteur de VeilleJurSoc. Les thèmes libres lancent, dans cette V1 de test, des recherches ciblées vers des sources fiables.</p>
</div>
<button class="danger" id="logout">Se déconnecter</button>`
}

function render(){
let h='';

if(!state.token)h=signin();
else if(state.page==='home')h=home();
else if(state.page==='mail')h=mail();
else if(state.page==='calendar')h=calendar();
else if(state.page==='brief')h=brief();
else if(state.page==='watches')h=watches();
else if(state.page==='watch')h=watchPage();
else if(state.page==='edit')h=editWatch();
else if(state.page==='archives')h=archives();
else h=settings();

$('#app').innerHTML=h;
bind()
}

function bind(){
document.querySelectorAll('[data-go]').forEach(x=>x.onclick=()=>setPage(x.dataset.go));

$('#connect')&&($('#connect').onclick=connect);
$('#refresh')&&($('#refresh').onclick=refreshAll);
$('#logout')&&($('#logout').onclick=()=>{
state.token=null;
setPage('signin')
});

document.querySelectorAll('[data-mail]').forEach(x=>x.onclick=()=>open(`https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(x.dataset.mail)}`,'_blank'));

document.querySelectorAll('[data-event]').forEach(x=>x.onclick=()=>x.dataset.event&&open(x.dataset.event,'_blank'));

document.querySelectorAll('[data-watch]').forEach(x=>x.onclick=()=>{
state.selected=+x.dataset.watch;
state.tab='today';
setPage('watch')
});

document.querySelectorAll('[data-edit]').forEach(x=>x.onclick=()=>{
state.selected=+x.dataset.edit;
setPage('edit')
});

document.querySelectorAll('[data-tab]').forEach(x=>x.onclick=()=>{
state.tab=x.dataset.tab;
render()
});

document.querySelectorAll('[data-search]').forEach(x=>x.onclick=()=>{
const w=state.watches[state.selected];
const q=`${w.name} ${x.dataset.search}`;
const ds=TRUSTED[w.name]||[];
const suffix=ds.length?' '+ds.map(d=>'site:'+d).join(' OR '):'';
open('https://www.google.com/search?q='+encodeURIComponent(q+suffix),'_blank')
});

if($('#wsave')){
$('#wsave').onclick=()=>{
const name=$('#wname').value.trim()||'Veille';
const subs=$('#wsubs').value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,10);

state.watches[state.selected]={
name,
active:$('#wactive').checked,
subs
};

save('pj_watches',state.watches);
toast('Veille enregistrée');
setPage('watches')
}
}

$('#wcancel')&&($('#wcancel').onclick=()=>setPage('watches'))
}

if('serviceWorker'in navigator){
navigator.serviceWorker.register('./sw.js').catch(()=>{})
}

window.addEventListener('load',()=>{
setTimeout(initGoogle,700);
render()
});
