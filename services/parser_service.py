import os
import re
from docx import Document

# 한국어 문서 특성을 반영한 절대적 계층 랭크 (10 단위 스케일)
# 값이 작을수록 상위 계층 (Root)에 가깝습니다.
HIERARCHY_RANKS = [
    # 10 단위: 가장 큰 대분류 (로마자, 제1장)
    (re.compile(r"^\s*[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ][.\u2024\u00b7]\s"), 10),
    (re.compile(r"^\s*제\s*\d+\s*[장편부]\s+"), 10),
    
    # 20 단위: 일반적인 대목차 (1., 2.)
    (re.compile(r"^\s*\d+[.\u2024\u00b7]\s"), 20),
    
    # 30 단위: 중목차 (1-1., 1.1., 가.)
    (re.compile(r"^\s*\d+-\d+[.\u2024\u00b7]\s|^\s*\d+\.\d+[.\u2024\u00b7]\s"), 30),
    (re.compile(r"^\s*[가-하][.\u2024\u00b7]\s"), 30),
    
    # 40 단위: 소목차 (1), 2) )
    (re.compile(r"^\s*\d+\)\s"), 40),
    
    # 50 단위: 괄호 숫자 ((1), (2))
    (re.compile(r"^\s*\(\d+\)\s"), 50),
    
    # 60 단위: 반괄호 한글 (가), 나) )
    (re.compile(r"^\s*[가-하]\)\s"), 60),
    
    # 70 단위: 괄호 한글 ((가), (나))
    (re.compile(r"^\s*\([가-하]\)\s"), 70),
    
    # 80 단위: 원문자 숫자 (①, ②)
    (re.compile(r"^\s*[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]"), 80),
]

# (보조용) 번호 텍스트가 생략된 경우를 대비한 스타일 매핑
KOREAN_STYLE_LEVELS = {
    "1.": 20,
    "가.": 30,
    "(1)": 50,
    "①": 80,
}

def get_heading_level(style_name: str, text: str) -> int | None:
    """스타일명 또는 텍스트 패턴에서 절대 계층 레벨(Rank)을 추출합니다."""
    # 1) 가장 확실한 텍스트 패턴(번호 매기기 규칙)을 최우선으로 검사
    # 어떤 번호 기호가 혼합되어 쓰이더라도 랭크 기반으로 완벽한 상하구조를 그림
    for pattern, rank in HIERARCHY_RANKS:
        if pattern.match(text):
            return rank
            
    # 2) 텍스트 패턴이 없는 순수 텍스트("사업 배경" 등)의 경우 Heading 스타일 참조
    if style_name.startswith("Heading"):
        try:
            level = int(style_name.split()[-1])
            return level * 10  # Heading 1 -> 10, Heading 2 -> 20 호환
        except ValueError:
            return 10
            
    # 3) Heading 스타일도 아니고 번호도 없지만 커스텀 스타일 이름이 명시적인 경우
    if style_name in KOREAN_STYLE_LEVELS:
        return KOREAN_STYLE_LEVELS[style_name]
        
    return None

def parse_docx(filepath: str) -> list:
    """
    DOCX 파일을 읽어 Heading 스타일 및 한국어 번호 패턴을 기준으로
    계층 구조 트리를 반환합니다.
    """
    doc = Document(filepath)
    
    tree = []
    stack = []
    node_id_counter = 1

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
            
        level = get_heading_level(para.style.name, text)
        
        if level is not None:
            node = {
                "id": node_id_counter,
                "title": text,
                "type": "heading",
                "checked": True,
                "contentChecked": True,
                "children": []
            }
            node_id_counter += 1

            while stack and stack[-1][1] >= level:
                stack.pop()
            
            if not stack:
                tree.append(node)
            else:
                parent_node = stack[-1][2]
                parent_node["children"].append(node)
                
            stack.append((node_id_counter - 1, level, node))
            
    # 본문이 하나도 매칭되지 않은 경우를 위한 기본값 방어 로직
    if not tree:
        tree.append({
            "id": 1,
            "title": "기본 구조 없음 (알 수 없는 포맷)",
            "type": "heading",
            "children": []
        })

    # children이 있는 노드는 contentChecked를 False로 후처리
    def uncheck_parents(nodes):
        for node in nodes:
            if node.get("children"):
                node["contentChecked"] = False
                uncheck_parents(node["children"])
    uncheck_parents(tree)

    return tree

def parse_document(filepath: str, model_id: str = "models/gemini-3-flash-preview") -> dict:
    """확장자에 따라 적절한 파서를 호출하여 {nodes, usage} 구조를 반환합니다."""
    ext = filepath.lower().split('.')[-1]
    
    usage_empty = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

    if ext == "docx":
        return {
            "nodes": parse_docx(filepath),
            "usage": usage_empty # DOCX는 로컬 파싱하므로 AI 사용량 0
        }
    elif ext == "hwpx":
        from services.hwpx_extractor import extract_hwpx_to_markdown
        from services.gemini_service import analyze_structure_with_gemini
        
        # 1. HWPX 원본에서 텍스트/표 마크다운 순차 추출
        raw_markdown = extract_hwpx_to_markdown(filepath)
        if not raw_markdown:
            return {"nodes": [], "usage": usage_empty}
            
        # 2. 추출된 데이터를 Gemini API로 넘겨 지능적 계층 트리 반환
        return analyze_structure_with_gemini(raw_markdown, model_id=model_id)
    else:
        # 지원하지 않는 포맷
        return {
            "nodes": [
                {
                    "id": 1,
                    "title": f"지원하지 않거나 준비 중인 포맷 ({ext})",
                    "type": "heading",
                    "children": []
                }
            ],
            "usage": usage_empty
        }
