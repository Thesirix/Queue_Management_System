@echo off
title Systeme de file d'attente

echo ===============================
echo  DEMARRAGE DU SERVEUR
echo ===============================
echo.

REM Aller dans le dossier du script
cd /d %~dp0

REM Lancer le serveur Node
node server.js

echo.
echo Le serveur est arrete.
echo.
pause
