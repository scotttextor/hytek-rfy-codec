'[FCAD2000-0]
'[TRUSS]

'******************************************************************************
'
'   Extended Half truss script
'
'   Produces Extended Half truss
'
'   11 Oct 2000               Created
'   22 Sep 2005   N.Penny     Changed to use "Build.incx"
'   02 Sep 2010   J.Burns     Changed Dimensioning to use CAD dimensions
'   05 Nov 2010   J.Burns     Script now supports inline and B2B profiles
'
'******************************************************************************

Include "Constants.inc"
Include "Build.incx"
Include "ConvertPitch.incx"
Include "DivideSpace.incx"

'******************************************************************************
'  Main script class to implement build functions
'******************************************************************************

Class TBuilder

  Public Pitch
  Public Eave
  Public Extension
  Public Height_At_Wall
  Public Max_Web_Spacing
  Public Tabs
  Public Auto_Dimension

  Private Length
  Private MetricPitch

  Public Property Get Span
    Span = Length - Eave - Extension
  End Property

  Public Sub Build
    Dim A, BC, TC, LC, Z, CL, Tye, Peak
    Dim BCAxis, LCAxis, TCAxis, X1, X2, L
    Dim NumWebs, WebIndex, WebSpacing

    If ConvertPitch(Pitch, MetricPitch) = False Then
      MsgBox "Pitch is not a valid entry", 16
      Exit Sub
    End If

    If MetricPitch <= 0 Then
      MsgBox "Negative Pitch not allowed", 16
      Exit Sub
    End If

    With CAD

      'Place bottom chord and left hand chord
      .AutoExtend = False
      Peak = Tan(MetricPitch * Pi / 180) * Span + Height_At_Wall
      CL = .PlaceLine(Span & ",0", "@" & Peak + 200 & "<90")
      A = .PlaceLine("0," & Peak , Span & "," & Peak)
      .ClipRef = drRIGHT
      BC = .PlaceFrameObject(fotBottomChord, - Extension & ",0", "@" & Span + Extension & "<0", FLIPPED, stPlate)
     
      'Place the top right chord from left to right (for assembly)
      .ClipRef = drLEFT
      LC = .PlaceFrameObject(fotTopChord, getXYStringFromPolar(Span,Height_At_Wall,Span,180 - MetricPitch),"@" & Span & "<" & -MetricPitch, NOT_FLIPPED, stPlate)
      
      'Place top chord
      .ClipRef = drLEFT
      A = .PlaceLine("0," & Peak + 10 , "@" & Span & "<0")
      .Extend LC, A
      .CopyMode = False
      TC = .PlaceFrameObject(fotTopChord, - Extension - 10 & "," & Peak, "@" & Extension + 20 & "<0", NOT_FLIPPED, stPlate)

      'Extend side chord to eave
      .CopyMode = False
      C = .PlaceLine("-500,0", Span + 500 & ",0")
      D = Cos(MetricPitch * Pi / 180) * .PlateElevationWidth
      A = .PlaceLine(Span + Eave & ",-500" , "@500<90")
      .Extend LC, A

      .AutoExtend = True

      'Create chord axis
      BCAxis = .PlaceStickAxis(BC, .PlateAxisDist)
      LCAxis = .PlaceStickAxis(LC, .PlateAxisDist)
      TCAxis = .PlaceStickAxis(TC, .PlateAxisDist)

      'Place Tye
      .ClipRef = drRIGHT
      .AutoExtend = True
      .CopyMode = False
      A = .PlaceStickAxis(LC, .PlateAxisDist)
      B = .PlaceStickAxis(TC, .PlateAxisDist)
      Tye = .PlaceFrameObject(fotTye, .Intersection(A, B), "@200<" & 180 - (MetricPitch / 2), FLIPPED, stPlate)
      .Offset Tye, -.Web2Web
      
      .ExtendToFurthest Tye, LC
      .ExtendToFurthest Tye, TC

      TyeAxis = .PlaceStickAxis(Tye, .PlateAxisDist)
      X1 = .PlaceLine("0,0", "@1500<90")

      'Clean up chords
      .AutoExtend = False
      
      .ExtendToFurthest TC, LC
      .ExtendToFurthest LC, TC
      
      'Place jack studs
      .AutoExtend = True
      .ClipRef = drLEFT
      A = .PlaceFrameObject(fotWeb, - Extension & ",0", "@" & Height_At_Wall & "<90", NOT_FLIPPED, stStud)
      .ExtendToFurthest A, TC
      .ExtendToFurthest TC, A

      .ClipRef = drRIGHT
      A = .PlaceFrameObject(fotWeb, Span & ",0", "@" & Height_At_Wall & "<90", FLIPPED, stStud)
      .ExtendToFurthest A, LC

      'Place fixed webs
      .ClipRef = drDIMPLE
      .CopyMode = True
      L = Span - .Web2Web
      If Span > ((7 * .Web2Web) + .StudElevationWidth) Then
        X1 = .PlaceLine(Span - (.Web2Web + .StudElevationWidth) & ",0", "@" & Peak & "<90")
        X2 = .Offset(X1, -2 * .Web2Web)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
        X1 = .Offset(X2, -.Web2Web)
        X2 = .Offset(X1, -2 * .Web2Web)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
        L = Span - ((7 * .Web2Web) + .StudElevationWidth)
      End If

      If Span > ((15 * .Web2Web) + .StudElevationWidth)  Then
        X1 = .Offset(X2, - .Web2Web)
        X2 = .Offset(X1, -3 * .Web2Web)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
        X1 = .Offset(X2, - .Web2Web)
        X2 = .Offset(X1, -3 * .Web2Web)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
        L = Span - ((15 * .Web2Web) + .StudElevationWidth)
      End If

      'Place rest of side webs
      If Span > 850 Then
        WebSpacing = L
        NumWebs = DivideSpaceOdd(WebSpacing, Max_Web_Spacing)
        WebIndex = 1
        While WebIndex < NumWebs
          X1 = .Offset(X2, - .Web2Web)
          X2 = .PlaceLine( L - (WebSpacing * WebIndex) - (.Web2Web / 2) & ",0", "@" & Peak & "<90")
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
          Reinforce A
          WebIndex = WebIndex + 1
          If WebIndex < NumWebs + 1 Then
            X1 = .Offset(X2, - .Web2Web)
            X2 = .PlaceLine( L - (WebSpacing * WebIndex) - (.Web2Web / 2) & ",0", "@" & Peak & "<90")
            A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
            Reinforce A
          End If
          WebIndex = WebIndex + 1
        Wend
        X1 = .Offset(X2, - .Web2Web)
        X2 = .PlaceLine((.Web2Web / 2) & ",0", "@" & Peak & "<90")
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(TyeAxis, X2), FLIPPED, stStud)
        Reinforce A
      End If

      'Place extension webs (if extension > 500)
      If Extension >= 500 Then
        X2 = .PlaceLine( - Extension + .StudElevationWidth - (.Web2Web / 2) & ",0", "@" & Peak & "<90")
        WebSpacing = Extension - .StudElevationWidth
        NumWebs = DivideSpaceEven(WebSpacing, Max_Web_Spacing)
        WebIndex = 1
        While WebIndex < NumWebs
          X1 = .Offset(X2, .Web2Web)
          X2 = .PlaceLine( - Extension + (WebSpacing * WebIndex) + (.Web2Web / 2) & ",0", "@" & Peak & "<90")
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(TCAxis, X1), FLIPPED, stStud)
          Reinforce A
          WebIndex = WebIndex + 1
          If WebIndex < NumWebs Then
            X1 = .Offset(X2, .Web2Web)
            X2 = .PlaceLine( - Extension + (WebSpacing * WebIndex) + (.Web2Web / 2) & ",0", "@" & Peak & "<90")
            A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(TCAxis, X2), NOT_FLIPPED, stStud)
            Reinforce A
            WebIndex = WebIndex + 1
          End If
        Wend
        X1 = .Offset(X2, .Web2Web)
        X2 = .PlaceLine( - (.Web2Web / 2) & ",0", "@" & Peak & "<90")
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(TyeAxis, X2), NOT_FLIPPED, stStud)
        Reinforce A
      End If

      'Extend bottom and top chords for tabs
      TabLine = .PlaceLine( -Extension -.StudElevationWidth & ",-500" , "@" & Peak + 1000 & "<90")
      Select Case .GetListIndex(Me, "Tabs")
        Case 0 ' None
        Case 1 ' Bottom
          .Extend BC, TabLine
        Case 2 ' Top
          .Extend TC, TabLine
        Case 3 ' Both
          .Extend BC, TabLine
          .Extend TC, TabLine
      End Select

      'Clean up mess
      .EraseConstructionLines
      .Translate Extension, 0
    End With

    If Auto_Dimension = True Then dimensionframe

  End Sub

  Public Sub dimensionframe

    Peak = Tan(MetricPitch * Pi / 180) * Span + Height_At_Wall
    eavedrop = Eave * Tan(MetricPitch * Pi / 180)
    Dim iBottomDimensions : iBottomDimensions = 0

    With CAD

      ' Dimension Start Height
      .PlaceDimension Span + Extension + Eave & ",0" , "@" & Height_At_Wall & "<90", Span + Extension + Eave + iDimensionFirstSpace & ",0",1,-2,iDimensionFontSize,"V"

      ' Dimension Overall Height
      .PlaceDimension "0,0", "@" & Peak & "<90", -iDimensionFirstSpace & ",0",1,-2,iDimensionFontSize,"V"

      ' Dimension Extension
      .PlaceDimension "0," & Peak, "@" & Extension & "<0", "0," & Peak + iDimensionFirstSpace,1,-2,iDimensionFontSize,"H"

      ' Dimension Right Eave
      If Eave > 0 Then
        .PlaceDimension Length - Eave & ",0" , "@" & Eave & "<0", "0," & -(iDimensionFirstSpace + (iBottomDimensions * iDimensionSpacing) + eavedrop),1,-2,iDimensionFontSize,"H"
        .PlaceDimension "0,0", "@" & Span + Extension & "<0", "0," & -(iDimensionFirstSpace + (iBottomDimensions * iDimensionSpacing) + eavedrop) ,1,-2,iDimensionFontSize,"H"
        iBottomDimensions = iBottomDimensions + 1
      End If

      ' Dimension Overall Length
      .PlaceDimension 0 & ",0", "@" & Eave + Span + Extension & "<0", "0," & -(iDimensionFirstSpace + (iBottomDimensions * iDimensionSpacing) +eavedrop),1,-2,iDimensionFontSize,"H"

      Dim sPitchText
      If InStr(Pitch, ":") >0 Then sPitchText = "Roof Pitch: " & Pitch Else sPitchText = "Roof Pitch:" & Pitch & Chr(176)
      .PlaceLabel sPitchText , Span + Extension - CAD.TextWidth(sPitchText, iDimensionFontSize) & "," & Peak + iDimensionFirstSpace , iDimensionFontSize, 0
    End With
  End Sub

  Private Sub Reinforce(ID)
    If CAD.Length(ID) > 2200 Then
      CAD.Reinforce ID, 100, CAD.Length(ID) - 200, False
    End If
  End Sub

  Public Sub Pick
    Result = CAD.PickOffset("Pick eave position")
    If Not IsEmpty(Result) Then
      Eave = Result(0)
    End If
    Result = CAD.PickFrameReference("Pick start of extension")
    If Not IsEmpty(Result) Then
      Extension = Result
    Else
      Extension = 0
    End If
  End Sub

  Public Function ReadOnlyAttributes
    ReadOnlyAttributes = Array("Span")
  End Function

  Private Sub Class_Initialize()
    Length = CAD.FrameLength("")
    Pitch = "20"
    Eave = 400.0
    Extension = 0.0
    Height_At_Wall = 100.0
    Max_Web_Spacing = 750.0
    Tabs = Array("None", "Bottom", "Top", "Both")
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
