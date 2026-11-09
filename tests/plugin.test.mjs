// 플러그인 문장·설정 점검 — 저장소 루트에서 `node --test tests/*.test.mjs`. 플러그인을 쓰는 데는 Node 가 필요 없다(고치는 사람만 돌린다).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = path.join(ROOT, "plugin", "internal-study");
const S = path.join(P, "skills", "study");
const read = (p) => fs.readFileSync(p, "utf8");
const json = (p) => JSON.parse(read(p));

const READ_TOOLS = ["list_folders", "list_items", "get_item", "get_index", "get_text", "search", "concepts", "get_outline"];
const STUDY_TOOLS = ["study_progress", "study_start", "study_set_unit", "study_set_practice", "study_set_mode", "study_record", "study_review_clear", "study_import"];
const ALL = [...READ_TOOLS, ...STUDY_TOOLS];
const SKILL_FILES = ["SKILL.md", "modes.md", "practice.md"];

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, "SKILL.md 머리(---)가 없습니다");
  return m[1];
}

// allowed-tools 는 YAML 목록(두 칸 들여 쓴 `- 이름`)으로 쓴다는 약속까지 같이 본다
function allowedTools(fm) {
  const lines = fm.split("\n");
  const i = lines.indexOf("allowed-tools:");
  assert.ok(i >= 0, "allowed-tools: 줄이 없습니다");
  const out = [];
  for (const l of lines.slice(i + 1)) {
    const m = l.match(/^  - (\S+)$/);
    if (!m) break;
    out.push(m[1]);
  }
  return out;
}

// 머리 칸 한 줄(`    - matcher: "…"`)의 YAML 큰따옴표 값을 푼다 — YAML 해석기가 없으니 줄을 정확히 읽고, 이스케이프는 JSON 문자열 규칙으로 푼다
// (YAML 큰따옴표 이스케이프 가운데 JSON 과 같은 것만 쓴다는 약속 — 다른 이스케이프면 JSON.parse 가 던져 시험이 깨진다)
function matcherRegex(fm) {
  const lines = fm.split("\n").filter((l) => /^\s+- matcher: /.test(l));
  assert.equal(lines.length, 1, "PreToolUse matcher 줄이 하나가 아닙니다");
  const m = lines[0].match(/^\s+- matcher: ("(?:[^"\\]|\\.)*")$/);
  assert.ok(m, "matcher 는 큰따옴표 한 값이어야 합니다");
  return new RegExp(JSON.parse(m[1]));
}

// hook 의 args 줄(`args: ["%s", '<JSON>']`)에서 printf 가 그대로 내보낼 JSON 을 꺼낸다 — YAML 작은따옴표 안의 '' 는 ' 하나다
function hookOutput(fm) {
  const lines = fm.split("\n").filter((l) => /^\s+args: /.test(l));
  assert.equal(lines.length, 1, "hook args 줄이 하나가 아닙니다");
  const m = lines[0].match(/^\s+args: \["%s", '((?:[^']|'')*)'\]$/);
  assert.ok(m, "args 는 [\"%s\", '<JSON>'] 꼴이어야 합니다");
  return JSON.parse(m[1].replaceAll("''", "'"));
}

// 플러그인 도구 이름 앞부분 = mcp__plugin_<플러그인 이름>_<서버 이름>__ (manifest·.mcp.json 에서 만든다)
function prefix() {
  const name = json(path.join(P, ".claude-plugin", "plugin.json")).name;
  const servers = Object.keys(json(path.join(P, ".mcp.json")).mcpServers);
  assert.deepEqual(servers, ["archive"]);
  return `mcp__plugin_${name}_${servers[0]}__`;
}

test("두 manifest 의 판이 같다", () => {
  const a = json(path.join(P, ".claude-plugin", "plugin.json")).version;
  const b = json(path.join(P, ".codex-plugin", "plugin.json")).version;
  assert.equal(a, b);
  assert.match(a, /^\d+\.\d+\.\d+$/);
});

test("허용 도구 칸 = 읽기 8 + study_* 8, 플러그인 연결 이름 꼴", () => {
  const got = allowedTools(frontmatter(read(path.join(S, "SKILL.md"))));
  assert.equal(new Set(got).size, got.length, "같은 도구가 두 번 있습니다");
  assert.deepEqual([...got].sort(), ALL.map((t) => prefix() + t).sort());
});

