' 더블클릭하면 서버를 (창 없이) 켜고 브라우저에서 포트폴리오를 엽니다.
' 이미 켜져 있으면 브라우저만 엽니다. 끄려면 작업 관리자에서 node.exe 를 종료하거나 PC를 다시 시작하면 됩니다.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
sh.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
On Error Resume Next
Set http = CreateObject("MSXML2.XMLHTTP")
http.Open "GET", "http://127.0.0.1:4173/api/state", False
http.Send
alive = (Err.Number = 0 And http.Status = 200)
Err.Clear
On Error GoTo 0
If Not alive Then
  sh.Run "cmd /c node server.js", 0, False
  WScript.Sleep 2500
End If
sh.Run "http://127.0.0.1:4173"
