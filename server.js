// Bedrock Go — real multiplayer backend
// Pure Node.js core modules only (http, crypto, fs) — zero npm dependencies,
// so there is nothing to install and nothing that can fail to install on Replit.

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

/* ============================================================
   TINY JSON "DATABASE"
============================================================ */
function loadDB(){
  if(!fs.existsSync(DB_FILE)){
    const fresh = { users: [], clans: [], chats: { announce: [] }, devWhitelist: [], sessions: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
  try{ return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch(e){ console.error('DB read failed, starting fresh in memory', e); return { users:[], clans:[], chats:{announce:[]}, devWhitelist:[], sessions:{} }; }
}
let db = loadDB();
function saveDB(){
  try{ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
  catch(e){ console.error('DB write failed', e); }
}

/* ============================================================
   PASSWORD HASHING (Node's built-in scrypt — no bcrypt needed)
============================================================ */
function hashPassword(password){
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored){
  if(!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}
function makeSessionToken(userId){
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = { userId, createdAt: Date.now() };
  saveDB();
  return token;
}

/* ============================================================
   DATA HELPERS
============================================================ */
const BUILTIN_SKINS = [
  {id:'builtin-1', name:'Default Avatar', custom:false},
  {id:'builtin-2', name:'Frost Guardian', color:'#5b2c6f', custom:false, emoji:'🥶'},
  {id:'builtin-3', name:'Neon Ranger', color:'#c77dff', custom:false, emoji:'😎'},
];
const SHOP_ITEMS = [
  {id:'c1', cat:'clothes', name:'Maid Frilled Top', price:120, emoji:'👗', color:'#3a1550', hot:true},
  {id:'c2', cat:'clothes', name:'Aloha Board Shorts', price:120, emoji:'🩳', color:'#264a63'},
  {id:'c3', cat:'clothes', name:'Tropical Shirt', price:120, emoji:'👕', color:'#1e3d4a'},
  {id:'c4', cat:'accessories', name:'Rose Wig', price:100, emoji:'💇‍♀️', color:'#5b2c6f'},
  {id:'c5', cat:'accessories', name:'Azure Braids', price:120, emoji:'💇', color:'#1c3a63', hot:true},
  {id:'c6', cat:'accessories', name:'Spiky Shades', price:120, emoji:'😎', color:'#4a2c17'},
  {id:'c7', cat:'accessories', name:'Midnight Locks', price:120, emoji:'💜', color:'#2a1050'},
  {id:'c8', cat:'accessories', name:'Twilight Ponytail', price:120, emoji:'🎀', color:'#5b1c40'},
  {id:'c9', cat:'character', name:'Rage Cube Head', price:30, emoji:'😡', color:'#7a2020'},
  {id:'c10', cat:'character', name:'Blossom Cube Head', price:30, emoji:'🌸', color:'#7a2c5a'},
];
const REDEEM_CODES = { AMETHYST2026:{tickets:150,acubes:50}, VIOLETGO:{tickets:150,acubes:50}, PURPLE100:{tickets:150,acubes:50} };

function genId(){ const min=10000, max=999999999999; return (Math.floor(Math.random()*(max-min+1))+min).toString(); }
function genUniqueId(){ let id=genId(), guard=0; while(db.users.some(u=>u.id===id) && guard<100){ id=genId(); guard++; } return id; }
function genClanId(){ return 'c_' + crypto.randomBytes(5).toString('hex'); }
function findUserByIdOrName(q){
  if(!q) return null;
  const lower = q.toLowerCase();
  return db.users.find(u => u.id === q || u.username.toLowerCase() === lower);
}
function publicUser(u){
  if(!u) return null;
  return {
    id:u.id, username:u.username, vip:u.vip, intro:u.intro, profilePic:u.profilePic,
    equippedSkinId:u.equippedSkinId, skins:u.skins, tickets:u.tickets, acubes:u.acubes,
    infiniteCubes:u.infiniteCubes, wardrobe:u.wardrobe, clanId:u.clanId, friends:u.friends,
    isDev: db.devWhitelist.includes(u.id)
  };
}
function publicUserMini(u){
  if(!u) return null;
  return { id:u.id, username:u.username, vip:u.vip, profilePic:u.profilePic, equippedSkinId:u.equippedSkinId, skins:u.skins };
}
function chatKey(a,b){ return [a,b].sort().join('_'); }

/* ============================================================
   MINI HTTP ROUTER
============================================================ */
const routes = []; // { method, pattern: RegExp, keys: [...], handler }
function route(method, pathPattern, handler){
  const keys = [];
  const regexStr = '^' + pathPattern.replace(/:[a-zA-Z]+/g, (m)=>{ keys.push(m.slice(1)); return '([^/]+)'; }) + '$';
  routes.push({ method, regex: new RegExp(regexStr), keys, handler });
}
function authRequired(req){
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const session = token && db.sessions[token];
  if(!session) return null;
  const user = db.users.find(u=>u.id===session.userId);
  return user || null;
}
function json(res, status, obj){
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'Content-Type, Authorization',
    'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'
  });
  res.end(body);
}

/* ---- AUTH ---- */
route('POST','/api/register', (req,res,params,body)=>{
  const username = (body.username||'').trim();
  const password = body.password||'';
  if(!username || username.length<3) return json(res,400,{error:'Username must be at least 3 characters'});
  if(!password || password.length<4) return json(res,400,{error:'Password must be at least 4 characters'});
  if(findUserByIdOrName(username)) return json(res,409,{error:'That username is already taken'});
  const isFirstEverUser = db.users.length===0;
  const user = {
    id: genUniqueId(), username, passwordHash: hashPassword(password),
    vip:0, tickets:0, acubes:0, infiniteCubes:false, intro:'', profilePic:null,
    equippedSkinId:'builtin-1', skins: JSON.parse(JSON.stringify(BUILTIN_SKINS)),
    wardrobe:{ owned:[], equipped:{ clothes:null, accessories:null, character:null } },
    friends:[], clanId:null, redeemed:[], createdAt: Date.now()
  };
  db.users.push(user);
  if(isFirstEverUser) db.devWhitelist.push(user.id);
  saveDB();
  json(res,200,{ token: makeSessionToken(user.id), user: publicUser(user) });
});

route('POST','/api/login', (req,res,params,body)=>{
  const idOrUsername = (body.idOrUsername||'').trim();
  const password = body.password||'';
  const user = findUserByIdOrName(idOrUsername);
  if(!user) return json(res,401,{error:'No account found with that ID or Username'});
  if(!verifyPassword(password, user.passwordHash)) return json(res,401,{error:'Incorrect password'});
  json(res,200,{ token: makeSessionToken(user.id), user: publicUser(user) });
});

route('GET','/api/me', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  json(res,200,{ user: publicUser(user) });
});

route('PUT','/api/profile', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  if(body.username !== undefined){
    const trimmed = body.username.trim();
    if(!trimmed || trimmed.length<3) return json(res,400,{error:'Username too short'});
    const clash = findUserByIdOrName(trimmed);
    if(clash && clash.id!==user.id) return json(res,409,{error:'That username is already taken'});
    user.username = trimmed;
  }
  if(body.intro !== undefined) user.intro = String(body.intro).slice(0,300);
  if(body.profilePic !== undefined) user.profilePic = body.profilePic;
  saveDB();
  json(res,200,{ user: publicUser(user) });
});

/* ---- SKINS ---- */
route('POST','/api/skins', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  if(!body.dataUrl) return json(res,400,{error:'Missing image data'});
  const skin = { id:'custom-'+Date.now(), name: body.name||'Custom Skin', dataUrl: body.dataUrl, custom:true };
  user.skins.push(skin); user.equippedSkinId = skin.id;
  saveDB(); json(res,200,{ user: publicUser(user) });
});
route('PUT','/api/skins/equip', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  if(!user.skins.some(s=>s.id===body.skinId)) return json(res,404,{error:'Skin not found'});
  user.equippedSkinId = body.skinId; saveDB(); json(res,200,{ user: publicUser(user) });
});
route('DELETE','/api/skins/:id', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  user.skins = user.skins.filter(s=>s.id!==params.id);
  if(user.equippedSkinId===params.id) user.equippedSkinId = user.skins[0]?.id || 'builtin-1';
  saveDB(); json(res,200,{ user: publicUser(user) });
});

