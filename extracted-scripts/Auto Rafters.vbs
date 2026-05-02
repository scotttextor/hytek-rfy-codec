'[FCAD2000-0]
'[ROOF_PANEL] 

Option Explicit 

Include "Constants.inc"
Include "Build.incx"
Include "Features.incx"
Include "Auto Rafter Verticals.incx"
Include "libGeneral.incx"

Dim OK

'******************************************************************************
'  Main script class to implement build functions
'******************************************************************************

Class TBuilder

Public Length
Public Rafters
Public Auto_Dimension

Private ETop
Private ELeft
Private EBottom
Private ERight

Public Sub Build

  Dim HSticks() 
  Dim CurrentStick, YPos, J, XPos, VSticks(), current,x,I
  CAD.AutoExtend = True
  Studs.Place
  if Auto_Dimension then
    dimensionframe
  end if
End Sub
    
Public Sub dimensionframe
  CAD.PlaceDimension TM.MinX & "," & TM.MinY, TM.MaxX & "," & TM.MinY, "0," & TM.MinY - (iDimensionFirstSpace + (Dimension_Offset(locationBOTTOM) * iDimensionSpacing)), 1, -2, iDimensionFontSize, "H"
  CAD.PlaceDimension TM.MinX & "," & TM.MinY, TM.MinX & "," & TM.MaxY, TM.MinX - (iDimensionFirstSpace + (Dimension_Offset(locationLEFT) * iDimensionSpacing)) & ",0", 1, -2, iDimensionFontSize, "V"
  CAD.PlaceLabel "Pitch: " & (90 + CAD.FramePitch) & Chr(176), TM.MinX - (iDimensionFirstSpace + (Dimension_Offset(locationLEFT) * iDimensionSpacing)) & "," & TM.MinY - (iDimensionFirstSpace + (Dimension_Offset(locationBOTTOM) * iDimensionSpacing)) + iDimensionFontSize, iDimensionFontSize, 0 
End Sub

Public Function ReadOnlyAttributes
  ReadOnlyAttributes = Array("Length")
End Function

Private Sub Class_Initialize()
  CAD.DrawingExtents ETop,ELeft,EBottom,ERight
  Length = CAD.FrameLength("Length")
  Rafters = Array(0.0)
  Auto_Dimension = True
  Set TM = CAD.TemplateManager
End Sub

End Class

'******************************************************************************
'  Include
'
'  Includes external source files
'
'******************************************************************************

Sub Include(File)
  Dim fso, f, str
 
  Set fso = CreateObject("Scripting.FileSystemObject")
  Set f = fso.OpenTextFile(File,1)
  str = f.ReadAll
  f.Close
  ExecuteGlobal str
End Sub
