'[FCAD2000-0]
'[TRUSS]

'******************************************************************************
'
'   Reduced truss script
'
'   20 Feb 2003   N.Penny     Created
'   22 Sep 2005   N.Penny     Updated
'   14 Sep 2010   J.Burns     Changed Dimensioning to use CAD dimensions
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
  Public Eave
  Public Reduction
  Public Height_At_Wall
  Public Max_Web_Spacing
  Public Webbing_Type
  Public Place_Tye
  Public Auto_Dimension

  Private Length
  Private MetricPitch
  Private BCAxis, LCAxis, RCAxis, TyeAxis, Web2Stud, Peak, CL
  Private NumWebs, WebIndex, WebSpacing

  Public Property Get Span
    Span = Length - Eave + Reduction
  End Property

  Public Sub Build
    Dim A, B, C, D, BC, LC, RC, Z, Tye
    Dim X1, X2, L
    Dim StartHeight

    If ConvertPitch(Pitch, MetricPitch) = False Then
      MsgBox "Pitch is not a valid entry", 16
      Exit Sub
    End If

    If MetricPitch <= 0 Then
      MsgBox "Negative Pitch not allowed", 16
      Exit Sub
    End If

    With CAD

      'Calculate main variables
      Peak = Tan(MetricPitch * Pi / 180) * (Span / 2) + Height_At_Wall
      StartHeight = ((Peak - Height_At_Wall) * (Reduction / (Span / 2))) + Height_At_Wall
      CL = .PlaceLine((Span / 2) - Reduction & ",0", "@" & Peak & "<90")
      Web2Stud = .Web2Web / 2 + .StudElevationWidth / 2

      'Place bottom chord and left hand top chord
      .AutoExtend = False
      A = .PlaceLine("0," & Peak , Span & "," & Peak)
      .ClipRef = drRIGHT
      BC = .PlaceFrameObject(fotBottomChord, "0,0", "@" & Span - Reduction & "<0", FLIPPED, stPlate)
      .ClipRef = drLEFT
      LC = .PlaceFrameObject(fotTopChord, "0," & StartHeight, "@" & Span / 2 - Reduction & "<" & MetricPitch, NOT_FLIPPED, stPlate)
      .Extend LC, A
      RC = .PlaceFrameObject(fotTopChord, Span / 2 - Reduction & "," & Peak, "@" & Span / 2 & "<" & 360 - MetricPitch, NOT_FLIPPED, stPlate)

      'Extend right chord to eave
      .CopyMode = False
      C = .PlaceLine("-500,0", Length + 500 & ",0")
      D = Cos(MetricPitch * Pi / 180) * .StudElevationWidth
      A = .PlaceLine(Length & ",-500" , "@500<90")
      .Extend RC, A

      .AutoExtend = True

      'Place Tye
      If Place_Tye Then
        .ClipRef = drLEFT
        Tye = .PlaceFrameObject(fotTye, Span / 2 - Reduction - 200 & "," & Peak , "@400<0", NOT_FLIPPED, stPlate)
        .Offset Tye, .Web2Web
        .ExtendToFurthest Tye, LC
        .ExtendToFurthest Tye, RC
        TyeAxis = .PlaceStickAxis(Tye, .PlateAxisDist)
      End If

      'Place jack studs
      If Height_At_Wall > .Web2Web Then
        .ClipRef = drRIGHT
        A = .PlaceFrameObject(fotWeb, Length - Eave & ",0", "@" & Height_At_Wall & "<90", FLIPPED, stStud)
        .ExtendToFurthest A, RC
      End If
      
      If Reduction + Height_At_Wall > .Web2Web Then
        .ClipRef = drLEFT
        A = .PlaceFrameObject(fotWeb, "0,0", "@" & Height_At_Wall & "<90", NOT_FLIPPED, stStud)
        .ExtendToFurthest A, LC
      End If

      'Create webbing axis
      BCAxis = .PlaceStickAxis(BC, .PlateAxisDist)
      LCAxis = .PlaceStickAxis(LC, .PlateAxisDist)
      RCAxis = .PlaceStickAxis(RC, .PlateAxisDist)

      'Place Webs
      .CopyMode = True

      WebLayout = .GetListIndex (Me, "Webbing_Type")

      If WebLayout = wlFink Then
        PlaceFinkWebs
      ElseIf WebLayout = wlHowe Then
        PlaceHoweWebs
      ElseIf WebLayout = wlFan Then
        PlaceFanWebs
      Else
        PlaceFramecadWebs
      End If

      'Clean up mess & adjust for 3D viewing
      .EraseConstructionLines
    End With
    If Auto_Dimension = True Then dimensionframe
  End Sub

  Public Sub PlaceFramecadWebs
    Dim X1, X2

    With CAD

      'Place fixed webs
      .ClipRef = drMid
      L = 78
      If Span / 2 > Height_At_Wall * 8 Then
        X1 = .PlaceLine(Span - Reduction - (.StudElevationWidth + (.Web2Web / 2)) & ",0", "@" & Peak & "<90")
        L = .StudElevationWidth + (.Web2Web / 2)
        X2 = .Offset(X1, -(Height_At_Wall * 2))
        L = L + Height_At_Wall * 2
        If Height_At_Wall > .StudElevationWidth * 2 Then      
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(RCAxis, X2), FLIPPED, stStud)
        End If
        X1 = .Offset(X2, -.Web2Web)
        L = L + .Web2Web
        X2 = .Offset(X1, -(Height_At_Wall * 2))
        L = L + Height_At_Wall * 2
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(RCAxis, X1), NOT_FLIPPED, stStud)
      End If

      If Span / 2 > Height_At_Wall * 17 Then
        X1 = .Offset(X2, -.Web2Web)
        L = L + .Web2Web
        X2 = .Offset(X1, -(Height_At_Wall * 3))
        L = L + Height_At_Wall * 3
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(RCAxis, X2), FLIPPED, stStud)
        X1 = .Offset(X2, -.Web2Web)
        L = L + .Web2Web
        X2 = .Offset(X1, -(Height_At_Wall * 3))
        L = L + Height_At_Wall * 3
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(RCAxis, X1), NOT_FLIPPED, stStud)
      End If

      'Place rest of right hand side webs
      WebSpacing = (Span / 2) - L
      NumWebs = DivideSpaceOdd(WebSpacing, Max_Web_Spacing)
      WebIndex = 1

      X2 = .PlaceLine(Span - Reduction - L & ",0", "@" & Peak & "<90")
      While WebIndex < NumWebs
        X1 = .Offset(X2, -.Web2Web)
        X2 = .PlaceLine( Span - Reduction - (L + (WebSpacing * WebIndex) - (.Web2Web / 2)) & ",0", "@" & Peak & "<90")
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(RCAxis, X2), FLIPPED, stStud)
        Reinforce A
        WebIndex = WebIndex + 1
        If WebIndex < NumWebs + 1 Then
          X1 = .Offset(X2, -.Web2Web)
          X2 = .PlaceLine( Span - Reduction - (L + (WebSpacing * WebIndex) - (.Web2Web / 2)) & ",0", "@" & Peak & "<90")
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(RCAxis, X1), NOT_FLIPPED, stStud)
          Reinforce A
        End If
        WebIndex = WebIndex + 1
      Wend
      X1 = .Offset(X2, -.Web2Web)
      X2 = .PlaceLine( Span - Reduction - (L + (WebSpacing * WebIndex) - (.Web2Web / 2)) & ",0", "@" & Peak & "<90")
      If Place_Tye Then
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(TyeAxis, X2), FLIPPED, stStud)
      Else
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(RCAxis, X2), FLIPPED, stStud)
      End If
      Reinforce A

      'Place left hand side webs
      WebSpacing = (Span /2) - Reduction - .Web2Web
      NumWebs = DivideSpace(WebSpacing, Max_Web_Spacing)
      WebIndex = 1
      X1 = .PlaceLine(((Span /2) - Reduction - (.Web2Web/2)) & ",0", "@" & Peak & "<90")
      X2 = .Offset(X1, -(WebSpacing - .Web2Web))

      If Place_Tye Then
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(TyeAxis, X1), NOT_FLIPPED, stStud)
      Else
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
      End If
      Reinforce A

      While WebIndex < NumWebs
        X1 = .Offset(X2, -.Web2Web)
        X2 = .Offset(X1, -(WebSpacing - .Web2Web))
      If WebIndex Mod 2 <> 0 Then
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
      Else
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
      End If
      Reinforce A
      WebIndex = WebIndex + 1
      Wend
    End With
  End Sub

  Public Sub PlaceFinkWebs
    Dim X1, X2, L

    With CAD
      .ClipRef = drMid

      If Span / 2 < Max_Web_Spacing Then
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(TyeAxis, CL), NOT_FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(LCAxis, CL), NOT_FLIPPED, stStud)
        End If
      ElseIf Span /2 < Max_Web_Spacing * 2.5 Then
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(TyeAxis, CL), NOT_FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(LCAxis, CL), NOT_FLIPPED, stStud)
        End If
        X1 = .Offset(CL, -Web2Stud)
        If (Span /2 - Reduction) > (Span / 4) Then
          X2 = .Offset(X1, -(Span/4))
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
          .Mirror A, CL
        Else
          X2 = .PlaceLine(Web2Stud + .StudAxisDist & ",0", "@" & Peak & "<90")
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
          X1 = .Offset(CL, Web2Stud)
          X2 = .Offset(X1, Span/4)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(RCAxis, X2), FLIPPED, stStud)
        End If
      Else

        'Place Right Hand Side Webs
        X1 = .Offset(CL, .Web2Web / 2)
        X2 = .Offset(X1, Max_Web_Spacing - .Web2Web)
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(TyeAxis, X1), FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(RCAxis, X1), FLIPPED, stStud)
        End If
        X1 = .Offset(X2, .Web2Web)
        X2 = .Offset(X1, Max_Web_Spacing - .Web2Web)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(RCAxis, X2), NOT_FLIPPED, stStud)
        L = Span / 2 - (Max_Web_Spacing * 2)

        While L > Max_Web_Spacing * 2
          X1 = .Offset(X2, .Web2Web)
          X2 = .Offset(X1, Max_Web_Spacing - .Web2Web)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(RCAxis, X1), FLIPPED, stStud)
          X1 = .Offset(X2, .Web2Web)
          X2 = .Offset(X1, Max_Web_Spacing - .Web2Web)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(RCAxis, X2), NOT_FLIPPED, stStud)
          L = L - (Max_Web_Spacing * 2)
        Wend

        'Place Left Hand Side Webs
        WebSpacing = (Span /2) - Reduction - .Web2Web
        NumWebs = DivideSpace(WebSpacing, Max_Web_Spacing)
        WebIndex = 1

        X1 = .Offset(CL, -.Web2Web / 2)
        X2 = .Offset(X1, -(WebSpacing - .Web2Web))
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(TyeAxis, X1), NOT_FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
        End If

        X1 = .Offset(X2, -.Web2Web)
        X2 = .Offset(X1, -(WebSpacing - .Web2Web))
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
        L = (Span / 2) - Reduction - (WebSpacing * 2)

        While L > Max_Web_Spacing * 2
          X1 = .Offset(X2, -.Web2Web)
          X2 = .Offset(X1, -(WebSpacing - .Web2Web))
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
          X1 = .Offset(X2, -.Web2Web)
          X2 = .Offset(X1, -(WebSpacing - .Web2Web))
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
          L = L - (Max_Web_Spacing * 2)
        Wend
      End If
    End With
  End Sub

  Public Sub PlaceHoweWebs
    Dim X1, X2, L

    With CAD
      .ClipRef = drMid

      If Span / 2 < Max_Web_Spacing Then
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(TyeAxis, CL), NOT_FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(LCAxis, CL), NOT_FLIPPED, stStud)
        End If
      ElseIf Span /2 < Max_Web_Spacing * 2.5 Then
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(TyeAxis, CL), NOT_FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(LCAxis, CL), NOT_FLIPPED, stStud)
        End If
        X1 = .Offset(CL, -Web2Stud)
        If (Span /2 - Reduction) > (Span / 4) Then
          X2 = .Offset(X1, -(Span/4))
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
          .Mirror A, CL
        Else
          X2 = .PlaceLine(Web2Stud + .StudAxisDist & ",0", "@" & Peak & "<90")
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
          X1 = .Offset(CL, Web2Stud)
          X2 = .Offset(X1, Span/4)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(RCAxis, X2), FLIPPED, stStud)
        End If
      Else

        'Place Right Hand Side Webs
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(TyeAxis, CL), NOT_FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(LCAxis, CL), NOT_FLIPPED, stStud)
        End If
        X1 = .Offset(CL, Web2Stud)
        X2 = .Offset(X1, Max_Web_Spacing - Web2Stud)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(RCAxis, X2), NOT_FLIPPED, stStud)
        X2 = .Offset(X2, Web2Stud)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(RCAxis, X2), NOT_FLIPPED, stStud)
        L = Span / 2 - Max_Web_Spacing - Web2Stud

        While L > Max_Web_Spacing
          X1 = .Offset(X2, Web2Stud)
          X2 = .Offset(X1, Max_Web_Spacing - Web2Stud)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(RCAxis, X2), NOT_FLIPPED, stStud)
          X2 = .Offset(X2, Web2Stud)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(RCAxis, X2), NOT_FLIPPED, stStud)
          L = L - Max_Web_Spacing - (Web2Stud * 2)
        Wend

        'Place Left Hand Side Webs
        X1 = .Offset(CL, -Web2Stud)
        X2 = .Offset(X1, -(Max_Web_Spacing - Web2Stud))
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
        X2 = .Offset(X2, -Web2Stud)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
        L = Span / 2 - Reduction - Max_Web_Spacing - (Web2Stud * 2)

        While L > Max_Web_Spacing
          X1 = .Offset(X2, -Web2Stud)
          X2 = .Offset(X1, -(Max_Web_Spacing - Web2Stud))
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
          X2 = .Offset(X2, -Web2Stud)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
          L = L - Max_Web_Spacing - (Web2Stud * 2)
        Wend
      End If
    End With
  End Sub

  Public Sub PlaceFanWebs
    Dim X1, X2, L

    With CAD
      .ClipRef = drMid

      If Span / 2 < Max_Web_Spacing Then
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(TyeAxis, CL), NOT_FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(LCAxis, CL), NOT_FLIPPED, stStud)
        End If
      ElseIf Span /2 < Max_Web_Spacing * 2.5 Then
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(TyeAxis, CL), NOT_FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(LCAxis, CL), NOT_FLIPPED, stStud)
        End If
        X1 = .Offset(CL, -Web2Stud)
        If (Span /2 - Reduction) > (Span / 4) Then
          X2 = .Offset(X1, -(Span/4))
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
          .Mirror A, CL
        Else
          X2 = .PlaceLine(Web2Stud + .StudAxisDist & ",0", "@" & Peak & "<90")
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
          X1 = .Offset(CL, Web2Stud)
          X2 = .Offset(X1, Span/4)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(RCAxis, X2), FLIPPED, stStud)
        End If
      Else

        'Place Right Hand Side Webs
        X1 = .Offset(CL, .Web2Web / 2)
        X2 = .Offset(X1, Max_Web_Spacing - .Web2Web)
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(TyeAxis, X1), FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(RCAxis, X1), FLIPPED, stStud)
        End If
        X2 = .Offset(X2, Web2Stud)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(RCAxis, X2), NOT_FLIPPED, stStud)
        X1 = .Offset(X2, Web2Stud)
        X2 = .Offset(X1, Max_Web_Spacing - Web2Stud)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(RCAxis, X2), NOT_FLIPPED, stStud)
        L = Span / 2 - (Max_Web_Spacing * 2) - (.Web2Web / 2) - (Web2Stud * 2)

        While L > Max_Web_Spacing * 2 + Web2Stud
          X1 = .Offset(X2, Web2Stud)
          X2 = .Offset(X1, Max_Web_Spacing - Web2Stud)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(RCAxis, X1), FLIPPED, stStud)
          X2 = .Offset(X2, Web2Stud)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(RCAxis, X2), NOT_FLIPPED, stStud)
          X1 = .Offset(X2, Web2Stud)
          X2 = .Offset(X1, Max_Web_Spacing - Web2Stud)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(RCAxis, X2), NOT_FLIPPED, stStud)
          L = L - (Max_Web_Spacing * 2) - Web2Stud
        Wend

        'Place Left Hand Side Webs
        X1 = .Offset(CL, -.Web2Web / 2)
        X2 = .Offset(X1, -(Max_Web_Spacing - .Web2Web))
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(TyeAxis, X1), NOT_FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
        End If
        X2 = .Offset(X2, -Web2Stud)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
        X1 = .Offset(X2, -Web2Stud)
        X2 = .Offset(X1, -(Max_Web_Spacing - Web2Stud))
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
        L = Span / 2 - Reduction - (Max_Web_Spacing * 2) - (.Web2Web / 2) - (Web2Stud * 2)

        While L > Max_Web_Spacing * 2 + Web2Stud
          X1 = .Offset(X2, -Web2Stud)
          X2 = .Offset(X1, -(Max_Web_Spacing - Web2Stud))
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), FLIPPED, stStud)
          X2 = .Offset(X2, -Web2Stud)
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
          X1 = .Offset(X2, -Web2Stud)
          X2 = .Offset(X1, -(Max_Web_Spacing - Web2Stud))
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
          L = L - (Max_Web_Spacing * 2) - Web2Stud
        Wend          
      End If
    End With
  End Sub

  Public Sub dimensionframe
    'This subroutine will dimension the frame external measurements
    Dim iDimensionCount_Bottom, iDimensionCount_Left, iDimensionCount_Right
    iDimensionCount_Bottom = 0
    iDimensionCount_Left = 0
    iDimensionCount_Right = 0
    
    StartHeight = ((Peak - Height_At_Wall) * (Reduction / (Span / 2))) + Height_At_Wall
    bottomoffset = (Tan(MetricPitch * Pi / 180) * Eave) - Height_At_Wall

    CAD.PlaceDimension "0,0", Span - Reduction + Eave & ",0", "0," & -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Bottom),1,-2,iDimensionFontSize,"H"
    iDimensionCount_Bottom = iDimensionCount_Bottom + 1

    If Eave > 0 Then
     CAD.PlaceDimension Span - Reduction & ",0", Span - Reduction + Eave & ",0", "0," & -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Bottom),1,-2,iDimensionFontSize,"H"
     CAD.PlaceDimension "0,0", Span - Reduction & ",0", "0," & -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Bottom),1,-2,iDimensionFontSize,"H"
     iDimensionCount_Bottom = iDimensionCount_Bottom + 1
    End If

    CAD.PlaceDimension "0,0", "0," & StartHeight, -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Left) & ",0",1,-2,iDimensionFontSize,"V"
    iDimensionCount_Left = iDimensionCount_Left + 1
    
    CAD.PlaceDimension -80 & ",0", -80 & "," & Peak, -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Left) & ",0",1,-2,iDimensionFontSize,"V"
    iDimensionCount_Left = iDimensionCount_Left + 1
    
    CAD.PlaceDimension Span - Reduction + Eave & ",0", Span - Reduction + Eave & "," & Height_At_Wall, Span - Reduction + Eave + iDimensionFirstSpace + (iDimensionSpacing * iDimensionCount_Right)& ",0",1,-2,iDimensionFontSize,"V"

    If InStr(Pitch, ":") >0 Then textpitch = "Roof Pitch: " & Pitch Else TextPitch = "Roof Pitch: " & Pitch & Chr(176)
    CAD.PlaceLabel TextPitch, "0," & Peak + iDimensionSpacing, iDimensionFontSize, 0
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
    Result = CAD.PickFrameReference("Pick peak")
    If Not IsEmpty(Result) Then
      Reduction = Length - Eave - (2 * Result)
    Else
      Reduction = 0
    End If
  End Sub

  Public Function ReadOnlyAttributes
    ReadOnlyAttributes = Array("Span")
  End Function

  Private Sub Class_Initialize()
    Length = CAD.FrameLength("")
    Pitch = "20"
    Eave = 400.0
    Height_At_Wall = 100.0
    Reduction = 0.0
    Max_Web_Spacing = 1200.0
    Webbing_Type = Array("FRAMECAD Default", "Fink", "Howe", "Fan")
    Place_Tye = True
    Auto_Dimension = True
  End Sub

End Class

'******************************************************************************
'  Create an instance of CAD interface and TBuilder
'******************************************************************************

Dim CAD
Set CAD = CADInterface
Dim Builder
Set Builder = New TBuilder

'******************************************************************************
'  Main Function to return instance of TBuilder to caller
'******************************************************************************

Function Main
  Set Main = Builder
End Function

'******************************************************************************
'  Build function
'******************************************************************************

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