test("허용 hook 은 같은 16개 도구에만 걸리고 allow 를 낸다", () => {
  const fm = frontmatter(read(path.join(S, "SKILL.md")));
  const re = matcherRegex(fm);
  for (const t of ALL) assert.ok(re.test(prefix() + t), `${t} 가 맞지 않습니다`);
  const BLOCKED = ["create_item", "submit_generated", "submit_outline", "submit_translation", "get_refine_brief", "get_translation_part",
    "get_outline_brief", "get_translation_brief"];
  for (const t of BLOCKED) assert.ok(!re.test(prefix() + t), `${t} 까지 허용합니다`);
  assert.ok(!re.test("mcp__internal-study__study_record"), "플러그인 밖 연결까지 허용합니다");
  assert.ok(fm.includes("PreToolUse:"));
  assert.ok(fm.includes("command: printf"));
  const out = hookOutput(fm).hookSpecificOutput;
  assert.equal(out.hookEventName, "PreToolUse");
  assert.equal(out.permissionDecision, "allow");
});

test("스킬 문서가 부르는 study_* 는 허용 칸의 8개뿐이고 8개 모두 문서에 나온다", () => {
  const body = SKILL_FILES.map((f) => read(path.join(S, f))).join("\n");
  // 앞에 글자·밑줄·붙임표가 붙은 것(`internal-study_archive`·`internal_study`)은 도구 이름이 아니다
  const used = new Set(body.match(/(?<![\w-])study_[a-z_]+/g) ?? []);
  for (const t of used) assert.ok(STUDY_TOOLS.includes(t), `허용 칸에 없는 도구: ${t}`);
  for (const t of STUDY_TOOLS) assert.ok(used.has(t), `문서에 안 나오는 도구: ${t}`);
});

test("옛 진도 스크립트·Node 점검·세션 시작 hook 이 남지 않았다", () => {
  assert.ok(!fs.existsSync(path.join(S, "scripts")), "skills/study/scripts 가 남았습니다");
  assert.ok(!fs.existsSync(path.join(S, "tests")), "skills/study/tests 가 남았습니다");
  assert.ok(!fs.existsSync(path.join(P, "hooks")), "hooks/ 가 남았습니다");
  const OLD = ["progress.mjs", "node --version", 'node "$SKILL', "--dir", "--section", "--note", "set --unit", "practice --unit", "mode --mode", "show --skipped", "`show`", "진도 스크립트"];
  for (const f of SKILL_FILES) {
    const t = read(path.join(S, f));
    for (const bad of OLD) assert.ok(!t.includes(bad), `${f} 에 옛 낱말 ${bad}`);
  }
  for (const f of ["modes.md", "practice.md"]) assert.ok(!read(path.join(S, f)).includes("progress.json"), `${f} 에 progress.json`);
  const skill = read(path.join(S, "SKILL.md"));
  const sec = skill.split("\n## ").find((s) => s.startsWith("예전 진도 가져오기"));
  assert.ok(sec, "예전 진도 가져오기 절이 없습니다");
  assert.equal(skill.split("progress.json").length, sec.split("progress.json").length, "가져오기 절 밖에 progress.json 이 있습니다");
});

test("마이페이지가 복사해 주는 문장 꼴이 트리거에 있다", () => {
  const skill = read(path.join(S, "SKILL.md"));
  assert.ok(frontmatter(skill).includes("'<과정 이름> 이어서 공부하자'"));
  assert.ok(skill.includes("「<과정 이름> 이어서 공부하자」"));
  assert.ok(skill.includes("「<폴더 제목> 이어서 공부하자」"));
});

test("기록 규칙의 핵심 문장이 있다", () => {
  const skill = read(path.join(S, "SKILL.md"));
  for (const s of ["**기록은 말한 그대로 남긴다.**", "**말한 그대로 남긴다.**", "**기록은 진도가 아니다.**", "다시 볼 것 표시를 풀까요?", "공부는 이어 갑니다.", "메모로 남겼습니다 — "]) {
    assert.ok(skill.includes(s), `없는 문장: ${s}`);
  }
});

