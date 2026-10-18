#!/usr/bin/env node
// internal_study 공부 진도 스크립트. 표준 라이브러리만 쓴다(Node 20+).
import fs from "node:fs";
import path from "node:path";
import tty from "node:tty";
import { fileURLToPath } from "node:url";

const MARK_DIR = ".internal-study";
const MARK_FILE = "progress.json";
const MODES = { quick: "빠른", normal: "일반", deep: "심화" };
const UNIT_STATUS = ["todo", "doing", "done"];
const PRACTICE_STATUS = ["done", "changed", "skipped"];
// `in` 은 constructor·toString 같은 상속 이름도 통과시킨다 — 자기 키만 본다
const isMode = (m) => typeof m === "string" && Object.hasOwn(MODES, m);

export function findProgress(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    const cand = path.join(dir, MARK_DIR, MARK_FILE);
    if (fs.existsSync(cand)) return cand;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function load(file) {
  const broken = () => new Error(`진도 파일이 깨졌습니다: ${file} — 지우고 init 을 다시 하세요`);
  let p;
  try {
    p = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw broken();
  }
  if (!p || typeof p !== "object" || p.version !== 1 || !Array.isArray(p.units) || !isMode(p.mode)) throw broken();
  for (const u of p.units) {
    if (!u || typeof u.id !== "string" || !UNIT_STATUS.includes(u.status) || typeof u.practices !== "object" || u.practices === null) {
      throw broken();
    }
  }
  return p;
}

function save(file, p) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(p, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

export function nextUnit(p) {
  return p.units.find((u) => u.status !== "done") ?? null;
}

export function skippedPractices(p) {
  const out = [];
  for (const u of p.units) {
    for (const [no, pr] of Object.entries(u.practices)) {
      if (pr.status === "skipped") out.push(`${u.id} 실습 ${no}`);
    }
  }
  return out;
}

export function summarize(p) {
  const done = p.units.filter((u) => u.status === "done").length;
  const next = nextUnit(p);
  const lines = [
    `internal_study 공부 진도 — ${p.title} (${p.folder}), 모드: ${MODES[p.mode]}`,
    `끝낸 차시 ${done}/${p.units.length} · 건너뛴 실습 ${skippedPractices(p).length}개`,
  ];
  if (p.last) lines.push(`지난 위치: ${p.last.unit}${p.last.section ? " " + p.last.section : ""}`);
  lines.push(next ? `다음 차시: ${next.id} ${next.title}` : "다음 차시: 없음(모두 끝남)");
  lines.push('"이어서 공부하자"라고 하면 지난 위치나 다음 차시부터 이어 간다.');
  return lines.join("\n");
}

function findUnit(p, id) {
  const u = p.units.find((x) => x.id === id);
  if (!u) throw new Error(`없는 차시입니다: ${id}`);
  return u;
}

export function applySet(p, unitId, status, section, now) {
  if (!UNIT_STATUS.includes(status)) throw new Error(`status 는 ${UNIT_STATUS.join("|")} 중 하나여야 합니다: ${status}`);
  const u = findUnit(p, unitId);
  u.status = status;
  p.last = { unit: unitId, ...(section ? { section } : {}) };
  p.updated_at = now;
  return p;
}

export function applyPractice(p, unitId, no, status, note, now) {
  if (!PRACTICE_STATUS.includes(status)) throw new Error(`status 는 ${PRACTICE_STATUS.join("|")} 중 하나여야 합니다: ${status}`);
  const u = findUnit(p, unitId);
  u.practices[String(no)] = { status, note: note ?? "" };
  p.updated_at = now;
  return p;
}

function parseArgs(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) flags[k] = true;
      else {
        flags[k] = v;
        i++;
      }
    } else pos.push(a);
  }
  return { cmd: pos[0], flags };
}

function need(flags, key) {
  if (typeof flags[key] !== "string") throw new Error(`--${key} 가 필요합니다`);
  return flags[key];
}

function resolveFile(flags) {
  const start = typeof flags.dir === "string" ? flags.dir : process.cwd();
  if (typeof flags.dir === "string") {
    const f = path.join(path.resolve(flags.dir), MARK_DIR, MARK_FILE);
    if (!fs.existsSync(f)) throw new Error(`공부 폴더가 아닙니다: ${path.resolve(flags.dir)} — init 을 먼저 하세요`);
    return f;
  }
  const f = findProgress(start);
  if (!f) throw new Error("공부 폴더를 찾지 못했습니다 — init 을 먼저 하세요");
  return f;
}

