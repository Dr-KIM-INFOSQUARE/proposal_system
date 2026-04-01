import zipfile
import os
import xml.etree.ElementTree as ET
import shutil
import re

# HWPX Namespaces
NS = {
    'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph',
    'hc': 'http://www.hancom.co.kr/hwpml/2011/core',
    'hh': 'http://www.hancom.co.kr/hwpml/2011/head',
    'hs': 'http://www.hancom.co.kr/hwpml/2011/section',
}

def parse_markdown_table(text: str):
    """마크다운 본문에서 일반 텍스트와 표 데이터를 분리합니다."""
    lines = text.split('\n')
    normal_lines = []
    table_data = [] # 2D array
    
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('|') and stripped.endswith('|'):
            if '---' in stripped:
                continue
            cells = [c.strip() for c in stripped.split('|')[1:-1]]
            table_data.append(cells)
        else:
            if stripped:
                normal_lines.append(line)
    return normal_lines, table_data

def create_p_element(text: str, is_title: bool = False):
    """문자열을 HWPX 문단(hp:p) 엘리먼트로 변환합니다."""
    p = ET.Element(f"{{{NS['hp']}}}p")
    run = ET.SubElement(p, f"{{{NS['hp']}}}run")
    t = ET.SubElement(run, f"{{{NS['hp']}}}t")
    t.text = text
    return p

def get_para_text(p_elem):
    return "".join(p_elem.itertext()).strip()

def normalize_text(text: str):
    return re.sub(r'\s+', '', text)

def clean_markdown_formatting(text: str) -> str:
    """HWPX 본문에 넣기 부적절한 마크다운 꾸밈 기호를 제거합니다."""
    # 볼드체 제거
    text = text.replace('**', '')
    # 해시태그 형태의 제목 제거
    text = re.sub(r'^#+\s*', '', text)
    return text.strip()

def is_duplicate_title(line: str, original_title: str) -> bool:
    """초안 텍스트의 한 줄이 기존 양식의 제목을 단순히 반복하는 것인지 판별합니다."""
    norm_title = normalize_text(original_title)
    # 괄호나 마크다운 기호를 없앤 뒤 비교
    clean_line = re.sub(r'[\*\[\]]', '', line)
    norm_line = normalize_text(clean_line)
    
    if norm_line and norm_title and (norm_line == norm_title or norm_title in norm_line):
        # 단순히 제목만 포함하는 라인인지 길이 차이로 검증
        if len(norm_line) <= len(norm_title) + 5:
            return True
    return False