/* ---- SHOP ---- */
route('GET','/api/shop', (req,res)=> json(res,200,{ items: SHOP_ITEMS }));
route('POST','/api/shop/buy', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  const item = SHOP_ITEMS.find(i=>i.id===body.itemId);
  if(!item) return json(res,404,{error:'Item not found'});
  if(user.wardrobe.owned.includes(item.id)) return json(res,409,{error:'Already owned'});
  if(user.tickets < item.price) return json(res,402,{error:'Not enough Tickets'});
  user.tickets -= item.price; user.wardrobe.owned.push(item.id); user.wardrobe.equipped[item.cat] = item.id;
  saveDB(); json(res,200,{ user: publicUser(user) });
});
route('PUT','/api/shop/equip', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  const item = SHOP_ITEMS.find(i=>i.id===body.itemId);
  if(!item) return json(res,404,{error:'Item not found'});
  user.wardrobe.equipped[item.cat] = body.unequip ? null : body.itemId;
  saveDB(); json(res,200,{ user: publicUser(user) });
});

/* ---- ECONOMY ---- */
route('POST','/api/topup', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  if(!['tickets','acubes'].includes(body.currency)) return json(res,400,{error:'Bad currency'});
  user[body.currency] += Math.max(0, parseInt(body.amount)||0);
  saveDB(); json(res,200,{ user: publicUser(user) });
});
route('POST','/api/vip/upgrade', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  if(user.vip>=9) return json(res,400,{error:'Already max VIP'});
  const cost=200;
  if(!user.infiniteCubes){
    if(user.acubes<cost) return json(res,402,{error:'Not enough A-Cubes'});
    user.acubes -= cost;
  }
  user.vip += 1; saveDB(); json(res,200,{ user: publicUser(user) });
});
route('POST','/api/redeem', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  const code = (body.code||'').trim().toUpperCase();
  user.redeemed = user.redeemed || [];
  if(user.redeemed.includes(code)) return json(res,409,{error:'Code already used'});
  const reward = REDEEM_CODES[code];
  if(!reward) return json(res,404,{error:'Invalid code'});
  user.tickets += reward.tickets; user.acubes += reward.acubes; user.redeemed.push(code);
  saveDB(); json(res,200,{ user: publicUser(user) });
});

