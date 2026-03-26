import os
import json
from typing import List, Optional
from dotenv import load_dotenv
from google import genai
from pydantic import BaseModel, Field

load_dotenv()

# Pydantic 모델 정의
class Node(BaseModel):
    id: str
    title: str
    type: str  # 'heading', 'table', 'info'
    children: List["Node"] = Field(default_factory=list)
    writingGuide: Optional[str] = None
    tableMetadata: Optional[str] = None

# 재귀 모델 업데이트 (Pydantic V2)
Node.model_rebuild()

class DocumentStructure(BaseModel):
    tree: List[Node]

def analyze_structure_with_gemini(text: str) -> List[dict]:
    """
    최신 google-genai SDK를 사용하여 문서의 계층 구조를 분석합니다.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY missing in .env")

    client = genai.Client(api_key=api_key)
    # 최신 SDK에서는 AI Studio의 경우 'models/' 접두사가 포함된 ID 권장
    model_id = "models/gemini-2.5-flash"
    
    prompt = (
        "다음 텍스트에서 문서의 계층 구조를 분석하여 JSON 트리 리스트를 반환하세요.\n"
        "### 규칙:\n"
        "1. 제목에 원본 번호 체계를 포함하세요.\n"
        "2. 작성요령은 부모 항목의 'writingGuide'에 요약해 넣으세요.\n"
        "3. 표 정보는 'tableMetadata'에 넣으세요.\n\n"
        "텍스트:\n" + text
    )

    try:
        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
            config={
                'response_mime_type': 'application/json',
            }
        )
        
        if response.text:
            data = json.loads(response.text)
            tree_data = data.get("tree", data) if isinstance(data, dict) else data
            if not isinstance(tree_data, list):
                tree_data = [tree_data] if isinstance(tree_data, dict) else []
            
            return [Node(**item).model_dump() for item in tree_data if isinstance(item, dict)]
        return []
        
    except Exception as e:
        print(f"Gemini AI 분석 중 오류가 발생했습니다: {e}")
        return []

if __name__ == "__main__":
    sample_text = "1. 서론\n1-1. 배경\n2. 본론\n(작성요령: 내용을 상세히 입력하세요)"
    print("Gemini 분석 테스트 시작...")
    result = analyze_structure_with_gemini(sample_text)
    print(json.dumps(result, indent=2, ensure_ascii=False))
