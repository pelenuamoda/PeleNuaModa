const SUPA_URL='https://brckyuxjufcchribzefe.supabase.co';
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyY2t5dXhqdWZjY2hyaWJ6ZWZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1OTUyNTQsImV4cCI6MjA5MDE3MTI1NH0.-Mt-GL3mjuVn9lifuGYI2oPEjq2fE6Gh7FLZEb-lr9g';
const sb=supabase.createClient(SUPA_URL,SUPA_KEY);

async function dbGet(t){const{data,error}=await sb.from(t).select('*');if(error){console.warn(t,error);return[];}return data;}
async function dbUpsert(t,row){const{error}=await sb.from(t).upsert(row);if(error)console.warn('upsert',t,error);}
async function dbDelete(t,col,val){const{error}=await sb.from(t).delete().eq(col,val);if(error)console.warn('del',t,error);}
async function getProd(t){const rows=await dbGet(t);return rows.map(r=>r.data);}
async function upsertProd(t,obj){await dbUpsert(t,{id:obj.id,data:obj});}
async function deleteProd(t,id){await dbDelete(t,'id',id);}
async function getUsers(){const rows=await dbGet('pnm_users');return rows.map(r=>r.data);}
async function upsertUser(u){await dbUpsert('pnm_users',{email:u.email,data:u});}
async function getCfg(key){const{data}=await sb.from('pnm_config').select('value').eq('key',key).maybeSingle();return data?data.value:null;}
async function setCfg(key,val){await dbUpsert('pnm_config',{key,value:val});}

// ╔═ CACHE ╗
// TTL em ms para cada recurso (produtos/slides: 10min; config: 10min)
var CACHE_TTL=10*60*1000;
function cacheSet(key,val){try{localStorage.setItem('pnm_c_'+key,JSON.stringify({t:Date.now(),d:val}));}catch(e){}}
function cacheGet(key){try{var raw=localStorage.getItem('pnm_c_'+key);if(!raw)return null;var p=JSON.parse(raw);if(Date.now()-p.t>CACHE_TTL){localStorage.removeItem('pnm_c_'+key);return null;}return p.d;}catch(e){return null;}}
function cacheInvalidate(key){try{localStorage.removeItem('pnm_c_'+key);}catch(e){}}
function cacheInvalidateAll(){['prods','adult','slides','rewards','users','cfg'].forEach(cacheInvalidate);}


// â•â• STATE â•â•
let prods=[],aProds=[],slides=[],rewards=[],users=[],pedidos=[];
let homeCats=[
  {key:'all',label:'Todos'},{key:'lingerie',label:'Lingerie'},{key:'body',label:'Body'},
  {key:'baby-doll',label:'Baby Doll'},{key:'camisola',label:'Camisola'},
  {key:'fantasia',label:'Fantasia'},{key:'masculino',label:'Masculino'}
];
let subCats={};
let adultCats=[{key:'all18',label:'Todos +18'},{key:'lingerie-hot',label:'Lingerie Sensual'},{key:'fantasia-adult',label:'Fantasias'},{key:'acessorio-adult',label:'AcessÃ³rios'}];
let subAdultCats={};
let catSub='';
let trocasTxt='<h3>Prazo</h3><p>Trocas em atÃ© <strong>7 dias corridos</strong>.</p><h3>Como Solicitar</h3><p>WhatsApp: (51) 98215-9719</p>';
let mgrAvatar=null;
let favs=JSON.parse(localStorage.getItem('pnm_favs')||'[]');
let cart=JSON.parse(localStorage.getItem('pnm_cart')||'[]');
let curUser=JSON.parse(localStorage.getItem('pnm_user')||'null');
let pendingReward=JSON.parse(localStorage.getItem('pnm_pendingReward')||'null');
let mgrLogged=false,newProdImgs=[],editProdImgs=[],tmpAv=null,adultOk=false;
let curSlide=0,slideTimer=null,cdInterval=null;
let catH='all',catP='all';
let confirmCb=null,avMode='user',editSlId=null,rwIdx=-1,pendingRedeemId=null;
const catColors=['#b5004e','#c2005a','#d0006a','#c2006b','#9d007a','#7c3aed','#6d28d9','#5b21b6','#4c1d95'];

// â•â• LOAD ALL â•â•

// ╔═ SKELETON ╗
function showSkeleton(gridId,count){
  var g=document.getElementById(gridId);if(!g)return;
  var html='';for(var i=0;i<count;i++){
    html+='<div class="pcard psk"><div class="psk-img sk-anim"></div><div class="psk-body"><div class="psk-line sk-anim" style="width:70%"></div><div class="psk-line sk-anim" style="width:45%;margin-top:6px"></div><div class="psk-line sk-anim" style="width:55%;margin-top:6px"></div></div></div>';
  }
  g.innerHTML=html;
}
function hideSkeleton(gridId){
  var g=document.getElementById(gridId);if(!g)return;
  g.querySelectorAll('.psk').forEach(function(el){el.remove();});
}

async function loadAll(){
  // ── Fase 1: cache imediato ──────────────────────────────────────────────
  var cached={
    prods:cacheGet('prods'),adult:cacheGet('adult'),
    slides:cacheGet('slides'),rewards:cacheGet('rewards'),
    users:cacheGet('users'),cfg:cacheGet('cfg')
  };
  var hasCache=cached.prods&&cached.adult&&cached.slides&&cached.rewards&&cached.users&&cached.cfg;
  if(hasCache){
    // Aplicar cache instantaneamente — zero delay
    prods=cached.prods;aProds=cached.adult;
    slides=cached.slides;rewards=cached.rewards;users=cached.users;
    var cfg=cached.cfg;
    if(cfg.trocas)trocasTxt=cfg.trocas;
    if(cfg.homecats){try{var ph=JSON.parse(cfg.homecats);if(Array.isArray(ph)&&ph.length)homeCats=ph;}catch(e){}}
    if(cfg.mgravatar){mgrAvatar=cfg.mgravatar;applyMgrAvatar();}
    if(cfg.subcats){try{subCats=JSON.parse(cfg.subcats);}catch(e){}}
    if(cfg.adultcats){try{var pa=JSON.parse(cfg.adultcats);if(Array.isArray(pa)&&pa.length)adultCats=pa;}catch(e){}}
    if(cfg.subadultcats){try{subAdultCats=JSON.parse(cfg.subadultcats);}catch(e){}}
    if(curUser){
      var fc=users.find(function(u){return u.email===curUser.email;});
      if(fc){curUser=fc;localStorage.setItem('pnm_user',JSON.stringify(fc));}
    }
    var allIdsc=[...prods,...aProds].map(function(p){return p.id;});
    favs=favs.filter(function(id){return allIdsc.includes(id);});saveLS('pnm_favs',favs);
    renderH();renderSS();resetST();renderP();updStats();
    document.getElementById('fav-n').textContent=favs.length;
    if(curUser)loadPedidos().then(function(){if(document.getElementById('page-pedidos').classList.contains('active'))renderPedidos();});
  } else {
    // Sem cache: mostrar skeleton nos grids principais
    showSkeleton('hgrid',4);showSkeleton('pgrid2',6);
  }
  // ── Fase 2: buscar dados frescos do Supabase em background ──────────────
  try{
    var[fp,fa,fs,fr,fu]=await Promise.all([
      getProd('pnm_prods'),getProd('pnm_adult'),getProd('pnm_slides'),
      getProd('pnm_rewards'),getUsers()
    ]);
    fp.sort&&true;fs.sort(function(a,b){return a.id-b.id;});
    var[tc,thc,tma,tsc,tac,tsac]=await Promise.all([
      getCfg('trocas'),getCfg('homecats'),getCfg('mgravatar'),
      getCfg('subcats'),getCfg('adultcats'),getCfg('subadultcats')
    ]);
    // Salvar no cache
    cacheSet('prods',fp);cacheSet('adult',fa);cacheSet('slides',fs);
    cacheSet('rewards',fr);cacheSet('users',fu);
    cacheSet('cfg',{trocas:tc,homecats:thc,mgravatar:tma,subcats:tsc,adultcats:tac,subadultcats:tsac});
    // Aplicar nos estados globais
    prods=fp;aProds=fa;slides=fs;rewards=fr;users=fu;
    if(tc)trocasTxt=tc;
    if(thc){try{var parsed=JSON.parse(thc);if(Array.isArray(parsed)&&parsed.length)homeCats=parsed;}catch(e){}}
    if(tma){mgrAvatar=tma;applyMgrAvatar();}
    if(tsc){try{subCats=JSON.parse(tsc);}catch(e){}}
    if(tac){try{var p=JSON.parse(tac);if(Array.isArray(p)&&p.length)adultCats=p;}catch(e){}}
    if(tsac){try{subAdultCats=JSON.parse(tsac);}catch(e){}}
    if(curUser){
      var f=users.find(function(u){return u.email===curUser.email;});
      if(f){curUser=f;localStorage.setItem('pnm_user',JSON.stringify(f));}
      // Modo gerente NÃO ativa automaticamente — requer clique em "Gerenciar"
      await loadPedidos();
    }
    var allIds=[...prods,...aProds].map(function(p){return p.id;});
    favs=favs.filter(function(id){return allIds.includes(id);});saveLS('pnm_favs',favs);
    // Re-renderizar com dados frescos (substitui cache ou skeleton)
    renderH();renderSS();resetST();renderP();updStats();
    document.getElementById('fav-n').textContent=favs.length;
  }catch(e){
    console.warn('loadAll fetch error:',e);
    // Se já tinha cache aplicado, o site continua funcionando normalmente
  }
  startRealtime();
}

// â•â• REALTIME â•â•
function startRealtime(){
  sb.channel('prods').on('postgres_changes',{event:'*',schema:'public',table:'pnm_prods'},async()=>{
    prods=await getProd('pnm_prods');cacheSet('prods',prods);renderHGrid();renderP();if(mgrLogged){renderProdTbl();updStats();}
  }).subscribe();
  sb.channel('adult').on('postgres_changes',{event:'*',schema:'public',table:'pnm_adult'},async()=>{
    aProds=await getProd('pnm_adult');cacheSet('adult',aProds);
    if(document.getElementById('page-adult').classList.contains('active'))renderA();
  }).subscribe();
  sb.channel('slides').on('postgres_changes',{event:'*',schema:'public',table:'pnm_slides'},async()=>{
    slides=await getProd('pnm_slides');slides.sort((a,b)=>a.id-b.id);cacheSet('slides',slides);
    if(document.getElementById('page-home').classList.contains('active')){renderSS();resetST();}
    if(mgrLogged)renderMgrSlides();
  }).subscribe();
  sb.channel('rewards').on('postgres_changes',{event:'*',schema:'public',table:'pnm_rewards'},async()=>{
    rewards=await getProd('pnm_rewards');cacheSet('rewards',rewards);renderRewardsGrid();if(mgrLogged)renderRewardsList();
  }).subscribe();
  sb.channel('users').on('postgres_changes',{event:'*',schema:'public',table:'pnm_users'},async()=>{
    users=await getUsers();
    if(curUser){
      const f=users.find(u=>u.email===curUser.email);
      if(f){curUser=f;localStorage.setItem('pnm_user',JSON.stringify(f));}
      // Não ativa modo gerente automaticamente no realtime
      await loadPedidos();
    }
    updStats();if(mgrLogged)renderUsers();
  }).subscribe();
  sb.channel('pedidos_ch').on('postgres_changes',{event:'*',schema:'public',table:'pnm_pedidos'},async()=>{
    if(curUser){await loadPedidos();if(document.getElementById('page-pedidos').classList.contains('active'))renderPedidos();}
    if(mgrLogged){await loadAndRenderMgrPedidos();}
  }).subscribe();
  sb.channel('config').on('postgres_changes',{event:'*',schema:'public',table:'pnm_config'},async()=>{
    const[tc,thc,tma]=await Promise.all([getCfg('trocas'),getCfg('homecats'),getCfg('mgravatar')]);
    if(tc)trocasTxt=tc;
    if(thc){try{const p=JSON.parse(thc);if(Array.isArray(p)&&p.length){homeCats=p;renderHomeCats();renderProductCats();populateCatSelects();if(mgrLogged)renderCatsEditList();}}catch(e){}}
    if(tma&&tma!==mgrAvatar){mgrAvatar=tma;applyMgrAvatar();}
  }).subscribe();
}

// â•â• UTILS â•â•
function openM(id){document.getElementById(id).classList.add('open');}
function closeM(id){document.getElementById(id).classList.remove('open');}
function pad(n){return n<10?'0'+n:''+n;}
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3200);}
function openResetModal(){const emailEl=document.getElementById('reset-email');const loginEmail=document.getElementById('l-email');const result=document.getElementById('reset-result');if(emailEl)emailEl.value=loginEmail&&loginEmail.value?loginEmail.value.trim():'';if(result)result.innerHTML='';openM('mo-reset');}
function maskCEP(el){var v=el.value.replace(/\D/g,'').slice(0,8);if(v.length>5)v=v.replace(/(\d{5})(\d{0,3})/,'$1-$2');el.value=v;}
function maskCPF(el){let v=el.value.replace(/\D/g,'').slice(0,11);if(v.length>9)v=v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/,'$1.$2.$3-$4');else if(v.length>6)v=v.replace(/(\d{3})(\d{3})(\d{0,3})/,'$1.$2.$3');else if(v.length>3)v=v.replace(/(\d{3})(\d{0,3})/,'$1.$2');el.value=v;}
function showConfirm(title,msg,cb){document.getElementById('confirm-title').textContent=title;document.getElementById('confirm-msg').textContent=msg;confirmCb=cb;document.getElementById('confirm-ok').onclick=()=>{if(confirmCb)confirmCb();closeConfirm();};document.getElementById('mo-confirm').classList.add('open');}
function closeConfirm(){document.getElementById('mo-confirm').classList.remove('open');confirmCb=null;}
function saveLS(k,v){localStorage.setItem(k,JSON.stringify(v));}
function applyMgrAvatar(){const ma=document.getElementById('mgr-av');if(ma&&mgrAvatar)ma.innerHTML='<img src="'+mgrAvatar+'" style="width:100%;height:100%;object-fit:cover">';}
function getCatColor(key){const idx=homeCats.filter(c=>c.key!=='all').findIndex(c=>c.key===key);return catColors[Math.max(0,idx)%catColors.length];}

