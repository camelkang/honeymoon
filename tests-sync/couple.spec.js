import { test, expect } from "@playwright/test";
import { mockNetwork } from "../tests/fixtures.js";

// 한 사람 = 브라우저 컨텍스트 하나 (기기 하나)
async function person(browser, query = "") {
  const context = await browser.newContext();
  await mockNetwork(context);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept(page.__promptAnswer ?? undefined));
  await page.goto("/index.html?nokey=1" + query);
  await page.waitForFunction(() => window.__map && window.__map.loaded() && window.__test);
  return { context, page, errors };
}
const signIn = (p, uid, name) => p.page.evaluate(([u, n]) => window.__test.signIn(u, n), [uid, name]);
const status = p => p.page.evaluate(() => window.__test.status());
const plan = (p, city = "sydney") => p.page.evaluate(c => JSON.parse(localStorage.getItem("honeymoon-app-v2")).plans[c], city);

test("커플 연결 → 실시간 공동 편집 → 권한 → 연결 해제", async ({ browser }) => {
  // 1) 민지: 혼자 추천 일정을 만들어 두고 초대 코드 생성
  const A = await person(browser);
  await A.page.click(".tabs [data-tab=plan]");
  await A.page.click("#btnSample");
  await signIn(A, "alice", "민지");
  await expect.poll(() => status(A)).toBe("solo");
  await A.page.click("#btnAccount");
  await A.page.click('[data-acc="invite"]');
  await expect(A.page.locator("#inviteCode")).toBeVisible();
  const code = (await A.page.textContent("#inviteCode")).replace(/\s/g, "");
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await expect.poll(() => status(A)).toBe("waiting");
  await A.page.click('[data-acc="close"]');

  // 2) 준호: 초대 링크로 들어와 로그인 → 자동 연결, 민지의 일정을 받음
  const B = await person(browser, "&join=" + code);
  await expect(B.page.locator("#accountDlg")).toContainText("초대를 받았어요");
  await signIn(B, "bob", "준호");
  await expect.poll(() => status(B), { timeout: 20_000 }).toBe("connected");
  await expect.poll(() => status(A), { timeout: 20_000 }).toBe("connected");
  await expect.poll(async () => (await plan(B)).days[0].stops[0], { timeout: 20_000 }).toBe("syd");
  await expect(A.page.locator("#btnAccount .av")).toHaveCount(2);

  // 3) 동시에 다른 날짜 메모를 고쳐도 둘 다 남음
  await B.page.keyboard.press("Escape");
  await B.page.click(".tabs [data-tab=plan]");
  await Promise.all([
    A.page.fill('[data-note="0"]', "민지: 공항 10시 도착"),
    B.page.fill('[data-note="2"]', "준호: 본다이 수영복 챙기기"),
  ]);
  for (const p of [A, B]) {
    await expect.poll(async () => (await plan(p)).days[0].note, { timeout: 20_000 }).toBe("민지: 공항 10시 도착");
    await expect.poll(async () => (await plan(p)).days[2].note, { timeout: 20_000 }).toBe("준호: 본다이 수영복 챙기기");
  }

  // 4) 준호가 숙소 후보를 추가하면 민지 화면에 가격 핀이 생김
  await B.page.click(".tabs [data-tab=stays]");
  await B.page.click("#btnAddStay");
  await B.page.fill("[name=name]", "서리힐스 로프트");
  await B.page.fill("[name=price]", "310");
  await B.page.click("#stayForm button[type=submit]");
  const box = await B.page.locator("#map").boundingBox();
  await B.page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.6);
  await expect.poll(async () => (await plan(A)).stays.map(s => s.name), { timeout: 20_000 }).toContain("서리힐스 로프트");
  await expect(A.page.locator(".stay-pin", { hasText: "A$310" })).toBeVisible();

  // 4-2) 함께 고르기: 민지가 좋아한 곳이 준호 카드 맨 앞에 오고, 준호도 좋아하면 둘 다 좋아요
  await A.page.click(".tabs [data-tab=pick]");
  const liked = await A.page.locator("#pickDeck .pcard:not(.back)").getAttribute("data-id");
  await A.page.click(".pbtn.like");
  await expect(B.page.locator("#pickBadge")).toHaveText("1", { timeout: 20_000 });
  await B.page.click(".tabs [data-tab=pick]");
  await expect(B.page.locator("#pickDeck .pcard:not(.back)")).toHaveAttribute("data-id", liked);
  await expect(B.page.locator("#pickDeck .pcard:not(.back)")).toContainText("짝꿍이 좋아요");
  await B.page.click(".pbtn.like");
  for (const p of [A, B]) {
    await expect(p.page.locator("#matchCount")).toHaveText("1", { timeout: 20_000 });
    await p.page.click("#pickSeg [data-pick=matches]");
    await expect(p.page.locator("#pickMatches .mrow").first()).toHaveAttribute("data-id", liked);
    await expect(p.page.locator("#pickMatches .mrow").first()).toContainText("일정 D1");   // 추천 일정에 이미 있음
  }
  expect(Object.values((await plan(A)).votes[liked])).toEqual([1, 1]);   // 두 사람의 표

  // 4-3) 준비: 민지가 낸 돈은 준호 화면에 반반 정산으로, 준호가 체크한 준비물은 민지 화면에 "준호 완료"로
  await A.page.click(".tabs [data-tab=prep]");
  await A.page.click('[data-act="addExp"]');
  await A.page.fill("#expForm [name=amount]", "300");
  await A.page.fill("#expForm [name=title]", "투어 예약");
  await A.page.click("#expForm button[type=submit]");
  await A.page.click('[data-act="ckTemplate"]');
  await B.page.click(".tabs [data-tab=prep]");
  await expect(B.page.locator(".settle")).toContainText("내가 민지에게", { timeout: 20_000 });
  await expect(B.page.locator(".settle")).toContainText("150");
  await expect(A.page.locator(".settle")).toContainText("준호이(가) 나에게");
  await expect(B.page.locator(".ck").first()).toBeVisible({ timeout: 20_000 });
  await B.page.locator(".ck", { hasText: "여행자 보험" }).locator(".ck-box").click();
  await expect(A.page.locator(".ck", { hasText: "여행자 보험" })).toContainText("준호 완료", { timeout: 20_000 });

  // 5) 이미 연결된 초대 코드로는 제3자가 들어올 수 없고, 커플 데이터도 읽을 수 없음
  const C = await person(browser);
  await signIn(C, "eve", "제3자");
  await expect.poll(() => status(C)).toBe("solo");
  await C.page.click("#btnAccount");
  await C.page.fill("#joinCode", code);
  await C.page.click('[data-acc="join"]');
  await expect(C.page.locator("#accountBody .notice")).toContainText("이미 다른 사람과 연결된 초대");
  const coupleId = await A.page.evaluate(() => window.__test.coupleId());
  const denied = await C.page.evaluate(id => window.__test.read(`couples/${id}/plans/sydney`).then(() => "read", e => e.code), coupleId);
  expect(denied).toBe("permission-denied");

  // 6) 준호가 연결 해제 → 민지는 다시 기다리는 상태, 준호 기기엔 일정이 그대로 남음
  await B.page.click("#btnAccount");
  await B.page.click('[data-acc="disconnect"]');
  await expect.poll(() => status(B)).toBe("solo");
  await expect.poll(() => status(A), { timeout: 20_000 }).toBe("waiting");
  expect((await plan(B)).days[2].note).toBe("준호: 본다이 수영복 챙기기");

  for (const p of [A, B, C]) expect(p.errors).toEqual([]);
});

