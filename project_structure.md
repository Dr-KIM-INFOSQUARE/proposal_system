# Project Structure & Connectivity Analysis

이 문서는 **Proposal System (사업계획서 자동 생성 시스템)**의 아키텍처와 프런트엔드/백엔드 간의 상세한 상호작용을 설명합니다.

---

## 1. 시스템 아키텍처 개요

본 프로젝트는 사업계획서 양식(HWPX)을 지능적으로 분석하고, AI(Gemini, NotebookLM)를 활용하여 고품질의 초안을 자동 생성하는 워크플로우를 제공합니다.

### 1-1. 시스템 구성도 (System Architecture)
```mermaid
graph TD
    subgraph "Frontend (React / Vite)"
        A[Dashboard / App.tsx] --> B[API Controller / api.ts]
        B --> C[Document Tree / UI]
    end

    subgraph "Backend (FastAPI)"
        B -- "REST API / SSE (Streaming)" --> D[Router: project.py]
        D --> E[Parser Service]
        D --> F[Gemini Service]
        D --> G[NotebookLM Service]
        D --> H[HWPX Generation Service]
        E & F & G & H --> I[(SQLite Database / SQLAlchemy)]
    end

    subgraph "External Services / Assets"
        F <--> J[Google Gemini API]
        G <--> K[Google NotebookLM API]
        H <--> L[HWPX Files (Local Storage)]
        E <--> L
    end
```

---

## 2. Backend 구조 분석 (Python / FastAPI)

### 2.1. Routers (`/routers`)
백엔드의 관문 역할을 하며, 각 기능별 API 엔드포인트를 정의합니다.
- **`project.py`**: 거의 모든 핵심 비즈니스 로직에 대한 인터페이스를 제공합니다.
    - **파일 처리**: 업로드(`upload`), 실시간 파싱(`upload-stream`), 다운로드(`download`).
    - **아이디어 정제**: 마스터 브리프 고도화(`idea/enhance-stream`).
    - **초안 생성**: NotebookLM 파이프라인(`draft/generate`).
    - **통계/관리**: 사용량 조회(`usage`), 프로젝트 삭제 및 관리.

### 2.2. Services (`/services`)
데이터 가공 및 외부 연동을 처리하는 핵심 계층입니다.
- **`parser_service.py`**: HWPX 내부의 XML 구조를 탐색하여 헤딩, 표, 가이드를 추출하여 JSON 트리 구조로 반환합니다.
- **`gemini_service.py`**: 사용자의 아이디어를 분석하고 고도화된 비즈니스 개요(Master Brief)를 생성합니다.
- **`notebooklm_service.py`**: NotebookLM과 연동하여 리서치 기반 섹션별 내용을 구체화합니다.
- **`hwpx_service.py` / `pyhwpx_service.py`**: 파싱된 데이터와 생성된 내용을 하나로 합쳐 다시 HWPX 확장자로 내보냅니다. (PyHWPX는 한컴오피스 자동화를 사용)

### 2.3. Models & Data Management
- **`models/database.py`**: SQLite 기반의 지속성 계층. `Project`, `UsageLog` 테이블을 통해 프로젝트 상태와 API 비용을 추적합니다.
- **`models/project_models.py`**: Pydantic을 활용하여 데이터의 유효성을 검증하는 요청/응답 스키마입니다.

---

## 3. Frontend 구조 분석 (React / TypeScript)

### 3.1. 화면 구성 및 상태 관리
- **`App.tsx`**: 애플리케이션의 중추로, 5단계 프로세스를 관리합니다.
    - **Steps**: 분석(Analysis) → 아이디어(Idea) → 연구(Research) → 작성(Draft) → 완성(Proposal Complete).
- **`DocumentTree` 컴포넌트**: 백엔드에서 분석된 문서 구조를 복잡한 계층 트리로 시각화하며, 섹션별 작성 지침(writing guide)과 사용자의 특정 지시사항(user instruction)을 입력할 수 있게 돕습니다.

### 3.2. API 통신 계층 (`/frontend/src/services/api.ts`)
- **Axios 기반 인스턴스**: 기본 BaseURL 설정 및 타임아웃 처리가 되어 있습니다.
- **SSE 지원**: `EventSource` 또는 `fetch`를 이용한 실시간 텍스트 피드백 수신을 지원하여, 긴 작업 시간 동안 사용자에게 인터랙티브한 경험을 제공합니다.

---

## 4. 프런트엔드-백엔드 연결성 (Connectivity)

### 4.1. 데이터 전송 방식
1. **JSON Over HTTP**: 프로젝트 설정 저장, 목록 조회 등 즉각적인 응답이 필요한 곳에 사용됩니다.
2. **Server-Sent Events (SSE)**: 백엔드의 작업(리서치 진행 상황 보고 등)이 비동기적으로 길어질 때 실시간으로 상태를 "Push" 받는 방식입니다.

### 4.2. 주요 데이터 흐름 (Data Life-cycle)
- **1단계 (파일 업로드)**: 사용자가 HWPX를 선택하면 백엔드에서 폼 분석 후 **`parsed_tree`** 데이터를 프런트로 전달합니다.
- **2단계 (아이디어 고도화)**: 프런트에서 텍스트 입력 후 백엔드에 요청하면, Gemini가 정제한 **`master_brief`**가 실시간으로 수신됩니다.
- **3단계 (프로젝트 저장)**: 사용자가 선택한 섹션(`selected_node_ids`)과 고도화된 아이디어를 DB에 저장하여 세션을 유지합니다.
- **4단계 (초안 생성)**: 백엔드가 NotebookLM에 리서치 작업을 위임하고, 결과를 **`draft_content`** 필드에 업데이트하여 스트리밍 처리합니다.
- **5단계 (최종 출력)**: 생성된 전 구간 데이터를 수집하여 백엔드에서 완성된 **`.hwpx`** 파일을 생성하고 다운로드 링크를 제공합니다.

---

## 5. 핵심 기술 스택 및 라이브러리 요약
- **UI**: React 18, Vite, TypeScript, Tailwind CSS.
- **Back**: FastAPI, Python 3.x, SQLAlchemy (SQLite), google-generativeai.
- **HWPX 처리**: LXML(직접 파싱), pyhwpx(자동화 인터페이스), win32com (Windows 연동).
- **연구 자동화**: NotebookLM MCP / Service 연동.
