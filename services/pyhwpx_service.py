import os
import sys
import winreg
import pythoncom
import win32com.client
import time
import re

def reset_document_styles(hwp, style_config=None):
    print("[PYHWPX] 🧹 본문 전체 서식 강제 초기화를 시작합니다.")
    
    if style_config is None: style_config = {}
    base_style = style_config.get("paragraph_base_style", {})
    
    font_name = base_style.get("font_family", "휴먼명조")
    line_spacing = base_style.get("line_spacing", 160)
    alignment = base_style.get("alignment", "Justify")
    
    hwp.HAction.Run("Cancel")
    hwp.HAction.Run("MoveDocBegin")
    hwp.HAction.Run("SelectAll")
    hwp.set_para(AlignType=alignment, LineSpacing=line_spacing, LeftMargin=0, RightMargin=0, PrevSpacing=0, NextSpacing=0,)
    hwp.set_font(FaceName=font_name)
    hwp.HAction.Run("Cancel")
    hwp.HAction.Run("MoveDocBegin")
    print("[PYHWPX] ✨ 본문 서식 초기화 완료.")

def parse_markdown_table(md_text: str, skip_header=True) -> list:
    md_text = md_text.replace("||", "|\n|")
    raw_lines = [line.strip() for line in md_text.split('\n') if line.strip()]
    
    merged_lines = []
    for line in raw_lines:
        if line.startswith('|'):
            merged_lines.append(line)
        else:
            if merged_lines:
                merged_lines[-1] = merged_lines[-1] + " " + line

    table_lines = [line for line in merged_lines if '|' in line]
    
    if len(table_lines) > 1 and re.match(r'^[\s\|\-\:]+$', table_lines[1]):
        table_lines.pop(1)

    rows = []
    for line in table_lines:
        cells = [cell.strip() for cell in line.split('|')]
        if cells and cells[0] == '': cells.pop(0)
        if cells and cells[-1] == '': cells.pop()
        if cells:
            rows.append(cells)
            
    if skip_header and len(rows) > 0:
        rows.pop(0)
        
    return rows

PROJECT_BULLET_STYLE = {
    "[L1]": {"spaces": " " * 2, "symbol": "\u25CB"},  
    "[L2]": {"spaces": " " * 4, "symbol": "\u25AA"},  
    "[L3]": {"spaces": " " * 6, "symbol": "-"}        
}

