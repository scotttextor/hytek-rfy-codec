'******************************************************************************
'
'  Features.inc
'
'  Include file for feature management
'
'  27 Feb 2001                Created
'  21 Sep 2004    J.Burns     Added dimensioning
'  25 Aug 2010    J.Burns     Changed Dimensioning to use CAD dimensions
'
'******************************************************************************

Public leftdimensionsplaced()

Dim Features
Set Features = CreateObject("Scripting.Dictionary")

Sub BuildFeatures
  Dim I, A

  If Features.Count > 0 Then
    A = Features.Items
    For I = 0 To Features.Count - 1
      A(I).Build   
    Next    
  End If
End Sub

Sub DimensionFeatures(drawinternal, currentbottomdimensioncount, currentleftdimensioncount)
  ReDim leftdimensionsplaced(0)
  Dim I, A
  If Features.Count > 0 Then
    A = Features.Items
    For I = Features.Count - 1 To 0 Step -1
      drawreply = A(I).DimensionThisFeature(currentbottomdimensioncount, currentleftdimensioncount, drawinternal)
    Next
  End If
End Sub

Function RemoveFeature(Name)
  If Features.Exists(Name) Then
    Features.Remove(Name)
  End If
End Function

Public Function checkleftdimension(checky1, checky2)
  checkleftdimension = False
  For i = 1 To UBound(leftdimensionsplaced) step 2
    If leftdimensionsplaced(i) = checky1 And leftdimensionsplaced(i + 1) = checky2 Then checkleftdimension = True
    If leftdimensionsplaced(i + 1) = checky1 And leftdimensionsplaced(i) = checky2 Then checkleftdimension = True
    If checkleftdimension = True Then Exit For
  Next
  If checkleftdimension = False Then
    thisindex = UBound(leftdimensionsplaced) + 2
    ReDim Preserve leftdimensionsplaced(thisindex)
    leftdimensionsplaced(thisindex -1) = checky1
    leftdimensionsplaced(thisindex) = checky2
  End If
End Function

Function GetNextLeftFeature(Dist)
  Dim tDist, A, I

  Set GetNextLeftFeature = Nothing
  OK = False
  tDist = 1E20
  If Features.Count > 0 Then
    A = Features.Items
    For I = 0 To Features.Count - 1
      If (A(I).Offset >= Dist) And (A(I).Offset < tDist) Then
        If A(I).Width > CAD.PlateElevationWidth + 10 Then
          tDist = A(I).Offset
          Set GetNextLeftFeature = A(I)
          OK = True
        End If
      End If
    Next
  End If
End Function

Sub OffsetFeatures(Dist)
  Dim I, A

  If Features.Count > 0 Then
    A = Features.Items
    For I = 0 To Features.Count - 1
      A(I).Offset = A(I).Offset + Dist
    Next
  End If
End Sub