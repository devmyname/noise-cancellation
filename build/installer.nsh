; Denoise AI - Custom NSIS Installer Script
; Adds optional VB-Audio Virtual Cable installation after main app install.
; The full driver pack ZIP is bundled because VBCABLE_Setup_x64.exe needs
; its sibling .sys / .cat / .inf / .dll files to function.
; Message language is auto-detected from the system locale (Turkish / English).

!macro customInstall
  ; Extract the full driver pack ZIP into the temp directory
  File /oname=$PLUGINSDIR\VBCABLE_Driver_Pack.zip "${BUILD_RESOURCES_DIR}\VBCABLE_Driver_Pack.zip"

  ; Detect system language — Turkish (1055) vs everything else (English)
  System::Call 'kernel32::GetUserDefaultUILanguage() i .r1'
  StrCpy $2 "$1" 2 ; low word = primary lang id
  ${If} $1 == 1055 ; 0x041F = Turkish
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "VB-Audio Virtual Cable kurulsun mu?$\r$\n$\r$\n\
Bu sürücü, Discord / Zoom gibi uygulamalarda$\r$\n\
sanal mikrofon olarak kullanılır." \
      IDYES installVBCable IDNO skipVBCable
  ${Else}
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Install VB-Audio Virtual Cable?$\r$\n$\r$\n\
This driver is required to use the virtual$\r$\n\
microphone in Discord, Zoom and other apps." \
      IDYES installVBCable IDNO skipVBCable
  ${EndIf}

  installVBCable:
    DetailPrint "Extracting VB-Audio Virtual Cable driver pack..."
    ; Use PowerShell to unzip (available on all modern Windows)
    nsExec::ExecToLog 'powershell -NoProfile -Command "Expand-Archive -Path \"$PLUGINSDIR\VBCABLE_Driver_Pack.zip\" -DestinationPath \"$PLUGINSDIR\VBCABLE\" -Force"'
    DetailPrint "Running VB-Cable installer..."
    ExecWait '"$PLUGINSDIR\VBCABLE\VBCABLE_Setup_x64.exe"' $0
    DetailPrint "VB-Cable installer exited with code: $0"
    Goto doneVBCable

  skipVBCable:
    DetailPrint "VB-Audio Virtual Cable installation skipped."

  doneVBCable:
!macroend
