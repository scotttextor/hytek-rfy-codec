'******************************************************************************
'
'  Opening.inc
'
'  Include file for wall openings (doors, windows)
'
'  27 Feb 2001                Created
'  21 Sep 2004    J.Burns     Added dimensioning
'  22 Feb 2006    N.Penny     Now supports SiteInfo.inc (StudEndClearance)
'  25 Aug 2010    J.Burns     Changed Dimensioning to use CAD dimensions
'  25 Aug 2010    K.Michel    Added Warren header and L plate dimensions 
'  27 Aug 2010    K.Michel    Added Bolt holes next to openings
'  22 Oct 2010    J.Burns     Jack and Jam Stud spacings are now constants
'  09 Nov 2010    J.Burns     Changed to Support Back to back studs
'
'******************************************************************************

Const Head_Inverted_Warren = 0
Const Head_Warren = 1
Const Head_Pratt = 2
Const Head_Inverted_Pratt = 3
Const Head_IStuds = 4
Const Head_CSection = 5

Const Structure_Full = 0
Const Structure_Top = 1
Const Structure_Bottom = 2

Class TOpening
  Public Width
  Public Offset
  Public Head_Clearance
  Public Side_Clearance
  Public WebDistance
  Public Centered
  Public ExtraStuds
  Public HeadType
  Public Structure
  Public StructureSize
  Public Notch_Door_Sill
  Public First_Last_Jack_Stud
  Public L_Header_Size
  Public AllowNogPassthrough

  Private Result
  Private LeftEdge
  Private RightEdge
  Private NumJambs
  Private Box
  Private FHead
  Private FSill
  Private textopeningwidth
  Private textopeningheight
  Private textopeningoffset
  Private textopeningsill
  Private WebSpacing
  Private WebIndex

  Public Property Get Head
    Head = FHead
  End Property
  Public Property Let Head(Value)
    FHead = Value
  End Property
  
  Public Property Get Height
    Height = Head - Sill
  End Property
  Public Property Let Height(Value)
    Sill = Head - Value
  End Property

  Public Property Get Sill
    Sill = FSill
  End Property
  Public Property Let Sill(Value)
    FSill = Clamp(Value, 0.0, Head)
  End Property
  
  Public Function TotalHead
    TotalHead = Head + Head_Clearance
  End Function

  Public Function FOffset
    FOffset = Offset - Side_Clearance / 2
  End Function

  Public Function FWidth
    FWidth = Width + Side_Clearance
  End Function

  Public Sub DimensionThisFeature(currentbottomdimensioncount, currentleftdimensioncount, drawinternal)
    'Adds dimensions to feature

    Dim bottomoffset : bottomoffset = -iDimensionFirstSpace + (-currentbottomdimensioncount * iDimensionSpacing)
    Dim leftoffset : leftoffset = -iDimensionFirstSpace + (-currentleftdimensioncount * iDimensionSpacing)

    If drawinternal = True Then
      'Draw the dimensions of the opening inside the opening
      CAD.PlaceDimension FOffset & "," & Sill, FOffset & "," & TotalHead, FOffset + iDimensionFirstSpace & ",0", 1, -2, iDimensionFontSize, "V"
      CAD.PlaceDimension FOffset & ",0", FOffset + FWidth & ",0", "0," & Sill + iDimensionFirstSpace, 1, -2, iDimensionFontSize, "H"
    Else
      'Draw the dimensions of the opening on the L.H side of the frame
      If checkleftdimension(Sill, TotalHead) = False Then
        CAD.PlaceDimension FOffset & "," & sill, FOffset & "," & cStr(TotalHead), cStr(leftoffset) & "," & cStr(-leftoffset - iDimensionSpacing), 1, -2, iDimensionFontSize, "V"      'verticle head height dims
        currentleftdimensioncount = currentleftdimensioncount + 1
      End If
      CAD.PlaceDimension FOffset & ",0", cStr(FOffset + FWidth) & ",0" , cStr(FOffset + (FWidth / 2)) & "," & cStr(bottomoffset) , 1, -2, iDimensionFontSize, "H"
    End If

    CAD.PlaceDimension "0,0", cStr(FOffset) & ",0", cStr(FOffset / 2) & "," & cStr(bottomoffset) , 1, -2, iDimensionFontSize, "H"
    currentbottomdimensioncount = currentbottomdimensioncount + 1


    If L_Header_Size = True Then
      'Place dimensions for the L header size

      Dim iDimensionPosX, iDimensionPosY, iInversePitch

      'Place the dimension for the width of the L header
      JambAndClearance = (NumJambs * CAD.StudElevationWidth) + ((NumJambs -1) * iOpeningJamStudClearance)

      iInversePitch = 90 - MetricPitch
      iDimensionPosX = FOffset + (FWidth/2)

      If Builder.MetricPitch = 0 Then   
        iDimensionPosY = Builder.FHeight + iDimensionFirstSpace
      ElseIf Builder.MetricPitch < 0 Then
        iDimensionPosY = Builder.getFrameHeight(FOffset - JambAndClearance) + ((iDimensionFirstSpace + iDimensionSpacing)/ Cos(Builder.MetricPitch / 180 * Pi))
      Else
        iDimensionPosY = Builder.getFrameHeight(FOffset + FWidth + JambAndClearance) + ((iDimensionFirstSpace + iDimensionSpacing) / Cos(Builder.MetricPitch / 180 * Pi))
      End If

      If CAD.GetListIndex(Me, "HeadType") = Head_CSection Then
        Select Case CAD.GetListIndex(Me, "Structure")        
          Case Structure_Full
            'No Dimension?
          Case Structure_Top
            CAD.PlaceDimension FOffset - CAD.StudElevationWidth - iOpeningJamStudClearance & "," & 0,FOffset + FWidth + CAD.StudElevationWidth + iOpeningJamStudClearance  & "," & 0, iDimensionPosX & "," & iDimensionPosY ,1,-2,iDimensionFontSize,"H"
            CAD.PlaceDimension FOffset & "," & cStr(TotalHead), FOffset & "," & cStr(Builder.FHeight - StructureSize), cStr(leftoffset) & "," & cStr(-leftoffset - iDimensionSpacing), 1, -2, iDimensionFontSize, "V"
            CAD.PlaceDimension FOffset & "," & cStr(Builder.FHeight - StructureSize), FOffset & "," & cStr(Builder.FHeight), cStr(leftoffset) & "," & cStr(-leftoffset - iDimensionSpacing), 1, -2, iDimensionFontSize, "V"
          Case Structure_Bottom
            CAD.PlaceDimension FOffset & "," & 0,FOffset + FWidth & "," & 0, iDimensionPosX & "," & iDimensionPosY ,1,-2,iDimensionFontSize,"H"
            CAD.PlaceDimension FOffset & "," & cStr(TotalHead), FOffset & "," & cStr(TotalHead + StructureSize), cStr(leftoffset) & "," & cStr(-leftoffset - iDimensionSpacing), 1, -2, iDimensionFontSize, "V"
            CAD.PlaceDimension FOffset & "," & cStr(TotalHead + StructureSize), FOffset & "," & cStr(Builder.FHeight), cStr(leftoffset) & "," & cStr(-leftoffset - iDimensionSpacing), 1, -2, iDimensionFontSize, "V"
        End Select
      Else
        CAD.PlaceDimension FOffset - JambAndClearance & "," & 0,FOffset + FWidth + JambAndClearance & "," & 0, iDimensionPosX & "," & iDimensionPosY ,1,-2,iDimensionFontSize,"H"
      End If
    End If

    If Sill> 0 And checkleftdimension(0, Sill) = False Then
      CAD.PlaceDimension "0,0" , "0," & cStr(sill), cStr(leftoffset) & "," & cStr(sill/2) , 1, -2, iDimensionFontSize, "V"
      If drawinternal = True Then currentleftdimensioncount = currentleftdimensioncount + 1
    End If
  End Sub

  Public Function GetType
    If Sill > 0 Then GetType = "Window" Else GetType = "Door"
  End Function
  
  Public Function NogPassThrough(Height, Distance)
    If int(Height) < int(Sill - (Distance * 1.5)) Then
      NogPassThrough = AllowNogPassthrough AND True
    ElseIf CAD.GetListIndex(Me, "Structure") = Structure_Full AND ( int(Height) > int(TotalHead + Distance * 1.5) ) AND CAD.GetListIndex(Me, "HeadType") = Head_IStuds Then
      NogPassThrough = AllowNogPassthrough AND True
    ElseIf CAD.GetListIndex(Me, "Structure") = Structure_Bottom Then
      If int(Height) > int(TotalHead + StructureSize + (Distance * 1.5)) Then
        NogPassThrough = AllowNogPassthrough AND True
      ElseIf CAD.GetListIndex(Me, "HeadType") = Head_IStuds AND ( int(Height) > int(TotalHead + (Distance * 1.5) ) ) And ( int(Height) < int(TotalHead + StructureSize - (Distance * 1.5) ) ) Then
        NogPassThrough = AllowNogPassthrough AND True
      End If
    ElseIf CAD.GetListIndex(Me, "Structure") = Structure_Top Then
      If ( int(Height) > int(TotalHead + (Distance * 1.5)) ) AND ( int(Height) < Builder.FHeight - StructureSize ) Then
        NogPassThrough = AllowNogPassthrough AND True
      ElseIf CAD.GetListIndex(Me, "HeadType") = Head_IStuds AND ( int(Height) > int(Builder.FHeight - StructureSize + (Distance * 1.5) ) ) Then
        NogPassThrough = AllowNogPassthrough AND True
      End If
    Else
      NogPassThrough = False
    End If
  End Function

  Public Sub Build
    Dim LT, F, G, N
    Dim StTop, StTopAxis, StBtm, StBtmAxis, InflTop, InflBtm, EndClearance
    Dim X1, X2, Y1, Y2

    With CAD
      'Set NumJambs
      SetJambs

      'Calculate main variables

      EndClearance = .EndClearance
      X1 = FOffset - .StudElevationWidth + EndClearance
      X2 = FOffset + FWidth + .StudElevationWidth - EndClearance
      Y1 = Builder.FHeight - StructureSize
      Y2 = TotalHead + StructureSize

      Select Case .GetListIndex(Me, "Structure")
      Case Structure_Full 'Full
        StTop = TopPlate
        StTopAxis = .PlaceStickAxis(StTop, .PlateAxisDist)
        .ClipRef = drRight
        StBtm = .PlaceFrameObject(fotHeadPlate, X1 & "," & TotalHead , X2 & "," & TotalHead, FLIPPED, stPlate)
        StBtmAxis = .PlaceStickAxis(StBtm, .PlateAxisDist)
        Select Case .GetListIndex(Me, "HeadType")
        Case Head_Inverted_Warren 'Inverted Warren
          PlaceJacks StTop, Builder.FHeight, StBtm, TotalHead, False
          PlaceWebs StTopAxis, StBtmAxis
        Case Head_Warren 'Warren
          PlaceJacks StTop, Builder.FHeight, StBtm, TotalHead, False
          PlaceWebs StBtmAxis, StTopAxis
        Case Head_Pratt 'Pratt
          PlaceJacks StTop, Builder.FHeight, StBtm, TotalHead, False
          PlacePrattWebs StBtmAxis, StTopAxis
        Case Head_Inverted_Pratt 'Inverted Pratt
          PlaceJacks StTop, Builder.FHeight, StBtm, TotalHead, False
          PlacePrattWebs StTopAxis, StBtmAxis 
        Case Head_IStuds 'Inline Studs
          PlaceJacks StTop, Builder.FHeight, StBtm, TotalHead, False
          PlaceInlineStuds StTop, Builder.FHeight, StBtm, TotalHead
        Case Head_CSection 'C Section
          PlaceJacks StTop, Builder.FHeight, StBtm, TotalHead, True
          'Leave Empty
        End Select
      Case Structure_Top 'Top
        StTop = TopPlate
        StTopAxis = .PlaceStickAxis(StTop, .PlateAxisDist)
        .ClipRef = drRight
        InflBtm = .PlaceFrameObject(fotHeadPlate, X1 & "," & TotalHead, X2 & "," & TotalHead, FLIPPED, stPlate)
        .ClipRef = drLeft
        Select Case .GetListIndex(Me, "HeadType")
        Case Head_Inverted_Warren 'Inverted Warren
          InflTop = .PlaceFrameObject(fotSill, X1 & "," & Y1 - iBackToBackSpacing, X2 & "," & Y1 - iBackToBackSpacing, NOT_FLIPPED, stPlate)
          .ClipRef = drRight
          StBtm = .PlaceFrameObject(fotHeadPlate, X1 & "," & Y1, X2 & "," & Y1, FLIPPED, stPlate)
          StBtmAxis = .PlaceStickAxis(StBtm, .PlateAxisDist)
          PlaceJacks InflTop, Y1 - iBackToBackSpacing, InflBtm, TotalHead, False
          PlaceJacks StTop, Builder.FHeight, StBtm, Y1, False
          PlaceWebs StTopAxis, StBtmAxis
          PlaceInlineStuds InflTop, Y1 - iBackToBackSpacing, InflBtm, TotalHead
        Case Head_Warren 'Warren
          InflTop = .PlaceFrameObject(fotSill, X1 & "," & Y1 - iBackToBackSpacing, X2 & "," & Y1 - iBackToBackSpacing, NOT_FLIPPED, stPlate)
          .ClipRef = drRight
          StBtm = .PlaceFrameObject(fotHeadPlate, X1 & "," & Y1, X2 & "," & Y1, FLIPPED, stPlate)
          StBtmAxis = .PlaceStickAxis(StBtm, .PlateAxisDist)
          PlaceJacks InflTop, Y1 - iBackToBackSpacing, InflBtm, TotalHead, False
          PlaceJacks StTop, Builder.FHeight, StBtm, Y1, False
          PlaceWebs StBtmAxis, StTopAxis
          PlaceInlineStuds InflTop, Y1 - iBackToBackSpacing, InflBtm, TotalHead
        Case Head_Pratt 'Pratt
          InflTop = .PlaceFrameObject(fotSill, X1 & "," & Y1 - iBackToBackSpacing, X2 & "," & Y1 - iBackToBackSpacing, NOT_FLIPPED, stPlate)
          .ClipRef = drRight
          StBtm = .PlaceFrameObject(fotHeadPlate, X1 & "," & Y1, X2 & "," & Y1, FLIPPED, stPlate)
          StBtmAxis = .PlaceStickAxis(StBtm, .PlateAxisDist - 5)
          PlaceJacks InflTop, Y1 - iBackToBackSpacing, InflBtm, TotalHead, False
          PlaceJacks StTop, Builder.FHeight, StBtm, Y1, False
          PlacePrattWebs StBtmAxis, StTopAxis
          PlaceInlineStuds InflTop, Y1 - iBackToBackSpacing, InflBtm, TotalHead  
        Case Head_Inverted_Pratt 'Inverted Pratt
          InflTop = .PlaceFrameObject(fotSill, X1 & "," & Y1 - iBackToBackSpacing, X2 & "," & Y1 - iBackToBackSpacing, NOT_FLIPPED, stPlate)
          .ClipRef = drRight
          StBtm = .PlaceFrameObject(fotHeadPlate, X1 & "," & Y1, X2 & "," & Y1, FLIPPED, stPlate)
          StBtmAxis = .PlaceStickAxis(StBtm, .PlateAxisDist - 5)
          PlaceJacks InflTop, Y1 - iBackToBackSpacing, InflBtm, TotalHead, False
          PlaceJacks StTop, Builder.FHeight, StBtm, Y1, False
          PlacePrattWebs StTopAxis, StBtmAxis
          PlaceInlineStuds InflTop, Y1 - iBackToBackSpacing, InflBtm, TotalHead  
        Case Head_IStuds 'Inline Studs
          InflTop = .PlaceFrameObject(fotSill, X1 & "," & Y1 - iBackToBackSpacing, X2 & "," & Y1 - iBackToBackSpacing, NOT_FLIPPED, stPlate)
          .ClipRef = drRight
          StBtm = .PlaceFrameObject(fotHeadPlate, X1 & "," & Y1, X2 & "," & Y1, FLIPPED, stPlate)
          StBtmAxis = .PlaceStickAxis(StBtm, .PlateAxisDist)
          PlaceJacks StTop, Builder.FHeight, StBtm, Y1, False
          PlaceJacks InflTop, Y1 - iBackToBackSpacing, InflBtm, TotalHead, False
          PlaceInlineStuds StTop, Builder.FHeight, StBtm, Y1
          PlaceInlineStuds InflTop, Y1 - iBackToBackSpacing, InflBtm, TotalHead
        Case Head_CSection 'C Section
          InflTop = .PlaceFrameObject(fotSill, X1 & "," & Y1, X2 & "," & Y1, NOT_FLIPPED, stPlate)
          PlaceJacks InflTop, Y1, InflBtm, TotalHead, False
          PlaceInlineStuds InflTop, Y1, InflBtm, TotalHead
        End Select
      Case Structure_Bottom 'Bottom
        InflTop = TopPlate
        .ClipRef = drRight
        InflBtm = .PlaceFrameObject(fotHeadPlate, X1 & "," & Y2, X2 & "," & Y2, FLIPPED, stPlate)
        StBtm = .PlaceFrameObject(fotHeadPlate, X1 & "," & TotalHead , X2 & "," & TotalHead, FLIPPED, stPlate)
        StBtmAxis = .PlaceStickAxis(StBtm, .PlateAxisDist)
        Select Case .GetListIndex(Me, "HeadType")
        Case Head_Inverted_Warren 'Inverted Warren
          .ClipRef = drLeft
          StTop = .PlaceFrameObject(fotSill, X1 & "," & Y2 - iBackToBackSpacing, X2 & "," & Y2 - iBackToBackSpacing, NOT_FLIPPED, stPlate)
          StTopAxis = .PlaceStickAxis(StTop, .PlateAxisDist)
          PlaceJacks StTop, Y2 - iBackToBackSpacing, StBtm, TotalHead, False
          PlaceJacks InflTop, Builder.FHeight, InflBtm, Y2, False
          PlaceWebs StTopAxis, StBtmAxis
          PlaceInlineStuds InflTop, Builder.FHeight, InflBtm, Y2
        Case Head_Warren 'Warren
          .ClipRef = drLeft
          StTop = .PlaceFrameObject(fotSill, X1 & "," & Y2 - iBackToBackSpacing, X2 & "," & Y2 - iBackToBackSpacing, NOT_FLIPPED, stPlate)
          StTopAxis = .PlaceStickAxis(StTop, .PlateAxisDist)
          PlaceJacks StTop, Y2 - iBackToBackSpacing, StBtm, TotalHead, False
          PlaceJacks InflTop, Builder.FHeight, InflBtm, Y2, False
          PlaceWebs StBtmAxis, StTopAxis
          PlaceInlineStuds InflTop, Builder.FHeight, InflBtm, Y2
        Case Head_Pratt 'Pratt
          .ClipRef = drLeft
          StTop = .PlaceFrameObject(fotSill, X1 & "," & Y2 - iBackToBackSpacing, X2 & "," & Y2 - iBackToBackSpacing, NOT_FLIPPED, stPlate)
          StTopAxis = .PlaceStickAxis(StTop, .PlateAxisDist - 5)
          PlaceJacks StTop, Y2 - iBackToBackSpacing, StBtm, TotalHead, False
          PlaceJacks InflTop, Builder.FHeight, InflBtm, Y2, False
          PlacePrattWebs StBtmAxis, StTopAxis
          PlaceInlineStuds InflTop, Builder.FHeight, InflBtm, Y2
        Case Head_Inverted_Pratt 'Inverted Pratt
          .ClipRef = drLeft
          StTop = .PlaceFrameObject(fotSill, X1 & "," & Y2 - iBackToBackSpacing, X2 & "," & Y2 - iBackToBackSpacing, NOT_FLIPPED, stPlate)
          StTopAxis = .PlaceStickAxis(StTop, .PlateAxisDist - 5)
          PlaceJacks StTop, Y2 - iBackToBackSpacing, StBtm, TotalHead, False
          PlaceJacks InflTop, Builder.FHeight, InflBtm, Y2, False
          PlacePrattWebs StTopAxis, StBtmAxis
          PlaceInlineStuds InflTop, Builder.FHeight, InflBtm, Y2
        Case Head_IStuds 'Inline Studs
          .ClipRef = drLeft
          StTop = .PlaceFrameObject(fotSill, X1 & "," & Y2 - iBackToBackSpacing, X2 & "," & Y2 - iBackToBackSpacing, NOT_FLIPPED, stPlate)
          StTopAxis = .PlaceStickAxis(StTop, .PlateAxisDist)
          PlaceJacks StTop, Y2 - iBackToBackSpacing, StBtm, TotalHead, False
          PlaceJacks InflTop, Builder.FHeight, InflBtm, Y2, False
          PlaceInlineStuds StTop, Y2 - iBackToBackSpacing, StBtm, TotalHead
          PlaceInlineStuds InflTop, Builder.FHeight, InflBtm, Y2
        Case Head_CSection 'C Section
          PlaceJacks InflTop, Builder.FHeight, InflBtm, Y2, False
          PlaceInlineStuds InflTop, Builder.FHeight, InflBtm, Y2
        End Select
      End Select

      If Sill > 0 Then
        .ClipRef = drLEFT
        .PlaceFrameObject fotSill, X1 & "," & Sill , X2 & "," & Sill, NOT_FLIPPED, stPlate
      End If

      'Place jambs
      If Builder.MetricPitch = 0 Then
        Axis =.PlaceStickAxis(TopPlate,0)
      Else
        Axis =.PlaceStickAxis(TopPlate,StudEndClearance)
      End If

      For N = NumJambs - 1 To 0 Step -1
        .ClipRef = drRIGHT
        Pos = FOffset - (N * (.StudElevationWidth + iOpeningJamStudClearance))
        F = .PlaceFrameObject(fotTrimStud, Pos & ",-0.1" , "@" & Builder.FHeight & "<90", FLIPPED, stStud)
        If N = 0 Then
          Builder.AddPlacedStudCenter(Pos - (.StudElevationWidth /2))
        End If    
        .Extend F, Axis
        .ClipRef = drLEFT
        Pos = FOffset + FWidth + (N * (.StudElevationWidth + iOpeningJamStudClearance))
        G = .PlaceFrameObject(fotTrimStud, Pos & ",-0.1" , "@" & Builder.FHeight & "<90", NOT_FLIPPED, stStud)
        If N = 0 Then
          Builder.AddPlacedStudCenter(Pos + (.StudElevationWidth /2))
        End If
        .Extend G, Axis
        If Box >= N + 1 Then
          .Box F
          .Box G
        End If
      Next

      'Place Notch in Bottom Plate beside each jamb
      If Notch_Door_Sill and Sill = 0 Then
        F = .PlaceExplicitTool("WebNotch", FOffset + 20 & ",-10", "@" & .StudElevationWidth / 2 + 10 & "<90")
        F = .PlaceExplicitTool("WebNotch", FOffset + FWidth - 20 & ",-10", "@" & .StudElevationWidth / 2 + 10 & "<90")
      End If

      'Place Bolt Hole in Bottom Plate beside opening
      If Builder.BPlate_Bolt_Holes Then
        G = ( NumJambs + 1 ) * .StudElevationWidth
        F = .PlaceExplicitTool("SingleBoltHole", FOffset - G & ",-10", "@" & .StudElevationWidth / 2 + 10 & "<90")
        F = .PlaceExplicitTool("SingleBoltHole", FOffset + FWidth + G & ",-10", "@" & .StudElevationWidth / 2 + 10 & "<90")
      End If

      'Place ServiceHole Route Each Side of Doors and or windows

      'Calculate distance for route from jamb
      If Builder.SHole_Openings Then
        G = ( NumJambs + 1 ) * .StudElevationWidth
        'If Sill = 0 Then                                   'uncomment this line if you want doors only.
          If Builder.MetricPitch <> 0 Then
            lefttopheight = Builder.FHeight + ((FOffset - G) * Tan(Builder.MetricPitch * Pi / 180))
            righttopheight = Builder.FHeight + ((FOffset + FWidth + G) * Tan(Builder.MetricPitch * Pi / 180))
            F = .PlaceServiceHoles(FOffset - G & ",50", "@" & lefttopheight & "<90")
            F = .PlaceServiceHoles(FOffset + FWidth + G & ",50", "@" & righttopheight & "<90")
          Else
            F = .PlaceServiceHoles(FOffset - G & ",50", "@" & Builder.FHeight & "<90")
            F = .PlaceServiceHoles(FOffset + FWidth + G & ",50", "@" & Builder.FHeight & "<90")
          End If
        'End If                                         'uncomment this line if you want doors only.
      End If 

      'If Sill > 0 then place jack studs
      If First_Last_Jack_Stud And Sill > 0 Then
        .ClipRef = drRIGHT
        Pos = FOffset + FWidth - iBackToBackSpacing
        .PlaceFrameObject fotJackStud, Pos & ",0", "@" & Sill & "<90", FLIPPED, stStud
        Builder.AddPlacedStudCenter(Pos - (.StudElevationWidth /2))
        .ClipRef = drLEFT
        Pos = FOffset + iBackToBackSpacing
        .PlaceFrameObject fotJackStud, Pos & ",0", "@" & Sill & "<90", NOT_FLIPPED, stStud
        Builder.AddPlacedStudCenter(Pos + (.StudElevationWidth /2))
        .ClipRef = drLEFT
      End If

      If Sill > 0 Then
        PlaceInlineStudsUnder
      End If 

      'Clean up mess
      .EraseConstructionLines
    End With
  End Sub

  Private Sub PlaceJacks(Top, TopDim, Bottom, BottomDim, CutLips)
    With CAD
      If Builder.MetricPitch = 0 Then
        Axis =.PlaceStickAxis(Top,0)
      Else
        Axis =.PlaceStickAxis(Top,StudEndClearance)
      End If
      If First_Last_Jack_Stud Then
        'Place Jack studs
        .AutoExtend = True
        .ExtendCode = EcEnd
        .ClipRef = drRIGHT
        A = .PlaceFrameObject(fotWeb, FOffset + FWidth - iBackToBackSpacing & "," & BottomDim, FOffset + FWidth - iBackToBackSpacing & "," & Builder.getFrameHeight(FOffset + FWidth - iBackToBackSpacing), FLIPPED, stStud)
        .Extend A, Axis
        .ClipRef = drLEFT
        A = .PlaceFrameObject(fotWeb, FOffset + iBackToBackSpacing & "," & BottomDim, FOffset + iBackToBackSpacing & "," & Builder.getFrameHeight(FOffset + iBackToBackSpacing), NOT_FLIPPED, stStud)
        .Extend A, Axis
        .ExtendCode = EcNull
      End If 
      If CutLips = True Then
        .PlaceExplicitTool "LipNotch", FOffset + iBackToBackSpacing + .StudElevationWidth /2 & "," & BottomDim + .PlateElevationWidth /2, "@" & .StudElevationWidth & "<0"
        .PlaceExplicitTool "LipNotch", FOffset + FWidth - iBackToBackSpacing - (.StudElevationWidth /2) & "," & BottomDim + .PlateElevationWidth /2, "@" & .StudElevationWidth & "<180"
        If Builder.MetricPitch = 0 Then
          .PlaceExplicitTool "LipNotch", FOffset + iBackToBackSpacing + .StudElevationWidth /2 & "," & TopDim - .PlateElevationWidth /2, "@" & .StudElevationWidth & "<0"
          .PlaceExplicitTool "LipNotch", FOffset + FWidth - iBackToBackSpacing - (.StudElevationWidth /2) & "," & TopDim - .PlateElevationWidth /2, "@" & .StudElevationWidth & "<180"
        End If
      End If
    End With
  End Sub

  Private Sub PlaceWebs(TPAxis, LTAxis)
    Dim NumWebs, L
    'Place webs if FWidth > WebDistance

    With CAD
      .ClipRef = drDimple
      If FWidth > WebDistance Then
        WebSpacing = FWidth - (2 * (.StudElevationWidth + iBackToBackSpacing))

        If Not First_Last_Jack_Stud Then WebSpacing = WebSpacing + (2 * (.StudElevationWidth + iBackToBackSpacing)) 'Adjustment for jack Studs

        NumWebs = DivideSpaceEven(WebSpacing, WebDistance)
        L = FOffset + .StudElevationWidth + iBackToBackSpacing

        If Not First_Last_Jack_Stud Then L = L - .StudElevationWidth + iBackToBackSpacing 'Adjustment for jack Studs

        For WebIndex = 1 To NumWebs
          X1 = .PlaceLine(L + .Web2Web / 2 & ",-50", "@" & (getMaxHeight+100) & "<90")
          X2 = .PlaceLine(L + WebSpacing - .Web2Web / 2 & ",-50", "@" & (getMaxHeight+100) & "<90")

          L = L + WebSpacing
          If WebIndex Mod 2 = 0 Then
            A = .PlaceFrameObject(fotWeb, .Intersection(TPAxis, X1), .Intersection(LTAxis, X2), NOT_FLIPPED, stStud)
          Else
            A = .PlaceFrameObject(fotWeb, .Intersection(LTAxis, X1), .Intersection(TPAxis, X2), NOT_FLIPPED, stStud)
          End If
        Next
      End If
    End With
  End Sub

  Private Sub PlacePrattWebs(TPAxis, LTAxis)
    Dim NumWebs, L, iHeaderWebSpacing
    'Place webs if FWidth > WebDistance

    With CAD
      .ClipRef = drMid
      .CopyMode = True
      If FWidth > WebDistance Then
        WebSpace = FWidth - (2 * (.StudElevationWidth + iBackToBackSpacing))
        If Not First_Last_Jack_Stud Then WebSpace = WebSpace + (2 * (.StudElevationWidth + iBackToBackSpacing)) 'Adjustment for jack Studs
        L = FOffset + .StudElevationWidth + iBackToBackSpacing
        If Not First_Last_Jack_Stud Then L = L - .StudElevationWidth + iBackToBackSpacing 'Adjustment for jack Studs

        iHeaderWebSpacing = WebSpace + (.StudElevationWidth + iBackToBackSpacing)

        NumWebs = DivideSpaceEven(iHeaderWebSpacing, WebDistance)

        X0 = .PlaceLine(L -(.StudElevationWidth / 2) & ",-50", "@" & Builder.FHeight * 2 & "<90")

        For WebIndex = 1 To NumWebs
          X1 = .PlaceLine(L -(.StudElevationWidth / 2) + .Web2Web & ",-50", "@" & Builder.FHeight * 2 & "<90")
          X3 = .PlaceLine(L -(.StudElevationWidth / 2) + iHeaderWebSpacing & ",-50", "@" & Builder.FHeight * 2 & "<90")
          X2 = .PlaceLine(L -(.StudElevationWidth / 2) + iHeaderWebSpacing - .Web2Web & ",-50", "@" & Builder.FHeight * 2 & "<90")

          .ClipRef = drDimple
          If L >= (FOffset + (FWidth/2)) Then
            A = .PlaceFrameObject(fotWeb, .Intersection(LTAxis, X2), .Intersection(TPAxis, X1), FLIPPED, stStud)
          Else
            A = .PlaceFrameObject(fotWeb, .Intersection(LTAxis, X1), .Intersection(TPAxis, X2), NOT_FLIPPED, stStud)
          End If

          .ClipRef = drMid
          If WebIndex < NumWebs Then
            B = .PlaceFrameObject(fotWeb, .Intersection(TPAxis, X3), .Intersection(LTAxis, X3), NOT_FLIPPED, stStud)
          End If

          L = L + iHeaderWebSpacing
        Next

      End If
    End With 'CAD
  End Sub

  Private Function getMaxHeight()
    Dim iEndheight
    iEndheight = Builder.FHeight + (Builder.Length * Tan(Builder.MetricPitch / 180 * Pi))
    If iEndheight > Builder.FHeight Then
      getMaxHeight = iEndheight
    Else
      getMaxHeight = Builder.FHeight
    End if
  End Function

  Private Sub PlaceInlineStuds(Top, TopDim, Bottom, BottomDim)
    With CAD
      If Builder.MetricPitch = 0 Then
        Axis =.PlaceStickAxis(Top,0)
      Else
        Axis =.PlaceStickAxis(Top,StudEndClearance)
      End If

      BtmAxis =.PlaceStickAxis(Bottom,0)

      .ClipRef = drMID

      For Each N In Studs.Centers
        If StudInOpening(N) Then
          F = .PlaceFrameObject(fotWeb, N & "," & 0 , "@" & BottomDim & "<90", NOT_FLIPPED, stStud)
          .ExtendCode = ecEnd
          .Extend F, Axis
          .ExtendCode = ecStart
          .Extend F, BtmAxis
          .ExtendCode = ecNull
        End If
      Next

    End With
  End Sub

  Private Sub PlaceInlineStudsUnder
    With CAD
      .ClipRef = drMID

      For Each N In Studs.Centers
        If StudInOpening(N) Then
          F = .PlaceFrameObject(fotJackStud, N & ",0" , "@" & Sill & "<90", NOT_FLIPPED, stStud)
          Builder.AddPlacedStudCenter(N)
        End If
      Next
    End With
  End Sub

  Private Function StudInOpening(Value)
    Dim I
    If First_Last_Jack_Stud Then
      I = 1.5
    Else
      I = 0.5
    End If

    StudInOpening = (Value - ((CAD.StudElevationWidth * I) + iOpeningJamStudClearance) >= FOffset) And _
      (Value + ((CAD.StudElevationWidth * I) + iOpeningJamStudClearance)<= (FOffset + FWidth))
  End Function

  Private Sub SetJambs
    If ExtraStuds = False Then
      NumJambs = 1
    ElseIf FWidth >= 5400 Then
      NumJambs = 5
      Box = 0
    ElseIf FWidth >= 3001 Then
      NumJambs = 4
      Box = 0
    ElseIf FWidth >= 1801 Then
      NumJambs = 3
      Box = 0
    ElseIf FWidth >= 1200 Then
      NumJambs = 2
      Box = 0
    Else
      NumJambs = 2
      Box = 0
    End If

    LeftEdge = FOffset - (NumJambs * CAD.StudElevationWidth) - ((NumJambs -1) * iOpeningJamStudClearance)
    RightEdge = FOffset + FWidth + (NumJambs * CAD.StudElevationWidth) + ((NumJambs -1) * iOpeningJamStudClearance)
  End Sub

  Public Function Extents
    With CAD
      Extents = Array(TotalHead + .PlateElevationWidth, LeftEdge, Sill - .PlateElevationWidth, RightEdge)
    End With
  End Function

  Public Sub Pick
    If Centered Then
      Result = CAD.PickCenter("Pick two points to center opening between (Set Width first)")

      If Not IsEmpty(Result) Then
        Offset = Result - (Width / 2)
      End If
    Else
      Result = CAD.PickOffsetWidth("Pick two points to position opening")
      If Not IsEmpty(Result) Then
        Offset = Result(0)
        Width = Result(1)
      End If
    End If
  End Sub

  Public Sub PickElevationPoints(Structure) 'Is set to structure only because something is needed.  Has no effect.
    Dim Result, PickDatum
    PickDatum = Builder.GetDatum()
    Result = Cad.PickElevationPoints(2, "Pick 2 diagonally opposite points on the opening")
    If Not IsEmpty(Result) Then
      Offset = Min(Result(0),Result(2)) - PickDatum(0)
      Width = Max(Result(0),Result(2)) - Min(Result(0),Result(2))
      Head = Max(Result(1),Result(3)) - PickDatum(1)
      Sill = Min(Result(1),Result(3)) - PickDatum(1)
    End If
  End Sub

  Public Function GetExtents
    GetExtents = Array(TotalHead, FOffset, Sill, FOffset + FWidth)
  End Function

  Public Function NoDefaults
    NoDefaults = Array("Height")
  End Function
  
  Private Sub Class_Initialize()
    FHead = 2020.0
    Offset = 200.0
    Width = 800.0
    Side_Clearance = 0.0
    Head_Clearance = 0.0
    FSill = 0.0
    WebDistance = 300.0
    Centered = False
    Notch_Door_Sill = True
    First_Last_Jack_Stud = True
    L_Header_Size = True
    ExtraStuds = True
    AllowNogPassthrough = True
    HeadType = Array("Inverted Warren" _
                    ,"Warren" _
                    ,"Pratt" _
                    ,"Inverted Pratt" _
                    ,"Inline Studs" _
                    ,"C Section")
    Structure = Array("Full" _
                    , "Top" _
                    , "Bottom")
    StructureSize = 200.0
  End Sub
End Class
