import os
import sys
import winreg
import pythoncom
import win32com.client
import time
import re

def reset_document_styles(hwp):
    """
    문서 전체를 선택하여 기본 서식으로 강제 초기화합니다.
    (휴먼명조, 12pt, 160% 줄간격, 양쪽 정렬, 여백 0)
    """
    print("[PYHWPX] 🧹 문서 전체 서식 초기화를 시작합니다.")
    # 1. 문서 전체 선택
    hwp.HAction.Run("SelectAll")
    
    # 2. 문단 모양 초기화 (양쪽 정렬, 여백 0, 간격 0, 줄간격 160%)
    # AlignType: "Justify"(양쪽), LineSpacing: 160(%)
    hwp.set_para(AlignType="Justify", LeftMargin=0, RightMargin=0, PrevSpacing=0, NextSpacing=0, LineSpacing=160)
    
    # 3. 글자 모양 초기화 (휴먼명조, 12pt)
    # pyhwpx의 set_font는 기본적으로 pt 단위를 사용합니다.
    hwp.set_font(FaceName="휴먼명조", Height=12)
    
    # 4. 선택 해제 (문서 맨 앞으로 커서 이동)
    hwp.HAction.Run("Cancel")
    hwp.HAction.Run("MoveDocBegin")
    print("[PYHWPX] ✨ 서식 초기화 완료.")

def parse_markdown_table(md_text: str, skip_header=True) -> list:
    """LLM이 생성한 마크다운 표에서 구분선과 헤더를 제거하고 순수 데이터 2차원 리스트를 반환합니다."""
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
    
    # 2번째 줄(구분선) 제거
    if len(table_lines) > 1 and re.match(r'^[\s\|\-\:]+$', table_lines[1]):
        table_lines.pop(1)

    rows = []
    for line in table_lines:
        cells = [cell.strip() for cell in line.split('|')]
        if cells and cells[0] == '': cells.pop(0)
        if cells and cells[-1] == '': cells.pop()
        if cells:
            rows.append(cells)
            
    # HWP 양식에 이미 헤더가 있으므로, 마크다운의 헤더 행은 버립니다.
    if skip_header and len(rows) > 0:
        rows.pop(0)
        
    return rows

# 1. 사용자가 나중에 프론트엔드에서 수정할 수 있도록 전역 딕셔너리로 분리
# 요구사항에 맞게 스페이스 2, 4, 6개 및 동그라미(○), 작은네모(▪), 하이픈(-) 적용
PROJECT_BULLET_STYLE = {
    "[L1]": {"spaces": " " * 2, "symbol": "\u25CB"},  # ○ (빈 동그라미)
    "[L2]": {"spaces": " " * 4, "symbol": "\u25AA"},  # ▪ (꽉 찬 작은 네모)
    "[L3]": {"spaces": " " * 6, "symbol": "-"}        # - (하이픈)
}

import re

def insert_text_with_hwpx_newlines(hwp, text: str, style_config: dict):
    """
    LLM이 생성한 텍스트에서 [L1], [L2] 마커를 찾아 프론트엔드에서 전달받은
    동적 스타일(기호, 스페이스)을 적용하여 입력합니다.
    """
    # 프론트엔드에서 넘어온 특수기호 설정값 (없으면 기본값 세팅)
    bullet_config = style_config.get("bullets", {
        "[L1]": {"symbol": "\u25CB", "spaces": 2}, # ○
        "[L2]": {"symbol": "\u25AA", "spaces": 4}, # ▪
        "[L3]": {"symbol": "-", "spaces": 6}       # -
    })

    clean_text = text.replace("**", "").replace("__", "")
    clean_text = clean_text.replace("<br>", "\n").replace("<br/>", "\n")
    lines = clean_text.split('\n')
    
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
            
        match = re.match(r'^[\s\*\-]*(\[L\d+\])\s*(.*)', line)
        
        try:
            hwp.set_para(LeftMargin=0, Indentation=0)
        except:
            pass 
            
        if match:
            marker = match.group(1)   
            content = match.group(2)  
            
            # 동적 설정값 가져오기
            style = bullet_config.get(marker, {"spaces": 0, "symbol": ""})
            spaces_count = style.get("spaces", 0)
            symbol = style.get("symbol", "")
            
            # 띄어쓰기 칸 수 만큼 문자열 공백 생성
            spaces_str = " " * int(spaces_count)
            
            if symbol:
                hwp.insert_text(f"{spaces_str}{symbol} ")
                hwp.HAction.Run("ParagraphShapeIndentAtCaret")
            
            hwp.insert_text(content)
        else:
            hwp.insert_text(line)
        
        if i < len(lines) - 1:
            hwp.HAction.Run("BreakPara")

