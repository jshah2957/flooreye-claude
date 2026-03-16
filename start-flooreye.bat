@echo off
echo Starting FloorEye v2.0...
cd /d C:\Users\jshah\flooreye
docker compose -f docker-compose.prod.yml up -d
timeout /t 15 /nobreak >nul
curl -s https://app.puddlewatch.com/api/v1/health
echo.
echo FloorEye is running at https://app.puddlewatch.com
echo Login: admin@puddlewatch.com
pause
