const STORAGE={catalog:'fst.catalog.v1',progress:'fst.progress.v1',url:'fst.catalogUrl.v1'};
const state={catalog:null,progress:{},filter:'all',query:'',theme:'all'};
const $=s=>document.querySelector(s);
const grid=$('#spriteGrid'),template=$('#cardTemplate');

function safeParse(v,fallback){try{return JSON.parse(v)??fallback}catch{return fallback}}
function slugify(s){return s.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+Date.now().toString(36)}
function save(){localStorage.setItem(STORAGE.catalog,JSON.stringify(state.catalog));localStorage.setItem(STORAGE.progress,JSON.stringify(state.progress))}
function normalizeCatalog(data){
 if(!data||!Array.isArray(data.sprites))throw new Error('This file does not contain a sprites array.');
 const seen=new Set();
 data.sprites=data.sprites.map((s,i)=>{const id=String(s.id||slugify(s.name||`sprite-${i}`));if(seen.has(id))throw new Error(`Duplicate sprite ID: ${id}`);seen.add(id);return{id,name:String(s.name||'Unnamed Sprite'),theme:String(s.theme||'Other'),variant:String(s.variant||'Base'),rarity:String(s.rarity||''),image:String(s.image||''),custom:!!s.custom}});
 return{schemaVersion:1,catalogVersion:String(data.catalogVersion||'custom'),updated:String(data.updated||new Date().toISOString().slice(0,10)),source:String(data.source||'Imported catalog'),sprites:data.sprites};
}
async function init(){
 state.progress=safeParse(localStorage.getItem(STORAGE.progress),{});
 // Always load the catalog shipped with this app version first. This prevents an
 // older 10-item catalog saved by a previous installation from overriding updates.
 const bundled=normalizeCatalog(await fetch('catalog.json?v=2026-07-30-v7',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`Catalog HTTP ${r.status}`);return r.json()}));
 const storedRaw=safeParse(localStorage.getItem(STORAGE.catalog),null);
 const stored=storedRaw?normalizeCatalog(storedRaw):null;
 state.catalog=(!stored||stored.catalogVersion!==bundled.catalogVersion||stored.sprites.length<bundled.sprites.length)?bundled:stored;
 save();
 $('#catalogUrl').value=localStorage.getItem(STORAGE.url)||'';
 bind();render();
 if('serviceWorker' in navigator){
   navigator.serviceWorker.register('service-worker.js?v=7').catch(()=>{});
 }
}
function bind(){
 $('#search').addEventListener('input',e=>{state.query=e.target.value.toLowerCase();render()});
 $('#themeFilter').addEventListener('change',e=>{state.theme=e.target.value;render()});
 document.querySelectorAll('.segmented button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.segmented button').forEach(x=>x.classList.toggle('active',x===b));state.filter=b.dataset.filter;render()});
 $('#settingsBtn').onclick=()=>$('#settingsDialog').showModal();
 $('#saveUrlBtn').onclick=()=>{localStorage.setItem(STORAGE.url,$('#catalogUrl').value.trim());message('Update URL saved.',true)};
 $('#checkUpdateBtn').onclick=updateFromUrl;
 $('#addSpriteBtn').onclick=addSprite;
 $('#exportProgressBtn').onclick=()=>download({type:'fortnite-sprite-progress',exported:new Date().toISOString(),progress:state.progress},'sprite-progress.json');
 $('#exportCatalogBtn').onclick=()=>download(state.catalog,'sprite-catalog.json');
 $('#importFile').onchange=importJson;
 $('#resetBtn').onclick=()=>{if(confirm('Reset every collected and mastered selection?')){state.progress={};save();render();message('Progress reset.',true)}};
}
function render(){
 const sprites=state.catalog.sprites; const themes=[...new Set(sprites.map(s=>s.theme))].sort();
 const select=$('#themeFilter'),old=state.theme;select.innerHTML='<option value="all">All themes</option>'+themes.map(t=>`<option>${escapeHtml(t)}</option>`).join('');select.value=themes.includes(old)?old:'all';state.theme=select.value;
 const collected=sprites.filter(s=>state.progress[s.id]?.collected).length,mastered=sprites.filter(s=>state.progress[s.id]?.mastered).length,total=sprites.length;
 $('#collectedStat').textContent=`${collected} / ${total}`;$('#masteredStat').textContent=`${mastered} / ${total}`;$('#collectedBar').style.width=total?`${collected/total*100}%`:'0';$('#masteredBar').style.width=total?`${mastered/total*100}%`:'0';
 const notice=$('#catalogNotice');notice.hidden=false;notice.textContent=`Catalog ${state.catalog.catalogVersion} • updated ${state.catalog.updated}. ${state.catalog.source}`;
 const visible=sprites.filter(s=>{const p=state.progress[s.id]||{};const text=`${s.name} ${s.theme} ${s.variant} ${s.rarity}`.toLowerCase();return text.includes(state.query)&&(state.theme==='all'||s.theme===state.theme)&&(state.filter==='all'||state.filter==='collected'&&p.collected||state.filter==='missing'&&!p.collected||state.filter==='mastered'&&p.mastered)});
 grid.innerHTML='';visible.forEach(s=>grid.append(card(s)));$('#emptyState').hidden=visible.length>0;
}
function card(s){
 const node=template.content.firstElementChild.cloneNode(true),p=state.progress[s.id]||{};
 node.querySelector('h2').textContent=s.name;node.querySelector('p').textContent=[s.theme,s.variant,s.rarity].filter(Boolean).join(' • ');const avatar=node.querySelector('.avatar');if(s.image){avatar.innerHTML=`<img src="${escapeHtml(s.image)}" alt="" loading="lazy">`}else{avatar.textContent=s.name.charAt(0);}
 const c=node.querySelector('.collected'),m=node.querySelector('.mastered');c.checked=!!p.collected;m.checked=!!p.mastered;node.classList.toggle('collected',c.checked);node.classList.toggle('mastered',m.checked);
 c.onchange=()=>{state.progress[s.id]={...(state.progress[s.id]||{}),collected:c.checked,mastered:c.checked?m.checked:false};save();render()};
 m.onchange=()=>{state.progress[s.id]={...(state.progress[s.id]||{}),mastered:m.checked,collected:m.checked?true:c.checked};save();render()};
 const del=node.querySelector('.delete-btn');del.hidden=!s.custom;del.onclick=()=>{if(confirm(`Delete ${s.name}?`)){state.catalog.sprites=state.catalog.sprites.filter(x=>x.id!==s.id);delete state.progress[s.id];save();render()}};
 return node;
}
async function updateFromUrl(){
 const url=$('#catalogUrl').value.trim();if(!url)return message('Enter an HTTPS catalog URL first.',false);
 try{message('Checking…');const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const incoming=normalizeCatalog(await r.json());const oldCount=state.catalog.sprites.length;state.catalog=incoming;save();render();localStorage.setItem(STORAGE.url,url);message(`Updated to ${incoming.catalogVersion}: ${oldCount} → ${incoming.sprites.length} sprites. Progress preserved.`,true)}catch(e){message(`Update failed: ${e.message}. The host must allow browser access (CORS).`,false)}
}
function addSprite(){
 const name=$('#newName').value.trim();if(!name)return message('Enter a sprite name.',false);const sprite={id:slugify(name+'-'+$('#newVariant').value),name,theme:$('#newTheme').value.trim()||'Other',variant:$('#newVariant').value,rarity:$('#newRarity').value.trim(),custom:true};state.catalog.sprites.push(sprite);state.catalog.catalogVersion='custom';state.catalog.updated=new Date().toISOString().slice(0,10);state.catalog.source='Includes manually added sprites.';save();render();['newName','newTheme','newRarity'].forEach(id=>$('#'+id).value='');message(`${name} added.`,true)
}
async function importJson(e){
 const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());if(data.type==='fortnite-sprite-progress'||data.progress){state.progress=data.progress||{};save();render();message('Progress imported.',true)}else{state.catalog=normalizeCatalog(data);save();render();message(`Catalog imported with ${state.catalog.sprites.length} sprites.`,true)}}catch(err){message(`Import failed: ${err.message}`,false)}e.target.value='';
}
function download(data,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function message(text,ok){const el=$('#updateMessage');el.textContent=text;el.className='message '+(ok===true?'ok':ok===false?'error':'')}
function escapeHtml(s){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
init().catch(e=>{document.body.innerHTML=`<p style="padding:2rem">Could not start app: ${escapeHtml(e.message)}</p>`});