test("만료되거나 없는 초대 코드는 거절", async ({ browser }) => {
  const D = await person(browser);
  await signIn(D, "dave", "도윤");
  await expect.poll(() => status(D)).toBe("solo");
  await D.page.click("#btnAccount");
  await D.page.fill("#joinCode", "ZZZ999");
  await D.page.click('[data-acc="join"]');
  await expect(D.page.locator("#accountBody .notice")).toContainText("찾을 수 없어요");
});

// 에뮬레이터 관리자 권한(Bearer owner)으로 규칙을 건너뛰고 실제로 지워졌는지 확인
const PROJECT = "demo-honeymoon";
const exists = async path => (await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/${path}`,
  { headers: { Authorization: "Bearer owner" } })).status === 200;
const authUsers = async () => ((await (await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`,
  { method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: "{}" })).json()).userInfo || []).map(u => u.localId);

test("계정 삭제: 짝꿍에겐 일정이 남고, 마지막 사람이 지우면 서버에서 모두 사라짐", async ({ browser }) => {
  const F = await person(browser);
  await F.page.click(".tabs [data-tab=plan]");
  await F.page.click("#btnSample");
  await signIn(F, "fiona", "서연");
  await expect.poll(() => status(F)).toBe("solo");
  await F.page.click("#btnAccount");
  await F.page.click('[data-acc="invite"]');
  const code = (await F.page.textContent("#inviteCode")).replace(/\s/g, "");
  await F.page.click('[data-acc="close"]');
  const G = await person(browser, "&join=" + code);
  await signIn(G, "gary", "지훈");
  await expect.poll(() => status(F), { timeout: 20_000 }).toBe("connected");
  const coupleId = await F.page.evaluate(() => window.__test.coupleId());
  const [fUid, gUid] = await Promise.all([F, G].map(p => p.page.evaluate(() => window.__test.uid())));
  await expect.poll(() => exists(`couples/${coupleId}/plans/sydney`), { timeout: 20_000 }).toBe(true);

  // 지훈이 계정 삭제 → 서연은 다시 혼자, 일정은 서버에 그대로
  await expect.poll(() => status(G), { timeout: 20_000 }).toBe("connected");
  await expect(G.page.locator("#accountDlg")).toBeVisible();   // 초대 링크로 들어오면 계정 창이 열려 있음
  await G.page.click('[data-acc="delete"]');
  await expect.poll(() => status(G), { timeout: 20_000 }).toBe("signedout");
  await expect.poll(() => status(F), { timeout: 20_000 }).toBe("waiting");
  expect(await exists(`users/${gUid}`)).toBe(false);
  expect(await exists(`couples/${coupleId}/plans/sydney`)).toBe(true);
  expect(await authUsers()).not.toContain(gUid);
  expect((await plan(G)).days[0].stops.length).toBeGreaterThan(0);   // 지훈 기기의 일정은 남음

  // 서연도 삭제 → 커플·일정·초대·내 정보 모두 사라짐
  await F.page.click("#btnAccount");
  await F.page.click('[data-acc="delete"]');
  await expect.poll(() => status(F), { timeout: 20_000 }).toBe("signedout");
  for (const path of [`couples/${coupleId}`, `couples/${coupleId}/plans/sydney`, `couples/${coupleId}/meta/app`, `users/${fUid}`, `invites/${code}`])
    expect(await exists(path), path).toBe(false);
  expect(await authUsers()).not.toContain(fUid);
  for (const p of [F, G]) expect(p.errors).toEqual([]);
});
