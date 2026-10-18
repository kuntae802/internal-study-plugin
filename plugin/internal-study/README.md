# internal-study

아카이브 자료로 과외식 공부를 하는 플러그인.

- `.mcp.json`: 아카이브 MCP(`archive`)를 설치 때 입력한 주소·토큰으로 연결한다.
- `skills/study/scripts/progress.mjs`: 공부 폴더의 `.internal-study/progress.json` 진도를 읽고 쓴다(Node 20+, 표준 라이브러리만).
- `hooks/hooks.json`: 세션 시작 때 공부 폴더이면 진도 요약을 보여 준다.

시험: `node --test skills/study/tests/progress.test.mjs`

설치: `/plugin install internal-study@vcu-internal-plugins`
