# internal-study-plugin

바이브코딩대학 운영진용 공부 플러그인 마켓플레이스(`vcu-internal-plugins`). Claude Code와 Codex 둘 다 지원한다(진도·학습 기록은 Claude Code 판 기준).

- 플러그인: `plugin/internal-study` — internal_study 아카이브 MCP 연결, 과외식 공부 스킬(`study`), 진도·학습 기록(서버의 내 마이페이지)
- Claude Code: `/plugin marketplace add kuntae802/internal-study-plugin` 후 `/plugin install internal-study@vcu-internal-plugins`
- 설치 때 MCP 주소와 토큰(internal_study 내 설정에서 발급)을 묻는다.
- 판 올리기(터미널): `claude plugin marketplace update vcu-internal-plugins` 뒤 `claude plugin update internal-study@vcu-internal-plugins`. 새 판은 다음 세션부터 쓴다.
- 시험(고치는 사람만): 저장소 루트에서 `node --test tests/*.test.mjs`
