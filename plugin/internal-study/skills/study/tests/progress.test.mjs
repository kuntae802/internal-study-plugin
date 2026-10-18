import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "progress.mjs");

function tmp() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "istudy-")));
}
function run(args, { input = "", cwd } = {}) {
  const r = spawnSync("node", [SCRIPT, ...args], { input, cwd, encoding: "utf8" });
  return { out: r.stdout, err: r.stderr, code: r.status };
}
function units(n) {
  return JSON.stringify(
    Array.from({ length: n }, (_, i) => ({ item: `my-course/1-1-${i + 1}`, title: `1-1-${i + 1} 제목` })),
  );
}
function init(dir, folder = "my-course", n = 3) {
  const r = run(["init", "--dir", dir, "--folder", folder, "--title", "예시 과정", "--mode", "normal"], {
    input: units(n),
  });
  assert.equal(r.code, 0, r.err);
}
function progressPath(dir) {
  return path.join(dir, ".internal-study", "progress.json");
}

test("hook is silent without marker", () => {
  const dir = tmp();
  const r = run(["hook"], { input: JSON.stringify({ cwd: dir }) });
  assert.equal(r.code, 0);
  assert.equal(r.out, "");
});

test("hook prints summary in nested folder", () => {
  const dir = tmp();
  init(dir);
  const nested = path.join(dir, "a", "b");
  fs.mkdirSync(nested, { recursive: true });
  const r = run(["hook"], { input: JSON.stringify({ cwd: nested }) });
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out);
  assert.match(j.systemMessage, /다음 차시: my-course\/1-1-1/);
  assert.match(j.hookSpecificOutput.additionalContext, /다음 차시: my-course\/1-1-1/);
  assert.equal(j.hookSpecificOutput.hookEventName, "SessionStart");
});

test("nearest marker wins", () => {
  const outer = tmp();
  init(outer, "outer");
  const inner = path.join(outer, "sub");
  fs.mkdirSync(inner);
  init(inner, "inner");
  const r = run(["show"], { cwd: inner });
  assert.equal(r.code, 0);
  assert.match(r.out, /\(inner\)/);
  assert.doesNotMatch(r.out, /\(outer\)/);
});

test("corrupt file", () => {
  const dir = tmp();
  init(dir);
  fs.writeFileSync(progressPath(dir), "{not json");
  const h = run(["hook"], { input: JSON.stringify({ cwd: dir }) });
  assert.equal(h.code, 0);
  assert.equal(h.out, "");
  const s = run(["show", "--dir", dir]);
  assert.equal(s.code, 1);
  assert.match(s.err, /진도 파일이 깨졌습니다/);
});

test("set and practice update counts", () => {
  const dir = tmp();
  init(dir);
  assert.equal(run(["set", "--dir", dir, "--unit", "my-course/1-1-1", "--status", "done"]).code, 0);
  assert.equal(run(["set", "--dir", dir, "--unit", "my-course/1-1-2", "--status", "done", "--section", "s3"]).code, 0);
  assert.equal(run(["practice", "--dir", dir, "--unit", "my-course/1-1-2", "--no", "2", "--status", "skipped", "--note", "시간 부족"]).code, 0);
  const s = run(["show", "--dir", dir]);
  assert.match(s.out, /끝낸 차시 2\/3 · 건너뛴 실습 1개/);
  assert.match(s.out, /지난 위치: my-course\/1-1-2 s3/);
  assert.match(s.out, /다음 차시: my-course\/1-1-3 1-1-3 제목/);
  assert.match(s.out, /"이어서 공부하자"라고 하면 지난 위치나 다음 차시부터 이어 간다\./);
  const sk = run(["show", "--dir", dir, "--skipped"]);
  assert.equal(sk.out.trim(), "my-course/1-1-2 실습 2");
});

test("part units", () => {
  const dir = tmp();
  const r = run(["init", "--dir", dir, "--folder", "papers", "--title", "논문", "--mode", "quick"], {
    input: JSON.stringify([
      { item: "papers/o", part: 1, title: "o 1부" },
      { item: "papers/o", part: 2, title: "o 2부" },
    ]),
  });
  assert.equal(r.code, 0, r.err);
  const p = JSON.parse(fs.readFileSync(progressPath(dir), "utf8"));
  assert.equal(p.units[0].id, "papers/o#p1");
  assert.equal(p.units[1].id, "papers/o#p2");
  assert.equal(p.units[0].part, 1);
  assert.equal(run(["set", "--dir", dir, "--unit", "papers/o#p1", "--status", "done"]).code, 0);
  const q = JSON.parse(fs.readFileSync(progressPath(dir), "utf8"));
  assert.equal(q.units[0].status, "done");
  assert.equal(q.units[1].status, "todo");
});

