import os
import json
import re
import uuid
import asyncio
from typing import List, AsyncGenerator
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

# 전역 클라이언트 인스턴스 (Lazy Initialization)
_client = None

def _get_client():
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            from dotenv import load_dotenv
            load_dotenv()
            api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("No API key was provided. Please check your .env file.")
        _client = genai.Client(api_key=api_key)
    return _client

# Pydantic 모델 정의
class TableMetadata(BaseModel):
    headers: List[str] = Field(default_factory=list)
    rows: List[List[str]] = Field(default_factory=list)
    target_cells: List[List[int]] = Field(default_factory=list, description="작성 대상이 되는 [row, col] 인덱스 리스트")

class Node(BaseModel):
    id: str
    title: str
    type: str = "heading"
    writingGuide: str = ""
    node_address: str | None = None
    children: List['Node'] = Field(default_factory=list)
    checked: bool = True
    contentChecked: bool = False
    tableMetadata: TableMetadata | None = None

def _get_analysis_prompt(text: str) -> str:
    """사업계획서 분석을 위한 시스템 프롬프트 생성"""
    return (
        "당신은 30년 경력의 전문적인 정부지원사업 사업계획서 분석가입니다. \n"
        "다음 텍스트에서 '사업계획서 양식'의 뼈대(계층 구조)를 완벽하게 추출하여 JSON 형식으로 반환하세요.\n\n"

        "### 🚨 분석 및 구조화 핵심 지침 (반드시 엄수할 것):\n"
        "1. **섹션 번호 필수 유지**: 제목(title) 추출 시 원본의 계층 번호 체계(1., 1-1., (1), ①, 가. 등)를 **절대 누락하지 말고 포함**하세요.\n"

        "2. **노드(Node) 타입의 정확한 분류 및 구조화 규칙**:\n"
        "   - **heading**: 문서의 큰 주축을 이루는 제목 또는 절 (예: 1. 사업개요, 1-1. 창업배경)\n"
        "   - **item**: 번호는 없지만, 지원자가 반드시 구체적인 내용을 작성하여 채워 넣어야 하는 하위 목차 (예: [기술적 측면], [경제적 측면], <정량적 목표 항목> 등). 주로 단답형 명사구로 이루어져 있습니다.\n"
        "   - **table**: 본문 내에 존재하는 표(Table) 데이터.\n"
        "     🚨[표 구조화 절대 규칙]🚨 목차 제목(예: '(1) 시장 규모 및 현황') 자체를 `table` 타입으로 지정하지 마십시오. **목차 제목은 무조건 `heading` 또는 `item`으로 설정하고, 실제 표는 해당 목차의 하위 자식 노드(children)로 분리하여 `type: \"table\"`로 생성**해야 합니다. (이때 표 노드의 제목은 '[표] 시장 규모 테이블' 처럼 내용을 유추할 수 있게 임의로 생성하세요.)\n\n"
        
        "3. **표 데이터 구조화 (tableMetadata) - 🚨 중요 🚨**:\n"
        "   - 노드 타입이 **table**인 경우, 해당 표의 구조를 분석하여 'tableMetadata' 속성에 JSON 객체로 **반드시** 저장하세요.\n"
        "   - JSON 구조 예시:\n"
        "     {\n"
        "       \"headers\": [\"항목\", \"내용\", ...],\n"
        "       \"rows\": [{\"항목\": \"기능명\", \"내용\": null}, ...],\n"
        "       \"target_cells\": [{\"row_label\": \"...\", \"col_label\": \"...\"}, ...] // 입력을 받아야 하는 빈 칸들\n"
        "     }\n"
        "   - 표의 헤더가 복잡(Row/Col Span 포함)하더라도 최대한 논리적으로 구조화하세요.\n\n"
        
        "4. **❌ 작성 요령의 'item' 오인 방지 (가장 중요) ❌**:\n"
        "   - AI가 가장 자주 하는 치명적 실수는 안내 문구를 새로운 'item' 노드로 착각하여 생성하는 것입니다. 이를 **절대 금지**합니다.\n"
        "   - 🚨 **[강력 경고]**: 원본 텍스트에 `* **서비스명**`, `* **서비스 내용**` 처럼 별표나 굵은 글씨 마크다운(`**`)이 강조되어 있다고 해서 이를 독립된 하위 목차(item)로 빼지 마십시오! 이는 단지 상위 목차(예: 1-1. 개발 대상 기술의 개요)를 어떻게 써야 하는지 알려주는 가이드라인일 뿐입니다.\n"
        "   - **[item 생성 절대 금지 조건]**: 텍스트가 다음 중 하나라도 해당하면 절대 새로운 노드로 만들지 말고 상위 노드의 `writingGuide`에 텍스트로만 합쳐 넣으세요.\n"
        "     1) 별표(`*`), 당구장표시(`※`), 하이픈(`-`), 동그라미(`o`) 등의 기호로 시작하는 문장\n"
        "     2) 문장 끝이 지시형 서술어('~작성', '~명시', '~기재', '~바람', '~요망')로 끝나는 경우\n"
        "     3) 내용상 지원자가 빈칸을 채워야 하는 '제목'이 아니라, 어떻게 쓰라고 알려주는 '작성요령/가이드/설명문'인 경우\n\n"

        "5. **작성요령(writingGuide)의 논리적 배치 (실제 내용 작성 노드 강제 할당)**:\n"
        "   - 추출 제외된 안내 문구(작성 예시, 가이드 등)는 절대 버리지 마십시오.\n"
        "   - 🚨 **[가이드 배치 절대 규칙]**: 작성 요령은 단순히 문서의 구조만 잡아주는 상위 대분류/중분류 `heading` 노드에는 절대 넣지 마십시오. 반드시 지원자가 **실제 내용을 작성하여 채워 넣어야 하는 '최하위 노드(자식 노드가 없는 heading이나 item)' 또는 'table' 노드의 `writingGuide` 속성**에만 편입시켜야 합니다.\n"
        "   - 🚨 **[긴 공통 가이드의 분배]**: 상위 목차 바로 아래에 여러 하위 목차를 아우르는 길고 복잡한 공통 가이드가 있더라도, 이를 상위 노드 하나에 뭉뚱그려 넣지 마십시오. 반드시 문맥을 분석하여 그 가이드가 실제로 적용될 하위의 개별 `item`, `table`, 또는 최하위 `heading` 노드들을 찾아낸 뒤, 각각의 `writingGuide`로 알맞게 쪼개서 분배하십시오.\n\n"       

        "6. **중첩 트리 구조(Nested Tree) 필수**: 추출된 섹션들은 반드시 논리적 계층에 따라 **'children' 배열 안에 중첩**되어야 합니다.\n"
        "   - 예: '1. 개요' 아래에 '1-1. 배경'이 있다면, '1-1' 노드는 '1' 노드의 'children' 배열 안에 존재해야 합니다.\n"
        "   - 절대 모든 노드를 최상위(Root) 리스트에 평면적으로(Flat) 나열하지 마십시오.\n\n"
        
        "7. **계층적 고유 ID**: 각 노드의 'id'는 논리적인 트리 계층 구조를 반영하여 생성하세요 (예: '1', '1-1', '1-1-t1'). 표(table) 노드의 경우 부모 ID 뒤에 '-t1', '-t2' 등을 붙이세요.\n\n"
        
        "8. **문서 전체 완전 분석**: \n"
        "   - 문서의 **첫 번째 줄부터 마지막 줄까지 단 하나의 섹션도 빠뜨리지 말고 반드시 모두 추출**하세요.\n"
        "   - 양식 내용에 따라 중복되는 경우에도 양식에 포함되어 있으면 반드시 결과물에 포함하세요.\n"
        "   - 출력이 길어지더라도 끝까지 완성해야 합니다. 도중에 생략하거나 중단하지 마세요.\n\n"
        
        "### ⚠️ 출력 형식 (엄격 준수):\n"
        "반드시 최상위에 'nodes'라는 키를 가진 단일 JSON 객체로 반환하세요.\n"
        "{\n"
        "  \"nodes\": [ ... ]\n"
        "}\n\n"
        "텍스트 원문:\n" + text
    )