def insert_text_with_hwpx_newlines(hwp, text: str, style_config: dict, context: str = "paragraph"):
    if context == "table":
        base_style = style_config.get("table_base_style", {})
        bullet_config = style_config.get("table_bullets", {
            "일반": {"symbol": "", "spaces": 0, "font_size": 11},
            "[L1]": {"symbol": "274D", "spaces": 0, "font_size": 11}, 
            "[L2]": {"symbol": "2578", "spaces": 2, "font_size": 11}
        })
    else:
        base_style = style_config.get("paragraph_base_style", {})
        bullet_config = style_config.get("paragraph_bullets", {
            "[L1]": {"symbol": "274D", "spaces": 0, "font_size": 12}, 
            "[L2]": {"symbol": "25AA", "spaces": 2, "font_size": 12}, 
            "[L3]": {"symbol": "2578", "spaces": 4, "font_size": 12}       
        })
        
    font_name = base_style.get("font_family", "휴먼명조")
    font_size = base_style.get("font_size", 12) 
    line_spacing = base_style.get("line_spacing", 160)
    alignment = base_style.get("alignment", "Justify")

    clean_text = text.replace("**", "").replace("__", "")
    clean_text = clean_text.replace("<br>", "\n").replace("<br/>", "\n")
    lines = clean_text.split('\n')
    
    for i, line in enumerate(lines):
        line = line.strip()
        if not line: continue
            
        match = re.match(r'^[\s\*\-]*(\[L\d+\])\s*(.*)', line)
        
        if match:
            marker = match.group(1)   
            content = match.group(2)  
            
            style = bullet_config.get(marker, {"spaces": 0, "symbol": ""})
            spaces_count = int(style.get("spaces", 0))
            symbol = style.get("symbol", "")
            marker_font_size = style.get("font_size", font_size)
            
            try:
                hwp.set_para(LeftMargin=0, Indentation=0, AlignType=alignment, LineSpacing=line_spacing)
                hwp.set_font(FaceName=font_name, Height=marker_font_size, Bold=False)
            except: pass
            
            if marker == "[L1]":
                hwp.HAction.Run("BreakPara")
            
            spaces_str = " " * spaces_count
            
            circled_match = re.match(r'^([①-⑳㉑-㉟㊱-㊿])\s*(.*)', content)
            if circled_match:
                symbol = circled_match.group(1)
                content = circled_match.group(2)
            
            if symbol:
                hwp.insert_text(spaces_str)
                hwp.insert_text(symbol)
                if len(symbol) == 4:
                    hwp.HAction.Run("InputCodeChange")
                hwp.insert_text(f" {content}")
                
                hwp.HAction.Run("MoveParaBegin")
                move_steps = spaces_count + 2
                for _ in range(move_steps):
                    hwp.HAction.Run("MoveRight")
                hwp.HAction.Run("ParagraphShapeIndentAtCaret")
                hwp.HAction.Run("MoveParaEnd")
            else:
                hwp.insert_text(f"{spaces_str}{content}")
        else:
            normal_style = bullet_config.get("일반", {"spaces": 0, "font_size": font_size})
            normal_spaces = int(normal_style.get("spaces", 0))
            normal_font_size = normal_style.get("font_size", font_size)
            
            try:
                hwp.set_para(LeftMargin=0, Indentation=0, AlignType=alignment, LineSpacing=line_spacing)
                hwp.set_font(FaceName=font_name, Height=normal_font_size, Bold=False)
            except: pass
            
            spaces_str = " " * normal_spaces
            hwp.insert_text(f"{spaces_str}{line}")
        
        if i < len(lines) - 1:
            hwp.HAction.Run("BreakPara")

def _ensure_hwp_security_registry():
    key_path = r"Software\HNC\HwpAutomation\Modules"
    value_name = "FilePathCheckerModuleExample"
    dll_path = os.path.abspath("./resources/hwpx_security.dll")
    
    if not os.path.exists(dll_path):
        print(f"[PYHWPX] Warning: Security DLL not found at {dll_path}. 보안창이 뜰 수 있습니다.")
        return

    try:
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path)
        try:
            current_val, _ = winreg.QueryValueEx(key, value_name)
            if current_val == dll_path:
                winreg.CloseKey(key)
                return
        except FileNotFoundError: pass
            
        print(f"[PYHWPX] Registering HWP Security Module: {dll_path}")
        winreg.SetValueEx(key, value_name, 0, winreg.REG_SZ, dll_path)
        winreg.CloseKey(key)
    except Exception as e:
        print(f"[PYHWPX] Failed to update registry for HWP security: {e}")

# ==========================================
# 🧹 [정리 도구 모음] 팝업 완벽 제어 & 매크로 롤백
# ==========================================
def clean_marker_colors_macro(hwp):
    """1. 유채색 텍스트 전역 폭격"""
    target_colors = [
        255, 16711680, 65280, 16711935, 16776960, 33023, 39423, 8388736,
        16737792, 12611584, 9917743, 16711808
    ]
    pset = hwp.HParameterSet.HFindReplace

    for _ in range(2): 
        for color in target_colors:
            hwp.MoveDocBegin()
            hwp.HAction.GetDefault("AllReplace", pset.HSet)
            pset.Direction = 2 
            pset.FindString = "" 
            pset.ReplaceString = ""
            pset.ReplaceMode = 1
            pset.IgnoreMessage = 1
            pset.FindRegExp = 0 
            
            pset.HSet.SetItem("UseFindCharShape", 1)
            pset.FindCharShape.TextColor = color 
            pset.HSet.SetItem("FindType", 1) 
            
            hwp.HAction.Execute("AllReplace", pset.HSet)

    hwp.HAction.GetDefault("AllReplace", pset.HSet)
    pset.HSet.SetItem("UseFindCharShape", 0)
    pset.HSet.SetItem("FindType", 0)

