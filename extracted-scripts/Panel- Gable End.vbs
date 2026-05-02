'[FCAD2000-0]
'[MISC]

Option Explicit

'******************************************************************************
'
'   Panel- Gable End.vbs
'
'   gable end Script
'
'  15 Dec 2003                Created
'  21 Sep 2004    J.Burns     Added dimensioning
'  25 Aug 2010    J.Burns     Changed Dimensioning to use CAD dimensions
'
'******************************************************************************

Include "Constants.inc"
Include "ConvertPitch.incx"
Include "Build.incx"

Class TBuilder

  Public Span
  Public Pitch
  Public Auto_Dimension

  Private MetricPitch

  Public Sub Build

    Dim A, BC, LC, RC, CL, Tye, Peak
    Dim BCAxis, LCAxis, X1, X2, L
    Dim BCSpacing, TCSpacing
    Dim BCPoint, TCPoint
    Dim NumWebs, WebIndex, WebSpacing

    With CAD

      If ConvertPitch(Pitch, MetricPitch) = False Then
        MsgBox "Pitch is not a valid entry", 16
        Exit Sub
      End If

      'Place bottom chord and left hand top chord
      .AutoExtend = False
      Peak = Tan(MetricPitch * Pi / 180) * (Span / 2)
      CL = .PlaceLine(Span / 2 & ",0", "@" & Peak + 200 & "<90")

      A = .PlaceLine("0," & Peak , Span & "," & Peak)
      .ClipRef = drRIGHT
      BC = .PlaceFrameObject(fotBottomChord, "0.01,0", "@" & Span - 0.02 & "<0", FLIPPED, stPlate)
      .ClipRef = drLEFT
      LC = .PlaceFrameObject(fotTopChord, "0,0", "@" & Span / 2 & "<" & MetricPitch, NOT_FLIPPED, stPlate)
      .Extend LC, A
      .ExtendToWeb LC, BC
      .ExtendToWeb BC, LC
      BCAxis = .PlaceStickAxis(BC, .PlateAxisDist)
      LCAxis = .PlaceStickAxis(LC, .PlateAxisDist)

      'Mirror top chord to right
      .CopyMode = True
      RC = .Mirror(LC, CL)
      .ExtendToWeb BC, RC

      'Set number of spacings according to span
      If Span > 6000 Then
        BCSpacing = 5
      ElseIf Span > 3600 Then
        BCSpacing = 3
      Else
        BCSpacing = 2
      End If

      NumWebs = Fix(BCSpacing / 2)
      TCSpacing = NumWebs + 1

      'Calculate spacing dimensions
      TCSpacing = (Span / 2) / TCSpacing
      BCSpacing = Span / BCSpacing

      'Place webs
      .AutoExtend = True
      .ClipRef = drMid
      BCPoint = BCSpacing - (.Web2Web / 2)
      TCPoint = TCSpacing - (.Web2Web / 2)
      X1 = .PlaceLine (BCPoint & ",0" , "@" & Peak & "<90")
      X2 = .PlaceLine (TCPoint & ",0" , "@" & Peak & "<90")

      For WebIndex = 1 To NumWebs
        If Span <= 3600 Then
          A = .PlaceFrameObject(fotWeb, (Span / 2) - (.StudElevationWidth / 2) - 10 & ",0" , "@200<90", FLIPPED, stStud)
          BCPoint = Span / 2
          .ExtendToWeb A, LC
        Else
          X2 = .Offset(X2, .Web2Web)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
          If .Length(A) > 2200 Then
            .Box A
          End If
          .Mirror A, CL
          X1 = .Offset(X1, .Web2Web)
          X2 = .PlaceLine(TCPoint + (TCSpacing * WebIndex) & ",0", "@" & Peak & "<90")
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
          If .Length(A) > 2200 Then
            .Box A
          End If
        End If
        .Mirror A, CL
        X1 = .PlaceLine (BCPoint + (BCSpacing * WebIndex) & ",0" , "@" & Peak & "<90")
      Next

      'Clean up mess and set elevation for 3D view
      .EraseConstructionLines
    End With

    If Auto_Dimension = True Then DimensionFrame

  End Sub

  Public Sub dimensionframe
    'This subroutine will dimension the frame external measurements
    Dim Peak, iDimensionPosX, iDimensionPosY
    Peak = Tan(MetricPitch * Pi / 180) * (Span / 2)

    'Calculate the center of the Left Top plate and find the point iDimensionFirstSpace mm perpendicular to it
    iDimensionPosX = (Span/4) - iDimensionFirstSpace * Sin(MetricPitch / 180 * Pi)
    iDimensionPosY =  (Peak/2) + (iDimensionFirstSpace * Cos(MetricPitch / 180 * Pi))

    'Place the dimensions
    CAD.PlaceDimension "0,0", Span & ",0", Span/2 & "," & -iDimensionFirstSpace, 1, -2, iDimensionFontSize, "H"
    CAD.PlaceDimension "0,0", "0," & Peak, -iDimensionFirstSpace & "," & Peak/2, 1, -2, iDimensionFontSize, "V"
    CAD.PlaceDimension "0,0", Span/2 & "," & Peak, iDimensionPosX & "," & iDimensionPosY, 1, -2, iDimensionFontSize, "A"         
  End Sub


  Public Function ReadOnlyAttributes
    ReadOnlyAttributes = Array("Span")
  End Function

  Private Sub Class_Initialize()
    Span = CAD.FrameLength("")
    Pitch = "20"
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
