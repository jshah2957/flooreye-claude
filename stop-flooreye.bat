@echo off
echo Stopping FloorEye v2.0...
cd /d C:\Users\jshah\flooreye
docker compose -f docker-compose.prod.yml down
echo FloorEye stopped.
pause
