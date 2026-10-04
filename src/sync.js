// 로그인 · 짝꿍 연결 · 실시간 공동 편집 (Firebase). 첫 화면을 빨리 띄우려고 main.js가 나중에 불러옴.
import { initializeApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut,
  connectAuthEmulator, signInWithCredential, deleteUser, reauthenticateWithPopup,
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, runTransaction,
  serverTimestamp, deleteField, FieldPath, Timestamp, arrayRemove,
} from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";
import { app, CITY, normalizePlan, onSave, save, esc, byId as placeById } from "./store.js";
import { buildMarkers, renderDays, renderChips } from "./render.js";
import { renderCityBar } from "./cities.js";
import { toast } from "./actions.js";
import { icon } from "./icons.js";
import { setPeople, renderPick, isMatch } from "./pick.js";
import { renderPrep } from "./prep.js";
import { refreshOpenComments } from "./comments.js";

const EMULATOR = !!import.meta.env.VITE_FIREBASE_EMULATOR;
const fb = initializeApp(EMULATOR ? { ...firebaseConfig, projectId: "demo-honeymoon", apiKey: "demo-key" } : firebaseConfig);
const auth = getAuth(fb);
const db = initializeFirestore(fb, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
if (EMULATOR) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

/* ---------- 상태 ---------- */
const S = { user: null, coupleId: null, couple: null, error: "", busy: false };
let unsubs = [];
const INVITE_HOURS = 48;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 헷갈리는 0·O·1·I 제외
const me = () => S.user && S.user.uid;
const partnerId = () => S.couple && S.couple.members.find(u => u !== me());
const profile = uid => (S.couple && S.couple.profiles && S.couple.profiles[uid]) || {};
const status = () => !S.user ? "signedout" : !S.loaded ? "loading" : !S.coupleId ? "solo"
  : !S.couple ? "loading" : S.couple.members.length > 1 ? "connected" : "waiting";

/* ---------- 계획 ↔ Firestore 문서 ---------- */
// 함께 쓰는 값만 올리고(필터·보고 있는 날짜 같은 화면 설정은 기기별), 일정은 날짜별 필드(d0, d1…),
// 내 장소·숙소 후보는 항목별 맵으로 나눠서 — 둘이 다른 날짜·다른 항목을 동시에 고쳐도 서로 덮어쓰지 않음
const SHARED = ["startDate", "mode", "stayChosen", "guests", "budget", "currency", "fx"];
const MAPS = ["custom", "stays", "expenses", "checklist", "bookings"];
const NESTED = ["votes", "comments", "diary", "ratings"];   // 함께 고르기: votes.<장소>.<사람> — 둘이 같은 장소에 동시에 눌러도 따로 저장
const clean = v => JSON.parse(JSON.stringify(v ?? null));
const byId = list => Object.fromEntries((list || []).map(p => [p.id, clean(p)]));

function toFields(plan) {
  const f = { v: 1, dayCount: plan.days.length };
  SHARED.forEach(k => { f[k] = clean(plan[k]); });
  plan.days.forEach((d, i) => { f["d" + i] = clean({ stops: d.stops || [], note: d.note || "", times: d.times || {} }); });
  MAPS.forEach(k => { f[k] = byId(plan[k]); });
  NESTED.forEach(k => { f[k] = clean(plan[k] || {}); });
  return f;
}
function fromFields(f) {
  const n = Math.max(1, f.dayCount || 0);
  const shared = { days: Array.from({ length: n }, (_, i) => Object.assign({ stops: [], note: "", times: {} }, f["d" + i])) };
  SHARED.forEach(k => { if (k in f) shared[k] = f[k]; });
  MAPS.forEach(k => { shared[k] = Object.values(f[k] || {}); });
  NESTED.forEach(k => { shared[k] = clean(f[k] || {}); });
  return shared;
}
// 마지막으로 서버와 맞춘 값 (필드별 JSON) — 바뀐 필드만 올리기 위해
const synced = {};   // { "plans/sydney": { field: json, "custom.<id>": json, … } }
function snapshotOf(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (MAPS.includes(k)) for (const [id, item] of Object.entries(v || {})) out[k + "\u0000" + id] = JSON.stringify(item);
    else if (NESTED.includes(k)) {
      for (const [id, inner] of Object.entries(v || {})) for (const [who, val] of Object.entries(inner || {})) out[[k, id, who].join("\u0000")] = JSON.stringify(val);
    }
    else if (k !== "updatedAt" && k !== "updatedBy") out[k] = JSON.stringify(v);
  }
  return out;
}
function diff(prev, next) {
  const pairs = [];
  for (const [k, json] of Object.entries(next)) if (prev[k] !== json) pairs.push([k, JSON.parse(json)]);
  for (const k of Object.keys(prev)) if (!(k in next)) pairs.push([k, deleteField()]);
  return pairs.map(([k, v]) => [k.includes("\u0000") ? new FieldPath(...k.split("\u0000")) : new FieldPath(k), v]);
}

