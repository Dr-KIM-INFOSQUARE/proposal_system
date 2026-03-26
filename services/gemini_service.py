import os
import json
import uuid
import time
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

def analyze_structure_with_gemini(text: str, model_id: str = "models/gemini-3-flash-preview") -> dict:
    """
    지정된 Gemini 모델을 사용하여 사업계획서 분석 및 사용량 정보를 반환합니다.
    { "nodes": [...], "usage": { "input": 0, "output": 0 } }
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY missing in .env")

    if not model_id.startswith("models/"):
        model_id = f"models/{model_id}"

    client = genai.Client(api_key=api_key)
    
    prompt = (
        "당신은 30년 경력의 전문적인 정부지원사업 사업계획서 분석가입니다. "
        "다음 텍스트에서 '사업계획서 양식'의 뼈대(계층 구조)를 완벽하게 추출하여 JSON 형식으로 반환하세요.\n\n"
        
        "### 🚨 분석 및 구조화 핵심 지침 (반드시 엄수할 것):\n"
        "1. **섹션 번호 필수 유지**: 제목(title) 추출 시 원본의 계층 번호 체계(1., 1-1., (1), ①, 가. 등)를 **절대 누락하지 말고 포함**하세요.\n\n"
        
        "2. **노드(Node) 타입의 정확한 분류**:\n"
        "   - **heading**: 문서의 큰 주축을 이루는 제목 또는 절 (예: 1. 사업개요, 1-1. 창업배경)\n"
        "   - **table**: 본문 내에 표(Table) 형태로 데이터를 입력해야 하는 구조\n"
        "   - **item**: 번호는 없지만, 지원자가 반드시 구체적인 내용을 작성하여 채워 넣어야 하는 하위 목차 (예: [기술적 측면], [경제적 측면], <정량적 목표 항목> 등). 주로 단답형 명사구로 이루어져 있습니다.\n\n"
        
        "3. **❌ 노이즈 및 예시 데이터 필터링 (가장 중요) ❌**:\n"
        "   - 문서에 포함된 **'작성 예시', '파란색 안내 문구', '구체적인 가상 데이터(예: SIP 세션상태, 5000세션 등)'**는 절대 독립적인 노드(heading/item)로 추출하지 마십시오.\n"
        "   - 기호(`[]`, `<>`)로 묶여 있더라도, 그 내용이 '어떻게 작성하는지 알려주는 가이드'이거나 '특정 상황을 가정한 예시문'이라면 노드가 아닙니다.\n"
        "   - 단순 기호(o, -, ▶, ※)나 설명문은 별도 노드로 만들지 마십시오.\n\n"
        
        "4. **작성요령(writingGuide)의 병합**:\n"
        "   - 위 3번에서 노드로 추출하지 않은 모든 '참고', '가이드 문구', '작성 예시(작성예)' 텍스트는 버리지 마십시오.\n"
        "   - 해당 가이드가 설명하고 있는 **가장 가까운 상위 노드(heading/item/table)의 'writingGuide' 속성**에 알기 쉽게 요약하여 전부 통합해 넣으세요.\n\n"
        
        "5. **계층적 고유 ID**: 각 노드의 'id'는 논리적인 트리 계층 구조를 반영하여 생성하세요 (예: '1', '1-1', '1-1-1').\n\n"
        
        "텍스트 내용:\n" + text
    )

    try:
        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
            config={
                'response_mime_type': 'application/json',
            }
        )
        
        # 사용량 데이터 추출
        usage_info = {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0
        }
        if response.usage_metadata:
            usage_info["input_tokens"] = getattr(response.usage_metadata, 'prompt_token_count', 0)
            usage_info["output_tokens"] = getattr(response.usage_metadata, 'candidates_token_count', 0)
            usage_info["total_tokens"] = getattr(response.usage_metadata, 'total_token_count', 0)

        nodes = []
        if response.text:
            try:
                raw_data = json.loads(response.text)
                data_list = []
                if isinstance(raw_data, dict):
                    if "tree" in raw_data: data_list = raw_data["tree"]
                    elif "nodes" in raw_data: data_list = raw_data["nodes"]
                    else: data_list = [raw_data]
                elif isinstance(raw_data, list):
                    data_list = raw_data

                for item in data_list:
                    if isinstance(item, dict):
                        title = str(item.get("title", "")).strip()
                        if not title or title in ["-", "o", "v", "*", "▶", "※"]:
                            continue
                        try:
                            node_obj = Node(**item)
                            nodes.append(node_obj.model_dump())
                        except Exception:
                            if "title" in item:
                                if "id" not in item: item["id"] = str(uuid.uuid4())
                                if "type" not in item: item["type"] = "heading"
                                nodes.append(item)
            except Exception as pe:
                print(f"JSON Parsing Error: {pe}")
                raise pe
        
        return {
            "nodes": nodes,
            "usage": usage_info
        }
        
    except Exception as e:
        print(f"Gemini API Error ({model_id}): {e}")
        raise e