test("서버 진도의 새 꼴(resume·창·잘린 기록·부 전체·자료 제목·가져오기)을 문장이 쓴다", () => {
  const skill = read(path.join(S, "SKILL.md"));
  const practice = read(path.join(S, "practice.md"));
  const MUST = [
    "`resume`이 이어 갈 차시다",                    // 다음 할 곳 = 서버 resume(웹 '이어서 공부하기'와 같은 차시)
    "`resume.stopped`",
    "`counts.done == counts.total`",
    "`unit_offset`을 0·30·60…으로 넘겨 가며",        // 창 밖 차시 찾기
    "`unit_offset=<ord>`",
    "`truncated: true`",                             // 잘린 다시 볼 것·메모
    "같은 뜻의 질문을 새로 만들어",
    "`p<부>`(예: `p2`)",                             // 부 차시 전체 기록
    "`item_title`",                                  // 자료 제목 칸
    "폴더에 없는 차시 <n>개는 가져오지 않았습니다",  // 가져오기 skipped
    "`data`를 고쳐 다시 부르지 않는다",
    "상위 폴더는 찾지 않는다",
    "화면에 내지 않을 글을 기록에만 쓰지 않고",       // 기록 = 화면에 낼 글(시범 실측: 기록에만 있는 해설)
    "번호 머리(\"질문 1.\")와 굵게 표시",           // 웹 기록 제목이 "질문 1." 이 되지 않게(시범 실측)                         // 작업 폴더 밖 Read 는 허용 창(시범 실측)
    "`courses`",
  ];
  for (const s of MUST) assert.ok(skill.includes(s), `SKILL.md 에 없는 문장: ${s}`);
  assert.ok(practice.includes("`unit_offset`을 0·30·60…으로 넘겨 가며"), "practice.md builds_on 이 창 밖 차시를 찾지 않습니다");
  assert.ok(!skill.includes("`units`에서 `last_unit`의 차시를 찾는다"), "다음 할 곳이 아직 last_unit 으로 찾습니다");
  assert.ok(!skill.includes("상위 폴더로 올라가며"), "예전 진도 파일을 상위 폴더까지 찾습니다(작업 폴더 밖 허용 창)");
});

