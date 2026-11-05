@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 가 설치되어 있지 않습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요.
  pause
  exit /b 1
)
start "" /min cmd /c "timeout /t 2 >nul & start http://127.0.0.1:4173"
node server.js
pause
