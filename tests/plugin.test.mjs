// 플러그인 문장·설정 점검 — 저장소 루트에서 `node --test tests/*.test.mjs`.플러그인을 쓰는 데는 Node 가 필요 없다(고치는 사람만 돌린다).
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
  const m = fm.match(/matcher: "([^"]+)"/);
  assert.ok(m, "PreToolUse matcher 가 없습니다");
  const re = new RegExp(m[1]);
  for (const t of ALL) assert.ok(re.test(prefix() + t), `${t} 가 맞지 않습니다`);
  for (const t of ["create_item", "submit_generated", "submit_outline", "submit_translation", "get_refine_brief", "get_translation_part"]) {
    assert.ok(!re.test(prefix() + t), `${t} 까지 허용합니다`);
  }
  assert.ok(!re.test("mcp__internal-study__study_record"), "플러그인 밖 연결까지 허용합니다");
  assert.ok(fm.includes("PreToolUse:"));
  assert.ok(fm.includes('"permissionDecision":"allow"'));
  assert.ok(fm.includes("command: printf"));
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