/* ---------- 올리기 ---------- */
let flushT = null;
function scheduleFlush() {
  if (status() === "signedout" || !S.coupleId || S.applying) return;
  clearTimeout(flushT);
  flushT = setTimeout(flush, 500);
}
async function flush() {
  clearTimeout(flushT); flushT = null;
  if (!S.coupleId || !S.ready) return;
  const base = `couples/${S.coupleId}`;
  const writes = [];
  for (const [cityId, plan] of Object.entries(app.plans)) {
    const key = "plans/" + cityId, fields = toFields(plan), next = snapshotOf(fields);
    const ref = doc(db, `${base}/plans/${cityId}`);
    if (!synced[key]) {
      writes.push(setDoc(ref, { ...fields, updatedBy: me(), updatedAt: serverTimestamp() }));
    } else {
      const pairs = diff(synced[key], next);
      if (!pairs.length) continue;
      writes.push(updateDoc(ref, ...pairs.flat(), "updatedBy", me(), "updatedAt", serverTimestamp()));
    }
    synced[key] = next;
  }
  // 직접 추가한 도시(퍼스 등)는 둘이 함께 봄
  const metaNext = snapshotOf({ myCities: byId(app.myCities) }), metaKey = "meta/app";
  const metaRef = doc(db, `${base}/meta/app`);
  if (!synced[metaKey]) writes.push(setDoc(metaRef, { myCities: byId(app.myCities) }, { merge: true }));
  else {
    const pairs = diff(synced[metaKey], metaNext).map(([fp, v]) => [fp, v]);
    if (pairs.length) writes.push(updateDoc(metaRef, ...pairs.flat()));
  }
  synced[metaKey] = metaNext;
  try { await Promise.all(writes); }
  catch (e) { console.warn("sync write failed", e); S.error = "저장 중 오류가 났어요. 잠시 후 다시 시도할게요."; renderAccount(); }
}

