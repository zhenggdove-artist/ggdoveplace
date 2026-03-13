@echo off
set "SRC=%~dp0"
set "DST=D:\ELY\zuopin\NEW_WEB"

if not exist "%DST%" mkdir "%DST%"

xcopy /E /I /Y "%SRC%css"        "%DST%\css\"
xcopy /E /I /Y "%SRC%js"         "%DST%\js\"
xcopy /E /I /Y "%SRC%content"    "%DST%\content\"
xcopy /E /I /Y "%SRC%images"     "%DST%\images\"
xcopy /E /I /Y "%SRC%admin"      "%DST%\admin\"
xcopy /E /I /Y "%SRC%.github"    "%DST%\.github\"

copy /Y "%SRC%index.html"       "%DST%\index.html"
copy /Y "%SRC%projects.html"    "%DST%\projects.html"
copy /Y "%SRC%exhibition.html"  "%DST%\exhibition.html"
copy /Y "%SRC%bio.html"         "%DST%\bio.html"
copy /Y "%SRC%contact.html"     "%DST%\contact.html"
copy /Y "%SRC%weapons.html"     "%DST%\weapons.html"

echo Done. Now open GitHub Desktop, commit and push.
pause
