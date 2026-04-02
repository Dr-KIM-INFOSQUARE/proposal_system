from lxml import etree
import zipfile
import os
import shutil
import re
import tempfile
import copy

# HWPX Namespaces
NS = {
    'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph',
    'hc': 'http://www.hancom.co.kr/hwpml/2011/core',
    'hh': 'http://www.hancom.co.kr/hwpml/2011/head',
    'hs': 'http://www.hancom.co.kr/hwpml/2011/section',
}

def clean_markdown_formatting(text: str) -> str:
    """HWPX 본문에 넣기 부적절한 마크다운 꾸밈 기호를 제거합니다."""
    if not text: return ""
    text = text.replace('**', '').replace('__', '').replace('*', '').replace('_', '')
    text = re.sub(r'^#+\s*', '', text)
    return text.strip()

def inject_text_to_tc(tc_elem, text):
    """표의 셀(<hp:tc>) 내부에 텍스트를 중첩 없이 주입합니다."""
    sublist = tc_elem.find('hp:subList', namespaces=NS)
    if sublist is None: return

    # 기존 문단들 완전히 제거 (안내 문구 삭제)
    for p in sublist.xpath('./hp:p', namespaces=NS):
        sublist.remove(p)

    # 새 텍스트를 문단 단위로 주입
    lines = text.split('\n')
    for line in lines:
        if not line.strip(): continue
        p = etree.SubElement(sublist, f"{{{NS['hp']}}}p")
        run = etree.SubElement(p, f"{{{NS['hp']}}}run")
        t = etree.SubElement(run, f"{{{NS['hp']}}}t")
        t.text = str(line)

def get_node_by_address(root, address: str):
    """인덱스 기반 주소를 XPath로 변환하여 노드를 찾습니다."""
    if not address or '/' not in address:
        return None
    
    parts = address.split('/')
    xpath_parts = parts[2:] # "Contents/section0.xml" 제외
    
    try:
        # p[idx] -> hp:p[idx+1] 변환
        def to_xpath_node(p):
            tag_match = re.match(r"([a-z]+)\[(\d+)\]", p)
            if tag_match:
                tag, idx = tag_match.groups()
                return f"hp:{tag}[{int(idx) + 1}]"
            return f"hp:{p}"

        refined_xpath = "./" + "/".join([to_xpath_node(p) for p in xpath_parts])
        nodes = root.xpath(refined_xpath, namespaces=NS)
        return nodes[0] if nodes else None
    except Exception as e:
        print(f"[HWPX] XPath query failed ({address}): {e}")
        return None

def generate_hwpx_from_draft(document_id: str, tree_data: list, output_path: str):
    """
    물리적 인덱스 매핑을 사용하여 템플릿의 정확한 위치에 초안을 주입합니다.
    """
    upload_dir = "uploads"
    template_path = None
    
    if os.path.exists(upload_dir):
        candidates = [f for f in os.listdir(upload_dir) if f.startswith(document_id) and f.endswith(".hwpx") and not f.endswith("_draft.hwpx")]
        if candidates:
            template_path = os.path.join(upload_dir, candidates[0])

    if not template_path:
        print(f"[HWPX] Template not found for {document_id}")
        return False

    temp_dir = tempfile.mkdtemp()
    try:
        with zipfile.ZipFile(template_path, 'r') as zin:
            zin.extractall(temp_dir)
            
        section_mapping = {} 
        
        def collect_nodes(nodes):
            for node in nodes:
                addr = node.get('node_address')
                content = node.get('draft_content')
                if addr and content:
                    sec_file = addr.split('/')[1]
                    if sec_file not in section_mapping:
                        section_mapping[sec_file] = []
                    section_mapping[sec_file].append(node)
                if node.get('children'):
                    collect_nodes(node['children'])
        
        collect_nodes(tree_data)

        # 각 섹션 파일 수정
        for sec_file in section_mapping.keys():
            sec_path = os.path.join(temp_dir, 'Contents', sec_file)
            if not os.path.exists(sec_path): continue
                
            parser = etree.XMLParser(remove_blank_text=False)
            tree = etree.parse(sec_path, parser)
            root = tree.getroot()
            
            # 주입 작업 (문서 구조 변화를 방지하기 위해 각 위치에 독립적으로 주입)
            for node in section_mapping[sec_file]:
                target_node = get_node_by_address(root, node['node_address'])
                if target_node is None: continue
                
                content = node['draft_content']
                node_type = node.get('type', 'heading')
                
                if node_type == 'table' or etree.QName(target_node).localname == 'tbl':
                    tcs = target_node.xpath('.//hp:tc', namespaces=NS)
                    if tcs:
                        inject_text_to_tc(tcs[0], clean_markdown_formatting(content))
                else:
                    # 일반 문단: 제목 바로 뒤에 삽입
                    parent = target_node.getparent()
                    if parent is not None:
                        idx = list(parent).index(target_node)
                        lines = content.split('\n')
                        # 글자 겹침 방지 전략: 
                        # 1. 제목 노드를 복제하되 내부 구조를 완전히 비움(Clear)
                        # 2. 깨끗한 노드에 주입하여 스타일은 유지하고 데이터만 변경
                        for offset, line in enumerate(lines):
                            if not line.strip(): continue
                            new_p = copy.deepcopy(target_node)
                            
                            # ID 및 기존 텍스트 노드 제거 (중첩 방지 핵심)
                            if 'id' in new_p.attrib: del new_p.attrib['id']
                            for attr in list(new_p.attrib):
                                if attr.endswith('id'): del new_p.attrib[attr]
                            
                            # 내부 요소 청소 및 새 텍스트 필드 생성
                            for run in new_p.xpath('.//hp:run', namespaces=NS):
                                for t in run.xpath('.//hp:t', namespaces=NS):
                                    t.text = clean_markdown_formatting(line)
                                    # 첫 번째 텍스트 노드에만 내용을 넣고 나머지는 삭제
                                    line = "" 
                            
                            parent.insert(idx + 1 + offset, new_p)

            tree.write(sec_path, encoding='utf-8', xml_declaration=True)

        # HWPX 재압축
        with zipfile.ZipFile(output_path, 'w') as zf:
            mimetype_path = os.path.join(temp_dir, "mimetype")
            if os.path.exists(mimetype_path):
                zf.write(mimetype_path, "mimetype", compress_type=zipfile.ZIP_STORED)
            for root_dir, _, files in os.walk(temp_dir):
                for file in files:
                    fpath = os.path.join(root_dir, file)
                    arcname = os.path.relpath(fpath, temp_dir)
                    if arcname == "mimetype": continue
                    zf.write(fpath, arcname, compress_type=zipfile.ZIP_DEFLATED)
                        
        return True
    except Exception as e:
        import traceback
        traceback.print_exc()
        return False
    finally:
        shutil.rmtree(temp_dir)
