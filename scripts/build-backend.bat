@echo off
cd /d "%~dp0..\cola\backend"
set UV=C:\Users\Administrator\.local\bin\uv.exe

echo Installing PyInstaller in venv...
"%UV%" pip install pyinstaller -q

echo Building backend with PyInstaller...
"%UV%" run pyinstaller --onefile --clean --name 68backend ^
  --add-data "app;app" ^
  --hidden-import uvicorn ^
  --hidden-import uvicorn.server ^
  --hidden-import uvicorn.logging ^
  --hidden-import uvicorn.loops.auto ^
  --hidden-import uvicorn.loops.asyncio ^
  --hidden-import uvicorn.protocols.http.auto ^
  --hidden-import uvicorn.protocols.http.h11_impl ^
  --hidden-import uvicorn.protocols.websockets.auto ^
  --hidden-import uvicorn.middleware.debug ^
  --hidden-import uvicorn.middleware.proxy_headers ^
  --hidden-import fastapi ^
  --hidden-import fastapi.routing ^
  --hidden-import starlette ^
  --hidden-import starlette.applications ^
  --hidden-import starlette.routing ^
  --hidden-import starlette.middleware ^
  --hidden-import starlette.middleware.cors ^
  --hidden-import starlette.staticfiles ^
  --hidden-import starlette.responses ^
  --hidden-import httpx ^
  --hidden-import hpack ^
  --hidden-import httpx._transports.default ^
  --hidden-import httpcore ^
  --hidden-import httpcore._async ^
  --hidden-import httpcore._sync ^
  --hidden-import pydantic ^
  --hidden-import pydantic._internal ^
  --hidden-import pydantic.deprecated.decorator ^
  --hidden-import pydantic.v1 ^
  --hidden-import anyio ^
  --hidden-import anyio.streams ^
  --hidden-import sniffio ^
  --hidden-import certifi ^
  --hidden-import multidict ^
  --hidden-import h11 ^
  --hidden-import wsproto ^
  run.py

if %errorlevel% neq 0 (
  echo Backend build failed!
  exit /b %errorlevel%
)

echo Backend build success!

if not exist "..\..\dist-electron\backend" mkdir "..\..\dist-electron\backend"
copy /y dist\68backend.exe "..\..\dist-electron\backend\68backend.exe" > nul
echo Copied to dist-electron/backend/68backend.exe
echo.
echo To test, run: dist-electron\backend\68backend.exe
