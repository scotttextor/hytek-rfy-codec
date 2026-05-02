'[FCAD2000-0]
'[MISC]

Option Explicit

'******************************************************************************
'
'   Panel- Floor.vbs
'
'   Generic Floor Panel
'
'  21 Sep 2004    J.Burns     Added dimensioning
'  25 Aug 2010    J.Burns     Changed Dimensioning to use CAD dimensions
'
'******************************************************************************

Include "Constants.inc"
Include "Build.incx"

Private dimensionoffset
Private framedimensiony2

Class TBuilder

  Public Width
  Public Length
  Public Stud_Spacing
  Public Auto_Dimension

  Public Sub Build
    Dim Position, HeightAdjust, tA

    With CAD
      HeightAdjust = .PlateWeb

      .AutoExtend = True

      'Create frame
      .ClipRef = drRight
      .PlaceFrameObject fotTopPlate, "0,0" , Width & ",0", FLIPPED, stPlate
      .ClipRef = drLeft
      .PlaceFrameObject fotTopPlate, "0," & Length , Width & "," & Length, NOT_FLIPPED, stPlate
      .PlaceFrameObject fotJackStud, "0,0" , "0," & Length, NOT_FLIPPED, stStud
      .ClipRef = drRight
      .PlaceFrameObject fotJackStud, Width & ",0" , Width & "," & Length, FLIPPED, stStud

      'Place jack studs
      .ClipRef = drMid
      tA = ((Length - (2 * .PlateElevationWidth)) Mod Stud_Spacing) / 2
      Position = Length - tA - .PlateElevationWidth

      Do
          .PlaceFrameObject fotJackStud, "0," & Position, Width & "," & Position, NOT_FLIPPED, stPlate
          Position = Position - Stud_Spacing
      Loop Until Position <= 0

      tA = ((Width - (2 * .StudElevationWidth)) Mod Stud_Spacing) / 2
      Position = Width - tA - .StudElevationWidth

      Do
        .PlaceFrameObject fotStud, Position & ",0", Position & "," & Length, NOT_FLIPPED, stStud
        Position = Position - Stud_Spacing
      Loop Until Position <= 0

      'Clean up mess
      .EraseConstructionLines
      .FrameElevation = HeightAdjust
      .FramePitch = -90
    End With

    If Auto_Dimension = True Then DimensionFrame

  End Sub

  Public Sub dimensionframe
    'Dimension the frame external measurements
    CAD.PlaceDimension "0,0", Width & ",0", Width/2 & "," & -iDimensionFirstSpace, 1, -2, iDimensionFontSize, "H"
    CAD.PlaceDimension "0,0","0," & Length, -iDimensionFirstSpace & "," & Length/2, 1, -2, iDimensionFontSize, "V" 
  End Sub

  Public Function ReadOnlyAttributes
    ReadOnlyAttributes = Array("Width")
  End Function

  Public Sub Pick
    Dim Result

    Result = CAD.PickDistanceToPointEx("Pick point on opposite side")
    If Not IsEmpty(Result) Then
      Length = Result(1)
    End If
  End Sub

  Private Sub Class_Initialize()
    Width = CAD.FrameLength("")
    Length = 2000.0
    Stud_Spacing = 600.0
    Auto_Dimension = True
  End Sub

End Class

'******************************************************************************
'  Include
'
'  Includes external source files
'
'******************************************************************************

Sub Include(File)
    Dim fso, f, Str
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set f = fso.OpenTextFile(File, 1)
    Str = f.ReadAll
    f.Close
    ExecuteGlobal Str
End Sub
