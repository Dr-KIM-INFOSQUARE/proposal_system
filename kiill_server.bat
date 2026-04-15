@echo off
echo 백그라운드에서 돌고 있는 서버들을 종료합니다...
taskkill /F /IM node.exe /T
taskkill /F /IM uv.exe /T
taskkill /F /IM python.exe /T
echo 모두 종료되었습니다!
pause