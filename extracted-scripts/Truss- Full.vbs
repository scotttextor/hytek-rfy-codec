'[FCAD2000-0]
'[TRUSS]

'******************************************************************************
'
'   Full truss script
'
'******************************************************************************

Include "Constants.inc"
Include "ConvertPitch.incx"
Include "libTruss.incx"
Include "DivideSpace.incx"

Class TBuilder

  Public Pitch
  Public Left_Eave
  Public Right_Eave
  Public Height_At_Wall
  Public Max_Web_Spacing
  Public Webbing_Type
  Public Place_Tye
  Public Auto_Dimension
  Public Screw_Access_Holes

  Private Length
  Private MetricPitch
  Private framedimensiony2
  Private BCAxis, LCAxis, RCAxis, TyeAxis, Web2Stud, Peak, CL
  Private NumWebs, WebIndex, WebSpacing

  Public Property Get Span
    Span = Length - Left_Eave - Right_Eave
  End Property

  Public Sub Build
    Dim A, B, C, D,  Z, BC, LC, RC, Tye
    Dim X1, X2

    Dim NextPunch, WebLayout

    If ConvertPitch(Pitch, MetricPitch) = False Then
      MsgBox "Pitch is not a valid entry", 16
      Exit Sub
    End If

    If MetricPitch <= 0 Then
      MsgBox "Negative Pitch not allowed", 16
      Exit Sub
    End If

    If Span < 200 then
      MsgBox "Span is too short. Either increase frame length or reduce eave length.", 16
      Exit Sub
    End If

    With CAD
      'Set the extend Code to EcNull
      .ExtendCode = EcNull

      'Place bottom chord and left hand top chord
      .AutoExtend = False

      .Translate -Left_Eave, 0

      Peak = Tan(MetricPitch * Pi / 180) * (Span / 2) + Height_At_Wall
      CL = .PlaceLine(Span / 2 & ",0", "@" & Peak + 200 & "<90")
      Web2Stud = .Web2Web / 2 + .StudElevationWidth / 2
      A = .PlaceLine("0," & Peak , Span & "," & Peak)
      .ClipRef = drRIGHT
      BC = .PlaceFrameObject(fotBottomChord, "0,0", "@" & Span & "<0", FLIPPED, stPlate)
      .ClipRef = drLEFT
      LC = .PlaceFrameObject(fotTopChord, "0," & Height_At_Wall, "@" & Span / 2 & "<" & MetricPitch, NOT_FLIPPED, stPlate)
      .Extend LC, A

      
      'Place top right hand chord
      .ClipRef = drLEFT
      RC = .PlaceFrameObject(fotTopChord,Span/2 & "," & Peak,Span & "," & Height_At_Wall, NOT_FLIPPED, stPlate)

      'Extend top chords to eaves
      .CopyMode = False
      C = .PlaceLine("-500,0", Span + 500 & ",0")
      D = Cos(MetricPitch * Pi / 180) * .PlateElevationWidth
      A = .PlaceLine( - Left_Eave & ",-500" , "@1500<90")
      .Extend LC, A
      A = .PlaceLine(Span + Right_Eave & ",-500" , "@1500<90")
      .Extend RC, A

      ' Create Chord axis
      BCAxis = .PlaceStickAxis(BC, .PlateAxisDist)
      LCAxis = .PlaceStickAxis(LC, .PlateAxisDist)
      .Extend BCAxis, LCAxis
      RCAxis = .PlaceStickAxis(RC, .PlateAxisDist)
      .Extend BCAxis, RCAxis

      'Place Tye
      .AutoExtend = True

      If Place_Tye Then
        .ClipRef = drLEFT
        Tye = .PlaceFrameObject(fotTye, Span / 2 - 200 & "," & Peak , "@300<0", NOT_FLIPPED, stPlate)
        .Offset Tye, getTyeOffset(MetricPitch,.StudElevationWidth)

        .ExtendCode = EcStart
        .ExtendToFurthest Tye, LC
        .ExtendCode = EcEnd
        .ExtendToFurthest Tye, RC
        .ExtendCode = EcNull
        TyeAxis = .PlaceStickAxis(Tye, .PlateAxisDist)
      End If

      .CopyMode = True

      'Place jack stud and mirror
      If Height_At_Wall > .Web2Web Then
        .ClipRef = drLEFT
        A = .PlaceFrameObject(fotWeb, "0,0", "@" & Height_At_Wall & "<90", NOT_FLIPPED, stStud)
        .ExtendCode = EcStart
        .ExtendToFurthest A, BC
        .ExtendCode = EcEnd
        .ExtendToFurthest A, LC
        .Mirror A, CL
      Else
        'Extend the bottom chord to the top chords
        .AutoExtend = True
        .ExtendCode = EcStart
        .ExtendToRay = False
        A = .PlaceStickAxis(BC, .PlateElevationWidth)
        
        B = .PlaceStickAxis(LC, 0)
        .Extend A, B
        If .Intersects(A,B) Then
          .ExtendCode = ecStart  
          .ExtendTofurthest BC,LC
        End If

        B = .PlaceStickAxis(RC, 0)
        .Extend A, B
        If .Intersects(A,B) Then
          .ExtendCode = ecEnd
          .ExtendTofurthest BC,RC
        End If
        .ExtendToRay = True
        .ExtendCode = EcNull
      End If

      ' Place Webs
      .AutoExtend = True
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

      'Tidy Up Chords

      .AutoExtend = True 
      .ExtendCode = EcNull
      .ExtendToFurthest LC, RC
      .ExtendToFurthest RC, LC

      'Clean up mess & adjust for 3D viewing
      .EraseConstructionLines

      'Translate for 3d drawing
      .Translate Left_Eave, 0

    End With

    If Auto_Dimension = True Then dimensionframe

    'Screw Access Holes (only if On flat orientation)
    If Screw_Access_Holes And (CAD.FrameOrientation = iOrientationOnFlat) Then placeScrewAccessHoles 
    
  End Sub ' End Public Sub Build

  Private Sub placeScrewAccessHoles
    Dim dTemp
    
    With CAD
      'Place service holes for screwing access
      dTemp = Tan(MetricPitch * Pi / 180) * (.PlanWidth/2) + Height_At_Wall + 1
      .PlaceServiceHoles Left_Eave + (.PlanWidth/2) & "," & .PlateElevationWidth,Left_Eave  + (.PlanWidth/2) & "," & dTemp
      .PlaceServiceHoles Length - Right_Eave - (.PlanWidth/2) & "," & .PlateElevationWidth,Length - Right_Eave - (.PlanWidth/2) & "," & dTemp
    End With
  
  End Sub

  Public Sub PlaceFramecadWebs
    Dim X1, X2

    With CAD
      'Place fixed webs
      .ClipRef = drDIMPLE
      L = 78
      If Span / 2 > Height_At_Wall * 8 Then
        X1 = .PlaceLine(.StudElevationWidth + (.Web2Web / 2) & ",0", "@" & Peak & "<90")
        L = .StudElevationWidth + (.Web2Web / 2)
        X2 = .Offset(X1, Height_At_Wall * 2)
        L = L + Height_At_Wall * 2
        If Height_At_Wall > .StudElevationWidth * 2 Then      
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
          .Mirror A, CL
        End If
        X1 = .Offset(X2, .Web2Web)
        L = L + .Web2Web
        X2 = .Offset(X1, Height_At_Wall * 2)
        L = L + Height_At_Wall * 2
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), FLIPPED, stStud)
        .Mirror A, CL
      End If

      If Span / 2 > Height_At_Wall * 17 Then
        X1 = .Offset(X2, .Web2Web)
        L = L + .Web2Web
        X2 = .Offset(X1, Height_At_Wall * 3)
        L = L + Height_At_Wall * 3
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
        .Mirror A, CL
        X1 = .Offset(X2, .Web2Web)
        L = L + .Web2Web
        X2 = .Offset(X1, Height_At_Wall * 3)
        L = L + Height_At_Wall * 3
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), FLIPPED, stStud)
        .Mirror A, CL
      End If

      'Place rest of webs
      WebSpacing = (Span / 2) - L
      NumWebs = DivideSpaceOdd(WebSpacing, Max_Web_Spacing)
      WebIndex = 1
      X2 = .PlaceLine(L & ",0", "@" & Peak & "<90")
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
      If Place_Tye Then
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(TyeAxis, X2), NOT_FLIPPED, stStud)
      Else
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
      End If
      Reinforce A
      .Mirror A, CL
    End With
  End Sub

  Public Sub PlaceFinkWebs
    Dim X1, X2, L

    With CAD
      .ClipRef = drDIMPLE

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
        X2 = .Offset(X1, -(Span/4))
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
        .Mirror A, CL
      Else
        X1 = .Offset(CL, -(.Web2Web / 2))
        X2 = .Offset(X1, -(Max_Web_Spacing - .Web2Web))
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(TyeAxis, X1), NOT_FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
        End If
        .Mirror A, CL
        X1 = .Offset(X2, -.Web2Web)
        X2 = .Offset(X1, -(Max_Web_Spacing - .Web2Web))
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
        .Mirror A, CL
        L = Span / 2 - (Max_Web_Spacing * 2)

        While L > Max_Web_Spacing * 2
          X1 = .Offset(X2, -.Web2Web)
          X2 = .Offset(X1, -(Max_Web_Spacing - .Web2Web))
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
          .Mirror A, CL
          X1 = .Offset(X2, -.Web2Web)
          X2 = .Offset(X1, -(Max_Web_Spacing - .Web2Web))
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
          .Mirror A, CL
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
      ElseIf Span /2 < Max_Web_Spacing * 1.5 Then
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(TyeAxis, CL), NOT_FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(LCAxis, CL), NOT_FLIPPED, stStud)
        End If
        X1 = .Offset(CL, -Web2Stud)
        X2 = .Offset(X1, -(Span/4))
	.ClipRef = drDIMPLE
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
        .Mirror A, CL
      Else
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(TyeAxis, CL), NOT_FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, CL), .Intersection(LCAxis, CL), NOT_FLIPPED, stStud)
        End If
        X1 = .Offset(CL, -Web2Stud)
        X2 = .Offset(X1, -Max_Web_Spacing)
	.ClipRef = drDIMPLE
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
        .Mirror A, CL
        X1 = .Offset(X2, -Web2Stud)
	.ClipRef = drMID
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
        .Mirror A, CL
        L = Span / 2 - (Max_Web_Spacing + (Web2Stud * 2))

        While L > Max_Web_Spacing + (Web2Stud * 3.5)
          X1 = .Offset(X1, -Web2Stud)
          X2 = .Offset(X1, -(Max_Web_Spacing - Web2Stud))
	  .ClipRef = drDIMPLE
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
          .Mirror A, CL
          X1 = .Offset(X2, -Web2Stud)
	  .ClipRef = drMID
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
          .Mirror A, CL
          L = L - Max_Web_Spacing - Web2Stud
        Wend
      End If
      .ClipRef = drMid
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
        X2 = .Offset(X1, -(Span/4))
	.ClipRef = drDIMPLE
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
        .Mirror A, CL
      Else
        .ClipRef = drDIMPLE
        X1 = .Offset(CL, -(.Web2Web / 2))
        X2 = .Offset(X1, -(Max_Web_Spacing - Web2Stud))
        If Place_Tye Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(TyeAxis, X1), NOT_FLIPPED, stStud)
        Else
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
        End If
        .Mirror A, CL

        X2 = .Offset(X2, -Web2Stud)
        .ClipRef = drMID
	A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
        .Mirror A, CL

        X1 = .Offset(X2, -Web2Stud)
        X2 = .Offset(X1, -(Max_Web_Spacing - (Web2Stud)))
	.ClipRef = drDIMPLE
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
        .Mirror A, CL
        L = Span / 2 - (Max_Web_Spacing * 3)

        While L > Max_Web_Spacing * 2
          X2 = .Offset(X2, -Web2Stud)
	  .ClipRef = drMID
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
          .Mirror A, CL

          X1 = .Offset(X2, -Web2Stud)
          X2 = .Offset(X1, -(Max_Web_Spacing - Web2Stud))
	  .ClipRef = drDIMPLE
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), NOT_FLIPPED, stStud)
          .Mirror A, CL

          X2 = .Offset(X2, -Web2Stud)
	  .ClipRef = drMID
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
          .Mirror A, CL

          X1 = .Offset(X2, -Web2Stud)
          X2 = .Offset(X1, -(Max_Web_Spacing - Web2Stud))
	  .ClipRef = drDIMPLE
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
          .Mirror A, CL
          L = L - (Max_Web_Spacing * 2)
        Wend
      End If
      .ClipRef = drMID
    End With
  End Sub

  Public Sub dimensionframe
    Dim iEaveDrop_Left, iEaveDrop_Right, iEaveDrop_Max, iDimensionCount_Bottom, sLabel_Pitch
    iEaveDrop_Left = Left_Eave * Tan(MetricPitch * Pi / 180)
    iEaveDrop_Right = Right_Eave * Tan(MetricPitch * Pi / 180)
    iDimensionCount_Bottom = 0
    
    If iEaveDrop_Left > iEaveDrop_Right Then
      iEaveDrop_Max = iEaveDrop_Left
    Else
      iEaveDrop_Max = iEaveDrop_Right
    End If

    With CAD
      
      'Dimension Start Height
      .PlaceDimension "0,0", "@" & Height_At_Wall & "<90", -iDimensionFirstSpace & ",0",1,-2,iDimensionFontSize,"V"

      'Dimension Overall Height
      .PlaceDimension "0,0", "@" & Peak & "<90", -iDimensionFirstSpace - iDimensionSpacing & ",0",1,-2,iDimensionFontSize,"V"

      'Dimension Left Eave
      If Left_Eave > 0 Then .PlaceDimension "0,0", "@" & Left_Eave & "<0", "0," & - (iDimensionFirstSpace + (iDimensionCount_Bottom * iDimensionSpacing) + iEaveDrop_Max),1,-2,iDimensionFontSize,"H"

      'Dimension Right Eave
      If Right_Eave > 0 Then .PlaceDimension Length - Right_Eave & "," & 0, "@" & Right_Eave & "<0", "0," & - (iDimensionFirstSpace + (iDimensionCount_Bottom * iDimensionSpacing) + iEaveDrop_Max),1,-2,iDimensionFontSize,"H"

      'Dimension Bottom Chord between eaves
      If Left_Eave > 0 Or Right_Eave > 0 Then
        .PlaceDimension Left_Eave & ",0" , "@" & Span & "<0", "0," & - (iDimensionFirstSpace + (iDimensionCount_Bottom * iDimensionSpacing) + iEaveDrop_Max),1,-2,iDimensionFontSize,"H"
        iDimensionCount_Bottom = iDimensionCount_Bottom + 1
      End If

      'Dimension truss overall
      .PlaceDimension "0,0", "@" & Length & "<0", "0," & - (iDimensionFirstSpace + (iDimensionCount_Bottom * iDimensionSpacing) + iEaveDrop_Max),1,-2,iDimensionFontSize,"H"

      If InStr(Pitch, ":") >0 Then sLabel_Pitch = "Pitch: " & Pitch Else sLabel_Pitch = "Pitch: " & Pitch & Chr(176)
      CAD.PlaceLabel sLabel_Pitch , 0 & "," & Peak + iDimensionFontSize, iDimensionFontSize, 0
    End With
  End Sub

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
    Pitch = "20"
    Left_Eave = 600.0
    Right_Eave = 600.0
    Height_At_Wall = 100.0
    Max_Web_Spacing = 750.0
    Webbing_Type = Array("FRAMECAD Default", "Fink", "Howe", "Fan")
    Place_Tye = True
    Screw_Access_Holes = False
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

Sub Include(File)
  Dim fso, f, Str

  Set fso = CreateObject("Scripting.FileSystemObject")
  Set f = fso.OpenTextFile(File, 1)
  Str = f.ReadAll
  f.Close
  ExecuteGlobal Str
End Sub
