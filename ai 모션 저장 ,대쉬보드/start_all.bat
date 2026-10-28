@echo off
cd /d "%~dp0"
start "receiver" cmd /k python receiver.py
python -m streamlit run dashboard_app.py
pause
