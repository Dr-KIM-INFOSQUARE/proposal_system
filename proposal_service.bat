@echo off
:: 백엔드 실행 (최소화된 창으로 실행)
cd /d D:\Desktop\proposal_system_server
start /min "Backend Server" uv run uvicorn main:app --host 0.0.0.0 --port 8000

:: 프론트엔드 실행 (최소화된 창으로 실행)
cd /d D:\Desktop\proposal_system_server\frontend
start /min "Frontend Server" npm run dev