// â•â• MOBILE NAV â•â•
function toggleMobNav(){const n=document.getElementById('mob-nav'),h=document.getElementById('ham-btn');if(n.classList.contains('open')){closeMobNav();}else{n.classList.add('open');h.classList.add('open');document.body.style.overflow='hidden';}}
function closeMobNav(){document.getElementById('mob-nav').classList.remove('open');document.getElementById('ham-btn').classList.remove('open');document.body.style.overflow='';}
function syncMobNav(p){document.querySelectorAll('#mob-nav .mnnb').forEach(b=>b.classList.remove('active'));const m=document.getElementById('mnav-'+p);if(m)m.classList.add('active');const c1=document.getElementById('cart-c'),c2=document.getElementById('cart-c2');if(c1&&c2)c2.textContent=c1.textContent;}

// â•â• NAVIGATION â•â•
const PM={home:'page-home',products:'page-products',adult:'page-adult',favorites:'page-favorites',cart:'page-cart',register:'page-register',manager:'page-manager',privacy:'page-privacy',trocas:'page-trocas',atendimento:'page-atendimento',pedidos:'page-pedidos'};
const NM={home:'nav-home',products:'nav-products',adult:'nav-adult',favorites:'nav-favorites',cart:'nav-cart',register:'nav-register',pedidos:'nav-pedidos'};
function showPage(p){
  if(p==='manager'&&!mgrLogged){openGModal();return;}
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nb').forEach(x=>x.classList.remove('active'));
  const el=document.getElementById(PM[p]);if(el)el.classList.add('active');
  if(NM[p]){const nb=document.getElementById(NM[p]);if(nb)nb.classList.add('active');}
  if(p==='home'){renderH();renderSS();resetST();}
  if(p==='products')renderP();
  if(p==='adult')renderA();
  if(p==='favorites')renderFavs();
  if(p==='cart')renderCart();
  if(p==='register')renderAcc();
  if(p==='manager')renderMgr();
  if(p==='trocas')renderTrocas();
  if(p==='pedidos'){if(curUser)loadPedidos().then(renderPedidos);else renderPedidos();}
  window.scrollTo(0,0);syncMobNav(p);
}
function switchTab(t){
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.tabcnt').forEach(x=>x.classList.remove('active'));
  const tb=document.getElementById('tab-'+t);if(tb)tb.classList.add('active');
  const tc=document.getElementById('tc-'+t);if(tc)tc.classList.add('active');
  if(t==='clientes')renderUsers();
  if(t==='prods'){populateCatSelects();}
  if(t==='config'){renderRewardsList();renderConfig();}
  if(t==='cats'){renderCatsEditList();}
  if(t==='pedidos-mgr'){loadAndRenderMgrPedidos();}
}
function showV(id){['v-reg','v-login','v-acc'].forEach(v=>{const el=document.getElementById(v);if(el)el.classList[v===id?'remove':'add']('hidden');});}

// â•â• SLIDESHOW â•â•
function renderSS(){
  const cnt=document.getElementById('ss-cnt'),d=document.getElementById('ss-dots');
  if(!cnt||!d)return;
  if(!slides.length){cnt.innerHTML='<div class="slide active" style="justify-content:center;align-items:center"><div style="color:rgba(255,255,255,.4);font-size:16px;position:relative;z-index:2">Nenhum slide cadastrado.</div></div>';d.innerHTML='';return;}
  cnt.innerHTML=slides.map((s,i)=>{
    const t=s.title.replace(/\*([^*]+)\*/g,'<em>$1</em>');
    return '<div class="slide'+(i===curSlide?' active':'')+'">'+
      (s.img?'<img class="slide-bg" src="'+s.img+'"><div class="slide-overlay"></div>':'<div class="slide-overlay"></div>')+
      '<div class="slide-content">'+
      (s.tag?'<span class="slide-tag">'+s.tag+'</span>':'')+
      '<h1>'+t+'</h1>'+
      (s.desc?'<p>'+s.desc+'</p>':'')+
      (s.btn?'<button class="byes" style="border:none;cursor:pointer;font-size:14px;padding:11px 28px" onclick="slideNavTo(\''+( s.cat||'')+'\')">'+ s.btn+'</button>':'')+
      '</div></div>';
  }).join('');
  d.innerHTML=slides.map((_,i)=>'<button class="dot'+(i===curSlide?' active':'')+'" onclick="goSlide('+i+')"></button>').join('');
}
function goSlide(n){curSlide=((n%slides.length)+slides.length)%slides.length;renderSS();resetST();}
function nextSlide(){goSlide(curSlide+1);}
function prevSlide(){goSlide(curSlide-1);}
function resetST(){clearInterval(slideTimer);if(slides.length>1)slideTimer=setInterval(nextSlide,5000);}
function slideNavTo(cat){if(cat==='adult'){showPage('adult');}else if(cat){catP=cat;showPage('products');}else showPage('products');}
function openAddSlide(){editSlId=null;document.getElementById('sl-title-hdr').textContent='Novo Slide';['sl-tit','sl-tag','sl-desc','sl-btn','sl-img'].forEach(x=>document.getElementById(x).value='');populateCatSelects();const sc=document.getElementById('sl-cat');if(sc)sc.value='';openM('mo-slide');}
function openEditSlide(id){
  const s=slides.find(x=>x.id===id);if(!s)return;
  editSlId=id;document.getElementById('sl-title-hdr').textContent='Editar Slide';
  document.getElementById('sl-tit').value=s.title||'';document.getElementById('sl-tag').value=s.tag||'';
  document.getElementById('sl-desc').value=s.desc||'';document.getElementById('sl-btn').value=s.btn||'';
  document.getElementById('sl-img').value=s.img||'';
  populateCatSelects();const sc=document.getElementById('sl-cat');if(sc)sc.value=s.cat||'';
  openM('mo-slide');
}
function slImgUp(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>document.getElementById('sl-img').value=ev.target.result;r.readAsDataURL(f);}
async function saveSlide(){
  const tit=document.getElementById('sl-tit').value.trim();
  if(!tit){showToast('TÃ­tulo obrigatÃ³rio!');return;}
  const sc=document.getElementById('sl-cat');
  const sid=editSlId||Date.now();
  const s={id:sid,title:tit,
    tag:(document.getElementById('sl-tag').value||'').trim(),
    desc:(document.getElementById('sl-desc').value||'').trim(),
    btn:(document.getElementById('sl-btn').value||'').trim(),
    img:(document.getElementById('sl-img').value||'').trim(),
    cat:sc?sc.value:''};
  showToast('â³ Salvando slide...');
  try{
    // Try upsert with full row
    const res=await sb.from('pnm_slides').upsert({id:sid,data:s},{onConflict:'id'});
    if(res.error){
      showToast('âŒ '+res.error.message);
      console.error('saveSlide error:',res.error);
      return;
    }
    // Reload
    const res2=await sb.from('pnm_slides').select('*');
    if(res2.data){
      slides=res2.data.map(function(r){return r.data||r;}).sort(function(a,b){return a.id-b.id;});
    }
    renderMgrSlides();renderSS();resetST();
    closeM('mo-slide');
    showToast('âœ… Slide salvo!');
  }catch(e){
    showToast('âŒ Erro: '+e.message);
    console.error('saveSlide catch:',e);
  }
}
async function delSlide(id){
  showConfirm('Remover Slide','Tem certeza?',async function(){
    try{
      const res=await sb.from('pnm_slides').delete().eq('id',id);
      if(res.error){showToast('âŒ '+res.error.message);return;}
      slides=slides.filter(function(s){return s.id!==id;});
      renderMgrSlides();renderSS();resetST();
      showToast('ðŸ—‘ï¸ Slide removido.');
    }catch(e){showToast('âŒ Erro: '+e.message);}
  });
}
function renderMgrSlides(){
  const el=document.getElementById('mgr-slides');if(!el)return;
  if(!slides.length){el.innerHTML='<p style="color:var(--gr);text-align:center;padding:20px">Nenhum slide.</p>';return;}
  el.innerHTML=slides.map(s=>{
    const prev=s.img?'<img src="'+s.img+'" style="width:58px;height:40px;border-radius:7px;object-fit:cover;flex-shrink:0">':'<div style="width:58px;height:40px;border-radius:7px;background:#1a0a10;flex-shrink:0"></div>';
    return '<div class="sitem">'+prev+'<div class="sitem-info"><h4>'+s.title.replace(/\*([^*]+)\*/g,'$1')+'</h4><p>'+(s.tag||'â€”')+'</p></div><div class="sitem-btns"><button class="bedit" onclick="openEditSlide('+s.id+')">âœï¸</button><button class="adel" onclick="delSlide('+s.id+')">ðŸ—‘ï¸</button></div></div>';
  }).join('');
}

