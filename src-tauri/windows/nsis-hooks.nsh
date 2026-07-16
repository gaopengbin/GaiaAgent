!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Stopping GaiaAgent and its managed runtime processes..."
  nsExec::ExecToLog 'taskkill.exe /F /T /IM gaia-agent.exe'
  Pop $0
  Sleep 500
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$managed = Get-Process node -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like $\"$INSTDIR\runtime*\bin\node.exe$\" }; $$managed | Stop-Process -Force -ErrorAction SilentlyContinue; $$managed | Wait-Process -Timeout 5 -ErrorAction SilentlyContinue"'
  Pop $0
  Sleep 1000
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Stopping GaiaAgent and its managed runtime processes..."
  nsExec::ExecToLog 'taskkill.exe /F /T /IM gaia-agent.exe'
  Pop $0
  Sleep 500
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$managed = Get-Process node -ErrorAction SilentlyContinue | Where-Object { $$_.Path -like $\"$INSTDIR\runtime*\bin\node.exe$\" }; $$managed | Stop-Process -Force -ErrorAction SilentlyContinue; $$managed | Wait-Process -Timeout 5 -ErrorAction SilentlyContinue"'
  Pop $0
  Sleep 1000
!macroend