def _get_master_brief_instruction() -> str:
    """마스터 브리프 생성을 위한 시스템 지침"""
    return (
        "당신은 정부지원 사업계획서 작성을 돕는 전문 컨설턴트입니다.\n"
        "사용자의 아이디어를 바탕으로 사업계획서 각 항목의 '핵심 내용(Master Brief)'을 생성합니다.\n\n"
        "### 📋 작성 원칙:\n"
        "1. **강력한 전문성**: 정부 과제 평가위원이 선호하는 전문 용어와 논리적 구조를 사용하세요.\n"
        "2. **가독성 규칙**:\n"
        "   - 모든 하위 항목은 반드시 표준 마크다운 리스트 기호인 하이픈('- ')으로 시작하세요.\n"
        "   - 중점(●), 별표(*), 숫자(1.) 등 다른 기호는 절대 사용하지 마세요.\n"
        "   - 각 항목 사이에는 반드시 엔터('\n')를 넣어 줄바꿈을 명확히 하세요.\n"
        "   - 항목당 내용은 구체적이고 전문적으로(최소 2~3문장 이상) 작성하세요.\n"
        "3. **언어**: 반드시 한국어로 작성하세요.\n\n"
        "### ⚠️ 절대 금지 사항:\n"
        "- 인사말, 서론, 결론, '알겠습니다' 같은 부연 설명 출력 금지.\n"
        "- 표준 마크다운(하이픈 리스트) 외의 서식 사용 금지."
    )

