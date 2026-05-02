'[FCAD2000-0]
'[TRUSS]

'******************************************************************************
'
'   Saddle truss script
'
'   22 Feb 2003   N.Penny     Created
'   22 Sep 2005   N.Penny     Added pick for offset and new Stud/Web layout
'   15 Sep 2010   J.Burns     Changed Dimensioning to use CAD dimensions
'
'******************************************************************************


Include "Constants.inc"
Include "ConvertPitch.incx"
Include "Build.incx"
Include "DivideSpace.incx"

'******************************************************************************
'  Main script class to implement build functions
'******************************************************************************

Class TBuilder
    
  Public Span
  Public Truss_Pitch
  Public Main_Pitch
  Public Height_At_Wall
  Public Offset
  Public Max_Web_Spacing
  Public Auto_Dimension

  Private MetricTrussPitch
  Private MetricMainPitch

  Public Sub Build
    Dim A, BC, LC, RC, CL, Tye, Peak
    Dim BCAxis, LCAxis, X1, X2, L
    Dim NumWebs, WebIndex, WebSpacing
    Dim iFrameStart

    'Calculate Truss Pitch (of this truss)
    If ConvertPitch(Truss_Pitch, MetricTrussPitch) = False Then
      MsgBox "Truss_Pitch is not a valid entry", 16
      Exit Sub
    End If

    'Calculate Main Truss Pitch (of rest of roof)
    If ConvertPitch(Main_Pitch, MetricMainPitch) = False Then
      MsgBox "Main_Pitch is not a valid entry", 16
      Exit Sub
    End If

    If MetricTrussPitch <= 0 or MetricMainPitch <= 0 Then
      MsgBox "Negative Pitch not allowed", 16
      Exit Sub
    End If

    With CAD
      Peak = Tan(MetricTrussPitch * Pi / 180) * (Span / 2)

      If Peak <= (.PlateElevationWidth * 2.5) Then
      MsgBox "Truss cannot be built using this Span and Pitch"
      Exit Sub
      End If

      'Place bottom chord and left hand top chord
      .AutoExtend = False
      CL = .PlaceLine(Span / 2 & ",0", "@" & Peak + 200 & "<90")

      A = .PlaceLine("0," & Peak , Span & "," & Peak)
      .ClipRef = drRIGHT
      BC = .PlaceFrameObject(fotBottomChord, "0.01,0", "@" & Span - 0.02 & "<0", FLIPPED, stPlate)
      .ClipRef = drLEFT
      LC = .PlaceFrameObject(fotTopChord, "0,0", "@" & Span / 2 & "<" & MetricTrussPitch, NOT_FLIPPED, stPlate)
      .Extend LC, A
      .ExtendToFurthest BC, LC
      .ExtendToFurthest LC, BC
      BCAxis = .PlaceStickAxis(BC, .PlateAxisDist)
      LCAxis = .PlaceStickAxis(LC, .PlateAxisDist)

      'Place top right chord
      RC = .PlaceFrameObject(fotTopChord, getXYStringFromPolar(Span,0,Span / 2,180 -MetricTrussPitch), "@" & Span / 2 & "<" & -MetricTrussPitch, NOT_FLIPPED, stPlate)
      .Extend RC, A
      .ExtendToFurthest BC, RC
      .ExtendToFurthest RC, BC

      .AutoExtend = True

      'Place Tye if needed
      If Peak > (.PlateElevationWidth * 5) Then
        PlaceTye = true
      Else
        PlaceTye = false
      End If
      
      If PlaceTye Then
        .ClipRef = drLEFT
        Tye = .PlaceFrameObject(fotTye, Span / 2 - 200 & "," & Peak , "@300<0", NOT_FLIPPED, stPlate)
        .CopyMode = False
        .Offset Tye, .Web2Web
        .ExtendToFurthest Tye, LC
        .ExtendToFurthest Tye, RC
        TyeAxis = .PlaceStickAxis(Tye, .PlateAxisDist)
    Else
        ' Using the left chord axis as the tye axis is a bit rough, but it means the rest of the script can still refer to
        ' this axis when it doesnt really matter that the tye isnt there.  Its just for the connections at the apex anyway.
        TyeAxis = .PlaceStickAxis(LC, .PlateAxisDist)
    End If

      iFrameStart = .PlateElevationWidth / (Tan((MetricTrussPitch*Pi)/180))

      'Place Fixed stud if Span < 2520
      If Span / 2 < 1260 And  Span / 2 > iFrameStart Then
        .ClipRef = drMid
        A = .PlaceFrameObject(fotWeb, Span /2 & ",0", .Intersection(TyeAxis, CL), NOT_FLIPPED, stStud)
        
        If PlaceTye Then
            .ExtendToFurthest A, Tye
        Else
          .ExtendToFurthest A, LC
        End If
      End If

      'Place fixed webs if span > 2520
      .ClipRef = drMid
      .CopyMode = True
      L = .StudElevationWidth
      X2 = .PlaceLine(L - (.Web2Web / 2) & ",0", "@" & Peak * 5 & "<90")
      If Span / 2 > 1260 And 825 > iFrameStart Then
        X1 = .Offset(X2, .Web2Web)
        X2 = .PlaceLine("825,0", "@" & Peak & "<90")
        X1 = .Offset(X2, .Web2Web)
        X2 = .PlaceLine("1225,0", "@" & Peak & "<90")
        L = 1260 + (.StudElevationWidth/2)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), FLIPPED, stStud)
        .Mirror A, CL
      End If

      If L = .StudElevationWidth Then
         L = iFrameStart + .Web2Web
      End If  

      'Place rest of webs
      If Span > 3000 Then
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
        X2 = .PlaceLine( L + (WebSpacing * WebIndex) - (.Web2Web / 2) & ",0", "@" & Peak & "<90")
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(TyeAxis, X2), NOT_FLIPPED, stStud)
        Reinforce A
        .Mirror A, CL
      End If

      'Clean up mess and translate for 3D view
      .EraseConstructionLines
      .Translate 0, Height_At_Wall + (Tan(MetricMainPitch * Pi / 180) * Offset)

    End With
    If Auto_Dimension = true Then dimensionframe
  End Sub

  Public Sub dimensionframe
    bottomofframe = Height_At_Wall + (Tan(MetricMainPitch * Pi / 180) * Offset)
    Peak = Tan(MetricTrussPitch * Pi / 180) * (Span / 2)
    With CAD
      .PlaceDimension "0,0",Span & ",0", "0," & bottomofframe -iDimensionFirstSpace,1,-2,iDimensionFontSize,"H"
      .PlaceDimension "0," & Peak + Bottomofframe ,Span / 2 & "," & Peak + bottomofframe , "0," & Peak + bottomofframe + iDimensionFirstSpace ,1,-2,iDimensionFontSize,"H"
      .PlaceDimension "0," & bottomofframe , "0," & Peak + bottomofframe , -iDimensionFirstSpace & ",0",1,-2,iDimensionFontSize,"V" 
      If InStr(Main_Pitch, ":") >0 Then textpitch = "Main Pitch: " & Main_Pitch Else textpitch = "Main Pitch: " & Main_Pitch & Chr(176)
      .PlaceLabel TextPitch , 0 & "," & bottomofframe + Peak , iDimensionFontSize, 0
      If InStr(Truss_Pitch, ":") >0 Then textpitch = "Truss Pitch: " & Truss_Pitch Else textpitch = "Truss Pitch: " & Truss_Pitch & Chr(176)
      .PlaceLabel TextPitch , 0 & "," & bottomofframe + Peak - iDimensionFontSize , iDimensionFontSize, 0
    End With
  End Sub

  Private Sub Reinforce(ID)
    If CAD.Length(ID) > 2200 Then
      CAD.Reinforce ID, 100, CAD.Length(ID) - 200, False
    End If
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
    Truss_Pitch = "20"
    Main_Pitch = "20"
    Height_At_Wall = 100.0
    Offset = 0.0
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
