@echo off
REM Starts the local game server and opens the game. Needs Python 3 (python.org).
where python >nul 2>nul || (echo Install Python 3 from python.org, then run this again. & pause & goto :eof)
start "" http://localhost:8000/index.html
python "%~dp0server.py"
