import os
from dotenv import load_dotenv
import google.generativeai as genai
from pydantic import BaseModel, Field

# Load API key configuration
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if api_key:
    genai.configure(api_key=api_key)

# Node schema for Gemini (Flat List)
class FlatNode(BaseModel):
    id: int = Field(description="고유 ID (1부터 순차적으로 부여)")
    parent_id: int | None = Field(description="부모 노드의 고유 ID (최상단 루트면 null 또는 0)")
    title: str = Field(description="섹션 제목 또는 표/컨텐츠의 요약 제목")
    type: str = Field(description="일반 제목은 'heading', 직접 작성해야 하는 표나 서술형 컨텐츠는 'content'")
    contentChecked: bool = Field(description="최하단 노드(표 등 직접 입력이 필요한 노드)이면 true, 하위 자식이 있는 부모 노드면 false")

def analyze_structure_with_gemini(raw_markdown: str) -> list[dict]:
    """Gemini API를 활용하여 마크다운 텍스트에서 계층적 구조 트리를 추출합니다."""
    
    if not api_key:
        raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.")
    
    # Use gemini-2.5-flash for fast and intelligent parsing
    model = genai.GenerativeModel("gemini-2.5-flash")
    
    prompt = f"""다음은 한국어 사업계획서(HWPX) 원본에서 순차적으로 추출한 텍스트와 표(Table) 마크다운입니다.
당신은 이 문서의 뼈대를 부모-자식 관계가 명확한 '평면 리스트(Flat List)'로 분해하는 계층화 전문가입니다.

[지시사항]
1. 문서의 번호 체계(예: Ⅰ. -> 1. -> 1-1. -> (1) -> ①) 및 논리적 의미를 기반으로 각 항목의 부모 노드 ID(parent_id)를 설정하세요. 최상위 계층은 parent_id를 null(또는 0)로 하세요.
2. 단순히 제목뿐만 아니라, 기입해야 하는 표(Table)가 있다면 해당 표가 속한 가장 가까운 제목 트리의 자식 노드로 편입시키고, title은 "[표] 1차년도 개발 목표" 와 같이 표의 목적을 요약하세요. type은 "content"로 지정하세요.
3. id는 1부터 문맥 순서대로 겹치지 않게 순차적으로 부여하세요.
4. 자식이 있는 부모 노드는 contentChecked를 false로, 자식이 없는 최하단 노드는 true로 설정하세요.

[문서 원본 텍스트]
{raw_markdown}
"""
    
    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=list[FlatNode],
                temperature=0.1
            )
        )
        import json
        flat_nodes = json.loads(response.text)
        
        # Build tree from flat list
        nodes_by_id = {}
        tree = []
        
        for fn in flat_nodes:
            node = {
                "id": fn["id"],
                "title": fn["title"],
                "type": fn["type"],
                "checked": True,
                "contentChecked": fn.get("contentChecked", False),
                "children": []
            }
            nodes_by_id[fn["id"]] = node
            
        for fn in flat_nodes:
            node = nodes_by_id[fn["id"]]
            parent_id = fn.get("parent_id")
            if parent_id is None or parent_id == 0:
                tree.append(node)
            else:
                parent = nodes_by_id.get(parent_id)
                if parent:
                    parent["children"].append(node)
                else:
                    tree.append(node) # 부모 ID가 유효하지 않으면 루트에 추가
                    
        return tree

    except Exception as e:
        print(f"Gemini API Error: {e}")
        return []
