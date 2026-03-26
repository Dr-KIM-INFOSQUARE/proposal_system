import os
import sys

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

import time
import win32com.client

def convert_hwpx_to_pdf(input_path: str, output_path: str) -> bool:
    """한컴오피스 OLE Automation을 사용하여 HWPX 파일을 PDF로 변환합니다."""
    # OLE 초기화
    pythoncom.CoInitialize()
    
    hwp = None
    try:
        # 절대 경로
        input_abs = os.path.abspath(input_path)
        output_abs = os.path.abspath(output_path)
        
        # 한글 객체 실행 (보이지 않게 실행)
        hwp = win32com.client.gencache.EnsureDispatch('HWPFrame.HwpObject')
        hwp.XHwpWindows.Item(0).Visible = False
        
        # 파일 열기 (성공 시 1 반환)
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
