@echo off
REM Coleta diaria do vpabx (roda localmente porque o PABX so e acessivel na rede da empresa).
REM Agende este arquivo no Agendador de Tarefas do Windows (1x/dia).
cd /d "C:\Users\Administrador\Downloads\praxio-gerencial"
echo ==== %date% %time% ==== >> vpabx-log.txt
call npx tsx scripts/collect-vpabx.ts >> vpabx-log.txt 2>&1
