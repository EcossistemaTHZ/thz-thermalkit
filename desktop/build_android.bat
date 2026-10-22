@echo off
setlocal
set "JAVA_HOME=%USERPROFILE%\scoop\apps\temurin21-jdk\current"
set "PATH=%JAVA_HOME%\bin;%PATH%"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "NDK_HOME=%ANDROID_HOME%\ndk\29.0.13846066"

echo === Compilando APK via Tauri Android CLI ===
cd /d "%~dp0"
call pnpm tauri android build --debug --apk --target aarch64
if errorlevel 1 (
    echo [FALHA] Falha no pnpm tauri android build!
    exit /b 1
)

echo === Build concluido com sucesso! ===
dir /b /s "%~dp0src-tauri\gen\android\app\build\outputs\apk\*.apk"

endlocal