def clean_inline_guides_scanner(hwp):
    """2. ※ 로 시작하는 꼬리 문장 지능적 삭제"""
    hwp.MoveDocBegin()
    prev_pos = None
    in_delete_mode = False
    master_loop = 0 
    last_attempt_pos = None
    delete_attempts = 0
    
    stop_pattern = re.compile(r"^([oㅇ\-•*·○●□■▪⁃]|\(예\)|\d+\.|\[.*?\]|\(.*?\)|[①-⑩]|구분|내용|최종목표|세부목표)")

    while True:
        master_loop += 1
        if master_loop > 5000: break

        cur_pos = hwp.GetPos()
        if cur_pos == prev_pos: break
        prev_pos = cur_pos

        hwp.HAction.Run("MoveParaBegin")
        hwp.HAction.Run("MoveSelParaEnd")
        text = hwp.GetTextFile("TEXT", "saveblock")
        hwp.HAction.Run("Cancel")

        if text is None: text = ""
        elif isinstance(text, tuple): text = text[1] if len(text) > 1 else ""

        clean_text = text.replace('\r', '').replace('\n', '').strip()

        if len(clean_text) == 0:
            in_delete_mode = False
            hwp.HAction.Run("MoveNextParaBegin")
            continue

        if clean_text.startswith("※"):
            in_delete_mode = True
            if cur_pos == last_attempt_pos: delete_attempts += 1
            else: last_attempt_pos = cur_pos; delete_attempts = 1
            if delete_attempts > 3: hwp.HAction.Run("MoveNextParaBegin"); continue
            
            hwp.HAction.Run("MoveParaBegin")
            hwp.HAction.Run("DeleteLine")
            prev_pos = None
            continue

        if in_delete_mode:
            if stop_pattern.match(clean_text):
                in_delete_mode = False
                hwp.HAction.Run("MoveNextParaBegin")
                continue
            else:
                if cur_pos == last_attempt_pos: delete_attempts += 1
                else: last_attempt_pos = cur_pos; delete_attempts = 1
                if delete_attempts > 3: hwp.HAction.Run("MoveNextParaBegin"); continue
                
                hwp.HAction.Run("MoveParaBegin")
                hwp.HAction.Run("DeleteLine")
                prev_pos = None
                continue

        hwp.HAction.Run("MoveNextParaBegin")
        last_attempt_pos = None
        delete_attempts = 0

def clean_guide_tables(hwp):
    """3. '작성 요령' 안내 표 전체 폭파"""
    keywords = ["작성 요령", "작성 가이드"]
    for keyword in keywords:
        hwp.MoveDocBegin()
        master_loop = 0 
        while True:
            master_loop += 1
            if master_loop > 100: break 

            hwp.HAction.GetDefault("RepeatFind", hwp.HParameterSet.HFindReplace.HSet)
            hwp.HParameterSet.HFindReplace.HSet.SetItem("UseFindCharShape", 0)
            hwp.HParameterSet.HFindReplace.FindString = keyword
            hwp.HParameterSet.HFindReplace.FindRegExp = 0
            hwp.HParameterSet.HFindReplace.IgnoreMessage = 1
            hwp.HParameterSet.HFindReplace.Direction = 0 
            
            if not hwp.HAction.Execute("RepeatFind", hwp.HParameterSet.HFindReplace.HSet): break
                
            hwp.HAction.Run("Cancel") 
            cur_list = hwp.GetPos()[0]
            
            if cur_list > 0:
                hwp.HAction.Run("CloseEx")
                hwp.HAction.Run("Delete")
            else:
                hwp.HAction.Run("MoveParaBegin")
                hwp.HAction.Run("DeleteLine")
            hwp.MoveDocBegin() 