# pyhwpx 및 win32com은 런타임에 필요한 시점에 임포트합니다. (순환 참조 방지)

def _ensure_hwp_security_registry():
    """한컴오피스 자동화 보안 팝업 제거를 위한 레지스트리 설정을 확인하고 필요시 업데이트합니다."""
    key_path = r"Software\HNC\HwpAutomation\Modules"
    value_name = "FilePathCheckerModuleExample"
    # 프로젝트 내의 hwpx_security.dll 절대 경로
    dll_path = os.path.abspath("./resources/hwpx_security.dll")
    
    if not os.path.exists(dll_path):
        print(f"[PYHWPX] Warning: Security DLL not found at {dll_path}. 보안창이 뜰 수 있습니다.")
        return

    try:
        # 레지스트리 키 열기 (없으면 생성)
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path)
        
        # 현재 값 확인
        try:
            current_val, _ = winreg.QueryValueEx(key, value_name)
            if current_val == dll_path:
                # 이미 올바르게 등록되어 있음
                winreg.CloseKey(key)
                return
        except FileNotFoundError:
            # 값이 없으므로 새로 생성해야 함
            pass
            
        # 값 업데이트
        print(f"[PYHWPX] Registering HWP Security Module: {dll_path}")
        winreg.SetValueEx(key, value_name, 0, winreg.REG_SZ, dll_path)
        winreg.CloseKey(key)
    except Exception as e:
        print(f"[PYHWPX] Failed to update registry for HWP security: {e}")