// â•â• CATEGORIES â•â•
function renderHomeCats(){
  const el=document.getElementById('hcats');if(!el)return;
  el.innerHTML=homeCats.map((cat,i)=>{
    const ci=Math.max(0,i-1)%catColors.length;
    const color=catColors[ci];const active=catH===cat.key;
    return '<button class="cp'+(active?' active':'')+'" style="'+(active?'background:'+color+';border-color:'+color+';color:#fff':'')+'" data-ci="'+ci+'" data-key="'+cat.key+'" onclick="fcatH(this,this.dataset.key)">'+cat.label+'</button>';
  }).join('');
  renderSubCatsBar('hsubcats',catH,subCats,'fcatSub');
}
function renderSubCatsBar(elId,activeCat,scMap,fnName){
  var el=document.getElementById(elId);if(!el)return;
  var subs=activeCat!=='all'&&scMap[activeCat]?scMap[activeCat]:[];
  if(!subs.length){el.innerHTML='';el.style.display='none';return;}
  el.style.display='flex';
  el.innerHTML=subs.map(function(sub,i){
    var color=catColors[(i+2)%catColors.length];var active=catSub===sub.key;
    return '<button class="cp" style="font-size:12px;padding:6px 16px;'+(active?'background:'+color+';border-color:'+color+';color:#fff':'')+'" data-key="'+sub.key+'" onclick="'+fnName+'(this,this.dataset.key)">'+sub.label+'</button>';
  }).join('');
}
function renderProductCats(){
  const pcats=document.getElementById('pcats');
  if(pcats){
    pcats.innerHTML=homeCats.map((cat,i)=>{
      const ci=Math.max(0,i-1)%catColors.length;const color=catColors[ci];const active=catP===cat.key;
      return '<button class="cp'+(active?' active':'')+'" style="'+(active?'background:'+color+';border-color:'+color+';color:#fff':'')+'" data-ci="'+ci+'" data-key="'+cat.key+'" onclick="fcatP(this,this.dataset.key)">'+cat.label+'</button>';
    }).join('');
  }
  renderSubCatsBar('psubcats',catP,subCats,'fcatPSub');
}
function fcatH(btn,key){
  catH=key;catSub='';
  btn.parentElement.querySelectorAll('.cp').forEach(b=>{b.classList.remove('active');b.style.cssText='';});
  btn.classList.add('active');btn.style.background=catColors[parseInt(btn.dataset.ci)||0];btn.style.borderColor=catColors[parseInt(btn.dataset.ci)||0];btn.style.color='#fff';
  renderSubCatsBar('hsubcats',catH,subCats,'fcatSub');renderHGrid();
}
function fcatSub(btn,key){
  catSub=catSub===key?'':key;
  btn.parentElement.querySelectorAll('.cp').forEach(b=>{b.classList.remove('active');b.style.cssText='';});
  if(catSub){btn.classList.add('active');var ci=(Array.from(btn.parentElement.children).indexOf(btn)+2)%catColors.length;btn.style.background=catColors[ci];btn.style.borderColor=catColors[ci];btn.style.color='#fff';}
  renderHGrid();
}
function fcatP(btn,key){
  catP=key;catSub='';
  btn.parentElement.querySelectorAll('.cp').forEach(b=>{b.classList.remove('active');b.style.cssText='';});
  btn.classList.add('active');btn.style.background=catColors[parseInt(btn.dataset.ci)||0];btn.style.borderColor=catColors[parseInt(btn.dataset.ci)||0];btn.style.color='#fff';
  renderSubCatsBar('psubcats',catP,subCats,'fcatPSub');renderP();
}
function fcatPSub(btn,key){
  catSub=catSub===key?'':key;
  btn.parentElement.querySelectorAll('.cp').forEach(b=>{b.classList.remove('active');b.style.cssText='';});
  if(catSub){btn.classList.add('active');var ci=(Array.from(btn.parentElement.children).indexOf(btn)+2)%catColors.length;btn.style.background=catColors[ci];btn.style.borderColor=catColors[ci];btn.style.color='#fff';}
  renderP();
}
function renderCatsEditList(){
  document.querySelectorAll('#cats-edit-list').forEach(function(el){
    if(!el)return;el.innerHTML='';
    var secN=document.createElement('div');secN.style.marginBottom='18px';
    var tN=document.createElement('p');tN.style.cssText='font-size:12px;font-weight:700;color:var(--gr);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px';tN.textContent='Categorias Normais';secN.appendChild(tN);
    homeCats.forEach(function(cat,i){
      if(cat.key==='all')return;
      var color=catColors[Math.max(0,i-1)%catColors.length];var subs=subCats[cat.key]||[];
      var card=document.createElement('div');card.style.cssText='background:var(--pkb);border-radius:12px;padding:12px 14px;margin-bottom:8px;border:1px solid var(--pkp)';
      var hdr=document.createElement('div');hdr.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:8px';
      var badge=document.createElement('span');badge.style.cssText='background:'+color+';color:#fff;padding:4px 14px;border-radius:50px;font-size:12px;font-weight:700';badge.textContent=cat.label;
      var code=document.createElement('code');code.style.cssText='font-size:10px;color:var(--gr)';code.textContent=cat.key;
      var sp=document.createElement('span');sp.style.flex='1';
      hdr.appendChild(badge);hdr.appendChild(code);hdr.appendChild(sp);
      if(i>0){var db=document.createElement('button');db.className='adel';db.textContent='ðŸ—‘ï¸';db.style.color='var(--pk)';db.onclick=(function(idx){return function(){removeCat(idx);};})(i);hdr.appendChild(db);}
      else{var fl=document.createElement('span');fl.style.cssText='font-size:11px;color:var(--gr)';fl.textContent='fixo';hdr.appendChild(fl);}
      card.appendChild(hdr);
      if(subs.length){var sd=document.createElement('div');sd.style.marginBottom='8px';subs.forEach(function(sub){var tag=document.createElement('span');tag.style.cssText='display:inline-flex;align-items:center;gap:4px;background:'+color+'22;color:'+color+';border:1px solid '+color+'55;padding:3px 10px;border-radius:50px;font-size:11px;margin:2px';tag.textContent=sub.label;var x=document.createElement('button');x.style.cssText='background:none;border:none;color:'+color+';cursor:pointer;font-size:12px;line-height:1;padding:0';x.textContent='Ã—';x.onclick=(function(ck,sk){return function(){removeSubCat(ck,sk,false);};})(cat.key,sub.key);tag.appendChild(x);sd.appendChild(tag);});card.appendChild(sd);}
      var ar=document.createElement('div');ar.style.cssText='display:flex;gap:6px';
      var inp=document.createElement('input');inp.id='sub-inp-'+cat.key;inp.type='text';inp.placeholder='+ Subcategoria';inp.style.cssText='flex:1;padding:6px 12px;border-radius:8px;border:1.5px solid var(--pkp);font-size:12px;font-family:Raleway,sans-serif;background:#fff;color:var(--bk);outline:none';
      var ab=document.createElement('button');ab.className='byes';ab.textContent='ï¼‹';ab.style.cssText='padding:6px 14px;font-size:12px';ab.onclick=(function(ck){return function(){addSubCat(ck,false);};})(cat.key);
      ar.appendChild(inp);ar.appendChild(ab);card.appendChild(ar);secN.appendChild(card);
    });
    el.appendChild(secN);
    var secA=document.createElement('div');
    var tA=document.createElement('p');tA.style.cssText='font-size:12px;font-weight:700;color:#ff4da6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px';tA.textContent='Categorias +18';secA.appendChild(tA);
    adultCats.forEach(function(cat,i){
      if(cat.key==='all18')return;
      var subs=subAdultCats[cat.key]||[];
      var card=document.createElement('div');card.style.cssText='background:#f5f3ff;border-radius:12px;padding:12px 14px;margin-bottom:8px;border:1px solid #ede9fe';
      var hdr=document.createElement('div');hdr.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:8px';
      var badge=document.createElement('span');badge.style.cssText='background:#7c3aed;color:#fff;padding:4px 14px;border-radius:50px;font-size:12px;font-weight:700';badge.textContent=cat.label;
      var code=document.createElement('code');code.style.cssText='font-size:10px;color:var(--gr)';code.textContent=cat.key;
      var sp=document.createElement('span');sp.style.flex='1';
      var db=document.createElement('button');db.className='adel';db.textContent='ðŸ—‘ï¸';db.style.color='#7c3aed';db.onclick=(function(idx){return function(){removeAdultCat(idx);};})(i);
      hdr.appendChild(badge);hdr.appendChild(code);hdr.appendChild(sp);hdr.appendChild(db);card.appendChild(hdr);
      if(subs.length){var sd=document.createElement('div');sd.style.marginBottom='8px';subs.forEach(function(sub){var tag=document.createElement('span');tag.style.cssText='display:inline-flex;align-items:center;gap:4px;background:#7c3aed22;color:#7c3aed;border:1px solid #7c3aed55;padding:3px 10px;border-radius:50px;font-size:11px;margin:2px';tag.textContent=sub.label;var x=document.createElement('button');x.style.cssText='background:none;border:none;color:#7c3aed;cursor:pointer;font-size:12px;line-height:1;padding:0';x.textContent='Ã—';x.onclick=(function(ck,sk){return function(){removeSubCat(ck,sk,true);};})(cat.key,sub.key);tag.appendChild(x);sd.appendChild(tag);});card.appendChild(sd);}
      var ar=document.createElement('div');ar.style.cssText='display:flex;gap:6px';
      var inp=document.createElement('input');inp.id='sub-inp-'+cat.key;inp.type='text';inp.placeholder='+ Subcategoria +18';inp.style.cssText='flex:1;padding:6px 12px;border-radius:8px;border:1.5px solid #ede9fe;font-size:12px;font-family:Raleway,sans-serif;background:#fff;color:var(--bk);outline:none';
      var ab=document.createElement('button');ab.className='bsv';ab.textContent='ï¼‹';ab.style.cssText='padding:6px 14px;font-size:12px';ab.onclick=(function(ck){return function(){addSubCat(ck,true);};})(cat.key);
      ar.appendChild(inp);ar.appendChild(ab);card.appendChild(ar);secA.appendChild(card);
    });
    el.appendChild(secA);
  });
}
async function addCatMgr(){
  const name=document.getElementById('mgr-cat-name').value.trim();
  const key=document.getElementById('mgr-cat-key').value.trim().toLowerCase().replace(/ /g,'-');
  if(!name||!key){showToast('Preencha nome e chave!');return;}
  if(homeCats.find(c=>c.key===key)){showToast('Chave jÃ¡ existe!');return;}
  homeCats.push({key,label:name});
  await setCfg('homecats',JSON.stringify(homeCats));
  ['mgr-cat-name','mgr-cat-key','new-cat-name','new-cat-key'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderCatsEditList();renderHomeCats();renderProductCats();populateCatSelects();showToast('âœ… Categoria adicionada!');
}
async function addAdultCatMgr(){
  const name=document.getElementById('mgr-acat-name').value.trim();
  const key=document.getElementById('mgr-acat-key').value.trim().toLowerCase().replace(/ /g,'-');
  if(!name||!key){showToast('Preencha nome e chave!');return;}
  if(adultCats.find(c=>c.key===key)){showToast('Chave +18 jÃ¡ existe!');return;}
  adultCats.push({key,label:name});
  await setCfg('adultcats',JSON.stringify(adultCats));
  ['mgr-acat-name','mgr-acat-key'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderCatsEditList();populateCatSelects();showToast('âœ… Categoria +18 adicionada!');
}
async function addSubCat(catKey,isAdult){
  const el=document.getElementById('sub-inp-'+catKey);if(!el)return;
  const label=el.value.trim();if(!label){showToast('Preencha o nome!');return;}
  const key=catKey+'-'+label.toLowerCase().replace(/ /g,'-');
  const map=isAdult?subAdultCats:subCats;
  if(!map[catKey])map[catKey]=[];
  if(map[catKey].find(s=>s.key===key)){showToast('JÃ¡ existe!');return;}
  map[catKey].push({key,label});
  await setCfg(isAdult?'subadultcats':'subcats',JSON.stringify(map));
  el.value='';renderCatsEditList();populateCatSelects();showToast('âœ… Subcategoria adicionada!');
}
async function removeSubCat(catKey,subKey,isAdult){
  const map=isAdult?subAdultCats:subCats;
  if(map[catKey])map[catKey]=map[catKey].filter(s=>s.key!==subKey);
  await setCfg(isAdult?'subadultcats':'subcats',JSON.stringify(map));
  renderCatsEditList();populateCatSelects();showToast('ðŸ—‘ï¸ Subcategoria removida.');
}
async function removeAdultCat(i){
  adultCats.splice(i,1);
  await setCfg('adultcats',JSON.stringify(adultCats));
  renderCatsEditList();populateCatSelects();showToast('ðŸ—‘ï¸ Categoria +18 removida.');
}
async function removeCat(i){
  if(i===0)return;
  homeCats.splice(i,1);
  await setCfg('homecats',JSON.stringify(homeCats));
  renderCatsEditList();renderHomeCats();renderProductCats();populateCatSelects();
  showToast('ðŸ—‘ï¸ Categoria removida.');
}

// â•â• PRODUCT CARD â•â•
function pHTML(p,pool){
  const liked=favs.includes(p.id);
  const esg=p.esg||[];
  const imgs=p.images&&p.images.length?p.images:(p.imgData?[p.imgData]:[]);
  const mainImg=imgs.length?'<img src="'+imgs[0]+'" alt="'+p.name+'">':( p.emoji||'ðŸ‘™');
  const szs=p.sizes.map(s=>'<span class="sz'+(esg.includes(s)?' esg':'')+'">'+s+'</span>').join('');
  const allEsg=p.sizes.length>0&&p.sizes.every(s=>esg.includes(s));
  const cats=Array.isArray(p.cats)?p.cats:[p.cat||''];
  const badgeColor=getCatColor(cats[0]||'');
  return '<div class="pcard">'+
    '<div style="position:relative">'+
      '<div class="pimg" onclick="openProdModal('+p.id+',\''+pool+'\')" style="cursor:pointer">'+mainImg+'</div>'+
      '<span class="pbadge" style="background:'+badgeColor+'">'+( cats[0]||p.cat)+'</span>'+
      (allEsg?'<span class="esgt-badge">Esgotado</span>':'')+
      '<button class="pwish'+(liked?' liked':'')+'" onclick="toggleFav('+p.id+',this)">'+(liked?'â™¥':'â™¡')+'</button>'+
      '<button class="cedit" onclick="openEdit('+p.id+',\''+pool+'\')">âœï¸</button>'+
      '<button class="hstar" onclick="toggleFeat('+p.id+')">'+(p.featured?'â­':'â˜†')+'</button>'+
    '</div>'+
    '<div class="pi" onclick="openProdModal('+p.id+',\''+pool+'\')" style="cursor:pointer">'+
      '<div class="cl">'+p.target.join(' Â· ')+' Â· '+p.age+'</div>'+
      '<h3>'+p.name+'</h3>'+
      '<div class="psz">'+szs+'</div>'+
      '<div class="pfoot">'+
        '<span class="pp">R$ '+Number(p.price).toFixed(2).replace('.',',')+'</span>'+
        (allEsg?'<span style="font-size:11px;color:#aaa">IndisponÃ­vel</span>':'<button class="badd" onclick="event.stopPropagation();addCart('+p.id+')">+ Bag</button>')+
      '</div>'+
    '</div></div>';
}

// Product modal
function openProdModal(id,pool){
  const src=pool==='adult'?aProds:prods;
  const p=src.find(x=>x.id===id);if(!p)return;
  const esg=p.esg||[];
  const imgs=p.images&&p.images.length?p.images:(p.imgData?[p.imgData]:[]);
  const mainEl=document.getElementById('pm-main-img');
  mainEl.innerHTML=imgs.length?'<img src="'+imgs[0]+'" alt="'+p.name+'" style="width:100%;height:100%;object-fit:cover">':( p.emoji||'ðŸ‘™');
  mainEl.style.fontSize=imgs.length?'0':'80px';
  const thumbsEl=document.getElementById('pm-thumbs');
  thumbsEl.innerHTML=imgs.length>1?imgs.map((img,i)=>'<div class="prod-thumb'+(i===0?' active':'')+'" onclick="switchProdImg(this,\''+img+'\')"><img src="'+img+'"></div>').join(''):'';
  document.getElementById('pm-badge').textContent=p.cat;
  document.getElementById('pm-name').textContent=p.name;
  document.getElementById('pm-target').textContent=p.target.join(' Â· ')+' Â· '+p.age;
  document.getElementById('pm-price').textContent='R$ '+Number(p.price).toFixed(2).replace('.',',');
  document.getElementById('pm-desc').textContent=p.desc||'Sem descriÃ§Ã£o disponÃ­vel.';
  document.getElementById('pm-sizes').innerHTML=p.sizes.map(s=>'<span class="sz'+(esg.includes(s)?' esg':'')+'">'+s+'</span>').join('');
  const addBtn=document.getElementById('pm-add-btn');
  const allEsg=p.sizes.length>0&&p.sizes.every(s=>esg.includes(s));
  if(allEsg){addBtn.textContent='Produto Esgotado';addBtn.disabled=true;addBtn.style.opacity='.5';}
  else{addBtn.textContent='+ Adicionar ao Carrinho';addBtn.disabled=false;addBtn.style.opacity='1';addBtn.onclick=()=>{addCart(p.id);closeM('mo-prod');};}
  // Load reviews
  loadReviews(id).then(function(){renderReviews(id);});
  openM('mo-prod');
}
function switchProdImg(thumb,src){document.getElementById('pm-main-img').innerHTML='<img src="'+src+'" style="width:100%;height:100%;object-fit:cover">';document.querySelectorAll('.prod-thumb').forEach(t=>t.classList.remove('active'));thumb.classList.add('active');}

function renderHGrid(){
  const g=document.getElementById('hgrid');if(!g)return;
  const list=prods.filter(p=>{
    const pCats=Array.isArray(p.cats)?p.cats:[p.cat||''];
    const subOk=!catSub||(p.subCat&&p.subCat.includes(catSub));
    return p.featured&&(catH==='all'||pCats.includes(catH))&&subOk;
  });
  g.innerHTML=list.length?list.map(p=>pHTML(p,'main')).join(''):'<p style="color:var(--gr);padding:16px">Nenhum produto em destaque.</p>';
}
function renderH(){renderHomeCats();renderHGrid();}
function renderP(){
  renderProductCats();
  var g=document.getElementById('pgrid2');if(!g)return;
  var base=catP==='all'?prods:prods.filter(function(p){
    var pCats=Array.isArray(p.cats)?p.cats:[p.cat||''];
    return pCats.includes(catP);
  });
  if(catSub)base=base.filter(function(p){return p.subCat&&p.subCat.includes(catSub);});
  var list=searchTerm?base.filter(function(p){
    return p.name.toLowerCase().includes(searchTerm)||
           (p.desc&&p.desc.toLowerCase().includes(searchTerm))||
           (p.cat&&p.cat.toLowerCase().includes(searchTerm));
  }):base;
  g.innerHTML=list.length?list.map(function(p){return pHTML(p,'main');}).join(''):'<p style="color:var(--gr);padding:16px">Nenhum produto encontrado.</p>';
}
function renderA(){
  // +18 area: shows only products with cat='adult' or cats includes 'adult'
  const g=document.getElementById('agrid');if(!g)return;
  g.innerHTML=aProds.length?aProds.map(p=>pHTML(p,'adult')).join(''):'<p style="color:var(--gr);padding:16px">Nenhum produto +18.</p>';
}

// â•â• EDIT PRODUCT â•â•
function openEdit(id,pool){
  const src=pool==='adult'?aProds:prods;
  const p=src.find(x=>x.id===id);if(!p)return;
  document.getElementById('ep-id').value=id;
  document.getElementById('ep-pool').value=pool;
  document.getElementById('ep-name').value=p.name;
  document.getElementById('ep-price').value=p.price;
  document.getElementById('ep-sizes').value=p.sizes.join(', ');
  document.getElementById('ep-esg').value=(p.esg||[]).join(', ');
  document.getElementById('ep-desc').value=p.desc||'';
  editProdImgs=p.images&&p.images.length?[...p.images]:(p.imgData?[p.imgData]:[]);
  renderEpGallery();
  // Load cats checkboxes
  populateCatSelects();
  const selCats=p.cats&&p.cats.length?p.cats:(p.cat?[p.cat]:[]);
  setTimeout(()=>setCatCheckboxes('ep-cats-wrap',selCats),50);
  openM('mo-edit');
}
async function saveEdit(){
  const id=parseInt(document.getElementById('ep-id').value);
  const pool=document.getElementById('ep-pool').value;
  const name=document.getElementById('ep-name').value.trim();
  const price=parseFloat(document.getElementById('ep-price').value);
  const sizes=document.getElementById('ep-sizes').value.split(',').map(s=>s.trim()).filter(Boolean);
  const esg=document.getElementById('ep-esg').value.split(',').map(s=>s.trim()).filter(Boolean);
  const desc=document.getElementById('ep-desc').value.trim();
  const editedCats=getCheckedCats('ep-cats-wrap');
  if(!name||!editedCats.length||!price||!sizes.length){showToast('Preencha nome, categorias, preÃ§o e tamanhos!');return;}
  const cat=editedCats[0];
  const src=pool==='adult'?aProds:prods;
  const p=src.find(x=>x.id===id);if(!p)return;
  Object.assign(p,{name,cat,cats:editedCats,price,sizes,esg,desc,images:editProdImgs.slice(),imgData:editProdImgs.length?editProdImgs[0]:p.imgData});
  await upsertProd(pool==='adult'?'pnm_adult':'pnm_prods',p);
  // Reload from DB and refresh table
  if(pool==='adult'){aProds=await getProd('pnm_adult');}
  else{prods=await getProd('pnm_prods');}
  renderProdTbl();renderHGrid();renderP();updStats();
  closeM('mo-edit');showToast('âœ… Produto atualizado!');
}
function renderEpGallery(){
  const el=document.getElementById('ep-gallery');if(!el)return;
  let html=editProdImgs.map((img,i)=>'<div class="gup-item"><img src="'+img+'"><button class="gup-del" onclick="removeEpImg('+i+')">âœ•</button></div>').join('');
  if(editProdImgs.length<6)html+='<div class="gup-add" onclick="document.getElementById(\'ep-f\').click()"><span>ðŸ“¸</span><span style="font-size:10px;margin-top:3px">Adicionar</span></div>';
  el.innerHTML=html;
}
function removeEpImg(i){editProdImgs.splice(i,1);renderEpGallery();}
function addEpImgs(e){
  const files=Array.from(e.target.files).slice(0,6-editProdImgs.length);
  let loaded=0;
  files.forEach(f=>{const r=new FileReader();r.onload=ev=>{editProdImgs.push(ev.target.result);loaded++;if(loaded===files.length)renderEpGallery();};r.readAsDataURL(f);});
  e.target.value='';
}

// â•â• ADD PRODUCT â•â•
function prevProds(e){
  const files=Array.from(e.target.files).slice(0,6-newProdImgs.length);
  let loaded=0;
  files.forEach(f=>{const r=new FileReader();r.onload=ev=>{newProdImgs.push(ev.target.result);loaded++;if(loaded===files.length)renderPiGallery();};r.readAsDataURL(f);});
  e.target.value='';
}
function renderPiGallery(){
  const el=document.getElementById('pi-gallery');if(!el)return;
  let html=newProdImgs.map((img,i)=>'<div class="gup-item"><img src="'+img+'"><button class="gup-del" onclick="removePiImg('+i+')">âœ•</button></div>').join('');
  if(newProdImgs.length<6)html+='<div class="gup-add" onclick="document.getElementById(\'pi-f\').click()"><span>ðŸ“¸</span><span style="font-size:10px;margin-top:3px">Adicionar</span></div>';
  el.innerHTML=html;
}
function removePiImg(i){newProdImgs.splice(i,1);renderPiGallery();}
function getSZ(){return['sz-p','sz-m','sz-g','sz-gg','sz-48','sz-50','sz-52','sz-54'].map((x,i)=>document.getElementById(x)&&document.getElementById(x).checked?['P','M','G','GG','48','50','52','54'][i]:null).filter(Boolean);}
async function addProd(){
  ['err-pi-img','err-pi-name','err-pi-cats','err-pi-price'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.style.display='none';
  });
  var piName=document.getElementById('pi-name');
  var piPrice=document.getElementById('pi-price');
  var piCatsWrap=document.getElementById('pi-cats-wrap');
  if(piName)piName.style.borderColor='';
  if(piPrice)piPrice.style.borderColor='';
  if(piCatsWrap)piCatsWrap.style.borderColor='';
  var name=(piName?piName.value:'').trim();
  var cats=getCheckedCats('pi-cats-wrap');
  var price=parseFloat((piPrice?piPrice.value:'0').replace(',','.'));
  var desc=document.getElementById('pi-desc').value.trim();
  var age=document.getElementById('pi-age').value;
  var fem=document.getElementById('pi-fem').checked;
  var masc=document.getElementById('pi-masc').checked;
  var dest=document.getElementById('pi-dest').checked;
  var sizes=getSZ();
  var isAdult=document.getElementById('pi-adult').checked;
  var valid=true;
  if(!newProdImgs.length){var e=document.getElementById('err-pi-img');if(e)e.style.display='block';valid=false;}
  if(!name){var e=document.getElementById('err-pi-name');if(e)e.style.display='block';if(piName)piName.style.borderColor='#ef4444';valid=false;}
  if(!cats.length){var e=document.getElementById('err-pi-cats');if(e)e.style.display='block';if(piCatsWrap)piCatsWrap.style.borderColor='#ef4444';valid=false;}
  if(!price||isNaN(price)||price<=0){var e=document.getElementById('err-pi-price');if(e)e.style.display='block';if(piPrice)piPrice.style.borderColor='#ef4444';valid=false;}
  if(!sizes.length){showToast('âš ï¸ Selecione ao menos um tamanho!');valid=false;}
  if(!fem&&!masc){showToast('âš ï¸ Selecione o pÃºblico!');valid=false;}
  if(!valid)return;
  var target=[];if(fem)target.push('Feminino');if(masc)target.push('Masculino');
  var emo={lingerie:'ðŸŒ¸',body:'ðŸ’‹','baby-doll':'ðŸŽ€',camisola:'ðŸŒº',fantasia:'ðŸ’‰',masculino:'ðŸ¥³'};
  var subCatSelected=getCheckedCats('pi-subcats-wrap');
  var np={id:Date.now(),name:name,cat:cats[0],cats:cats,subCat:subCatSelected,
    price:Number(price),desc:desc,age:age,target:target,sizes:sizes,esg:[],
    emoji:emo[cats[0]]||'ðŸ‘™',imgData:newProdImgs.length?newProdImgs[0]:null,
    images:newProdImgs.slice(),featured:dest};
  var tbl=isAdult?'pnm_adult':'pnm_prods';
  try{
    await upsertProd(tbl,np);
    if(isAdult){aProds=await getProd('pnm_adult');}else{prods=await getProd('pnm_prods');}
    renderProdTbl();renderHGrid();renderP();updStats();
    ['pi-name','pi-price','pi-desc'].forEach(function(x){var el=document.getElementById(x);if(el){el.value='';el.style.borderColor='';}});
    document.getElementById('pi-dest').checked=false;document.getElementById('pi-adult').checked=false;
    document.getElementById('pi-fem').checked=true;document.getElementById('pi-masc').checked=false;
    document.getElementById('pi-age').value='18-25';
    ['sz-p','sz-m','sz-g','sz-gg','sz-48','sz-50','sz-52','sz-54'].forEach(function(x){var el=document.getElementById(x);if(el)el.checked=false;});
    document.getElementById('sz-m').checked=true;document.getElementById('sz-g').checked=true;
    newProdImgs=[];renderPiGallery();
    var pw=document.getElementById('pi-cats-wrap');
    if(pw){pw.style.borderColor='';pw.querySelectorAll('input[type=checkbox]').forEach(function(cb){cb.checked=false;var lbl=cb.parentElement;if(lbl){lbl.style.background='transparent';lbl.style.color='var(--gr)';}});}
    var sw=document.getElementById('pi-subcats-wrap');if(sw){sw.innerHTML='';sw.style.display='none';}
    showToast('âœ… "'+name+'" publicado com sucesso!');
  }catch(e){showToast('âŒ Erro: '+e.message);console.error(e);}
}
async function delProd(id){showConfirm('Remover Produto','Tem certeza?',async()=>{await deleteProd('pnm_prods',id);showToast('ðŸ—‘ï¸ Produto removido.');});}
async function toggleFeat(id){const p=prods.find(x=>x.id===id);if(!p)return;p.featured=!p.featured;await upsertProd('pnm_prods',p);showToast(p.featured?'â­ Em destaque!':'Removido do destaque.');}
function prodRow(p,pool){
  var th=p.imgData?'<img src="'+p.imgData+'" style="width:42px;height:42px;object-fit:cover;border-radius:7px">':(p.emoji||'ðŸ‘™');
  var szH=p.sizes.map(function(s){return '<span class="sz'+(p.esg&&p.esg.includes(s)?' esg':'')+'">'+ s+'</span>';}).join(' ');
  var badge=pool==='adult'?'<span style="background:#3d0020;color:#ff4da6;padding:1px 6px;border-radius:50px;font-size:9px;font-weight:700;margin-left:4px">+18</span>':'';
  var featBtn=pool!=='adult'?'<button class="bedit" onclick="toggleFeat('+p.id+')">'+(p.featured?'â˜…':'â˜†')+'</button>':'';
  var delFn=pool==='adult'?'delAdultProd':'delProd';
    var editBtn='<button class="bedit" data-pid="'+p.id+'" data-pool="'+pool+'" onclick="openEditFromAttr(this)">âœï¸</button>';
  var delBtn='<button class="adel" data-pid="'+p.id+'" data-delfn="'+delFn+'" onclick="delFromAttr(this)">ðŸ—‘ï¸</button>';
  var nameDisplay=p.name||'â€”';
  var catDisplay=p.cats&&p.cats.length?p.cats.join(', '):p.cat||'â€”';
  return '<tr>'
    +'<td>'+th+'</td>'
    +'<td><strong>'+nameDisplay+'</strong>'+badge+'<div style="font-size:11px;color:var(--gr)">'+(p.desc?p.desc.slice(0,30)+'â€¦':'')+'</div></td>'
    +'<td style="font-size:12px">'+catDisplay+'</td>'
    +'<td>'+(p.featured&&pool!=='adult'?'â­':'â€”')+'</td>'
    +'<td>'+szH+'</td>'
    +'<td><strong style="color:var(--pk)">R$ '+Number(p.price||0).toFixed(2).replace('.',',')+'</strong></td>'
    +'<td><div style="display:flex;align-items:center;gap:4px">'+editBtn+delBtn+featBtn+'</div></td>'
    +'</tr>';
}
function renderProdTbl(){
  var el=document.getElementById('prod-tbl');if(!el)return;
  var all=[].concat(prods,aProds);
  if(!all.length){el.innerHTML='<p style="color:var(--gr);text-align:center;padding:20px">Nenhum produto.</p>';return;}
  var rows=prods.map(function(p){return prodRow(p,'main');}).join('')
             +aProds.map(function(p){return prodRow(p,'adult');}).join('');
  el.innerHTML='<table class="atbl"><thead><tr><th>Foto</th><th>Nome</th><th>Cat.</th><th>Dest.</th><th>Tamanhos</th><th>PreÃ§o</th><th>AÃ§Ãµes</th></tr></thead><tbody>'+rows+'</tbody></table>';
}
function openEditFromAttr(btn){
  openEdit(parseInt(btn.dataset.pid), btn.dataset.pool);
}
function delFromAttr(btn){
  var fn=btn.dataset.delfn;
  var id=parseInt(btn.dataset.pid);
  if(fn==='delAdultProd')delAdultProd(id);
  else delProd(id);
}
async function delAdultProd(id){
  showConfirm('Remover Produto +18','Tem certeza?',async function(){
    await deleteProd('pnm_adult',id);showToast('ðŸ—‘ï¸ Produto +18 removido.');
  });
}
function updStats(){
  const d=prods.filter(p=>p.featured).length;
  const fm=prods.filter(p=>p.target&&p.target.includes('Feminino')).length;
  const mc=prods.filter(p=>p.target&&p.target.includes('Masculino')).length;
  function sv(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
  sv('st-p',prods.length);sv('st2-t',prods.length);sv('st-d',d);sv('st2-d',d);
  sv('st-u',users.length);sv('st-f',favs.length);sv('st-adult',aProds.length);
  sv('st-fem',fm);sv('st-masc',mc);
  if(allMgrPedidos.length){
    sv('st-pendentes',allMgrPedidos.filter(p=>p.status==='pendente').length);
    sv('st-entregues',allMgrPedidos.filter(p=>p.status==='entregue').length);
  }
}

// ╔═ GERENTE ╗
function updateMgrBtns(){
  var active=mgrLogged;
  var btns=[document.getElementById('btn-gerenciar'),document.getElementById('btn-gerenciar-mob')];
  btns.forEach(function(btn){
    if(!btn)return;
    if(active){
      btn.textContent='🟣 Gerenciar';
      btn.style.background='rgba(124,58,237,.25)';
      btn.style.color='#7c3aed';
      btn.style.borderColor='rgba(124,58,237,.5)';
    }else{
      btn.textContent='Gerenciar';
      btn.style.background='';
      btn.style.color='';
      btn.style.borderColor='';
    }
  });
}
function toggleManager(){
  if(mgrLogged){logoutManager();}
  else{openGModal();}
}
function openGModal(){document.getElementById('mg-u').value='';document.getElementById('mg-p').value='';openM('mo-glogin');setTimeout(()=>document.getElementById('mg-u').focus(),120);}
async function loginManager(){
  const u=document.getElementById('mg-u').value.trim(),p=document.getElementById('mg-p').value;
  if(u==='GerusaSoares'&&p==='gerusa123'){
    mgrLogged=true;document.body.classList.add('gm');
    closeM('mo-glogin');updateMgrBtns();showPage('manager');
    showToast('🟣 Modo gerente ativado!');return;
  }
  showToast('⏳ Verificando...');
  const{data}=await sb.from('pnm_users').select('data').eq('email',u).maybeSingle();
  if(!data||data.data.senha!==p){showToast('❌ Usuário ou senha inválidos!');document.getElementById('mg-p').value='';return;}
  const usr=data.data;
  if(usr.role!=='gerente'){showToast('❌ Sem permissão de gerente!');return;}
  mgrLogged=true;document.body.classList.add('gm');
  curUser=usr;localStorage.setItem('pnm_user',JSON.stringify(usr));
  closeM('mo-glogin');updateMgrBtns();showPage('manager');
  showToast('🟣 Bem-vinda, '+usr.nome+'!');
}
function logoutManager(){
  mgrLogged=false;document.body.classList.remove('gm');
  updateMgrBtns();
  if(document.getElementById('page-manager').classList.contains('active'))showPage('home');
  showToast('Saiu do modo gerente.');
}
function renderMgr(){renderProdTbl();updStats();renderMgrSlides();renderUsers();renderRewardsList();populateCatSelects();loadAndRenderMgrPedidos();}

// â•â• USERS â•â•
async function toggleGerente(email){
  const u=users.find(x=>x.email===email);if(!u)return;
  const novoRole=u.role==='gerente'?'cliente':'gerente';
  u.role=novoRole;
  try{
    await sb.from('pnm_users').upsert({email:u.email,data:u});
    // Reload users from DB to confirm
    users=await getUsers();
    renderUsers();
    showToast(novoRole==='gerente'?'ðŸŸ£ '+u.nome+' agora Ã© gerente!':'ðŸ‘¤ '+u.nome+' voltou a ser cliente.');
  }catch(e){
    console.warn('toggleGerente error:',e);
    showToast('âŒ Erro ao atualizar cargo. Verifique o console.');
  }
}
function renderUsers(){
  const el=document.getElementById('users-tbl');if(!el)return;
  if(!users.length){el.innerHTML='<p style="color:var(--gr);text-align:center;padding:20px">Nenhum cliente.</p>';return;}
  const rows=users.map(u=>{
    const av=u.avatar?'<img src="'+u.avatar+'" style="width:36px;height:36px;border-radius:50%;object-fit:cover">':'<div style="width:36px;height:36px;border-radius:50%;background:var(--pkp);display:flex;align-items:center;justify-content:center;font-size:18px">ðŸ˜Š</div>';
    const isG=u.role==='gerente';
    const roleBtn=isG?'<button style="background:rgba(124,58,237,.15);color:#7c3aed;border:1px solid rgba(124,58,237,.3);padding:4px 12px;border-radius:50px;font-size:11px;font-weight:700;cursor:pointer" onclick="toggleGerente(\''+u.email+'\')">ðŸŸ£ Gerente</button>':'<button style="background:var(--pkp);color:var(--pkd);border:none;padding:4px 12px;border-radius:50px;font-size:11px;font-weight:700;cursor:pointer" onclick="toggleGerente(\''+u.email+'\')">Promover</button>';
    return '<tr><td style="display:flex;align-items:center;gap:10px">'+av+'<div><strong>'+( u.nome||'')+' '+(u.sob||'')+'</strong><div style="font-size:11px;color:var(--gr)">'+(u.cpf||'')+'</div></div></td><td>'+(u.email||'')+'</td><td>'+(u.tel||'â€”')+'</td><td>'+(u.data||'â€”')+'</td><td>'+(u.addr||'â€”')+'</td><td><span style="background:var(--pkp);color:var(--pkd);padding:3px 10px;border-radius:50px;font-size:12px;font-weight:700">'+(u.pts||0)+' pts</span></td><td>'+roleBtn+'</td></tr>';
  }).join('');
  el.innerHTML='<div style="margin-bottom:12px;font-size:13px;color:var(--gr)">Total: <strong style="color:var(--pk)">'+users.length+'</strong> cliente(s)</div><table class="atbl"><thead><tr><th>Cliente</th><th>E-mail</th><th>Tel</th><th>Nasc.</th><th>EndereÃ§o</th><th>Pontos</th><th>Cargo</th></tr></thead><tbody>'+rows+'</tbody></table>';
}

// â•â• AVATAR â•â•
function openAvModal(){avMode='user';tmpAv=null;const av=document.getElementById('av-prev');av.innerHTML=(curUser&&curUser.avatar)?'<img src="'+curUser.avatar+'" style="width:100%;height:100%;object-fit:cover">':'ðŸ˜Š';openM('mo-avatar');}
function openMgrAv(){avMode='mgr';tmpAv=null;const av=document.getElementById('av-prev');av.innerHTML=mgrAvatar?'<img src="'+mgrAvatar+'" style="width:100%;height:100%;object-fit:cover">':'ðŸ‘©â€ðŸ’¼';openM('mo-avatar');}
function handleAvUp(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{tmpAv=ev.target.result;document.getElementById('av-prev').innerHTML='<img src="'+tmpAv+'" style="width:100%;height:100%;object-fit:cover">';};r.readAsDataURL(f);}
async function saveAvatar(){
  if(!tmpAv){closeM('mo-avatar');return;}
  if(avMode==='mgr'){mgrAvatar=tmpAv;await setCfg('mgravatar',mgrAvatar);applyMgrAvatar();}
  else if(curUser){curUser.avatar=tmpAv;localStorage.setItem('pnm_user',JSON.stringify(curUser));await upsertUser(curUser);renderAcc();}
  closeM('mo-avatar');showToast('ðŸ“¸ Foto atualizada!');
}

// â•â• ACCOUNT â•â•
function renderAcc(){
  if(curUser){
    showV('v-acc');
    document.getElementById('acc-av').innerHTML=curUser.avatar?'<img src="'+curUser.avatar+'" style="width:100%;height:100%;object-fit:cover">':'ðŸ˜Š';
    document.getElementById('acc-name').textContent=(curUser.nome||'')+' '+(curUser.sob||'');
    document.getElementById('acc-email').textContent=curUser.email||'';
    var addrFull=curUser.addr||'â€”';
    document.getElementById('acc-info').innerHTML=
      '<p><strong>Tel:</strong> '+(curUser.tel||'â€”')+'</p>'+
      '<p><strong>Nasc.:</strong> '+(curUser.data||'â€”')+'</p>'+
      '<p><strong>EndereÃ§o:</strong> '+addrFull+'</p>';
    renderEditNameBtn();renderFid();renderRewardsGrid();
    const np=document.getElementById('nav-pedidos'),mn=document.getElementById('mnav-pedidos');
    if(np)np.style.display='';if(mn)mn.style.display='';
    loadPedidos().then(renderPedidos);
  }else showV('v-reg');
}
function renderEditNameBtn(){
  const el=document.getElementById('acc-info');if(!el||document.getElementById('btn-change-name'))return;
  const btn=document.createElement('button');btn.id='btn-change-name';btn.style.cssText='margin-top:10px;background:var(--pkp);color:var(--pkd);border:none;padding:6px 16px;border-radius:50px;font-size:12px;font-weight:700;cursor:pointer;font-family:Raleway,sans-serif;display:block';btn.textContent='âœï¸ Trocar nome';btn.onclick=openNameModal;el.appendChild(btn);
}
function openNameModal(){if(!curUser)return;document.getElementById('nm-nome').value=curUser.nome||'';document.getElementById('nm-sob').value=curUser.sob||'';openM('mo-name');}
async function saveName(){
  if(!curUser)return;
  const nome=document.getElementById('nm-nome').value.trim(),sob=document.getElementById('nm-sob').value.trim();
  if(!nome){showToast('Preencha o nome!');return;}
  curUser.nome=nome;curUser.sob=sob;
  localStorage.setItem('pnm_user',JSON.stringify(curUser));await upsertUser(curUser);
  closeM('mo-name');document.getElementById('acc-name').textContent=nome+' '+sob;document.getElementById('fid-uname').textContent=nome+' '+sob;showToast('âœ… Nome atualizado!');
}
async function registerUser(){
  const nome=document.getElementById('r-nome').value.trim(),sob=document.getElementById('r-sob').value.trim();
  const email=document.getElementById('r-email').value.trim(),cpf=document.getElementById('r-cpf').value.trim();
  const senha=document.getElementById('r-senha').value,senha2=document.getElementById('r-senha2').value;
  const tel=document.getElementById('r-tel').value.trim(),data=document.getElementById('r-data').value;
  const rua=document.getElementById('r-rua').value.trim();
  const num=document.getElementById('r-num').value.trim();
  const comp=document.getElementById('r-comp').value.trim();
  const bairro=document.getElementById('r-bairro').value.trim();
  const cidade=document.getElementById('r-cidade').value.trim();
  const estado=document.getElementById('r-estado').value.trim().toUpperCase();
  const cep=document.getElementById('r-cep').value.trim();
  const addr=[rua,num,comp,bairro,cidade,estado,cep].filter(Boolean).join(', ');
  // Clear previous errors
  ['r-nome','r-email','r-cpf','r-senha','r-senha2'].forEach(function(id){
    var e=document.getElementById('err-'+id);if(e)e.style.display='none';
    var el=document.getElementById(id);if(el)el.style.borderColor='';
  });
  var valid2=true;
  if(!nome){var e=document.getElementById('err-r-nome');if(e)e.style.display='block';var el=document.getElementById('r-nome');if(el)el.style.borderColor='#ef4444';valid2=false;}
  if(!email||!/^[^@]+@[^@]+\.[^@]+$/.test(email)){var e=document.getElementById('err-r-email');if(e)e.style.display='block';var el=document.getElementById('r-email');if(el)el.style.borderColor='#ef4444';valid2=false;}
  if(!cpf||cpf.replace(/\D/g,'').length<11){var e=document.getElementById('err-r-cpf');if(e)e.style.display='block';var el=document.getElementById('r-cpf');if(el)el.style.borderColor='#ef4444';valid2=false;}
  if(!senha||senha.length<8){var e=document.getElementById('err-r-senha');if(e)e.style.display='block';var el=document.getElementById('r-senha');if(el)el.style.borderColor='#ef4444';valid2=false;}
  if(senha!==senha2){var e=document.getElementById('err-r-senha2');if(e)e.style.display='block';var el=document.getElementById('r-senha2');if(el)el.style.borderColor='#ef4444';valid2=false;}
  if(!valid2)return;
  if(data){const ag=(new Date()-new Date(data))/(1000*60*60*24*365.25);if(ag<18){showToast('NecessÃ¡rio 18+ anos!');return;}}
  showToast('â³ Verificando...');
  const{data:ex}=await sb.from('pnm_users').select('email').eq('email',email).maybeSingle();
  if(ex){showToast('âŒ E-mail jÃ¡ cadastrado!');return;}
  const{data:cpfEx}=await sb.from('pnm_users').select('email').filter('data->>cpf','eq',cpf).maybeSingle();
  if(cpfEx){showToast('âŒ CPF jÃ¡ cadastrado!');return;}
  const u={nome,sob,email,cpf,senha,tel,addr,data,pts:0,lastDaily:null,fidNick:'Membro',fidBg:null,avatar:null,role:'cliente'};
  await upsertUser(u);curUser=u;localStorage.setItem('pnm_user',JSON.stringify(u));
  showToast('ðŸŽ‰ Bem-vinda, '+nome+'!');renderAcc();
}
async function loginUser(){
  const email=document.getElementById('l-email').value.trim(),senha=document.getElementById('l-senha').value;
  if(!email||!senha){showToast('Preencha os campos!');return;}
  showToast('â³ Verificando...');
  const{data}=await sb.from('pnm_users').select('data').eq('email',email).maybeSingle();
  if(!data){
    showToast('âŒ E-mail nÃ£o cadastrado.');
    const errEl=document.getElementById('login-err');
    if(errEl){errEl.textContent='E-mail nÃ£o encontrado. Verifique ou crie uma conta.';errEl.style.display='block';}
    return;
  }
  if(data.data.senha!==senha){
    showToast('âŒ Senha incorreta.');
    const errEl=document.getElementById('login-err');
    if(errEl){errEl.textContent='Senha incorreta.';errEl.style.display='block';}
    const lnk=document.getElementById('forgot-link');if(lnk)lnk.style.display='block';
    return;
  }
  const errEl=document.getElementById(‘login-err’);if(errEl)errEl.style.display=’none’;
  curUser=data.data;localStorage.setItem(‘pnm_user’,JSON.stringify(curUser));
  // Modo gerente NÃO ativa no login — requer clique em "Gerenciar"
  showToast(‘💕 Bem-vinda, ‘+curUser.nome+’!’);renderAcc();
}
async function resetPassword(){
  const email=document.getElementById('reset-email').value.trim();
  if(!email){showToast('Digite seu e-mail!');return;}
  const{data}=await sb.from('pnm_users').select('data').eq('email',email).maybeSingle();
  if(!data){showToast('âŒ E-mail nÃ£o cadastrado.');return;}
  const tmp='pnm-'+Math.floor(1000+Math.random()*9000);
  const u=data.data;u.senha=tmp;
  await sb.from('pnm_users').upsert({email:u.email,data:u});
  const msg='Sua senha temporÃ¡ria Ã©: *'+tmp+'*%0AAcesse o site e troque nas configuraÃ§Ãµes da conta.';
  window.open('https://wa.me/5551982159719?text='+encodeURIComponent('OlÃ¡ Gerusa, esqueci minha senha. E-mail: '+email),'_blank');
  document.getElementById('reset-result').innerHTML='<p style="color:#22c55e;font-weight:700">âœ… Senha temporÃ¡ria gerada: <strong>'+tmp+'</strong></p><p style="font-size:13px;color:var(--gr)">Anote! Use essa senha para entrar e depois troque no seu perfil.</p>';
  showToast('âœ… Senha temporÃ¡ria: '+tmp);
}
function logoutUser(){
  curUser=null;pedidos=[];localStorage.removeItem('pnm_user');
  // nav-pedidos always visible
  renderAcc();showToast('AtÃ© logo! ðŸ‘‹');
}

// â•â• FIDELIDADE â•â•
function renderFid(){
  if(!curUser)return;
  const pts=curUser.pts||0;
  document.getElementById('fid-pts').textContent=pts;
  document.getElementById('fid-nick').textContent=curUser.fidNick||'Membro';
  document.getElementById('fid-uname').textContent=(curUser.nome||'')+' '+(curUser.sob||'');
  let nr=9999;rewards.forEach(r=>{if(r.cost>pts&&r.cost<nr)nr=r.cost;});if(nr===9999)nr=pts+100;
  let pm=0;rewards.forEach(r=>{if(r.cost<=pts&&r.cost>pm)pm=r.cost;});
  const prog=nr>pm?Math.round(((pts-pm)/(nr-pm))*100):100;
  document.getElementById('fbar-fill').style.width=Math.min(prog,100)+'%';
  document.getElementById('fbar-s').textContent=pts+' pts';
  document.getElementById('fbar-e').textContent=nr+' pts prÃ³x. brinde';
  const bgEl=document.getElementById('fid-bg-img');
  if(curUser.fidBg){bgEl.src=curUser.fidBg;bgEl.style.display='block';}else bgEl.style.display='none';
  const today=new Date().toDateString(),done=curUser.lastDaily===today;
  const btn=document.getElementById('btn-daily');btn.disabled=done;btn.textContent=done?'âœ… Coletado hoje':'ðŸŽ Coletar pontos do dia';
  const cdWrap=document.getElementById('cd-wrap');
  if(done){cdWrap.style.display='block';startCD();}else{cdWrap.style.display='none';if(cdInterval){clearInterval(cdInterval);cdInterval=null;}}
}
function startCD(){
  if(cdInterval)clearInterval(cdInterval);
  const tick=()=>{const now=new Date(),mn=new Date(now);mn.setHours(24,0,0,0);const diff=mn-now;if(diff<=0){if(curUser){curUser.lastDaily=null;localStorage.setItem('pnm_user',JSON.stringify(curUser));}renderFid();return;}const h=Math.floor(diff/3600000),m=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000);const eh=document.getElementById('cd-h'),em=document.getElementById('cd-m'),es=document.getElementById('cd-s');if(eh)eh.textContent=pad(h);if(em)em.textContent=pad(m);if(es)es.textContent=pad(s);};tick();cdInterval=setInterval(tick,1000);
}
async function claimDaily(){
  if(!curUser)return;const today=new Date().toDateString();if(curUser.lastDaily===today){showToast('JÃ¡ coletou hoje!');return;}
  const earned=Math.floor(Math.random()*6)+5;curUser.pts=(curUser.pts||0)+earned;curUser.lastDaily=today;
  localStorage.setItem('pnm_user',JSON.stringify(curUser));await upsertUser(curUser);
  renderFid();renderRewardsGrid();showToast('ðŸŽ‰ +'+earned+' pontos! Total: '+curUser.pts+' pts');
}
function openFidModal(){if(curUser)document.getElementById('fid-nick-inp').value=curUser.fidNick||'';document.getElementById('fid-bg').value='';openM('mo-fid');}
async function saveFidCustom(){
  if(!curUser)return;const nick=document.getElementById('fid-nick-inp').value.trim(),bg=document.getElementById('fid-bg').value.trim();
  if(nick)curUser.fidNick=nick;if(bg)curUser.fidBg=bg;localStorage.setItem('pnm_user',JSON.stringify(curUser));await upsertUser(curUser);closeM('mo-fid');renderFid();showToast('âœ… Carteirinha atualizada!');
}
function fidBgUp(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>document.getElementById('fid-bg').value=ev.target.result;r.readAsDataURL(f);}

// â•â• REWARDS â•â•
function renderRewardsGrid(){
  const el=document.getElementById('rgrid');if(!el)return;const pts=curUser?curUser.pts||0:0;
  el.innerHTML=rewards.map(r=>'<div class="rcard"><div class="rico">'+r.ico+'</div><h4>'+r.name+'</h4><p style="font-size:11px;color:var(--gr);margin-bottom:5px">'+r.desc+'</p><div class="rcost">'+r.cost+' pts</div><button '+(pts>=r.cost?'onclick="redeem('+r.id+')"':'disabled')+'>'+(pts>=r.cost?'Resgatar':'Faltam '+(r.cost-pts)+' pts')+'</button></div>').join('');
}
async function redeem(id){
  if(!curUser)return;const r=rewards.find(x=>x.id===id);if(!r)return;if(curUser.pts<r.cost){showToast('Pontos insuficientes!');return;}
  pendingRedeemId=id;document.getElementById('rsg-desc').textContent=r.ico+' '+r.name+' â€” '+r.cost+' pts. SerÃ¡ aplicado na prÃ³xima compra.';openM('mo-resgatar');
}
async function confirmResgatar(){
  if(!curUser||!pendingRedeemId)return;const r=rewards.find(x=>x.id===pendingRedeemId);if(!r)return;
  curUser.pts-=r.cost;pendingReward={name:r.name,ico:r.ico};
  localStorage.setItem('pnm_user',JSON.stringify(curUser));localStorage.setItem('pnm_pendingReward',JSON.stringify(pendingReward));
  await upsertUser(curUser);closeM('mo-resgatar');renderFid();renderRewardsGrid();showToast('ðŸŽ‰ '+r.name+' resgatado! Aplicado na prÃ³xima compra.');
}
function renderRewardsList(){
  const el=document.getElementById('rewards-list');if(!el)return;
  if(!rewards.length){el.innerHTML='<p style="color:var(--gr);font-size:13px;text-align:center;padding:10px">Nenhuma recompensa.</p>';return;}
  el.innerHTML=rewards.map((r,i)=>'<div style="display:flex;align-items:center;gap:10px;background:var(--pkb);padding:10px 14px;border-radius:10px;border:1px solid var(--pkp)"><span style="font-size:22px">'+r.ico+'</span><span style="flex:1;font-size:13px;font-weight:600">'+r.name+' â€” <strong style="color:var(--pk)">'+r.cost+' pts</strong><span style="display:block;font-size:11px;font-weight:400;color:var(--gr)">'+r.desc+'</span></span><button class="bedit" onclick="openEditReward('+i+')">âœï¸</button><button class="adel" onclick="delReward('+i+')">ðŸ—‘ï¸</button></div>').join('');
}
function openAddReward(){rwIdx=-1;document.getElementById('rw-hdr').textContent='Novo Brinde';['rw-name','rw-ico','rw-cost','rw-desc'].forEach(x=>document.getElementById(x).value='');openM('mo-reward');}
function openEditReward(i){const r=rewards[i];rwIdx=i;document.getElementById('rw-hdr').textContent='Editar Brinde';document.getElementById('rw-name').value=r.name;document.getElementById('rw-ico').value=r.ico;document.getElementById('rw-cost').value=r.cost;document.getElementById('rw-desc').value=r.desc;openM('mo-reward');}
async function saveReward(){
  const name=document.getElementById('rw-name').value.trim(),ico=document.getElementById('rw-ico').value.trim()||'ðŸŽ';
  const cost=parseInt(document.getElementById('rw-cost').value),desc=document.getElementById('rw-desc').value.trim();
  if(!name||isNaN(cost)||cost<1){showToast('Preencha nome e custo!');return;}
  if(rwIdx===-1)rewards.push({id:Date.now(),name,ico,cost,desc});else rewards[rwIdx]={id:rewards[rwIdx].id,name,ico,cost,desc};
  for(const r of rewards)await upsertProd('pnm_rewards',r);closeM('mo-reward');renderRewardsList();renderRewardsGrid();showToast(rwIdx===-1?'âœ… Brinde adicionado!':'âœ… Brinde atualizado!');
}
async function delReward(i){showConfirm('Remover Brinde','Remover?',async()=>{const id=rewards[i].id;rewards.splice(i,1);await deleteProd('pnm_rewards',id);renderRewardsList();renderRewardsGrid();showToast('ðŸ—‘ï¸ Recompensa removida.');});}

// â•â• FAVORITES â•â•
function toggleFav(id,btn){const idx=favs.indexOf(id);if(idx===-1){favs.push(id);btn.textContent='â™¥';btn.classList.add('liked');showToast('â™¥ Adicionado!');}else{favs.splice(idx,1);btn.textContent='â™¡';btn.classList.remove('liked');showToast('â™¡ Removido.');}saveLS('pnm_favs',favs);document.getElementById('fav-n').textContent=favs.length;if(document.getElementById('page-favorites').classList.contains('active'))renderFavs();}
function renderFavs(){const el=document.getElementById('fav-cnt');if(!el)return;const all=[...prods,...aProds];const items=all.filter(p=>favs.includes(p.id));if(!items.length){el.innerHTML='<div class="empty"><div class="eico">â™¡</div><h2>Nenhum favorito</h2><p>Clique no â™¡ para salvar.</p></div>';return;}const aIds=aProds.map(p=>p.id);el.innerHTML='<div class="pgrid">'+items.map(p=>pHTML(p,aIds.includes(p.id)?'adult':'main')).join('')+'</div>';}

// â•â• CART â•â•
function addCart(id){const all=[...prods,...aProds];const p=all.find(x=>x.id===id);if(!p)return;const ex=cart.find(x=>x.id===id);if(ex)ex.qty++;else cart.push({id:p.id,name:p.name,cat:p.cat,price:p.price,emoji:p.emoji,imgData:p.imgData||null,qty:1});saveLS('pnm_cart',cart);const cnt=cart.reduce((s,x)=>s+x.qty,0);document.getElementById('cart-c').textContent=cnt;const c2=document.getElementById('cart-c2');if(c2)c2.textContent=cnt;showToast(p.name+' adicionado!');}
function removeCart(id){cart=cart.filter(x=>x.id!==id);saveLS('pnm_cart',cart);const cnt=cart.reduce((s,x)=>s+x.qty,0);document.getElementById('cart-c').textContent=cnt;const c2=document.getElementById('cart-c2');if(c2)c2.textContent=cnt;renderCart();}
function renderCart(){
  const el=document.getElementById('cart-list');if(!el)return;
  if(!cart.length){
    el.innerHTML='<div class="empty"><div class="eico">ðŸ›’</div><h2>Carrinho vazio</h2><p>Adicione itens!</p></div>';
    const b=document.createElement('button');b.className='byes';b.style.marginTop='18px';b.textContent='Ver Produtos';b.onclick=function(){showPage('products');};el.querySelector('.empty').appendChild(b);
    return;
  }
  const total=cart.reduce((s,x)=>s+x.price*x.qty,0);
  el.innerHTML=cart.map(x=>{const img=x.imgData?'<img src="'+x.imgData+'">':( x.emoji||'ðŸ‘™');return'<div class="citem"><div class="ciimg">'+img+'</div><div class="ciinfo"><h3>'+x.name+'</h3><p>'+x.cat+' Â· Qtd: '+x.qty+'</p></div><span class="cip">R$ '+(x.price*x.qty).toFixed(2).replace('.',',')+'</span><button class="crm" onclick="removeCart('+x.id+')">âœ•</button></div>';}).join('')+
    '<div class="ctot"><div><div class="tl">Total</div><div class="tv">R$ '+total.toFixed(2).replace('.',',')+'</div></div></div>'+
    '<button class="bchk" onclick="checkout()">Finalizar Compra ðŸŽ‰</button>';
}
async function checkout(){
  if(!curUser){showToast('FaÃ§a login primeiro!');showPage('register');return;}
  if(!cart.length){showToast('Carrinho vazio!');return;}
  showToast('â³ Registrando pedido...');
  // Generate guaranteed-unique order code
  let orderCode;
  try{
    let seqRaw=await getCfg('order_seq');
    let seq=(seqRaw&&!isNaN(parseInt(seqRaw)))?parseInt(seqRaw):1;
    orderCode='PNM'+String(seq).padStart(6,'0');
    await setCfg('order_seq',String(seq+1));
  }catch(e){
    // Fallback: use timestamp-based code if DB fails
    orderCode='PNM'+String(Date.now()).slice(-6);
  }
  const pedido={
    id:Date.now(),
    orderCode:orderCode,
    userId:curUser.email,
    nomeCliente:(curUser.nome||'')+' '+(curUser.sob||''),
    endereco:curUser.addr||'',
    tel:curUser.tel||'',
    items:cart.map(x=>({id:x.id,name:x.name,qty:x.qty,price:x.price})),
    total:cart.reduce((s,x)=>s+x.price*x.qty,0),
    brinde:pendingReward?pendingReward.name:null,
    status:'pendente',
    createdAt:new Date().toISOString()
  };
  try{await sb.from('pnm_pedidos').upsert({id:pedido.id,email:curUser.email,data:pedido});}catch(e){console.warn(e);}
  pedidos.unshift(pedido);
  cart=[];saveLS('pnm_cart',cart);
  document.getElementById('cart-c').textContent=0;
  const c2=document.getElementById('cart-c2');if(c2)c2.textContent=0;
  pendingReward=null;localStorage.removeItem('pnm_pendingReward');
  const codeEl=document.getElementById('mo-checkout-code');
  if(codeEl)codeEl.textContent=orderCode;
  openM('mo-checkout');
  renderPedidos();
}

// â•â• PEDIDOS â•â•
async function loadPedidos(){
  if(!curUser)return;
  const{data}=await sb.from('pnm_pedidos').select('data').eq('email',curUser.email);
  if(data)pedidos=data.map(r=>r.data).sort((a,b)=>b.id-a.id);
}
function renderPedidos(){
  const el=document.getElementById('pedidos-list');if(!el)return;
  if(!curUser){
    el.innerHTML='<div class="empty"><div class="eico">ðŸ“¦</div><h2>FaÃ§a login para ver seus pedidos</h2></div>';
    const b=document.createElement('button');b.className='byes';b.style.marginTop='18px';b.textContent='Entrar';b.onclick=function(){showPage('register');};el.querySelector('.empty').appendChild(b);
    return;
  }
  if(!pedidos.length){
    el.innerHTML='<div class="empty"><div class="eico">ðŸ“¦</div><h2>Nenhum pedido ainda</h2><p>Seus pedidos aparecerÃ£o aqui apÃ³s a compra.</p></div>';
    const b=document.createElement('button');b.className='byes';b.style.marginTop='18px';b.textContent='Ver Produtos';b.onclick=function(){showPage('products');};el.querySelector('.empty').appendChild(b);
    return;
  }
  let html='';
  pedidos.forEach(function(p){
    const total='R$ '+Number(p.total).toFixed(2).replace('.',',');
    const date=new Date(p.createdAt).toLocaleDateString('pt-BR');
    const itemsTxt=p.items.map(function(i){return i.name+' (x'+i.qty+')';}).join(', ');
    const brindeTxt=p.brinde?' | Brinde: '+p.brinde:'';
    const code=p.orderCode||('PNM'+String(p.id).slice(-6));
    const endTxt=p.endereco?'%0AEndere%C3%A7o: '+encodeURIComponent(p.endereco):'';
    const waMsgRaw='OlÃ¡ Gerusa! ðŸ’•%0A%0APedido '+code+'%0ACliente: '+encodeURIComponent(p.nomeCliente||'')+'%0AData: '+date+'%0AItens: '+encodeURIComponent(itemsTxt)+'%0ATotal: '+total+brindeTxt+endTxt+'%0A%0AVou enviar o comprovante aqui!';
    const statusColor=p.status==='entregue'?'#22c55e':p.status==='pago'?'#3b82f6':p.status==='cancelado'||p.status==='recusado'?'#ef4444':'#f59e0b';
    const statusLabel=p.status==='entregue'?'âœ… Entregue':p.status==='pago'?'ðŸ’° Pago':p.status==='cancelado'?'âŒ Cancelado':p.status==='recusado'?'ðŸš« Recusado â€” entre em contato com a loja':'â³ Pendente';
    const itemsHtml=p.items.map(function(i){return '<div style="font-size:13px;color:var(--bk);padding:3px 0">'+i.name+' Ã— '+i.qty+' â€” R$ '+Number(i.price*i.qty).toFixed(2).replace('.',',')+'</div>';}).join('');
    const brindeHtml=p.brinde?'<div style="font-size:12px;color:#7c3aed;font-weight:700;margin-top:6px">ðŸŽ Brinde: '+p.brinde+'</div>':'';
    html+='<div style="background:#fff;border-radius:18px;padding:24px 28px;box-shadow:var(--sh);margin-bottom:18px;border-left:4px solid '+statusColor+'">'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:14px">'
        +'<div><span style="font-size:12px;color:var(--gr);font-weight:600">Pedido #'+String(p.id).slice(-6)+'</span>'
        +'<div style="font-size:20px;font-weight:700;color:var(--pk)">'+total+'</div>'
        +'<div style="font-size:12px;color:var(--gr)">'+date+'</div></div>'
        +'<span style="background:'+statusColor+'22;color:'+statusColor+';border:1px solid '+statusColor+'55;padding:5px 14px;border-radius:50px;font-size:12px;font-weight:700">'+statusLabel+'</span>'
      +'</div>'
      +'<div style="background:var(--pkb);border-radius:10px;padding:12px;margin-bottom:14px">'
        +'<div style="font-size:11px;font-weight:700;color:var(--gr);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Itens</div>'
        +itemsHtml+brindeHtml
      +'</div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
        +(p.status==='entregue'||p.status==='cancelado'||p.status==='recusado'?'':'<a href="https://wa.me/5551982159719?text='+waMsgRaw+'" target="_blank" style="display:inline-flex;align-items:center;gap:7px;background:#25D366;color:#fff;padding:9px 18px;border-radius:50px;font-size:13px;font-weight:700;text-decoration:none">ðŸ’¬ WhatsApp</a>')
        +(p.status==='pendente'?'<button onclick="cancelarPedido('+p.id+')" style="background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.3);padding:9px 18px;border-radius:50px;font-size:13px;font-weight:700;cursor:pointer;font-family:Raleway,sans-serif">âŒ Cancelar</button>':'')
      +'</div>'
    +'</div>';
  });
  el.innerHTML=html;
}
async function cancelarPedido(id){
  showConfirm('Cancelar Pedido','Tem certeza que deseja cancelar?',async function(){
    const idx=pedidos.findIndex(x=>x.id===id);
    if(idx===-1)return;
    pedidos[idx].status='cancelado';
    const p=pedidos[idx];
    try{
      const{error:ce}=await sb.from('pnm_pedidos').upsert({id:p.id,email:p.userId||curUser.email,data:p});
      if(ce)throw ce;
      showToast('âŒ Pedido '+( p.orderCode||'')+ ' cancelado.');
    }catch(e){
      console.warn(e);
      showToast('Erro ao cancelar. Tente novamente.');
    }
    renderPedidos();
  });
}

// â•â• MANAGER PEDIDOS â•â•
let allMgrPedidos=[];
let mgrPedidosMap={};
let mgrPedidosFilter='todos';

async function loadAndRenderMgrPedidos(){
  const el=document.getElementById('mgr-pedidos-list');
  if(!el)return;
  el.innerHTML='<p style="color:var(--gr);text-align:center;padding:20px">â³ Carregando pedidos...</p>';
  try{
    const{data,error}=await sb.from('pnm_pedidos').select('data');
    if(error){console.warn('load pedidos:',error);}
    allMgrPedidos=data?data.map(r=>r.data).sort((a,b)=>b.id-a.id):[];
    // Build stable key map: string key -> pedido
    mgrPedidosMap={};
    allMgrPedidos.forEach(function(p,i){mgrPedidosMap['k'+i]=p;});
  }catch(e){console.warn('loadMgrPedidos:',e);}
  renderMgrPedidos();
}

function filterMgrPedidos(f){
  mgrPedidosFilter=f;
  document.querySelectorAll('[id^="mpf-"]').forEach(function(b){b.style.background='';});
  var btn=document.getElementById('mpf-'+f);
  if(btn)btn.style.background='rgba(124,58,237,.35)';
  renderMgrPedidos();
}

async function setMgrPedidoStatus(key,status){
  var p=mgrPedidosMap[key];
  if(!p){showToast('Pedido nÃ£o encontrado. key='+key);return;}
  p.status=status;
  var labels={pendente:'â³ Pendente',pago:'ðŸ’° Pago',entregue:'âœ… Entregue',recusado:'ðŸš« Recusado',cancelado:'âŒ Cancelado'};
  try{
    // Update only the data column using the PK (id)
    var res=await sb.from('pnm_pedidos').update({data:p}).eq('id',p.id);
    if(res.error){
      // If update failed (row not found), try upsert
      var email=p.userId||p.email||'';
      var res2=await sb.from('pnm_pedidos').upsert({id:p.id,email:email,data:p});
      if(res2.error){showToast('âŒ '+res2.error.message);console.warn(res2.error);return;}
    }
    showToast('âœ… '+(p.orderCode||'Pedido')+' â†’ '+(labels[status]||status));
    renderMgrPedidos();
  }catch(e){
    showToast('Erro: '+e.message);
    console.warn('setMgrPedidoStatus error:',e);
  }
}

function renderMgrPedidos(){
  var el=document.getElementById('mgr-pedidos-list');if(!el)return;
  var list=[];
  for(var i=0;i<allMgrPedidos.length;i++){
    if(mgrPedidosFilter==='todos'||allMgrPedidos[i].status===mgrPedidosFilter)list.push(i);
  }
  if(!list.length){
    el.innerHTML='<div style="text-align:center;padding:40px;color:var(--gr)">Nenhum pedido '+(mgrPedidosFilter==='todos'?'':mgrPedidosFilter)+'.</div>';
    return;
  }
  var scMap={pendente:'#f59e0b',pago:'#3b82f6',entregue:'#22c55e',cancelado:'#ef4444',recusado:'#ef4444'};
  var slMap={pendente:'â³ Pendente',pago:'ðŸ’° Pago',entregue:'âœ… Entregue',cancelado:'âŒ Cancelado',recusado:'ðŸš« Recusado'};
  var html='';
  for(var li=0;li<list.length;li++){
    var i=list[li];
    var p=allMgrPedidos[i];
    var code=p.orderCode||('PNM'+String(p.id).slice(-6));
    var total='R$ '+Number(p.total||0).toFixed(2).replace('.',',');
    var date=p.createdAt?new Date(p.createdAt).toLocaleDateString('pt-BR'):'â€”';
    var sc=scMap[p.status]||'#f59e0b';
    var sl=slMap[p.status]||'â³ Pendente';
    var itemsHtml='';
    var items=p.items||[];
    for(var j=0;j<items.length;j++){
      itemsHtml+='<span style="font-size:12px;background:var(--pkp);color:var(--pkd);padding:2px 8px;border-radius:50px;margin:2px;display:inline-block">'+items[j].name+' x'+items[j].qty+'</span>';
    }
    var brindeHtml=p.brinde?'<div style="font-size:12px;color:#7c3aed;font-weight:700;margin-top:4px">Brinde: '+p.brinde+'</div>':'';
    var endHtml=p.endereco?'<div style="font-size:12px;color:var(--gr);margin-top:4px">Endereco: '+p.endereco+'</div>':'';
    var telHtml=p.tel?'<div style="font-size:11px;color:var(--gr)">Tel: '+p.tel+'</div>':'';
    // Actions use array INDEX (not id) to avoid quote/precision issues
    var actions='';
    var key='k'+i;
    if(p.status==='pendente'){
      actions=mkBtn(key,'pago','Marcar Pago','rgba(59,130,246,.15)','#3b82f6','rgba(59,130,246,.4)')
             +mkBtn(key,'recusado','Recusar','rgba(239,68,68,.1)','#ef4444','rgba(239,68,68,.3)');
    }else if(p.status==='pago'){
      actions=mkBtn(key,'entregue','Marcar Entregue','rgba(34,197,94,.15)','#22c55e','rgba(34,197,94,.4)')
             +mkBtn(key,'pendente','Pend. Pagamento','rgba(245,158,11,.1)','#f59e0b','rgba(245,158,11,.3)');
    }else if(p.status==='recusado'||p.status==='cancelado'){
      actions=mkBtn(key,'pendente','Reativar','rgba(245,158,11,.1)','#f59e0b','rgba(245,158,11,.3)');
    }else if(p.status==='entregue'){
      actions='<span style="font-size:12px;color:#22c55e;font-weight:700">âœ… ConcluÃ­do</span>';
    }
    html+='<div style="background:#fff;border-radius:16px;padding:20px;margin-bottom:14px;border-left:4px solid '+sc+';box-shadow:0 2px 12px rgba(232,0,106,.06)">'
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:12px">'
        +'<div>'
          +'<span style="font-size:13px;font-weight:800;color:var(--pk)">'+code+'</span>'
          +'<span style="font-size:12px;color:var(--gr);margin-left:10px">'+date+'</span>'
          +'<div style="font-size:14px;font-weight:700;color:var(--bk);margin-top:2px">'+(p.nomeCliente||'â€”')+'</div>'
          +telHtml+endHtml
        +'</div>'
        +'<div style="text-align:right">'
          +'<span style="background:'+sc+'22;color:'+sc+';border:1px solid '+sc+'55;padding:4px 12px;border-radius:50px;font-size:11px;font-weight:700">'+sl+'</span>'
          +'<div style="font-size:18px;font-weight:900;color:var(--pk);margin-top:4px">'+total+'</div>'
        +'</div>'
      +'</div>'
      +'<div style="margin-bottom:10px">'+itemsHtml+brindeHtml+'</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap">'+actions+'</div>'
    +'</div>';
  }
  el.innerHTML=html;
}

function mkBtn(key,status,label,bg,color,border){
  return '<button data-key="'+key+'" data-status="'+status+'" onclick="mgrBtnClick(this)" style="background:'+bg+';color:'+color+';border:1px solid '+border+';padding:6px 12px;border-radius:50px;font-size:11px;font-weight:700;cursor:pointer;font-family:Raleway,sans-serif">'+label+'</button>';
}

function mgrBtnClick(btn){
  var key=btn.getAttribute('data-key');
  var status=btn.getAttribute('data-status');
  if(!key||!status){showToast('Erro: atributos do botÃ£o invÃ¡lidos.');return;}
  setMgrPedidoStatus(key,status);
}

function mgrBtn(id,status,label,bg,color,border){
  // legacy shim - not used
  return mkBtn(id,status,label,bg,color,border);
}



// â•â• CONFIG â•â•
async function renderConfig(){
  const el=document.getElementById('tc-config');if(!el)return;
  const[whats,hor,boas]=await Promise.all([
    getCfg('cfg_whatsapp'),getCfg('cfg_horario'),getCfg('cfg_boasvindas')
  ]);
  const fields=[
    {key:'cfg_whatsapp',label:'WhatsApp da Loja',hint:'SÃ³ nÃºmeros com DDI. Ex: 5551982159719',id:'cfg-whats',val:whats||'5551982159719',type:'input'},
    {key:'cfg_horario',label:'HorÃ¡rio de Atendimento',hint:'',id:'cfg-hor',val:hor||'Segâ€“Sex 9hâ€“18h | SÃ¡b 9hâ€“13h',type:'input'},
    {key:'cfg_boasvindas',label:'Mensagem de Boas-Vindas',hint:'Aparece na pÃ¡gina inicial',id:'cfg-boas',val:boas||'',type:'textarea'},
    {key:'trocas',label:'PolÃ­tica de Trocas',hint:'',id:'trocas-txt',val:trocasTxt,type:'textarea'},
  ];
  var html='<div class="mcard full"><h3 style="margin-bottom:20px">âš™ï¸ ConfiguraÃ§Ãµes da Loja</h3>';
  fields.forEach(function(f){
    html+='<div style="margin-bottom:20px">'
      +'<label style="font-size:12px;font-weight:700;color:var(--gr);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:6px">'+f.label+'</label>'
      +'<div style="display:flex;gap:8px;align-items:flex-start">';
    if(f.type==='textarea'){
      html+='<textarea id="'+f.id+'" rows="3" style="flex:1;padding:10px 14px;border-radius:9px;border:2px solid var(--pkp);font-family:Raleway,sans-serif;font-size:13px;color:var(--bk);outline:none;resize:vertical">'+f.val+'</textarea>';
    } else {
      html+='<input id="'+f.id+'" type="text" value="'+f.val+'" style="flex:1;padding:10px 14px;border-radius:9px;border:2px solid var(--pkp);font-family:Raleway,sans-serif;font-size:13px;color:var(--bk);outline:none">';
    }
    html+='<button class="byes" data-cfgkey="'+f.key+'" data-cfgel="'+f.id+'" onclick="saveCfgClick(this)" style="padding:10px 16px;font-size:12px;white-space:nowrap">Salvar</button>';
    html+='</div>';
    if(f.hint)html+='<p style="font-size:11px;color:var(--gr);margin-top:4px">'+f.hint+'</p>';
    html+='</div>';
  });
  html+='<div><label style="font-size:12px;font-weight:700;color:var(--gr);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:10px">Brindes de Fidelidade</label>'
    +'<button class="byes" onclick="openAddReward()" style="margin-bottom:10px;font-size:12px;padding:8px 16px">âž• Novo Brinde</button>'
    +'<div id="rewards-list"></div></div>';
  html+='</div>';
  el.innerHTML=html;
  renderRewardsList();
}
async function saveCfgClick(btn){
  var key=btn.dataset.cfgkey;
  var elId=btn.dataset.cfgel;
  var el=document.getElementById(elId);if(!el)return;
  var val=el.value.trim();
  await setCfg(key,val);
  if(key==='trocas')trocasTxt=val;
  showToast('âœ… '+btn.previousElementSibling.previousElementSibling.textContent+' salvo!');
}
async function saveCfgField(key,elId){
  const el=document.getElementById(elId);if(!el)return;
  await setCfg(key,el.value.trim());showToast('âœ… Salvo!');
}

// â•â• +18 / TROCAS â•â•
function tryAdult(){if(adultOk)showPage('adult');else openM('mo-age');}
function confirmAge(){adultOk=true;closeM('mo-age');showPage('adult');}
function renderTrocas(){
  const d=document.getElementById('trocas-disp');if(d)d.innerHTML=trocasTxt;
  const w=document.getElementById('trocas-edit-btn');
  if(w)w.innerHTML=mgrLogged?'<button class="byes" style="padding:11px 26px;font-size:13px" onclick="openTrocasEdit()">âœï¸ Editar</button>':'';
}
function openTrocasEdit(){document.getElementById('trocas-txt').value=trocasTxt;openM('mo-trocas');}
async function saveTrocas(){
  const el=document.getElementById('trocas-txt');
  if(!el)return;
  trocasTxt=el.value;
  await setCfg('trocas',trocasTxt);
  // close modal if open (old flow)
  const mo=document.getElementById('mo-trocas');
  if(mo&&mo.classList.contains('open'))closeM('mo-trocas');
  renderTrocas();showToast('âœ… PolÃ­tica salva!');
}

function toggleAdultCats(isAdult){populateCatSelects(isAdult);}

// â•â• SEARCH â•â•
var searchTerm='';
function searchProds(val){
  searchTerm=val.trim().toLowerCase();
  var cl=document.getElementById('search-clear');
  if(cl)cl.style.display=searchTerm?'block':'none';
  renderP();
}
function clearSearch(){
  var inp=document.getElementById('search-input');if(inp)inp.value='';
  searchTerm='';
  var cl=document.getElementById('search-clear');if(cl)cl.style.display='none';
  renderP();
}

// â•â• REVIEWS â•â•
var allReviews={};
async function loadReviews(prodId){
  var key='rev_'+prodId;
  var val=await getCfg(key);
  if(val){try{allReviews[prodId]=JSON.parse(val);}catch(e){allReviews[prodId]=[];}}
  else allReviews[prodId]=[];
}
async function submitReview(prodId){
  if(!curUser){showToast('FaÃ§a login para avaliar!');return;}
  var stars=document.querySelector('#review-stars .star-sel');
  var rating=stars?parseInt(stars.dataset.v):0;
  if(!rating){showToast('Escolha uma nota!');return;}
  var txt=document.getElementById('review-txt').value.trim();
  if(!allReviews[prodId])allReviews[prodId]=[];
  // Remove previous review from this user
  allReviews[prodId]=allReviews[prodId].filter(function(r){return r.email!==curUser.email;});
  allReviews[prodId].unshift({email:curUser.email,nome:curUser.nome,rating:rating,txt:txt,date:new Date().toLocaleDateString('pt-BR')});
  await setCfg('rev_'+prodId,JSON.stringify(allReviews[prodId]));
  renderReviews(prodId);
  showToast('âœ… AvaliaÃ§Ã£o enviada!');
}
function renderStarPicker(prodId){
  var selected=0;
  var html='<div id="review-stars" style="display:flex;gap:4px;margin-bottom:8px">';
  for(var i=1;i<=5;i++){
    html+='<span data-v="'+i+'" onclick="pickStar(this,'+prodId+')" style="font-size:28px;cursor:pointer;color:#ddd;transition:.2s" class="star-pick">â˜…</span>';
  }
  html+='</div>';
  html+='<textarea id="review-txt" placeholder="ComentÃ¡rio (opcional)" rows="2" style="width:100%;padding:8px 12px;border-radius:10px;border:2px solid var(--pkp);font-family:Raleway,sans-serif;font-size:13px;color:var(--bk);background:var(--pkb);outline:none;resize:none;margin-bottom:8px"></textarea>';
  html+='<button onclick="submitReview('+prodId+')" style="background:linear-gradient(135deg,var(--pk),var(--pkd));color:#fff;border:none;padding:8px 20px;border-radius:50px;font-size:13px;font-weight:700;cursor:pointer;font-family:Raleway,sans-serif">Enviar AvaliaÃ§Ã£o</button>';
  return html;
}
function pickStar(el,prodId){
  var v=parseInt(el.dataset.v);
  document.querySelectorAll('#review-stars .star-pick').forEach(function(s,i){
    s.style.color=i<v?'#f59e0b':'#ddd';
    s.classList.toggle('star-sel',i===v-1);
    s.dataset.v=String(i+1);
  });
}
function renderReviews(prodId){
  var el=document.getElementById('pm-reviews');if(!el)return;
  var revs=allReviews[prodId]||[];
  var avg=revs.length?Math.round(revs.reduce(function(s,r){return s+r.rating;},0)/revs.length):0;
  var starsHtml=function(n){var h='';for(var i=1;i<=5;i++)h+='<span style="color:'+(i<=n?'#f59e0b':'#ddd')+'">â˜…</span>';return h;};
  var html='<div style="margin-bottom:10px"><strong style="font-size:14px">AvaliaÃ§Ãµes</strong>';
  if(revs.length)html+=' <span style="font-size:13px;color:var(--gr)">'+starsHtml(avg)+' ('+revs.length+')</span>';
  html+='</div>';
  if(revs.length){
    html+=revs.slice(0,5).map(function(r){
      return '<div style="background:var(--pkb);border-radius:10px;padding:10px 12px;margin-bottom:8px">'
        +'<div style="display:flex;justify-content:space-between;margin-bottom:4px">'
        +'<strong style="font-size:13px">'+r.nome+'</strong>'
        +'<span style="font-size:12px;color:#f59e0b">'+starsHtml(r.rating)+'</span></div>'
        +(r.txt?'<p style="font-size:12px;color:var(--gr);margin:0">'+r.txt+'</p>':'')
        +'<span style="font-size:10px;color:var(--gr)">'+r.date+'</span>'
        +'</div>';
    }).join('');
  } else html+='<p style="font-size:13px;color:var(--gr)">Nenhuma avaliaÃ§Ã£o ainda.</p>';
  html+='<div style="margin-top:12px;border-top:1px solid var(--pkp);padding-top:12px">';
  html+='<p style="font-size:13px;font-weight:700;margin-bottom:8px">Deixe sua avaliaÃ§Ã£o</p>';
  html+=renderStarPicker(prodId);
  html+='</div>';
  el.innerHTML=html;
}

// â•â• INIT â•â•

async function addCat(){
  const name=(document.getElementById('new-cat-name')||{}).value;
  const raw_key=(document.getElementById('new-cat-key')||{}).value;
  const n=(name||'').trim();
  const key=(raw_key||'').trim().toLowerCase().replace(/ /g,'-');
  if(!n||!key){showToast('Preencha nome e chave!');return;}
  if(homeCats.find(function(c){return c.key===key;})){showToast('Chave jÃ¡ existe!');return;}
  homeCats.push({key:key,label:n});
  await setCfg('homecats',JSON.stringify(homeCats));
  var mn=document.getElementById('new-cat-name');if(mn)mn.value='';
  var mk=document.getElementById('new-cat-key');if(mk)mk.value='';
  renderCatsEditList();renderHomeCats();renderProductCats();populateCatSelects();
  showToast('âœ… Categoria adicionada!');
}

(function(){
  var cnt=cart.reduce(function(s,x){return s+x.qty;},0);
  document.getElementById('cart-c').textContent=cnt;
  var c2=document.getElementById('cart-c2');if(c2)c2.textContent=cnt;
  document.getElementById('fav-n').textContent=favs.length;
  loadAll();
}());

function populateCatSelects(isAdult){
  var cats=isAdult?adultCats:homeCats;
  // pi-cats-wrap â€” always rebuild
  var piWrap=document.getElementById('pi-cats-wrap');
  if(piWrap){
    piWrap.innerHTML='';
    cats.filter(function(c){return c.key!=='all'&&c.key!=='all18';}).forEach(function(cat,i){
      var color=isAdult?'#7c3aed':catColors[i%catColors.length];
      var lbl=document.createElement('label');
      lbl.dataset.color=color;
      lbl.style.cssText='display:inline-flex;align-items:center;gap:5px;cursor:pointer;background:transparent;color:var(--gr);border:2px solid '+color+';padding:5px 12px;border-radius:50px;font-size:12px;font-weight:600;transition:.2s';
      lbl.id='pilbl-'+cat.key;
      var cb=document.createElement('input');
      cb.type='checkbox';cb.value=cat.key;cb.style.display='none';
      (function(l,adult){
        cb.onchange=function(){toggleCatChkEl(l);renderPiSubCats(adult);};
      })(lbl, isAdult);
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(cat.label));
      piWrap.appendChild(lbl);
    });
  }
  renderPiSubCats(isAdult);
  // ep-cats-wrap â€” always rebuild
  var epWrap=document.getElementById('ep-cats-wrap');
  if(epWrap){
    epWrap.innerHTML='';
    homeCats.filter(function(c){return c.key!=='all';}).forEach(function(cat,i){
      var color=catColors[i%catColors.length];
      var lbl=document.createElement('label');
      lbl.dataset.color=color;
      lbl.style.cssText='display:inline-flex;align-items:center;gap:5px;cursor:pointer;background:transparent;color:#fff;border:2px solid '+color+';padding:5px 12px;border-radius:50px;font-size:12px;font-weight:600;transition:.2s';
      lbl.id='eplbl-'+cat.key;
      var cb=document.createElement('input');
      cb.type='checkbox';cb.value=cat.key;cb.style.display='none';
      (function(l){cb.onchange=function(){toggleCatChkEl(l);};})(lbl);
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(cat.label));
      epWrap.appendChild(lbl);
    });
  }
  // sl-cat select
  var slCat=document.getElementById('sl-cat');
  if(slCat){
    var cur=slCat.value;
    slCat.innerHTML='';
    var d=document.createElement('option');d.value='';d.textContent='Ir para Produtos (padrÃ£o)';slCat.appendChild(d);
    var a=document.createElement('option');a.value='adult';a.textContent='ðŸ”ž Ãrea +18';slCat.appendChild(a);
    homeCats.filter(function(c){return c.key!=='all';}).forEach(function(cat){
      var o=document.createElement('option');o.value=cat.key;o.textContent=cat.label;slCat.appendChild(o);
    });
    if(cur)slCat.value=cur;
  }
}
function renderPiSubCats(isAdult){
  var wrap=document.getElementById('pi-subcats-wrap');if(!wrap)return;
  var checked=getCheckedCats('pi-cats-wrap');
  if(!checked.length){wrap.innerHTML='';wrap.style.display='none';return;}
  var map=isAdult?subAdultCats:subCats;var subs=[];
  checked.forEach(function(k){if(map[k])subs=subs.concat(map[k]);});
  if(!subs.length){wrap.innerHTML='';wrap.style.display='none';return;}
  wrap.style.display='flex';wrap.innerHTML='';
  subs.forEach(function(sub,i){
    var color=catColors[(i+3)%catColors.length];
    var lbl=document.createElement('label');lbl.dataset.color=color;
    lbl.style.cssText='display:inline-flex;align-items:center;gap:5px;cursor:pointer;background:transparent;color:var(--gr);border:2px solid '+color+';padding:4px 10px;border-radius:50px;font-size:11px;font-weight:600;transition:.2s';
    var cb=document.createElement('input');cb.type='checkbox';cb.value=sub.key;cb.style.display='none';
    cb.addEventListener('change',function(){toggleCatChkEl(lbl);});
    lbl.appendChild(cb);lbl.appendChild(document.createTextNode(sub.label));wrap.appendChild(lbl);
  });
}