def clean_bullets_and_spaces_walker(hwp):
    """4. 잔여 빈 기호 및 가짜 빈 줄 청소"""
    hwp.MoveDocBegin()
    prev_pos = None
    last_attempt_pos = None
    delete_attempts = 0 
    master_loop = 0
    
    while True:
        master_loop += 1
        if master_loop > 5000: break

        cur_pos = hwp.GetPos()
        if cur_pos == prev_pos: break
        prev_pos = cur_pos
        
        hwp.HAction.Run("MoveParaBegin")
        hwp.HAction.Run("MoveSelParaEnd")
        text = hwp.GetTextFile("TEXT", "saveblock")
        hwp.HAction.Run("Cancel") 
        
        if text is None: text = ""
        elif isinstance(text, tuple): text = text[1] if len(text) > 1 else ""
            
        raw_no_returns = text.replace('\r', '').replace('\n', '')
        clean_text = raw_no_returns.strip()
        
        is_bullet = (len(clean_text) == 1 and clean_text in ["o", "ㅇ", "-", "*", "·", "○", "●", "□", "■", "▪", "⁃", "※"])
        is_fake_empty = (len(clean_text) == 0 and len(raw_no_returns) > 0)
        
        if is_bullet or is_fake_empty:
            if cur_pos == last_attempt_pos: delete_attempts += 1
            else: last_attempt_pos = cur_pos; delete_attempts = 1
            if delete_attempts > 3: hwp.HAction.Run("MoveNextParaBegin"); continue
                
            hwp.HAction.Run("MoveParaBegin")
            hwp.HAction.Run("DeleteLine")
            prev_pos = None 
            continue
            
        hwp.HAction.Run("MoveNextParaBegin")
        last_attempt_pos = None
        delete_attempts = 0

def compress_newlines(hwp):
    """5. 다중 엔터 압축 (워커 스캐너 방식 - AllReplace 버그 완벽 회피)"""
    hwp.MoveDocBegin()
    prev_pos = None
    empty_line_count = 0
    master_loop = 0
    last_attempt_pos = None
    delete_attempts = 0
    
    while True:
        master_loop += 1
        if master_loop > 5000: break # 무한루프 절대 방어

        cur_pos = hwp.GetPos()
        if cur_pos == prev_pos: break
        prev_pos = cur_pos
        
        # 현재 줄 블록 지정 후 텍스트 가져오기
        hwp.HAction.Run("MoveParaBegin")
        hwp.HAction.Run("MoveSelParaEnd")
        text = hwp.GetTextFile("TEXT", "saveblock")
        hwp.HAction.Run("Cancel") 
        
        if text is None: text = ""
        elif isinstance(text, tuple): text = text[1] if len(text) > 1 else ""
            
        clean_text = text.replace('\r', '').replace('\n', '').strip()
        
        # 텍스트가 없는 순수 빈 줄일 경우
        if len(clean_text) == 0:
            empty_line_count += 1
            
            # 🚨 빈 줄이 2번 이상 연속되면 무조건 지워서 1줄의 여백만 남김
            if empty_line_count >= 2:
                if cur_pos == last_attempt_pos: delete_attempts += 1
                else: last_attempt_pos = cur_pos; delete_attempts = 1
                
                # 표 끄트머리 등 안 지워지는 특수 구역이면 쿨하게 스킵
                if delete_attempts > 3: 
                    hwp.HAction.Run("MoveNextParaBegin")
                    continue
                    
                hwp.HAction.Run("MoveParaBegin")
                hwp.HAction.Run("DeleteLine")
                prev_pos = None 
                
                # 방금 빈 줄을 지웠어도, 여전히 문단 간격용 빈 줄 1개가 남아있는 상태이므로 1로 유지
                empty_line_count = 1 
                continue
        else:
            empty_line_count = 0 # 글자가 등장하면 빈 줄 카운터 초기화
            
        hwp.HAction.Run("MoveNextParaBegin")
        last_attempt_pos = None
        delete_attempts = 0

