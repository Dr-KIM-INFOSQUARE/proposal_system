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
    table_metadata: str | None = Field(description="표(Table)인 경우, 표의 논리적 구조(헤더, 인덱스 라벨, 기입 대상인 빈 칸의 좌표 등)를 설명하는 JSON 문자열 (표가 아니면 null)")
    writing_guide: str | None = Field(description="해당 섹션에 포함된 '작성요령'이나 '주의사항'의 요약 (없으면 null)")



def analyze_structure_with_gemini(raw_markdown: str) -> list[dict]:
    """Gemini API를 활용하여 마크다운 텍스트에서 계층적 구조 트리를 추출합니다."""
    
    if not api_key:
        raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.")
    
    # Use gemini-2.5-flash for fast and intelligent parsing
    model = genai.GenerativeModel("gemini-2.5-flash")
    
    prompt = f"""다음은 한국어 사업계획서(HWPX) 원본에서 순차적으로 추출한 텍스트와 표(Table) 마크다운입니다.
당신은 이 문서의 뼈대를 부모-자식 관계가 명확한 '평면 리스트(Flat List)'로 분해하는 계층화 전문가입니다.

[지시사항]
1. **중요: 'title' 필드에는 문서 원본에 있는 번호(예: 1., 1-1., (1), ① 등)를 제목의 시작 부분에 반드시 포함하여 작성하십시오.**
2. 문서의 번호 체계 및 논리적 의미를 기반으로 각 항목의 부모 노드 ID(parent_id)를 설정하세요. 최상위 계층은 parent_id를 null(또는 0)로 하세요.
3. 단순히 제목뿐만 아니라, 기입해야 하는 표(Table)가 있다면 해당 표가 속한 가장 가까운 제목 트리의 자식 노드로 편입시키고, title은 "[표] 1차년도 개발 목표" 와 같이 표의 목적을 요약하세요. type은 "content"로 지정하세요.
4. **작성요령 처리:** 문서 원본에서 '작성요령', '참고사항', '주의사항' 또는 파란색 텍스트(강조된 내용) 등으로 표시된 안내 문구는 **별개의 노드로 만들지 마십시오.** 대신 해당 요령이 적용되는 부모 제목 노드의 `writing_guide` 필드에 그 내용을 핵심 위주로 요약하여 기입하십시오.
5. **표(Table) 분석:** 기입용 표인 경우 'table_metadata'에 다음과 같은 JSON 형태의 문자열을 생성하여 포함하십시오:
   - "headers": 상단/측면 전체적인 헤더 정보
   - "rows": 행/열 구조 및 데이터 개요
   - "target_cells": 실제 개발자가 내용을 채워넣어야 하는(비어있거나 (기입) 표시가 있는) 셀의 위치 또는 의미
6. id는 1부터 문맥 순서대로 겹치지 않게 순차적으로 부여하세요.
7. 자식이 있는 부모 노드는 contentChecked를 false로, 자식이 없는 최하단 노드는 true로 설정하세요.

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
                "tableMetadata": fn.get("table_metadata"),
                "writingGuide": fn.get("writing_guide"),
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
