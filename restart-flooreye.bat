@echo off
echo Restarting FloorEye v2.0...
cd /d C:\Users\jshah\flooreye
docker compose -f docker-compose.prod.yml restart
timeout /t 10 /nobreak >nul
curl -s https://app.puddlewatch.com/api/v1/health
echo.
echo FloorEye restarted.
pause