def run_all_cleanups(hwp, on_progress=None):
    def _log(msg):
        if on_progress: on_progress(f"  ✔️ {msg}")
    
    # 🚨 마스터 실드 전개: 0x00020011
    try: hwp.SetMessageBoxMode(0x00020011) 
    except Exception: pass

    cleanup_tasks = [
        ("마커 색상 폭격", clean_marker_colors_macro),
        ("문맥 인식 가이드라인(※) 삭제", clean_inline_guides_scanner),
        ("작성 요령 안내 표/글상자 삭제", clean_guide_tables),
        ("빈 기호 및 가짜 빈줄 청소", clean_bullets_and_spaces_walker),
        ("다중 엔터 압축", compress_newlines)
    ]

    for task_name, task_func in cleanup_tasks:
        try:
            task_func(hwp)
            _log(f"{task_name} 완료")
        except Exception as e:
            _log(f"{task_name} 중 오류 발생: {e}")

def generate_hwpx_with_pyhwpx(document_id: str, tree_data: list, output_path: str, style_config: dict = None, mode: str = "draft", on_progress=None) -> bool:
    def _log(msg):
        print(f"[PYHWPX] {msg}")
        if on_progress:
            on_progress(msg)

    if style_config is None: style_config = {}
    _ensure_hwp_security_registry()
    
    try:
        from pyhwpx import Hwp
        import win32com.client
    except ImportError:
        _log("'pyhwpx' 또는 'pywin32' 모듈을 찾을 수 없습니다.")
        return False

    UPLOAD_DIR = "uploads"
    template_path = None
    
    if os.path.exists(UPLOAD_DIR):
        candidates = [
            f for f in os.listdir(UPLOAD_DIR) 
            if f.startswith(document_id) 
            and f.endswith(".hwpx") 
            and "_styled" not in f 
            and "_draft" not in f 
            and "_enhanced" not in f
        ]
        if candidates:
            # 원본 템플릿일 가능성이 가장 높은 파일(보통 이름이 명확함)을 선택
            template_path = os.path.abspath(os.path.join(UPLOAD_DIR, candidates[0]))
    
    if not template_path:
        _log(f"템플릿 파일을 찾을 수 없습니다: {document_id}")
        return False

    _log(f"Starting generation for {document_id} in {mode} mode")
    hwp = None
    pythoncom.CoInitialize()
    
    try:
        try:
            dispatch_hwp = win32com.client.DispatchEx('HWPFrame.HwpObject')
            _log("HwpObject Dispatch 성공.")
        except Exception as dispatch_err:
            _log(f"Dispatch 실패: {dispatch_err}")
            return False

        hwp = Hwp(visible=False)
        native_hwp = getattr(hwp, "hwp", getattr(hwp, "app", dispatch_hwp))
        
        try:
            res_reg = dispatch_hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample")
            if res_reg: print("[PYHWPX] ✅ 보안 모듈 등록 성공.")
            else: print("[PYHWPX] ⚠️ 보안 모듈 리턴값 없음.")
        except AttributeError as attr_err:
            if 'location' in str(attr_err): print("[PYHWPX] ✅ 보안 모듈 등록 확인됨.")
            else: print(f"[PYHWPX] ❌ 보안 모듈 등록 중 속성 오류: {attr_err}")
        except Exception as reg_ex:
            print(f"[PYHWPX] ❌ RegisterModule 호출 중 오류: {reg_ex}")
        
        if not hasattr(hwp, "on_quit"): hwp.on_quit = True
        
        try:
            # 🚨 객체 초기화 단계부터 팝업 방어막을 최대로 올립니다.
            hwp.SetMessageBoxMode(0x00020011)
            hwp.XHwpWindows.Item(0).Visible = False
        except: pass

        if not hwp.open(template_path):
            _log(f"템플릿 열기 실패: {template_path}")
            return False

        _log("서식 초기화 및 구조 분석 중...")
        reset_document_styles(hwp, style_config)

        targets = []
        fallback_targets = []
        global_tbl_idx = 0  
        seen_addrs = set()

        def collect_targets(nodes):
            nonlocal global_tbl_idx
            for node in nodes:
                addr = node.get("node_address")
                if addr:
                    if addr in seen_addrs: continue
                    seen_addrs.add(addr) 
                    
                is_content_target = node.get("content") is True
                
                # 모드에 따라 독립적인 필드만 추출 (절대 섞이지 않도록 보장)
                content = ""
                if mode == "enhanced":
                    content = node.get("extended_content") or ""
                else:
                    content = node.get("draft_content") or ""
                
                content = str(content).strip()
                title = node.get("title", "").strip()
                json_type = node.get("type", "heading")
                
                if is_content_target and content:
                    if json_type == "table":
                        targets.append({"type": "tbl", "index": global_tbl_idx, "content": content, "title": title})
                        global_tbl_idx += 1
                    elif addr:
                        match = re.search(r'(p|tbl)\[(\d+)\]', addr)
                        if match:
                            targets.append({"type": match.group(1), "index": int(match.group(2)), "content": content, "title": title})
                    else:
                        fallback_targets.append({"type": "p", "content": content, "title": title})
                
                if "children" in node and node["children"]:
                    collect_targets(node["children"])
        
        collect_targets(tree_data)
        targets.sort(key=lambda x: x["index"], reverse=True)

        _log(f"데이터 주입 대상 선정 완료: 총 {len(targets)}개의 섹션/표")

        # 3. 데이터 주입 루프
        for i, target in enumerate(targets):
            node_type = target.get("type")
            idx = target.get("index")      
            content = target.get("content", "")
            title = target.get("title", "")
            
            progress_msg = f"[{i+1}/{len(targets)}] '{title}' 내용 주입 중..."
            _log(progress_msg)
            
            try:
                if not content: continue
                
                if node_type == "p":
                    clean_keyword = re.sub(r'^([Ⅰ-Ⅹ0-9가-하\-\.\(\)]+)\s*', '', title).strip()
                    clean_keyword = clean_keyword[:40] if clean_keyword else title[:40]
                    
                    # 1순위: 마커 형태 검색 {{제목}} - 있으면 대체
                    marker = f"{{{{{title}}}}}"
                    hwp.MovePos(2) 
                    hwp.HAction.GetDefault("RepeatFind", hwp.HParameterSet.HFindReplace.HSet)
                    hwp.HParameterSet.HFindReplace.FindString = marker
                    hwp.HParameterSet.HFindReplace.IgnoreMessage = 1
                    hwp.HParameterSet.HFindReplace.Direction = 1 
                    
                    if hwp.HAction.Execute("RepeatFind", hwp.HParameterSet.HFindReplace.HSet):
                        hwp.HAction.Run("Delete")
                        insert_text_with_hwpx_newlines(hwp, content, style_config, context="paragraph")
                    else:
                        # 2순위: 제목 검색
                        hwp.MovePos(2)
                        hwp.HParameterSet.HFindReplace.FindString = clean_keyword
                        if hwp.HAction.Execute("RepeatFind", hwp.HParameterSet.HFindReplace.HSet):
                            hwp.HAction.Run("Cancel")
                            hwp.HAction.Run("MoveParaEnd")
                            hwp.HAction.Run("BreakPara")
                            # 새 줄을 만든 후 주입 (기존 내용과의 혼입 방지를 위해 Open 시점의 템플릿 신뢰)
                            insert_text_with_hwpx_newlines(hwp, content, style_config, context="paragraph")
                        else:
                            # 3순위: 강제 주입
                            try:
                                hwp.SetPos(0, idx, 0)
                                hwp.HAction.Run("MoveParaEnd")
                                hwp.HAction.Run("BreakPara")
                                insert_text_with_hwpx_newlines(hwp, content, style_config, context="paragraph")
                            except: pass
                    
                elif node_type == "tbl":
                    print(f"[PYHWPX] 📊 표 주입 시도: {idx}번째 표 (제목: {title})")
                    table_data = parse_markdown_table(content, skip_header=True)
                    ctrl = hwp.HeadCtrl
                    current_tbl_idx = 0
                    
                    while ctrl:
                        if ctrl.CtrlID == "tbl":
                            if current_tbl_idx == idx:
                                hwp.SetPosBySet(ctrl.GetAnchorPos(0))
                                hwp.FindCtrl()
                                hwp.HAction.Run("ShapeObjTableSelCell") 
                                hwp.HAction.Run("Cancel") 
                                hwp.HAction.Run("TableLowerCell")
                                
                                if table_data:
                                    for r_idx, row in enumerate(table_data):
                                        for c_idx, cell_value in enumerate(row):
                                            hwp.HAction.Run("Cancel") 
                                            # hwp.HAction.Run("MoveLineBegin")
                                            hwp.HAction.Run("TableCellBlock")
                                            hwp.HAction.Run("Cancel")
                                            hwp.HAction.Run("MoveSelDocEnd")  
                                            hwp.HAction.Run("Delete")
                                            hwp.HAction.Run("Cancel")

                                            insert_text_with_hwpx_newlines(hwp, cell_value, style_config, context="table")
                                            
                                            is_last_of_data = (r_idx == len(table_data) - 1) and (c_idx == len(row) - 1)

                                            if not is_last_of_data:
                                                pos_before = hwp.get_pos()
                                                hwp.HAction.Run("TableRightCell")
                                                pos_after = hwp.get_pos()
                                                if pos_before == pos_after:
                                                    _log("➕ 새 행을 추가합니다.")
                                                    try:
                                                        hwp.TableAppendRow() 
                                                        for _ in range(len(row) - 1): hwp.HAction.Run("TableLeftCell")    
                                                    except:
                                                        hwp.HAction.Run("TableAppendRow") 
                                else:
                                    hwp.HAction.Run("TableCellBlock") 
                                    insert_text_with_hwpx_newlines(hwp, content, style_config, context="table")
                                    hwp.HAction.Run("Cancel")
                                    
                                hwp.HAction.Run("Cancel") 
                                break
                            current_tbl_idx += 1
                        ctrl = ctrl.Next
                        
            except Exception as target_ex:
                print(f"[PYHWPX] ❌ Error processing target '{title}': {target_ex}")

        _log("📄 쪽 번호를 삽입합니다 (BottomCenter).")
        try:
            hwp.page_num_pos(position='BottomCenter', side_char=True)
        except Exception as e:
            _log(f"⚠️ 쪽 번호 삽입 중 오류 (무시됨): {e}")

        # 클린업 로직 실행
        _log("🧹 최종 서식 및 가이드라인 클린업을 시작합니다...")
        run_all_cleanups(hwp, on_progress)

        abs_output_path = os.path.abspath(output_path)
        hwp.save_as(abs_output_path)
        _log(f"🚀 Generation successful: {os.path.basename(abs_output_path)}")
        _log("🎉 HWPX 생성이 완료되었습니다.")
        return True

    except Exception as e:
        import traceback
        print(f"[PYHWPX] ❌ Critical error: {str(e)}")
        print(traceback.format_exc())
        return False
        
    finally:
        if hwp:
            try: hwp.SetMessageBoxMode(0x00000000) 
            except: pass

        print("[PYHWPX] 🧹 HWP 프로세스 및 메모 정리를 시작합니다.")
        if hwp:
            try:
                try: hwp.Clear(1)
                except Exception:
                    try: hwp.clear(1)
                    except: pass
                
                try: hwp.Quit()
                except Exception:
                    try: hwp.quit()
                    except: pass
                time.sleep(0.5) 
            except Exception as quit_err:
                print(f"[PYHWPX] ⚠️ HWP Quit 중 오류 (무시됨): {quit_err}")
                
        try:
            if 'hwp' in locals(): del hwp
            if 'dispatch_hwp' in locals(): del dispatch_hwp
            if 'native_hwp' in locals(): del native_hwp
        except Exception as del_err: pass

        import gc
        gc.collect()

        try:
            pythoncom.CoUninitialize()
            print("[PYHWPX] ✨ COM 스레드 반환 완료. 프로세스가 깨끗하게 종료되었습니다.")
        except Exception as com_err: pass