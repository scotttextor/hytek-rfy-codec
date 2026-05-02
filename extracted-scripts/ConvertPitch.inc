'******************************************************************************
'
'  ConvertPitch.inc
'
'  Include file to convert pitch
'
'  Created - 15 June 2004
'
'  Author - Nathan Penny (np@metalformingtech.com)
'
'******************************************************************************

'******************************************************************************
'  Usage
'******************************************************************************
'
'....
'Public Sub Build
'
'  If ConvertPitch(Pitch, MetricPitch) = False Then
'     MsgBox "Pitch is not a valid entry", 16
'     Exit Sub
'  End If
'
'  With CAD
'     ....

'******************************************************************************
'  ConvertPitch
'******************************************************************************

Public Function ConvertPitch(Pitch, ByRef MetricPitch)
    
    Dim Rise, Run, ColonPos
    
    If IsNumeric(Pitch) Then
        MetricPitch = Pitch
        ConvertPitch = True
    ElseIf InStr(Pitch, ":") Then
        ColonPos = InStr(Pitch, ":")
        Rise = Left(Pitch, ColonPos -1)
        Run = Right(Pitch, Len(Pitch) - ColonPos)
        If IsNumeric(Rise) And IsNumeric(Run) Then
            If (Run <> 12) And (Run <> 10) Then
                MsgBox "Run does not equal 10 or 12",vbOKOnly + vbInformation, "Warning" 
            End If
            MetricPitch = Atn(Rise / Run) * 180 / Pi
            ConvertPitch = True
        Else
            ConvertPitch = False
        End If
    Else
        ConvertPitch = False
    End If
    
End Function

Public Function getXYStringFromPolar(fX,fY,fRadius,fAzimuthDegrees)
  'Returns a String in the format "X,Y" of the end location given a polar coordinate
  Dim fDeltaX, fDeltaY, fAziumuthRadians
  
  fAziumuthRadians = fAzimuthDegrees * Pi / 180
  fDeltaX = fRadius * Cos(fAziumuthRadians)
  fDeltaY = fRadius * Sin(fAziumuthRadians)

  getXYStringFromPolar = cStr(fX + fDeltaX) & "," & cStr(fY + fDeltaY)
End Function