import os
import winreg
import pythoncom
import win32com.client

def _ensure_hwp_security_registry():
    """한컴오피스 자동화 보안 팝업 제거를 위한 레지스트리 설정을 확인하고 필요시 업데이트합니다."""
    key_path = r"Software\HNC\HwpAutomation\Modules"
    value_name = "FilePathCheckerModuleExample"
    dll_path = os.path.abspath("hwpx_security.dll")
    
    if not os.path.exists(dll_path):
        print(f"Warning: Security DLL not found at {dll_path}")
        return

    try:
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path)
        try:
            current_val, _ = winreg.QueryValueEx(key, value_name)
            if current_val == dll_path:
                winreg.CloseKey(key)
                return
        except FileNotFoundError:
            pass
            
        print(f"[PYHWPX] Registering HWP Security Module: {dll_path}")
        winreg.SetValueEx(key, value_name, 0, winreg.REG_SZ, dll_path)
        winreg.CloseKey(key)
    except Exception as e:
        print(f"[PYHWPX] Failed to update registry for HWP security: {e}")

def generate_hwpx_with_pyhwpx(document_id: str, tree_data: list, output_path: str) -> bool:
    """
    한글 OLE Automation을 직접 호출하여 템플릿(HWPX)에 데이터를 주입하여
    새로운 HWPX 파일을 생성합니다. (윈도우 환경 전용)
    """
    _ensure_hwp_security_registry()
    
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
    print("[PYHWPX] Calling CoInitialize...")
    pythoncom.CoInitialize()
    
    try:
        print("[PYHWPX] Dispatching HwpObject...")
        # win32com 객체 생성
        hwp = win32com.client.gencache.EnsureDispatch('HWPFrame.HwpObject')
        print("[PYHWPX] HwpObject dispatched.")
        
        # 보안 모듈 등록
        print("[PYHWPX] Registering security module...")
        res_reg = hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample")
        if not res_reg:
            print("[PYHWPX] Warning: HWP security module registration failed.")
        else:
            print("[PYHWPX] Security module registered successfully.")

        # 창 숨김 및 템플릿 열기
        try:
            print("[PYHWPX] Setting visibility to False...")
            hwp.XHwpWindows.Item(0).Visible = False
        except Exception as vis_ex:
            print(f"[PYHWPX] Warning: Could not hide window: {vis_ex}")
            
        print(f"[PYHWPX] Opening template: {template_path}")
        if not hwp.Open(template_path):
            print(f"[PYHWPX] 템플릿 열기 실패: {template_path}")
            return False
        print("[PYHWPX] Template opened successfully.")

        def normalize_search_keyword(text):
            import re
            clean = re.sub(r'^[0-9\-\.\(\)\[\]\s]+', '', text)
            clean = re.sub(r'[^a-zA-Z0-9가-힣]', '', clean)
            return clean

        def inject_content(nodes):
            import markdown
            for node in nodes:
                try:
                    title = node.get("title", "").strip()
                    content = node.get("draft_content", "").strip()
                    
                    if title and content:
                        keyword = normalize_search_keyword(title)
                        print(f"[PYHWPX] 키워드 '{keyword}' 매칭 시도 중... (원본: '{title}')")
                        
                        # 0. 검색 전 항상 문서 처음으로 이동하여 순서 보장 (AllDoc 검색과 조합)
                        hwp.MovePos(2) 
                        
                        # 1. 문서 검색 (HSearch)
                        hset = hwp.CreateSet("HSearch")
                        hwp.HAction.GetDefault("RepeatSearch", hset)
                        hset.SetItem("FindString", keyword)
                        hset.SetItem("IgnoreReplaceMessage", 1)
                        hset.SetItem("MatchCase", 0)
                        hset.SetItem("MatchWholeWordOnly", 0)
                        hset.SetItem("IgnoreSpace", 1) # 공백 무시 검색
                        hset.SetItem("Direction", 2)   # 2: 문서 전체
                        
                        # 마크다운을 HTML로 변환 (표, 강조 등 보존)
                        html_content = markdown.markdown(content, extensions=['tables', 'fenced_code'])
                        
                        if hwp.HAction.Execute("RepeatSearch", hset):
                            print(f"[PYHWPX] 매칭 성공: '{keyword}'")
                            hwp.HAction.Run("MoveDown")
                            hwp.HAction.Run("MoveParaBegin")
                            hwp.HAction.Run("BreakPara")
                            
                            # 2. 본문 주입 (HTML 방식으로 표와 서식 유지)
                            hwp.SetTextFile(html_content, "HTML", "insert")
                        else:
                            print(f"[PYHWPX] '{title}' 매칭 실패. 문서 끝에 추가 (Fallback).")
                            hwp.MovePos(3) # 문서 끝
                            fallback_html = f"<h3>[{title}]</h3>{html_content}<br/>"
                            hwp.SetTextFile(fallback_html, "HTML", "insert")
                            
                except Exception as node_ex:
                    import traceback
                    print(f"[PYHWPX] 노드 주입 중 오류 ('{node.get('title', 'Unknown')}'): {node_ex}")
                    traceback.print_exc()

                if "children" in node and node["children"]:
                    inject_content(node["children"])

        inject_content(tree_data)

        # 결과 저장
        abs_output_path = os.path.abspath(output_path)
        hwp.SaveAs(abs_output_path, "HWP")
        print(f"[PYHWPX] HWPX 생성 성공: {abs_output_path}")
        return True

    except Exception as e:
        import traceback
        print(f"[PYHWPX] HWPX 생성 중 오류 발생: {str(e)}")
        print(traceback.format_exc())
        return False
        
    finally:
        if hwp:
            try:
                hwp.Quit()
            except:
                pass
        pythoncom.CoUninitialize()
