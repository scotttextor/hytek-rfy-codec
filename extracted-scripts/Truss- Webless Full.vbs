'[FCAD2000-0]
'[TRUSS]

'******************************************************************************
'
'   Webless truss script
'
'   16 Jul 2001   N.Penny     Created
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

  Public Pitch
  Public Left_Eave
  Public Right_Eave
  Public Height_At_Wall
  Public Auto_Dimension

  Private MetricPitch
  Private Length

  Public Property Get Span
    Span = Length - Left_Eave - Right_Eave
  End Property

  Public Sub Build
    Dim A, BC, LC, RC, CL, Tye, Peak
    Dim BCAxis, LCAxis, X1, X2, L
    Dim BCSpacing, TCSpacing
    Dim BCPoint, TCPoint

    If ConvertPitch(Pitch, MetricPitch) = False Then
      MsgBox "Pitch is not a valid entry", 16
      Exit Sub
    End If

    If MetricPitch <= 0 Then
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
      BC = .PlaceFrameObject(fotBottomChord, "0,0", "@" & Span & "<0", FLIPPED, stPlate)
      .ClipRef = drLEFT
      LC = .PlaceFrameObject(fotTopChord, "0," & Height_At_Wall, "@" & Span / 2 & "<" & MetricPitch, NOT_FLIPPED, stPlate)
      .Extend LC, A
      BCAxis = .PlaceStickAxis(BC, .PlateAxisDist)
      LCAxis = .PlaceStickAxis(LC, .PlateAxisDist)

      'Place top right hand chord
      RC = .PlaceFrameObject(fotTopChord, getXYStringFromPolar(Span,Height_At_Wall,Span/2,180 -MetricPitch), "@" & Span/2 & "<" & -MetricPitch, NOT_FLIPPED, stPlate)
      .Extend RC, A

      'Extend chords to eaves
      A = .PlaceLine( - Left_Eave & ",-500" , "@1000<90")
      .Extend LC, A
      A = .PlaceLine(Span + Right_Eave & ",-500" , "@1000<90")
      .Extend RC, A
      .AutoExtend = True

      If Height_At_Wall > .Web2Web Then
        'Place jack studs and mirror them
        .ClipRef = drLEFT
        .CopyMode = True
        A = .PlaceFrameObject(fotWeb, "0,0", "@" & Height_At_Wall & "<90", NOT_FLIPPED, stStud)
        .ExtendToFurthest A, LC
        .Mirror A, CL
      End If

      'Clean up mess and translate fro 3D viewing
      .EraseConstructionLines
      .Translate Left_Eave, 0
    End With
    If Auto_Dimension = True Then dimensionframe
  End Sub

  Public Sub dimensionframe
    Dim iEaveDrop_Left, iEaveDrop_Right, iEaveDrop_Largest, iDimension_OffsetY
    Peak = Tan(MetricPitch * Pi / 180) * (Span / 2) + Height_At_Wall
    iEaveDrop_Left = Left_Eave * Tan(metricpitch * Pi / 180)
    iEaveDrop_Right = Right_Eave * Tan(metricpitch * Pi / 180)
    iEaveDrop_Largest = getLargest(iEaveDrop_Left,iEaveDrop_Right)
    
    iDimension_OffsetY = getSmallest(Height_At_Wall - iEaveDrop_Largest,0)
        

    With CAD
      'Dimension Start Height
      .PlaceDimension "0,0", "@" & Height_At_Wall & "<90", -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Left) & ",0",1,-2,iDimensionFontSize,"V"
      iDimensionCount_Left = iDimensionCount_Left + 1

      'Dimension Overall Height
      .PlaceDimension "0,0", "@" & Peak & "<90", -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Left) & ",0",1,-2,iDimensionFontSize,"V"
      iDimensionCount_Left = iDimensionCount_Left + 1

      'Dimension Eaves
      If Left_Eave > 0 Or Right_Eave > 0 Then
        If Left_Eave > 0 Then .PlaceDimension "0,0", "@" & Left_Eave & "<0", "0," & iDimension_OffsetY -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Bottom),1,-2,iDimensionFontSize,"H"
        If Right_Eave > 0 Then .PlaceDimension Length - Right_Eave & ",0", "@" & Right_Eave & "<0", "0," & iDimension_OffsetY -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Bottom),1,-2,iDimensionFontSize,"H"  
        .PlaceDimension Left_Eave & ",0", "@" & Span & "<0", "0," & iDimension_OffsetY -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Bottom),1,-2,iDimensionFontSize,"H"
        iDimensionCount_Bottom = iDimensionCount_Bottom + 1
      End If
      
      'Dimension truss overall
      .PlaceDimension "0,0", "@" & Length & "<0", "0," & iDimension_OffsetY -iDimensionFirstSpace - (iDimensionSpacing * iDimensionCount_Bottom),1,-2,iDimensionFontSize,"H"
      iDimensionCount_Bottom = iDimensionCount_Bottom + 1

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

  Private Function getSmallest(iInput1,iInput2)
    'Returns the smaller value
    If iInput1 < iInput2 Then
      getSmallest = iInput1
    Else
      getSmallest = iInput2
    End If
  End Function

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
    Left_Eave = 400.0
    Right_Eave = 400.0
    Height_At_Wall = 110.0
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
