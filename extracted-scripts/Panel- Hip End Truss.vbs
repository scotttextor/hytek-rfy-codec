'[FCAD2000-0]
'[MISC]

'******************************************************************************
'
'   Hip end support truss script
'
'  15 Dec 2003                Created
'  21 Sep 2010    J.Burns     Changed Dimensioning to use CAD dimensions
'
'******************************************************************************

Include "Constants.inc"
Include "ConvertPitch.incx"
Include "DivideSpace.incx"

'******************************************************************************
'  Main script class to implement build functions
'******************************************************************************

Class TBuilder

  Public Pitch
  Public Auto_Dimension

  Private Length
  Private MetricPitch
  Private Peak

  Public Property Get Span
    Span = Length
  End Property

  Public Sub Build
    Dim A, BC, LC, Z, CL, Tye
    Dim BCAxis, LCAxis, X1, X2, L
    Dim NumWebs, WebIndex, WebSpacing

    If ConvertPitch(Pitch, MetricPitch) = False Then
    MsgBox "Pitch is not a valid entry", 16
    Exit Sub
    End If

    With CAD

      'Place bottom chord and left hand top chord
      .AutoExtend = False
      Peak = Tan(MetricPitch * Pi / 180) * Span + Height_At_Wall
      CL = .PlaceLine(Span & ",0", "@" & Peak + 200 & "<90")

      A = .PlaceLine("0," & Peak , Span & "," & Peak)
      .ClipRef = drRIGHT
      BC = .PlaceFrameObject(fotBottomChord, "0,0", "@" & Span & "<0", FLIPPED, stPlate)
      LC = .PlaceFrameObject(fotTopChord, Span & ",0", "@" & Span & "<" & 180 - MetricPitch, FLIPPED, stPlate)
      .ExtendToWeb BC, LC
      .ExtendToWeb LC, BC
      .AutoExtend = True

      'Create chord axis
      BCAxis = .PlaceStickAxis(BC, .PlateAxisDist)
      LCAxis = .PlaceStickAxis(LC, .PlateAxisDist)

      'Place jack stud and extend chord to it
      .ClipRef = drLEFT
      A = .PlaceFrameObject(fotJackStud, "0,0", "@100<90", NOT_FLIPPED, stStud)
      .ExtendToWeb A, LC
      .ExtendToWeb LC, A

      'Create chord axis
      BCAxis = .PlaceStickAxis(BC, .PlateAxisDist)
      LCAxis = .PlaceStickAxis(LC, .PlateAxisDist)

      'Place webs
      If Span >= 400 Then
        'Place fixed webs
        .ClipRef = drMid
        .CopyMode = True
        L = Span - 78
        X2 = .PlaceLine(Span - 113 & ",0", "@" & Peak & "<90")
        If Span > 850 Then
          X1 = .PlaceLine(Span - 113 & ",0", "@" & Peak & "<90")
          X2 = .PlaceLine(Span - 275 & ",0", "@" & Peak & "<90")
          'A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
          X1 = .Offset(X2, - .Web2Web)
          X2 = .PlaceLine(Span - 475 & ",0", "@" & Peak & "<90")
          L = Span - 500
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
        End If
  
        If Span > 1700 Then
          X1 = .Offset(X2, - .Web2Web)
          X2 = .PlaceLine(Span - 825 & ",0", "@" & Peak & "<90")
          'A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
          X1 = .Offset(X2, - .Web2Web)
          X2 = .PlaceLine(Span - 1225 & ",0", "@" & Peak & "<90")
          L = Span - 1250
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
        End If

        'Place rest of webs
        WebSpacing = L
        NumWebs = DivideSpaceOdd(WebSpacing, 600)
        WebIndex = 1
        While WebIndex < NumWebs
            X1 = .Offset(X2, - .Web2Web)
            X2 = .PlaceLine( L - (WebSpacing * WebIndex) - (.Web2Web / 2) & ",0", "@" & Peak & "<90")
            A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
            WebIndex = WebIndex + 1
            If WebIndex < NumWebs + 1 Then
              X1 = .Offset(X2, - .Web2Web)
              X2 = .PlaceLine( L - (WebSpacing * WebIndex) - (.Web2Web / 2) & ",0", "@" & Peak & "<90")
              A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
            End If
          WebIndex = WebIndex + 1
        Wend
        X1 = .Offset(X2, - .Web2Web)
        X2 = .PlaceLine( .PlateElevationWidth + (.Web2Web / 2) & ",0", "@" & Peak & "<90")
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
      End If

      'Clean up mess
      .EraseConstructionLines
    End With
    If Auto_Dimension = True Then DimensionFrame
  End Sub

  Public Sub dimensionframe
    'This subroutine will dimension the frame external measurements
    Dim sPitchText
    If InStr(Pitch, ":") > 0 Then sPitchText = "Roof Pitch: " & Pitch Else sPitchText = "Roof Pitch: " & Pitch & Chr(176)
    CAD.PlaceDimension "0,0",Span & ",0", Span / 2 & "," & -iDimensionFirstSpace,1,-2,iDimensionFontSize,"H"
    CAD.PlaceDimension "0,0","0," & Peak, -iDimensionFirstSpace & "," & Peak/2,1,-2,iDimensionFontSize,"V"
    CAD.PlaceLabel sPitchText , Span - CAD.TextWidth(sPitchText, iDimensionFontSize) & "," & Peak + iDimensionFirstSpace, iDimensionFontSize, 0
  End Sub

  Public Function ReadOnlyAttributes
    ReadOnlyAttributes = Array("Span")
  End Function

  Private Sub Class_Initialize()
    Length = CAD.FrameLength("")
    Pitch = "20"
    Auto_Dimension = True
  End Sub

End Class

Dim CAD
Set CAD = CADInterface

Dim Builder
Set Builder = New TBuilder

Function Main
  Set Main = Builder
End Function

Sub Build
  Dim PrevLocale
  PrevLocale = SetLocale(5129)
  Builder.Build
  SetLocale(PrevLocale)
End Sub

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
