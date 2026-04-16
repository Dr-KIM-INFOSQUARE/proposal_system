from lxml import etree
import zipfile
import os
import re

# HWPX Namespaces
NS = {
    'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph',
    'hc': 'http://www.hancom.co.kr/hwpml/2011/core',
    'hh': 'http://www.hancom.co.kr/hwpml/2011/head',
    'hs': 'http://www.hancom.co.kr/hwpml/2011/section',
}

# 한국어 문서 계층 랭크 (추출 시 제목 감지용)
HIERARCHY_PATTERNS = [
    (re.compile(r"^\s*[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ][.\u2024\u00b7]\s"), "heading"), # 대분류
    (re.compile(r"^\s*제\s*\d+\s*[장편부]\s+"), "heading"),
    (re.compile(r"^\s*\d+[.\u2024\u00b7]\s"), "heading"), # 1.
    (re.compile(r"^\s*\d+-\d+[.\u2024\u00b7]\s|^\s*\d+\.\d+[.\u2024\u00b7]\s"), "heading"), # 1-1.
    (re.compile(r"^\s*[가-하][.\u2024\u00b7]\s"), "heading"), # 가.
    (re.compile(r"^\s*\(\d+\)\s|^\s*\d+\)\s"), "heading"), # (1), 1)
    (re.compile(r"^\s*\([가-하]\)\s|^\s*[가-하]\)\s"), "heading"), # (가), 가)
    (re.compile(r"^\s*\[[^\]]+\]"), "heading"), # [기술적 측면] 등 대괄호 제목
    (re.compile(r"^\s*[oㅇO○●□■▪⁃\*·\-•※]\s*"), "heading"), # 특수 기호 제목
]

def get_para_text(p_elem):
    """문단 내의 모든 텍스트 요소를 합쳐 문자열로 반환"""
    return "".join(p_elem.xpath('.//hp:t/text()', namespaces=NS))

def extract_hwpx_with_metadata(file_path: str) -> dict:
    """
    HWPX 파일을 물리적으로 파싱하며 동시에 논리 노드와 주소(Index)를 매핑합니다.
    """
    if not os.path.exists(file_path):
        return {"markdown": "", "nodes": [], "metadata": []}

    markdown_lines = []
    nodes = []
    metadata = []
    
    try:
        with zipfile.ZipFile(file_path, 'r') as zp:
            # section0.xml 우선 처리
            sections = sorted([f for f in zp.namelist() if f.startswith('Contents/section') and f.endswith('.xml')])
            if not sections: return {"markdown": "", "nodes": [], "metadata": []}
            
            section_file = sections[0] # 우선 대표 섹션 하나만 처리
            with zp.open(section_file) as sf:
                parser = etree.XMLParser(recover=True)
                root = etree.fromstring(sf.read(), parser)
                
                p_idx = 0
                tbl_idx = 0
                node_stack = [] # 계층 구조 형성을 위한 스택

                # 1. 모든 문단(<hp:p>)과 표(<hp:tbl>)를 순차적으로 탐색
                # xpath('//hp:p | //hp:tbl') 은 문서 순서를 보장합니다.
                elements = root.xpath('//hp:p | //hp:tbl', namespaces=NS)
                
                for elem in elements:
                    tag = etree.QName(elem).localname
                    
                    if tag == 'p':
                        # 표 내부에 있는 p인지 확인 (부모 중 tbl이 있는지)
                        if elem.xpath('ancestor::hp:tbl', namespaces=NS):
                            continue # 표 내부 문단은 tbl 처리 시 함께 수행

                        text = get_para_text(elem).strip()
                        address = f"{section_file}/p[{p_idx}]"
                        
                        # 메타데이터 기록 (모든 문단)
                        metadata.append({"text": text, "address": address, "type": "p"})

                        if text:
                            markdown_lines.append(text)
                            
                            # 제목 패턴 감지 및 논리 노드 생성
                            is_heading = False
                            for pattern, _ in HIERARCHY_PATTERNS:
                                if pattern.match(text):
                                    is_heading = True
                                    break
                            
                            if is_heading:
                                node = {
                                    "id": f"node_{p_idx}",
                                    "title": text,
                                    "type": "heading",
                                    "node_address": address,
                                    "children": [],
                                    "checked": True,
                                    "contentChecked": False
                                }
                                nodes.append(node)
                                # TODO: 계층 구조(children)는 필요 시 Gemini가 분석하거나 
                                # 여기서 간단한 인덱스 기반으로 형성 가능
                        
                        p_idx += 1

                    elif tag == 'tbl':
                        address = f"{section_file}/tbl[{tbl_idx}]"
                        tbl_node = {
                            "id": f"table_{tbl_idx}",
                            "title": f"[표 {tbl_idx+1}]",
                            "type": "table",
                            "node_address": address,
                            "children": [],
                            "checked": True,
                            "contentChecked": True,
                            "tableMetadata": {"headers": [], "rows": [], "target_cells": []}
                        }
                        
                        # 표 내부 데이터 추출 (마크다운용)
                        rows = elem.xpath('.//hp:tr', namespaces=NS)
                        for r_idx, row in enumerate(rows):
                            cells = row.xpath('.//hp:tc', namespaces=NS)
                            row_texts = []
                            for c_idx, cell in enumerate(cells):
                                cell_text = get_para_text(cell).strip()
                                row_texts.append(cell_text)
                                # 셀 메타데이터 (필요 시 활용)
                                metadata.append({
                                    "text": cell_text,
                                    "address": f"{address}/tr[{r_idx}]/tc[{c_idx}]",
                                    "type": "tc"
                                })
                            
                            markdown_lines.append("| " + " | ".join(row_texts) + " |")
                            if r_idx == 0:
                                markdown_lines.append("|" + "|".join(["---" for _ in row_texts]) + "|")
                        
                        nodes.append(tbl_node)
                        tbl_idx += 1

                # 디버깅용 저장 (백엔드 로그 기능 활성화 시)
                print(f"[EXTRACTOR] Document processing done: {p_idx} paragraphs, {tbl_idx} tables found.")

    except Exception as e:
        print(f"Error extracting HWPX with index metadata: {e}")
        import traceback
        traceback.print_exc()

    return {
        "markdown": "\n".join(markdown_lines),
        "nodes": nodes, # 이미 주소가 채워진 노드 리스트
        "metadata": metadata
    }

def extract_hwpx_to_markdown(file_path: str) -> str:
    """마크다운만 반환하는 래퍼 함수 (구형 호환용)"""
    result = extract_hwpx_with_metadata(file_path)
    return result["markdown"]