/* ---- FRIENDS ---- */
route('GET','/api/friends', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  const list = user.friends.map(id=>publicUserMini(db.users.find(u=>u.id===id))).filter(Boolean);
  json(res,200,{ friends: list });
});
route('POST','/api/friends', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  const target = findUserByIdOrName((body.idOrUsername||'').trim());
  if(!target) return json(res,404,{error:'No user found with that ID or Username'});
  if(target.id===user.id) return json(res,400,{error:"That's you!"});
  if(user.friends.includes(target.id)) return json(res,409,{error:'Already friends'});
  user.friends.push(target.id); target.friends.push(user.id);
  saveDB(); json(res,200,{ friend: publicUserMini(target) });
});
route('DELETE','/api/friends/:id', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  user.friends = user.friends.filter(id=>id!==params.id);
  const target = db.users.find(u=>u.id===params.id);
  if(target) target.friends = target.friends.filter(id=>id!==user.id);
  saveDB(); json(res,200,{ ok:true });
});

/* ---- CLANS ---- */
route('GET','/api/clans', (req,res)=>{
  json(res,200,{ clans: db.clans.map(c=>({ id:c.id, name:c.name, crest:c.crest, level:c.level, memberCount:c.members.length })) });
});
route('GET','/api/clan', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  if(!user.clanId) return json(res,200,{ clan:null });
  const clan = db.clans.find(c=>c.id===user.clanId);
  if(!clan) return json(res,200,{ clan:null });
  const members = clan.members.map(id=>publicUserMini(db.users.find(u=>u.id===id))).filter(Boolean);
  json(res,200,{ clan: { ...clan, members } });
});
route('POST','/api/clan/create', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  if(user.clanId) return json(res,409,{error:'Already in a clan — leave it first'});
  const name = (body.name||'').trim() || (user.username+"'s Clan");
  const clan = { id:genClanId(), name, crest: body.crest||'🚩', level:1, exp:0, expToNext:120, ownerId:user.id, members:[user.id] };
  db.clans.push(clan); user.clanId = clan.id; db.chats['clan_'+clan.id] = [];
  saveDB(); json(res,200,{ clan });
});
route('POST','/api/clan/join', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  if(user.clanId) return json(res,409,{error:'Already in a clan — leave it first'});
  const clan = db.clans.find(c=>c.id===body.clanId);
  if(!clan) return json(res,404,{error:'Clan not found'});
  clan.members.push(user.id); user.clanId = clan.id;
  saveDB(); json(res,200,{ clan });
});
route('POST','/api/clan/leave', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  const clan = db.clans.find(c=>c.id===user.clanId);
  if(clan){
    clan.members = clan.members.filter(id=>id!==user.id);
    if(clan.members.length===0) db.clans = db.clans.filter(c=>c.id!==clan.id);
  }
  user.clanId = null; saveDB(); json(res,200,{ ok:true });
});
route('POST','/api/clan/contribute', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  const clan = db.clans.find(c=>c.id===user.clanId);
  if(!clan) return json(res,400,{error:'Not in a clan'});
  if(clan.level>=9) return json(res,400,{error:'Clan is already max level'});
  const cost=10;
  if(!user.infiniteCubes){
    if(user.acubes<cost) return json(res,402,{error:'Not enough A-Cubes'});
    user.acubes -= cost;
  }
  clan.exp += 25; let leveledUp=false;
  if(clan.exp>=clan.expToNext && clan.level<9){ clan.level++; clan.exp=0; clan.expToNext=Math.round(clan.expToNext*1.4); leveledUp=true; }
  saveDB(); json(res,200,{ clan, leveledUp });
});

