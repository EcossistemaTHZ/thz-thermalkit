@echo off
REM ==============================================================================
REM thz.cmd — Wrapper oficial para Windows CMD delegando para thz.ps1
REM ==============================================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0thz.ps1" %*