/* ---------- 받기 ---------- */
let refreshT = null, lastInputAt = 0;
document.addEventListener("input", () => { lastInputAt = Date.now(); }, true);
// 짝꿍의 변경을 화면에 반영. 지도 핀은 바로, 일정 목록은 내가 타이핑 중이면(2초 이내 입력) 잠깐 기다렸다가
function refreshView() {
  clearTimeout(refreshT);
  refreshT = setTimeout(() => {
    buildMarkers(); renderChips(); renderCityBar(); renderPick(); renderPrep();
    const a = document.activeElement;
    const inList = a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest("#days");
    if (inList && Date.now() - lastInputAt < 2000) return refreshView();
    // 다시 그린 뒤에도 입력하던 칸과 커서 위치를 그대로 둠
    const key = inList && (a.dataset.note !== undefined ? `[data-note="${a.dataset.note}"]` : a.dataset.time ? `[data-time="${a.dataset.time}"]`
      : a.dataset.diary !== undefined ? `[data-diary="${a.dataset.diary}"]` : null);
    const sel = key && "selectionStart" in a ? [a.selectionStart, a.selectionEnd] : null;
    renderDays();
    const el = key && document.querySelector("#days " + key);
    if (el) { el.focus(); if (sel) try { el.setSelectionRange(...sel); } catch (e) {} }
  }, 150);
}
// 서버 내용을 이 기기의 계획에 반영. 바뀐 게 있으면 true
function applyRemote(cityId, data) {
  const key = "plans/" + cityId, snap = snapshotOf(data);
  if (synced[key] && JSON.stringify(synced[key]) === JSON.stringify(snap)) return false;   // 내가 보낸 내용이 돌아온 것
  // 현재 보고 있는 도시의 계획 객체는 화면이 참조하고 있으니 새로 만들지 않고 그 안을 바꿈
  const local = app.plans[cityId] || (app.plans[cityId] = normalizePlan(null));
  Object.assign(local, fromFields(data));
  if (local.focusDay !== null && local.focusDay >= local.days.length) local.focusDay = null;
  synced[key] = snap;
  S.applying = true; save(); S.applying = false;
  return true;
}
function subscribeData(coupleId) {
  let first = true;
  const plansCol = collection(db, `couples/${coupleId}/plans`);
  // 서버 확인 뒤의 스냅샷도 받아야(includeMetadataChanges) 내 쓰기와 겹친 짝꿍 변경을 놓치지 않음
  unsubs.push(onSnapshot(plansCol, { includeMetadataChanges: true }, snap => {
    if (snap.metadata.hasPendingWrites || snap.metadata.fromCache && first) return;   // 서버 확인 전이면 기다림
    if (!first && flushT) { flush(); return; }                 // 아직 안 올린 내 변경부터 올리고, 다음 스냅샷에서 합침
    let partnerChanged = false, touchedCurrent = false;
    const matchedBefore = new Set(Object.keys(app.plans[CITY.id] && app.plans[CITY.id].votes || {}).filter(isMatch));
    const commentKeys = () => Object.entries((app.plans[CITY.id] || {}).comments || {}).flatMap(([pid, box]) => Object.keys(box || {}).map(cid => pid + "|" + cid));
    const commentsBefore = new Set(commentKeys());
    snap.docChanges().forEach(ch => {
      if (ch.type === "removed") return;
      const cityId = ch.doc.id, data = ch.doc.data();
      if (!applyRemote(cityId, data)) return;
      if (data.updatedBy && data.updatedBy !== me()) partnerChanged = true;
      if (cityId === CITY.id) touchedCurrent = true;
    });
    if (first) {
      // 처음 연결: 서버에 없는 도시(내 기기에만 있는 일정)는 올림. 서버에 있는 도시는 서버 내용을 따름
      first = false; S.ready = true;
      flush();
      refreshView();
      if (snap.size) toast("함께 쓰는 일정을 불러왔어요");
    } else if (touchedCurrent) {
      refreshView();
      const newMatches = Object.keys(app.plans[CITY.id].votes || {}).filter(id => isMatch(id) && !matchedBefore.has(id));
      const newComments = commentKeys().filter(k => !commentsBefore.has(k)).map(k => k.split("|"))
        .map(([pid, cid]) => ({ pid, c: app.plans[CITY.id].comments[pid][cid] })).filter(x => x.c && x.c.by !== me());
      newComments.forEach(x => refreshOpenComments(x.pid));
      if (newComments.length) {
        const x = newComments[newComments.length - 1];
        toast(`${profile(x.c.by).name || "짝꿍"} · ${(placeById(x.pid) || {}).name || "장소"}: "${x.c.text}"`);
      } else if (newMatches.length) toast(`둘 다 좋아요! ${newMatches.map(id => (placeById(id) || {}).name).filter(Boolean).join(", ") || "새로 겹친 곳이 생겼어요"}`);
      else if (partnerChanged) toast(`${profile(partnerId()).name || "짝꿍"}이(가) 바꿨어요`);
    } else if (partnerChanged) renderCityBar();
  }, e => { console.warn(e); S.error = "동기화 권한이 없어요"; renderAccount(); }));

  unsubs.push(onSnapshot(doc(db, `couples/${coupleId}/meta/app`), snap => {
    if (snap.metadata.hasPendingWrites || !snap.exists()) return;
    const remote = Object.values(snap.data().myCities || {});
    const known = new Set(app.myCities.map(c => c.id));
    let added = false;
    remote.forEach(c => { if (!known.has(c.id)) { app.myCities.push(c); added = true; } });
    const remoteIds = new Set(remote.map(c => c.id));
    const before = app.myCities.length;
    if (synced["meta/app"]) app.myCities = app.myCities.filter(c => remoteIds.has(c.id) || !synced["meta/app"]["myCities\u0000" + c.id]);
    synced["meta/app"] = snapshotOf({ myCities: byId(app.myCities) });
    if (added || app.myCities.length !== before) { S.applying = true; save(); S.applying = false; renderCityBar(); }
  }));
}

