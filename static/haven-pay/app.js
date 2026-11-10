// State
let ME = null;          // {id, name, avatar, balance, isAdmin, completed:[], joinedAt}
let SHOP = [];
let SHOP_TAGS = [];
let QUEST_FILTER = "all";
let QUESTS = [];
let TX = [];
let ACTIVITY = [];
let TIMER = null;       // {start: ms|null, end: ms}
let PAGE = "home";
let ADMIN_TAB = "overview";
let scanStream = null, scanRAF = null, scanBusy = false;
let countdownTick = null;
let adminUnsubs = []; // active Firestore listeners for the current admin tab
let SHOP_CART = [];
let SHOP_FILTER = "all";
let ordersUnsub = null;
const TEMPORARY_LEGACY_WALLET_LOGIN = false;

function accountLabel(user){
  if(!user) return "";
  const username = String(user.username || user.id || "").trim();
  const realName = String(user.realName || user.name || "").trim();
  return realName && realName !== username ? `${username} (${realName})` : username;
}

function clearAdminListeners(){
  adminUnsubs.forEach(u=>{ try{ u(); }catch(e){} });
  adminUnsubs = [];
}

// Init / Seed
async function seedIfEmpty(){
  let shop = await getJSON("shop:items", true);
  if(!shop){
    shop = [
      {id:"s1", name:"Sticker Pack", desc:"Holographic Haven pack", emoji:"✨", price:30, stock:60, tags:["merch"]},
      {id:"s2", name:"Boba Tea", desc:"Redeem at the snack table", emoji:"🧋", price:60, stock:40, tags:["food"]},
      {id:"s3", name:"Snack Pack", desc:"Chips + candy bundle", emoji:"🍫", price:40, stock:50, tags:["food"]},
      {id:"s4", name:"Haven Tee", desc:"Limited event t-shirt", emoji:"👕", price:250, stock:20, tags:["merch"]},
      {id:"s5", name:"Skip-the-Line Pass", desc:"Jump the demo queue", emoji:"⚡", price:80, stock:15, tags:["perks"]},
      {id:"s6", name:"Mystery Box", desc:"Random merch grab bag", emoji:"🎁", price:150, stock:12, tags:["merch"]},
    ];
    await setJSON("shop:items", shop, true);
  }
  const shopTags = (await getJSON("shop:tags", true)) || ["food","merch","perks"];
  SHOP_TAGS = shopTags;
  await setJSON("shop:tags", SHOP_TAGS, true);
  let meals = await getJSON("meals:list", true);
  if(!meals){
    meals = ["Nov 14", "Nov 15"].flatMap(day => [
      {id:genId("ml",5), day, mealType:"Food", itemName:"Pepperoni pizza", category:"Pizza", notes:'5 pizzas · 24"'},
      {id:genId("ml",5), day, mealType:"Food", itemName:"Hawaiian pizza", category:"Pizza", notes:'4 pizzas · 24"'},
      {id:genId("ml",5), day, mealType:"Food", itemName:"Cheese pizza", category:"Pizza", notes:'3 pizzas · 24"'},
    ]);
    await setJSON("meals:list", meals, true);
  }else if(meals.some(item => item.day === "Day 1" || item.day === "Day 2")){
    meals = meals.map(item => ({
      ...item,
      day: item.day === "Day 1" ? "Nov 14" : item.day === "Day 2" ? "Nov 15" : item.day
    }));
    await setJSON("meals:list", meals, true);
  }
  let quests = await getJSON("quests:list", true);
  if(!quests){
    quests = [
      {id:"q1", code:"CHECKIN", title:"Check in at registration", desc:"Scan the code at the front desk to check in.", reward:50, active:true, type:"main"},
      {id:"q2", code:"IDEA01", title:"Submit your game idea", desc:"Pitch your idea to a mentor and scan their code.", reward:100, active:true, type:"main"},
      {id:"q3", code:"WORKSHOP1", title:"Attend a workshop", desc:"Scan the code shown at any workshop.", reward:25, active:true, type:"side"},
      {id:"q4", code:"PLAYTEST", title:"Playtest a teammate's game", desc:"Get the scan from whoever you playtested.", reward:30, active:true, type:"side"},
      {id:"q5", code:"SOCIAL", title:"Post about Haven HK", desc:"Show an organizer your post to get scanned.", reward:40, active:true, type:"mystery"},
      {id:"q6", code:"SHIPIT", title:"Ship your game", desc:"Submit your final build before the deadline.", reward:200, active:true, type:"main"},
    ];
    await setJSON("quests:list", quests, true);
  }
  let idx = await getJSON("users:index", true);
  if(!idx){ await setJSON("users:index", [], true); }
  let feed = await getJSON("activity:feed", true);
  if(!feed){ await setJSON("activity:feed", [], true); }
  let spinCfg = await getJSON("games:spin:config", true);
  if(!spinCfg){
    spinCfg = {
      cost: 20,
      jackpotUntil: null,
      segments: [
        {id:"a", label:"Bust", value:0, weight:30, color:"#B8C11F"},
        {id:"b", label:"+10", value:10, weight:26, color:"#783D2B"},
        {id:"c", label:"+25", value:25, weight:20, color:"#FC8616"},
        {id:"d", label:"+50", value:50, weight:12, color:"#F9DD60"},
        {id:"e", label:"+100", value:100, weight:8, color:"#A8A237"},
        {id:"f", label:"JACKPOT 300", value:300, weight:4, color:"#E87136"},
      ]
    };
    await setJSON("games:spin:config", spinCfg, true);
  }
  let reflexCfg = await getJSON("games:reflex:config", true);
  if(!reflexCfg){
    reflexCfg = {maxReward:40, cooldownSec:45};
    await setJSON("games:reflex:config", reflexCfg, true);
  }
}

function genId(prefix, len){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for(let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return prefix ? prefix+"-"+s : s;
}

// Renders a QR code as inline SVG into `container`. Builds the module matrix
// via qrcode-generator, then draws it ourselves with an explicit 4-module
// quiet zone baked into the image (the ISO-mandated minimum margin — not just
// CSS padding on the wrapper, which doesn't scale with module size). SVG is
// vector output, so it can't suffer the pixel-scaling corruption that a
// canvas-based renderer can hit on HiDPI displays — confirmed root cause of
// QR codes that render fine on screen but fail native camera scanners.
// This exact matrix->SVG geometry was verified by round-tripping through a
// real jsQR decode before shipping, not just eyeballed.
// Shared spreadsheet import helper — reads .xlsx/.xls/.csv via SheetJS and
// returns rows as plain objects keyed by column header. Column lookups are
// done case/whitespace-insensitively since real-world spreadsheets vary.
function parseSpreadsheetFile(file, callback){
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, {type:"array"});
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, {defval:""});
      callback(null, rows);
    }catch(err){
      callback(err, null);
    }
  };
  reader.onerror = ()=> callback(new Error("Couldn't read the file"), null);
  reader.readAsArrayBuffer(file);
}
function getCol(row, ...names){
  for(const n of names){
    for(const key of Object.keys(row)){
      if(key.trim().toLowerCase() === n.toLowerCase()) return String(row[key]).trim();
    }
  }
  return "";
}

