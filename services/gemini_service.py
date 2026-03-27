import os
import json
import uuid
import time
import asyncio
import traceback
from typing import List, Optional, Any, Union
from dotenv import load_dotenv
from google import genai
from pydantic import BaseModel, Field, field_validator

load_dotenv()

# Pydantic 모델 정의
class Node(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    type: str = "heading" # 'heading', 'table', 'item'
    children: List["Node"] = Field(default_factory=list)
    writingGuide: Optional[str] = Field(None, description="해당 섹션에 특화된 요약된 작성 요령")
    tableMetadata: Optional[Union[str, dict, Any]] = None # 표 구조 JSON 대응

    @field_validator('children', mode='before')
    @classmethod
    def prevent_null_children(cls, v):
        if v is None: return []
        return v
    
    @field_validator('type', mode='before')
    @classmethod
    def ensure_type(cls, v):
        if not v: return "heading"
        if v == "info": return "item"
        if v not in ["heading", "table", "item"]:
            return "heading"
        return v

Node.model_rebuild()

def _get_analysis_prompt(text: str) -> str:
    """사업계획서 분석을 위한 핵심 정밀 프롬프트를 반환합니다."""
    return (
        "당신은 30년 경력의 전문적인 정부지원사업 사업계획서 분석가입니다. "
        "다음 텍스트에서 '사업계획서 양식'의 뼈대(계층 구조)를 완벽하게 추출하여 JSON 형식으로 반환하세요.\n\n"
        
        "### 🚨 분석 및 구조화 핵심 지침 (반드시 엄수할 것):\n"
        "1. **섹션 번호 필수 유지**: 제목(title) 추출 시 원본의 계층 번호 체계(1., 1-1., (1), ①, 가. 등)를 **절대 누락하지 말고 포함**하세요.\n\n"
        
        "2. **노드(Node) 타입의 정확한 분류**:\n"
        "   - **heading**: 문서의 큰 주축을 이루는 제목 또는 절 (예: 1. 사업개요, 1-1. 창업배경)\n"
        "   - **table**: 본문 내에 표(Table) 형태로 데이터를 입력해야 하는 구조. 텍스트에 [Table] 표시와 함께 마크다운 표가 등장하면 이 타입을 사용하세요.\n"
        "   - **item**: 번호는 없지만, 지원자가 반드시 구체적인 내용을 작성하여 채워 넣어야 하는 하위 목차 (예: [기술적 측면], [경제적 측면], <정량적 목표 항목> 등). 주로 단답형 명사구로 이루어져 있습니다.\n\n"
        
        "3. **표 데이터 구조화 (tableMetadata) - 🚨 중요 🚨**:\n"
        "   - 노드 타입이 **table**인 경우, 해당 표의 구조를 분석하여 'tableMetadata' 속성에 JSON 객체(또는 JSON 문자열)로 저장하세요.\n"
        "   - JSON 구조 예시:\n"
        "     {\n"
        "       \"headers\": [\"항목\", \"내용\", ...],\n"
        "       \"rows\": [{\"항목\": \"기능명\", \"내용\": null}, ...],\n"
        "       \"target_cells\": [{\"row_label\": \"...\", \"col_label\": \"...\"}, ...] // 입력을 받아야 하는 빈 칸들\n"
        "     }\n"
        "   - 표의 헤더가 복잡(Row/Col Span 포함)하더라도 최대한 논리적으로 구조화하세요.\n\n"
        
        "4. **❌ 노이즈 및 예시 데이터 필터링 (가장 중요) ❌**:\n"
        "   - 문서에 포함된 **'작성 예시', '파란색 안내 문구', '구체적인 가상 데이터(예: SIP 세션상태, 5000세션 등)'**는 절대 독립적인 노드(heading/item)로 추출하지 마십시오.\n"
        "   - 기호(`[]`, `<>`)로 묶여 있더라도, 그 내용이 '어떻게 작성하는지 알려주는 가이드'이거나 '특정 상황을 가정한 예시문'이라면 노드가 아닙니다.\n"
        "   - 단순 기호(o, -, ▶, ※)나 설명문은 별도 노드로 만들지 마십시오.\n\n"
        
        "5. **작성요령(writingGuide)의 병합**:\n"
        "   - 위 4번에서 노드로 추출하지 않은 모든 '참고', '가이드 문구', '작성 예시(작성예)' 텍스트는 버리지 마십시오.\n"
        "   - 해당 가이드가 설명하고 있는 **가장 가까운 상위 노드(heading/item/table)의 'writingGuide' 속성**에 알기 쉽게 요약하여 전부 통합해 넣으세요.\n\n"
        
        "5. **중첩 트리 구조(Nested Tree) 필수**: 추출된 섹션들은 반드시 논리적 계층에 따라 **'children' 배열 안에 중첩**되어야 합니다.\n"
        "   - 예: '1. 개요' 아래에 '1-1. 배경'이 있다면, '1-1' 노드는 '1' 노드의 'children' 배열 안에 존재해야 합니다.\n"
        "   - 절대 모든 노드를 최상위(Root) 리스트에 평면적으로(Flat) 나열하지 마십시오.\n\n"
        
        "6. **계층적 고유 ID**: 각 노드의 'id'는 논리적인 트리 계층 구조를 반영하여 생성하세요 (예: '1', '1-1', '1-1-1').\n\n"
        
        "### ⚠️ 출력 형식 (엄격 준수):\n"
        "반드시 최상위에 'nodes'라는 키를 가진 단일 JSON 객체로 반환하세요.\n"
        "{\n"
        "  \"nodes\": [ ... ]\n"
        "}\n\n"
        
        "텍스트 내용:\n" + text
    )

def _reconstruct_tree_from_json(json_text: str) -> List[dict]:
    """JSON 텍스트를 파싱하여 계층 구조 트리를 복구합니다."""
    # 마크다운 코드 블록 제거 시도 (AI가 잘못된 형식을 줄 수 있음)
    if json_text.strip().startswith("```"):
        import re
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", json_text, re.DOTALL)
        if match:
            json_text = match.group(1)

    try:
        raw_data = json.loads(json_text)
        data_list = []
        if isinstance(raw_data, dict):
            if "tree" in raw_data: data_list = raw_data["tree"]
            elif "nodes" in raw_data: data_list = raw_data["nodes"]
            else: data_list = [raw_data]
        elif isinstance(raw_data, list):
            data_list = raw_data

        all_nodes_map = {}
        root_nodes = []
        
        # 1차 통과: 모든 노드를 평면 맵에 저장
        def collect_flat(items):
            for item in items:
                if isinstance(item, dict):
                    # AI가 주지 않은 정보들에 대한 기본값 및 보정
                    raw_id = item.get("id", str(uuid.uuid4()))
                    item_id = str(raw_id).strip()
                    
                    title = str(item.get("title", "")).strip()
                    # 제목이 공백인 경우, 가이드 문구에서 발췌하거나 ID 사용
                    if not title:
                        guide = item.get("writingGuide", "")
                        if guide:
                            title = guide[:20] + "..."
                        else:
                            title = f"제목 없는 섹션 ({item_id})"
                    
                    orig_children = item.get("children", [])
                    
                    # 맵에 기록 (children은 2차 pass에서 재구성)
                    all_nodes_map[item_id] = {
                        "id": item_id,
                        "title": title,
                        "type": item.get("type", "heading"),
                        "writingGuide": item.get("writingGuide", ""),
                        "tableMetadata": item.get("tableMetadata"),
                        "children": []
                    }
                    if isinstance(orig_children, list) and orig_children:
                        collect_flat(orig_children)
        
        collect_flat(data_list)
        
        if not all_nodes_map:
             print("Warning: No nodes were collected in flat map.")
             return []

        # 2차 통과: ID 패턴(1-1-1 -> 1-1)을 분석하여 부모-자식 재구성
        # 이미 부모-자식 관계 정보가 JSON에 nested 되어 있었다면 1차 수집 시 누락되지 않도록 주의
        sorted_ids = sorted(all_nodes_map.keys(), key=lambda x: (len(str(x).split('-')), str(x)))
        
        processed_nested = set()
        for node_id in sorted_ids:
            # AI가 이미 nested하게 준 경우, collect_flat에서 children을 pop하지 않았으므로 
            # 2차 pass에서 중복 처리가 될 수 있음. logic을 simple하게 유지.
            node = all_nodes_map[node_id]
            parts = node_id.split('-')
            if len(parts) > 1:
                parent_id = "-".join(parts[:-1])
                if parent_id in all_nodes_map:
                    if node not in all_nodes_map[parent_id]["children"]:
                        all_nodes_map[parent_id]["children"].append(node)
                    processed_nested.add(node_id)
                else:
                    root_nodes.append(node)
            else:
                root_nodes.append(node)
        
        # 3차 필터: nested된 노드를 최상위에서 제거
        final_root_nodes = [n for n in root_nodes if n["id"] not in processed_nested]
        
        # Node 객체 검증 및 최종 변환
        final_nodes = []
        target_list = final_root_nodes if final_root_nodes else data_list
        
        for r in target_list:
            if not isinstance(r, dict): continue
            try:
                node_obj = Node(**r)
                final_nodes.append(node_obj.model_dump())
            except Exception as e:
                print(f"Node validation error: {e}")
                final_nodes.append(r)
        return final_nodes
    except Exception as pe:
        print(f"JSON Parsing Error: {pe}\nRaw text: {json_text[:200]}...")
        raise pe

def analyze_structure_with_gemini(text: str, model_id: str = "models/gemini-3-flash-preview") -> dict:
    """지정된 Gemini 모델을 사용하여 사업계획서 분석 및 사용량 정보를 반환합니다."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY missing in .env")

    if not model_id.startswith("models/"):
        model_id = f"models/{model_id}"

    client = genai.Client(api_key=api_key)
    prompt = _get_analysis_prompt(text)

    try:
        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
            config={'response_mime_type': 'application/json'}
        )
        
        usage_info = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        if response.usage_metadata:
            usage_info["input_tokens"] = getattr(response.usage_metadata, 'prompt_token_count', 0)
            usage_info["output_tokens"] = getattr(response.usage_metadata, 'candidates_token_count', 0)
            usage_info["total_tokens"] = getattr(response.usage_metadata, 'total_token_count', 0)

        nodes = []
        if response.text:
            nodes = _reconstruct_tree_from_json(response.text)
        
        return {"nodes": nodes, "usage": usage_info}
    except Exception as e:
        print(f"Gemini API Error ({model_id}): {e}")
        raise e

async def analyze_structure_stream(text: str, model_id: str = "models/gemini-3-flash-preview"):
    """비동기 스트리밍 방식으로 Gemini 분석을 수행합니다."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        yield {"status": "error", "message": "GEMINI_API_KEY missing"}
        return

    if not model_id.startswith("models/"):
        model_id = f"models/{model_id}"

    client = genai.Client(api_key=api_key)
    prompt = _get_analysis_prompt(text)

    print(f"Starting Gemini analysis with model: {model_id}")
    yield {"status": "start", "message": "Gemini AI가 문서 맥락을 파악하고 있습니다..."}

    try:
        print("Sending request to Gemini API (streaming)...")
        response_stream = await client.aio.models.generate_content_stream(
            model=model_id,
            contents=prompt,
            config={'response_mime_type': 'application/json'}
        )
        
        full_text = ""
        async for chunk in response_stream:
            if chunk.text:
                full_text += chunk.text
                # 수신량에 따른 동적 메시지 생성 (진행률 안내 느낌)
                recv_len = len(full_text)
                if recv_len < 2000:
                    msg = "AI가 문서의 전체적인 맥락을 파악하고 있습니다..."
                elif recv_len < 8000:
                    msg = f"섹션 간의 계층 구조를 분석하는 중... ({recv_len:,} 데이터 수집)"
                elif recv_len < 20000:
                    msg = f"상세 항목과 작성 가이드를 정밀하게 추출 중... ({recv_len:,} 데이터 수집)"
                else:
                    msg = f"방대한 문서 구조를 최종 해독하고 있습니다... ({recv_len:,} 데이터 수집)"

                yield {
                    "status": "processing", 
                    "message": msg,
                    "chunk": chunk.text
                }

        yield {"status": "reassembling", "message": "계층 구조 트리를 복구하고 최종 검증하는 중..."}

        # 공통 복구 로직 사용
        final_nodes = _reconstruct_tree_from_json(full_text)
        
        if not final_nodes:
            print("Warning: Reconstructed tree is empty!")
            yield {"status": "error", "message": "문서 구조를 인식하지 못했습니다. (비어 있음)"}
            return

        print(f"Analysis completed successfully. Nodes: {len(final_nodes)}")
        yield {
            "status": "completed", 
            "message": "분석 완료",
            "data": {
                "nodes": final_nodes,
                "usage": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
            }
        }
    except Exception as e:
        traceback.print_exc()
        print(f"Analyze structure stream error: {e}")
        yield {"status": "error", "message": f"AI 분석 중 내부 오류 발생: {str(e)}"}