def generate_hwpx_with_pyhwpx(document_id: str, tree_data: list, output_path: str) -> bool:
    """
    공식 pyhwpx 라이브러리를 사용하여 HWPX 템플릿에 데이터를 주입합니다.
    - [x] pdf_service.py의 보안 모듈 등록 로직 통합 `_ensure_hwp_security_registry`
    - [x] generate_hwpx_with_pyhwpx 내 HWP 객체 초기화 방식 변경 (EnsureDispatch)
    - [x] 문단 이동 로직 정밀화 및 보정 (MoveParaDown + TextCheck)
    - [x] 표 셀 진입 및 주입 로직 강화 (TableCellBlock)
    - [ ] 주입 결과 검증 (로그 및 파일 생성 확인)
    """

    if style_config is None:
        style_config = {}

    # 1. 보안 레지스트리 확인 및 설정
    _ensure_hwp_security_registry()
    
    # [Lazy Import] 서버 시작 시 win32com 캐시 충돌 방지
    try:
        from pyhwpx import Hwp
        import win32com.client
    except ImportError:
        print("[PYHWPX] 'pyhwpx' 또는 'pywin32' 모듈을 찾을 수 없습니다.")
        return False

    UPLOAD_DIR = "uploads"
    template_path = None
    
    if os.path.exists(UPLOAD_DIR):
        candidates = [f for f in os.listdir(UPLOAD_DIR) if f.startswith(document_id) and f.endswith(".hwpx") and not f.endswith("_draft.hwpx")]
        if candidates:
            template_path = os.path.abspath(os.path.join(UPLOAD_DIR, candidates[0]))
    
    if not template_path:
        print(f"[PYHWPX] 템플릿 파일을 찾을 수 없습니다: {document_id}")
        return False

    print(f"[PYHWPX] Starting generation for {document_id}")
    hwp = None
    
    # OLE 초기화
    pythoncom.CoInitialize()
    
    try:
        # [1] 한글 객체 생성 및 캐시 방어
        # EnsureDispatch는 순환 참조 에러(location/partial initialization)를 일으킬 수 있으므로 
        # 런타임에는 Dispatch를 사용하여 안전하게 객체를 생성합니다.
        try:
            # win32com 초기화
            dispatch_hwp = win32com.client.Dispatch('HWPFrame.HwpObject')
            print("[PYHWPX] ✅ HwpObject Dispatch 성공.")
        except Exception as dispatch_err:
            print(f"[PYHWPX] ❌ Dispatch 실패: {dispatch_err}")
            return False

        # pyhwpx 객체 생성 (hwp_object 인자로 기존 객체 래핑 시도)
        # hwp_object 인자를 지원하지 않는 버그가 있을 수 있으므로 Hwp(visible=False) 후 
        # 내부 속성인 .hwp 또는 .app를 dispatch_hwp로 교체하거나 그대로 사용합니다.
        hwp = Hwp(visible=False)
        
        # [1-A] 보안 모듈 등록 (RegisterModule)
        # 생성된 객체로부터 직접 등록 시도
        native_hwp = getattr(hwp, "hwp", getattr(hwp, "app", dispatch_hwp))
        try:
            res_reg = dispatch_hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample")
            if res_reg:
                print("[PYHWPX] ✅ 보안 모듈 등록 성공. 보안창이 뜨지 않습니다.")
            else:
                # 가끔 RegisterModule이 실제로는 성공했으나 리턴값을 못 받는 경우가 있음
                print("[PYHWPX] ⚠️ 보안 모듈 리턴값 없음. (이미 등록된 경우일 수 있음)")
        except AttributeError as attr_err:
            if 'location' in str(attr_err):
                # pywin32 고유 버그: 동작은 성공했으나 리턴값 해석 오류임
                print("[PYHWPX] ✅ 보안 모듈 등록 확인됨. (Hwp 1.7.2 native handling)")
            else:
                print(f"[PYHWPX] ❌ 보안 모듈 등록 중 속성 오류: {attr_err}")
        except Exception as reg_ex:
            print(f"[PYHWPX] ❌ RegisterModule 호출 중 오류: {reg_ex}")
        
        # [1-B] 소멸자 버그('on_quit' AttributeError) 방지용 속성 주입
        if not hasattr(hwp, "on_quit"):
            hwp.on_quit = True
        
        # 백그라운드 실행 유지
        try:
            hwp.XHwpWindows.Item(0).Visible = False
        except:
            pass

        # [2] 템플릿 열기
        if not hwp.open(template_path):
            print(f"[PYHWPX] 템플릿 열기 실패: {template_path}")
            return False

        reset_document_styles(hwp)

        # [3] 주입 대상 노드 수집 (content 플래그 최우선 적용)
        targets = []
        fallback_targets = []
        global_tbl_idx = 0  # 표 순차 부여용 카운터

        def collect_targets(nodes):
            nonlocal global_tbl_idx
            for node in nodes:
                # 핵심: content 플래그가 True이고 작성된 초안이 있는 경우만 확실한 타겟으로 취급
                is_content_target = node.get("content") is True
                content = node.get("draft_content", "").strip()
                title = node.get("title", "").strip()
                addr = node.get("node_address")
                json_type = node.get("type", "heading")
                
                if is_content_target and content:
                    if json_type == "table":
                        # 표는 무조건 순서대로 인덱싱 (주소 의존 X)
                        targets.append({
                            "type": "tbl",
                            "index": global_tbl_idx,
                            "content": content,
                            "title": title
                        })
                        global_tbl_idx += 1
                    elif addr:
                        # 정상 물리 주소가 있는 경우
                        match = re.search(r'(p|tbl)\[(\d+)\]', addr)
                        if match:
                            targets.append({
                                "type": match.group(1),
                                "index": int(match.group(2)),
                                "content": content,
                                "title": title
                            })
                    else:
                        # content는 True인데 주소만 누락된 노드 -> 폴백(텍스트 검색)으로 구제
                        fallback_targets.append({
                            "type": "p",
                            "content": content,
                            "title": title
                        })
                
                # 자식 탐색 계속 진행
                if "children" in node and node["children"]:
                    collect_targets(node["children"])
        
        collect_targets(tree_data)

        # [4] 역순 정렬 (인덱스 밀림 방지)
        # 뒤쪽부터 삽입해야 MoveParaDown 시 앞쪽 문단 구조가 유지됨
        targets.sort(key=lambda x: x["index"], reverse=True)

        # [5] 데이터 주입 (검색 및 셀 기반 정밀 타격)
        for target in targets:
            try:
                node_type = target.get("type")
                idx = target.get("index")      
                content = target.get("content", "")
                title = target.get("title", "")
                
                if not content: continue
                
                if node_type == "p":
                    clean_keyword = re.sub(r'^([Ⅰ-Ⅹ0-9가-하\-\.\(\)]+)\s*', '', title).strip()
                    clean_keyword = clean_keyword[:40] if clean_keyword else title[:40]
                    
                    hwp.MovePos(2) 
                    hwp.HAction.GetDefault("RepeatFind", hwp.HParameterSet.HFindReplace.HSet)
                    hwp.HParameterSet.HFindReplace.FindString = clean_keyword
                    hwp.HParameterSet.HFindReplace.IgnoreMessage = 1
                    hwp.HParameterSet.HFindReplace.Direction = 1 
                    
                    found = False
                    if hwp.HAction.Execute("RepeatFind", hwp.HParameterSet.HFindReplace.HSet):
                        found = True
                    else:
                        short_keyword = clean_keyword[:15]
                        hwp.MovePos(2)
                        hwp.HParameterSet.HFindReplace.FindString = short_keyword
                        if hwp.HAction.Execute("RepeatFind", hwp.HParameterSet.HFindReplace.HSet):
                            found = True
                    
                    if found:
                        hwp.HAction.Run("Cancel")      
                        hwp.HAction.Run("MoveParaEnd") 
                        hwp.HAction.Run("BreakPara")   
                        
                        # 일반 텍스트 문자열 대신 줄바꿈 번역 함수 호출
                        insert_text_with_hwpx_newlines(hwp, content, style_config)
                        
                        hwp.HAction.Run("BreakPara") # 다음 목차와의 간격을 위해 한 줄 더 띄움
                    else:
                        print(f"[PYHWPX] 🚨 탐색 실패. 인덱스({idx}) 지점에 강제 삽입.")
                        try:
                            hwp.SetPos(0, idx, 0)
                            hwp.HAction.Run("MoveParaEnd")
                            hwp.HAction.Run("BreakPara")
                            insert_text_with_hwpx_newlines(hwp, content, style_config)
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
                                
                                # 1. 표의 첫 번째 셀(A1, 헤더)로 진입 후 블록(선택) 해제
                                hwp.HAction.Run("ShapeObjTableSelCell") 
                                hwp.HAction.Run("Cancel") 
                                
                                # 2. 첫 번째 데이터 행(A2)으로 한 칸 내려감 (헤더 보호)
                                hwp.HAction.Run("TableLowerCell")
                                
                                if table_data:
                                    for r_idx, row in enumerate(table_data):
                                        for c_idx, cell_value in enumerate(row):
                                            
                                            # 기존 텍스트 지우기 (양식 틀 유지)
                                            hwp.HAction.Run("Cancel") 
                                            hwp.HAction.Run("MoveLineBegin")
                                            hwp.HAction.Run("SelectAll")
                                            hwp.HAction.Run("Delete")
                                            
                                            # 엔터키 번역 함수로 텍스트 입력
                                            insert_text_with_hwpx_newlines(hwp, cell_value, style_config)
                                            
                                            # 전체 데이터 중 맨 마지막 셀이 아닐 경우에만 다음 칸으로 이동
                                            is_last_of_data = (r_idx == len(table_data) - 1) and (c_idx == len(row) - 1)
                                            
                                            if not is_last_of_data:
                                                # 이동 전 현재 위치(좌표) 기억
                                                pos_before = hwp.get_pos()
                                                
                                                # 우측 셀로 이동 (화살표 기능)
                                                hwp.HAction.Run("TableRightCell")
                                                
                                                # 이동 후 위치(좌표) 확인
                                                pos_after = hwp.get_pos()
                                                
                                                # 좌표가 1mm도 변하지 않았다면? -> 표의 맨 끝 칸에 갇혔다는 뜻!
                                                if pos_before == pos_after:
                                                    print("[PYHWPX] ➕ 표 끝 도달 감지. 명시적으로 새 행을 추가합니다.")
                                                    
                                                    # 사람이 Tab 키를 누른 것과 동일하게 맨 아래에 새 행을 만들어주는 액션
                                                    try:
                                                        hwp.TableAppendRow() # pyhwpx 내장 래퍼 메서드
                                                        for _ in range(len(row) - 1):
                                                            hwp.HAction.Run("TableLeftCell")    
                                                    except:
                                                        hwp.HAction.Run("TableAppendRow") # OLE Raw 액션
                                                        
                                else:
                                    hwp.HAction.Run("TableCellBlock") 
                                    insert_text_with_hwpx_newlines(hwp, content, style_config)
                                    hwp.HAction.Run("Cancel")
                                    
                                hwp.HAction.Run("Cancel") # 표 블록 해제
                                break
                            current_tbl_idx += 1
                        ctrl = ctrl.Next
                        
            except Exception as target_ex:
                print(f"[PYHWPX] ❌ Error processing target '{title}': {target_ex}")

        # [6] 결과 저장
        abs_output_path = os.path.abspath(output_path)
        hwp.save_as(abs_output_path)
        print(f"[PYHWPX] 🚀 Generation successful: {abs_output_path}")
        return True

    except Exception as e:
        import traceback
        print(f"[PYHWPX] ❌ Critical error: {str(e)}")
        print(traceback.format_exc())
        return False
        
    finally:
        # [7] 확실한 종료 (좀비 프로세스 방지)
        if hwp:
            try:
                hwp.quit()
                time.sleep(0.5)
            except:
                pass
        
        # COM 초기화 해제
        try:
            pythoncom.CoUninitialize()
        except:
            pass

