; Kolbo Code NSIS Hooks
; Hide file extraction details during install

!macro NSIS_HOOK_PREINSTALL
  ; Hide the details log so users don't see "extracting opencode-cli.exe"
  SetDetailsPrint none
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Keep details hidden after install
  SetDetailsPrint none
!macroend
