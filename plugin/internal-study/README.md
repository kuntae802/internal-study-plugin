# internal-study

아카이브 자료로 과외식 공부를 하는 플러그인.

- `.mcp.json`: 아카이브 MCP(`archive`)를 설치 때 입력한 주소·토큰으로 연결한다. 진도와 학습 기록(확인 문답·내 질문·메모)도 이 연결로 서버의 내 마이페이지에 남는다.
- `skills/study/`: 과외식 공부 스킬. 쓰는 아카이브 도구(읽기 8개, 진도·기록 8개)를 스킬을 부른 세션 동안 미리 허용해 공부 중에 허용 창이 뜨지 않게 한다.
- 0.2.0부터 진도는 서버에 남는다. Node는 더 필요 없다. 예전 판이 공부 폴더에 남긴 `.internal-study/progress.json`은 그 폴더에서 공부를 시작할 때 서버로 한 번 가져오자고 묻는다.

설치: `/plugin install internal-study@vcu-internal-plugins`

판 올리기(터미널): `claude plugin marketplace update vcu-internal-plugins` 뒤 `claude plugin update internal-study@vcu-internal-plugins`. 새 판은 다음 세션부터 쓴다(열려 있는 세션은 `/reload-plugins`).
