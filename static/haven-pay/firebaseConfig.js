
// Firebase Config
/* 1. Go to https://console.firebase.google.com -> Add project (free "Spark" plan is enough)
   2. In your project: Build -> Firestore Database -> Create database -> Start in production mode
   3. In Firestore "Rules" tab, paste this and click Publish (open access — fine for an internal event tool, don't store anything sensitive):
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /haven/{doc} { allow read, write: if true; }
          }
        }
   4. Project settings (gear icon) -> General -> "Your apps" -> Add app -> Web (</>) -> copy the config object it gives you
   5. Paste that config below, replacing the placeholder values, then reload this file in a browser. */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB1sqGgpIpTz-6qFwZNShyQLDUq8mbFmRg",
  authDomain: "haven-pay.firebaseapp.com",
  projectId: "haven-pay",
  storageBucket: "haven-pay.firebasestorage.app",
  messagingSenderId: "396937753984",
  appId: "1:396937753984:web:a8bbeb03d2102b524d3d65"
};
let db = null;
let auth = null;

// Config
const ADMIN_CODE = "HAVENHK26";
const CURRENCY = "Sparks";
const CURRENCY_SHORT = "SPK";
const AVATARS = ["🦔","🎮","👾","🧑‍💻","🐙","🍜","🎧","🛼","🧋","🐲","🌃","✨"];

const ICONS = {
  home: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 11.5 12 4l9 7.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M5.5 9.5V20h13V9.5"/><path stroke-linecap="round" stroke-linejoin="round" d="M9.5 20v-6h5v6"/></svg>',
  shop: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8h16l-1.2 11H5.2L4 8Z"/><path stroke-linecap="round" stroke-linejoin="round" d="M8 8V6a4 4 0 0 1 8 0v2"/></svg>',
  scan: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>',
  quest: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 3v18"/><path stroke-linecap="round" stroke-linejoin="round" d="M6 4h11l-2.2 3.5L17 11H6"/></svg>',
  activity: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12h4l2.5-7 5 14L17 12h4"/></svg>',
  profile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4"/><path stroke-linecap="round" d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6"/></svg>',
  admin: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3l7 3v6c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6l7-3Z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6-6 6"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L18 10l-4-4L4 16v4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 7h14M9 7V5h6v2m-8 0 1 13h8l1-13"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>',
  logout: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M15 8l4 4-4 4M9 12h10"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3l7 3v6c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6l7-3Z"/></svg>',
  users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path stroke-linecap="round" d="M3 19c.8-3.4 3-5 6-5s5.2 1.6 6 5"/><circle cx="17" cy="9" r="2.4"/><path stroke-linecap="round" d="M15.5 14.2c2.2.3 3.6 1.7 4.2 4.3"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8h3l1.5-2.2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.5" r="3.4"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 17 17 7M9 7h8v8"/></svg>',
  group: '<svg viewBox="0 0 24 24"><circle cx="8.5" cy="8" r="3"/><circle cx="16" cy="9" r="2.4"/><path stroke-linecap="round" d="M3 19c.7-3.3 2.8-5 5.5-5s4.8 1.7 5.5 5"/><path stroke-linecap="round" d="M14.5 14.3c2.1.3 3.5 1.7 4 4.7"/></svg>',
  games: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="9" rx="4"/><path stroke-linecap="round" d="M8 11v4M6 13h4"/><circle cx="15.5" cy="11.5" r="1"/><circle cx="17.5" cy="13.5" r="1"/></svg>',
  qr: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="3" height="3" rx="0.6"/><rect x="18" y="14" width="3" height="3" rx="0.6"/><rect x="14" y="18" width="3" height="3" rx="0.6"/><rect x="18" y="18" width="3" height="3" rx="0.6"/></svg>',
  txIn: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M6 13l6 6 6-6"/></svg>',
  txOut: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19V5M6 11l6-6 6 6"/></svg>',
  calendar: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path stroke-linecap="round" d="M8 3v4M16 3v4M3.5 10h17"/></svg>',
  food: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 3v7a2 2 0 0 0 4 0V3M8 3v18M15 3c-1.5 2-1.5 6 0 8v10"/></svg>',
  rocket: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2c3 2 5 6 4 12l-4 4-4-4c-1-6 1-10 4-12Z"/><circle cx="12" cy="9" r="1.6"/><path stroke-linecap="round" d="M9 15c-2 1-3 3-3 6 3 0 5-1 6-3M15 15c2 1 3 3 3 6-3 0-5-1-6-3"/></svg>',
  wifi: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2 8.5c5.5-5 14.5-5 20 0M5.5 12c3.5-3 9.5-3 13 0M9 15.5c1.7-1.3 4.3-1.3 6 0"/><circle cx="12" cy="19" r="1"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 3h3l1.5 4-2 2c1 2.5 2.5 4 5 5l2-2 4 1.5v3a2 2 0 0 1-2 2C10 18.5 5.5 14 5 5.5a2 2 0 0 1 1-2.5Z"/></svg>',
};

// Storage Helpers
/* shared=true  -> stored in Firestore (visible to everyone at the event)
   shared=false -> stored in this browser's localStorage (just "which wallet is this device logged into") */
const LOCAL_PREFIX = "havenpay_";

async function getJSON(key, shared){
  if(!shared){
    try{
      const v = localStorage.getItem(LOCAL_PREFIX+key);
      return v ? JSON.parse(v) : null;
    }catch(e){ return null; }
  }
  try{
    const snap = await db.collection("haven").doc(key).get();
    if(!snap.exists) return null;
    const data = snap.data();
    return data && Object.prototype.hasOwnProperty.call(data,"v") ? data.v : null;
  }catch(e){ console.error("firestore get failed", key, e); return null; }
}
async function setJSON(key, value, shared){
  if(!shared){
    try{ localStorage.setItem(LOCAL_PREFIX+key, JSON.stringify(value)); return true; }
    catch(e){ return false; }
  }
  try{ await db.collection("haven").doc(key).set({v: value}); return true; }
  catch(e){ console.error("firestore set failed", key, e); return false; }
}
async function deleteJSON(key, shared){
  if(!shared){
    try{ localStorage.removeItem(LOCAL_PREFIX+key); return true; }
    catch(e){ return false; }
  }
  try{ await db.collection("haven").doc(key).delete(); return true; }
  catch(e){ console.error("firestore delete failed", key, e); return false; }
}

// Live listener on one shared doc — calls back immediately with the current value,
// then again every time it changes (locally or from anyone else). Returns an
// unsubscribe function; always call it when you're done watching.
function watchJSON(key, callback){
  if(!db) return ()=>{};
  return db.collection("haven").doc(key).onSnapshot(snap=>{
    const data = snap.exists ? snap.data() : null;
    callback(data && Object.prototype.hasOwnProperty.call(data,"v") ? data.v : null);
  }, err=>{ console.error("watchJSON failed", key, err); });
}

// Atomic read-modify-write of one shared doc. Firestore re-runs `updater` against
// the fresh value if another client changed the doc between our read and write,
// so two writers (e.g. two organizers) can never overwrite each other.
// `updater` must be a pure function of the current value.
async function updateJSON(key, updater){
  const ref = db.collection("haven").doc(key);
  let result;
  await db.runTransaction(async tx=>{
    const snap = await tx.get(ref);
    const current = snap.exists && Object.prototype.hasOwnProperty.call(snap.data(), "v") ? snap.data().v : null;
    result = updater(current);
    tx.set(ref, {v: result});
  });
  return result;
}