/* ---------- 커플 ---------- */
function stopSubs() { unsubs.forEach(u => u()); unsubs = []; Object.keys(synced).forEach(k => delete synced[k]); S.ready = false; }

function subscribeCouple(coupleId) {
  stopSubs();
  S.coupleId = coupleId;
  unsubs.push(onSnapshot(doc(db, "couples", coupleId), snap => {
    const c = snap.data();
    if (!c || !c.members.includes(me())) { leaveLocal(); return; }
    const wasConnected = status() === "connected";
    S.couple = c;
    setPeople(me(), partnerId() || null, Object.fromEntries(Object.entries(c.profiles || {}).map(([u, pr]) => [u, pr.name || ""])));
    if (!wasConnected && status() === "connected" && c.joinedAt) toast(`💕 ${profile(partnerId()).name || "짝꿍"}과(와) 연결됐어요!`);
    renderAccount();
  }, () => { leaveLocal(); }));
  subscribeData(coupleId);
}
function leaveLocal() {
  stopSubs();
  S.coupleId = null; S.couple = null;
  setPeople(null, null);
  renderAccount();
}

const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
const expiresAt = () => Timestamp.fromMillis(Date.now() + INVITE_HOURS * 3600e3);
const myProfile = () => ({ name: S.user.displayName || (S.user.email || "").split("@")[0] || "나", photo: S.user.photoURL || "" });

async function createInvite() {
  const uid = me(), code = newCode(), exp = expiresAt();
  const batch = writeBatch(db);
  let coupleId = S.coupleId;
  if (coupleId && status() === "waiting") {
    batch.update(doc(db, "couples", coupleId), { inviteCode: code, inviteExpires: exp });
  } else {
    coupleId = doc(collection(db, "couples")).id;
    batch.set(doc(db, "couples", coupleId), {
      members: [uid], owner: uid, profiles: { [uid]: myProfile() },
      inviteCode: code, inviteExpires: exp, createdAt: serverTimestamp(),
    });
    batch.set(doc(db, "users", uid), { coupleId }, { merge: true });
  }
  batch.set(doc(db, "invites", code), { coupleId, expires: exp, createdBy: uid });
  await batch.commit();
  if (coupleId !== S.coupleId) subscribeCouple(coupleId);
  return code;
}

const normCode = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
async function joinWithCode(raw) {
  const code = normCode(raw);
  if (code.length !== 6) throw new Error("초대 코드 6자리를 확인해 주세요.");
  const inv = await getDoc(doc(db, "invites", code));
  if (!inv.exists()) throw new Error("초대 코드를 찾을 수 없어요.");
  const { coupleId, expires } = inv.data();
  if (coupleId === S.coupleId) return;
  if (expires.toMillis() < Date.now()) throw new Error("초대 코드가 만료됐어요. 짝꿍에게 새 코드를 받아 주세요.");
  if (status() === "connected") throw new Error("이미 짝꿍과 연결돼 있어요. 먼저 연결을 해제해 주세요.");
  const uid = me();
  // 이미 두 명인 커플은 규칙상 바깥 사람이 읽을 수 없음 → 권한 거부 = 이미 연결된 초대
  await runTransaction(db, async tx => {
    const ref = doc(db, "couples", coupleId);
    const c = await tx.get(ref);
    if (!c.exists()) throw new Error("초대가 더 이상 유효하지 않아요.");
    if (c.data().members.length >= 2) throw new Error("이미 다른 사람과 연결된 초대예요.");
    tx.update(ref, { members: [...c.data().members, uid], [`profiles.${uid}`]: myProfile(), joinedAt: serverTimestamp() });
  }).catch(e => { throw e.code === "permission-denied" ? new Error("이미 다른 사람과 연결된 초대예요.") : e; });
  await setDoc(doc(db, "users", uid), { coupleId }, { merge: true });
  subscribeCouple(coupleId);
}