// â•â• CATEGORIA HELPERS â•â•
function toggleCatChk(cb,color){const lbl=cb.parentElement;if(cb.checked){lbl.style.background=color;lbl.style.color='#fff';}else{lbl.style.background='transparent';lbl.style.color=lbl.closest('#ep-cats-wrap')?'#fff':'var(--gr)';}}

function getCheckedCats(wrapId){const wrap=document.getElementById(wrapId);if(!wrap)return[];return Array.from(wrap.querySelectorAll('input:checked')).map(cb=>cb.value);}

function setCatCheckboxes(wrapId,selected){
  const wrap=document.getElementById(wrapId);if(!wrap)return;
  wrap.querySelectorAll('input[type=checkbox]').forEach(cb=>{
    cb.checked=selected.includes(cb.value);
    toggleCatChk(cb,cb.parentElement.style.borderColor||catColors[0]);
  });
}

function toggleCatChkEl(lbl){
  var cb=lbl.querySelector('input');if(!cb)return;
  var color=lbl.dataset.color||'var(--pk)';
  var inDark=!!lbl.closest('#ep-cats-wrap');
  if(cb.checked){lbl.style.background=color;lbl.style.color='#fff';}
  else{lbl.style.background='transparent';lbl.style.color=inDark?'#fff':'var(--gr)';}
}
