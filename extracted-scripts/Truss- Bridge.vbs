'[FCAD2000-0]
'[TRUSS]

'******************************************************************************
'
'   Bridge truss script
'
'   gable end Script
'
'  11 Dec 2003                Created
'  10 Dec 2004    J.Burns     Added ability to invert truss
'                 J.Burns     Added warning when braces are > 70 deg
'  01 Sep 2010    J.Burns     Changed Dimensioning to use CAD dimensions
'  05 Nov 2010    J.Burns     Modified to support Back to Back trusses
'
'******************************************************************************


Include "Constants.inc"
Include "Build.incx"
Include "ConvertPitch.incx"
Include "DivideSpace.incx"

Class TBuilder

  Public Span
  Public Roof_Pitch
  Public Height_At_Wall
  Public Offset
  Public Maximum_Web_Spacing
  Public Auto_Dimension
  Public Inverted

  Private Length
  Private MetricPitch

  Private Function Height
    Height = Height_At_Wall + (Tan(MetricPitch * Pi / 180) * Offset)
  End Function

  Public Sub Build
    Dim A, BC, TC, CL
    Dim BCAxis, TCAxis, X1, X2, Y1, Y2
    Dim NumWebs, WebIndex, WebSpacing

    If ConvertPitch(Roof_Pitch, MetricPitch) = False Then
      MsgBox "Pitch is not a valid entry", 16
      Exit Sub
    End If

    With CAD
      .AutoExtend = True

      'Place bottom chord and left hand top chord
      CL = .PlaceLine(Span / 2 & ",0", "@" & Height + 200 & "<90")

      A = .PlaceLine("0," & Height , Span & "," & Height)
      .ClipRef = drRIGHT
      BC = .PlaceFrameObject(fotBottomChord, "0,0", "@" & Span & "<0", FLIPPED, stPlate)
      .ClipRef = drLEFT
      TC = .PlaceFrameObject(fotTopChord, "0," & Height, "@" & Span & "<0", NOT_FLIPPED, stPlate)
      BCAxis = .PlaceStickAxis(BC, .PlateAxisDist)
      TCAxis = .PlaceStickAxis(TC, .PlateAxisDist)

      'Place jack studs
      .ClipRef = drLEFT
      A = .PlaceFrameObject(fotWeb, "0,0", "@" & Height & "<90", NOT_FLIPPED, stStud)
      .ExtendCode = EcEnd
      .ExtendToFurthest A, TC
      .ClipRef = drRIGHT
      A = .PlaceFrameObject(fotWeb, Span & ",0", "@" & Height & "<90", FLIPPED, stStud)
      .ExtendCode = EcEnd
      .ExtendToFurthest A, TC

      'Place webs
      .ClipRef = drDIMPLE
      .CopyMode = True
      WebSpacing = (Span / 2) - .StudElevationWidth
      NumWebs = DivideSpaceOdd(WebSpacing, Maximum_Web_Spacing / 2)
      X1 = .PlaceLine (.StudElevationWidth & ",0" , "@" & Height & "<90")
      X2 = .PlaceLine (WebSpacing + .StudElevationWidth & ",0" , "@" & Height & "<90")
      If NumWebs > 0 Then
        For WebIndex = 1 To NumWebs
          Y1 = .Offset(X1, .Web2Web / 2)
          Y2 = .Offset(X2, - .Web2Web / 2)

          If Inverted = True Then
            If WebIndex Mod 2 = 0 Then
              A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, Y1), .Intersection(TCAxis, Y2), NOT_FLIPPED, stStud)
            Else
              A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, Y2), .Intersection(TCAxis, Y1), FLIPPED, stStud)
            End If
          Else
            If WebIndex Mod 2 = 0 Then
              A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, Y2), .Intersection(TCAxis, Y1), FLIPPED, stStud)
            Else
              A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, Y1), .Intersection(TCAxis, Y2), NOT_FLIPPED, stStud)
            End If
          End If

          'Extend Braces to plates
          .ExtendCode = EcEnd
          .ExtendToFurthest A, TC
          .ExtendCode = EcStart
          .ExtendToFurthest A, BC

          .Mirror A, CL
          X1 = .Offset(X1, WebSpacing)
          X2 = .Offset(X2, WebSpacing)
        Next
        
        If (Atn(Height / (Webspacing - .Web2Web)) * 180 / Pi) > 70 Then MsgBox("Web Angle may be too steep.  Consider increasing the value of Maximum_Web_Spacing")
      End If
      'Clean up mess
      .EraseConstructionLines
    End With

    If Auto_Dimension = True Then dimensionframe
  End Sub

  Public Sub dimensionframe
    'This subroutine will dimension the frame external measurements
    CAD.PlaceDimension "0,0", Span & ",0", Span/2 & "," & -iDimensionFirstSpace,1,-2,iDimensionFontSize,"H"
    CAD.PlaceDimension "0,0", "0," & Height, -iDimensionFirstSpace & "," & Height/2 ,1,-2,iDimensionFontSize,"V"  
    If InStr(Roof_Pitch, ":") >0 Then textpitch = Roof_Pitch Else TextPitch = Roof_Pitch & Chr(176)
    If isimperial = True Then
      dimensiontext = "Height At Wall=" & metric2imp(Height_At_Wall) & ", Offset=" & metric2imp(Offset) & " @ Roof Pitch " & textpitch
    Else
      dimensiontext = "Height At Wall=" & Height_At_Wall & ", Offset=" & Offset & " @ Roof Pitch " & TextPitch
    End If
    CAD.PlaceLabel dimensiontext , 0 & "," & Height + iDimensionFirstSpace , iDimensionFontSize, 0
  End Sub

  Public Function ReadOnlyAttributes
    ReadOnlyAttributes = Array("Span")
  End Function

  Public Sub Pick
    Dim Result
    Result = CAD.PickDistanceToPoint("Pick a point on the outside of the wall")
    If Not IsEmpty(Result) Then
      Offset = Result
    Else
      Offset = 0
    End If
  End Sub

  Private Sub Class_Initialize()
    Span = CAD.FrameLength("")
    Roof_Pitch = "20"
    Height_At_Wall = 100.0
    Offset = 1000.0
    Maximum_Web_Spacing = 600.0
    Auto_Dimension = True
    Inverted = False
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