async function disconnect() {
  if (!S.coupleId || !confirm("짝꿍과의 연결을 해제할까요?\n지금까지의 일정은 이 기기에 그대로 남아요.")) return;
  const uid = me(), id = S.coupleId;
  stopSubs();
  await updateDoc(doc(db, "couples", id), { members: arrayRemove(uid), [`profiles.${uid}`]: deleteField() });
  await setDoc(doc(db, "users", uid), { coupleId: null }, { merge: true });
  leaveLocal();
  toast("연결을 해제했어요");
}

// 계정 삭제: 서버에 있는 내 정보를 지우고 로그인 계정도 없앰. 짝꿍과 함께 쓰던 일정은 짝꿍 쪽에 남고,
// 혼자 쓰던(또는 짝꿍이 이미 떠난) 커플 데이터는 모두 지움. 이 기기에 저장된 일정은 그대로 둠
async function deleteAccount() {
  if (!confirm("계정을 삭제할까요?\n\n· 로그인 정보와 서버에 저장된 내 정보가 지워져요\n· 짝꿍과 연결돼 있었다면 함께 만든 일정은 짝꿍에게 남아요\n· 혼자 쓰던 일정은 서버에서 지워지고, 이 기기에만 남아요\n\n되돌릴 수 없어요.")) return;
  const user = auth.currentUser, uid = me(), id = S.coupleId, c = S.couple;
  stopSubs();
  if (id && c) {
    if (c.members.length > 1) {
      await updateDoc(doc(db, "couples", id), { members: arrayRemove(uid), [`profiles.${uid}`]: deleteField() });
    } else {
      for (const sub of ["plans", "meta"]) {
        const snap = await getDocs(collection(db, `couples/${id}/${sub}`));
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      }
      if (c.inviteCode) await deleteDoc(doc(db, "invites", c.inviteCode)).catch(() => {});
      await deleteDoc(doc(db, "couples", id));
    }
  }
  await deleteDoc(doc(db, "users", uid));
  try { await deleteUser(user); }
  catch (e) {
    if (e.code !== "auth/requires-recent-login") throw e;
    await reauthenticateWithPopup(user, new GoogleAuthProvider());   // 오래전에 로그인했다면 한 번 더 확인
    await deleteUser(user);
  }
  try { localStorage.removeItem("voter-id"); } catch (e) {}
  leaveLocal();
  document.getElementById("accountDlg").close();
  toast("계정을 삭제했어요. 이 기기의 일정은 그대로 남아 있어요.");
}

/* ---------- 로그인 ---------- */
async function signIn() {
  const provider = new GoogleAuthProvider();
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") await signInWithRedirect(auth, provider);
    else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") throw e;
  }
}

onAuthStateChanged(auth, async user => {
  S.user = user; S.error = ""; S.loaded = false;
  if (!user) { leaveLocal(); return; }
  setPeople(user.uid);
  renderAccount();
  try {
    const u = await getDoc(doc(db, "users", user.uid));
    await setDoc(doc(db, "users", user.uid), { ...myProfile(), lastSeen: serverTimestamp() }, { merge: true });
    const coupleId = u.exists() ? u.data().coupleId : null;
    if (coupleId) subscribeCouple(coupleId);
    S.loaded = true;
    const pending = sessionStorage.getItem("pendingJoin");
    if (pending) { sessionStorage.removeItem("pendingJoin"); await run(() => joinWithCode(pending)); }
  } catch (e) { S.error = e.message; }
  S.loaded = true;
  renderAccount();
});
onSave(scheduleFlush);

/* ---------- 화면 ---------- */
const avatar = (uid, size = 32) => {
  const p = uid === me() ? myProfile() : profile(uid), color = uid === me() ? "#0b7285" : "#d6336c";
  const letter = esc((p.name || "?").slice(0, 1));
  return p.photo
    ? `<img class="av" src="${esc(p.photo)}" alt="${esc(p.name || "")}" width="${size}" height="${size}" referrerpolicy="no-referrer" style="border-color:${color}">`
    : `<span class="av" style="width:${size}px;height:${size}px;background:${color}">${letter}</span>`;
};
const inviteUrl = code => `${location.origin}${location.pathname}?join=${code}`;

