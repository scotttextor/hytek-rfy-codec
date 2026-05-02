'******************************************************************************
'
'  Build.inc
'
'  Include file for basic build functionality and variables
'
'  Created - 27th Feb 2001
'
'******************************************************************************

'******************************************************************************
'  Create an instance of CAD interface and TBuilder
'******************************************************************************

Dim CAD
Dim Builder
Dim CmdCAD
Dim TM
Set CAD = CADInterface
Set Builder = New TBuilder
Set CmdCAD = CmdCADInterface

'******************************************************************************
'  Main Function to return instance of TBuilder to caller
'******************************************************************************

Function Main
    Set Main = Builder
End Function


'******************************************************************************
'  Build function
'******************************************************************************

Sub Build
  Dim PrevLocale
  PrevLocale = SetLocale(5129)
  CAD.ExtendCode = 0 
  Builder.Build
  SetLocale(PrevLocale)
End Sub

'******************************************************************************
'  Minimum and Maximum functions
'******************************************************************************

Public Function Max(Value1, Value2)
  If Value1 > Value2 Then
    Max = Value1
    Else
      Max = Value2
    End If
End Function
    
Public Function Min(Value1, Value2)
  If Value1 < Value2 Then
      Min = Value1
    Else
      Min = Value2
    End If
End Function

Public Function Clamp(Value, Min, Max)
    If Value < Min Then
        Clamp = Min
    ElseIf Value > Max Then
        Clamp = Max
    Else
        Clamp = Value
    End If
End Function