/* ---- CHAT ---- */
route('GET','/api/chat/:peerId', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  const peerId = params.peerId;
  let key;
  if(peerId==='announce') key='announce';
  else if(peerId==='clan'){ if(!user.clanId) return json(res,200,{messages:[]}); key='clan_'+user.clanId; }
  else { if(!user.friends.includes(peerId)) return json(res,403,{error:'Not friends with this user'}); key=chatKey(user.id,peerId); }
  json(res,200,{ messages: db.chats[key] || [] });
});
route('POST','/api/chat/:peerId', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  const peerId = params.peerId;
  const text = (body.text||'').trim();
  if(!text) return json(res,400,{error:'Empty message'});
  if(peerId==='announce') return json(res,403,{error:'Announcements are read-only'});
  let key;
  if(peerId==='clan'){ if(!user.clanId) return json(res,400,{error:'Not in a clan'}); key='clan_'+user.clanId; }
  else { if(!user.friends.includes(peerId)) return json(res,403,{error:'Not friends with this user'}); key=chatKey(user.id,peerId); }
  if(!db.chats[key]) db.chats[key]=[];
  const msg = { from:user.id, fromName:user.username, text, time: Date.now() };
  db.chats[key].push(msg); saveDB(); json(res,200,{ message: msg });
});

