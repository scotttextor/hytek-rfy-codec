'******************************************************************************
'
'  Triples.inc
'
'  Include file for creating triple stud features in walls
'
'  27 Feb 2001                Created
'  21 Sep 2004    J.Burns     Added dimensioning
'  23 Jan 2006    N.Penny     Changed Pick method slightly
'  25 Aug 2010    J.Burns     Changed Dimensioning to use CAD dimensions
'  27 Aug 2010    J.Burns     Added bolt hole option to triples
'  10 Nov 2010    J.Burns     Option to Dimension to Centre of triple added
'
'******************************************************************************


Class TTriple

  Public Offset, Width, Dimension_To_Centre
  Public AllowNogPassthrough
  Public PickToCentre
  Private Result, AtEnd, AtFarEnd

  Public Function FOffset
    FOffset = Offset
  End Function

  Public Function Auto_Dimension
    Return False
  End Function

  Public Function FWidth
    FWidth = Width
  End Function

  Public Sub Build
    Dim F

    With CAD
      AtEnd = FOffset <= FWidth
      AtFarEnd = FOffset + FWidth >= Builder.Length - 1

      If AtEnd Then
        .ClipRef = drLEFT
        F = .PlaceFrameObject(fotStud, FOffset & ",0" , "@" & Builder.Height & "<90", NOT_FLIPPED, stStud)
        Builder.AddPlacedStudCenter(FOffset + (.StudElevationWidth /2))
      Else
        .ClipRef = drRIGHT
        F = .PlaceFrameObject(fotStud, FOffset & ",0" , "@" & Builder.Height & "<90", FLIPPED, stStud)
        Builder.AddPlacedStudCenter(FOffset - (.StudElevationWidth /2))
      End If

      .ExtendCode = EcEnd
      .ExtendToFurthest F, TopPlate

      If AtFarEnd Then
        .ClipRef = drRIGHT
        F = .PlaceFrameObject(fotStud, FOffset + FWidth & ",0" , "@" & Builder.Height & "<90", FLIPPED, stStud)
        Builder.AddPlacedStudCenter(FOffset + FWidth - (.StudElevationWidth /2))
        'Extend the top plate to the stud
        .ExtendCode = EcEnd
        .ExtendToFurthest TopPlate, F
      Else
        .ClipRef = drLEFT
        F = .PlaceFrameObject(fotStud, FOffset + FWidth & ",0" , "@" & Builder.Height & "<90", NOT_FLIPPED, stStud)
        Builder.AddPlacedStudCenter(FOffset + FWidth + (.StudElevationWidth /2))
      End If

      If AtEnd And (Not AtFarEnd) And Builder.BPlate_Bolt_Holes = True Then 'Triple bound to start of frame
        CAD.PlaceExplicitTool "SingleBoltHole", FOffset + ((FWidth-CAD.StudElevationWidth)/2)+CAD.StudElevationWidth & ",-10", "@" & (CAD.StudElevationWidth / 2) + 10 & "<90"          
      ElseIf (Not AtEnd) And (Not AtFarEnd) And Builder.BPlate_Bolt_Holes = True Then 'Triple in middle of frame
        CAD.PlaceExplicitTool "SingleBoltHole", FOffset + (FWidth/2) & ",-10", "@" & (CAD.StudElevationWidth / 2) + 10 & "<90"          
      ElseIf (Not AtEnd) And AtFarEnd And Builder.BPlate_Bolt_Holes = True Then 'Triple bound to end of frame
        CAD.PlaceExplicitTool "SingleBoltHole", FOffset + ((FWidth-CAD.StudElevationWidth)/2) & ",-10", "@" & (CAD.StudElevationWidth / 2) + 10 & "<90"
      End If

      .ExtendCode = EcEnd
      .ExtendToFurthest F, TopPlate

    End With
  End Sub

  Public Sub DimensionThisFeature(iHorizontalDimensionCount, iVerticalDimensionCount, bDimensionInternally)
    bottomoffset = -iDimensionFirstSpace + (-iHorizontalDimensionCount * iDimensionSpacing)
    iHorizontalDimensionCount = iHorizontalDimensionCount + 1

    If Not Dimension_To_Centre Then
      'Dimension the Width of the triple
      CAD.PlaceDimension cStr(Offset) & ",0", cStr(Offset + Width) & ",0", cStr((Offset + Width)/2) & "," & cStr(bottomoffset) , 1, -2, iDimensionFontSize, "H"

      'Dimension the Offset when it's greater than 0
      If Offset > 0 Then
        CAD.PlaceDimension "0,0", cStr(Offset) & ",0", cStr(Offset/2) & "," & cStr(bottomoffset) , 1, -2, iDimensionFontSize, "H"
      End If
    Else
      CAD.PlaceDimension "0,0", cStr(Offset + (Width/2)) & ",0", cStr((Offset + (Width/2))/2) & "," & cStr(bottomoffset) , 1, -2, iDimensionFontSize, "H"
    End If
  End Sub

  Public Function Extents
    With CAD
      If AtEnd Then
        Extents = Array(Builder.Height, 0, 0, FWidth + .StudElevationWidth)
      ElseIf AtFarEnd Then
        Extents = Array(Builder.Height, FOffset - .StudElevationWidth, 0, Builder.Length)
      Else
        Extents = Array(Builder.Height, FOffset - .StudElevationWidth, 0, FOffset + FWidth + .StudElevationWidth)
      End If
    End With
  End Function
  
  Public Function NogPassThrough(Height, Distance)
    NogPassThrough = AllowNogPassthrough AND True
  End Function

  Public Function GetType
    GetType = "Triples"
  End Function

  Public Sub Pick
    Result = CAD.PickStick("Pick connecting wall")

    If Not IsEmpty(Result) Then
        If PickToCentre = True Then
            Offset = Result(0) + (Result(1)/2)
        Else
          Offset = Result(0)
          If Offset + Width > Builder.Length Then
            Width = Builder.Length - Offset
          Else
            Width = Result(1)
          End If
        End If
    End If
  End Sub

  Private Sub Class_Initialize()
    Offset = 0.0
    Width = 100.0
    Dimension_To_Centre = False
    AllowNogPassthrough = True
    PickToCentre = False
  End Sub

End Class
