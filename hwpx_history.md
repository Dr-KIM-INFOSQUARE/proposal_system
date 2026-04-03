# HWPX Injection Engine Development History

이 문서는 `pyhwpx` 라이브러리를 사용하여 고정밀 HWPX 문서 초안 생성 엔진을 구축하기 위해 진행된 기술적 해결 과정과 주요 이정표를 기록합니다.

## 1. 초기 단계: 엔진 선택 및 환경 구축 (LXML vs PyHWPX)
*   **문제**: 기존 `lxml` 기반의 XML 직접 수정 방식은 한컴오피스의 복잡한 XML 스키마(깨진 태그, 스타일 손상)를 완벽히 재현하기 어려웠음.
*   **해결**: 한컴오피스 OLE 자동화를 직접 제어하는 `pyhwpx`(Native Automation) 엔진으로 전환 결정.
*   **설정**: `win32com`을 통한 HwpObject Dispatch 환경 구축 및 `uv` 워크플로우를 통한 의존성 관리.

## 2. 보안 팝업 차단 (Security Bypass)
*   **문제**: 자동 실행 시 "공통 모듈 작업" 관련 보안 승인 팝업이 발생하여 백그라운드 자동화가 중단됨.
*   **해결**: `RegisterModule` API를 사용하여 보안 모듈(`hwpx_security.dll`)을 동적 등록. 보안 경고 없이 텍스트 주입이 가능하도록 구현.

## 3. 정밀 위치 타겟팅 (SetPos & Indexing)
*   **문제**: `find_text()`와 같은 키워드 검색 방식은 제목이 중복되거나 특수문자가 있을 때 오작동함.
*   **해결**: 
    - `hwpx_extractor.py`를 통해 문서의 모든 문단(`p`)과 표(`tbl`)의 절대 인덱스를 XML 수준에서 선추출.
    - `hwp.SetPos(0, idx, 0)` API를 사용하여 해당 인덱스로 즉시 워프(Warp)하는 방식 도입.

## 4. 인덱스 밀림 및 위치 보정 (Coordinate Correction)
*   **문제**: 문서 상단에 텍스트를 주입하면 하단의 인덱스가 동적으로 변하여 주입 위치가 어긋남.
*   **해결**:
    - **역순 주입(Reverse Injection)**: 인덱스가 큰(문서 하단) 항목부터 거꾸로 주입하여 상단 구조 변화가 하단 인덱스에 영향을 주지 않도록 정렬.
    - **텍스트 검증 보정**: `SetPos` 이동 후 주변 20문단을 검색하여 제목 키워드와 일치하는지 확인하고, 위/아래로 커서를 한 문단씩 이동하며 수동 보정.

## 5. 표(Table) 데이터 정밀 주입
*   **문제**: 표 노드의 제목이 AI에 의해 임의로 생성되어 원본 제목(예: [표 1])과 매칭되지 않아 주소가 누락됨.
*   **해결**:
    - **순차 매핑(Sequential Mapping)**: 제목 유사도가 아닌, 문서 내 등장하는 실시간 순서에 따라 `tbl[idx]` 주소를 강제 할당하도록 `parser_service.py` 개편.
    - `HeadCtrl` 컨트롤 탐색을 통해 목표 표를 정확히 포착하고 `TableCellBlock`으로 특정 셀에 데이터 기입.

## 6. 누락 방지 및 폴백 전략 (Content Flag)
*   **문제**: 물리 주소(`node_address`)가 매핑되지 않은 노드들이 주입에서 누락됨.
*   **해결**:
    - `node_address` 유무보다 `"content": true` 플래그를 최우선 기준으로 타겟 수집.
    - 주소가 없는 노드들을 위해 `RepeatFind` 기반의 검색 주입(`fallback_targets`) 로직을 별도로 구축하여 2중 방어망 형성.

## 7. 주요 기술적 교훈 (Legacy Fixes)
*   **win32com 순환 참조**: `EnsureDispatch` 대신 런타임 `Dispatch`와 Lazy Import를 사용하여 초기화 에러 해결.
*   **GetText 튜플 이슈**: `pyhwpx`의 `get_text()`가 `(상태코드, 문자열)`을 반환하는 특성을 반영하여 파싱 로직 수정.
*   **커서 리셋**: 각 주입 단계 후 `MovePos(2)`를 호출하여 커서를 문서 처음으로 복구함으로써 다음 `SetPos`의 기준점 일원화.

---
*Last Updated: 2026-04-03*