def generate_hwpx_from_draft(document_id: str, tree_data: list, output_path: str):
    """
    원본 HWPX를 템플릿으로 사용하여 초안 내용을 기존 양식과 문단 레이아웃을 훼손하지 않고 삽입하는 새 문서를 생성합니다.
    """
    upload_dir = "uploads"
    template_path = None
    
    # 1. 원본 템플릿 탐색 (가장 초기에 업로드 된 순수한 HWPX)
    if os.path.exists(upload_dir):
        candidates = [f for f in os.listdir(upload_dir) if f.startswith(document_id) and f.endswith(".hwpx") and not f.endswith("_draft.hwpx")]
        if candidates:
            template_path = os.path.join(upload_dir, candidates[0])

    if not template_path:
        print(f"[HWPX] Template not found for {document_id}. Original HWPX required.")
        return False

    # 제목-내용 매핑 딕셔너리 구성 (정규화된 문자열을 키로 사용)
    content_map = {}
    table_map = {}
    def extract_contents(nodes):
        for node in nodes:
            node_type = node.get('type', 'heading')
            title = node.get('title', '').strip()
            content = node.get('draft_content', '').strip()
            table_meta = node.get('tableMetadata')
            
            if node_type == 'table' and table_meta and isinstance(table_meta, dict) and 'table_index' in table_meta:
                idx = table_meta['table_index']
                table_map[idx] = {
                    "original_title": title,
                    "content": content,
                    "metadata": table_meta
                }
            elif title and content and node_type != 'table':
                content_map[normalize_text(title)] = {
                    "original_title": title,
                    "content": content,
                    "type": node_type
                }
            
            if node.get('children'):
                extract_contents(node['children'])
                
    extract_contents(tree_data)

    try:
        # 2. ZIP 패키지 조작을 통해 원본 구조 유지
        with zipfile.ZipFile(template_path, 'r') as zin:
            with zipfile.ZipFile(output_path, 'w') as zout:
                for item in zin.infolist():
                    if item.filename == 'Contents/section0.xml':
                        original_xml = zin.read(item.filename)
                        
                        for prefix, uri in NS.items():
                            ET.register_namespace(prefix, uri)
                        
                        root = ET.fromstring(original_xml)
                        inserted_keys = set()
                        current_table_idx = 0
                        
                        def process_element(parent_elem):
                            nonlocal current_table_idx
                            i = 0
                            while i < len(parent_elem):
                                child = parent_elem[i]
                                tag = child.tag.split('}')[-1]
                                
                                if tag == 'tbl':
                                    tbl_idx = current_table_idx
                                    current_table_idx += 1
                                    
                                    if tbl_idx in table_map:
                                        t_info = table_map[tbl_idx]
                                        sub_content = t_info["content"]
                                        _, table_data = parse_markdown_table(sub_content)
                                        
                                        if table_data:
                                            target_tbl = child
                                            trs = list(target_tbl.iter(f"{{{NS['hc']}}}tr"))
                                            last_tr_template = trs[-1] if trs else None
                                            
                                            for r_idx, md_row in enumerate(table_data):
                                                if r_idx < len(trs):
                                                    tr = trs[r_idx]
                                                else:
                                                    if last_tr_template is not None:
                                                        import copy
                                                        tr = copy.deepcopy(last_tr_template)
                                                        for temp_tc in tr.iter(f"{{{NS['hc']}}}tc"):
                                                            temp_ts = list(temp_tc.iter(f"{{{NS['hp']}}}t"))
                                                            if temp_ts:
                                                                temp_ts[0].text = ""
                                                                for t_node in temp_ts[1:]:
                                                                    t_node.text = ""
                                                        target_tbl.append(tr)
                                                        if 'rowCnt' in target_tbl.attrib:
                                                            row_cnt = int(target_tbl.attrib['rowCnt'])
                                                            target_tbl.set('rowCnt', str(row_cnt + 1))
                                                    else:
                                                        continue
                                                        
                                                tcs = list(tr.iter(f"{{{NS['hc']}}}tc"))
                                                for c_idx, md_cell in enumerate(md_row):
                                                    if c_idx < len(tcs):
                                                        tc = tcs[c_idx]
                                                        orig_text = "".join(tc.itertext()).strip()
                                                        if md_cell and md_cell != orig_text:
                                                            clean_val = clean_markdown_formatting(md_cell)
                                                            ts = list(tc.iter(f"{{{NS['hp']}}}t"))
                                                            if ts:
                                                                ts[0].text = clean_val
                                                                for t_node in ts[1:]:
                                                                    t_node.text = ""
                                                            else:
                                                                ps = list(tc.iter(f"{{{NS['hp']}}}p"))
                                                                if ps:
                                                                    run = ET.SubElement(ps[-1], f"{{{NS['hp']}}}run")
                                                                    t_new = ET.SubElement(run, f"{{{NS['hp']}}}t")
                                                                    t_new.text = clean_val
                                
                                process_element(child)
                                
                                if tag == 'p':
                                    para_text = get_para_text(child)
                                    if para_text.strip():
                                        norm_text = normalize_text(para_text)
                                        matched_key = None
                                        
                                        for key in content_map.keys():
                                            if key not in inserted_keys and len(norm_text) > 2:
                                                if key == norm_text or key in norm_text or norm_text in key:
                                                    matched_key = key
                                                    break
                                                    
                                        if matched_key:
                                            inserted_keys.add(matched_key)
                                            content_info = content_map[matched_key]
                                            sub_content = content_info["content"]
                                            original_title = content_info["original_title"]
                                            
                                            normal_lines, _ = parse_markdown_table(sub_content)
                                            
                                            filtered_lines = []
                                            for line in normal_lines:
                                                if not is_duplicate_title(line, original_title):
                                                    clean_line = clean_markdown_formatting(line)
                                                    if clean_line:
                                                        filtered_lines.append(clean_line)
                                            
                                            for idx, line in enumerate(filtered_lines):
                                                new_p = create_p_element(line)
                                                parent_elem.insert(i + 1 + idx, new_p)
                                                
                                            i += len(filtered_lines)
                                            
                                i += 1
                                
                        process_element(root)
                        
                        unmatched_keys = set(content_map.keys()) - inserted_keys
                        if unmatched_keys:
                            root.append(create_p_element("=== [참고용: 템플릿에 매핑되지 않은 추가 내용] ===", is_title=True))
                            for key in unmatched_keys:
                                content_info = content_map[key]
                                sub_content = content_info["content"]
                                original_title = content_info["original_title"]
                                
                                lines = sub_content.split('\n')
                                for line in lines:
                                    if line.strip() and not is_duplicate_title(line, original_title):
                                        clean_line = clean_markdown_formatting(line)
                                        if clean_line:
                                            root.append(create_p_element(clean_line))

                        new_xml = ET.tostring(root, encoding='utf-8', xml_declaration=True)
                        zout.writestr(item, new_xml)
                    else:
                        zout.writestr(item, zin.read(item.filename))
        
        print(f"[HWPX] Successfully generated with template layout: {output_path}")
        return True
    except Exception as e:
        print(f"[HWPX] Template-Based Generation Error: {e}")
        return False
