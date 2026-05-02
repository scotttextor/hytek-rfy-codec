'[FCAD2000-0]
'[TRUSS]

'******************************************************************************
'
'   Scissor truss script
'
'   14 Oct 2005   N.Penny     Created (Modified from Full truss script)
'   15 Sep 2010   J.Burns     Changed Dimensioning to use CAD dimensions
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

  Public RoofPitch
  Public CeilingPitch
  Public Left_Eave
  Public Right_Eave
  Public Height_At_Wall
  Public Max_Web_Spacing
  Public Auto_Dimension

  Private Length
  Private MetricPitch
  Private MetricCeilingPitch

  Public Property Get Span
    Span = Length - Left_Eave - Right_Eave
  End Property

  Public Sub Build
    Dim A, B, C, D, BC, BC2, LC, RC, Z, CL, Tye, Peak
    Dim BCAxis, BCAxis2, LCAxis, RCAxis, TyeAxis, X1, X2, L
    Dim NumWebs, WebIndex, WebSpacing
    Dim NextPunch

    'Convert TrussPitch

    If ConvertPitch(RoofPitch, MetricPitch) = False Then
      MsgBox "Pitch is not a valid entry", 16
      Exit Sub
    End If

    'Convert CeilingPitch
    If ConvertPitch(CeilingPitch, MetricCeilingPitch) = False Then
      MsgBox "Pitch is not a valid entry", 16
      Exit Sub
    End If

    If MetricPitch <= 0 or MetricCeilingPitch <= 0 Then
      MsgBox "Negative Pitch not allowed", 16
      Exit Sub
    End If

    With CAD

      'Place bottom chord and left hand top chord
      .AutoExtend = False
      Peak = Tan(MetricPitch * Pi / 180) * (Span / 2) + Height_At_Wall
      CL = .PlaceLine(Span / 2 & ",0", "@" & Peak + 200 & "<90")
      A = .PlaceLine("0," & Peak , Span & "," & Peak)
      .ClipRef = drRIGHT
      BC = .PlaceFrameObject(fotBottomChord, "0,0", "@" & Span/2 & "<" & MetricCeilingPitch, FLIPPED, stPlate)
      .ClipRef = drLEFT
      LC = .PlaceFrameObject(fotTopChord, "0," & Height_At_Wall, "@" & Span / 2 & "<" & MetricPitch, NOT_FLIPPED, stPlate)
      .Extend LC, A

      'Place top right chord
      .ClipRef = drLEFT
      RC = .PlaceFrameObject(fotTopChord, getXYStringFromPolar(Span,Height_At_Wall,Span / 2,180 -MetricPitch), "@" & Span / 2 & "<" & -MetricPitch, NOT_FLIPPED, stPlate)
      .Extend RC, A
      
      'Place bottom right chord
      .ClipRef = drRIGHT
      BC2 = .PlaceFrameObject(fotBottomChord, getXYStringFromPolar(Span,0,Span / 2,180 -MetricCeilingPitch), "@" & Span/2 & "<" & -MetricCeilingPitch, FLIPPED, stPlate)

      'Extend top chords to eaves
      .CopyMode = False
      C = .PlaceLine("-500,0", Span + 500 & ",0")
      D = Cos(MetricPitch * Pi / 180) * .PlateElevationWidth
      A = .PlaceLine( - Left_Eave & ",-500" , "@500<90")
      .Extend LC, A

      A = .PlaceLine(Span + Right_Eave & ",-500" , "@500<90")
      .Extend RC, A

      'Tidy Bottom Chord Connection
      .ExtendToFurthest BC, BC2
      .ExtendToFurthest BC2, BC

      'Create Chord axis
      BCAxis = .PlaceStickAxis(BC, .PlateAxisDist)
      LCAxis = .PlaceStickAxis(LC, .PlateAxisDist)
      .Extend BCAxis, LCAxis
      BC2Axis = .PlaceStickAxis(BC2, .PlateAxisDist)
      RCAxis = .PlaceStickAxis(RC, .PlateAxisDist)
      .Extend BCAxis, RCAxis

      'Place Tye
      .AutoExtend = True
      .ClipRef = drLEFT
      Tye = .PlaceFrameObject(fotTye, Span / 2 - 200 & "," & Peak , "@300<0", NOT_FLIPPED, stPlate)
      .Offset Tye, .Web2Web + (0.5 * .PlateElevationWidth)
      .ExtendToFurthest Tye, LC
      .ExtendToFurthest Tye, RC
      TyeAxis = .PlaceStickAxis(Tye, .PlateAxisDist)

      'Modify chord axis
      BCAxis = .PlaceStickAxis(BC, .PlateAxisDist)
      LCAxis = .PlaceStickAxis(LC, .PlateAxisDist)

      .CopyMode = True
      .AutoExtend = True

      If Height_At_Wall > .Web2Web Then
        'Place jack stud and mirror
        .ClipRef = drLEFT
        
        A = .PlaceFrameObject(fotWeb, "0,0", "@" & Height_At_Wall & "<90", NOT_FLIPPED, stStud)
        .ExtendToFurthest A, LC
        .ExtendToFurthest A, BC
        B = .Mirror(A, CL)

        'Trim Bottom chord to jack stud (tidy)
        .ExtendToFurthest BC, A
        .ExtendToFurthest BC2, B
      End If

      'Place centre studs
      .ClipRef = drRight

      A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(TyeAxis, CL), FLIPPED, stStud)
      .ExtendToFurthest A, BC
      .ExtendToFurthest A, Tye
      .Mirror A, CL

      'Place Web Holes through Centre Studs
      A = .PlaceExplicitTool("SingleBoltHole", ((Span /2) - 75) & "," & ((Span /2) * Tan(MetricCeilingPitch * Pi /180)) + 100, "@150,0")

      'Place fixed webs
      .ClipRef = drMid
      L = 78
      If Span / 2 > .Web2Web + 850 Then
        X1 = .PlaceLine(.Web2Web + .StudAxisDist & ",0", "@" & Peak & "<90")
        X2 = .PlaceLine(.Web2Web + 240 & ",0", "@" & Peak & "<90")
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
        .Mirror A, CL
        X1 = .Offset(X2, .Web2Web)
        X2 = .PlaceLine(.Web2Web + 440 & ",0", "@" & Peak & "<90")
        L = .Web2Web + 465
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), FLIPPED, stStud)
        .Mirror A, CL
      End If

      If Span / 2 > .Web2Web + 1700 Then
        X1 = .Offset(X2, .Web2Web)
        X2 = .PlaceLine(.Web2Web + 790 & ",0", "@" & Peak & "<90")
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
        .Mirror A, CL
        X1 = .Offset(X2, .Web2Web)
        X2 = .PlaceLine(.Web2Web + 1190 & ",0", "@" & Peak & "<90")
        L = .Web2Web + 1250
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), FLIPPED, stStud)
        .Mirror A, CL
      End If

      'Place rest of webs
      WebSpacing = (Span / 2) - L
      NumWebs = DivideSpaceOdd(WebSpacing, Max_Web_Spacing)
      WebIndex = 1
      X2 = .PlaceLine(L - (.Web2Web / 2) & ",0", "@" & Peak & "<90")
      While WebIndex < NumWebs
        X1 = .Offset(X2, .Web2Web)
        X2 = .PlaceLine( L + (WebSpacing * WebIndex) - (.Web2Web / 2) & ",0", "@" & Peak & "<90")
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
        Reinforce A
        .Mirror A, CL
        WebIndex = WebIndex + 1
        If WebIndex < NumWebs + 1 Then
          X1 = .Offset(X2, .Web2Web)
          X2 = .PlaceLine( L + (WebSpacing * WebIndex) - (.Web2Web / 2) & ",0", "@" & Peak & "<90")
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), FLIPPED, stStud)
          Reinforce A
          .Mirror A, CL
        End If
        WebIndex = WebIndex + 1
      Wend
      X1 = .Offset(X2, .Web2Web)
      X2 = .PlaceLine( L + (WebSpacing * WebIndex) - (.Web2Web / 2) - .StudElevationWidth & ",0", "@" & Peak & "<90")
      A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(TyeAxis, X2), NOT_FLIPPED, stStud)
      Reinforce A
      .Mirror A, CL

      'Clean up mess & adjust for 3D viewing
      .EraseConstructionLines

      'Translate for 3d drawing
      .Translate Left_Eave, 0

    End With
    If Auto_Dimension = True Then dimensionframe
  End Sub

  Public Sub dimensionframe
    Dim iPeak, iEaveDrop_Left, iEaveDrop_Right, iEaveDrop_Largest
    iPeak = Tan(MetricPitch * Pi / 180) * (Span / 2) + Height_At_Wall
    iEaveDrop_Left = Left_Eave * Tan(metricpitch * Pi / 180)
    iEaveDrop_Right = Right_Eave * Tan(metricpitch * Pi / 180)
    iEaveDrop_Largest = getLargest(iEaveDrop_Left,iEaveDrop_Right)
    
    Dim iDimensionCount_Left, iDimensionCount_Bottom
    iDimensionCount_Left = 0
    iDimensionCount_Bottom = 0

    With CAD
      'Dimension Start Height
      If Height_At_Wall > 0 Then
        .PlaceDimension "0,0", "@" & Height_At_Wall & "<90", -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Left)  & ",0",1,-2,iDimensionFontSize,"V"
        iDimensionCount_Left = iDimensionCount_Left + 1
      End If
     
      'Dimension Overall Height
      .PlaceDimension "0,0", "@" & iPeak & "<90", -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Left) & ",0",1,-2,iDimensionFontSize,"V"
      iDimensionCount_Left = iDimensionCount_Left + 1

      'Dimension Eaves
      If Left_Eave > 0 Or Right_Eave > 0 Then
        If Left_Eave > 0 Then .PlaceDimension "0,0", "@" & Left_Eave & "<0", "0," & -iEaveDrop_Largest - iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Bottom) ,1,-2,iDimensionFontSize,"H"
        If Right_Eave > 0 Then .PlaceDimension Length - Right_Eave & ",0", "@" & Right_Eave & "<0", "0," & -iEaveDrop_Largest - iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Bottom),1,-2,iDimensionFontSize,"H"
          
       .PlaceDimension Left_Eave & ",0", "@" & Span & "<0", "0," & -iEaveDrop_Largest - iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Bottom),1,-2,iDimensionFontSize,"H"
        iDimensionCount_Bottom = iDimensionCount_Bottom + 1
      End If

      'Dimension truss overall
      .PlaceDimension "0,0", "@" & Length & "<0", "0," & -iEaveDrop_Largest - iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Bottom),1,-2,iDimensionFontSize,"H"
      iDimensionCount_Bottom = iDimensionCount_Bottom + 1

      If InStr(RoofPitch, ":") >0 Then textpitch = "Roof Pitch: " & RoofPitch Else textpitch = "Roof Pitch: " & RoofPitch & Chr(176)
      .PlaceLabel TextPitch , 0 & "," & iPeak + iDimensionFirstSpace, iDimensionFontSize, 0
      If InStr(CeilingPitch, ":") >0 Then textpitch = "Ceiling Pitch: " & CeilingPitch Else textpitch = "Ceiling Pitch: " & CeilingPitch & Chr(176)
      .PlaceLabel TextPitch , 0 & "," & iPeak + iDimensionFirstSpace - iDimensionFontSize, iDimensionFontSize, 0                
    End With    
  End Sub

  Private Function getLargest(iInput1,iInput2)
    'Returns the larger value
    If iInput1 > iInput2 Then
      getLargest = iInput1
    Else
      getLargest = iInput2
    End If
  End Function

  Private Sub Reinforce(ID)
    If CAD.Length(ID) > 2200 Then
      CAD.Reinforce ID, 100, CAD.Length(ID) - 200, False
    End If
  End Sub

  Public Sub Pick
    Result = CAD.PickOffsetWidth("Pick eave positions")
    If Not IsEmpty(Result) Then
      Left_Eave = Result(0)
      Right_Eave = Length - Result(1) - Left_Eave
    End If
  End Sub

  Public Function ReadOnlyAttributes
    ReadOnlyAttributes = Array("Span")
  End Function

  Private Sub Class_Initialize()
    Length = CAD.FrameLength("")
    RoofPitch = "4:12"
    CeilingPitch = "20"
    Left_Eave = 600.0
    Right_Eave = 600.0
    Height_At_Wall = 100.0
    Max_Web_Spacing = 750.0
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
