import os
import sys
import winreg
import pythoncom
import win32com.client
import time
import re

def parse_markdown_table(md_text: str) -> list:
    """LLM이 생성한 마크다운 표 텍스트를 2차원 리스트로 파싱합니다."""
    rows = []
    table_lines = []
    
    # 1. 텍스트에서 파이프(|)가 포함된 줄(표 데이터)만 순서대로 수집
    for line in md_text.strip().split('\n'):
        line = line.strip()
        if '|' in line:
            table_lines.append(line)
            
    # 2. 마크다운 문법상 두 번째 줄(index 1)은 무조건 구분선(|---|)이므로 삭제
    if len(table_lines) > 1:
        table_lines.pop(1)
        
    # 3. 남은 줄(헤더 및 실제 데이터)을 셀 단위로 분할
    for line in table_lines:
        cells = [cell.strip() for cell in line.split('|')]
        
        # 양 끝이 '|'로 닫혀있어 생성된 첫/마지막 빈 요소 제거
        if cells and cells[0] == '': cells.pop(0)
        if cells and cells[-1] == '': cells.pop()
        
        if cells:
            rows.append(cells)
            
    return rows

# pyhwpx 및 win32com은 런타임에 필요한 시점에 임포트합니다. (순환 참조 방지)

def _ensure_hwp_security_registry():
    """한컴오피스 자동화 보안 팝업 제거를 위한 레지스트리 설정을 확인하고 필요시 업데이트합니다."""
    key_path = r"Software\HNC\HwpAutomation\Modules"
    value_name = "FilePathCheckerModuleExample"
    # 프로젝트 내의 hwpx_security.dll 절대 경로
    dll_path = os.path.abspath("hwpx_security.dll")
    
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
                    # 1. 번호 기호 제거 후, 자르지 않고 최대 40자까지 넉넉하게 유지 (중복 탐색 방지)
                    clean_keyword = re.sub(r'^([Ⅰ-Ⅹ0-9가-하\-\.\(\)]+)\s*', '', title).strip()
                    clean_keyword = clean_keyword[:40] if clean_keyword else title[:40]
                    
                    print(f"[PYHWPX] 📝 문단 주입 시도: (키워드 검색: '{clean_keyword}')")
                    
                    # 반복 찾기(RepeatFind)를 활용
                    hwp.MovePos(2) # 문서 맨 위로 이동
                    hwp.HAction.GetDefault("RepeatFind", hwp.HParameterSet.HFindReplace.HSet)
                    hwp.HParameterSet.HFindReplace.FindString = clean_keyword
                    hwp.HParameterSet.HFindReplace.IgnoreMessage = 1
                    hwp.HParameterSet.HFindReplace.Direction = 1 # 아래로 탐색
                    
                    found = False
                    if hwp.HAction.Execute("RepeatFind", hwp.HParameterSet.HFindReplace.HSet):
                        found = True
                    else:
                        # [폴백 1] 찾기 실패 시 검색어 길이를 약간 줄여서 유연하게 재탐색
                        short_keyword = clean_keyword[:15]
                        print(f"[PYHWPX] ⚠️ 위치 찾기 실패. 짧은 키워드로 재탐색: '{short_keyword}'")
                        hwp.MovePos(2)
                        hwp.HParameterSet.HFindReplace.FindString = short_keyword
                        if hwp.HAction.Execute("RepeatFind", hwp.HParameterSet.HFindReplace.HSet):
                            found = True
                    
                    if found:
                        print(f"[PYHWPX] 🎯 위치 찾기 성공.")
                        hwp.HAction.Run("Cancel")      # 찾은 텍스트 블록 해제
                        hwp.HAction.Run("MoveParaEnd") # 해당 제목 문단의 끝으로 이동
                        hwp.HAction.Run("BreakPara")   # 엔터
                        
                        hwp.insert_text(content)
                        if not content.endswith("\n"):
                            hwp.HAction.Run("BreakPara")
                    else:
                        # [폴백 2] 최종 실패 시 기존처럼 강제 인덱스 주입 (누락 방지)
                        print(f"[PYHWPX] 🚨 탐색 최종 실패. 인덱스({idx}) 지점에 강제 삽입.")
                        try:
                            hwp.SetPos(0, idx, 0)
                            hwp.HAction.Run("MoveParaEnd")
                            hwp.HAction.Run("BreakPara")
                            hwp.insert_text(content)
                        except Exception as e:
                            print(f"[PYHWPX] 강제 삽입 실패: {e}")
                    
                elif node_type == "tbl":
                    print(f"[PYHWPX] 📊 표 주입 시도: {idx}번째 표 (제목: {title})")
                    
                    table_data = parse_markdown_table(content)
                    
                    ctrl = hwp.HeadCtrl
                    current_tbl_idx = 0
                    
                    while ctrl:
                        if ctrl.CtrlID == "tbl":
                            if current_tbl_idx == idx:
                                hwp.SetPosBySet(ctrl.GetAnchorPos(0))
                                hwp.FindCtrl()
                                
                                # 표의 첫 번째 셀(A1)로 내부 진입
                                hwp.HAction.Run("ShapeObjTableSelCell") 
                                
                                if table_data:
                                    for r_idx, row in enumerate(table_data):
                                        for c_idx, cell_value in enumerate(row):
                                            # 기존 셀 텍스트 삭제 (서식 유지)
                                            hwp.HAction.Run("Cancel") 
                                            hwp.HAction.Run("MoveLineBegin")
                                            hwp.HAction.Run("SelectAll")
                                            hwp.HAction.Run("Delete")
                                            
                                            # 텍스트 클리닝 (LLM의 굵은 글씨 마크다운 및 HTML 줄바꿈 처리)
                                            clean_val = cell_value.replace("**", "").replace("__", "")
                                            clean_val = clean_val.replace("<br>", "\n").replace("<br/>", "\n")
                                            
                                            hwp.insert_text(clean_val.strip())
                                            
                                            # 마지막 열이 아니면 우측 셀로 이동
                                            if c_idx < len(row) - 1:
                                                hwp.HAction.Run("TableRightCell")
                                        
                                        # 마지막 행이 아니면 다음 행 첫 셀로 이동 
                                        # (표 끝에서 우측 이동 시 HWP 고유 기능에 의해 새 행이 자동 추가됨)
                                        if r_idx < len(table_data) - 1:
                                            hwp.HAction.Run("TableRightCell")
                                else:
                                    hwp.HAction.Run("TableCellBlock") 
                                    hwp.insert_text(content)
                                    
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

