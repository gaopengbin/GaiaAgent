!macro NSIS_HOOK_PREINSTALL
  !insertmacro CheckIfAppIsRunning "gaia-agent.exe" "GaiaAgent"
  DetailPrint "Stopping stale GaiaAgent runtime processes..."
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -eq $\"$INSTDIR\runtime\bin\node.exe$\" } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"'
  Pop $0
  Sleep 750
!macroend