/* ---- ADMIN ---- */
route('GET','/api/admin/status', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  const isDev = db.devWhitelist.includes(user.id);
  json(res,200,{ isDev, devWhitelist: isDev ? db.devWhitelist : undefined });
});
route('PUT','/api/admin/user', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  if(!db.devWhitelist.includes(user.id)) return json(res,403,{error:'Developer access required'});
  const target = body.targetId ? db.users.find(u=>u.id===body.targetId) : user;
  if(!target) return json(res,404,{error:'Target account not found'});
  if(body.vip!==undefined) target.vip = Math.max(0, Math.min(9, parseInt(body.vip)));
  if(body.tickets!==undefined) target.tickets = Math.max(0, parseInt(body.tickets)||0);
  if(body.acubes!==undefined) target.acubes = Math.max(0, parseInt(body.acubes)||0);
  if(body.infiniteCubes!==undefined) target.infiniteCubes = !!body.infiniteCubes;
  if(body.clanLevel!==undefined && target.clanId){
    const clan = db.clans.find(c=>c.id===target.clanId);
    if(clan) clan.level = Math.max(1, Math.min(9, parseInt(body.clanLevel)));
  }
  saveDB(); json(res,200,{ user: publicUser(target) });
});
route('POST','/api/admin/grant', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  if(!db.devWhitelist.includes(user.id)) return json(res,403,{error:'Developer access required'});
  const id = (body.id||'').trim();
  if(!db.users.some(u=>u.id===id)) return json(res,404,{error:'No account with that ID'});
  if(!db.devWhitelist.includes(id)) db.devWhitelist.push(id);
  saveDB(); json(res,200,{ devWhitelist: db.devWhitelist });
});
route('POST','/api/admin/revoke', (req,res,params,body,user)=>{
  if(!user) return json(res,401,{error:'Not logged in'});
  if(!db.devWhitelist.includes(user.id)) return json(res,403,{error:'Developer access required'});
  if(db.devWhitelist.length<=1) return json(res,400,{error:'At least one developer ID must remain'});
  db.devWhitelist = db.devWhitelist.filter(id=>id!==body.id);
  saveDB(); json(res,200,{ devWhitelist: db.devWhitelist });
});

/* ============================================================
   STATIC FILE SERVING (for the frontend)
============================================================ */
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
function serveStatic(req, res, pathname){
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if(!filePath.startsWith(PUBLIC_DIR)) filePath = path.join(PUBLIC_DIR, 'index.html'); // prevent path traversal
  fs.readFile(filePath, (err, data)=>{
    if(err){
      fs.readFile(path.join(PUBLIC_DIR,'index.html'), (err2, data2)=>{
        if(err2){ res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, {'Content-Type':'text/html'}); res.end(data2);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
    res.end(data);
  });
}

/* ============================================================
   SERVER
============================================================ */
const server = http.createServer((req, res)=>{
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsed.pathname;

  if(req.method === 'OPTIONS'){
    res.writeHead(204, {
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Headers':'Content-Type, Authorization',
      'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'
    });
    return res.end();
  }

  if(!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);

  let bodyChunks = [];
  req.on('data', c=>bodyChunks.push(c));
  req.on('end', ()=>{
    let body = {};
    if(bodyChunks.length){
      try{ body = JSON.parse(Buffer.concat(bodyChunks).toString('utf8') || '{}'); }
      catch(e){ return json(res,400,{error:'Invalid JSON body'}); }
    }
    for(const r of routes){
      if(r.method !== req.method) continue;
      const match = pathname.match(r.regex);
      if(!match) continue;
      const params = {};
      r.keys.forEach((k,i)=>{ params[k] = decodeURIComponent(match[i+1]); });
      const user = authRequired(req);
      try{ return r.handler(req, res, params, body, user); }
      catch(e){ console.error(e); return json(res,500,{error:'Server error'}); }
    }
    json(res, 404, { error:'Not found' });
  });
});

server.listen(PORT, '0.0.0.0', ()=> console.log(`Bedrock Go server running on port ${PORT}`));