test("한 응답 안의 순서 — 도구는 먼저 다, 답은 맨 끝에 한 번 다", () => {
  // 공부 시범 실측(2026-11-09, 0.2.0): 답 → study_record → 같은 답을 요약해 다시 써서 화면에 답이 두 번 나갔다(세 턴 연속).
  // 공부 시범 실측(2026-11-10, 0.2.1): 진도 → study_record(해설은 기록 칸에만) → "기록 뒤 글 금지"라 화면에 해설이 안 나갔다.
  // 두 번 다 튜터는 "도구 먼저, 글은 맨 끝"으로 움직였다 — 그 결에 맞춰 기록까지 먼저 부르고 해설은 맨 끝에 다 쓴다.
  const skill = read(path.join(S, "SKILL.md"));
  const practice = read(path.join(S, "practice.md"));
  for (const s of [
    "**한 응답 안의 순서 — 답은 한 번만 쓴다.**",
    "답보다 먼저 부른다",                              // 진도 쓰기·읽기는 앞
    "학습 기록(`study_record`)까지 모두 답보다 먼저 부른다",
    "해설을 줄이려는 것이 아니다",                     // 0.2.1 에서 해설이 사라진 것을 막는 의도 문장
    "기록에 넣은 글 그대로 줄이지 않고 다 쓴다",
    "답을 쓴 뒤에는 도구를 부르지 않는다",
    "**기록 = 화면에 낼 글.**",
    "그 문답을 확인 문답으로 먼저 남기고",
    "그 줄에는 답·해설·맞고 틀림을 쓰지 않는다",       // 도구 앞 한 줄 알림에 평가를 넣으면 평가가 두 번 나간다
    "그 구간을 마치는 응답에서 글보다 먼저 부른다",
    "`question`은 사용자가 이번에 답한 질문이다",
    "해설 뒤에 이어 쓰는 다음 질문·다음 구간 설명·닫기 정리는 넣지 않는다", // 다음 글을 기록 앞에 쓰므로 explanation 에서 뗀다
    "답 뒤에 이어 쓰는 전달·다음 질문은 넣지 않는다",
    "그 말 바로 앞 응답의 네 글(전달·답·해설) 그대로다",
    "실패 알림은 무엇이 실패했든 그 응답 맨 끝 글의 첫머리에 쓰고",
    "결과 한 줄로 그 응답을 끝낸다. 해설·다음 질문은 다시 쓰지 않는다", // "다시 남겨 줘"
    "도구에 넣은 글은 사용자에게 답으로 보이지 않는다", // 0.2.1 착각(기록에 넣었으니 말한 셈)의 뿌리
    "학습 기록은 도구 가운데 맨 나중에",              // 검색·원문을 다 읽은 뒤 기록을 짓는다
    "\"기록해 두었습니다\" 같은 말로 해설을 대신하지 않는다",
    "화면에 글이 없다는 알림이 오면 기록을 다시 부르지 말고",
    "앞 응답에서 이미 화면에 낸 글을 남기는 기록",   // 메모·다시 남겨 줘는 다시 쓰지 않는다
    "해설의 길이는 모드가 정한다",
    "새 질문 기록으로 먼저 남기고",                   // 다시 볼 것 — 내 질문
    "질문 기록을 먼저 남기고 답한다",
    "이어 갈 글의 첫머리에 한 번 쓴다",               // 가져오기 알림
    "**따로 묻거나 메모를 부탁한 응답은 그 답에서 끝낸다.**", // 이어 가면 되돌아보기·기록 경계가 한 응답에서 엉킨다(사용자 확정 11-10)
    "같은 응답에서 다음 구간으로 넘어가지 않는다",
  ]) assert.ok(skill.includes(s), `SKILL.md 에 없는 문장: ${s}`);
  const modes = read(path.join(S, "modes.md"));
  assert.ok(!skill.includes("바로 따르고, `study_set_mode"), "SKILL.md 모드 바꾸기가 아직 글 뒤에 진도를 씁니다");
  assert.ok(!modes.includes("바로 따르고 `study_set_mode"), "modes.md 모드 바꾸기가 아직 글 뒤에 진도를 씁니다");
  assert.ok(modes.includes("그 응답에서 글보다 먼저 `study_set_mode"), "modes.md 모드 바꾸기에 순서 문장이 없습니다");
  assert.ok(practice.includes("남기는 응답에서 글보다 먼저 부른다"), "practice.md 실습 진도에 순서 문장이 없습니다");
  assert.ok(practice.includes("끝나는 응답에서 글보다 먼저 `done`이나 `changed`"), "건너뛴 실습 다시 하기에 순서 문장이 없습니다");
  const open = skill.indexOf('`study_set_unit(<차시 id>, "doing")`을 먼저 부른다');
  const last = skill.indexOf("- 지난 위치를 확인한다.");
  assert.ok(open > 0 && open < last, "열기에서 doing 쓰기가 말하기보다 뒤에 있습니다");
  assert.ok(!skill.includes("다음 질문으로 가기 전에 그 문답을"), "확인 단계가 아직 기록 뒤에 다음 질문을 씁니다");
  const all = skill + practice + modes;
  for (const old of [
    "화면에 먼저, 기록은 그 뒤에", "기록이 돌아온 뒤에는 화면에 글을 더 내지 않는다", "응답 맨 끝에 부른다", "응답 맨 끝에 그 문답을", "응답 맨 끝에 새 확인 문답으로", // 0.2.1 — 해설이 사라진 순서
    "기록 뒤에 다음 질문을 쓰지 않는다", "`study_record`) 말고",
    "화면에 짧게 말할 거면",                          // 해설을 줄여도 된다는 허락으로 읽힌다
    "다시 답하고, 새 질문 기록으로 남긴다", "답한 것은 강의 밖 설명이든 아니든 질문 기록으로 남긴다", "그 사이 오간 질문은 질문 기록으로 남긴다.", // 답 → 기록 옛 순서
  ]) assert.ok(!all.includes(old), `옛 순서 문구가 남았습니다: ${old}`);
  const first = skill.indexOf("까지 모두 답보다 먼저 부른다");
  const ans = skill.indexOf("도구가 다 돌아오면 답을 한 번 쓴다");
  assert.ok(first > 0 && first < ans, "순서 규칙에서 도구 먼저가 답 쓰기보다 뒤에 있습니다");
  const done = skill.indexOf('`study_set_unit(<차시 id>, "done")`을 먼저 부른다');
  const sum = skill.indexOf("이 차시를 두세 줄로 정리한다");
  assert.ok(done > 0 && done < sum, "닫기에서 done 쓰기가 정리 글보다 뒤에 있습니다");
  assert.ok(!practice.includes("바로 넘어가고 `study_set_practice"), "건너뜀 기록이 아직 글 뒤에 진도를 씁니다");
});