test("init refuses existing", () => {
  const dir = tmp();
  init(dir);
  const r = run(["init", "--dir", dir, "--folder", "my-course", "--title", "t", "--mode", "normal"], { input: units(1) });
  assert.equal(r.code, 1);
  assert.match(r.err, /이미 공부 폴더입니다: /);
});

test("summary when all done", () => {
  const dir = tmp();
  init(dir, "my-course", 1);
  run(["set", "--dir", dir, "--unit", "my-course/1-1-1", "--status", "done"]);
  const s = run(["show", "--dir", dir]);
  assert.match(s.out, /다음 차시: 없음\(모두 끝남\)/);
  assert.match(s.out, /끝낸 차시 1\/1/);
});

test("init with --items", () => {
  const dir = tmp();
  const r = run(["init", "--dir", dir, "--folder", "my-course", "--title", "t", "--mode", "normal", "--items", units(2)]);
  assert.equal(r.code, 0, r.err);
  const p = JSON.parse(fs.readFileSync(progressPath(dir), "utf8"));
  assert.deepEqual(p.units.map((u) => u.id), ["my-course/1-1-1", "my-course/1-1-2"]);
});

test("init with --items-file", () => {
  const dir = tmp();
  const list = path.join(tmp(), "items.json");
  fs.writeFileSync(list, JSON.stringify([{ item: "papers/o", part: 1, title: "o 1부" }]));
  const r = run(["init", "--dir", dir, "--folder", "papers", "--title", "논문", "--mode", "deep", "--items-file", list]);
  assert.equal(r.code, 0, r.err);
  const p = JSON.parse(fs.readFileSync(progressPath(dir), "utf8"));
  assert.equal(p.units[0].id, "papers/o#p1");
  const missing = run(["init", "--dir", tmp(), "--folder", "papers", "--title", "논문", "--mode", "deep", "--items-file", path.join(dir, "nope.json")]);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /차시 목록 파일을 읽지 못했습니다/);
});

test("init needs exactly one item source", () => {
  const msg = /차시 목록은 --items, --items-file, 표준 입력 중 하나로 주세요/;
  const base = ["init", "--folder", "my-course", "--title", "t", "--mode", "normal"];
  const two = tmp();
  const list = path.join(tmp(), "items.json");
  fs.writeFileSync(list, units(1));
  const both = run([...base, "--dir", two, "--items", units(1), "--items-file", list]);
  assert.equal(both.code, 1);
  assert.match(both.err, msg);
  assert.equal(fs.existsSync(progressPath(two)), false);
  const none = run([...base, "--dir", tmp()]);
  assert.equal(none.code, 1);
  assert.match(none.err, msg);
});

test("inherited names are not modes", () => {
  const dir = tmp();
  const bad = run(["init", "--dir", dir, "--folder", "my-course", "--title", "t", "--mode", "constructor", "--items", units(1)]);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /mode 는 quick\|normal\|deep 중 하나여야 합니다: constructor/);
  init(dir);
  const m = run(["mode", "--dir", dir, "--mode", "toString"]);
  assert.equal(m.code, 1);
  assert.match(m.err, /mode 는 quick\|normal\|deep 중 하나여야 합니다: toString/);
  assert.equal(JSON.parse(fs.readFileSync(progressPath(dir), "utf8")).mode, "normal");
});

test("init with --items does not wait on an open stdin pipe", { skip: process.platform === "win32" }, async () => {
  // 셸 파이프(FIFO)를 열어 둔 채 닫지 않는다 — 비대화 실행에서 생길 수 있는 꼴.
  // spawn 의 stdio "pipe" 는 소켓이라 읽기가 바로 EAGAIN 으로 끝나 이 경우를 재현하지 못한다.
  const dir = tmp();
  const cmd = 'sleep 10 | { node "$0" init --dir "$1" --folder my-course --title t --mode normal --items "$2"; echo "rc=$?" >&2; }';
  const child = spawn("sh", ["-c", cmd, SCRIPT, dir, units(1)], { stdio: ["ignore", "ignore", "pipe"], detached: true });
  let err = "";
  const rc = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), 3000);
    child.stderr.on("data", (d) => {
      err += d;
      const m = err.match(/rc=(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
  });
  try {
    process.kill(-child.pid, "SIGTERM");      // sleep 까지 정리
  } catch {
    /* 이미 끝남 */
  }
  assert.equal(rc, 0, `init 이 3초 안에 끝나지 않았습니다(${rc}) ${err}`);
  assert.equal(fs.existsSync(progressPath(dir)), true);
});

test("init reads a large list from stdin", () => {
  // 파이프 버퍼(64KB)보다 큰 목록도 끝까지 읽어야 한다
  const dir = tmp();
  const r = run(["init", "--dir", dir, "--folder", "my-course", "--title", "t", "--mode", "quick"], { input: units(3000) });
  assert.equal(r.code, 0, r.err);
  assert.equal(JSON.parse(fs.readFileSync(progressPath(dir), "utf8")).units.length, 3000);
});
