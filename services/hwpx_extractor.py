import zipfile
import xml.etree.ElementTree as ET
import os

# HWPX Namespaces
NS = {
    'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph',
    'hc': 'http://www.hancom.co.kr/hwpml/2011/core',
    'hh': 'http://www.hancom.co.kr/hwpml/2011/head',
    'hs': 'http://www.hancom.co.kr/hwpml/2011/section',
}

def get_para_text(p_elem):
    """문단 내의 모든 텍스트 요소를 합쳐 문자열로 반환 (fwSpace 등 보이지 않는 제어문자 사이의 텍스트 포함)"""
    return "".join(p_elem.itertext())

def extract_hwpx_to_markdown(file_path: str) -> str:
    """HWPX 파일의 Contents/section.xml을 분석하여 마크다운 텍스트(표 포함)로 순차 추출합니다."""
    if not os.path.exists(file_path):
        return ""

    markdown_lines = []
    
    try:
        with zipfile.ZipFile(file_path, 'r') as zp:
            # 섹션 파일 찾기
            sections = sorted([f for f in zp.namelist() if f.startswith('Contents/section') and f.endswith('.xml')])
            global_table_idx = 0
            
            for section_file in sections:
                with zp.open(section_file) as sf:
                    tree = ET.parse(sf)
                    root = tree.getroot()
                    
                    # XML 엘리먼트를 재귀적으로 탐색하여 표 안팎의 텍스트 중복 추출을 방지
                    def traverse(elem, in_table=False):
                        nonlocal global_table_idx
                        tag = elem.tag.split('}')[-1]
                        
                        if tag == 'tbl' and not in_table:
                            markdown_lines.append(f"\n[Table INDEX: {global_table_idx}]")
                            # 표 내부 처리
                            for tr in elem.iter(f"{{{NS['hp']}}}tr"):
                                row_texts = []
                                for tc in tr.iter(f"{{{NS['hp']}}}tc"):
                                    cell_text = get_para_text(tc).strip()
                                    # 셀 내의 줄바꿈 제거
                                    cell_text = cell_text.replace('\n', ' ').replace('\r', '')
                                    row_texts.append(cell_text)
                                markdown_lines.append("| " + " | ".join(row_texts) + " |")
                                # 헤더 구분선 추가
                                if len(markdown_lines) > 0 and markdown_lines[-1].startswith("|") and markdown_lines[-2].startswith("\n[Table INDEX:"):
                                    markdown_lines.append("|" + "|".join(["---" for _ in row_texts]) + "|")
                            
                            global_table_idx += 1
                            # 표 자체를 그렸으니, 표 내부에 있는 <p> 요소들은 다시 순회하지 않도록 리턴
                            return
                        
                        if tag == 'p' and not in_table:
                            # 텍스트 추출 (표 내부가 아닌 순수 문단)
                            # 단, 현재 <p> 요소 안에 <tbl>이 들어있는 특수 구조가 있을 경우(HWP 컨트롤)
                            tbl_in_p = list(elem.iter(f"{{{NS['hp']}}}tbl"))
                            if tbl_in_p:
                                # p 자식들을 순회 (텍스트와 tbl을 순서대로)
                                for child in elem:
                                    traverse(child, in_table=False)
                                return
                            
                            text = get_para_text(elem).strip()
                            if text:
                                markdown_lines.append(text)
                            return
                            
                        # 자식 노드 순회
                        for child in elem:
                            traverse(child, in_table)

                    # 루트부터 순회 시작
                    for child in root:
                        traverse(child)

    except Exception as e:
        print(f"Error extracting HWPX: {e}")
        return ""

    return "\n".join(markdown_lines)