function readStdin() {
  // 터미널이면 읽지 않는다. process.stdin 을 건드리면 파이프가 논블로킹으로 바뀌어 큰 입력을 중간에 놓치므로 tty.isatty 로 본다
  if (tty.isatty(0)) return "";
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

const ITEMS_SHAPE = "차시 목록은 [{item, part?, title}] JSON 배열이어야 합니다";

// 차시 목록은 --items(JSON 문자열), --items-file(JSON 파일), 표준 입력 중 꼭 하나로 받는다.
// 비대화 실행에서 heredoc·임시 파일이 권한에 막히는 일이 있어 인자로도 받는다.
// 표준 입력은 두 인자가 다 없을 때만 읽는다 — 인자가 있는데 읽으면 닫히지 않는 파이프에서 끝없이 기다린다.
function readItems(flags) {
  const hasItems = flags.items !== undefined;
  const hasFile = flags["items-file"] !== undefined;
  const one = "차시 목록은 --items, --items-file, 표준 입력 중 하나로 주세요";
  if (hasItems && hasFile) throw new Error(one);
  let text;
  if (!hasItems && !hasFile) {
    text = readStdin();
    if (text.trim() === "") throw new Error(one);
  } else if (hasItems) {
    if (typeof flags.items !== "string") throw new Error(ITEMS_SHAPE);
    text = flags.items;
  } else {
    const f = flags["items-file"];
    if (typeof f !== "string") throw new Error("--items-file 에 JSON 파일 경로를 주세요");
    try {
      text = fs.readFileSync(path.resolve(f), "utf8");
    } catch {
      throw new Error(`차시 목록 파일을 읽지 못했습니다: ${path.resolve(f)}`);
    }
  }
  let items;
  try {
    items = JSON.parse(text);
  } catch {
    throw new Error(ITEMS_SHAPE);
  }
  if (!Array.isArray(items) || items.length === 0 || items.some((x) => !x || typeof x.item !== "string")) {
    throw new Error(ITEMS_SHAPE);
  }
  return items;
}

function cmdInit(flags) {
  const dir = path.resolve(typeof flags.dir === "string" ? flags.dir : process.cwd());
  const file = path.join(dir, MARK_DIR, MARK_FILE);
  if (fs.existsSync(file)) throw new Error(`이미 공부 폴더입니다: ${file}`);
  const mode = need(flags, "mode");
  if (!isMode(mode)) throw new Error(`mode 는 ${Object.keys(MODES).join("|")} 중 하나여야 합니다: ${mode}`);
  const items = readItems(flags);
  const now = new Date().toISOString();
  const p = {
    version: 1,
    folder: need(flags, "folder"),
    title: need(flags, "title"),
    mode,
    created_at: now,
    updated_at: now,
    last: null,
    units: items.map((x) => {
      const part = x.part ?? null;
      return {
        id: part === null ? x.item : `${x.item}#p${part}`,
        item: x.item,
        part,
        title: x.title ?? x.item,
        status: "todo",
        practices: {},
      };
    }),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  save(file, p);
  return `공부 폴더를 만들었습니다: ${file}`;
}

function runCli(argv) {
  const { cmd, flags } = parseArgs(argv);
  const now = new Date().toISOString();
  switch (cmd) {
    case "init":
      return cmdInit(flags);
    case "show": {
      const p = load(resolveFile(flags));
      return flags.skipped ? skippedPractices(p).join("\n") : summarize(p);
    }
    case "set": {
      const file = resolveFile(flags);
      const p = applySet(load(file), need(flags, "unit"), need(flags, "status"), typeof flags.section === "string" ? flags.section : undefined, now);
      save(file, p);
      return summarize(p);
    }
    case "practice": {
      const file = resolveFile(flags);
      const p = applyPractice(load(file), need(flags, "unit"), need(flags, "no"), need(flags, "status"), typeof flags.note === "string" ? flags.note : "", now);
      save(file, p);
      return summarize(p);
    }
    case "mode": {
      const file = resolveFile(flags);
      const mode = need(flags, "mode");
      if (!isMode(mode)) throw new Error(`mode 는 ${Object.keys(MODES).join("|")} 중 하나여야 합니다: ${mode}`);
      const p = load(file);
      p.mode = mode;
      p.updated_at = now;
      save(file, p);
      return summarize(p);
    }
    default:
      throw new Error("사용법: progress.mjs <init|show|set|practice|mode|hook> [--dir <공부 폴더>] …");
  }
}

function runHook() {
  try {
    let cwd = process.cwd();
    try {
      const input = JSON.parse(readStdin() || "{}");
      if (input && typeof input.cwd === "string") cwd = input.cwd;
    } catch {
      /* 입력이 없어도 현재 폴더로 진행 */
    }
    const file = findProgress(cwd);
    if (!file) return;
    const s = summarize(load(file));
    process.stdout.write(
      JSON.stringify({ systemMessage: s, hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: s } }) + "\n",
    );
  } catch {
    /* 깨진 파일 등은 조용히 넘긴다 */
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  if (process.argv[2] === "hook") {
    runHook();
    process.exit(0);
  }
  try {
    const out = runCli(process.argv.slice(2));
    if (out) process.stdout.write(out + "\n");
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}
