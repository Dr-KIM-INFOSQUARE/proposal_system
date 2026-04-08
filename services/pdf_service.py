import os
import sys
import winreg
import time

# Windows에서 pywin32(pywintypes) 모듈을 찾지 못하는 문제를 해결하기 위한 DLL 경로 수정 로직
try:
    import pythoncom
except ImportError:
    # 1. 현재 가상환경의 site-packages 경로를 찾음
    for path in sys.path:
        if 'site-packages' in path:
            dll_path = os.path.join(path, "pywin32_system32")
            if os.path.exists(dll_path):
                # Python 3.8+ 환경에서 DLL 로드 경로 추가
                if hasattr(os, 'add_dll_directory'):
                    os.add_dll_directory(dll_path)
                # 환경변수 PATH에도 추가 (하위 호환성)
                os.environ["PATH"] = dll_path + os.pathsep + os.environ["PATH"]
                break
    import pythoncom # 재시도

import win32com.client

def _ensure_hwp_security_registry():
    """한컴오피스 자동화 보안 팝업 제거를 위한 레지스트리 설정을 확인하고 필요시 업데이트합니다."""
    key_path = r"Software\HNC\HwpAutomation\Modules"
    value_name = "FilePathCheckerModuleExample"
    # 프로젝트 내의 hwpx_security.dll 절대 경로
    dll_path = os.path.abspath("./resources/hwpx_security.dll")
    
    if not os.path.exists(dll_path):
        print(f"Warning: Security DLL not found at {dll_path}")
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
        print(f"Registering HWP Security Module: {dll_path}")
        winreg.SetValueEx(key, value_name, 0, winreg.REG_SZ, dll_path)
        winreg.CloseKey(key)
    except Exception as e:
        print(f"Failed to update registry for HWP security: {e}")

def convert_hwpx_to_pdf(input_path: str, output_path: str) -> bool:
    """한컴오피스 OLE Automation을 사용하여 HWPX 파일을 PDF로 변환합니다. (보안 팝업 제거 모듈 적용)"""
    # 1. 레지스트리 보안 모듈 등록 확인
    _ensure_hwp_security_registry()

    # OLE 초기화
    pythoncom.CoInitialize()
    
    hwp = None
    try:
        # 절대 경로
        input_abs = os.path.abspath(input_path)
        output_abs = os.path.abspath(output_path)
        
        # 한글 객체 실행 (보이지 않게 실행)
        hwp = win32com.client.gencache.EnsureDispatch('HWPFrame.HwpObject')
        
        # 2. 보안 모듈 등록 (RegisterModule 호출) -> 이제 보안 팝업이 뜨지 않음
        # 첫 번째 인자 'FilePathCheckDLL'은 고정, 두 번째 인자는 레지스트리에 등록된 밸류 이름입니다.
        res_reg = hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample")
        if not res_reg:
            print("Warning: HWP security module registration failed. Popups may appear.")

        hwp.XHwpWindows.Item(0).Visible = False
        
        # 파일 열기
        if not hwp.Open(input_abs):
            print(f"Failed to open HWPX: {input_abs}")
            return False
            
        # PDF로 저장
        res = hwp.SaveAs(output_abs, "PDF")
        
        if res:
            print(f"Successfully converted to PDF: {output_abs}")
            return True
        else:
            print(f"Failed to SaveAs PDF: {output_abs}")
            return False
            
    except Exception as e:
        print(f"Error during HWPX to PDF conversion: {e}")
        return False
    finally:
        if hwp:
            try:
                hwp.Quit()
            except:
                pass
        pythoncom.CoUninitialize()
