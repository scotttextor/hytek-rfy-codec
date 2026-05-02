'[FCAD2000-0]
'[TRUSS]

'******************************************************************************
'
'   Truncated truss script
'
'   29 Jul 2005   N.Penny     Added FlyOver functionality to top chord
'   14 Sep 2010   J.Burns     Changed Dimensioning to use CAD dimensions
'   05 Nov 2010   J.Burns     Modified to support Back to Back trusses
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

  Public Pitch
  Public Left_Eave
  Public Right_Eave
  Public Height_At_Wall
  Public SetBack
  Public Flyover
  Public FlyoverCustomDepth
  Public Max_Web_Spacing
  Public Auto_Dimension
  Public Extend_Chords

  Private Length
  Private MetricPitch

  Public Property Get Span
    Span = Length - Left_Eave - Right_Eave
  End Property

  Function SideSpan
    SideSpan = SetBack - CAD.PlateElevationWidth / Sin(MetricPitch * Pi / 180)
  End Function

  Function CenterSpan
    CenterSpan = Span - (2 * SideSpan)
  End Function

  Function Peak
    Dim offsetdistance
    Select Case Flyover(CAD.GetListIndex (Me, "Flyover"))
      Case "None"
        offsetdistance = 0
      Case "On Flat Section"
        offsetdistance = CAD.PlateFlange / Cos(MetricPitch * Pi / 180)
      Case "On Edge Section"
        offsetdistance = CAD.PlateWeb / Cos(MetricPitch * Pi / 180)
      Case "Custom Depth"
        offsetdistance = FlyoverCustomDepth / Cos(MetricPitch * Pi / 180)
    End Select
    
    Peak = (Tan(MetricPitch * Pi / 180) * SetBack) + Height_At_Wall - offsetdistance
  End Function

  Public Sub Build
    Dim A, B, BC, LC, RC, CL, Tye1, Tye2, Tye1Axis,Tye2Axis
    Dim BCAxis, LCAxis, RCAxis, TCAxis, X1, X2, L
    Dim BCSpacing, TCSpacing
    Dim BCPoint, TCPoint
    Dim NumWebs, WebIndex, WebSpacing
    Dim iTemp1,iTemp2

    If ConvertPitch(Pitch, MetricPitch) = False Then
      MsgBox "Pitch is not a valid entry", 16
      Exit Sub
    End If

    If MetricPitch <= 0 Then
      MsgBox "Negative Pitch not allowed", 16
      Exit Sub
    End If

  'Check for some basic data entry errors
  If Not (SetBack < (Span/2)) Then
    MsgBox "Truncated Truss - Setback must be less than half the Span", vbCritical, "FRAMECAD Detailer Script Error"
    Exit Sub
  End If

  if not (Peak > CAD.StudElevationWidth * 3) then
    MsgBox "Truncated Truss - Overall truss height too low.  Check script parameters", vbCritical, "FRAMECAD Detailer Script Error"
    Exit Sub
  end if

    With CAD
      'Setup references
      .AutoExtend = False
      CL = .PlaceLine(Span / 2 & ",0", "@" & Peak + 200 & "<90")

      'Place bottom and left chords
      .ClipRef = drRIGHT
      BC = .PlaceFrameObject(fotBottomChord, "0,0", "@" & Span & "<0", FLIPPED, stPlate)
      .ClipRef = drLEFT
      LC = .PlaceFrameObject(fotTopChord, "0," & Height_At_Wall, "@" & SideSpan & "<" & MetricPitch, NOT_FLIPPED, stPlate)

      'Place top right hand chord
      RC = .PlaceFrameObject(fotTopChord, getXYStringFromPolar(Span,Height_At_Wall,SideSpan,180 -MetricPitch), "@" & SideSpan & "<" & -MetricPitch, NOT_FLIPPED, stPlate)

      'Place top chord
      A = .PlaceLine("0," & Peak , Span & "," & Peak)
      .Extend LC, A
      .CopyMode = False
      TC = .PlaceFrameObject(fotTopChord, SideSpan +200 & "," & Peak, "@" & CenterSpan - 400 & "<0", NOT_FLIPPED, stPlate)
      
      'Extend chords to eaves
      .CopyMode = False
      C = .PlaceLine("-500,0", Span + 500 & ",0")
      D = Cos(MetricPitch * Pi / 180) * .PlateElevationWidth
      A = .PlaceLine( - Left_Eave & ",-500" , "@500<90")
      .Extend LC, A
      
      A = .PlaceLine(Span + Right_Eave & ",-500" , "@500<90")
      .Extend RC, A

      'Extend center top chord to side chords
      .ExtendCode = EcStart
      .ExtendToFurthest TC, LC
      .ExtendCode = EcEnd
      .ExtendToFurthest LC, TC
      .ExtendCode = EcEnd
      .ExtendToFurthest TC, RC
      .ExtendCode = EcStart
      .ExtendToFurthest RC, TC
      
      'Create chord axis
      BCAxis = .PlaceStickAxis(BC, .PlateAxisDist)
      LCAxis = .PlaceStickAxis(LC, .PlateAxisDist)
      RCAxis = .PlaceStickAxis(RC, .PlateAxisDist)
      TCAxis = .PlaceStickAxis(TC, .PlateAxisDist)

      'Place Tyes
      .ClipRef = drLEFT
      .AutoExtend = True
      .CopyMode = False

      'Place Tye Axes first
      Tye1Axis = .PlaceLine(.Intersection(LCAxis,TCAxis), ("@200<" & (MetricPitch / 2)))
      .Offset Tye1Axis,(.Web2Web + .PlateAxisDist)
      .ExtendCode = EcStart
      .ExtendToWeb Tye1Axis,LC
      .ExtendCode = EcEnd
      .ExtendToWeb Tye1Axis,TC
      .CopyMode = True
      Tye2Axis = .Mirror(Tye1Axis, CL)

      'Place lines on the Tye Webs (checking for web intersection, not center of profile)
      iTemp1 = .Offset(Tye1Axis,-.PlateAxisDist)
      .ExtendCode = EcEnd
      .ExtendToWeb iTemp1,TC
      iTemp2 = .Mirror(iTemp1,CL)

      'Check if the Tyes Intersect (If they do, a single tye is used)
      If .Intersects(iTemp1,iTemp2) Then
         'Place the single tye axis
        .CopyMode = True
        Tye1Axis = .PlaceStickAxis(TC,(1.5 * .PlateElevationWidth) + iBackToBackSpacing)
        .ExtendCode = EcStart
        .ExtendToWeb Tye1Axis,LC
        .ExtendCode = EcEnd
        .ExtendToWeb Tye1Axis,RC
        
        'Place the single tie
        .ClipRef = drCENTER
        Tye1 = .PlaceFrameObject(fotTye, .Intersection(Tye1Axis,LCAxis), .Intersection(Tye1Axis,RCAxis), NOT_FLIPPED, stPlate)
        .ClipRef = drLEFT
        
        'Copy Tye1 as Tye2 so intersections work throughout the rest of the script
        Tye2Axis = Tye1Axis
        Tye2 = Tye1
      Else
        'Place Tyes
        Tye1 = .PlaceFrameObject(fotTye, .Intersection(LCAxis,TCAxis), "@200<" & MetricPitch / 2, NOT_FLIPPED, stPlate)
        .CopyMode = False
        .Offset Tye1, .Web2Web
        .ExtendCode = EcStart
        .ExtendToFurthest Tye1, LC
        .ExtendCode = EcEnd
        .ExtendToFurthest Tye1, TC
        X1 = .PlaceLine(SideSpan & ",0", "@1500<90")
        .CopyMode = True
        Tye2 = .Mirror(Tye1, CL)
      End If
      
      'Place jack stud and mirror them
      If Height_At_Wall > .Web2Web Then
        .ClipRef = drLEFT
        .CopyMode = True
        .AutoExtend = True
        A = .PlaceFrameObject(fotWeb, "0,0", "@" & Height_At_Wall & "<90", NOT_FLIPPED, stStud)
        .ExtendCode = EcEnd
        .ExtendToFurthest A, LC
        .Mirror A, CL
      End If

      'Place side webs

      'Place fixed
      .ClipRef = drMid
      L = .Web2Web + (.StudElevatioNWidth / 2)
      X2 = .PlaceLine(L & ",0", "@" & Peak & "<90")
      If SideSpan > 1000 Then
        X1 = .PlaceLine(.Web2Web + (.StudElevatioNWidth / 2) & ",0", "@" & Peak & "<90") '113
        X2 = .PlaceLine(275 + .Web2Web &",0", "@" & Peak & "<90")
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
        .Mirror A, CL
        X1 = .Offset(X2, .Web2Web)
        X2 = .PlaceLine(.Web2Web + 500 & ",0", "@" & Peak & "<90")
        L = 500 + (1.5 * .Web2Web)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), FLIPPED, stStud)
        .Mirror A, CL
      End If

      If SideSpan > 1700 Then
        X1 = .Offset(X2, .Web2Web)
        X2 = .PlaceLine(.Web2Web + 825 & ",0", "@" & Peak & "<90")
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
        .Mirror A, CL
        X1 = .Offset(X2, .Web2Web)
        X2 = .PlaceLine(.Web2Web + 1225 & ",0", "@" & Peak & "<90")
        L = 1225 + (1.5 * .Web2Web)
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), FLIPPED, stStud)
        .Mirror A, CL
      End If

      'Place rest of webs
      WebSpacing = SideSpan - L
      NumWebs = DivideSpaceOdd(WebSpacing, Max_Web_Spacing)
      WebIndex = 1
      While WebIndex < NumWebs
        X1 = .Offset(X2, .Web2Web)
        X2 = .PlaceLine( L + (WebSpacing * WebIndex) - (.Web2Web / 2) & ",0", "@" & Peak & "<90")
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
        Reinforce A
        .Mirror A, CL
        WebIndex = WebIndex + 1
        X1 = .Offset(X2, .Web2Web)
        X2 = .PlaceLine( L + (WebSpacing * WebIndex) - (.Web2Web / 2) & ",0", "@" & Peak & "<90")
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(LCAxis, X1), FLIPPED, stStud)
        Reinforce A
        .Mirror A, CL
        WebIndex = WebIndex + 1
      Wend

      X1 = .Offset(X2, .Web2Web)
      X2 = .PlaceLine( L + (WebSpacing * WebIndex) - (.Web2Web / 2) & ",0", "@" & Peak & "<90")

      If .Intersects(Tye1Axis, X2) Then
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(Tye1Axis, X2), NOT_FLIPPED, stStud)
      ElseIf .Intersects(LCAxis, X2) Then
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), NOT_FLIPPED, stStud)
      ElseIf .Intersects(TCAxis, X2) Then
        A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(TCAxis, X2), NOT_FLIPPED, stStud)
      End If

      Reinforce A
      .Mirror A, CL

      'Place center webs (if CenterSpan > 600)
      If CenterSpan > 600 Then
        X2 = .Offset(CL, .Web2Web / 2)
        WebSpacing = CenterSpan / 2
        NumWebs = DivideSpaceOdd(WebSpacing, Max_Web_Spacing)
        WebIndex = 1
        While WebIndex < NumWebs
          X1 = .Offset(X2, - .Web2Web)
          X2 = .PlaceLine((Span / 2) - (WebSpacing * WebIndex) - (.Web2Web / 2) & ",0", "@" & Peak & "<90")
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(TCAxis, X2), FLIPPED, stStud)
          .PlaceLine .Intersection(BCAxis, X1), .Intersection(TCAxis, X2)
          Reinforce A
          .Mirror A, CL
          WebIndex = WebIndex + 1
          X1 = .Offset(X2, - .Web2Web)
          X2 = .PlaceLine((Span / 2) - (WebSpacing * WebIndex) - (.Web2Web / 2) & ",0", "@" & Peak & "<90")
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X2), .Intersection(TCAxis, X1), NOT_FLIPPED, stStud)
          Reinforce A
          .Mirror A, CL
          WebIndex = WebIndex + 1
        Wend
        X1 = .Offset(X2, - .Web2Web)
         X2 = .PlaceLine(SideSpan +  (.Web2Web / 2)  & ",0", "@" & Peak & "<90")
        
        'Offset X2 a little if there is o single tie
        If Tye1 = Tye2 Then X2 = .Offset(X2,(.Web2Web / 2) )
        
        If .Intersects(Tye1Axis, X2) Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(Tye1Axis, X2), FLIPPED, stStud)
        ElseIf .Intersects(LCAxis, X2) Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(LCAxis, X2), FLIPPED, stStud)
        ElseIf .Intersects(TCAxis, X2) Then
          A = .PlaceFrameObject(fotWeb, .Intersection(BCAxis, X1), .Intersection(TCAxis, X2), FLIPPED, stStud)
        End If
        
        Reinforce A
        .Mirror A, CL
      End If

      'Clean up chords
      .AutoExtend = False
      .ExtendCode = EcStart     
      .ExtendToFurthest RC, TC
      .ExtendCode = EcEnd
      .ExtendToFurthest LC, TC
      .ExtendCode = EcEnd
      .ExtendToFurthest TC, LC
      .ExtendCode = EcEnd
      .ExtendToFurthest TC, RC

      'Extend Chords (only if On flat orientation)
      If Extend_Chords And (.FrameOrientation = iOrientationOnFlat) Then AddExtensions TC,LC,RC,CL

      'Clean up mess and translate for 3D viewing
      .EraseConstructionLines
      .Translate Left_Eave, 0
    End With
    If Auto_Dimension = true Then dimensionframe
  End Sub

  Private Sub AddExtensions(TCid,LCid,RCid,CLid)
    'Adds the extensions to the top chords to assist with assembly
    'Input Parameters are TopChord, LeftChord, RightChord, CentreLine
    Dim iExtensionLength
    Dim TCAxis2, LCAxis2, RCAxis2
    Dim iTempX,iTempY,iTempCounter
    Dim iLipCutObject, iLipCutCount, iLipCutPosition
    
    iExtensionLength = 150
    
    With CAD
      TCAxis2 = .PlaceStickAxis(TCid, 0)
      LCAxis2 = .PlaceStickAxis(LCid, 0)
      RCAxis2 = .PlaceStickAxis(RCid, 0)
    
      .UpdateStickLength LCid,iExtensionLength,0,1
      .UpdateStickLength RCid,iExtensionLength,1,0
      
      'Get the width of the Lip tool from the conig file
      iLipWidth = .ToolLength("LipNotch")
      
      If iLipWidth < 0 Then
        iLipWidth = .StudElevationWidth
      End If        
  
      'Get the number of lip cuts to be done
      If ((iExtensionLength/iLipWidth) - Round(iExtensionLength/iLipWidth)) > 0 Then
        iLipCutCount = Round(iExtensionLength/iLipWidth)+1
      Else
        iLipCutCount = Round(iExtensionLength/iLipWidth)
      End If

      'Find the X,Y point where the Lips should start
      .GetXY .Intersection(TCAxis2,LCAxis2),iTempX,iTempY
      .GetXY getXYStringFromPolar(iTempX,iTempY,.StudElevationWidth - 5,270 + MetricPitch),iTempX,iTempY

      'Place and mirror the lip cuts
      For iTempCounter = 1 To iLipCutCount
        iLipCutPosition = ((iTempCounter * (iExtensionLength))/iLipCutCount) - (iLipWidth/2)
        A = .PlaceExplicitTool("LipNotch", getXYStringFromPolar(iTempX,iTempY,iLipCutPosition ,MetricPitch),"@10<" & 270 + MetricPitch)
        .Mirror A, CLid
      Next
    End With
  End Sub

  Public Sub dimensionframe
    Dim iEaveDrop_Left, iEaveDrop_Right, iEaveDrop_Largest
    iEaveDrop_Left = Left_Eave * Tan(metricpitch * Pi / 180)
    iEaveDrop_Right = Right_Eave * Tan(metricpitch * Pi / 180)
    iEaveDrop_Largest = getLargest(iEaveDrop_Left,iEaveDrop_Right)

    Dim iDimensionCount_Left, iDimensionCount_Bottom
    iDimensionCount_Left = 0
    iDimensionCount_Bottom = 0

    With CAD
      'Dimension Start Height
      .PlaceDimension "0,0", "@" & Height_At_Wall & "<90", -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Left) & ",0",1,-2,iDimensionFontSize,"V"
      iDimensionCount_Left = iDimensionCount_Left + 1

      'Dimension Overall Height
      .PlaceDimension "0,0", "@" & Peak & "<90", -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Left) & ",0",1,-2,iDimensionFontSize,"V"
      iDimensionCount_Left = iDimensionCount_Left + 1

      'Dimension Eaves and Span
      If Left_Eave > 0 And Right_Eave > 0 Then
        If Left_Eave > 0 Then .PlaceDimension "0,0", "@" & Left_Eave & "<0", "0," & -iEaveDrop_Largest -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Bottom),1,-2,iDimensionFontSize,"H"
        If Right_Eave > 0 Then .PlaceDimension Length - Right_Eave & ",0", "@" & Right_Eave & "<0", "0," & -iEaveDrop_Largest -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Bottom),1,-2,iDimensionFontSize,"H"  
        .PlaceDimension Left_Eave & ",0", "@" & Span & "<0", "0," & -iEaveDrop_Largest -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Bottom),1,-2,iDimensionFontSize,"H"
        iDimensionCount_Bottom = iDimensionCount_Bottom + 1
      End If      

      'Dimension truss overall
      .PlaceDimension "0,0", "@" & Length & "<0", "0," & -iEaveDrop_Largest -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Bottom),1,-2,iDimensionFontSize,"H"

      If InStr(Pitch, ":") >0 Then textpitch = "Pitch: " & Pitch Else textpitch = "Pitch: " & Pitch & Chr(176)
      CAD.PlaceLabel TextPitch , 0 & "," & Peak + iDimensionFontSize, iDimensionFontSize, 0
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
    Result = CAD.PickOffsetWidth("Pick center span (intersection of hip line with face of truss)")
    If Not IsEmpty(Result) Then
      SetBack = (Span - Result(1)) / 2
    End If
  End Sub

  Public Function ReadOnlyAttributes
    ReadOnlyAttributes = Array("Span")
  End Function

  Private Sub Class_Initialize()
    Length = CAD.FrameLength("")
    Pitch = "20"
    SetBack = 1800.0
    Flyover = Array("None", "On Flat Section", "On Edge Section", "Custom Depth")
    FlyoverCustomDepth = 0.0
    Left_Eave = 400.0
    Right_Eave = 400.0
    Height_At_Wall = 100.0
    Max_Web_Spacing = 1200.0
    Auto_Dimension = True
    Extend_Chords = False
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