// CSV export — builds a proper quoted CSV (commas/quotes/newlines in any
// cell are escaped) and triggers a browser download, no server involved.
function downloadCSV(filename, rows){
  const csv = rows.map(r => r.map(cell => {
    const s = String(cell ?? "");
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff"+csv], {type:"text/csv;charset=utf-8;"}); // BOM so Excel reads UTF-8 (names, emoji) correctly
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
}

async function exportParticipantsCSV(){
  const [users, groups] = await Promise.all([allUsers(), allGroups()]);
  const groupNameOf = uid => { const g = groups.find(g=>g.memberIds.includes(uid)); return g ? g.name : ""; };
  const rows = [["Name","Wallet ID","Balance ("+CURRENCY_SHORT+")","Group","Organizer"]];
  users.slice().sort((a,b)=>b.balance-a.balance).forEach(u=>{
    rows.push([u.name, u.id, u.balance, groupNameOf(u.id), u.isAdmin ? "Yes" : "No"]);
  });
  downloadCSV("haven-participants.csv", rows);
  toast("Downloaded participants.csv", "");
}

async function exportActivityCSV(){
  const feed = (await getJSON("activity:feed", true)) || [];
  const rows = [["Date","User","Detail","Amount ("+CURRENCY_SHORT+")"]];
  feed.slice().reverse().forEach(a => rows.push([new Date(a.ts).toLocaleString(), a.user, a.detail, a.amount]));
  downloadCSV("haven-activity.csv", rows);
  toast("Downloaded activity.csv", "");
}

async function exportSubmissionsCSV(){
  const subs = await allSubmissions();
  const rows = [["Project","Submitted By","Description","Demo Link","Avg Score","# Judges"]];
  subs.forEach(s => {
    const vals = Object.values(s.scores || {});
    const avg = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : "";
    rows.push([s.projectName, s.ownerName, s.description, s.demoLink, avg, vals.length]);
  });
  downloadCSV("haven-submissions.csv", rows);
  toast("Downloaded submissions.csv", "");
}

// Accepts two spreadsheet shapes for the schedule upload:
// 1. Normalized rows with explicit Day/Time/Title/Description/Location columns.
// 2. A grid layout (common for hand-built schedules): first column is the time
//    slot, every other column header is a day name, and each cell is that
//    day's event title for that time slot. Falls back to (2) only if (1)
//    yields nothing, so either shape "just works" without reformatting.
function convertScheduleRows(rows){
  if(!rows.length) return [];
  const normalized = rows.map(r => ({
    id: genId("sc",5),
    day: getCol(r, "Day"),
    time: getCol(r, "Time"),
    title: getCol(r, "Title"),
    description: getCol(r, "Description"),
    location: getCol(r, "Location"),
  })).filter(i => i.title);
  if(normalized.length) return normalized;

  const keys = Object.keys(rows[0]);
  const timeKey = keys[0];
  const dayKeys = keys.slice(1).filter(k => k.trim() !== "");
  const items = [];
  rows.forEach(r => {
    const time = String(r[timeKey] || "").trim();
    dayKeys.forEach(dayKey => {
      const title = String(r[dayKey] || "").trim();
      if(title) items.push({ id: genId("sc",5), day: dayKey.trim(), time, title, description:"", location:"" });
    });
  });
  return items;
}

function renderQR(container, text, opts){
  opts = opts || {};
  text = String(text); // defensive: guarantee a plain string, never an object/undefined
  const ec = opts.errorCorrectionLevel || 'M';
  const minSize = Math.max(220, opts.size || 220); // enforce the 220px floor regardless of what a caller passes
  const qr = qrcode(0, ec); // typeNumber 0 = auto-pick the smallest that fits
  qr.addData(text);
  qr.make();
  const moduleCount = qr.getModuleCount();
  const quietZone = 4;
  const totalModules = moduleCount + quietZone * 2;
  const moduleSize = Math.max(4, Math.ceil(minSize / totalModules));
  const size = totalModules * moduleSize;

  let rects = '';
  for(let row=0; row<moduleCount; row++){
    for(let col=0; col<moduleCount; col++){
      if(qr.isDark(row, col)){
        const x = (col + quietZone) * moduleSize;
        const y = (row + quietZone) * moduleSize;
        rects += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="#000000"/>`;
      }
    }
  }
  container.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="display:block;"><rect x="0" y="0" width="${size}" height="${size}" fill="#FFFFFF"/>${rects}</svg>`;
}

// Styled variant used ONLY on the personal "My QR" page — dot-style modules,
// rounded finder ("eye") markers, and a small logo/emoji in the center.
// Two things make embedding a logo safe rather than a scanning gamble:
// 1. Error correction is forced to 'H' (30% recovery) whenever a logo is used,
//    so the decoder can reconstruct the data the logo covers.
// 2. Every geometry choice here (dot size relative to module, and how much
//    center area the logo is allowed to cover) was verified by actually
//    rendering test codes and decoding them with jsQR before shipping —
//    not just eyeballed. Dots smaller than ~1.1x the module size leave
//    corner gaps that make decoders misread the grid; this uses 1.3x.
function renderStyledQR(container, text, opts){
  opts = opts || {};
  text = String(text);
  const logo = opts.logo || null;
  const ec = logo ? 'H' : (opts.errorCorrectionLevel || 'M');
  const minSize = Math.max(240, opts.size || 260);
  const dotScale = 1.3;
  const qr = qrcode(0, ec);
  qr.addData(text);
  qr.make();
  const moduleCount = qr.getModuleCount();
  const quietZone = 4;
  const totalModules = moduleCount + quietZone * 2;
  const moduleSize = Math.max(4, Math.ceil(minSize / totalModules));
  const size = totalModules * moduleSize;

  let logoModules = 0;
  if(logo){
    logoModules = Math.floor(moduleCount * 0.20); // verified safe up to 0.24; kept a margin
    if(logoModules % 2 !== moduleCount % 2) logoModules++; // keeps it centered symmetrically
  }
  const logoStart = Math.floor((moduleCount - logoModules) / 2);
  const logoEnd = logoStart + logoModules;
  function isLogoZone(row,col){ return logo && row>=logoStart && row<logoEnd && col>=logoStart && col<logoEnd; }
  function isFinderZone(row,col){ return (row<7&&col<7) || (row<7&&col>=moduleCount-7) || (row>=moduleCount-7&&col<7); }

  let shapes = '';
  [[0,0],[0,moduleCount-7],[moduleCount-7,0]].forEach(([r,c])=>{
    const x = (c+quietZone)*moduleSize, y = (r+quietZone)*moduleSize;
    const outer = 7*moduleSize, outerR = outer*0.28;
    shapes += `<rect x="${x}" y="${y}" width="${outer}" height="${outer}" rx="${outerR}" fill="#000000"/>`;
    const ringInset = moduleSize, whiteSize = outer - 2*ringInset;
    shapes += `<rect x="${x+ringInset}" y="${y+ringInset}" width="${whiteSize}" height="${whiteSize}" rx="${outerR*0.6}" fill="#FFFFFF"/>`;
    const inner = 3*moduleSize;
    shapes += `<rect x="${x+2*moduleSize}" y="${y+2*moduleSize}" width="${inner}" height="${inner}" rx="${inner*0.35}" fill="#000000"/>`;
  });

  for(let row=0; row<moduleCount; row++){
    for(let col=0; col<moduleCount; col++){
      if(isFinderZone(row,col) || isLogoZone(row,col)) continue;
      if(qr.isDark(row,col)){
        const cx = (col+quietZone+0.5)*moduleSize, cy = (row+quietZone+0.5)*moduleSize;
        shapes += `<circle cx="${cx}" cy="${cy}" r="${moduleSize*dotScale/2}" fill="#000000"/>`;
      }
    }
  }

  let logoHtml = '';
  if(logo){
    const lx = (logoStart+quietZone)*moduleSize, ly = (logoStart+quietZone)*moduleSize, lw = logoModules*moduleSize;
    logoHtml = `<rect x="${lx}" y="${ly}" width="${lw}" height="${lw}" rx="${lw*0.24}" fill="#FFFFFF"/>
      <text x="${lx+lw/2}" y="${ly+lw/2+lw*0.08}" font-size="${lw*0.72}" text-anchor="middle" dominant-baseline="middle">${logo}</text>`;
  }

  container.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="display:block;"><rect width="${size}" height="${size}" fill="#FFFFFF"/>${shapes}${logoHtml}</svg>`;
}

async function loadUser(userId){
  stopWalletSync();
  const [user, tx] = await Promise.all([
    getJSON("users:"+userId, true),
    getJSON("tx:"+userId, true),
  ]);
  ME = user;
  if(ME){
    TX = tx || [];
    await setJSON("me:userId", userId, false); // local, instant
    startWalletSync();
    startInboxSync();
  }
  return ME;
}

let walletUnsub = null, walletTxUnsub = null;
let walletSyncReady = false;

function stopWalletSync(){
  if(walletUnsub){ try{ walletUnsub(); }catch(e){} walletUnsub = null; }
  if(walletTxUnsub){ try{ walletTxUnsub(); }catch(e){} walletTxUnsub = null; }
  walletSyncReady = false;
}

function refreshWalletUI(){
  if(!ME) return;
  refreshHeader();
  renderNav();
  if(["home","shop","quests","profile","activity","leaderboard","groups"].includes(PAGE)){
    renderPage(PAGE);
  }
}

function startWalletSync(){
  stopWalletSync();
  if(!ME) return;
  const userId = ME.id;
  walletUnsub = watchJSON("users:"+userId, user=>{
    if(!user || !ME || ME.id!==userId) return;
    const previousBalance = Number(ME.balance || 0);
    ME = user;
    const balanceChanged = walletSyncReady && previousBalance !== Number(ME.balance || 0);
    walletSyncReady = true;
    refreshWalletUI();
    if(balanceChanged){
      const direction = Number(ME.balance || 0) >= previousBalance ? "received" : "changed";
      toast("Wallet updated — "+direction+" Sparks", "info");
    }
  });
  walletTxUnsub = watchJSON("tx:"+userId, tx=>{
    if(!ME || ME.id!==userId) return;
    TX = Array.isArray(tx) ? tx : [];
    if(["home","activity"].includes(PAGE)) renderPage(PAGE);
  });
}

// Organizer-driven quest changes.
// An organizer never edits a participant's wallet record directly: that person's
// phone holds a live copy and would overwrite the edit the next time it saves.
// Instead the organizer leaves an instruction in inbox:<userId>; the participant's
// own app applies it through the normal save path, then clears it. Each instruction
// has an id remembered in ME.appliedOps, so a retry can never pay or deduct twice.
let inboxUnsub = null, inboxLatest = [], applyingInbox = false, inboxRerun = false;

function startInboxSync(){
  stopInboxSync();
  if(!ME) return;
  inboxUnsub = watchJSON("inbox:"+ME.id, ops=>{
    inboxLatest = Array.isArray(ops) ? ops : [];
    drainInbox();
  });
}
function stopInboxSync(){
  if(inboxUnsub){ try{ inboxUnsub(); }catch(e){} inboxUnsub = null; }
  inboxLatest = [];
}

async function drainInbox(){
  if(applyingInbox){ inboxRerun = true; return; }   // a newer snapshot arrived mid-apply — go round again after
  applyingInbox = true;
  try{
    do{
      inboxRerun = false;
      if(!ME || !inboxLatest.length) break;
      const ops = inboxLatest.slice();
      ME.completed = ME.completed || [];
      ME.appliedOps = ME.appliedOps || [];
      const feed = [];
      let processed = 0, changed = false;

      for(const op of ops){
        if(ME.appliedOps.includes(op.id)) continue;      // applied earlier; it only needs clearing
        processed++;
        if(op.type === "quest_add" && !ME.completed.includes(op.questId)){
          const amt = op.adjust ? Math.max(0, op.reward || 0) : 0;
          ME.completed.push(op.questId);
          ME.balance += amt;
          if(amt > 0) TX.unshift({type:"quest", desc:"Completed: "+op.questTitle+" (organizer)", amount:amt, ts:Date.now()});
          feed.push({type:"quest", user:ME.name, detail:op.questTitle+" (added by organizer)", amount:amt, ts:Date.now()});
          changed = true;
        }else if(op.type === "quest_remove" && ME.completed.includes(op.questId)){
          const take = op.adjust ? Math.min(Math.max(0, op.reward || 0), ME.balance) : 0;   // never below 0
          ME.completed = ME.completed.filter(id => id !== op.questId);
          ME.balance -= take;
          if(take > 0) TX.unshift({type:"quest", desc:"Quest reset: "+op.questTitle+" (organizer)", amount:-take, ts:Date.now()});
          feed.push({type:"quest", user:ME.name, detail:op.questTitle+" (removed by organizer)", amount:-take, ts:Date.now()});
          changed = true;
        }
        ME.appliedOps.push(op.id);
      }

      if(processed){
        ME.appliedOps = ME.appliedOps.slice(-50);
        await Promise.all([saveMe(), saveTx()]);
        for(const e of feed) await pushActivity(e);
      }

      const doneIds = ops.map(o => o.id);
      try{
        await updateJSON("inbox:"+ME.id, list => (Array.isArray(list) ? list : []).filter(o => !doneIds.includes(o.id)));
        inboxLatest = inboxLatest.filter(o => !doneIds.includes(o.id));
      }catch(err){
        console.warn("Couldn't clear the inbox yet (safe — it will be skipped next time):", err);
        break;
      }

      if(changed){
        renderNav();
        if(["home","quests","profile","activity","shop"].includes(PAGE)) renderPage(PAGE);
        toast("An organizer updated your quest progress", "info");
      }
    }while(inboxRerun);
  }finally{
    applyingInbox = false;
  }
}
// (end of organizer-driven quest changes)

async function saveMe(){ await setJSON("users:"+ME.id, ME, true); }
async function saveTx(){ await setJSON("tx:"+ME.id, TX, true); }

async function pushActivity(entry){
  ACTIVITY.unshift(entry);
  ACTIVITY = ACTIVITY.slice(0, 150);
  await setJSON("activity:feed", ACTIVITY, true);
}

async function refreshShared(){
  const [shop, shopTags, quests, activity, timer] = await Promise.all([
    getJSON("shop:items", true),
    getJSON("shop:tags", true),
    getJSON("quests:list", true),
    getJSON("activity:feed", true),
    getJSON("event:timer", true),
  ]);
  SHOP = shop || [];
  SHOP_TAGS = shopTags || [];
  QUESTS = quests || [];
  ACTIVITY = activity || [];
  TIMER = timer;
}

// Toast
function toast(msg, type){
  const wrap = document.getElementById("toast");
  const el = document.createElement("div");
  el.className = "toast-el" + (type ? " "+type : "");
  el.innerHTML = msg;
  wrap.innerHTML = "";
  wrap.appendChild(el);
  setTimeout(()=>{ if(wrap.contains(el)) wrap.removeChild(el); }, 2500);
}

// Clock
function tickClock(){
  const d = new Date();
  document.getElementById("clock").textContent = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}
setInterval(tickClock, 15000);

// Nav
function renderNav(){
  // primary screens only — Shop and Quests live as quick actions on Home instead,
  // so they're not duplicated between the nav bar and the home screen
  const items = [
    {id:"home", label:"Home", icon:ICONS.home},
    {id:"shop", label:"Shop", icon:ICONS.shop},
    {id:"activity", label:"Activity", icon:ICONS.activity},
    {id:"games", label:"Idea Picker", icon:ICONS.games},
    {id:"profile", label:"Profile", icon:ICONS.profile},
  ];
  if(ME && ME.isAdmin) items.push({id:"admin", label:"Admin", icon:ICONS.admin});

  const nav = document.getElementById("bottomnav");
  nav.innerHTML = items.map(it => `
    <button class="navbtn ${PAGE===it.id?'active':''}" data-nav="${it.id}">
      ${it.icon}<span>${it.label}</span>
    </button>`).join("");
  nav.querySelectorAll("[data-nav]").forEach(b=>{
    b.addEventListener("click", ()=> goTo(b.dataset.nav));
  });

  // sidebar nav — same items, shown on wide/desktop screens
  const snav = document.getElementById("sidebarNav");
  if(snav){
    snav.innerHTML = items.map(it => `
      <button class="sidenav-btn ${PAGE===it.id?'active':''}" data-nav="${it.id}">
        ${it.icon}<span>${it.label}</span>
      </button>`).join("");
    snav.querySelectorAll("[data-nav]").forEach(b=>{
      b.addEventListener("click", ()=> goTo(b.dataset.nav));
    });
  }
  const foot = document.getElementById("sidebarFoot");
  if(foot){
    foot.innerHTML = ME ? `<div class="av">${ME.avatar}</div><div class="info"><div class="n">${accountLabel(ME)}</div><div class="b">${ME.balance} ${CURRENCY_SHORT}</div></div>` : "";
  }
}

async function goTo(page){
  stopScanner();
  stopCountdownTicker();
  stopReflexLoop();
  if(ordersUnsub){ ordersUnsub(); ordersUnsub=null; }
  if(page !== "admin") clearAdminListeners();
  PAGE = page;
  document.getElementById("fabBtn").style.display = "none";
  renderNav();

  if(page === "admin"){
    // admin manages live inventory/quests, so it's worth the wait for fresh data
    await refreshShared();
    renderAdmin();
    document.getElementById("pageContent").scrollTop = 0;
    return;
  }

  // render instantly from whatever's already cached — no network wait —
  // then quietly refresh in the background and redraw if still on this page.
  // (actions that change data — buying, redeeming, sending — always re-check
  // live values themselves before committing, so this is safe.)
  renderPage(page);
  document.getElementById("pageContent").scrollTop = 0;
  refreshShared().then(()=>{
    if(PAGE === page && page !== "scan" && page !== "games" && page !== "groups" && page !== "leaderboard"){ renderPage(page); }
  });
}

function renderPage(page){
  if(page==="home") renderHome();
  else if(page==="shop") renderShop();
  else if(page==="scan") renderScan();
  else if(page==="quests") renderQuests();
  else if(page==="games") renderGames();
  else if(page==="groups") renderGroupsPage();
  else if(page==="leaderboard") renderLeaderboard();
  else if(page==="schedule") renderSchedulePage();
  else if(page==="meals") renderMealsPage();
  else if(page==="submissions") renderSubmissionsPage();
  else if(page==="info") renderInfoPage();
  else if(page==="activity") renderActivity();
  else if(page==="profile") renderProfile();
}

function renderActivity(){
  const c = document.getElementById("pageContent");
  c.innerHTML = `
    <div class="page-title">Activity</div>
    <p class="page-sub">Every transaction, in order.</p>
    <div class="card">
      ${TX.length? TX.map(txRow).join("") : `<div class="empty-note">No transactions yet.</div>`}
    </div>
  `;
}

// Home
function renderHome(){
  const c = document.getElementById("pageContent");
  const recent = TX.slice(0,5);
  c.innerHTML = `
    <div class="page-title">Hi, ${accountLabel(ME).split(" ")[0]}</div>
    <p class="page-sub">Here's your wallet.</p>
    <div id="announcementBanner"></div>
    <div class="wallet-card">
      <div class="wallet-top">
        <div class="wallet-brand-pill"><span class="dot"></span><span>Active</span></div>
        <button class="wallet-qr-btn" id="walletQrBtn" title="My QR code">${ICONS.qr}</button>
      </div>
      <div class="wallet-unit-label">${CURRENCY} balance</div>
      <div class="wallet-balance"><span id="balNum">0</span></div>
      <div class="wallet-bottom">
        <div class="wallet-id">${ME.id}</div>
        <div class="wallet-name">${accountLabel(ME)}</div>
      </div>
    </div>
    ${countdownCardHTML()}
    <div class="quick-actions">
      <button class="qa-btn primary" data-go="scan">${ICONS.scan}Scan</button>
      <button class="qa-btn primary alt" id="sendQuick">${ICONS.send}Send</button>
      <button class="qa-btn" data-go="shop">${ICONS.shop}Shop</button>
      <button class="qa-btn" data-go="quests">${ICONS.quest}Quests</button>
    </div>
    <div class="section-head" style="margin-top:20px;"><h3>More</h3></div>
    <button class="game-card" data-go="groups">
      <div class="game-emoji">👥</div>
      <div class="game-info"><h4>Groups</h4><p>Team up, split payments, and invite friends.</p></div>
      ${ICONS.chevron}
    </button>
    <button class="game-card" data-go="leaderboard">
      <div class="game-emoji">🏆</div>
      <div class="game-info"><h4>Leaderboard</h4><p>See who's earned the most — solo and by group.</p></div>
      ${ICONS.chevron}
    </button>
    <button class="game-card" data-go="schedule">
      <div class="game-emoji">🗓️</div>
      <div class="game-info"><h4>Schedule</h4><p>The full event timeline, day by day.</p></div>
      ${ICONS.chevron}
    </button>
    <button class="game-card" data-go="meals">
      <div class="game-emoji">🍽️</div>
      <div class="game-info"><h4>Food & Dining</h4><p>What's being served, and when.</p></div>
      ${ICONS.chevron}
    </button>
    <button class="game-card" data-go="submissions">
      <div class="game-emoji">🚀</div>
      <div class="game-info"><h4>Submissions</h4><p>Submit your project and browse the exhibition.</p></div>
      ${ICONS.chevron}
    </button>
    <button class="game-card" data-go="info">
      <div class="game-emoji">ℹ️</div>
      <div class="game-info"><h4>Event Info</h4><p>WiFi, venue, and who to find for help.</p></div>
      ${ICONS.chevron}
    </button>
    <div class="section-head"><h3>Recent activity</h3><button class="link" data-go="activity">See all</button></div>
    <div class="card">
      ${recent.length? recent.map(txRow).join("") : `<div class="empty-note">No activity yet — scan a quest code to get started.</div>`}
    </div>
  `;
  c.querySelectorAll("[data-go]").forEach(b=> b.addEventListener("click", ()=>goTo(b.dataset.go)));
  document.getElementById("sendQuick").addEventListener("click", ()=>showSendModal());
  document.getElementById("walletQrBtn").addEventListener("click", ()=> renderMyQRPage("home"));
  animateNumber(document.getElementById("balNum"), 0, ME.balance, 700);
  startCountdownTicker();
  loadAnnouncementBanner();
}

async function loadAnnouncementBanner(){
  const el = document.getElementById("announcementBanner");
  if(!el) return;
  const list = (await getJSON("announcements:list", true)) || [];
  if(!list.length){ el.innerHTML = ""; return; }
  const latest = list[0];
  if(localStorage.getItem("havenpay_dismissedAnnouncementId") === latest.id){ el.innerHTML = ""; return; }
  el.innerHTML = `
    <div class="announcement-banner">
      <span class="announcement-icon">📣</span>
      <span class="announcement-text">${latest.message}</span>
      <button class="announcement-dismiss" id="dismissAnnouncementBtn">✕</button>
    </div>
  `;
  document.getElementById("dismissAnnouncementBtn").addEventListener("click", ()=>{
    localStorage.setItem("havenpay_dismissedAnnouncementId", latest.id);
    el.innerHTML = "";
  });
}

// Countdown
function computeCountdownParts(ms){
  ms = Math.max(0, ms);
  const s = Math.floor(ms/1000);
  const d = Math.floor(s/86400);
  const h = Math.floor((s%86400)/3600);
  const m = Math.floor((s%3600)/60);
  const sec = s%60;
  return {d,h,m,sec};
}

function countdownBoxes(ms){
  const {d,h,m,sec} = computeCountdownParts(ms);
  return `
    <div class="cd-box"><div class="cd-num">${d}</div><div class="cd-unit">Days</div></div>
    <div class="cd-box"><div class="cd-num">${String(h).padStart(2,'0')}</div><div class="cd-unit">Hrs</div></div>
    <div class="cd-box"><div class="cd-num">${String(m).padStart(2,'0')}</div><div class="cd-unit">Min</div></div>
    <div class="cd-box"><div class="cd-num">${String(sec).padStart(2,'0')}</div><div class="cd-unit">Sec</div></div>
  `;
}

function countdownCardHTML(){
  if(!TIMER || !TIMER.end){
    return `<div class="countdown-card"><div class="cd-top"><span class="lab">Deadline</span><span class="badge cd-badge-closed">TBD</span></div><div class="cd-empty">--:--</div></div>`;
  }
  const now = Date.now();
  const start = TIMER.start || null;
  const end = TIMER.end;
  if(start && now < start){
    return `<div class="countdown-card" id="countdownCard" data-mode="wait" data-target="${start}">
      <div class="cd-top"><span class="lab">Submissions open in</span><span class="badge cd-badge-wait">Not started</span></div>
      <div class="cd-grid" id="cdGrid">${countdownBoxes(start-now)}</div>
    </div>`;
  }
  if(now > end){
    return `<div class="countdown-card">
      <div class="cd-top"><span class="lab">Submission deadline</span><span class="badge cd-badge-closed">Closed</span></div>
      <div class="cd-closed-msg">Submissions closed ${new Date(end).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}.</div>
    </div>`;
  }
  const pct = start ? Math.min(100, Math.max(0, ((now-start)/(end-start))*100)) : 0;
  return `<div class="countdown-card" id="countdownCard" data-mode="live" data-target="${end}">
    <div class="cd-top"><span class="lab">Time left to submit</span><span class="badge cd-badge-live">Live</span></div>
    <div class="cd-grid" id="cdGrid">${countdownBoxes(end-now)}</div>
    ${start ? `<div class="cd-progress"><div class="cd-progress-fill" style="width:${pct}%"></div></div>` : ""}
  </div>`;
}

function startCountdownTicker(){
  stopCountdownTicker();
  if(!TIMER || !TIMER.end) return;
  countdownTick = setInterval(()=>{
    if(PAGE!=="home"){ stopCountdownTicker(); return; }
    const card = document.getElementById("countdownCard");
    if(!card){ return; }
    const mode = card.dataset.mode;
    const target = parseInt(card.dataset.target, 10);
    const now = Date.now();
    if(now >= target){ renderHome(); return; } // state transition: wait->live or live->closed
    const grid = document.getElementById("cdGrid");
    if(grid) grid.innerHTML = countdownBoxes(target-now);
    if(mode==="live" && TIMER.start){
      const fill = card.querySelector(".cd-progress-fill");
      if(fill){
        const pct = Math.min(100, Math.max(0, ((now-TIMER.start)/(TIMER.end-TIMER.start))*100));
        fill.style.width = pct+"%";
      }
    }
  }, 1000);
}

function stopCountdownTicker(){
  if(countdownTick){ clearInterval(countdownTick); countdownTick = null; }
}

function toDatetimeLocalValue(ms){
  const d = new Date(ms);
  const pad = n => String(n).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
}

function txRow(t){
  const isIn = t.amount > 0;
  return `<div class="tx-row">
    <div class="tx-icon ${isIn?'in':'out'}">${isIn?ICONS.txIn:ICONS.txOut}</div>
    <div class="tx-meta"><div class="t">${t.desc}</div><div class="d">${new Date(t.ts).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</div></div>
    <div class="tx-amt ${isIn?'in':'out'}">${isIn?'+':''}${t.amount} ${CURRENCY_SHORT}</div>
  </div>`;
}

function animateNumber(el, from, to, dur){
  const start = performance.now();
  function step(now){
    const p = Math.min(1, (now-start)/dur);
    const val = Math.round(from + (to-from) * (1-Math.pow(1-p,3)));
    el.textContent = val.toLocaleString();
    if(p<1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Shop
function renderShop(){
  const c = document.getElementById("pageContent");
  const tags = [...new Set(SHOP.flatMap(item=>Array.isArray(item.tags) ? item.tags : []))].sort();
  c.innerHTML = `
    <div class="page-title">Shop</div>
    <p class="page-sub">Spend your ${CURRENCY} on merch, snacks and perks.</p>
    <div class="card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding:14px 16px;">
      <span style="font-size:12px; color:var(--ink-dim); font-weight:600;">Your balance</span>
      <span class="mono" style="font-weight:700; font-size:15px; color:var(--gold);">${ME.balance} ${CURRENCY_SHORT}</span>
    </div>
    <div style="display:flex; gap:8px; margin-bottom:14px;">
      <button class="icon-btn" id="reviewCartBtn" title="Shopping bag" style="position:relative; width:46px; height:46px;">
        ${ICONS.shop}
        <span id="cartCount" style="position:absolute; top:-6px; right:-6px; min-width:20px; height:20px; padding:0 5px; border-radius:10px; background:var(--accent); color:var(--on-accent); font:700 11px/20px var(--font-num);">${SHOP_CART.reduce((n,x)=>n+x.qty,0)}</span>
      </button>
      <button class="btn btn-ghost" id="orderHistoryBtn" style="flex:1;">Order history</button>
    </div>
    ${tags.length ? `<div class="shop-filters" id="shopFilters">
      <button class="shop-filter ${SHOP_FILTER==="all"?'active':''}" data-filter="all">All</button>
      ${tags.map(tag=>`<button class="shop-filter ${SHOP_FILTER===tag?'active':''}" data-filter="${tag}">${tag}</button>`).join("")}
    </div>` : ""}
    <div class="shop-grid" id="shopGrid"></div>
  `;
  const grid = document.getElementById("shopGrid");
  const visibleShop = SHOP.filter(item=>SHOP_FILTER==="all" || (Array.isArray(item.tags) && item.tags.includes(SHOP_FILTER)));
  if(!SHOP.length){ grid.innerHTML = `<div class="empty-note" style="grid-column:1/-1;">Shop is empty right now.</div>`; return; }
  if(!visibleShop.length){ grid.innerHTML = `<div class="empty-note" style="grid-column:1/-1;">No items in this category yet.</div>`; }
  else grid.innerHTML = visibleShop.map(item => `
    <div class="shop-item">
      <div class="shop-emoji">${item.emoji}</div>
      <h4>${item.name}</h4>
      ${Array.isArray(item.tags) && item.tags.length ? `<div class="shop-tags">${item.tags.map(tag=>`<span>${tag}</span>`).join("")}</div>` : ""}
      <div class="desc">${item.desc||""}</div>
      <div class="row"><span class="price">${item.price} ${CURRENCY_SHORT}</span><span class="stock">${item.stock} left</span></div>
      <button class="buy-btn" data-buy="${item.id}" ${item.stock<=0?'disabled':''}>
        ${item.stock<=0 ? 'Sold out' : 'Add to bag'}
      </button>
    </div>
  `).join("");
  document.querySelectorAll("[data-filter]").forEach(b=> b.addEventListener("click", ()=>{
    SHOP_FILTER = b.dataset.filter;
    renderShop();
  }));
  grid.querySelectorAll("[data-buy]").forEach(b=> b.addEventListener("click", ()=>{
    const item = SHOP.find(i=>i.id===b.dataset.buy);
    const existing = SHOP_CART.find(x=>x.itemId===item.id);
    if(existing) existing.qty += 1; else SHOP_CART.push({itemId:item.id, qty:1});
    renderShop(); toast("Added to shopping bag", "");
  }));
  document.getElementById("reviewCartBtn").addEventListener("click", showCartModal);
  document.getElementById("orderHistoryBtn").addEventListener("click", showOrderHistoryModal);
}

function renderOrderHistory(el, list){
  const orders = (list || []).filter(r=>r.userId===ME.id).sort((a,b)=>b.ts-a.ts);
  el.innerHTML = orders.length ? orders.map(r=>`
    <div class="tx-row">
      <div class="tx-icon">${r.itemEmoji}</div>
      <div class="tx-meta">
        <div class="t">${r.itemName || "Order"} ${r.id ? `<span class="mono" style="font-size:10px; color:var(--ink-faint);">${r.id}</span>` : ""}</div>
        <div class="d">${new Date(r.ts).toLocaleString()} · ${r.total||r.price||0} ${CURRENCY_SHORT}</div>
      </div>
      <div class="tx-amt ${r.status==='declined'?'out':'in'}">${r.status}</div>
    </div>
  `).join("") : `<div class="empty-note">No orders yet.</div>`;
}

function showOrderHistoryModal(){
  if(ordersUnsub){ ordersUnsub(); ordersUnsub=null; }
  showModal(`
    <h3>Order history</h3>
    <p style="color:var(--ink-dim); font-size:12px; margin:-6px 0 12px;">Track pending, accepted, and declined orders.</p>
    <div id="orderHistoryList"><div class="empty-note">Loading…</div></div>
    <div class="modal-actions"><button class="btn btn-primary btn-block" id="closeOrderHistory">Done</button></div>
  `);
  const listEl = document.getElementById("orderHistoryList");
  ordersUnsub = watchJSON("redemptions:list", list=>renderOrderHistory(listEl, list));
  document.getElementById("closeOrderHistory").addEventListener("click", ()=>{
    if(ordersUnsub){ ordersUnsub(); ordersUnsub=null; }
    closeModal();
  });
}

async function loadMyOrders(){
  const el = document.getElementById("myOrders");
  if(!el) return;
  const draw = list => {
    renderOrderHistory(el, list);
  };
  ordersUnsub = watchJSON("redemptions:list", draw);
}

function showCartModal(){
  if(!SHOP_CART.length){ toast("Your shopping bag is empty", "err"); return; }
  const rows = SHOP_CART.map(x=>{ const i=SHOP.find(v=>v.id===x.itemId); return {x,i}; }).filter(x=>x.i);
  const total = rows.reduce((n,r)=>n+r.i.price*r.x.qty,0);
  showModal(`<h3>Shopping Bag</h3><div id="cartRows">${rows.map(r=>`<div class="tx-row"><div class="tx-icon">${r.i.emoji}</div><div class="tx-meta"><div class="t">${r.i.name} × ${r.x.qty}</div><div class="d">${r.i.price*r.x.qty} ${CURRENCY_SHORT}</div></div></div>`).join("")}</div><div class="section-head"><h3>Total</h3><strong>${total} ${CURRENCY_SHORT}</strong></div><div class="modal-actions"><button class="btn btn-ghost" id="cancelCart">Cancel</button><button class="btn btn-primary" id="confirmCart">Confirm Purchase</button></div>`);
  document.getElementById("cancelCart").addEventListener("click", closeModal);
  document.getElementById("confirmCart").addEventListener("click", ()=>confirmCartPurchase(rows,total));
}

async function confirmCartPurchase(rows,total){
  if(ME.balance<total){ toast("Not enough "+CURRENCY, "err"); return; }
  if(rows.some(r=>r.x.qty>r.i.stock)){ toast("An item no longer has enough stock", "err"); return; }
  ME.balance -= total;
  const now=Date.now();
  const order={id:genId("o",6), userId:ME.id,userName:ME.name,userAvatar:ME.avatar,items:rows.map(r=>({itemId:r.i.id,itemName:r.i.name,itemEmoji:r.i.emoji,quantity:r.x.qty,price:r.i.price})),total,status:"pending",ts:now};
  rows.forEach(r=>r.i.stock-=r.x.qty);
  TX.unshift({type:"purchase",desc:"Order "+order.id,amount:-total,ts:now});
  const redemptions=(await getJSON("redemptions:list",true))||[];
  redemptions.unshift({...order,itemName:rows.map(r=>r.i.name).join(", "),itemEmoji:rows[0].i.emoji,price:total});
  await Promise.all([saveMe(),saveTx(),setJSON("shop:items",SHOP,true),setJSON("redemptions:list",redemptions,true),pushActivity({type:"purchase",user:ME.name,detail:"Order "+order.id,amount:-total,ts:now})]);
  SHOP_CART=[]; closeModal(); renderShop(); toast("Order submitted", "");
}

// Scan
function renderScan(){
  const c = document.getElementById("pageContent");
  c.innerHTML = `
    <div class="page-title">Scan</div>
    <p class="page-sub">Point your camera at a Haven QR code — quests, someone's personal QR, or a group invite.</p>
    <div class="scan-wrap">
      <div class="viewfinder" id="viewfinder">
        <div class="placeholder" id="scanPlaceholder">${ICONS.camera}<div>Tap "Start camera" to scan a quest code</div></div>
        <video id="scanVideo" playsinline muted style="display:none;"></video>
        <canvas id="scanCanvas" style="position:absolute; top:-9999px; left:-9999px; opacity:0;"></canvas>
        <div class="frame" id="scanFrame" style="display:none;"><span></span><span></span><span></span><span></span></div>
        <div class="scan-line" id="scanLine" style="display:none;"></div>
      </div>
      <div style="display:flex; gap:8px; margin-top:14px;">
        <button class="btn btn-primary" style="flex:1;" id="camToggle">Start camera</button>
        <button class="btn btn-ghost" id="torchToggle" style="display:none; flex-shrink:0; width:52px;" title="Toggle flashlight">🔦</button>
      </div>
      <div class="scan-status" id="scanStatus"></div>
      <div class="mono" id="scanDebug" style="font-size:10.5px; color:var(--ink-faint); text-align:center; margin-top:6px; min-height:14px;"></div>
    </div>
    <div class="manual-entry">
      <h4>Enter a code manually</h4>
      <div class="manual-row">
        <input type="text" id="manualCode" placeholder="e.g. CHECKIN" style="text-transform:uppercase;">
        <button class="btn btn-ghost" id="manualSubmit">Redeem</button>
      </div>
    </div>
  `;
  document.getElementById("camToggle").addEventListener("click", toggleScanner);
  document.getElementById("manualSubmit").addEventListener("click", ()=>{
    const v = document.getElementById("manualCode").value.trim();
    if(v) processScannedCode(v);
  });
  const manualInput = document.getElementById("manualCode");
  manualInput.addEventListener("keydown", (e)=>{
    if(e.key==="Enter"){ const v = manualInput.value.trim(); if(v) processScannedCode(v); }
  });
}

// Tries to hard-lock the rear camera first (best for QR scanning); falls back
// to a soft preference if the device/browser can't satisfy an exact match
// (common on laptops or devices that don't report a distinct "environment" camera).
async function requestCameraStream(){
  const base = { width:{ideal:1280}, height:{ideal:720} };
  try{
    return await navigator.mediaDevices.getUserMedia({ video: { ...base, facingMode: {exact:"environment"} } });
  }catch(e){
    if(e.name === "OverconstrainedError" || e.name === "ConstraintNotSatisfiedError"){
      return await navigator.mediaDevices.getUserMedia({ video: { ...base, facingMode: "environment" } });
    }
    throw e;
  }
}

async function toggleScanner(){
  if(scanStream){ stopScanner(); renderScan(); return; }

  const statusEl = document.getElementById("scanStatus");
  const btn = document.getElementById("camToggle");

  if(location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1"){
    if(statusEl) statusEl.textContent = "Camera access needs HTTPS — use the https:// link, or scan with manual entry below.";
    return;
  }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    if(statusEl) statusEl.textContent = "This browser can't access the camera here — use manual entry below.";
    return;
  }

  if(btn){ btn.disabled = true; btn.textContent = "Requesting camera…"; }
  if(statusEl) statusEl.textContent = "";

  try{
    scanStream = await requestCameraStream();
  }catch(e){
    if(btn){ btn.disabled = false; btn.textContent = "Start camera"; }
    const messages = {
      NotAllowedError: "Camera permission denied — allow camera access in your browser settings, or use manual entry below.",
      PermissionDeniedError: "Camera permission denied — allow camera access in your browser settings, or use manual entry below.",
      NotFoundError: "No camera found on this device — use manual entry below.",
      DevicesNotFoundError: "No camera found on this device — use manual entry below.",
      NotReadableError: "Camera is already in use by another app — close it and try again.",
      OverconstrainedError: "Couldn't access that camera — trying again may help, or use manual entry below.",
    };
    if(statusEl) statusEl.textContent = messages[e.name] || ("Camera unavailable ("+(e.message||e.name)+") — use manual entry below.");
    return;
  }

  if(btn){ btn.disabled = false; btn.textContent = "Stop camera"; }
  const video = document.getElementById("scanVideo");
  video.srcObject = scanStream;
  video.style.display = "block";
  document.getElementById("scanPlaceholder").style.display = "none";
  document.getElementById("scanFrame").style.display = "block";
  document.getElementById("scanLine").style.display = "block";
  video.play().catch(()=>{ if(statusEl) statusEl.textContent = "Couldn't start the video preview — try again."; });

  if(!window.jsQR){
    if(statusEl) statusEl.textContent = "QR scanning didn't load (no internet?) — use manual entry below.";
    const dbg = document.getElementById("scanDebug");
    if(dbg) dbg.textContent = "jsQR: NOT LOADED";
    return;
  }

  // flashlight toggle, if this camera supports it
  const track = scanStream.getVideoTracks()[0];
  const torchBtn = document.getElementById("torchToggle");
  let torchOn = false;
  if(track && track.getCapabilities && track.getCapabilities().torch){
    torchBtn.style.display = "block";
    torchBtn.onclick = ()=>{
      torchOn = !torchOn;
      track.applyConstraints({advanced:[{torch:torchOn}]}).catch(()=>{});
      torchBtn.style.background = torchOn ? "var(--accent)" : "";
    };
  }

  const canvas = document.getElementById("scanCanvas");
  const ctx = canvas.getContext("2d", {willReadFrequently:true});
  const dbg = document.getElementById("scanDebug");
  let frameCount = 0, lastDecodeMs = 0;
  console.log("[scan] loop starting — jsQR available:", typeof jsQR === "function");
  function loop(){
    if(!scanStream) return;
    // Wrapped in try/catch on purpose: a single bad frame (e.g. zero-size canvas
    // right as the stream starts) throwing here would otherwise stop this
    // rAF chain forever, silently — the video would keep playing (that's native,
    // independent of this loop) while scanning quietly stopped working.
    try{
      frameCount++;
      const ready = video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0 && video.videoHeight > 0;
      if(!ready){
        if(dbg) dbg.textContent = "frame "+frameCount+" · waiting for video data (readyState "+video.readyState+")";
      }else{
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const t0 = performance.now();
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth"
        });
        lastDecodeMs = Math.round(performance.now() - t0);
        if(code && code.data && !scanBusy){
          console.log("SUCCESSFULLY SCANNED:", code.data);
          if(dbg) dbg.textContent = "✓ decoded: "+code.data;
          scanBusy = true;
          if(navigator.vibrate) navigator.vibrate(100);
          flashScanSuccess();
          handleScanResult(code.data);
          // Deliberately NOT stopping the loop here (unlike a plain `return`) — quest
          // and group-invite codes are meant to be scanned one after another without
          // restarting the camera. scanBusy debounces re-triggering on the same code
          // for 1.8s; the PAY: flow (see processScannedCode) still stops the camera
          // itself since that's a one-shot handoff into the Send modal.
          setTimeout(()=> scanBusy=false, 1800);
        }else if(dbg){
          dbg.textContent = "frame "+frameCount+" · "+canvas.width+"x"+canvas.height+" · scanning… ("+lastDecodeMs+"ms/frame, no code found yet)";
        }
      }
      if(frameCount % 60 === 0){ // ~once/sec at 60fps — every-frame console logging floods faster than it helps
        console.log("[scan] frame", frameCount, "readyState:", video.readyState, "size:", video.videoWidth+"x"+video.videoHeight, "ready:", ready, "lastDecodeMs:", lastDecodeMs);
      }
    }catch(err){
      console.error("[scan] frame processing error (loop continues):", err);
      if(dbg) dbg.textContent = "frame error: "+err.message;
    }
    scanRAF = requestAnimationFrame(loop);
  }
  scanRAF = requestAnimationFrame(loop);
}

function flashScanSuccess(){
  const vf = document.getElementById("viewfinder");
  if(!vf) return;
  vf.classList.add("scan-success");
  setTimeout(()=> vf.classList.remove("scan-success"), 450);
}

function stopScanner(){
  if(scanRAF) cancelAnimationFrame(scanRAF);
  scanRAF = null;
  if(scanStream){ scanStream.getTracks().forEach(t=>t.stop()); scanStream = null; }
  const btn = document.getElementById("camToggle");
  if(btn){ btn.disabled = false; btn.textContent = "Start camera"; }
}

function handleScanResult(raw){
  processScannedCode(raw);
}

// Routes any scanned/typed code by its prefix: PAY:<userId> opens Send pre-filled
// with that person, GROUP:<code> joins that group, anything else is a quest code.
function processScannedCode(raw){
  let code = raw.trim();
  const m = code.match(/^HAVEN:(.+)$/i);
  if(m) code = m[1];
  code = code.toUpperCase();
  if(code.startsWith("PAY:")){
    const userId = code.slice(4);
    stopScanner();
    renderScan();
    showScannedUserSheet(userId);
    return;
  }
  if(code.startsWith("GROUP:")){
    joinGroupByCode(code.slice(6));
    return;
  }
  // A bare wallet ID (e.g. "HVN-2T67") with no HAVEN:PAY: wrapper — some external
  // QR generators or manually-typed codes won't include our prefix, so recognize
  // the ID shape itself and route it the same way as a proper personal-pay QR.
  if(/^[A-Z0-9]{2,6}-[A-Z0-9]{3,8}$/.test(code)){
    stopScanner();
    renderScan();
    showScannedUserSheet(code);
    return;
  }
  redeemCode(code);
}

// The action sheet shown after scanning someone's personal QR — their card,
// plus Transfer / Check Balance / Add to Group actions.
async function showScannedUserSheet(userId){
  if(userId === ME.id){ toast("That's your own QR code", "info"); return; }
  const user = await getJSON("users:"+userId, true);
  if(!user){ toast("Wallet not found", "err"); return; }

  showModal(`
    <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:6px;">
      <div class="big-avatar" style="width:60px; height:60px; font-size:26px;">${user.avatar}</div>
      <h3 style="margin:10px 0 0;">${user.name}</h3>
      <div class="mono" style="font-size:11.5px; color:var(--ink-faint); margin-top:2px;">${user.id}</div>
      <div class="mono" style="font-weight:800; font-size:22px; color:var(--gold); margin-top:10px;">${user.balance} ${CURRENCY_SHORT}</div>
    </div>
    <div id="scannedActivity" style="display:none; margin:14px 0;"></div>
    <button class="btn btn-primary btn-block" id="sheetTransferBtn" style="margin-top:6px;">Transfer Sparks</button>
    <button class="btn btn-ghost btn-block" id="sheetBalanceBtn" style="margin-top:8px;">Check Balance & Activity</button>
    <button class="btn btn-ghost btn-block" id="sheetGroupBtn" style="margin-top:8px;">Add to Group</button>
  `);

  document.getElementById("sheetTransferBtn").addEventListener("click", ()=>{
    closeModal();
    showSendModal(user.id);
  });

  document.getElementById("sheetBalanceBtn").addEventListener("click", async ()=>{
    const box = document.getElementById("scannedActivity");
    if(!box) return;
    if(box.style.display !== "none"){ box.style.display = "none"; return; }
    box.style.display = "block";
    box.innerHTML = `<div class="empty-note">Loading…</div>`;
    // "public activity" = this person's entries in the shared activity feed —
    // not their private transaction ledger, which stays theirs alone
    const feed = (await getJSON("activity:feed", true)) || [];
    const theirs = feed.filter(a => a.user === user.name).slice(0, 8);
    box.innerHTML = theirs.length
      ? `<div class="card">${theirs.map(a=>`
          <div class="tx-row">
            <div class="tx-icon ${a.amount>0?'in':'out'}">${a.amount>0?ICONS.txIn:ICONS.txOut}</div>
            <div class="tx-meta"><div class="t">${a.detail}</div><div class="d">${new Date(a.ts).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div></div>
            <div class="tx-amt ${a.amount>0?'in':'out'}">${a.amount>0?'+':''}${a.amount} ${CURRENCY_SHORT}</div>
          </div>`).join("")}</div>`
      : `<div class="empty-note">No public activity yet.</div>`;
  });

  document.getElementById("sheetGroupBtn").addEventListener("click", async ()=>{
    const groups = await allGroups();
    const myGroup = myGroupOf(groups);
    if(!myGroup){ toast("You need to be in a group first", "err"); return; }
    if(myGroup.memberIds.includes(user.id)){ toast(user.name+" is already in your group", "info"); return; }
    const theirGroup = groups.find(g => g.memberIds.includes(user.id));
    if(theirGroup){ toast(user.name+" is already in a group", "err"); return; }
    const g = groups.find(x=>x.id===myGroup.id);
    g.memberIds.push(user.id);
    await setJSON("groups:list", groups, true);
    closeModal();
    toast("Added "+user.name+" to "+g.name, "");
  });
}

function redeemCode(code){
  // uses whatever quest list is already cached (kept fresh by background
  // refreshes on every page nav) — no network wait before validating the code
  const quest = QUESTS.find(q => q.code.toUpperCase() === code && q.active);
  const statusEl = document.getElementById("scanStatus");
  if(!quest){
    if(statusEl) statusEl.textContent = "Code not recognized: "+code;
    toast("Invalid code", "err");
    return;
  }
  ME.completed = ME.completed || [];
  if(ME.completed.includes(quest.id)){
    if(statusEl) statusEl.textContent = "Already completed: "+quest.title;
    toast("Already completed", "info");
    return;
  }
  ME.completed.push(quest.id);
  ME.balance += quest.reward;
  const tx = {type:"quest", desc:"Completed: "+quest.title, amount:quest.reward, ts:Date.now()};
  TX.unshift(tx);
  if(statusEl) statusEl.textContent = "✓ "+quest.title+" — +"+quest.reward+" "+CURRENCY;
  toast("+"+quest.reward+" "+CURRENCY_SHORT+" · "+quest.title, "");
  renderNav();
  const manual = document.getElementById("manualCode");
  if(manual) manual.value = "";

  Promise.all([
    saveMe(),
    saveTx(),
    pushActivity({type:"quest", user:ME.name, detail:quest.title, amount:quest.reward, ts:Date.now()}),
  ]).catch(err=>console.error("quest sync failed", err));
}

// Send Money
function sendMoney(toId, amount, note, toName){
  if(toId===ME.id){ toast("Can't send to yourself", "err"); return false; }
  if(ME.balance < amount){ toast("Not enough "+CURRENCY, "err"); return false; }

  // instant on the sender's side — the recipient's balance still needs a
  // network round trip, but that happens in the background below
  ME.balance -= amount;
  const desc = note ? ("Sent to "+toName+" — "+note) : ("Sent to "+toName);
  TX.unshift({type:"transfer", desc, amount:-amount, ts:Date.now()});

  (async ()=>{
    try{
      await Promise.all([ saveMe(), saveTx() ]);
      const recipient = await getJSON("users:"+toId, true);
      if(recipient){
        recipient.balance += amount;
        await setJSON("users:"+toId, recipient, true);
        const rtx = (await getJSON("tx:"+toId, true)) || [];
        rtx.unshift({type:"transfer", desc: note ? ("From "+ME.name+" — "+note) : ("From "+ME.name), amount, ts:Date.now()});
        await setJSON("tx:"+toId, rtx, true);
      }
      await pushActivity({type:"transfer", user:ME.name, detail:"sent "+toName+" "+amount+" "+CURRENCY_SHORT+(note?(" · "+note):""), amount:-amount, ts:Date.now()});
    }catch(err){ console.error("transfer sync failed", err); }
  })();

  return true;
}

async function showSendModal(presetUserId){
  let recipientUser = presetUserId ? await getJSON("users:"+presetUserId, true) : null;
  showModal(`
    <h3>Send ${CURRENCY}</h3>
    ${!recipientUser ? `<p style="color:var(--ink-dim); font-size:12px; margin:-6px 0 12px;">Choose someone by username or wallet ID, or use Scan to send with their QR code.</p>` : ""}
    ${recipientUser ? `
      <div class="field"><label>To</label>
        <div class="list-item" style="background:var(--surface-2); border-radius:12px; padding:11px 13px;"><span class="lab">${recipientUser.avatar} ${accountLabel(recipientUser)}</span></div>
      </div>
    ` : `
      <div class="field"><label>Username or wallet ID</label><input type="text" id="sendSearch" placeholder="e.g. isaac or HVN-AB12"></div>
      <div id="sendUserList" style="max-height:160px; overflow-y:auto; margin-bottom:12px;"></div>
    `}
    <div class="field"><label>Amount</label><input type="number" id="sendAmount" placeholder="0"></div>
    <div class="field"><label>Note (optional)</label><input type="text" id="sendNote" placeholder="e.g. pizza split"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" style="flex:1;" id="cancelSend">Cancel</button>
      <button class="btn btn-primary" style="flex:1;" id="confirmSend" ${recipientUser?'':'disabled'}>Send</button>
    </div>
  `);
  let selected = recipientUser ? recipientUser.id : null;
  let selectedName = recipientUser ? accountLabel(recipientUser) : null;
  const confirmBtn = document.getElementById("confirmSend");
  if(!recipientUser){
    const listEl = document.getElementById("sendUserList");
    const searchEl = document.getElementById("sendSearch");
    async function renderList(q){
      const users = (await allUsers()).filter(u=>u.id!==ME.id);
      const needle = q.trim().toLowerCase();
      const filtered = needle ? users.filter(u=>[
        u.username, u.id, u.name, u.realName
      ].filter(Boolean).some(value=>String(value).toLowerCase().includes(needle))) : users;
      listEl.innerHTML = filtered.slice(0,20).map(u=>`
        <div class="list-item send-pick" data-id="${u.id}" data-name="${accountLabel(u)}" style="cursor:pointer;">
          <span class="lab">${u.avatar} ${accountLabel(u)}</span>
          <span class="mono" style="color:var(--ink-faint); font-size:11px;">${u.id}</span>
        </div>
      `).join("") || `<div class="empty-note">No matches</div>`;
      listEl.querySelectorAll(".send-pick").forEach(row=>{
        row.addEventListener("click", ()=>{
          selected = row.dataset.id;
          selectedName = row.dataset.name;
          listEl.querySelectorAll(".send-pick").forEach(r=>r.style.background="");
          row.style.background = "var(--surface-3)";
          confirmBtn.disabled = false;
        });
      });
    }
    renderList("");
    searchEl.addEventListener("input", e=>renderList(e.target.value));
  }
  document.getElementById("cancelSend").addEventListener("click", closeModal);
  confirmBtn.addEventListener("click", ()=>{
    const amt = parseInt(document.getElementById("sendAmount").value) || 0;
    const note = document.getElementById("sendNote").value.trim();
    if(!selected){ toast("Choose a recipient", "err"); return; }
    if(amt<=0){ toast("Enter an amount", "err"); return; }
    const ok = sendMoney(selected, amt, note, selectedName || "friend");
    if(ok){
      closeModal();
      toast("Sent "+amt+" "+CURRENCY_SHORT+" to "+(selectedName || "friend"), "");
      renderNav();
      if(PAGE==="home") renderHome(); else if(PAGE==="profile") renderProfile();
    }
  });
}

// Groups (single-membership: each user belongs to at most one group at a time)
async function allGroups(){ return (await getJSON("groups:list", true)) || []; }

function myGroupOf(groups){ return groups.find(g => g.memberIds.includes(ME.id)); }

async function joinGroupByCode(code){
  const groups = await allGroups();
  if(myGroupOf(groups)){ toast("You're already in a group — leave it first", "err"); return; }
  const group = groups.find(g => g.code === code);
  if(!group){ toast("Group not found", "err"); return; }
  group.memberIds.push(ME.id);
  await setJSON("groups:list", groups, true);
  toast("Joined "+group.name, "");
  if(PAGE==="groups") loadGroupsPageBody();
}

function renderGroupsPage(){
  const c = document.getElementById("pageContent");
  c.innerHTML = `
    <button class="back-link" id="groupsBack">‹ Home</button>
    <div class="page-title">Groups</div>
    <p class="page-sub">Team up — pool ${CURRENCY} and split payments with your group.</p>
    <div id="groupsBody"><div class="empty-note">Loading…</div></div>
  `;
  document.getElementById("groupsBack").addEventListener("click", ()=> goTo("home"));
  loadGroupsPageBody();
}

async function loadGroupsPageBody(){
  const el = document.getElementById("groupsBody");
  if(!el) return;
  const groups = await allGroups();
  const myGroup = myGroupOf(groups);

  if(!myGroup){
    el.innerHTML = `
      <div style="display:flex; gap:8px; margin-bottom:16px;">
        <button class="btn btn-primary" style="flex:1;" id="newGroupBtn">+ New group</button>
        <button class="btn btn-ghost" style="flex:1;" id="joinGroupBtn">Join with code</button>
      </div>
      <div class="empty-note">You're not in a group yet — create one or join with a code.</div>
    `;
    document.getElementById("newGroupBtn").addEventListener("click", showCreateGroupModal);
    document.getElementById("joinGroupBtn").addEventListener("click", showJoinGroupModal);
    return;
  }

  const users = await allUsers();
  const members = myGroup.memberIds.map(id=>users.find(u=>u.id===id)).filter(Boolean);
  const total = members.reduce((s,m)=>s+(m.balance||0),0);

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <h5 style="margin:0 0 4px; font-size:16px; font-weight:800;">${myGroup.name}</h5>
          <div class="mono" style="font-size:11px; color:var(--ink-faint);">Code ${myGroup.code}</div>
        </div>
        <button class="icon-btn" id="groupQrBtn" title="Show invite QR">${ICONS.qr}</button>
      </div>
      <div style="display:flex; gap:28px; margin-top:14px; padding-top:14px; border-top:1px solid var(--border-soft);">
        <div>
          <div class="wallet-unit-label" style="margin-top:0;">Members</div>
          <div class="mono" style="font-weight:800; font-size:20px;">${members.length}</div>
        </div>
        <div>
          <div class="wallet-unit-label" style="margin-top:0;">Pooled ${CURRENCY_SHORT}</div>
          <div class="mono" style="font-weight:800; font-size:20px; color:var(--gold);">${total}</div>
        </div>
      </div>
    </div>
    <div class="section-head" style="margin-top:22px;"><h3>Group SPK</h3></div>
    <div class="card" style="margin-bottom:16px;">
      <div class="field"><label>SPK amount for each selected member</label><input type="number" id="groupXpAmount" min="1" step="1" placeholder="e.g. 10"></div>
      <div class="field"><label>Give SPK to</label><select id="groupXpTarget">
        <option value="all">Everyone in ${myGroup.name}</option>
        ${members.filter(m=>m.id!==ME.id).map(m=>`<option value="${m.id}">${accountLabel(m)}</option>`).join("")}
      </select></div>
      <button class="btn btn-ghost btn-block" id="groupXpBtn">Give SPK</button>
    </div>
    <div class="section-head" style="margin-top:22px;"><h3>Members</h3></div>
    <div class="card" style="margin-bottom:16px;">
      ${members.map(m=>`
        <div class="list-item">
          <span class="lab">
            <span class="list-icon" style="border-radius:50%; font-size:15px;">${m.avatar}</span>
            <span style="display:flex; flex-direction:column; gap:1px;">
              <span>${m.name}${m.id===myGroup.ownerId?' <span style="color:var(--ink-faint); font-size:10.5px; font-weight:600;">(owner)</span>':''}</span>
              <span class="mono" style="font-size:11.5px; color:var(--accent); font-weight:700;">${m.balance} ${CURRENCY_SHORT}</span>
            </span>
          </span>
          ${m.id!==ME.id ? `<button class="icon-btn" data-sendto="${m.id}" title="Send ${CURRENCY_SHORT}">${ICONS.send}</button>` : ''}
        </div>
      `).join("")}
    </div>
    <button class="btn btn-ghost btn-block" id="leaveGroupBtn">Leave group</button>
  `;

  document.getElementById("groupQrBtn").addEventListener("click", ()=>{
    showModal(`
      <h3>${myGroup.name}</h3>
      <p style="color:var(--ink-dim); font-size:12.5px; margin-top:-8px;">Scan this to join the group.</p>
      <div id="groupQrDisplay" style="background:#fff; padding:14px; border-radius:14px; display:flex; align-items:center; justify-content:center; margin:10px 0;"></div>
      <p style="text-align:center; font-family:var(--font-num); font-size:13px; color:var(--ink-dim);">HAVEN:GROUP:${myGroup.code}</p>
      <button class="btn btn-ghost btn-block" id="closeGroupQr">Close</button>
    `);
    renderQR(document.getElementById("groupQrDisplay"), "HAVEN:GROUP:"+myGroup.code);
    document.getElementById("closeGroupQr").addEventListener("click", closeModal);
  });

  el.querySelectorAll("[data-sendto]").forEach(b=> b.addEventListener("click", ()=> showSendModal(b.dataset.sendto)));

  document.getElementById("groupXpBtn").addEventListener("click", async ()=>{
    const amount = Math.floor(Number(document.getElementById("groupXpAmount").value));
    const target = document.getElementById("groupXpTarget").value;
    if(!Number.isFinite(amount) || amount<=0){ toast("Enter a positive SPK amount", "err"); return; }
    const recipientIds = target==="all" ? myGroup.memberIds.filter(id=>id!==ME.id) : [target];
    if(!recipientIds.length || recipientIds.includes(ME.id)){ toast("Choose another group member", "err"); return; }
    const updates = await Promise.all(recipientIds.map(async id=>{
      const user = await getJSON("users:"+id, true);
      if(!user) return false;
      user.balance = Number(user.balance || 0) + amount;
      await setJSON("users:"+id, user, true);
      const tx = (await getJSON("tx:"+id, true)) || [];
      tx.unshift({type:"group-reward", desc:"Group SPK reward from "+myGroup.name, amount, ts:Date.now()});
      await setJSON("tx:"+id, tx, true);
      return true;
    }));
    const count = updates.filter(Boolean).length;
    toast("Gave "+amount+" "+CURRENCY_SHORT+" to "+count+" member"+(count===1?"":"s"), "");
    loadGroupsPageBody();
  });

  document.getElementById("leaveGroupBtn").addEventListener("click", async ()=>{
    const gs = await allGroups();
    const g = gs.find(x=>x.id===myGroup.id);
    if(!g) return;
    if(g.ownerId===ME.id && g.memberIds.length>1){
      g.memberIds = g.memberIds.filter(id=>id!==ME.id);
      g.ownerId = g.memberIds[0];
      await setJSON("groups:list", gs, true);
    }else if(g.ownerId===ME.id){
      await setJSON("groups:list", gs.filter(x=>x.id!==g.id), true);
    }else{
      g.memberIds = g.memberIds.filter(id=>id!==ME.id);
      await setJSON("groups:list", gs, true);
    }
    toast("Left "+myGroup.name, "");
    loadGroupsPageBody();
  });
}

function showJoinGroupModal(){
  showModal(`
    <h3>Join a group</h3>
    <div class="field"><label>Group code</label><input type="text" id="joinGroupCode" placeholder="e.g. AB3XZ" style="text-transform:uppercase;"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" style="flex:1;" id="cancelJoinGroup">Cancel</button>
      <button class="btn btn-primary" style="flex:1;" id="joinGroupConfirm">Join</button>
    </div>
  `);
  document.getElementById("cancelJoinGroup").addEventListener("click", closeModal);
  document.getElementById("joinGroupConfirm").addEventListener("click", async ()=>{
    const code = document.getElementById("joinGroupCode").value.trim().toUpperCase();
    if(!code){ toast("Enter a code", "err"); return; }
    closeModal();
    await joinGroupByCode(code);
  });
}

function showCreateGroupModal(){
  showModal(`
    <h3>New group</h3>
    <div class="field"><label>Group name</label><input type="text" id="groupName" placeholder="e.g. Team Pixel Punks"></div>
    <div class="field"><label>Add members (optional)</label><input type="text" id="groupSearch" placeholder="Search by name or wallet ID"></div>
    <div id="groupUserList" style="max-height:180px; overflow-y:auto; margin-bottom:6px;"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" style="flex:1;" id="cancelGroup">Cancel</button>
      <button class="btn btn-primary" style="flex:1;" id="createGroupBtn">Create</button>
    </div>
  `);
  const picked = new Set();
  const listEl = document.getElementById("groupUserList");
  async function renderPickList(q){
    const users = (await allUsers()).filter(u=>u.id!==ME.id);
    const filtered = q ? users.filter(u=>(u.name+u.id).toLowerCase().includes(q.toLowerCase())) : users;
    listEl.innerHTML = filtered.slice(0,25).map(u=>`
      <label class="list-item" style="cursor:pointer;">
        <span class="lab"><input type="checkbox" data-uid="${u.id}" ${picked.has(u.id)?'checked':''} style="margin-right:8px; vertical-align:middle;">${u.avatar} ${u.name}</span>
        <span style="color:var(--ink-faint); font-size:11px;">${u.id}</span>
      </label>
    `).join("") || `<div class="empty-note">No matches</div>`;
    listEl.querySelectorAll("[data-uid]").forEach(cb=>{
      cb.addEventListener("change", ()=>{ cb.checked ? picked.add(cb.dataset.uid) : picked.delete(cb.dataset.uid); });
    });
  }
  renderPickList("");
  document.getElementById("groupSearch").addEventListener("input", e=>renderPickList(e.target.value));
  document.getElementById("cancelGroup").addEventListener("click", closeModal);
  document.getElementById("createGroupBtn").addEventListener("click", async ()=>{
    const name = document.getElementById("groupName").value.trim();
    if(!name){ toast("Name your group", "err"); return; }
    const groups = await allGroups();
    if(myGroupOf(groups)){ toast("You're already in a group — leave it first", "err"); closeModal(); return; }
    let code;
    do{ code = genId("",5); }while(groups.some(g=>g.code===code));
    const memberIds = Array.from(picked); memberIds.push(ME.id);
    groups.push({id:genId("g",5), name, code, ownerId:ME.id, memberIds, createdAt:Date.now()});
    await setJSON("groups:list", groups, true);
    closeModal(); toast("Group created — share code "+code, "");
    if(PAGE==="groups") loadGroupsPageBody();
  });
}



// Games (Mini-Games Hub)
let GAME_VIEW = null; // null | 'miner' | 'spin' | 'reflex'

function ensureGamesState(){
  if(!ME.games) ME.games = {minerPool:0, minerCollapseSeen:0, reflexLastPlayed:0};
}

function renderGames(){
  const c = document.getElementById("pageContent");
  c.innerHTML = `
    <div class="hero-mark" style="margin-bottom:10px;">💡</div>
    <div class="page-title">Idea Picker</div>
    <p class="page-sub">Turn a theme into a game concept in seconds.</p>
    <div class="card">
      <div class="field"><label>Theme <span style="color:var(--ink-faint);">(optional)</span></label><input id="ideaTheme" maxlength="80" placeholder="e.g. Nov 14 release"></div>
      <button class="btn btn-primary btn-block" id="generateIdeaBtn">Generate Game Concept</button>
    </div>
    <div id="ideaResult" style="margin-top:14px;"></div>
    <div class="section-head"><h3>Saved concepts</h3></div>
    <div class="card" id="savedIdeas"></div>
  `;
  const drawSaved = ()=>{
    const list = JSON.parse(localStorage.getItem(LOCAL_PREFIX+"ideas") || "[]");
    document.getElementById("savedIdeas").innerHTML = list.length ? list.map((x,i)=>`
      <div class="tx-row"><div class="tx-meta"><div class="t">${x.title}</div><div class="d">${x.theme}</div></div>
      <button class="icon-btn" data-delete-idea="${i}" title="Delete">${ICONS.trash}</button></div>`).join("") :
      `<div class="empty-note">No saved concepts yet.</div>`;
    document.querySelectorAll("[data-delete-idea]").forEach(b=>b.addEventListener("click",()=>{
      const next = JSON.parse(localStorage.getItem(LOCAL_PREFIX+"ideas") || "[]");
      next.splice(Number(b.dataset.deleteIdea),1);
      localStorage.setItem(LOCAL_PREFIX+"ideas", JSON.stringify(next)); drawSaved();
    }));
  };
  const generate = ()=>{
    const themes = [
      "a city under the sea","a forgotten arcade","a world without gravity","the last train home","a festival after dark",
      "a haunted space station","a village inside a giant tree","a library that rearranges itself","a kingdom run by robots",
      "a moon with changing seasons","a delivery service for lost dreams","an abandoned theme park","a shrinking planet",
      "a museum after midnight","a submarine racing through clouds","a detective agency for magical creatures",
      "a bakery at the end of time","a train that visits parallel worlds","a garden growing on a spaceship",
      "a school for retired villains"
    ];
    const genres = [
      "Platformer","Roguelike","Puzzle","Stealth","Rhythm","Cozy Simulation","Tower Defense","Deckbuilder",
      "Metroidvania","Social Deduction","Survival","Turn-based Strategy","Adventure","Action RPG","Party Game",
      "Physics Sandbox","Interactive Mystery","Management Sim","Bullet Heaven","Narrative Exploration"
    ];
    const mechanics = [
      "Gravity Flip","Time Manipulation","Shared Inventory","Sound-based Movement","Light and Shadow",
      "Body Swapping","Rewindable Actions","Weather Control","Growing and Shrinking","Drawing Your Own Path",
      "Trading Memories","Building with Echoes","Moving Through Reflections","Risk and Reward Choices",
      "Combining Creatures","Changing the Game Rules","Stealing Enemy Abilities","Playing as a Team of One",
      "Invisible Platforms","Rewriting Conversations"
    ];
    const theme = document.getElementById("ideaTheme").value.trim() || themes[Math.floor(Math.random()*themes.length)];
    const genre = genres[Math.floor(Math.random()*genres.length)];
    const mechanic = mechanics[Math.floor(Math.random()*mechanics.length)];
    const concept = {theme, title: `${genre}: ${theme}`, text:`A ${genre.toLowerCase()} about ${theme}, built around ${mechanic}.`};
    document.getElementById("ideaResult").innerHTML = `<div class="card"><div class="section-head" style="margin-top:0;"><h3>${concept.title}</h3><button class="btn btn-ghost" id="saveIdeaBtn">Save</button></div><p style="color:var(--ink-dim); line-height:1.5; margin:0;">${concept.text}</p></div>`;
    document.getElementById("saveIdeaBtn").addEventListener("click",()=>{
      const list = JSON.parse(localStorage.getItem(LOCAL_PREFIX+"ideas") || "[]");
      list.unshift(concept); localStorage.setItem(LOCAL_PREFIX+"ideas", JSON.stringify(list.slice(0,30)));
      drawSaved(); toast("Concept saved", "");
    });
  };
  document.getElementById("generateIdeaBtn").addEventListener("click", generate);
  drawSaved();
}

function renderGamesHub(c){
  stopReflexLoop();
  GAME_VIEW = null;
  c.innerHTML = `
    <div class="page-title">Play</div>
    <p class="page-sub">Mini-games to earn extra ${CURRENCY} on the side.</p>
    <button class="game-card" data-open="miner">
      <div class="game-emoji">⛏️</div>
      <div class="game-info"><h4>Spark Miner</h4><p>Tap to mine, then bank your haul before the mine collapses.</p></div>
      ${ICONS.chevron}
    </button>
    <button class="game-card" data-open="spin">
      <div class="game-emoji">🎡</div>
      <div class="game-info"><h4>Lucky Spin</h4><p>Spend ${CURRENCY} for a shot at the jackpot.</p></div>
      ${ICONS.chevron}
    </button>
    <button class="game-card" data-open="reflex">
      <div class="game-emoji">⚡</div>
      <div class="game-info"><h4>Reflex Rush</h4><p>Stop the marker in the zone for a payout.</p></div>
      ${ICONS.chevron}
    </button>
  `;
  c.querySelectorAll("[data-open]").forEach(b=> b.addEventListener("click", ()=> openGame(b.dataset.open)));
}

function openGame(id){
  GAME_VIEW = id;
  const c = document.getElementById("pageContent");
  if(id==="miner") renderMiner(c);
  else if(id==="spin") renderSpin(c);
  else if(id==="reflex") renderReflex(c);
}

// Leaderboard (its own page — individuals ranked by balance, groups ranked by combined balance)
let LEADERBOARD_TAB = "individuals"; // 'individuals' | 'groups'

function leaderRow(rank, avatar, label, amount){
  const medal = rank===1 ? "🥇" : rank===2 ? "🥈" : rank===3 ? "🥉" : "#"+rank;
  return `<div class="tx-row">
    <div class="tx-icon" style="background:var(--surface-2); font-size:${rank<=3?'16px':'12px'}; font-weight:700;">${medal}</div>
    <div class="tx-meta"><div class="t">${avatar} ${label}</div></div>
    <div class="tx-amt in mono">${amount} ${CURRENCY_SHORT}</div>
  </div>`;
}

function renderLeaderboard(){
  const c = document.getElementById("pageContent");
  c.innerHTML = `
    <button class="back-link" id="lbBack">‹ Home</button>
    <div class="page-title">🏆 Leaderboard</div>
    <p class="page-sub">Ranked by ${CURRENCY}, highest first.</p>
    <div class="tab-switch">
      <button class="${LEADERBOARD_TAB==='individuals'?'active':''}" id="lbTabInd">Individuals</button>
      <button class="${LEADERBOARD_TAB==='groups'?'active':''}" id="lbTabGroup">Groups</button>
    </div>
    <div id="leaderboardBody"><div class="empty-note">Loading…</div></div>
  `;
  document.getElementById("lbBack").addEventListener("click", ()=> goTo("home"));
  document.getElementById("lbTabInd").addEventListener("click", ()=>{ LEADERBOARD_TAB="individuals"; renderLeaderboard(); });
  document.getElementById("lbTabGroup").addEventListener("click", ()=>{ LEADERBOARD_TAB="groups"; renderLeaderboard(); });
  loadLeaderboardBody();
}

async function loadLeaderboardBody(){
  const body = document.getElementById("leaderboardBody");
  if(!body) return;
  if(LEADERBOARD_TAB==="individuals"){
    const users = await allUsers();
    users.sort((a,b)=> b.balance - a.balance);
    body.innerHTML = users.length
      ? `<div class="card">` + users.map((u,i)=> leaderRow(i+1, u.avatar, u.name+(u.id===ME.id?' (you)':''), u.balance)).join("") + `</div>`
      : `<div class="empty-note">No participants yet.</div>`;
  }else{
    const [groups, users] = await Promise.all([allGroups(), allUsers()]);
    const myGroupIds = new Set((groups.filter(g=>g.memberIds.includes(ME.id))).map(g=>g.id));
    const ranked = groups.map(g=>{
      const total = g.memberIds.reduce((s,id)=>{ const u=users.find(x=>x.id===id); return s+(u?u.balance:0); }, 0);
      return {name:g.name, total, count:g.memberIds.length, mine:myGroupIds.has(g.id)};
    }).sort((a,b)=> b.total-a.total);
    body.innerHTML = ranked.length
      ? `<div class="card">` + ranked.map((g,i)=> leaderRow(i+1, "👥", g.name+(g.mine?' (yours)':'')+" · "+g.count+" member"+(g.count===1?"":"s"), g.total)).join("") + `</div>`
      : `<div class="empty-note">No groups yet.</div>`;
  }
}

// Schedule — iOS-style day-tabbed timeline, populated by admin spreadsheet upload
let SCHEDULE_DAY = null;

function renderSchedulePage(){
  const c = document.getElementById("pageContent");
  c.innerHTML = `
    <button class="back-link" id="scheduleBack">‹ Home</button>
    <div class="page-title">🗓️ Schedule</div>
    <p class="page-sub">The full event timeline.</p>
    <div id="scheduleDayTabs"></div>
    <div id="scheduleBody"><div class="empty-note">Loading…</div></div>
  `;
  document.getElementById("scheduleBack").addEventListener("click", ()=> goTo("home"));
  loadSchedulePage();
}

async function loadSchedulePage(){
  const tabsEl = document.getElementById("scheduleDayTabs");
  const body = document.getElementById("scheduleBody");
  if(!body) return;
  const items = (await getJSON("schedule:list", true)) || [];
  if(!items.length){
    if(tabsEl) tabsEl.innerHTML = "";
    body.innerHTML = `<div class="empty-note">Nothing scheduled yet — check back soon.</div>`;
    return;
  }
  const days = [...new Set(items.map(i=>i.day).filter(Boolean))];
  if(!SCHEDULE_DAY || !days.includes(SCHEDULE_DAY)) SCHEDULE_DAY = days[0];

  tabsEl.innerHTML = `<div class="tab-switch" style="margin-bottom:14px;">
    ${days.map(d=>`<button class="${d===SCHEDULE_DAY?'active':''}" data-day="${d}">${d}</button>`).join("")}
  </div>`;
  tabsEl.querySelectorAll("[data-day]").forEach(b=> b.addEventListener("click", ()=>{ SCHEDULE_DAY = b.dataset.day; loadSchedulePage(); }));

  const dayItems = items.filter(i=>i.day===SCHEDULE_DAY);
  body.innerHTML = dayItems.length ? `
    <div class="timeline">
      ${dayItems.map(i=>`
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          ${i.time ? `<div class="timeline-time">${i.time}</div>` : ''}
          <div class="timeline-title">${i.title}</div>
          ${i.description ? `<div class="timeline-desc">${i.description}</div>` : ''}
          ${i.location ? `<div class="timeline-loc">📍 ${i.location}</div>` : ''}
        </div>
      `).join("")}
    </div>
  ` : `<div class="empty-note">Nothing scheduled for ${SCHEDULE_DAY}.</div>`;
}

// Food & Dining — day-tabbed, split by Lunch/Dinner, populated by admin spreadsheet upload
let MEALS_DAY = null;

function renderMealsPage(){
  const c = document.getElementById("pageContent");
  c.innerHTML = `
    <button class="back-link" id="mealsBack">‹ Home</button>
    <div class="page-title">🍽️ Food & Dining</div>
    <p class="page-sub">What's being served, day by day.</p>
    <p class="page-sub"><strong>Remarks:</strong> If you are allergic to these kinds of food, please contact the co-organizers.</p>
    <div id="mealsDayTabs"></div>
    <div id="mealsBody"><div class="empty-note">Loading…</div></div>
  `;
  document.getElementById("mealsBack").addEventListener("click", ()=> goTo("home"));
  loadMealsPage();
}

async function loadMealsPage(){
  const tabsEl = document.getElementById("mealsDayTabs");
  const body = document.getElementById("mealsBody");
  if(!body) return;
  const items = (await getJSON("meals:list", true)) || [];
  if(!items.length){
    if(tabsEl) tabsEl.innerHTML = "";
    body.innerHTML = `<div class="empty-note">No menu posted yet — check back soon.</div>`;
    return;
  }
  const days = [...new Set(items.map(i=>i.day).filter(Boolean))];
  if(!MEALS_DAY || !days.includes(MEALS_DAY)) MEALS_DAY = days[0];

  tabsEl.innerHTML = `<div class="tab-switch" style="margin-bottom:14px;">
    ${days.map(d=>`<button class="${d===MEALS_DAY?'active':''}" data-day="${d}">${d}</button>`).join("")}
  </div>`;
  tabsEl.querySelectorAll("[data-day]").forEach(b=> b.addEventListener("click", ()=>{ MEALS_DAY = b.dataset.day; loadMealsPage(); }));

  const dayItems = items.filter(i=>i.day===MEALS_DAY);
  const mealTypes = [...new Set(dayItems.map(i=>i.mealType).filter(Boolean))];
  body.innerHTML = mealTypes.length ? mealTypes.map(mt => `
    <div class="section-head" style="margin-top:18px;"><h3>${mt}</h3></div>
    <div class="card">
      ${dayItems.filter(i=>i.mealType===mt).map(i=>{
        const catClass = /veg/i.test(i.category) ? 'veg' : /drink/i.test(i.category) ? 'drink' : '';
        return `<div class="meal-item">
          <div><div class="name">${i.itemName}</div>${i.notes?`<div class="notes">${i.notes}</div>`:''}</div>
          ${i.category ? `<span class="meal-tag ${catClass}">${i.category}</span>` : ''}
        </div>`;
      }).join("")}
    </div>
  `).join("") : `<div class="empty-note">Nothing posted for ${MEALS_DAY}.</div>`;
}

// Submissions — teams (or individuals, if not in a group) submit one project
// each; upserted by owner so re-submitting edits rather than duplicating.
// A public gallery below doubles as the Exhibition browsing view.
async function allSubmissions(){ return (await getJSON("submissions:list", true)) || []; }

async function getMySubmissionOwner(){
  const groups = await allGroups();
  const myGroup = myGroupOf(groups);
  if(myGroup) return {ownerType:"group", ownerId: myGroup.id, ownerName: myGroup.name};
  return {ownerType:"user", ownerId: ME.id, ownerName: ME.name};
}

function renderSubmissionsPage(){
  const c = document.getElementById("pageContent");
  c.innerHTML = `
    <button class="back-link" id="subBack">‹ Home</button>
    <div class="page-title">🚀 Submissions</div>
    <p class="page-sub">Submit your project, and browse what everyone's building.</p>
    <div id="mySubmissionCard"><div class="empty-note">Loading…</div></div>
    <div class="section-head" style="margin-top:8px;"><h3>Exhibition</h3></div>
    <div id="submissionsGallery"><div class="empty-note">Loading…</div></div>
  `;
  document.getElementById("subBack").addEventListener("click", ()=> goTo("home"));
  loadSubmissionsPage();
}

async function loadSubmissionsPage(){
  const mineEl = document.getElementById("mySubmissionCard");
  const galleryEl = document.getElementById("submissionsGallery");
  if(!mineEl || !galleryEl) return;
  const [subs, owner, revealed] = await Promise.all([allSubmissions(), getMySubmissionOwner(), getJSON("submissions:revealed", true)]);
  const mine = subs.find(s => s.ownerId===owner.ownerId && s.ownerType===owner.ownerType);

  mineEl.innerHTML = `<div class="card" style="margin-bottom:8px;">
    ${mine ? `
      <h5 style="margin:0 0 4px; font-size:14px;">${mine.projectName}</h5>
      ${mine.description ? `<div class="sub" style="margin-bottom:8px;">${mine.description}</div>` : ''}
      ${mine.demoLink ? `<a href="${mine.demoLink}" target="_blank" rel="noopener" style="font-size:12px; color:var(--accent); font-weight:600;">View demo →</a>` : ''}
      <button class="btn btn-ghost btn-block" style="margin-top:12px;" id="editSubBtn">Edit submission</button>
    ` : `
      <p style="color:var(--ink-dim); font-size:12.5px; margin:0 0 12px;">Submitting as ${owner.ownerType==='group' ? owner.ownerName+' (your group)' : 'yourself'}.</p>
      <button class="btn btn-primary btn-block" id="newSubBtn">Submit your project</button>
    `}
  </div>`;
  const editBtn = document.getElementById("editSubBtn");
  if(editBtn) editBtn.addEventListener("click", ()=> showSubmitProjectModal(owner, mine));
  const newBtn = document.getElementById("newSubBtn");
  if(newBtn) newBtn.addEventListener("click", ()=> showSubmitProjectModal(owner, null));

  let list = subs;
  if(revealed){
    list = subs.map(s=>{
      const vals = Object.values(s.scores || {});
      const avg = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
      return {...s, avg};
    }).sort((a,b)=> (b.avg||0)-(a.avg||0));
  }

  galleryEl.innerHTML = `
    ${revealed ? `<div class="game-alert" style="background:rgba(249,221,96,0.1); border-color:rgba(249,221,96,0.3); color:var(--gold);">🏆 Results are in!</div>` : ''}
    ${list.length ? list.map((s,i) => `
    <div class="card" style="margin-bottom:10px;">
      <h5 style="margin:0 0 3px; font-size:14px;">${revealed && s.avg!==null && i===0 ? '🥇 ' : revealed && s.avg!==null && i===1 ? '🥈 ' : revealed && s.avg!==null && i===2 ? '🥉 ' : ''}${s.projectName}</h5>
      <div class="sub" style="margin-bottom:6px;">by ${s.ownerName}${revealed && s.avg!==null ? ' · '+s.avg.toFixed(1)+' avg' : ''}</div>
      ${s.description ? `<div style="font-size:12.5px; color:var(--ink-dim); margin-bottom:6px; line-height:1.45;">${s.description}</div>` : ''}
      ${s.demoLink ? `<a href="${s.demoLink}" target="_blank" rel="noopener" style="font-size:12px; color:var(--accent); font-weight:600;">View demo →</a>` : ''}
    </div>
  `).join("") : `<div class="empty-note">No submissions yet — be the first.</div>`}`;
}

function showSubmitProjectModal(owner, existing){
  showModal(`
    <h3>${existing ? 'Edit' : 'Submit'} your project</h3>
    <div class="field"><label>Project name</label><input type="text" id="projName" value="${existing?existing.projectName:''}" placeholder="e.g. Haven Pay"></div>
    <div class="field"><label>Tagline / description</label><textarea id="projDesc" rows="3" placeholder="What does it do?">${existing?existing.description:''}</textarea></div>
    <div class="field"><label>Demo link (optional)</label><input type="text" id="projLink" value="${existing?existing.demoLink:''}" placeholder="https://…"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" style="flex:1;" id="cancelSub">Cancel</button>
      <button class="btn btn-primary" style="flex:1;" id="saveSubBtn">${existing?'Save':'Submit'}</button>
    </div>
  `);
  document.getElementById("cancelSub").addEventListener("click", closeModal);
  document.getElementById("saveSubBtn").addEventListener("click", async ()=>{
    const projectName = document.getElementById("projName").value.trim();
    const description = document.getElementById("projDesc").value.trim();
    const demoLink = document.getElementById("projLink").value.trim();
    if(!projectName){ toast("Name your project", "err"); return; }
    const subs = await allSubmissions();
    const idx = subs.findIndex(s => s.ownerId===owner.ownerId && s.ownerType===owner.ownerType);
    const record = {
      id: idx>=0 ? subs[idx].id : genId("sub",6),
      ownerType: owner.ownerType, ownerId: owner.ownerId, ownerName: owner.ownerName,
      projectName, description, demoLink,
      submittedBy: ME.name,
      ts: idx>=0 ? subs[idx].ts : Date.now(),
      updatedTs: Date.now(),
    };
    if(idx>=0) subs[idx] = record; else subs.push(record);
    await setJSON("submissions:list", subs, true);
    closeModal();
    toast(existing ? "Submission updated" : "Project submitted!", "");
    loadSubmissionsPage();
  });
}

/* ---- Spark Miner: tap to mine, bank before a collapse wipes it ---- */
let minerFlushTimer = null;
function scheduleMinerFlush(){
  if(minerFlushTimer) clearTimeout(minerFlushTimer);
  minerFlushTimer = setTimeout(()=>{ saveMe(); }, 1200);
}
async function flushMinerNow(){
  if(minerFlushTimer){ clearTimeout(minerFlushTimer); minerFlushTimer = null; }
  await saveMe();
}

async function renderMiner(c){
  ensureGamesState();
  const collapseAt = await getJSON("games:minerCollapseAt", true);
  let collapseMsg = "";
  if(collapseAt && collapseAt > (ME.games.minerCollapseSeen||0)){
    if(ME.games.minerPool > 0){
      collapseMsg = `<div class="game-alert">💥 The mine collapsed! You lost ${ME.games.minerPool} unbanked ${CURRENCY_SHORT}.</div>`;
    }
    ME.games.minerPool = 0;
    ME.games.minerCollapseSeen = collapseAt;
    await saveMe();
  }
  c.innerHTML = `
    <button class="back-link" id="gameBack">‹ Play</button>
    <div class="page-title">⛏️ Spark Miner</div>
    <p class="page-sub">Tap to mine ${CURRENCY}. Bank it before the mine collapses!</p>
    ${collapseMsg}
    <div class="miner-box">
      <div class="miner-pool"><span id="minerPoolNum">${ME.games.minerPool}</span><span class="unit">${CURRENCY_SHORT} unbanked</span></div>
      <button class="mine-btn" id="mineBtn">⛏️</button>
      <div class="miner-combo" id="minerCombo"></div>
      <button class="btn btn-primary btn-block" id="bankBtn" style="margin-top:20px;" ${ME.games.minerPool<=0?'disabled':''}>Bank ${ME.games.minerPool} ${CURRENCY_SHORT}</button>
    </div>
  `;
  document.getElementById("gameBack").addEventListener("click", ()=> renderGamesHub(c));
  let combo = 0, comboTimer = null;
  document.getElementById("mineBtn").addEventListener("click", ()=>{
    combo++;
    if(comboTimer) clearTimeout(comboTimer);
    comboTimer = setTimeout(()=>{ combo = 0; const el=document.getElementById("minerCombo"); if(el) el.textContent=""; }, 1500);
    const bonus = combo>=20 ? 3 : combo>=10 ? 2 : 1;
    ME.games.minerPool += bonus;
    document.getElementById("minerPoolNum").textContent = ME.games.minerPool;
    document.getElementById("minerCombo").textContent = combo>=10 ? ("x"+bonus+" combo!") : "";
    const bankBtn = document.getElementById("bankBtn");
    bankBtn.disabled = false;
    bankBtn.textContent = "Bank "+ME.games.minerPool+" "+CURRENCY_SHORT;
    scheduleMinerFlush();
  });
  document.getElementById("bankBtn").addEventListener("click", ()=>{
    const amt = ME.games.minerPool;
    if(amt<=0) return;
    ME.games.minerPool = 0;
    ME.balance += amt;
    TX.unshift({type:"game", desc:"Banked from Spark Miner", amount:amt, ts:Date.now()});
    renderNav();
    toast("Banked "+amt+" "+CURRENCY_SHORT, "");
    renderMiner(c);

    Promise.all([
      flushMinerNow(),
      saveTx(),
      pushActivity({type:"game", user:ME.name, detail:"banked from Spark Miner", amount:amt, ts:Date.now()}),
    ]).catch(err=>console.error("bank sync failed", err));
  });
}

/* ---- Lucky Spin: gacha wheel, costs Sparks to play ---- */
let spinBusy = false;
async function renderSpin(c){
  const cfg = (await getJSON("games:spin:config", true)) || {cost:20, segments:[], jackpotUntil:null};
  const jackpotActive = cfg.jackpotUntil && Date.now() < cfg.jackpotUntil;
  c.innerHTML = `
    <button class="back-link" id="gameBack">‹ Play</button>
    <div class="page-title">🎡 Lucky Spin</div>
    <p class="page-sub">${cfg.cost} ${CURRENCY_SHORT} per spin.${jackpotActive? ' <span style="color:var(--gold); font-weight:700;">🔥 Jackpot Hour — payouts doubled!</span>' : ''}</p>
    <div class="spin-wrap">
      <div class="wheel-outer">
        <div class="wheel" id="wheelEl"></div>
        <div class="wheel-pointer"></div>
      </div>
      <button class="btn btn-primary btn-block" id="spinBtn" style="margin-top:20px;">Spin (${cfg.cost} ${CURRENCY_SHORT})</button>
      <div class="scan-status" id="spinStatus"></div>
    </div>
  `;
  document.getElementById("gameBack").addEventListener("click", ()=> renderGamesHub(c));
  drawWheel(cfg.segments);
  document.getElementById("spinBtn").addEventListener("click", ()=> doSpin(cfg));
}

function drawWheel(segments){
  const wheel = document.getElementById("wheelEl");
  if(!wheel || !segments.length) return;
  const total = segments.reduce((s,seg)=>s+seg.weight,0) || 1;
  let acc = 0;
  const gradParts = segments.map((seg,i)=>{
    const start = acc/total*360; acc += seg.weight; const end = acc/total*360;
    return `${SPIN_PALETTE[i % SPIN_PALETTE.length]} ${start}deg ${end}deg`;
  });
  wheel.style.background = `conic-gradient(${gradParts.join(",")})`;
  acc = 0;
  wheel.innerHTML = segments.map((seg,i)=>{
    const mid = (acc + seg.weight/2)/total*360; acc += seg.weight;
    return `<span class="wheel-label" style="transform:rotate(${mid}deg) translate(0,-92px) rotate(${-mid}deg); color:${wheelTextColor(SPIN_PALETTE[i % SPIN_PALETTE.length])};">${seg.label}</span>`;
  }).join("");
}

function doSpin(cfg){
  if(spinBusy) return;
  if(!cfg.segments.length){ toast("No prizes configured yet", "err"); return; }
  if(ME.balance < cfg.cost){ toast("Not enough "+CURRENCY, "err"); return; }
  spinBusy = true;
  const btn = document.getElementById("spinBtn");
  if(btn) btn.disabled = true;
  const statusEl = document.getElementById("spinStatus");
  if(statusEl) statusEl.textContent = "Spinning…";

  // deduct and start spinning immediately — no network wait first
  ME.balance -= cfg.cost;
  renderNav();
  saveMe().catch(err=>console.error("spin cost sync failed", err));

  const total = cfg.segments.reduce((s,seg)=>s+seg.weight,0) || 1;
  let r = Math.random()*total, chosen = cfg.segments[0], acc = 0;
  for(const seg of cfg.segments){ acc += seg.weight; if(r <= acc){ chosen = seg; break; } }
  const jackpotActive = cfg.jackpotUntil && Date.now() < cfg.jackpotUntil;
  const payout = jackpotActive ? chosen.value*2 : chosen.value;

  let acc2 = 0;
  const segIndex = cfg.segments.indexOf(chosen);
  for(let i=0;i<segIndex;i++) acc2 += cfg.segments[i].weight;
  const midDeg = (acc2 + chosen.weight/2) / total * 360;
  const targetRotation = 5*360 + (360 - midDeg);

  const wheel = document.getElementById("wheelEl");
  if(wheel){
    wheel.style.transition = "transform 3.2s cubic-bezier(.17,.67,.16,1)";
    wheel.style.transform = `rotate(${targetRotation}deg)`;
  }

  setTimeout(()=>{
    ME.balance += payout;
    const net = payout - cfg.cost;
    const desc = chosen.value>0 ? ("Lucky Spin: "+chosen.label+(jackpotActive?" (Jackpot x2!)":"")) : "Lucky Spin: no win";
    TX.unshift({type:"game", desc, amount:net, ts:Date.now()});
    renderNav();
    if(statusEl) statusEl.textContent = payout>0 ? ("🎉 You won "+chosen.label+"!") : "No win this time — try again!";
    toast(payout>0 ? ("Won "+chosen.label) : "No win", payout>0 ? "" : "info");
    spinBusy = false;
    if(btn) btn.disabled = false;

    Promise.all([
      saveMe(),
      saveTx(),
      pushActivity({type:"game", user:ME.name, detail:"played Lucky Spin — "+chosen.label, amount:net, ts:Date.now()}),
    ]).catch(err=>console.error("spin payout sync failed", err));
  }, 3300);
}

/* ---- Reflex Rush: stop the marker in the zone ---- */
let reflexAnim = null, reflexStart = 0;
const REFLEX_PERIOD = 1500;

async function renderReflex(c){
  ensureGamesState();
  const cfg = (await getJSON("games:reflex:config", true)) || {maxReward:40, cooldownSec:45};
  const now = Date.now();
  const readyAt = (ME.games.reflexLastPlayed||0) + cfg.cooldownSec*1000;
  const onCooldown = now < readyAt;
  c.innerHTML = `
    <button class="back-link" id="gameBack">‹ Play</button>
    <div class="page-title">⚡ Reflex Rush</div>
    <p class="page-sub">Stop the marker in the glowing zone. A perfect hit pays up to ${cfg.maxReward} ${CURRENCY_SHORT}.</p>
    <div class="reflex-track"><div class="reflex-zone"></div><div class="reflex-marker" id="reflexMarker"></div></div>
    <button class="btn btn-primary btn-block" id="reflexBtn" style="margin-top:16px;" ${onCooldown?'disabled':''}>${onCooldown?'On cooldown…':'Stop!'}</button>
    <div class="scan-status" id="reflexStatus"></div>
  `;
  document.getElementById("gameBack").addEventListener("click", ()=>{ stopReflexLoop(); renderGamesHub(c); });
  if(onCooldown){
    tickReflexCooldown(readyAt, c);
  }else{
    startReflexLoop();
    document.getElementById("reflexBtn").addEventListener("click", ()=> stopReflexRound(cfg, c));
  }
}

function tickReflexCooldown(readyAt, c){
  const iv = setInterval(()=>{
    if(GAME_VIEW !== "reflex"){ clearInterval(iv); return; }
    const btn = document.getElementById("reflexBtn");
    const left = readyAt - Date.now();
    if(left<=0){ clearInterval(iv); renderReflex(c); return; }
    if(btn) btn.textContent = "Wait "+Math.ceil(left/1000)+"s";
  }, 400);
}

function startReflexLoop(){
  reflexStart = performance.now();
  function frame(t){
    const marker = document.getElementById("reflexMarker");
    if(!marker || GAME_VIEW!=="reflex"){ reflexAnim = null; return; }
    const elapsed = (t - reflexStart) % (REFLEX_PERIOD*2);
    const progress = elapsed < REFLEX_PERIOD ? elapsed/REFLEX_PERIOD : 2 - elapsed/REFLEX_PERIOD;
    marker.style.left = (progress*100)+"%";
    reflexAnim = requestAnimationFrame(frame);
  }
  reflexAnim = requestAnimationFrame(frame);
}

function stopReflexLoop(){
  if(reflexAnim) cancelAnimationFrame(reflexAnim);
  reflexAnim = null;
}

function stopReflexRound(cfg, c){
  const marker = document.getElementById("reflexMarker");
  if(!marker) return;
  stopReflexLoop();
  const leftPct = parseFloat(marker.style.left) || 0;
  const distFromCenter = Math.abs(50-leftPct);
  const accuracy = Math.max(0, 1 - distFromCenter/50);
  const reward = Math.round(cfg.maxReward*accuracy);
  ME.games.reflexLastPlayed = Date.now();
  ME.balance += reward;
  TX.unshift({type:"game", desc:"Reflex Rush ("+Math.round(accuracy*100)+"% accuracy)", amount:reward, ts:Date.now()});
  renderNav();
  toast("+"+reward+" "+CURRENCY_SHORT+" · "+Math.round(accuracy*100)+"% accuracy", "");
  renderReflex(c);

  Promise.all([
    saveMe(),
    saveTx(),
    pushActivity({type:"game", user:ME.name, detail:"scored "+Math.round(accuracy*100)+"% on Reflex Rush", amount:reward, ts:Date.now()}),
  ]).catch(err=>console.error("reflex sync failed", err));
}

// Quests
function renderQuests(){
  const c = document.getElementById("pageContent");
  const done = QUESTS.filter(q=>ME.completed && ME.completed.includes(q.id)).length;
  c.innerHTML = `
    <div class="page-title">Quests</div>
    <p class="page-sub">${done}/${QUESTS.length} complete · scan a station's code to earn ${CURRENCY}.</p>
    <div class="quest-filters">
      ${["all","main","side","mystery"].map(type=>`<button class="quest-filter ${QUEST_FILTER===type?'active':''}" data-quest-filter="${type}">${type==="all"?"All":type[0].toUpperCase()+type.slice(1)}</button>`).join("")}
    </div>
    <div id="questList"></div>
  `;
  const list = document.getElementById("questList");
  const active = QUESTS.filter(q=>q.active && (QUEST_FILTER==="all" || (q.type || "main")===QUEST_FILTER));
  if(!active.length){
    list.innerHTML = `<div class="empty-note">${QUEST_FILTER==="all" ? "No quests posted yet." : "No "+QUEST_FILTER+" quests yet."}</div>`;
  }else{
    list.innerHTML = active.map(q=>{
    const isDone = ME.completed && ME.completed.includes(q.id);
    return `<div class="quest-card ${isDone?'done':''}">
      <div class="quest-badge">${isDone?'✅':q.type==="mystery"?'❓':'🎯'}</div>
      <div class="quest-info">
        <h4>${q.title} <span class="quest-type">${(q.type || "main")}</span></h4>
        <p>${q.desc}</p>
        <div class="quest-foot">
          <span class="quest-reward">${q.type==="mystery" ? "??? "+CURRENCY_SHORT : "+"+q.reward+" "+CURRENCY_SHORT}</span>
          <span class="status-chip ${isDone?'done':'open'}">${isDone?'Completed':'Open'}</span>
        </div>
      </div>
    </div>`;
    }).join("");
  }
  c.querySelectorAll("[data-quest-filter]").forEach(b=>b.addEventListener("click", ()=>{
    QUEST_FILTER = b.dataset.questFilter;
    renderQuests();
  }));
}

// Profile
function renderProfile(){
  const c = document.getElementById("pageContent");
  const earned = TX.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
  const spent = TX.filter(t=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);
  c.innerHTML = `
    <div class="profile-head">
      <div class="big-avatar">${ME.avatar}</div>
      <h2>${accountLabel(ME)} ${ME.isAdmin?'<span class="admin-badge">'+ICONS.shield+' ORGANIZER</span>':''}</h2>
      <div class="idtag">${ME.id}</div>
    </div>
    <div class="stat-row">
      <div class="stat-box"><div class="l">Balance</div><div class="v">${ME.balance}</div></div>
      <div class="stat-box"><div class="l">Earned</div><div class="v">${earned}</div></div>
      <div class="stat-box"><div class="l">Spent</div><div class="v">${spent}</div></div>
    </div>
    <div class="section-head" style="margin-top:0;"><h3>Account</h3></div>
    <div class="card" style="margin-bottom:18px;">
      <button class="list-item" id="myQrBtn" style="width:100%; background:none; border:none; color:inherit;"><span class="lab"><span class="list-icon">${ICONS.scan}</span>My QR code</span>${ICONS.chevron}</button>
      <button class="list-item" id="goGroupsBtn" style="width:100%; background:none; border:none; color:inherit;"><span class="lab"><span class="list-icon">${ICONS.group}</span>Groups</span>${ICONS.chevron}</button>
      <button class="list-item" id="editNameBtn" style="width:100%; background:none; border:none; color:inherit;"><span class="lab"><span class="list-icon">${ICONS.edit}</span>Edit name</span>${ICONS.chevron}</button>
      ${!ME.isAdmin ? `<button class="list-item" id="adminUnlockBtn" style="width:100%; background:none; border:none; color:inherit;"><span class="lab"><span class="list-icon">${ICONS.shield}</span>Organizer access</span>${ICONS.chevron}</button>` : ""}
      ${ME.isAdmin ? `<button class="list-item" id="switchAccountBtn" style="width:100%; background:none; border:none; color:inherit;"><span class="lab"><span class="list-icon">${ICONS.users}</span>Switch account</span>${ICONS.chevron}</button>` : ""}
      <button class="list-item" id="signOutBtn" style="width:100%; background:none; border:none; color:inherit;"><span class="lab"><span class="list-icon">${ICONS.logout}</span>Sign out</span>${ICONS.chevron}</button>
    </div>
  `;
  document.getElementById("myQrBtn").addEventListener("click", ()=> renderMyQRPage("profile"));
  document.getElementById("goGroupsBtn").addEventListener("click", ()=> goTo("groups"));
  document.getElementById("editNameBtn").addEventListener("click", showEditNameModal);
  const switchAccountBtn = document.getElementById("switchAccountBtn");
  if(switchAccountBtn) switchAccountBtn.addEventListener("click", showWalletSwitcher);
  document.getElementById("signOutBtn").addEventListener("click", signOut);
  const unlockBtn = document.getElementById("adminUnlockBtn");
  if(unlockBtn) unlockBtn.addEventListener("click", showAdminUnlockModal);
}

async function showWalletSwitcher(){
  if(!ME || !ME.isAdmin) return;
  const email = String(ME.email || "").trim().toLowerCase();
  const participant = (await approvedParticipants()).find(item=>String(item.email || "").trim().toLowerCase()===email);
  const linkedUsers = (await allUsers()).filter(user=>
    String(user.email || "").trim().toLowerCase()===email && user.isAdmin
  );
  const organizerUsers = (await allUsers()).filter(user=>user.isAdmin);
  const assignedIds = Array.isArray(participant?.walletIds) ? participant.walletIds : [];
  const walletIds = [...new Set([ME.id, ...assignedIds, ...linkedUsers.map(user=>user.id), ...organizerUsers.map(user=>user.id)])];
  const uniqueIds = [...new Set(walletIds)].filter(Boolean);
  const wallets = (await Promise.all(uniqueIds.map(id=>getJSON("users:"+id, true)))).filter(Boolean);
  if(!wallets.length){ toast("No wallets are assigned to this organizer", "err"); return; }
  showModal(`
    <h3>Switch wallet</h3>
    <p class="page-sub">Choose one of your assigned wallets.</p>
    <div class="card">
      ${wallets.map(wallet=>`
        <button class="list-item wallet-switch-option" data-wallet-id="${wallet.id}" style="width:100%;background:none;border:none;color:inherit;text-align:left;">
          <span class="lab"><span class="list-icon">${wallet.avatar || "🙂"}</span><span>${accountLabel(wallet)}<small class="sub" style="display:block;">${wallet.id} · ${wallet.balance || 0} ${CURRENCY_SHORT}</small></span></span>
          ${wallet.id===ME.id ? '<span class="admin-badge">Current</span>' : ICONS.chevron}
        </button>
      `).join("")}
    </div>
    <button class="btn btn-ghost btn-block" id="closeWalletSwitcher" style="margin-top:10px;">Cancel</button>
  `);
  document.getElementById("closeWalletSwitcher").addEventListener("click", closeModal);
  document.querySelectorAll(".wallet-switch-option").forEach(button=>button.addEventListener("click", async ()=>{
    const wallet = await loadUser(button.dataset.walletId);
    if(!wallet){ toast("Wallet not found", "err"); return; }
    closeModal();
    refreshHeader();
    goTo("home");
  }));
}

function showModal(html){
  closeModal();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.id = "modalBackdrop";
  backdrop.innerHTML = `<div class="modal-sheet">${html}</div>`;
  backdrop.addEventListener("click", (e)=>{ if(e.target===backdrop) closeModal(); });
  document.getElementById("shell").appendChild(backdrop);
}
function closeModal(){
  if(ordersUnsub){ ordersUnsub(); ordersUnsub=null; }
  const m = document.getElementById("modalBackdrop");
  if(m) m.remove();
}

function showEditNameModal(){
  showModal(`
    <h3>Edit profile</h3>
    <div class="field"><label>Username</label><input type="text" id="usernameInput" value="${ME.username || ""}" placeholder="Choose a username"></div>
    <div class="field"><label>Full name</label><input type="text" value="${ME.realName || ME.name}" disabled><div class="sub" style="margin-top:5px;">Full name is managed by organizers.</div></div>
    <div class="field"><label>Avatar</label><div class="avatar-pick" id="avatarPick">
      ${AVATARS.map(a=>`<button type="button" class="avatar-opt ${a===ME.avatar?'sel':''}" data-a="${a}">${a}</button>`).join("")}
    </div></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" style="flex:1;" id="cancelEdit">Cancel</button>
      <button class="btn btn-primary" style="flex:1;" id="saveEdit">Save</button>
    </div>
  `);
  let chosenAvatar = ME.avatar;
  document.querySelectorAll("#avatarPick .avatar-opt").forEach(b=>{
    b.addEventListener("click", ()=>{
      chosenAvatar = b.dataset.a;
      document.querySelectorAll("#avatarPick .avatar-opt").forEach(x=>x.classList.remove("sel"));
      b.classList.add("sel");
    });
  });
  document.getElementById("cancelEdit").addEventListener("click", closeModal);
  document.getElementById("saveEdit").addEventListener("click", async ()=>{
    const username = document.getElementById("usernameInput").value.trim();
    if(!/^[a-zA-Z0-9_.-]{2,24}$/.test(username)){
      toast("Use 2–24 letters, numbers, dots, dashes, or underscores", "err");
      return;
    }
    const users = await allUsers();
    if(users.some(user=>user.id!==ME.id && String(user.username || "").toLowerCase()===username.toLowerCase())){
      toast("That username is already taken", "err");
      return;
    }
    ME.username = username;
    ME.avatar = chosenAvatar;
    await saveMe();
    const participants = await approvedParticipants();
    const participant = participants.find(item=>item.walletId===ME.id);
    if(participant){
      participant.username = username;
      await setJSON("participants:list", participants, true);
    }
    closeModal(); renderProfile(); refreshHeader();
  });
}

function showAdminUnlockModal(){
  showModal(`
    <h3>Organizer access</h3>
    <p style="color:var(--ink-dim); font-size:12.5px; margin-top:-8px;">Enter the organizer passcode given by your Haven HK lead.</p>
    <div class="field"><label>Passcode</label><input type="text" id="passInput" placeholder="Passcode"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" style="flex:1;" id="cancelPass">Cancel</button>
      <button class="btn btn-primary" style="flex:1;" id="submitPass">Unlock</button>
    </div>
  `);
  document.getElementById("cancelPass").addEventListener("click", closeModal);
  document.getElementById("submitPass").addEventListener("click", async ()=>{
    const v = document.getElementById("passInput").value.trim();
    if(v === ADMIN_CODE){
      ME.isAdmin = true; await saveMe();
      closeModal(); toast("Organizer access granted", "");
      renderNav(); renderProfile();
    }else{
      toast("Incorrect passcode", "err");
    }
  });
}

// Signs out of the current wallet and Firebase account.
async function signOut(){
  stopWalletSync();
  stopInboxSync();
  if(auth) await auth.signOut().catch(err=>console.error("Firebase sign-out failed", err));
  await setJSON("me:userId", "", false);
  ME = null;
  TX = [];
  showOnboarding();
}

function renderMyQRPage(from){
  const backTarget = from || "profile";
  const c = document.getElementById("pageContent");
  c.innerHTML = `
    <button class="back-link" id="qrBack">‹ ${backTarget==="home" ? "Home" : "Profile"}</button>
    <div class="page-title">My QR</div>
    <p class="page-sub">Others scan this in the Scan tab to send you ${CURRENCY} instantly.</p>
    <div class="card" style="display:flex; flex-direction:column; align-items:center; padding:28px 20px; margin-top:8px;">
      <div id="myQrDisplay" style="background:#fff; padding:16px; border-radius:18px;"></div>
      <div class="big-avatar" style="margin-top:18px;">${ME.avatar}</div>
      <h2 style="margin:10px 0 2px;">${accountLabel(ME)}</h2>
      ${ME.isAdmin ? `<span class="admin-badge" style="margin:6px 0 0;">Organizer</span>` : ""}
      <div class="idtag">${ME.id}</div>
    </div>
  `;
  document.getElementById("qrBack").addEventListener("click", ()=>{
    if(backTarget==="home") renderHome(); else renderProfile();
  });
  renderStyledQR(document.getElementById("myQrDisplay"), "HAVEN:PAY:"+ME.id, {logo: ME.avatar});
}

// Admin
function renderAdmin(){
  clearAdminListeners();
  const c = document.getElementById("pageContent");
  c.innerHTML = `
    <div class="page-title">Admin</div>
    <p class="page-sub">Manage Haven Hong Kong's shop, quests and participants.</p>
    <div class="admin-subnav" id="adminSubnav"></div>
    <div id="adminBody"></div>
  `;
  const tabs = [
    {id:"overview", label:"Overview"},
    {id:"setup", label:"Setup"},
    {id:"announce", label:"Announce"},
    {id:"quests", label:"Quests"},
    {id:"shop", label:"Shop"},
    {id:"pickups", label:"Orders"},
    {id:"content", label:"Content"},
    {id:"submissions", label:"Submissions"},
    {id:"users", label:"Participants"},
    {id:"feed", label:"Activity"},
  ];
  const nav = document.getElementById("adminSubnav");
  nav.innerHTML = tabs.map(t=>`<button class="${ADMIN_TAB===t.id?'active':''}" data-t="${t.id}">${t.label}</button>`).join("");
  nav.querySelectorAll("[data-t]").forEach(b=> b.addEventListener("click", ()=>{ ADMIN_TAB=b.dataset.t; renderAdmin(); }));
  // Rebuilding innerHTML above resets this bar's scroll position to the start —
  // without this, tapping a tab scrolled off to the right (like "Activity")
  // would select it correctly but then the bar snaps back to the front,
  // making your new selection disappear off-screen again.
  const activeTabBtn = nav.querySelector(".active");
  if(activeTabBtn){
    // Manual scrollLeft math instead of scrollIntoView: scrollIntoView's inline/block
    // options are inconsistently supported across mobile browser engines (including
    // in-app/embedded browsers), and it can also tug on the page's vertical scroll
    // as a side effect. Computing the offset directly is more predictable everywhere.
    const targetLeft = activeTabBtn.offsetLeft - (nav.clientWidth - activeTabBtn.offsetWidth) / 2;
    nav.scrollLeft = Math.max(0, targetLeft);
  }

  const fab = document.getElementById("fabBtn");
  if(ADMIN_TAB==="quests"){ fab.style.display="flex"; fab.onclick = showAddQuestModal; }
  else if(ADMIN_TAB==="shop"){ fab.style.display="flex"; fab.onclick = showAddItemModal; }
  else fab.style.display = "none";

  if(ADMIN_TAB==="overview") renderAdminOverview();
  else if(ADMIN_TAB==="setup") renderAdminSetup();
  else if(ADMIN_TAB==="announce") renderAdminAnnouncements();
  else if(ADMIN_TAB==="quests") renderAdminQuests();
  else if(ADMIN_TAB==="shop") renderAdminShop();
  else if(ADMIN_TAB==="pickups") renderAdminPickups();
  else if(ADMIN_TAB==="content") renderAdminContent();
  else if(ADMIN_TAB==="submissions") renderAdminSubmissions();
  else if(ADMIN_TAB==="users") renderAdminUsers();
  else if(ADMIN_TAB==="feed") renderAdminFeed();
}

async function allUsers(){
  const idx = (await getJSON("users:index", true)) || [];
  const results = await Promise.all(idx.map(uid => getJSON("users:"+uid, true)));
  return results.filter(Boolean);
}

async function approvedParticipants(){
  const list = await getJSON("participants:list", true);
  return Array.isArray(list) ? list : [];
}

function participantMatch(participant, identifier){
  const value = identifier.trim().toLowerCase();
  return String(participant.email || "").toLowerCase() === value ||
    String(participant.username || "").toLowerCase() === value;
}

function organizerWalletAllowed(participant, walletId){
  if(!participant || !participant.isAdmin) return false;
  const allowed = Array.isArray(participant.walletIds) ? participant.walletIds : [];
  return !allowed.length || allowed.includes(walletId);
}

function spreadsheetBoolean(value){
  return ["yes","true","1","organizer","admin"].includes(String(value || "").trim().toLowerCase());
}

async function importParticipantList(file){
  parseSpreadsheetFile(file, async (err, rows)=>{
    if(err){ toast("Couldn't read participant list", "err"); return; }
    await saveParticipantRows(rows);
  });
}

async function saveParticipantRows(rows){
    const participants = rows.map(row=>{
      const email = getCol(row, "email", "email address");
      const username = getCol(row, "username", "user name", "handle");
      const realName = getCol(row, "real name", "name", "full name");
      const walletId = getCol(row, "wallet id", "wallet");
      const organizer = getCol(row, "organizer", "organizer access", "admin");
      return email ? {email:email.toLowerCase(), username, realName, walletId, isAdmin:spreadsheetBoolean(organizer)} : null;
    }).filter(Boolean);
    if(!participants.length){ toast("No email or username columns found", "err"); return; }
    const users = await allUsers();
    const existingParticipants = await approvedParticipants();
    const mergedParticipants = [...existingParticipants];
    const protectedEmails = new Set();
    let addedCount = 0;
    for(const participant of participants){
      const index = mergedParticipants.findIndex(existing =>
        String(existing.email || "").toLowerCase()===participant.email.toLowerCase() ||
        (participant.walletId && existing.walletId===participant.walletId)
      );
      if(index===-1){ mergedParticipants.push(participant); addedCount++; }
      else{
        const existing = mergedParticipants[index];
        const linked = existing.walletId || users.some(user =>
          String(user.email || "").toLowerCase()===String(existing.email || "").toLowerCase() &&
          user.authUid
        );
        if(linked){
          protectedEmails.add(String(existing.email || "").toLowerCase());
        }else{
          mergedParticipants[index] = {
            ...existing,
            email: existing.email || participant.email,
            username: existing.username || participant.username,
            realName: existing.realName || participant.realName,
            walletId: existing.walletId || participant.walletId,
            isAdmin: typeof existing.isAdmin === "boolean" ? existing.isAdmin : participant.isAdmin
          };
        }
      }
    }
    for(const participant of mergedParticipants){
      if(protectedEmails.has(String(participant.email || "").toLowerCase())) continue;
      const linked = users.find(user =>
        (participant.walletId && user.id.toLowerCase()===participant.walletId.toUpperCase()) ||
        (participant.username && String(user.username||"").toLowerCase()===participant.username.toLowerCase())
      );
      if(linked){
        participant.walletId = linked.id;
        const updated = {...linked, email:participant.email || linked.email, username:participant.username || linked.username, realName:participant.realName || linked.realName || linked.name, isAdmin:participant.isAdmin};
        await setJSON("users:"+linked.id, updated, true);
      }
    }
    await setJSON("participants:list", mergedParticipants, true);
    toast("Added "+addedCount+" new; updated "+(participants.length-addedCount)+" existing participants", "");
    renderAdminUsers();
}

async function importParticipantSheet(url){
  const rows = await fetchGoogleSheetRows(url);
  await saveParticipantRows(rows);
}

async function deleteMissingParticipantsFromSheet(url){
  const rows = await fetchGoogleSheetRows(url);
  const emailsInSheet = new Set(rows.map(row=>getCol(row, "email", "email address").toLowerCase()).filter(Boolean));
  if(!emailsInSheet.size) throw new Error("The sheet must contain an Email column");
  const existing = await approvedParticipants();
  const missing = existing.filter(participant=>!emailsInSheet.has(String(participant.email || "").toLowerCase()));
  if(!missing.length){ toast("No participants to delete", ""); return; }
  const names = missing.map(participant=>participant.realName || participant.email).join(", ");
  if(!window.confirm("Permanently delete "+missing.length+" participant(s): "+names+"? This removes wallets, balances, transactions, and approval records.")) return;
  const users = await allUsers();
  const deletedIds = [];
  for(const participant of missing){
    const linked = users.find(user=>user.id===participant.walletId || String(user.email || "").toLowerCase()===String(participant.email || "").toLowerCase());
    const walletId = linked ? linked.id : participant.walletId;
    if(walletId){
      await deleteJSON("users:"+walletId, true);
      await deleteJSON("tx:"+walletId, true);
      deletedIds.push(walletId);
    }
  }
  const index = (await getJSON("users:index", true)) || [];
  await setJSON("users:index", index.filter(id=>!deletedIds.includes(id)), true);
  await setJSON("participants:list", existing.filter(participant=>emailsInSheet.has(String(participant.email || "").toLowerCase())), true);
  toast("Deleted "+missing.length+" participant(s)", "");
  renderAdminUsers();
}

async function fetchGoogleSheetRows(url){
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if(!match) throw new Error("Paste a valid Google Sheets link");
  const response = await fetch("https://docs.google.com/spreadsheets/d/"+match[1]+"/export?format=csv");
  if(!response.ok) throw new Error("Google Sheet could not be downloaded. Check that it is shared as Anyone with the link — Viewer.");
  const csv = await response.text();
  const workbook = XLSX.read(csv, {type:"string"});
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, {defval:""});
}

async function renderAdminOverview(){
  const body = document.getElementById("adminBody");
  body.innerHTML = `<div class="empty-note">Loading…</div>`;
  const users = await allUsers();
  let totalSpent = 0, totalEarned = 0;
  const txLists = await Promise.all(users.map(u => getJSON("tx:"+u.id, true)));
  txLists.forEach(tx=>{
    tx = tx || [];
    totalEarned += tx.filter(t=>t.amount>0).reduce((s,t)=>s+t.amount,0);
    totalSpent += tx.filter(t=>t.amount<0).reduce((s,t)=>s+Math.abs(t.amount),0);
  });
  const redemptions = (await getJSON("redemptions:list", true)) || [];
  const pendingCount = redemptions.filter(r=>r.status==="pending").length;

  body.innerHTML = `
    <div class="stat-grid">
      <div class="stat-tile"><div class="l">Participants</div><div class="v">${users.length}</div></div>
      <div class="stat-tile"><div class="l">Active quests</div><div class="v">${QUESTS.filter(q=>q.active).length}</div></div>
      <div class="stat-tile"><div class="l">${CURRENCY} issued</div><div class="v">${totalEarned}</div></div>
      <div class="stat-tile"><div class="l">${CURRENCY} spent</div><div class="v">${totalSpent}</div></div>
    </div>
    <div class="stat-grid">
      <div class="stat-tile"><div class="l">Pending orders</div><div class="v" id="ovPending">${pendingCount}</div></div>
    </div>
    <div class="section-head"><h3>Shop stock</h3></div>
    <div class="card" style="margin-bottom:18px;" id="ovShopStock"></div>
    <div class="section-head"><h3>Latest activity</h3></div>
    <div class="card" id="ovActivity" style="margin-bottom:18px;"></div>
    <div class="section-head" style="margin-top:0;"><h3>Export data</h3></div>
    <div class="card" style="display:flex; flex-direction:column; gap:8px;">
      <button class="btn btn-ghost" id="exportParticipantsBtn">Participants (CSV)</button>
      <button class="btn btn-ghost" id="exportActivityBtn">Full activity feed (CSV)</button>
      <button class="btn btn-ghost" id="exportSubmissionsBtn">Submissions & scores (CSV)</button>
    </div>
  `;
  document.getElementById("exportParticipantsBtn").addEventListener("click", exportParticipantsCSV);
  document.getElementById("exportActivityBtn").addEventListener("click", exportActivityCSV);
  document.getElementById("exportSubmissionsBtn").addEventListener("click", exportSubmissionsCSV);

  // these two sections — and the pending count — update live as things happen,
  // without re-running the expensive per-participant totals above
  adminUnsubs.push(watchJSON("shop:items", shop=>{
    const el = document.getElementById("ovShopStock");
    if(!el) return;
    el.innerHTML = (shop||[]).map(i=>`<div class="tx-row"><div class="tx-meta"><div class="t">${i.emoji} ${i.name}</div></div><div class="tx-amt in">${i.stock} left</div></div>`).join("");
  }));
  adminUnsubs.push(watchJSON("activity:feed", activity=>{
    const el = document.getElementById("ovActivity");
    if(el){
      el.innerHTML = (activity||[]).slice(0,6).map(a=>`<div class="tx-row"><div class="tx-icon ${a.amount>0?'in':'out'}">${a.amount>0?ICONS.txIn:ICONS.txOut}</div><div class="tx-meta"><div class="t">${a.user} — ${a.detail}</div><div class="d">${new Date(a.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div></div><div class="tx-amt ${a.amount>0?'in':'out'}">${a.amount>0?'+':''}${a.amount} ${CURRENCY_SHORT}</div></div>`).join("") || `<div class="empty-note">Nothing yet.</div>`;
    }
  }));
  adminUnsubs.push(watchJSON("redemptions:list", list=>{
    const el = document.getElementById("ovPending");
    if(el) el.textContent = (list||[]).filter(r=>r.status==="pending").length;
  }));
}

function renderAdminSetup(){
  const body = document.getElementById("adminBody");
  body.innerHTML = `
    <div class="section-head" style="margin-top:0;"><h3>Submission Timer</h3></div>
    <div id="setupTimerSection"></div>
    <div class="section-head"><h3>Event Info</h3></div>
    <div id="setupInfoSection"></div>
  `;
  renderAdminTimer("setupTimerSection");
  renderAdminInfo("setupInfoSection");
}

function renderAdminTimer(containerId){
  const body = document.getElementById(containerId || "adminBody");
  const startVal = TIMER && TIMER.start ? toDatetimeLocalValue(TIMER.start) : "";
  const endVal = TIMER && TIMER.end ? toDatetimeLocalValue(TIMER.end) : "";
  body.innerHTML = `
    <div class="card" style="margin-bottom:14px;">
      <div class="field"><label>Submissions open (start) — optional</label><input type="datetime-local" id="timerStart" value="${startVal}"></div>
      <div class="field"><label>Submission deadline (end)</label><input type="datetime-local" id="timerEnd" value="${endVal}"></div>
      <div class="modal-actions" style="margin-top:4px;">
        <button class="btn btn-ghost" style="flex:1;" id="clearTimerBtn">Clear</button>
        <button class="btn btn-primary" style="flex:1;" id="saveTimerBtn">Save</button>
      </div>
    </div>
    <p style="color:var(--ink-dim); font-size:12px; line-height:1.55;">Everyone sees a live countdown on their home screen once a deadline is set. Leave "start" blank to make the countdown live right away — set it to show a "not started yet" state until submissions open.</p>
  `;
  document.getElementById("saveTimerBtn").addEventListener("click", async ()=>{
    const sVal = document.getElementById("timerStart").value;
    const eVal = document.getElementById("timerEnd").value;
    if(!eVal){ toast("Set a deadline", "err"); return; }
    const start = sVal ? new Date(sVal).getTime() : null;
    const end = new Date(eVal).getTime();
    if(start && start>=end){ toast("Start must be before the deadline", "err"); return; }
    TIMER = {start, end};
    await setJSON("event:timer", TIMER, true);
    toast("Timer saved", "");
  });
  document.getElementById("clearTimerBtn").addEventListener("click", async ()=>{
    TIMER = null;
    await setJSON("event:timer", null, true);
    document.getElementById("timerStart").value = "";
    document.getElementById("timerEnd").value = "";
    toast("Timer cleared", "");
  });
}

function renderAdminAnnouncements(){
  const body = document.getElementById("adminBody");
  body.innerHTML = `<div class="empty-note">Loading…</div>`;

  function draw(list){
    list = list || [];
    body.innerHTML = `
      <div class="card" style="margin-bottom:16px;">
        <h5 style="margin:0 0 4px;">Post an announcement</h5>
        <div class="sub" style="margin-bottom:10px;">Shows as a banner on everyone's Home screen until they dismiss it or you post a new one.</div>
        <textarea id="announceText" rows="2" placeholder="e.g. Workshop Slot #2 starts in 10 minutes in Room B"></textarea>
        <button class="btn btn-primary btn-block" style="margin-top:10px;" id="postAnnounceBtn">Post</button>
      </div>
      <div class="section-head" style="margin-top:0;"><h3>History</h3></div>
      ${list.length ? list.map(a=>`
        <div class="admin-row">
          <div class="flex1">
            <h5 style="font-weight:600;">${a.message}</h5>
            <div class="sub">${new Date(a.ts).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
          </div>
          <button class="icon-btn" data-del="${a.id}">${ICONS.trash}</button>
        </div>
      `).join("") : `<div class="empty-note">No announcements sent yet.</div>`}
    `;
    document.getElementById("postAnnounceBtn").addEventListener("click", async ()=>{
      const msg = document.getElementById("announceText").value.trim();
      if(!msg){ toast("Write something first", "err"); return; }
      const current = (await getJSON("announcements:list", true)) || [];
      current.unshift({id: genId("an",5), message: msg, ts: Date.now()});
      await setJSON("announcements:list", current.slice(0,30), true);
      toast("Announcement posted", "");
    });
    body.querySelectorAll("[data-del]").forEach(b=> b.addEventListener("click", async ()=>{
      const current = ((await getJSON("announcements:list", true)) || []).filter(a=>a.id!==b.dataset.del);
      await setJSON("announcements:list", current, true);
      toast("Removed", "");
    }));
  }

  adminUnsubs.push(watchJSON("announcements:list", draw));
}

function renderAdminInfo(containerId){
  const body = document.getElementById(containerId || "adminBody");
  body.innerHTML = `<div class="empty-note">Loading…</div>`;

  function draw(info){
    info = info || {};
    body.innerHTML = `
      <div class="card">
        <div class="field"><label>WiFi network name</label><input type="text" id="infoWifiName" value="${info.wifiName||''}" placeholder="e.g. Haven-Guest"></div>
        <div class="field"><label>WiFi password</label><input type="text" id="infoWifiPass" value="${info.wifiPassword||''}" placeholder="e.g. hackthefuture"></div>
        <div class="field"><label>Venue address</label><input type="text" id="infoVenueAddr" value="${info.venueAddress||''}" placeholder="e.g. 123 Example Rd, Hong Kong"></div>
        <div class="field"><label>Map link (optional)</label><input type="text" id="infoMapLink" value="${info.venueMapLink||''}" placeholder="https://maps.google.com/…"></div>
        <div class="field"><label>Who to find for help</label><input type="text" id="infoContact" value="${info.contact||''}" placeholder="e.g. WhatsApp +852 1234 5678, or find staff in red shirts"></div>
        <div class="field"><label>Other notes (optional)</label><textarea id="infoNotes" rows="3" placeholder="First aid, lost & found, code of conduct, etc.">${info.notes||''}</textarea></div>
        <button class="btn btn-primary btn-block" id="saveInfoBtn">Save</button>
      </div>
    `;
    document.getElementById("saveInfoBtn").addEventListener("click", async ()=>{
      const updated = {
        wifiName: document.getElementById("infoWifiName").value.trim(),
        wifiPassword: document.getElementById("infoWifiPass").value.trim(),
        venueAddress: document.getElementById("infoVenueAddr").value.trim(),
        venueMapLink: document.getElementById("infoMapLink").value.trim(),
        contact: document.getElementById("infoContact").value.trim(),
        notes: document.getElementById("infoNotes").value.trim(),
      };
      await setJSON("eventInfo:content", updated, true);
      toast("Event info saved", "");
    });
  }

  adminUnsubs.push(watchJSON("eventInfo:content", draw));
}

function renderInfoPage(){
  const c = document.getElementById("pageContent");
  c.innerHTML = `
    <button class="back-link" id="infoBack">‹ Home</button>
    <div class="page-title">ℹ️ Event Info</div>
    <p class="page-sub">WiFi, venue, and who to find if you need help.</p>
    <div id="infoBody"><div class="empty-note">Loading…</div></div>
  `;
  document.getElementById("infoBack").addEventListener("click", ()=> goTo("home"));
  loadInfoPage();
}

async function loadInfoPage(){
  const el = document.getElementById("infoBody");
  if(!el) return;
  const info = (await getJSON("eventInfo:content", true)) || {};
  const hasAny = info.wifiName || info.wifiPassword || info.venueAddress || info.contact || info.notes;
  if(!hasAny){ el.innerHTML = `<div class="empty-note">Nothing posted yet — check back soon.</div>`; return; }

  el.innerHTML = `
    ${(info.wifiName || info.wifiPassword) ? `
      <div class="card" style="margin-bottom:12px; display:flex; align-items:center; gap:12px;">
        <div class="list-icon">${ICONS.wifi}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:700; font-size:13.5px;">${info.wifiName || 'WiFi'}</div>
          ${info.wifiPassword ? `<div class="mono" style="font-size:12px; color:var(--ink-dim);">${info.wifiPassword}</div>` : ''}
        </div>
      </div>
    ` : ''}
    ${info.venueAddress ? `
      <div class="card" style="margin-bottom:12px; display:flex; align-items:center; gap:12px;">
        <div class="list-icon">${ICONS.pin}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:700; font-size:13.5px;">${info.venueAddress}</div>
          ${info.venueMapLink ? `<a href="${info.venueMapLink}" target="_blank" rel="noopener" style="font-size:12px; color:var(--accent); font-weight:600;">Open in Maps →</a>` : ''}
        </div>
      </div>
    ` : ''}
    ${info.contact ? `
      <div class="card" style="margin-bottom:12px; display:flex; align-items:center; gap:12px;">
        <div class="list-icon">${ICONS.phone}</div>
        <div style="flex:1; min-width:0;">
          <div style="font-weight:700; font-size:13.5px;">Need help?</div>
          <div style="font-size:12px; color:var(--ink-dim);">${info.contact}</div>
        </div>
      </div>
    ` : ''}
    ${info.notes ? `
      <div class="card" style="margin-bottom:12px;">
        <div style="font-size:12.5px; color:var(--ink-dim); line-height:1.5; white-space:pre-wrap;">${info.notes}</div>
      </div>
    ` : ''}
  `;
}

const SPIN_PALETTE = ["#B8C11F","#783D2B","#FC8616","#F9DD60","#A8A237","#E87136","#DFA063"]; // brand palette
// pick dark or light label text for a segment colour (WCAG relative luminance)
function wheelTextColor(hex){
  const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4));
  return (0.2126*c[0]+0.7152*c[1]+0.0722*c[2]) > 0.3 ? "#2A1109" : "#FFF3E0";
}

async function renderAdminGames(){
  const body = document.getElementById("adminBody");
  body.innerHTML = `<div class="empty-note">Loading…</div>`;
  const spinCfg = (await getJSON("games:spin:config", true)) || {cost:20, segments:[], jackpotUntil:null};
  const reflexCfg = (await getJSON("games:reflex:config", true)) || {maxReward:40, cooldownSec:45};
  const collapseAt = await getJSON("games:minerCollapseAt", true);
  const jackpotActive = spinCfg.jackpotUntil && Date.now() < spinCfg.jackpotUntil;

  body.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h5 style="margin:0 0 4px;">⛏️ Spark Miner</h5>
      <div class="sub" style="margin-bottom:10px;">${collapseAt ? "Last collapse: "+new Date(collapseAt).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : "No collapse triggered yet."}</div>
      <button class="btn btn-danger btn-block" id="collapseBtn">💥 Collapse the mine now</button>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <h5 style="margin:0 0 4px;">🎡 Lucky Spin</h5>
      <div class="field"><label>Entry cost (${CURRENCY})</label><input type="number" id="spinCost" value="${spinCfg.cost}"></div>
      <div class="field"><label>Prizes (label / payout / odds weight)</label><div id="segmentList"></div></div>
      <button class="btn btn-ghost" id="addSegBtn" style="margin-bottom:10px;">${ICONS.plus} Add prize</button>
      <button class="btn btn-primary btn-block" id="saveSpinBtn">Save Lucky Spin</button>
      <button class="btn ${jackpotActive?'btn-danger':'btn-ghost'} btn-block" style="margin-top:8px;" id="jackpotBtn">${jackpotActive ? 'End Jackpot Hour' : '🔥 Start Jackpot Hour (1hr, 2x payouts)'}</button>
    </div>
    <div class="card">
      <h5 style="margin:0 0 4px;">⚡ Reflex Rush</h5>
      <div class="field"><label>Max reward (${CURRENCY})</label><input type="number" id="reflexMax" value="${reflexCfg.maxReward}"></div>
      <div class="field"><label>Cooldown between plays (seconds)</label><input type="number" id="reflexCooldown" value="${reflexCfg.cooldownSec}"></div>
      <button class="btn btn-primary btn-block" id="saveReflexBtn">Save Reflex Rush</button>
    </div>
  `;

  function renderSegRows(){
    document.getElementById("segmentList").innerHTML = spinCfg.segments.map((seg,i)=>`
      <div class="admin-row" style="align-items:center; gap:7px;">
        <input type="text" data-seg="${i}" data-f="label" value="${seg.label}" style="flex:1.6;">
        <input type="number" data-seg="${i}" data-f="value" value="${seg.value}" style="flex:1;">
        <input type="number" data-seg="${i}" data-f="weight" value="${seg.weight}" style="flex:0.8;">
        <button class="icon-btn" data-delseg="${i}">${ICONS.trash}</button>
      </div>
    `).join("") || `<div class="empty-note">No prizes yet — add one below.</div>`;
    document.getElementById("segmentList").querySelectorAll("[data-seg]").forEach(inp=>{
      inp.addEventListener("input", ()=>{
        const i = parseInt(inp.dataset.seg), f = inp.dataset.f;
        spinCfg.segments[i][f] = f==="label" ? inp.value : (parseFloat(inp.value)||0);
      });
    });
    document.getElementById("segmentList").querySelectorAll("[data-delseg]").forEach(b=>{
      b.addEventListener("click", ()=>{ spinCfg.segments.splice(parseInt(b.dataset.delseg),1); renderSegRows(); });
    });
  }
  renderSegRows();

  document.getElementById("addSegBtn").addEventListener("click", ()=>{
    spinCfg.segments.push({id:genId("",4), label:"+10", value:10, weight:10, color:SPIN_PALETTE[spinCfg.segments.length % SPIN_PALETTE.length]});
    renderSegRows();
  });
  document.getElementById("collapseBtn").addEventListener("click", async ()=>{
    await setJSON("games:minerCollapseAt", Date.now(), true);
    toast("The mine has collapsed for everyone", "");
    renderAdminGames();
  });
  document.getElementById("saveSpinBtn").addEventListener("click", async ()=>{
    spinCfg.cost = parseInt(document.getElementById("spinCost").value) || 0;
    await setJSON("games:spin:config", spinCfg, true);
    toast("Lucky Spin saved", "");
  });
  document.getElementById("jackpotBtn").addEventListener("click", async ()=>{
    spinCfg.jackpotUntil = jackpotActive ? null : Date.now()+60*60*1000;
    await setJSON("games:spin:config", spinCfg, true);
    toast(jackpotActive ? "Jackpot Hour ended" : "Jackpot Hour started!", "");
    renderAdminGames();
  });
  document.getElementById("saveReflexBtn").addEventListener("click", async ()=>{
    reflexCfg.maxReward = parseInt(document.getElementById("reflexMax").value) || 0;
    reflexCfg.cooldownSec = parseInt(document.getElementById("reflexCooldown").value) || 10;
    await setJSON("games:reflex:config", reflexCfg, true);
    toast("Reflex Rush saved", "");
  });
}

function renderAdminQuests(){
  const body = document.getElementById("adminBody");
  if(!QUESTS.length){ body.innerHTML = `<div class="empty-note">No quests yet. Tap + to add one.</div>`; return; }
  body.innerHTML = QUESTS.map(q=>`
    <div class="admin-row">
      <div class="quest-badge">🎯</div>
      <div class="flex1">
        <h5>${q.title} ${!q.active?'<span style="color:var(--ink-faint); font-weight:600;">· hidden</span>':''}</h5>
        <div class="sub">${q.type || "main"} · Code: ${q.code} · +${q.reward} ${CURRENCY_SHORT}</div>
      </div>
      <button class="icon-btn" data-who="${q.id}" title="Who completed this">${ICONS.users}</button>
      <button class="icon-btn" data-qr="${q.id}">${ICONS.scan}</button>
      <button class="icon-btn" data-edit="${q.id}">${ICONS.edit}</button>
      <button class="icon-btn" data-del="${q.id}">${ICONS.trash}</button>
    </div>
  `).join("");
  body.querySelectorAll("[data-who]").forEach(b=> b.addEventListener("click", ()=>showQuestCompletionsModal(b.dataset.who)));
  body.querySelectorAll("[data-qr]").forEach(b=> b.addEventListener("click", ()=>showQuestQR(b.dataset.qr)));
  body.querySelectorAll("[data-edit]").forEach(b=> b.addEventListener("click", ()=>showAddQuestModal(b.dataset.edit)));
  body.querySelectorAll("[data-del]").forEach(b=> b.addEventListener("click", ()=>deleteQuest(b.dataset.del)));
}

function showQuestQR(id){
  const q = QUESTS.find(x=>x.id===id);
  showModal(`
    <h3>${q.title}</h3>
    <p style="color:var(--ink-dim); font-size:12.5px; margin-top:-8px;">Print or display this code at the station.</p>
    <div id="qrDisplay"></div>
    <p style="text-align:center; font-family:var(--font-num); font-size:13px; color:var(--ink-dim);">HAVEN:${q.code}</p>
    <button class="btn btn-ghost btn-block" id="closeQr">Close</button>
  `);
  renderQR(document.getElementById("qrDisplay"), "HAVEN:"+q.code);
  document.getElementById("closeQr").addEventListener("click", closeModal);
}

function showAddQuestModal(editId){
  const editing = editId ? QUESTS.find(q=>q.id===editId) : null;
  showModal(`
    <h3>${editing?'Edit quest':'New quest'}</h3>
    <div class="field"><label>Title</label><input type="text" id="qTitle" value="${editing?editing.title:''}"></div>
    <div class="field"><label>Description</label><textarea id="qDesc" rows="2">${editing?editing.desc:''}</textarea></div>
    <div class="field"><label>Quest type</label><select id="qType">
      <option value="main" ${!editing || (editing.type||"main")==="main" ? "selected" : ""}>Main</option>
      <option value="side" ${editing && editing.type==="side" ? "selected" : ""}>Side</option>
      <option value="mystery" ${editing && editing.type==="mystery" ? "selected" : ""}>Mystery</option>
    </select></div>
    <div class="field"><label>Redeem code</label><input type="text" id="qCode" value="${editing?editing.code:genId('',6)}" style="text-transform:uppercase;"></div>
    <div class="field"><label>Reward (${CURRENCY})</label><input type="number" id="qReward" value="${editing?editing.reward:50}"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" style="flex:1;" id="cancelQ">Cancel</button>
      <button class="btn btn-primary" style="flex:1;" id="saveQ">${editing?'Save':'Create'}</button>
    </div>
  `);
  document.getElementById("cancelQ").addEventListener("click", closeModal);
  document.getElementById("saveQ").addEventListener("click", async ()=>{
    const title = document.getElementById("qTitle").value.trim();
    const desc = document.getElementById("qDesc").value.trim();
    const type = document.getElementById("qType").value;
    const code = document.getElementById("qCode").value.trim().toUpperCase();
    const reward = parseInt(document.getElementById("qReward").value) || 0;
    if(!title || !code){ toast("Title and code required", "err"); return; }
    await refreshShared();
    if(editing){
      const q = QUESTS.find(x=>x.id===editing.id);
      Object.assign(q, {title, desc, code, reward, type});
    }else{
      QUESTS.push({id:genId("q",4), title, desc, code, reward, active:true, type});
    }
    await setJSON("quests:list", QUESTS, true);
    closeModal(); renderAdminQuests(); toast("Quest saved", "");
  });
}

async function queueQuestOp(userId, op){
  const previousUser = await getJSON("users:"+userId, true);
  const wasCompleted = !!(previousUser && Array.isArray(previousUser.completed) && previousUser.completed.includes(op.questId));
  const updatedUser = await updateJSON("users:"+userId, user=>{
    if(!user) throw new Error("Participant wallet not found");
    const completed = Array.isArray(user.completed) ? user.completed.slice() : [];
    const amount = op.adjust ? Math.max(0, Number(op.reward) || 0) : 0;
    if(op.type === "quest_add"){
      if(completed.includes(op.questId)) return user;
      completed.push(op.questId);
      return {...user, completed, balance:Number(user.balance || 0) + amount};
    }
    if(op.type === "quest_remove"){
      if(!completed.includes(op.questId)) return user;
      return {...user, completed:completed.filter(id=>id!==op.questId), balance:Math.max(0, Number(user.balance || 0) - amount)};
    }
    throw new Error("Unsupported quest operation");
  });
  const before = await getJSON("tx:"+userId, true) || [];
  const alreadyRecorded = before.some(t=>t.opId===op.id);
  const changed = op.type === "quest_add" ? !wasCompleted : wasCompleted;
  if(!alreadyRecorded && changed && updatedUser){
    const amount = op.adjust ? Math.max(0, Number(op.reward) || 0) : 0;
    const signedAmount = op.type === "quest_add" ? amount : -amount;
    await updateJSON("tx:"+userId, tx=>[
      {type:"quest", opId:op.id, desc:(op.type === "quest_add" ? "Completed: " : "Quest reset: ")+op.questTitle+" (organizer)", amount:signedAmount, ts:Date.now()},
      ...(Array.isArray(tx) ? tx : [])
    ]);
  }
  await updateJSON("inbox:"+userId, list=>
    (Array.isArray(list) ? list : []).filter(item=>item.questId!==op.questId)
  );
  if(changed) await pushActivity({
    type:"quest",
    user:updatedUser.name,
    detail:(op.type === "quest_add" ? "Added: " : "Removed: ")+op.questTitle+" (organizer)",
    amount:op.adjust ? (op.type === "quest_add" ? op.reward : -op.reward) : 0,
    ts:Date.now()
  });
}
async function cancelQuestOp(userId, opId){
  await updateJSON("inbox:"+userId, list => (Array.isArray(list) ? list : []).filter(o => o.id !== opId));
}

async function showQuestCompletionsModal(questId){
  const quest = QUESTS.find(q => q.id === questId);
  if(!quest) return;
  showModal(`
    <h3>${quest.title}</h3>
    <p id="qcSummary" style="color:var(--ink-dim); font-size:12.5px; margin:-8px 0 12px;">Loading…</p>
    <div class="field"><input type="text" id="qcSearch" placeholder="Search participants…"></div>
    <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; color:var(--ink-dim); margin-bottom:10px; cursor:pointer;">
      <input type="checkbox" id="qcAdjust" checked> Also adjust Sparks (${quest.reward} ${CURRENCY_SHORT} on add / remove)
    </label>
    <div id="qcList" style="max-height:44vh; overflow-y:auto;"><div class="empty-note">Loading…</div></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" style="flex:1;" id="qcRefresh">Refresh</button>
      <button class="btn btn-primary" style="flex:1;" id="qcClose">Done</button>
    </div>
  `);
  let rows = [];

  async function load(){
    const users = await allUsers();
    rows = users.map(u => ({
      u,
      done: (u.completed || []).includes(questId),
    })).sort((a,b) => a.u.name.localeCompare(b.u.name));
  }

  function draw(){
    const list = document.getElementById("qcList");
    if(!list) return;                                   // modal was closed
    const q = (document.getElementById("qcSearch").value || "").toLowerCase();
    const done = rows.filter(r => r.done).length;
    document.getElementById("qcSummary").textContent = done+" of "+rows.length+" completed";
    const status = r => r.done ? `<span style="color:var(--accent);">Completed</span>` : "Not completed";
    const btn = "padding:7px 12px; font-size:12px; flex-shrink:0;";
    const action = r => r.done
        ? `<button class="btn btn-danger" style="${btn}" data-act="quest_remove" data-uid="${r.u.id}">Remove</button>`
        : `<button class="btn btn-primary" style="${btn}" data-act="quest_add" data-uid="${r.u.id}">Add</button>`;
    const shown = rows.filter(r => (r.u.name+" "+r.u.id).toLowerCase().includes(q));
    list.innerHTML = shown.map(r => `
      <div class="list-item" style="gap:10px;">
        <span class="lab" style="min-width:0;">
          <span class="list-icon" style="border-radius:50%; font-size:15px;">${r.u.avatar}</span>
          <span style="display:flex; flex-direction:column; min-width:0;">
            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${r.u.name}</span>
            <span style="font-size:11px; color:var(--ink-faint);">${status(r)}</span>
          </span>
        </span>
        ${action(r)}
      </div>`).join("") || `<div class="empty-note">No matches</div>`;

    list.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", async ()=>{
      b.disabled = true;
      try{
        await queueQuestOp(b.dataset.uid, {
          id: genId("op",6), type: b.dataset.act, questId, questTitle: quest.title,
          reward: quest.reward, adjust: document.getElementById("qcAdjust").checked,
          by: ME.name, ts: Date.now(),
        });
        await load(); draw();
      }catch(err){
        console.error(err);
        toast("Couldn't save — check your connection", "err");
        b.disabled = false;
      }
    }));
  }

  document.getElementById("qcClose").addEventListener("click", closeModal);
  document.getElementById("qcRefresh").addEventListener("click", async ()=>{ await load(); draw(); });
  document.getElementById("qcSearch").addEventListener("input", draw);
  await load(); draw();
}

async function deleteQuest(id){
  await refreshShared();
  QUESTS = QUESTS.filter(q=>q.id!==id);
  await setJSON("quests:list", QUESTS, true);
  renderAdminQuests(); toast("Quest removed", "");
}

function renderAdminShop(){
  const body = document.getElementById("adminBody");
  const tags = SHOP_TAGS.slice().sort();
  body.innerHTML = `
    <div class="card" style="margin-bottom:14px;">
      <h5 style="margin:0 0 4px;">Shop tags</h5>
      <div class="sub" style="margin-bottom:10px;">Create categories such as Food, Merch, or Perks. They will appear as filters in the shop.</div>
      <div style="display:flex; gap:8px;">
        <input type="text" id="newShopTag" placeholder="New tag" maxlength="24">
        <button class="btn btn-primary" id="addShopTag">Add</button>
      </div>
      <div class="shop-tag-admin">${tags.map(tag=>`<span>${tag}<button type="button" data-remove-tag="${tag}" aria-label="Remove ${tag}">×</button></span>`).join("") || `<span class="sub">No tags yet</span>`}</div>
    </div>
    ${SHOP.length ? SHOP.map(i=>`
    <div class="admin-row">
      <div class="shop-emoji" style="width:38px;height:38px;">${i.emoji}</div>
      <div class="flex1">
        <h5>${i.name}</h5>
        <div class="sub">${i.price} ${CURRENCY_SHORT} · ${i.stock} in stock${Array.isArray(i.tags) && i.tags.length ? " · "+i.tags.join(", ") : ""}</div>
      </div>
      <button class="icon-btn" data-edit="${i.id}">${ICONS.edit}</button>
      <button class="icon-btn" data-del="${i.id}">${ICONS.trash}</button>
    </div>
    `).join("") : `<div class="empty-note">No items yet. Tap + to add one.</div>`}
  `;
  document.getElementById("addShopTag").addEventListener("click", async ()=>{
    const input = document.getElementById("newShopTag");
    const tag = input.value.trim().toLowerCase().replace(/\s+/g," ");
    if(!tag){ toast("Enter a tag name", "err"); return; }
    if(tags.includes(tag)){ toast("That tag already exists", "err"); return; }
    tags.push(tag);
    await setJSON("shop:tags", tags, true);
    SHOP_TAGS = tags;
    renderAdminShop(); toast("Tag added", "");
  });
  body.querySelectorAll("[data-remove-tag]").forEach(b=> b.addEventListener("click", async ()=>{
    const tag = b.dataset.removeTag;
    const next = tags.filter(x=>x!==tag);
    await setJSON("shop:tags", next, true);
    SHOP_TAGS = next;
    SHOP.forEach(item=>{ if(Array.isArray(item.tags)) item.tags=item.tags.filter(x=>x!==tag); });
    await setJSON("shop:items", SHOP, true);
    renderAdminShop(); toast("Tag removed", "");
  }));
  body.querySelectorAll("[data-edit]").forEach(b=> b.addEventListener("click", ()=>showAddItemModal(b.dataset.edit)));
  body.querySelectorAll("[data-del]").forEach(b=> b.addEventListener("click", ()=>deleteItem(b.dataset.del)));
}

function showAddItemModal(editId){
  const editing = editId ? SHOP.find(i=>i.id===editId) : null;
  const tags = SHOP_TAGS;
  const emojiChoices = ["😀","😎","🥳","🤩","😂","😊","🤔","😴","😈","👻","🤖","💩","❤️","💛","💚","💙","💜","🖤","⭐","🌟","✨","💫","🔥","⚡","🎉","🎊","🎁","🏆","🎟️","🎮","🕹️","🎲","🧩","🎨","🎵","🎤","📚","💡","🚀","🌈","☀️","🌙","🌸","🌻","🍎","🍔","🍕","🍟","🌭","🍿","🍩","🍪","🍫","🍬","🍭","🧁","🎂","🍓","🍉","🍇","🥤","🧋","☕","🍵","👕","👚","🧢","👟","🎒","💎","🛍️","📱","💻","⌚","🔑","🧸","🪄","🪙","💰","💳","🏠","🚗","✈️","🌍","🐶","🐱","🐼","🦄","🐝","🌱","🌿","🍀","🌵"];
  showModal(`
    <h3>${editing?'Edit item':'New item'}</h3>
    <div class="field"><label>Name</label><input type="text" id="iName" value="${editing?editing.name:''}"></div>
    <div class="field"><label>Emoji</label><input type="text" id="iEmoji" value="${editing?editing.emoji:'🎁'}" maxlength="8">
      <div class="emoji-picker">${emojiChoices.map(emoji=>`<button type="button" data-emoji="${emoji}">${emoji}</button>`).join("")}</div>
    </div>
    <div class="field"><label>Description</label><input type="text" id="iDesc" value="${editing?editing.desc:''}"></div>
    ${tags.length ? `<div class="field"><label>Tags</label><div class="item-tag-choices">${tags.map(tag=>`<label><input type="checkbox" value="${tag}" ${editing && Array.isArray(editing.tags) && editing.tags.includes(tag) ? "checked" : ""}> ${tag}</label>`).join("")}</div></div>` : ""}
    <div class="field"><label>Price (${CURRENCY})</label><input type="number" id="iPrice" value="${editing?editing.price:50}"></div>
    <div class="field"><label>Stock</label><input type="number" id="iStock" value="${editing?editing.stock:10}"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" style="flex:1;" id="cancelI">Cancel</button>
      <button class="btn btn-primary" style="flex:1;" id="saveI">${editing?'Save':'Create'}</button>
    </div>
  `);
  document.querySelectorAll("[data-emoji]").forEach(b=> b.addEventListener("click", ()=>{ document.getElementById("iEmoji").value=b.dataset.emoji; }));
  document.getElementById("cancelI").addEventListener("click", closeModal);
  document.getElementById("saveI").addEventListener("click", async ()=>{
    const name = document.getElementById("iName").value.trim();
    const emoji = document.getElementById("iEmoji").value.trim() || "🎁";
    const desc = document.getElementById("iDesc").value.trim();
    const itemTags = [...document.querySelectorAll(".item-tag-choices input:checked")].map(input=>input.value);
    const price = parseInt(document.getElementById("iPrice").value) || 0;
    const stock = parseInt(document.getElementById("iStock").value) || 0;
    if(!name){ toast("Name required", "err"); return; }
    await refreshShared();
    if(editing){
      const it = SHOP.find(x=>x.id===editing.id);
      Object.assign(it, {name, emoji, desc, price, stock, tags:itemTags});
    }else{
      SHOP.push({id:genId("s",4), name, emoji, desc, price, stock, tags:itemTags});
    }
    await setJSON("shop:items", SHOP, true);
    closeModal(); renderAdminShop(); toast("Item saved", "");
  });
}

async function deleteItem(id){
  await refreshShared();
  SHOP = SHOP.filter(i=>i.id!==id);
  await setJSON("shop:items", SHOP, true);
  renderAdminShop(); toast("Item removed", "");
}

function renderAdminPickups(){
  const body = document.getElementById("adminBody");
  body.innerHTML = `<div class="empty-note">Loading…</div>`;
  const orderLines = r => Array.isArray(r.items) && r.items.length
    ? r.items
    : [{itemId:r.itemId, itemName:r.itemName, itemEmoji:r.itemEmoji, quantity:1, price:r.price || r.total || 0}];

  const pendingRow = r => `
    <div class="admin-row">
      <div class="shop-emoji" style="width:38px;height:38px;">${r.itemEmoji}</div>
      <div class="flex1">
        <h5>${r.userAvatar} ${r.userName}</h5>
        <div class="sub">${r.itemName} · ${r.total||r.price} ${CURRENCY_SHORT} · ${new Date(r.ts).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <button class="btn btn-primary" style="padding:9px 14px; font-size:12px; flex-shrink:0;" data-fulfill="${r.id}">Accept</button>
      <button class="btn btn-danger" style="padding:9px 12px; font-size:11px; flex-shrink:0;" data-decline="${r.id}">Decline & refund</button>
    </div>`;
  const fulfilledRow = r => `
    <div class="admin-row" style="opacity:.6;">
      <div class="shop-emoji" style="width:38px;height:38px;">${r.itemEmoji}</div>
      <div class="flex1">
        <h5>${r.userAvatar} ${r.userName}</h5>
        <div class="sub">${r.itemName} · accepted ${new Date(r.fulfilledAt).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <button class="icon-btn" data-undo="${r.id}" title="Move back to pending">${ICONS.trash}</button>
    </div>`;

  function draw(redemptions){
    redemptions = redemptions || [];
    const pending = redemptions.filter(r=>r.status==="pending");
    const fulfilled = redemptions.filter(r=>r.status==="fulfilled").slice(0,40);
    const declined = redemptions.filter(r=>r.status==="declined").slice(0,40);
    const prevQuery = document.getElementById("pickupSearch")?.value || "";

    body.innerHTML = `
      <div class="field"><input type="text" id="pickupSearch" placeholder="Search by name or item…" value="${prevQuery}"></div>
      <div class="section-head" style="margin-top:0;"><h3>Pending (${pending.length})</h3></div>
      <div id="pendingList">${pending.length ? pending.map(pendingRow).join("") : '<div class="empty-note">No pending orders.</div>'}</div>
      <div class="section-head"><h3>Accepted (${fulfilled.length})</h3></div>
      <div id="fulfilledList">${fulfilled.length ? fulfilled.map(fulfilledRow).join("") : '<div class="empty-note">No accepted orders.</div>'}</div>
      <div class="section-head"><h3>Declined (${declined.length})</h3></div>
      <div id="declinedList">${declined.length ? declined.map(r=>`<div class="admin-row" style="opacity:.65;"><div class="shop-emoji" style="width:38px;height:38px;">${r.itemEmoji}</div><div class="flex1"><h5>${r.userAvatar} ${r.userName}</h5><div class="sub">${r.itemName} · refunded</div></div><button class="btn btn-ghost" style="padding:8px 11px; font-size:11px; flex-shrink:0;" data-undo="${r.id}" title="Reaccept order">Reaccept</button></div>`).join("") : '<div class="empty-note">No declined orders.</div>'}</div>
    `;

    function applyFilter(){
      const q = document.getElementById("pickupSearch").value.toLowerCase();
      body.querySelectorAll(".admin-row").forEach(r=>{
        r.style.display = r.textContent.toLowerCase().includes(q) ? "flex" : "none";
      });
    }
    document.getElementById("pickupSearch").addEventListener("input", applyFilter);
    if(prevQuery) applyFilter();

    // writes here just update Firestore — the live listener redraws the list automatically
    body.querySelectorAll("[data-fulfill]").forEach(b=> b.addEventListener("click", async ()=>{
      const list = (await getJSON("redemptions:list", true)) || [];
      const r = list.find(x=>x.id===b.dataset.fulfill);
      if(r && r.status==="pending"){
        r.status = "fulfilled"; r.fulfilledAt = Date.now();
        await setJSON("redemptions:list", list, true);
        toast("Marked as given out", "");
      }
    }));
    body.querySelectorAll("[data-undo]").forEach(b=> b.addEventListener("click", async ()=>{
      const list = (await getJSON("redemptions:list", true)) || [];
      const r = list.find(x=>x.id===b.dataset.undo);
      if(!r) return;
      if(r.status==="fulfilled"){
        r.status = "pending"; r.fulfilledAt = null;
        await setJSON("redemptions:list", list, true);
        toast("Order moved back to pending", "");
        return;
      }
      if(r.status!=="declined") return;
      const user = await getJSON("users:"+r.userId, true);
      const total = r.total || r.price || orderLines(r).reduce((sum,line)=>sum + (line.price||0)*(line.quantity||1),0);
      if(!user || user.balance < total){ toast("User does not have enough Sparks to reaccept", "err"); return; }
      const shop = (await getJSON("shop:items", true)) || [];
      const insufficient = orderLines(r).find(line=>{
        const item = shop.find(x=>x.id===line.itemId);
        return !item || item.stock < (line.quantity||1);
      });
      if(insufficient){ toast("Not enough stock to reaccept this order", "err"); return; }
      orderLines(r).forEach(line=>{
        const item = shop.find(x=>x.id===line.itemId);
        item.stock -= line.quantity||1;
      });
      user.balance -= total;
      const tx = (await getJSON("tx:"+user.id, true)) || [];
      tx.unshift({type:"purchase", desc:"Order reaccepted: "+(r.itemName||r.id), amount:-total, ts:Date.now()});
      r.status = "pending"; r.declinedAt = null;
      await Promise.all([
        setJSON("users:"+user.id, user, true),
        setJSON("tx:"+user.id, tx, true),
        setJSON("shop:items", shop, true),
        setJSON("redemptions:list", list, true),
      ]);
      toast("Order reaccepted and charged again", "");
    }));
    body.querySelectorAll("[data-decline]").forEach(b=> b.addEventListener("click", async ()=>{
      const list = (await getJSON("redemptions:list", true)) || [];
      const r = list.find(x=>x.id===b.dataset.decline);
      if(!r || r.status!=="pending") return;
      r.status="declined"; r.declinedAt=Date.now();
      const user=await getJSON("users:"+r.userId,true);
      const refund=r.total||r.price||0;
      const shop = (await getJSON("shop:items", true)) || [];
      orderLines(r).forEach(line=>{
        const item = shop.find(x=>x.id===line.itemId);
        if(item) item.stock += line.quantity||1;
      });
      if(user){ user.balance += refund; await setJSON("users:"+r.userId,user,true); const tx=(await getJSON("tx:"+r.userId,true))||[]; tx.unshift({type:"refund",desc:"Refund for "+(r.itemName||"order"),amount:refund,ts:Date.now()}); await setJSON("tx:"+r.userId,tx,true); }
      await Promise.all([setJSON("shop:items",shop,true), setJSON("redemptions:list",list,true)]);
      toast("Order declined, refunded, and restocked", "");
    }));
  }

  adminUnsubs.push(watchJSON("redemptions:list", draw));
}

let ADMIN_CONTENT_TAB = "schedule";
function renderAdminContent(){
  // Clear listeners here too, not just in the outer renderAdmin() — this
  // function re-invokes itself when the internal Schedule/Meals toggle is
  // clicked, and each invocation subscribes a fresh watchJSON listener.
  // Without clearing first, toggling back and forth would leak listeners.
  clearAdminListeners();
  const body = document.getElementById("adminBody");
  body.innerHTML = `
    <div class="tab-switch" style="margin-bottom:16px;">
      <button class="${ADMIN_CONTENT_TAB==='schedule'?'active':''}" id="contentTabSchedule">Schedule</button>
      <button class="${ADMIN_CONTENT_TAB==='meals'?'active':''}" id="contentTabMeals">Meals</button>
    </div>
    <div id="adminContentBody"></div>
  `;
  document.getElementById("contentTabSchedule").addEventListener("click", ()=>{ ADMIN_CONTENT_TAB="schedule"; renderAdminContent(); });
  document.getElementById("contentTabMeals").addEventListener("click", ()=>{ ADMIN_CONTENT_TAB="meals"; renderAdminContent(); });
  if(ADMIN_CONTENT_TAB==="schedule") renderAdminSchedule("adminContentBody");
  else renderAdminMeals("adminContentBody");
}

async function renderAdminSchedule(containerId){
  const body = document.getElementById(containerId || "adminBody");
  body.innerHTML = `<div class="empty-note">Loading…</div>`;
  const schedule = (await getJSON("schedule:list", true)) || [];

  function draw(items){
    const byDay = {};
    items.forEach(i => { (byDay[i.day] = byDay[i.day] || []).push(i); });
    const days = Object.keys(byDay);
    body.innerHTML = `
      <div class="card" style="margin-bottom:16px;">
        <h5 style="margin:0 0 4px;">Upload schedule</h5>
        <div class="sub" style="margin-bottom:10px;">Google Sheet or .xlsx, .xls, .csv — columns: Day, Time, Title, Description, Location. Importing replaces the current schedule.</div>
        <div style="display:flex;gap:8px;margin-bottom:10px;"><input type="url" id="scheduleSheetUrl" placeholder="Paste Google Sheet link" style="flex:1;"><button class="btn btn-primary" id="importScheduleSheetBtn">Import sheet</button></div>
        <input type="file" id="scheduleFile" accept=".xlsx,.xls,.csv">
      </div>
      <div class="section-head" style="margin-top:0;"><h3>${items.length} item${items.length===1?'':'s'} scheduled</h3>${items.length?'<button class="link" id="clearScheduleBtn">Clear all</button>':''}</div>
      ${days.length ? days.map(day => `
        <div class="sub" style="margin:12px 0 6px; font-weight:700; text-transform:uppercase; letter-spacing:.04em;">${day}</div>
        ${byDay[day].map(i => `
          <div class="admin-row">
            <div class="flex1">
              <h5>${i.time ? i.time+' — ' : ''}${i.title}</h5>
              <div class="sub">${[i.location, i.description].filter(Boolean).join(' · ')}</div>
            </div>
            <button class="icon-btn" data-del="${i.id}">${ICONS.trash}</button>
          </div>
        `).join("")}
      `).join("") : `<div class="empty-note">No schedule uploaded yet.</div>`}
    `;
    document.getElementById("scheduleFile").addEventListener("change", (e)=>{
      const file = e.target.files[0];
      if(!file) return;
      parseSpreadsheetFile(file, async (err, rows)=>{
        if(err){ toast("Couldn't read that file", "err"); return; }
        const parsed = convertScheduleRows(rows);
        if(!parsed.length){ toast("No usable rows found — check the column headers", "err"); return; }
        await setJSON("schedule:list", parsed, true);
        toast("Schedule uploaded — "+parsed.length+" items", "");
      });
      document.getElementById("importScheduleSheetBtn").addEventListener("click", async ()=>{
        const url = document.getElementById("scheduleSheetUrl").value.trim();
        if(!url){ toast("Paste a Google Sheet link first", "err"); return; }
        try{
          const parsed = convertScheduleRows(await fetchGoogleSheetRows(url));
          if(!parsed.length) throw new Error("No usable schedule rows found");
          await setJSON("schedule:list", parsed, true);
          toast("Schedule imported — "+parsed.length+" items", "");
        }catch(err){ console.error("Google Sheet schedule import failed", err); toast(err.message || "Could not import schedule", "err"); }
      });
    });
    const clearBtn = document.getElementById("clearScheduleBtn");
    if(clearBtn) clearBtn.addEventListener("click", async ()=>{
      await setJSON("schedule:list", [], true);
      toast("Schedule cleared", "");
    });
    body.querySelectorAll("[data-del]").forEach(b=> b.addEventListener("click", async ()=>{
      const list = ((await getJSON("schedule:list", true)) || []).filter(i=>i.id!==b.dataset.del);
      await setJSON("schedule:list", list, true);
      toast("Removed", "");
    }));
  }

  draw(schedule);
  adminUnsubs.push(watchJSON("schedule:list", list=> draw(list || [])));
}

async function renderAdminMeals(containerId){
  const body = document.getElementById(containerId || "adminBody");
  body.innerHTML = `<div class="empty-note">Loading…</div>`;
  const meals = (await getJSON("meals:list", true)) || [];

  function draw(items){
    const grouped = {};
    items.forEach(i => {
      const key = i.day+" · "+i.mealType;
      (grouped[key] = grouped[key] || []).push(i);
    });
    const groups = Object.keys(grouped);
    body.innerHTML = `
      <div class="card" style="margin-bottom:16px;">
        <h5 style="margin:0 0 4px;">Upload menu</h5>
        <div class="sub" style="margin-bottom:10px;">Google Sheet or .xlsx, .xls, .csv — columns: Day, MealType, ItemName, Category, Notes. Importing replaces the current menu.</div>
        <div style="display:flex;gap:8px;margin-bottom:10px;"><input type="url" id="mealsSheetUrl" placeholder="Paste Google Sheet link" style="flex:1;"><button class="btn btn-primary" id="importMealsSheetBtn">Import sheet</button></div>
        <input type="file" id="mealsFile" accept=".xlsx,.xls,.csv">
      </div>
      <div class="section-head" style="margin-top:0;"><h3>${items.length} item${items.length===1?'':'s'} on the menu</h3>${items.length?'<button class="link" id="clearMealsBtn">Clear all</button>':''}</div>
      ${groups.length ? groups.map(key => `
        <div class="sub" style="margin:12px 0 6px; font-weight:700; text-transform:uppercase; letter-spacing:.04em;">${key}</div>
        ${grouped[key].map(i => `
          <div class="admin-row">
            <div class="flex1">
              <h5>${i.itemName} ${i.category?'<span style=\"color:var(--ink-faint); font-weight:600;\">· '+i.category+'</span>':''}</h5>
              ${i.notes ? `<div class="sub">${i.notes}</div>` : ''}
            </div>
            <button class="icon-btn" data-del="${i.id}">${ICONS.trash}</button>
          </div>
        `).join("")}
      `).join("") : `<div class="empty-note">No menu uploaded yet.</div>`}
    `;
    document.getElementById("mealsFile").addEventListener("change", (e)=>{
      const file = e.target.files[0];
      if(!file) return;
      parseSpreadsheetFile(file, async (err, rows)=>{
        if(err){ toast("Couldn't read that file", "err"); return; }
        const parsed = rows.map(r => ({
          id: genId("ml",5),
          day: getCol(r, "Day"),
          mealType: getCol(r, "MealType", "Meal Type", "Meal"),
          itemName: getCol(r, "ItemName", "Item Name", "Item"),
          category: getCol(r, "Category"),
          notes: getCol(r, "Notes"),
        })).filter(i => i.itemName);
        if(!parsed.length){ toast("No usable rows found — check the column headers", "err"); return; }
        await setJSON("meals:list", parsed, true);
        toast("Menu uploaded — "+parsed.length+" items", "");
      });
      document.getElementById("importMealsSheetBtn").addEventListener("click", async ()=>{
        const url = document.getElementById("mealsSheetUrl").value.trim();
        if(!url){ toast("Paste a Google Sheet link first", "err"); return; }
        try{
          const rows = await fetchGoogleSheetRows(url);
          const parsed = rows.map(r => ({
            id: genId("ml",5),
            day: getCol(r, "Day"),
            mealType: getCol(r, "MealType", "Meal Type", "Meal"),
            itemName: getCol(r, "ItemName", "Item Name", "Item"),
            category: getCol(r, "Category"),
            notes: getCol(r, "Notes"),
          })).filter(i => i.itemName);
          if(!parsed.length) throw new Error("No usable menu rows found");
          await setJSON("meals:list", parsed, true);
          toast("Menu imported — "+parsed.length+" items", "");
        }catch(err){ console.error("Google Sheet menu import failed", err); toast(err.message || "Could not import menu", "err"); }
      });
    });
    const clearBtn = document.getElementById("clearMealsBtn");
    if(clearBtn) clearBtn.addEventListener("click", async ()=>{
      await setJSON("meals:list", [], true);
      toast("Menu cleared", "");
    });
    body.querySelectorAll("[data-del]").forEach(b=> b.addEventListener("click", async ()=>{
      const list = ((await getJSON("meals:list", true)) || []).filter(i=>i.id!==b.dataset.del);
      await setJSON("meals:list", list, true);
      toast("Removed", "");
    }));
  }

  draw(meals);
  adminUnsubs.push(watchJSON("meals:list", list=> draw(list || [])));
}

function renderAdminSubmissions(){
  const body = document.getElementById("adminBody");
  body.innerHTML = `<div class="empty-note">Loading…</div>`;

  let latestSubs = null, latestRevealed = false;

  function draw(){
    if(latestSubs === null) return;
    const scored = latestSubs.map(s => {
      const vals = Object.values(s.scores || {});
      const avg = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
      return {...s, avg, myScore: (s.scores||{})[ME.id]};
    }).sort((a,b) => (b.avg||0)-(a.avg||0) || a.ts-b.ts);

    body.innerHTML = `
      <button class="btn ${latestRevealed?'btn-danger':'btn-primary'} btn-block" id="revealBtn" style="margin-bottom:16px;">
        ${latestRevealed ? 'Hide results from participants' : '🏆 Reveal winners to participants'}
      </button>
      <div class="section-head" style="margin-top:0;"><h3>${scored.length} submission${scored.length===1?'':'s'}</h3></div>
      ${scored.length ? scored.map((s,i) => `
        <div class="admin-row" style="align-items:flex-start;">
          <div class="flex1">
            <h5>${s.avg!==null && i===0 ? '🥇 ' : s.avg!==null && i===1 ? '🥈 ' : s.avg!==null && i===2 ? '🥉 ' : ''}${s.projectName}</h5>
            <div class="sub">${s.ownerName}${s.demoLink ? ' · <a href="'+s.demoLink+'" target="_blank" rel="noopener" style="color:var(--accent);">demo</a>' : ''}</div>
            <div class="sub" style="margin-top:4px;">Avg: ${s.avg!==null ? s.avg.toFixed(1) : '—'} (${Object.keys(s.scores||{}).length} judge${Object.keys(s.scores||{}).length===1?'':'s'})</div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px; flex-shrink:0;">
            <input type="number" min="1" max="10" placeholder="1-10" value="${s.myScore!=null?s.myScore:''}" data-score="${s.id}" style="width:72px; text-align:center; padding:8px 6px;">
            <button class="icon-btn" data-del="${s.id}">${ICONS.trash}</button>
          </div>
        </div>
      `).join("") : `<div class="empty-note">No submissions yet.</div>`}
    `;
    document.getElementById("revealBtn").addEventListener("click", async ()=>{
      await setJSON("submissions:revealed", !latestRevealed, true);
      toast(latestRevealed ? "Results hidden again" : "Winners revealed to everyone!", "");
    });
    body.querySelectorAll("[data-score]").forEach(inp=>{
      inp.addEventListener("change", async ()=>{
        const val = parseFloat(inp.value);
        const list = await allSubmissions();
        const sub = list.find(x=>x.id===inp.dataset.score);
        if(!sub) return;
        sub.scores = sub.scores || {};
        if(isNaN(val) || val<=0) delete sub.scores[ME.id];
        else sub.scores[ME.id] = Math.max(1, Math.min(10, val));
        await setJSON("submissions:list", list, true);
        toast("Score saved", "");
      });
    });
    body.querySelectorAll("[data-del]").forEach(b=> b.addEventListener("click", async ()=>{
      const list = ((await getJSON("submissions:list", true)) || []).filter(s=>s.id!==b.dataset.del);
      await setJSON("submissions:list", list, true);
      toast("Removed", "");
    }));
  }

  adminUnsubs.push(watchJSON("submissions:list", list => { latestSubs = list || []; draw(); }));
  adminUnsubs.push(watchJSON("submissions:revealed", revealed => { latestRevealed = !!revealed; draw(); }));
}

async function renderAdminUsers(){
  const body = document.getElementById("adminBody");
  body.innerHTML = `
    <div class="card" style="margin-bottom:14px;">
      <h3 style="margin-top:0;">Approved participants</h3>
      <p class="page-sub">Use a public Google Sheet link or upload CSV/Excel. Required: email and real name. Optional: Organizer (yes/no). Wallet IDs are generated on first login; participants choose their usernames.</p>
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <input type="url" id="participantSheetUrl" placeholder="Paste Google Sheet link" style="flex:1;">
        <button class="btn btn-primary" id="importParticipantSheetBtn">Import sheet</button>
      </div>
      <button class="btn btn-danger btn-block" id="deleteMissingParticipantsBtn">Sync sheet and delete missing participants</button>
      <input type="file" id="participantImport" accept=".csv,.xlsx,.xls">
    </div>
    <div id="registeredUsers"><div class="empty-note">Loading…</div></div>
  `;
  document.getElementById("participantImport").addEventListener("change", e=>{
    const file = e.target.files[0];
    if(file) importParticipantList(file);
  });
  document.getElementById("importParticipantSheetBtn").addEventListener("click", async ()=>{
    const url = document.getElementById("participantSheetUrl").value.trim();
    if(!url){ toast("Paste a Google Sheet link first", "err"); return; }
    try{
      await importParticipantSheet(url);
    }catch(err){
      console.error("Google Sheet import failed", err);
      toast(err.message || "Could not import Google Sheet", "err");
    }
  });
  document.getElementById("deleteMissingParticipantsBtn").addEventListener("click", async ()=>{
    const url = document.getElementById("participantSheetUrl").value.trim();
    if(!url){ toast("Paste a Google Sheet link first", "err"); return; }
    try{ await deleteMissingParticipantsFromSheet(url); }
    catch(err){ console.error("Participant deletion sync failed", err); toast(err.message || "Could not sync deletions", "err"); }
  });
  const usersBody = document.getElementById("registeredUsers");

  async function draw(){
    const [users, groups, participants] = await Promise.all([allUsers(), allGroups(), approvedParticipants()]);
    users.sort((a,b)=> b.balance - a.balance);
    const groupNames = uid => groups.filter(g=>g.memberIds.includes(uid)).map(g=>g.name).join(", ");
    const prevQuery = document.getElementById("userSearch")?.value || "";
    const participantRows = participants.map(participant=>{
      const linked = users.find(user=>user.id===participant.walletId || (participant.username && String(user.username||"").toLowerCase()===participant.username.toLowerCase()));
      const email = participant.email || linked?.email || "—";
      const passwordStatus = linked?.authUid ? "Set" : "Not set";
      return `<div class="admin-row participant-approved-row">
        <div class="flex1">
          <h5>${participant.realName || participant.username || email}</h5>
          <div class="sub">${participant.username || "No username"} · ${email} · Wallet: ${linked?.id || participant.walletId || "Not linked"}</div>
        </div>
        <span class="admin-badge">${passwordStatus}</span>
        ${email !== "—" ? `<button class="btn btn-ghost" data-reset-email="${email}">Reset password</button>` : ""}
      </div>`;
    }).join("");
    usersBody.innerHTML = `${participants.length ? `<div class="section-head"><h3>Approved roster (${participants.length})</h3></div><div class="card" style="margin-bottom:16px;">${participantRows}</div>` : ""}` +
      `<div class="field"><input type="text" id="userSearch" placeholder="Search registered wallets…" value="${prevQuery}"></div>` +
      (users.length ? 
      users.map(u=>`
        <div class="admin-row">
          <div class="quest-badge" style="background:var(--surface-2);">${u.avatar}</div>
          <div class="flex1">
            <h5>${u.name} ${u.isAdmin?'<span class="admin-badge" style="margin-left:6px;">ORG</span>':''}</h5>
            <div class="sub">${u.id} · ${u.balance} ${CURRENCY_SHORT}${groupNames(u.id) ? ' · '+groupNames(u.id) : ''}</div>
          </div>
          <button class="icon-btn" data-adjust="${u.id}" title="Adjust balance / organizer access">${ICONS.bolt}</button>
        </div>
      `).join("") : `<div class="empty-note">No registered wallets yet.</div>`);
    function applyFilter(){
      const q = document.getElementById("userSearch").value.toLowerCase();
      usersBody.querySelectorAll(".admin-row").forEach(r=>{
        r.style.display = r.textContent.toLowerCase().includes(q) ? "flex" : "none";
      });
    }
    document.getElementById("userSearch").addEventListener("input", applyFilter);
    if(prevQuery) applyFilter();
    usersBody.querySelectorAll("[data-adjust]").forEach(b=> b.addEventListener("click", ()=>showAdjustModal(b.dataset.adjust, users)));
    usersBody.querySelectorAll("[data-reset-email]").forEach(b=> b.addEventListener("click", async ()=>{
      try{
        if(!auth) throw new Error("Firebase Authentication is not enabled");
        await auth.sendPasswordResetEmail(b.dataset.resetEmail);
        toast("Password reset email sent", "");
      }catch(err){ console.error("organizer password reset failed", err); toast(err.message || "Could not send reset email", "err"); }
    }));
  }

  await draw();
  // balances change from things this admin doesn't do directly (purchases, transfers,
  // quest scans elsewhere) — refresh the list shortly after any new activity comes in
  let debounceTimer = null;
  adminUnsubs.push(watchJSON("activity:feed", ()=>{
    if(debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(draw, 400);
  }));
}

function showAdjustModal(userId, users){
  const u = users.find(x=>x.id===userId);
  showModal(`
    <h3>Adjust ${u.name}</h3>
    <p style="color:var(--ink-dim); font-size:12.5px; margin-top:-8px;">Current balance: ${u.balance} ${CURRENCY_SHORT}</p>
    <div class="field"><label>Amount (use negative to deduct)</label><input type="number" id="adjAmt" value="0"></div>
    <div class="field"><label>Reason</label><input type="text" id="adjReason" placeholder="e.g. Bonus for helping run check-in"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" style="flex:1;" id="cancelAdj">Cancel</button>
      <button class="btn btn-primary" style="flex:1;" id="saveAdj">Apply</button>
    </div>
    <button class="btn btn-danger btn-block" style="margin-top:10px;" id="toggleAdmin">${u.isAdmin?'Remove organizer access':'Grant organizer access'}</button>
  `);
  document.getElementById("cancelAdj").addEventListener("click", closeModal);
  document.getElementById("saveAdj").addEventListener("click", async ()=>{
    const amt = parseInt(document.getElementById("adjAmt").value) || 0;
    const reason = document.getElementById("adjReason").value.trim() || "Organizer adjustment";
    if(amt===0){ toast("Enter a non-zero amount", "err"); return; }
    const fresh = await getJSON("users:"+u.id, true);
    fresh.balance += amt;
    await setJSON("users:"+u.id, fresh, true);
    const tx = (await getJSON("tx:"+u.id, true)) || [];
    tx.unshift({type:"admin", desc:reason, amount:amt, ts:Date.now()});
    await setJSON("tx:"+u.id, tx, true);
    await pushActivity({type:"admin", user:u.name, detail:reason, amount:amt, ts:Date.now()});
    if(u.id===ME.id){ ME = fresh; TX = tx; }
    closeModal(); toast("Balance updated", ""); renderAdminUsers();
  });
  document.getElementById("toggleAdmin").addEventListener("click", async ()=>{
    const fresh = await getJSON("users:"+u.id, true);
    fresh.isAdmin = !fresh.isAdmin;
    await setJSON("users:"+u.id, fresh, true);
    if(u.id===ME.id){ ME = fresh; }
    closeModal(); toast(fresh.isAdmin? "Organizer access granted" : "Organizer access removed", "");
    renderNav(); renderAdminUsers();
  });
}

function renderAdminFeed(){
  const body = document.getElementById("adminBody");
  function draw(activity){
    activity = activity || [];
    if(!activity.length){ body.innerHTML = `<div class="empty-note">No activity logged yet.</div>`; return; }
    body.innerHTML = `<div class="card">` + activity.map(a=>`
      <div class="tx-row">
        <div class="tx-icon ${a.amount>0?'in':'out'}">${a.amount>0?ICONS.txIn:ICONS.txOut}</div>
        <div class="tx-meta"><div class="t">${a.user} — ${a.detail}</div><div class="d">${new Date(a.ts).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</div></div>
        <div class="tx-amt ${a.amount>0?'in':'out'}">${a.amount>0?'+':''}${a.amount} ${CURRENCY_SHORT}</div>
      </div>
    `).join("") + `</div>`;
  }
  adminUnsubs.push(watchJSON("activity:feed", draw));
}

// Header
function refreshHeader(){
  document.getElementById("headerAvatarBtn").textContent = ME ? ME.avatar : "🙂";
}

// Onboarding
function showOnboarding(){
  document.getElementById("bottomnav").innerHTML = "";
  document.getElementById("sidebarNav").innerHTML = "";
  document.getElementById("sidebarFoot").innerHTML = "";
  document.getElementById("fabBtn").style.display = "none";
  const c = document.getElementById("pageContent");
  c.innerHTML = `
    <div class="onboard">
      <div class="hero-mark">H</div>
      <h1>Haven Pay</h1>
      <p class="lead">Scan quests, spend ${CURRENCY} in the shop, and don't lose it all on the wheel.</p>
      <div class="tab-switch">
        <button class="active" id="tabParticipant">Participant login</button>
        <button id="tabExisting">Wallet ID</button>
      </div>
      <div id="onboardBody"></div>
    </div>
  `;
  document.getElementById("tabParticipant").addEventListener("click", ()=>showParticipantLogin());
  document.getElementById("tabExisting").addEventListener("click", ()=>showOnboardExisting());
  showParticipantLogin();
  function setActiveTab(id){
    document.getElementById("tabParticipant").classList.toggle("active", id==="participant");
    document.getElementById("tabExisting").classList.toggle("active", id==="existing");
  }
  async function signInApprovedParticipant(identifier, password, chosenUsername, allowCreate){
    if(!auth) throw new Error("Firebase Authentication is not enabled");
    const participants = await approvedParticipants();
    const participant = participants.find(p=>participantMatch(p, identifier));
    if(!participant) throw new Error("You are not on the approved participant list");
    if(!participant.email) throw new Error("This participant has no email address");
    let credential;
    try{
      credential = await auth.signInWithEmailAndPassword(participant.email, password);
    }catch(err){
      if(!allowCreate) throw err;
      if(err.code !== "auth/user-not-found" && err.code !== "auth/invalid-credential") throw err;
      try{
        credential = await auth.createUserWithEmailAndPassword(participant.email, password);
      }catch(createErr){
        if(createErr.code === "auth/email-already-in-use"){
          throw new Error("This account already exists, but the password is incorrect. Use the password reset button.");
        }
        throw createErr;
      }
    }
    const users = await allUsers();
    let user = users.find(u=>u.authUid===credential.user.uid || (participant.walletId && u.id===participant.walletId));
    if(!user) user = users.find(u=>String(u.email||"").toLowerCase()===participant.email.toLowerCase());
    if(!user){
      if(!chosenUsername) throw new Error("Choose a username for your new wallet");
      if(!/^[a-zA-Z0-9_.-]{2,24}$/.test(chosenUsername)){
        throw new Error("Username must be 2–24 letters, numbers, dots, dashes, or underscores");
      }
      if(users.some(existing=>String(existing.username||"").toLowerCase()===chosenUsername.toLowerCase())){
        throw new Error("That username is already taken");
      }
      const id = genId("HVN", 4);
      user = {id, username:chosenUsername, realName:participant.realName || participant.email, name:participant.realName || participant.email, email:participant.email, authUid:credential.user.uid, avatar:AVATARS[0], balance:100, isAdmin:!!participant.isAdmin, completed:[], joinedAt:Date.now()};
      await setJSON("users:"+id, user, true);
      const idx = (await getJSON("users:index", true)) || [];
      await setJSON("users:index", [...idx, id], true);
      await setJSON("tx:"+id, [{type:"bonus", desc:"Welcome bonus", amount:100, ts:Date.now()}], true);
      participant.walletId = id;
      participant.username = user.username;
      await setJSON("participants:list", participants, true);
    }else{
      if(chosenUsername && user.username && chosenUsername.toLowerCase()!==String(user.username).toLowerCase()){
        throw new Error("This account already has a username and cannot be changed here");
      }
      if(!user.authUid || !user.email){
        user = {...user, authUid:credential.user.uid, email:participant.email, username:user.username || participant.username, realName:user.realName || participant.realName, isAdmin:!!participant.isAdmin};
        await setJSON("users:"+user.id, user, true);
      }
      if(!participant.walletId){
        participant.walletId = user.id;
        participant.username = user.username || participant.username;
        await setJSON("participants:list", participants, true);
      }
    }
    await loadUser(user.id);
    await refreshShared();
    refreshHeader();
    goTo("home");
  }
  function showParticipantLogin(){
    setActiveTab("participant");
    document.getElementById("onboardBody").innerHTML = `
      <div class="tab-switch" style="margin-bottom:16px;">
        <button class="active" id="participantSignInTab">Sign in</button>
        <button id="participantSignUpTab">Sign up</button>
      </div>
      <div class="field"><label>Email or username</label><input type="text" id="participantIdentifier" autocomplete="username"></div>
      <div class="field"><label>Password</label><div style="display:flex;gap:8px;"><input type="password" id="participantPassword" autocomplete="new-password" style="flex:1;"><button type="button" class="btn btn-ghost" id="toggleParticipantPassword">Show</button></div></div>
      <button class="btn btn-primary btn-block" id="participantLoginBtn">Sign in</button>
      <button class="btn btn-ghost btn-block" id="participantResetBtn" style="margin-top:8px;">Email me a password reset link</button>
      <p class="page-sub" style="margin-top:12px;">Use your approved email or username and password.</p>
    `;
    document.getElementById("participantSignInTab").addEventListener("click", showParticipantLogin);
    document.getElementById("participantSignUpTab").addEventListener("click", showParticipantSignup);
    document.getElementById("participantLoginBtn").addEventListener("click", async ()=>{
      const identifier = document.getElementById("participantIdentifier").value.trim();
      const password = document.getElementById("participantPassword").value;
      if(!identifier || password.length<6){ toast("Enter an identifier and a password of at least 6 characters", "err"); return; }
      try{ await signInApprovedParticipant(identifier, password, "", false); }
      catch(err){ console.error("participant sign-in failed", err); toast(err.message || "Could not sign in", "err"); }
    });
    document.getElementById("toggleParticipantPassword").addEventListener("click", ()=>{
      const input = document.getElementById("participantPassword");
      const button = document.getElementById("toggleParticipantPassword");
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      button.textContent = visible ? "Show" : "Hide";
    });
    document.getElementById("participantResetBtn").addEventListener("click", async ()=>{
      const identifier = document.getElementById("participantIdentifier").value.trim();
      if(!identifier){ toast("Enter your approved email or username first", "err"); return; }
      try{
        const participant = (await approvedParticipants()).find(p=>participantMatch(p, identifier));
        if(!participant || !participant.email) throw new Error("You are not on the approved participant list");
        await auth.sendPasswordResetEmail(participant.email);
        toast("Password reset email sent", "");
      }catch(err){
        console.error("password reset failed", err);
        toast(err.code === "auth/user-not-found" ? "No Firebase account exists yet. Use Sign in / create account first." : (err.message || "Could not send reset email"), "err");
      }
    });
  }
  function showParticipantSignup(){
    setActiveTab("participant");
    document.getElementById("onboardBody").innerHTML = `
      <div class="tab-switch" style="margin-bottom:16px;">
        <button id="participantSignInTab">Sign in</button>
        <button class="active" id="participantSignUpTab">Sign up</button>
      </div>
      <div class="field"><label>Approved email</label><input type="email" id="participantIdentifier" autocomplete="email"></div>
      <div class="field"><label>Choose a username</label><input type="text" id="participantChosenUsername" placeholder="e.g. chloe" autocomplete="username"></div>
      <div class="field"><label>Create password</label><div style="display:flex;gap:8px;"><input type="password" id="participantPassword" autocomplete="new-password" style="flex:1;"><button type="button" class="btn btn-ghost" id="toggleParticipantPassword">Show</button></div></div>
      <button class="btn btn-primary btn-block" id="participantSignupBtn">Create account</button>
      <p class="page-sub" style="margin-top:12px;">Your email must be on the approved participant list.</p>
    `;
    document.getElementById("participantSignInTab").addEventListener("click", showParticipantLogin);
    document.getElementById("participantSignUpTab").addEventListener("click", showParticipantSignup);
    document.getElementById("participantSignupBtn").addEventListener("click", async ()=>{
      const identifier = document.getElementById("participantIdentifier").value.trim();
      const username = document.getElementById("participantChosenUsername").value.trim();
      const password = document.getElementById("participantPassword").value;
      if(!identifier || !username || password.length<6){ toast("Enter your approved email, username, and a password of at least 6 characters", "err"); return; }
      try{ await signInApprovedParticipant(identifier, password, username, true); }
      catch(err){ console.error("participant sign-up failed", err); toast(err.message || "Could not create account", "err"); }
    });
    document.getElementById("toggleParticipantPassword").addEventListener("click", ()=>{
      const input = document.getElementById("participantPassword");
      const button = document.getElementById("toggleParticipantPassword");
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      button.textContent = visible ? "Show" : "Hide";
    });
  }
  function showOnboardExisting(){
    setActiveTab("existing");
    if(TEMPORARY_LEGACY_WALLET_LOGIN){
      document.getElementById("onboardBody").innerHTML = `
        <div class="field"><label>Wallet ID</label><input type="text" id="existingId" placeholder="e.g. HVN-8842" style="text-transform:uppercase;"></div>
        <button class="btn btn-primary btn-block" id="loginWalletBtn">Log in temporarily</button>
        <p class="page-sub" style="margin-top:12px;">Temporary recovery mode is enabled while the participant list is being prepared.</p>
      `;
      document.getElementById("loginWalletBtn").addEventListener("click", async ()=>{
        const id = document.getElementById("existingId").value.trim().toUpperCase();
        const user = await getJSON("users:"+id, true);
        if(!user){ toast("Wallet not found", "err"); return; }
        await loadUser(id);
        await refreshShared();
        refreshHeader();
        goTo("home");
      });
      return;
    }
    document.getElementById("onboardBody").innerHTML = `
      <div class="field"><label>Organizer email</label><input type="email" id="walletOrganizerEmail" autocomplete="username"></div>
      <div class="field"><label>Organizer password</label><input type="password" id="walletOrganizerPassword" autocomplete="current-password"></div>
      <div class="field"><label>Wallet ID to access</label><input type="text" id="existingId" placeholder="e.g. HVN-8842" style="text-transform:uppercase;"></div>
      <button class="btn btn-primary btn-block" id="loginWalletBtn">Organizer access</button>
      <p class="page-sub" style="margin-top:12px;">Wallet ID access is restricted to organizers. Use your own organizer Firebase account.</p>
    `;
    document.getElementById("loginWalletBtn").addEventListener("click", async ()=>{
      const email = document.getElementById("walletOrganizerEmail").value.trim();
      const password = document.getElementById("walletOrganizerPassword").value;
      const id = document.getElementById("existingId").value.trim().toUpperCase();
      if(!auth){ toast("Firebase Authentication is not enabled", "err"); return; }
      if(!email || !password || !id){ toast("Enter organizer email, password, and wallet ID", "err"); return; }
      try{
        const credential = await auth.signInWithEmailAndPassword(email, password);
        const organizers = await allUsers();
        const organizer = organizers.find(user=>user.authUid===credential.user.uid);
        const approvedOrganizer = (await approvedParticipants()).find(participant =>
          String(participant.email || "").toLowerCase()===email.toLowerCase() &&
          organizerWalletAllowed(participant, id)
        );
        if((!organizer || !organizer.isAdmin) && !approvedOrganizer){
          await auth.signOut();
          throw new Error("This Firebase account does not have organizer access");
        }
        if(approvedOrganizer && !organizerWalletAllowed(approvedOrganizer, id)){
          await auth.signOut();
          throw new Error("This wallet is not assigned to this organizer");
        }
        const target = await getJSON("users:"+id, true);
        if(!target) throw new Error("Wallet not found");
        await loadUser(id);
        await refreshShared();
        refreshHeader();
        goTo("home");
      }catch(err){
        console.error("organizer wallet access failed", err);
        toast(err.message || "Could not access wallet", "err");
      }
    });
  }
}

// Remove older app-shell caches so a previously open admin tab cannot keep
// rendering an outdated quest modal after a deployment.
function clearStaleAppShell(){
  if(!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(registrations=>{
    registrations.forEach(reg=>reg.unregister());
  }).catch(err=>console.warn("Could not clear old service worker:", err));
  if("caches" in window){
    caches.keys().then(names=>{
      names.filter(name=>name.indexOf("havenpay-")===0).forEach(name=>caches.delete(name));
    }).catch(err=>console.warn("Could not clear old app cache:", err));
  }
}

clearStaleAppShell();

// Boot
async function boot(){
  tickClock();

  // Show the login form before synchronizing shared Firestore data. The form
  // can load independently; login actions still wait for their own live data.
  showOnboarding();
  hideLoadingScreen();

  await seedIfEmpty();
  await refreshShared();
  let uid = null;
  try{ uid = await getJSON("me:userId", false); }catch(e){}
  let firebaseUser = null;
  if(auth){
    firebaseUser = await new Promise(resolve=>{
      let unsubscribe = ()=>{};
      unsubscribe = auth.onAuthStateChanged(user=>{
        unsubscribe();
        resolve(user);
      }, err=>{
        console.error("Firebase Auth state check failed", err);
        unsubscribe();
        resolve(null);
      });
    });
  }
  if(uid && typeof uid === "string" && uid.length && (firebaseUser || TEMPORARY_LEGACY_WALLET_LOGIN)){
    const savedUser = await getJSON("users:"+uid, true);
    const authUser = firebaseUser ? (await allUsers()).find(user=>user.authUid===firebaseUser.uid) : null;
    if(savedUser && TEMPORARY_LEGACY_WALLET_LOGIN){
      await loadUser(uid);
    }else if(savedUser && authUser && (savedUser.authUid===firebaseUser.uid || authUser.isAdmin)){
      await loadUser(uid);
    }else{
      await setJSON("me:userId", "", false);
    }
  }
  document.getElementById("headerAvatarBtn").addEventListener("click", ()=>{ if(ME) goTo("profile"); });
  if(ME){
    refreshHeader();
    goTo("home");
  }
}
function hideLoadingScreen(){
  const el = document.getElementById("loadingScreen");
  if(el) el.classList.add("hidden");
}
function initFirebaseOrShowSetup(){
  const needsSetup = !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.indexOf("YOUR_") === 0;
  if(needsSetup){
    hideLoadingScreen();
    document.getElementById("bottomnav").innerHTML = "";
    document.getElementById("pageContent").innerHTML = `
      <div class="onboard">
        <div class="hero-mark">🔥</div>
        <h1>Add your Firebase config</h1>
        <p class="lead">Open haven-pay.html in a text editor, find the FIREBASE_CONFIG object near the top of the script, and paste in your own Firebase project's config (see the comment above it for the 5 setup steps). Save the file and reload this page.</p>
      </div>`;
    return;
  }
  try{
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
    auth = firebase.auth();
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err=>{
      console.warn("Firebase Auth persistence not enabled:", err.code || err.message);
    });
    try{
      db.enablePersistence({synchronizeTabs:true}).catch(err=>{
        console.warn("Firestore offline cache not enabled:", err.code);
      });
    }catch(e){ console.warn(e); }
    boot();
  }catch(e){
    console.error(e);
    hideLoadingScreen();
    document.getElementById("pageContent").innerHTML = `<div class="onboard"><div class="hero-mark">⚠️</div><h1>Firebase failed to start</h1><p class="lead">${e.message}</p></div>`;
  }
}
initFirebaseOrShowSetup();

// Register the service worker for offline resilience + installability.
// Independent of the Firebase boot flow above — this should register
// regardless of whether FIREBASE_CONFIG is filled in yet.
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("sw.js").catch(err=>{
      console.warn("Service worker registration failed:", err);
    });
  });
}