// Firebase 오류를 사용자에게 보여줄 말로
function friendly(e) {
  if (!e || !e.code) return (e && e.message) || String(e);
  if (e.code === "permission-denied") return "권한이 없어요. 다시 로그인해 보세요.";
  if (e.code === "unavailable" || e.code === "auth/network-request-failed") return "인터넷 연결을 확인해 주세요.";
  if (e.code === "auth/unauthorized-domain") return "이 주소에서는 로그인할 수 없어요 (Firebase 승인된 도메인 설정 필요).";
  return e.message || String(e);
}
async function run(fn) {
  S.busy = true; S.error = ""; renderAccount();
  try { await fn(); } catch (e) { S.error = friendly(e); }
  S.busy = false; renderAccount();
}

function renderAccount() {
  const btn = document.getElementById("btnAccount"), box = document.getElementById("accountBody");
  const st = status();
  const typed = (document.getElementById("joinCode") || {}).value || "";   // 다시 그려도 입력 중인 코드는 유지
  btn.innerHTML = st === "signedout" || st === "loading" ? `${icon("user", 20)}<span class="lbl">${st === "loading" ? "…" : "로그인"}</span>`
    : st === "connected" ? `<span class="av-pair">${avatar(me(), 24)}${avatar(partnerId(), 24)}</span>`
    : `${avatar(me(), 24)}<span class="lbl"> 짝꿍 연결</span>`;
  btn.classList.toggle("connected", st === "connected");
  const pendingJoin = sessionStorage.getItem("pendingJoin");
  const err = S.error ? `<p class="notice">${esc(S.error)}</p>` : "";
  const joinForm = `<div class="row" style="flex-wrap:nowrap;margin-top:8px">
      <input type="text" id="joinCode" placeholder="받은 코드 6자리" maxlength="9" autocomplete="off" style="flex:1;min-width:0;text-transform:uppercase">
      <button class="btn primary" data-acc="join" ${S.busy ? "disabled" : ""}>연결</button></div>`;
  if (st === "loading") {
    box.innerHTML = `<p class="muted">계정 정보를 불러오는 중…</p>`;
  } else if (st === "signedout") {
    box.innerHTML = `${pendingJoin ? `<p class="notice">💌 짝꿍의 초대를 받았어요. 로그인하면 바로 연결돼요.</p>` : ""}
      <p>로그인하면 짝꿍과 같은 지도·일정·숙소 후보를 <b>실시간으로 함께</b> 편집할 수 있어요.</p>
      <p class="muted">로그인하지 않아도 지금처럼 이 기기에서 계속 쓸 수 있어요.</p>${err}
      <button class="btn primary" data-acc="signin" style="width:100%;justify-content:center;height:44px" ${S.busy ? "disabled" : ""}>Google로 로그인</button>`;
  } else if (st === "solo") {
    box.innerHTML = `<div class="acc-me">${avatar(me(), 40)}<div><b>${esc(myProfile().name)}</b><div class="muted">${esc(S.user.email || "")}</div></div></div>${err}
      <h3>짝꿍과 연결하기</h3>
      <p class="muted">초대 코드를 만들어 짝꿍에게 보내거나, 받은 코드를 입력하세요. 지금 기기에 있는 일정은 연결하면 그대로 함께 쓰게 돼요.</p>
      <button class="btn primary" data-acc="invite" style="width:100%;justify-content:center;height:44px" ${S.busy ? "disabled" : ""}>초대 코드 만들기</button>
      ${joinForm}`;
  } else if (st === "waiting") {
    const code = S.couple.inviteCode, exp = S.couple.inviteExpires && S.couple.inviteExpires.toDate();
    box.innerHTML = `<div class="acc-me">${avatar(me(), 40)}<div><b>${esc(myProfile().name)}</b><div class="muted">짝꿍을 기다리는 중</div></div></div>${err}
      <div class="invite-box"><span class="muted">초대 코드</span><b id="inviteCode">${esc(code.slice(0, 3))} ${esc(code.slice(3))}</b>
        <span class="muted">${exp ? `${exp.getMonth() + 1}/${exp.getDate()} ${String(exp.getHours()).padStart(2, "0")}:${String(exp.getMinutes()).padStart(2, "0")}까지 유효` : ""}</span></div>
      <div class="row" style="flex-wrap:nowrap">
        <button class="btn primary" data-acc="share" style="flex:1;justify-content:center;height:44px">초대 보내기</button>
        <button class="btn" data-acc="copy" style="flex:1;justify-content:center;height:44px">링크 복사</button>
      </div>
      <button class="btn sm" data-acc="invite" style="margin-top:8px">새 코드 만들기</button>
      <p class="muted" style="margin-top:14px">짝꿍에게 초대를 받았다면:</p>${joinForm}`;
  } else {
    const pid = partnerId();
    box.innerHTML = `<div class="acc-pair">${avatar(me(), 48)}<span class="heart">♥</span>${avatar(pid, 48)}</div>
      <p style="text-align:center"><b>${esc(myProfile().name)}</b> · <b>${esc(profile(pid).name || "짝꿍")}</b></p>
      <p class="muted" style="text-align:center">${navigator.onLine ? "실시간으로 함께 편집하고 있어요" : "오프라인 — 연결되면 자동으로 맞춰져요"}</p>${err}`;
  }
  if (st !== "signedout") box.innerHTML += `<div class="row" style="justify-content:space-between;margin-top:16px">
      ${st === "connected" ? `<button class="btn sm" data-acc="disconnect">연결 해제</button>` : "<span></span>"}
      <button class="btn sm" data-acc="signout">로그아웃</button></div>
      <p class="acc-foot"><a href="privacy.html" target="_blank" rel="noopener">개인정보처리방침</a> · <button class="linkish" data-acc="delete">계정 삭제</button></p>`;
  else box.innerHTML += `<p class="acc-foot"><a href="privacy.html" target="_blank" rel="noopener">개인정보처리방침</a></p>`;
  const input = document.getElementById("joinCode");
  if (input && typed) input.value = typed;
}

