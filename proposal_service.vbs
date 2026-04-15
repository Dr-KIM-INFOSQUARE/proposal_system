Set WshShell = CreateObject("WScript.Shell")

' 백엔드 숨겨서 실행
WshShell.Run "cmd /c cd /d D:\Desktop\proposal_system_server && uv run uvicorn main:app --host 0.0.0.0 --port 8000", 0, False

' 프론트엔드 숨겨서 실행
WshShell.Run "cmd /c cd /d D:\Desktop\proposal_system_server\frontend && npm run dev", 0, False