def _reconstruct_tree_from_json(json_text: str) -> List[dict]:
    """JSON 텍스트를 파싱하여 계층 구조 트리를 복구합니다."""
    clean_text = json_text.strip()
    match = re.search(r'(\{.*\})', clean_text, re.DOTALL)
    if match:
        clean_text = match.group(1)
    
    try:
        raw_data = json.loads(clean_text)
        items = []
        if isinstance(raw_data, dict):
            items = raw_data.get("nodes", raw_data.get("tree", [raw_data]))
        elif isinstance(raw_data, list):
            items = raw_data
        
        if not isinstance(items, list):
            items = [items]

        def format_node_recursive(node_data):
            if not isinstance(node_data, dict): return None
            formatted = {
                "id": str(node_data.get("id", uuid.uuid4())).strip(),
                "title": str(node_data.get("title", "제목 없는 섹션")).strip(),
                "type": node_data.get("type", "heading"),
                "node_address": node_data.get("node_address"),
                "writingGuide": node_data.get("writingGuide", ""),
                "tableMetadata": node_data.get("tableMetadata"),
                "checked": True,
                "contentChecked": True,
                "children": []
            }
            raw_children = node_data.get("children", [])
            if isinstance(raw_children, list):
                for child in raw_children:
                    f_child = format_node_recursive(child)
                    if f_child:
                        formatted["children"].append(f_child)
            
            if formatted["children"]:
                formatted["contentChecked"] = False
            else:
                formatted["contentChecked"] = True
            return formatted

        final_nodes = []
        for it in items:
            node = format_node_recursive(it)
            if node:
                final_nodes.append(node)
        return final_nodes
    except Exception as e:
        print(f"[GEMINI] 데이터 구조 복구 중 오류: {e}")
        raise e

def analyze_structure_with_gemini(text: str, model_id: str = "models/gemini-3-flash-preview") -> dict:
    """사업계획서 구조 분석 (일반 호출)"""
    client = _get_client()
    prompt = _get_analysis_prompt(text)
    try:
        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
            config={'response_mime_type': 'application/json'}
        )
        nodes = _reconstruct_tree_from_json(response.text)
        usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        if response.usage_metadata:
            usage = {
                "input_tokens": getattr(response.usage_metadata, 'prompt_token_count', 0),
                "output_tokens": getattr(response.usage_metadata, 'candidates_token_count', 0),
                "total_tokens": getattr(response.usage_metadata, 'total_token_count', 0)
            }
        return {"nodes": nodes, "usage": usage}
    except Exception as e:
        print(f"Gemini Analysis Error: {e}")
        raise e

async def analyze_structure_stream(text: str, model_id: str = "models/gemini-3-flash-preview") -> AsyncGenerator[dict, None]:
    """사업계획서 구조 분석 (스트리밍 호출)"""
    client = _get_client()
    prompt = _get_analysis_prompt(text)
    
    yield {"status": f"[{model_id}] 모델 사용 가능 여부 확인...", "message": "API 연결 대기 중..."}
    
    try:
        response_stream = await client.aio.models.generate_content_stream(
            model=model_id,
            contents=prompt,
            config={'response_mime_type': 'application/json'}
        )
        
        full_text = ""
        async for chunk in response_stream:
            if chunk.text:
                full_text += chunk.text
                yield {"status": "analyzing", "message": "문서 구조를 분석하는 중입니다..."}
        
        final_nodes = _reconstruct_tree_from_json(full_text)
        yield {"status": "success", "message": "구조 분석이 완료되었습니다."}
        await asyncio.sleep(0.5)
        
        usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        yield {"status": "completed", "data": {"nodes": final_nodes, "usage": usage}}

    except Exception as e:
        print(f"Analyze structure stream error: {e}")
        yield {"status": "error", "message": str(e)}

async def enhance_business_idea_stream(idea: str, context: str = "", model_id: str = "models/gemini-3-flash-preview") -> AsyncGenerator[dict, None]:
    """비즈니스 아이디어 고도화 (스트리밍)"""
    client = _get_client()
    system_instruction = _get_master_brief_instruction()
    prompt = f"사용자 아이디어: {idea}\n\n추가 컨텍스트: {context}"
    
    yield {"status": f"[{model_id}] 모델 사용 가능 여부 확인...", "message": "API 연결 대기 중..."}
    
    try:
        response_stream = await client.aio.models.generate_content_stream(
            model=model_id,
            contents=prompt,
            config={"system_instruction": system_instruction}
        )
        
        full_markdown = ""
        async for chunk in response_stream:
            if chunk.text:
                full_markdown += chunk.text
                yield {"status": "generating", "data": full_markdown}
        
        yield {"status": "success", "message": "초안 생성이 완료되었습니다."}
        await asyncio.sleep(0.5)
        yield {"status": "completed", "data": full_markdown}

    except Exception as e:
        print(f"Enhance Idea stream error: {e}")
        yield {"status": "error", "message": str(e)}

def enhance_business_idea(idea: str, context: str = "", model_id: str = "models/gemini-3-flash-preview") -> str:
    """비즈니스 아이디어 고도화 (일반 호출)"""
    client = _get_client()
    system_instruction = _get_master_brief_instruction()
    prompt = f"사용자 아이디어: {idea}\n\n추가 컨텍스트: {context}"
    
    try:
        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
            config={"system_instruction": system_instruction}
        )
        return response.text
    except Exception as e:
        print(f"Enhance Business Idea Error: {e}")
        raise e
