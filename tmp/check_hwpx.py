import zipfile
import os
from lxml import etree

NS = {
    'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph',
}

def check_hwpx_content(filepath):
    temp_dir = "check_hwpx"
    os.makedirs(temp_dir, exist_ok=True)
    try:
        with zipfile.ZipFile(filepath, 'r') as zin:
            zin.extractall(temp_dir)
            
        section0_path = os.path.join(temp_dir, 'Contents', 'section0.xml')
        tree = etree.parse(section0_path)
        all_ps = tree.xpath('.//hp:p', namespaces=NS)
        for p in all_ps:
            p_text = "".join(p.itertext()).strip()
            if p_text:
                print(f"Paragraph: [{p_text}]")
    finally:
        import shutil
        shutil.rmtree(temp_dir)

check_hwpx_content("uploads/328deaec-15fd-4b67-a11d-88fc998d9296_테스트 양식.hwpx")