function bindAccountUI() {
  const dlg = document.getElementById("accountDlg");
  document.getElementById("btnAccount").onclick = () => { renderAccount(); dlg.showModal(); };
  dlg.addEventListener("click", async e => {
    if (e.target === dlg) return dlg.close();
    const b = e.target.closest("[data-acc]"); if (!b) return;
    const act = b.dataset.acc;
    if (act === "close") return dlg.close();
    if (act === "signin") return run(signIn);
    if (act === "signout") { stopSubs(); await signOut(auth); return; }
    if (act === "invite") return run(createInvite);
    if (act === "join") { const v = document.getElementById("joinCode").value; return run(() => joinWithCode(v)); }
    if (act === "disconnect") return run(disconnect);
    if (act === "delete") return run(deleteAccount);
    const code = S.couple && S.couple.inviteCode;
    if (act === "share" && code) {
      const text = `우리 여행 지도에 초대할게! 코드: ${code.slice(0, 3)} ${code.slice(3)}`;
      if (navigator.share) { try { await navigator.share({ title: "여행 지도 초대", text, url: inviteUrl(code) }); } catch (err) {} }
      else { await navigator.clipboard.writeText(`${text}\n${inviteUrl(code)}`).catch(() => {}); toast("초대 메시지를 복사했어요"); }
    }
    if (act === "copy" && code) { await navigator.clipboard.writeText(inviteUrl(code)).catch(() => {}); toast("초대 링크를 복사했어요"); }
  });
  window.addEventListener("online", renderAccount);
  window.addEventListener("offline", renderAccount);
}

export function initSync() {
  // 초대 링크(?join=CODE)로 들어오면 기억해 두고 계정 창을 엶
  const params = new URLSearchParams(location.search);
  const join = normCode(params.get("join"));
  if (join) {
    sessionStorage.setItem("pendingJoin", join);
    params.delete("join");
    history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
  }
  bindAccountUI();
  renderAccount();
  if (join) {
    if (S.user) run(() => joinWithCode(sessionStorage.getItem("pendingJoin")).finally(() => sessionStorage.removeItem("pendingJoin")));
    document.getElementById("accountDlg").showModal();
  }
  if (EMULATOR) {
    // 에뮬레이터 테스트 전용: 구글 창 없이 로그인, 규칙 확인용 직접 읽기
    window.__test = {
      signIn: (uid, name) => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: uid, email: `${uid}@test.dev`, name, email_verified: true }))),
      read: path => getDoc(doc(db, path)).then(d => d.exists() ? d.data() : null),
      coupleId: () => S.coupleId,
      uid: () => me(),
      status,
      flush,
    };
  }
}
