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

def _apply_address_to_ai_nodes(ai_nodes: list, base_nodes: list):
    """
    일반 노드는 제목 유사도를 기반으로 매핑하고, 표(table) 노드는 등장 순서를 기반으로 물리적 주소를 매핑합니다.
    """
    import difflib

    def get_similarity(s1, s2):
        return difflib.SequenceMatcher(None, s1.strip(), s2.strip()).ratio()

    # 1. base_nodes에서 표(table) 주소만 순서대로 추출해 둔 큐(Queue) 생성
    base_table_addresses = [
        b_node["node_address"] for b_node in base_nodes 
        if b_node.get("node_address") and "tbl[" in b_node["node_address"]
    ]

    def find_best_base_node(target_title, pool):
        best_match = None
        highest_score = 0.0
        for b_node in pool:
            # 표가 아닌 일반 문단(p) 노드들만 유사도 검사
            if b_node.get("node_address") and "tbl[" in b_node["node_address"]:
                continue
            score = get_similarity(target_title, b_node["title"])
            if score > highest_score:
                highest_score = score
                best_match = b_node
        return best_match if highest_score > 0.7 else None

    def process_recursive(curr_ai_nodes):
        for ai_node in curr_ai_nodes:
            # [A] 표(table) 노드인 경우: 순서대로 주소 할당
            if ai_node.get("type") == "table":
                if base_table_addresses:
                    # 앞에서부터 순서대로 표 주소를 꺼내서 매핑
                    ai_node["node_address"] = base_table_addresses.pop(0)
                else:
                    ai_node["node_address"] = None
            # [B] 일반 노드인 경우: 기존처럼 제목 유사도로 매핑
            else:
                match = find_best_base_node(ai_node["title"], base_nodes)
                if match:
                    ai_node["node_address"] = match["node_address"]
            
            if ai_node.get("children"):
                process_recursive(ai_node["children"])

    process_recursive(ai_nodes)

def parse_document(filepath: str, model_id: str = "models/gemini-3-flash-preview") -> dict:
    """확장자에 따라 적절한 파서를 호출하여 {nodes, usage} 구조를 반환합니다."""
    ext = filepath.lower().split('.')[-1]
    usage_empty = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

    if ext == "docx":
        return {
            "nodes": parse_docx(filepath),
            "usage": usage_empty
        }
    elif ext == "hwpx":
        from services.hwpx_extractor import extract_hwpx_with_metadata
        from services.gemini_service import analyze_structure_with_gemini
        
        # 1. HWPX 원본에서 인덱스 기반 정밀 추출 (이미 node_address 포함)
        extraction_result = extract_hwpx_with_metadata(filepath)
        raw_markdown = extraction_result["markdown"]
        base_nodes = extraction_result["nodes"]
        
        if not raw_markdown:
            return {"nodes": [], "usage": usage_empty}
            
        # 2. Gemini AI 분석 (논리적 계층 및 가이드라인 보강)
        ai_result = analyze_structure_with_gemini(raw_markdown, model_id=model_id)
        
        # 3. 재귀적으로 모든 노드에 주소 매핑
        _apply_address_to_ai_nodes(ai_result["nodes"], base_nodes)
        
        return {"nodes": ai_result["nodes"], "usage": ai_result["usage"]}
    else:
        return {"nodes": [], "usage": usage_empty}

async def parse_document_stream(filepath: str, model_id: str = "models/gemini-3-flash-preview"):
    """확장자에 따라 스트리밍 방식으로 상태를 보고하며 파서 호출"""
    ext = filepath.lower().split('.')[-1]
    
    if ext == "hwpx" or ext == "pdf":
        from services.hwpx_extractor import extract_hwpx_with_metadata
        from services.gemini_service import analyze_structure_stream
        
        yield {"status": "extracting", "message": "물리적 인덱스 기반으로 문서 구조를 정밀 분석 중..."}
        extraction_result = extract_hwpx_with_metadata(filepath)
        raw_markdown = extraction_result["markdown"]
        base_nodes = extraction_result["nodes"]
        
        if not raw_markdown:
            yield {"status": "error", "message": "문서 텍스트 추출에 실패했습니다."}
            return
            
        yield {"status": "extracting_done", "message": "물리 주소 매핑 완료. Gemini AI가 논리적 맥락을 분석합니다."}
        
        full_ai_data = None
        async for event in analyze_structure_stream(raw_markdown, model_id=model_id):
            if event["status"] == "completed":
                full_ai_data = event["data"]
                # 재귀적으로 모든 AI 노드(자식 포함)에 주소 매핑
                _apply_address_to_ai_nodes(full_ai_data["nodes"], base_nodes)
                            
                yield {
                    "status": "completed",
                    "message": "구조적 매핑 완료",
                    "data": {
                        "nodes": full_ai_data["nodes"],
                        "usage": full_ai_data["usage"]
                    }
                }
            else:
                yield event
            
    elif ext == "docx":
        nodes = parse_docx(filepath)
        yield {
            "status": "completed", 
            "message": "분석 완료", 
            "data": {"nodes": nodes, "usage": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}}
        }
    else:
        yield {"status": "error", "message": f"지원하지 않는 포맷입니다. ({ext})"}
